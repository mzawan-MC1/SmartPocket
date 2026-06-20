'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  Loader2,
  Plus,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import CurrencySelector from '@/components/CurrencySelector';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import {
  createTransactionsBatch,
  getAccounts,
  getCategories,
  type Category,
  type CreateTransactionInput,
  type FinancialAccount,
  type Transaction,
  updateTransaction,
  uploadReceipt,
} from '@/lib/finance';
import { getManagedPeople, type ManagedPerson } from '@/lib/people';
import { useAuth } from '@/contexts/AuthContext';
import { useClientReferenceData } from '@/lib/reference-data/client';

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

export default function AddTransactionModal({
  isOpen,
  onClose,
  initialMode = 'single',
  initialTransactionType = 'expense',
  editingTransaction = null,
  accounts: providedAccounts,
  categories: providedCategories,
  people: providedPeople,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: TransactionModalMode;
  initialTransactionType?: 'income' | 'expense';
  editingTransaction?: Transaction | null;
  accounts?: FinancialAccount[];
  categories?: Category[];
  people?: ManagedPerson[];
}) {
  const { user } = useAuth();
  const { data: referenceData } = useClientReferenceData();
  const [internalAccounts, setInternalAccounts] = useState<FinancialAccount[]>([]);
  const [internalCategories, setInternalCategories] = useState<Category[]>([]);
  const [internalPeople, setInternalPeople] = useState<ManagedPerson[]>([]);
  const [supportingDataLoading, setSupportingDataLoading] = useState(false);
  const [transactionMode, setTransactionMode] = useState<TransactionModalMode>(initialMode);
  const [draftRows, setDraftRows] = useState<TransactionDraftRow[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ completed: number; total: number } | null>(null);
  const firstAmountFieldRef = useRef<HTMLInputElement | null>(null);

  const accounts = providedAccounts ?? internalAccounts;
  const categories = providedCategories ?? internalCategories;
  const people = providedPeople ?? internalPeople;
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
      transaction_type: initialTransactionType,
      account_id: defaultAccount?.id || base.account_id,
      currency: defaultAccount?.currency || referenceData?.platformDefaultCurrency || base.currency,
      receiptFile: null,
      showMoreOptions: false,
      showManagedPerson: false,
      ...overrides,
    };
  }, [accounts, initialTransactionType, referenceData?.platformDefaultCurrency]);

  const activeDraftRows = draftRows.length > 0 ? (transactionMode === 'single' ? [draftRows[0]] : draftRows) : [];

  useEffect(() => {
    if (!isOpen) return;
    if (providedAccounts && providedCategories && providedPeople) return;

    setSupportingDataLoading(true);
    Promise.all([
      providedAccounts ? Promise.resolve(providedAccounts) : getAccounts(),
      providedCategories ? Promise.resolve(providedCategories) : getCategories(),
      providedPeople ? Promise.resolve(providedPeople) : getManagedPeople(false),
    ])
      .then(([nextAccounts, nextCategories, nextPeople]) => {
        if (!providedAccounts) setInternalAccounts(nextAccounts.filter((account) => account.is_active));
        if (!providedCategories) setInternalCategories(nextCategories);
        if (!providedPeople) setInternalPeople(nextPeople);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load transaction form data'))
      .finally(() => setSupportingDataLoading(false));
  }, [isOpen, providedAccounts, providedCategories, providedPeople]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingTransaction) {
      setTransactionMode('single');
      setDraftRows([buildDraftFromTransaction(editingTransaction)]);
    } else {
      setTransactionMode(initialMode);
      setDraftRows([buildEmptyDraft({ transaction_type: initialTransactionType })]);
    }
    setRowErrors({});
    setSaveProgress(null);
    setIsSaving(false);
  }, [buildEmptyDraft, editingTransaction, initialMode, initialTransactionType, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      firstAmountFieldRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isOpen, transactionMode, draftRows.length]);

  const updateDraftRow = useCallback((rowId: string, updater: (row: TransactionDraftRow) => TransactionDraftRow) => {
    setDraftRows((rows) => rows.map((row) => (row.id === rowId ? updater(row) : row)));
    setRowErrors((prev) => {
      if (!prev[rowId]) return prev;
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  }, []);

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

  const closeModalAndReset = useCallback(() => {
    setRowErrors({});
    setSaveProgress(null);
    setIsSaving(false);
    onClose();
  }, [onClose]);

  const handleRequestClose = useCallback(() => {
    if (isSaving) return;

    const populatedRows = activeDraftRows.filter(isDraftRowPopulated);
    if (populatedRows.length > 1) {
      const confirmed = window.confirm('Discard the unsaved transactions in this batch?');
      if (!confirmed) return;
    } else if (editingTransaction || populatedRows.length === 1) {
      const confirmed = window.confirm('Discard your unsaved changes?');
      if (!confirmed) return;
    }

    closeModalAndReset();
  }, [activeDraftRows, closeModalAndReset, editingTransaction, isSaving]);

  const handleModeChange = (mode: TransactionModalMode) => {
    if (editingTransaction || mode === transactionMode) return;

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
      if (editingTransaction) {
        const row = rowsToSave[0];
        const savedTxn = await updateTransaction(editingTransaction.id, buildTransactionPayload(row) as Parameters<typeof updateTransaction>[1]);
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
      const failureRows = result.failures.map((failure) => failure.index + 1).join(', ');
      const summary = successCount > 0
        ? `${successCount} transaction${successCount === 1 ? '' : 's'} added; rows ${failureRows} failed`
        : `Rows ${failureRows} failed`;
      toast.error(summary);
      if (receiptWarningRows.length > 0) {
        toast.error(`Receipt upload failed for rows ${receiptWarningRows.join(', ')}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save transactions');
    } finally {
      setIsSaving(false);
      setSaveProgress(null);
    }
  }, [activeDraftRows, closeModalAndReset, editingTransaction, transactionMode, user?.id, validateDraftRow]);

  const visibleRowCount = activeDraftRows.length;
  const addActionLabel = editingTransaction
    ? 'Update Transaction'
    : visibleRowCount === 1
      ? 'Add Transaction'
      : `Add ${visibleRowCount} Transactions`;
  const savingActionLabel = editingTransaction
    ? 'Saving transaction...'
    : visibleRowCount === 1
      ? 'Adding transaction...'
      : `Adding ${visibleRowCount} transactions...`;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleRequestClose}
      title={editingTransaction ? 'Edit Transaction' : 'Add Transaction'}
      size="xl"
      mobileLayout="fullscreen"
      bodyClassName="p-0 sm:p-6"
    >
      <div className="flex h-full min-h-0 flex-col overflow-x-hidden">
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-0 sm:py-0">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            {transactionMode === 'single' ? (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Transaction type">
                {(['expense', 'income'] as const).map((type) => {
                  const primaryRow = activeDraftRows[0];
                  const isActive = primaryRow?.transaction_type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={isActive}
                      aria-label={`Set transaction type to ${type}`}
                      onClick={() => {
                        const rowIds = [activeDraftRows[0]?.id].filter(Boolean) as string[];
                        if (rowIds.length === 0) return;
                        updateDraftRow(rowIds[0], (row) => ({ ...row, transaction_type: type, category_id: '' }));
                      }}
                      className={`min-h-11 rounded-2xl border px-3 py-2.5 text-sm font-700 transition-colors sm:min-w-[140px] ${
                        isActive
                          ? type === 'income'
                            ? 'border-positive bg-positive-soft text-positive'
                            : 'border-negative bg-negative-soft text-negative'
                          : 'border-border text-muted-foreground hover:border-accent/40'
                      }`}
                    >
                      {type === 'income' ? <TrendingUp size={14} className="mr-1.5 inline" /> : <TrendingDown size={14} className="mr-1.5 inline" />}
                      {type === 'income' ? 'Income' : 'Expense'}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>Add up to {MAX_BATCH_ROWS} transactions. Optional fields are under More details.</span>
                <span className="font-600 text-foreground">{draftRows.length} / {MAX_BATCH_ROWS}</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-1">
              {(['single', 'multiple'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={transactionMode === mode}
                  aria-label={`Transaction entry mode: ${mode}`}
                  onClick={() => handleModeChange(mode)}
                  disabled={editingTransaction !== null && mode === 'multiple'}
                  className={`rounded-lg px-3 py-1.5 text-sm font-600 transition-colors ${
                    transactionMode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  } ${(editingTransaction !== null && mode === 'multiple') ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {mode === 'single' ? 'Single' : 'Multiple'}
                </button>
              ))}
            </div>
          </div>

          {supportingDataLoading ? (
            <div className="rounded-2xl border border-border bg-muted/10 p-6 text-center">
              <Loader2 size={18} className="mx-auto mb-2 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Loading transaction form...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeDraftRows.map((row, index) => {
                const account = accountMap.get(row.account_id);
                const filteredCategories = categories.filter((category) => category.category_type === row.transaction_type || category.category_type === 'transfer');
                const rowHasErrors = rowErrors[row.id] || [];
                const rowLabel = transactionMode === 'multiple' && !editingTransaction ? `Transaction ${index + 1}` : editingTransaction ? 'Transaction details' : 'Transaction';

                return (
                  <div key={row.id} className="rounded-2xl border border-border bg-card">
                    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                      <p className="text-sm font-700 text-foreground">{rowLabel}</p>
                      {transactionMode === 'multiple' && !editingTransaction ? (
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

                    <div className="flex flex-col space-y-3 px-4 py-4 max-[480px]:space-y-4 max-[480px]:px-3.5">
                      {transactionMode === 'multiple' && !editingTransaction ? (
                        <div>
                          <div>
                            <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">Type</label>
                            <div className="flex gap-2" role="group" aria-label={`Transaction ${index + 1} type`}>
                              {(['expense', 'income'] as const).map((type) => (
                                <button
                                  key={`${row.id}-${type}`}
                                  type="button"
                                  aria-pressed={row.transaction_type === type}
                                  aria-label={`Set transaction ${index + 1} type to ${type}`}
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

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 max-[480px]:order-2">
                        <div>
                          <label className="mb-1 block text-sm font-600 text-foreground">Account *</label>
                          <select
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

                      <div className="rounded-2xl border border-border/70 bg-muted/10 p-3 max-[480px]:order-1 max-[480px]:space-y-3">
                        <div className="max-[480px]:hidden">
                          <label className="mb-1 block text-sm font-600 text-foreground">Amount *</label>
                        </div>
                        <div className="hidden max-[480px]:block">
                          <label className="mb-1 block text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">Amount</label>
                        </div>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <input
                              ref={index === 0 ? firstAmountFieldRef : undefined}
                              type="number"
                              step="0.01"
                              min="0.01"
                              inputMode="decimal"
                              className="input-base h-12 text-base font-tabular max-[480px]:h-14 max-[480px]:text-2xl max-[480px]:font-800"
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
                      </div>

                      <div className="max-[480px]:order-4">
                        <label className="mb-1 block text-sm font-600 text-foreground">Date *</label>
                        <input
                          type="date"
                          className="input-base h-10 text-sm"
                          value={row.transaction_date}
                          onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, transaction_date: event.target.value }))}
                        />
                      </div>

                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 max-[480px]:order-5">
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

                      <div className="rounded-xl border border-border/70 bg-muted/10 max-[480px]:order-6">
                        <button
                          type="button"
                          onClick={() => updateDraftRow(row.id, (draft) => ({ ...draft, showMoreOptions: !draft.showMoreOptions }))}
                          aria-expanded={row.showMoreOptions}
                          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-600 text-foreground"
                        >
                          <span>More details</span>
                          {row.showMoreOptions ? <ChevronUpIcon size={15} /> : <ChevronDownIcon size={15} />}
                        </button>

                        {row.showMoreOptions ? (
                          <div className="space-y-3 border-t border-border/70 px-3 py-3">
                            <div>
                              <label className="mb-1 block text-sm font-600 text-foreground">Tags</label>
                              <div className="relative">
                                <Tag size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  type="text"
                                  className="input-base h-10 pl-10 pr-3 text-sm"
                                  placeholder="groceries, rent"
                                  value={row.tags}
                                  onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, tags: event.target.value }))}
                                />
                              </div>
                            </div>

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
          )}

          {transactionMode === 'multiple' && !editingTransaction && !supportingDataLoading ? (
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

        <div className="sticky bottom-0 z-10 mt-4 border-t border-border bg-card/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur sm:px-0 sm:pb-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {isSaving && saveProgress ? `Saving ${saveProgress.completed} of ${saveProgress.total}...` : activeDraftRows.filter(isDraftRowPopulated).length > 1 ? 'You have multiple unsaved transactions in this batch.' : editingTransaction ? 'Editing the selected transaction.' : null}
            </div>
            <div className="flex items-center justify-end gap-2 max-[480px]:grid max-[480px]:grid-cols-2">
              <button type="button" onClick={handleRequestClose} disabled={isSaving} className="btn-secondary max-[480px]:w-full">
                Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={isSaving || activeDraftRows.length === 0 || supportingDataLoading} className="btn-primary max-[480px]:w-full">
                {isSaving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    {savingActionLabel}
                  </>
                ) : addActionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
