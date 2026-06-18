'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Paperclip, Trash2, X, Edit2, Loader2, ArrowUpDown, Users, CalendarRange } from 'lucide-react';
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
import type { UserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import { formatFinancialPeriodLabel, getMonthContext, getNextFinancialPeriod, getPreviousFinancialPeriod, shiftMonthKey } from '@/lib/financial-periods';

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionReportingCurrency, setTransactionReportingCurrency] = useState('');
  const [transactionReportingPreviews, setTransactionReportingPreviews] = useState<Record<string, Awaited<ReturnType<typeof getLatestTransactionReportingPreviews>>['previews'][string]>>({});
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
        label: 'All time',
        description: 'Showing all transaction history',
        canMovePrevious: false,
        canMoveNext: false,
      };
    }

    if (dateFilterMode === 'custom') {
      const label = customDateFrom && customDateTo
        ? `${customDateFrom} - ${customDateTo}`
        : 'Custom range';
      return {
        dateFrom: customDateFrom || undefined,
        dateTo: customDateTo || undefined,
        label,
        description: 'Custom date range',
        canMovePrevious: false,
        canMoveNext: false,
      };
    }

    if (dateFilterMode === 'pay_cycle') {
      const period = getPayPeriodForOffset(financialPeriodContext, periodOffset);
      const payPeriodName = financialPeriodContext.effectiveConfig.incomeFrequency === 'irregular' ? 'planning period' : 'pay period';
      return {
        dateFrom: period.startDate,
        dateTo: period.endDate,
        label: formatFinancialPeriodLabel(period),
        description: periodOffset === 0 ? `Current ${payPeriodName}` : periodOffset === -1 ? `Previous ${payPeriodName}` : 'Pay period',
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
      description: periodOffset === 0 ? 'Current month' : periodOffset === -1 ? 'Previous month' : 'Month',
      canMovePrevious: true,
      canMoveNext: periodOffset < 0,
    };
  }, [customDateFrom, customDateTo, dateFilterMode, financialPeriodContext, periodOffset]);

  useEffect(() => {
    onRangeLabelChange(activeDateFilter.label);
  }, [activeDateFilter.label, onRangeLabelChange]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getTransactions({
        type: filterType === 'all' ? undefined : filterType,
        dateFrom: activeDateFilter.dateFrom,
        dateTo: activeDateFilter.dateTo,
      }),
      getAccounts(),
      getCategories(),
      getManagedPeople(false),
      getLatestReportingContext(),
    ])
      .then(async ([txns, accts, cats, ppl, reportingContext]) => {
        const reporting = await getLatestTransactionReportingPreviews(txns, reportingContext);
        setTransactions(txns);
        setTransactionReportingCurrency(reporting.reportingCurrency);
        setTransactionReportingPreviews(reporting.previews);
        setAccounts(accts.filter((a) => a.is_active));
        setCategories(cats);
        setPeople(ppl);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [activeDateFilter.dateFrom, activeDateFilter.dateTo, filterType]);

  useEffect(() => { load(); }, [load]);

  useSmartPocketDataChanged(['transactions', 'financial_accounts'], 'TransactionsTable', async () => {
    await load();
  });

  const handleOpenNewTransaction = useCallback(() => {
    setEditingTxn(null);
    onOpenAddTransaction();
  }, [onOpenAddTransaction]);

  const openEdit = useCallback((txn: Transaction) => {
    setEditingTxn(txn);
    onOpenAddTransaction();
  }, [onOpenAddTransaction]);

  const handleDelete = async (txn: Transaction) => {
    if (!confirm('Delete this transaction?')) return;
    setDeletingId(txn.id);
    try {
      await deleteTransaction(txn.id, txn.account_id);
      dispatchSmartPocketDataChanged({
        source: 'transactions-delete',
        entities: ['transactions', 'financial_accounts', 'dashboard'],
      });
      toast.success('Transaction deleted');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
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
    let result = transactions.filter((t) => {
      const matchSearch = !search ||
        (t.merchant || '').toLowerCase().includes(search.toLowerCase()) ||
        t.description.toLowerCase().includes(search.toLowerCase()) ||
        (t.category?.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(search.toLowerCase()));
      const matchAccount = filterAccount === 'all' || t.account_id === filterAccount;
      const matchCategory = filterCategory === 'all' || t.category_id === filterCategory;
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
  }, [transactions, search, filterAccount, filterCategory, sortKey, sortDir]);

  const exportFilteredTransactions = useCallback(() => {
    if (filtered.length === 0) {
      toast.error('No filtered transactions to export');
      return;
    }
    downloadCSV(`smart-pocket-transactions-${activeDateFilter.dateFrom || 'all'}-${activeDateFilter.dateTo || 'all'}.csv`, generateCSV(filtered));
    toast.success(`CSV exported - ${filtered.length} transactions`);
  }, [activeDateFilter.dateFrom, activeDateFilter.dateTo, filtered]);

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
    <div className="space-y-4">
      <div className="section-card">
        <div className="section-card-body">
          <div className="mb-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => { setDateFilterMode('pay_cycle'); setPeriodOffset(0); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 ${dateFilterMode === 'pay_cycle' && periodOffset === 0 ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                {financialPeriodContext.effectiveConfig.incomeFrequency === 'irregular' ? 'Current planning period' : 'Current pay period'}
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('pay_cycle'); setPeriodOffset(-1); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 ${dateFilterMode === 'pay_cycle' && periodOffset === -1 ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                {financialPeriodContext.effectiveConfig.incomeFrequency === 'irregular' ? 'Previous planning period' : 'Previous pay period'}
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('month'); setPeriodOffset(0); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 ${dateFilterMode === 'month' && periodOffset === 0 ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                Current month
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('month'); setPeriodOffset(-1); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 ${dateFilterMode === 'month' && periodOffset === -1 ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                Previous month
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('all_time'); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 ${dateFilterMode === 'all_time' ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                All time
              </button>
              <button
                type="button"
                onClick={() => { setDateFilterMode('custom'); setPage(1); }}
                className={`rounded-xl border px-3 py-2 text-xs font-600 ${dateFilterMode === 'custom' ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-foreground hover:border-accent/40'}`}
              >
                Custom range
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
                <CalendarRange size={14} className="text-accent" />
                <span className="font-600">{activeDateFilter.description}:</span>
                <span>{activeDateFilter.label}</span>
              </div>
              {(dateFilterMode === 'pay_cycle' || dateFilterMode === 'month') ? (
                <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-2 py-1">
                  <button
                    type="button"
                    onClick={() => { setPeriodOffset((current) => current - 1); setPage(1); }}
                    className="btn-ghost min-h-0 rounded-lg p-2"
                    aria-label={dateFilterMode === 'month' ? 'Previous month' : 'Previous pay period'}
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (!activeDateFilter.canMoveNext) return; setPeriodOffset((current) => Math.min(0, current + 1)); setPage(1); }}
                    disabled={!activeDateFilter.canMoveNext}
                    className="btn-ghost min-h-0 rounded-lg p-2 disabled:opacity-40"
                    aria-label={dateFilterMode === 'month' ? 'Next month' : 'Next pay period'}
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
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchField
              placeholder="Search merchant, category, or tag..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              wrapperClassName="flex-1"
              inputClassName="h-10"
            />
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'income', 'expense', 'transfer'] as const).map((t) => (
                <button
                  key={`type-filter-${t}`}
                  onClick={() => { setFilterType(t); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-600 transition-all duration-150 border ${
                    filterType === t ? 'bg-accent text-accent-foreground border-accent' : 'bg-card text-muted-foreground border-border hover:border-accent/50'
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
              <button onClick={() => setShowFilters(!showFilters)} className={`btn-secondary h-9 px-3 ${showFilters ? 'border-accent text-accent' : ''}`}>
                <Filter size={14} /> Filters {showFilters && <X size={12} />}
              </button>
            </div>
          </div>
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">Account</label>
                <select value={filterAccount} onChange={(e) => { setFilterAccount(e.target.value); setPage(1); }} className="input-base h-9 text-sm">
                  <option value="all">All Accounts</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">Category</label>
                <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }} className="input-base h-9 text-sm">
                  <option value="all">All Categories</option>
                  {categories
                    .filter((category) => filterType === 'all' || category.category_type === filterType)
                    .map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">Date From</label>
                <input
                  type="date"
                  className="input-base h-9 text-sm"
                  value={customDateFrom}
                  onChange={(e) => { setCustomDateFrom(e.target.value); setDateFilterMode('custom'); setPage(1); }}
                  aria-label="Custom range start date"
                />
              </div>
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">Date To</label>
                <input
                  type="date"
                  className="input-base h-9 text-sm"
                  value={customDateTo}
                  onChange={(e) => { setCustomDateTo(e.target.value); setDateFilterMode('custom'); setPage(1); }}
                  aria-label="Custom range end date"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="section-card px-4 py-3 flex items-center gap-3 border-accent/40 bg-accent/5">
          <span className="text-sm font-600 text-foreground">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setSelectedIds(new Set())} className="btn-ghost text-xs py-1.5 px-2"><X size={13} /></button>
          </div>
        </div>
      )}

      <div className="data-table-shell">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 size={24} className="animate-spin text-accent mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading transactions...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12">
            <EmptyState
              icon={ArrowUpDown}
              title={transactions.length === 0 && dateFilterMode !== 'all_time' ? 'No transactions in this period' : 'No transactions yet'}
              description={transactions.length === 0 && dateFilterMode !== 'all_time'
                ? 'Try a different planning period, switch to all time, or broaden your filters.'
                : 'Add your first income or expense transaction to get started.'}
              action={{ label: 'Add Transaction', onClick: handleOpenNewTransaction }}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[760px]">
                <thead className="data-table-head">
                  <tr className="border-b border-border">
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
                        checked={selectedIds.size === paginated.length && paginated.length > 0}
                        onChange={() => selectedIds.size === paginated.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(paginated.map((t) => t.id)))}
                        aria-label="Select all"
                      />
                    </th>
                    {[
                      { key: 'transaction_date' as SortKey, label: 'Date' },
                      { key: 'merchant' as SortKey, label: 'Merchant / Source' },
                    ].map((col) => (
                      <th key={`th-${col.key}`} className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort(col.key)}>
                        <div className="flex items-center gap-1.5">{col.label}<SortIcon col={col.key} /></div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Category</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Account</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-right text-[11px] font-600 uppercase tracking-wider text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => handleSort('amount')}>
                      <div className="flex items-center justify-end gap-1.5">Amount<SortIcon col="amount" /></div>
                    </th>
                    <th className="px-4 py-3 text-center text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginated.map((txn) => {
                    const catColor = txn.category?.color || '#6b7280';
                    const hasReceipt = (txn.receipt_attachments?.length ?? 0) > 0;
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
                            checked={selectedIds.has(txn.id)} onChange={() => toggleSelect(txn.id)} aria-label="Select row"
                          />
                        </td>
                        <td className="px-4 py-4 text-sm text-muted-foreground whitespace-nowrap">{txn.transaction_date}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-600 text-foreground truncate max-w-[160px]">{txn.merchant || txn.description}</span>
                            {hasReceipt && <Paperclip size={11} className="text-muted-foreground flex-shrink-0" />}
                            {hasPerson && <Users size={11} className="text-accent flex-shrink-0" aria-label="Managed person transaction" />}
                          </div>
                          {txn.notes && <p className="text-xs text-muted-foreground truncate max-w-[160px]">{txn.notes}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {txn.category ? (
                            <span className="flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                              <span className="text-sm text-foreground">{txn.category.name}</span>
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{txn.account?.name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={txn.transaction_type === 'income' ? 'active' : txn.transaction_type === 'expense' ? 'exceeded' : 'default'}>
                            {txn.transaction_type}
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
                                title={`Reporting currency ${transactionReportingCurrency}; provider ${reportingPreview.provider || 'n/a'}; rate date ${reportingPreview.rateDate || 'n/a'}`}
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
                            <button onClick={() => openEdit(txn)} className="w-7 h-7 rounded hover:bg-muted flex items-center justify-center" aria-label="Edit">
                              <Edit2 size={13} className="text-muted-foreground" />
                            </button>
                            <button
                              onClick={() => handleDelete(txn)}
                              disabled={deletingId === txn.id}
                              className="w-7 h-7 rounded hover:bg-negative-soft flex items-center justify-center"
                              aria-label="Delete"
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
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
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
    </div>
  );
}
