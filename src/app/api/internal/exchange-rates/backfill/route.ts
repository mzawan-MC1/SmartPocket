import { NextRequest, NextResponse } from 'next/server';
import { getExchangeRateProvider } from '@/lib/exchange-rates/provider';
import {
  getHistoricalExchangeRateSnapshotForDate,
  syncHistoricalExchangeRatesForDate,
} from '@/lib/exchange-rates/service';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_BACKFILL_DAYS_PER_REQUEST = 31;

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  return authorization.slice(7).trim();
}

function normalizeDate(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function diffDaysInclusive(dateFrom: string, dateTo: string) {
  const fromTime = Date.parse(`${dateFrom}T00:00:00Z`);
  const toTime = Date.parse(`${dateTo}T00:00:00Z`);
  return Math.floor((toTime - fromTime) / (24 * 60 * 60 * 1000)) + 1;
}

function enumerateDates(dateFrom: string, dateTo: string) {
  const dates: string[] = [];
  let cursor = new Date(`${dateFrom}T00:00:00Z`);
  const end = new Date(`${dateTo}T00:00:00Z`);

  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return dates;
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
    const body = await request.json().catch(() => ({}));
    const dateFrom = normalizeDate(body?.dateFrom);
    const dateTo = normalizeDate(body?.dateTo);

    if (!dateFrom || !dateTo || dateFrom > dateTo) {
      return NextResponse.json(
        { error: 'dateFrom and dateTo must be valid ISO dates, and dateFrom must be less than or equal to dateTo' },
        { status: 400 }
      );
    }

    const requestedDays = diffDaysInclusive(dateFrom, dateTo);
    if (requestedDays > MAX_BACKFILL_DAYS_PER_REQUEST) {
      return NextResponse.json(
        { error: `Backfill requests are limited to ${MAX_BACKFILL_DAYS_PER_REQUEST} days per call` },
        { status: 400 }
      );
    }

    const { admin, supportedCurrencies } = await loadSupportedCurrencies();
    const provider = getExchangeRateProvider();

    const { data: transactionRows, error: transactionsError } = await admin
      .from('transactions')
      .select('transaction_date, currency')
      .gte('transaction_date', dateFrom)
      .lte('transaction_date', dateTo)
      .order('transaction_date', { ascending: true });

    if (transactionsError) {
      throw transactionsError;
    }

    const distinctTransactionDates = Array.from(
      new Set(
        (transactionRows || [])
          .map((row) => (typeof row.transaction_date === 'string' ? row.transaction_date : ''))
          .filter(Boolean)
      )
    );

    const datesToCheck = distinctTransactionDates.length > 0
      ? distinctTransactionDates
      : enumerateDates(dateFrom, dateTo);

    const results: Array<{
      date: string;
      action: 'skipped_exact' | 'fetched' | 'failed';
      lookupModeBefore: string;
      snapshotId?: string | null;
      error?: string;
    }> = [];

    for (const rateDate of datesToCheck) {
      const existing = await getHistoricalExchangeRateSnapshotForDate(admin, rateDate);
      if (existing.snapshot && existing.lookupMode === 'exact') {
        results.push({
          date: rateDate,
          action: 'skipped_exact',
          lookupModeBefore: existing.lookupMode,
          snapshotId: existing.snapshot.id,
        });
        continue;
      }

      try {
        const synced = await syncHistoricalExchangeRatesForDate({
          client: admin,
          provider,
          supportedCurrencies,
          rateDate,
        });

        results.push({
          date: rateDate,
          action: synced.skipped ? 'skipped_exact' : 'fetched',
          lookupModeBefore: existing.lookupMode,
          snapshotId: synced.snapshotId,
        });
      } catch (error) {
        results.push({
          date: rateDate,
          action: 'failed',
          lookupModeBefore: existing.lookupMode,
          error: error instanceof Error ? error.message : 'Historical backfill failed',
        });
      }
    }

    return NextResponse.json({
      success: results.every((result) => result.action !== 'failed'),
      provider: provider.name,
      dateFrom,
      dateTo,
      requestedTransactionDates: datesToCheck,
      fetchedCount: results.filter((result) => result.action === 'fetched').length,
      skippedExactCount: results.filter((result) => result.action === 'skipped_exact').length,
      failedCount: results.filter((result) => result.action === 'failed').length,
      results,
    });
  } catch (error) {
    console.error('[exchange-rates/backfill] failed', {
      message: error instanceof Error ? error.message : 'Unknown exchange-rate backfill error',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Exchange-rate historical backfill failed',
      },
      { status: 500 }
    );
  }
}
