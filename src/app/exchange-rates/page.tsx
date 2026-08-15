'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import SearchField from '@/components/ui/SearchField';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import CurrencySelector from '@/components/CurrencySelector';
import {
  RefreshCw,
  ArrowLeftRight,
  Search,
  Globe,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRightLeft,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { getLatestExchangeRateSnapshot } from '@/lib/exchange-rates/service';
import {
  convertWithSnapshot,
  getExchangeRateFreshness,
  ensureValidSnapshotRates,
} from '@/lib/exchange-rates/conversion';
import type {
  ExchangeRateSnapshotRecord,
  ExchangeRateFreshness,
} from '@/lib/exchange-rates/types';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';
import { toast } from 'sonner';

const POPULAR_CURRENCY_CODES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
  'CNY',
  'INR',
  'SGD',
  'HKD',
  'NZD',
  'SEK',
  'KRW',
  'NOK',
  'MXN',
  'BRL',
  'ZAR',
  'AED',
  'SAR',
  'TRY',
  'PLN',
  'THB',
  'MYR',
  'IDR',
  'PHP',
  'VND',
  'EGP',
  'NGN',
  'ARS',
  'COP',
  'CLP',
  'PEN',
  'UAH',
  'CZK',
  'HUF',
  'RON',
  'DKK',
  'ILS',
  'KWD',
  'QAR',
  'RUB',
];

