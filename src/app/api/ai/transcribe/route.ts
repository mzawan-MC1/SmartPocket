import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { AIErrorPayload, AIErrorResponse } from '@/lib/ai-types';
import { ensureUserSubscriptionSummary } from '@/lib/subscription/server';
import {
  getVoiceAudioExtension,
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
    case 'transcription_not_configured':
    case 'transcription_auth_failed':
    case 'transcription_provider_unavailable':
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
    case 'transcription_provider_unavailable':
      return 503;
    case 'transcription_not_configured':
    case 'transcription_auth_failed':
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

async function transcribeWithProvider(args: {
  file: File;
  mimeType: string;
  language: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  authToken?: string;
}) {
  const formData = new FormData();
  formData.append(
    'file',
    args.file,
    `voice-entry.${getVoiceAudioExtension(args.mimeType)}`
  );
  formData.append('model', args.model);
  if (args.language && args.language !== 'auto') {
    formData.append('language', args.language);
  }

  const headers: Record<string, string> = {};
  if (args.provider === 'cloud_stt' && args.apiKey) {
    headers.Authorization = `Bearer ${args.apiKey}`;
  } else if (args.provider === 'vps_stt' && args.authToken) {
    headers.Authorization = `Bearer ${args.authToken}`;
  }

  const response = await fetch(
    `${args.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`,
    {
      method: 'POST',
      headers,
      body: formData,
      signal: AbortSignal.timeout(20000),
    }
  );

  if (response.status === 401 || response.status === 403) {
    return { ok: false as const, code: 'transcription_auth_failed' as const };
  }

  if (response.status === 400) {
    const errorText = (await response.text().catch(() => '')).toLowerCase();
    if (errorText.includes('model')) {
      return { ok: false as const, code: 'transcription_not_configured' as const };
    }
  }

  if (!response.ok) {
    return {
      ok: false as const,
      code: response.status >= 500 || response.status === 429
        ? 'transcription_provider_unavailable' as const
        : 'transcription_failed' as const,
    };
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  const transcript = typeof payload?.text === 'string'
    ? payload.text.trim()
    : typeof payload?.transcript === 'string'
      ? payload.transcript.trim()
      : '';

  if (!transcript) {
    return { ok: false as const, code: 'transcription_failed' as const };
  }

  return {
    ok: true as const,
    transcript,
    detectedLanguage: typeof payload?.language === 'string' ? payload.language : undefined,
  };
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
    const language = typeof formData.get('language') === 'string'
      ? String(formData.get('language')).trim().toLowerCase()
      : 'en';

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
                : storedCode === 'transcription_not_configured' || storedCode === 'transcription_auth_failed'
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
          'transcription_provider_unavailable',
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
      return NextResponse.json(
        buildError(
          transcriptionStatus.code === 'transcription_auth_failed'
            ? 'transcription_auth_failed'
            : transcriptionStatus.code === 'transcription_provider_unavailable'
              ? 'transcription_provider_unavailable'
              : 'transcription_not_configured',
          transcriptionStatus.code === 'transcription_provider_unavailable' ? 'technical' : 'configuration',
          transcriptionStatus.code === 'transcription_provider_unavailable'
            ? 'Voice transcription is temporarily unavailable.'
            : transcriptionStatus.code === 'transcription_auth_failed'
              ? 'Voice transcription is temporarily unavailable.'
              : 'Voice transcription has not been configured by the administrator.',
          requestId
        ),
        { status: transcriptionStatus.code === 'transcription_provider_unavailable' ? 503 : 409 }
      );
    }

    const runtimeConfig = await loadRuntimeVoiceTranscriptionConfig();
    if (!runtimeConfig.ready || !runtimeConfig.provider || !runtimeConfig.model) {
      return NextResponse.json(
        buildError(
          runtimeConfig.code === 'transcription_auth_failed'
            ? 'transcription_auth_failed'
            : 'transcription_not_configured',
          'configuration',
          'Voice transcription has not been configured by the administrator.',
          requestId
        ),
        { status: 409 }
      );
    }

    const { data: reserveResult } = await supabase.rpc('reserve_ai_credits', {
      p_user_id: user.id,
      p_request_type: 'voice',
      p_idempotency_key: idempotencyKey,
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

    let transcriptResult: Awaited<ReturnType<typeof transcribeWithProvider>> | null = null;
    try {
      transcriptResult = await transcribeWithProvider({
        file: fileEntry,
        mimeType,
        language,
        provider: runtimeConfig.provider,
        baseUrl: runtimeConfig.baseUrl,
        model: runtimeConfig.model,
        apiKey: runtimeConfig.apiKey,
        authToken: runtimeConfig.authToken,
      });

      if (!transcriptResult.ok) {
        const errorResponse = buildError(
          transcriptResult.code,
          transcriptResult.code === 'transcription_failed' ? 'technical' : transcriptResult.code === 'transcription_provider_unavailable' ? 'technical' : 'configuration',
          transcriptResult.code === 'transcription_provider_unavailable'
            ? 'Voice transcription is temporarily unavailable.'
            : transcriptResult.code === 'transcription_auth_failed'
              ? 'Voice transcription is temporarily unavailable.'
              : transcriptResult.code === 'transcription_not_configured'
                ? 'Voice transcription has not been configured by the administrator.'
                : 'We could not transcribe this recording.',
          requestId
        );

        await supabase.rpc('refund_ai_credits', {
          p_user_id: user.id,
          p_cycle_id: reserveData.cycle_id,
          p_ledger_id: reserveData.ledger_id,
          p_reason: transcriptResult.code,
        });

        await persistVoiceRequest({
          supabase,
          userId: user.id,
          idempotencyKey,
          transcriptRetained: false,
          language,
          providerUsed: runtimeConfig.provider,
          modelUsed: runtimeConfig.model,
          durationMs: Math.round(durationSeconds * 1000),
          errorCode: transcriptResult.code,
          errorMessage: errorResponse.error.message,
        });

        return NextResponse.json(errorResponse, {
          status: transcriptResult.code === 'transcription_provider_unavailable' ? 503 : 502,
        });
      }

      const persistedRequest = await persistVoiceRequest({
        supabase,
        userId: user.id,
        idempotencyKey,
        transcript: transcriptResult.transcript,
        transcriptRetained: runtimeConfig.enableTranscriptRetention,
        language,
        detectedLanguage: transcriptResult.detectedLanguage,
        providerUsed: runtimeConfig.provider,
        modelUsed: runtimeConfig.model,
        durationMs: Math.round(durationSeconds * 1000),
      });

      await supabase.rpc('finalise_ai_credits', {
        p_user_id: user.id,
        p_cycle_id: reserveData.cycle_id,
        p_ledger_id: reserveData.ledger_id,
        p_ai_request_id: persistedRequest?.id || null,
        p_input_tokens: null,
        p_output_tokens: null,
        p_total_tokens: null,
        p_speech_duration_ms: Math.round(durationSeconds * 1000),
        p_provider_name: runtimeConfig.provider,
        p_model_name: runtimeConfig.model,
        p_estimated_cost: null,
        p_credit_cost: 2,
      });

      return NextResponse.json({
        success: true,
        requestId: persistedRequest?.id || requestId,
        transcript: transcriptResult.transcript,
        detectedLanguage: transcriptResult.detectedLanguage,
        providerUsed: runtimeConfig.provider,
        modelUsed: runtimeConfig.model,
        durationSeconds,
      });
    } catch (error) {
      await supabase.rpc('refund_ai_credits', {
        p_user_id: user.id,
        p_cycle_id: reserveData.cycle_id,
        p_ledger_id: reserveData.ledger_id,
        p_reason: 'transcription_failed',
      });

      await persistVoiceRequest({
        supabase,
        userId: user.id,
        idempotencyKey,
        transcriptRetained: false,
        language,
        providerUsed: runtimeConfig.provider,
        modelUsed: runtimeConfig.model,
        durationMs: Math.round(durationSeconds * 1000),
        errorCode: 'transcription_failed',
        errorMessage: error instanceof Error ? error.message : 'Voice transcription failed.',
      });

      return NextResponse.json(
        buildError(
          'transcription_failed',
          'technical',
          'We could not transcribe this recording.',
          requestId
        ),
        { status: 502 }
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
