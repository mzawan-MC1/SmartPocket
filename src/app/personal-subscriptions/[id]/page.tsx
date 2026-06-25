'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CalendarClock,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  ReceiptText,
  Trash2,
  Wallet,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import {
  getPersonalSubscriptionById,
  deletePersonalSubscription,
  markPersonalSubscriptionCancelled,
  markPersonalSubscriptionPaid,
  requestPersonalSubscriptionCancellation,
  updatePersonalSubscription,
} from '@/lib/personal-subscriptions';
import {
  canMarkPersonalSubscriptionCancelled,
  canPauseOrResumePersonalSubscription,
  canRequestPersonalSubscriptionCancellation,
  getHighestPriorityPersonalSubscriptionWarning,
  getPersonalSubscriptionWarnings,
  normalizeWebsiteUrl,
  type PersonalSubscription,
} from '@/lib/personal-subscriptions-shared';
import CancellationRequestModal from '../components/CancellationRequestModal';
import PersonalSubscriptionWarningBadge from '../components/PersonalSubscriptionWarningBadge';

function normalizeTodayIso() {
  return new Date().toISOString().slice(0, 10);
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

function getWarningTone(level: 'info' | 'warning' | 'urgent') {
  if (level === 'urgent') return 'error' as const;
  if (level === 'warning') return 'warning' as const;
  return 'info' as const;
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

function WarningListItem({
  warning,
  t,
}: {
  warning: ReturnType<typeof getPersonalSubscriptionWarnings>[number];
  t: ReturnType<typeof useTranslation>['t'];
}) {
  const { isRTL } = useLanguage();
  const label = (() => {
    switch (warning.type) {
      case 'upcoming_payment':
        return warning.daysUntil === 0
          ? t('personalSubscriptions.warnings.upcoming.today', { ns: 'portal' })
          : warning.daysUntil === 1
            ? t('personalSubscriptions.warnings.upcoming.tomorrow', { ns: 'portal' })
            : t('personalSubscriptions.warnings.upcoming.days', { ns: 'portal', count: warning.daysUntil });
      case 'trial_ending':
        return warning.daysUntil === 0
          ? t('personalSubscriptions.warnings.trial.today', { ns: 'portal' })
          : warning.daysUntil === 1
            ? t('personalSubscriptions.warnings.trial.tomorrow', { ns: 'portal' })
            : t('personalSubscriptions.warnings.trial.days', { ns: 'portal', count: warning.daysUntil });
      case 'cancellation_deadline':
        return warning.daysUntil === 0
          ? t('personalSubscriptions.warnings.cancellation.today', { ns: 'portal' })
          : t('personalSubscriptions.warnings.cancellation.days', { ns: 'portal', count: warning.daysUntil });
      case 'over_threshold':
        return t('personalSubscriptions.warnings.threshold', { ns: 'portal' });
      case 'expired':
        return t('personalSubscriptions.warnings.expired', { ns: 'portal' });
      default:
        return warning.type;
    }
  })();

  return (
    <div className={`flex items-start justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
      <div className="min-w-0 text-start">
        <p className="text-sm font-700 text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">
          {t(`personalSubscriptions.warningLevels.${warning.level}`, { ns: 'portal' })}
        </p>
      </div>
      <StatusBadge
        status={getWarningTone(warning.level)}
        label={t(`personalSubscriptions.warningLevels.${warning.level}`, { ns: 'portal' })}
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  const { isRTL } = useLanguage();

  return (
    <div className={`flex flex-col gap-1 border-b border-border/70 py-3 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4 ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
      <span className="text-[15px] font-600 text-foreground/75 text-start">{label}</span>
      <div className={`text-[15px] text-foreground text-start sm:max-w-[65%] ${isRTL ? 'sm:text-start' : 'sm:text-end'}`}>{value}</div>
    </div>
  );
}

export default function PersonalSubscriptionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const subscriptionId = params.id as string;
  const todayIso = normalizeTodayIso();
  const [subscription, setSubscription] = useState<PersonalSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showCancellationModal, setShowCancellationModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSubscription(await getPersonalSubscriptionById(subscriptionId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.loadFailed', { ns: 'portal' }));
      setSubscription(null);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(
    ['personal_subscriptions', 'transactions', 'financial_accounts', 'recurring_transactions', 'notifications'],
    'PersonalSubscriptionDetailPage',
    async () => {
      await load();
    }
  );

  const warnings = useMemo(
    () => (subscription ? getPersonalSubscriptionWarnings(subscription, todayIso) : []),
    [subscription, todayIso]
  );

  const highestWarning = useMemo(
    () => (subscription ? getHighestPriorityPersonalSubscriptionWarning(subscription, todayIso) : null),
    [subscription, todayIso]
  );

  const notifyChange = useCallback((entities: Array<
    'personal_subscriptions' | 'dashboard' | 'transactions' | 'financial_accounts' | 'recurring_transactions' | 'notifications'
  >) => {
    dispatchSmartPocketDataChanged({
      source: 'personal-subscription-detail',
      entities,
    });
  }, []);

  const handlePauseToggle = async () => {
    if (!subscription) return;
    setProcessingId(subscription.id);
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

  const handleMarkPaid = async () => {
    if (!subscription) return;
    setProcessingId(subscription.id);
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

  const handleMarkCancelled = async () => {
    if (!subscription) return;
    if (!window.confirm(t('personalSubscriptions.actions.confirmMarkCancelled', { ns: 'portal', name: subscription.name }))) {
      return;
    }

    setProcessingId(subscription.id);
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

  const handleDelete = async () => {
    if (!subscription) return;
    if (!window.confirm(t('personalSubscriptions.actions.confirmDelete', { ns: 'portal', name: subscription.name }))) {
      return;
    }

    setProcessingId(subscription.id);
    try {
      await deletePersonalSubscription(subscription.id);
      notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
      toast.success(t('personalSubscriptions.actions.deletedSuccess', { ns: 'portal', name: subscription.name }));
      router.push('/personal-subscriptions');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.actions.deleteFailed', { ns: 'portal' }));
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <AppLayout activeRoute="/personal-subscriptions">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-64 rounded bg-muted" />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="section-card"><div className="section-card-body h-40 bg-muted/30" /></div>
            <div className="section-card"><div className="section-card-body h-40 bg-muted/30" /></div>
            <div className="section-card"><div className="section-card-body h-40 bg-muted/30" /></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!subscription) {
    return (
      <AppLayout activeRoute="/personal-subscriptions">
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {t('personalSubscriptions.notFoundDescription', { ns: 'portal' })}
          </p>
          <Link href="/personal-subscriptions" className="mt-3 inline-flex text-sm font-700 text-accent hover:text-teal-600">
            {t('personalSubscriptions.actions.backToSubscriptions', { ns: 'portal' })}
          </Link>
        </div>
      </AppLayout>
    );
  }

  const normalizedWebsiteUrl = normalizeWebsiteUrl(subscription.website_url);
  const notAvailableLabel = t('notAvailable', { ns: 'common' });

  return (
    <AppLayout activeRoute="/personal-subscriptions">
      <div className="page-section max-[480px]:gap-3">
        <div className={`flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between ${isRTL ? 'lg:flex-row-reverse' : ''}`}>
          <div className="min-w-0">
            <div className={`mb-3 flex items-start gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <Link
                href="/personal-subscriptions"
                className="rounded-xl border border-border p-2 text-muted-foreground transition-colors hover:bg-muted"
                aria-label={t('personalSubscriptions.actions.backToSubscriptions', { ns: 'portal' })}
              >
                <ArrowLeft size={18} className={isRTL ? 'rotate-180' : ''} />
              </Link>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-800 tracking-[-0.02em] text-foreground">
                    {subscription.name}
                  </h1>
                  <StatusBadge
                    status={getStatusTone(subscription.status)}
                    label={t(`personalSubscriptions.statuses.${subscription.status}`, { ns: 'portal' })}
                  />
                  {highestWarning ? (
                    <PersonalSubscriptionWarningBadge
                      subscription={subscription}
                      todayIso={todayIso}
                    />
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted-foreground/90">
                  {subscription.provider || t('personalSubscriptions.labels.customProvider', { ns: 'portal' })}
                </p>
                <p className="mt-1 text-sm text-muted-foreground/90">
                  {t('personalSubscriptions.detail.subtitle', {
                    ns: 'portal',
                    amount: subscription.amount.toFixed(2),
                    currency: subscription.currency_code,
                  })}
                </p>
              </div>
            </div>
          </div>

          <div className={`flex flex-wrap gap-2 ${isRTL ? 'lg:justify-start' : 'lg:justify-end'}`}>
            <Link href={`/personal-subscriptions/${subscription.id}/edit`} className="btn-secondary">
              {t('actions.edit', { ns: 'common' })}
            </Link>
            {canPauseOrResumePersonalSubscription(subscription.status) ? (
              <button
                type="button"
                onClick={() => void handlePauseToggle()}
                disabled={processingId === subscription.id}
                className="btn-secondary"
              >
                {processingId === subscription.id ? <Loader2 size={15} className="animate-spin" /> : subscription.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                {subscription.status === 'paused'
                  ? t('personalSubscriptions.actions.resume', { ns: 'portal' })
                  : t('personalSubscriptions.actions.pause', { ns: 'portal' })}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleMarkPaid()}
              disabled={processingId === subscription.id || !subscription.financial_account_id}
              className="btn-secondary"
            >
              {processingId === subscription.id ? <Loader2 size={15} className="animate-spin" /> : <ReceiptText size={15} />}
              {t('personalSubscriptions.actions.markPaid', { ns: 'portal' })}
            </button>
            {canRequestPersonalSubscriptionCancellation(subscription.status) ? (
              <button
                type="button"
                onClick={() => setShowCancellationModal(true)}
                disabled={processingId === subscription.id}
                className="btn-secondary"
              >
                <CalendarClock size={15} />
                {t('personalSubscriptions.actions.requestCancellation', { ns: 'portal' })}
              </button>
            ) : null}
            {canMarkPersonalSubscriptionCancelled(subscription.status) ? (
              <button
                type="button"
                onClick={() => void handleMarkCancelled()}
                disabled={processingId === subscription.id}
                className="btn-secondary"
              >
                <XCircle size={15} />
                {t('personalSubscriptions.actions.markCancelled', { ns: 'portal' })}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={processingId === subscription.id}
              className="btn-secondary text-negative"
            >
              <Trash2 size={15} />
              {t('common:actions.delete')}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SectionCard
            title={t('personalSubscriptions.detail.metrics.amount', { ns: 'portal' })}
            className="h-full"
          >
            <FormattedCurrencyAmount
              amount={subscription.amount}
              currencyCode={subscription.currency_code}
              className="text-xl font-800 text-foreground"
              showCode
            />
          </SectionCard>
          <SectionCard
            title={t('personalSubscriptions.detail.metrics.nextCharge', { ns: 'portal' })}
            className="h-full"
          >
            <p className="text-xl font-800 text-foreground">
              {formatDateValue(subscription.next_billing_date) || notAvailableLabel}
            </p>
          </SectionCard>
          <SectionCard
            title={t('personalSubscriptions.detail.metrics.account', { ns: 'portal' })}
            className="h-full"
          >
            <p className="text-base font-700 text-foreground">
              {subscription.account?.name || t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
            </p>
          </SectionCard>
          <SectionCard
            title={t('personalSubscriptions.detail.metrics.reminders', { ns: 'portal' })}
            className="h-full"
          >
            <p className="text-base font-700 text-foreground">
              {subscription.reminder_days_before.length > 0
                ? subscription.reminder_days_before.join(', ')
                : t('personalSubscriptions.labels.off', { ns: 'portal' })}
            </p>
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <SectionCard
              title={t('personalSubscriptions.detail.sections.overview', { ns: 'portal' })}
              description={t('personalSubscriptions.detail.sections.overviewDescription', { ns: 'portal' })}
            >
              <DetailRow
                label={t('personalSubscriptions.form.fields.provider', { ns: 'portal' })}
                value={subscription.provider || notAvailableLabel}
              />
              <DetailRow
                label={t('personalSubscriptions.form.fields.description', { ns: 'portal' })}
                value={subscription.description || notAvailableLabel}
              />
              <DetailRow
                label={t('personalSubscriptions.form.fields.category', { ns: 'portal' })}
                value={subscription.category?.name || t('transactions.noCategory', { ns: 'portal' })}
              />
              <DetailRow
                label={t('personalSubscriptions.form.fields.status', { ns: 'portal' })}
                value={t(`personalSubscriptions.statuses.${subscription.status}`, { ns: 'portal' })}
              />
              <DetailRow
                label={t('personalSubscriptions.labels.autoRenew', { ns: 'portal' })}
                value={subscription.auto_renew
                  ? t('personalSubscriptions.labels.enabled', { ns: 'portal' })
                  : t('personalSubscriptions.labels.disabled', { ns: 'portal' })}
              />
              <DetailRow
                label={t('personalSubscriptions.labels.linkedRecurring', { ns: 'portal' })}
                value={subscription.recurring_transaction_id
                  ? (
                    <Link
                      href="/recurring"
                      className="inline-flex items-center gap-1 font-700 text-accent hover:text-teal-600"
                    >
                      {t('personalSubscriptions.labels.linked', { ns: 'portal' })}
                      <ExternalLink size={13} />
                    </Link>
                  )
                  : t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
              />
            </SectionCard>
          </div>

          <SectionCard
            title={t('personalSubscriptions.detail.sections.warnings', { ns: 'portal' })}
            description={t('personalSubscriptions.detail.sections.warningsDescription', { ns: 'portal' })}
          >
            {warnings.length === 0 ? (
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                {t('personalSubscriptions.detail.noWarnings', { ns: 'portal' })}
              </div>
            ) : (
              <div className="space-y-3">
                {warnings.map((warning) => (
                  <WarningListItem
                    key={`${warning.type}-${warning.daysUntil ?? 'none'}`}
                    warning={warning}
                    t={t}
                  />
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionCard
            title={t('personalSubscriptions.detail.sections.billing', { ns: 'portal' })}
            description={t('personalSubscriptions.detail.sections.billingDescription', { ns: 'portal' })}
          >
            <DetailRow
              label={t('personalSubscriptions.form.fields.billingFrequency', { ns: 'portal' })}
              value={t(`personalSubscriptions.frequencies.${subscription.billing_frequency}`, { ns: 'portal' })}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.billingInterval', { ns: 'portal' })}
              value={subscription.billing_interval}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.startDate', { ns: 'portal' })}
              value={formatDateValue(subscription.start_date) || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.nextBillingDate', { ns: 'portal' })}
              value={formatDateValue(subscription.next_billing_date) || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.trialEndDate', { ns: 'portal' })}
              value={formatDateValue(subscription.trial_end_date) || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.contractEndDate', { ns: 'portal' })}
              value={formatDateValue(subscription.contract_end_date) || notAvailableLabel}
            />
          </SectionCard>

          <SectionCard
            title={t('personalSubscriptions.detail.sections.payment', { ns: 'portal' })}
            description={t('personalSubscriptions.detail.sections.paymentDescription', { ns: 'portal' })}
          >
            <DetailRow
              label={t('personalSubscriptions.form.fields.financialAccount', { ns: 'portal' })}
              value={subscription.account?.name || t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.paymentMethod', { ns: 'portal' })}
              value={subscription.payment_method || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.accountReference', { ns: 'portal' })}
              value={subscription.account_reference || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.detail.lastPaidDate', { ns: 'portal' })}
              value={formatDateValue(subscription.last_paid_date) || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.warningThresholdAmount', { ns: 'portal' })}
              value={subscription.warning_threshold_amount !== null
                ? (
                  <FormattedCurrencyAmount
                    amount={subscription.warning_threshold_amount}
                    currencyCode={subscription.currency_code}
                    className="inline-flex font-700 text-foreground"
                    showCode
                  />
                )
                : notAvailableLabel}
            />
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SectionCard
            title={t('personalSubscriptions.detail.sections.reminders', { ns: 'portal' })}
            description={t('personalSubscriptions.detail.sections.remindersDescription', { ns: 'portal' })}
          >
            <DetailRow
              label={t('personalSubscriptions.form.fields.reminderDaysBefore', { ns: 'portal' })}
              value={subscription.reminder_days_before.length > 0
                ? subscription.reminder_days_before.join(', ')
                : t('personalSubscriptions.labels.off', { ns: 'portal' })}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.cancellationNoticeDays', { ns: 'portal' })}
              value={subscription.cancellation_notice_days}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.cancellationDeadline', { ns: 'portal' })}
              value={formatDateValue(subscription.cancellation_deadline) || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.cancellation.effectiveDate', { ns: 'portal' })}
              value={formatDateValue(subscription.cancel_effective_date) || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.cancellation.confirmationReference', { ns: 'portal' })}
              value={subscription.cancel_confirmation_reference || notAvailableLabel}
            />
          </SectionCard>

          <SectionCard
            title={t('personalSubscriptions.detail.sections.additional', { ns: 'portal' })}
            description={t('personalSubscriptions.detail.sections.additionalDescription', { ns: 'portal' })}
          >
            <DetailRow
              label={t('personalSubscriptions.form.fields.websiteUrl', { ns: 'portal' })}
              value={normalizedWebsiteUrl
                ? (
                  <a
                    href={normalizedWebsiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-700 text-accent hover:text-teal-600"
                  >
                    {normalizedWebsiteUrl}
                    <ExternalLink size={13} />
                  </a>
                )
                : notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.form.fields.notes', { ns: 'portal' })}
              value={subscription.notes || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.detail.createdAt', { ns: 'portal' })}
              value={formatDateValue(subscription.created_at.slice(0, 10)) || notAvailableLabel}
            />
            <DetailRow
              label={t('personalSubscriptions.detail.updatedAt', { ns: 'portal' })}
              value={formatDateValue(subscription.updated_at.slice(0, 10)) || notAvailableLabel}
            />
          </SectionCard>
        </div>

        <SectionCard
          title={t('personalSubscriptions.detail.sections.links', { ns: 'portal' })}
          description={t('personalSubscriptions.detail.sections.linksDescription', { ns: 'portal' })}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <Wallet size={16} />
                <p className="text-sm font-700">{t('personalSubscriptions.detail.linkCards.account', { ns: 'portal' })}</p>
              </div>
              <p className="text-sm text-muted-foreground/90">
                {subscription.account?.name || t('personalSubscriptions.detail.linkCards.accountEmpty', { ns: 'portal' })}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <ReceiptText size={16} />
                <p className="text-sm font-700">{t('personalSubscriptions.detail.linkCards.recurring', { ns: 'portal' })}</p>
              </div>
              <p className="text-sm text-muted-foreground/90">
                {subscription.recurring_transaction_id
                  ? t('personalSubscriptions.detail.linkCards.recurringLinked', { ns: 'portal' })
                  : t('personalSubscriptions.detail.linkCards.recurringEmpty', { ns: 'portal' })}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <div className="mb-2 flex items-center gap-2 text-foreground">
                <CalendarClock size={16} />
                <p className="text-sm font-700">{t('personalSubscriptions.detail.linkCards.notifications', { ns: 'portal' })}</p>
              </div>
              <p className="text-sm text-muted-foreground/90">
                {t('personalSubscriptions.detail.linkCards.notificationsDescription', {
                  ns: 'portal',
                  count: subscription.reminder_days_before.length,
                })}
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      <CancellationRequestModal
        isOpen={showCancellationModal}
        onClose={() => setShowCancellationModal(false)}
        title={t('personalSubscriptions.cancellation.modalTitle', {
          ns: 'portal',
          name: subscription.name,
        })}
        defaultValues={{
          effective_cancellation_date: subscription.cancel_effective_date || subscription.next_billing_date || '',
          confirmation_reference: subscription.cancel_confirmation_reference || '',
        }}
        onSubmit={async (values) => {
          setProcessingId(subscription.id);
          try {
            await requestPersonalSubscriptionCancellation(subscription.id, values);
            notifyChange(['personal_subscriptions', 'dashboard', 'recurring_transactions', 'notifications']);
            toast.success(t('personalSubscriptions.cancellation.requestedSuccess', { ns: 'portal', name: subscription.name }));
            await load();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : t('personalSubscriptions.cancellation.requestFailed', { ns: 'portal' }));
            throw error;
          } finally {
            setProcessingId(null);
          }
        }}
      />
    </AppLayout>
  );
}
