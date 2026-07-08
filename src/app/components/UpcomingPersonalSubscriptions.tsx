'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EmptyState from '@/components/ui/EmptyState';
import SectionCard from '@/components/ui/SectionCard';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { getCurrentBusinessDate } from '@/lib/financial-periods';
import { getPersonalSubscriptions } from '@/lib/personal-subscriptions';
import {
  getHighestPriorityPersonalSubscriptionWarning,
  getUpcomingPersonalSubscriptionCharges,
  type PersonalSubscription,
} from '@/lib/personal-subscriptions-shared';
import type { DashboardActivePeriod } from '@/lib/finance';
import PersonalSubscriptionWarningBadge from '@/app/personal-subscriptions/components/PersonalSubscriptionWarningBadge';
import { useLanguage } from '@/contexts/LanguageContext';

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default function UpcomingPersonalSubscriptions({
  activePeriod,
  compact = false,
}: {
  activePeriod: DashboardActivePeriod;
  compact?: boolean;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const [subscriptions, setSubscriptions] = useState<PersonalSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const todayIso = useMemo(
    () => getCurrentBusinessDate(activePeriod.timezone),
    [activePeriod.timezone]
  );
  const upcomingWindowEnd = useMemo(
    () => addDays(todayIso, 7),
    [todayIso]
  );
  const notAvailableLabel = t('notAvailable', { ns: 'common' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getPersonalSubscriptions({
        statuses: ['trial', 'active', 'cancellation_requested', 'cancelling'],
        nextBillingDateFrom: todayIso,
        nextBillingDateTo: upcomingWindowEnd,
      });
      const upcoming = getUpcomingPersonalSubscriptionCharges(all, todayIso).slice(0, 3);
      setSubscriptions(upcoming);
    } catch {
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }, [todayIso, upcomingWindowEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(
    ['personal_subscriptions'],
    'UpcomingPersonalSubscriptions',
    async () => {
      await load();
    }
  );

  return (
    <SectionCard
      title={t('personalSubscriptions.widget.title', { ns: 'portal' })}
      description={compact ? undefined : t('personalSubscriptions.widget.description', { ns: 'portal' })}
      className={`flex h-full flex-col rounded-[28px] border shadow-card-sm transition-shadow duration-200 hover:shadow-card-md ${
        compact
          ? 'border-violet-200/60 bg-[linear-gradient(165deg,rgba(255,255,255,0.95),rgba(247,244,255,0.92))]'
          : 'border-border/80 bg-card'
      }`}
      action={(
        <Link href="/personal-subscriptions" className={`link-accent ${compact ? 'text-xs' : 'text-sm'}`.trim()}>
          {t('actions.viewAll', { ns: 'common' })}
        </Link>
      )}
      bodyClassName={`flex flex-1 flex-col ${compact ? 'p-2.5 pt-2' : 'p-3'}`}
    >
      {loading ? (
        <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={`personal-subscription-widget-skeleton-${index}`} className={`animate-pulse rounded-2xl border px-3.5 py-3 ${
              compact ? 'border-violet-100/70 bg-white/75' : 'border-border/60 bg-muted/15'
            }`}>
              <div className="mb-2 h-4 w-36 rounded bg-muted" />
              <div className="h-3 w-28 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : subscriptions.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={t('personalSubscriptions.widget.emptyTitle', { ns: 'portal' })}
          description={t('personalSubscriptions.widget.emptyDescription', { ns: 'portal' })}
          variant={compact ? 'compact' : 'default'}
          tone={compact ? 'secondary' : 'accent'}
          className={`flex flex-1 items-center justify-center ${compact ? 'px-4 py-4' : 'px-6 py-6'}`}
        />
      ) : (
        <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
          {subscriptions.map((subscription) => (
            <div key={subscription.id} className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 transition-all duration-150 ${
              compact
                ? 'border-violet-100/70 bg-white/75 py-2.5 hover:border-violet-200/80 hover:bg-white/90'
                : 'border-transparent bg-muted/15 py-3 hover:border-border/70 hover:bg-muted/30'
            }`}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/personal-subscriptions/${subscription.id}`}
                    className={`truncate font-700 text-foreground hover:text-accent ${compact ? 'text-[13px]' : 'text-sm'}`}
                  >
                    {subscription.name}
                  </Link>
                  {getHighestPriorityPersonalSubscriptionWarning(subscription, todayIso) ? (
                    <PersonalSubscriptionWarningBadge
                      subscription={subscription}
                      todayIso={todayIso}
                    />
                  ) : null}
                </div>
                <p className={`mt-1 text-muted-foreground ${compact ? (isArabic ? 'text-[12px] leading-5' : 'text-[11px]') : (isArabic ? 'text-[12.5px] leading-5' : 'text-xs')}`}>
                  {subscription.next_billing_date || notAvailableLabel}
                </p>
              </div>
              <FormattedCurrencyAmount
                amount={subscription.amount}
                currencyCode={subscription.currency_code}
                className={`${compact ? 'text-[13px]' : isArabic ? 'text-[15px]' : 'text-sm'} font-700 text-foreground`}
                showCode
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
