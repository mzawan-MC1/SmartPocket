import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

type AIConfigStatusResponse = {
  openrouterConfigured: boolean;
  supabaseServiceConfigured: boolean;
  cloudSpeechConfigured: boolean;
  vpsConfigured: boolean;
  aiEnabled: boolean;
  mode: 'cloud_only' | 'vps_only' | 'cloud_primary' | 'vps_primary';
  model: string;
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

  const body: AIConfigStatusResponse = {
    openrouterConfigured: Boolean(openrouterApiKey),
    supabaseServiceConfigured: Boolean(supabaseServiceRoleKey),
    cloudSpeechConfigured: Boolean(process.env.CLOUD_STT_API_KEY),
    vpsConfigured: Boolean(process.env.LOCAL_AI_BASE_URL || process.env.LOCAL_STT_BASE_URL),
    aiEnabled: aiEnabledRaw === 'true',
    mode,
    model,
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
