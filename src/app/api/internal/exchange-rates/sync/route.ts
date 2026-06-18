import { NextRequest, NextResponse } from 'next/server';
import { getExchangeRateProvider } from '@/lib/exchange-rates/provider';
import { syncExchangeRates } from '@/lib/exchange-rates/service';
import { createAdminClient } from '@/lib/supabase/admin';

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  return authorization.slice(7).trim();
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

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.EXCHANGE_RATE_SYNC_SECRET;
  const suppliedSecret = getBearerToken(request) || request.headers.get('x-sync-secret') || '';

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { admin, supportedCurrencies } = await loadSupportedCurrencies();
    const provider = getExchangeRateProvider();
    const result = await syncExchangeRates({
      client: admin,
      provider,
      supportedCurrencies,
    });

    return NextResponse.json({
      success: true,
      provider: result.provider,
      baseCurrency: result.baseCurrency,
      rateDate: result.rateDate,
      rateCount: result.rateCount,
      fetchedAt: result.fetchedAt,
      providerTimestamp: result.providerTimestamp,
      snapshotId: result.snapshotId,
      runId: result.runId,
    });
  } catch (error) {
    console.error('[exchange-rates/sync] failed', {
      message: error instanceof Error ? error.message : 'Unknown exchange-rate sync error',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Exchange-rate sync failed',
      },
      { status: 500 }
    );
  }
}
