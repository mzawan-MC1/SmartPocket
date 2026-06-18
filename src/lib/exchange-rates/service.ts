import type { SupabaseClient } from '@supabase/supabase-js';
import { getExchangeRateFreshness } from '@/lib/exchange-rates/conversion';
import type {
  ExchangeRateLookupResult,
  ExchangeRateProvider,
  ExchangeRateProviderSnapshot,
  ExchangeRateSnapshotRecord,
  ExchangeRateStatusSummary,
  ExchangeRateSyncRunRecord,
} from '@/lib/exchange-rates/types';

const MIN_REASONABLE_RATE_COUNT = 10;

type ExchangeRateQueryClient = Pick<SupabaseClient, 'from' | 'rpc'>;

function normalizeProviderId(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return normalized.length > 0 ? normalized : null;
}

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized.length === 3 ? normalized : null;
}

function normalizeRateDate(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function parseFiniteNumber(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseSnapshotRow(row: any): ExchangeRateSnapshotRecord {
  return {
    id: String(row.id),
    provider: normalizeProviderId(row.provider) || '',
    base_currency: String(row.base_currency),
    rate_date: String(row.rate_date),
    fetched_at: String(row.fetched_at),
    provider_timestamp: row.provider_timestamp ? String(row.provider_timestamp) : null,
    rates: (row.rates || {}) as Record<string, number>,
    is_latest: Boolean(row.is_latest),
    status: String(row.status || ''),
    created_at: String(row.created_at),
  };
}

function countRates(rates: Record<string, number>) {
  return Object.keys(rates || {}).length;
}

export function validateProviderSnapshot(
  snapshot: ExchangeRateProviderSnapshot,
  supportedCurrencies: Iterable<string>
) {
  const supportedCurrencySet = new Set(
    Array.from(supportedCurrencies)
      .map((currencyCode) => normalizeCurrencyCode(currencyCode))
      .filter((currencyCode): currencyCode is string => Boolean(currencyCode))
  );

  const baseCurrency = normalizeCurrencyCode(snapshot.baseCurrency);
  const provider = normalizeProviderId(snapshot.provider);
  const rateDate = normalizeRateDate(snapshot.rateDate);
  const fetchedAtMs = Date.parse(snapshot.fetchedAt);
  const providerTimestampMs = snapshot.providerTimestamp ? Date.parse(snapshot.providerTimestamp) : Number.NaN;

  if (!provider) {
    throw new Error('Exchange-rate snapshot provider is invalid');
  }
  if (!baseCurrency || !supportedCurrencySet.has(baseCurrency)) {
    throw new Error('Exchange-rate snapshot base currency is invalid');
  }
  if (!rateDate) {
    throw new Error('Exchange-rate snapshot date is invalid');
  }
  if (!Number.isFinite(fetchedAtMs)) {
    throw new Error('Exchange-rate snapshot fetched timestamp is invalid');
  }
  if (snapshot.providerTimestamp && !Number.isFinite(providerTimestampMs)) {
    throw new Error('Exchange-rate snapshot provider timestamp is invalid');
  }

  const normalizedRates: Record<string, number> = {};
  for (const [currencyCode, rawRate] of Object.entries(snapshot.rates || {})) {
    const normalizedCode = normalizeCurrencyCode(currencyCode);
    const rate = parseFiniteNumber(rawRate);
    if (!normalizedCode || !supportedCurrencySet.has(normalizedCode)) {
      continue;
    }
    if (rate === null || rate <= 0) {
      throw new Error(`Exchange-rate snapshot contains an invalid rate for ${currencyCode}`);
    }
    normalizedRates[normalizedCode] = rate;
  }

  normalizedRates[baseCurrency] = 1;

  if (countRates(normalizedRates) < MIN_REASONABLE_RATE_COUNT) {
    throw new Error('Exchange-rate snapshot contains too few valid rates');
  }

  return {
    ...snapshot,
    provider,
    baseCurrency,
    rateDate,
    rates: normalizedRates,
  };
}

export async function getLatestExchangeRateSnapshot(
  client: ExchangeRateQueryClient
): Promise<ExchangeRateSnapshotRecord | null> {
  const { data, error } = await client
    .from('exchange_rate_snapshots')
    .select('*')
    .eq('status', 'success')
    .eq('is_latest', true)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? parseSnapshotRow(data) : null;
}

export async function getHistoricalExchangeRateSnapshotForDate(
  client: ExchangeRateQueryClient,
  rateDate: string
): Promise<ExchangeRateLookupResult> {
  const normalizedDate = normalizeRateDate(rateDate);
  if (!normalizedDate) {
    return { snapshot: null, lookupMode: 'unavailable' };
  }

  const { data, error } = await client
    .from('exchange_rate_snapshots')
    .select('*')
    .eq('status', 'success')
    .lte('rate_date', normalizedDate)
    .order('rate_date', { ascending: false })
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return { snapshot: null, lookupMode: 'unavailable' };
  }

  const snapshot = parseSnapshotRow(data);
  return {
    snapshot,
    lookupMode: snapshot.rate_date === normalizedDate ? 'exact' : 'previous_available',
  };
}

export async function getExactExchangeRateSnapshotForDate(
  client: ExchangeRateQueryClient,
  args: {
    provider: string;
    rateDate: string;
  }
): Promise<ExchangeRateSnapshotRecord | null> {
  const provider = normalizeProviderId(args.provider);
  const normalizedDate = normalizeRateDate(args.rateDate);
  if (!provider || !normalizedDate) {
    return null;
  }

  const { data, error } = await client
    .from('exchange_rate_snapshots')
    .select('*')
    .eq('status', 'success')
    .eq('provider', provider)
    .eq('rate_date', normalizedDate)
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? parseSnapshotRow(data) : null;
}

export async function listHistoricalExchangeRateSnapshots(
  client: ExchangeRateQueryClient,
  throughDate: string
): Promise<ExchangeRateSnapshotRecord[]> {
  const normalizedDate = normalizeRateDate(throughDate);
  if (!normalizedDate) {
    return [];
  }

  const { data, error } = await client
    .from('exchange_rate_snapshots')
    .select('*')
    .eq('status', 'success')
    .lte('rate_date', normalizedDate)
    .order('rate_date', { ascending: true })
    .order('fetched_at', { ascending: true });

  if (error) {
    throw error;
  }

  return (data || []).map(parseSnapshotRow);
}

async function createExchangeRateSyncRun(client: ExchangeRateQueryClient, providerName: string) {
  const provider = normalizeProviderId(providerName);
  if (!provider) {
    throw new Error('Exchange-rate sync provider is invalid');
  }

  const { data, error } = await client
    .from('exchange_rate_sync_runs')
    .insert({
      provider,
      started_at: new Date().toISOString(),
      status: 'running',
      error_message: null,
      rate_count: null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to record exchange-rate sync start');
  }

  return String(data.id);
}

async function completeExchangeRateSyncRun(
  client: ExchangeRateQueryClient,
  args: {
    runId: string;
    status: 'success' | 'failed';
    rateCount: number;
    errorMessage: string | null;
  }
) {
  const { error } = await client
    .from('exchange_rate_sync_runs')
    .update({
      completed_at: new Date().toISOString(),
      status: args.status,
      rate_count: args.rateCount,
      error_message: args.errorMessage,
    })
    .eq('id', args.runId);

  if (error) {
    throw new Error('Failed to record exchange-rate sync completion');
  }
}

async function ensureLatestSnapshotPointer(
  client: ExchangeRateQueryClient,
  args: {
    provider: string;
    baseCurrency: string;
  }
) {
  const provider = normalizeProviderId(args.provider);
  const baseCurrency = normalizeCurrencyCode(args.baseCurrency);
  if (!provider || !baseCurrency) {
    throw new Error('Cannot update latest exchange-rate pointer with invalid identifiers');
  }

  const { data: newestSnapshot, error: newestSnapshotError } = await client
    .from('exchange_rate_snapshots')
    .select('id')
    .eq('status', 'success')
    .eq('provider', provider)
    .eq('base_currency', baseCurrency)
    .order('rate_date', { ascending: false })
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (newestSnapshotError) {
    throw newestSnapshotError;
  }

  if (!newestSnapshot?.id) {
    return null;
  }

  const { error: clearError } = await client
    .from('exchange_rate_snapshots')
    .update({ is_latest: false })
    .eq('provider', provider)
    .eq('base_currency', baseCurrency)
    .neq('id', newestSnapshot.id)
    .eq('is_latest', true);

  if (clearError) {
    throw clearError;
  }

  const { error: markError } = await client
    .from('exchange_rate_snapshots')
    .update({ is_latest: true })
    .eq('id', newestSnapshot.id);

  if (markError) {
    throw markError;
  }

  return String(newestSnapshot.id);
}

async function storeValidatedSnapshot(args: {
  client: ExchangeRateQueryClient;
  snapshot: ExchangeRateProviderSnapshot;
}) {
  const { data: rpcData, error: rpcError } = await args.client.rpc('exchange_rate_store_snapshot', {
    p_provider: args.snapshot.provider,
    p_base_currency: args.snapshot.baseCurrency,
    p_rate_date: args.snapshot.rateDate,
    p_fetched_at: args.snapshot.fetchedAt,
    p_provider_timestamp: args.snapshot.providerTimestamp,
    p_rates: args.snapshot.rates,
    p_status: 'success',
  });

  if (rpcError) {
    throw rpcError;
  }

  await ensureLatestSnapshotPointer(args.client, {
    provider: args.snapshot.provider,
    baseCurrency: args.snapshot.baseCurrency,
  });

  return typeof rpcData === 'string' ? rpcData : String(rpcData);
}

export async function getExchangeRateStatusSummary(
  client: ExchangeRateQueryClient
): Promise<ExchangeRateStatusSummary> {
  const [latestSnapshot, lastFailedRun] = await Promise.all([
    getLatestExchangeRateSnapshot(client),
    client
      .from('exchange_rate_sync_runs')
      .select('error_message, completed_at')
      .eq('status', 'failed')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (lastFailedRun.error) {
    throw lastFailedRun.error;
  }

  return {
    provider: latestSnapshot?.provider || null,
    baseCurrency: latestSnapshot?.base_currency || null,
    rateDate: latestSnapshot?.rate_date || null,
    fetchedAt: latestSnapshot?.fetched_at || null,
    providerTimestamp: latestSnapshot?.provider_timestamp || null,
    rateCount: latestSnapshot ? countRates(latestSnapshot.rates) : 0,
    freshness: getExchangeRateFreshness(latestSnapshot),
    stale: latestSnapshot ? getExchangeRateFreshness(latestSnapshot) !== 'fresh' : true,
    lastFailureMessage: lastFailedRun.data?.error_message || null,
  };
}

export async function syncExchangeRates(args: {
  client: ExchangeRateQueryClient;
  provider: ExchangeRateProvider;
  supportedCurrencies: string[];
}) {
  const runId = await createExchangeRateSyncRun(args.client, args.provider.name);

  try {
    const snapshot = validateProviderSnapshot(await args.provider.latestRates(), args.supportedCurrencies);
    const snapshotId = await storeValidatedSnapshot({
      client: args.client,
      snapshot,
    });

    const rateCount = countRates(snapshot.rates);
    await completeExchangeRateSyncRun(args.client, {
      runId,
      status: 'success',
      rateCount,
      errorMessage: null,
    });

    return {
      success: true,
      runId,
      snapshotId,
      provider: snapshot.provider,
      baseCurrency: snapshot.baseCurrency,
      rateDate: snapshot.rateDate,
      rateCount,
      providerTimestamp: snapshot.providerTimestamp,
      fetchedAt: snapshot.fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Exchange-rate sync failed';
    await completeExchangeRateSyncRun(args.client, {
      runId,
      status: 'failed',
      rateCount: 0,
      errorMessage: message,
    }).catch(() => undefined);
    throw error;
  }
}

export async function syncHistoricalExchangeRatesForDate(args: {
  client: ExchangeRateQueryClient;
  provider: ExchangeRateProvider;
  supportedCurrencies: string[];
  rateDate: string;
}) {
  const normalizedDate = normalizeRateDate(args.rateDate);
  if (!normalizedDate) {
    throw new Error('Historical exchange-rate date is invalid');
  }

  const existingSnapshot = await getExactExchangeRateSnapshotForDate(args.client, {
    provider: args.provider.name,
    rateDate: normalizedDate,
  });

  if (existingSnapshot) {
    return {
      success: true,
      skipped: true,
      runId: null,
      snapshotId: existingSnapshot.id,
      provider: existingSnapshot.provider,
      baseCurrency: existingSnapshot.base_currency,
      rateDate: existingSnapshot.rate_date,
      rateCount: countRates(existingSnapshot.rates),
      providerTimestamp: existingSnapshot.provider_timestamp,
      fetchedAt: existingSnapshot.fetched_at,
    };
  }

  const runId = await createExchangeRateSyncRun(args.client, args.provider.name);

  try {
    const snapshot = validateProviderSnapshot(
      await args.provider.historicalRates(normalizedDate),
      args.supportedCurrencies
    );

    if (snapshot.rateDate !== normalizedDate) {
      throw new Error(`Historical exchange-rate provider returned ${snapshot.rateDate} instead of ${normalizedDate}`);
    }

    const snapshotId = await storeValidatedSnapshot({
      client: args.client,
      snapshot,
    });
    const rateCount = countRates(snapshot.rates);

    await completeExchangeRateSyncRun(args.client, {
      runId,
      status: 'success',
      rateCount,
      errorMessage: null,
    });

    return {
      success: true,
      skipped: false,
      runId,
      snapshotId,
      provider: snapshot.provider,
      baseCurrency: snapshot.baseCurrency,
      rateDate: snapshot.rateDate,
      rateCount,
      providerTimestamp: snapshot.providerTimestamp,
      fetchedAt: snapshot.fetchedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Historical exchange-rate sync failed';
    await completeExchangeRateSyncRun(args.client, {
      runId,
      status: 'failed',
      rateCount: 0,
      errorMessage: message,
    }).catch(() => undefined);
    throw error;
  }
}
