'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
        <Link href="/personal-subscriptions" className={`font-700 text-accent transition-colors hover:text-teal-600 ${compact ? 'text-xs' : 'text-sm'}`}>
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
        <div className={`flex flex-1 flex-col items-center justify-center text-center ${compact ? 'px-4 py-4' : 'px-6 py-6'}`}>
          <div className={`mb-3 flex items-center justify-center text-accent ${compact ? 'h-12 w-12 rounded-[18px] bg-violet-500/10' : 'h-16 w-16 rounded-[22px] bg-accent/10'}`}>
            <CalendarClock size={compact ? 22 : 28} />
          </div>
          <p className={`${compact ? 'text-[15px]' : 'text-base'} font-800 text-foreground`}>
            {t('personalSubscriptions.widget.emptyTitle', { ns: 'portal' })}
          </p>
          <p className={`mt-2 max-w-[18rem] text-muted-foreground ${compact ? 'text-[12px] leading-5' : 'text-sm'}`}>
            {t('personalSubscriptions.widget.emptyDescription', { ns: 'portal' })}
          </p>
        </div>
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
                <p className={`mt-1 text-muted-foreground ${compact ? 'text-[11px]' : 'text-xs'}`}>
                  {subscription.next_billing_date || notAvailableLabel}
                </p>
              </div>
              <FormattedCurrencyAmount
                amount={subscription.amount}
                currencyCode={subscription.currency_code}
                className={`${compact ? 'text-[13px]' : 'text-sm'} font-700 text-foreground`}
                showCode
              />
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
