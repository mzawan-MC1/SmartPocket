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
    <AppLayout activeRoute="/personal-subscriptions">
      <div className="page-section max-[480px]:gap-3">
        <PageHeader
          title={t('personalSubscriptions.title', { ns: 'portal' })}
          description={t('personalSubscriptions.description', { ns: 'portal' })}
          badge={<StatusBadge status="info" label={t('personalSubscriptions.badge', { ns: 'portal' })} />}
          compact
          actionsClassName="w-full"
          actions={
            <div className={`flex w-full flex-col gap-2 md:flex-row md:flex-wrap md:items-center ${isRTL ? 'md:flex-row-reverse' : ''}`}>
              <div className="min-w-0 w-full flex-1 md:min-w-[20rem] lg:min-w-[28rem]">
                <SearchField
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('personalSubscriptions.searchPlaceholder', { ns: 'portal' })}
                  inputClassName="w-full"
                />
              </div>
              <div className={`flex w-full gap-2 sm:w-auto ${isRTL ? 'flex-row-reverse' : ''}`}>
                <button
                  type="button"
                  onClick={() => setShowFilters((current) => !current)}
                  className="btn-secondary flex-1 sm:flex-none"
                >
                  <Filter size={16} />
                  {t('personalSubscriptions.actions.filter', { ns: 'portal' })}
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/personal-subscriptions/new')}
                  className="btn-primary flex-1 sm:flex-none"
                >
                  <CreditCard size={16} />
                  {t('personalSubscriptions.actions.addSubscription', { ns: 'portal' })}
                </button>
              </div>
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <SectionCard
            title={t('personalSubscriptions.summary.monthlyCost', { ns: 'portal' })}
            description={t('personalSubscriptions.summary.monthlyCostDescription', { ns: 'portal' })}
            className="h-full"
          >
            <div className="space-y-2">
              {renderCurrencyRows(monthlyRows, 'text-xl font-700 text-foreground')}
              {summary ? <p className="text-xs text-muted-foreground">{t('personalSubscriptions.summary.activeCount', { ns: 'portal', count: summary.activeCount })}</p> : null}
            </div>
          </SectionCard>
          <SectionCard
            title={t('personalSubscriptions.summary.annualCost', { ns: 'portal' })}
            description={t('personalSubscriptions.summary.annualCostDescription', { ns: 'portal' })}
            className="h-full"
          >
            <div className="space-y-2">
              {renderCurrencyRows(annualRows, 'text-xl font-700 text-foreground')}
              <p className="text-xs text-muted-foreground">{t('personalSubscriptions.summary.annualProjectionHint', { ns: 'portal' })}</p>
            </div>
          </SectionCard>
          <SectionCard
            title={t('personalSubscriptions.summary.health', { ns: 'portal' })}
            description={t('personalSubscriptions.summary.healthDescription', { ns: 'portal' })}
            className="h-full"
          >
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-lg font-700 text-foreground">{summary?.activeCount || 0}</p>
                <p className="text-xs text-muted-foreground">{t('personalSubscriptions.summary.active', { ns: 'portal' })}</p>
              </div>
              <div>
                <p className="text-lg font-700 text-warning">{summary?.trialCount || 0}</p>
                <p className="text-xs text-muted-foreground">{t('personalSubscriptions.summary.trials', { ns: 'portal' })}</p>
              </div>
              <div>
                <p className="text-lg font-700 text-negative">{summary?.cancellationDeadlineCount || 0}</p>
                <p className="text-xs text-muted-foreground">{t('personalSubscriptions.summary.deadlines', { ns: 'portal' })}</p>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title={t('personalSubscriptions.upcomingChargesTitle', { ns: 'portal' })}
          description={t('personalSubscriptions.upcomingChargesDescription', { ns: 'portal' })}
          action={<StatusBadge status="pending" label={t('personalSubscriptions.summary.upcomingCharges', { ns: 'portal', count: summary?.upcomingChargesCount || 0 })} />}
          bodyClassName="p-0"
        >
          {upcomingCharges.length === 0 ? (
            <div className="px-5 py-4 text-xs text-muted-foreground">{t('personalSubscriptions.upcomingChargesEmpty', { ns: 'portal' })}</div>
          ) : (
            <div className="divide-y divide-border">
              {upcomingCharges.map((subscription) => (
                <div key={subscription.id} className={`flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/personal-subscriptions/${subscription.id}`} className="truncate text-sm font-700 text-foreground hover:text-accent">
                        {subscription.name}
                      </Link>
                      <PersonalSubscriptionWarningBadge subscription={subscription} todayIso={todayIso} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('personalSubscriptions.labels.nextCharge', { ns: 'portal' })}: {formatDateValue(subscription.next_billing_date) || notAvailableLabel}
                    </p>
                  </div>
                  <FormattedCurrencyAmount
                    amount={subscription.amount}
                    currencyCode={subscription.currency_code}
                    className={`text-sm font-700 text-foreground ${isRTL ? 'text-start' : 'text-end'}`}
                    showCode
                  />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          className={showFilters ? '' : 'hidden'}
          bodyClassName="space-y-3 p-4"
          title={t('personalSubscriptions.filters.title', { ns: 'portal' })}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label htmlFor="subscription-filter-status" className="mb-1 block text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                {t('personalSubscriptions.filters.quickFilter', { ns: 'portal' })}
              </label>
              <select id="subscription-filter-status" className="input-base" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
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
              <select id="subscription-filter-category" className="input-base" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
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
              <select id="subscription-filter-account" className="input-base" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value)}>
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
              <select id="subscription-filter-frequency" className="input-base" value={frequencyFilter} onChange={(event) => setFrequencyFilter(event.target.value)}>
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
                <article key={subscription.id} className="space-y-3 px-5 py-4">
                  <div className={`flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between ${isRTL ? 'lg:flex-row-reverse' : ''}`}>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/personal-subscriptions/${subscription.id}`} className="text-base font-700 text-foreground hover:text-accent">
                          {subscription.name}
                        </Link>
                        <StatusBadge status={getStatusTone(subscription.status)} label={t(`personalSubscriptions.statuses.${subscription.status}`, { ns: 'portal' })} />
                        <PersonalSubscriptionWarningBadge subscription={subscription} todayIso={todayIso} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {(subscription.provider || t('personalSubscriptions.labels.customProvider', { ns: 'portal' }))} · {subscription.category?.name || t('transactions.noCategory', { ns: 'portal' })}
                      </p>
                      <div className="grid grid-cols-1 gap-1.5 text-[11px] text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
                        <p>{t('personalSubscriptions.labels.frequency', { ns: 'portal' })}: {t(`personalSubscriptions.frequencies.${subscription.billing_frequency}`, { ns: 'portal' })}</p>
                        <p>{t('personalSubscriptions.labels.nextCharge', { ns: 'portal' })}: {formatDateValue(subscription.next_billing_date) || notAvailableLabel}</p>
                        <p>{t('personalSubscriptions.labels.paymentAccount', { ns: 'portal' })}: {subscription.account?.name || t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}</p>
                        <p>{t('personalSubscriptions.labels.autoRenew', { ns: 'portal' })}: {subscription.auto_renew ? t('personalSubscriptions.labels.enabled', { ns: 'portal' }) : t('personalSubscriptions.labels.disabled', { ns: 'portal' })}</p>
                        <p>{t('personalSubscriptions.labels.reminders', { ns: 'portal' })}: {subscription.reminder_days_before.length > 0 ? subscription.reminder_days_before.join(', ') : t('personalSubscriptions.labels.off', { ns: 'portal' })}</p>
                        <p>{t('personalSubscriptions.labels.linkedRecurring', { ns: 'portal' })}: {subscription.recurring_transaction_id ? t('personalSubscriptions.labels.linked', { ns: 'portal' }) : t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}</p>
                      </div>
                    </div>
                    <div className={`flex min-w-[140px] flex-col gap-2 ${isRTL ? 'items-end lg:items-start' : 'items-start lg:items-end'}`}>
                      <FormattedCurrencyAmount
                        amount={subscription.amount}
                        currencyCode={subscription.currency_code}
                        className="text-base font-700 text-foreground"
                        showCode
                      />
                      <div className={`flex flex-wrap items-center gap-2 ${isRTL ? 'lg:justify-start' : 'lg:justify-end'}`}>
                        <Link href={`/personal-subscriptions/${subscription.id}`} className="btn-secondary px-3 py-2 text-xs">
                          {t('actions.view', { ns: 'common' })}
                        </Link>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => setOpenMenuId(openMenuId === subscription.id ? null : subscription.id)}
                            className="btn-secondary px-3 py-2 text-xs"
                            aria-haspopup="menu"
                            aria-expanded={openMenuId === subscription.id}
                          >
                            <MoreVertical size={12} />
                            {t('actions.more', { ns: 'common' })}
                          </button>
                          {openMenuId === subscription.id ? (
                            <div
                              role="menu"
                              className={`absolute top-full z-20 mt-2 flex min-w-[13rem] flex-col overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-card-lg ${isRTL ? 'left-0' : 'right-0'}`}
                            >
                              <Link
                                href={`/personal-subscriptions/${subscription.id}/edit`}
                                role="menuitem"
                                onClick={() => setOpenMenuId(null)}
                                className="inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm font-600 text-foreground transition-colors hover:bg-muted/70"
                              >
                                <Edit2 size={14} className="text-muted-foreground" />
                                {t('actions.edit', { ns: 'common' })}
                              </Link>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => void handleMarkPaid(subscription)}
                                disabled={processingId === subscription.id || !subscription.financial_account_id}
                                className="inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm font-600 text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
                              >
                                {processingId === subscription.id ? <Loader2 size={14} className="animate-spin text-muted-foreground" /> : <CreditCard size={14} className="text-muted-foreground" />}
                                {t('personalSubscriptions.actions.markPaid', { ns: 'portal' })}
                              </button>
                              {canPauseOrResumePersonalSubscription(subscription.status) ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => void handlePauseToggle(subscription)}
                                  className="inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm font-600 text-foreground transition-colors hover:bg-muted/70"
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
                                  className="inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm font-600 text-foreground transition-colors hover:bg-muted/70"
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
                                  className="inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm font-600 text-foreground transition-colors hover:bg-muted/70"
                                >
                                  <XCircle size={14} className="text-muted-foreground" />
                                  {t('personalSubscriptions.actions.markCancelled', { ns: 'portal' })}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => void handleDelete(subscription)}
                                className="inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-sm font-600 text-negative transition-colors hover:bg-negative-soft"
                              >
                                <Trash2 size={14} />
                                {t('actions.delete', { ns: 'common' })}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
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

      {openMenuId ? (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      ) : null}
    </AppLayout>
  );
}
