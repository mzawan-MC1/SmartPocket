'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  BellRing,
  Calendar,
  Loader2,
  Package2,
  RefreshCw,
  Repeat,
  ShoppingBag,
  Store,
  TrendingUp,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import RecurringTransactionForm from '@/app/recurring/components/RecurringTransactionForm';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import {
  createOrUpdateItemIdentity,
  mergeItemIdentity,
  normalizeReceiptItemName,
  type ItemIdentityOption,
  type ItemInsightsSnapshot,
  type RecurringPurchaseSuggestion,
} from '@/lib/transaction-item-insights';
import { createNotificationIfEnabled } from '@/lib/notifications';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';
import { translateSystemCategoryName } from '@/lib/system-category-display';

type ItemInsightsApiResponse =
  | {
    success: true;
    snapshot: ItemInsightsSnapshot;
    identityOptions: ItemIdentityOption[];
  }
  | {
    success: false;
    errorMessage?: string;
  };

type FiltersState = {
  startDate: string;
  endDate: string;
  accountId: string;
  merchant: string;
  categoryId: string;
  item: string;
  currency: string;
};

function buildQueryString(filters: Partial<FiltersState>) {
  const searchParams = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key === 'item' ? 'item' : key, value);
    }
  });
  return searchParams.toString();
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return <div className="h-20 rounded-xl border border-dashed border-border bg-muted/20" />;
  }

  const width = 320;
  const height = 80;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / spread) * (height - 12) - 6;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full overflow-visible rounded-xl border border-border bg-muted/20 p-2">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="text-accent"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CurrencyTotals({ rows }: { rows: Array<{ currency: string; total: number }> }) {
  return (
    <div className="space-y-1.5">
      {rows.map((row) => (
        <FormattedCurrencyAmount
          key={`${row.currency}-${row.total}`}
          amount={row.total}
          currencyCode={row.currency}
          className="text-lg font-800 text-foreground"
          showCode
        />
      ))}
    </div>
  );
}

function formatUiDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default function ItemInsightsScreen() {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const [filters, setFilters] = useState<FiltersState>({
    startDate: '',
    endDate: '',
    accountId: '',
    merchant: '',
    categoryId: '',
    item: '',
    currency: '',
  });
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [snapshot, setSnapshot] = useState<ItemInsightsSnapshot | null>(null);
  const [identityOptions, setIdentityOptions] = useState<ItemIdentityOption[]>([]);
  const [selectedItemName, setSelectedItemName] = useState<string | null>(null);
  const [selectedItemDetails, setSelectedItemDetails] = useState<ItemInsightsSnapshot | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [canonicalNameDraft, setCanonicalNameDraft] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<string[]>([]);
  const [recurringSuggestion, setRecurringSuggestion] = useState<RecurringPurchaseSuggestion | null>(null);

  const loadSnapshot = useCallback(async (nextFilters: Partial<FiltersState> = {}) => {
    const resolvedFilters = { ...filters, ...nextFilters };
    setLoading(true);
    setErrorMessage('');
    try {
      const response = await fetch(`/api/reports/item-insights?${buildQueryString(resolvedFilters)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as ItemInsightsApiResponse;
      if (!response.ok || !payload.success) {
        throw new Error('errorMessage' in payload ? payload.errorMessage : t('itemInsights.loadError', { ns: 'portal', defaultValue: 'Failed to load item insights.' }));
      }
      setSnapshot(payload.snapshot);
      setIdentityOptions(payload.identityOptions);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('itemInsights.loadError', { ns: 'portal', defaultValue: 'Failed to load item insights.' }));
    } finally {
      setLoading(false);
    }
  }, [filters, t]);

  const loadItemDetails = useCallback(async (itemName: string) => {
    setDetailsLoading(true);
    try {
      const response = await fetch(`/api/reports/item-insights?${buildQueryString({
        ...filters,
        item: itemName,
      })}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as ItemInsightsApiResponse;
      if (!response.ok || !payload.success) {
        throw new Error('errorMessage' in payload ? payload.errorMessage : t('itemInsights.loadError', { ns: 'portal', defaultValue: 'Failed to load item insights.' }));
      }
      setSelectedItemDetails(payload.snapshot);
      setCanonicalNameDraft(payload.snapshot.selectedItemHistory[0]?.itemName || itemName);
      setMergeTargetId('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('itemInsights.loadError', { ns: 'portal', defaultValue: 'Failed to load item insights.' }));
    } finally {
      setDetailsLoading(false);
    }
  }, [filters, t]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useSmartPocketDataChanged(['transactions', 'transaction_documents', 'dashboard', 'notifications'], 'ItemInsightsScreen', async () => {
    await loadSnapshot();
    if (selectedItemName) {
      await loadItemDetails(selectedItemName);
    }
  });

  useEffect(() => {
    if (selectedItemName) {
      void loadItemDetails(selectedItemName);
    }
  }, [selectedItemName, loadItemDetails]);

  const visibleRecurringSuggestions = useMemo(
    () => (snapshot?.recurringSuggestions || []).filter((suggestion) => !dismissedSuggestionIds.includes(suggestion.id)),
    [dismissedSuggestionIds, snapshot?.recurringSuggestions]
  );

  const selectedItemIdentity = useMemo(() => {
    const detailRow = selectedItemDetails?.rows[0];
    if (!detailRow) return null;
    return identityOptions.find((option) => option.id === detailRow.identityId) || null;
  }, [identityOptions, selectedItemDetails?.rows]);

  const selectedItemPriceValues = useMemo(
    () => selectedItemDetails?.selectedItemHistory.flatMap((history) => history.entries.map((entry) => entry.unitPrice || 0)).filter((value) => value > 0) || [],
    [selectedItemDetails?.selectedItemHistory]
  );

  const getLocalizedCategoryName = useCallback((name: string | null | undefined) => {
    if (!name) {
      return t('itemInsights.uncategorizedItem', { ns: 'portal' });
    }
    return translateSystemCategoryName(name, (key, options) =>
      t(key, { ...(options || {}), ns: 'common' })
    );
  }, [t]);

  const getRecurringSuggestionText = useCallback((suggestion: RecurringPurchaseSuggestion) => {
    const intervalDays = Math.round(suggestion.averageIntervalDays);
    if (suggestion.insightType === 'price_above_average') {
      return t('itemInsights.recurringInsights.priceAboveAverage', {
        ns: 'portal',
        days: intervalDays,
        percent: Math.round(suggestion.latestPriceVsAveragePct ?? 0),
      });
    }
    return t('itemInsights.recurringInsights.dueAgainSoon', {
      ns: 'portal',
      days: intervalDays,
    });
  }, [t]);

  const handleFilterChange = <K extends keyof FiltersState>(key: K, value: FiltersState[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const handleApplyFilters = async () => {
    await loadSnapshot(filters);
  };

  const handleResetFilters = async () => {
    const nextFilters: FiltersState = {
      startDate: '',
      endDate: '',
      accountId: '',
      merchant: '',
      categoryId: '',
      item: '',
      currency: '',
    };
    setFilters(nextFilters);
    await loadSnapshot(nextFilters);
  };

  const handleSaveIdentity = async () => {
    const fallbackItemName = selectedItemDetails?.selectedItemHistory[0]?.itemName || selectedItemName;
    if (!fallbackItemName) {
      return;
    }

    setSavingIdentity(true);
    try {
      await createOrUpdateItemIdentity({
        identityId: selectedItemIdentity?.id,
        canonicalName: canonicalNameDraft || fallbackItemName,
        aliases: [fallbackItemName, normalizeReceiptItemName(fallbackItemName)],
      });
      toast.success(t('itemInsights.identitySaved', { ns: 'portal', defaultValue: 'Item identity saved.' }));
      await loadSnapshot();
      if (selectedItemName) {
        await loadItemDetails(selectedItemName);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('itemInsights.identitySaveError', { ns: 'portal', defaultValue: 'Failed to save the item identity.' }));
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleMergeIdentity = async () => {
    if (!selectedItemName || !mergeTargetId) return;

    setSavingIdentity(true);
    try {
      if (selectedItemIdentity?.id) {
        await mergeItemIdentity({
          sourceIdentityId: selectedItemIdentity.id,
          targetIdentityId: mergeTargetId,
        });
      } else {
        await createOrUpdateItemIdentity({
          identityId: mergeTargetId,
          canonicalName: identityOptions.find((option) => option.id === mergeTargetId)?.canonicalName || selectedItemName,
          aliases: [selectedItemName],
        });
      }
      toast.success(t('itemInsights.identityMerged', { ns: 'portal', defaultValue: 'Item identity merged.' }));
      await loadSnapshot();
      await loadItemDetails(selectedItemName);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('itemInsights.identityMergeError', { ns: 'portal', defaultValue: 'Failed to merge the item identity.' }));
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleRemindMe = async (suggestion: RecurringPurchaseSuggestion) => {
    try {
      await createNotificationIfEnabled('recurring_purchase_due_alerts', {
        type: 'receipt_item_due_soon',
        title: t('itemInsights.remindNotificationTitle', { ns: 'portal', defaultValue: 'Receipt item due soon' }),
        message: `${suggestion.itemName} ${t('itemInsights.remindNotificationBody', {
          ns: 'portal',
          defaultValue: 'may be due again around',
        })} ${suggestion.nextLikelyPurchaseDate}.`,
        actionUrl: '/reports/item-insights',
        metadata: {
          item_name: suggestion.itemName,
          merchant: suggestion.merchant,
          next_due_date: suggestion.nextLikelyPurchaseDate,
        },
        sourceKey: `receipt-item-due:${suggestion.id}:${suggestion.nextLikelyPurchaseDate}`,
      });
      toast.success(t('itemInsights.reminderCreated', { ns: 'portal', defaultValue: 'Reminder added to in-app alerts.' }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('itemInsights.reminderError', { ns: 'portal', defaultValue: 'Failed to create the reminder.' }));
    }
  };

  const summaryTopSpend = snapshot?.topItemsBySpend[0] || null;
  const summaryTopFrequency = snapshot?.topItemsByFrequency[0] || null;
  const summaryTopPriceChange = snapshot?.recentPriceChanges[0] || null;

  return (
    <div className="page-section">
      <PageHeader
        title={t('itemInsights.title', { ns: 'portal', defaultValue: 'Item Insights' })}
        description={t('itemInsights.description', { ns: 'portal', defaultValue: 'Track item-level spending, price history, recurring buying patterns, and merchant intelligence from your saved receipts.' })}
        badge={<StatusBadge status="info" label={t('itemInsights.badge', { ns: 'portal', defaultValue: 'Receipt Intelligence' })} />}
        compact
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/reports" className="btn-secondary">
              <BarChart3 size={14} />
              {t('itemInsights.backToReports', { ns: 'portal', defaultValue: 'Back to Reports' })}
            </Link>
            <button type="button" onClick={() => void loadSnapshot()} className="btn-secondary">
              <RefreshCw size={14} />
              {t('actions.refresh', { ns: 'common', defaultValue: 'Refresh' })}
            </button>
          </div>
        }
      />

      <div className="card-elevated p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('reports.from', { ns: 'portal' })}</label>
            <input type="date" className="input-base" value={filters.startDate} onChange={(event) => handleFilterChange('startDate', event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('reports.to', { ns: 'portal' })}</label>
            <input type="date" className="input-base" value={filters.endDate} onChange={(event) => handleFilterChange('endDate', event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('reports.account', { ns: 'portal' })}</label>
            <select className="input-base" value={filters.accountId} onChange={(event) => handleFilterChange('accountId', event.target.value)}>
              <option value="">{t('reports.allAccounts', { ns: 'portal' })}</option>
              {(snapshot?.filterOptions.accounts || []).map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.currencyFilter', { ns: 'portal', defaultValue: 'Currency' })}</label>
            <select className="input-base" value={filters.currency} onChange={(event) => handleFilterChange('currency', event.target.value)}>
              <option value="">{t('itemInsights.allCurrencies', { ns: 'portal', defaultValue: 'All currencies' })}</option>
              {(snapshot?.filterOptions.currencies || []).map((currency) => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('transactions.merchantSource', { ns: 'portal' })}</label>
            <select className="input-base" value={filters.merchant} onChange={(event) => handleFilterChange('merchant', event.target.value)}>
              <option value="">{t('itemInsights.allMerchants', { ns: 'portal', defaultValue: 'All merchants' })}</option>
              {(snapshot?.filterOptions.merchants || []).map((merchant) => (
                <option key={merchant} value={merchant}>{merchant}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('categories.title', { ns: 'portal' })}</label>
            <select className="input-base" value={filters.categoryId} onChange={(event) => handleFilterChange('categoryId', event.target.value)}>
              <option value="">{t('itemInsights.allCategories', { ns: 'portal', defaultValue: 'All categories' })}</option>
              {(snapshot?.filterOptions.categories || []).map((category) => (
                <option key={category.id} value={category.id}>{getLocalizedCategoryName(category.name)}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.itemFilter', { ns: 'portal', defaultValue: 'Item' })}</label>
            <select className="input-base" value={filters.item} onChange={(event) => handleFilterChange('item', event.target.value)}>
              <option value="">{t('itemInsights.allItems', { ns: 'portal', defaultValue: 'All items' })}</option>
              {(snapshot?.filterOptions.items || []).map((item) => (
                <option key={`${item.normalizedItemName}:${item.itemName}`} value={item.itemName}>{item.itemName}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => void handleResetFilters()}>
            {t('actions.reset', { ns: 'common', defaultValue: 'Reset' })}
          </button>
          <button type="button" className="btn-primary" onClick={() => void handleApplyFilters()}>
            {t('reports.applyFilters', { ns: 'portal', defaultValue: 'Apply filters' })}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card-elevated flex min-h-[280px] items-center justify-center">
          <Loader2 size={22} className="animate-spin text-accent" />
        </div>
      ) : errorMessage ? (
        <div className="card-elevated p-5">
          <div className="rounded-2xl border border-warning/30 bg-warning-soft p-4">
            <p className="text-sm font-700 text-foreground">{t('itemInsights.loadFailedTitle', { ns: 'portal', defaultValue: 'Item insights are unavailable.' })}</p>
            <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
          </div>
        </div>
      ) : !snapshot || snapshot.rows.length === 0 ? (
        <div className="card-elevated p-6">
          <EmptyState
            icon={Package2}
            title={t('itemInsights.emptyTitle', { ns: 'portal', defaultValue: 'No receipt items match this filter.' })}
            description={t('itemInsights.emptyDescription', { ns: 'portal', defaultValue: 'Upload reviewed receipts to start tracking item-level spending and pricing.' })}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="card-elevated p-4">
              <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.totalItemSpending', { ns: 'portal', defaultValue: 'Total item-level spending' })}</p>
              <div className="mt-2">
                <CurrencyTotals rows={snapshot.totalsByCurrency} />
              </div>
            </div>
            <div className="card-elevated p-4">
              <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.mostPurchasedItem', { ns: 'portal', defaultValue: 'Most purchased item' })}</p>
              <p className="mt-2 text-lg font-800 text-foreground">{summaryTopFrequency?.itemName || '—'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{summaryTopFrequency ? `${summaryTopFrequency.purchaseCount} ${t('itemInsights.purchases', { ns: 'portal', defaultValue: 'purchases' })}` : '—'}</p>
            </div>
            <div className="card-elevated p-4">
              <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.highestSpendItem', { ns: 'portal', defaultValue: 'Highest-spend item' })}</p>
              <p className="mt-2 text-lg font-800 text-foreground">{summaryTopSpend?.itemName || '—'}</p>
              {summaryTopSpend ? (
                <FormattedCurrencyAmount amount={summaryTopSpend.totalSpent} currencyCode={summaryTopSpend.currency} className="mt-1 text-sm font-700 text-foreground" showCode />
              ) : <p className="mt-1 text-sm text-muted-foreground">—</p>}
            </div>
            <div className="card-elevated p-4">
              <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.recentPriceChange', { ns: 'portal', defaultValue: 'Recent price change' })}</p>
              <p className="mt-2 text-lg font-800 text-foreground">{summaryTopPriceChange?.itemName || '—'}</p>
              <p className={`mt-1 text-sm font-700 ${summaryTopPriceChange && summaryTopPriceChange.percentageChange >= 0 ? 'text-warning' : 'text-positive'}`}>
                {summaryTopPriceChange ? `${summaryTopPriceChange.percentageChange.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-7">
              <div className="card-elevated p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-800 text-foreground">{t('itemInsights.topSpendSection', { ns: 'portal', defaultValue: 'Highest-spend items' })}</h2>
                    <p className="text-sm text-muted-foreground">{t('itemInsights.topSpendDescription', { ns: 'portal', defaultValue: 'See which reviewed receipt items drive the most spend.' })}</p>
                  </div>
                  <ShoppingBag size={18} className="text-accent" />
                </div>
                <div className="space-y-3">
                  {snapshot.topItemsBySpend.slice(0, 8).map((item) => (
                    <button
                      key={`${item.normalizedItemName}:${item.currency}`}
                      type="button"
                      onClick={() => setSelectedItemName(item.itemName)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border p-3 text-left transition-colors hover:bg-muted/20"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-700 text-foreground">{item.itemName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.purchaseCount} {t('itemInsights.purchases', { ns: 'portal', defaultValue: 'purchases' })} · {item.merchants.slice(0, 2).join(', ') || t('itemInsights.unknownMerchant', { ns: 'portal', defaultValue: 'Unknown merchant' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <FormattedCurrencyAmount amount={item.totalSpent} currencyCode={item.currency} className="text-sm font-800 text-foreground" showCode />
                        {item.averageUnitPrice !== null ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t('itemInsights.avgPriceShort', { ns: 'portal', defaultValue: 'Avg' })}: {item.averageUnitPrice.toFixed(2)} {item.currency}
                          </p>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="card-elevated p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-800 text-foreground">{t('itemInsights.priceChangesSection', { ns: 'portal', defaultValue: 'Recent price changes' })}</h2>
                    <p className="text-sm text-muted-foreground">{t('itemInsights.priceChangesDescription', { ns: 'portal', defaultValue: 'Compare the latest price against the previous and average purchase price in the same currency.' })}</p>
                  </div>
                  <TrendingUp size={18} className="text-warning" />
                </div>
                <div className="space-y-3">
                  {snapshot.recentPriceChanges.slice(0, 6).map((change) => (
                    <div key={`${change.normalizedItemName}:${change.currency}`} className="rounded-2xl border border-border p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-700 text-foreground">{change.itemName}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{change.merchant || t('itemInsights.unknownMerchant', { ns: 'portal', defaultValue: 'Unknown merchant' })} · {formatUiDate(change.latestDate, locale) || change.latestDate}</p>
                        </div>
                        <p className={`text-sm font-800 ${change.percentageChange >= 0 ? 'text-warning' : 'text-positive'}`}>
                          {change.percentageChange.toFixed(1)}%
                        </p>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                        <div className="rounded-xl bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.latestPrice', { ns: 'portal', defaultValue: 'Latest price' })}</p>
                          <p className="mt-1 text-sm font-700 text-foreground">{change.latestPrice.toFixed(2)} {change.currency}</p>
                        </div>
                        <div className="rounded-xl bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.previousPrice', { ns: 'portal', defaultValue: 'Previous price' })}</p>
                          <p className="mt-1 text-sm font-700 text-foreground">{change.previousPrice.toFixed(2)} {change.currency}</p>
                        </div>
                        <div className="rounded-xl bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.averagePrice', { ns: 'portal', defaultValue: 'Average price' })}</p>
                          <p className="mt-1 text-sm font-700 text-foreground">{change.averagePrice.toFixed(2)} {change.currency}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-elevated p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-800 text-foreground">{t('itemInsights.recurringSection', { ns: 'portal', defaultValue: 'Recurring purchase recognition' })}</h2>
                    <p className="text-sm text-muted-foreground">{t('itemInsights.recurringDescription', { ns: 'portal', defaultValue: 'Suggestions are based on normalized item names, merchant patterns, intervals, quantity, and pricing.' })}</p>
                  </div>
                  <Repeat size={18} className="text-accent" />
                </div>
                <div className="space-y-3">
                  {visibleRecurringSuggestions.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
                      {t('itemInsights.noRecurringSuggestions', { ns: 'portal', defaultValue: 'No recurring purchase suggestions match the current filters.' })}
                    </div>
                  ) : visibleRecurringSuggestions.slice(0, 6).map((suggestion) => (
                    <div key={suggestion.id} className="rounded-2xl border border-border p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-700 text-foreground">{suggestion.itemName}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{getRecurringSuggestionText(suggestion)}</p>
                        </div>
                        {suggestion.dueSoon ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2.5 py-1 text-xs font-700 text-warning">
                            <Calendar size={12} />
                            {t('itemInsights.dueSoon', { ns: 'portal', defaultValue: 'Due soon' })}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <div className="rounded-xl bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.avgInterval', { ns: 'portal', defaultValue: 'Average interval' })}</p>
                          <p className="mt-1 text-sm font-700 text-foreground">{Math.round(suggestion.averageIntervalDays)} {t('itemInsights.days', { ns: 'portal', defaultValue: 'days' })}</p>
                        </div>
                        <div className="rounded-xl bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.lastPurchased', { ns: 'portal', defaultValue: 'Last purchased' })}</p>
                          <p className="mt-1 text-sm font-700 text-foreground">{formatUiDate(suggestion.lastPurchasedAt, locale) || suggestion.lastPurchasedAt}</p>
                        </div>
                        <div className="rounded-xl bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.nextLikely', { ns: 'portal', defaultValue: 'Next likely purchase' })}</p>
                          <p className="mt-1 text-sm font-700 text-foreground">{formatUiDate(suggestion.nextLikelyPurchaseDate, locale) || suggestion.nextLikelyPurchaseDate}</p>
                        </div>
                        <div className="rounded-xl bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.latestVsAverage', { ns: 'portal', defaultValue: 'Latest vs average' })}</p>
                          <p className={`mt-1 text-sm font-700 ${(suggestion.latestPriceVsAveragePct || 0) >= 0 ? 'text-warning' : 'text-positive'}`}>
                            {suggestion.latestPriceVsAveragePct === null ? '—' : `${suggestion.latestPriceVsAveragePct.toFixed(1)}%`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <button type="button" className="btn-secondary" onClick={() => setDismissedSuggestionIds((current) => [...current, suggestion.id])}>
                          {t('itemInsights.dismiss', { ns: 'portal', defaultValue: 'Dismiss' })}
                        </button>
                        <button type="button" className="btn-secondary" onClick={() => void handleRemindMe(suggestion)}>
                          <BellRing size={14} />
                          {t('itemInsights.remindMe', { ns: 'portal', defaultValue: 'Remind me' })}
                        </button>
                        <button type="button" className="btn-primary" onClick={() => setRecurringSuggestion(suggestion)}>
                          <Repeat size={14} />
                          {t('itemInsights.createRecurringSuggestion', { ns: 'portal', defaultValue: 'Create recurring suggestion' })}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4 xl:col-span-5">
              <div className="card-elevated p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-800 text-foreground">{t('itemInsights.categorySection', { ns: 'portal', defaultValue: 'Spending by item category' })}</h2>
                    <p className="text-sm text-muted-foreground">{t('itemInsights.categoryDescription', { ns: 'portal', defaultValue: 'Item-level categories stay under the same parent ledger transaction total.' })}</p>
                  </div>
                  <Package2 size={18} className="text-accent" />
                </div>
                <div className="space-y-3">
                  {snapshot.spendingByCategory.slice(0, 6).map((category) => (
                    <div key={`${category.currency}:${category.categoryId || category.categoryName}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-700 text-foreground">{getLocalizedCategoryName(category.categoryName)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{category.itemCount} {t('itemInsights.items', { ns: 'portal', defaultValue: 'items' })}</p>
                      </div>
                      <FormattedCurrencyAmount amount={category.totalSpent} currencyCode={category.currency} className="text-sm font-800 text-foreground" showCode />
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-elevated p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-800 text-foreground">{t('itemInsights.merchantSection', { ns: 'portal', defaultValue: 'Merchant insights' })}</h2>
                    <p className="text-sm text-muted-foreground">{t('itemInsights.merchantDescription', { ns: 'portal', defaultValue: 'Uses reviewed merchant values only, with spend, visit count, repeated items, and category mix.' })}</p>
                  </div>
                  <Store size={18} className="text-accent" />
                </div>
                <div className="space-y-3">
                  {snapshot.merchantInsights.slice(0, 5).map((merchant) => (
                    <div key={`${merchant.merchant}:${merchant.currency}`} className="rounded-2xl border border-border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-700 text-foreground">{merchant.merchant || t('itemInsights.unknownMerchant', { ns: 'portal', defaultValue: 'Unknown merchant' })}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{merchant.visitCount} {t('itemInsights.visits', { ns: 'portal', defaultValue: 'visits' })} · {formatUiDate(merchant.lastVisit, locale) || '—'}</p>
                        </div>
                        <FormattedCurrencyAmount amount={merchant.totalSpent} currencyCode={merchant.currency} className="text-sm font-800 text-foreground" showCode />
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div className="rounded-xl bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.avgReceiptValue', { ns: 'portal', defaultValue: 'Average receipt value' })}</p>
                          <p className="mt-1 text-sm font-700 text-foreground">{merchant.averageReceiptValue.toFixed(2)} {merchant.currency}</p>
                        </div>
                        <div className="rounded-xl bg-muted/20 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.mostPurchasedItems', { ns: 'portal', defaultValue: 'Most purchased items' })}</p>
                          <p className="mt-1 text-sm font-700 text-foreground">{merchant.mostPurchasedItems.slice(0, 2).map((item) => item.itemName).join(', ') || '—'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-elevated p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-800 text-foreground">{t('itemInsights.smartAlertsSection', { ns: 'portal', defaultValue: 'Smart alerts' })}</h2>
                    <p className="text-sm text-muted-foreground">{t('itemInsights.smartAlertsDescription', { ns: 'portal', defaultValue: 'Conservative in-app receipt alerts use your existing settings and never send email or push notifications.' })}</p>
                  </div>
                  <AlertTriangle size={18} className="text-warning" />
                </div>
                <div className="space-y-3">
                  {snapshot.recentPriceChanges.slice(0, 2).map((change) => (
                    <div key={`alert:${change.normalizedItemName}:${change.currency}`} className="rounded-2xl border border-warning/30 bg-warning-soft/20 p-3">
                      <p className="text-sm font-700 text-foreground">{change.itemName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('itemInsights.alertPriceIncrease', {
                          ns: 'portal',
                          defaultValue: 'The latest price is {{percent}}% higher than the previous purchase.',
                          percent: Math.round(change.percentageChange),
                        })}
                      </p>
                    </div>
                  ))}
                  {visibleRecurringSuggestions.slice(0, 1).map((suggestion) => (
                    <div key={`alert-due:${suggestion.id}`} className="rounded-2xl border border-info/30 bg-info-soft/20 p-3">
                      <p className="text-sm font-700 text-foreground">{suggestion.itemName}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('itemInsights.alertDueSoon', {
                          ns: 'portal',
                          defaultValue: 'You usually buy this every {{days}} days and it may be due again soon.',
                          days: Math.round(suggestion.averageIntervalDays),
                        })}
                      </p>
                    </div>
                  ))}
                  <Link href="/settings" className="btn-secondary w-full justify-center">
                    {t('itemInsights.manageAlerts', { ns: 'portal', defaultValue: 'Manage alert settings' })}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <Modal
        isOpen={!!selectedItemName}
        onClose={() => {
          setSelectedItemName(null);
          setSelectedItemDetails(null);
          setCanonicalNameDraft('');
          setMergeTargetId('');
        }}
        title={selectedItemName || t('itemInsights.itemDetailsTitle', { ns: 'portal', defaultValue: 'Item details' })}
        size="xl"
      >
        {detailsLoading || !selectedItemDetails ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <Loader2 size={18} className="animate-spin text-accent" />
          </div>
        ) : (
          <div className="space-y-4">
            {selectedItemDetails.selectedItemHistory.map((history) => (
              <div key={`${history.normalizedItemName}:${history.currency}`} className="rounded-2xl border border-border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-700 text-foreground">{history.itemName}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{history.currency} · {history.entries.length} {t('itemInsights.pricePoints', { ns: 'portal', defaultValue: 'price points' })}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                    <div className="rounded-xl bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.averagePrice', { ns: 'portal', defaultValue: 'Average price' })}</p>
                      <p className="mt-1 font-700 text-foreground">{history.averagePrice?.toFixed(2) || '—'} {history.currency}</p>
                    </div>
                    <div className="rounded-xl bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.lowestPrice', { ns: 'portal', defaultValue: 'Lowest price' })}</p>
                      <p className="mt-1 font-700 text-foreground">{history.lowestPrice?.toFixed(2) || '—'} {history.currency}</p>
                    </div>
                    <div className="rounded-xl bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.highestPrice', { ns: 'portal', defaultValue: 'Highest price' })}</p>
                      <p className="mt-1 font-700 text-foreground">{history.highestPrice?.toFixed(2) || '—'} {history.currency}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4">
                  <Sparkline values={selectedItemPriceValues} />
                </div>
                <div className="mt-4 space-y-2">
                  {history.entries.map((entry) => (
                    <div key={entry.id} className="grid grid-cols-1 gap-2 rounded-2xl border border-border/70 p-3 sm:grid-cols-[110px_1fr_120px_120px]">
                      <div>
                        <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('reports.accountStatement.columns.date', { ns: 'portal' })}</p>
                        <p className="mt-1 text-sm font-700 text-foreground">{formatUiDate(entry.transactionDate, locale) || entry.transactionDate}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('transactions.merchantSource', { ns: 'portal' })}</p>
                        <p className="mt-1 text-sm text-foreground">{entry.merchant || t('itemInsights.unknownMerchant', { ns: 'portal', defaultValue: 'Unknown merchant' })}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.unitPrice', { ns: 'portal', defaultValue: 'Unit price' })}</p>
                        <p className="mt-1 text-sm text-foreground">{entry.unitPrice?.toFixed(2) || '—'} {history.currency}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.priceChange', { ns: 'portal', defaultValue: 'Price change' })}</p>
                        <p className={`mt-1 text-sm font-700 ${(entry.percentageChangeFromPrevious || 0) >= 0 ? 'text-warning' : 'text-positive'}`}>
                          {entry.percentageChangeFromPrevious === null ? '—' : `${entry.percentageChangeFromPrevious.toFixed(1)}%`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div className="rounded-2xl border border-border p-4">
              <h3 className="text-sm font-800 text-foreground">{t('itemInsights.identitySection', { ns: 'portal', defaultValue: 'Item normalization and merge' })}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('itemInsights.identityDescription', {
                  ns: 'portal',
                  defaultValue: 'Original receipt text stays unchanged. Reporting uses a separate normalized identity that you can rename or merge manually.',
                })}
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.canonicalName', { ns: 'portal', defaultValue: 'Canonical item name' })}</label>
                  <input className="input-base" value={canonicalNameDraft} onChange={(event) => setCanonicalNameDraft(event.target.value)} />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('itemInsights.normalizedPreview', {
                      ns: 'portal',
                      defaultValue: 'Normalized preview: {{value}}',
                      value: normalizeReceiptItemName(canonicalNameDraft || selectedItemName || ''),
                    })}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-700 uppercase tracking-wide text-muted-foreground">{t('itemInsights.mergeInto', { ns: 'portal', defaultValue: 'Merge into existing item' })}</label>
                  <select className="input-base" value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}>
                    <option value="">{t('itemInsights.selectMergeTarget', { ns: 'portal', defaultValue: 'Select a merge target' })}</option>
                    {identityOptions
                      .filter((option) => option.id !== selectedItemIdentity?.id)
                      .map((option) => (
                        <option key={option.id} value={option.id}>{option.canonicalName}</option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" className="btn-secondary" disabled={savingIdentity || !mergeTargetId} onClick={() => void handleMergeIdentity()}>
                  {savingIdentity ? <Loader2 size={14} className="animate-spin" /> : null}
                  {t('itemInsights.mergeAction', { ns: 'portal', defaultValue: 'Merge item' })}
                </button>
                <button type="button" className="btn-primary" disabled={savingIdentity || !canonicalNameDraft.trim()} onClick={() => void handleSaveIdentity()}>
                  {savingIdentity ? <Loader2 size={14} className="animate-spin" /> : null}
                  {t('itemInsights.saveIdentityAction', { ns: 'portal', defaultValue: 'Save name' })}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!recurringSuggestion}
        onClose={() => setRecurringSuggestion(null)}
        title={t('itemInsights.recurringModalTitle', { ns: 'portal', defaultValue: 'Create recurring suggestion' })}
        size="md"
      >
        {recurringSuggestion ? (
          <RecurringTransactionForm
            initialValues={{
              description: recurringSuggestion.itemName,
              amount: recurringSuggestion.latestPrice ? recurringSuggestion.latestPrice.toFixed(2) : '',
              transaction_type: 'expense',
              frequency: recurringSuggestion.averageIntervalDays <= 10 ? 'weekly' : recurringSuggestion.averageIntervalDays <= 20 ? 'biweekly' : 'monthly',
              next_due_date: recurringSuggestion.nextLikelyPurchaseDate,
              merchant: recurringSuggestion.merchant || '',
            }}
            onSuccess={() => {
              setRecurringSuggestion(null);
              toast.success(t('itemInsights.recurringCreated', { ns: 'portal', defaultValue: 'Recurring suggestion created in the recurring system.' }));
            }}
            onCancel={() => setRecurringSuggestion(null)}
          />
        ) : null}
      </Modal>
    </div>
  );
}
