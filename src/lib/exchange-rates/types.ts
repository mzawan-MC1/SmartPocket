export type ExchangeRateSyncStatus = 'success' | 'failed';

export type ExchangeRateFreshness = 'fresh' | 'stale' | 'unavailable';

export type ExchangeRateLookupMode =
  | 'exact'
  | 'previous_available'
  | 'latest'
  | 'same_currency'
  | 'unavailable';

export interface ExchangeRateProviderSnapshot {
  provider: string;
  baseCurrency: string;
  rateDate: string;
  fetchedAt: string;
  providerTimestamp: string | null;
  rates: Record<string, number>;
}

export interface ExchangeRateProviderHealth {
  provider: string;
  status: 'healthy' | 'degraded' | 'error';
  checkedAt: string;
  message: string | null;
}

export interface ExchangeRateProvider {
  readonly name: string;
  latestRates(): Promise<ExchangeRateProviderSnapshot>;
  historicalRates(rateDate: string): Promise<ExchangeRateProviderSnapshot>;
  healthcheck?(): Promise<ExchangeRateProviderHealth>;
}

export interface ExchangeRateSnapshotRecord {
  id: string;
  provider: string;
  base_currency: string;
  rate_date: string;
  fetched_at: string;
  provider_timestamp: string | null;
  rates: Record<string, number>;
  is_latest: boolean;
  status: string;
  created_at: string;
}

export interface ExchangeRateSyncRunRecord {
  id: string;
  provider: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  rate_count: number | null;
  error_message: string | null;
  created_at: string;
}

export interface ExchangeRateLookupResult {
  snapshot: ExchangeRateSnapshotRecord | null;
  lookupMode: ExchangeRateLookupMode;
}

export interface ExchangeRateConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  reportingCurrency: string;
  rateUsed: number;
  rateDate: string;
  provider: string;
  stale: boolean;
  freshness: ExchangeRateFreshness;
  lookupMode: ExchangeRateLookupMode;
  providerTimestamp: string | null;
  fetchedAt: string;
}

export interface ExchangeRateStatusSummary {
  provider: string | null;
  baseCurrency: string | null;
  rateDate: string | null;
  fetchedAt: string | null;
  providerTimestamp: string | null;
  rateCount: number;
  freshness: ExchangeRateFreshness;
  stale: boolean;
  lastFailureMessage: string | null;
}
