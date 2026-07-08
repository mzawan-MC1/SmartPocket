'use client';
import React, { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { useTranslation } from 'react-i18next';

import {
  Home,
  Plus,
  Users,
  Mail,
  MoreVertical,
  Archive,
  Edit2,
  Crown,
  Shield,
  Eye,
  UserPlus,
  Clock,
  XCircle,
  Trash2,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  HandCoins,
  Repeat,
  CircleDollarSign,
  ArrowLeftRight,
  ReceiptText,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import {
  getMySpaceMemberships, getSpaces, createSpace, updateSpace, archiveSpace,
  getMyPendingInvitations, getSpaceMembers, getSpaceInvitations, inviteToSpaceDetailed, revokeInvitation,
  respondToInvitation, updateSpaceMemberRole, removeSpaceMember,
  SPACE_MEMBER_ASSIGNABLE_ROLES, canManageSpaceMemberRole, canRemoveSpaceMember,
  type Space, type SpaceMember, type SpaceInvitation, type SpaceRole
} from '@/lib/spaces';
import {
  getAccounts,
  getTransactions,
  getBudgetTrackingOverview,
  getReportViewData,
  getSpaceContributions,
  type BudgetTrackingOverview,
  type FinancialAccount,
  type ReportViewData,
  type SpaceContribution,
  type Transaction,
} from '@/lib/finance';
import {
  getSpaceReimbursements,
  getSpaceSettlements,
  type Reimbursement,
  type Settlement,
} from '@/lib/people';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import {
  getFieldErrorTextClassName,
  getFieldInputClassName,
  getFieldLabelClassName,
} from '@/lib/form-field-styles';
import { hasSubscriptionFeature } from '@/lib/subscription/entitlements';
import { getSpaceOwnedFinancialAccounts } from '@/lib/financial-account-utils';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import type { HistoricalReportConvertedMetric } from '@/lib/finance';

const FinancialAccountForm = dynamic(() => import('@/app/financial-accounts/components/FinancialAccountForm'), {
  ssr: false,
  loading: () => <div className="p-4 text-sm text-muted-foreground">Loading...</div>,
});

const AddTransactionModal = dynamic(() => import('@/app/transactions/components/AddTransactionModal'), {
  ssr: false,
  loading: () => null,
});

const RecurringTransactionForm = dynamic(() => import('@/app/recurring/components/RecurringTransactionForm'), {
  ssr: false,
  loading: () => <div className="p-4 text-sm text-muted-foreground">Loading...</div>,
});

const ROLE_COLORS: Record<SpaceRole, string> = {
  owner: 'bg-accent/10 text-accent',
  manager: 'bg-positive-soft text-positive',
  contributor: 'bg-info-soft text-info',
  viewer: 'bg-muted text-muted-foreground',
  dependent: 'bg-warning-soft text-warning',
};

const ROLE_ICONS: Record<SpaceRole, React.ElementType> = {
  owner: Crown, manager: Shield, contributor: Edit2,
  viewer: Eye, dependent: Users,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-soft text-warning',
  accepted: 'bg-positive-soft text-positive',
  declined: 'bg-negative-soft text-negative',
  revoked: 'bg-muted text-muted-foreground',
};

const ACTIVITY_ICONS: Record<SpaceRecentActivityItem['kind'], React.ElementType> = {
  income: ArrowDownCircle,
  expense: ArrowUpCircle,
  transfer: ArrowLeftRight,
  contribution: HandCoins,
  owed: ReceiptText,
  payment: CircleDollarSign,
};

const ACTIVITY_BADGE_COLORS: Record<SpaceRecentActivityItem['kind'], string> = {
  income: 'bg-positive-soft text-positive',
  expense: 'bg-muted text-foreground',
  transfer: 'bg-info-soft text-info',
  contribution: 'bg-positive-soft text-positive',
  owed: 'bg-warning-soft text-warning',
  payment: 'bg-info-soft text-info',
};

const SPACE_COLORS = ['#0f3460', '#00b4d8', '#7c3aed', '#059669', '#d97706', '#dc2626'];

function getSpaceTypeLabel(
  type: Space['space_type'],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`spaces.types.${type}`);
}

function getRoleLabel(
  role: SpaceRole,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`spaces.roles.${role}`);
}

function getInvitationStatusLabel(
  status: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (status) {
    case 'pending':
      return t('status.pending', { ns: 'common' });
    case 'accepted':
      return t('spaces.status.accepted');
    case 'declined':
      return t('spaces.status.declined');
    case 'revoked':
      return t('spaces.status.revoked');
    default:
      return status;
  }
}

function getCurrentMonthRange() {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10);
  const startDate = `${endDate.slice(0, 7)}-01`;
  return { startDate, endDate };
}

function groupAmountsByCurrency(rows: Array<{ amount: number; currency: string }>) {
  return Array.from(
    rows.reduce((map, row) => {
      const currency = row.currency.trim().toUpperCase();
      if (!currency) return map;
      map.set(currency, (map.get(currency) || 0) + Number(row.amount || 0));
      return map;
    }, new Map<string, number>())
  )
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function getRoleExplanation(
  role: SpaceRole,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (role) {
    case 'owner':
      return t('spaces.ui.roleHelp.owner', { ns: 'portal' });
    case 'manager':
      return t('spaces.ui.roleHelp.manager', { ns: 'portal' });
    case 'contributor':
      return t('spaces.ui.roleHelp.contributor', { ns: 'portal' });
    case 'viewer':
      return t('spaces.ui.roleHelp.viewer', { ns: 'portal' });
    case 'dependent':
      return t('spaces.ui.roleHelp.dependent', { ns: 'portal' });
    default:
      return '';
  }
}

function getActivityTypeLabel(
  type: 'income' | 'expense' | 'transfer' | 'contribution' | 'owed' | 'payment',
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (type) {
    case 'income':
      return t('spaces.ui.activity.labels.income', { ns: 'portal' });
    case 'expense':
      return t('spaces.ui.activity.labels.expense', { ns: 'portal' });
    case 'transfer':
      return t('spaces.ui.activity.labels.transfer', { ns: 'portal' });
    case 'contribution':
      return t('spaces.ui.activity.labels.contribution', { ns: 'portal' });
    case 'owed':
      return t('spaces.ui.activity.labels.owed', { ns: 'portal' });
    case 'payment':
      return t('spaces.ui.activity.labels.payment', { ns: 'portal' });
    default:
      return '';
  }
}

function getMetricRows(metric: HistoricalReportConvertedMetric | null | undefined) {
  if (!metric) {
    return [];
  }

  if (metric.reportingAmount !== null) {
    return [{ currency: metric.reportingCurrency, amount: metric.reportingAmount }];
  }

  return metric.originalTotals || [];
}

function formatDisplayDate(value: string | null | undefined, locale: string) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(locale);
}

type SpaceRecentActivityItem = {
  id: string;
  kind: 'income' | 'expense' | 'transfer' | 'contribution' | 'owed' | 'payment';
  title: string;
  subtitle: string;
  amount: number;
  currency: string;
  date: string;
  dateLabel: string;
  toneClassName: string;
};

