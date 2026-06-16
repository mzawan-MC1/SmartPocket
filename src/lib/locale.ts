/**
 * Locale-aware formatting utilities for Smart Pocket.
 * All dates stored in ISO format in DB; formatted only for display.
 */

export type AppLocale = 'en' | 'ar' | 'fr' | 'ru';

const LOCALE_MAP: Record<AppLocale, string> = {
  en: 'en-GB',
  ar: 'ar-AE',
  fr: 'fr-FR',
  ru: 'ru-RU',
};

export function getIntlLocale(lang: AppLocale | string): string {
  return LOCALE_MAP[lang as AppLocale] || 'en-GB';
}

/** Format a date as "15 June 2026" style */
export function formatDate(date: Date | string, lang: string = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const locale = getIntlLocale(lang as AppLocale);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** Format a date as short "15 Jun 2026" */
export function formatDateShort(date: Date | string, lang: string = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const locale = getIntlLocale(lang as AppLocale);
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/** Format time "14:30" or "2:30 PM" */
export function formatTime(date: Date | string, lang: string = 'en'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const locale = getIntlLocale(lang as AppLocale);
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Format a date range */
export function formatDateRange(start: Date | string, end: Date | string, lang: string = 'en'): string {
  return `${formatDateShort(start, lang)} – ${formatDateShort(end, lang)}`;
}

/** Format a plain number */
export function formatNumber(value: number, lang: string = 'en', decimals = 2): string {
  const locale = getIntlLocale(lang as AppLocale);
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format a percentage */
export function formatPercent(value: number, lang: string = 'en', decimals = 1): string {
  const locale = getIntlLocale(lang as AppLocale);
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/** Get month name */
export function getMonthName(month: number, lang: string = 'en', format: 'long' | 'short' = 'long'): string {
  const locale = getIntlLocale(lang as AppLocale);
  const date = new Date(2026, month - 1, 1);
  return new Intl.DateTimeFormat(locale, { month: format }).format(date);
}

/** Get all month names for a year */
export function getMonthNames(lang: string = 'en', format: 'long' | 'short' = 'short'): string[] {
  return Array.from({ length: 12 }, (_, i) => getMonthName(i + 1, lang, format));
}
