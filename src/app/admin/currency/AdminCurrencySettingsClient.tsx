'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, CalendarClock, Check, Loader2, RefreshCw, Save, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import CurrencyOptionRow from '@/components/currency/CurrencyOptionRow';
import CurrencySymbol from '@/components/currency/CurrencySymbol';
import SearchField from '@/components/ui/SearchField';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { savePlatformSettings } from '@/lib/finance';
import {
  buildCountriesByCurrency,
  compareCurrenciesByName,
  getFeaturedCurrencies,
  getNextFeaturedSortOrder,
  getRemainingCurrencies,
  getSelectableActiveCurrencies,
} from '@/lib/reference-data/collections';
import { createClient } from '@/lib/supabase/client';
import type {
  CountryCurrencyReference,
  CountryReference,
  CurrencyReference,
} from '@/lib/reference-data/types';

type CurrencyFilter = 'all' | 'active' | 'inactive' | 'featured';
type AdminCurrencyTab = 'settings' | 'exchangeRateUpdates';

type ExchangeRateRunStatus = 'success' | 'failed' | 'running';
type ExchangeRateRunSyncType = 'latest' | 'historical' | null;

type ExchangeRateStatusHistoryEntry = {
  id: string;
  provider: string | null;
  sync_type: ExchangeRateRunSyncType;
  rate_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: ExchangeRateRunStatus;
  rate_count: number | null;
  error_message: string | null;
};

type ExchangeRateStatusSummaryPayload = {
  provider: string | null;
  baseCurrency: string | null;
  rateDate: string | null;
  fetchedAt: string | null;
  providerTimestamp: string | null;
  rateCount: number;
  freshness: 'fresh' | 'stale' | 'unavailable';
  stale: boolean;
  lastFailureMessage: string | null;
};

type ExchangeRateStatusResponse = {
  configured: boolean;
  summary: ExchangeRateStatusSummaryPayload | null;
  latestRun: ExchangeRateStatusHistoryEntry | null;
  history: ExchangeRateStatusHistoryEntry[];
  error?: string;
};

interface AdminCurrencySettingsClientProps {
  initialCurrencies: CurrencyReference[];
  initialCountries: CountryReference[];
  initialCountryCurrencies: CountryCurrencyReference[];
  initialDefaultCurrency: string;
}

function serializeCurrencies(currencies: CurrencyReference[]) {
  return JSON.stringify(
    [...currencies]
      .sort((left, right) => left.code.localeCompare(right.code))
      .map((currency) => ({
        code: currency.code,
        isActive: currency.isActive,
        isFeatured: currency.isFeatured,
        featuredSortOrder: currency.featuredSortOrder,
      }))
  );
}

function FilterChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-700 transition ${
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border bg-card text-muted-foreground hover:border-accent/30 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

function ToggleButton({
  checked,
  onClick,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition ${
        checked ? 'bg-accent' : 'bg-muted'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all ${
          checked ? 'start-5.5' : 'start-0.5'
        }`}
      />
    </button>
  );
}

function formatExchangeRateProviderName(provider: string | null | undefined) {
  const normalized = typeof provider === 'string' ? provider.trim().toLowerCase() : '';
  if (!normalized) {
    return '—';
  }

  if (normalized === 'open_exchange_rates') {
    return 'Open Exchange Rates';
  }

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatLocalizedDateTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function formatUtcDateTime(value: string | null | undefined) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

function formatLocalizedDateHeading(value: string | null | undefined, locale: string) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
  }).format(parsed);
}

function formatLocalizedTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat(locale, {
    timeStyle: 'short',
  }).format(parsed);
}

function formatRunDuration(startedAt: string | null | undefined, completedAt: string | null | undefined) {
  if (!startedAt || !completedAt) {
    return null;
  }

  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(completedAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function getRunStatusBadgeTone(status: ExchangeRateRunStatus | string | null | undefined) {
  switch (status) {
    case 'success':
      return 'success' as const;
    case 'failed':
      return 'error' as const;
    case 'running':
      return 'pending' as const;
    default:
      return 'info' as const;
  }
}

function groupExchangeRateHistoryByStartedDate(
  entries: ExchangeRateStatusHistoryEntry[],
  locale: string
) {
  const groups = new Map<string, ExchangeRateStatusHistoryEntry[]>();

  for (const row of entries) {
    const groupLabel = formatLocalizedDateHeading(row.started_at, locale);
    if (!groups.has(groupLabel)) {
      groups.set(groupLabel, []);
    }
    groups.get(groupLabel)?.push(row);
  }

  return Array.from(groups.entries()).map(([label, rows]) => ({
    label,
    rows,
  }));
}

export default function AdminCurrencySettingsClient({
  initialCurrencies,
  initialCountries,
  initialCountryCurrencies,
  initialDefaultCurrency,
}: AdminCurrencySettingsClientProps) {
  const { t, i18n } = useTranslation('portal');
  const router = useRouter();
  const [currencies, setCurrencies] = useState(initialCurrencies);
  const [defaultCurrency, setDefaultCurrency] = useState(initialDefaultCurrency);
  const [baselineCurrencies, setBaselineCurrencies] = useState(initialCurrencies);
  const [baselineDefaultCurrency, setBaselineDefaultCurrency] = useState(initialDefaultCurrency);
  const [search, setSearch] = useState('');
  const [defaultSearch, setDefaultSearch] = useState('');
  const [filter, setFilter] = useState<CurrencyFilter>('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');
  const [activeTab, setActiveTab] = useState<AdminCurrencyTab>('settings');
  const [exchangeRateStatus, setExchangeRateStatus] = useState<ExchangeRateStatusResponse | null>(null);
  const [exchangeRateStatusLoading, setExchangeRateStatusLoading] = useState(false);
  const [exchangeRateStatusRefreshing, setExchangeRateStatusRefreshing] = useState(false);
  const [exchangeRateStatusLoaded, setExchangeRateStatusLoaded] = useState(false);
  const locale = i18n.language || 'en';

  const currenciesByCode = useMemo(
    () => new Map(currencies.map((currency) => [currency.code, currency])),
    [currencies]
  );
  const countriesByCurrency = useMemo(
    () => buildCountriesByCurrency(initialCountries, initialCountryCurrencies),
    [initialCountries, initialCountryCurrencies]
  );
  const regionOptions = useMemo(
    () =>
      [...new Set(initialCountries.map((country) => country.region).filter(Boolean))]
        .sort((left, right) => (left ?? '').localeCompare(right ?? '')) as string[],
    [initialCountries]
  );

  const featuredCurrencies = useMemo(() => getFeaturedCurrencies(currencies), [currencies]);
  const remainingCurrencies = useMemo(() => getRemainingCurrencies(currencies), [currencies]);
  const activeCurrencies = useMemo(() => getSelectableActiveCurrencies(currencies), [currencies]);

  const featuredPreviewCurrencies = useMemo(
    () => featuredCurrencies.filter((currency) => currency.isActive),
    [featuredCurrencies]
  );

  const defaultSelectorCurrencies = useMemo(() => {
    const normalizedSearch = defaultSearch.trim().toLowerCase();
    return activeCurrencies.filter((currency) => {
      if (!normalizedSearch) return true;
      const countries = countriesByCurrency.get(currency.code) ?? [];
      const countryNames = countries.map((country) => country.name.toLowerCase());
      return (
        currency.code.toLowerCase().includes(normalizedSearch) ||
        currency.name.toLowerCase().includes(normalizedSearch) ||
        currency.symbol.toLowerCase().includes(normalizedSearch) ||
        currency.fallbackSymbol.toLowerCase().includes(normalizedSearch) ||
        countryNames.some((countryName) => countryName.includes(normalizedSearch))
      );
    });
  }, [activeCurrencies, countriesByCurrency, defaultSearch]);

  const filteredCurrencies = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...currencies]
      .sort(compareCurrenciesByName)
      .filter((currency) => {
        if (filter === 'active' && !currency.isActive) return false;
        if (filter === 'inactive' && currency.isActive) return false;
        if (filter === 'featured' && !currency.isFeatured) return false;

        const countries = countriesByCurrency.get(currency.code) ?? [];
        if (
          regionFilter !== 'all' &&
          !countries.some((country) => (country.region || 'Unspecified') === regionFilter)
        ) {
          return false;
        }

        if (!normalizedSearch) return true;

        return (
          currency.code.toLowerCase().includes(normalizedSearch) ||
          currency.name.toLowerCase().includes(normalizedSearch) ||
          currency.symbol.toLowerCase().includes(normalizedSearch) ||
          currency.fallbackSymbol.toLowerCase().includes(normalizedSearch) ||
          countries.some((country) => country.name.toLowerCase().includes(normalizedSearch))
        );
      });
  }, [countriesByCurrency, currencies, filter, regionFilter, search]);

  const hasUnsavedChanges =
    defaultCurrency !== baselineDefaultCurrency ||
    serializeCurrencies(currencies) !== serializeCurrencies(baselineCurrencies);

  const defaultCurrencyRecord = currenciesByCode.get(defaultCurrency) ?? null;

  const updateCurrency = (currencyCode: string, updater: (currency: CurrencyReference) => CurrencyReference) => {
    setCurrencies((current) =>
      current.map((currency) => (currency.code === currencyCode ? updater(currency) : currency))
    );
    setSaveState('idle');
  };

  const handleDefaultCurrencyChange = (currencyCode: string) => {
    const currency = currenciesByCode.get(currencyCode);
    if (!currency?.isActive) {
      toast.error('Only active currencies can be selected as the platform default.');
      return;
    }
    setDefaultCurrency(currencyCode);
    setSaveState('idle');
  };

  const handleActiveToggle = (currencyCode: string) => {
    const currency = currenciesByCode.get(currencyCode);
    if (!currency) return;

    if (currency.code === defaultCurrency && currency.isActive) {
      toast.error('Select another platform default before disabling this currency.');
      return;
    }

    updateCurrency(currencyCode, (current) => {
      const nextActive = !current.isActive;
      return {
        ...current,
        isActive: nextActive,
        isFeatured: nextActive ? current.isFeatured : false,
        featuredSortOrder: nextActive ? current.featuredSortOrder : 999,
      };
    });
  };

  const handleFeaturedToggle = (currencyCode: string) => {
    const currency = currenciesByCode.get(currencyCode);
    if (!currency) return;

    updateCurrency(currencyCode, (current) => {
      if (current.isFeatured) {
        return {
          ...current,
          isFeatured: false,
          featuredSortOrder: 999,
        };
      }

      return {
        ...current,
        isActive: true,
        isFeatured: true,
        featuredSortOrder: getNextFeaturedSortOrder(currencies.filter((entry) => entry.code !== current.code)),
      };
    });
  };

  const handleFeaturedOrderChange = (currencyCode: string, value: string) => {
    const parsedValue = Number.parseInt(value, 10);
    updateCurrency(currencyCode, (current) => ({
      ...current,
      isFeatured: true,
      isActive: true,
      featuredSortOrder: Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : current.featuredSortOrder,
    }));
  };

  const validateBeforeSave = () => {
    const featured = currencies
      .filter((currency) => currency.isFeatured)
      .sort((left, right) => left.featuredSortOrder - right.featuredSortOrder);
    const featuredOrders = featured.map((currency) => currency.featuredSortOrder);

    if (!defaultCurrencyRecord?.isActive) {
      return 'The platform default currency must remain active.';
    }

    if (featured.some((currency) => !currency.isActive)) {
      return 'Featured currencies must remain active.';
    }

    if (featuredOrders.some((order) => !Number.isInteger(order) || order < 1)) {
      return 'Every featured currency must use a positive featured order.';
    }

    if (new Set(featuredOrders).size !== featuredOrders.length) {
      return 'Featured currency order values must be unique.';
    }

    return null;
  };

  const handleSave = async () => {
    const validationError = validateBeforeSave();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const changedCurrencies = currencies.filter((currency) => {
      const baseline = baselineCurrencies.find((entry) => entry.code === currency.code);
      return (
        baseline &&
        (baseline.isActive !== currency.isActive ||
          baseline.isFeatured !== currency.isFeatured ||
          baseline.featuredSortOrder !== currency.featuredSortOrder)
      );
    });

    setIsSaving(true);

    try {
      const supabase = createClient();

      if (changedCurrencies.length > 0) {
        const updates = changedCurrencies.map((currency) =>
          supabase
            .from('currency_registry')
            .update({
              is_active: currency.isActive,
              is_featured: currency.isFeatured,
              featured_sort_order: currency.isFeatured ? currency.featuredSortOrder : 999,
            })
            .eq('code', currency.code)
        );

        const results = await Promise.all(updates);
        const failed = results.find((result) => result.error);
        if (failed?.error) throw failed.error;
      }

      if (defaultCurrency !== baselineDefaultCurrency) {
        await savePlatformSettings({ default_currency: defaultCurrency });
      }

      setBaselineCurrencies(currencies);
      setBaselineDefaultCurrency(defaultCurrency);
      setSaveState('saved');
      toast.success('Currency settings saved');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save currency settings');
    } finally {
      setIsSaving(false);
    }
  };

  const loadExchangeRateStatus = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') {
      setExchangeRateStatusRefreshing(true);
    } else {
      setExchangeRateStatusLoading(true);
    }

    try {
      const response = await fetch('/api/admin/exchange-rates/status', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });

      const payload = await response.json().catch(() => null) as ExchangeRateStatusResponse | null;
      if (!response.ok) {
        throw new Error(
          payload?.error
          || t('adminCurrency.exchangeRateUpdates.loadFailed', {
            defaultValue: 'Exchange-rate update history could not be loaded.',
          })
        );
      }

      setExchangeRateStatus({
        configured: Boolean(payload?.configured),
        summary: payload?.summary || null,
        latestRun: payload?.latestRun || null,
        history: Array.isArray(payload?.history) ? payload.history : [],
        error: payload?.error,
      });
    } catch (error) {
      setExchangeRateStatus((current) => current ? {
        ...current,
        error: error instanceof Error ? error.message : t('adminCurrency.exchangeRateUpdates.loadFailed', {
          defaultValue: 'Exchange-rate update history could not be loaded.',
        }),
      } : {
        configured: false,
        summary: null,
        latestRun: null,
        history: [],
        error: error instanceof Error ? error.message : t('adminCurrency.exchangeRateUpdates.loadFailed', {
          defaultValue: 'Exchange-rate update history could not be loaded.',
        }),
      });
    } finally {
      setExchangeRateStatusLoaded(true);
      setExchangeRateStatusLoading(false);
      setExchangeRateStatusRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab !== 'exchangeRateUpdates' || exchangeRateStatusLoaded || exchangeRateStatusLoading) {
      return;
    }

    void loadExchangeRateStatus();
  }, [activeTab, exchangeRateStatusLoaded, exchangeRateStatusLoading, loadExchangeRateStatus]);

  const dailyUpdateHistory = useMemo(
    () => (exchangeRateStatus?.history || []).filter((row) => row.sync_type === 'latest'),
    [exchangeRateStatus?.history]
  );
  const historicalBackfillHistory = useMemo(
    () => (exchangeRateStatus?.history || []).filter((row) => row.sync_type === 'historical'),
    [exchangeRateStatus?.history]
  );
  const legacyUpdateHistory = useMemo(
    () => (exchangeRateStatus?.history || []).filter((row) => !row.sync_type),
    [exchangeRateStatus?.history]
  );

  const groupedDailyUpdateHistory = useMemo(
    () => groupExchangeRateHistoryByStartedDate(dailyUpdateHistory, locale),
    [dailyUpdateHistory, locale]
  );
  const groupedHistoricalBackfillHistory = useMemo(
    () => groupExchangeRateHistoryByStartedDate(historicalBackfillHistory, locale),
    [historicalBackfillHistory, locale]
  );
  const groupedLegacyUpdateHistory = useMemo(
    () => groupExchangeRateHistoryByStartedDate(legacyUpdateHistory, locale),
    [legacyUpdateHistory, locale]
  );

  const latestDailyRun = exchangeRateStatus?.latestRun || null;
  const currentExchangeRateProvider = formatExchangeRateProviderName(
    exchangeRateStatus?.summary?.provider || latestDailyRun?.provider || null
  );
  const exchangeRateFreshnessTone = exchangeRateStatus?.summary?.freshness === 'fresh'
    ? 'success'
    : exchangeRateStatus?.summary?.freshness === 'stale'
      ? 'warning'
      : 'missing';
  const exchangeRateFreshnessLabel = exchangeRateStatus?.summary?.freshness === 'fresh'
    ? t('adminCurrency.exchangeRateUpdates.freshness.fresh', { defaultValue: 'Fresh' })
    : exchangeRateStatus?.summary?.freshness === 'stale'
      ? t('adminCurrency.exchangeRateUpdates.freshness.stale', { defaultValue: 'Stale' })
      : t('adminCurrency.exchangeRateUpdates.freshness.unavailable', { defaultValue: 'Unavailable' });
  const latestRunStatusLabel = latestDailyRun?.status === 'success'
    ? t('adminCurrency.exchangeRateUpdates.status.success', { defaultValue: 'Success' })
    : latestDailyRun?.status === 'failed'
      ? t('adminCurrency.exchangeRateUpdates.status.failed', { defaultValue: 'Failed' })
      : latestDailyRun?.status === 'running'
        ? t('adminCurrency.exchangeRateUpdates.status.running', { defaultValue: 'Running' })
        : t('adminCurrency.exchangeRateUpdates.status.unavailable', { defaultValue: 'Unavailable' });

  const pageHeaderBadge = activeTab === 'settings'
    ? (
        hasUnsavedChanges ? (
          <StatusBadge status="warning" label="Unsaved changes" />
        ) : saveState === 'saved' ? (
          <StatusBadge status="success" label="Saved" />
        ) : (
          <StatusBadge status="ready" label="Up to date" />
        )
      )
    : exchangeRateStatusLoading && !exchangeRateStatusLoaded ? (
        <StatusBadge
          status="pending"
          label={t('adminCurrency.exchangeRateUpdates.loadingBadge', {
            defaultValue: 'Loading status',
          })}
        />
      ) : (
        <StatusBadge
          status={getRunStatusBadgeTone(latestDailyRun?.status)}
          label={latestRunStatusLabel}
        />
      );

  const pageHeaderActions = activeTab === 'settings'
    ? (
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !hasUnsavedChanges}
          className="btn-primary w-full sm:w-auto"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : saveState === 'saved' ? <Check size={15} /> : <Save size={15} />}
          {saveState === 'saved' && !hasUnsavedChanges ? 'Saved' : 'Save Changes'}
        </button>
      )
    : (
        <button
          type="button"
          onClick={() => void loadExchangeRateStatus('refresh')}
          disabled={exchangeRateStatusLoading || exchangeRateStatusRefreshing}
          className="btn-secondary w-full sm:w-auto"
        >
          {exchangeRateStatusRefreshing ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {t('adminCurrency.exchangeRateUpdates.refreshingAction', {
                defaultValue: 'Refreshing...',
              })}
            </>
          ) : (
            <>
              <RefreshCw size={15} />
              {t('adminCurrency.exchangeRateUpdates.refreshAction', {
                defaultValue: 'Refresh status',
              })}
            </>
          )}
        </button>
      );

  const renderExchangeRateHistorySection = (
    groupedRows: Array<{ label: string; rows: ExchangeRateStatusHistoryEntry[] }>,
    args: {
      emptyTitle: string;
      emptyDescription: string;
      showHistoricalRateDate?: boolean;
      showLegacyLabel?: boolean;
    }
  ) => {
    if (exchangeRateStatusLoading && !exchangeRateStatus) {
      return (
        <div className="rounded-2xl border border-border px-4 py-6 text-sm text-muted-foreground">
          {t('adminCurrency.exchangeRateUpdates.loading', {
            defaultValue: 'Loading exchange-rate update status...',
          })}
        </div>
      );
    }

    if (exchangeRateStatus?.error && groupedRows.length === 0) {
      return (
        <EmptyState
          icon={CalendarClock}
          variant="compact"
          tone="neutral"
          title={t('adminCurrency.exchangeRateUpdates.loadFailedTitle', {
            defaultValue: 'Exchange-rate update history could not be loaded.',
          })}
          description={exchangeRateStatus.error}
          action={{
            label: t('adminCurrency.exchangeRateUpdates.refreshAction', {
              defaultValue: 'Refresh status',
            }),
            onClick: () => void loadExchangeRateStatus('refresh'),
          }}
        />
      );
    }

    if (groupedRows.length === 0) {
      return (
        <EmptyState
          icon={CalendarClock}
          variant="compact"
          tone="neutral"
          title={args.emptyTitle}
          description={args.emptyDescription}
        />
      );
    }

    return (
      <div className="space-y-5">
        {groupedRows.map((group) => (
          <div key={group.label} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-700 text-foreground">{group.label}</h3>
              <p className="text-xs text-muted-foreground">
                {t('adminCurrency.exchangeRateUpdates.rowCount', {
                  defaultValue: '{{count}} runs',
                  count: group.rows.length,
                })}
              </p>
            </div>
            <div className="space-y-3">
              {group.rows.map((row) => (
                <div key={row.id} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-700 text-foreground">
                          {formatLocalizedTime(row.started_at, locale)}
                        </p>
                        <span className="text-sm text-muted-foreground">-</span>
                        <p className="text-sm text-muted-foreground">
                          {formatExchangeRateProviderName(row.provider)}
                        </p>
                        {args.showLegacyLabel ? (
                          <StatusBadge
                            status="info"
                            label={t('adminCurrency.exchangeRateUpdates.legacyLabel', {
                              defaultValue: 'Legacy update',
                            })}
                          />
                        ) : null}
                        <StatusBadge
                          status={getRunStatusBadgeTone(row.status)}
                          label={
                            row.status === 'success'
                              ? t('adminCurrency.exchangeRateUpdates.status.success', { defaultValue: 'Success' })
                              : row.status === 'failed'
                                ? t('adminCurrency.exchangeRateUpdates.status.failed', { defaultValue: 'Failed' })
                                : t('adminCurrency.exchangeRateUpdates.status.running', { defaultValue: 'Running' })
                          }
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {args.showHistoricalRateDate ? (
                          <span>
                            {t('adminCurrency.exchangeRateUpdates.historicalRateDate', {
                              defaultValue: 'Historical rate date: {{value}}',
                              value: row.rate_date || '—',
                            })}
                          </span>
                        ) : row.rate_date ? (
                          <span>
                            {t('adminCurrency.exchangeRateUpdates.rateDateLabel', {
                              defaultValue: 'Rate date: {{value}}',
                              value: row.rate_date,
                            })}
                          </span>
                        ) : null}
                        <span>
                          {t('adminCurrency.exchangeRateUpdates.historyRateCount', {
                            defaultValue: '{{count}} rates',
                            count: row.rate_count || 0,
                          })}
                        </span>
                        {formatRunDuration(row.started_at, row.completed_at) ? (
                          <span>
                            {t('adminCurrency.exchangeRateUpdates.duration', {
                              defaultValue: 'Duration: {{value}}',
                              value: formatRunDuration(row.started_at, row.completed_at),
                            })}
                          </span>
                        ) : null}
                        <span>
                          {t('adminCurrency.exchangeRateUpdates.utcLabel', {
                            defaultValue: 'UTC {{value}}',
                            value: formatUtcDateTime(row.started_at),
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground lg:text-right">
                      <p>
                        {t('adminCurrency.exchangeRateUpdates.completedAt', {
                          defaultValue: 'Completed: {{value}}',
                          value: formatLocalizedDateTime(row.completed_at, locale),
                        })}
                      </p>
                    </div>
                  </div>

                  {row.status === 'failed' && row.error_message ? (
                    <div className="mt-3 rounded-xl border border-warning/30 bg-warning-soft/20 px-3 py-2 text-sm text-foreground">
                      {row.error_message}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const exchangeRateUpdatesContent = (
    <>
      <SectionCard
        title={t('adminCurrency.exchangeRateUpdates.summaryTitle', {
          defaultValue: 'Exchange Rate Summary',
        })}
        description={t('adminCurrency.exchangeRateUpdates.summaryDescription', {
          defaultValue: 'Review the latest successful snapshot, freshness, schedule, and the most recent synchronization result.',
        })}
      >
        {exchangeRateStatusLoading && !exchangeRateStatus ? (
          <div className="rounded-2xl border border-border px-4 py-6 text-sm text-muted-foreground">
            {t('adminCurrency.exchangeRateUpdates.loading', {
              defaultValue: 'Loading exchange-rate update status...',
            })}
          </div>
        ) : exchangeRateStatus?.error && !exchangeRateStatus?.summary && !exchangeRateStatus?.latestRun ? (
          <EmptyState
            icon={Activity}
            variant="compact"
            tone="neutral"
            title={t('adminCurrency.exchangeRateUpdates.loadFailedTitle', {
              defaultValue: 'Exchange-rate update history could not be loaded.',
            })}
            description={exchangeRateStatus.error}
            action={{
              label: t('adminCurrency.exchangeRateUpdates.refreshAction', {
                defaultValue: 'Refresh status',
              }),
              onClick: () => void loadExchangeRateStatus('refresh'),
            }}
          />
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.cards.provider', {
                    defaultValue: 'Provider',
                  })}
                </p>
                <p className="mt-2 text-sm font-700 text-foreground">{currentExchangeRateProvider}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {exchangeRateStatus?.summary?.baseCurrency
                    ? t('adminCurrency.exchangeRateUpdates.baseCurrency', {
                        defaultValue: 'Base currency: {{currency}}',
                        currency: exchangeRateStatus.summary.baseCurrency,
                      })
                    : t('adminCurrency.exchangeRateUpdates.unavailableShort', {
                        defaultValue: 'Unavailable',
                      })}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.cards.latestSuccessfulUpdate', {
                    defaultValue: 'Latest successful update',
                  })}
                </p>
                <p className="mt-2 text-sm font-700 text-foreground">
                  {formatLocalizedDateTime(exchangeRateStatus?.summary?.fetchedAt, locale)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.utcLabel', {
                    defaultValue: 'UTC {{value}}',
                    value: formatUtcDateTime(exchangeRateStatus?.summary?.fetchedAt),
                  })}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.cards.latestRateDate', {
                    defaultValue: 'Latest rate date',
                  })}
                </p>
                <p className="mt-2 text-sm font-700 text-foreground">
                  {exchangeRateStatus?.summary?.rateDate || '—'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.rateCount', {
                    defaultValue: '{{count}} rates stored',
                    count: exchangeRateStatus?.summary?.rateCount || 0,
                  })}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.cards.freshness', {
                    defaultValue: 'Freshness',
                  })}
                </p>
                <div className="mt-2">
                  <StatusBadge status={exchangeRateFreshnessTone} label={exchangeRateFreshnessLabel} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {exchangeRateStatus?.summary?.providerTimestamp
                    ? t('adminCurrency.exchangeRateUpdates.providerTimestamp', {
                        defaultValue: 'Provider timestamp: {{value}}',
                        value: formatLocalizedDateTime(exchangeRateStatus.summary.providerTimestamp, locale),
                      })
                    : t('adminCurrency.exchangeRateUpdates.providerTimestampUnavailable', {
                        defaultValue: 'Provider timestamp unavailable.',
                      })}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.cards.latestRunStatus', {
                    defaultValue: 'Latest run status',
                  })}
                </p>
                <div className="mt-2">
                  <StatusBadge
                    status={getRunStatusBadgeTone(latestDailyRun?.status)}
                    label={latestRunStatusLabel}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.lastStarted', {
                    defaultValue: 'Started: {{value}}',
                    value: formatLocalizedDateTime(latestDailyRun?.started_at, locale),
                  })}
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.cards.schedule', {
                    defaultValue: 'Active automatic schedule',
                  })}
                </p>
                <p className="mt-2 text-sm font-700 text-foreground">
                  {t('adminCurrency.exchangeRateUpdates.schedule.primary', {
                    defaultValue: '06:17 UAE',
                  })}
                </p>
                <p className="mt-1 text-sm font-700 text-foreground">
                  {t('adminCurrency.exchangeRateUpdates.schedule.secondary', {
                    defaultValue: '18:17 UAE',
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('adminCurrency.exchangeRateUpdates.schedule.helper', {
                    defaultValue: 'GitHub Actions runs twice daily at 02:17 and 14:17 UTC.',
                  })}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-sm font-700 text-foreground">
                {t('adminCurrency.exchangeRateUpdates.lastFailureTitle', {
                  defaultValue: 'Last failure',
                })}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {exchangeRateStatus?.summary?.lastFailureMessage || t('adminCurrency.exchangeRateUpdates.noFailures', {
                  defaultValue: 'No exchange-rate update failures have been recorded recently.',
                })}
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t('adminCurrency.exchangeRateUpdates.dailyUpdatesTitle', {
          defaultValue: 'Daily Updates',
        })}
        description={t('adminCurrency.exchangeRateUpdates.dailyUpdatesDescription', {
          defaultValue: 'Shows only normal latest snapshot synchronization runs from the last 30 days.',
        })}
      >
        {renderExchangeRateHistorySection(groupedDailyUpdateHistory, {
          emptyTitle: t('adminCurrency.exchangeRateUpdates.dailyUpdatesEmptyTitle', {
            defaultValue: 'No daily exchange-rate updates are available yet.',
          }),
          emptyDescription: t('adminCurrency.exchangeRateUpdates.dailyUpdatesEmptyDescription', {
            defaultValue: 'Twice-daily automatic snapshot updates will appear here once Smart Pocket records them.',
          }),
        })}
      </SectionCard>

      <SectionCard
        title={t('adminCurrency.exchangeRateUpdates.historicalBackfillTitle', {
          defaultValue: 'Historical Backfill',
        })}
        description={t('adminCurrency.exchangeRateUpdates.historicalBackfillDescription', {
          defaultValue: 'Shows historical catch-up runs separately from normal daily updates.',
        })}
      >
        {renderExchangeRateHistorySection(groupedHistoricalBackfillHistory, {
          emptyTitle: t('adminCurrency.exchangeRateUpdates.historicalBackfillEmptyTitle', {
            defaultValue: 'No historical backfill runs are available yet.',
          }),
          emptyDescription: t('adminCurrency.exchangeRateUpdates.historicalBackfillEmptyDescription', {
            defaultValue: 'Manual or automatic historical catch-up runs will appear here once Smart Pocket records them.',
          }),
          showHistoricalRateDate: true,
        })}
      </SectionCard>

      {groupedLegacyUpdateHistory.length > 0 ? (
        <SectionCard
          title={t('adminCurrency.exchangeRateUpdates.legacyUpdatesTitle', {
            defaultValue: 'Legacy Updates',
          })}
          description={t('adminCurrency.exchangeRateUpdates.legacyUpdatesDescription', {
            defaultValue: 'These older rows were recorded before Smart Pocket started classifying daily and historical runs.',
          })}
        >
          {renderExchangeRateHistorySection(groupedLegacyUpdateHistory, {
            emptyTitle: t('adminCurrency.exchangeRateUpdates.legacyUpdatesEmptyTitle', {
              defaultValue: 'No legacy exchange-rate updates are available.',
            }),
            emptyDescription: t('adminCurrency.exchangeRateUpdates.legacyUpdatesEmptyDescription', {
              defaultValue: 'Older pre-classification exchange-rate runs will appear here only when they exist in the last 30 days.',
            }),
            showLegacyLabel: true,
          })}
        </SectionCard>
      ) : null}
    </>
  );

  return (
    <div className="page-section gap-5 lg:gap-6">
      <PageHeader
        title={activeTab === 'settings'
          ? t('adminCurrency.currencySettings.title', {
              defaultValue: 'Currency Settings',
            })
          : t('adminCurrency.exchangeRateUpdates.title', {
              defaultValue: 'Exchange Rate Updates',
            })}
        description={activeTab === 'settings'
          ? t('adminCurrency.currencySettings.description', {
              defaultValue: 'Manage active currencies, featured order, selector previews, and the default platform currency from the global reference registry.',
            })
          : t('adminCurrency.exchangeRateUpdates.description', {
              defaultValue: 'Monitor Smart Pocket exchange-rate synchronization, freshness, and the last 30 days of update history.',
            })}
        badge={pageHeaderBadge}
        actions={pageHeaderActions}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`rounded-full border px-4 py-2 text-sm font-700 transition ${
            activeTab === 'settings'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-card text-muted-foreground hover:border-accent/30 hover:text-foreground'
          }`}
        >
          {t('adminCurrency.tabs.currencySettings', {
            defaultValue: 'Currency Settings',
          })}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('exchangeRateUpdates')}
          className={`rounded-full border px-4 py-2 text-sm font-700 transition ${
            activeTab === 'exchangeRateUpdates'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-card text-muted-foreground hover:border-accent/30 hover:text-foreground'
          }`}
        >
          {t('adminCurrency.tabs.exchangeRateUpdates', {
            defaultValue: 'Exchange Rate Updates',
          })}
        </button>
      </div>

      {activeTab === 'settings' ? (
      <>
      <SectionCard
        title="Default Platform Currency"
        description="Choose the active default used by platform settings. Featured currencies appear first, followed by all remaining active currencies in alphabetical order."
        action={
          defaultCurrencyRecord ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2">
              <CurrencySymbol currency={defaultCurrencyRecord} />
              <div className="text-left">
                <p className="text-sm font-700 text-foreground">{defaultCurrencyRecord.code}</p>
                <p className="text-xs text-muted-foreground">{defaultCurrencyRecord.name}</p>
              </div>
            </div>
          ) : null
        }
      >
        <div className="space-y-4">
          <SearchField
            value={defaultSearch}
            onChange={(event) => setDefaultSearch(event.target.value)}
            placeholder="Search active currencies by name, code, symbol, or country..."
          />

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              {featuredPreviewCurrencies.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Star size={14} className="text-accent" />
                    <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                      Featured Currencies
                    </p>
                  </div>
                  <div className="space-y-2">
                    {defaultSelectorCurrencies
                      .filter((currency) => currency.isFeatured)
                      .map((currency) => (
                        <CurrencyOptionRow
                          key={currency.code}
                          currency={currency}
                          countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                          showCountryCount
                          selected={currency.code === defaultCurrency}
                          onClick={() => handleDefaultCurrencyChange(currency.code)}
                        />
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  All Active Currencies
                </p>
                <div className="max-h-[28rem] space-y-2 overflow-y-auto pe-1">
                  {defaultSelectorCurrencies
                    .filter((currency) => !currency.isFeatured)
                    .map((currency) => (
                      <CurrencyOptionRow
                        key={currency.code}
                        currency={currency}
                        countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                        showCountryCount
                        selected={currency.code === defaultCurrency}
                        onClick={() => handleDefaultCurrencyChange(currency.code)}
                      />
                    ))}
                  {defaultSelectorCurrencies.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                      No active currencies match the current search.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-sm font-700 text-foreground">Default protection</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>The current default currency always stays active.</li>
                <li>Only active seeded currencies can be selected.</li>
                <li>Disabling the current default is blocked until another default is chosen.</li>
              </ul>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Featured Currencies"
        description="Feature currencies for future onboarding and settings selectors. Featured currencies stay active and are ordered by featured sort order."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            {featuredCurrencies.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                No featured currencies yet. Use the featured toggle below to pin currencies to the top of the selector.
              </div>
            ) : (
              featuredCurrencies.map((currency) => (
                <CurrencyOptionRow
                  key={currency.code}
                  currency={currency}
                  countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                  showCountryCount
                  showFeaturedBadge
                  trailing={
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                        Order
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={currency.featuredSortOrder}
                        onChange={(event) => handleFeaturedOrderChange(currency.code, event.target.value)}
                        className="input-base h-10 w-20 py-2 text-sm"
                      />
                    </div>
                  }
                />
              ))
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-700 text-foreground">Future selector preview</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Featured currencies appear first, then the rest of the active registry alphabetically with no duplicates.
            </p>
            <div className="mt-4 space-y-2">
              {featuredPreviewCurrencies.slice(0, 6).map((currency) => (
                <CurrencyOptionRow key={`preview-${currency.code}`} currency={currency} showFeaturedBadge />
              ))}
              {featuredPreviewCurrencies.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                  Featured currencies will preview here once you select them.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="All Currencies"
        description="Search and manage the seeded global currency registry. Country usage is derived from the normalized country-currency mapping."
      >
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto]">
            <SearchField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by currency name, code, symbol, or country..."
            />
            <select
              className="input-base"
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
            >
              <option value="all">All regions</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap items-center gap-2">
              <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>All</FilterChip>
              <FilterChip active={filter === 'active'} onClick={() => setFilter('active')}>Active</FilterChip>
              <FilterChip active={filter === 'inactive'} onClick={() => setFilter('inactive')}>Inactive</FilterChip>
              <FilterChip active={filter === 'featured'} onClick={() => setFilter('featured')}>Featured</FilterChip>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                  <th className="px-3 py-2">Currency</th>
                  <th className="px-3 py-2">Numeric</th>
                  <th className="px-3 py-2">Minor Units</th>
                  <th className="px-3 py-2">Countries</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Featured</th>
                  <th className="px-3 py-2">Featured Order</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredCurrencies.map((currency) => {
                  const usingCountries = countriesByCurrency.get(currency.code) ?? [];
                  const isDefault = currency.code === defaultCurrency;

                  return (
                    <tr key={currency.code} className="rounded-2xl bg-card shadow-card-sm">
                      <td className="rounded-s-2xl px-3 py-3">
                        <div className="flex min-w-[240px] items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted/70">
                            <CurrencySymbol currency={currency} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-700 text-foreground">{currency.code}</span>
                              {isDefault ? <StatusBadge status="ready" label="Default" /> : null}
                              {currency.isFeatured ? <StatusBadge status="info" label="Featured" /> : null}
                            </div>
                            <p className="truncate text-sm text-muted-foreground">{currency.name}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-foreground">{currency.numericCode || '—'}</td>
                      <td className="px-3 py-3 text-sm text-foreground">{currency.minorUnits}</td>
                      <td className="px-3 py-3">
                        <div className="max-w-[260px] text-sm text-muted-foreground">
                          <p className="font-600 text-foreground">{usingCountries.length} countries</p>
                          <p className="truncate">{usingCountries.map((country) => country.name).join(', ') || '—'}</p>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <ToggleButton
                          checked={currency.isActive}
                          onClick={() => handleActiveToggle(currency.code)}
                          ariaLabel={`${currency.isActive ? 'Disable' : 'Enable'} ${currency.code}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <ToggleButton
                          checked={currency.isFeatured}
                          onClick={() => handleFeaturedToggle(currency.code)}
                          ariaLabel={`${currency.isFeatured ? 'Unfeature' : 'Feature'} ${currency.code}`}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min={1}
                          value={currency.isFeatured ? currency.featuredSortOrder : ''}
                          onChange={(event) => handleFeaturedOrderChange(currency.code, event.target.value)}
                          disabled={!currency.isFeatured}
                          className="input-base h-10 w-24 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </td>
                      <td className="rounded-e-2xl px-3 py-3">
                        <StatusBadge
                          status={currency.isActive ? 'ready' : 'warning'}
                          label={currency.isActive ? 'Active' : 'Inactive'}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredCurrencies.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
              No currencies match the current filters.
            </div>
          ) : null}
        </div>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Selector Ordering"
          description="Featured currencies stay at the top. Remaining active currencies continue in alphabetical order without duplicating featured entries."
        >
          <div className="space-y-2">
            {featuredPreviewCurrencies.slice(0, 5).map((currency) => (
              <CurrencyOptionRow
                key={`ordered-${currency.code}`}
                currency={currency}
                countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                showCountryCount
                showFeaturedBadge
              />
            ))}
            {remainingCurrencies
              .filter((currency) => currency.isActive)
              .slice(0, 4)
              .map((currency) => (
                <CurrencyOptionRow
                  key={`remaining-${currency.code}`}
                  currency={currency}
                  countryCount={(countriesByCurrency.get(currency.code) ?? []).length}
                  showCountryCount
                />
              ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Administrative Rules"
          description="This page manages existing seeded currency records only."
        >
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>Featured currencies are forced to remain active.</li>
            <li>Inactive currencies are automatically unfeatured.</li>
            <li>Featured orders must be unique positive integers.</li>
            <li>Only records already present in the registry can be managed here.</li>
          </ul>
        </SectionCard>
      </div>
      </>
      ) : exchangeRateUpdatesContent}
    </div>
  );
}