function buildSpaceRecentActivityItems({
  transactions,
  contributions,
  reimbursements,
  settlements,
  language,
  t,
}: {
  transactions: Transaction[];
  contributions: SpaceContribution[];
  reimbursements: Reimbursement[];
  settlements: Settlement[];
  language: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}): SpaceRecentActivityItem[] {
  const transactionItems = transactions.map<SpaceRecentActivityItem>((transaction) => {
    const categoryName = transaction.category?.name
      ? translateSystemCategoryName(transaction.category.name, (key, options) =>
          t(key, { ...(options || {}), ns: 'common' })
        )
      : t('spaces.ui.activity.uncategorized', { ns: 'portal' });
    const accountName = transaction.account?.name || t('spaces.ui.activity.sharedAccountFallback', { ns: 'portal' });
    const formattedDate = formatDisplayDate(transaction.transaction_date, language)
      || transaction.transaction_date;

    let kind: SpaceRecentActivityItem['kind'] = transaction.transaction_type;
    let title = transaction.description || transaction.merchant || '';

    if (!title) {
      if (transaction.transaction_type === 'income') {
        title = t('spaces.ui.activity.moneyAddedToAccount', { ns: 'portal', account: accountName });
      } else if (transaction.transaction_type === 'expense') {
        title = t('spaces.ui.activity.expensePaidFromAccount', { ns: 'portal', account: accountName });
      } else {
        title = t('spaces.ui.activity.transferBetweenAccounts', { ns: 'portal' });
      }
    }

    return {
      id: `transaction-${transaction.id}`,
      kind,
      title,
      subtitle: `${accountName} · ${categoryName}`,
      amount: transaction.transaction_type === 'expense'
        ? -Math.abs(Number(transaction.amount || 0))
        : Number(transaction.amount || 0),
      currency: transaction.currency,
      date: transaction.transaction_date,
      dateLabel: formattedDate,
      toneClassName: transaction.transaction_type === 'income'
        ? 'text-positive'
        : transaction.transaction_type === 'expense'
          ? 'text-foreground'
          : 'text-info',
    };
  });

  const contributionItems = contributions.map<SpaceRecentActivityItem>((contribution) => {
    const formattedDate = formatDisplayDate(contribution.contributed_at, language)
      || contribution.contributed_at;

    return {
      id: `contribution-${contribution.id}`,
      kind: 'contribution',
      title: t('spaces.ui.activity.memberContribution', { ns: 'portal' }),
      subtitle: contribution.notes?.trim()
        ? contribution.notes.trim()
        : getActivityTypeLabel('contribution', t),
      amount: Number(contribution.amount || 0),
      currency: contribution.currency,
      date: contribution.contributed_at,
      dateLabel: formattedDate,
      toneClassName: 'text-positive',
    };
  });

  const reimbursementItems = reimbursements
    .filter((reimbursement) => reimbursement.status === 'pending' || reimbursement.status === 'partially_paid')
    .map<SpaceRecentActivityItem>((reimbursement) => {
      const remainingAmount = Math.max(
        0,
        Number(reimbursement.amount || 0) - Number(reimbursement.amount_paid || 0)
      );
      const formattedDate = formatDisplayDate(
        reimbursement.due_date || reimbursement.created_at,
        language
      ) || reimbursement.due_date || reimbursement.created_at;
      const personName = reimbursement.person?.full_name
        || reimbursement.legacy_person?.full_name
        || reimbursement.beneficiary_person?.full_name
        || reimbursement.payer_person?.full_name
        || t('spaces.ui.activity.memberFallback', { ns: 'portal' });

      return {
        id: `reimbursement-${reimbursement.id}`,
        kind: 'owed',
        title: reimbursement.description || t('spaces.ui.activity.moneyOwedTitle', { ns: 'portal' }),
        subtitle: personName,
        amount: remainingAmount,
        currency: reimbursement.currency,
        date: reimbursement.due_date || reimbursement.created_at,
        dateLabel: formattedDate,
        toneClassName: 'text-warning',
      };
    });

  const settlementItems = settlements.map<SpaceRecentActivityItem>((settlement) => {
    const formattedDate = formatDisplayDate(settlement.settlement_date, language)
      || settlement.settlement_date;
    const personName = settlement.person?.full_name
      || settlement.legacy_person?.full_name
      || t('spaces.ui.activity.memberFallback', { ns: 'portal' });

    return {
      id: `settlement-${settlement.id}`,
      kind: 'payment',
      title: settlement.description || t('spaces.ui.activity.paymentTitle', { ns: 'portal' }),
      subtitle: personName,
      amount: Number(settlement.amount || 0),
      currency: settlement.currency,
      date: settlement.settlement_date,
      dateLabel: formattedDate,
      toneClassName: 'text-info',
    };
  });

  return [
    ...transactionItems,
    ...contributionItems,
    ...reimbursementItems,
    ...settlementItems,
  ].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

interface SpaceFormData {
  name: string;
  space_type: Space['space_type'];
  description: string;
  color: string;
  icon: string;
}

interface SpaceFinanceLoadError {
  loader: string;
  request: string;
  message: string;
  code: string | null;
  details: string | null;
  hint: string | null;
}

function normalizeSpaceFinanceLoadError(
  loader: string,
  request: string,
  error: unknown
): SpaceFinanceLoadError {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    return {
      loader,
      request,
      message: typeof candidate.message === 'string' && candidate.message
        ? candidate.message
        : error instanceof Error
          ? error.message
          : String(error),
      code: typeof candidate.code === 'string' ? candidate.code : null,
      details: typeof candidate.details === 'string' ? candidate.details : null,
      hint: typeof candidate.hint === 'string' ? candidate.hint : null,
    };
  }

  return {
    loader,
    request,
    message: error instanceof Error ? error.message : String(error),
    code: null,
    details: null,
    hint: null,
  };
}

const DEFAULT_FORM: SpaceFormData = {
  name: '', space_type: 'personal', description: '', color: '#0f3460', icon: 'Home',
};

