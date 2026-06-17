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
  compact: boolean | undefined
) {
  const absoluteAmount = Math.abs(Number.isFinite(amount) ? amount : 0);

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: compact ? 0 : minorUnits,
    maximumFractionDigits: compact ? Math.min(Math.max(minorUnits, 0), 1) : minorUnits,
    notation: compact ? 'compact' : 'standard',
  }).format(absoluteAmount);
}

function pickDisplayToken(currency: CurrencyReference, options: CurrencyFormattingOptions) {
  if (options.textOnly || options.displayMode === 'code') {
    return { token: currency.code, usesCodeToken: true };
  }

  const preferredToken =
    currency.fallbackSymbol?.trim() ||
    currency.narrowSymbol?.trim() ||
    currency.symbol?.trim() ||
    currency.code;

  if (options.displayMode === 'symbol') {
    return { token: preferredToken, usesCodeToken: preferredToken === currency.code };
  }

  if (preferredToken === currency.code) {
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
  const numberText = formatNumber(amount, options.locale, minorUnits, options.compact);
  const { token, usesCodeToken } = pickDisplayToken(resolvedCurrency, options);
  const text = shouldUseSpacing(token, usesCodeToken)
    ? `${sign}${token} ${numberText}`
    : `${sign}${token}${numberText}`;

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
    displayMode: 'code',
  }).text;
}

export function formatCurrencyNumberOnly(
  amount: number,
  options: CurrencyFormattingOptions = {}
) {
  return formatCurrencyValue(amount, options).numberText;
}
