'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Paperclip, Trash2, X, Edit2, Loader2, ArrowUpDown, Users } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import {
  getTransactions, deleteTransaction,
  getAccounts, getCategories, uploadReceipt, getLatestReportingContext, getLatestTransactionReportingPreviews,
  type Transaction, type FinancialAccount, type Category,
} from '@/lib/finance';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import { getManagedPeople, type ManagedPerson } from '@/lib/people';
import SearchField from '@/components/ui/SearchField';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import AddTransactionModal from './AddTransactionModal';

type SortKey = 'transaction_date' | 'merchant' | 'amount';
type SortDir = 'asc' | 'desc' | null;

export default function TransactionsTable({
  isAddTransactionOpen,
  onOpenAddTransaction,
  onCloseAddTransaction,
}: {
  isAddTransactionOpen: boolean;
  onOpenAddTransaction: () => void;
  onCloseAddTransaction: () => void;
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
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('transaction_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [perPage] = useState(10);
  const [showFilters, setShowFilters] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getTransactions({ type: filterType === 'all' ? undefined : filterType, dateFrom: filterDateFrom || undefined, dateTo: filterDateTo || undefined }),
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
  }, [filterType, filterDateFrom, filterDateTo]);

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
      return matchSearch && matchAccount;
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
  }, [transactions, search, filterAccount, sortKey, sortDir]);

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
            <div className="mt-4 pt-4 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">Account</label>
                <select value={filterAccount} onChange={(e) => { setFilterAccount(e.target.value); setPage(1); }} className="input-base h-9 text-sm">
                  <option value="all">All Accounts</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">Date From</label>
                <input type="date" className="input-base h-9 text-sm" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-700 text-foreground mb-1.5">Date To</label>
                <input type="date" className="input-base h-9 text-sm" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
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
              title="No transactions yet"
              description="Add your first income or expense transaction to get started."
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
};
