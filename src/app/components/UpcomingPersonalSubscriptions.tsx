'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ChevronRight, ShieldCheck } from 'lucide-react';
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

function daysUntil(dateIso: string, targetIso: string) {
  const today = new Date(`${dateIso}T12:00:00Z`);
  const target = new Date(`${targetIso}T12:00:00Z`);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
}

const UPCOMING_SUBSCRIPTIONS_TIMEOUT_MS = 12000;

export default function UpcomingPersonalSubscriptions({
  activePeriod,
  compact = false,
  dashboardSuggestion = false,
}: {
  activePeriod: DashboardActivePeriod;
  compact?: boolean;
  dashboardSuggestion?: boolean;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const isArabic = language === 'ar';
  const [subscriptions, setSubscriptions] = useState<PersonalSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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
    setLoadError(false);
    try {
      const all = await Promise.race([
        getPersonalSubscriptions({
          statuses: ['trial', 'active', 'cancellation_requested', 'cancelling'],
          nextBillingDateFrom: todayIso,
          nextBillingDateTo: upcomingWindowEnd,
        }),
        new Promise<PersonalSubscription[]>((_, reject) => {
          window.setTimeout(() => reject(new Error('upcoming-subscriptions-timeout')), UPCOMING_SUBSCRIPTIONS_TIMEOUT_MS);
        }),
      ]);
      const upcoming = getUpcomingPersonalSubscriptionCharges(all, todayIso).slice(0, 3);
      setSubscriptions(upcoming);
    } catch {
      setSubscriptions([]);
      setLoadError(true);
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

  if (dashboardSuggestion) {
    const suggestions = subscriptions.slice(0, 3).map((subscription) => {
      const dueInDays = subscription.next_billing_date
        ? daysUntil(todayIso, subscription.next_billing_date)
        : null;

      return {
        id: subscription.id,
        title: t('personalSubscriptions.widget.dashboardSuggestionTitle', { ns: 'portal' }),
        badge: t('personalSubscriptions.widget.dashboardSuggestionBadge', { ns: 'portal' }),
        message: dueInDays !== null
          ? t('personalSubscriptions.widget.dashboardSuggestionPrimary', {
              ns: 'portal',
              name: subscription.name,
              count: dueInDays,
            })
          : subscription.name,
        helper: subscriptions.length > 1
          ? t('personalSubscriptions.widget.dashboardSuggestionSecondary', {
              ns: 'portal',
              count: subscriptions.length,
            })
          : t('personalSubscriptions.widget.dashboardSuggestionSingle', { ns: 'portal' }),
        href: `/personal-subscriptions/${subscription.id}`,
      };
    });

    const visibleSuggestions = suggestions.length > 0
      ? suggestions
      : [{
          id: 'general-suggestion',
          title: t('personalSubscriptions.widget.dashboardSuggestionTitle', { ns: 'portal' }),
          badge: t('personalSubscriptions.widget.dashboardSuggestionBadge', { ns: 'portal' }),
          message: t('personalSubscriptions.widget.dashboardSuggestionEmpty', { ns: 'portal' }),
          helper: t('personalSubscriptions.widget.dashboardSuggestionSingle', { ns: 'portal' }),
          href: '/transactions',
        }];

    return (
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-800 tracking-[-0.02em] text-foreground">
            {t('dashboardSections.smartSuggestionsTitle', { ns: 'portal' })}
          </h2>
          {suggestions.length > 0 ? (
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-blue-200/80 bg-blue-50 px-2 text-[11px] font-800 text-blue-700">
              {suggestions.length}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-3 shadow-[0_16px_36px_-28px_rgba(37,99,235,0.18)]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-2xl bg-blue-100/70" />
              <div className="min-w-0 flex-1">
                <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
                <div className="mt-2 h-4 w-48 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-6 w-10 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted" />
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="h-3 w-36 animate-pulse rounded bg-muted" />
              <div className="h-8 w-20 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
        ) : loadError ? (
          <div className="rounded-[24px] border border-slate-200/80 bg-white p-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.12)]">
            <p className="text-[13px] font-700 text-foreground">
              {t('shared.dashboardLoadFailedTitle', { ns: 'portal' })}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {t('personalSubscriptions.widget.dashboardSuggestionEmpty', { ns: 'portal' })}
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[12px] font-700 text-foreground shadow-sm transition-colors hover:bg-slate-50"
            >
              {t('shared.tryAgain', { ns: 'portal' })}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleSuggestions.map((suggestion) => (
              <section
                key={suggestion.id}
                className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] p-3 shadow-[0_12px_28px_-24px_rgba(37,99,235,0.22)]"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-100/90 text-blue-700 shadow-[0_8px_18px_-14px_rgba(37,99,235,0.25)]">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-[13px] font-800 tracking-[-0.02em] text-foreground">
                        {suggestion.title}
                      </h3>
                      <span className="shrink-0 rounded-full border border-blue-200/80 bg-blue-50 px-2 py-0.5 text-[10px] font-700 text-blue-700">
                        {suggestion.badge}
                      </span>
                    </div>

                    <p className={`mt-1 text-[13px] font-700 text-foreground ${isArabic ? 'leading-5' : 'leading-5'}`}>
                      {suggestion.message}
                    </p>

                    <div className="mt-2 flex items-end justify-between gap-3">
                      <p className={`line-clamp-2 min-w-0 text-[11px] text-muted-foreground ${isArabic ? 'leading-5' : 'leading-4'}`}>
                        {suggestion.helper}
                      </p>
                      <Link
                        href={suggestion.href}
                        className="inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full border border-blue-200/80 bg-white px-3 text-[12px] font-700 text-[#2563eb] shadow-sm transition-colors hover:bg-blue-50"
                      >
                        {t('personalSubscriptions.widget.dashboardSuggestionReview', { ns: 'portal' })}
                        <ChevronRight size={14} className={isArabic ? 'rotate-180' : ''} />
                      </Link>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <SectionCard
      title={t('personalSubscriptions.widget.title', { ns: 'portal' })}
      description={compact ? undefined : t('personalSubscriptions.widget.description', { ns: 'portal' })}
      className={`flex h-full flex-col rounded-[28px] border shadow-card-sm transition-shadow duration-200 hover:shadow-card-md ${
        compact
          ? 'border-violet-200/60 bg-white'
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
      ) : loadError ? (
        <div className={`flex flex-1 flex-col items-center justify-center text-center ${compact ? 'px-4 py-4' : 'px-6 py-6'}`}>
          <p className="text-sm font-700 text-foreground">{t('shared.dashboardLoadFailedTitle', { ns: 'portal' })}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[12px] font-700 text-foreground shadow-sm transition-colors hover:bg-slate-50"
          >
            {t('shared.tryAgain', { ns: 'portal' })}
          </button>
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
