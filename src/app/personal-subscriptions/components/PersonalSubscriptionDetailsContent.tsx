'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BellRing,
  ExternalLink,
  Link2,
  ReceiptText,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import PersonalSubscriptionBrandLogo from '@/components/personal-subscriptions/PersonalSubscriptionBrandLogo';
import FormSection from '@/components/ui/FormSection';
import StatusBadge from '@/components/ui/StatusBadge';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  getHighestPriorityPersonalSubscriptionWarning,
  normalizeWebsiteUrl,
  type PersonalSubscription,
} from '@/lib/personal-subscriptions-shared';
import PersonalSubscriptionWarningBadge from './PersonalSubscriptionWarningBadge';

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

interface KeyMetricProps {
  label: string;
  value: React.ReactNode;
}

function KeyMetric({ label, value }: KeyMetricProps) {
  return (
    <div className="rounded-2xl bg-muted/25 px-3.5 py-3 ring-1 ring-inset ring-border/50">
      <p className="text-[11.5px] font-600 leading-4 text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-[14.5px] font-800 leading-5 text-foreground">{value}</div>
    </div>
  );
}

interface OverviewStatusProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'positive' | 'accent' | 'muted' | 'warning' | 'negative';
}

function OverviewStatus({ icon, label, value, tone }: OverviewStatusProps) {
  const toneColors: Record<OverviewStatusProps['tone'], string> = {
    positive: 'text-positive',
    accent: 'text-accent',
    muted: 'text-muted-foreground',
    warning: 'text-warning',
    negative: 'text-negative',
  };
  const toneBg: Record<OverviewStatusProps['tone'], string> = {
    positive: 'bg-positive-soft/60',
    accent: 'bg-accent/12',
    muted: 'bg-muted/60',
    warning: 'bg-warning-soft/60',
    negative: 'bg-negative-soft/70',
  };
  return (
    <div className="flex items-center gap-2.5 rounded-xl px-2.5 py-2">
      <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${toneBg[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] font-600 leading-4 text-muted-foreground">{label}</p>
        <p className={`mt-0.5 truncate text-[13px] font-800 leading-5 ${toneColors[tone]}`}>{value}</p>
      </div>
    </div>
  );
}

interface DefRowProps {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
  mono?: boolean;
  multiline?: boolean;
}

function DefRow({ label, value, wide = false, mono = false, multiline = false }: DefRowProps) {
  return (
    <div
      className={`flex flex-col gap-1 border-b border-border/60 py-3 last:border-b-0 sm:gap-2 ${wide ? 'sm:col-span-2' : ''}`}
    >
      <dt className="text-[11.5px] font-600 leading-4 text-muted-foreground">{label}</dt>
      <dd
        className={[
          'text-[13.5px] leading-5 text-foreground',
          multiline ? 'whitespace-pre-wrap break-words' : 'truncate',
          mono ? 'font-mono tracking-tight' : 'font-700',
        ].join(' ')}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

export default function PersonalSubscriptionDetailsContent({
  subscription,
  todayIso,
  actions,
}: {
  subscription: PersonalSubscription;
  todayIso: string;
  actions?: React.ReactNode;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const notAvailableLabel = t('notAvailable', { ns: 'common' });
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const normalizedWebsiteUrl = normalizeWebsiteUrl(subscription.website_url);
  const highestWarning = useMemo(
    () => getHighestPriorityPersonalSubscriptionWarning(subscription, todayIso),
    [subscription, todayIso]
  );

  const autoRenewTone: OverviewStatusProps['tone'] = subscription.auto_renew ? 'positive' : 'muted';
  const remindersTone: OverviewStatusProps['tone'] = subscription.reminder_days_before.length > 0 ? 'accent' : 'muted';
  const linkedTone: OverviewStatusProps['tone'] = subscription.recurring_transaction_id ? 'accent' : 'muted';

  const providerDisplay =
    subscription.provider || t('personalSubscriptions.labels.customProvider', { ns: 'portal' });
  const categoryDisplay =
    subscription.category?.name || t('transactions.noCategory', { ns: 'portal' });

  return (
    <div className="space-y-4 max-[480px]:space-y-3">
      <div className={`flex items-start justify-between gap-3 ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
        <div className={`flex min-w-0 flex-1 items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <PersonalSubscriptionBrandLogo
            providerKey={subscription.provider_key}
            fallbackName={subscription.name}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-[17px] font-800 tracking-[-0.02em] text-foreground">
                {subscription.name}
              </h2>
              <StatusBadge
                status={getStatusTone(subscription.status)}
                label={t(`personalSubscriptions.statuses.${subscription.status}`, { ns: 'portal' })}
              />
              {highestWarning ? (
                <PersonalSubscriptionWarningBadge subscription={subscription} todayIso={todayIso} />
              ) : null}
            </div>
            <p className="mt-1 truncate text-[13px] leading-5 text-muted-foreground">
              {providerDisplay} · {categoryDisplay}
            </p>
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-2 max-[480px]:grid-cols-1 sm:grid-cols-2">
        <KeyMetric
          label={t('personalSubscriptions.detail.metrics.amount', { ns: 'portal' })}
          value={(
            <FormattedCurrencyAmount
              amount={subscription.amount}
              currencyCode={subscription.currency_code}
              className="text-[14.5px] font-800 text-foreground"
              showCode
            />
          )}
        />
        <KeyMetric
          label={t('personalSubscriptions.form.fields.billingFrequency', { ns: 'portal' })}
          value={t(`personalSubscriptions.frequencies.${subscription.billing_frequency}`, { ns: 'portal' })}
        />
        <KeyMetric
          label={t('personalSubscriptions.labels.nextCharge', { ns: 'portal' })}
          value={formatDateValue(subscription.next_billing_date) || notAvailableLabel}
        />
        <KeyMetric
          label={t('personalSubscriptions.labels.paymentAccount', { ns: 'portal' })}
          value={subscription.account?.name || t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
        />
      </div>

      <div className="rounded-2xl bg-muted/20 p-2 ring-1 ring-inset ring-border/50">
        <p className="px-2 pt-1 pb-0.5 text-[11.5px] font-700 uppercase tracking-[0.06em] text-muted-foreground">
          {t('personalSubscriptions.detail.sections.overview', { ns: 'portal' })}
        </p>
        <div className="grid grid-cols-1 gap-1 max-[480px]:grid-cols-1 min-[390px]:grid-cols-3 sm:gap-0.5">
          <OverviewStatus
            icon={<RefreshCw size={14} strokeWidth={2} className={autoRenewTone === 'positive' ? 'text-positive' : 'text-muted-foreground'} />}
            label={t('personalSubscriptions.labels.autoRenew', { ns: 'portal' })}
            value={subscription.auto_renew
              ? t('personalSubscriptions.labels.enabled', { ns: 'portal' })
              : t('personalSubscriptions.labels.disabled', { ns: 'portal' })}
            tone={autoRenewTone}
          />
          <OverviewStatus
            icon={<BellRing size={14} strokeWidth={2} className={remindersTone === 'accent' ? 'text-accent' : 'text-muted-foreground'} />}
            label={t('personalSubscriptions.detail.metrics.reminders', { ns: 'portal' })}
            value={subscription.reminder_days_before.length > 0
              ? t('personalSubscriptions.labels.enabled', { ns: 'portal' })
              : t('personalSubscriptions.labels.off', { ns: 'portal' })}
            tone={remindersTone}
          />
          <OverviewStatus
            icon={<Link2 size={14} strokeWidth={2} className={linkedTone === 'accent' ? 'text-accent' : 'text-muted-foreground'} />}
            label={t('personalSubscriptions.labels.linkedRecurring', { ns: 'portal' })}
            value={subscription.recurring_transaction_id
              ? t('personalSubscriptions.labels.linked', { ns: 'portal' })
              : t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
            tone={linkedTone}
          />
        </div>
      </div>

      <FormSection
        variant="neutral"
        title={t('personalSubscriptions.detail.sections.additional', { ns: 'portal' })}
        description={t('personalSubscriptions.detail.sections.additionalDescription', { ns: 'portal' })}
        collapsible
        expanded={showMoreDetails}
        onExpandedChange={setShowMoreDetails}
        className="overflow-hidden rounded-2xl bg-card ring-1 ring-inset ring-border/60"
        headerClassName="px-4 py-2.5"
        bodyClassName="px-4 pb-3.5"
      >
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <DefRow
            label={t('personalSubscriptions.form.fields.provider', { ns: 'portal' })}
            value={subscription.provider || notAvailableLabel}
          />
          <DefRow
            label={t('personalSubscriptions.form.fields.category', { ns: 'portal' })}
            value={subscription.category?.name || t('transactions.noCategory', { ns: 'portal' })}
          />
          <DefRow
            label={t('personalSubscriptions.form.fields.paymentMethod', { ns: 'portal' })}
            value={subscription.payment_method || notAvailableLabel}
          />
          <DefRow
            label={t('personalSubscriptions.form.fields.accountReference', { ns: 'portal' })}
            value={subscription.account_reference || notAvailableLabel}
            wide
            multiline
          />
          <DefRow
            label={t('personalSubscriptions.form.fields.startDate', { ns: 'portal' })}
            value={formatDateValue(subscription.start_date) || notAvailableLabel}
          />
          <DefRow
            label={t('personalSubscriptions.form.fields.trialEndDate', { ns: 'portal' })}
            value={formatDateValue(subscription.trial_end_date) || notAvailableLabel}
          />
          <DefRow
            label={t('personalSubscriptions.form.fields.contractEndDate', { ns: 'portal' })}
            value={formatDateValue(subscription.contract_end_date) || notAvailableLabel}
          />
          <DefRow
            label={t('personalSubscriptions.form.fields.cancellationDeadline', { ns: 'portal' })}
            value={formatDateValue(subscription.cancellation_deadline) || notAvailableLabel}
          />
          <DefRow
            label={t('personalSubscriptions.form.fields.reminderDaysBefore', { ns: 'portal' })}
            value={subscription.reminder_days_before.length > 0
              ? subscription.reminder_days_before.join(', ')
              : t('personalSubscriptions.labels.off', { ns: 'portal' })}
          />
          <DefRow
            label={t('personalSubscriptions.cancellation.effectiveDate', { ns: 'portal' })}
            value={formatDateValue(subscription.cancel_effective_date) || notAvailableLabel}
          />
          {normalizedWebsiteUrl ? (
            <DefRow
              label={t('personalSubscriptions.form.fields.websiteUrl', { ns: 'portal' })}
              value={(
                <a
                  href={normalizedWebsiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-700 text-accent hover:underline"
                >
                  <span className="truncate">{normalizedWebsiteUrl}</span>
                  <ExternalLink size={13} className="shrink-0" />
                </a>
              )}
              wide
            />
          ) : null}
          {subscription.recurring_transaction_id ? (
            <DefRow
              label={t('personalSubscriptions.labels.linkedRecurring', { ns: 'portal' })}
              value={(
                <Link
                  href="/recurring"
                  className="inline-flex items-center gap-1 font-700 text-accent hover:underline"
                >
                  {t('personalSubscriptions.labels.linked', { ns: 'portal' })}
                  <ExternalLink size={13} />
                </Link>
              )}
            />
          ) : null}
          {subscription.notes ? (
            <DefRow
              label={t('personalSubscriptions.form.fields.notes', { ns: 'portal' })}
              value={subscription.notes}
              wide
              multiline
            />
          ) : null}
          <DefRow
            label={t('personalSubscriptions.detail.createdAt', { ns: 'portal' })}
            value={formatDateValue(subscription.created_at.slice(0, 10)) || notAvailableLabel}
          />
          <DefRow
            label={t('personalSubscriptions.detail.updatedAt', { ns: 'portal' })}
            value={formatDateValue(subscription.updated_at.slice(0, 10)) || notAvailableLabel}
          />
          <DefRow
            label="ID"
            value={subscription.id}
            wide
            mono
          />
          <DefRow
            label={t('personalSubscriptions.detail.linkCards.account', { ns: 'portal' })}
            value={(
              <span className="inline-flex items-center gap-1.5 font-700">
                <Wallet size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {subscription.account?.name || t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
                </span>
              </span>
            )}
          />
          <DefRow
            label={t('personalSubscriptions.detail.linkCards.recurring', { ns: 'portal' })}
            value={(
              <span className="inline-flex items-center gap-1.5 font-700">
                <ReceiptText size={14} className="shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {subscription.recurring_transaction_id
                    ? t('personalSubscriptions.labels.linked', { ns: 'portal' })
                    : t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
                </span>
              </span>
            )}
          />
        </dl>
      </FormSection>
    </div>
  );
}
