'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { CalendarClock, CreditCard, Edit2, Filter, Loader2, MoreVertical, Pause, Play, Trash2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import SearchField from '@/components/ui/SearchField';
import Modal from '@/components/ui/Modal';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import { getAccounts, getCategories, type Category, type FinancialAccount } from '@/lib/finance';
import {
  deletePersonalSubscription,
  getPersonalSubscriptions,
  getPersonalSubscriptionsSummary,
  markPersonalSubscriptionCancelled,
  markPersonalSubscriptionPaid,
  requestPersonalSubscriptionCancellation,
  updatePersonalSubscription,
} from '@/lib/personal-subscriptions';
import {
  canMarkPersonalSubscriptionCancelled,
  canPauseOrResumePersonalSubscription,
  canRequestPersonalSubscriptionCancellation,
  getMonthlyCostEstimate,
  getPersonalSubscriptionWarnings,
  getUpcomingPersonalSubscriptionCharges,
  PERSONAL_SUBSCRIPTION_LIST_FILTERS,
  type PersonalSubscription,
} from '@/lib/personal-subscriptions-shared';
import PersonalSubscriptionWarningBadge from './components/PersonalSubscriptionWarningBadge';
import PersonalSubscriptionDetailsContent from './components/PersonalSubscriptionDetailsContent';

const CancellationRequestModal = dynamic(() => import('./components/CancellationRequestModal'), {
  ssr: false,
  loading: () => null,
});

type SummaryState = Awaited<ReturnType<typeof getPersonalSubscriptionsSummary>>;

function normalizeTodayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateValue(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getStatusTone(status: PersonalSubscription['status']): 'info' | 'warning' | 'pending' | 'ready' | 'error' {
  switch (status) {
    case 'trial':
      return 'info';
    case 'paused':
      return 'warning';
    case 'cancellation_requested':
    case 'cancelling':
      return 'pending';
    case 'cancelled':
    case 'expired':
      return 'error';
    case 'active':
    default:
      return 'ready';
  }
}

function buildCurrencyTotals(
  subscriptions: PersonalSubscription[],
  getAmount: (subscription: PersonalSubscription) => number
) {
  return Array.from(
    subscriptions.reduce((map, subscription) => {
      map.set(
        subscription.currency_code,
        (map.get(subscription.currency_code) || 0) + getAmount(subscription)
      );
      return map;
    }, new Map<string, number>())
  )
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function renderCurrencyRows(rows: Array<{ currency: string; amount: number }>, className: string) {
  if (rows.length === 0) {
    return <span className={className}>0</span>;
  }

  return (
    <div className="flex flex-col gap-1">
      {rows.map((row) => (
        <FormattedCurrencyAmount
          key={row.currency}
          amount={row.amount}
          currencyCode={row.currency}
          className={className}
          showCode
        />
      ))}
    </div>
  );
}

export default function PersonalSubscriptionsPage() {
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const router = useRouter();
  const todayIso = normalizeTodayIso();
  const [subscriptions, setSubscriptions] = useState<PersonalSubscription[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<SummaryState | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<(typeof PERSONAL_SUBSCRIPTION_LIST_FILTERS)[number]>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState('');
  const [cancellationTarget, setCancellationTarget] = useState<PersonalSubscription | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewingSubscriptionId, setViewingSubscriptionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 1023px)').matches) {
      setShowFilters(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextSubscriptions, nextAccounts, nextCategories] = await Promise.all([
        getPersonalSubscriptions(),
        getAccounts(),
        getCategories('expense'),
      ]);

      setSubscriptions(nextSubscriptions);
      setAccounts(nextAccounts.filter((account) => account.is_active));
      setCategories(nextCategories);
      setSummary(await getPersonalSubscriptionsSummary(nextSubscriptions, todayIso));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.loadFailed', { ns: 'portal' }));
    } finally {
      setLoading(false);
    }
  }, [t, todayIso]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(
    ['personal_subscriptions', 'financial_accounts', 'categories', 'transactions', 'recurring_transactions', 'notifications'],
    'PersonalSubscriptionsPage',
    async () => {
      await load();
    }
  );

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((subscription) => {
      const matchesSearch =
        !search
        || subscription.name.toLowerCase().includes(search.toLowerCase())
        || (subscription.provider || '').toLowerCase().includes(search.toLowerCase())
        || (subscription.description || '').toLowerCase().includes(search.toLowerCase());

      const matchesStatus = (() => {
        if (statusFilter === 'all') return true;
        if (statusFilter === 'cancelling') {
          return subscription.status === 'cancellation_requested' || subscription.status === 'cancelling';
        }
        if (statusFilter === 'upcoming_7_days') {
          return getPersonalSubscriptionWarnings(subscription, todayIso).some((warning) => warning.type === 'upcoming_payment');
        }
        if (statusFilter === 'trial_ending') {
          return getPersonalSubscriptionWarnings(subscription, todayIso).some((warning) => warning.type === 'trial_ending');
        }
        if (statusFilter === 'cancellation_deadline') {
          return getPersonalSubscriptionWarnings(subscription, todayIso).some((warning) => warning.type === 'cancellation_deadline');
        }
        return subscription.status === statusFilter;
      })();

      const matchesCategory = !categoryFilter || subscription.category_id === categoryFilter;
      const matchesAccount = !accountFilter || subscription.financial_account_id === accountFilter;
      const matchesFrequency = !frequencyFilter || subscription.billing_frequency === frequencyFilter;

      return matchesSearch && matchesStatus && matchesCategory && matchesAccount && matchesFrequency;
    });
  }, [accountFilter, categoryFilter, frequencyFilter, search, statusFilter, subscriptions, todayIso]);

  const activeSpendSubscriptions = useMemo(
    () =>
      subscriptions.filter((subscription) =>
        ['trial', 'active', 'cancellation_requested', 'cancelling'].includes(subscription.status)
      ),
    [subscriptions]
  );
  const monthlyRows = useMemo(
    () => buildCurrencyTotals(activeSpendSubscriptions, (subscription) => getMonthlyCostEstimate(subscription)),
    [activeSpendSubscriptions]
  );
  const annualRows = useMemo(
    () => buildCurrencyTotals(activeSpendSubscriptions, (subscription) => getMonthlyCostEstimate(subscription) * 12),
    [activeSpendSubscriptions]
  );
  const upcomingCharges = useMemo(
    () => getUpcomingPersonalSubscriptionCharges(subscriptions, todayIso).slice(0, 5),
    [subscriptions, todayIso]
  );
  const nearestUpcomingCharge = upcomingCharges[0] || null;
  const viewingSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.id === viewingSubscriptionId) || null,
    [subscriptions, viewingSubscriptionId]
  );
  const notAvailableLabel = t('notAvailable', { ns: 'common' });

  const handlePauseToggle = async (subscription: PersonalSubscription) => {
    setProcessingId(subscription.id);
    setOpenMenuId(null);
    try {
      await updatePersonalSubscription(subscription.id, {
        status: subscription.status === 'paused' ? 'active' : 'paused',
      });
      notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
      toast.success(
        subscription.status === 'paused'
          ? t('personalSubscriptions.actions.resumedSuccess', { ns: 'portal', name: subscription.name })
          : t('personalSubscriptions.actions.pausedSuccess', { ns: 'portal', name: subscription.name })
      );
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.actions.updateFailed', { ns: 'portal' }));
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkPaid = async (subscription: PersonalSubscription) => {
    setProcessingId(subscription.id);
    setOpenMenuId(null);
    try {
      await markPersonalSubscriptionPaid(subscription.id);
      notifyChange(['personal_subscriptions', 'dashboard', 'transactions', 'financial_accounts', 'recurring_transactions', 'notifications']);
      toast.success(t('personalSubscriptions.actions.markedPaidSuccess', { ns: 'portal', name: subscription.name }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.actions.markPaidFailed', { ns: 'portal' }));
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (subscription: PersonalSubscription) => {
    if (!window.confirm(t('personalSubscriptions.actions.confirmDelete', { ns: 'portal', name: subscription.name }))) {
      return;
    }

    setProcessingId(subscription.id);
    setOpenMenuId(null);
    try {
      await deletePersonalSubscription(subscription.id);
      notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
      toast.success(t('personalSubscriptions.actions.deletedSuccess', { ns: 'portal', name: subscription.name }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.actions.deleteFailed', { ns: 'portal' }));
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkCancelled = async (subscription: PersonalSubscription) => {
    if (!window.confirm(t('personalSubscriptions.actions.confirmMarkCancelled', { ns: 'portal', name: subscription.name }))) {
      return;
    }

    setProcessingId(subscription.id);
    setOpenMenuId(null);
    try {
      await markPersonalSubscriptionCancelled(subscription.id);
      notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
      toast.success(t('personalSubscriptions.actions.cancelledSuccess', { ns: 'portal', name: subscription.name }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.actions.cancelFailed', { ns: 'portal' }));
    } finally {
      setProcessingId(null);
    }
  };

  const activeCategoryOptions = useMemo(
    () => categories.filter((category) => category.category_type === 'expense'),
    [categories]
  );

  const notifyChange = useCallback((entities: Array<
    'personal_subscriptions' | 'dashboard' | 'transactions' | 'financial_accounts' | 'recurring_transactions' | 'notifications'
  >) => {
    dispatchSmartPocketDataChanged({
      source: 'personal-subscriptions-list',
      entities,
    });
  }, []);

  return (
    <AppLayout activeRoute="/personal-subscriptions" hideMobileFooter>
      <div className="page-section max-[480px]:gap-2.5">
        <PageHeader
          title={t('personalSubscriptions.title', { ns: 'portal' })}
          description={t('personalSubscriptions.description', { ns: 'portal' })}
          badge={<StatusBadge status="info" label={t('personalSubscriptions.badge', { ns: 'portal' })} />}
          compact
          className="rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-3.5 py-3 shadow-card-sm max-[480px]:px-3.5 max-[480px]:py-3"
          actionsClassName="w-full"
          actions={
            <div className={`grid w-full grid-cols-1 gap-2 md:flex md:flex-row md:flex-wrap md:items-center ${isRTL ? 'md:flex-row-reverse' : ''}`}>
              <div className="min-w-0 w-full flex-1 md:min-w-[20rem] lg:min-w-[28rem]">
                <SearchField
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('personalSubscriptions.searchPlaceholder', { ns: 'portal' })}
                  inputClassName="h-11 w-full rounded-[18px] px-3.5"
                />
              </div>
              <div className={`grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex ${isRTL ? 'flex-row-reverse' : ''}`}>
                <button
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[18px] border border-[#b8cae6] bg-card px-3 py-2.5 text-[14px] font-700 text-[#24467d] shadow-card-sm transition-colors hover:border-[#8fb1de] hover:bg-[#f7fbff] sm:flex-none"
                >
                  <Filter size={15} />
                  {t('personalSubscriptions.actions.filter', { ns: 'portal' })}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/personal-subscriptions/new')}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[18px] bg-[linear-gradient(135deg,#06a6d8_0%,#1294ff_100%)] px-3 py-2.5 text-[14px] font-700 text-white shadow-[0_12px_24px_rgba(18,148,255,0.18)] transition-transform duration-150 hover:-translate-y-[1px] hover:brightness-105 sm:flex-none"
                >
                  <CreditCard size={15} />
                  {t('personalSubscriptions.actions.addSubscription', { ns: 'portal' })}
                </button>
              </div>
            </div>
          }
        />

        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <SectionCard
            title={t('personalSubscriptions.summary.monthlyCost', { ns: 'portal' })}
            description={t('personalSubscriptions.summary.monthlyCostDescription', { ns: 'portal' })}
            className="col-span-2 h-full overflow-hidden border border-[#cfe4f1] bg-[linear-gradient(180deg,#f9fdff_0%,#ffffff_100%)] shadow-[0_8px_22px_rgba(15,23,42,0.05)] [&_.section-card-header]:gap-2 [&_.section-card-header]:border-b [&_.section-card-header]:border-[#d7e8f3] [&_.section-card-header]:bg-[#f3fbff] [&_.section-card-header]:px-3.5 [&_.section-card-header]:py-3 [&_.section-title]:text-[13px] [&_.section-title]:font-800 [&_.section-title]:tracking-[-0.01em] [&_.section-title]:text-foreground [&_.section-description]:mt-0.5 [&_.section-description]:text-[10px] [&_.section-description]:leading-4 [&_.section-description]:text-muted-foreground/70 max-[360px]:[&_.section-card-header]:gap-1.5 max-[360px]:[&_.section-card-header]:px-3 max-[360px]:[&_.section-card-header]:py-2.5 max-[360px]:[&_.section-title]:text-[12px] max-[360px]:[&_.section-title]:leading-4 max-[360px]:[&_.section-description]:text-[9px] max-[360px]:[&_.section-description]:leading-3.5 xl:col-span-1"
            bodyClassName="space-y-1.5 px-3.5 py-3"
          >
            <div className="space-y-1.5">
              {renderCurrencyRows(monthlyRows, 'text-[17px] font-800 text-foreground')}
              {summary ? <p className="text-[10.5px] text-muted-foreground/80">{t('personalSubscriptions.summary.activeCount', { ns: 'portal', count: summary.activeCount })}</p> : null}
            </div>
          </SectionCard>
          <SectionCard
            title={t('personalSubscriptions.summary.annualCost', { ns: 'portal' })}
            description={t('personalSubscriptions.summary.annualCostDescription', { ns: 'portal' })}
            className="h-full overflow-hidden border border-[#d8e4f2] bg-[linear-gradient(180deg,#fbfcff_0%,#ffffff_100%)] shadow-[0_8px_22px_rgba(15,23,42,0.045)] [&_.section-card-header]:gap-2 [&_.section-card-header]:border-b [&_.section-card-header]:border-[#e2e9f3] [&_.section-card-header]:bg-[#f8fbff] [&_.section-card-header]:px-3 [&_.section-card-header]:py-2.75 [&_.section-title]:text-[12.5px] [&_.section-title]:font-800 [&_.section-title]:tracking-[-0.01em] [&_.section-title]:text-foreground [&_.section-description]:mt-0.5 [&_.section-description]:text-[10px] [&_.section-description]:leading-4 [&_.section-description]:text-muted-foreground/68 max-[360px]:[&_.section-card-header]:gap-1.5 max-[360px]:[&_.section-card-header]:px-2.5 max-[360px]:[&_.section-card-header]:py-2.5 max-[360px]:[&_.section-title]:text-[11px] max-[360px]:[&_.section-title]:leading-4 max-[360px]:[&_.section-description]:text-[8.75px] max-[360px]:[&_.section-description]:leading-3.5"
            bodyClassName="space-y-1.5 px-3 py-2.75"
          >
            <div className="space-y-1.5">
              {renderCurrencyRows(annualRows, 'text-[16px] font-800 text-foreground')}
              <p className="text-[10px] text-muted-foreground/78">{t('personalSubscriptions.summary.annualProjectionHint', { ns: 'portal' })}</p>
            </div>
          </SectionCard>
          <SectionCard
            title={t('personalSubscriptions.summary.health', { ns: 'portal' })}
            description={t('personalSubscriptions.summary.healthDescription', { ns: 'portal' })}
            className="h-full overflow-hidden border border-[#d5e7df] bg-[linear-gradient(180deg,#f7fdf9_0%,#ffffff_100%)] shadow-[0_8px_22px_rgba(15,23,42,0.045)] [&_.section-card-header]:gap-2 [&_.section-card-header]:border-b [&_.section-card-header]:border-[#e0eee6] [&_.section-card-header]:bg-[#f3fbf7] [&_.section-card-header]:px-3 [&_.section-card-header]:py-2.75 [&_.section-title]:text-[12.5px] [&_.section-title]:font-800 [&_.section-title]:tracking-[-0.01em] [&_.section-title]:text-foreground [&_.section-description]:mt-0.5 [&_.section-description]:text-[10px] [&_.section-description]:leading-4 [&_.section-description]:text-muted-foreground/68 max-[360px]:[&_.section-card-header]:gap-1.5 max-[360px]:[&_.section-card-header]:px-2.5 max-[360px]:[&_.section-card-header]:py-2.5 max-[360px]:[&_.section-title]:text-[11px] max-[360px]:[&_.section-title]:leading-4 max-[360px]:[&_.section-description]:text-[8.75px] max-[360px]:[&_.section-description]:leading-3.5"
            bodyClassName="px-2.5 py-2.75"
          >
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-[16px] border border-[#e6edf3] bg-white/90 px-2 py-1.5 text-center">
                <p className="text-[13px] font-800 leading-4 text-foreground">{summary?.activeCount || 0}</p>
                <p className="mt-0.5 text-[9.5px] leading-3.5 text-muted-foreground">{t('personalSubscriptions.summary.active', { ns: 'portal' })}</p>
              </div>
              <div className="rounded-[16px] border border-[#e6edf3] bg-white/90 px-2 py-1.5 text-center">
                <p className="text-[13px] font-800 leading-4 text-warning">{summary?.trialCount || 0}</p>
                <p className="mt-0.5 text-[9.5px] leading-3.5 text-muted-foreground">{t('personalSubscriptions.summary.trials', { ns: 'portal' })}</p>
              </div>
              <div className="rounded-[16px] border border-[#e6edf3] bg-white/90 px-2 py-1.5 text-center">
                <p className="text-[13px] font-800 leading-4 text-negative">{summary?.cancellationDeadlineCount || 0}</p>
                <p className="mt-0.5 text-[9.5px] leading-3.5 text-muted-foreground">{t('personalSubscriptions.summary.deadlines', { ns: 'portal' })}</p>
              </div>
            </div>
          </SectionCard>
          <SectionCard
            title={t('personalSubscriptions.upcomingChargesTitle', { ns: 'portal' })}
            description={t('personalSubscriptions.upcomingChargesDescription', { ns: 'portal' })}
            className="col-span-2 h-full overflow-hidden border border-[#d7e3f5] bg-[linear-gradient(180deg,#fafcff_0%,#ffffff_100%)] shadow-[0_8px_22px_rgba(15,23,42,0.045)] [&_.section-card-header]:gap-2 [&_.section-card-header]:border-b [&_.section-card-header]:border-[#e3ebf7] [&_.section-card-header]:bg-[#f7faff] [&_.section-card-header]:px-3.5 [&_.section-card-header]:py-3 [&_.section-title]:text-[13px] [&_.section-title]:font-800 [&_.section-title]:tracking-[-0.01em] [&_.section-title]:text-foreground [&_.section-description]:mt-0.5 [&_.section-description]:text-[10px] [&_.section-description]:leading-4 [&_.section-description]:text-muted-foreground/70 max-[360px]:[&_.section-card-header]:gap-1.5 max-[360px]:[&_.section-card-header]:px-3 max-[360px]:[&_.section-card-header]:py-2.5 max-[360px]:[&_.section-title]:text-[12px] max-[360px]:[&_.section-title]:leading-4 max-[360px]:[&_.section-description]:text-[9px] max-[360px]:[&_.section-description]:leading-3.5 xl:col-span-1"
            bodyClassName="px-3.5 py-3"
          >
            {nearestUpcomingCharge ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[14px] font-800 text-foreground">{nearestUpcomingCharge.name}</p>
                  <StatusBadge status="pending" label={t('personalSubscriptions.summary.upcomingCharges', { ns: 'portal', count: summary?.upcomingChargesCount || 0 })} />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {(nearestUpcomingCharge.provider || t('personalSubscriptions.labels.customProvider', { ns: 'portal' }))} · {formatDateValue(nearestUpcomingCharge.next_billing_date) || notAvailableLabel}
                </p>
                <FormattedCurrencyAmount
                  amount={nearestUpcomingCharge.amount}
                  currencyCode={nearestUpcomingCharge.currency_code}
                  className="text-[15px] font-800 text-foreground"
                  showCode
                />
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">{t('personalSubscriptions.upcomingChargesEmpty', { ns: 'portal' })}</p>
            )}
          </SectionCard>
        </div>

        <SectionCard
          className={showFilters ? '' : 'hidden'}
          bodyClassName="space-y-2.5 p-3"
          title={t('personalSubscriptions.filters.title', { ns: 'portal' })}
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="subscription-filter-status" className="mb-1 block text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                {t('personalSubscriptions.filters.quickFilter', { ns: 'portal' })}
              </label>
              <select id="subscription-filter-status" className="input-base h-11 text-[14px]" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
                {PERSONAL_SUBSCRIPTION_LIST_FILTERS.map((filterValue) => (
                  <option key={filterValue} value={filterValue}>
                    {t(`personalSubscriptions.filters.options.${filterValue}`, { ns: 'portal' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="subscription-filter-category" className="mb-1 block text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                {t('personalSubscriptions.form.fields.category', { ns: 'portal' })}
              </label>
              <select id="subscription-filter-category" className="input-base h-11 text-[14px]" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">{t('personalSubscriptions.filters.allCategories', { ns: 'portal' })}</option>
                {activeCategoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="subscription-filter-account" className="mb-1 block text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                {t('personalSubscriptions.form.fields.financialAccount', { ns: 'portal' })}
              </label>
              <select id="subscription-filter-account" className="input-base h-11 text-[14px]" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
                <option value="">{t('personalSubscriptions.filters.allAccounts', { ns: 'portal' })}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="subscription-filter-frequency" className="mb-1 block text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                {t('personalSubscriptions.form.fields.billingFrequency', { ns: 'portal' })}
              </label>
              <select id="subscription-filter-frequency" className="input-base h-11 text-[14px]" value={frequencyFilter} onChange={(event) => setFrequencyFilter(event.target.value)}>
                <option value="">{t('personalSubscriptions.filters.allFrequencies', { ns: 'portal' })}</option>
                <option value="weekly">{t('personalSubscriptions.frequencies.weekly', { ns: 'portal' })}</option>
                <option value="monthly">{t('personalSubscriptions.frequencies.monthly', { ns: 'portal' })}</option>
                <option value="quarterly">{t('personalSubscriptions.frequencies.quarterly', { ns: 'portal' })}</option>
                <option value="semi_annual">{t('personalSubscriptions.frequencies.semi_annual', { ns: 'portal' })}</option>
                <option value="yearly">{t('personalSubscriptions.frequencies.yearly', { ns: 'portal' })}</option>
                <option value="custom">{t('personalSubscriptions.frequencies.custom', { ns: 'portal' })}</option>
              </select>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t('personalSubscriptions.listTitle', { ns: 'portal' })}
          description={t('personalSubscriptions.listDescription', { ns: 'portal' })}
          bodyClassName="p-0"
        >
          {loading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`subscription-skeleton-${index}`} className="animate-pulse px-5 py-4">
                  <div className="mb-2 h-4 w-40 rounded bg-muted" />
                  <div className="h-3 w-64 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : subscriptions.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={t('personalSubscriptions.empty.title', { ns: 'portal' })}
              description={t('personalSubscriptions.empty.description', { ns: 'portal' })}
              action={{
                label: t('personalSubscriptions.empty.action', { ns: 'portal' }),
                onClick: () => router.push('/personal-subscriptions/new'),
              }}
            />
          ) : filteredSubscriptions.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              {t('personalSubscriptions.empty.filtered', { ns: 'portal' })}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filteredSubscriptions.map((subscription) => (
                <article key={subscription.id} className="space-y-2.5 px-3.5 py-3">
                  <div className={`flex items-start justify-between gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setViewingSubscriptionId(subscription.id);
                            setOpenMenuId(null);
                          }}
                          className="truncate text-[15px] font-800 text-foreground hover:text-accent"
                        >
                          {subscription.name}
                        </button>
                        <StatusBadge status={getStatusTone(subscription.status)} label={t(`personalSubscriptions.statuses.${subscription.status}`, { ns: 'portal' })} />
                        <PersonalSubscriptionWarningBadge subscription={subscription} todayIso={todayIso} />
                      </div>
                      <p className="text-[13px] text-muted-foreground">
                        {(subscription.provider || t('personalSubscriptions.labels.customProvider', { ns: 'portal' }))} · {subscription.category?.name || t('transactions.noCategory', { ns: 'portal' })}
                      </p>
                      <p className="text-[12px] text-muted-foreground">
                        {t('personalSubscriptions.labels.nextCharge', { ns: 'portal' })}: {formatDateValue(subscription.next_billing_date) || notAvailableLabel}
                      </p>
                    </div>
                    <div className={`shrink-0 ${isRTL ? 'text-start' : 'text-end'}`}>
                      <FormattedCurrencyAmount
                        amount={subscription.amount}
                        currencyCode={subscription.currency_code}
                        className="text-[15px] font-800 text-foreground"
                        showCode
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex rounded-full border border-border/80 bg-[#f3f6fb] px-2.5 py-1 text-[10.5px] font-700 text-muted-foreground">
                      {t(`personalSubscriptions.frequencies.${subscription.billing_frequency}`, { ns: 'portal' })}
                    </span>
                    <span className="inline-flex rounded-full border border-border/80 bg-[#f3f6fb] px-2.5 py-1 text-[10.5px] font-700 text-muted-foreground">
                      {subscription.account?.name || t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
                    </span>
                    <span className="inline-flex rounded-full border border-border/80 bg-[#f3f6fb] px-2.5 py-1 text-[10.5px] font-700 text-muted-foreground">
                      {formatDateValue(subscription.next_billing_date) || notAvailableLabel}
                    </span>
                  </div>

                  <div className={`flex flex-wrap items-center gap-1.5 ${isRTL ? 'justify-start' : 'justify-end'}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setViewingSubscriptionId(subscription.id);
                        setOpenMenuId(null);
                      }}
                      className="inline-flex min-h-9 items-center justify-center rounded-xl border border-[#d8e3f2] bg-[#edf4ff] px-3 text-[13px] font-700 text-[#24467d]"
                    >
                      {t('actions.view', { ns: 'common' })}
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenMenuId(openMenuId === subscription.id ? null : subscription.id)}
                        className="inline-flex min-h-9 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-[13px] font-700 text-foreground"
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === subscription.id}
                      >
                        <MoreVertical size={12} />
                        {t('actions.more', { ns: 'common' })}
                      </button>
                      {openMenuId === subscription.id ? (
                        <div
                          role="menu"
                          className={`absolute top-full z-20 mt-1.5 flex w-[min(13rem,calc(100vw-2.25rem))] flex-col overflow-hidden rounded-[18px] border border-border bg-card p-1.5 shadow-card-lg sm:min-w-[12.5rem] sm:w-auto ${isRTL ? 'left-0' : 'right-0'}`}
                        >
                          <div className="mb-1 rounded-xl border border-border/70 bg-muted/15 px-2.5 py-1.5 text-[10.5px] leading-4 text-muted-foreground">
                            <p>{t('personalSubscriptions.labels.autoRenew', { ns: 'portal' })}: {subscription.auto_renew ? t('personalSubscriptions.labels.enabled', { ns: 'portal' }) : t('personalSubscriptions.labels.disabled', { ns: 'portal' })}</p>
                            <p>{t('personalSubscriptions.labels.reminders', { ns: 'portal' })}: {subscription.reminder_days_before.length > 0 ? subscription.reminder_days_before.join(', ') : t('personalSubscriptions.labels.off', { ns: 'portal' })}</p>
                            <p>{t('personalSubscriptions.labels.linkedRecurring', { ns: 'portal' })}: {subscription.recurring_transaction_id ? t('personalSubscriptions.labels.linked', { ns: 'portal' }) : t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}</p>
                          </div>
                          <Link
                            href={`/personal-subscriptions/${subscription.id}/edit`}
                            role="menuitem"
                            onClick={() => setOpenMenuId(null)}
                            className="inline-flex min-h-8 items-center gap-2 rounded-xl px-2.5 py-2 text-start text-[13px] font-600 text-foreground transition-colors hover:bg-muted/70"
                          >
                            <Edit2 size={14} className="text-muted-foreground" />
                            {t('actions.edit', { ns: 'common' })}
                          </Link>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void handleMarkPaid(subscription)}
                            disabled={processingId === subscription.id || !subscription.financial_account_id}
                            className="inline-flex min-h-8 items-center gap-2 rounded-xl px-2.5 py-2 text-start text-[13px] font-600 text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
                          >
                            {processingId === subscription.id ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : <CreditCard size={14} className="text-muted-foreground" />}
                            {t('personalSubscriptions.actions.markPaid', { ns: 'portal' })}
                          </button>
                          {canPauseOrResumePersonalSubscription(subscription.status) ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handlePauseToggle(subscription)}
                              className="inline-flex min-h-8 items-center gap-2 rounded-xl px-2.5 py-2 text-start text-[13px] font-600 text-foreground transition-colors hover:bg-muted/70"
                            >
                              {subscription.status === 'paused' ? <Play size={14} className="text-muted-foreground" /> : <Pause size={14} className="text-muted-foreground" />}
                              {subscription.status === 'paused'
                                ? t('personalSubscriptions.actions.resume', { ns: 'portal' })
                                : t('personalSubscriptions.actions.pause', { ns: 'portal' })}
                            </button>
                          ) : null}
                          {canRequestPersonalSubscriptionCancellation(subscription.status) ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setCancellationTarget(subscription);
                                setOpenMenuId(null);
                              }}
                              className="inline-flex min-h-8 items-center gap-2 rounded-xl px-2.5 py-2 text-start text-[13px] font-600 text-foreground transition-colors hover:bg-muted/70"
                            >
                              <CalendarClock size={14} className="text-muted-foreground" />
                              {t('personalSubscriptions.actions.requestCancellation', { ns: 'portal' })}
                            </button>
                          ) : null}
                          {canMarkPersonalSubscriptionCancelled(subscription.status) ? (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() => void handleMarkCancelled(subscription)}
                              className="inline-flex min-h-8 items-center gap-2 rounded-xl px-2.5 py-2 text-start text-[13px] font-600 text-foreground transition-colors hover:bg-muted/70"
                            >
                              <XCircle size={14} className="text-muted-foreground" />
                              {t('personalSubscriptions.actions.markCancelled', { ns: 'portal' })}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void handleDelete(subscription)}
                            className="inline-flex min-h-8 items-center gap-2 rounded-xl px-2.5 py-2 text-start text-[13px] font-600 text-negative transition-colors hover:bg-negative-soft"
                          >
                            <Trash2 size={14} />
                            {t('actions.delete', { ns: 'common' })}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {cancellationTarget ? (
        <CancellationRequestModal
          isOpen={Boolean(cancellationTarget)}
          onClose={() => setCancellationTarget(null)}
          title={t('personalSubscriptions.cancellation.modalTitle', {
            ns: 'portal',
            name: cancellationTarget.name || '',
          })}
          defaultValues={{
            effective_cancellation_date: cancellationTarget.cancel_effective_date || cancellationTarget.next_billing_date || '',
            confirmation_reference: cancellationTarget.cancel_confirmation_reference || '',
          }}
          onSubmit={async (values) => {
            setProcessingId(cancellationTarget.id);
            try {
              await requestPersonalSubscriptionCancellation(cancellationTarget.id, values);
              notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
              toast.success(t('personalSubscriptions.cancellation.requestedSuccess', { ns: 'portal', name: cancellationTarget.name }));
              await load();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : t('personalSubscriptions.cancellation.requestFailed', { ns: 'portal' }));
              throw error;
            } finally {
              setProcessingId(null);
            }
          }}
        />
      ) : null}

      <Modal
        isOpen={Boolean(viewingSubscription)}
        onClose={() => setViewingSubscriptionId(null)}
        title={viewingSubscription?.name || t('actions.view', { ns: 'common' })}
        description={viewingSubscription
          ? `${viewingSubscription.provider || t('personalSubscriptions.labels.customProvider', { ns: 'portal' })} · ${viewingSubscription.category?.name || t('transactions.noCategory', { ns: 'portal' })}`
          : undefined}
        size="lg"
        mobileLayout="sheet"
        bodyClassName="space-y-0 p-3 max-[480px]:p-3"
      >
        {viewingSubscription ? (
          <PersonalSubscriptionDetailsContent
            subscription={viewingSubscription}
            todayIso={todayIso}
            actions={(
              <>
                <button
                  type="button"
                  onClick={() => {
                    setViewingSubscriptionId(null);
                    router.push(`/personal-subscriptions/${viewingSubscription.id}/edit`);
                  }}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl border border-border bg-card px-3 text-[13px] font-700 text-foreground"
                >
                  {t('actions.edit', { ns: 'common' })}
                </button>
                <button
                  type="button"
                  onClick={() => setViewingSubscriptionId(null)}
                  className="inline-flex min-h-9 items-center justify-center rounded-xl bg-[#eef2f7] px-3 text-[13px] font-700 text-[#30435f]"
                >
                  {t('actions.close', { ns: 'common' })}
                </button>
              </>
            )}
          />
        ) : null}
      </Modal>

      {openMenuId ? (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      ) : null}
    </AppLayout>
  );
}
