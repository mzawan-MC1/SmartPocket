'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  Loader2,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import CurrencySelector from '@/components/CurrencySelector';
import DocumentTransactionReviewModal from '@/components/transactions/DocumentTransactionReviewModal';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import {
  createSpaceTransaction,
  createTransactionsBatch,
  getAccounts,
  getCategories,
  type Category,
  type CreateTransactionInput,
  type FinancialAccount,
  type SpaceTransactionInput,
  type Transaction,
  type TransactionAllocation,
  updateSpaceTransaction,
  updateTransaction,
  uploadReceipt,
} from '@/lib/finance';
import { createLoanRepayment, getManagedPeople, type ManagedPerson } from '@/lib/people';
import { getPersonalSubscriptions, markPersonalSubscriptionPaid } from '@/lib/personal-subscriptions';
import {
  isPersonalSubscriptionUpcomingChargeStatus,
  type PersonalSubscription,
} from '@/lib/personal-subscriptions-shared';
import { useAuth } from '@/contexts/AuthContext';
import { resolveCurrencyPreference } from '@/lib/currency-totals';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import {
  classifyTransactionDocumentError,
  TRANSACTION_DOCUMENT_ACCEPT_ATTRIBUTE,
  TRANSACTION_DOCUMENT_SUPPORTED_TYPES_LABEL,
  getTransactionDocumentMaxSizeLabel,
  validateTransactionDocumentFile,
} from '@/lib/transaction-documents';
import {
  getFinancialAccountScopeType,
  getFinancialAccountDisplayLabel,
  getPreferredTransactionAccount,
  getSpaceTransactionEligibleAccounts,
} from '@/lib/financial-account-utils';
import type { SpaceMember } from '@/lib/spaces';

type TransactionModalMode = 'single' | 'multiple';
type TransactionEntryKind = 'standard' | 'personal_subscription_payment' | 'loan_repayment';
type SpaceSplitMethod = 'none' | 'equal' | 'exact' | 'percentage' | 'shares';
type SpaceParticipantType = 'member' | 'managed_person';

interface SpaceParticipantOption {
  key: string;
  participant_type: SpaceParticipantType;
  member_user_id: string | null;
  managed_person_id: string | null;
  label: string;
  subtitle: string | null;
}

interface SpaceAllocationDraft {
  participant_key: string;
  participant_type: SpaceParticipantType;
  member_user_id: string | null;
  managed_person_id: string | null;
  label: string;
  subtitle: string | null;
  selected: boolean;
  allocated_amount: string;
  percentage: string;
  shares: string;
  reimbursement_required: boolean;
}

interface TxnFormData {
  account_id: string;
  category_id: string;
  personal_subscription_id: string;
  entry_kind: TransactionEntryKind;
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
  paid_by_user_id: string;
  paid_by_person_id: string;
  split_method: SpaceSplitMethod;
  space_allocations: SpaceAllocationDraft[];
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
    personal_subscription_id: '',
    entry_kind: 'standard',
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
    paid_by_user_id: '',
    paid_by_person_id: '',
    split_method: 'none',
    space_allocations: [],
  };
}

function buildSpaceParticipantKey(participant: Pick<SpaceParticipantOption, 'participant_type' | 'member_user_id' | 'managed_person_id'>) {
  return participant.participant_type === 'member'
    ? `member:${participant.member_user_id}`
    : `person:${participant.managed_person_id}`;
}

function buildDefaultSpaceAllocations(
  participants: SpaceParticipantOption[],
  currentUserId?: string | null
): SpaceAllocationDraft[] {
  const preferredKey = participants.find((participant) => participant.member_user_id === currentUserId)?.key
    || participants[0]?.key
    || null;

  return participants.map((participant) => ({
    participant_key: participant.key,
    participant_type: participant.participant_type,
    member_user_id: participant.member_user_id,
    managed_person_id: participant.managed_person_id,
    label: participant.label,
    subtitle: participant.subtitle,
    selected: participant.key === preferredKey,
    allocated_amount: '',
    percentage: '',
    shares: '',
    reimbursement_required: false,
  }));
}

function getPreferredSpacePayer(
  participants: SpaceParticipantOption[],
  currentUserId?: string | null
) {
  return participants.find((participant) => participant.member_user_id === currentUserId)
    || participants.find((participant) => participant.participant_type === 'member')
    || participants[0]
    || null;
}

function syncSpaceAllocations(
  current: SpaceAllocationDraft[],
  participants: SpaceParticipantOption[],
  currentUserId?: string | null
) {
  if (participants.length === 0) {
    return [];
  }

  const currentByKey = new Map(current.map((allocation) => [allocation.participant_key, allocation]));
  const merged = participants.map((participant) => {
    const existing = currentByKey.get(participant.key);
    return existing
      ? {
        ...existing,
        participant_type: participant.participant_type,
        member_user_id: participant.member_user_id,
        managed_person_id: participant.managed_person_id,
        label: participant.label,
        subtitle: participant.subtitle,
      }
      : {
        participant_key: participant.key,
        participant_type: participant.participant_type,
        member_user_id: participant.member_user_id,
        managed_person_id: participant.managed_person_id,
        label: participant.label,
        subtitle: participant.subtitle,
        selected: false,
        allocated_amount: '',
        percentage: '',
        shares: '',
        reimbursement_required: false,
      };
  });

  if (merged.some((allocation) => allocation.selected)) {
    return merged;
  }

  return buildDefaultSpaceAllocations(participants, currentUserId);
}

function createDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `txn-draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getLocalizedDocumentValidationError(
  t: ReturnType<typeof useTranslation>['t'],
  error: unknown
) {
  switch (classifyTransactionDocumentError(error)) {
    case 'empty_file':
      return t('transactions.documentReview.errors.emptyFile', { ns: 'portal' });
    case 'invalid_type':
      return t('transactions.documentReview.errors.invalidType', { ns: 'portal' });
    case 'document_too_large':
      return t('transactions.documentReview.errors.fileTooLarge', { ns: 'portal' });
    case 'pdf_too_many_pages':
      return t('transactions.documentReview.errors.pdfTooManyPages', { ns: 'portal' });
    default:
      return t('transactions.documentReview.errors.invalidType', { ns: 'portal' });
  }
}

function isDraftRowPopulated(row: TransactionDraftRow) {
  return Boolean(
    row.account_id ||
    row.category_id ||
    row.personal_subscription_id ||
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

function applyPersonalSubscriptionToDraft(
  row: TransactionDraftRow,
  subscription: PersonalSubscription
): TransactionDraftRow {
  return {
    ...row,
    personal_subscription_id: subscription.id,
    entry_kind: 'personal_subscription_payment',
    transaction_type: 'expense',
    account_id: subscription.financial_account_id || '',
    category_id: subscription.category_id || '',
    amount: String(subscription.amount),
    currency: subscription.currency_code,
    description: subscription.description || subscription.name,
    merchant: subscription.provider || '',
    notes: subscription.notes || '',
    transaction_date: getTodayDate(),
    tags: '',
    receiptFile: null,
    showManagedPerson: false,
    showMoreOptions: false,
    person_id: '',
    expense_owner: 'user',
    paid_by: 'user',
    paid_from: 'account',
    use_held_balance: false,
    reimbursement_required: false,
    reimbursement_status: '',
    is_recurring: false,
  };
}

function buildDraftFromTransaction(txn: Transaction): TransactionDraftRow {
  const existingAllocations = (txn.transaction_allocations || []).map((allocation) => {
    const participantType: SpaceParticipantType = allocation.member_user_id ? 'member' : 'managed_person';
    return {
      participant_key: participantType === 'member'
        ? `member:${allocation.member_user_id}`
        : `person:${allocation.managed_person_id}`,
      participant_type: participantType,
      member_user_id: allocation.member_user_id || null,
      managed_person_id: allocation.managed_person_id || null,
      label: '',
      subtitle: null,
      selected: true,
      allocated_amount: allocation.allocated_amount != null ? String(allocation.allocated_amount) : '',
      percentage: allocation.percentage != null ? String(allocation.percentage) : '',
      shares: allocation.shares != null ? String(allocation.shares) : '',
      reimbursement_required: allocation.reimbursement_required === true,
    } satisfies SpaceAllocationDraft;
  });

  return {
    id: createDraftId(),
    account_id: txn.account_id,
    category_id: txn.category_id || '',
    personal_subscription_id: '',
    entry_kind: 'standard',
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
    paid_by_user_id: txn.paid_by_user_id || '',
    paid_by_person_id: txn.paid_by_person_id || '',
    split_method: txn.split_method || 'none',
    space_allocations: existingAllocations,
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

function buildSpaceTransactionPayload(
  row: TransactionDraftRow,
  spaceId: string
): SpaceTransactionInput {
  const selectedAllocations = row.space_allocations.filter((allocation) => allocation.selected);

  return {
    space_id: spaceId,
    account_id: row.account_id,
    category_id: row.category_id || null,
    transaction_type: row.transaction_type,
    amount: Number(row.amount),
    currency: row.currency,
    description: row.description.trim() || row.merchant.trim(),
    merchant: row.merchant.trim() || null,
    notes: row.notes.trim() || null,
    transaction_date: row.transaction_date,
    tags: row.tags ? row.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    is_recurring: row.is_recurring,
    paid_by_user_id: row.paid_by_user_id || null,
    paid_by_person_id: row.paid_by_person_id || null,
    split_method: row.split_method,
    allocations: selectedAllocations.map((allocation) => ({
      member_user_id: allocation.member_user_id || null,
      managed_person_id: allocation.managed_person_id || null,
      allocated_amount: allocation.allocated_amount ? Number(allocation.allocated_amount) : null,
      percentage: allocation.percentage ? Number(allocation.percentage) : null,
      shares: allocation.shares ? Number(allocation.shares) : null,
      reimbursement_required: allocation.reimbursement_required,
    })),
  };
}

export default function AddTransactionModal({
  isOpen,
  onClose,
  initialMode = 'single',
  initialTransactionType = 'expense',
  initialEntryKind = 'standard',
  preselectedPersonId,
  editingTransaction = null,
  accounts: providedAccounts,
  categories: providedCategories,
  people: providedPeople,
  spaceId,
  spaceName,
  spaceMembers = [],
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: TransactionModalMode;
  initialTransactionType?: 'income' | 'expense';
  initialEntryKind?: TransactionEntryKind;
  preselectedPersonId?: string;
  editingTransaction?: Transaction | null;
  accounts?: FinancialAccount[];
  categories?: Category[];
  people?: ManagedPerson[];
  spaceId?: string | null;
  spaceName?: string | null;
  spaceMembers?: SpaceMember[];
  onSaved?: () => void | Promise<void>;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { user } = useAuth();
  const { data: referenceData } = useClientReferenceData();
  const [internalAccounts, setInternalAccounts] = useState<FinancialAccount[]>([]);
  const [internalCategories, setInternalCategories] = useState<Category[]>([]);
  const [internalPeople, setInternalPeople] = useState<ManagedPerson[]>([]);
  const [subscriptions, setSubscriptions] = useState<PersonalSubscription[]>([]);
  const [supportingDataLoading, setSupportingDataLoading] = useState(false);
  const [transactionMode, setTransactionMode] = useState<TransactionModalMode>(initialMode);
  const [draftRows, setDraftRows] = useState<TransactionDraftRow[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string[]>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ completed: number; total: number } | null>(null);
  const [documentReviewFile, setDocumentReviewFile] = useState<File | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    cancelLabel?: string;
    confirmTone?: 'default' | 'warning' | 'danger';
    onConfirm: () => void;
  } | null>(null);
  const firstAmountFieldRef = useRef<HTMLInputElement | null>(null);
  const createModeDefaultCurrencyRef = useRef('');
  const createModeAutoCurrencyRef = useRef('');

  const accounts = providedAccounts ?? internalAccounts;
  const categories = providedCategories ?? internalCategories;
  const people = providedPeople ?? internalPeople;
  const filteredManagedPeople = useMemo(
    () => spaceId
      ? people.filter((person) => person.space_id === spaceId && person.linked_user_id === null)
      : people,
    [people, spaceId]
  );
  const spaceParticipants = useMemo<SpaceParticipantOption[]>(() => {
    if (!spaceId) return [];

    const memberParticipants = spaceMembers.map((member) => ({
      key: buildSpaceParticipantKey({
        participant_type: 'member',
        member_user_id: member.user_id,
        managed_person_id: null,
      }),
      participant_type: 'member' as const,
      member_user_id: member.user_id,
      managed_person_id: null,
      label: member.user_profile?.full_name || member.user_profile?.email || t('spaces.unknownUser', { ns: 'portal' }),
      subtitle: member.user_profile?.email || getFinancialAccountDisplayLabel({
        name: t(`spaces.roles.${member.role}`, { ns: 'portal', defaultValue: member.role }),
        currency: '',
        is_system_default: false,
        system_default_type: null,
      }),
    }));
    const managedParticipants = filteredManagedPeople.map((person) => ({
      key: buildSpaceParticipantKey({
        participant_type: 'managed_person',
        member_user_id: null,
        managed_person_id: person.id,
      }),
      participant_type: 'managed_person' as const,
      member_user_id: null,
      managed_person_id: person.id,
      label: person.full_name,
      subtitle: t('transactions.form.managedPerson', { ns: 'portal' }),
    }));

    return [...memberParticipants, ...managedParticipants];
  }, [filteredManagedPeople, spaceId, spaceMembers, t]);
  const selectorAccounts = useMemo(
    () => spaceId
      ? getSpaceTransactionEligibleAccounts(accounts, spaceId)
      : accounts.filter((account) => getFinancialAccountScopeType(account) === 'personal' && account.is_active),
    [accounts, spaceId]
  );
  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts]
  );
  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const eligiblePersonalSubscriptions = useMemo(
    () =>
      subscriptions.filter((subscription) =>
        isPersonalSubscriptionUpcomingChargeStatus(subscription.status)
        && Boolean(subscription.financial_account_id)
      ),
    [subscriptions]
  );
  const eligiblePersonalSubscriptionMap = useMemo(
    () => new Map(eligiblePersonalSubscriptions.map((subscription) => [subscription.id, subscription])),
    [eligiblePersonalSubscriptions]
  );

  const buildEmptyDraft = useCallback((overrides: Partial<TransactionDraftRow> = {}): TransactionDraftRow => {
    const defaultAccount = getPreferredTransactionAccount(
      selectorAccounts,
      spaceId ? initialTransactionType : (initialEntryKind === 'loan_repayment' ? 'expense' : initialTransactionType)
    ) || selectorAccounts[0] || null;
    const base = buildBaseForm();
    return {
      id: createDraftId(),
      ...base,
      entry_kind: spaceId ? 'standard' : initialEntryKind,
      transaction_type: spaceId ? initialTransactionType : (initialEntryKind === 'loan_repayment' ? 'expense' : initialTransactionType),
      account_id: defaultAccount?.id || base.account_id,
      currency: defaultAccount?.currency || createModeDefaultCurrencyRef.current || base.currency,
      person_id: preselectedPersonId || '',
      receiptFile: null,
      showMoreOptions: spaceId ? true : initialEntryKind === 'loan_repayment',
      showManagedPerson: false,
      split_method: spaceId ? 'equal' : base.split_method,
      space_allocations: spaceId ? buildDefaultSpaceAllocations(spaceParticipants, user?.id) : [],
      ...overrides,
    };
  }, [
    initialEntryKind,
    initialTransactionType,
    preselectedPersonId,
    selectorAccounts,
    spaceId,
    spaceParticipants,
    user?.id,
  ]);

  const refreshCreateModeDefaultCurrency = useCallback(async () => {
    const currencyCode = await resolveCurrencyPreference({
      platformCurrency: referenceData?.platformDefaultCurrency,
      forceRefreshUserDefault: isOpen && !editingTransaction,
    });

    const previousAutoCurrency = createModeAutoCurrencyRef.current;
    createModeDefaultCurrencyRef.current = currencyCode;
    createModeAutoCurrencyRef.current = currencyCode;

    if (!isOpen || editingTransaction) {
      return;
    }

    setDraftRows((rows) => rows.map((row) => {
      const accountCurrency = accountMap.get(row.account_id)?.currency || null;
      if (accountCurrency) {
        return row.currency === accountCurrency ? row : { ...row, currency: accountCurrency };
      }

      if (row.currency && row.currency !== previousAutoCurrency) {
        return row;
      }

      return row.currency === currencyCode ? row : { ...row, currency: currencyCode };
    }));
  }, [accountMap, editingTransaction, isOpen, referenceData?.platformDefaultCurrency]);

  useEffect(() => {
    let cancelled = false;

    void refreshCreateModeDefaultCurrency().catch(() => {
      if (!cancelled) {
        createModeDefaultCurrencyRef.current = '';
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshCreateModeDefaultCurrency]);

  useSmartPocketDataChanged(['profile'], 'AddTransactionModalCurrency', async () => {
    await refreshCreateModeDefaultCurrency();
  });

  const activeDraftRows = draftRows.length > 0 ? (transactionMode === 'single' ? [draftRows[0]] : draftRows) : [];

  useEffect(() => {
    if (!isOpen) return;

    setSupportingDataLoading(true);
    Promise.all([
      providedAccounts ? Promise.resolve(providedAccounts) : getAccounts(),
      providedCategories ? Promise.resolve(providedCategories) : getCategories(),
      providedPeople ? Promise.resolve(providedPeople) : getManagedPeople(false),
      getPersonalSubscriptions(),
    ])
      .then(([nextAccounts, nextCategories, nextPeople, nextSubscriptions]) => {
        if (!providedAccounts) setInternalAccounts(nextAccounts);
        if (!providedCategories) setInternalCategories(nextCategories);
        if (!providedPeople) setInternalPeople(nextPeople);
        setSubscriptions(nextSubscriptions);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : t('transactions.form.loadFailed', { ns: 'portal' })))
      .finally(() => setSupportingDataLoading(false));
  }, [isOpen, providedAccounts, providedCategories, providedPeople]);

  useEffect(() => {
    if (!isOpen) return;
    if (editingTransaction) {
      setTransactionMode('single');
      setDraftRows([buildDraftFromTransaction(editingTransaction)]);
    } else {
      setTransactionMode(spaceId || initialEntryKind === 'loan_repayment' ? 'single' : initialMode);
      setDraftRows([
        buildEmptyDraft({
          entry_kind: spaceId ? 'standard' : initialEntryKind,
          transaction_type: spaceId ? initialTransactionType : (initialEntryKind === 'loan_repayment' ? 'expense' : initialTransactionType),
          person_id: preselectedPersonId || '',
        }),
      ]);
    }
    setRowErrors({});
    setSaveProgress(null);
    setIsSaving(false);
    setDocumentReviewFile(null);
  }, [buildEmptyDraft, editingTransaction, initialEntryKind, initialMode, initialTransactionType, isOpen, preselectedPersonId, spaceId]);

  useEffect(() => {
    if (!isOpen || !spaceId) return;

    setDraftRows((rows) => rows.map((row) => ({
      ...row,
      entry_kind: 'standard',
      showManagedPerson: false,
      showMoreOptions: true,
      split_method: row.split_method || 'equal',
      space_allocations: syncSpaceAllocations(row.space_allocations, spaceParticipants, user?.id),
    })));
  }, [isOpen, spaceId, spaceParticipants, user?.id]);

  useEffect(() => {
    if (!isOpen || !spaceId || spaceParticipants.length === 0) return;

    const preferredPayer = getPreferredSpacePayer(spaceParticipants, user?.id);
    if (!preferredPayer) return;

    setDraftRows((rows) => rows.map((row) => {
      const account = accountMap.get(row.account_id);
      const usesSharedPersonalAccount = account
        ? getFinancialAccountScopeType(account) === 'personal'
        : false;

      if (!usesSharedPersonalAccount || row.paid_by_user_id || row.paid_by_person_id) {
        return row;
      }

      return {
        ...row,
        paid_by_user_id: preferredPayer.member_user_id || '',
        paid_by_person_id: preferredPayer.managed_person_id || '',
      };
    }));
  }, [accountMap, isOpen, spaceId, spaceParticipants, user?.id]);

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
    const amount = Number(row.amount);

    if (row.entry_kind === 'personal_subscription_payment') {
      if (!row.personal_subscription_id) {
        errors.push(t('transactions.form.rowSelectPersonalSubscription', { ns: 'portal', index: rowIndex + 1 }));
      } else if (!eligiblePersonalSubscriptionMap.has(row.personal_subscription_id)) {
        errors.push(t('transactions.form.rowSubscriptionUnavailable', { ns: 'portal', index: rowIndex + 1 }));
      }
      return errors;
    }

    if (!row.account_id) errors.push(t('transactions.form.rowSelectAccount', { ns: 'portal', index: rowIndex + 1 }));
    if (!account && row.account_id) errors.push(t('transactions.form.rowAccountUnavailable', { ns: 'portal', index: rowIndex + 1 }));
    if (!row.currency) errors.push(t('transactions.form.rowSelectCurrency', { ns: 'portal', index: rowIndex + 1 }));
    if (account && row.currency && row.currency !== account.currency) {
      errors.push(t('transactions.form.rowCurrencyMismatch', { ns: 'portal', index: rowIndex + 1, currency: account.currency }));
    }

    if (!row.amount || !Number.isFinite(amount) || amount <= 0) {
      errors.push(t('transactions.form.rowValidAmount', { ns: 'portal', index: rowIndex + 1 }));
    }
    if (!row.transaction_date) errors.push(t('transactions.form.rowSelectDate', { ns: 'portal', index: rowIndex + 1 }));
    if (row.entry_kind === 'loan_repayment' && !row.person_id) {
      errors.push(t('transactions.form.rowSelectLoanPerson', {
        ns: 'portal',
        index: rowIndex + 1,
        defaultValue: 'Transaction {{index}}: choose a person for the loan repayment',
      }));
    }
    if (row.entry_kind === 'loan_repayment' && !row.notes.trim()) {
      errors.push(t('transactions.form.rowLoanRepaymentNotes', {
        ns: 'portal',
        index: rowIndex + 1,
        defaultValue: 'Transaction {{index}}: enter notes for the loan repayment',
      }));
    }
    if (row.entry_kind === 'standard' && !row.description.trim() && !row.merchant.trim()) {
      errors.push(t('transactions.form.rowDescriptionOrMerchant', { ns: 'portal', index: rowIndex + 1 }));
    }
    if (row.use_held_balance && row.showManagedPerson && !row.person_id) {
      errors.push(t('transactions.form.rowChooseManagedPerson', { ns: 'portal', index: rowIndex + 1 }));
    }

    if (spaceId) {
      const selectedAllocations = row.space_allocations.filter((allocation) => allocation.selected);
      if (selectedAllocations.length === 0) {
        errors.push(t('transactions.form.rowSelectSpaceParticipants', {
          ns: 'portal',
          index: rowIndex + 1,
          defaultValue: 'Transaction {{index}}: choose at least one Space participant',
        }));
      }
      if (row.split_method === 'none' && selectedAllocations.length !== 1) {
        errors.push(t('transactions.form.rowSingleSpaceParticipant', {
          ns: 'portal',
          index: rowIndex + 1,
          defaultValue: 'Transaction {{index}}: single-beneficiary splits require exactly one participant',
        }));
      }
      if (getFinancialAccountScopeType(account || { scope_type: 'personal', space_id: null }) === 'personal'
        && !row.paid_by_user_id
        && !row.paid_by_person_id) {
        errors.push(t('transactions.form.rowSelectPayer', {
          ns: 'portal',
          index: rowIndex + 1,
          defaultValue: 'Transaction {{index}}: choose who paid when using a shared personal account',
        }));
      }
      if (row.split_method === 'exact') {
        const total = selectedAllocations.reduce((sum, allocation) => sum + Number(allocation.allocated_amount || 0), 0);
        if (Math.abs(total - amount) > 0.01) {
          errors.push(t('transactions.form.rowExactSplitTotal', {
            ns: 'portal',
            index: rowIndex + 1,
            defaultValue: 'Transaction {{index}}: exact split amounts must equal the transaction amount',
          }));
        }
      }
      if (row.split_method === 'percentage') {
        const total = selectedAllocations.reduce((sum, allocation) => sum + Number(allocation.percentage || 0), 0);
        if (Math.abs(total - 100) > 0.001) {
          errors.push(t('transactions.form.rowPercentageSplitTotal', {
            ns: 'portal',
            index: rowIndex + 1,
            defaultValue: 'Transaction {{index}}: percentages must total 100',
          }));
        }
      }
      if (row.split_method === 'shares') {
        const total = selectedAllocations.reduce((sum, allocation) => sum + Number(allocation.shares || 0), 0);
        if (total <= 0) {
          errors.push(t('transactions.form.rowSharesSplitTotal', {
            ns: 'portal',
            index: rowIndex + 1,
            defaultValue: 'Transaction {{index}}: enter shares greater than 0',
          }));
        }
      }
    }

    return errors;
  }, [accountMap, eligiblePersonalSubscriptionMap, spaceId, t]);

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
      setPendingConfirmation({
        title: t('transactions.form.discardChangesTitle', {
          ns: 'portal',
          defaultValue: 'Discard changes?',
        }),
        description: t('transactions.form.discardBatchConfirm', { ns: 'portal' }),
        confirmLabel: t('transactions.form.discardAction', {
          ns: 'portal',
          defaultValue: 'Discard',
        }),
        cancelLabel: t('actions.keep', { ns: 'common', defaultValue: 'Keep' }),
        confirmTone: 'warning',
        onConfirm: closeModalAndReset,
      });
      return;
    } else if (editingTransaction || populatedRows.length === 1) {
      setPendingConfirmation({
        title: t('transactions.form.discardChangesTitle', {
          ns: 'portal',
          defaultValue: 'Discard changes?',
        }),
        description: t('transactions.form.discardChangesConfirm', { ns: 'portal' }),
        confirmLabel: t('transactions.form.discardAction', {
          ns: 'portal',
          defaultValue: 'Discard',
        }),
        cancelLabel: t('actions.keep', { ns: 'common', defaultValue: 'Keep' }),
        confirmTone: 'warning',
        onConfirm: closeModalAndReset,
      });
      return;
    }

    closeModalAndReset();
  }, [activeDraftRows, closeModalAndReset, editingTransaction, isSaving]);

  const handleModeChange = (mode: TransactionModalMode) => {
    if (editingTransaction || mode === transactionMode) return;
    if (spaceId && mode === 'multiple') {
      toast.error(t('transactions.form.spaceTransactionsSingleOnly', {
        ns: 'portal',
        defaultValue: 'Space transactions are available in Single mode only.',
      }));
      return;
    }
    if (mode === 'multiple' && activeDraftRows[0]?.entry_kind === 'loan_repayment') {
      toast.error(t('transactions.form.loanRepaymentSingleOnly', {
        ns: 'portal',
        defaultValue: 'Loan repayment is available in Single mode only.',
      }));
      return;
    }
    if (mode === 'multiple' && activeDraftRows[0]?.entry_kind === 'personal_subscription_payment') {
      toast.error(t('transactions.form.personalSubscriptionSingleOnly', {
        ns: 'portal',
        defaultValue: 'Personal subscription payments are available in Single mode only.',
      }));
      return;
    }

    if (mode === 'single') {
      const dirtyRowsBeyondFirst = activeDraftRows.slice(1).filter(isDraftRowPopulated);
      if (dirtyRowsBeyondFirst.length > 0) {
        setPendingConfirmation({
          title: t('transactions.form.switchToSingleTitle', {
            ns: 'portal',
            defaultValue: 'Switch to single?',
          }),
          description: t('transactions.form.switchToSingleConfirm', { ns: 'portal' }),
          confirmLabel: t('actions.confirm', { ns: 'common', defaultValue: 'Confirm' }),
          cancelLabel: t('actions.keep', { ns: 'common', defaultValue: 'Keep' }),
          confirmTone: 'warning',
          onConfirm: () => {
            setDraftRows((rows) => rows.length > 0 ? [rows[0]] : [buildEmptyDraft()]);
            setTransactionMode(mode);
            setRowErrors({});
          },
        });
        return;
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
      setPendingConfirmation({
        title: t('transactions.form.removeRowTitle', {
          ns: 'portal',
          defaultValue: 'Delete row?',
        }),
        description: t('transactions.form.removeRowConfirm', { ns: 'portal', index: rowIndex + 1 }),
        confirmLabel: t('actions.delete', { ns: 'common' }),
        cancelLabel: t('actions.keep', { ns: 'common', defaultValue: 'Keep' }),
        confirmTone: 'danger',
        onConfirm: () => {
          setDraftRows((rows) => rows.filter((draft) => draft.id !== rowId));
          setRowErrors((prev) => {
            if (!prev[rowId]) return prev;
            const next = { ...prev };
            delete next[rowId];
            return next;
          });
        },
      });
      return;
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
      toast.error(firstError || t('transactions.form.fixHighlightedRows', { ns: 'portal' }));
      return;
    }

    setIsSaving(true);
    setSaveProgress({ completed: 0, total: rowsToSave.length });

    try {
      if (editingTransaction) {
        const row = rowsToSave[0];
        const savedTxn = spaceId
          ? await updateSpaceTransaction(editingTransaction.id, buildSpaceTransactionPayload(row, spaceId))
          : await updateTransaction(editingTransaction.id, buildTransactionPayload(row) as Parameters<typeof updateTransaction>[1]);
        if (row.receiptFile && user?.id) {
          try {
            await uploadReceipt(savedTxn.id, row.receiptFile, user.id);
          } catch {
            toast.error(t('transactions.form.updatedReceiptFailed', { ns: 'portal' }));
          }
        }

        dispatchSmartPocketDataChanged({
          source: spaceId ? 'space-transactions-modal' : 'transactions-modal',
          entities: spaceId
            ? ['transactions', 'financial_accounts', 'dashboard', 'spaces']
            : ['transactions', 'financial_accounts', 'dashboard'],
        });
        await onSaved?.();
        toast.success(t('transactions.form.updatedSuccessfully', { ns: 'portal' }));
        closeModalAndReset();
        return;
      }

      if (spaceId) {
        const row = rowsToSave[0];
        const createdTransaction = await createSpaceTransaction(buildSpaceTransactionPayload(row, spaceId));
        if (row.receiptFile && user?.id) {
          try {
            await uploadReceipt(createdTransaction.id, row.receiptFile, user.id);
          } catch {
            toast.error(t('transactions.form.updatedReceiptFailed', { ns: 'portal' }));
          }
        }

        dispatchSmartPocketDataChanged({
          source: 'space-transactions-modal',
          entities: ['transactions', 'financial_accounts', 'dashboard', 'spaces'],
        });
        await onSaved?.();
        toast.success(t('transactions.form.spaceTransactionSaved', {
          ns: 'portal',
          defaultValue: 'Space transaction saved.',
        }));
        closeModalAndReset();
        return;
      }

      if (rowsToSave.length === 1 && rowsToSave[0]?.entry_kind === 'loan_repayment') {
        const row = rowsToSave[0];
        const repayment = await createLoanRepayment({
          person_id: row.person_id,
          account_id: row.account_id,
          amount: Number(row.amount),
          currency: row.currency,
          repayment_date: row.transaction_date,
          notes: row.notes.trim(),
          description: row.description.trim() || undefined,
        });

        if (row.receiptFile && user?.id) {
          try {
            await uploadReceipt(repayment.transaction.id, row.receiptFile, user.id);
          } catch {
            toast.error(t('transactions.form.updatedReceiptFailed', { ns: 'portal' }));
          }
        }

        dispatchSmartPocketDataChanged({
          source: 'loan-repayment-modal',
          entities: ['transactions', 'financial_accounts', 'dashboard', 'people', 'settlements'],
        });
        await onSaved?.();
        toast.success(t('transactions.form.loanRepaymentSaved', {
          ns: 'portal',
          amount: repayment.remainingOutstanding.toFixed(2),
          currency: row.currency,
          defaultValue: 'Loan repayment saved. Remaining balance: {{currency}} {{amount}}',
        }));
        closeModalAndReset();
        return;
      }

      if (rowsToSave.length === 1 && rowsToSave[0]?.entry_kind === 'personal_subscription_payment') {
        const row = rowsToSave[0];
        const subscription = eligiblePersonalSubscriptionMap.get(row.personal_subscription_id);
        if (!subscription) {
          throw new Error(t('transactions.form.subscriptionUnavailable', {
            ns: 'portal',
            defaultValue: 'Select an active personal subscription before saving.',
          }));
        }

        await markPersonalSubscriptionPaid(subscription.id);
        dispatchSmartPocketDataChanged({
          source: 'personal-subscription-payment-modal',
          entities: ['personal_subscriptions', 'transactions', 'financial_accounts', 'dashboard', 'recurring_transactions', 'notifications'],
        });
        await onSaved?.();
        toast.success(t('personalSubscriptions.actions.markedPaidSuccess', { ns: 'portal', name: subscription.name }));
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
        await onSaved?.();
      }

      if (result.failures.length === 0) {
        if (receiptWarningRows.length > 0) {
          toast.error(t('transactions.form.addedReceiptFailedRows', { ns: 'portal', rows: receiptWarningRows.join(', ') }));
        } else {
          toast.success(t('transactions.form.addedSuccessfully', { ns: 'portal', count: result.created.length }));
        }
        closeModalAndReset();
        return;
      }

      const failureMap: Record<string, string[]> = {};
      result.failures.forEach((failure) => {
        const failedRow = rowsToSave[failure.index];
        if (failedRow) {
          failureMap[failedRow.id] = [t('transactions.form.rowFailure', { ns: 'portal', index: failure.index + 1, message: failure.message })];
        }
      });
      setRowErrors(failureMap);

      const failedRowIds = new Set(result.failures.map((failure) => rowsToSave[failure.index]?.id).filter(Boolean) as string[]);
      setDraftRows((rows) => rows.filter((row) => failedRowIds.has(row.id)));

      const successCount = result.created.length;
      const failureRows = result.failures.map((failure) => failure.index + 1).join(', ');
      const summary = successCount > 0
        ? t('transactions.form.partialSuccessSummary', { ns: 'portal', count: successCount, rows: failureRows })
        : t('transactions.form.failedRowsSummary', { ns: 'portal', rows: failureRows });
      toast.error(summary);
      if (receiptWarningRows.length > 0) {
        toast.error(t('transactions.form.receiptFailedRows', { ns: 'portal', rows: receiptWarningRows.join(', ') }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('transactions.form.saveFailed', { ns: 'portal' }));
    } finally {
      setIsSaving(false);
      setSaveProgress(null);
    }
  }, [activeDraftRows, closeModalAndReset, editingTransaction, eligiblePersonalSubscriptionMap, onSaved, spaceId, t, transactionMode, user?.id, validateDraftRow]);

  const handleOpenDocumentReview = useCallback((file: File | null | undefined) => {
    if (!file) return;
    setDocumentReviewFile(file);
  }, []);

  const visibleRowCount = activeDraftRows.length;
  const isLoanRepaymentMode = activeDraftRows[0]?.entry_kind === 'loan_repayment';
  const isSubscriptionPaymentMode = activeDraftRows[0]?.entry_kind === 'personal_subscription_payment';
  const addActionLabel = editingTransaction
    ? t('transactions.form.updateAction', { ns: 'portal' })
    : spaceId
      ? t('transactions.form.spaceTransactionAction', {
        ns: 'portal',
        defaultValue: 'Save Space Transaction',
      })
    : isSubscriptionPaymentMode
      ? t('transactions.form.subscriptionPaymentAction', {
        ns: 'portal',
        defaultValue: 'Record Subscription Payment',
      })
    : isLoanRepaymentMode
      ? t('transactions.form.loanRepaymentAction', {
        ns: 'portal',
        defaultValue: 'Record Loan Repayment',
      })
      : visibleRowCount === 1
      ? t('transactionsHeader.addTransaction', { ns: 'portal' })
      : t('transactions.form.addManyAction', { ns: 'portal', count: visibleRowCount });
  const savingActionLabel = editingTransaction
    ? t('transactions.form.savingOne', { ns: 'portal' })
    : spaceId
      ? t('transactions.form.spaceTransactionSaving', {
        ns: 'portal',
        defaultValue: 'Saving Space transaction...',
      })
    : isSubscriptionPaymentMode
      ? t('transactions.form.subscriptionPaymentSaving', {
        ns: 'portal',
        defaultValue: 'Saving subscription payment...',
      })
    : isLoanRepaymentMode
      ? t('transactions.form.loanRepaymentSaving', {
        ns: 'portal',
        defaultValue: 'Saving loan repayment...',
      })
      : visibleRowCount === 1
      ? t('transactions.form.addingOne', { ns: 'portal' })
      : t('transactions.form.addingMany', { ns: 'portal', count: visibleRowCount });

  return (
    <>
      <Modal
      isOpen={isOpen}
      onClose={handleRequestClose}
      title={editingTransaction ? t('transactions.form.editTitle', { ns: 'portal' }) : t('transactions.form.addTitle', { ns: 'portal' })}
      size="xl"
      mobileLayout="fullscreen"
      contentClassName="sm:max-w-[42rem] lg:max-w-[46rem] sm:max-h-[88vh]"
      headerClassName="sm:px-4 sm:py-3"
      bodyClassName="overflow-hidden p-0"
    >
      <div className="flex h-full min-h-0 flex-col overflow-x-hidden">
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-3.5 sm:py-3">
          <div className="grid grid-cols-1 gap-2">
            {!editingTransaction ? (
              <div className="rounded-2xl border border-border bg-card p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <p className="text-sm font-700 text-foreground">
                        {t('transactions.documentReview.entryTitle', {
                          ns: 'portal',
                          defaultValue: 'Receipt / Document',
                        })}
                      </p>
                      <span className="text-xs text-muted-foreground">
                        ({t('transactions.documentReview.entryMetaCompact', {
                          ns: 'portal',
                          supportedTypes: TRANSACTION_DOCUMENT_SUPPORTED_TYPES_LABEL,
                          maxSize: getTransactionDocumentMaxSizeLabel(),
                          defaultValue: '{{supportedTypes}} · Max {{maxSize}}',
                        })})
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('transactions.documentReview.entryDescription', {
                        ns: 'portal',
                        defaultValue: 'Upload a receipt or invoice to prepare transaction details for review.',
                      })}
                    </p>
                  </div>
                  <div className="sm:shrink-0">
                    <input
                      type="file"
                      id="transaction-document-review-upload"
                      accept={TRANSACTION_DOCUMENT_ACCEPT_ATTRIBUTE}
                      className="hidden"
                      onChange={(event) => {
                        const nextFile = event.target.files?.[0];
                        void handleOpenDocumentReview(nextFile);
                        event.currentTarget.value = '';
                      }}
                    />
                    <label
                      htmlFor="transaction-document-review-upload"
                      className="btn-secondary inline-flex cursor-pointer items-center justify-center"
                    >
                      <Upload size={14} />
                      {t('transactions.documentReview.openAction', {
                        ns: 'portal',
                        defaultValue: 'Review Document',
                      })}
                    </label>
                  </div>
                </div>
              </div>
            ) : null}
            {transactionMode === 'single' ? (
              <div className="flex flex-wrap items-stretch gap-2.5">
                <div
                  className={`grid w-full min-w-0 basis-full grid-cols-2 gap-1 rounded-2xl border border-border bg-muted/20 p-1 ${
                    spaceId ? 'sm:grid-cols-2' : 'sm:grid-cols-4'
                  } md:basis-auto md:flex-[1_1_32rem]`}
                  role="group"
                  aria-label={t('transactions.form.transactionType', { ns: 'portal' })}
                >
                  {(spaceId
                    ? [
                      { kind: 'standard' as const, type: 'expense' as const },
                      { kind: 'standard' as const, type: 'income' as const },
                    ]
                    : [
                      { kind: 'standard' as const, type: 'expense' as const },
                      { kind: 'standard' as const, type: 'income' as const },
                      { kind: 'personal_subscription_payment' as const, type: 'expense' as const },
                      { kind: 'loan_repayment' as const, type: 'expense' as const },
                    ]).map((option) => {
                    const primaryRow = activeDraftRows[0];
                    const isLoanRepaymentOption = option.kind === 'loan_repayment';
                    const isSubscriptionPaymentOption = option.kind === 'personal_subscription_payment';
                    const isActive = isLoanRepaymentOption
                      ? primaryRow?.entry_kind === 'loan_repayment'
                      : isSubscriptionPaymentOption
                        ? primaryRow?.entry_kind === 'personal_subscription_payment'
                      : primaryRow?.entry_kind === 'standard' && primaryRow?.transaction_type === option.type;
                    const label = isLoanRepaymentOption
                      ? t('transactions.form.loanRepaymentType', { ns: 'portal', defaultValue: 'Loan Repayment' })
                      : isSubscriptionPaymentOption
                        ? t('transactions.form.personalSubscriptionType', { ns: 'portal', defaultValue: 'Personal Subscription' })
                      : t(`transactions.types.${option.type}` as const, { ns: 'portal' });
                    return (
                      <button
                        key={`${option.kind}-${option.type}`}
                        type="button"
                        aria-pressed={isActive}
                        aria-label={t('transactions.form.setTransactionType', { ns: 'portal', type: label })}
                        onClick={() => {
                          const rowIds = [activeDraftRows[0]?.id].filter(Boolean) as string[];
                          if (rowIds.length === 0) return;
                          updateDraftRow(rowIds[0], (row) => ({
                            ...row,
                            entry_kind: option.kind,
                            transaction_type: option.kind === 'standard' ? option.type : 'expense',
                            personal_subscription_id: '',
                            account_id: option.kind === 'standard' ? row.account_id : '',
                            category_id: '',
                            amount: option.kind === 'standard' ? row.amount : '',
                            currency: option.kind === 'standard' ? row.currency : '',
                            description: '',
                            merchant: '',
                            notes: option.kind === 'loan_repayment' ? row.notes : '',
                            receiptFile: null,
                            showManagedPerson: false,
                            showMoreOptions: option.kind === 'loan_repayment',
                          }));
                        }}
                        className={`flex min-h-10 min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center text-[12px] font-700 leading-tight transition-colors sm:min-h-11 sm:py-2.5 sm:text-[13px] ${
                          isActive
                            ? option.type === 'income'
                              ? 'border-positive bg-positive-soft text-positive'
                              : 'border-negative bg-negative-soft text-negative'
                            : 'border-transparent bg-transparent text-muted-foreground hover:border-border/80 hover:bg-card hover:text-foreground'
                        }`}
                      >
                        {isLoanRepaymentOption ? (
                          <Users size={13} />
                        ) : isSubscriptionPaymentOption ? (
                          <RefreshCw size={13} />
                        ) : option.type === 'income' ? (
                          <TrendingUp size={13} />
                        ) : (
                          <TrendingDown size={13} />
                        )}
                        <span className="block whitespace-normal break-words">{label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="flex w-full basis-full flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-between md:w-auto md:basis-auto md:flex-[0_0_22rem]">
                  {!spaceId ? (
                    <div className="grid w-full grid-cols-2 gap-1 rounded-2xl border border-border bg-muted/20 p-1 sm:w-auto sm:flex-[0_0_13rem]">
                      {(['single', 'multiple'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          aria-pressed={transactionMode === mode}
                          aria-label={t('transactions.form.entryModeAria', { ns: 'portal', mode: t(`transactions.form.modes.${mode}` as const, { ns: 'portal' }) })}
                          onClick={() => handleModeChange(mode)}
                          disabled={(editingTransaction !== null && mode === 'multiple') || ((isLoanRepaymentMode || isSubscriptionPaymentMode) && mode === 'multiple')}
                          className={`min-h-11 min-w-0 rounded-xl border px-2.5 py-2 text-center text-[13px] font-600 leading-tight transition-colors ${
                            transactionMode === mode
                              ? 'border-border bg-card text-foreground shadow-sm'
                              : 'border-transparent bg-transparent text-muted-foreground hover:border-border/80 hover:bg-card hover:text-foreground'
                          } ${((editingTransaction !== null && mode === 'multiple') || ((isLoanRepaymentMode || isSubscriptionPaymentMode) && mode === 'multiple')) ? 'cursor-not-allowed opacity-60' : ''}`}
                        >
                          <span className="block whitespace-normal break-words">
                            {t(`transactions.form.modes.${mode}` as const, { ns: 'portal' })}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                      {t('transactions.form.spaceTransactionsSingleOnly', {
                        ns: 'portal',
                        defaultValue: 'Space transactions are available in Single mode only.',
                      })}
                    </div>
                  )}

                  {isSubscriptionPaymentMode ? (
                    <Link
                      href="/personal-subscriptions/new"
                      className="btn-secondary inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap sm:w-auto"
                    >
                      <Plus size={14} />
                      {t('transactions.form.addNewSubscription', { ns: 'portal' })}
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>{t('transactions.form.batchHelper', { ns: 'portal', count: MAX_BATCH_ROWS })}</span>
                <span className="font-600 text-foreground">{draftRows.length} / {MAX_BATCH_ROWS}</span>
              </div>
            )}
            {transactionMode === 'single' || spaceId ? null : (
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/20 p-1">
              {(['single', 'multiple'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={transactionMode === mode}
                  aria-label={t('transactions.form.entryModeAria', { ns: 'portal', mode: t(`transactions.form.modes.${mode}` as const, { ns: 'portal' }) })}
                  onClick={() => handleModeChange(mode)}
                  disabled={(editingTransaction !== null && mode === 'multiple') || ((isLoanRepaymentMode || isSubscriptionPaymentMode) && mode === 'multiple')}
                  className={`rounded-lg px-2.5 py-1.5 text-sm font-600 transition-colors ${
                    transactionMode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  } ${((editingTransaction !== null && mode === 'multiple') || ((isLoanRepaymentMode || isSubscriptionPaymentMode) && mode === 'multiple')) ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  {t(`transactions.form.modes.${mode}` as const, { ns: 'portal' })}
                </button>
              ))}
            </div>
            )}
          </div>

          {supportingDataLoading ? (
            <div className="rounded-2xl border border-border bg-muted/10 p-6 text-center">
              <Loader2 size={18} className="mx-auto mb-2 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">{t('transactions.form.loading', { ns: 'portal' })}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeDraftRows.map((row, index) => {
                const account = accountMap.get(row.account_id);
                const isLoanRepaymentRow = row.entry_kind === 'loan_repayment';
                const isSubscriptionPaymentRow = row.entry_kind === 'personal_subscription_payment';
                const selectedSubscription = eligiblePersonalSubscriptionMap.get(row.personal_subscription_id) || null;
                const filteredCategories = categories.filter((category) => category.category_type === row.transaction_type || category.category_type === 'transfer');
                const selectedAllocations = row.space_allocations.filter((allocation) => allocation.selected);
                const selectedPayerKey = row.paid_by_user_id
                  ? `member:${row.paid_by_user_id}`
                  : row.paid_by_person_id
                    ? `person:${row.paid_by_person_id}`
                    : '';
                const requiresSpacePayer = spaceId
                  && getFinancialAccountScopeType(account || { scope_type: 'personal', space_id: null }) === 'personal';
                const rowHasErrors = rowErrors[row.id] || [];
                const rowLabel = transactionMode === 'multiple' && !editingTransaction
                  ? t('transactions.form.transactionNumber', { ns: 'portal', index: index + 1 })
                  : editingTransaction
                    ? t('transactions.form.detailsTitle', { ns: 'portal' })
                    : t('transactions.form.transaction', { ns: 'portal' });

                return (
                  <div key={row.id} className="rounded-2xl border border-border bg-card">
                    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2">
                      <p className="text-sm font-700 text-foreground">{rowLabel}</p>
                      {transactionMode === 'multiple' && !editingTransaction ? (
                        <button
                          type="button"
                          onClick={() => removeDraftRow(row.id, index)}
                          disabled={draftRows.length === 1 || isSaving}
                          className="btn-ghost px-2 py-1 text-xs text-negative disabled:opacity-40"
                          aria-label={t('transactions.form.removeTransaction', { ns: 'portal', index: index + 1 })}
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-col space-y-2 px-3 py-2.5 max-[480px]:space-y-4 max-[480px]:px-3.5">
                      {transactionMode === 'multiple' && !editingTransaction ? (
                        <div>
                          <div>
                            <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">{t('transactions.form.transactionType', { ns: 'portal' })}</label>
                            <div className="flex gap-2" role="group" aria-label={t('transactions.form.transactionTypeRow', { ns: 'portal', index: index + 1 })}>
                              {(['expense', 'income'] as const).map((type) => (
                                <button
                                  key={`${row.id}-${type}`}
                                  type="button"
                                  aria-pressed={row.transaction_type === type}
                                  aria-label={t('transactions.form.setTransactionTypeRow', { ns: 'portal', index: index + 1, type: t(`transactions.types.${type}` as const, { ns: 'portal' }) })}
                                  onClick={() => updateDraftRow(row.id, (draft) => ({ ...draft, transaction_type: type, category_id: '' }))}
                                  className={`flex-1 rounded-xl border px-3 py-2 text-sm font-600 transition-colors ${
                                    row.transaction_type === type
                                      ? type === 'income'
                                        ? 'border-positive bg-positive-soft text-positive'
                                        : 'border-negative bg-negative-soft text-negative'
                                      : 'border-border text-muted-foreground hover:border-accent/40'
                                  }`}
                                >
                                  {t(`transactions.types.${type}` as const, { ns: 'portal' })}
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
                            {t('transactions.form.fixRowBeforeSaving', { ns: 'portal' })}
                          </div>
                          <ul className="space-y-1 text-xs">
                            {rowHasErrors.map((error) => <li key={error}>{error}</li>)}
                          </ul>
                        </div>
                      ) : null}

                      {isSubscriptionPaymentRow ? (
                        <>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                            <div className="md:col-span-2">
                              <label className="mb-1 block text-sm font-600 text-foreground">
                                {t('transactions.form.personalSubscriptionLabel', { ns: 'portal' })} *
                              </label>
                              <select
                                className="input-base h-9 text-sm"
                                value={row.personal_subscription_id}
                                onChange={(event) => {
                                  const subscription = eligiblePersonalSubscriptionMap.get(event.target.value);
                                  updateDraftRow(
                                    row.id,
                                    (draft) => (subscription
                                      ? applyPersonalSubscriptionToDraft(draft, subscription)
                                      : { ...draft, personal_subscription_id: '', account_id: '', category_id: '', amount: '', currency: '', description: '', merchant: '', notes: '' })
                                  );
                                }}
                              >
                                <option value="">{t('transactions.form.selectPersonalSubscription', { ns: 'portal' })}</option>
                                {eligiblePersonalSubscriptions.map((subscription) => (
                                  <option key={subscription.id} value={subscription.id}>
                                    {subscription.provider
                                      ? `${subscription.name} · ${subscription.provider} · ${subscription.currency_code} ${subscription.amount.toFixed(2)}`
                                      : `${subscription.name} · ${subscription.currency_code} ${subscription.amount.toFixed(2)}`}
                                  </option>
                                ))}
                              </select>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {eligiblePersonalSubscriptions.length > 0
                                  ? t('transactions.form.personalSubscriptionHelper', { ns: 'portal' })
                                  : t('transactions.form.noActivePersonalSubscriptions', { ns: 'portal' })}
                              </p>
                            </div>
                          </div>

                          {selectedSubscription ? (
                            <div className="rounded-2xl border border-border/70 bg-muted/10 p-3 max-[480px]:order-1">
                              <div className="mb-2 flex items-center gap-2 text-sm font-600 text-foreground">
                                <RefreshCw size={14} className="text-accent" />
                                <span>{t('transactions.form.subscriptionPaymentSummary', { ns: 'portal' })}</span>
                              </div>
                              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                <div className="rounded-xl border border-border/60 bg-card px-3 py-2">
                                  <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">
                                    {t('transactions.form.personalSubscriptionLabel', { ns: 'portal' })}
                                  </p>
                                  <p className="mt-1 text-sm font-600 text-foreground">{selectedSubscription.name}</p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-card px-3 py-2">
                                  <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">
                                    {t('transactions.form.paidFrom', { ns: 'portal', defaultValue: 'Paid from' })}
                                  </p>
                                  <p className="mt-1 text-sm font-600 text-foreground">
                                    {selectedSubscription.financial_account_id
                                      ? (() => {
                                        const subscriptionAccount = accountMap.get(selectedSubscription.financial_account_id);
                                        const displayAccount =
                                          subscriptionAccount || {
                                            name: selectedSubscription.account?.name || t('transactions.noAccount', { ns: 'portal' }),
                                            currency: selectedSubscription.account?.currency || selectedSubscription.currency_code,
                                            is_system_default: false,
                                            system_default_type: null,
                                          };
                                        return getFinancialAccountDisplayLabel(displayAccount, {
                                          includeCurrency: true,
                                          includeDefaultLabel: true,
                                        });
                                      })()
                                      : t('transactions.noAccount', { ns: 'portal' })}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-card px-3 py-2">
                                  <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">
                                    {t('transactions.category', { ns: 'portal' })}
                                  </p>
                                  <p className="mt-1 text-sm font-600 text-foreground">
                                    {selectedSubscription.category_id
                                      ? translateSystemCategoryName(
                                        categoryMap.get(selectedSubscription.category_id)?.name || selectedSubscription.category?.name || '',
                                        (key, options) => t(key, { ...(options || {}), ns: 'common' })
                                      ) || t('transactions.noCategory', { ns: 'portal' })
                                      : t('transactions.noCategory', { ns: 'portal' })}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-card px-3 py-2">
                                  <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">
                                    {t('transactions.amount', { ns: 'portal' })}
                                  </p>
                                  <p className="mt-1 text-sm font-700 text-foreground">
                                    {selectedSubscription.currency_code} {selectedSubscription.amount.toFixed(2)}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-card px-3 py-2">
                                  <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">
                                    {t('transactions.form.merchantLabel', { ns: 'portal' })}
                                  </p>
                                  <p className="mt-1 text-sm font-600 text-foreground">
                                    {selectedSubscription.provider || t('notAvailable', { ns: 'common' })}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-border/60 bg-card px-3 py-2">
                                  <p className="text-xs font-600 uppercase tracking-wide text-muted-foreground">
                                    {t('transactions.form.descriptionLabel', { ns: 'portal' })}
                                  </p>
                                  <p className="mt-1 text-sm font-600 text-foreground">
                                    {selectedSubscription.description || selectedSubscription.name}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 max-[480px]:order-2">
                            <div>
                              <label className="mb-1 block text-sm font-600 text-foreground">
                                {row.transaction_type === 'income'
                                  ? t('transactions.form.receivedInto', { ns: 'portal', defaultValue: 'Received into' })
                                  : t('transactions.form.paidFrom', { ns: 'portal', defaultValue: 'Paid from' })} *
                              </label>
                              <select
                                className="input-base h-9 text-sm"
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
                                <option value="">{t('transactions.selectAccount', { ns: 'portal' })}</option>
                                {selectorAccounts.map((accountOption) => (
                                  <option key={accountOption.id} value={accountOption.id}>
                                    {getFinancialAccountDisplayLabel(accountOption, {
                                      includeCurrency: true,
                                      includeDefaultLabel: true,
                                    })}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {isLoanRepaymentRow ? (
                              <div>
                                <label className="mb-1 block text-sm font-600 text-foreground">
                                  {t('settlements.person', { ns: 'portal', defaultValue: 'Person' })} *
                                </label>
                                <select
                                  className="input-base h-9 text-sm"
                                  value={row.person_id}
                                  onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, person_id: event.target.value }))}
                                >
                                  <option value="">{t('settlements.selectPerson', { ns: 'portal' })}</option>
                                  {people.map((person) => (
                                    <option key={person.id} value={person.id}>{person.full_name}</option>
                                  ))}
                                </select>
                              </div>
                            ) : (
                              <div>
                                <label className="mb-1 block text-sm font-600 text-foreground">{t('transactions.category', { ns: 'portal' })}</label>
                                <select
                                  className="input-base h-9 text-sm"
                                  value={row.category_id}
                                  onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, category_id: event.target.value }))}
                                >
                                  <option value="">{t('transactions.noCategory', { ns: 'portal' })}</option>
                                  {filteredCategories.map((category) => (
                                    <option key={category.id} value={category.id}>
                                      {translateSystemCategoryName(category.name, (key, options) =>
                                        t(key, { ...(options || {}), ns: 'common' })
                                      )}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>

                          <div className="rounded-2xl border border-border/70 bg-muted/10 p-2 max-[480px]:order-1 max-[480px]:space-y-3">
                            <div className="max-[480px]:hidden">
                              <label className="mb-1 block text-sm font-600 text-foreground">{t('transactions.amount', { ns: 'portal' })} *</label>
                            </div>
                            <div className="hidden max-[480px]:block">
                              <label className="mb-1 block text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">{t('transactions.amount', { ns: 'portal' })}</label>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              <div>
                                <input
                                  ref={index === 0 ? firstAmountFieldRef : undefined}
                                  type="number"
                                  step="0.01"
                                  min="0.01"
                                  inputMode="decimal"
                                  className="input-base h-11 text-base font-tabular max-[480px]:h-14 max-[480px]:text-2xl max-[480px]:font-800"
                                  placeholder="0.00"
                                  value={row.amount}
                                  onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, amount: event.target.value }))}
                                />
                              </div>
                              <div>
                                <CurrencySelector
                                  value={row.currency}
                                  onChange={(currencyCode) => updateDraftRow(row.id, (draft) => ({ ...draft, currency: currencyCode }))}
                                  placeholder={t('settlements.chooseCurrency', { ns: 'portal' })}
                                  disabled={Boolean(account)}
                                  helperText={account ? t('transactions.form.usesAccountCurrency', { ns: 'portal', currency: account.currency }) : t('transactions.form.chooseTransactionCurrency', { ns: 'portal' })}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="max-[480px]:order-4">
                            <label className="mb-1 block text-sm font-600 text-foreground">{t('transactions.date', { ns: 'portal' })} *</label>
                            <input
                              type="date"
                              className="input-base h-9 text-sm"
                              value={row.transaction_date}
                              onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, transaction_date: event.target.value }))}
                            />
                          </div>

                          {isLoanRepaymentRow ? (
                            <div className="max-[480px]:order-5">
                              <label className="mb-1 block text-sm font-600 text-foreground">
                                {t('reimbursements.notes', { ns: 'portal' })} *
                              </label>
                              <textarea
                                rows={3}
                                className="input-base resize-none text-sm"
                                placeholder={t('transactions.form.notesPlaceholder', { ns: 'portal' })}
                                value={row.notes}
                                onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, notes: event.target.value }))}
                              />
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 max-[480px]:order-5">
                              <div className="min-w-0">
                                <label className="mb-1 block text-sm font-600 text-foreground">{t('transactions.form.merchantLabel', { ns: 'portal' })}</label>
                                <input
                                  type="text"
                                  className="input-base h-9 min-w-0 w-full text-sm"
                                  placeholder={t('transactions.form.merchantPlaceholder', { ns: 'portal' })}
                                  value={row.merchant}
                                  onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, merchant: event.target.value }))}
                                />
                              </div>
                              <div className="min-w-0">
                                <label className="mb-1 block text-sm font-600 text-foreground">{t('transactions.form.descriptionLabel', { ns: 'portal' })} *</label>
                                <input
                                  type="text"
                                  className="input-base h-9 min-w-0 w-full text-sm"
                                  placeholder={t('transactions.form.descriptionPlaceholder', { ns: 'portal' })}
                                  value={row.description}
                                  onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, description: event.target.value }))}
                                />
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {!isSubscriptionPaymentRow ? (
                      <div className="rounded-xl border border-border/70 bg-muted/10 max-[480px]:order-6">
                        <button
                          type="button"
                          onClick={() => updateDraftRow(row.id, (draft) => ({ ...draft, showMoreOptions: !draft.showMoreOptions }))}
                          aria-expanded={row.showMoreOptions}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-600 text-foreground"
                        >
                          <span>{t('transactions.form.moreDetails', { ns: 'portal' })}</span>
                          {row.showMoreOptions ? <ChevronUpIcon size={15} /> : <ChevronDownIcon size={15} />}
                        </button>

                        {row.showMoreOptions ? (
                          <div className="space-y-2 border-t border-border/70 px-3 py-2">
                            {!isLoanRepaymentRow ? (
                              <div>
                                <label className="mb-1 block text-sm font-600 text-foreground">{t('transactions.tags', { ns: 'portal' })}</label>
                                <div className="relative">
                                  <Tag size={14} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                  <input
                                    type="text"
                                    className="input-base h-9 pl-11 pr-3 text-sm"
                                    placeholder={t('transactions.form.tagsPlaceholder', { ns: 'portal' })}
                                    value={row.tags}
                                    onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, tags: event.target.value }))}
                                  />
                                </div>
                              </div>
                            ) : null}

                            {spaceId ? (
                              <div className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-3">
                                <div>
                                  <p className="text-sm font-700 text-foreground">
                                    {spaceName
                                      ? t('transactions.form.spaceDetailsTitle', {
                                        ns: 'portal',
                                        defaultValue: 'Space details for {{space}}',
                                        space: spaceName,
                                      })
                                      : t('transactions.form.spaceDetailsTitleGeneric', {
                                        ns: 'portal',
                                        defaultValue: 'Space details',
                                      })}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {requiresSpacePayer
                                      ? t('transactions.form.spacePayerRequiredHelper', {
                                        ns: 'portal',
                                        defaultValue: 'Shared personal accounts require a payer so reimbursements and balances stay correct.',
                                      })
                                      : t('transactions.form.spacePayerOptionalHelper', {
                                        ns: 'portal',
                                        defaultValue: 'Choose who paid for this Space transaction when relevant.',
                                      })}
                                  </p>
                                </div>

                                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                                  <div>
                                    <label className="mb-1 block text-sm font-600 text-foreground">
                                      {t('transactions.form.spacePayerLabel', {
                                        ns: 'portal',
                                        defaultValue: 'Paid by',
                                      })}
                                      {requiresSpacePayer ? ' *' : ''}
                                    </label>
                                    <select
                                      className="input-base h-9 text-sm"
                                      value={selectedPayerKey}
                                      onChange={(event) => {
                                        const participant = spaceParticipants.find((option) => option.key === event.target.value) || null;
                                        updateDraftRow(row.id, (draft) => ({
                                          ...draft,
                                          paid_by_user_id: participant?.member_user_id || '',
                                          paid_by_person_id: participant?.managed_person_id || '',
                                        }));
                                      }}
                                    >
                                      <option value="">
                                        {requiresSpacePayer
                                          ? t('transactions.form.selectSpacePayer', {
                                            ns: 'portal',
                                            defaultValue: 'Select who paid',
                                          })
                                          : t('transactions.form.noSpacePayerSelected', {
                                            ns: 'portal',
                                            defaultValue: 'No payer selected',
                                          })}
                                      </option>
                                      {spaceParticipants.map((participant) => (
                                        <option key={`${row.id}-payer-${participant.key}`} value={participant.key}>
                                          {participant.subtitle
                                            ? `${participant.label} - ${participant.subtitle}`
                                            : participant.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="mb-1 block text-sm font-600 text-foreground">
                                      {t('transactions.form.spaceSplitMethodLabel', {
                                        ns: 'portal',
                                        defaultValue: 'Split method',
                                      })}
                                    </label>
                                    <select
                                      className="input-base h-9 text-sm"
                                      value={row.split_method}
                                      onChange={(event) => {
                                        const nextSplitMethod = event.target.value as SpaceSplitMethod;
                                        updateDraftRow(row.id, (draft) => ({
                                          ...draft,
                                          split_method: nextSplitMethod,
                                          space_allocations: draft.space_allocations.map((allocation, allocationIndex) => ({
                                            ...allocation,
                                            selected: nextSplitMethod === 'none'
                                              ? allocationIndex === 0
                                              : allocation.selected,
                                          })),
                                        }));
                                      }}
                                    >
                                      <option value="none">{t('transactions.form.splitMethodNone', { ns: 'portal', defaultValue: 'Single beneficiary' })}</option>
                                      <option value="equal">{t('transactions.form.splitMethodEqual', { ns: 'portal', defaultValue: 'Equal split' })}</option>
                                      <option value="exact">{t('transactions.form.splitMethodExact', { ns: 'portal', defaultValue: 'Exact amounts' })}</option>
                                      <option value="percentage">{t('transactions.form.splitMethodPercentage', { ns: 'portal', defaultValue: 'Percentages' })}</option>
                                      <option value="shares">{t('transactions.form.splitMethodShares', { ns: 'portal', defaultValue: 'Shares' })}</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="text-sm font-600 text-foreground">
                                      {t('transactions.form.spaceBeneficiariesLabel', {
                                        ns: 'portal',
                                        defaultValue: 'Beneficiaries',
                                      })}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {t('transactions.form.spaceBeneficiariesSummary', {
                                        ns: 'portal',
                                        count: selectedAllocations.length,
                                        defaultValue: '{{count}} selected',
                                      })}
                                    </p>
                                  </div>
                                  {row.space_allocations.length === 0 ? (
                                    <p className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                      {t('transactions.form.noSpaceParticipants', {
                                        ns: 'portal',
                                        defaultValue: 'No eligible Space participants are available yet.',
                                      })}
                                    </p>
                                  ) : (
                                    row.space_allocations.map((allocation) => (
                                      <div key={`${row.id}-allocation-${allocation.participant_key}`} className="rounded-xl border border-border bg-muted/10 p-3">
                                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                                          <label className="flex min-w-0 items-start gap-3">
                                            <input
                                              type="checkbox"
                                              className="mt-1 h-4 w-4 rounded border-border accent-accent"
                                              checked={allocation.selected}
                                              onChange={(event) => {
                                                const checked = event.target.checked;
                                                updateDraftRow(row.id, (draft) => ({
                                                  ...draft,
                                                  space_allocations: draft.space_allocations.map((item) => {
                                                    if (draft.split_method === 'none') {
                                                      return {
                                                        ...item,
                                                        selected: item.participant_key === allocation.participant_key ? checked : false,
                                                      };
                                                    }
                                                    return item.participant_key === allocation.participant_key
                                                      ? { ...item, selected: checked }
                                                      : item;
                                                  }),
                                                }));
                                              }}
                                            />
                                            <span className="min-w-0">
                                              <span className="block text-sm font-600 text-foreground">{allocation.label}</span>
                                              {allocation.subtitle ? (
                                                <span className="mt-1 block text-xs text-muted-foreground">{allocation.subtitle}</span>
                                              ) : null}
                                            </span>
                                          </label>
                                          {allocation.selected ? (
                                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                              <input
                                                type="checkbox"
                                                className="h-4 w-4 rounded border-border accent-accent"
                                                checked={allocation.reimbursement_required}
                                                onChange={(event) => {
                                                  updateDraftRow(row.id, (draft) => ({
                                                    ...draft,
                                                    space_allocations: draft.space_allocations.map((item) => item.participant_key === allocation.participant_key
                                                      ? { ...item, reimbursement_required: event.target.checked }
                                                      : item),
                                                  }));
                                                }}
                                              />
                                              {t('transactions.form.spaceReimbursementRequired', {
                                                ns: 'portal',
                                                defaultValue: 'Needs reimbursement',
                                              })}
                                            </label>
                                          ) : null}
                                        </div>

                                        {allocation.selected && row.split_method !== 'equal' && row.split_method !== 'none' ? (
                                          <div className="mt-3">
                                            {row.split_method === 'exact' ? (
                                              <div>
                                                <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">
                                                  {t('transactions.form.allocatedAmountLabel', {
                                                    ns: 'portal',
                                                    defaultValue: 'Allocated amount',
                                                  })}
                                                </label>
                                                <input
                                                  type="number"
                                                  step="0.01"
                                                  min="0"
                                                  className="input-base h-9 text-sm"
                                                  value={allocation.allocated_amount}
                                                  onChange={(event) => {
                                                    updateDraftRow(row.id, (draft) => ({
                                                      ...draft,
                                                      space_allocations: draft.space_allocations.map((item) => item.participant_key === allocation.participant_key
                                                        ? { ...item, allocated_amount: event.target.value }
                                                        : item),
                                                    }));
                                                  }}
                                                />
                                              </div>
                                            ) : null}
                                            {row.split_method === 'percentage' ? (
                                              <div>
                                                <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">
                                                  {t('transactions.form.allocationPercentageLabel', {
                                                    ns: 'portal',
                                                    defaultValue: 'Percentage',
                                                  })}
                                                </label>
                                                <input
                                                  type="number"
                                                  step="0.01"
                                                  min="0"
                                                  className="input-base h-9 text-sm"
                                                  value={allocation.percentage}
                                                  onChange={(event) => {
                                                    updateDraftRow(row.id, (draft) => ({
                                                      ...draft,
                                                      space_allocations: draft.space_allocations.map((item) => item.participant_key === allocation.participant_key
                                                        ? { ...item, percentage: event.target.value }
                                                        : item),
                                                    }));
                                                  }}
                                                />
                                              </div>
                                            ) : null}
                                            {row.split_method === 'shares' ? (
                                              <div>
                                                <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">
                                                  {t('transactions.form.allocationSharesLabel', {
                                                    ns: 'portal',
                                                    defaultValue: 'Shares',
                                                  })}
                                                </label>
                                                <input
                                                  type="number"
                                                  step="0.01"
                                                  min="0.01"
                                                  className="input-base h-9 text-sm"
                                                  value={allocation.shares}
                                                  onChange={(event) => {
                                                    updateDraftRow(row.id, (draft) => ({
                                                      ...draft,
                                                      space_allocations: draft.space_allocations.map((item) => item.participant_key === allocation.participant_key
                                                        ? { ...item, shares: event.target.value }
                                                        : item),
                                                    }));
                                                  }}
                                                />
                                              </div>
                                            ) : null}
                                          </div>
                                        ) : null}
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            ) : !isLoanRepaymentRow ? (
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
                                className="flex w-full items-center justify-between bg-muted/30 px-3 py-2 text-sm font-600 text-foreground"
                              >
                                <span className="flex items-center gap-2">
                                  <Users size={14} className="text-accent" />
                                  {t('transactions.form.managedPersonSharedExpense', { ns: 'portal' })}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-600 ${row.showManagedPerson ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'}`}>
                                  {row.showManagedPerson ? t('status.active', { ns: 'common' }) : t('reimbursements.optional', { ns: 'portal' })}
                                </span>
                              </button>

                              {row.showManagedPerson ? (
                                <div className="space-y-2 border-t border-border/70 px-3 py-2">
                                  <div>
                                    <label className="mb-1 block text-sm font-600 text-foreground">{t('transactions.form.managedPerson', { ns: 'portal' })}</label>
                                    <select
                                      className="input-base h-10 text-sm"
                                      value={row.person_id}
                                      onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, person_id: event.target.value }))}
                                    >
                                      <option value="">{t('settlements.selectPerson', { ns: 'portal' })}</option>
                                      {people.map((person) => (
                                        <option key={person.id} value={person.id}>{person.full_name}</option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                    <div>
                                      <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">{t('transactions.form.expenseBelongsTo', { ns: 'portal' })}</label>
                                      <select className="input-base h-9 text-sm" value={row.expense_owner} onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, expense_owner: event.target.value }))}>
                                        <option value="user">{t('transactions.form.ownedByMe', { ns: 'portal' })}</option>
                                        <option value="person">{t('transactions.form.person', { ns: 'portal' })}</option>
                                        <option value="shared">{t('transactions.form.shared', { ns: 'portal' })}</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">{t('transactions.form.paidBy', { ns: 'portal' })}</label>
                                      <select className="input-base h-9 text-sm" value={row.paid_by} onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, paid_by: event.target.value }))}>
                                        <option value="user">{t('transactions.form.paidByMe', { ns: 'portal' })}</option>
                                        <option value="person">{t('transactions.form.person', { ns: 'portal' })}</option>
                                        <option value="third_party">{t('transactions.form.thirdParty', { ns: 'portal' })}</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="mb-1 block text-xs font-600 uppercase tracking-wide text-muted-foreground">{t('transactions.form.paidFrom', { ns: 'portal' })}</label>
                                      <select
                                        className="input-base h-9 text-sm"
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
                                        <option value="account">{t('transactions.account', { ns: 'portal' })}</option>
                                        <option value="held_balance">{t('transactions.form.heldBalance', { ns: 'portal' })}</option>
                                        <option value="cash">{t('accounts.types.cash', { ns: 'portal' })}</option>
                                        <option value="external">{t('transactions.form.external', { ns: 'portal' })}</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_170px]">
                                    <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm text-foreground">
                                      <input
                                        type="checkbox"
                                        checked={row.reimbursement_required}
                                        onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, reimbursement_required: event.target.checked }))}
                                        className="rounded accent-accent"
                                      />
                                      {t('transactions.form.reimbursementRequired', { ns: 'portal' })}
                                    </label>
                                    {row.reimbursement_required ? (
                                      <select
                                        className="input-base h-9 text-sm"
                                        value={row.reimbursement_status}
                                        onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, reimbursement_status: event.target.value }))}
                                      >
                                        <option value="">{t('transactions.form.reimbursementStatus', { ns: 'portal' })}</option>
                                        <option value="pending">{t('reimbursements.statuses.pending', { ns: 'portal' })}</option>
                                        <option value="partially_paid">{t('reimbursements.statuses.partially_paid', { ns: 'portal' })}</option>
                                        <option value="settled">{t('reimbursements.statuses.settled', { ns: 'portal' })}</option>
                                        <option value="waived">{t('reimbursements.statuses.waived', { ns: 'portal' })}</option>
                                        <option value="cancelled">{t('reimbursements.statuses.cancelled', { ns: 'portal' })}</option>
                                      </select>
                                    ) : null}
                                  </div>
                                </div>
                              ) : null}
                              </div>
                            ) : null}

                            <div>
                              <label className="mb-1 block text-sm font-600 text-foreground">{t('transactions.form.receiptAttachment', { ns: 'portal' })}</label>
                              <div className="rounded-xl border-2 border-dashed border-border px-3.5 py-2.5 text-center">
                                <input
                                  type="file"
                                  id={`receipt-upload-${row.id}`}
                                  accept={TRANSACTION_DOCUMENT_ACCEPT_ATTRIBUTE}
                                  className="hidden"
                                  onChange={async (event) => {
                                    const file = event.target.files?.[0];
                                    try {
                                      if (file) {
                                        await validateTransactionDocumentFile(file);
                                      }
                                      updateDraftRow(row.id, (draft) => ({ ...draft, receiptFile: file || null }));
                                    } catch (error) {
                                      toast.error(getLocalizedDocumentValidationError(t, error));
                                    }
                                    event.currentTarget.value = '';
                                  }}
                                />
                                <label htmlFor={`receipt-upload-${row.id}`} className="cursor-pointer text-sm text-muted-foreground">
                                  <Upload size={18} className="mx-auto mb-1 text-muted-foreground" />
                                  {row.receiptFile ? row.receiptFile.name : t('transactions.form.uploadReceipt', { ns: 'portal' })}
                                </label>
                                {row.receiptFile ? (
                                  <button type="button" onClick={() => updateDraftRow(row.id, (draft) => ({ ...draft, receiptFile: null }))} className="mt-2 text-xs text-negative hover:underline">
                                    {t('actions.remove', { ns: 'common' })}
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            {!isLoanRepaymentRow ? (
                              <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm text-foreground">
                                <input
                                  type="checkbox"
                                  checked={row.is_recurring}
                                  onChange={(event) => updateDraftRow(row.id, (draft) => ({ ...draft, is_recurring: event.target.checked }))}
                                  className="rounded accent-accent"
                                />
                                {t('transactions.form.markAsRecurring', { ns: 'portal' })}
                              </label>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      ) : null}
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
              {t('transactions.form.addAnotherTransaction', { ns: 'portal' })}
            </button>
          ) : null}
        </div>

        <div className="sticky bottom-0 z-10 mt-2 border-t border-border bg-card/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 backdrop-blur sm:px-3.5 sm:pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {isSaving && saveProgress
                ? t('transactions.form.savingProgress', { ns: 'portal', completed: saveProgress.completed, total: saveProgress.total })
                : activeDraftRows.filter(isDraftRowPopulated).length > 1
                  ? t('transactions.form.multipleUnsaved', { ns: 'portal' })
                  : editingTransaction
                    ? t('transactions.form.editingSelected', { ns: 'portal' })
                    : null}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button type="button" onClick={handleRequestClose} disabled={isSaving} className="btn-secondary w-full sm:w-auto">
                {t('actions.cancel', { ns: 'common' })}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving || activeDraftRows.length === 0 || supportingDataLoading}
                className="btn-primary w-full justify-center whitespace-normal text-center sm:w-auto sm:whitespace-nowrap"
              >
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
      {isOpen && documentReviewFile ? (
        <DocumentTransactionReviewModal
          isOpen
          file={documentReviewFile}
          sourceSurface="add_transaction"
          onClose={() => setDocumentReviewFile(null)}
          onSaved={async () => {
            dispatchSmartPocketDataChanged({
              source: 'transactions-document-review',
              entities: ['transactions', 'financial_accounts', 'dashboard'],
            });
            await onSaved?.();
            closeModalAndReset();
          }}
        />
      ) : null}
      {pendingConfirmation ? (
        <ConfirmationModal
        open
        title={pendingConfirmation?.title || t('actions.confirm', { ns: 'common', defaultValue: 'Confirm' })}
        description={pendingConfirmation?.description}
        confirmLabel={pendingConfirmation?.confirmLabel}
        cancelLabel={pendingConfirmation?.cancelLabel}
        onConfirm={() => {
          if (!pendingConfirmation) {
            return;
          }
          pendingConfirmation.onConfirm();
          setPendingConfirmation(null);
        }}
        onClose={() => setPendingConfirmation(null)}
        confirmTone={pendingConfirmation?.confirmTone}
        />
      ) : null}
    </>
  );
}