function formatTimestamp(iso: string | null | undefined, locale: string) {
  if (!iso) return null;
  try {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

function freshnessBadge(freshness: ExchangeRateFreshness) {
  switch (freshness) {
    case 'fresh':
      return {
        tone: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
        icon: CheckCircle2,
        label: 'exchangeRates.status.fresh',
        fallback: 'Fresh',
      };
    case 'stale':
      return {
        tone: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
        icon: Clock,
        label: 'exchangeRates.status.stale',
        fallback: 'Stale',
      };
    default:
      return {
        tone: 'bg-rose-500/10 text-rose-700 border-rose-500/20',
        icon: AlertTriangle,
        label: 'exchangeRates.status.unavailable',
        fallback: 'Unavailable',
      };
  }
}

export default function ExchangeRatesPage() {
  const { t, i18n } = useTranslation(['portal', 'common']);
  const { language, isRTL } = useLanguage();
  const locale = i18n.resolvedLanguage || language || 'en';
  const { data: refData } = useClientReferenceData();
  const currencies = refData?.snapshot.currencies ?? [];

  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [snapshot, setSnapshot] = useState<ExchangeRateSnapshotRecord | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [fromCurrency, setFromCurrency] = useState<string>('');
  const [toCurrency, setToCurrency] = useState<string>('');
  const [amount, setAmount] = useState<string>('1');
  const [searchQuery, setSearchQuery] = useState('');

  const loadAccounts = useCallback(() => {
    let cancelled = false;
    setLoadingAccounts(true);
    void getAccounts({ activeOnly: true })
      .then((next) => {
        if (!cancelled) setAccounts(next);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadSnapshot = useCallback(() => {
    let cancelled = false;
    setLoadingSnapshot(true);
    setSnapshotError(null);
    const supabase = createClient();
    void getLatestExchangeRateSnapshot(supabase)
      .then((next) => {
        if (!cancelled) setSnapshot(next);
      })
      .catch((error) => {
        if (!cancelled) {
          setSnapshot(null);
          setSnapshotError(
            error instanceof Error
              ? error.message
              : t('exchangeRates.snapshotLoadError.fallback', {
                  defaultValue: 'Failed to load exchange rates.',
                })
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSnapshot(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    const cleanupAccounts = loadAccounts();
    const cleanupSnapshot = loadSnapshot();
    return () => {
      cleanupAccounts();
      cleanupSnapshot();
    };
  }, [loadAccounts, loadSnapshot]);

  const defaultCurrencyCode = useMemo(() => {
    const first = accounts[0];
    return (first?.currency || 'USD').toUpperCase();
  }, [accounts]);

  const snapshotBaseCurrency = snapshot?.base_currency || '';
  const availableRates = useMemo(
    () => (snapshot ? ensureValidSnapshotRates(snapshot) : {}),
    [snapshot]
  );
  const freshness: ExchangeRateFreshness = getExchangeRateFreshness(snapshot);

  useEffect(() => {
    if (defaultCurrencyCode && !fromCurrency) setFromCurrency(defaultCurrencyCode);
    if (!toCurrency) {
      const next = defaultCurrencyCode === 'USD' ? 'EUR' : 'USD';
      setToCurrency(next);
    }
  }, [defaultCurrencyCode, fromCurrency, toCurrency]);

  const numericAmount = Number(amount);
  const conversion = useMemo(() => {
    if (!snapshot) return null;
    const normalizedFrom = (fromCurrency || '').trim().toUpperCase();
    const normalizedTo = (toCurrency || '').trim().toUpperCase();
    if (!normalizedFrom || !normalizedTo) return null;
    if (!Number.isFinite(numericAmount) || numericAmount < 0) return null;
    try {
      return convertWithSnapshot({
        amount: numericAmount,
        fromCurrency: normalizedFrom,
        toCurrency: normalizedTo,
        snapshot,
      });
    } catch {
      return null;
    }
  }, [snapshot, fromCurrency, toCurrency, numericAmount]);

  const availableCurrencyCodes = useMemo(
    () => new Set(Object.keys(availableRates || {})),
    [availableRates]
  );

  const rateTableRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = POPULAR_CURRENCY_CODES.filter((code) => availableCurrencyCodes.has(code))
      .concat(
        Object.keys(availableRates).filter(
          (code) => !POPULAR_CURRENCY_CODES.includes(code) && code !== defaultCurrencyCode
        )
      )
      .filter((code, index, self) => self.indexOf(code) === index)
      .map((code) => {
        const currencyMeta = getCurrencyByCode(currencies, code);
        // compute effective rate from base → code, then convert to be relative to defaultCurrencyCode
        // defaultRate = 1 unit of default buys X units of code
        try {
          const converted = convertWithSnapshot({
            amount: 1,
            fromCurrency: defaultCurrencyCode,
            toCurrency: code,
            snapshot: snapshot!,
          });
          return {
            code,
            name: currencyMeta?.name || code,
            symbol: currencyMeta?.symbol || currencyMeta?.fallbackSymbol || code,
            rateAgainstDefault: converted.convertedAmount,
          };
        } catch {
          return null;
        }
      })
      .filter(
        (row): row is { code: string; name: string; symbol: string; rateAgainstDefault: number } =>
          Boolean(row)
      );

    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.code.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.symbol.toLowerCase().includes(q)
    );
  }, [snapshot, availableCurrencyCodes, defaultCurrencyCode, currencies, searchQuery]);

  const lastUpdated = snapshot?.provider_timestamp || snapshot?.fetched_at;

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  return (
    <AppLayout activeRoute="/exchange-rates" hideMobileFooter>
      <div className="page-section max-[480px]:gap-2.5">
        <PageHeader
          title={t('exchangeRates.title', { defaultValue: 'Exchange Rates' })}
          description={t('exchangeRates.description', {
            defaultValue:
              'Compare your default currency with other currencies using Smart Pocket exchange rates.',
          })}
          badge={
            <StatusBadge
              status="info"
              label={t('exchangeRates.badge', { defaultValue: 'Global Exchange' })}
            />
          }
          compact
          className="rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-3.5 py-3 shadow-card-sm max-[480px]:px-3.5 max-[480px]:py-3"
          actionsClassName="w-full sm:w-auto"
          actions={
            <div className="flex w-full sm:w-auto">
              <button
                onClick={() => {
                  const cleanup = loadSnapshot();
                  toast.success(
                    t('exchangeRates.refreshing', {
                      defaultValue: 'Checking for updated exchange rates…',
                    })
                  );
                  return cleanup;
                }}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[18px] bg-[linear-gradient(135deg,#06a6d8_0%,#1294ff_100%)] px-3.5 py-2.5 text-[14px] font-700 text-white shadow-[0_12px_24px_rgba(18,148,255,0.18)] transition-transform duration-150 hover:-translate-y-[1px] hover:brightness-105 sm:w-auto"
              >
                <RefreshCw size={16} />{' '}
                {t('exchangeRates.refreshButton', { defaultValue: 'Refresh rates' })}
              </button>
            </div>
          }
        />

        {/* Meta strip */}
        <div className="card-elevated grid grid-cols-1 gap-2.5 rounded-[18px] border border-border/80 bg-card p-3 sm:grid-cols-3 sm:gap-3 sm:p-3.5">
          <div className="rounded-[14px] border border-border/70 bg-muted/20 px-2.5 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-700 uppercase tracking-[0.08em] text-muted-foreground">
              <Globe size={11} />{' '}
              {t('exchangeRates.meta.defaultCurrency', { defaultValue: 'Default currency' })}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-800 font-tabular text-foreground">
                {defaultCurrencyCode}
              </span>
              {!loadingAccounts && defaultCurrencyCode ? (
                <span className="text-[11px] text-muted-foreground">
                  {getCurrencyByCode(currencies, defaultCurrencyCode)?.name || ''}
                </span>
              ) : null}
            </div>
          </div>
          <div className="rounded-[14px] border border-border/70 bg-muted/20 px-2.5 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-700 uppercase tracking-[0.08em] text-muted-foreground">
              <Clock size={11} />{' '}
              {t('exchangeRates.meta.lastUpdated', { defaultValue: 'Last updated' })}
            </div>
            {loadingSnapshot ? (
              <div className="h-5 w-32 animate-pulse rounded bg-muted" />
            ) : snapshot ? (
              <p className="truncate text-[13px] font-700 text-foreground">
                {formatTimestamp(lastUpdated, locale) ||
                  t('exchangeRates.meta.notYet', { defaultValue: 'Not yet' })}
              </p>
            ) : (
              <p className="text-[12px] font-700 text-muted-foreground">
                {t('exchangeRates.meta.unavailable', { defaultValue: 'Unavailable' })}
              </p>
            )}
          </div>
          <div className="rounded-[14px] border border-border/70 bg-muted/20 px-2.5 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-700 uppercase tracking-[0.08em] text-muted-foreground">
              {(function StatusIcon() {
                const meta = freshnessBadge(freshness);
                const Icon = meta.icon;
                return <Icon size={11} />;
              })()}
              {t('exchangeRates.meta.status', { defaultValue: 'Status' })}
            </div>
            {loadingSnapshot ? (
              <div className="h-5 w-24 animate-pulse rounded bg-muted" />
            ) : (
              (function StatusPill() {
                const meta = freshnessBadge(freshness);
                const Icon = meta.icon;
                return (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-700 ${meta.tone}`}
                  >
                    <Icon size={11} /> {t(meta.label, { defaultValue: meta.fallback })}
                  </span>
                );
              })()
            )}
          </div>
        </div>

        {/* Currency Converter */}
        <div className="card-elevated rounded-[20px] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.98)_100%)] p-3.5 shadow-card-sm max-[480px]:p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[14px] font-800 text-foreground">
                {t('exchangeRates.converter.title', { defaultValue: 'Currency converter' })}
              </h2>
              <p className="text-[11.5px] text-muted-foreground">
                {t('exchangeRates.converter.subtitle', {
                  defaultValue: 'Convert between currencies using the saved rates snapshot.',
                })}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[10.5px] font-700 text-muted-foreground">
              <ArrowLeftRight size={11} />{' '}
              {snapshot?.provider
                ? t('exchangeRates.converter.providerLabel', {
                    defaultValue: 'Provider: {{provider}}',
                    provider: snapshot.provider,
                  })
                : t('exchangeRates.converter.providerFallback', {
                    defaultValue: 'Global Exchange',
                  })}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-end">
            <div>
              <label className="mb-1.5 block text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('exchangeRates.converter.amountLabel', { defaultValue: 'Amount' })}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="input-base h-11 text-[15px] font-700 font-tabular"
                placeholder={t('exchangeRates.converter.amountPlaceholder', {
                  defaultValue: 'e.g. 100',
                })}
              />
            </div>
            <div>
              <CurrencySelector
                value={fromCurrency}
                onChange={setFromCurrency}
                label={t('exchangeRates.converter.fromLabel', { defaultValue: 'From' })}
                allowInactiveSelection
                className=""
              />
            </div>
            <div className="hidden md:flex md:justify-center md:pb-2">
              <button
                type="button"
                onClick={swapCurrencies}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/80 bg-card text-foreground transition-colors hover:border-accent hover:text-accent"
                aria-label={t('exchangeRates.converter.swapAria', {
                  defaultValue: 'Swap from and to currencies',
                })}
              >
                <ArrowRightLeft size={16} />
              </button>
            </div>
            <div>
              <CurrencySelector
                value={toCurrency}
                onChange={setToCurrency}
                label={t('exchangeRates.converter.toLabel', { defaultValue: 'To' })}
                allowInactiveSelection
                className=""
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('exchangeRates.converter.resultLabel', { defaultValue: 'Result' })}
              </label>
              <div className="input-base flex h-11 items-center overflow-hidden">
                {conversion ? (
                  <FormattedCurrencyAmount
                    amount={conversion.convertedAmount}
                    currencyCode={conversion.reportingCurrency}
                    className="text-[15px] font-800 font-tabular text-foreground"
                    showCode
                  />
                ) : loadingSnapshot ? (
                  <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                ) : (
                  <span className="text-[12px] font-700 text-muted-foreground">
                    {t('exchangeRates.converter.notAvailable', {
                      defaultValue: 'Not available',
                    })}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={swapCurrencies}
              className="btn-secondary h-11 md:hidden"
            >
              <ArrowRightLeft size={14} />{' '}
              {t('exchangeRates.converter.swap', { defaultValue: 'Swap' })}
            </button>
          </div>

          {conversion ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-card px-2 py-0.5">
                1 {conversion.originalCurrency} ={' '}
                <span className="font-700 text-foreground">
                  {conversion.rateUsed.toFixed(6)} {conversion.reportingCurrency}
                </span>
              </span>
              {conversion.providerTimestamp || conversion.fetchedAt ? (
                <span className="inline-flex items-center gap-1">
                  <Clock size={11} />
                  {formatTimestamp(conversion.providerTimestamp || conversion.fetchedAt, locale)}
                </span>
              ) : null}
              {conversion.stale ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-amber-700">
                  <AlertTriangle size={11} />{' '}
                  {t('exchangeRates.converter.staleNote', {
                    defaultValue: 'Rates may be out of date',
                  })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Rates table vs empty state */}
        <div className="space-y-2.5 max-[480px]:space-y-2.5 sm:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-700 text-foreground">
                {t('exchangeRates.table.title', { defaultValue: 'Popular rates' })}
              </h2>
              <p className="text-[11.5px] text-muted-foreground">
                {t('exchangeRates.table.subtitle', {
                  defaultValue: 'Rates against your default currency ({{code}}).',
                  code: defaultCurrencyCode,
                })}
              </p>
            </div>
            <div className="w-full sm:w-64">
              <SearchField
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('exchangeRates.table.searchPlaceholder', {
                  defaultValue: 'Search currency…',
                })}
              />
            </div>
          </div>

          {loadingSnapshot ? (
            <div className="card-elevated rounded-[20px] border border-border/80 p-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={`skel-rate-${i}`} className="space-y-2">
                    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          ) : !snapshot || Object.keys(availableRates).length === 0 ? (
            <div className="card-elevated rounded-[22px] border border-border/80 p-4 max-[480px]:p-3">
              <EmptyState
                icon={Globe}
                title={t('exchangeRates.empty.title', {
                  defaultValue: 'Exchange rates are unavailable',
                })}
                description={
                  snapshotError
                    ? snapshotError
                    : t('exchangeRates.empty.description', {
                        defaultValue:
                          'Smart Pocket could not load a recent exchange-rate snapshot. Ask your workspace admin to sync rates or refresh again later.',
                      })
                }
                variant="compact"
                tone="neutral"
                action={{
                  label: t('exchangeRates.empty.action', { defaultValue: 'Refresh rates' }),
                  onClick: () => {
                    const cleanup = loadSnapshot();
                    toast.success(
                      t('exchangeRates.refreshing', {
                        defaultValue: 'Checking for updated exchange rates…',
                      })
                    );
                    return cleanup;
                  },
                }}
              />
            </div>
          ) : rateTableRows.length === 0 ? (
            <div className="card-elevated rounded-[22px] border border-border/80 p-4 max-[480px]:p-3">
              <EmptyState
                icon={Search}
                title={t('exchangeRates.empty.searchTitle', {
                  defaultValue: 'No currencies match your search',
                })}
                description={t('exchangeRates.empty.searchDescription', {
                  defaultValue: 'Try a different code or currency name.',
                })}
                variant="compact"
                tone="neutral"
              />
            </div>
          ) : (
            <div className="card-elevated rounded-[20px] border border-border/80 overflow-hidden">
              <div className="hidden grid-cols-[auto_1fr_1fr_1fr] gap-2 border-b border-border/80 bg-muted/30 px-4 py-2.5 text-[10.5px] font-700 uppercase tracking-[0.05em] text-muted-foreground sm:grid">
                <div>
                  {t('exchangeRates.table.colCode', { defaultValue: 'Code' })}
                </div>
                <div>
                  {t('exchangeRates.table.colCurrency', { defaultValue: 'Currency' })}
                </div>
                <div className="text-right">
                  {t('exchangeRates.table.colRate', { defaultValue: '1 {{code}} buys', code: defaultCurrencyCode })}
                </div>
                <div className="text-right">
                  {t('exchangeRates.table.colInverse', { defaultValue: 'Inverse' })}
                </div>
              </div>
              <ul className="divide-y divide-border/60">
                {rateTableRows.slice(0, 50).map((row, idx) => (
                  <li
                    key={row.code}
                    className={`grid grid-cols-2 gap-2 px-3 py-3 transition-colors hover:bg-muted/20 sm:grid-cols-[auto_1fr_1fr_1fr] sm:items-center sm:gap-2 sm:px-4 sm:py-2.5 ${
                      idx % 2 === 1 ? 'bg-muted/[0.035]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-sky-500/12 to-indigo-500/10 text-sky-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                        <span className="text-[11px] font-800 tabular-nums tracking-tight">
                          {row.code.slice(0, 2)}
                        </span>
                      </div>
                      <div className="flex flex-col sm:hidden">
                        <span className="text-[13px] font-800 text-foreground leading-none">
                          {row.code}
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="hidden truncate text-[13px] font-700 text-foreground sm:block">
                        <span className="inline-flex mr-1.5 px-1.5 py-0.5 rounded-md bg-muted/40 text-[11.5px] font-800 tracking-tight tabular-nums text-muted-foreground">
                          {row.code}
                        </span>
                        {row.name}
                      </p>
                      <p className="truncate text-[11.5px] text-muted-foreground leading-tight sm:hidden">
                        {row.name}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[11px] font-700 uppercase tracking-[0.03em] text-muted-foreground/80 sm:hidden">
                        {t('exchangeRates.table.colRate', {
                          defaultValue: '1 {{code}} buys',
                          code: defaultCurrencyCode,
                        })}
                      </p>
                      <p className="text-[13.5px] font-800 font-tabular text-foreground">
                        <span className="text-foreground/95">{row.rateAgainstDefault.toFixed(4)}</span>
                        <span className="ml-1 text-[11.5px] font-700 text-muted-foreground">
                          {row.code}
                        </span>
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[11px] font-700 uppercase tracking-[0.03em] text-muted-foreground/80 sm:hidden">
                        {t('exchangeRates.table.colInverse', { defaultValue: 'Inverse' })}
                      </p>
                      <p className="rounded-md inline-flex sm:block px-0 sm:px-0 bg-transparent text-[12.5px] font-700 font-tabular text-muted-foreground">
                        <span className="sm:hidden mr-1 text-muted-foreground/80">1 {row.code} = </span>
                        <span className="sm:hidden">
                          {row.rateAgainstDefault > 0 ? (1 / row.rateAgainstDefault).toFixed(4) : '—'} {defaultCurrencyCode}
                        </span>
                        <span className="hidden sm:inline">
                          1 {row.code} ={' '}
                          {row.rateAgainstDefault > 0 ? (1 / row.rateAgainstDefault).toFixed(4) : '—'}{' '}
                          <span className="text-foreground/60">{defaultCurrencyCode}</span>
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              {rateTableRows.length > 50 ? (
                <div className="border-t border-border/70 bg-muted/20 px-4 py-2 text-[11px] font-600 text-muted-foreground">
                  {t('exchangeRates.table.truncatedHint', {
                    shown: 50,
                    total: rateTableRows.length,
                    defaultValue:
                      'Showing {{shown}} of {{total}} matches. Use the search field to narrow results.',
                  })}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
