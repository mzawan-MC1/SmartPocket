import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { AIErrorPayload, AIErrorResponse } from '@/lib/ai-types';
import { rewriteTextWithOpenRouter, transcribeAudioWithOpenRouter } from '@/lib/ai-gateway';
import { ensureUserSubscriptionSummary } from '@/lib/subscription/server';
import {
  getOpenRouterAudioFormat,
  isSupportedVoiceAudioMimeType,
  normalizeVoiceAudioMimeType,
} from '@/lib/voice-ai';
import {
  loadRuntimeVoiceTranscriptionConfig,
  loadVoiceTranscriptionStatus,
} from '@/lib/voice-ai-server';
import { createClientId } from '@/lib/uuid';

function createServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );
}

function parsePositiveNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toSpeechDurationMs(durationSeconds: number) {
  return Math.max(1, Math.ceil(durationSeconds * 1000));
}

const SUPPORTED_SPOKEN_LANGUAGES = new Set(['auto', 'en', 'ur', 'ar', 'fr', 'ru']);
const SUPPORTED_DISPLAY_LANGUAGES = new Set(['en', 'ar', 'fr', 'ru']);

type SpokenLanguageCode = 'auto' | 'en' | 'ur' | 'ar' | 'fr' | 'ru';
type DisplayLanguageCode = 'en' | 'ar' | 'fr' | 'ru';

function normalizeSpokenLanguage(value: FormDataEntryValue | null): SpokenLanguageCode {
  if (typeof value !== 'string') {
    return 'auto';
  }
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_SPOKEN_LANGUAGES.has(normalized) ? normalized as SpokenLanguageCode : 'auto';
}

function normalizeDisplayLanguage(value: FormDataEntryValue | null): DisplayLanguageCode {
  if (typeof value !== 'string') {
    return 'en';
  }
  const normalized = value.trim().toLowerCase();
  return SUPPORTED_DISPLAY_LANGUAGES.has(normalized) ? normalized as DisplayLanguageCode : 'en';
}

function getLanguageDisplayName(language: SpokenLanguageCode | DisplayLanguageCode) {
  switch (language) {
    case 'ar':
      return 'Arabic';
    case 'fr':
      return 'French';
    case 'ru':
      return 'Russian';
    case 'ur':
      return 'Urdu';
    case 'auto':
      return 'Auto detect';
    case 'en':
    default:
      return 'English';
  }
}

function buildTranscriptionPrompt(language: SpokenLanguageCode) {
  const instructions = [
    'Transcribe the spoken audio accurately.',
    'Return only the transcript.',
    'Preserve names, amounts, currency codes, dates, and account names.',
    'Do not interpret the transaction and do not add commentary.',
  ];

  if (language === 'ur') {
    instructions.push(
      'The spoken language is Urdu.',
      'Write Urdu in Urdu Perso-Arabic script.',
      'Do not transliterate it.',
      'Do not substitute Hindi or Devanagari.'
    );
  } else if (language !== 'auto') {
    instructions.push(`The spoken language is ${getLanguageDisplayName(language)}.`);
  }

  return instructions.join(' ');
}

function buildError(
  code: AIErrorPayload['code'],
  category: AIErrorPayload['category'],
  message: string,
  requestId: string
): AIErrorResponse {
  return {
    success: false,
    status: 'failed',
    requestId,
    error: {
      code,
      category,
      message,
      requestId,
    },
    errorMessage: message,
  };
}

function mapAccessErrorToVoiceError(
  accessError: string,
  requestId: string,
  resetDateLabel: string | null
) {
  switch (accessError) {
    case 'voice_ai_disabled':
    case 'text_ai_disabled':
    case 'plan_inactive':
    case 'subscription_expired':
    case 'trial_expired':
    case 'no_subscription':
      return buildError(
        'voice_not_in_plan',
        'subscription',
        'Voice AI is not available on your current plan.',
        requestId
      );
    case 'voice_limit_reached':
      return buildError(
        'voice_limit_reached',
        'usage_limit',
        resetDateLabel
          ? `Voice limit reached. Your allowance resets on ${resetDateLabel}.`
          : 'Voice limit reached.',
        requestId
      );
    case 'credits_exhausted':
      return buildError(
        'voice_limit_reached',
        'usage_limit',
        'Voice AI is temporarily unavailable because your AI allowance has been used.',
        requestId
      );
    default:
      return buildError(
        'transcription_failed',
        'technical',
        'Voice transcription is temporarily unavailable.',
        requestId
      );
  }
}

function formatResetDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getStoredVoiceErrorCode(value: string | null | undefined): AIErrorPayload['code'] {
  switch (value) {
    case 'voice_not_in_plan':
    case 'voice_limit_reached':
    case 'empty_audio':
    case 'unsupported_audio_type':
    case 'audio_too_large':
    case 'openrouter_not_configured':
    case 'voice_model_missing':
    case 'voice_model_audio_unsupported':
    case 'openrouter_auth_failed':
    case 'openrouter_provider_unavailable':
    case 'transcription_failed':
      return value;
    default:
      return 'transcription_failed';
  }
}

function getStoredVoiceErrorStatus(code: AIErrorPayload['code']) {
  switch (code) {
    case 'voice_not_in_plan':
      return 403;
    case 'voice_limit_reached':
      return 429;
    case 'unsupported_audio_type':
      return 415;
    case 'audio_too_large':
      return 413;
    case 'openrouter_provider_unavailable':
      return 503;
    case 'openrouter_not_configured':
    case 'voice_model_missing':
    case 'voice_model_audio_unsupported':
    case 'openrouter_auth_failed':
      return 409;
    default:
      return 409;
  }
}

async function persistVoiceRequest(args: {
  supabase: ReturnType<typeof createServerClient>;
  userId: string;
  idempotencyKey: string;
  transcript?: string;
  transcriptRetained: boolean;
  language: string;
  detectedLanguage?: string;
  providerUsed?: string;
  modelUsed?: string | null;
  durationMs?: number | null;
  errorCode?: string;
  errorMessage?: string;
}) {
  const { data } = await args.supabase
    .from('ai_requests')
    .upsert({
      user_id: args.userId,
      request_type: 'voice',
      status: args.transcript ? 'parsed' : 'failed',
      transcript: args.transcriptRetained ? args.transcript || null : null,
      transcript_retained: args.transcriptRetained,
      input_language: args.language,
      detected_language: args.detectedLanguage || null,
      stt_provider_used: args.providerUsed || null,
      provider_model: args.modelUsed || null,
      stt_duration_ms: args.durationMs || null,
      total_duration_ms: args.durationMs || null,
      error_category: args.errorCode || null,
      error_message: args.errorMessage || null,
      idempotency_key: args.idempotencyKey,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'idempotency_key' })
    .select('id, transcript, transcript_retained, status, error_category, error_message')
    .single();

  return data as {
    id: string;
    transcript: string | null;
    transcript_retained: boolean;
    status: string;
    error_category: string | null;
    error_message: string | null;
  } | null;
}

