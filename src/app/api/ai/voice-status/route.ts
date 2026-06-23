import { NextResponse } from 'next/server';
import type { AIErrorPayload, AIUsageSummary } from '@/lib/ai-types';
import { ensureUserSubscriptionSummary } from '@/lib/subscription/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { loadVoiceTranscriptionStatus } from '@/lib/voice-ai-server';

function buildUsage(summary: Awaited<ReturnType<typeof ensureUserSubscriptionSummary>>['summary']): AIUsageSummary {
  const monthlyVoiceSeconds = Number(summary.monthlyVoiceSeconds || 0);
  const voiceSecondsUsed = Number(summary.voiceSecondsUsed || 0);

  return {
    planName: summary.planName,
    planCode: summary.planCode,
    subscriptionStatus: summary.status,
    cycleEnd: summary.cycleEnd ?? undefined,
    monthlyVoiceSeconds,
    voiceSecondsUsed,
    creditsReserved: Number(summary.creditsReserved || 0),
  };
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

function buildVoiceError(
  code: AIErrorPayload['code'],
  category: AIErrorPayload['category'],
  message: string
): AIErrorPayload {
  return { code, category, message };
}

export async function GET() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return applySupabaseCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), cookieMutations);
  }

  const [{ summary, errorMessage }, transcription] = await Promise.all([
    ensureUserSubscriptionSummary(user.id),
    loadVoiceTranscriptionStatus(),
  ]);

  if (errorMessage) {
    return applySupabaseCookies(
      NextResponse.json({
        ready: false,
        error: buildVoiceError(
          'transcription_provider_unavailable',
          'technical',
          'Voice transcription is temporarily unavailable.'
        ),
      }, { status: 503 }),
      cookieMutations
    );
  }

  const usage = buildUsage(summary);

  if (!summary.voiceAiEnabled) {
    return applySupabaseCookies(
      NextResponse.json({
        ready: false,
        usage,
        transcription,
        error: buildVoiceError(
          'voice_not_in_plan',
          'subscription',
          'Voice AI is not available on your current plan.'
        ),
      }, { status: 403 }),
      cookieMutations
    );
  }

  if (
    typeof summary.monthlyVoiceSeconds === 'number'
    && summary.monthlyVoiceSeconds > 0
    && Number(summary.voiceSecondsUsed || 0) >= summary.monthlyVoiceSeconds
  ) {
    const resetDate = formatResetDate(summary.cycleEnd);
    return applySupabaseCookies(
      NextResponse.json({
        ready: false,
        usage,
        transcription,
        error: buildVoiceError(
          'voice_limit_reached',
          'usage_limit',
          resetDate
            ? `Voice limit reached. Your allowance resets on ${resetDate}.`
            : 'Voice limit reached.'
        ),
      }, { status: 429 }),
      cookieMutations
    );
  }

  if (!transcription.ready) {
    const error = transcription.code === 'openrouter_auth_failed'
      ? buildVoiceError(
          'openrouter_auth_failed',
          'technical',
          'Voice transcription is temporarily unavailable.'
        )
      : transcription.code === 'openrouter_provider_unavailable'
        ? buildVoiceError(
            'openrouter_provider_unavailable',
            'technical',
            'Voice transcription is temporarily unavailable.'
          )
        : transcription.code === 'voice_model_missing' || transcription.code === 'voice_model_audio_unsupported'
          ? buildVoiceError(
              transcription.code,
              'configuration',
              'The selected AI model does not support voice transcription. Use text entry for now.'
            )
          : buildVoiceError(
              'openrouter_not_configured',
              'configuration',
              'The AI service has not been configured by the administrator. Use text entry for now.'
            );

    return applySupabaseCookies(
      NextResponse.json({
        ready: false,
        usage,
        transcription,
        error,
      }, { status: error.code === 'openrouter_provider_unavailable' ? 503 : 409 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(NextResponse.json({
    ready: true,
    usage,
    transcription,
  }, { status: 200 }), cookieMutations);
}
