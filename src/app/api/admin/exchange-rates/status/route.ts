import { NextResponse } from 'next/server';
import { getExchangeRateProvider } from '@/lib/exchange-rates/provider';
import { getExchangeRateStatusSummary, syncExchangeRates } from '@/lib/exchange-rates/service';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

async function requireAdminUser() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      cookieMutations,
      response: applySupabaseCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), cookieMutations),
    };
  }

  if (user.app_metadata?.role !== 'admin') {
    return {
      user: null,
      cookieMutations,
      response: applySupabaseCookies(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), cookieMutations),
    };
  }

  return { user, cookieMutations, response: null };
}

async function loadSupportedCurrencies() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('Supabase admin client is not configured');
  }

  const { data, error } = await admin
    .from('currency_registry')
    .select('code')
    .eq('is_active', true);

  if (error) {
    throw error;
  }

  return {
    admin,
    supportedCurrencies: (data || [])
      .map((row) => (typeof row.code === 'string' ? row.code.trim().toUpperCase() : ''))
      .filter((currencyCode) => currencyCode.length === 3),
  };
}

export async function GET() {
  const auth = await requireAdminUser();
  if (auth.response) {
    return auth.response;
  }

  try {
    const admin = createAdminClient();
    if (!admin) {
      throw new Error('Supabase admin client is not configured');
    }

    const [summary, latestRun] = await Promise.all([
      getExchangeRateStatusSummary(admin),
      admin
        .from('exchange_rate_sync_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (latestRun.error) {
      throw latestRun.error;
    }

    return applySupabaseCookies(
      NextResponse.json({
        configured: true,
        summary,
        latestRun: latestRun.data || null,
      }),
      auth.cookieMutations
    );
  } catch (error) {
    return applySupabaseCookies(
      NextResponse.json(
        {
          configured: false,
          error: error instanceof Error ? error.message : 'Failed to load exchange-rate status',
        },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}

export async function POST() {
  const auth = await requireAdminUser();
  if (auth.response) {
    return auth.response;
  }

  try {
    const { admin, supportedCurrencies } = await loadSupportedCurrencies();
    const provider = getExchangeRateProvider();
    const result = await syncExchangeRates({
      client: admin,
      provider,
      supportedCurrencies,
    });

    return applySupabaseCookies(
      NextResponse.json(result),
      auth.cookieMutations
    );
  } catch (error) {
    console.error('[admin/exchange-rates/status] refresh failed', {
      message: error instanceof Error ? error.message : 'Unknown exchange-rate refresh error',
    });

    return applySupabaseCookies(
      NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Exchange-rate refresh failed',
        },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}
