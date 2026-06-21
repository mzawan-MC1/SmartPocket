'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Paperclip, Trash2, X, Edit2, Loader2, ArrowUpDown, Users, CalendarRange } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import {
  getTransactions, deleteTransaction,
  getAccounts, getCategories, getLatestReportingContext, getLatestTransactionReportingPreviews, generateCSV,
  type Transaction, type FinancialAccount, type Category,
} from '@/lib/finance';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import { getManagedPeople, type ManagedPerson } from '@/lib/people';
import SearchField from '@/components/ui/SearchField';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import AddTransactionModal from './AddTransactionModal';
import TransactionDetailsModal from '@/components/transactions/TransactionDetailsModal';
import type { UserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import { formatFinancialPeriodLabel, getMonthContext, getNextFinancialPeriod, getPreviousFinancialPeriod, shiftMonthKey } from '@/lib/financial-periods';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import {
  getTransactionDocumentListSummaries,
  type TransactionListDocumentSummary,
} from '@/lib/transaction-document-details';
import { getTransactionDocumentDisplayTitle } from '@/lib/transaction-documents';

type SortKey = 'transaction_date' | 'merchant' | 'amount';
type SortDir = 'asc' | 'desc' | null;
type QuickDateFilterMode = 'pay_cycle' | 'month' | 'all_time' | 'custom';

function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getPayPeriodForOffset(context: UserFinancialPeriodContext, offset: number) {
  let period = context.currentFinancialPeriod;
  if (offset < 0) {
    for (let index = 0; index < Math.abs(offset); index += 1) {
      period = getPreviousFinancialPeriod(context.effectiveConfig, period.startDate);
    }
  } else if (offset > 0) {
    for (let index = 0; index < offset; index += 1) {
      period = getNextFinancialPeriod(context.effectiveConfig, period.startDate);
    }
  }
  return period;
}

export default function TransactionsTable({
  financialPeriodContext,
  isAddTransactionOpen,
  onOpenAddTransaction,
  onCloseAddTransaction,
  onRangeLabelChange,
  onExportReady,
}: {
  financialPeriodContext: UserFinancialPeriodContext;
  isAddTransactionOpen: boolean;
  onOpenAddTransaction: () => void;
  onCloseAddTransaction: () => void;
  onRangeLabelChange: (label: string) => void;
  onExportReady: (handler: (() => void) | null) => void;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionReportingCurrency, setTransactionReportingCurrency] = useState('');
  const [transactionReportingPreviews, setTransactionReportingPreviews] = useState<Record<string, Awaited<ReturnType<typeof getLatestTransactionReportingPreviews>>['previews'][string]>>({});
  const [documentSummaries, setDocumentSummaries] = useState<Record<string, TransactionListDocumentSummary>>({});
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'income' | 'expense' | 'transfer'>('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [dateFilterMode, setDateFilterMode] = useState<QuickDateFilterMode>('month');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('transaction_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [detailsTransactionId, setDetailsTransactionId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const hasInitializedDateFilter = React.useRef(false);

  useEffect(() => {
    if (hasInitializedDateFilter.current) return;
    setDateFilterMode(financialPeriodContext.defaultDashboardPeriod);
    setPeriodOffset(0);
    hasInitializedDateFilter.current = true;
  }, [financialPeriodContext.defaultDashboardPeriod]);

  const activeDateFilter = useMemo(() => {
    if (dateFilterMode === 'all_time') {
      return {
        dateFrom: undefined,
        dateTo: undefined,
        label: t('transactions.filters.allTime', { ns: 'portal' }),
        description: t('transactions.filters.showingAllHistory', { ns: 'portal' }),
        canMovePrevious: false,
        canMoveNext: false,
      };
    }

    if (dateFilterMode === 'custom') {
      const label = customDateFrom && customDateTo
        ? `${customDateFrom} - ${customDateTo}`
        : t('transactions.filters.customRange', { ns: 'portal' });
      return {
        dateFrom: customDateFrom || undefined,
        dateTo: customDateTo || undefined,
        label,
        description: t('transactions.filters.customDateRange', { ns: 'portal' }),
        canMovePrevious: false,
        canMoveNext: false,
      };
    }

    if (dateFilterMode === 'pay_cycle') {
      const period = getPayPeriodForOffset(financialPeriodContext, periodOffset);
      const payPeriodName = financialPeriodContext.effectiveConfig.incomeFrequency === 'irregular'
        ? t('transactions.filters.planningPeriod', { ns: 'portal' })
        : t('transactions.filters.payPeriod', { ns: 'portal' });
      return {
        dateFrom: period.startDate,
        dateTo: period.endDate,
        label: formatFinancialPeriodLabel(period),
        description: periodOffset === 0
          ? t('transactions.filters.currentNamedPeriod', { ns: 'portal', period: payPeriodName })
          : periodOffset === -1
            ? t('transactions.filters.previousNamedPeriod', { ns: 'portal', period: payPeriodName })
            : payPeriodName,
        canMovePrevious: true,
        canMoveNext: periodOffset < 0,
      };
    }

    const currentMonth = getMonthContext(undefined, financialPeriodContext.timezone);
    const monthContext = getMonthContext(shiftMonthKey(currentMonth.monthKey, periodOffset), financialPeriodContext.timezone);
    return {
      dateFrom: monthContext.startDate,
      dateTo: monthContext.endDate,
      label: monthContext.label,
      description: periodOffset === 0
        ? t('transactions.filters.currentMonth', { ns: 'portal' })
        : periodOffset === -1
          ? t('transactions.filters.previousMonth', { ns: 'portal' })
          : t('transactions.filters.month', { ns: 'portal' }),
      canMovePrevious: true,
      canMoveNext: periodOffset < 0,
    };
  }, [customDateFrom, customDateTo, dateFilterMode, financialPeriodContext, periodOffset, t]);

  useEffect(() => {
    onRangeLabelChange(activeDateFilter.label);
  }, [activeDateFilter.label, onRangeLabelChange]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [txns, accts, cats, ppl, reportingContext] = await Promise.all([
        getTransactions({
          type: filterType === 'all' ? undefined : filterType,
          dateFrom: activeDateFilter.dateFrom,
          dateTo: activeDateFilter.dateTo,
        }),
        getAccounts(),
        getCategories(),
        getManagedPeople(false),
        getLatestReportingContext(),
      ]);
      const [reporting, summaries] = await Promise.all([
        getLatestTransactionReportingPreviews(txns, reportingContext),
        getTransactionDocumentListSummaries(txns.map((txn) => txn.id)),
      ]);
      setTransactions(txns);
      setTransactionReportingCurrency(reporting.reportingCurrency);
      setTransactionReportingPreviews(reporting.previews);
      setDocumentSummaries(summaries);
      setAccounts(accts.filter((a) => a.is_active));
      setCategories(cats);
      setPeople(ppl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('common:errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [activeDateFilter.dateFrom, activeDateFilter.dateTo, filterType, t]);

  useEffect(() => { load(); }, [load]);

  useSmartPocketDataChanged(['transactions', 'financial_accounts'], 'TransactionsTable', async () => {
    await load();
  });

  const getTransactionDocumentMeta = useCallback((txn: Transaction) => {
    const documentSummary = documentSummaries[txn.id];
    const hasDocument = (txn.receipt_attachments?.length ?? 0) > 0 || !!documentSummary?.documentId;
    const itemCount = documentSummary?.itemCount || 0;
    const title = getTransactionDocumentDisplayTitle({
      merchant: txn.merchant,
      description: txn.description,
      hasDocument,
      fallbackLabel: t('transactions.documentDetails.fallbackTitle', {
        ns: 'portal',
        defaultValue: 'Receipt purchase',
      }),
    });

    return {
      documentSummary,
      hasDocument,
      itemCount,
      title,
    };
  }, [documentSummaries, t]);

  const handleOpenNewTransaction = useCallback(() => {
    setEditingTxn(null);
    onOpenAddTransaction();
  }, [onOpenAddTransaction]);

  const openEdit = useCallback((txn: Transaction) => {
    setEditingTxn(txn);
    onOpenAddTransaction();
  }, [onOpenAddTransaction]);

  const handleDelete = async (txn: Transaction) => {
    if (!confirm(t('transactions.deleteConfirm', { ns: 'portal' }))) return;
    setDeletingId(txn.id);
    try {
      await deleteTransaction(txn.id, txn.account_id);
      dispatchSmartPocketDataChanged({
        source: 'transactions-delete',
        entities: ['transactions', 'financial_accounts', 'dashboard'],
      });
      toast.success(t('transactions.deleted', { ns: 'portal' }));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('transactions.deleteFailed', { ns: 'portal' }));
    } finally {
      setDeletingId(null);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    let result = transactions.filter((transaction) => {
      const categoryDisplayName = translateSystemCategoryName(transaction.category?.name, (key, options) =>
        t(key, { ...(options || {}), ns: 'common' })
      );
      const matchSearch = !search ||
        (transaction.merchant || '').toLowerCase().includes(search.toLowerCase()) ||
        transaction.description.toLowerCase().includes(search.toLowerCase()) ||
        (transaction.category?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        categoryDisplayName.toLowerCase().includes(search.toLowerCase()) ||
        (transaction.tags || []).some((tag) => tag.toLowerCase().includes(search.toLowerCase()));
      const matchAccount = filterAccount === 'all' || transaction.account_id === filterAccount;
      const matchCategory = filterCategory === 'all' || transaction.category_id === filterCategory;
      return matchSearch && matchAccount && matchCategory;
    });
    if (sortKey && sortDir) {
      result = [...result].sort((a, b) => {
        let av: string | number = a[sortKey] as string | number;
        let bv: string | number = b[sortKey] as string | number;
        if (sortKey === 'amount') { av = Math.abs(a.amount); bv = Math.abs(b.amount); }
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [transactions, search, filterAccount, filterCategory, sortKey, sortDir, t]);

  const exportFilteredTransactions = useCallback(() => {
    if (filtered.length === 0) {
      toast.error(t('transactionsHeader.exportEmpty', { ns: 'portal' }));
      return;
    }
    downloadCSV(`smart-pocket-transactions-${activeDateFilter.dateFrom || 'all'}-${activeDateFilter.dateTo || 'all'}.csv`, generateCSV(filtered));
    toast.success(t('reports.csvExportedTransactions', { ns: 'portal', count: filtered.length }));
  }, [activeDateFilter.dateFrom, activeDateFilter.dateTo, filtered, t]);

  useEffect(() => {
    onExportReady(() => exportFilteredTransactions);
    return () => onExportReady(null);
  }, [exportFilteredTransactions, onExportReady]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col || !sortDir) return <ChevronsUpDown size={12} className="text-muted-foreground" />;
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-accent" /> : <ChevronDown size={12} className="text-accent" />;
  };

  return (
    <div className="space-y-3 max-[480px]:space-y-3 sm:space-y-4">
      <div className="section-card">
        <div className="section-card-body max-[480px]:p-3">
          <div className="mb-3 flex flex-col gap-3 max-[480px]:mb-2.5 max-[480px]:gap-2.5">
            <div className="flex flex-wrap items-center gap-2 max-[480px]:gap-1.5">
              <button
                type="button"
                onClick={() => { setDateFilterMode('pay_cycle'); setPeriodOffset(0); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 max-[480px]:px-2.5 max-[480px]:py-1.5 ${dateFilterMode === 'pay_cycle' && periodOffset === 0 ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                {financialPeriodContext.effectiveConfig.incomeFrequency === 'irregular'
                  ? t('reports.presets.currentPlanningPeriod', { ns: 'portal' })
                  : t('reports.presets.currentPayPeriod', { ns: 'portal' })}
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('pay_cycle'); setPeriodOffset(-1); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 max-[480px]:px-2.5 max-[480px]:py-1.5 ${dateFilterMode === 'pay_cycle' && periodOffset === -1 ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                {financialPeriodContext.effectiveConfig.incomeFrequency === 'irregular'
                  ? t('reports.presets.previousPlanningPeriod', { ns: 'portal' })
                  : t('reports.presets.previousPayPeriod', { ns: 'portal' })}
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('month'); setPeriodOffset(0); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 max-[480px]:px-2.5 max-[480px]:py-1.5 ${dateFilterMode === 'month' && periodOffset === 0 ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                {t('reports.presets.currentMonth', { ns: 'portal' })}
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('month'); setPeriodOffset(-1); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 max-[480px]:px-2.5 max-[480px]:py-1.5 ${dateFilterMode === 'month' && periodOffset === -1 ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                {t('reports.presets.previousMonth', { ns: 'portal' })}
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('all_time'); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 max-[480px]:px-2.5 max-[480px]:py-1.5 ${dateFilterMode === 'all_time' ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                {t('transactions.filters.allTime', { ns: 'portal' })}
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('custom'); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 max-[480px]:px-2.5 max-[480px]:py-1.5 ${dateFilterMode === 'custom' ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                {t('transactions.filters.customRange', { ns: 'portal' })}
              </button>
            </div>
            <div className="flex flex-col gap-2 min-[430px]:flex-row min-[430px]:flex-wrap min-[430px]:items-center">
              <div className="inline-flex w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-foreground min-[430px]:w-auto">
                <CalendarRange size={14} className="text-accent" />
                <span className="font-600">{activeDateFilter.description}:</span>
                <span className="truncate">{activeDateFilter.label}</span>
              </div>
              {(dateFilterMode === 'pay_cycle' || dateFilterMode === 'month') ? (
                <div className="inline-flex items-center gap-1 self-start rounded-xl border border-border bg-card px-2 py-1">
                  <button
                    type="button"
                    onClick={() => { setPeriodOffset((current) => current - 1); setPage(1); }}
                    className="btn-ghost min-h-0 rounded-lg p-2"
                    aria-label={dateFilterMode === 'month' ? t('transactions.filters.previousMonth', { ns: 'portal' }) : t('transactions.filters.previousPayPeriod', { ns: 'portal' })}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (!activeDateFilter.canMoveNext) return; setPeriodOffset((current) => Math.min(0, current + 1)); setPage(1); }}
                    disabled={!activeDateFilter.canMoveNext}
                    className="btn-ghost min-h-0 rounded-lg p-2 disabled:opacity-40"
                    aria-label={dateFilterMode === 'month' ? t('transactions.filters.nextMonth', { ns: 'portal' }) : t('transactions.filters.nextPayPeriod', { ns: 'portal' })}
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              ) : null}
              {financialPeriodContext.configurationWarning ? (
                <div className="rounded-xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning">
                  {financialPeriodContext.configurationWarning}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col gap-3 max-[480px]:gap-2.5 sm:flex-row">
            <SearchField
              placeholder={t('transactions.searchPlaceholder', { ns: 'portal' })}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              wrapperClassName="flex-1"
              inputClassName="h-10 max-[480px]:h-9"
            />
            <div className="flex flex-wrap items-center gap-2 max-[480px]:gap-1.5">
              {(['all', 'income', 'expense', 'transfer'] as const).map((filterValue) => (
                <button
                  key={`type-filter-${filterValue}`}
                  onClick={() => { setFilterType(filterValue); setPage(1); }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-600 transition-all duration-150 max-[480px]:px-2.5 ${
                    filterType === filterValue ? 'bg-accent text-accent-foreground border-accent' : 'bg-card text-muted-foreground border-border hover:border-accent/50'
                  }`}
                >
                  {filterValue === 'all'
                    ? t('transactions.filters.all', { ns: 'portal' })
                    : t(`transactions.types.${filterValue}` as const, { ns: 'portal' })}
                </button>
              ))}
              <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary h-9 px-3 text-sm ${showFilters ? 'border-accent text-accent' : ''}`}>
                <Filter size={14} /> {t('actions.filter', { ns: 'common' })} {showFilters && <X size={12} />}
              </button>
            </div>
          </div>
          {showFilters && (
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-4">
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">{t('transactions.account', { ns: 'portal' })}</label>
                <select value={filterAccount} onChange={(e) => { setFilterAccount(e.target.value); setPage(1); }} className="input-base h-9 text-sm">
                  <option value="all">{t('transactions.allAccounts', { ns: 'portal' })}</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">{t('transactions.category', { ns: 'portal' })}</label>
                <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }} className="input-base h-9 text-sm">
                  <option value="all">{t('transactions.allCategories', { ns: 'portal' })}</option>
                  {categories
                    .filter((category) => filterType === 'all' || category.category_type === filterType)
                    .map((category) => (
                      <option key={category.id} value={category.id}>
                        {translateSystemCategoryName(category.name, (key, options) =>
                          t(key, { ...(options || {}), ns: 'common' })
                        )}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">{t('transactions.dateFrom', { ns: 'portal' })}</label>
                <input
                  type="date"
                  className="input-base h-9 text-sm"
                  value={customDateFrom}
                  onChange={(e) => { setCustomDateFrom(e.target.value); setDateFilterMode('custom'); setPage(1); }}
                  aria-label={t('transactions.customRangeStart', { ns: 'portal' })}
                />
              </div>
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">{t('transactions.dateTo', { ns: 'portal' })}</label>
                <input
                  type="date"
                  className="input-base h-9 text-sm"
                  value={customDateTo}
                  onChange={(e) => { setCustomDateTo(e.target.value); setDateFilterMode('custom'); setPage(1); }}
                  aria-label={t('transactions.customRangeEnd', { ns: 'portal' })}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="section-card flex items-center gap-3 border-accent/40 bg-accent/5 px-4 py-3 max-[480px]:px-3 max-[480px]:py-2.5">
          <span className="text-sm font-600 text-foreground">{t('transactions.selectedCount', { ns: 'portal', count: selectedIds.size })}</span>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setSelectedIds(new Set())} className="btn-ghost text-xs py-1.5 px-2"><X size={13} /></button>
          </div>
        </div>
      )}

      <div className="data-table-shell overflow-hidden">
        {loading ? (
          <div className="p-8 text-center max-[480px]:p-5">
            <Loader2 size={24} className="animate-spin text-accent mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t('transactions.loading', { ns: 'portal' })}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 max-[480px]:p-5">
            <EmptyState
              icon={ArrowUpDown}
              title={transactions.length === 0 && dateFilterMode !== 'all_time' ? t('transactions.emptyInPeriodTitle', { ns: 'portal' }) : t('transactions.emptyTitle', { ns: 'portal' })}
              description={transactions.length === 0 && dateFilterMode !== 'all_time'
                ? t('transactions.emptyInPeriodDescription', { ns: 'portal' })
                : t('transactions.emptyDescription', { ns: 'portal' })}
              action={{ label: t('transactionsHeader.addTransaction', { ns: 'portal' }), onClick: handleOpenNewTransaction }}
            />
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 sm:hidden">
              {paginated.map((txn) => {
                const catColor = txn.category?.color || '#6b7280';
                const { hasDocument, itemCount, title } = getTransactionDocumentMeta(txn);
                const hasPerson = !!(txn as any).person_id;
                const reportingPreview = transactionReportingPreviews[txn.id];
                const showReportingPreview =
                  reportingPreview &&
                  reportingPreview.reportingAmount !== null &&
                  reportingPreview.originalCurrency !== reportingPreview.reportingCurrency;
                return (
                  <div key={`mobile-${txn.id}`} className={`rounded-2xl border border-border bg-card p-3 shadow-card-sm ${selectedIds.has(txn.id) ? 'border-accent/40 bg-accent/5' : ''}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 rounded border-border accent-accent"
                        checked={selectedIds.has(txn.id)}
                        onChange={() => toggleSelect(txn.id)}
                        aria-label={t('transactions.selectTransaction', { ns: 'portal' })}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-700 text-foreground">{title}</p>
                            <p className="text-xs text-muted-foreground">{txn.transaction_date}</p>
                          </div>
                          <Badge variant={txn.transaction_type === 'income' ? 'active' : txn.transaction_type === 'expense' ? 'exceeded' : 'default'}>
                            {t(`transactions.types.${txn.transaction_type}` as const, { ns: 'portal', defaultValue: txn.transaction_type })}
                          </Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {txn.category ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: catColor }} />
                              <span>{translateSystemCategoryName(txn.category.name, (key, options) =>
                                t(key, { ...(options || {}), ns: 'common' })
                              )}</span>
                            </span>
                          ) : (
                            <span>{t('transactions.uncategorized', { ns: 'portal' })}</span>
                          )}
                          <span>{txn.account?.name || t('transactions.noAccount', { ns: 'portal' })}</span>
                          {hasDocument ? (
                            <button
                              type="button"
                              onClick={() => setDetailsTransactionId(txn.id)}
                              className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-600 text-muted-foreground"
                            >
                              <Paperclip size={11} className="flex-shrink-0" />
                              {itemCount > 0
                                ? t('transactions.documentReview.itemCountLabel', {
                                    ns: 'portal',
                                    count: itemCount,
                                    defaultValue: '{{count}} items',
                                  })
                                : t('transactions.documentDetails.documentSection', {
                                    ns: 'portal',
                                    defaultValue: 'Receipt / Document',
                                  })}
                            </button>
                          ) : null}
                          {hasPerson ? <Users size={11} className="flex-shrink-0 text-accent" aria-label={t('transactions.managedPersonTransaction', { ns: 'portal' })} /> : null}
                        </div>
                        {txn.notes ? (
                          <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{txn.notes}</p>
                        ) : null}
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div className="min-w-0">
                            <FormattedCurrencyAmount
                              amount={txn.transaction_type === 'income' ? txn.amount : txn.transaction_type === 'expense' ? -Math.abs(txn.amount) : txn.amount}
                              currencyCode={txn.currency}
                              size="sm"
                              className={txn.transaction_type === 'income' ? 'text-sm font-700 text-positive' : 'text-sm font-700 text-foreground'}
                            />
                            {showReportingPreview ? (
                              <span className="mt-1 block text-[11px] text-muted-foreground">
                                ≈{' '}
                                <FormattedCurrencyAmount
                                  amount={reportingPreview.reportingAmount as number}
                                  currencyCode={reportingPreview.reportingCurrency}
                                  size="xs"
                                  className="text-[11px] text-muted-foreground"
                                />
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(txn)} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted" aria-label={t('actions.edit', { ns: 'common' })}>
                              <Edit2 size={14} className="text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => handleDelete(txn)}
                              disabled={deletingId === txn.id}
                              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-negative-soft"
                              aria-label={t('actions.delete', { ns: 'common' })}
                            >
                              {deletingId === txn.id ? <Loader2 size={14} className="animate-spin text-negative" /> : <Trash2 size={14} className="text-negative" />}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto scrollbar-thin sm:block">
              <table className="w-full min-w-[760px]">
                <thead className="data-table-head">
                  <tr className="border-b border-border">
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
                        checked={selectedIds.size === paginated.length && paginated.length > 0}
                        onChange={() => selectedIds.size === paginated.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(paginated.map((t) => t.id)))}
                        aria-label={t('transactions.selectAll', { ns: 'portal' })}
                      />
                    </th>
                    {[
                      { key: 'transaction_date' as SortKey, label: t('transactions.date', { ns: 'portal' }) },
                      { key: 'merchant' as SortKey, label: t('transactions.merchantSource', { ns: 'portal' }) },
                    ].map((col) => (
                      <th key={`th-${col.key}`} className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort(col.key)}>
                        <div className="flex items-center gap-1.5">{col.label}<SortIcon col={col.key} /></div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{t('transactions.category', { ns: 'portal' })}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{t('transactions.account', { ns: 'portal' })}</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{t('transactions.type', { ns: 'portal' })}</th>
                    <th className="px-4 py-3 text-right text-[11px] font-600 uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort('amount')}>
                      <div className="flex items-center justify-end gap-1.5">{t('transactions.amount', { ns: 'portal' })}<SortIcon col="amount" /></div>
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{t('transactions.actions', { ns: 'portal' })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((txn) => {
                    const catColor = txn.category?.color || '#6b7280';
                    const { hasDocument, itemCount, title } = getTransactionDocumentMeta(txn);
                    const hasPerson = !!(txn as any).person_id;
                    const reportingPreview = transactionReportingPreviews[txn.id];
                    const showReportingPreview =
                      reportingPreview &&
                      reportingPreview.reportingAmount !== null &&
                      reportingPreview.originalCurrency !== reportingPreview.reportingCurrency;
                    return (
                      <tr key={txn.id} className={`data-table-row transition-colors ${selectedIds.has(txn.id) ? 'bg-accent/5' : ''}`}>
                        <td className="px-4 py-3">
                          <input type="checkbox" className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
                            checked={selectedIds.has(txn.id)} onChange={() => toggleSelect(txn.id)} aria-label={t('transactions.selectRow', { ns: 'portal' })}
                          />
                        </td>
                        <td className="px-4 py-4 text-sm text-muted-foreground whitespace-nowrap">{txn.transaction_date}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-600 text-foreground truncate max-w-[160px]">{title}</span>
                            {hasDocument ? (
                              <button
                                type="button"
                                onClick={() => setDetailsTransactionId(txn.id)}
                                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[11px] font-600 text-muted-foreground"
                              >
                                <Paperclip size={11} className="text-muted-foreground flex-shrink-0" />
                                {itemCount > 0
                                  ? t('transactions.documentReview.itemCountLabel', {
                                      ns: 'portal',
                                      count: itemCount,
                                      defaultValue: '{{count}} items',
                                    })
                                  : t('transactions.documentDetails.documentSection', {
                                      ns: 'portal',
                                      defaultValue: 'Receipt / Document',
                                    })}
                              </button>
                            ) : null}
                            {hasPerson && <Users size={11} className="text-accent flex-shrink-0" aria-label={t('transactions.managedPersonTransaction', { ns: 'portal' })} />}
                          </div>
                          {txn.notes && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{txn.notes}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {txn.category ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                              <span className="text-sm text-foreground">
                                {translateSystemCategoryName(txn.category.name, (key, options) =>
                                  t(key, { ...(options || {}), ns: 'common' })
                                )}
                              </span>
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{txn.account?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={txn.transaction_type === 'income' ? 'active' : txn.transaction_type === 'expense' ? 'exceeded' : 'default'}>
                            {t(`transactions.types.${txn.transaction_type}` as const, { ns: 'portal', defaultValue: txn.transaction_type })}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="space-y-1">
                            <span className={`block text-sm font-700 font-tabular ${txn.transaction_type === 'income' ? 'text-positive' : 'text-foreground'}`}>
                              <FormattedCurrencyAmount
                                amount={txn.transaction_type === 'income' ? txn.amount : txn.transaction_type === 'expense' ? -Math.abs(txn.amount) : txn.amount}
                                currencyCode={txn.currency}
                                size="sm"
                                className={txn.transaction_type === 'income' ? 'text-positive' : 'text-foreground'}
                              />
                            </span>
                            {showReportingPreview ? (
                              <span
                                className="block text-[11px] text-muted-foreground"
                                title={t('transactions.reportingPreviewTitle', {
                                  ns: 'portal',
                                  currency: transactionReportingCurrency,
                                  provider: reportingPreview.provider || 'n/a',
                                  rateDate: reportingPreview.rateDate || 'n/a',
                                })}
                              >
                                ≈{' '}
                                <FormattedCurrencyAmount
                                  amount={reportingPreview.reportingAmount as number}
                                  currencyCode={reportingPreview.reportingCurrency}
                                  size="xs"
                                  className="text-[11px] text-muted-foreground"
                                />
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEdit(txn)} className="w-7 h-7 rounded hover:bg-muted flex items-center justify-center" aria-label={t('actions.edit', { ns: 'common' })}>
                              <Edit2 size={13} className="text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => handleDelete(txn)}
                              disabled={deletingId === txn.id}
                              className="w-7 h-7 rounded hover:bg-negative-soft flex items-center justify-center"
                              aria-label={t('actions.delete', { ns: 'common' })}
                            >
                              {deletingId === txn.id ? <Loader2 size={13} className="animate-spin text-negative" /> : <Trash2 size={13} className="text-negative" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 max-[480px]:px-3">
                <p className="text-xs text-muted-foreground">
                  {t('transactions.showingCount', {
                    ns: 'portal',
                    start: (page - 1) * perPage + 1,
                    end: Math.min(page * perPage, filtered.length),
                    total: filtered.length,
                  })}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost p-1.5 disabled:opacity-40">
                    <ChevronLeft size={15} />
                  </button>
                  {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                    const p = i + 1;
                    return (
                      <button key={`page-${p}`} onClick={() => setPage(p)} className={`w-7 h-7 rounded text-xs font-600 ${page === p ? 'bg-accent text-accent-foreground' : 'hover:bg-muted text-muted-foreground'}`}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-ghost p-1.5 disabled:opacity-40">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <AddTransactionModal
        isOpen={isAddTransactionOpen}
        onClose={() => {
          setEditingTxn(null);
          onCloseAddTransaction();
        }}
        editingTransaction={editingTxn}
        accounts={accounts}
        categories={categories}
        people={people}
        initialMode="single"
      />
      <TransactionDetailsModal
        isOpen={!!detailsTransactionId}
        transactionId={detailsTransactionId}
        onClose={() => setDetailsTransactionId(null)}
      />
    </div>
  );
}
