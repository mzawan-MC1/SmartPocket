'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';
import { formatCurrencyText } from '@/lib/currency-formatting';
import {
  getPlanForInterval,
  groupPlansByFamily,
  isSelectablePaidInterval,
} from '@/lib/subscription/pricing';
import { fetchSubscriptionPlans } from '@/lib/subscription/client';
import type { BillingAvailability, PublicSubscriptionPlan } from '@/lib/subscription/types';
import { trackMarketingEvent } from '@/lib/analytics';

function formatPublicPlanPrice(amount: number, locale: string) {
  if (amount <= 0) {
    return null;
  }

  return formatCurrencyText(amount, {
    currencyCode: 'AED',
    locale,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function getPublicPlanCtaHref(planCode: string, interval: string, isAuthenticated: boolean) {
  const destination = `/settings/subscription?plan=${encodeURIComponent(planCode)}&interval=${encodeURIComponent(interval)}`;
  if (isAuthenticated) {
    return destination;
  }

  return `/sign-up-login?next=${encodeURIComponent(destination)}`;
}

function getPublicPlanFeatureRows(
  plan: PublicSubscriptionPlan,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return [
    t('home.pricing.features.textAi', {
      credits: plan.monthlyAiCredits,
      requests: plan.dailyAiRequestLimit,
    }),
    t('home.pricing.features.voiceAi', {
      minutes: Math.round(plan.monthlyVoiceSeconds / 60),
    }),
    plan.receiptIntelligenceEnabled
      ? t('home.pricing.features.receiptIntelligence', {
          count: plan.monthlyReceiptExtractions,
        })
      : t('home.pricing.features.receiptIntelligenceDisabled', {
          defaultValue: 'Receipt Intelligence not included',
        }),
    plan.aiHistoryEnabled
      ? t('home.pricing.features.aiHistoryEnabled', {
          days: plan.aiHistoryRetentionDays,
        })
      : t('home.pricing.features.aiHistoryDisabled'),
    ...plan.featureLimits.map((limit) => `${limit.featureKey}: ${limit.featureValue}`),
  ];
}

export default function PricingPlansSection({
  sectionId,
  showViewDetailsLink = false,
  variant = 'default',
}: {
  sectionId?: string;
  showViewDetailsLink?: boolean;
  variant?: 'default' | 'dark';
}) {
  const { t } = useTranslation('public');
  const { language } = useLanguage();
  const { user, loading: authLoading } = useAuth();
  const [publicPlans, setPublicPlans] = useState<PublicSubscriptionPlan[]>([]);
  const [billing, setBilling] = useState<BillingAvailability | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);
  const [selectedInterval, setSelectedInterval] = useState<'monthly' | 'yearly'>('monthly');
  const locale = getIntlLocale(language);
  const isAuthenticated = Boolean(user && !authLoading);
  const isDark = variant === 'dark';

  useEffect(() => {
    let cancelled = false;

    fetchSubscriptionPlans()
      .then((payload) => {
        if (cancelled) return;
        setPublicPlans(payload.plans);
        setBilling(payload.billing);
      })
      .catch(() => {
        if (cancelled) return;
        setPublicPlans([]);
        setBilling(null);
      })
      .finally(() => {
        if (!cancelled) {
          setPlansLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const activePlans = useMemo(
    () => publicPlans.filter((plan) => plan.isActive),
    [publicPlans]
  );
  const availableIntervals = useMemo(
    () =>
      Array.from(
        new Set(
          activePlans
            .filter(
              (plan) => plan.planCode !== 'free_trial' && isSelectablePaidInterval(plan.billingInterval)
            )
            .map((plan) => plan.billingInterval)
        )
      ) as Array<'monthly' | 'yearly'>,
    [activePlans]
  );
  const freeTrialPlan = activePlans.find((plan) => plan.planCode === 'free_trial') || null;
  const visiblePlans = useMemo(
    () =>
      Object.values(groupPlansByFamily(activePlans))
        .map((familyPlans) => {
          const freeTrial = familyPlans.find((plan) => plan.planCode === 'free_trial') || null;
          return freeTrial || getPlanForInterval(familyPlans, selectedInterval);
        })
        .filter((plan): plan is PublicSubscriptionPlan => Boolean(plan)),
    [activePlans, selectedInterval]
  );

  useEffect(() => {
    if (!availableIntervals.includes(selectedInterval)) {
      setSelectedInterval(availableIntervals.includes('monthly') ? 'monthly' : (availableIntervals[0] || 'monthly'));
    }
  }, [availableIntervals, selectedInterval]);

  useEffect(() => {
    trackMarketingEvent('pricing_viewed', {
      location: sectionId || 'pricing',
    });
  }, [sectionId]);

  return (
    <section
      id={sectionId}
      className={`scroll-mt-28 px-4 py-20 ${isDark ? 'bg-[#041229] text-white' : 'bg-card/50'}`}
    >
      <div className={`mx-auto ${isDark ? 'max-w-7xl' : 'max-w-5xl'}`}>
        <div className="text-center mb-14">
          <h2 className={`text-3xl sm:text-4xl font-800 mb-4 ${isDark ? 'text-white' : 'text-foreground'}`}>
            {t('home.sections.pricingTitle')}
          </h2>
          <p className={isDark ? 'text-slate-300' : 'text-muted-foreground'}>{t('home.pricing.subtitle')}</p>
        </div>
        {availableIntervals.length > 1 ? (
          <div className="mb-8 flex justify-center">
            <div className={`inline-flex rounded-2xl p-1 ${isDark ? 'border border-white/10 bg-white/5' : 'border border-border bg-secondary/40'}`}>
              {(['monthly', 'yearly'] as const).map((interval) => {
                const supported = availableIntervals.includes(interval);
                return (
                  <button
                    key={interval}
                    type="button"
                    onClick={() => supported && setSelectedInterval(interval)}
                    disabled={!supported}
                    className={`min-w-[8.5rem] rounded-xl px-4 py-2 text-sm font-700 transition-all ${
                      selectedInterval === interval
                        ? isDark
                          ? 'bg-white text-slate-950 shadow-sm'
                          : 'bg-card text-foreground shadow-sm'
                        : isDark
                          ? 'text-slate-300'
                          : 'text-muted-foreground'
                    } ${!supported ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    {t(`home.pricing.intervals.${interval}`)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {plansLoading
            ? Array.from({ length: 3 }, (_, index) => (
                <div
                  key={index}
                  className={`flex flex-col animate-pulse rounded-[2rem] p-6 ${
                    isDark ? 'border border-white/10 bg-white/5' : 'card-elevated'
                  }`}
                >
                  <div className={`h-6 w-24 rounded ${isDark ? 'bg-white/10' : 'bg-secondary'}`} />
                  <div className={`mt-4 h-10 w-28 rounded ${isDark ? 'bg-white/10' : 'bg-secondary'}`} />
                  <div className="mt-6 space-y-2">
                    <div className={`h-4 rounded ${isDark ? 'bg-white/10' : 'bg-secondary'}`} />
                    <div className={`h-4 rounded ${isDark ? 'bg-white/10' : 'bg-secondary'}`} />
                    <div className={`h-4 rounded ${isDark ? 'bg-white/10' : 'bg-secondary'}`} />
                    <div className={`h-4 rounded ${isDark ? 'bg-white/10' : 'bg-secondary'}`} />
                  </div>
                  <div className={`mt-6 h-11 rounded ${isDark ? 'bg-white/10' : 'bg-secondary'}`} />
                </div>
              ))
            : visiblePlans.map((plan) => {
                const featureRows = getPublicPlanFeatureRows(plan, t);
                const priceText = formatPublicPlanPrice(plan.priceAmount, locale);
                const equivalentMonthlyText = formatPublicPlanPrice(
                  plan.equivalentMonthlyPriceAmount,
                  locale
                );
                const yearlySavingText = formatPublicPlanPrice(plan.yearlySavingAmount, locale);
                const ctaHref = getPublicPlanCtaHref(
                  plan.planCode,
                  plan.billingInterval,
                  isAuthenticated
                );
                const accent = plan.planCode === 'personal';

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-[2rem] p-6 ${
                      isDark
                        ? `border ${accent ? 'border-cyan-300/70 bg-gradient-to-b from-cyan-400/10 to-white/5 shadow-[0_20px_50px_rgba(2,12,32,0.22)]' : 'border-white/10 bg-white/5'}`
                        : `card-elevated ${accent ? 'border-accent border-2' : ''}`
                    }`}
                  >
                    {accent ? (
                      <span className={`absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-700 ${
                        isDark ? 'bg-cyan-300 text-slate-950' : 'bg-accent text-accent-foreground'
                      }`}>
                        {t('home.pricing.mostPopular')}
                      </span>
                    ) : null}
                    <div className="mb-5">
                      <h2 className={`text-lg font-700 ${isDark ? 'text-white' : 'text-foreground'}`}>{plan.planName}</h2>
                      <div className="mt-3 flex items-baseline gap-1">
                        <span className={`text-3xl font-800 ${isDark ? 'text-white' : 'text-foreground'}`}>
                          {priceText || t('home.pricing.freePrice')}
                        </span>
                        <span className={isDark ? 'text-sm text-slate-300' : 'text-sm text-muted-foreground'}>
                          {plan.billingInterval === 'yearly'
                            ? t('home.pricing.perYear')
                            : plan.billingInterval === 'monthly'
                              ? t('home.pricing.perMonth')
                              : t(`home.pricing.intervals.${plan.billingInterval}`)}
                        </span>
                      </div>
                      {plan.billingInterval === 'yearly' ? (
                        <div className="mt-3 space-y-1.5">
                          {plan.yearlyDiscountPercent > 0 ? (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-700 ${
                              isDark ? 'bg-emerald-400/15 text-emerald-300' : 'bg-positive-soft text-positive'
                            }`}>
                              {t('home.pricing.savePercent', { percent: plan.yearlyDiscountPercent })}
                            </span>
                          ) : null}
                          <p className={isDark ? 'text-sm text-slate-300' : 'text-sm text-muted-foreground'}>
                            {t('home.pricing.equivalentPerMonth', { amount: equivalentMonthlyText })}
                          </p>
                          {plan.yearlySavingAmount > 0 ? (
                            <p className={isDark ? 'text-sm font-600 text-emerald-300' : 'text-sm font-600 text-positive'}>
                              {t('home.pricing.saveAmountPerYear', { amount: yearlySavingText })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {plan.description ? (
                        <p className={isDark ? 'mt-3 text-sm text-slate-300' : 'mt-3 text-sm text-muted-foreground'}>{plan.description}</p>
                      ) : null}
                    </div>
                    <ul className="space-y-2.5 mb-6 flex-1">
                      {featureRows.map((feature) => (
                        <li key={feature} className={`flex items-center gap-2 text-sm ${isDark ? 'text-slate-200' : 'text-muted-foreground'}`}>
                          <CheckCircle2 size={14} className={`${isDark ? 'text-emerald-300' : 'text-positive'} flex-shrink-0`} />
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={ctaHref}
                      onClick={() =>
                        trackMarketingEvent('plan_selected', {
                          plan_code: plan.planCode,
                          billing_interval: plan.billingInterval,
                          authenticated: isAuthenticated,
                        })
                      }
                      className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-600 transition-all ${
                        isDark
                          ? accent
                            ? 'bg-cyan-300 text-slate-950 hover:bg-cyan-200'
                            : 'border border-white/15 bg-white/5 text-white hover:bg-white/10'
                          : accent
                            ? 'btn-primary'
                            : 'btn-secondary'
                      }`}
                    >
                      {isAuthenticated ? t('home.pricing.managePlanCta') : t('home.pricing.guestPlanCta')}
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                );
              })}
        </div>
        {freeTrialPlan?.trialDurationDays ? (
          <p className={`mt-8 text-center text-sm ${isDark ? 'text-slate-300' : 'text-muted-foreground'}`}>
            {t('home.pricing.trialHint', {
              days: freeTrialPlan.trialDurationDays,
              planName: freeTrialPlan.planName,
            })}
          </p>
        ) : null}
        {isAuthenticated && billing && !billing.providerConfigured ? (
          <p className={`mt-3 text-center text-sm ${isDark ? 'text-slate-300' : 'text-muted-foreground'}`}>
            {billing.contactEmail
              ? t('home.pricing.providerUnavailable', { email: billing.contactEmail })
              : t('home.pricing.providerUnavailableNoEmail')}
          </p>
        ) : null}
        {showViewDetailsLink ? (
          <div className="text-center mt-4">
            <Link
              href="/home#pricing"
              className={`inline-flex items-center gap-1.5 text-sm font-600 ${isDark ? 'text-cyan-300 hover:text-cyan-200' : 'text-accent hover:underline'}`}
            >
              {t('home.pricing.viewDetails')} <ArrowRight size={14} />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
