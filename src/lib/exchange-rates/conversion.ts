import type {
  ExchangeRateConversionResult,
  ExchangeRateFreshness,
  ExchangeRateLookupMode,
  ExchangeRateSnapshotRecord,
} from '@/lib/exchange-rates/types';

export const EXCHANGE_RATE_FRESH_HOURS = 24;
export const EXCHANGE_RATE_STALE_HOURS = 48;

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized.length === 3 ? normalized : null;
}

function parseFiniteNumber(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function getExchangeRateFreshness(
  snapshot: Pick<ExchangeRateSnapshotRecord, 'fetched_at' | 'provider_timestamp'> | null | undefined,
  now = new Date()
): ExchangeRateFreshness {
  if (!snapshot) return 'unavailable';

  const timestamp = snapshot.provider_timestamp || snapshot.fetched_at;
  const timeValue = Date.parse(timestamp);
  if (!Number.isFinite(timeValue)) {
    return 'stale';
  }

  const ageMs = Math.max(0, now.getTime() - timeValue);
  if (ageMs <= EXCHANGE_RATE_FRESH_HOURS * 60 * 60 * 1000) {
    return 'fresh';
  }
  if (ageMs <= EXCHANGE_RATE_STALE_HOURS * 60 * 60 * 1000) {
    return 'stale';
  }
  return 'stale';
}

export function isExchangeRateStale(
  snapshot: Pick<ExchangeRateSnapshotRecord, 'fetched_at' | 'provider_timestamp'> | null | undefined,
  now = new Date()
) {
  return getExchangeRateFreshness(snapshot, now) !== 'fresh';
}

export function ensureValidSnapshotRates(snapshot: Pick<ExchangeRateSnapshotRecord, 'base_currency' | 'rates'>) {
  const baseCurrency = normalizeCurrencyCode(snapshot.base_currency);
  if (!baseCurrency) {
    throw new Error('Snapshot base currency is invalid');
  }

  const normalizedRates: Record<string, number> = {};
  for (const [currencyCode, rawRate] of Object.entries(snapshot.rates || {})) {
    const normalizedCode = normalizeCurrencyCode(currencyCode);
    const rate = parseFiniteNumber(rawRate);
    if (!normalizedCode || rate === null || rate <= 0) {
      continue;
    }
    normalizedRates[normalizedCode] = rate;
  }

  normalizedRates[baseCurrency] = 1;
  return normalizedRates;
}

function resolvePairRate(args: {
  rates: Record<string, number>;
  baseCurrency: string;
  fromCurrency: string;
  toCurrency: string;
}) {
  const { rates, baseCurrency, fromCurrency, toCurrency } = args;

  if (fromCurrency === toCurrency) {
    return 1;
  }

  if (fromCurrency === baseCurrency) {
    const toRate = rates[toCurrency];
    if (!Number.isFinite(toRate) || toRate <= 0) {
      throw new Error(`Missing rate for ${toCurrency}`);
    }
    return toRate;
  }

  if (toCurrency === baseCurrency) {
    const fromRate = rates[fromCurrency];
    if (!Number.isFinite(fromRate) || fromRate <= 0) {
      throw new Error(`Missing rate for ${fromCurrency}`);
    }
    return 1 / fromRate;
  }

  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (!Number.isFinite(fromRate) || fromRate <= 0) {
    throw new Error(`Missing rate for ${fromCurrency}`);
  }
  if (!Number.isFinite(toRate) || toRate <= 0) {
    throw new Error(`Missing rate for ${toCurrency}`);
  }

  const baseAmount = 1 / fromRate;
  return baseAmount * toRate;
}

export function convertWithSnapshot(args: {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  snapshot: ExchangeRateSnapshotRecord;
  lookupMode?: ExchangeRateLookupMode;
}): ExchangeRateConversionResult {
  const originalAmount = parseFiniteNumber(args.amount);
  if (originalAmount === null) {
    throw new Error('Amount must be a finite number');
  }

  const fromCurrency = normalizeCurrencyCode(args.fromCurrency);
  const toCurrency = normalizeCurrencyCode(args.toCurrency);
  const baseCurrency = normalizeCurrencyCode(args.snapshot.base_currency);

  if (!fromCurrency || !toCurrency || !baseCurrency) {
    throw new Error('Currency code is invalid');
  }

  const rates = ensureValidSnapshotRates(args.snapshot);
  const freshness = getExchangeRateFreshness(args.snapshot);
  const stale = freshness !== 'fresh';
  const lookupMode = args.lookupMode || (fromCurrency === toCurrency ? 'same_currency' : 'exact');

  if (fromCurrency === toCurrency) {
    return {
      originalAmount,
      originalCurrency: fromCurrency,
      convertedAmount: originalAmount,
      reportingCurrency: toCurrency,
      rateUsed: 1,
      rateDate: args.snapshot.rate_date,
      provider: args.snapshot.provider,
      stale,
      freshness,
      lookupMode,
      providerTimestamp: args.snapshot.provider_timestamp,
      fetchedAt: args.snapshot.fetched_at,
    };
  }

  const rateUsed = resolvePairRate({
    rates,
    baseCurrency,
    fromCurrency,
    toCurrency,
  });

  if (!Number.isFinite(rateUsed) || rateUsed <= 0) {
    throw new Error(`Pair rate ${fromCurrency}/${toCurrency} is invalid`);
  }

  return {
    originalAmount,
    originalCurrency: fromCurrency,
    convertedAmount: originalAmount * rateUsed,
    reportingCurrency: toCurrency,
    rateUsed,
    rateDate: args.snapshot.rate_date,
    provider: args.snapshot.provider,
    stale,
    freshness,
    lookupMode,
    providerTimestamp: args.snapshot.provider_timestamp,
    fetchedAt: args.snapshot.fetched_at,
  };
}
