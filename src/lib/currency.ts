import { formatCurrencyValue } from '@/lib/currency-formatting';

export interface CurrencyConfig {
  code: string;
  name: string;
  symbol: string;
  decimals: number;
  locale: string;
  symbolPosition: 'before' | 'after';
  symbolSpacing: boolean;
  useSymbol: boolean;
  svgAsset?: string;
  active: boolean;
}

// Deprecated compatibility surface. Runtime code should use the shared reference-data
// registry plus `src/lib/currency-formatting.ts` instead of a local hardcoded map.
export const CURRENCY_REGISTRY: Record<string, CurrencyConfig> = {};

export interface FormatCurrencyOptions {
  showCode?: boolean;
  compact?: boolean;
  locale?: string;
}

export function formatCurrency(
  amount: number,
  currencyCode: string,
  locale?: string,
  options: FormatCurrencyOptions = {}
): string {
  return formatCurrencyValue(amount, {
    currencyCode,
    fallbackCurrencyCode: currencyCode,
    locale,
    compact: options.compact,
    displayMode: options.showCode ? 'code' : 'auto',
  }).text;
}

export function getCurrencyDisplayInfo(currencyCode: string) {
  return {
    symbol: currencyCode,
    code: currencyCode,
    name: currencyCode,
    isAED: currencyCode === 'AED',
    svgAsset: null,
  };
}

export function getActiveCurrencies(): CurrencyConfig[] {
  return [];
}
