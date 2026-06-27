import { formatCurrencyValue } from '@/lib/currency-formatting';
import type { CurrencyReference } from '@/lib/reference-data/types';

export const PLATFORM_BILLING_CURRENCY_CODE = 'USD';

export function getPlatformBillingCurrencyCode(_value?: unknown) {
  return PLATFORM_BILLING_CURRENCY_CODE;
}

export function formatPlatformBillingAmount(
  amount: number,
  options: {
    currencyCode?: string | null;
    currencies?: CurrencyReference[];
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  } = {}
) {
  return formatCurrencyValue(amount, {
    currencyCode: getPlatformBillingCurrencyCode(options.currencyCode),
    currencies: options.currencies,
    locale: options.locale,
    displayMode: 'symbol',
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits,
  }).text;
}
