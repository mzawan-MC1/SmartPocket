'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { useTranslation } from 'react-i18next';

import { Home, Plus, Users, Mail, MoreVertical, Archive, Edit2, Crown, Shield, Eye, UserPlus, Clock, XCircle, Trash2, CheckCircle2, ChevronDown, Loader2 } from 'lucide-react';
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
import StatusBadge from '@/components/ui/StatusBadge';
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

function formatCurrencyGroup(value: number, currency: string) {
  return (
    <FormattedCurrencyAmount
      key={`${currency}-${value}`}
      amount={value}
      currencyCode={currency}
      className="text-sm font-700 text-foreground"
      showCode
    />
  );
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
          description={t('spaces.description', { ns: 'portal' })}
          badge={<StatusBadge status="info" label={t('spaces.badge', { ns: 'portal' })} />}
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

        {loadingInvitations && !receivedInvitations.length ? (
          <div className="card p-4 mb-5 animate-pulse h-28 bg-muted" />
        ) : receivedInvitations.length > 0 ? (
          <div className="card p-5 mb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-700 text-foreground flex items-center gap-2">
                <Mail size={16} className="text-accent" />
                {t('spaces.received.title', { ns: 'portal' })}
              </h3>
              <span className="text-xs text-muted-foreground">
                {receivedInvitations.length}
              </span>
            </div>
            <div className="space-y-3">
              {receivedInvitations.map((invitation) => (
                <div key={invitation.id} className="rounded-2xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-700 text-foreground truncate">
                        {invitation.space?.name || t('spaces.invitationPage.fallbackUnknownSpace', { ns: 'portal' })}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('spaces.received.invitedBy', {
                          ns: 'portal',
                          inviter: invitation.inviter?.full_name || invitation.inviter?.email || t('spaces.invitationPage.fallbackInviter', { ns: 'portal' }),
                        })}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full font-600 ${STATUS_COLORS.pending}`}>
                      {t('spaces.received.pending', { ns: 'portal' })}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                    <span>{getRoleLabel(invitation.role, (key, options) => t(key, { ns: 'portal', ...options }))}</span>
                    {invitation.expires_at ? (
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {t('spaces.expiresOn', {
                          ns: 'portal',
                          date: new Date(invitation.expires_at).toLocaleDateString(language),
                        })}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 mt-4">
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
              ))}
            </div>
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
            <h3 className="text-lg font-600 text-foreground mb-2">{t('spaces.emptyTitle', { ns: 'portal' })}</h3>
            <p className="text-sm text-muted-foreground mb-6">{t('spaces.emptyDescription', { ns: 'portal' })}</p>
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
          <div className="space-y-4">
            {activeSpace ? (
              <>
                {/* Space Header */}
                <div className="card p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white"
                        style={{ backgroundColor: activeSpace.color || '#0f3460' }}
                      >
                        <Home size={22} />
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-700 text-foreground">{activeSpace.name}</h2>
                        <p className="text-sm text-muted-foreground capitalize">
                          {getSpaceTypeLabel(activeSpace.space_type, (key, options) => t(key, { ns: 'portal', ...options }))}
                        </p>
                        {activeSpace.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{activeSpace.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex w-full flex-col gap-3 lg:w-auto lg:min-w-[260px] lg:items-end">
                      {shouldShowSpaceSelector ? (
                        <div className="w-full lg:max-w-[320px]">
                          <label className="mb-1.5 block text-xs font-600 uppercase tracking-[0.14em] text-muted-foreground">
                            {t('spaces.yourSpaces', { ns: 'portal' })}
                          </label>
                          <div className="relative">
                            <select
                              value={activeSpaceId || ''}
                              onChange={(e) => {
                                setActiveSpaceId(e.target.value);
                                setOpenMenuId(null);
                              }}
                              className="w-full appearance-none rounded-xl border border-border bg-card px-4 py-2.5 pe-10 text-sm font-600 text-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
                            >
                              {spaces.map((space) => (
                                <option key={space.id} value={space.id}>
                                  {space.name} - {getSpaceTypeLabel(space.space_type, (key, options) => t(key, { ns: 'portal', ...options }))}
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
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {hasSharedSpacesFeature && isActiveSpaceOwner ? (
                          <button
                            onClick={() => setShowInviteModal(true)}
                            className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-600 text-foreground transition-colors hover:bg-muted"
                          >
                            <UserPlus size={15} /> {t('spaces.inviteAction', { ns: 'portal' })}
                          </button>
                        ) : null}
                        {canManageActiveSpaceSettings ? (
                          <div className="relative">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === activeSpace.id ? null : activeSpace.id)}
                              className="flex h-10 w-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted"
                              aria-label={t('actions.more', { ns: 'common', defaultValue: 'More actions' })}
                            >
                              <MoreVertical size={15} />
                            </button>
                            {openMenuId === activeSpace.id && (
                              <div className="absolute right-0 top-12 z-20 min-w-[140px] rounded-xl border border-border bg-card py-1 shadow-card-md">
                                <button
                                  onClick={() => openEdit(activeSpace)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                                >
                                  <Edit2 size={14} /> {t('actions.edit', { ns: 'common' })}
                                </button>
                                <button
                                  onClick={() => handleArchive(activeSpace)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-negative hover:bg-muted"
                                >
                                  <Archive size={14} /> {t('spaces.archiveAction', { ns: 'portal' })}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card p-5">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-sm font-700 text-foreground">
                          {t('spaces.finance.title', {
                            ns: 'portal',
                            defaultValue: 'Shared Finance',
                          })}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {t('spaces.finance.helper', {
                            ns: 'portal',
                            defaultValue: 'Space-owned accounts and Space-linked transactions reuse the same finance engine as personal finance.',
                          })}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canManageSpaceFinance ? (
                          <button
                            onClick={() => setShowSpaceAccountModal(true)}
                            className="btn-secondary"
                          >
                            <Plus size={15} />
                            <span>{t('spaces.finance.addAccount', {
                              ns: 'portal',
                              defaultValue: 'Add Space Account',
                            })}</span>
                          </button>
                        ) : null}
                        {canAddSpaceTransactions ? (
                          <button
                            onClick={() => setShowSpaceTransactionModal(true)}
                            className="btn-primary"
                          >
                            <Plus size={15} />
                            <span>{t('spaces.finance.addTransaction', {
                              ns: 'portal',
                              defaultValue: 'Add Space Transaction',
                            })}</span>
                          </button>
                        ) : null}
                        {canAddSpaceTransactions ? (
                          <button
                            onClick={() => setShowSpaceRecurringModal(true)}
                            className="btn-secondary"
                          >
                            <Plus size={15} />
                            <span>{t('spaces.finance.addRecurring', {
                              ns: 'portal',
                              defaultValue: 'Add Space Recurring',
                            })}</span>
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {loadingFinance ? (
                      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
                        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {spaceFinanceError ? (
                          <div className="rounded-2xl border border-warning/30 bg-warning-soft/60 px-4 py-3 text-sm text-warning">
                            <p className="font-700 text-foreground">
                              {t('spaces.finance.loadFailed', {
                                ns: 'portal',
                                defaultValue: 'Failed to load shared finance details.',
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
                        ) : null}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                              {t('spaces.finance.dashboard.totalBalance', {
                                ns: 'portal',
                                defaultValue: 'Total Space balance',
                              })}
                            </p>
                            <div className="mt-2 space-y-1">
                              {totalBalanceByCurrency.length > 0
                                ? totalBalanceByCurrency.map((row) => formatCurrencyGroup(row.amount, row.currency))
                                : <p className="text-sm text-muted-foreground">{t('spaces.finance.noData', { ns: 'portal', defaultValue: 'No data yet.' })}</p>}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                              {t('spaces.finance.dashboard.income', {
                                ns: 'portal',
                                defaultValue: 'Income this period',
                              })}
                            </p>
                            <div className="mt-2 space-y-1">
                              {spaceReportData?.incomeMetric.reportingAmount !== null ? (
                                <FormattedCurrencyAmount
                                  amount={spaceReportData?.incomeMetric.reportingAmount || 0}
                                  currencyCode={spaceReportData?.incomeMetric.reportingCurrency || ''}
                                  className="text-sm font-700 text-positive"
                                  showCode
                                />
                              ) : (
                                (spaceReportData?.incomeMetric.originalTotals || []).map((row) => (
                                  <FormattedCurrencyAmount
                                    key={`income-${row.currency}-${row.amount}`}
                                    amount={row.amount}
                                    currencyCode={row.currency}
                                    className="text-sm font-700 text-positive"
                                    showCode
                                  />
                                ))
                              )}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                              {t('spaces.finance.dashboard.expenses', {
                                ns: 'portal',
                                defaultValue: 'Expenses this period',
                              })}
                            </p>
                            <div className="mt-2 space-y-1">
                              {spaceReportData?.expensesMetric.reportingAmount !== null ? (
                                <FormattedCurrencyAmount
                                  amount={spaceReportData?.expensesMetric.reportingAmount || 0}
                                  currencyCode={spaceReportData?.expensesMetric.reportingCurrency || ''}
                                  className="text-sm font-700 text-foreground"
                                  showCode
                                />
                              ) : (
                                (spaceReportData?.expensesMetric.originalTotals || []).map((row) => (
                                  <FormattedCurrencyAmount
                                    key={`expense-${row.currency}-${row.amount}`}
                                    amount={row.amount}
                                    currencyCode={row.currency}
                                    className="text-sm font-700 text-foreground"
                                    showCode
                                  />
                                ))
                              )}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                              {t('spaces.finance.dashboard.contributions', {
                                ns: 'portal',
                                defaultValue: 'Member contributions',
                              })}
                            </p>
                            <div className="mt-2 space-y-1">
                              {contributionTotals.length > 0
                                ? contributionTotals.map((row) => formatCurrencyGroup(row.amount, row.currency))
                                : <p className="text-sm text-muted-foreground">{t('spaces.finance.noData', { ns: 'portal', defaultValue: 'No data yet.' })}</p>}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                              {t('spaces.finance.dashboard.reimbursements', {
                                ns: 'portal',
                                defaultValue: 'Outstanding reimbursements',
                              })}
                            </p>
                            <div className="mt-2 space-y-1">
                              {outstandingReimbursementTotals.length > 0
                                ? outstandingReimbursementTotals.map((row) => formatCurrencyGroup(row.amount, row.currency))
                                : <p className="text-sm text-muted-foreground">{t('spaces.finance.noData', { ns: 'portal', defaultValue: 'No data yet.' })}</p>}
                            </div>
                          </div>
                          <div className="rounded-2xl border border-border p-4">
                            <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                              {t('spaces.finance.dashboard.budgetUsage', {
                                ns: 'portal',
                                defaultValue: 'Budget coverage',
                              })}
                            </p>
                            <div className="mt-2 space-y-1 text-sm text-foreground">
                              <p className="font-700">
                                {t('spaces.finance.dashboard.activeBudgets', {
                                  ns: 'portal',
                                  defaultValue: '{{count}} active budgets',
                                  count: spaceBudgetOverview?.items.length || 0,
                                })}
                              </p>
                              <p className="text-muted-foreground">
                                {t('spaces.finance.dashboard.budgetWarnings', {
                                  ns: 'portal',
                                  defaultValue: '{{count}} budgets need attention',
                                  count: budgetWarningCount,
                                })}
                              </p>
                              <p className="text-muted-foreground">
                                {t('spaces.finance.dashboard.settlementsRecorded', {
                                  ns: 'portal',
                                  defaultValue: '{{count}} settlements recorded',
                                  count: spaceSettlements.length,
                                })}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-border p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-700 text-foreground">
                              {t('spaces.finance.accountsTitle', {
                                ns: 'portal',
                                defaultValue: 'Space Accounts',
                              })}
                            </h4>
                            <span className="text-xs text-muted-foreground">{activeSpaceAccounts.length}</span>
                          </div>
                          {activeSpaceAccounts.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.finance.accountsEmpty', {
                                ns: 'portal',
                                defaultValue: 'No Space-owned accounts yet.',
                              })}
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {activeSpaceAccounts.map((account) => (
                                <div key={account.id} className="rounded-xl border border-border bg-muted/10 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-700 text-foreground">{account.name}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {t(`accounts.types.${account.account_type}`, {
                                          ns: 'portal',
                                          defaultValue: account.account_type,
                                        })}
                                      </p>
                                    </div>
                                    <FormattedCurrencyAmount
                                      amount={account.current_balance}
                                      currencyCode={account.currency}
                                      className="text-sm font-700 text-foreground"
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="rounded-2xl border border-border p-4">
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <h4 className="text-sm font-700 text-foreground">
                              {t('spaces.finance.transactionsTitle', {
                                ns: 'portal',
                                defaultValue: 'Recent Space Transactions',
                              })}
                            </h4>
                            <span className="text-xs text-muted-foreground">{spaceTransactions.length}</span>
                          </div>
                          {spaceTransactions.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                              {t('spaces.finance.transactionsEmpty', {
                                ns: 'portal',
                                defaultValue: 'No Space-linked transactions yet.',
                              })}
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {spaceTransactions.map((transaction) => (
                                <div key={transaction.id} className="rounded-xl border border-border bg-muted/10 p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-700 text-foreground">
                                        {transaction.description || transaction.merchant || t('spaces.finance.transactionFallback', {
                                          ns: 'portal',
                                          defaultValue: 'Space transaction',
                                        })}
                                      </p>
                                      <p className="mt-1 text-xs text-muted-foreground">
                                        {transaction.category?.name
                                          ? translateSystemCategoryName(transaction.category.name, (key, options) =>
                                              t(key, { ...(options || {}), ns: 'common' })
                                            )
                                          : t('transactions.noCategory', { ns: 'portal' })}
                                        {' · '}
                                        {transaction.account?.name || t('transactions.noAccount', { ns: 'portal' })}
                                        {' · '}
                                        {new Date(transaction.transaction_date).toLocaleDateString(language)}
                                      </p>
                                    </div>
                                    <FormattedCurrencyAmount
                                      amount={transaction.transaction_type === 'expense'
                                        ? -Math.abs(Number(transaction.amount || 0))
                                        : Number(transaction.amount || 0)}
                                      currencyCode={transaction.currency}
                                      className={transaction.transaction_type === 'expense'
                                        ? 'text-sm font-700 text-foreground'
                                        : 'text-sm font-700 text-positive'}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        </div>
                      </div>
                    )}
                </div>

                {loadingDetails ? (
                  <div className="card p-6 animate-pulse h-32 bg-muted" />
                ) : activeSpaceRole ? (
                  <>
                    {/* Members */}
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-700 text-foreground flex items-center gap-2">
                            <Users size={16} className="text-accent" />
                            {t('spaces.membersTitle', { ns: 'portal', count: members.length })}
                          </h3>
                        </div>
                        {members.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">{t('spaces.membersEmpty', { ns: 'portal' })}</p>
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
                                <div key={member.id} className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full gradient-teal flex items-center justify-center text-white text-sm font-700 flex-shrink-0">
                                    {(member.user_profile?.full_name || 'U').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-600 text-foreground truncate">
                                      {member.user_profile?.full_name || t('spaces.unknownUser', { ns: 'portal' })}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {member.user_profile?.email || ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {canEditMemberRole ? (
                                      <select
                                        value={member.role}
                                        onChange={(e) => handleRoleChange(member.id, e.target.value as SpaceRole)}
                                        className="text-xs px-2 py-1 rounded-lg border border-border bg-card focus:outline-none focus:ring-1 focus:ring-accent/30"
                                      >
                                        {SPACE_MEMBER_ASSIGNABLE_ROLES.map((r) => (
                                          <option key={r} value={r}>
                                            {getRoleLabel(r, (key, options) => t(key, { ns: 'portal', ...options }))}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-500 flex items-center gap-1 ${ROLE_COLORS[member.role]}`}>
                                        <RoleIcon size={11} /> {getRoleLabel(member.role, (key, options) => t(key, { ns: 'portal', ...options }))}
                                      </span>
                                    )}
                                    {canRemoveMemberEntry && (
                                      <button
                                        onClick={() => handleRemoveMember(member.id, member.user_profile?.full_name || 'member')}
                                        className="p-1 rounded text-muted-foreground hover:text-negative transition-colors"
                                        title={t('spaces.removeMemberAction', { ns: 'portal' })}
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                    </div>

                    {/* Invitations */}
                    {canManageInvitations ? (
                      <div className="card p-5">
                          <div className="flex items-center justify-between mb-4">
                            <h3 className="text-sm font-700 text-foreground flex items-center gap-2">
                              <Mail size={16} className="text-accent" />
                              {t('spaces.invitationsTitle', { ns: 'portal', count: pendingInvitations.length })}
                            </h3>
                          </div>
                          {pendingInvitations.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">{t('spaces.invitationsEmpty', { ns: 'portal' })}</p>
                          ) : (
                            <div className="space-y-3">
                              {pendingInvitations.map((inv) => (
                                <div key={inv.id} className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                    <Mail size={15} className="text-muted-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-600 text-foreground truncate">{inv.email}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-500 ${STATUS_COLORS[inv.status] || 'bg-muted text-muted-foreground'}`}>
                                        {getInvitationStatusLabel(inv.status, (key, options) => t(key, { ns: 'portal', ...options }))}
                                      </span>
                                      <span className="text-xs text-muted-foreground capitalize">
                                        {getRoleLabel(inv.role, (key, options) => t(key, { ns: 'portal', ...options }))}
                                      </span>
                                      {inv.expires_at && (
                                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                                          <Clock size={10} />
                                          {new Date(inv.expires_at) < new Date()
                                            ? t('spaces.expired', { ns: 'portal' })
                                            : t('spaces.expiresOn', {
                                                ns: 'portal',
                                                date: new Date(inv.expires_at).toLocaleDateString(language),
                                              })}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleRevoke(inv.id)}
                                    className="text-xs text-negative font-600 hover:underline flex items-center gap-1"
                                  >
                                    <XCircle size={13} /> {t('spaces.revokeAction', { ns: 'portal' })}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    ) : null}
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
                {editingSpace ? t('spaces.editTitle', { ns: 'portal' }) : t('spaces.createTitle', { ns: 'portal' })}
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
              <h3 className="text-lg font-700 text-foreground">{t('spaces.inviteTitle', { ns: 'portal' })}</h3>
              <button onClick={() => setShowInviteModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('spaces.form.email', { ns: 'portal' })}</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('spaces.form.emailPlaceholder', { ns: 'portal' })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('spaces.form.role', { ns: 'portal' })}</label>
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
                {inviteRole === 'manager' && t('spaces.roleDescriptions.manager', { ns: 'portal' })}
                {inviteRole === 'contributor' && t('spaces.roleDescriptions.contributor', { ns: 'portal' })}
                {inviteRole === 'viewer' && t('spaces.roleDescriptions.viewer', { ns: 'portal' })}
                {inviteRole === 'dependent' && t('spaces.roleDescriptions.dependent', { ns: 'portal' })}
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
        title={t('spaces.finance.addAccount', {
          ns: 'portal',
          defaultValue: 'Add Space Account',
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
        title={t('spaces.finance.addRecurring', {
          ns: 'portal',
          defaultValue: 'Add Space Recurring',
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
