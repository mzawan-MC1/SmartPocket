import { NextResponse } from 'next/server';
import { runHealthChecks, loadAIConfig } from '@/lib/ai-gateway';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (process.env.NODE_ENV !== 'production') {
      console.info('[api/ai/health] user', user?.id ?? 'none');
    }

    if (authError || !user) {
      return applySupabaseCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), cookieMutations);
    }

    if (user.app_metadata?.role !== 'admin') {
      return applySupabaseCookies(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), cookieMutations);
    }

    if (process.env.NODE_ENV !== 'production') {
      console.info('[api/ai/health] env', {
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

    const config = loadAIConfig();
    const healthResults = await runHealthChecks(config);

    // Update health records in DB (admin-only table)
    for (const result of healthResults) {
      const payload = {
        provider: result.provider as any,
        status: result.status as any,
        last_checked_at: result.checkedAt,
        last_success_at: result.status === 'healthy' ? result.checkedAt : undefined,
        last_failure_at: result.status === 'offline' ? result.checkedAt : undefined,
        last_error_category: result.errorCategory || null,
        response_time_ms: result.responseTimeMs || null,
        model_used: result.modelUsed || null,
        updated_at: new Date().toISOString(),
      };

      const upsertRes = await supabase.from('ai_provider_health').upsert(payload, { onConflict: 'provider' });
      if (upsertRes.error) {
        const admin = createAdminClient();
        if (admin) {
          const adminUpsert = await admin.from('ai_provider_health').upsert(payload, { onConflict: 'provider' });
          if (adminUpsert.error) {
            console.error('[api/ai/health] health upsert failed:', adminUpsert.error.message);
          }
        } else {
          console.error('[api/ai/health] health upsert failed:', upsertRes.error.message);
        }
      }
    }

    return applySupabaseCookies(NextResponse.json({
      providers: healthResults,
      aiEnabled: config.aiEnabled,
      aiMode: config.aiMode,
      checkedAt: new Date().toISOString(),
    }, { status: 200 }), cookieMutations);
  } catch (error) {
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 });
  }
}
