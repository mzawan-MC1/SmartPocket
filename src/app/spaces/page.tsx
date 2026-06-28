'use client';
import React, { useState, useEffect, useCallback } from 'react';
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
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import FinancialAccountForm from '@/app/financial-accounts/components/FinancialAccountForm';
import AddTransactionModal from '@/app/transactions/components/AddTransactionModal';
import RecurringTransactionForm from '@/app/recurring/components/RecurringTransactionForm';
import { hasSubscriptionFeature } from '@/lib/subscription/entitlements';
import { getSpaceOwnedFinancialAccounts } from '@/lib/financial-account-utils';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import type { HistoricalReportConvertedMetric } from '@/lib/finance';

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
  return t(`spaces.types.${type}`, { defaultValue: type });
}

function getRoleLabel(
  role: SpaceRole,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`spaces.roles.${role}`, { defaultValue: role });
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

function getFriendlySpaceTypeLabel(
  type: Space['space_type'],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const baseLabel = getSpaceTypeLabel(type, t);
  return baseLabel.toLowerCase().includes('space') ? baseLabel : `${baseLabel} Space`;
}

function getRoleExplanation(
  role: SpaceRole,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (role) {
    case 'owner':
      return t('spaces.ui.roleHelp.owner', {
        ns: 'portal',
        defaultValue: 'Full control of the Space',
      });
    case 'manager':
      return t('spaces.ui.roleHelp.manager', {
        ns: 'portal',
        defaultValue: 'Can manage members and shared finances',
      });
    case 'contributor':
      return t('spaces.ui.roleHelp.contributor', {
        ns: 'portal',
        defaultValue: 'Can add shared expenses and income',
      });
    case 'viewer':
      return t('spaces.ui.roleHelp.viewer', {
        ns: 'portal',
        defaultValue: 'Can view shared activity',
      });
    case 'dependent':
      return t('spaces.ui.roleHelp.dependent', {
        ns: 'portal',
        defaultValue: 'Included in shared plans and expenses',
      });
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
      return t('spaces.ui.activity.income', { ns: 'portal', defaultValue: 'Income' });
    case 'expense':
      return t('spaces.ui.activity.expense', { ns: 'portal', defaultValue: 'Expense' });
    case 'transfer':
      return t('spaces.ui.activity.transfer', { ns: 'portal', defaultValue: 'Transfer' });
    case 'contribution':
      return t('spaces.ui.activity.contribution', { ns: 'portal', defaultValue: 'Money added' });
    case 'owed':
      return t('spaces.ui.activity.owed', { ns: 'portal', defaultValue: 'Money owed' });
    case 'payment':
      return t('spaces.ui.activity.payment', { ns: 'portal', defaultValue: 'Payment recorded' });
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
      : t('spaces.ui.activity.uncategorized', {
          ns: 'portal',
          defaultValue: 'Uncategorized',
        });
    const accountName = transaction.account?.name || t('spaces.ui.activity.sharedAccountFallback', {
      ns: 'portal',
      defaultValue: 'Shared account',
    });
    const formattedDate = formatDisplayDate(transaction.transaction_date, language)
      || transaction.transaction_date;

    let kind: SpaceRecentActivityItem['kind'] = transaction.transaction_type;
    let title = transaction.description || transaction.merchant || '';

    if (!title) {
      if (transaction.transaction_type === 'income') {
        title = t('spaces.ui.activity.moneyAddedToAccount', {
          ns: 'portal',
          defaultValue: 'Money added to {{account}}',
          account: accountName,
        });
      } else if (transaction.transaction_type === 'expense') {
        title = t('spaces.ui.activity.expensePaidFromAccount', {
          ns: 'portal',
          defaultValue: 'Expense paid from {{account}}',
          account: accountName,
        });
      } else {
        title = t('spaces.ui.activity.transferBetweenAccounts', {
          ns: 'portal',
          defaultValue: 'Transfer between accounts',
        });
      }
    }

    return {
      id: `transaction-${transaction.id}`,
      kind,
      title,
      subtitle: `${getActivityTypeLabel(kind, t)} · ${accountName} · ${categoryName} · ${formattedDate}`,
      amount: transaction.transaction_type === 'expense'
        ? -Math.abs(Number(transaction.amount || 0))
        : Number(transaction.amount || 0),
      currency: transaction.currency,
      date: transaction.transaction_date,
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
      title: t('spaces.ui.activity.memberContribution', {
        ns: 'portal',
        defaultValue: 'Money added by a member',
      }),
      subtitle: contribution.notes?.trim()
        ? `${contribution.notes.trim()} · ${formattedDate}`
        : `${getActivityTypeLabel('contribution', t)} · ${formattedDate}`,
      amount: Number(contribution.amount || 0),
      currency: contribution.currency,
      date: contribution.contributed_at,
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
        || t('spaces.ui.activity.memberFallback', { ns: 'portal', defaultValue: 'A member' });

      return {
        id: `reimbursement-${reimbursement.id}`,
        kind: 'owed',
        title: reimbursement.description || t('spaces.ui.activity.moneyOwedTitle', {
          ns: 'portal',
          defaultValue: 'Money someone owes',
        }),
        subtitle: `${personName} · ${formattedDate}`,
        amount: remainingAmount,
        currency: reimbursement.currency,
        date: reimbursement.due_date || reimbursement.created_at,
        toneClassName: 'text-warning',
      };
    });

  const settlementItems = settlements.map<SpaceRecentActivityItem>((settlement) => {
    const formattedDate = formatDisplayDate(settlement.settlement_date, language)
      || settlement.settlement_date;
    const personName = settlement.person?.full_name
      || settlement.legacy_person?.full_name
      || t('spaces.ui.activity.memberFallback', { ns: 'portal', defaultValue: 'A member' });

    return {
      id: `settlement-${settlement.id}`,
      kind: 'payment',
      title: settlement.description || t('spaces.ui.activity.paymentTitle', {
        ns: 'portal',
        defaultValue: 'Payment recorded',
      }),
      subtitle: `${personName} · ${formattedDate}`,
      amount: Number(settlement.amount || 0),
      currency: settlement.currency,
      date: settlement.settlement_date,
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
  const { language } = useLanguage();
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
  const [spaceFinanceError, setSpaceFinanceError] = useState<SpaceFinanceLoadError | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    kind: 'archive-space' | 'revoke-invitation' | 'remove-member';
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmingAction, setConfirmingAction] = useState(false);

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
    if (!form.name.trim()) {
      setSpaceFormError(nameRequiredMessage);
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
    if (!editingSpace || !form.name.trim()) {
      setSpaceFormError(nameRequiredMessage);
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
    setPendingConfirmation({
      kind: 'archive-space',
      title: t('spaces.archive', { ns: 'portal', defaultValue: 'Archive' }),
      description: t('spaces.archiveConfirm', { ns: 'portal', name: space.name }),
      confirmLabel: t('spaces.archive', { ns: 'portal', defaultValue: 'Archive' }),
      onConfirm: async () => {
        await archiveSpace(space.id);
        toast.success(t('spaces.archived', { ns: 'portal' }));
        if (activeSpaceId === space.id) setActiveSpaceId(null);
        loadSpaces();
      },
    });
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
    setPendingConfirmation({
      kind: 'revoke-invitation',
      title: t('spaces.revoke', { ns: 'portal', defaultValue: 'Cancel invitation' }),
      description: t('spaces.revokeConfirm', { ns: 'portal' }),
      confirmLabel: t('spaces.revoke', { ns: 'portal', defaultValue: 'Cancel invitation' }),
      onConfirm: async () => {
        await revokeInvitation(invId);
        toast.success(t('spaces.revoked', { ns: 'portal' }));
        dispatchSmartPocketDataChanged({
          source: 'spaces-page:revoke-invitation',
          entities: ['notifications'],
        });
        void loadReceivedInvitations();
        if (activeSpaceId) loadSpaceDetails(activeSpaceId, canManageInvitations);
      },
    });
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
    setPendingConfirmation({
      kind: 'remove-member',
      title: t('spaces.removeMember', { ns: 'portal', defaultValue: 'Remove member' }),
      description: t('spaces.removeMemberConfirm', { ns: 'portal', name: memberName }),
      confirmLabel: t('spaces.removeMember', { ns: 'portal', defaultValue: 'Remove member' }),
      onConfirm: async () => {
        await removeSpaceMember(activeSpaceId, memberId);
        toast.success(t('spaces.memberRemoved', { ns: 'portal' }));
        if (activeSpaceId) loadSpaceDetails(activeSpaceId, canManageInvitations);
      },
    });
  };

  const handleConfirmPendingAction = useCallback(async () => {
    if (!pendingConfirmation) {
      return;
    }

    setConfirmingAction(true);
    try {
      await pendingConfirmation.onConfirm();
      setPendingConfirmation(null);
    } catch (e: unknown) {
      if (pendingConfirmation.kind === 'archive-space') {
        toast.error((e as Error).message || t('spaces.archiveFailed', { ns: 'portal' }));
      } else if (pendingConfirmation.kind === 'revoke-invitation') {
        toast.error((e as Error).message || t('spaces.revokeFailed', { ns: 'portal' }));
      } else {
        toast.error((e as Error).message || t('spaces.memberRemoveFailed', { ns: 'portal' }));
      }
    } finally {
      setConfirmingAction(false);
    }
  }, [pendingConfirmation, t]);

  const openEdit = (space: Space) => {
    setEditingSpace(space);
    setSpaceFormError(null);
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
    ? getFriendlySpaceTypeLabel(activeSpace.space_type, (key, options) => t(key, { ns: 'portal', ...options }))
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

  const openCreateSpaceModal = () => {
    setEditingSpace(null);
    setForm(DEFAULT_FORM);
    setSpaceFormError(null);
    setShowCreateModal(true);
  };

  const closeSpaceFormModal = () => {
    setShowCreateModal(false);
    setEditingSpace(null);
    setSpaceFormError(null);
  };

  return (
    <>
      <div className="page-section pb-6">
        <PageHeader
          title={t('spaces.title', { ns: 'portal' })}
          description={t('spaces.ui.pageDescription', {
            ns: 'portal',
            defaultValue: 'Manage shared money with family, friends, or groups in one place.',
          })}
          actions={
            subscriptionLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-4 text-sm text-muted-foreground sm:w-[180px]"
              >
                <Loader2 size={15} className="animate-spin" />
                <span>{t('common.loading', { defaultValue: 'Loading...' })}</span>
              </div>
            ) : canCreateNewSpace ? (
              <button
                onClick={openCreateSpaceModal}
                className="btn-primary w-full sm:w-auto"
              >
                <Plus size={16} />
                <span>{t('spaces.createNewSpace', { ns: 'portal', defaultValue: 'Create New Space' })}</span>
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
              <span>{t('actions.retry', { ns: 'common', defaultValue: 'Retry' })}</span>
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
          <div className="card p-12 text-center">
            <Home size={48} className="mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-600 text-foreground mb-2">
              {t('spaces.ui.emptyState.title', {
                ns: 'portal',
                defaultValue: 'No Spaces yet',
              })}
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              {t('spaces.ui.emptyState.description', {
                ns: 'portal',
                defaultValue: 'Create a Space to manage shared money with family, friends, or any group.',
              })}
            </p>
            {subscriptionLoading ? (
              <div className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-2.5 text-sm font-600 text-muted-foreground opacity-70">
                {t('common.loading', { defaultValue: 'Loading...' })}
              </div>
            ) : canCreateNewSpace ? (
              <button
                onClick={openCreateSpaceModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow"
              >
                <Plus size={16} /> {t('spaces.createNewSpace', { ns: 'portal', defaultValue: 'Create New Space' })}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-8">
            {activeSpace ? (
              <>
                <section className="card p-6 sm:p-7">
                  <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-600 text-muted-foreground">
                        {t('spaces.ui.currentSpace.label', {
                          ns: 'portal',
                          defaultValue: 'Current Space',
                        })}
                      </p>
                      <div className="mt-3 flex min-w-0 items-start gap-4">
                        <div
                          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
                          style={{ backgroundColor: activeSpace.color || '#0f3460' }}
                        >
                          <Home size={24} />
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-2xl font-700 text-foreground">{activeSpace.name}</h2>
                          <p className="mt-1 text-sm font-600 text-foreground/80">{activeSpaceTypeLabel}</p>
                        </div>
                      </div>
                      <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                        {activeSpace.description?.trim()
                          || t('spaces.ui.currentSpace.descriptionFallback', {
                            ns: 'portal',
                            defaultValue: 'Use this Space to track money, shared expenses, and payments together.',
                          })}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-muted px-3 py-1 text-sm font-600 text-foreground">{activeSpaceTypeLabel}</span>
                        <span className="rounded-full bg-muted px-3 py-1 text-sm font-600 text-foreground">
                          {t('spaces.ui.currentSpace.memberCount', {
                            ns: 'portal',
                            defaultValue: '{{count}} members',
                            count: memberCount,
                          })}
                        </span>
                        {activeSpaceRole ? (
                          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-600 ${ROLE_COLORS[activeSpaceRole]}`}>
                            {React.createElement(ROLE_ICONS[activeSpaceRole] || Users, { size: 14 })}
                            {t('spaces.ui.currentSpace.roleLabel', {
                              ns: 'portal',
                              defaultValue: 'Your role: {{role}}',
                              role: activeSpaceRoleLabel,
                            })}
                          </span>
                        ) : null}
                      </div>
                      {activeSpaceRoleHelp ? (
                        <p className="mt-3 text-sm text-muted-foreground">{activeSpaceRoleHelp}</p>
                      ) : null}
                    </div>
                    <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[280px]">
                      {shouldShowSpaceSelector ? (
                        <div>
                          <label htmlFor="spaces-switcher" className="mb-1.5 block text-sm font-600 text-foreground">
                            {t('spaces.ui.switchSpace', {
                              ns: 'portal',
                              defaultValue: 'Switch Space',
                            })}
                          </label>
                          <div className="relative">
                            <select
                              id="spaces-switcher"
                              value={activeSpaceId || ''}
                              onChange={(e) => {
                                setActiveSpaceId(e.target.value);
                                setOpenMenuId(null);
                              }}
                              className="w-full appearance-none rounded-2xl border border-border bg-card px-4 py-3 pe-10 text-sm font-600 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                              {spaces.map((space) => (
                                <option key={space.id} value={space.id}>
                                  {space.name} - {getFriendlySpaceTypeLabel(space.space_type, (key, options) => t(key, { ns: 'portal', ...options }))}
                                </option>
                              ))}
                            </select>
                            <ChevronDown
                              size={16}
                              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                            />
                          </div>
                        </div>
                      ) : null}
                      <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
                        {hasSharedSpacesFeature && isActiveSpaceOwner ? (
                          <button
                            onClick={() => setShowInviteModal(true)}
                            className="btn-secondary w-full sm:w-auto"
                          >
                            <UserPlus size={15} />
                            <span>{t('spaces.ui.inviteMember', {
                              ns: 'portal',
                              defaultValue: 'Invite Member',
                            })}</span>
                          </button>
                        ) : null}
                        {canManageActiveSpaceSettings ? (
                          <div className="relative sm:self-start xl:self-auto">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === activeSpace.id ? null : activeSpace.id)}
                              className="flex h-11 w-full items-center justify-center rounded-2xl border border-border text-muted-foreground transition-colors hover:bg-muted sm:w-11"
                              aria-label={t('spaces.ui.moreOptions', {
                                ns: 'portal',
                                defaultValue: 'More options',
                              })}
                            >
                              <MoreVertical size={16} />
                            </button>
                            {openMenuId === activeSpace.id && (
                              <div className="absolute right-0 top-12 z-20 min-w-[160px] rounded-2xl border border-border bg-card py-1 shadow-card-md">
                                <button
                                  onClick={() => openEdit(activeSpace)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                                >
                                  <Edit2 size={14} />
                                  {t('spaces.ui.editSpace', {
                                    ns: 'portal',
                                    defaultValue: 'Edit Space',
                                  })}
                                </button>
                                <button
                                  onClick={() => handleArchive(activeSpace)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-negative hover:bg-muted"
                                >
                                  <Archive size={14} />
                                  {t('spaces.ui.archiveSpace', {
                                    ns: 'portal',
                                    defaultValue: 'Archive Space',
                                  })}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-xl font-700 text-foreground">
                      {t('spaces.ui.quickActions.title', {
                        ns: 'portal',
                        defaultValue: 'What would you like to do?',
                      })}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t('spaces.ui.quickActions.description', {
                        ns: 'portal',
                        defaultValue: 'Choose a simple action to keep shared money up to date.',
                      })}
                    </p>
                  </div>
                  {canManageSpaceFinance || canAddSpaceTransactions || (hasSharedSpacesFeature && isActiveSpaceOwner) ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {canManageSpaceFinance ? (
                        <button
                          type="button"
                          onClick={() => setShowSpaceAccountModal(true)}
                          className="rounded-3xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-info-soft text-info">
                            <Wallet size={20} />
                          </div>
                          <h4 className="text-base font-700 text-foreground">
                            {t('spaces.ui.quickActions.addAccount.title', {
                              ns: 'portal',
                              defaultValue: 'Add Account',
                            })}
                          </h4>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {t('spaces.ui.quickActions.addAccount.description', {
                              ns: 'portal',
                              defaultValue: 'Create a shared cash, bank, or wallet account.',
                            })}
                          </p>
                        </button>
                      ) : null}
                      {canAddSpaceTransactions ? (
                        <button
                          type="button"
                          onClick={() => setShowSpaceTransactionModal(true)}
                          className="rounded-3xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-positive-soft text-positive">
                            <CircleDollarSign size={20} />
                          </div>
                          <h4 className="text-base font-700 text-foreground">
                            {t('spaces.ui.quickActions.addTransaction.title', {
                              ns: 'portal',
                              defaultValue: 'Add Expense or Income',
                            })}
                          </h4>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {t('spaces.ui.quickActions.addTransaction.description', {
                              ns: 'portal',
                              defaultValue: 'Record money spent or received in this Space.',
                            })}
                          </p>
                        </button>
                      ) : null}
                      {canAddSpaceTransactions ? (
                        <button
                          type="button"
                          onClick={() => setShowSpaceRecurringModal(true)}
                          className="rounded-3xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-warning-soft text-warning">
                            <Repeat size={20} />
                          </div>
                          <h4 className="text-base font-700 text-foreground">
                            {t('spaces.ui.quickActions.addRecurring.title', {
                              ns: 'portal',
                              defaultValue: 'Add Recurring Payment',
                            })}
                          </h4>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {t('spaces.ui.quickActions.addRecurring.description', {
                              ns: 'portal',
                              defaultValue: 'Schedule rent, fees, subscriptions, or regular expenses.',
                            })}
                          </p>
                        </button>
                      ) : null}
                      {hasSharedSpacesFeature && isActiveSpaceOwner ? (
                        <button
                          type="button"
                          onClick={() => setShowInviteModal(true)}
                          className="rounded-3xl border border-border bg-card p-5 text-left transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
                        >
                          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                            <UserPlus size={20} />
                          </div>
                          <h4 className="text-base font-700 text-foreground">
                            {t('spaces.ui.quickActions.invite.title', {
                              ns: 'portal',
                              defaultValue: 'Invite Member',
                            })}
                          </h4>
                          <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            {t('spaces.ui.quickActions.invite.description', {
                              ns: 'portal',
                              defaultValue: 'Add a family member, friend, or manager.',
                            })}
                          </p>
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-border bg-card p-5">
                      <p className="text-sm font-600 text-foreground">
                        {t('spaces.ui.quickActions.readOnly', {
                          ns: 'portal',
                          defaultValue: 'You can view this Space, but only members with editing access can make changes.',
                        })}
                      </p>
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-xl font-700 text-foreground">
                      {t('spaces.ui.summary.title', {
                        ns: 'portal',
                        defaultValue: 'Simple financial summary',
                      })}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t('spaces.ui.summary.description', {
                        ns: 'portal',
                        defaultValue: 'A quick look at how money is moving in this Space.',
                      })}
                    </p>
                  </div>
                  {loadingFinance ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      {[1, 2, 3, 4].map((card) => (
                        <div key={card} className="h-36 animate-pulse rounded-3xl bg-muted" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-3xl border border-border bg-card p-5">
                        <p className="text-base font-700 text-foreground">
                          {t('spaces.ui.summary.totalBalance.title', {
                            ns: 'portal',
                            defaultValue: 'Total Balance',
                          })}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('spaces.ui.summary.totalBalance.description', {
                            ns: 'portal',
                            defaultValue: 'Money currently available in this Space',
                          })}
                        </p>
                        <div className="mt-4 space-y-2">
                          {totalBalanceByCurrency.length > 0 ? totalBalanceByCurrency.map((row) => (
                            <FormattedCurrencyAmount
                              key={`summary-balance-${row.currency}-${row.amount}`}
                              amount={row.amount}
                              currencyCode={row.currency}
                              className="text-2xl font-700 text-foreground"
                              showCode
                            />
                          )) : (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.summary.totalBalance.empty', {
                                ns: 'portal',
                                defaultValue: 'No shared balance yet',
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-3xl border border-border bg-card p-5">
                        <p className="text-base font-700 text-foreground">
                          {t('spaces.ui.summary.moneyIn.title', {
                            ns: 'portal',
                            defaultValue: 'Money In',
                          })}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('spaces.ui.summary.moneyIn.description', {
                            ns: 'portal',
                            defaultValue: 'Income and member contributions',
                          })}
                        </p>
                        <div className="mt-4 space-y-2">
                          {moneyInRows.length > 0 ? moneyInRows.map((row) => (
                            <FormattedCurrencyAmount
                              key={`summary-in-${row.currency}-${row.amount}`}
                              amount={row.amount}
                              currencyCode={row.currency}
                              className="text-2xl font-700 text-positive"
                              showCode
                            />
                          )) : (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.summary.moneyIn.empty', {
                                ns: 'portal',
                                defaultValue: 'No contributions recorded yet',
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-3xl border border-border bg-card p-5">
                        <p className="text-base font-700 text-foreground">
                          {t('spaces.ui.summary.moneyOut.title', {
                            ns: 'portal',
                            defaultValue: 'Money Out',
                          })}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('spaces.ui.summary.moneyOut.description', {
                            ns: 'portal',
                            defaultValue: 'Expenses during this period',
                          })}
                        </p>
                        <div className="mt-4 space-y-2">
                          {expenseRows.length > 0 ? expenseRows.map((row) => (
                            <FormattedCurrencyAmount
                              key={`summary-out-${row.currency}-${row.amount}`}
                              amount={row.amount}
                              currencyCode={row.currency}
                              className="text-2xl font-700 text-foreground"
                              showCode
                            />
                          )) : (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.summary.moneyOut.empty', {
                                ns: 'portal',
                                defaultValue: 'No expenses recorded yet',
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="rounded-3xl border border-border bg-card p-5">
                        <p className="text-base font-700 text-foreground">
                          {t('spaces.ui.summary.amountOwed.title', {
                            ns: 'portal',
                            defaultValue: 'Amount Owed',
                          })}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('spaces.ui.summary.amountOwed.description', {
                            ns: 'portal',
                            defaultValue: 'Unpaid shared expenses',
                          })}
                        </p>
                        <div className="mt-4 space-y-2">
                          {outstandingReimbursementTotals.length > 0 ? outstandingReimbursementTotals.map((row) => (
                            <FormattedCurrencyAmount
                              key={`summary-owed-${row.currency}-${row.amount}`}
                              amount={row.amount}
                              currencyCode={row.currency}
                              className="text-2xl font-700 text-warning"
                              showCode
                            />
                          )) : (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.ui.summary.amountOwed.empty', {
                                ns: 'portal',
                                defaultValue: 'Everyone is settled up',
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </section>

                <section className="space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-xl font-700 text-foreground">
                      {t('spaces.ui.sharedMoneyDetails.title', {
                        ns: 'portal',
                        defaultValue: 'Shared money details',
                      })}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t('spaces.ui.sharedMoneyDetails.description', {
                        ns: 'portal',
                        defaultValue: 'Open the details you need without crowding the main dashboard.',
                      })}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="rounded-3xl border border-border bg-card p-5">
                      <p className="text-base font-700 text-foreground">
                        {t('spaces.ui.details.contributions.title', {
                          ns: 'portal',
                          defaultValue: 'Member Contributions',
                        })}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('spaces.ui.details.contributions.description', {
                          ns: 'portal',
                          defaultValue: 'Money members added to this Space',
                        })}
                      </p>
                      <div className="mt-4 space-y-2">
                        {contributionTotals.length > 0 ? contributionTotals.map((row) => (
                          <FormattedCurrencyAmount
                            key={`details-contribution-${row.currency}-${row.amount}`}
                            amount={row.amount}
                            currencyCode={row.currency}
                            className="text-lg font-700 text-positive"
                            showCode
                          />
                        )) : (
                          <p className="text-sm text-muted-foreground">
                            {t('spaces.ui.details.contributions.empty', {
                              ns: 'portal',
                              defaultValue: 'No contributions recorded yet',
                            })}
                          </p>
                        )}
                      </div>
                      <a href="#recent-activity" className="mt-5 inline-flex items-center gap-2 text-sm font-600 text-accent hover:underline">
                        {t('spaces.ui.viewDetails', {
                          ns: 'portal',
                          defaultValue: 'View details',
                        })}
                      </a>
                    </div>
                    <div className="rounded-3xl border border-border bg-card p-5">
                      <p className="text-base font-700 text-foreground">
                        {t('spaces.ui.details.owed.title', {
                          ns: 'portal',
                          defaultValue: 'Money Owed',
                        })}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('spaces.ui.details.owed.description', {
                          ns: 'portal',
                          defaultValue: 'Shared expenses waiting to be repaid',
                        })}
                      </p>
                      <div className="mt-4 space-y-2">
                        {outstandingReimbursementTotals.length > 0 ? outstandingReimbursementTotals.map((row) => (
                          <FormattedCurrencyAmount
                            key={`details-owed-${row.currency}-${row.amount}`}
                            amount={row.amount}
                            currencyCode={row.currency}
                            className="text-lg font-700 text-warning"
                            showCode
                          />
                        )) : (
                          <p className="text-sm text-muted-foreground">
                            {t('spaces.ui.details.owed.empty', {
                              ns: 'portal',
                              defaultValue: 'No one owes money right now',
                            })}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/reimbursements?scope=space&spaceId=${activeSpace.id}`}
                        className="mt-5 inline-flex items-center gap-2 text-sm font-600 text-accent hover:underline"
                      >
                        {t('spaces.ui.viewDetails', {
                          ns: 'portal',
                          defaultValue: 'View details',
                        })}
                      </Link>
                    </div>
                    <div className="rounded-3xl border border-border bg-card p-5">
                      <p className="text-base font-700 text-foreground">
                        {t('spaces.ui.details.budgets.title', {
                          ns: 'portal',
                          defaultValue: 'Budgets',
                        })}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('spaces.ui.details.budgets.description', {
                          ns: 'portal',
                          defaultValue: 'Spending limits for this Space',
                        })}
                      </p>
                      <div className="mt-4 space-y-2 text-sm">
                        {activeBudgetCount > 0 ? (
                          <>
                            <p className="font-700 text-foreground">
                              {t('spaces.ui.details.budgets.active', {
                                ns: 'portal',
                                defaultValue: '{{count}} budgets active',
                                count: activeBudgetCount,
                              })}
                            </p>
                            <p className="text-muted-foreground">
                              {budgetWarningCount > 0
                                ? t('spaces.ui.details.budgets.warning', {
                                    ns: 'portal',
                                    defaultValue: '{{count}} budgets need attention',
                                    count: budgetWarningCount,
                                  })
                                : t('spaces.ui.details.budgets.ok', {
                                    ns: 'portal',
                                    defaultValue: 'Budgets are on track right now',
                                  })}
                            </p>
                          </>
                        ) : (
                          <p className="text-muted-foreground">
                            {t('spaces.ui.details.budgets.empty', {
                              ns: 'portal',
                              defaultValue: 'No budgets created yet',
                            })}
                          </p>
                        )}
                      </div>
                      <Link
                        href={`/budgets?scope=space&spaceId=${activeSpace.id}`}
                        className="mt-5 inline-flex items-center gap-2 text-sm font-600 text-accent hover:underline"
                      >
                        {t('spaces.ui.viewDetails', {
                          ns: 'portal',
                          defaultValue: 'View details',
                        })}
                      </Link>
                    </div>
                  </div>
                </section>

                <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <div className="rounded-3xl border border-border bg-card p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-700 text-foreground">
                          {t('spaces.ui.accounts.title', {
                            ns: 'portal',
                            defaultValue: 'Shared Accounts',
                          })}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('spaces.ui.accounts.description', {
                            ns: 'portal',
                            defaultValue: 'Accounts used for shared money in this Space.',
                          })}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-3 py-1 text-sm font-600 text-foreground">{activeSpaceAccounts.length}</span>
                    </div>
                    {loadingFinance ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((item) => (
                          <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />
                        ))}
                      </div>
                    ) : activeSpaceAccounts.length === 0 ? (
                      <div className="rounded-3xl bg-muted/30 p-5 text-center">
                        <p className="text-base font-700 text-foreground">
                          {t('spaces.ui.accounts.emptyTitle', {
                            ns: 'portal',
                            defaultValue: 'No shared accounts yet',
                          })}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t('spaces.ui.accounts.emptyDescription', {
                            ns: 'portal',
                            defaultValue: 'Create an account to start tracking shared money.',
                          })}
                        </p>
                        {canManageSpaceFinance ? (
                          <button type="button" onClick={() => setShowSpaceAccountModal(true)} className="btn-secondary mt-4">
                            <Plus size={15} />
                            <span>{t('spaces.ui.quickActions.addAccount.title', {
                              ns: 'portal',
                              defaultValue: 'Add Account',
                            })}</span>
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {activeSpaceAccounts.map((account) => (
                          <div key={account.id} className="rounded-2xl bg-muted/20 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-base font-700 text-foreground">{account.name}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {t(`accounts.types.${account.account_type}`, {
                                    ns: 'portal',
                                    defaultValue: account.account_type,
                                  })}
                                </p>
                                <p className="mt-2 text-xs font-600 text-muted-foreground">
                                  {t('spaces.ui.accounts.balanceLabel', {
                                    ns: 'portal',
                                    defaultValue: 'Current balance',
                                  })}
                                </p>
                              </div>
                              <FormattedCurrencyAmount
                                amount={account.current_balance}
                                currencyCode={account.currency}
                                className="text-lg font-700 text-foreground"
                                showCode
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div id="recent-activity" className="rounded-3xl border border-border bg-card p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-700 text-foreground">
                          {t('spaces.ui.activity.title', {
                            ns: 'portal',
                            defaultValue: 'Recent Activity',
                          })}
                        </h3>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t('spaces.ui.activity.description', {
                            ns: 'portal',
                            defaultValue: 'Recent expenses, income, money added, and payments in this Space.',
                          })}
                        </p>
                      </div>
                      <span className="rounded-full bg-muted px-3 py-1 text-sm font-600 text-foreground">{recentActivityItems.length}</span>
                    </div>
                    {loadingFinance ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((item) => (
                          <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />
                        ))}
                      </div>
                    ) : recentActivityItems.length === 0 ? (
                      <div className="rounded-3xl bg-muted/30 p-5 text-center">
                        <p className="text-base font-700 text-foreground">
                          {t('spaces.ui.activity.emptyTitle', {
                            ns: 'portal',
                            defaultValue: 'No activity yet',
                          })}
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {t('spaces.ui.activity.emptyDescription', {
                            ns: 'portal',
                            defaultValue: 'Add an expense, income, or contribution to get started.',
                          })}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {recentActivityItems.map((item) => {
                          const ActivityIcon = ACTIVITY_ICONS[item.kind];
                          return (
                            <div key={item.id} className="rounded-2xl bg-muted/20 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 gap-3">
                                  <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${ACTIVITY_BADGE_COLORS[item.kind]}`}>
                                    <ActivityIcon size={18} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="truncate text-sm font-700 text-foreground">{item.title}</p>
                                      <span className={`rounded-full px-2.5 py-1 text-xs font-600 ${ACTIVITY_BADGE_COLORS[item.kind]}`}>
                                        {getActivityTypeLabel(item.kind, (key, options) => t(key, { ns: 'portal', ...options }))}
                                      </span>
                                    </div>
                                    <p className="mt-1 text-sm text-muted-foreground">{item.subtitle}</p>
                                  </div>
                                </div>
                                <FormattedCurrencyAmount
                                  amount={item.amount}
                                  currencyCode={item.currency}
                                  className={`text-sm font-700 ${item.toneClassName}`}
                                  showCode
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {loadingDetails ? (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="h-40 animate-pulse rounded-3xl bg-muted" />
                    <div className="h-40 animate-pulse rounded-3xl bg-muted" />
                  </div>
                ) : activeSpaceRole ? (
                  <>
                    <section className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-xl font-700 text-foreground">
                          {t('spaces.ui.members.title', {
                            ns: 'portal',
                            defaultValue: 'Members',
                          })}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {t('spaces.ui.members.description', {
                            ns: 'portal',
                            defaultValue: 'See who is part of this Space and what each person can do.',
                          })}
                        </p>
                      </div>
                      {members.length === 0 ? (
                        <div className="rounded-3xl border border-border bg-card p-6 text-center">
                          <p className="text-base font-700 text-foreground">
                            {t('spaces.ui.members.emptyTitle', {
                              ns: 'portal',
                              defaultValue: 'No members yet',
                            })}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {t('spaces.ui.members.emptyDescription', {
                              ns: 'portal',
                              defaultValue: 'Invite someone to share this Space.',
                            })}
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
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
                              <div key={member.id} className="rounded-3xl border border-border bg-card p-5">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="flex min-w-0 gap-4">
                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full gradient-teal text-base font-700 text-white">
                                      {(member.user_profile?.full_name || member.user_profile?.email || 'U').charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="truncate text-base font-700 text-foreground">
                                          {member.user_profile?.full_name || t('spaces.unknownUser', { ns: 'portal' })}
                                        </p>
                                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-600 ${ROLE_COLORS[member.role]}`}>
                                          <RoleIcon size={12} />
                                          {getRoleLabel(member.role, (key, options) => t(key, { ns: 'portal', ...options }))}
                                        </span>
                                      </div>
                                      <p className="mt-1 truncate text-sm text-muted-foreground">
                                        {member.user_profile?.email || t('spaces.ui.members.noEmail', {
                                          ns: 'portal',
                                          defaultValue: 'No email available',
                                        })}
                                      </p>
                                      <p className="mt-2 text-sm text-muted-foreground">
                                        {getRoleExplanation(member.role, (key, options) => t(key, { ns: 'portal', ...options }))}
                                      </p>
                                      {member.role === 'owner' ? (
                                        <p className="mt-2 text-xs font-600 text-muted-foreground">
                                          {t('spaces.ui.members.ownerProtected', {
                                            ns: 'portal',
                                            defaultValue: 'The owner always keeps full control of this Space.',
                                          })}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[220px]">
                                    {canEditMemberRole ? (
                                      <div>
                                        <label htmlFor={`member-role-${member.id}`} className="mb-1.5 block text-sm font-600 text-foreground">
                                          {t('spaces.ui.members.changeRole', {
                                            ns: 'portal',
                                            defaultValue: 'Change role',
                                          })}
                                        </label>
                                        <select
                                          id={`member-role-${member.id}`}
                                          value={member.role}
                                          onChange={(e) => handleRoleChange(member.id, e.target.value as SpaceRole)}
                                          className="w-full rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-600 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                                        >
                                          {SPACE_MEMBER_ASSIGNABLE_ROLES.map((role) => (
                                            <option key={role} value={role}>
                                              {getRoleLabel(role, (key, options) => t(key, { ns: 'portal', ...options }))}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                    ) : null}
                                    {canRemoveMemberEntry ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveMember(member.id, member.user_profile?.full_name || 'member')}
                                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-negative/30 px-4 py-2.5 text-sm font-600 text-negative transition-colors hover:bg-negative-soft/60"
                                      >
                                        <Trash2 size={15} />
                                        <span>{t('spaces.ui.members.remove', {
                                          ns: 'portal',
                                          defaultValue: 'Remove member',
                                        })}</span>
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {members.length <= 1 && canManageInvitations ? (
                        <div className="rounded-3xl border border-border bg-card p-5">
                          <p className="text-base font-700 text-foreground">
                            {t('spaces.ui.members.sharePrompt', {
                              ns: 'portal',
                              defaultValue: 'Invite someone to share this Space',
                            })}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {t('spaces.ui.members.sharePromptDescription', {
                              ns: 'portal',
                              defaultValue: 'Bring in a family member, friend, or helper so they can add or view shared activity.',
                            })}
                          </p>
                          <button type="button" onClick={() => setShowInviteModal(true)} className="btn-secondary mt-4">
                            <UserPlus size={15} />
                            <span>{t('spaces.ui.inviteMember', {
                              ns: 'portal',
                              defaultValue: 'Invite Member',
                            })}</span>
                          </button>
                        </div>
                      ) : null}
                    </section>

                    <section className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-xl font-700 text-foreground">
                          {t('spaces.ui.invitations.title', {
                            ns: 'portal',
                            defaultValue: 'Invitations',
                          })}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {t('spaces.ui.invitations.description', {
                            ns: 'portal',
                            defaultValue: 'Manage invitations you received or sent for this Space.',
                          })}
                        </p>
                      </div>
                      {loadingInvitations && !receivedInvitations.length && !pendingInvitations.length ? (
                        <div className="h-32 animate-pulse rounded-3xl bg-muted" />
                      ) : hasInvitationActivity ? (
                        <div className="space-y-4">
                          {receivedInvitations.length > 0 ? (
                            <div className="rounded-3xl border border-border bg-card p-5">
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                  <h4 className="text-base font-700 text-foreground">
                                    {t('spaces.ui.invitations.receivedTitle', {
                                      ns: 'portal',
                                      defaultValue: 'Waiting for your response',
                                    })}
                                  </h4>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {t('spaces.ui.invitations.receivedDescription', {
                                      ns: 'portal',
                                      defaultValue: 'Accept or decline invitations sent to you.',
                                    })}
                                  </p>
                                </div>
                                <span className="rounded-full bg-muted px-3 py-1 text-sm font-600 text-foreground">{receivedInvitations.length}</span>
                              </div>
                              <div className="space-y-3">
                                {receivedInvitations.map((invitation) => (
                                  <div key={invitation.id} className="rounded-2xl bg-muted/20 p-4">
                                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                      <div className="min-w-0">
                                        <p className="text-base font-700 text-foreground">
                                          {invitation.space?.name || t('spaces.invitationPage.fallbackUnknownSpace', { ns: 'portal' })}
                                        </p>
                                        <p className="mt-1 text-sm text-muted-foreground">
                                          {t('spaces.received.invitedBy', {
                                            ns: 'portal',
                                            inviter: invitation.inviter?.full_name || invitation.inviter?.email || t('spaces.invitationPage.fallbackInviter', { ns: 'portal' }),
                                          })}
                                        </p>
                                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-600 text-muted-foreground">
                                          <span className={`rounded-full px-2.5 py-1 ${STATUS_COLORS.pending}`}>
                                            {t('spaces.received.pending', { ns: 'portal' })}
                                          </span>
                                          <span className="rounded-full bg-muted px-2.5 py-1 text-foreground">
                                            {t('spaces.ui.invitations.roleBadge', {
                                              ns: 'portal',
                                              defaultValue: 'Role: {{role}}',
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
                                          onClick={() => handleRespondToReceivedInvitation(invitation, 'accepted')}
                                          disabled={respondingInvitationId === invitation.id}
                                          className="btn-primary"
                                        >
                                          <CheckCircle2 size={15} />
                                          <span>{t('spaces.received.acceptAction', { ns: 'portal' })}</span>
                                        </button>
                                        <button
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
                            </div>
                          ) : null}

                          {canManageInvitations ? (
                            <div className="rounded-3xl border border-border bg-card p-5">
                              <div className="mb-4 flex items-center justify-between gap-3">
                                <div>
                                  <h4 className="text-base font-700 text-foreground">
                                    {t('spaces.ui.invitations.sentTitle', {
                                      ns: 'portal',
                                      defaultValue: 'Pending invitations',
                                    })}
                                  </h4>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {t('spaces.ui.invitations.sentDescription', {
                                      ns: 'portal',
                                      defaultValue: 'Invite someone to help manage or view this Space.',
                                    })}
                                  </p>
                                </div>
                                <span className="rounded-full bg-muted px-3 py-1 text-sm font-600 text-foreground">{pendingInvitations.length}</span>
                              </div>
                              {pendingInvitations.length === 0 ? (
                                <div className="rounded-3xl bg-muted/30 p-5 text-center">
                                  <p className="text-base font-700 text-foreground">
                                    {t('spaces.ui.invitations.emptyTitle', {
                                      ns: 'portal',
                                      defaultValue: 'No pending invitations',
                                    })}
                                  </p>
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    {t('spaces.ui.invitations.emptyDescription', {
                                      ns: 'portal',
                                      defaultValue: 'Invite someone to help manage or view this Space.',
                                    })}
                                  </p>
                                  <button type="button" onClick={() => setShowInviteModal(true)} className="btn-secondary mt-4">
                                    <UserPlus size={15} />
                                    <span>{t('spaces.ui.inviteMember', {
                                      ns: 'portal',
                                      defaultValue: 'Invite Member',
                                    })}</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="space-y-3">
                                  {pendingInvitations.map((inv) => (
                                    <div key={inv.id} className="rounded-2xl bg-muted/20 p-4">
                                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0">
                                          <p className="truncate text-base font-700 text-foreground">{inv.email}</p>
                                          <div className="mt-3 flex flex-wrap gap-2 text-xs font-600 text-muted-foreground">
                                            <span className={`rounded-full px-2.5 py-1 ${STATUS_COLORS[inv.status] || 'bg-muted text-muted-foreground'}`}>
                                              {getInvitationStatusLabel(inv.status, (key, options) => t(key, { ns: 'portal', ...options }))}
                                            </span>
                                            <span className="rounded-full bg-muted px-2.5 py-1 text-foreground">
                                              {t('spaces.ui.invitations.roleBadge', {
                                                ns: 'portal',
                                                defaultValue: 'Role: {{role}}',
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
                                          onClick={() => handleRevoke(inv.id)}
                                          className="inline-flex items-center gap-2 text-sm font-600 text-negative hover:underline"
                                        >
                                          <XCircle size={15} />
                                          <span>{t('spaces.revokeAction', { ns: 'portal' })}</span>
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-3xl border border-border bg-card p-6 text-center">
                          <p className="text-base font-700 text-foreground">
                            {t('spaces.ui.invitations.emptyTitle', {
                              ns: 'portal',
                              defaultValue: 'No pending invitations',
                            })}
                          </p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {t('spaces.ui.invitations.emptyDescription', {
                              ns: 'portal',
                              defaultValue: 'Invite someone to help manage or view this Space.',
                            })}
                          </p>
                          {canManageInvitations ? (
                            <button type="button" onClick={() => setShowInviteModal(true)} className="btn-secondary mt-4">
                              <UserPlus size={15} />
                              <span>{t('spaces.ui.inviteMember', {
                                ns: 'portal',
                                defaultValue: 'Invite Member',
                              })}</span>
                            </button>
                          ) : null}
                        </div>
                      )}
                    </section>

                    <details className="group rounded-3xl border border-border bg-card p-5">
                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                        <div>
                          <h3 className="text-xl font-700 text-foreground">
                            {t('spaces.ui.advanced.title', {
                              ns: 'portal',
                              defaultValue: 'Advanced details',
                            })}
                          </h3>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {t('spaces.ui.advanced.description', {
                              ns: 'portal',
                              defaultValue: 'Open full pages for reimbursements, payments, reports, and other detailed records.',
                            })}
                          </p>
                        </div>
                        <ChevronDown size={18} className="text-muted-foreground transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="mt-5 space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/reimbursements?scope=space&spaceId=${activeSpace.id}`} className="btn-secondary">
                            <HandCoins size={15} />
                            <span>{t('spaces.ui.advanced.reimbursements', {
                              ns: 'portal',
                              defaultValue: 'Money owed',
                            })}</span>
                          </Link>
                          <Link href={`/settlements?scope=space&spaceId=${activeSpace.id}`} className="btn-secondary">
                            <CircleDollarSign size={15} />
                            <span>{t('spaces.ui.advanced.settlements', {
                              ns: 'portal',
                              defaultValue: 'Payments',
                            })}</span>
                          </Link>
                          <Link href={`/reports?scope=space&spaceId=${activeSpace.id}`} className="btn-secondary">
                            <ReceiptText size={15} />
                            <span>{t('spaces.ui.advanced.reports', {
                              ns: 'portal',
                              defaultValue: 'Reports',
                            })}</span>
                          </Link>
                        </div>
                        {spaceFinanceError ? (
                          <div className="rounded-2xl border border-warning/30 bg-warning-soft/60 px-4 py-3 text-sm text-warning">
                            <p className="font-700 text-foreground">
                              {t('spaces.ui.advanced.financeErrorTitle', {
                                ns: 'portal',
                                defaultValue: 'Some detailed finance information could not be loaded.',
                              })}
                            </p>
                            <div className="mt-2 space-y-1 font-mono text-xs break-words">
                              <p><span className="font-700">loader:</span> {spaceFinanceError.loader}</p>
                              <p><span className="font-700">request:</span> {spaceFinanceError.request}</p>
                              <p><span className="font-700">message:</span> {spaceFinanceError.message}</p>
                              <p><span className="font-700">code:</span> {spaceFinanceError.code || 'null'}</p>
                              <p><span className="font-700">details:</span> {spaceFinanceError.details || 'null'}</p>
                              <p><span className="font-700">hint:</span> {spaceFinanceError.hint || 'null'}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {t('spaces.ui.advanced.helper', {
                              ns: 'portal',
                              defaultValue: 'The main dashboard stays simple, while detailed pages remain available when you need them.',
                            })}
                          </p>
                        )}
                      </div>
                    </details>
                  </>
                ) : null}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-card-md w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-700 text-foreground">
                {editingSpace
                  ? t('spaces.ui.modal.editSpace', { ns: 'portal', defaultValue: 'Edit Space' })
                  : t('spaces.ui.modal.createSpace', { ns: 'portal', defaultValue: 'Create Space' })}
              </h3>
              <button onClick={closeSpaceFormModal} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('spaces.form.name', { ns: 'portal' })}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  setSpaceFormError(null);
                  setForm({ ...form, name: e.target.value });
                }}
                placeholder={t('spaces.form.namePlaceholder', { ns: 'portal' })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
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

            {spaceFormError ? (
              <div className="rounded-xl border border-negative/20 bg-negative-soft/50 px-4 py-3 text-sm text-negative">
                {spaceFormError}
              </div>
            ) : null}

            <div className="flex gap-3 pt-1">
              <button
                onClick={closeSpaceFormModal}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
              >
                {t('actions.cancel', { ns: 'common' })}
              </button>
              <button
                onClick={editingSpace ? handleUpdate : handleCreate}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity disabled:opacity-60"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-card-md w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-700 text-foreground">
                {t('spaces.ui.modal.inviteMember', { ns: 'portal', defaultValue: 'Invite Member' })}
              </h3>
              <button onClick={() => setShowInviteModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('spaces.ui.modal.emailLabel', { ns: 'portal', defaultValue: 'Email address' })}
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
                {t('spaces.ui.modal.roleLabel', { ns: 'portal', defaultValue: 'Access level' })}
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

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
              >
                {t('actions.cancel', { ns: 'common' })}
              </button>
              <button
                onClick={handleInvite}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? t('spaces.sending', { ns: 'portal' }) : t('spaces.sendInvitation', { ns: 'portal' })}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={showSpaceAccountModal && !!activeSpace}
        onClose={() => setShowSpaceAccountModal(false)}
        title={t('spaces.ui.quickActions.addAccount.title', {
          ns: 'portal',
          defaultValue: 'Add Account',
        })}
        size="md"
      >
        {activeSpace ? (
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
        ) : null}
      </Modal>

      <AddTransactionModal
        isOpen={showSpaceTransactionModal && !!activeSpace}
        onClose={() => setShowSpaceTransactionModal(false)}
        spaceId={activeSpace?.id || null}
        spaceName={activeSpace?.name || null}
        spaceMembers={members}
        onSaved={async () => {
          if (!activeSpace) return;
          setShowSpaceTransactionModal(false);
          await loadSpaceFinance(activeSpace.id);
        }}
      />

      <Modal
        isOpen={showSpaceRecurringModal && !!activeSpace}
        onClose={() => setShowSpaceRecurringModal(false)}
        title={t('spaces.ui.quickActions.addRecurring.title', {
          ns: 'portal',
          defaultValue: 'Add Recurring Payment',
        })}
        size="md"
      >
        {activeSpace ? (
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
        ) : null}
      </Modal>

      <ConfirmationModal
        open={Boolean(pendingConfirmation)}
        title={pendingConfirmation?.title || t('actions.confirm', { ns: 'common', defaultValue: 'Confirm' })}
        description={pendingConfirmation?.description}
        confirmLabel={pendingConfirmation?.confirmLabel || t('actions.confirm', { ns: 'common', defaultValue: 'Confirm' })}
        cancelLabel={t('actions.keep', { ns: 'common', defaultValue: 'Keep' })}
        onConfirm={() => void handleConfirmPendingAction()}
        onClose={() => {
          if (!confirmingAction) {
            setPendingConfirmation(null);
          }
        }}
        pending={confirmingAction}
        confirmTone={pendingConfirmation?.kind === 'archive-space' ? 'warning' : 'danger'}
      />
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
