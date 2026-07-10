'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, ReceiptText, Wallet } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

function CompactMetricCard({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-border/80 bg-card px-3 py-2.5 shadow-card-sm">
      <p className="text-[10px] font-700 uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-[14px] font-800 leading-5 text-foreground">{value}</div>
    </div>
  );
}

function StatusMiniCard({
  label,
  value,
  toneClassName = 'text-foreground',
}: {
  label: string;
  value: string;
  toneClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-3 py-2">
      <p className="text-[10px] font-700 uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className={`mt-1 text-[13px] font-700 ${toneClassName}`}>{value}</p>
    </div>
  );
}

function DetailItem({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
      <p className="text-[10px] font-700 uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <div className="mt-1.5 text-[13px] leading-5 text-foreground">{value}</div>
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

  return (
    <div className="space-y-3 max-[480px]:space-y-2.5">
      <div className="rounded-[20px] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(249,250,252,0.98)_100%)] px-3.5 py-3 shadow-card-sm">
        <div className={`flex flex-wrap items-start justify-between gap-2.5 ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
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
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
              {(subscription.provider || t('personalSubscriptions.labels.customProvider', { ns: 'portal' }))} · {subscription.category?.name || t('transactions.noCategory', { ns: 'portal' })}
            </p>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CompactMetricCard
          label={t('personalSubscriptions.detail.metrics.amount', { ns: 'portal' })}
          value={(
            <FormattedCurrencyAmount
              amount={subscription.amount}
              currencyCode={subscription.currency_code}
              className="text-[14px] font-800 text-foreground"
              showCode
            />
          )}
        />
        <CompactMetricCard
          label={t('personalSubscriptions.form.fields.billingFrequency', { ns: 'portal' })}
          value={t(`personalSubscriptions.frequencies.${subscription.billing_frequency}`, { ns: 'portal' })}
        />
        <CompactMetricCard
          label={t('personalSubscriptions.labels.nextCharge', { ns: 'portal' })}
          value={formatDateValue(subscription.next_billing_date) || notAvailableLabel}
        />
        <CompactMetricCard
          label={t('personalSubscriptions.labels.paymentAccount', { ns: 'portal' })}
          value={subscription.account?.name || t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
        />
      </div>

      <div className="rounded-[20px] border border-border/80 bg-[#fbfcfe] px-3 py-3 shadow-card-sm">
        <p className="text-[11px] font-700 uppercase tracking-[0.08em] text-muted-foreground">
          {t('personalSubscriptions.detail.sections.overview', { ns: 'portal' })}
        </p>
        <div className="mt-2.5 grid grid-cols-1 gap-2 min-[390px]:grid-cols-3">
          <StatusMiniCard
            label={t('personalSubscriptions.labels.autoRenew', { ns: 'portal' })}
            value={subscription.auto_renew
              ? t('personalSubscriptions.labels.enabled', { ns: 'portal' })
              : t('personalSubscriptions.labels.disabled', { ns: 'portal' })}
            toneClassName={subscription.auto_renew ? 'text-positive' : 'text-muted-foreground'}
          />
          <StatusMiniCard
            label={t('personalSubscriptions.detail.metrics.reminders', { ns: 'portal' })}
            value={subscription.reminder_days_before.length > 0
              ? t('personalSubscriptions.labels.enabled', { ns: 'portal' })
              : t('personalSubscriptions.labels.off', { ns: 'portal' })}
            toneClassName={subscription.reminder_days_before.length > 0 ? 'text-accent' : 'text-muted-foreground'}
          />
          <StatusMiniCard
            label={t('personalSubscriptions.labels.linkedRecurring', { ns: 'portal' })}
            value={subscription.recurring_transaction_id
              ? t('personalSubscriptions.labels.linked', { ns: 'portal' })
              : t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
            toneClassName={subscription.recurring_transaction_id ? 'text-accent' : 'text-muted-foreground'}
          />
        </div>
      </div>

      <FormSection
        variant="secondary"
        title={t('personalSubscriptions.detail.sections.additional', { ns: 'portal' })}
        description={t('personalSubscriptions.detail.sections.additionalDescription', { ns: 'portal' })}
        collapsible
        expanded={showMoreDetails}
        onExpandedChange={setShowMoreDetails}
        className="border-border/80 bg-[#fcfcfd]"
        headerClassName="px-3 py-2.5"
        bodyClassName="space-y-2.5 px-3 py-2.5"
      >
        <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2">
          <DetailItem
            label={t('personalSubscriptions.form.fields.provider', { ns: 'portal' })}
            value={subscription.provider || notAvailableLabel}
          />
          <DetailItem
            label={t('personalSubscriptions.form.fields.category', { ns: 'portal' })}
            value={subscription.category?.name || t('transactions.noCategory', { ns: 'portal' })}
          />
          <DetailItem
            label={t('personalSubscriptions.form.fields.paymentMethod', { ns: 'portal' })}
            value={subscription.payment_method || notAvailableLabel}
          />
          <DetailItem
            label={t('personalSubscriptions.form.fields.accountReference', { ns: 'portal' })}
            value={subscription.account_reference || notAvailableLabel}
          />
          <DetailItem
            label={t('personalSubscriptions.form.fields.startDate', { ns: 'portal' })}
            value={formatDateValue(subscription.start_date) || notAvailableLabel}
          />
          <DetailItem
            label={t('personalSubscriptions.form.fields.trialEndDate', { ns: 'portal' })}
            value={formatDateValue(subscription.trial_end_date) || notAvailableLabel}
          />
          <DetailItem
            label={t('personalSubscriptions.form.fields.contractEndDate', { ns: 'portal' })}
            value={formatDateValue(subscription.contract_end_date) || notAvailableLabel}
          />
          <DetailItem
            label={t('personalSubscriptions.form.fields.cancellationDeadline', { ns: 'portal' })}
            value={formatDateValue(subscription.cancellation_deadline) || notAvailableLabel}
          />
          <DetailItem
            label={t('personalSubscriptions.form.fields.reminderDaysBefore', { ns: 'portal' })}
            value={subscription.reminder_days_before.length > 0
              ? subscription.reminder_days_before.join(', ')
              : t('personalSubscriptions.labels.off', { ns: 'portal' })}
          />
          <DetailItem
            label={t('personalSubscriptions.cancellation.effectiveDate', { ns: 'portal' })}
            value={formatDateValue(subscription.cancel_effective_date) || notAvailableLabel}
          />
          {normalizedWebsiteUrl ? (
            <DetailItem
              label={t('personalSubscriptions.form.fields.websiteUrl', { ns: 'portal' })}
              value={(
                <a
                  href={normalizedWebsiteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-700 text-accent hover:text-teal-600"
                >
                  {normalizedWebsiteUrl}
                  <ExternalLink size={13} />
                </a>
              )}
            />
          ) : null}
          {subscription.recurring_transaction_id ? (
            <DetailItem
              label={t('personalSubscriptions.labels.linkedRecurring', { ns: 'portal' })}
              value={(
                <Link href="/recurring" className="inline-flex items-center gap-1 font-700 text-accent hover:text-teal-600">
                  {t('personalSubscriptions.labels.linked', { ns: 'portal' })}
                  <ExternalLink size={13} />
                </Link>
              )}
            />
          ) : null}
          {subscription.notes ? (
            <DetailItem
              label={t('personalSubscriptions.form.fields.notes', { ns: 'portal' })}
              value={subscription.notes}
            />
          ) : null}
          <DetailItem
            label={t('personalSubscriptions.detail.createdAt', { ns: 'portal' })}
            value={formatDateValue(subscription.created_at.slice(0, 10)) || notAvailableLabel}
          />
          <DetailItem
            label={t('personalSubscriptions.detail.updatedAt', { ns: 'portal' })}
            value={formatDateValue(subscription.updated_at.slice(0, 10)) || notAvailableLabel}
          />
          <DetailItem
            label="ID"
            value={subscription.id}
          />
          <DetailItem
            label={t('personalSubscriptions.detail.linkCards.account', { ns: 'portal' })}
            value={(
              <span className="inline-flex items-center gap-1.5">
                <Wallet size={13} className="text-muted-foreground" />
                <span>{subscription.account?.name || t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}</span>
              </span>
            )}
          />
          <DetailItem
            label={t('personalSubscriptions.detail.linkCards.recurring', { ns: 'portal' })}
            value={(
              <span className="inline-flex items-center gap-1.5">
                <ReceiptText size={13} className="text-muted-foreground" />
                <span>
                  {subscription.recurring_transaction_id
                    ? t('personalSubscriptions.labels.linked', { ns: 'portal' })
                    : t('personalSubscriptions.labels.unlinked', { ns: 'portal' })}
                </span>
              </span>
            )}
          />
        </div>
      </FormSection>
    </div>
  );
}
