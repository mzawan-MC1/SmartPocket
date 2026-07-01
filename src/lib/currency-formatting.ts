import type { CurrencyReference } from '@/lib/reference-data/types';
import { getCurrencyByCode, normalizeCurrencyCode } from '@/lib/reference-data/lookups';

export type CurrencyDisplayMode = 'auto' | 'symbol' | 'code';

export interface CurrencyFormattingOptions {
  currencyCode?: string | null;
  currencies?: CurrencyReference[];
  currency?: CurrencyReference | null;
  locale?: string;
  displayMode?: CurrencyDisplayMode;
  compact?: boolean;
  textOnly?: boolean;
  fallbackCurrencyCode?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export interface FormattedCurrencyResult {
  code: string;
  minorUnits: number;
  sign: '' | '-';
  numberText: string;
  text: string;
  token: string;
  usesCodeToken: boolean;
}

export function getRichCurrencyToken(
  currency: Pick<CurrencyReference, 'code' | 'symbol' | 'narrowSymbol' | 'fallbackSymbol' | 'symbolType'>
) {
  const fallbackSymbol = currency.fallbackSymbol?.trim() || '';
  const narrowSymbol = currency.narrowSymbol?.trim() || '';
  const symbol = currency.symbol?.trim() || '';

  if (currency.symbolType === 'asset') {
    return symbol || fallbackSymbol || currency.code;
  }

  if (fallbackSymbol && fallbackSymbol !== currency.code) {
    return fallbackSymbol;
  }

  if (narrowSymbol && narrowSymbol !== currency.code) {
    return narrowSymbol;
  }

  if (symbol && symbol !== currency.code) {
    return symbol;
  }

  return fallbackSymbol || symbol || currency.code;
}

function resolveCurrency(args: CurrencyFormattingOptions) {
  if (args.currency) {
    return args.currency;
  }

  const requestedCode = normalizeCurrencyCode(args.currencyCode);
  const fallbackCode = normalizeCurrencyCode(args.fallbackCurrencyCode) || 'USD';
  const currencies = args.currencies ?? [];

  return (
    getCurrencyByCode(currencies, requestedCode) ||
    getCurrencyByCode(currencies, fallbackCode) || {
      code: requestedCode || fallbackCode,
      numericCode: null,
      name: requestedCode || fallbackCode,
      nativeName: null,
      symbol: requestedCode || fallbackCode,
      narrowSymbol: null,
      fallbackSymbol: requestedCode || fallbackCode,
      symbolType: 'fallback' as const,
      symbolAssetPath: null,
      minorUnits: 2,
      isActive: true,
      isFeatured: false,
      featuredSortOrder: 999,
      sortOrder: 999,
    }
  );
}

function formatNumber(
  amount: number,
  locale: string | undefined,
  minorUnits: number,
  compact: boolean | undefined,
  minimumFractionDigits: number | undefined,
  maximumFractionDigits: number | undefined
) {
  const absoluteAmount = Math.abs(Number.isFinite(amount) ? amount : 0);
  const resolvedMinimumFractionDigits = Number.isInteger(minimumFractionDigits)
    ? Math.max(0, minimumFractionDigits ?? 0)
    : compact ? 0 : minorUnits;
  const resolvedMaximumFractionDigits = Number.isInteger(maximumFractionDigits)
    ? Math.max(resolvedMinimumFractionDigits, maximumFractionDigits ?? resolvedMinimumFractionDigits)
    : compact ? Math.min(Math.max(minorUnits, 0), 1) : minorUnits;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: resolvedMinimumFractionDigits,
    maximumFractionDigits: resolvedMaximumFractionDigits,
    notation: compact ? 'compact' : 'standard',
  }).format(absoluteAmount);
}

function pickDisplayToken(currency: CurrencyReference, options: CurrencyFormattingOptions) {
  if (options.textOnly || options.displayMode === 'code') {
    return { token: currency.code, usesCodeToken: true };
  }

  const preferredToken = getRichCurrencyToken(currency);
  const usesCodeToken = currency.symbolType === 'asset' ? false : preferredToken === currency.code;

  if (options.displayMode === 'symbol') {
    return { token: preferredToken, usesCodeToken };
  }

  if (usesCodeToken) {
    return { token: currency.code, usesCodeToken: true };
  }

  return { token: preferredToken, usesCodeToken: false };
}

function shouldUseSpacing(token: string, usesCodeToken: boolean) {
  if (usesCodeToken) return true;
  return /^[A-Z]{3,}$/.test(token);
}

export function formatCurrencyValue(
  amount: number,
  options: CurrencyFormattingOptions = {}
): FormattedCurrencyResult {
  const resolvedCurrency = resolveCurrency(options);
  const minorUnits = Number.isInteger(resolvedCurrency.minorUnits)
    ? Math.max(0, resolvedCurrency.minorUnits)
    : 2;
  const sign = amount < 0 ? '-' : '';
  const signText = sign ? '\u2212' : '';
  const numberText = formatNumber(
    amount,
    options.locale,
    minorUnits,
    options.compact,
    options.minimumFractionDigits,
    options.maximumFractionDigits
  );
  const { token, usesCodeToken } = pickDisplayToken(resolvedCurrency, options);
  const needsTokenSpacing = shouldUseSpacing(token, usesCodeToken);
  const signPrefix = signText
    ? needsTokenSpacing ? `${signText} ` : signText
    : '';
  const rawText = needsTokenSpacing
    ? `${signPrefix}${token} ${numberText}`.trim()
    : `${signPrefix}${token}${numberText}`;
  const text = `\u2066${rawText}\u2069`;

  return {
    code: resolvedCurrency.code,
    minorUnits,
    sign,
    numberText,
    text,
    token,
    usesCodeToken,
  };
}

export function formatCurrencyText(
  amount: number,
  options: CurrencyFormattingOptions = {}
) {
  return formatCurrencyValue(amount, {
    ...options,
    textOnly: true,
  }).text;
}

export function formatCurrencyNumberOnly(
  amount: number,
  options: CurrencyFormattingOptions = {}
) {
  return formatCurrencyValue(amount, options).numberText;
}
