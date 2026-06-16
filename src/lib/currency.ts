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

export const CURRENCY_REGISTRY: Record<string, CurrencyConfig> = {
  AED: {
    code: 'AED',
    name: 'UAE Dirham',
    symbol: 'AED',
    decimals: 2,
    locale: 'en-AE',
    symbolPosition: 'before',
    symbolSpacing: true,
    useSymbol: false, // Use code 'AED' — official SVG symbol used separately
    svgAsset: '/currencies/aed-dirham-symbol.svg',
    active: true,
  },
  USD: {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    decimals: 2,
    locale: 'en-US',
    symbolPosition: 'before',
    symbolSpacing: false,
    useSymbol: true,
    active: true,
  },
  EUR: {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    decimals: 2,
    locale: 'de-DE',
    symbolPosition: 'before',
    symbolSpacing: false,
    useSymbol: true,
    active: true,
  },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    decimals: 2,
    locale: 'en-GB',
    symbolPosition: 'before',
    symbolSpacing: false,
    useSymbol: true,
    active: true,
  },
  SAR: {
    code: 'SAR',
    name: 'Saudi Riyal',
    symbol: '﷼',
    decimals: 2,
    locale: 'ar-SA',
    symbolPosition: 'before',
    symbolSpacing: true,
    useSymbol: true,
    active: true,
  },
  PKR: {
    code: 'PKR',
    name: 'Pakistani Rupee',
    symbol: '₨',
    decimals: 2,
    locale: 'ur-PK',
    symbolPosition: 'before',
    symbolSpacing: false,
    useSymbol: true,
    active: true,
  },
  INR: {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    decimals: 2,
    locale: 'en-IN',
    symbolPosition: 'before',
    symbolSpacing: false,
    useSymbol: true,
    active: true,
  },
  RUB: {
    code: 'RUB',
    name: 'Russian Ruble',
    symbol: '₽',
    decimals: 2,
    locale: 'ru-RU',
    symbolPosition: 'after',
    symbolSpacing: true,
    useSymbol: true,
    active: true,
  },
  CAD: {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'CA$',
    decimals: 2,
    locale: 'en-CA',
    symbolPosition: 'before',
    symbolSpacing: false,
    useSymbol: true,
    active: true,
  },
  AUD: {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    decimals: 2,
    locale: 'en-AU',
    symbolPosition: 'before',
    symbolSpacing: false,
    useSymbol: true,
    active: true,
  },
};

export interface FormatCurrencyOptions {
  showCode?: boolean;
  compact?: boolean;
  locale?: string;
}

/**
 * Format a monetary amount using the central currency registry.
 * For AED: displays "AED 1,250.00" (never symbol + code together).
 * For others: uses official symbol e.g. "$1,250.00", "€1,250.00".
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  locale?: string,
  options: FormatCurrencyOptions = {}
): string {
  const config = CURRENCY_REGISTRY[currencyCode];
  if (!config) {
    // Fallback: use Intl with the code
    return new Intl.NumberFormat(locale || 'en-US', {
      style: 'currency',
      currency: currencyCode,
    }).format(amount);
  }

  const effectiveLocale = locale || config.locale;
  const { compact } = options;

  // Format the number part
  const numberFormatter = new Intl.NumberFormat(effectiveLocale, {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
    notation: compact ? 'compact' : 'standard',
  });

  const formattedNumber = numberFormatter.format(Math.abs(amount));
  const sign = amount < 0 ? '-' : '';

  // AED: always use code, never symbol (official SVG rendered separately in UI)
  if (currencyCode === 'AED') {
    return `${sign}AED ${formattedNumber}`;
  }

  if (!config.useSymbol) {
    return `${sign}${currencyCode} ${formattedNumber}`;
  }

  const spacing = config.symbolSpacing ? ' ' : '';
  if (config.symbolPosition === 'before') {
    return `${sign}${config.symbol}${spacing}${formattedNumber}`;
  } else {
    return `${sign}${formattedNumber}${spacing}${config.symbol}`;
  }
}

/**
 * Get currency display info for selectors
 */
export function getCurrencyDisplayInfo(currencyCode: string) {
  const config = CURRENCY_REGISTRY[currencyCode];
  if (!config) return { symbol: currencyCode, code: currencyCode, name: currencyCode };
  return {
    symbol: currencyCode === 'AED' ? 'AED' : config.symbol,
    code: config.code,
    name: config.name,
    isAED: currencyCode === 'AED',
    svgAsset: config.svgAsset,
  };
}

export function getActiveCurrencies(): CurrencyConfig[] {
  return Object.values(CURRENCY_REGISTRY).filter((c) => c.active);
}
