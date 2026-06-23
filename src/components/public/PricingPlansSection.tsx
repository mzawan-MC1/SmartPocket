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
    t('home.pricing.features.receiptIntelligence', {
      count: plan.monthlyReceiptExtractions,
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
}: {
  sectionId?: string;
  showViewDetailsLink?: boolean;
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
    <section id={sectionId} className="scroll-mt-28 py-20 px-4 bg-card/50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-800 text-foreground mb-4">
            {t('home.sections.pricingTitle')}
          </h2>
          <p className="text-muted-foreground">{t('home.pricing.subtitle')}</p>
        </div>
        {availableIntervals.length > 1 ? (
          <div className="mb-8 flex justify-center">
            <div className="inline-flex rounded-2xl border border-border bg-secondary/40 p-1">
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
                        ? 'bg-card text-foreground shadow-sm'
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plansLoading
            ? Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="card-elevated p-6 flex flex-col animate-pulse">
                  <div className="h-6 w-24 rounded bg-secondary" />
                  <div className="mt-4 h-10 w-28 rounded bg-secondary" />
                  <div className="mt-6 space-y-2">
                    <div className="h-4 rounded bg-secondary" />
                    <div className="h-4 rounded bg-secondary" />
                    <div className="h-4 rounded bg-secondary" />
                    <div className="h-4 rounded bg-secondary" />
                  </div>
                  <div className="mt-6 h-11 rounded bg-secondary" />
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
                    className={`card-elevated p-6 relative flex flex-col ${accent ? 'border-accent border-2' : ''}`}
                  >
                    {accent ? (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-700 bg-accent text-accent-foreground px-3 py-1 rounded-full">
                        {t('home.pricing.mostPopular')}
                      </span>
                    ) : null}
                    <div className="mb-5">
                      <h2 className="text-lg font-700 text-foreground">{plan.planName}</h2>
                      <div className="mt-3 flex items-baseline gap-1">
                        <span className="text-3xl font-800 text-foreground">
                          {priceText || t('home.pricing.freePrice')}
                        </span>
                        <span className="text-sm text-muted-foreground">
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
                            <span className="inline-flex rounded-full bg-positive-soft px-2.5 py-1 text-xs font-700 text-positive">
                              {t('home.pricing.savePercent', { percent: plan.yearlyDiscountPercent })}
                            </span>
                          ) : null}
                          <p className="text-sm text-muted-foreground">
                            {t('home.pricing.equivalentPerMonth', { amount: equivalentMonthlyText })}
                          </p>
                          {plan.yearlySavingAmount > 0 ? (
                            <p className="text-sm font-600 text-positive">
                              {t('home.pricing.saveAmountPerYear', { amount: yearlySavingText })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {plan.description ? (
                        <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                      ) : null}
                    </div>
                    <ul className="space-y-2.5 mb-6 flex-1">
                      {featureRows.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 size={14} className="text-positive flex-shrink-0" />
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
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-600 transition-all ${accent ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {isAuthenticated ? t('home.pricing.managePlanCta') : t('home.pricing.guestPlanCta')}
                      <ArrowRight size={14} />
                    </Link>
                  </div>
                );
              })}
        </div>
        {freeTrialPlan?.trialDurationDays ? (
          <p className="text-center text-sm text-muted-foreground mt-8">
            {t('home.pricing.trialHint', {
              days: freeTrialPlan.trialDurationDays,
              planName: freeTrialPlan.planName,
            })}
          </p>
        ) : null}
        {isAuthenticated && billing && !billing.providerConfigured ? (
          <p className="text-center text-sm text-muted-foreground mt-3">
            {billing.contactEmail
              ? t('home.pricing.providerUnavailable', { email: billing.contactEmail })
              : t('home.pricing.providerUnavailableNoEmail')}
          </p>
        ) : null}
        {showViewDetailsLink ? (
          <div className="text-center mt-4">
            <Link href="/home#pricing" className="inline-flex items-center gap-1.5 text-sm font-600 text-accent hover:underline">
              {t('home.pricing.viewDetails')} <ArrowRight size={14} />
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