export async function POST(req: NextRequest) {
  const requestId = createClientId();

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(buildError('transcription_failed', 'auth', 'Unauthorized.', requestId), { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(buildError('transcription_failed', 'auth', 'Unauthorized.', requestId), { status: 401 });
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(buildError('transcription_failed', 'validation', 'Invalid transcription request.', requestId), { status: 400 });
    }

    const fileEntry = formData.get('audio');
    const durationSeconds = parsePositiveNumber(formData.get('durationSeconds'));
    const idempotencyKeyRaw = typeof formData.get('idempotencyKey') === 'string'
      ? String(formData.get('idempotencyKey')).trim()
      : createClientId();
    const idempotencyKey = idempotencyKeyRaw.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 128) || createClientId();
    const spokenLanguage = normalizeSpokenLanguage(formData.get('spokenLanguage') ?? formData.get('language'));
    const displayLanguage = normalizeDisplayLanguage(formData.get('displayLanguage'));

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(buildError('empty_audio', 'validation', 'Please record audio before transcribing.', requestId), { status: 400 });
    }

    if (fileEntry.size <= 0) {
      return NextResponse.json(buildError('empty_audio', 'validation', 'Please record audio before transcribing.', requestId), { status: 400 });
    }

    const mimeType = normalizeVoiceAudioMimeType(fileEntry.type);
    if (!isSupportedVoiceAudioMimeType(mimeType)) {
      return NextResponse.json(buildError('unsupported_audio_type', 'validation', 'This audio format is not supported for voice entry.', requestId), { status: 415 });
    }

    const openRouterAudioFormat = getOpenRouterAudioFormat(mimeType);
    if (!openRouterAudioFormat) {
      return NextResponse.json(buildError('unsupported_audio_type', 'validation', 'This audio format is not supported for voice entry.', requestId), { status: 415 });
    }

    const [{ summary, errorMessage }, existingRequest] = await Promise.all([
      ensureUserSubscriptionSummary(user.id),
      supabase
        .from('ai_requests')
        .select('id, transcript, transcript_retained, status, error_category, error_message')
        .eq('user_id', user.id)
        .eq('request_type', 'voice')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle(),
    ]);

    if (existingRequest.data?.status === 'parsed') {
      if (existingRequest.data.transcript) {
        return NextResponse.json({
          success: true,
          requestId: existingRequest.data.id,
          transcript: existingRequest.data.transcript,
          originalTranscript: existingRequest.data.transcript,
          spokenLanguage,
          displayLanguage,
          translationApplied: false,
          translationFailed: false,
          duplicate: true,
        });
      }

      return NextResponse.json(
        buildError(
          'transcription_failed',
          'state',
          'This voice request has already been processed. Record again if you still need a transcript.',
          requestId
        ),
        { status: 409 }
      );
    }

    if (existingRequest.data?.status === 'failed') {
      const storedCode = getStoredVoiceErrorCode(existingRequest.data.error_category);
      return NextResponse.json(
        buildError(
          storedCode,
          storedCode === 'voice_not_in_plan'
            ? 'subscription'
            : storedCode === 'voice_limit_reached'
              ? 'usage_limit'
              : storedCode === 'empty_audio' || storedCode === 'unsupported_audio_type' || storedCode === 'audio_too_large'
                ? 'validation'
                : storedCode === 'openrouter_not_configured'
                  || storedCode === 'voice_model_missing'
                  || storedCode === 'voice_model_audio_unsupported'
                  || storedCode === 'openrouter_auth_failed'
                  ? 'configuration'
                  : 'technical',
          existingRequest.data.error_message || 'Voice transcription is temporarily unavailable.',
          requestId
        ),
        { status: getStoredVoiceErrorStatus(storedCode) }
      );
    }

    if (errorMessage) {
      return NextResponse.json(
        buildError(
          'openrouter_provider_unavailable',
          'technical',
          'Voice transcription is temporarily unavailable.',
          requestId
        ),
        { status: 503 }
      );
    }

    const resetDateLabel = formatResetDate(summary.cycleEnd);
    const { data: accessError } = await supabase.rpc('check_ai_access', {
      p_user_id: user.id,
      p_request_type: 'voice',
    });

    if (accessError) {
      return NextResponse.json(
        mapAccessErrorToVoiceError(String(accessError), requestId, resetDateLabel),
        { status: String(accessError) === 'voice_limit_reached' ? 429 : 403 }
      );
    }

    const transcriptionStatus = await loadVoiceTranscriptionStatus();
    if (fileEntry.size > transcriptionStatus.maxAudioBytes) {
      return NextResponse.json(buildError('audio_too_large', 'validation', 'This recording is too large to transcribe.', requestId), { status: 413 });
    }

    if (!durationSeconds || durationSeconds <= 0) {
      return NextResponse.json(buildError('empty_audio', 'validation', 'Please record audio before transcribing.', requestId), { status: 400 });
    }

    if (durationSeconds > transcriptionStatus.maxAudioSeconds) {
      return NextResponse.json(buildError('audio_too_large', 'validation', 'This recording is longer than the allowed voice limit.', requestId), { status: 413 });
    }

    const voiceLimitSeconds = Number(summary.monthlyVoiceSeconds || 0);
    const voiceSecondsUsed = Number(summary.voiceSecondsUsed || 0);
    const roundedDurationSeconds = Math.ceil(durationSeconds);
    if (
      voiceLimitSeconds > 0
      && voiceSecondsUsed < voiceLimitSeconds
      && (voiceSecondsUsed + roundedDurationSeconds) > voiceLimitSeconds
    ) {
      return NextResponse.json(
        buildError(
          'voice_limit_reached',
          'usage_limit',
          resetDateLabel
            ? `Voice limit reached. Your allowance resets on ${resetDateLabel}.`
            : 'Voice limit reached.',
          requestId
        ),
        { status: 429 }
      );
    }

    if (!transcriptionStatus.ready) {
      const voiceErrorCode =
        transcriptionStatus.code === 'openrouter_auth_failed'
          ? 'openrouter_auth_failed'
          : transcriptionStatus.code === 'openrouter_provider_unavailable'
            ? 'openrouter_provider_unavailable'
            : transcriptionStatus.code === 'voice_model_missing'
              ? 'voice_model_missing'
              : transcriptionStatus.code === 'voice_model_audio_unsupported'
                ? 'voice_model_audio_unsupported'
                : 'openrouter_not_configured';
      return NextResponse.json(
        buildError(
          voiceErrorCode,
          transcriptionStatus.code === 'openrouter_provider_unavailable' || transcriptionStatus.code === 'openrouter_auth_failed'
            ? 'technical'
            : 'configuration',
          transcriptionStatus.code === 'openrouter_provider_unavailable'
            ? 'Voice transcription is temporarily unavailable.'
            : transcriptionStatus.code === 'openrouter_auth_failed'
              ? 'Voice transcription is temporarily unavailable.'
              : transcriptionStatus.code === 'voice_model_missing' || transcriptionStatus.code === 'voice_model_audio_unsupported'
                ? 'The selected AI model does not support voice transcription. Use text entry for now.'
                : 'The AI service has not been configured by the administrator. Use text entry for now.',
          requestId
        ),
        { status: transcriptionStatus.code === 'openrouter_provider_unavailable' ? 503 : 409 }
      );
    }

    const runtimeConfig = await loadRuntimeVoiceTranscriptionConfig();
    if (!runtimeConfig.ready || !runtimeConfig.model) {
      return NextResponse.json(
        buildError(
          runtimeConfig.code === 'openrouter_auth_failed'
            ? 'openrouter_auth_failed'
            : runtimeConfig.code === 'voice_model_missing'
              ? 'voice_model_missing'
              : runtimeConfig.code === 'voice_model_audio_unsupported'
                ? 'voice_model_audio_unsupported'
                : 'openrouter_not_configured',
          runtimeConfig.code === 'openrouter_auth_failed' ? 'technical' : 'configuration',
          runtimeConfig.code === 'voice_model_missing' || runtimeConfig.code === 'voice_model_audio_unsupported'
            ? 'The selected AI model does not support voice transcription. Use text entry for now.'
            : runtimeConfig.code === 'openrouter_auth_failed'
              ? 'Voice transcription is temporarily unavailable.'
              : 'The AI service has not been configured by the administrator. Use text entry for now.',
          requestId
        ),
        { status: 409 }
      );
    }

    const { data: reserveResult } = await supabase.rpc('reserve_ai_credits', {
      p_user_id: user.id,
      p_request_type: 'voice',
      p_idempotency_key: idempotencyKey,
      p_expected_voice_seconds: roundedDurationSeconds,
    });

    const reserveData = reserveResult as {
      ok?: boolean;
      error?: string;
      cycle_id?: string;
      ledger_id?: string;
    } | null;

    if (!reserveData?.ok || !reserveData.cycle_id || !reserveData.ledger_id) {
      return NextResponse.json(
        mapAccessErrorToVoiceError(String(reserveData?.error || 'voice_limit_reached'), requestId, resetDateLabel),
        { status: 429 }
      );
    }

    try {
      const durationMs = toSpeechDurationMs(durationSeconds);
      const audioBuffer = Buffer.from(await fileEntry.arrayBuffer());
      const openRouterResult = await transcribeAudioWithOpenRouter({
        audioBuffer,
        mimeType,
        format: openRouterAudioFormat,
        model: runtimeConfig.model,
        language: spokenLanguage,
        prompt: buildTranscriptionPrompt(spokenLanguage),
        timeoutMs: 20000,
      });
      const originalTranscript = openRouterResult.transcript.trim();
      let displayTranscript = originalTranscript;
      let translationApplied = false;
      let translationFailed = false;
      let translationErrorMessage: string | null = null;

      const shouldTranslate =
        originalTranscript.length > 0
        && (spokenLanguage === 'auto' || spokenLanguage !== displayLanguage);

      if (shouldTranslate) {
        try {
          const translatedResult = await rewriteTextWithOpenRouter({
            model: runtimeConfig.model,
            prompt: [
              `Translate the following financial transaction description into ${getLanguageDisplayName(displayLanguage)}.`,
              'If the text is already in that language, return it unchanged.',
              'Preserve meaning, transaction intent, numbers, amounts, currency codes, names, merchants, dates, and account names exactly.',
              'Do not summarize, explain, add commentary, or add assumptions.',
              'Output only the translated transaction description.',
              '',
              originalTranscript,
            ].join('\n'),
            timeoutMs: 20000,
          });
          const translatedTranscript = translatedResult.text.trim();
          if (translatedTranscript) {
            displayTranscript = translatedTranscript;
            translationApplied = displayTranscript !== originalTranscript;
          }
        } catch {
          translationFailed = true;
          translationErrorMessage = 'We transcribed your audio, but could not translate it. You can still edit the text or try again.';
        }
      }
      const persistedRequest = await persistVoiceRequest({
        supabase,
        userId: user.id,
        idempotencyKey,
        transcript: originalTranscript,
        transcriptRetained: runtimeConfig.enableTranscriptRetention,
        language: spokenLanguage,
        detectedLanguage: spokenLanguage === 'auto' ? undefined : spokenLanguage,
        providerUsed: runtimeConfig.gateway,
        modelUsed: runtimeConfig.model,
        durationMs,
      });

      const { data: finalised, error: finaliseError } = await supabase.rpc('finalise_ai_credits', {
        p_user_id: user.id,
        p_cycle_id: reserveData.cycle_id,
        p_ledger_id: reserveData.ledger_id,
        p_ai_request_id: persistedRequest?.id || null,
        p_input_tokens: null,
        p_output_tokens: null,
        p_total_tokens: null,
        p_speech_duration_ms: durationMs,
        p_provider_name: runtimeConfig.gateway,
        p_model_name: runtimeConfig.model,
        p_estimated_cost: null,
        p_credit_cost: 2,
      });

      if (finaliseError || finalised !== true) {
        console.error('[voice/transcribe] finalise_ai_credits failed', {
          requestId,
          aiRequestId: persistedRequest?.id || null,
          cycleId: reserveData.cycle_id,
          ledgerId: reserveData.ledger_id,
          durationMs,
          finalised,
          error: finaliseError?.message || null,
        });

        const { error: refundError } = await supabase.rpc('refund_ai_credits', {
          p_user_id: user.id,
          p_cycle_id: reserveData.cycle_id,
          p_ledger_id: reserveData.ledger_id,
          p_reason: 'voice_metering_finalisation_failed',
        });

        if (refundError) {
          console.error('[voice/transcribe] refund after finalise failure failed', {
            requestId,
            aiRequestId: persistedRequest?.id || null,
            cycleId: reserveData.cycle_id,
            ledgerId: reserveData.ledger_id,
            error: refundError.message,
          });
        }

        await persistVoiceRequest({
          supabase,
          userId: user.id,
          idempotencyKey,
          transcriptRetained: false,
          language: spokenLanguage,
          providerUsed: runtimeConfig.gateway,
          modelUsed: runtimeConfig.model,
          durationMs,
          errorCode: 'transcription_failed',
          errorMessage: 'voice_metering_finalisation_failed',
        });

        return NextResponse.json(
          buildError(
            'transcription_failed',
            'technical',
            'Voice transcription is temporarily unavailable.',
            requestId
          ),
          { status: 503 }
        );
      }

      return NextResponse.json({
        success: true,
        requestId: persistedRequest?.id || requestId,
        transcript: displayTranscript,
        originalTranscript,
        spokenLanguage,
        detectedLanguage: spokenLanguage === 'auto' ? null : spokenLanguage,
        displayLanguage,
        translationApplied,
        translationFailed,
        translationErrorMessage,
        providerUsed: runtimeConfig.gateway,
        modelUsed: runtimeConfig.model,
        durationSeconds,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice transcription failed.';
      const isOpenRouterAuthError = /OpenRouter error 401|OpenRouter error 403/i.test(message);
      const isModelMismatch = /audio|input_audio|model_not_found|unsupported.*audio|does not support/i.test(message);
      const mappedCode = isOpenRouterAuthError
        ? 'openrouter_auth_failed'
        : isModelMismatch
          ? 'voice_model_audio_unsupported'
          : 'openrouter_provider_unavailable';

      await supabase.rpc('refund_ai_credits', {
        p_user_id: user.id,
        p_cycle_id: reserveData.cycle_id,
        p_ledger_id: reserveData.ledger_id,
        p_reason: mappedCode,
      });

      await persistVoiceRequest({
        supabase,
        userId: user.id,
        idempotencyKey,
        transcriptRetained: false,
        language: spokenLanguage,
        providerUsed: runtimeConfig.gateway,
        modelUsed: runtimeConfig.model,
        durationMs: toSpeechDurationMs(durationSeconds),
        errorCode: mappedCode,
        errorMessage: message,
      });

      return NextResponse.json(
        buildError(
          mappedCode,
          mappedCode === 'openrouter_provider_unavailable' || mappedCode === 'openrouter_auth_failed'
            ? 'technical'
            : 'configuration',
          mappedCode === 'voice_model_audio_unsupported'
            ? 'The selected AI model does not support voice transcription. Use text entry for now.'
            : mappedCode === 'openrouter_auth_failed'
              ? 'Voice transcription is temporarily unavailable.'
              : 'We could not transcribe your recording right now. Try again in a moment or use text entry.',
          requestId
        ),
        { status: mappedCode === 'openrouter_provider_unavailable' ? 503 : 409 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      buildError(
        'transcription_failed',
        'technical',
        'Voice transcription is temporarily unavailable.',
        requestId
      ),
      { status: 500 }
    );
  }
}
