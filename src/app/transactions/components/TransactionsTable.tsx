'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Paperclip, Trash2, X, Tag, Edit2, Plus, Loader2, Upload, TrendingUp, TrendingDown, ArrowUpDown, Users  } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import {
  getTransactions, createTransaction, updateTransaction, deleteTransaction,
  getAccounts, getCategories, uploadReceipt, getLatestTransactionReportingPreviews,
  type Transaction, type FinancialAccount, type Category,
} from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { getManagedPeople, type ManagedPerson } from '@/lib/people';
import { useAuth } from '@/contexts/AuthContext';
import SearchField from '@/components/ui/SearchField';
import CurrencySelector from '@/components/CurrencySelector';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useClientReferenceData } from '@/lib/reference-data/client';

type SortKey = 'transaction_date' | 'merchant' | 'amount';
type SortDir = 'asc' | 'desc' | null;

interface TxnFormData {
  account_id: string;
  category_id: string;
  transaction_type: 'income' | 'expense';
  amount: string;
  currency: string;
  description: string;
  merchant: string;
  notes: string;
  transaction_date: string;
  tags: string;
  is_recurring: boolean;
  // Phase 2 fields
  person_id: string;
  expense_owner: string;
  paid_by: string;
  paid_from: string;
  use_held_balance: boolean;
  reimbursement_required: boolean;
  reimbursement_status: string;
}

const DEFAULT_FORM: TxnFormData = {
  account_id: '', category_id: '', transaction_type: 'expense',
  amount: '', currency: '', description: '', merchant: '',
  notes: '', transaction_date: new Date().toISOString().slice(0, 10),
  tags: '', is_recurring: false,
  // Phase 2 defaults
  person_id: '', expense_owner: 'user', paid_by: 'user',
  paid_from: 'account', use_held_balance: false,
  reimbursement_required: false, reimbursement_status: '',
};

