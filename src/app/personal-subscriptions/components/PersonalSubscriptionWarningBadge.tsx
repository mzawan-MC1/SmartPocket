'use client';

import React from 'react';
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getHighestPriorityPersonalSubscriptionWarning, type PersonalSubscription } from '@/lib/personal-subscriptions-shared';

function getBadgeClasses(level: 'info' | 'warning' | 'urgent') {
  switch (level) {
    case 'urgent':
      return 'border-negative/20 bg-negative-soft text-negative';
    case 'warning':
      return 'border-warning/20 bg-warning-soft text-warning';
    case 'info':
    default:
      return 'border-info/20 bg-info-soft text-info';
  }
}

function getWarningLabel(
  warning: NonNullable<ReturnType<typeof getHighestPriorityPersonalSubscriptionWarning>>,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (warning.type) {
    case 'upcoming_payment':
      if (warning.daysUntil === 0) {
        return t('personalSubscriptions.warnings.upcoming.today', { ns: 'portal' });
      }
      if (warning.daysUntil === 1) {
        return t('personalSubscriptions.warnings.upcoming.tomorrow', { ns: 'portal' });
      }
      return t('personalSubscriptions.warnings.upcoming.days', { ns: 'portal', count: warning.daysUntil });
    case 'trial_ending':
      if (warning.daysUntil === 0) {
        return t('personalSubscriptions.warnings.trial.today', { ns: 'portal' });
      }
      if (warning.daysUntil === 1) {
        return t('personalSubscriptions.warnings.trial.tomorrow', { ns: 'portal' });
      }
      return t('personalSubscriptions.warnings.trial.days', { ns: 'portal', count: warning.daysUntil });
    case 'cancellation_deadline':
      if (warning.daysUntil === 0) {
        return t('personalSubscriptions.warnings.cancellation.today', { ns: 'portal' });
      }
      return t('personalSubscriptions.warnings.cancellation.days', { ns: 'portal', count: warning.daysUntil });
    case 'over_threshold':
      return t('personalSubscriptions.warnings.threshold', { ns: 'portal' });
    case 'expired':
      return t('personalSubscriptions.warnings.expired', { ns: 'portal' });
    default:
      return '';
  }
}

export default function PersonalSubscriptionWarningBadge({
  subscription,
  todayIso,
}: {
  subscription: Pick<
    PersonalSubscription,
    | 'amount'
    | 'warning_threshold_amount'
    | 'next_billing_date'
    | 'trial_end_date'
    | 'cancellation_deadline'
    | 'contract_end_date'
    | 'cancel_effective_date'
    | 'status'
  >;
  todayIso: string;
}) {
  const { t } = useTranslation('portal');
  const warning = getHighestPriorityPersonalSubscriptionWarning(subscription, todayIso);

  if (!warning) {
    return null;
  }

  const Icon = warning.level === 'urgent' ? OctagonAlert : warning.level === 'warning' ? AlertTriangle : Info;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-700 ${getBadgeClasses(warning.level)}`}>
      <Icon size={12} />
      {getWarningLabel(warning, t)}
    </span>
  );
}
