import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createLanguageProvider } from '@/lib/ai-gateway';
import {
  getGeminiMultimodalFallbackModel,
  getGeminiTextModel,
  getGeminiTranslationModel,
  getGeminiVoiceModel,
  resolveAIProviderConfig,
} from '@/lib/ai-provider-config';
import {
  runVoiceTranscriptionHealthCheck,
  persistVoiceTranscriptionHealth,
  type VoiceProviderHealthCheckResult,
} from '@/lib/voice-ai-server';
import type { ProviderHealthResult } from '@/lib/ai-types';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  if (!supabase) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Supabase client unavailable' },
        { status: 500 }
      ),
      cookieMutations
    );
  }

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return applySupabaseCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), cookieMutations);
  }

  if ((user.app_metadata as { role?: string } | null)?.role !== 'admin') {
    return applySupabaseCookies(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), cookieMutations);
  }

  const aiCfg = resolveAIProviderConfig();

  const upsertErrors: { provider: string; message: string }[] = [];
  const persistedRows: { provider: string; persisted: boolean }[] = [];

  const isCloudOnly = aiCfg.runtime.mode === 'cloud_only';
  const runGeminiText = Boolean(aiCfg.gemini.apiKey && getGeminiTextModel());
  const geminiVoiceConfigured = Boolean(
    aiCfg.gemini.apiKey
    && getGeminiVoiceModel()
  );
  const geminiTranslationConfigured = Boolean(aiCfg.gemini.apiKey && getGeminiTranslationModel());
  const results: ProviderHealthResult[] = [];

  const configurationReadiness = {
    gemini: {
      textConfigured: runGeminiText,
      translationConfigured: geminiTranslationConfigured,
      voiceConfigured: geminiVoiceConfigured,
      apiKeyPresent: Boolean(aiCfg.gemini.apiKey),
      fastModel: getGeminiTextModel() || null,
      translationModel: getGeminiTranslationModel() || null,
      voicePrimaryModel: getGeminiVoiceModel() || null,
      voiceFallbackModel: getGeminiMultimodalFallbackModel() || null,
    },
    openrouter: {
      enabled: aiCfg.openrouter.enabled,
      apiKeyPresent: Boolean(aiCfg.openrouter.apiKey),
    },
    vpsAi: {
      enabled: !isCloudOnly,
    },
  };

  if (runGeminiText) {
    try {
      const p = createLanguageProvider('gemini', 8000);
      results.push(await p.healthCheck());
    } catch (e) {
      results.push({
        provider: 'gemini',
        status: 'offline',
        errorCategory: 'gemini_provider_unavailable',
        responseTimeMs: 0,
        checkedAt: new Date().toISOString(),
      });
    }
  } else {
    results.push({
      provider: 'gemini',
      status: 'not_configured',
      errorCategory: 'gemini_not_configured',
      checkedAt: new Date().toISOString(),
    });
  }

  if (aiCfg.openrouter.enabled) {
    try {
      const p = createLanguageProvider('openrouter', 8000);
      results.push(await p.healthCheck());
    } catch (e) {
      results.push({
        provider: 'openrouter',
        status: 'offline',
        errorCategory: 'openrouter_provider_unavailable',
        responseTimeMs: 0,
        checkedAt: new Date().toISOString(),
      });
    }
  } else {
    results.push({
      provider: 'openrouter',
      status: 'disabled',
      errorCategory: 'openrouter_disabled',
      checkedAt: new Date().toISOString(),
    });
  }

  if (!isCloudOnly) {
    try {
      const p = createLanguageProvider('vps_ai', 5000);
      results.push(await p.healthCheck());
    } catch (e) {
      results.push({
        provider: 'vps_ai',
        status: 'offline',
        errorCategory: 'connection_failed',
        responseTimeMs: 0,
        checkedAt: new Date().toISOString(),
      });
    }
  } else {
    results.push({
      provider: 'vps_ai',
      status: 'disabled',
      errorCategory: 'cloud_only_mode',
      checkedAt: new Date().toISOString(),
    });
  }

  let voiceHealth: VoiceProviderHealthCheckResult | null = null;
  try {
    voiceHealth = await runVoiceTranscriptionHealthCheck();
  } catch (e) {
    const anyErr = e as any;
    voiceHealth = {
      provider: 'gemini_voice',
      code: 'gemini_provider_unavailable',
      status: 'offline',
      checkedAt: new Date().toISOString(),
      responseTimeMs: 0,
      errorCategory: anyErr && typeof anyErr.message === 'string' ? anyErr.message.slice(0, 120) : 'unknown_error',
    };
  }

  for (const result of results) {
    if (result.provider === 'vps_ai' && result.status === 'disabled') continue;
    const payload = {
      provider: result.provider,
      status: result.status,
      last_checked_at: result.checkedAt,
      last_success_at: result.status === 'healthy' ? result.checkedAt : undefined,
      last_failure_at: result.status !== 'healthy' && result.status !== 'disabled' && result.status !== 'not_configured' ? result.checkedAt : undefined,
      last_error_category: result.errorCategory || null,
      response_time_ms: result.responseTimeMs ?? null,
      model_used: result.modelUsed || null,
    };
    let written = false;
    try {
      const { error: insertErr } = await supabase
        .from('ai_provider_health')
        .upsert(payload as any, { onConflict: 'provider', ignoreDuplicates: false });
      if (insertErr) {
        const admin = createAdminClient();
        if (admin) {
          const { error: adminErr } = await admin
            .from('ai_provider_health')
            .upsert(payload as any, { onConflict: 'provider', ignoreDuplicates: false });
          if (adminErr) {
            upsertErrors.push({ provider: result.provider, message: `admin: ${adminErr.message}` });
          } else {
            written = true;
          }
        } else {
          upsertErrors.push({ provider: result.provider, message: `rls: ${insertErr.message}` });
        }
      } else {
        written = true;
      }
    } catch (unexpected) {
      const m = unexpected instanceof Error ? unexpected.message : String(unexpected || '');
      upsertErrors.push({ provider: result.provider, message: m.slice(0, 160) });
    }
    persistedRows.push({ provider: result.provider, persisted: written });
  }

  if (voiceHealth) {
    if (voiceHealth.provider !== 'openrouter_voice' || aiCfg.openrouter.enabled) {
      try {
        await persistVoiceTranscriptionHealth(voiceHealth);
        persistedRows.push({ provider: voiceHealth.provider, persisted: true });
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e || '');
        upsertErrors.push({ provider: voiceHealth.provider, message: m.slice(0, 160) });
        persistedRows.push({ provider: voiceHealth.provider, persisted: false });
      }
    } else {
      persistedRows.push({ provider: voiceHealth.provider, persisted: false });
    }
  }

  const admin = createAdminClient();
  let rowsFromDb: any[] = [];
  if (admin) {
    const { data } = await admin
      .from('ai_provider_health')
      .select('provider, status, last_checked_at, last_success_at, last_failure_at, last_error_category, response_time_ms, model_used');
    rowsFromDb = data || [];
  }

  let liveVoiceProbe: {
    connectivityOk: boolean;
    wavMimeAcceptedOk: boolean;
    structuredSchemaOk: boolean;
    status: string;
    provider: string;
    primaryModel: string | null;
    fallbackModel: string | null;
    fallbackUsed: boolean;
  } | null = null;
  if (voiceHealth) {
    const vh = voiceHealth as any;
    const statusOk = voiceHealth.status === 'healthy' || voiceHealth.status === 'degraded';
    liveVoiceProbe = {
      connectivityOk: statusOk,
      wavMimeAcceptedOk: statusOk,
      structuredSchemaOk: statusOk && Boolean(vh.voiceSmartEntrySchemaValidated),
      status: voiceHealth.status,
      provider: voiceHealth.provider,
      primaryModel: typeof vh.primaryModel === 'string' ? vh.primaryModel : null,
      fallbackModel: typeof vh.finalModel === 'string' ? vh.finalModel : null,
      fallbackUsed: Boolean(vh.fallbackUsed),
    };
  }

  return applySupabaseCookies(NextResponse.json({
    ok: true,
    configurationReadiness,
    liveVoiceProbe,
    checks: results,
    voiceHealth,
    persistedRows,
    upsertErrors: upsertErrors.length ? upsertErrors : undefined,
    rows: rowsFromDb,
  }), cookieMutations);
}
