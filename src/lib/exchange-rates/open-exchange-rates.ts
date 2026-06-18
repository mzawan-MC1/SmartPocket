import 'server-only';

import type {
  ExchangeRateProvider,
  ExchangeRateProviderHealth,
  ExchangeRateProviderSnapshot,
} from '@/lib/exchange-rates/types';

const OPEN_EXCHANGE_RATES_BASE_URL = 'https://openexchangerates.org/api';
const OPEN_EXCHANGE_RATES_TIMEOUT_MS = 10000;

type OpenExchangeRatesResponse = {
  disclaimer?: string;
  license?: string;
  timestamp?: number;
  base?: string;
  rates?: Record<string, number>;
};

function normalizeRateDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized.length === 3 ? normalized : null;
}

async function fetchJson(pathname: string, appId: string): Promise<OpenExchangeRatesResponse> {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), OPEN_EXCHANGE_RATES_TIMEOUT_MS);

  try {
    const url = new URL(pathname, OPEN_EXCHANGE_RATES_BASE_URL);
    url.searchParams.set('app_id', appId);

    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Open Exchange Rates request failed with status ${response.status}`);
    }

    return (await response.json()) as OpenExchangeRatesResponse;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function normalizeSnapshot(payload: OpenExchangeRatesResponse, fallbackRateDate?: string): ExchangeRateProviderSnapshot {
  const baseCurrency = normalizeCurrencyCode(payload.base);
  if (!baseCurrency) {
    throw new Error('Open Exchange Rates returned an invalid base currency');
  }

  const timestampMs = typeof payload.timestamp === 'number' && Number.isFinite(payload.timestamp)
    ? payload.timestamp * 1000
    : Date.now();
  const fetchedAt = new Date().toISOString();
  const providerTimestamp = new Date(timestampMs).toISOString();
  const rateDate = fallbackRateDate || normalizeRateDate(new Date(timestampMs));

  const normalizedRates: Record<string, number> = {};
  for (const [currencyCode, rate] of Object.entries(payload.rates || {})) {
    const normalizedCode = normalizeCurrencyCode(currencyCode);
    if (!normalizedCode || !Number.isFinite(rate) || rate <= 0) {
      continue;
    }
    normalizedRates[normalizedCode] = rate;
  }
  normalizedRates[baseCurrency] = 1;

  return {
    provider: 'open_exchange_rates',
    baseCurrency,
    rateDate,
    fetchedAt,
    providerTimestamp,
    rates: normalizedRates,
  };
}

export class OpenExchangeRatesProvider implements ExchangeRateProvider {
  readonly name = 'open_exchange_rates';

  private getAppId() {
    const appId = process.env.OPEN_EXCHANGE_RATES_APP_ID;
    if (!appId) {
      throw new Error('OPEN_EXCHANGE_RATES_APP_ID is not configured');
    }
    return appId;
  }

  async latestRates(): Promise<ExchangeRateProviderSnapshot> {
    const payload = await fetchJson('/latest.json', this.getAppId());
    return normalizeSnapshot(payload);
  }

  async historicalRates(rateDate: string): Promise<ExchangeRateProviderSnapshot> {
    const normalizedDate = rateDate.trim();
    const payload = await fetchJson(`/historical/${normalizedDate}.json`, this.getAppId());
    return normalizeSnapshot(payload, normalizedDate);
  }

  async healthcheck(): Promise<ExchangeRateProviderHealth> {
    try {
      const latest = await this.latestRates();
      return {
        provider: this.name,
        status: 'healthy',
        checkedAt: new Date().toISOString(),
        message: `Latest snapshot loaded for ${latest.rateDate}`,
      };
    } catch (error) {
      return {
        provider: this.name,
        status: 'error',
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Provider healthcheck failed',
      };
    }
  }
}
