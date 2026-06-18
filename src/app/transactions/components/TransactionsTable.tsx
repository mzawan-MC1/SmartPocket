'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Filter, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight, Paperclip, Trash2, X, Tag, Edit2, Plus, Loader2, Upload, TrendingUp, TrendingDown, ArrowUpDown, Users, AlertCircle, ChevronDown as ChevronDownIcon, ChevronUp as ChevronUpIcon } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import {
  getTransactions, createTransactionsBatch, updateTransaction, deleteTransaction,
  getAccounts, getCategories, uploadReceipt, getLatestReportingContext, getLatestTransactionReportingPreviews,
  type Transaction, type FinancialAccount, type Category, type CreateTransactionInput,
} from '@/lib/finance';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import { getManagedPeople, type ManagedPerson } from '@/lib/people';
import { useAuth } from '@/contexts/AuthContext';
import SearchField from '@/components/ui/SearchField';
import CurrencySelector from '@/components/CurrencySelector';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useClientReferenceData } from '@/lib/reference-data/client';

type SortKey = 'transaction_date' | 'merchant' | 'amount';
type SortDir = 'asc' | 'desc' | null;
type TransactionModalMode = 'single' | 'multiple';

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

interface TransactionDraftRow extends TxnFormData {
  id: string;
  receiptFile: File | null;
  showMoreOptions: boolean;
  showManagedPerson: boolean;
}

const MAX_BATCH_ROWS = 20;

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function buildBaseForm(): TxnFormData {
  return {
    account_id: '',
    category_id: '',
    transaction_type: 'expense',
    amount: '',
    currency: '',
    description: '',
    merchant: '',
    notes: '',
    transaction_date: getTodayDate(),
    tags: '',
    is_recurring: false,
    person_id: '',
    expense_owner: 'user',
    paid_by: 'user',
    paid_from: 'account',
    use_held_balance: false,
    reimbursement_required: false,
    reimbursement_status: '',
  };
}

function createDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `txn-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isDraftRowPopulated(row: TransactionDraftRow) {
  return Boolean(
    row.account_id ||
    row.category_id ||
    row.amount ||
    row.currency ||
    row.description.trim() ||
    row.merchant.trim() ||
    row.notes.trim() ||
    row.tags.trim() ||
    row.person_id ||
    row.receiptFile ||
    row.is_recurring
  );
}

function buildDraftFromTransaction(txn: Transaction): TransactionDraftRow {
  return {
    id: createDraftId(),
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
    person_id: (txn as any).person_id || '',
    expense_owner: (txn as any).expense_owner || 'user',
    paid_by: (txn as any).paid_by || 'user',
    paid_from: (txn as any).paid_from || 'account',
    use_held_balance: Boolean((txn as any).use_held_balance),
    reimbursement_required: Boolean((txn as any).reimbursement_required),
    reimbursement_status: (txn as any).reimbursement_status || '',
    receiptFile: null,
    showMoreOptions: Boolean(txn.notes || (txn.tags || []).length || txn.is_recurring || (txn as any).person_id),
    showManagedPerson: Boolean((txn as any).person_id),
  };
}

function buildTransactionPayload(row: TransactionDraftRow): CreateTransactionInput {
  const payload: CreateTransactionInput = {
    account_id: row.account_id,
    category_id: row.category_id || null,
    transaction_type: row.transaction_type,
    amount: parseFloat(row.amount),
    currency: row.currency,
    description: row.description.trim() || row.merchant.trim(),
    merchant: row.merchant.trim() || null,
    notes: row.notes.trim() || null,
    transaction_date: row.transaction_date,
    tags: row.tags ? row.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    is_recurring: row.is_recurring,
  };

  if (row.showManagedPerson && row.person_id) {
    payload.person_id = row.person_id;
    payload.expense_owner = row.expense_owner || 'user';
    payload.paid_by = row.paid_by || 'user';
    payload.paid_from = row.use_held_balance ? 'held_balance' : (row.paid_from || 'account');
    payload.use_held_balance = row.use_held_balance;
    payload.reimbursement_required = row.reimbursement_required;
    payload.reimbursement_status = row.reimbursement_status || null;
  }

  return payload;
}

export default function TransactionsTable({
  isAddTransactionOpen,
  onOpenAddTransaction,
  onCloseAddTransaction,
}: {
  isAddTransactionOpen: boolean;
  onOpenAddTransaction: () => void;
  onCloseAddTransaction: () => void;
}) {
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
  const [transactionMode, setTransactionMode] = useState<TransactionModalMode>('single');
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [draftRows, setDraftRows] = useState<TransactionDraftRow[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ completed: number; total: number } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const firstAccountFieldRef = useRef<HTMLSelectElement | null>(null);
  const wasModalOpenRef = useRef(false);

  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );

  const buildEmptyDraft = useCallback((overrides: Partial<TransactionDraftRow> = {}): TransactionDraftRow => {
    const defaultAccount = accounts[0];
    const base = buildBaseForm();
    return {
      id: createDraftId(),
      ...base,
      account_id: defaultAccount?.id || base.account_id,
      currency: defaultAccount?.currency || referenceData?.platformDefaultCurrency || base.currency,
      receiptFile: null,
      showMoreOptions: false,
      showManagedPerson: false,
      ...overrides,
    };
  }, [accounts, referenceData?.platformDefaultCurrency]);

  const resetDraftState = useCallback((mode: TransactionModalMode = 'single') => {
    setEditingTxn(null);
    setTransactionMode(mode);
    setDraftRows([buildEmptyDraft()]);
    setRowErrors({});
    setSaveProgress(null);
    setIsSaving(false);
  }, [buildEmptyDraft]);

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

  useEffect(() => {
    if (isAddTransactionOpen && !wasModalOpenRef.current && !editingTxn) {
      resetDraftState('single');
    }
    wasModalOpenRef.current = isAddTransactionOpen;
  }, [isAddTransactionOpen, editingTxn, resetDraftState]);

  useEffect(() => {
    if (!isAddTransactionOpen) return;
    const timer = window.setTimeout(() => {
      firstAccountFieldRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAddTransactionOpen, transactionMode, draftRows.length]);

  const updateDraftRow = useCallback((rowId: string, updater: (row: TransactionDraftRow) => TransactionDraftRow) => {
    setDraftRows((rows) => rows.map((row) => (row.id === rowId ? updater(row) : row)));
    setRowErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, []);

  const handleOpenNewTransaction = useCallback(() => {
    resetDraftState('single');
    onOpenAddTransaction();
  }, [onOpenAddTransaction, resetDraftState]);

  const openEdit = useCallback((txn: Transaction) => {
    setEditingTxn(txn);
    setTransactionMode('single');
    setDraftRows([buildDraftFromTransaction(txn)]);
    setRowErrors({});
    setSaveProgress(null);
    setIsSaving(false);
    onOpenAddTransaction();
  }, [onOpenAddTransaction]);

  const activeDraftRows = draftRows.length > 0 ? (transactionMode === 'single' ? [draftRows[0]] : draftRows) : [];

  const validateDraftRow = useCallback((row: TransactionDraftRow, rowIndex: number) => {
    const errors: string[] = [];
    const account = accountMap.get(row.account_id);

    if (!row.account_id) errors.push(`Transaction ${rowIndex + 1}: select an account`);
    if (!account && row.account_id) errors.push(`Transaction ${rowIndex + 1}: selected account is unavailable`);
    if (!row.currency) errors.push(`Transaction ${rowIndex + 1}: select a currency`);
    if (account && row.currency && row.currency !== account.currency) {
      errors.push(`Transaction ${rowIndex + 1}: currency must match the selected account currency (${account.currency})`);
    }

    const amount = Number(row.amount);
    if (!row.amount || !Number.isFinite(amount) || amount <= 0) {
      errors.push(`Transaction ${rowIndex + 1}: enter a valid amount`);
    }
    if (!row.transaction_date) errors.push(`Transaction ${rowIndex + 1}: select a date`);
    if (!row.description.trim() && !row.merchant.trim()) {
      errors.push(`Transaction ${rowIndex + 1}: enter a description or merchant / source`);
    }
    if (row.use_held_balance && row.showManagedPerson && !row.person_id) {
      errors.push(`Transaction ${rowIndex + 1}: choose a managed person before using held balance`);
    }

    return errors;
  }, [accountMap]);

  const hasMultiplePopulatedRows = useMemo(
    () => activeDraftRows.filter(isDraftRowPopulated).length > 1,
    [activeDraftRows]
  );

  const closeModalAndReset = useCallback(() => {
    setEditingTxn(null);
    setTransactionMode('single');
    setDraftRows([]);
    setRowErrors({});
    setSaveProgress(null);
    setIsSaving(false);
    onCloseAddTransaction();
  }, [onCloseAddTransaction]);

  const handleRequestClose = useCallback(() => {
    if (isSaving) return;

    const populatedRows = activeDraftRows.filter(isDraftRowPopulated);
    if (populatedRows.length > 1) {
      const confirmed = window.confirm('Discard the unsaved transactions in this batch?');
      if (!confirmed) return;
    } else if (editingTxn || populatedRows.length === 1) {
      const confirmed = window.confirm('Discard your unsaved changes?');
      if (!confirmed) return;
    }

    closeModalAndReset();
  }, [activeDraftRows, closeModalAndReset, editingTxn, isSaving]);

  const handleSave = useCallback(async () => {
    const rowsToSave = transactionMode === 'single' ? activeDraftRows.slice(0, 1) : activeDraftRows;
    const nextRowErrors: Record<string, string[]> = {};

    rowsToSave.forEach((row, index) => {
      const errors = validateDraftRow(row, index);
      if (errors.length > 0) {
        nextRowErrors[row.id] = errors;
      }
    });

    if (Object.keys(nextRowErrors).length > 0) {
      setRowErrors(nextRowErrors);
      const firstError = Object.values(nextRowErrors)[0]?.[0];
      toast.error(firstError || 'Please fix the highlighted transaction rows');
      return;
    }

    setIsSaving(true);
    setSaveProgress({ completed: 0, total: rowsToSave.length });

    try {
      if (editingTxn) {
        const row = rowsToSave[0];
        const savedTxn = await updateTransaction(editingTxn.id, buildTransactionPayload(row) as Parameters<typeof updateTransaction>[1]);
        if (row.receiptFile && user?.id) {
          try {
            await uploadReceipt(savedTxn.id, row.receiptFile, user.id);
          } catch {
            toast.error('Transaction updated, but receipt upload failed');
          }
        }

        dispatchSmartPocketDataChanged({
          source: 'transactions-modal',
          entities: ['transactions', 'financial_accounts', 'dashboard'],
        });
        toast.success('Transaction updated successfully');
        closeModalAndReset();
        return;
      }

      const payloads = rowsToSave.map(buildTransactionPayload);
      const result = await createTransactionsBatch(payloads, {
        onProgress: ({ completed, total }) => setSaveProgress({ completed, total }),
      });

      let receiptWarningRows: number[] = [];
      if (user?.id && result.created.length > 0) {
        const failedInsertIndexes = new Set(result.failures.map((failure) => failure.index));
        const successfulRows = rowsToSave.filter((_, index) => !failedInsertIndexes.has(index));
        const uploadResults = await Promise.allSettled(
          successfulRows.map(async (row, successIndex) => {
            if (!row.receiptFile) return;
            await uploadReceipt(result.created[successIndex].id, row.receiptFile, user.id);
          })
        );
        receiptWarningRows = uploadResults
          .map((uploadResult, index) => (uploadResult.status === 'rejected' ? rowsToSave.findIndex((row) => row.id === successfulRows[index]?.id) + 1 : 0))
          .filter((rowIndex) => rowIndex > 0);
      }

      if (result.created.length > 0) {
        dispatchSmartPocketDataChanged({
          source: 'transactions-modal',
          entities: ['transactions', 'financial_accounts', 'dashboard'],
        });
      }

      if (result.failures.length === 0) {
        if (receiptWarningRows.length > 0) {
          toast.error(`Transactions added, but receipt upload failed for rows ${receiptWarningRows.join(', ')}`);
        } else {
          toast.success(`${result.created.length} transaction${result.created.length === 1 ? '' : 's'} added successfully`);
        }
        closeModalAndReset();
        return;
      }

      const failureMap: Record<string, string[]> = {};
      result.failures.forEach((failure) => {
        const failedRow = rowsToSave[failure.index];
        if (failedRow) {
          failureMap[failedRow.id] = [`Row ${failure.index + 1}: ${failure.message}`];
        }
      });
      setRowErrors(failureMap);

      const failedRowIds = new Set(result.failures.map((failure) => rowsToSave[failure.index]?.id).filter(Boolean) as string[]);
      setDraftRows((rows) => rows.filter((row) => failedRowIds.has(row.id)));

      const successCount = result.created.length;
      const failureCount = result.failures.length;
      const failureRows = result.failures.map((failure) => failure.index + 1).join(', ');
      const summary = successCount > 0
        ? `${successCount} transaction${successCount === 1 ? '' : 's'} added; rows ${failureRows} failed`
        : `Rows ${failureRows} failed`;
      toast.error(summary);
      if (receiptWarningRows.length > 0) {
        toast.error(`Receipt upload failed for rows ${receiptWarningRows.join(', ')}`);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save transactions');
    } finally {
      setIsSaving(false);
      setSaveProgress(null);
    }
  }, [activeDraftRows, closeModalAndReset, editingTxn, transactionMode, user?.id, validateDraftRow]);

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

  const handleModeChange = (mode: TransactionModalMode) => {
    if (editingTxn || mode === transactionMode) return;

    if (mode === 'single') {
      const dirtyRowsBeyondFirst = activeDraftRows.slice(1).filter(isDraftRowPopulated);
      if (dirtyRowsBeyondFirst.length > 0) {
        const confirmed = window.confirm('Switching to Single mode will discard the additional transaction rows. Continue?');
        if (!confirmed) return;
      }
      setDraftRows((rows) => rows.length > 0 ? [rows[0]] : [buildEmptyDraft()]);
    } else if (draftRows.length === 0) {
      setDraftRows([buildEmptyDraft()]);
    }

    setTransactionMode(mode);
    setRowErrors({});
  };

  const addAnotherTransaction = () => {
    if (draftRows.length >= MAX_BATCH_ROWS) return;
    setDraftRows((rows) => [...rows, buildEmptyDraft()]);
  };

  const removeDraftRow = (rowId: string, rowIndex: number) => {
    if (draftRows.length === 1) return;
    const row = draftRows.find((draft) => draft.id === rowId);
    if (row && isDraftRowPopulated(row)) {
      const confirmed = window.confirm(`Remove Transaction ${rowIndex + 1}?`);
      if (!confirmed) return;
    }

    setDraftRows((rows) => rows.filter((draft) => draft.id !== rowId));
    setRowErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
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

      <Modal
        isOpen={isAddTransactionOpen}
        onClose={handleRequestClose}
        title={editingTxn ? 'Edit Transaction' : 'Add Transaction'}
        size="xl"
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex flex-wrap gap-2">
                {(['expense', 'income'] as const).map((type) => {
                  const primaryRow = activeDraftRows[0];
                  const isActive = primaryRow?.transaction_type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        const rowIds = transactionMode === 'single' ? [activeDraftRows[0]?.id].filter(Boolean) as string[] : [];
                        if (rowIds.length === 0) return;
                        updateDraftRow(rowIds[0], (row) => ({ ...row, transaction_type: type, category_id: '' }));
                      }}
                      disabled={transactionMode === 'multiple'}
                      className={`min-w-[140px] rounded-xl border px-3 py-2 text-sm font-600 transition-colors ${
                        isActive
                          ? type === 'income'
                            ? 'border-positive bg-positive-soft text-positive'
                            : 'border-negative bg-negative-soft text-negative'
                          : 'border-border text-muted-foreground'
                      } ${transactionMode === 'multiple' ? 'cursor-not-allowed opacity-60' : 'hover:border-accent/40'}`}
                    >
                      {type === 'income' ? <TrendingUp size={14} className="mr-1.5 inline" /> : <TrendingDown size={14} className="mr-1.5 inline" />}
                      {type === 'income' ? 'Income' : 'Expense'}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-1">
                {(['single', 'multiple'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleModeChange(mode)}
                    disabled={editingTxn !== null && mode === 'multiple'}
                    className={`rounded-lg px-3 py-1.5 text-sm font-600 transition-colors ${
                      transactionMode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    } ${(editingTxn !== null && mode === 'multiple') ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    {mode === 'single' ? 'Single' : 'Multiple'}
                  </button>
                ))}
              </div>
            </div>

            {transactionMode === 'multiple' && !editingTxn ? (
              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <p>Enter up to {MAX_BATCH_ROWS} transactions in one batch. Optional fields live under each row’s More details section.</p>
                <span className="font-600 text-foreground">{draftRows.length}/{MAX_BATCH_ROWS}</span>
              </div>
            ) : null}

            <div className="space-y-3">
              {activeDraftRows.map((row, index) => {
                const account = accountMap.get(row.account_id);
                const filteredCategories = categories.filter((category) => category.category_type === row.transaction_type || category.category_type === 'transfer');
                const rowHasErrors = rowErrors[row.id] || [];
                const rowLabel = transactionMode === 'multiple' && !editingTxn ? `Transaction ${index + 1}` : editingTxn ? 'Transaction details' : 'Transaction';

                return (
                  <div key={row.id} className="rounded-2xl border border-border bg-card">
                    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                      <div>
                        <p className="text-sm font-700 text-foreground">{rowLabel}</p>
                        {transactionMode === 'multiple' && !editingTxn ? (
                          <p className="text-xs text-muted-foreground">Essential fields first, optional details below.</p>
                        ) : null}
                      </div>
                      {transactionMode === 'multiple' && !editingTxn ? (
                        <button
                          type="button"
                          onClick={() => removeDraftRow(row.id, index)}
                          disabled={draftRows.length === 1 || isSaving}
                          className="btn-ghost px-2 py-1 text-xs text-negative disabled:opacity-40"
                          aria-label={`Remove transaction ${index + 1}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>

                    <div className="space-y-3 px-4 py-4">
                      {transactionMode === 'multiple' && !editingTxn ? (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">Type</label>
                            <div className="flex gap-2">
                              {(['expense', 'income'] as const).map((type) => (
                                <button
                                  key={`${row.id}-${type}`}
                                  type="button"
                                  onClick={() => updateDraftRow(row.id, (draft) => ({ ...draft, transaction_type: type, category_id: '' }))}
                                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-600 transition-colors ${
                                    row.transaction_type === type
                                      ? type === 'income'
                                        ? 'border-positive bg-positive-soft text-positive'
                                        : 'border-negative bg-negative-soft text-negative'
                                      : 'border-border text-muted-foreground hover:border-accent/40'
                                  }`}
                                >
                                  {type === 'income' ? 'Income' : 'Expense'}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                            Optional details such as notes, tags, managed person, receipt, and recurring are available below.
                          </div>
                        </div>
                      ) : null}

                      {rowHasErrors.length > 0 ? (
                        <div className="rounded-xl border border-negative/30 bg-negative-soft px-3 py-2 text-sm text-negative">
                          <div className="mb-1 flex items-center gap-2 font-600">
                            <AlertCircle size={14} />
                            Fix this row before saving
                          </div>
                          <ul className="space-y-1 text-xs">
                            {rowHasErrors.map((error) => <li key={error}>{error}</li>)}
                          </ul>
                        </div>
                      ) : null}

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">Account *</label>
                          <select
                            ref={index === 0 ? firstAccountFieldRef : undefined}
                            className="input-base h-10 text-sm"
                            value={row.account_id}
                            onChange={(event) => {
                              const nextAccountId = event.target.value;
                              const nextAccount = accountMap.get(nextAccountId);
                              updateDraftRow(row.id, (draft) => ({
                                ...draft,
                                account_id: nextAccountId,
                                currency: nextAccount?.currency || draft.currency,
                              }));
                            }}
                          >
                            <option value="">Select account...</option>
                            {accounts.map((accountOption) => (
                              <option key={accountOption.id} value={accountOption.id}>{accountOption.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">Category</label>
                          <select
                            className="input-base h-10 text-sm"
                            value={row.category_id}
                            onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, category_id: event.target.value }))}
                          >
                            <option value="">No category</option>
                            {filteredCategories.map((category) => (
                              <option key={category.id} value={category.id}>{category.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">Amount *</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            className="input-base h-10 text-sm font-tabular"
                            placeholder="0.00"
                            value={row.amount}
                            onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, amount: event.target.value }))}
                          />
                        </div>
                        <div>
                          <CurrencySelector
                            value={row.currency}
                            onChange={(currencyCode) => updateDraftRow(row.id, (draft) => ({ ...draft, currency: currencyCode }))}
                            placeholder="Choose currency"
                            disabled={Boolean(account)}
                            helperText={account ? `Uses ${account.currency} from the selected account.` : 'Choose the transaction currency.'}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">Merchant / Source</label>
                          <input
                            type="text"
                            className="input-base h-10 text-sm"
                            placeholder="e.g. Netflix, Salary"
                            value={row.merchant}
                            onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, merchant: event.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">Description *</label>
                          <input
                            type="text"
                            className="input-base h-10 text-sm"
                            placeholder="Brief description"
                            value={row.description}
                            onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, description: event.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">Date *</label>
                          <input
                            type="date"
                            className="input-base h-10 text-sm"
                            value={row.transaction_date}
                            onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, transaction_date: event.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">Tags</label>
                          <div className="relative">
                            <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <input
                              type="text"
                              className="input-base h-10 pl-8 text-sm"
                              placeholder="groceries, rent"
                              value={row.tags}
                              onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, tags: event.target.value }))}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border/70 bg-muted/10">
                        <button
                          type="button"
                          onClick={() => updateDraftRow(row.id, (draft) => ({ ...draft, showMoreOptions: !draft.showMoreOptions }))}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-600 text-foreground"
                        >
                          <span>More details</span>
                          {row.showMoreOptions ? <ChevronUpIcon size={15} /> : <ChevronDownIcon size={15} />}
                        </button>

                        {row.showMoreOptions ? (
                          <div className="space-y-3 border-t border-border/70 px-3 py-3">
                            <div>
                              <label className="mb-1 block text-sm font-600 text-foreground">Notes</label>
                              <textarea
                                rows={2}
                                className="input-base resize-none text-sm"
                                placeholder="Optional notes..."
                                value={row.notes}
                                onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, notes: event.target.value }))}
                              />
                            </div>

                            <div className="rounded-xl border border-border/70 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => updateDraftRow(row.id, (draft) => ({
                                  ...draft,
                                  showManagedPerson: !draft.showManagedPerson,
                                  ...(draft.showManagedPerson
                                    ? {
                                      person_id: '',
                                      expense_owner: 'user',
                                      paid_by: 'user',
                                      paid_from: 'account',
                                      use_held_balance: false,
                                      reimbursement_required: false,
                                      reimbursement_status: '',
                                    }
                                    : {}),
                                }))}
                                className="flex w-full items-center justify-between bg-muted/30 px-3 py-2.5 text-sm font-600 text-foreground"
                              >
                                <span className="flex items-center gap-2">
                                  <Users size={14} className="text-accent" />
                                  Managed Person / Shared Expense
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-600 ${row.showManagedPerson ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                                  {row.showManagedPerson ? 'Active' : 'Optional'}
                                </span>
                              </button>

                              {row.showManagedPerson ? (
                                <div className="space-y-3 border-t border-border/70 px-3 py-3">
                                  <div>
                                    <label className="mb-1 block text-sm font-600 text-foreground">Managed Person</label>
                                    <select
                                      className="input-base h-10 text-sm"
                                      value={row.person_id}
                                      onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, person_id: event.target.value }))}
                                    >
                                      <option value="">Select person...</option>
                                      {people.map((person) => (
                                        <option key={person.id} value={person.id}>{person.full_name}</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <div>
                                      <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">Expense Belongs To</label>
                                      <select className="input-base h-10 text-sm" value={row.expense_owner} onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, expense_owner: event.target.value }))}>
                                        <option value="user">Me (User)</option>
                                        <option value="person">Person</option>
                                        <option value="shared">Shared</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">Paid By</label>
                                      <select className="input-base h-10 text-sm" value={row.paid_by} onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, paid_by: event.target.value }))}>
                                        <option value="user">Me (User)</option>
                                        <option value="person">Person</option>
                                        <option value="third_party">Third Party</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">Paid From</label>
                                      <select
                                        className="input-base h-10 text-sm"
                                        value={row.use_held_balance ? 'held_balance' : row.paid_from}
                                        onChange={(event) => {
                                          const value = event.target.value;
                                          updateDraftRow(row.id, (draft) => ({
                                            ...draft,
                                            paid_from: value === 'held_balance' ? 'held_balance' : value,
                                            use_held_balance: value === 'held_balance',
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

                                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_200px]">
                                    <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground">
                                      <input
                                        type="checkbox"
                                        checked={row.reimbursement_required}
                                        onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, reimbursement_required: event.target.checked }))}
                                        className="rounded accent-accent"
                                      />
                                      Reimbursement required
                                    </label>
                                    {row.reimbursement_required ? (
                                      <select
                                        className="input-base h-10 text-sm"
                                        value={row.reimbursement_status}
                                        onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, reimbursement_status: event.target.value }))}
                                      >
                                        <option value="">Status (optional)</option>
                                        <option value="pending">Pending</option>
                                        <option value="partially_paid">Partially Paid</option>
                                        <option value="settled">Settled</option>
                                        <option value="waived">Waived</option>
                                        <option value="cancelled">Cancelled</option>
                                      </select>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-600 text-foreground">Receipt Attachment</label>
                              <div className="rounded-xl border-2 border-dashed border-border px-4 py-3 text-center">
                                <input
                                  type="file"
                                  id={`receipt-upload-${row.id}`}
                                  accept="image/*,.pdf"
                                  className="hidden"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    if (file && file.size > 5 * 1024 * 1024) {
                                      toast.error('File size must be under 5MB');
                                      return;
                                    }
                                    updateDraftRow(row.id, (draft) => ({ ...draft, receiptFile: file || null }));
                                  }}
                                />
                                <label htmlFor={`receipt-upload-${row.id}`} className="cursor-pointer text-sm text-muted-foreground">
                                  <Upload size={18} className="mx-auto mb-1 text-muted-foreground" />
                                  {row.receiptFile ? row.receiptFile.name : 'Upload receipt (JPG, PNG, PDF · max 5MB)'}
                                </label>
                                {row.receiptFile ? (
                                  <button type="button" onClick={() => updateDraftRow(row.id, (draft) => ({ ...draft, receiptFile: null }))} className="mt-2 text-xs text-negative hover:underline">
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={row.is_recurring}
                                onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, is_recurring: event.target.checked }))}
                                className="rounded accent-accent"
                              />
                              Mark as recurring transaction
                            </label>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {transactionMode === 'multiple' && !editingTxn ? (
              <button
                type="button"
                onClick={addAnotherTransaction}
                disabled={draftRows.length >= MAX_BATCH_ROWS || isSaving}
                className="btn-secondary w-full justify-center"
              >
                <Plus size={14} />
                Add another transaction
              </button>
            ) : null}
          </div>

          <div className="sticky bottom-0 mt-4 border-t border-border bg-card/95 pt-3 backdrop-blur">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {isSaving && saveProgress ? `Saving ${saveProgress.completed} of ${saveProgress.total}...` : hasMultiplePopulatedRows ? 'You have multiple unsaved transactions in this batch.' : editingTxn ? 'Editing the selected transaction.' : null}
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={handleRequestClose} disabled={isSaving} className="btn-secondary">
                  Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={isSaving || activeDraftRows.length === 0} className="btn-primary">
                  {isSaving ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      {saveProgress ? `Saving ${saveProgress.completed}/${saveProgress.total}` : 'Saving...'}
                    </>
                  ) : editingTxn ? 'Update Transaction' : transactionMode === 'multiple' ? `Add ${activeDraftRows.length} Transactions` : 'Add Transaction'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
