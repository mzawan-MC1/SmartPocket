import { NextRequest, NextResponse } from 'next/server';
import { createLanguageProvider } from '@/lib/ai-gateway';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  persistVoiceTranscriptionHealth,
  runVoiceTranscriptionHealthCheck,
  type VoiceProviderHealthCheckResult,
} from '@/lib/voice-ai-server';
import { getGeminiTextModel, resolveAIProviderConfig } from '@/lib/ai-provider-config';
import { getGeminiClient } from '@/lib/gemini-client';
import type { ProviderHealthResult } from '@/lib/ai-types';

const ALLOWED_PROVIDERS = new Set(['openrouter', 'vps_ai', 'openrouter_voice', 'gemini', 'gemini_voice']);
const VOICE_GEMINI_PROVIDER_KEY = 'gemini_voice';
const VOICE_OPENROUTER_PROVIDER_KEY = 'openrouter_voice';

export async function POST(req: NextRequest) {
  try {
    const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (process.env.NODE_ENV !== 'production') {
      console.info('[api/ai/test-provider] user', user?.id ?? 'none');
    }

    if (authError || !user) {
      return applySupabaseCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), cookieMutations);
    }

    const isAdmin = user.app_metadata?.role === 'admin';
    if (!isAdmin) {
      return applySupabaseCookies(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), cookieMutations);
    }

    const aiCfg = resolveAIProviderConfig();

    if (process.env.NODE_ENV !== 'production') {
      console.info('[api/ai/test-provider] env', {
        OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        OPENROUTER_BASE_URL: Boolean(process.env.OPENROUTER_BASE_URL),
        OPENROUTER_MODEL: Boolean(process.env.OPENROUTER_MODEL),
        AI_ENABLED: aiCfg.runtime.enabled,
        AI_MODE: Boolean(process.env.AI_MODE),
        AI_MOCK_MODE: Boolean(process.env.AI_MOCK_MODE),
        active: {
          mode: process.env.AI_MODE || 'cloud_only',
          model: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini',
        },
      });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const provider = typeof body.provider === 'string' ? body.provider : '';
    if (!ALLOWED_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: 'Unknown or disallowed provider' }, { status: 400 });
    }

    const openrouterEnabled = aiCfg.openrouter.enabled;
    const cloudOnly = aiCfg.runtime.mode === 'cloud_only';

    let result: ProviderHealthResult | VoiceProviderHealthCheckResult;
    let voiceResult: VoiceProviderHealthCheckResult | null = null;
    let upsertErrors: { provider: string; message: string }[] | undefined;
    let persisted = false;
    let persistGate: 'persist' | 'disabled_openrouter' | 'not_required_vps' = 'persist';

    if (provider === 'openrouter') {
      if (!openrouterEnabled) {
        const checkedAt = new Date().toISOString();
        result = {
          provider: 'openrouter',
          status: 'disabled',
          checkedAt,
          errorCategory: 'openrouter_disabled',
        };
        persistGate = 'disabled_openrouter';
      } else {
        const langProvider = createLanguageProvider('openrouter', 10000);
        result = await langProvider.healthCheck();
      }
    } else if (provider === 'openrouter_voice') {
      const checkedAt = new Date().toISOString();
      if (!openrouterEnabled) {
        result = {
          provider: VOICE_OPENROUTER_PROVIDER_KEY,
          code: 'openrouter_disabled',
          status: 'disabled',
          checkedAt,
          responseTimeMs: 0,
          errorCategory: 'openrouter_disabled',
          modelUsed: null,
          modelAudioCapable: null,
        } satisfies VoiceProviderHealthCheckResult;
        persistGate = 'disabled_openrouter';
      } else {
        voiceResult = await runVoiceTranscriptionHealthCheck();
        result = voiceResult;
      }
    } else if (provider === 'vps_ai') {
      if (cloudOnly) {
        const checkedAt = new Date().toISOString();
        result = {
          provider: 'vps_ai',
          status: 'disabled',
          checkedAt,
          errorCategory: 'cloud_only_mode',
        };
        persistGate = 'not_required_vps';
      } else {
        const langProvider = createLanguageProvider('vps_ai', 10000);
        result = await langProvider.healthCheck();
      }
    } else if (provider === 'gemini') {
      if (!(aiCfg.gemini.apiKey && getGeminiTextModel())) {
        const checkedAt = new Date().toISOString();
        result = {
          provider: 'gemini',
          status: 'not_configured',
          checkedAt,
          errorCategory: 'gemini_not_configured',
        };
      } else {
        const handle = getGeminiClient();
        const model = getGeminiTextModel();
        const checkedAt = new Date().toISOString();
        const start = Date.now();
        try {
          const client = handle.requireClient('gemini-health-check');
          const timeout = AbortSignal.timeout(8000);
          await client.models.generateContent({
            model: model!,
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
            config: { temperature: 0, maxOutputTokens: 1, candidateCount: 1, abortSignal: timeout },
          });
          result = {
            provider: 'gemini',
            status: 'healthy',
            responseTimeMs: Date.now() - start,
            modelUsed: model,
            checkedAt,
          } as ProviderHealthResult & { success: boolean; error?: string; modelAttempted?: string | null };
        } catch (err) {
          console.error('[Gemini Text Test Raw Error]:', err);
          const rawErr = err as any;
          const rawMsg = rawErr?.message ?? (typeof err === 'string' ? err : JSON.stringify(err ?? {}));
          persistGate = 'not_required_vps';
          result = {
            provider: 'gemini',
            status: 'offline',
            responseTimeMs: Date.now() - start,
            errorCategory: 'gemini_provider_unavailable',
            checkedAt,
            modelUsed: model,
            success: false,
            error: rawMsg,
            modelAttempted: model,
          } as unknown as ProviderHealthResult & {
            success: boolean;
            error: string;
            modelAttempted: string | null;
          };
        }
      }
    } else if (provider === 'gemini_voice') {
      voiceResult = await runVoiceTranscriptionHealthCheck();
      result = voiceResult;
    } else {
      return NextResponse.json({ error: 'Unknown or disallowed provider' }, { status: 400 });
    }

    if (persistGate === 'persist') {
      const isVoiceProvider = provider === 'gemini_voice' || provider === 'openrouter_voice';
      const healthRow = isVoiceProvider
        ? null
        : {
            provider,
            status: result.status,
            last_checked_at: result.checkedAt,
            last_success_at: result.status === 'healthy' ? result.checkedAt : undefined,
            last_failure_at: (result.status !== 'healthy' && result.status !== 'disabled' && result.status !== 'not_configured') ? result.checkedAt : undefined,
            last_error_category: 'errorCategory' in result ? (result.errorCategory || null) : null,
            response_time_ms: result.responseTimeMs ?? null,
            model_used: 'modelUsed' in result ? (result.modelUsed || null) : null,
          };

      if (healthRow) {
        try {
          const first = await supabase
            .from('ai_provider_health')
            .upsert(healthRow as any, { onConflict: 'provider' });
          if (first.error) {
            const admin = createAdminClient();
            if (admin) {
              const adminRes = await admin
                .from('ai_provider_health')
                .upsert(healthRow as any, { onConflict: 'provider' });
              if (adminRes.error) {
                upsertErrors = [{ provider, message: `admin: ${adminRes.error.message}` }];
              } else {
                persisted = true;
              }
            } else {
              upsertErrors = [{ provider, message: `rls: ${first.error.message}` }];
            }
          } else {
            persisted = true;
          }
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e || '');
          upsertErrors = [{ provider, message: m.slice(0, 160) }];
        }
      }

      if (voiceResult) {
        try {
          await persistVoiceTranscriptionHealth(voiceResult);
          persisted = true;
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e || '');
          const prior = upsertErrors || [];
          upsertErrors = [...prior, { provider, message: `voice: ${m.slice(0, 140)}` }];
        }
      }
    }

    const admin = createAdminClient();
    let reloaded: unknown = null;
    if (admin) {
      const checkProvider = (() => {
        if (provider === 'gemini_voice') return VOICE_GEMINI_PROVIDER_KEY;
        if (provider === 'openrouter_voice') return VOICE_OPENROUTER_PROVIDER_KEY;
        return provider;
      })();
      const { data } = await admin
        .from('ai_provider_health')
        .select('provider, status, last_checked_at, last_success_at, last_failure_at, last_error_category, response_time_ms, model_used')
        .eq('provider', checkProvider)
        .maybeSingle();
      reloaded = data || null;
    }

    const sanitizedDiagnostic = (() => {
      const r = result as VoiceProviderHealthCheckResult;
      if ('httpStatus' in r || 'errorKind' in r || 'sanitizedError' in r) {
        return {
          httpStatus: r.httpStatus ?? null,
          errorKind: r.errorKind ?? null,
          requestId: r.requestId ?? null,
          sanitizedError: r.sanitizedError ?? null,
        };
      }
      return null;
    })();

    const responsePayload = {
      ...result,
      persisted,
      persistGate,
      upsertErrors,
      reloaded,
      diagnostic: sanitizedDiagnostic,
    };

    return applySupabaseCookies(NextResponse.json(responsePayload, { status: 200 }), cookieMutations);
  } catch (error) {
    const m = error instanceof Error ? error.message : String(error || 'Test failed');
    return NextResponse.json({ error: 'Test failed', detail: m.slice(0, 300) }, { status: 500 });
  }
}
