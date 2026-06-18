import 'server-only';

import type { ExchangeRateProvider } from '@/lib/exchange-rates/types';
import { OpenExchangeRatesProvider } from '@/lib/exchange-rates/open-exchange-rates';

export function getExchangeRateProvider(): ExchangeRateProvider {
  const providerName = (process.env.EXCHANGE_RATE_PROVIDER || 'open_exchange_rates').trim().toLowerCase();

  switch (providerName) {
    case 'open_exchange_rates':
      return new OpenExchangeRatesProvider();
    default:
      throw new Error(`Unsupported exchange-rate provider: ${providerName}`);
  }
}