export default function TransactionsTable() {
  const { user } = useAuth();
  const { data: referenceData } = useClientReferenceData();
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [form, setForm] = useState<TxnFormData>(DEFAULT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showPhase2, setShowPhase2] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getTransactions({ type: filterType === 'all' ? undefined : filterType, dateFrom: filterDateFrom || undefined, dateTo: filterDateTo || undefined }),
      getAccounts(),
      getCategories(),
      getManagedPeople(false),
    ])
      .then(async ([txns, accts, cats, ppl]) => {
        const reporting = await getLatestTransactionReportingPreviews(txns);
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

  const openAdd = () => {
    const defaultAccount = accounts[0];
    setEditingTxn(null);
    setForm({
      ...DEFAULT_FORM,
      account_id: defaultAccount?.id || '',
      currency: defaultAccount?.currency || referenceData?.platformDefaultCurrency || '',
    });
    setReceiptFile(null);
    setShowPhase2(false);
    setShowAddModal(true);
  };

  const openEdit = (txn: Transaction) => {
    setEditingTxn(txn);
    setForm({
      account_id: txn.account_id,
      category_id: txn.category_id || '',
      transaction_type: txn.transaction_type as 'income' | 'expense',
      amount: String(txn.amount),
      currency: txn.currency,
      description: txn.description,
      merchant: txn.merchant || '',
      notes: txn.notes || '',
      transaction_date: txn.transaction_date,
      tags: (txn.tags || []).join(', '),
      is_recurring: txn.is_recurring,
      // Phase 2
      person_id: (txn as any).person_id || '',
      expense_owner: (txn as any).expense_owner || 'user',
      paid_by: (txn as any).paid_by || 'user',
      paid_from: (txn as any).paid_from || 'account',
      use_held_balance: (txn as any).use_held_balance || false,
      reimbursement_required: (txn as any).reimbursement_required || false,
      reimbursement_status: (txn as any).reimbursement_status || '',
    });
    setShowPhase2(!!(txn as any).person_id);
    setReceiptFile(null);
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (!form.account_id) { toast.error('Please select an account'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    if (!form.description.trim() && !form.merchant.trim()) { toast.error('Enter a description or merchant'); return; }
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        account_id: form.account_id,
        category_id: form.category_id || null,
        transaction_type: form.transaction_type,
        amount: parseFloat(form.amount),
        currency: form.currency,
        description: form.description || form.merchant,
        merchant: form.merchant || null,
        notes: form.notes || null,
        transaction_date: form.transaction_date,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        is_recurring: form.is_recurring,
      };

      // Phase 2 fields — only include if managed-person flow is active
      if (showPhase2 && form.person_id) {
        payload.person_id = form.person_id;
        payload.expense_owner = form.expense_owner || 'user';
        payload.paid_by = form.paid_by || 'user';
        payload.paid_from = form.use_held_balance ? 'held_balance' : (form.paid_from || 'account');
        payload.use_held_balance = form.use_held_balance;
        payload.reimbursement_required = form.reimbursement_required;
        if (form.reimbursement_status) {
          payload.reimbursement_status = form.reimbursement_status;
        }
      }

      let savedTxn: Transaction;
      if (editingTxn) {
        savedTxn = await updateTransaction(editingTxn.id, payload as Parameters<typeof updateTransaction>[1]);
        toast.success('Transaction updated');
      } else {
        savedTxn = await createTransaction(payload as Parameters<typeof createTransaction>[0]);
        toast.success('Transaction added');
      }

      if (receiptFile && user?.id) {
        try {
          await uploadReceipt(savedTxn.id, receiptFile, user.id);
        } catch {
          toast.error('Transaction saved but receipt upload failed');
        }
      }

      setShowAddModal(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save transaction');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (txn: Transaction) => {
    if (!confirm('Delete this transaction?')) return;
    setDeletingId(txn.id);
    try {
      await deleteTransaction(txn.id, txn.account_id);
      toast.success('Transaction deleted');
      load();
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

  const filteredCategories = categories.filter((c) => c.category_type === form.transaction_type || c.category_type === 'transfer');

  return (
    <div className="space-y-4">
      {/* Search + Filter Bar */}
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
            <button onClick={openAdd} className="btn-primary h-9 px-3">
              <Plus size={14} /> Add
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

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="section-card px-4 py-3 flex items-center gap-3 border-accent/40 bg-accent/5">
          <span className="text-sm font-600 text-foreground">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setSelectedIds(new Set())} className="btn-ghost text-xs py-1.5 px-2"><X size={13} /></button>
          </div>
        </div>
      )}

      {/* Table */}
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
              action={{ label: 'Add Transaction', onClick: openAdd }}
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

            {/* Pagination */}
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

      {/* Add/Edit Transaction Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={editingTxn ? 'Edit Transaction' : 'Add Transaction'} size="lg">
        <div className="space-y-4">
          {/* Type Toggle */}
          <div className="flex gap-2">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setForm((f) => ({ ...f, transaction_type: t, category_id: '' }))}
                className={`flex-1 py-2.5 rounded-xl text-sm font-600 border-2 transition-all ${
                  form.transaction_type === t
                    ? t === 'income' ? 'border-positive bg-positive-soft text-positive' : 'border-negative bg-negative-soft text-negative' :'border-border text-muted-foreground hover:border-accent/40'
                }`}
              >
                {t === 'income' ? <TrendingUp size={14} className="inline mr-1.5" /> : <TrendingDown size={14} className="inline mr-1.5" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Account *</label>
              <select
                className="input-base"
                value={form.account_id}
                onChange={(e) => {
                  const nextAccountId = e.target.value;
                  const nextAccount = accounts.find((account) => account.id === nextAccountId);
                  setForm((f) => ({
                    ...f,
                    account_id: nextAccountId,
                    currency: nextAccount?.currency || f.currency,
                  }));
                }}
              >
                <option value="">Select account...</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Category</label>
              <select className="input-base" value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
                <option value="">No category</option>
                {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Amount *</label>
              <input
                type="number" step="0.01" min="0.01" className="input-base font-tabular"
                placeholder="0.00" value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Currency</label>
              <CurrencySelector
                value={form.currency}
                onChange={(currencyCode) => setForm((f) => ({ ...f, currency: currencyCode }))}
                placeholder="Choose currency"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Merchant / Source</label>
              <input type="text" className="input-base" placeholder="e.g. Netflix, Salary" value={form.merchant} onChange={(e) => setForm((f) => ({ ...f, merchant: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Description *</label>
              <input type="text" className="input-base" placeholder="Brief description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Date *</label>
              <input type="date" className="input-base" value={form.transaction_date} onChange={(e) => setForm((f) => ({ ...f, transaction_date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Tags</label>
              <div className="relative">
                <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" className="input-base pl-8" placeholder="groceries, rent (comma separated)" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Notes</label>
            <textarea rows={2} className="input-base resize-none" placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>

          {/* ── Phase 2: Managed Person Toggle ── */}
          <div className="border border-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => {
                setShowPhase2(!showPhase2);
                if (showPhase2) setForm((f) => ({ ...f, person_id: '', expense_owner: 'user', paid_by: 'user', paid_from: 'account', use_held_balance: false, reimbursement_required: false, reimbursement_status: '' }));
              }}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-600 text-foreground"
            >
              <span className="flex items-center gap-2">
                <Users size={15} className="text-accent" />
                Managed Person / Shared Expense
              </span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-500 ${showPhase2 ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                {showPhase2 ? 'Active' : 'Optional'}
              </span>
            </button>

            {showPhase2 && (
              <div className="p-4 space-y-4 border-t border-border">
                {/* Person selector */}
                <div>
                  <label className="block text-sm font-600 text-foreground mb-1.5">Managed Person</label>
                  <select
                    className="input-base"
                    value={form.person_id}
                    onChange={(e) => setForm((f) => ({ ...f, person_id: e.target.value }))}
                  >
                    <option value="">Select person...</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-600 text-muted-foreground mb-1.5">Expense Belongs To</label>
                    <select
                      className="input-base text-sm"
                      value={form.expense_owner}
                      onChange={(e) => setForm((f) => ({ ...f, expense_owner: e.target.value }))}
                    >
                      <option value="user">Me (User)</option>
                      <option value="person">Person</option>
                      <option value="shared">Shared</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-600 text-muted-foreground mb-1.5">Paid By</label>
                    <select
                      className="input-base text-sm"
                      value={form.paid_by}
                      onChange={(e) => setForm((f) => ({ ...f, paid_by: e.target.value }))}
                    >
                      <option value="user">Me (User)</option>
                      <option value="person">Person</option>
                      <option value="third_party">Third Party</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-600 text-muted-foreground mb-1.5">Paid From</label>
                    <select
                      className="input-base text-sm"
                      value={form.use_held_balance ? 'held_balance' : form.paid_from}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm((f) => ({
                          ...f,
                          paid_from: val === 'held_balance' ? 'held_balance' : val,
                          use_held_balance: val === 'held_balance',
                        }));
                      }}
                    >
                      <option value="account">Account</option>
                      <option value="held_balance">Held Balance</option>
                      <option value="cash">Cash</option>
                      <option value="external">External</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex items-center gap-2 cursor-pointer flex-1 p-3 rounded-xl border border-border hover:bg-muted/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={form.reimbursement_required}
                      onChange={(e) => setForm((f) => ({ ...f, reimbursement_required: e.target.checked }))}
                      className="rounded accent-accent"
                    />
                    <span className="text-sm text-foreground">Reimbursement Required</span>
                  </label>

                  {form.reimbursement_required && (
                    <div className="flex-1">
                      <select
                        className="input-base text-sm"
                        value={form.reimbursement_status}
                        onChange={(e) => setForm((f) => ({ ...f, reimbursement_status: e.target.value }))}
                      >
                        <option value="">Status (optional)</option>
                        <option value="pending">Pending</option>
                        <option value="partially_paid">Partially Paid</option>
                        <option value="settled">Settled</option>
                        <option value="waived">Waived</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  )}
                </div>

                {form.use_held_balance && form.person_id && (
                  <div className="bg-info-soft rounded-xl p-3 text-xs text-info font-500">
                    ℹ This expense will be deducted from {people.find((p) => p.id === form.person_id)?.full_name || 'the person'}&apos;s held balance
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Receipt Upload */}
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Receipt Attachment</label>
            <div className="border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-accent/50 transition-colors">
              <input
                type="file"
                id="receipt-upload"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file && file.size > 5 * 1024 * 1024) {
                    toast.error('File size must be under 5MB');
                    return;
                  }
                  setReceiptFile(file || null);
                }}
              />
              <label htmlFor="receipt-upload" className="cursor-pointer">
                <Upload size={20} className="text-muted-foreground mx-auto mb-1.5" />
                <p className="text-sm text-muted-foreground">
                  {receiptFile ? receiptFile.name : 'Click to upload receipt (JPG, PNG, PDF · max 5MB)'}
                </p>
              </label>
              {receiptFile && (
                <button onClick={() => setReceiptFile(null)} className="mt-2 text-xs text-negative hover:underline">Remove</button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
            <input id="is-recurring" type="checkbox" className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
              checked={form.is_recurring} onChange={(e) => setForm((f) => ({ ...f, is_recurring: e.target.checked }))}
            />
            <label htmlFor="is-recurring" className="text-sm font-500 text-foreground cursor-pointer">Mark as recurring transaction</label>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-border">
            <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary">
              {isSaving ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : editingTxn ? 'Update Transaction' : 'Add Transaction'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
