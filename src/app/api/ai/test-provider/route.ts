import { NextRequest, NextResponse } from 'next/server';
import { createLanguageProvider } from '@/lib/ai-gateway';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  persistVoiceTranscriptionHealth,
  runVoiceTranscriptionHealthCheck,
  type VoiceProviderHealthCheckResult,
} from '@/lib/voice-ai-server';
import type { VoiceTranscriptionProvider } from '@/lib/voice-ai';
import type { ProviderHealthResult } from '@/lib/ai-types';

// Allowlisted provider names — never trust caller-supplied provider names
const ALLOWED_PROVIDERS = new Set(['openrouter', 'vps_ai', 'cloud_stt', 'vps_stt']);

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

    if (process.env.NODE_ENV !== 'production') {
      console.info('[api/ai/test-provider] env', {
        OPENROUTER_API_KEY: Boolean(process.env.OPENROUTER_API_KEY),
        SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        OPENROUTER_BASE_URL: Boolean(process.env.OPENROUTER_BASE_URL),
        OPENROUTER_MODEL: Boolean(process.env.OPENROUTER_MODEL),
        AI_ENABLED: Boolean(process.env.AI_ENABLED),
        AI_MODE: Boolean(process.env.AI_MODE),
        AI_MOCK_MODE: Boolean(process.env.AI_MOCK_MODE),
        active: {
          mode: process.env.AI_MODE || 'cloud_only',
          model: process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini',
        },
      });
    }

    // ── 3. Parse body — validate provider against allowlist ─────────────────
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

    // ── 4. Run health check ──────────────────────────────────────────────────
    let result: ProviderHealthResult | VoiceProviderHealthCheckResult;
    let voiceResult: VoiceProviderHealthCheckResult | null = null;
    if (provider === 'openrouter' || provider === 'vps_ai') {
      const langProvider = createLanguageProvider(provider, 10000);
      result = await langProvider.healthCheck();
    } else {
      const voiceProvider: VoiceTranscriptionProvider = provider === 'cloud_stt' ? 'cloud_stt' : 'vps_stt';
      voiceResult = await runVoiceTranscriptionHealthCheck(voiceProvider);
      result = voiceResult;
    }

    // ── 5. Persist health record — status is server-derived, not from body ──
    const VALID_HEALTH_STATUSES = new Set(['healthy', 'degraded', 'offline', 'not_configured']);
    const safeStatus = VALID_HEALTH_STATUSES.has(result.status) ? result.status : 'offline';

    const upsertPayload = {
      provider: provider as any,
      status: safeStatus as any,
      last_checked_at: result.checkedAt,
      last_success_at: safeStatus === 'healthy' ? result.checkedAt : undefined,
      last_failure_at: safeStatus === 'offline' ? result.checkedAt : undefined,
      last_error_category: result.errorCategory || null,
      response_time_ms: result.responseTimeMs || null,
      updated_at: new Date().toISOString(),
    };

    const upsertRes = await supabase
      .from('ai_provider_health')
      .upsert(upsertPayload, { onConflict: 'provider' });

    if (upsertRes.error) {
      const admin = createAdminClient();
      if (admin) {
        const adminUpsert = await admin
          .from('ai_provider_health')
          .upsert(upsertPayload, { onConflict: 'provider' });
        if (adminUpsert.error) {
          console.error('[api/ai/test-provider] health upsert failed:', adminUpsert.error.message);
        }
      } else {
        console.error('[api/ai/test-provider] health upsert failed:', upsertRes.error.message);
      }
    }

    if (voiceResult) {
      await persistVoiceTranscriptionHealth(voiceResult);
    }

    return applySupabaseCookies(NextResponse.json(result, { status: 200 }), cookieMutations);
  } catch (error) {
    return NextResponse.json({ error: 'Test failed' }, { status: 500 });
  }
}
