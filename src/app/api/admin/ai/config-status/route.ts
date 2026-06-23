import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { loadVoiceTranscriptionStatus } from '@/lib/voice-ai-server';

type AIConfigStatusResponse = {
  openrouterConfigured: boolean;
  openrouterBaseUrlConfigured: boolean;
  supabaseServiceConfigured: boolean;
  vpsConfigured: boolean;
  aiEnabled: boolean;
  mode: 'cloud_only' | 'vps_only' | 'cloud_primary' | 'vps_primary';
  model: string;
  voiceTranscription: {
    ready: boolean;
    code: string;
    gateway: string;
    model: string | null;
    modelSource: string;
    modelAudioCapable: boolean | null;
    maxAudioSeconds: number;
    maxAudioBytes: number;
    supportedAudioFormats: string;
    openrouterConfigured: boolean;
    apiKeyConfigured: boolean;
    baseUrlConfigured: boolean;
    lastHealthCheck: {
      provider: string;
      status: string;
      checkedAt: string | null;
      lastSuccessAt: string | null;
      lastFailureAt: string | null;
      errorCategory: string | null;
      responseTimeMs: number | null;
      modelUsed: string | null;
      modelAudioCapable: boolean | null;
    } | null;
  };
};

export async function GET() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return applySupabaseCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), cookieMutations);
  }

  if (user.app_metadata?.role !== 'admin') {
    return applySupabaseCookies(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), cookieMutations);
  }

  const openrouterApiKey = process.env.OPENROUTER_API_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openrouterBaseUrl = process.env.OPENROUTER_BASE_URL;
  const openrouterModel = process.env.OPENROUTER_MODEL;
  const aiEnabledRaw = process.env.AI_ENABLED;
  const aiModeRaw = process.env.AI_MODE;
  const aiMockModeRaw = process.env.AI_MOCK_MODE;

  const mode: AIConfigStatusResponse['mode'] =
    aiModeRaw === 'vps_only' || aiModeRaw === 'cloud_primary' || aiModeRaw === 'vps_primary' || aiModeRaw === 'cloud_only'
      ? aiModeRaw
      : 'cloud_only';

  const model = openrouterModel || 'openai/gpt-4.1-mini';
  const voiceTranscription = await loadVoiceTranscriptionStatus();
  const vpsConfigured = Boolean(
    process.env.LOCAL_AI_BASE_URL
  );

  const body: AIConfigStatusResponse = {
    openrouterConfigured: Boolean(openrouterApiKey),
    openrouterBaseUrlConfigured: Boolean(openrouterBaseUrl || 'https://openrouter.ai/api/v1'),
    supabaseServiceConfigured: Boolean(supabaseServiceRoleKey),
    vpsConfigured,
    aiEnabled: aiEnabledRaw === 'true' && voiceTranscription.adminAiEnabled,
    mode,
    model,
    voiceTranscription: {
      ready: voiceTranscription.ready,
      code: voiceTranscription.code,
      gateway: voiceTranscription.gateway,
      model: voiceTranscription.model,
      modelSource: voiceTranscription.modelSource,
      modelAudioCapable: voiceTranscription.modelAudioCapable,
      maxAudioSeconds: voiceTranscription.maxAudioSeconds,
      maxAudioBytes: voiceTranscription.maxAudioBytes,
      supportedAudioFormats: voiceTranscription.supportedAudioFormats,
      openrouterConfigured: voiceTranscription.openrouterConfigured,
      apiKeyConfigured: voiceTranscription.apiKeyConfigured,
      baseUrlConfigured: voiceTranscription.baseUrlConfigured,
      lastHealthCheck: voiceTranscription.lastHealthCheck,
    },
  };

  if (process.env.NODE_ENV !== 'production') {
    console.info('[admin/ai/config-status]', {
      env: {
        OPENROUTER_API_KEY: Boolean(openrouterApiKey),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(supabaseServiceRoleKey),
        OPENROUTER_BASE_URL: Boolean(openrouterBaseUrl),
        OPENROUTER_MODEL: Boolean(openrouterModel),
        AI_ENABLED: Boolean(aiEnabledRaw),
        AI_MODE: Boolean(aiModeRaw),
        AI_MOCK_MODE: Boolean(aiMockModeRaw),
      },
      active: { mode, model, aiEnabled: body.aiEnabled },
    });
  }

  return applySupabaseCookies(NextResponse.json(body, { status: 200 }), cookieMutations);
}