function SpacesPageContent() {
  const { t } = useTranslation(['portal', 'common']);
  const { language, isRTL } = useLanguage();
  const { user } = useAuth();
  const {
    summary,
    loading: subscriptionLoading,
    error: subscriptionError,
    refresh: refreshSubscriptionSummary,
  } = useSubscriptionSummary();
  const hasSharedSpacesFeature = hasSubscriptionFeature(summary, 'shared_spaces');
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [receivedInvitations, setReceivedInvitations] = useState<SpaceInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [spaceRolesById, setSpaceRolesById] = useState<Record<string, SpaceRole>>({});
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [invitations, setInvitations] = useState<SpaceInvitation[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingFinance, setLoadingFinance] = useState(false);
  const [financeAccounts, setFinanceAccounts] = useState<FinancialAccount[]>([]);
  const [spaceTransactions, setSpaceTransactions] = useState<Transaction[]>([]);
  const [spaceReportData, setSpaceReportData] = useState<ReportViewData | null>(null);
  const [spaceContributions, setSpaceContributions] = useState<SpaceContribution[]>([]);
  const [spaceReimbursements, setSpaceReimbursements] = useState<Reimbursement[]>([]);
  const [spaceSettlements, setSpaceSettlements] = useState<Settlement[]>([]);
  const [spaceBudgetOverview, setSpaceBudgetOverview] = useState<BudgetTrackingOverview | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSpaceAccountModal, setShowSpaceAccountModal] = useState(false);
  const [showSpaceTransactionModal, setShowSpaceTransactionModal] = useState(false);
  const [showSpaceRecurringModal, setShowSpaceRecurringModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<SpaceRole>('viewer');
  const [form, setForm] = useState<SpaceFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [respondingInvitationId, setRespondingInvitationId] = useState<string | null>(null);
  const [spaceFormError, setSpaceFormError] = useState<string | null>(null);
  const [spaceNameError, setSpaceNameError] = useState<string | null>(null);
  const [spaceFinanceError, setSpaceFinanceError] = useState<SpaceFinanceLoadError | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    try {
      const [data, memberships] = await Promise.all([
        getSpaces(),
        getMySpaceMemberships(),
      ]);
      setSpaces(data);
      setSpaceRolesById(
        memberships.reduce<Record<string, SpaceRole>>((acc, membership) => {
          acc[membership.space.id] = membership.role;
          return acc;
        }, {})
      );
      if (data.length === 0) {
        setActiveSpaceId(null);
      } else if (!activeSpaceId || !data.some((space) => space.id === activeSpaceId)) {
        setActiveSpaceId(data[0].id);
      }
    } catch {
      toast.error(t('spaces.loadFailed', { ns: 'portal' }));
    } finally {
      setLoading(false);
    }
  }, [activeSpaceId, t]);

  const loadReceivedInvitations = useCallback(async () => {
    setLoadingInvitations(true);
    try {
      const data = await getMyPendingInvitations();
      setReceivedInvitations(data);
    } catch {
      toast.error(t('spaces.received.loadFailed', { ns: 'portal' }));
    } finally {
      setLoadingInvitations(false);
    }
  }, [t]);

  const loadSpaceDetails = useCallback(async (spaceId: string, canManageInvitations: boolean) => {
    setLoadingDetails(true);
    try {
      const [m, inv] = await Promise.all([
        getSpaceMembers(spaceId),
        canManageInvitations ? getSpaceInvitations(spaceId) : Promise.resolve([]),
      ]);
      setMembers(m);
      setInvitations(inv);
    } catch {
      toast.error(t('spaces.loadDetailsFailed', { ns: 'portal' }));
    } finally {
      setLoadingDetails(false);
    }
  }, [t]);

  const loadSpaceFinance = useCallback(async (spaceId: string) => {
    setLoadingFinance(true);
    setSpaceFinanceError(null);
    try {
      const { startDate, endDate } = getCurrentMonthRange();
      const [accountsData, transactionData, reportData, contributionsData, reimbursementsData, settlementsData, budgetOverview] = await Promise.all([
        getAccounts().catch((error) => {
          throw normalizeSpaceFinanceLoadError(
            'getAccounts',
            "getAccounts()",
            error
          );
        }),
        getTransactions({
          spaceId,
          context: 'space',
          limit: 8,
        }).catch((error) => {
          throw normalizeSpaceFinanceLoadError(
            'getTransactions',
            `getTransactions({ spaceId: "${spaceId}", context: "space", limit: 8 })`,
            error
          );
        }),
        getReportViewData({
          startDate,
          endDate,
          scopeType: 'space',
          spaceId,
          locale: language,
        }).catch((error) => {
          throw normalizeSpaceFinanceLoadError(
            'getReportViewData',
            `getReportViewData({ startDate: "${startDate}", endDate: "${endDate}", scopeType: "space", spaceId: "${spaceId}", locale: "${language}" })`,
            error
          );
        }),
        getSpaceContributions(spaceId).catch((error) => {
          throw normalizeSpaceFinanceLoadError(
            'getSpaceContributions',
            `from("space_contributions").select("*").eq("space_id", "${spaceId}")`,
            error
          );
        }),
        getSpaceReimbursements(spaceId).catch((error) => {
          throw normalizeSpaceFinanceLoadError(
            'getSpaceReimbursements',
            `from("reimbursements").select(...).eq("space_id", "${spaceId}")`,
            error
          );
        }),
        getSpaceSettlements(spaceId).catch((error) => {
          throw normalizeSpaceFinanceLoadError(
            'getSpaceSettlements',
            `from("settlements").select(...).eq("space_id", "${spaceId}")`,
            error
          );
        }),
        getBudgetTrackingOverview({
          referenceDate: endDate,
          scopeType: 'space',
          spaceId,
          locale: language,
        }).catch((error) => {
          throw normalizeSpaceFinanceLoadError(
            'getBudgetTrackingOverview',
            `getBudgetTrackingOverview({ referenceDate: "${endDate}", scopeType: "space", spaceId: "${spaceId}", locale: "${language}" })`,
            error
          );
        }),
      ]);

      setFinanceAccounts(accountsData);
      setSpaceTransactions(transactionData);
      setSpaceReportData(reportData);
      setSpaceContributions(contributionsData);
      setSpaceReimbursements(reimbursementsData);
      setSpaceSettlements(settlementsData);
      setSpaceBudgetOverview(budgetOverview);
    } catch (error) {
      setSpaceFinanceError(normalizeSpaceFinanceLoadError(
        'unknown',
        `loadSpaceFinance("${spaceId}")`,
        error
      ));
    } finally {
      setLoadingFinance(false);
    }
  }, [language]);

  useEffect(() => { loadSpaces(); }, [loadSpaces]);
  useEffect(() => { loadReceivedInvitations(); }, [loadReceivedInvitations]);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || null;
  const activeSpaceRole: SpaceRole | null = activeSpace
    ? (user?.id && activeSpace.owner_id === user.id ? 'owner' : spaceRolesById[activeSpace.id] || null)
    : null;
  const isActiveSpaceOwner = activeSpaceRole === 'owner';
  const canManageSpaceFinance = activeSpaceRole === 'owner' || activeSpaceRole === 'manager';
  const canAddSpaceTransactions = canManageSpaceFinance || activeSpaceRole === 'contributor';
  const canManageInvitations = isActiveSpaceOwner;
  const activeSpaceAccounts = activeSpace
    ? getSpaceOwnedFinancialAccounts(financeAccounts, activeSpace.id)
    : [];
  const totalBalanceByCurrency = groupAmountsByCurrency(
    activeSpaceAccounts.map((account) => ({
      amount: Number(account.current_balance || 0),
      currency: account.currency,
    }))
  );
  const contributionTotals = groupAmountsByCurrency(
    spaceContributions.map((contribution) => ({
      amount: Number(contribution.amount || 0),
      currency: contribution.currency,
    }))
  );
  const outstandingReimbursementTotals = groupAmountsByCurrency(
    spaceReimbursements
      .filter((reimbursement) => reimbursement.status === 'pending' || reimbursement.status === 'partially_paid')
      .map((reimbursement) => ({
        amount: Math.max(0, Number(reimbursement.amount || 0) - Number(reimbursement.amount_paid || 0)),
        currency: reimbursement.currency,
      }))
  );
  const budgetWarningCount = (spaceBudgetOverview?.items || []).filter((item) =>
    item.status === 'near_limit' || item.status === 'over_budget'
  ).length;

  useEffect(() => {
    if (activeSpaceId && activeSpace) {
      void Promise.all([
        loadSpaceDetails(activeSpaceId, canManageInvitations),
        loadSpaceFinance(activeSpaceId),
      ]);
    } else {
      setMembers([]);
      setInvitations([]);
      setFinanceAccounts([]);
      setSpaceTransactions([]);
      setSpaceReportData(null);
      setSpaceContributions([]);
      setSpaceReimbursements([]);
      setSpaceSettlements([]);
      setSpaceBudgetOverview(null);
    }
  }, [activeSpace, activeSpaceId, canManageInvitations, loadSpaceDetails, loadSpaceFinance]);

  const handleCreate = async () => {
    const nameRequiredMessage = t('spaces.nameRequired', { ns: 'portal' });
    setSpaceFormError(null);
    setSpaceNameError(null);
    if (!form.name.trim()) {
      setSpaceNameError(nameRequiredMessage);
      toast.error(nameRequiredMessage);
      return;
    }
    setSaving(true);
    try {
      await createSpace(form);
      toast.success(t('spaces.created', { ns: 'portal' }));
      closeSpaceFormModal();
      setForm(DEFAULT_FORM);
      loadSpaces();
    } catch (e: unknown) {
      const message = (e as Error).message || t('spaces.createFailed', { ns: 'portal' });
      setSpaceFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    const nameRequiredMessage = t('spaces.nameRequired', { ns: 'portal' });
    setSpaceFormError(null);
    setSpaceNameError(null);
    if (!editingSpace || !form.name.trim()) {
      setSpaceNameError(nameRequiredMessage);
      toast.error(nameRequiredMessage);
      return;
    }
    setSaving(true);
    try {
      await updateSpace(editingSpace.id, form);
      toast.success(t('spaces.updated', { ns: 'portal' }));
      closeSpaceFormModal();
      loadSpaces();
    } catch (e: unknown) {
      const message = (e as Error).message || t('spaces.updateFailed', { ns: 'portal' });
      setSpaceFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (space: Space) => {
    if (!confirm(t('spaces.archiveConfirm', { ns: 'portal', name: space.name }))) return;
    try {
      await archiveSpace(space.id);
      toast.success(t('spaces.archived', { ns: 'portal' }));
      if (activeSpaceId === space.id) setActiveSpaceId(null);
      loadSpaces();
    } catch (e: unknown) {
      toast.error((e as Error).message || t('spaces.archiveFailed', { ns: 'portal' }));
    }
    setOpenMenuId(null);
  };

  const handleInvite = async () => {
    if (!activeSpaceId || !inviteEmail.trim()) { toast.error(t('spaces.emailRequired', { ns: 'portal' })); return; }
    setSaving(true);
    try {
      const result = await inviteToSpaceDetailed(activeSpaceId, inviteEmail.trim(), inviteRole);
      toast.success(t('spaces.invitationSent', { ns: 'portal', email: inviteEmail }));
      if (result.emailStatus === 'sent') {
        toast.success(t('spaces.emailSent', { ns: 'portal' }));
      } else if (result.emailStatus === 'failed' || result.warning) {
        toast.warning(result.warning || t('spaces.emailDeliveryFailed', { ns: 'portal' }));
      }
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('viewer');
      loadSpaceDetails(activeSpaceId, true);
    } catch (e: unknown) {
      toast.error((e as Error).message || t('spaces.invitationFailed', { ns: 'portal' }));
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (invId: string) => {
    if (!confirm(t('spaces.revokeConfirm', { ns: 'portal' }))) return;
    try {
      await revokeInvitation(invId);
      toast.success(t('spaces.revoked', { ns: 'portal' }));
      dispatchSmartPocketDataChanged({
        source: 'spaces-page:revoke-invitation',
        entities: ['notifications'],
      });
      void loadReceivedInvitations();
      if (activeSpaceId) loadSpaceDetails(activeSpaceId, canManageInvitations);
    } catch {
      toast.error(t('spaces.revokeFailed', { ns: 'portal' }));
    }
  };

  const handleRespondToReceivedInvitation = async (
    invitation: SpaceInvitation,
    response: 'accepted' | 'declined'
  ) => {
    setRespondingInvitationId(invitation.id);
    try {
      await respondToInvitation(invitation.id, response, invitation.token);
      toast.success(
        t(
          response === 'accepted'
            ? 'spaces.received.accepted'
            : 'spaces.received.declined',
          { ns: 'portal' }
        )
      );
      dispatchSmartPocketDataChanged({
        source: 'spaces-page:respond-invitation',
        entities: ['notifications'],
      });
      await Promise.all([
        loadReceivedInvitations(),
        loadSpaces(),
      ]);
      if (activeSpaceId && activeSpace) {
        await loadSpaceDetails(activeSpaceId, canManageInvitations);
      }
    } catch (error: unknown) {
      toast.error((error as Error).message || t('spaces.received.respondFailed', { ns: 'portal' }));
    } finally {
      setRespondingInvitationId(null);
    }
  };

  const handleSubscriptionRetry = useCallback(() => {
    void refreshSubscriptionSummary();
  }, [refreshSubscriptionSummary]);

  const handleRoleChange = async (memberId: string, newRole: SpaceRole) => {
    if (!activeSpaceId) {
      return;
    }
    try {
      await updateSpaceMemberRole(activeSpaceId, memberId, newRole);
      toast.success(t('spaces.roleUpdated', { ns: 'portal' }));
      if (activeSpaceId) loadSpaceDetails(activeSpaceId, canManageInvitations);
    } catch (e: unknown) {
      toast.error((e as Error).message || t('spaces.roleUpdateFailed', { ns: 'portal' }));
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!activeSpaceId) {
      return;
    }
    if (!confirm(t('spaces.removeMemberConfirm', { ns: 'portal', name: memberName }))) return;
    try {
      await removeSpaceMember(activeSpaceId, memberId);
      toast.success(t('spaces.memberRemoved', { ns: 'portal' }));
      if (activeSpaceId) loadSpaceDetails(activeSpaceId, canManageInvitations);
    } catch (e: unknown) {
      toast.error((e as Error).message || t('spaces.memberRemoveFailed', { ns: 'portal' }));
    }
  };

  const openEdit = (space: Space) => {
    setEditingSpace(space);
    setSpaceFormError(null);
    setSpaceNameError(null);
    setForm({
      name: space.name,
      space_type: space.space_type,
      description: space.description || '',
      color: space.color || '#0f3460',
      icon: space.icon || 'Home',
    });
    setOpenMenuId(null);
  };

  const pendingInvitations = invitations.filter((i) => i.status === 'pending');
  const canCreateNewSpace = !subscriptionLoading && hasSharedSpacesFeature;
  const canManageActiveSpaceSettings = Boolean(activeSpace && hasSharedSpacesFeature && user?.id === activeSpace.owner_id);
  const shouldShowSpaceSelector = spaces.length > 1;
  const incomeRows = getMetricRows(spaceReportData?.incomeMetric);
  const expenseRows = getMetricRows(spaceReportData?.expensesMetric);
  const moneyInRows = groupAmountsByCurrency([
    ...incomeRows,
    ...spaceContributions.map((contribution) => ({
      amount: Number(contribution.amount || 0),
      currency: contribution.currency,
    })),
  ]);
  const memberCount = members.length;
  const activeBudgetCount = spaceBudgetOverview?.items.length || 0;
  const activeSpaceTypeLabel = activeSpace
    ? getSpaceTypeLabel(activeSpace.space_type, (key, options) => t(key, { ns: 'portal', ...options }))
    : '';
  const activeSpaceRoleLabel = activeSpaceRole
    ? getRoleLabel(activeSpaceRole, (key, options) => t(key, { ns: 'portal', ...options }))
    : '';
  const activeSpaceRoleHelp = activeSpaceRole
    ? getRoleExplanation(activeSpaceRole, (key, options) => t(key, { ns: 'portal', ...options }))
    : '';
  const recentActivityItems = buildSpaceRecentActivityItems({
    transactions: spaceTransactions,
    contributions: spaceContributions,
    reimbursements: spaceReimbursements,
    settlements: spaceSettlements,
    language,
    t: (key, options) => t(key, { ns: 'portal', ...options }),
  }).slice(0, 8);
  const hasInvitationActivity = receivedInvitations.length > 0 || pendingInvitations.length > 0;
  const showInvitationsSection = hasInvitationActivity || canManageInvitations;

  const openCreateSpaceModal = () => {
    setEditingSpace(null);
    setForm(DEFAULT_FORM);
    setSpaceFormError(null);
    setSpaceNameError(null);
    setShowCreateModal(true);
  };

  const closeSpaceFormModal = () => {
    setShowCreateModal(false);
    setEditingSpace(null);
    setSpaceFormError(null);
    setSpaceNameError(null);
  };

  return (
    <>
      <div className="page-section pb-6">
        <PageHeader
          title={t('spaces.title', { ns: 'portal' })}
          description={t('spaces.ui.pageDescription', { ns: 'portal' })}
          compact
          actions={
            subscriptionLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-4 text-sm text-muted-foreground sm:w-[180px]"
              >
                <Loader2 size={15} className="animate-spin" />
                <span>{t('status.loading', { ns: 'common' })}</span>
              </div>
            ) : canCreateNewSpace ? (
              <button
                type="button"
                onClick={openCreateSpaceModal}
                className="btn-primary w-full sm:w-auto"
              >
                <Plus size={16} />
                <span>{t('spaces.ui.createSpace', { ns: 'portal' })}</span>
              </button>
            ) : null
          }
        />

        {subscriptionError ? (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning-soft/60 px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between">
            <p>{subscriptionError}</p>
            <button
              type="button"
              onClick={handleSubscriptionRetry}
              disabled={subscriptionLoading}
              className="btn-secondary w-full sm:w-auto"
            >
              <span>{t('actions.refresh', { ns: 'common' })}</span>
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="card p-4 animate-pulse h-20 bg-muted" />
            ))}
          </div>
        ) : spaces.length === 0 ? (
          <div className="card p-8 text-center sm:p-10">
            <Home size={44} className="mx-auto mb-4 text-muted-foreground/40" />
            <h3 className="mb-2 text-lg font-700 text-foreground">
              {t('spaces.ui.emptyState.title', { ns: 'portal' })}
            </h3>
            <p className="mx-auto mb-6 max-w-md text-sm text-muted-foreground">
              {t('spaces.ui.emptyState.description', { ns: 'portal' })}
            </p>
            {subscriptionLoading ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-600 text-muted-foreground opacity-70">
                {t('status.loading', { ns: 'common' })}
              </div>
            ) : canCreateNewSpace ? (
              <button
                type="button"
                onClick={openCreateSpaceModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow"
              >
                <Plus size={16} /> {t('spaces.ui.createSpace', { ns: 'portal' })}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-5 md:space-y-4 xl:space-y-6">
            {activeSpace ? (
              <>
                <section className="card p-3.5 sm:p-4 md:p-4.5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                        {t('spaces.ui.currentSpace.title', { ns: 'portal' })}
                      </p>
                      <div className="mt-2 flex min-w-0 items-center gap-2.5">
                        <div
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm md:h-11 md:w-11 md:rounded-2xl"
                          style={{ backgroundColor: activeSpace.color || '#0f3460' }}
                        >
                          <Home size={18} />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-lg font-700 text-foreground sm:text-xl md:text-[22px]">{activeSpace.name}</h2>
                          <p className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
                            {activeSpaceTypeLabel}
                            <span className="px-1.5 text-muted-foreground/70">·</span>
                            {t('spaces.ui.currentSpace.memberCount', {
                              ns: 'portal',
                              count: memberCount,
                            })}
                            {activeSpaceRoleLabel ? (
                              <>
                                <span className="px-1.5 text-muted-foreground/70">·</span>
                                {activeSpaceRoleLabel}
                              </>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      {activeSpaceRoleLabel ? (
                        <div className="mt-2 flex flex-wrap gap-1.5 md:gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-700 md:px-3 md:text-xs ${ROLE_COLORS[activeSpaceRole || 'viewer']}`}>
                            {React.createElement(ROLE_ICONS[activeSpaceRole || 'viewer'] || Users, { size: 12 })}
                            {t('spaces.ui.currentSpace.roleBadge', {
                              ns: 'portal',
                              role: activeSpaceRoleLabel,
                            })}
                          </span>
                          {activeSpaceRoleHelp ? (
                            <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-[11px] font-600 text-muted-foreground md:px-3 md:text-xs">
                              {activeSpaceRoleHelp}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 md:min-w-[280px] md:max-w-[360px] lg:min-w-[320px] lg:max-w-[420px]">
                      <div className="rounded-2xl bg-muted/30 px-3 py-2.5 md:px-4 md:py-3">
                        <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                          {t('spaces.ui.currentSpace.balanceLabel', { ns: 'portal' })}
                        </p>
                        <div className="mt-1.5 space-y-0.5 md:mt-2 md:space-y-1">
                          {totalBalanceByCurrency.length > 0 ? totalBalanceByCurrency.map((row) => (
                            <FormattedCurrencyAmount
                              key={`current-space-balance-${row.currency}-${row.amount}`}
                              amount={row.amount}
                              currencyCode={row.currency}
                              className="text-base font-700 text-foreground md:text-lg"
                              showCode
                            />
                          )) : (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.currentSpace.balanceEmpty', { ns: 'portal' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 md:justify-end">
                      {shouldShowSpaceSelector ? (
                        <div className="relative w-full min-w-0 md:w-auto">
                          <label htmlFor="spaces-switcher" className="sr-only">
                            {t('spaces.ui.currentSpace.switchLabel', { ns: 'portal' })}
                          </label>
                          <select
                            id="spaces-switcher"
                            value={activeSpaceId || ''}
                            onChange={(e) => {
                              setActiveSpaceId(e.target.value);
                              setOpenMenuId(null);
                            }}
                            className="h-10 min-w-0 w-full appearance-none rounded-xl border border-border bg-card px-3 pe-9 text-sm font-600 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30 md:h-11 md:min-w-[180px] md:rounded-2xl md:px-4 md:pe-10"
                          >
                            {spaces.map((space) => (
                              <option key={space.id} value={space.id}>
                                {space.name}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={16}
                            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground ${isRTL ? 'left-3' : 'right-3'}`}
                          />
                        </div>
                      ) : null}
                        {canManageActiveSpaceSettings ? (
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(openMenuId === activeSpace.id ? null : activeSpace.id)}
                              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted md:h-11 md:w-11 md:rounded-2xl"
                              aria-label={t('spaces.ui.currentSpace.moreOptions', { ns: 'portal' })}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openMenuId === activeSpace.id && (
                              <div className={`absolute top-12 z-20 min-w-[160px] max-w-[calc(100vw-1rem)] rounded-2xl border border-border bg-card py-1 shadow-card-md ${isRTL ? 'left-0' : 'right-0'}`}>
                                <button
                                  type="button"
                                  onClick={() => openEdit(activeSpace)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                                >
                                  <Edit2 size={14} />
                                  {t('spaces.ui.modal.editSpace', { ns: 'portal' })}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleArchive(activeSpace)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-negative hover:bg-muted"
                                >
                                  <Archive size={14} />
                                  {t('spaces.archiveAction', { ns: 'portal' })}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-700 text-foreground">
                    {t('spaces.ui.quickActions.title', { ns: 'portal' })}
                  </h3>
                  {canManageSpaceFinance || canAddSpaceTransactions || (hasSharedSpacesFeature && isActiveSpaceOwner) ? (
                    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4 lg:gap-3">
                      {canAddSpaceTransactions ? (
                        <button
                          type="button"
                          onClick={() => setShowSpaceTransactionModal(true)}
                          className="flex min-h-[74px] flex-col items-start gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30 md:min-h-[78px] md:px-3.5"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted text-foreground md:h-9 md:w-9">
                            <ArrowUpCircle size={16} />
                          </div>
                          <span className="text-sm font-700 text-foreground">
                            {t('spaces.ui.quickActions.expense', { ns: 'portal' })}
                          </span>
                        </button>
                      ) : null}
                      {canAddSpaceTransactions ? (
                        <button
                          type="button"
                          onClick={() => setShowSpaceTransactionModal(true)}
                          className="flex min-h-[74px] flex-col items-start gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30 md:min-h-[78px] md:px-3.5"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-positive-soft text-positive md:h-9 md:w-9">
                            <ArrowDownCircle size={16} />
                          </div>
                          <span className="text-sm font-700 text-foreground">
                            {t('spaces.ui.quickActions.income', { ns: 'portal' })}
                          </span>
                        </button>
                      ) : null}
                      {canAddSpaceTransactions ? (
                        <button
                          type="button"
                          onClick={() => setShowSpaceRecurringModal(true)}
                          className="flex min-h-[74px] flex-col items-start gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30 md:min-h-[78px] md:px-3.5"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-warning-soft text-warning md:h-9 md:w-9">
                            <Repeat size={16} />
                          </div>
                          <span className="text-sm font-700 text-foreground">
                            {t('spaces.ui.quickActions.recurring', { ns: 'portal' })}
                          </span>
                        </button>
                      ) : null}
                      {hasSharedSpacesFeature && isActiveSpaceOwner ? (
                        <button
                          type="button"
                          onClick={() => setShowInviteModal(true)}
                          className="hidden min-h-[78px] flex-col items-start gap-2 rounded-2xl border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30 xl:flex"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                            <UserPlus size={16} />
                          </div>
                          <span className="text-sm font-700 text-foreground">
                            {t('spaces.ui.quickActions.invite', { ns: 'portal' })}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-border bg-card px-4 py-3 text-sm font-600 text-muted-foreground">
                      <p>
                        {t('spaces.ui.quickActions.readOnly', { ns: 'portal' })}
                      </p>
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <h3 className="text-lg font-700 text-foreground">
                    {t('spaces.ui.snapshot.title', { ns: 'portal' })}
                  </h3>
                  {loadingFinance ? (
                    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
                      {[1, 2, 3, 4].map((card) => (
                        <div key={card} className="h-24 animate-pulse rounded-3xl bg-muted md:h-22" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
                      <div className="rounded-2xl border border-border bg-card px-3 py-3 md:rounded-3xl md:px-4 md:py-3.5">
                        <p className="text-sm font-700 text-muted-foreground">
                          {t('spaces.ui.snapshot.balance', { ns: 'portal' })}
                        </p>
                        <div className="mt-1.5 space-y-0.5 md:mt-2 md:space-y-1">
                          {totalBalanceByCurrency.length > 0 ? totalBalanceByCurrency.map((row) => (
                            <FormattedCurrencyAmount
                              key={`summary-balance-${row.currency}-${row.amount}`}
                              amount={row.amount}
                              currencyCode={row.currency}
                              className="text-base font-700 text-foreground sm:text-lg md:text-xl"
                              showCode
                            />
                          )) : (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.snapshot.empty', { ns: 'portal' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-card px-3 py-3 md:rounded-3xl md:px-4 md:py-3.5">
                        <p className="text-sm font-700 text-muted-foreground">
                          {t('spaces.ui.snapshot.moneyIn', { ns: 'portal' })}
                        </p>
                        <div className="mt-1.5 space-y-0.5 md:mt-2 md:space-y-1">
                          {moneyInRows.length > 0 ? moneyInRows.map((row) => (
                            <FormattedCurrencyAmount
                              key={`summary-in-${row.currency}-${row.amount}`}
                              amount={row.amount}
                              currencyCode={row.currency}
                              className="text-base font-700 text-positive sm:text-lg md:text-xl"
                              showCode
                            />
                          )) : (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.snapshot.empty', { ns: 'portal' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-card px-3 py-3 md:rounded-3xl md:px-4 md:py-3.5">
                        <p className="text-sm font-700 text-muted-foreground">
                          {t('spaces.ui.snapshot.moneyOut', { ns: 'portal' })}
                        </p>
                        <div className="mt-1.5 space-y-0.5 md:mt-2 md:space-y-1">
                          {expenseRows.length > 0 ? expenseRows.map((row) => (
                            <FormattedCurrencyAmount
                              key={`summary-out-${row.currency}-${row.amount}`}
                              amount={row.amount}
                              currencyCode={row.currency}
                              className="text-base font-700 text-foreground sm:text-lg md:text-xl"
                              showCode
                            />
                          )) : (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.snapshot.empty', { ns: 'portal' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-card px-3 py-3 md:rounded-3xl md:px-4 md:py-3.5">
                        <p className="text-sm font-700 text-muted-foreground">
                          {t('spaces.ui.snapshot.amountOwed', { ns: 'portal' })}
                        </p>
                        <div className="mt-1.5 space-y-0.5 md:mt-2 md:space-y-1">
                          {outstandingReimbursementTotals.length > 0 ? outstandingReimbursementTotals.map((row) => (
                            <FormattedCurrencyAmount
                              key={`summary-owed-${row.currency}-${row.amount}`}
                              amount={row.amount}
                              currencyCode={row.currency}
                              className="text-base font-700 text-warning sm:text-lg md:text-xl"
                              showCode
                            />
                          )) : (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.snapshot.empty', { ns: 'portal' })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
                  <div id="recent-activity" className="rounded-3xl border border-border bg-card p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-lg font-700 text-foreground">
                        {t('spaces.ui.activity.title', { ns: 'portal' })}
                      </h3>
                      <span className="rounded-full bg-muted px-3 py-1 text-sm font-600 text-foreground">{recentActivityItems.length}</span>
                    </div>
                    {loadingFinance ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((item) => (
                          <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />
                        ))}
                      </div>
                    ) : recentActivityItems.length === 0 ? (
                      <div className="rounded-2xl bg-muted/30 px-4 py-5 text-center">
                        <p className="text-sm font-700 text-foreground">
                          {t('spaces.ui.activity.emptyTitle', { ns: 'portal' })}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('spaces.ui.activity.emptyDescription', { ns: 'portal' })}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {recentActivityItems.map((item) => {
                          const ActivityIcon = ACTIVITY_ICONS[item.kind];
                          return (
                            <div key={item.id} className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-start gap-3">
                                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${ACTIVITY_BADGE_COLORS[item.kind]}`}>
                                    <ActivityIcon size={16} />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-700 text-foreground">{item.title}</p>
                                    <p className="mt-1 truncate text-sm text-muted-foreground">{item.subtitle}</p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-700 ${ACTIVITY_BADGE_COLORS[item.kind]}`}>
                                    {getActivityTypeLabel(item.kind, (key, options) => t(key, { ns: 'portal', ...options }))}
                                  </span>
                                  <span className="text-xs font-600 text-muted-foreground">
                                    {item.dateLabel}
                                  </span>
                                  <FormattedCurrencyAmount
                                    amount={item.amount}
                                    currencyCode={item.currency}
                                    className={`text-sm font-700 ${item.toneClassName}`}
                                    showCode
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {loadingDetails ? (
                    <div className="h-40 animate-pulse rounded-3xl bg-muted" />
                  ) : activeSpaceRole ? (
                    <section className="rounded-3xl border border-border bg-card p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-700 text-foreground">
                          {t('spaces.ui.members.title', { ns: 'portal' })}
                        </h3>
                        <span className="rounded-full bg-muted px-3 py-1 text-sm font-600 text-foreground">{members.length}</span>
                      </div>
                      {members.length === 0 ? (
                        <p className="rounded-2xl bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                          {t('spaces.ui.members.emptyDescription', { ns: 'portal' })}
                        </p>
                      ) : (
                        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-1">
                          {members.map((member) => {
                            const RoleIcon = ROLE_ICONS[member.role] || Users;
                            const canEditMemberRole = canManageSpaceMemberRole({
                              actorRole: activeSpaceRole,
                              actorUserId: user?.id || null,
                              targetMember: member,
                            });
                            const canRemoveMemberEntry = canRemoveSpaceMember({
                              actorRole: activeSpaceRole,
                              actorUserId: user?.id || null,
                              targetMember: member,
                            });
                            return (
                              <div key={member.id} className="rounded-2xl border border-border/70 bg-muted/10 px-3.5 py-3 md:px-4">
                                <div className="flex flex-col gap-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 gap-3">
                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full gradient-teal text-sm font-700 text-white">
                                        {(member.user_profile?.full_name || member.user_profile?.email || 'U').charAt(0).toUpperCase()}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="truncate text-sm font-700 text-foreground">
                                            {member.user_profile?.full_name || t('spaces.unknownUser', { ns: 'portal' })}
                                          </p>
                                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-700 ${ROLE_COLORS[member.role]}`}>
                                            <RoleIcon size={12} />
                                            {getRoleLabel(member.role, (key, options) => t(key, { ns: 'portal', ...options }))}
                                          </span>
                                        </div>
                                        <p className="mt-1 truncate text-sm text-muted-foreground">
                                          {member.user_profile?.email || t('spaces.ui.members.noEmail', { ns: 'portal' })}
                                        </p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {getRoleExplanation(member.role, (key, options) => t(key, { ns: 'portal', ...options }))}
                                        </p>
                                        {member.role === 'owner' ? (
                                          <p className="mt-1 text-xs font-600 text-muted-foreground">
                                            {t('spaces.ui.members.ownerProtected', { ns: 'portal' })}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                  {(canEditMemberRole || canRemoveMemberEntry) ? (
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                                      {canEditMemberRole ? (
                                        <select
                                          id={`member-role-${member.id}`}
                                          value={member.role}
                                          onChange={(e) => handleRoleChange(member.id, e.target.value as SpaceRole)}
                                          className="h-10 min-w-[170px] rounded-2xl border border-border bg-card px-3 text-sm font-600 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                                          aria-label={t('spaces.ui.members.changeRole', { ns: 'portal' })}
                                        >
                                          {SPACE_MEMBER_ASSIGNABLE_ROLES.map((role) => (
                                            <option key={role} value={role}>
                                              {getRoleLabel(role, (key, options) => t(key, { ns: 'portal', ...options }))}
                                            </option>
                                          ))}
                                        </select>
                                      ) : null}
                                      {canRemoveMemberEntry ? (
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveMember(member.id, member.user_profile?.full_name || t('spaces.ui.members.memberFallback', { ns: 'portal' }))}
                                          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-negative/30 px-4 text-sm font-600 text-negative transition-colors hover:bg-negative-soft/60"
                                        >
                                          <Trash2 size={15} />
                                          <span>{t('spaces.ui.members.remove', { ns: 'portal' })}</span>
                                        </button>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {members.length <= 1 && canManageInvitations ? (
                        <div className="mt-4 rounded-2xl bg-muted/30 px-4 py-4">
                          <p className="text-sm font-700 text-foreground">
                            {t('spaces.ui.members.sharePrompt', { ns: 'portal' })}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t('spaces.ui.members.sharePromptDescription', { ns: 'portal' })}
                          </p>
                          <button type="button" onClick={() => setShowInviteModal(true)} className="btn-secondary mt-3">
                            <UserPlus size={15} />
                            <span>{t('spaces.ui.quickActions.invite', { ns: 'portal' })}</span>
                          </button>
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </section>

                {showInvitationsSection ? (
                  <section className="rounded-3xl border border-border bg-card p-4 sm:p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <h3 className="text-lg font-700 text-foreground">
                        {t('spaces.ui.invitations.title', { ns: 'portal' })}
                      </h3>
                      {canManageInvitations ? (
                        <button type="button" onClick={() => setShowInviteModal(true)} className="btn-secondary">
                          <UserPlus size={15} />
                          <span>{t('spaces.ui.quickActions.invite', { ns: 'portal' })}</span>
                        </button>
                      ) : null}
                    </div>
                    {loadingInvitations && !receivedInvitations.length && !pendingInvitations.length ? (
                      <div className="h-24 animate-pulse rounded-3xl bg-muted" />
                    ) : hasInvitationActivity ? (
                      <div className="space-y-4">
                        {receivedInvitations.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-sm font-700 text-muted-foreground">
                              {t('spaces.ui.invitations.receivedTitle', { ns: 'portal' })}
                            </p>
                            {receivedInvitations.map((invitation) => (
                              <div key={invitation.id} className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-700 text-foreground">
                                      {invitation.space?.name || t('spaces.invitationPage.fallbackUnknownSpace', { ns: 'portal' })}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {t('spaces.received.invitedBy', {
                                        ns: 'portal',
                                        inviter: invitation.inviter?.full_name || invitation.inviter?.email || t('spaces.invitationPage.fallbackInviter', { ns: 'portal' }),
                                      })}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-700">
                                      <span className={`rounded-full px-2.5 py-1 ${STATUS_COLORS.pending}`}>
                                        {t('spaces.received.pending', { ns: 'portal' })}
                                      </span>
                                      <span className="rounded-full bg-muted px-2.5 py-1 text-foreground">
                                        {t('spaces.ui.invitations.roleBadge', {
                                          ns: 'portal',
                                          role: getRoleLabel(invitation.role, (key, options) => t(key, { ns: 'portal', ...options })),
                                        })}
                                      </span>
                                      {invitation.expires_at ? (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-foreground">
                                          <Clock size={12} />
                                          {t('spaces.expiresOn', {
                                            ns: 'portal',
                                            date: new Date(invitation.expires_at).toLocaleDateString(language),
                                          })}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleRespondToReceivedInvitation(invitation, 'accepted')}
                                      disabled={respondingInvitationId === invitation.id}
                                      className="btn-primary"
                                    >
                                      <CheckCircle2 size={15} />
                                      <span>{t('spaces.received.acceptAction', { ns: 'portal' })}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleRespondToReceivedInvitation(invitation, 'declined')}
                                      disabled={respondingInvitationId === invitation.id}
                                      className="btn-secondary"
                                    >
                                      <XCircle size={15} />
                                      <span>{t('spaces.received.declineAction', { ns: 'portal' })}</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {canManageInvitations ? (
                          <div className="space-y-2">
                            <p className="text-sm font-700 text-muted-foreground">
                              {t('spaces.ui.invitations.sentTitle', { ns: 'portal' })}
                            </p>
                            {pendingInvitations.length === 0 ? (
                              <p className="rounded-2xl bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                                {t('spaces.ui.invitations.none', { ns: 'portal' })}
                              </p>
                            ) : (
                              pendingInvitations.map((inv) => (
                                <div key={inv.id} className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-700 text-foreground">{inv.email}</p>
                                      <div className="mt-2 flex flex-wrap gap-2 text-xs font-700">
                                        <span className={`rounded-full px-2.5 py-1 ${STATUS_COLORS[inv.status] || 'bg-muted text-muted-foreground'}`}>
                                          {getInvitationStatusLabel(inv.status, (key, options) => t(key, { ns: 'portal', ...options }))}
                                        </span>
                                        <span className="rounded-full bg-muted px-2.5 py-1 text-foreground">
                                          {t('spaces.ui.invitations.roleBadge', {
                                            ns: 'portal',
                                            role: getRoleLabel(inv.role, (key, options) => t(key, { ns: 'portal', ...options })),
                                          })}
                                        </span>
                                        {inv.expires_at ? (
                                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-foreground">
                                            <Clock size={12} />
                                            {new Date(inv.expires_at) < new Date()
                                              ? t('spaces.expired', { ns: 'portal' })
                                              : t('spaces.expiresOn', {
                                                  ns: 'portal',
                                                  date: new Date(inv.expires_at).toLocaleDateString(language),
                                                })}
                                          </span>
                                        ) : null}
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRevoke(inv.id)}
                                      className="inline-flex items-center gap-2 text-sm font-600 text-negative hover:underline"
                                    >
                                      <XCircle size={15} />
                                      <span>{t('spaces.revokeAction', { ns: 'portal' })}</span>
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <p className="rounded-2xl bg-muted/30 px-4 py-4 text-sm text-muted-foreground">
                        {t('spaces.ui.invitations.none', { ns: 'portal' })}
                      </p>
                    )}
                  </section>
                ) : null}

                <section className="rounded-3xl border border-border bg-card p-4 sm:p-5">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((value) => !value)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                    aria-expanded={advancedOpen}
                  >
                    <div>
                      <h3 className="text-lg font-700 text-foreground">
                        {t('spaces.ui.advanced.title', { ns: 'portal' })}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('spaces.ui.advanced.description', { ns: 'portal' })}
                      </p>
                    </div>
                    <ChevronDown size={18} className={`shrink-0 text-muted-foreground transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {advancedOpen ? (
                    <div className="mt-5 space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-700 text-foreground">
                              {t('spaces.ui.details.contributions.title', { ns: 'portal' })}
                            </p>
                            <a href="#recent-activity" className="text-xs font-700 text-accent hover:underline">
                              {t('spaces.ui.viewDetails', { ns: 'portal' })}
                            </a>
                          </div>
                          <div className="space-y-1">
                            {contributionTotals.length > 0 ? contributionTotals.map((row) => (
                              <FormattedCurrencyAmount
                                key={`details-contribution-${row.currency}-${row.amount}`}
                                amount={row.amount}
                                currencyCode={row.currency}
                                className="text-base font-700 text-positive"
                                showCode
                              />
                            )) : (
                              <p className="text-sm text-muted-foreground">
                                {t('spaces.ui.details.contributions.empty', { ns: 'portal' })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-700 text-foreground">
                              {t('spaces.ui.details.owed.title', { ns: 'portal' })}
                            </p>
                            <Link href={`/reimbursements?scope=space&spaceId=${activeSpace.id}`} className="text-xs font-700 text-accent hover:underline">
                              {t('spaces.ui.viewDetails', { ns: 'portal' })}
                            </Link>
                          </div>
                          <div className="space-y-1">
                            {outstandingReimbursementTotals.length > 0 ? outstandingReimbursementTotals.map((row) => (
                              <FormattedCurrencyAmount
                                key={`details-owed-${row.currency}-${row.amount}`}
                                amount={row.amount}
                                currencyCode={row.currency}
                                className="text-base font-700 text-warning"
                                showCode
                              />
                            )) : (
                              <p className="text-sm text-muted-foreground">
                                {t('spaces.ui.details.owed.empty', { ns: 'portal' })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-700 text-foreground">
                              {t('spaces.ui.details.budgets.title', { ns: 'portal' })}
                            </p>
                            <Link href={`/budgets?scope=space&spaceId=${activeSpace.id}`} className="text-xs font-700 text-accent hover:underline">
                              {t('spaces.ui.viewDetails', { ns: 'portal' })}
                            </Link>
                          </div>
                          <div className="space-y-1 text-sm">
                            {activeBudgetCount > 0 ? (
                              <>
                                <p className="font-700 text-foreground">
                                  {t('spaces.ui.details.budgets.active', {
                                    ns: 'portal',
                                    count: activeBudgetCount,
                                  })}
                                </p>
                                <p className="text-muted-foreground">
                                  {budgetWarningCount > 0
                                    ? t('spaces.ui.details.budgets.warning', {
                                        ns: 'portal',
                                        count: budgetWarningCount,
                                      })
                                    : t('spaces.ui.details.budgets.ok', { ns: 'portal' })}
                                </p>
                              </>
                            ) : (
                              <p className="text-muted-foreground">
                                {t('spaces.ui.details.budgets.empty', { ns: 'portal' })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-muted/10 px-4 py-3">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-700 text-foreground">
                              {t('spaces.ui.accounts.title', { ns: 'portal' })}
                            </p>
                            {canManageSpaceFinance ? (
                              <button type="button" onClick={() => setShowSpaceAccountModal(true)} className="text-xs font-700 text-accent hover:underline">
                                {t('spaces.ui.accounts.add', { ns: 'portal' })}
                              </button>
                            ) : null}
                          </div>
                          {loadingFinance ? (
                            <div className="space-y-2">
                              {[1, 2].map((item) => (
                                <div key={item} className="h-10 animate-pulse rounded-2xl bg-muted" />
                              ))}
                            </div>
                          ) : activeSpaceAccounts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.accounts.emptyDescription', { ns: 'portal' })}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {activeSpaceAccounts.slice(0, 3).map((account) => (
                                <div key={account.id} className="flex items-center justify-between gap-3 rounded-2xl bg-card px-3 py-2.5">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-700 text-foreground">{account.name}</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {t(`accountTypes.${account.account_type}`, { ns: 'common' })}
                                    </p>
                                  </div>
                                  <FormattedCurrencyAmount
                                    amount={account.current_balance}
                                    currencyCode={account.currency}
                                    className="text-sm font-700 text-foreground"
                                    showCode
                                  />
                                </div>
                              ))}
                              {activeSpaceAccounts.length > 3 ? (
                                <p className="text-xs text-muted-foreground">
                                  {t('spaces.ui.accounts.count', {
                                    ns: 'portal',
                                    count: activeSpaceAccounts.length,
                                  })}
                                </p>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/reimbursements?scope=space&spaceId=${activeSpace.id}`} className="btn-secondary">
                          <HandCoins size={15} />
                          <span>{t('spaces.ui.advanced.reimbursements', { ns: 'portal' })}</span>
                        </Link>
                        <Link href={`/settlements?scope=space&spaceId=${activeSpace.id}`} className="btn-secondary">
                          <CircleDollarSign size={15} />
                          <span>{t('spaces.ui.advanced.settlements', { ns: 'portal' })}</span>
                        </Link>
                        <Link href={`/reports?scope=space&spaceId=${activeSpace.id}`} className="btn-secondary">
                          <ReceiptText size={15} />
                          <span>{t('spaces.ui.advanced.reports', { ns: 'portal' })}</span>
                        </Link>
                      </div>
                      {spaceFinanceError ? (
                        <div className="rounded-2xl border border-warning/30 bg-warning-soft/60 px-4 py-3 text-sm text-warning">
                          <p className="font-700 text-foreground">
                            {t('spaces.ui.advanced.financeErrorTitle', { ns: 'portal' })}
                          </p>
                          <div className="mt-2 space-y-1 font-mono text-xs break-words">
                            <p><span className="font-700">{t('spaces.ui.advanced.financeErrorFields.loader', { ns: 'portal' })}:</span> {spaceFinanceError.loader}</p>
                            <p><span className="font-700">{t('spaces.ui.advanced.financeErrorFields.request', { ns: 'portal' })}:</span> {spaceFinanceError.request}</p>
                            <p><span className="font-700">{t('spaces.ui.advanced.financeErrorFields.message', { ns: 'portal' })}:</span> {spaceFinanceError.message}</p>
                            <p><span className="font-700">{t('spaces.ui.advanced.financeErrorFields.code', { ns: 'portal' })}:</span> {spaceFinanceError.code || t('spaces.ui.common.none', { ns: 'portal' })}</p>
                            <p><span className="font-700">{t('spaces.ui.advanced.financeErrorFields.details', { ns: 'portal' })}:</span> {spaceFinanceError.details || t('spaces.ui.common.none', { ns: 'portal' })}</p>
                            <p><span className="font-700">{t('spaces.ui.advanced.financeErrorFields.hint', { ns: 'portal' })}:</span> {spaceFinanceError.hint || t('spaces.ui.common.none', { ns: 'portal' })}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {t('spaces.ui.advanced.helper', { ns: 'portal' })}
                        </p>
                      )}
                    </div>
                  ) : null}
                </section>
              </>
            ) : (
              <div className="card p-12 text-center">
                <Home size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground">{t('spaces.selectSpace', { ns: 'portal' })}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingSpace) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[min(88dvh,760px)] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-5 shadow-card-md max-[480px]:rounded-[1.5rem] max-[480px]:px-4 max-[480px]:pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-700 text-foreground">
                {editingSpace
                  ? t('spaces.ui.modal.editSpace', { ns: 'portal' })
                  : t('spaces.ui.modal.createSpace', { ns: 'portal' })}
              </h3>
              <button
                type="button"
                onClick={closeSpaceFormModal}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                aria-label={t('actions.close', { ns: 'common' })}
              >
                ✕
              </button>
            </div>

            <div>
              <label htmlFor="space-name" className={getFieldLabelClassName(Boolean(spaceNameError))}>{t('spaces.form.name', { ns: 'portal' })}</label>
              <input
                id="space-name"
                type="text"
                value={form.name}
                onChange={(e) => {
                  setSpaceFormError(null);
                  setSpaceNameError(null);
                  setForm({ ...form, name: e.target.value });
                }}
                placeholder={t('spaces.form.namePlaceholder', { ns: 'portal' })}
                className={getFieldInputClassName('w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30', Boolean(spaceNameError))}
                aria-invalid={spaceNameError ? 'true' : 'false'}
                aria-describedby={spaceNameError ? 'space-name-error' : undefined}
              />
              {spaceNameError ? <p id="space-name-error" className={getFieldErrorTextClassName()}>{spaceNameError}</p> : null}
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('spaces.form.type', { ns: 'portal' })}</label>
              <select
                value={form.space_type}
                onChange={(e) => {
                  setSpaceFormError(null);
                  setForm({ ...form, space_type: e.target.value as Space['space_type'] });
                }}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {(['personal', 'family', 'household', 'child', 'friend', 'custom'] as Space['space_type'][]).map((spaceType) => (
                  <option key={spaceType} value={spaceType}>
                    {getSpaceTypeLabel(spaceType, (key, options) => t(key, { ns: 'portal', ...options }))}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('spaces.form.description', { ns: 'portal' })}</label>
              <textarea
                value={form.description}
                onChange={(e) => {
                  setSpaceFormError(null);
                  setForm({ ...form, description: e.target.value });
                }}
                placeholder={t('spaces.form.descriptionPlaceholder', { ns: 'portal' })}
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('spaces.form.color', { ns: 'portal' })}</label>
              <div className="flex gap-2 flex-wrap">
                {SPACE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      setSpaceFormError(null);
                      setForm({ ...form, color: c });
                    }}
                    className={`w-8 h-8 rounded-lg transition-transform ${form.color === c ? 'scale-110 ring-2 ring-offset-2 ring-accent' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {spaceFormError && !spaceNameError ? (
              <div className="rounded-xl border border-negative/20 bg-negative-soft/50 px-4 py-3 text-sm text-negative">
                {spaceFormError}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
              <button
                onClick={closeSpaceFormModal}
                className="order-2 flex-1 rounded-xl border border-border py-2.5 text-sm font-600 text-muted-foreground transition-colors hover:bg-muted sm:order-1"
              >
                {t('actions.cancel', { ns: 'common' })}
              </button>
              <button
                onClick={editingSpace ? handleUpdate : handleCreate}
                disabled={saving}
                className="order-1 flex-1 rounded-xl py-2.5 text-sm font-600 text-white shadow-teal-glow transition-opacity hover:opacity-90 disabled:opacity-60 sm:order-2 gradient-teal"
              >
                {saving
                  ? t('status.saving', { ns: 'common' })
                  : editingSpace
                    ? t('actions.update', { ns: 'common' })
                    : t('actions.create', { ns: 'common' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && hasSharedSpacesFeature && isActiveSpaceOwner && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-4 backdrop-blur-sm sm:items-center">
          <div className="max-h-[min(88dvh,760px)] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-5 shadow-card-md max-[480px]:rounded-[1.5rem] max-[480px]:px-4 max-[480px]:pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-700 text-foreground">
                {t('spaces.ui.modal.inviteMember', { ns: 'portal' })}
              </h3>
              <button
                type="button"
                onClick={() => setShowInviteModal(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                aria-label={t('actions.close', { ns: 'common' })}
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('spaces.ui.modal.emailLabel', { ns: 'portal' })}
              </label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('spaces.form.emailPlaceholder', { ns: 'portal' })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('spaces.ui.modal.roleLabel', { ns: 'portal' })}
              </label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as SpaceRole)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {(['manager', 'contributor', 'viewer', 'dependent'] as SpaceRole[]).map((r) => (
                  <option key={r} value={r}>
                    {getRoleLabel(r, (key, options) => t(key, { ns: 'portal', ...options }))}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1.5">
                {getRoleExplanation(inviteRole, (key, options) => t(key, { ns: 'portal', ...options }))}
              </p>
            </div>

            <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
              <button
                onClick={() => setShowInviteModal(false)}
                className="order-2 flex-1 rounded-xl border border-border py-2.5 text-sm font-600 text-muted-foreground transition-colors hover:bg-muted sm:order-1"
              >
                {t('actions.cancel', { ns: 'common' })}
              </button>
              <button
                onClick={handleInvite}
                disabled={saving}
                className="order-1 flex-1 rounded-xl py-2.5 text-sm font-600 text-white shadow-teal-glow transition-opacity hover:opacity-90 disabled:opacity-60 sm:order-2 gradient-teal"
              >
                {saving ? t('spaces.sending', { ns: 'portal' }) : t('spaces.sendInvitation', { ns: 'portal' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSpaceAccountModal && activeSpace ? (
        <Modal
          isOpen={showSpaceAccountModal}
          onClose={() => setShowSpaceAccountModal(false)}
          title={t('spaces.ui.accounts.add', { ns: 'portal' })}
          size="md"
        >
          <FinancialAccountForm
            onSuccess={() => {
              setShowSpaceAccountModal(false);
              void Promise.all([
                loadSpaces(),
                loadSpaceFinance(activeSpace.id),
              ]);
            }}
            onCancel={() => setShowSpaceAccountModal(false)}
            allowedSpaces={[activeSpace]}
            initialScopeType="space"
            initialSpaceId={activeSpace.id}
            hideScopeControls
          />
        </Modal>
      ) : null}

      {showSpaceTransactionModal && activeSpace ? (
        <AddTransactionModal
          isOpen={showSpaceTransactionModal}
          onClose={() => setShowSpaceTransactionModal(false)}
          spaceId={activeSpace.id}
          spaceName={activeSpace.name}
          spaceMembers={members}
          onSaved={async () => {
            setShowSpaceTransactionModal(false);
            await loadSpaceFinance(activeSpace.id);
          }}
        />
      ) : null}

      {showSpaceRecurringModal && activeSpace ? (
        <Modal
          isOpen={showSpaceRecurringModal}
          onClose={() => setShowSpaceRecurringModal(false)}
          title={t('spaces.ui.quickActions.recurring', { ns: 'portal' })}
          size="md"
        >
          <RecurringTransactionForm
            accounts={financeAccounts}
            spaceId={activeSpace.id}
            spaceName={activeSpace.name}
            onSuccess={() => {
              setShowSpaceRecurringModal(false);
              void loadSpaceFinance(activeSpace.id);
            }}
            onCancel={() => setShowSpaceRecurringModal(false)}
          />
        </Modal>
      ) : null}
    </>
  );
}

export default function SpacesPage() {
  return (
    <AppLayout activeRoute="/spaces">
      <SpacesPageContent />
    </AppLayout>
  );
}
