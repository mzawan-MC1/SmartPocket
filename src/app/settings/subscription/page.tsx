'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { useLanguage } from '@/contexts/LanguageContext';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { formatCurrencyText } from '@/lib/currency-formatting';
import { getIntlLocale } from '@/lib/locale';
import {
  getPlanForInterval,
  groupPlansByFamily,
  isSelectablePaidInterval,
} from '@/lib/subscription/pricing';
import {
  cancelBillingSubscription,
  createBillingCheckoutSession,
  fetchSubscriptionPlans,
  fetchSubscriptionSummary,
  openBillingPortal,
  resumeBillingSubscription,
} from '@/lib/subscription/client';
import type {
  BillingAvailability,
  PublicSubscriptionPlan,
  SubscriptionSummary,
  SupportedBillingInterval,
} from '@/lib/subscription/types';

function formatPlanPrice(
  amount: number,
  locale: string,
  currencies: any[]
) {
  if (amount <= 0) {
    return null;
  }

  return formatCurrencyText(amount, {
    currencyCode: 'AED',
    currencies,
    locale,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatDateRange(start: string | null | undefined, end: string | null | undefined, locale: string) {
  const startText = formatDate(start, locale);
  const endText = formatDate(end, locale);
  if (!startText && !endText) return null;
  if (!startText) return endText;
  if (!endText) return startText;
  return `${startText} - ${endText}`;
}

function getSummaryStatusLabel(summary: SubscriptionSummary, t: (key: string, options?: Record<string, unknown>) => string) {
  switch (summary.status) {
    case 'trialing':
      return t('subscriptionBilling.status.trialing', { ns: 'portal' });
    case 'active':
      return t('subscriptionBilling.status.active', { ns: 'portal' });
    case 'expired':
      return t('subscriptionBilling.status.expired', { ns: 'portal' });
    case 'past_due':
      return t('subscriptionBilling.status.pastDue', { ns: 'portal' });
    case 'cancelled':
      return t('subscriptionBilling.status.cancelled', { ns: 'portal' });
    case 'paused':
      return t('subscriptionBilling.status.paused', { ns: 'portal' });
    default:
      return t('status.inactive', { ns: 'common' });
  }
}

function getBadgeTone(status: SubscriptionSummary['status']): 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'active':
      return 'success';
    case 'trialing':
      return 'info';
    case 'past_due':
    case 'paused':
      return 'warning';
    case 'expired':
    case 'cancelled':
      return 'error';
    default:
      return 'info';
  }
}

function featureRows(plan: PublicSubscriptionPlan, t: (key: string, options?: Record<string, unknown>) => string) {
  return [
    {
      id: 'text-ai',
      label: t('subscriptionBilling.features.textAi', { ns: 'portal' }),
      value: plan.textAiEnabled
        ? t('subscriptionBilling.features.textAiValue', {
            ns: 'portal',
            credits: plan.monthlyAiCredits,
            requests: plan.dailyAiRequestLimit,
          })
        : t('subscriptionBilling.disabled', { ns: 'portal' }),
    },
    {
      id: 'voice-ai',
      label: t('subscriptionBilling.features.voiceAi', { ns: 'portal' }),
      value: plan.voiceAiEnabled
        ? t('subscriptionBilling.features.voiceAiValue', {
            ns: 'portal',
            minutes: Math.round(plan.monthlyVoiceSeconds / 60),
          })
        : t('subscriptionBilling.disabled', { ns: 'portal' }),
    },
    {
      id: 'receipt-ai',
      label: t('subscriptionBilling.features.receiptIntelligence', { ns: 'portal' }),
      value: plan.monthlyReceiptExtractions > 0
        ? t('subscriptionBilling.features.receiptAiValue', {
            ns: 'portal',
            count: plan.monthlyReceiptExtractions,
          })
        : t('subscriptionBilling.disabled', { ns: 'portal' }),
    },
    {
      id: 'ai-history',
      label: t('subscriptionBilling.features.aiHistory', { ns: 'portal' }),
      value: plan.aiHistoryEnabled
        ? t('subscriptionBilling.enabledWithDays', {
            ns: 'portal',
            count: plan.aiHistoryRetentionDays,
          })
        : t('subscriptionBilling.disabled', { ns: 'portal' }),
    },
    {
      id: 'managed-people',
      label: t('subscriptionBilling.features.managedPeople', { ns: 'portal' }),
      value: plan.managedPeopleEnabled
        ? t('subscriptionBilling.enabled', { ns: 'portal' })
        : t('subscriptionBilling.disabled', { ns: 'portal' }),
    },
    {
      id: 'shared-spaces',
      label: t('subscriptionBilling.features.sharedSpaces', { ns: 'portal' }),
      value: plan.sharedSpacesEnabled
        ? t('subscriptionBilling.enabled', { ns: 'portal' })
        : t('subscriptionBilling.disabled', { ns: 'portal' }),
    },
  ];
}

export default function SubscriptionSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const { data: referenceData } = useClientReferenceData();
  const [loading, setLoading] = React.useState(true);
  const [plans, setPlans] = React.useState<PublicSubscriptionPlan[]>([]);
  const [summary, setSummary] = React.useState<SubscriptionSummary | null>(null);
  const [billing, setBilling] = React.useState<BillingAvailability | null>(null);
  const [busyPlanId, setBusyPlanId] = React.useState<string | null>(null);
  const [portalBusy, setPortalBusy] = React.useState(false);
  const [cancelBusy, setCancelBusy] = React.useState(false);
  const [resumeBusy, setResumeBusy] = React.useState(false);
  const [selectedInterval, setSelectedInterval] = React.useState<SupportedBillingInterval>('monthly');
  const intervalInitializedRef = React.useRef(false);

  const currencies = referenceData?.snapshot?.currencies ?? [];
  const highlightedPlanCode = searchParams.get('plan');
  const requestedInterval = searchParams.get('interval');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [plansPayload, summaryPayload] = await Promise.all([
        fetchSubscriptionPlans(),
        fetchSubscriptionSummary(),
      ]);

      setPlans(plansPayload.plans);
      setBilling(summaryPayload?.billing || plansPayload.billing);
      setSummary(summaryPayload?.summary || null);
    } catch {
      toast.error(t('subscriptionBilling.loadFailed', { ns: 'portal' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const availableIntervals = React.useMemo(() => {
    return Array.from(new Set(
      plans
        .filter((plan) => plan.isActive && plan.planCode !== 'free_trial' && isSelectablePaidInterval(plan.billingInterval))
        .map((plan) => plan.billingInterval)
    )) as SupportedBillingInterval[];
  }, [plans]);

  React.useEffect(() => {
    if (intervalInitializedRef.current) {
      return;
    }

    if (availableIntervals.length === 0) {
      return;
    }

    const requested = requestedInterval === 'yearly' || requestedInterval === 'monthly'
      ? requestedInterval
      : null;

    const nextInterval = requested && availableIntervals.includes(requested)
      ? requested
      : summary?.billingInterval && (summary.billingInterval === 'monthly' || summary.billingInterval === 'yearly')
        && availableIntervals.includes(summary.billingInterval)
        ? summary.billingInterval
        : availableIntervals.includes('monthly')
          ? 'monthly'
          : availableIntervals[0] || 'monthly';

    intervalInitializedRef.current = true;
    setSelectedInterval(nextInterval);
  }, [availableIntervals, requestedInterval, summary?.billingInterval]);

  React.useEffect(() => {
    if (availableIntervals.length === 0) {
      return;
    }

    if (availableIntervals.includes(selectedInterval)) {
      return;
    }

    const fallback = availableIntervals.includes('monthly')
      ? 'monthly'
      : availableIntervals[0] || 'monthly';

    if (fallback !== selectedInterval) {
      setSelectedInterval(fallback);
    }
  }, [availableIntervals, selectedInterval]);

  const currentPlan = plans.find((plan) => plan.id === summary?.planId) || null;
  const currentPlanPrice = currentPlan?.priceAmount ?? 0;
  const currentPeriodText = formatDateRange(summary?.currentPeriodStart, summary?.currentPeriodEnd, locale);
  const trialEndText = formatDate(summary?.trialEndsAt, locale);
  const planFamilies = groupPlansByFamily(plans.filter((plan) => plan.isActive));
  const visiblePlans = Object.values(planFamilies)
    .map((familyPlans) => {
      const freeTrialPlan = familyPlans.find((plan) => plan.planCode === 'free_trial') || null;
      return freeTrialPlan || getPlanForInterval(familyPlans, selectedInterval);
    })
    .filter((plan): plan is PublicSubscriptionPlan => Boolean(plan));

  const handleCheckout = async (plan: PublicSubscriptionPlan) => {
    if (!billing) return;

    if (!billing.providerConfigured) {
      if (billing.contactEmail) {
        const intervalLabel = t(`subscriptionBilling.intervals.${plan.billingInterval}`, { ns: 'portal' });
        const mailtoUrl = new URL(`mailto:${billing.contactEmail}`);
        mailtoUrl.searchParams.set('subject', `Smart Pocket ${plan.planName} ${intervalLabel}`);
        mailtoUrl.searchParams.set('body', `Plan: ${plan.planName}\nPlan code: ${plan.planCode}\nBilling interval: ${intervalLabel}`);
        window.location.href = mailtoUrl.toString();
      } else {
        router.push(`/contact?plan=${encodeURIComponent(plan.planCode)}&interval=${encodeURIComponent(plan.billingInterval)}`);
      }
      return;
    }

    setBusyPlanId(plan.id);
    try {
      const response = await createBillingCheckoutSession(plan.planCode, plan.billingInterval as SupportedBillingInterval);
      if (!response.ok || !response.checkoutUrl) {
        toast.error(t(`subscriptionBilling.errors.${response.error?.code || 'checkout_creation_failed'}`, {
          ns: 'portal',
          defaultValue: response.error?.message || t('subscriptionBilling.checkoutUnavailable', { ns: 'portal' }),
        }));
        return;
      }

      window.location.href = response.checkoutUrl;
    } catch {
      toast.error(t('subscriptionBilling.checkoutUnavailable', { ns: 'portal' }));
    } finally {
      setBusyPlanId(null);
    }
  };

  const handlePortal = async () => {
    setPortalBusy(true);
    try {
      const response = await openBillingPortal();
      if (!response.ok || !response.portalUrl) {
        toast.error(t(`subscriptionBilling.errors.${response.error?.code || 'billing_provider_unavailable'}`, {
          ns: 'portal',
          defaultValue: response.error?.message || t('subscriptionBilling.checkoutUnavailable', { ns: 'portal' }),
        }));
        return;
      }

      window.location.href = response.portalUrl;
    } catch {
      toast.error(t('subscriptionBilling.checkoutUnavailable', { ns: 'portal' }));
    } finally {
      setPortalBusy(false);
    }
  };

  const handleCancel = async () => {
    setCancelBusy(true);
    try {
      const response = await cancelBillingSubscription();
      if (!response.ok) {
        toast.error(t(`subscriptionBilling.errors.${response.error?.code || 'subscription_not_found'}`, {
          ns: 'portal',
          defaultValue: response.error?.message || t('subscriptionBilling.cancelFailed', { ns: 'portal' }),
        }));
        return;
      }

      toast.success(t('subscriptionBilling.cancelRequested', { ns: 'portal' }));
      await load();
    } catch {
      toast.error(t('subscriptionBilling.cancelFailed', { ns: 'portal' }));
    } finally {
      setCancelBusy(false);
    }
  };

  const handleResume = async () => {
    setResumeBusy(true);
    try {
      const response = await resumeBillingSubscription();
      if (!response.ok) {
        toast.error(t(`subscriptionBilling.errors.${response.error?.code || 'subscription_not_found'}`, {
          ns: 'portal',
          defaultValue: response.error?.message || t('subscriptionBilling.resumeFailed', { ns: 'portal' }),
        }));
        return;
      }

      toast.success(t('subscriptionBilling.resumeRequested', { ns: 'portal' }));
      await load();
    } catch {
      toast.error(t('subscriptionBilling.resumeFailed', { ns: 'portal' }));
    } finally {
      setResumeBusy(false);
    }
  };

  return (
    <AppLayout activeRoute="/settings">
      <div className="page-section page-shell-readable">
        <PageHeader
          title={t('subscriptionBilling.title', { ns: 'portal' })}
          description={t('subscriptionBilling.description', { ns: 'portal' })}
          badge={<StatusBadge status="info" label={t('subscriptionBilling.badge', { ns: 'portal' })} />}
          actions={
            <button
              type="button"
              onClick={() => void load()}
              className="btn-secondary"
              disabled={loading}
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
              {t('actions.refresh', { ns: 'common' })}
            </button>
          }
        />

        {loading ? (
          <SectionCard bodyClassName="py-12">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              {t('status.loading', { ns: 'common' })}
            </div>
          </SectionCard>
        ) : (
          <div className="space-y-6">
            <SectionCard
              title={t('subscriptionBilling.currentPlanTitle', { ns: 'portal' })}
              description={t('subscriptionBilling.currentPlanDescription', { ns: 'portal' })}
              action={summary ? (
                <StatusBadge
                  status={getBadgeTone(summary.status)}
                  label={getSummaryStatusLabel(summary, t)}
                />
              ) : undefined}
            >
              <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                      {t('subscriptionBilling.currentPlan', { ns: 'portal' })}
                    </p>
                    <p className="mt-2 text-lg font-800 text-foreground">
                      {summary?.planName || t('subscriptionBilling.noPlan', { ns: 'portal' })}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {summary?.billingInterval
                        ? t(`subscriptionBilling.intervals.${summary.billingInterval}`, { ns: 'portal' })
                        : t('subscriptionBilling.notApplicable', { ns: 'portal' })}
                    </p>
                    {typeof summary?.priceAmount === 'number' && summary.priceAmount > 0 ? (
                      <p className="mt-2 text-sm font-700 text-foreground">
                        {formatPlanPrice(summary.priceAmount, locale, currencies)}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                      {t('subscriptionBilling.billingPeriod', { ns: 'portal' })}
                    </p>
                    <p className="mt-2 text-sm font-700 text-foreground">
                      {currentPeriodText || t('subscriptionBilling.notApplicable', { ns: 'portal' })}
                    </p>
                    {summary?.cancelAtPeriodEnd ? (
                      <p className="mt-2 text-xs text-warning">
                        {t('subscriptionBilling.cancelAtPeriodEnd', { ns: 'portal' })}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                      {t('subscriptionBilling.trialEnds', { ns: 'portal' })}
                    </p>
                    <p className="mt-2 text-sm font-700 text-foreground">
                      {trialEndText || t('subscriptionBilling.notApplicable', { ns: 'portal' })}
                    </p>
                    {typeof summary?.trialDaysRemaining === 'number' ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {summary.trialDaysRemaining > 0
                          ? t('subscriptionBilling.trialDaysRemaining', { ns: 'portal', count: summary.trialDaysRemaining })
                          : t('subscriptionBilling.trialExpired', { ns: 'portal' })}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <p className="text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                      {t('subscriptionBilling.renewalDate', { ns: 'portal' })}
                    </p>
                    <p className="mt-2 text-sm font-700 text-foreground">
                      {formatDate(summary?.currentPeriodEnd, locale) || t('subscriptionBilling.notApplicable', { ns: 'portal' })}
                    </p>
                  </div>
                </div>

                <div className="rounded-3xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={16} className="text-accent" />
                    <p className="text-sm font-800 text-foreground">
                      {t('subscriptionBilling.usageTitle', { ns: 'portal' })}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      {
                        label: t('subscriptionBilling.features.textAi', { ns: 'portal' }),
                        used: summary?.requestsToday ?? 0,
                        total: summary?.dailyAiRequestLimit ?? 0,
                      },
                      {
                        label: t('subscriptionBilling.features.voiceAi', { ns: 'portal' }),
                        used: Math.round((summary?.voiceSecondsUsed ?? 0) / 60),
                        total: Math.round((summary?.monthlyVoiceSeconds ?? 0) / 60),
                      },
                      {
                        label: t('subscriptionBilling.features.receiptIntelligence', { ns: 'portal' }),
                        used: summary?.receiptExtractionsUsed ?? 0,
                        total: summary?.receiptExtractionsIncluded ?? 0,
                      },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-2xl bg-secondary/35 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="font-600 text-foreground">{metric.label}</span>
                          <span className="font-700 text-foreground">
                            {metric.used} / {metric.total}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePortal}
                      disabled={portalBusy || !billing?.supportsCustomerPortal}
                      className="btn-secondary"
                    >
                      {portalBusy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                      {t('subscriptionBilling.manageSubscription', { ns: 'portal' })}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelBusy || !billing?.supportsCancellation || Boolean(summary?.cancelAtPeriodEnd)}
                      className="btn-secondary"
                    >
                      {cancelBusy ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />}
                      {t('subscriptionBilling.cancelAtPeriodEndAction', { ns: 'portal' })}
                    </button>
                    <button
                      type="button"
                      onClick={handleResume}
                      disabled={resumeBusy || !billing?.supportsCancellation || !summary?.cancelAtPeriodEnd}
                      className="btn-secondary"
                    >
                      {resumeBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                      {t('subscriptionBilling.resumeSubscription', { ns: 'portal' })}
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>

            {!billing?.providerConfigured ? (
              <SectionCard>
                <div className="rounded-2xl border border-warning/30 bg-warning-soft/20 p-4">
                  <p className="text-sm font-700 text-foreground">
                    {t('subscriptionBilling.checkoutUnavailable', { ns: 'portal' })}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {billing?.contactEmail
                      ? t('subscriptionBilling.contactSupportToUpgrade', {
                          ns: 'portal',
                          email: billing.contactEmail,
                        })
                      : t('subscriptionBilling.contactSupportGeneric', { ns: 'portal' })}
                  </p>
                </div>
              </SectionCard>
            ) : null}

            <SectionCard
              title={t('subscriptionBilling.choosePlan', { ns: 'portal' })}
              description={t('subscriptionBilling.choosePlanDescription', { ns: 'portal' })}
            >
              {availableIntervals.length > 1 ? (
                <div className="mb-5 flex justify-center">
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
                          {t(`subscriptionBilling.intervals.${interval}`, { ns: 'portal' })}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2">
                {visiblePlans.map((plan) => {
                  const isCurrentPlan = summary?.planCode === plan.planCode && summary?.billingInterval === plan.billingInterval;
                  const comparisonPrice = summary?.monthlyBasePriceAmount ?? currentPlan?.monthlyBasePriceAmount ?? currentPlanPrice;
                  const isUpgrade = plan.monthlyBasePriceAmount >= comparisonPrice;
                  const priceText = formatPlanPrice(plan.priceAmount, locale, currencies);
                  const featureList = featureRows(plan, t);
                  const equivalentMonthlyText = formatPlanPrice(plan.equivalentMonthlyPriceAmount, locale, currencies);
                  const yearlySavingText = formatPlanPrice(plan.yearlySavingAmount, locale, currencies);

                  return (
                    <div
                      key={plan.id}
                      className={`flex h-full flex-col rounded-3xl border bg-card p-5 shadow-card-sm ${
                        highlightedPlanCode === plan.planCode
                          ? 'border-accent ring-2 ring-accent/15'
                          : 'border-border'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-800 text-foreground">{plan.planName}</h2>
                            {isCurrentPlan ? (
                              <StatusBadge status="success" label={t('subscriptionBilling.currentPlan', { ns: 'portal' })} />
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {plan.description || t('subscriptionBilling.noDescription', { ns: 'portal' })}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-700 text-muted-foreground">
                            {t(`subscriptionBilling.intervals.${plan.billingInterval}`, { ns: 'portal' })}
                          </span>
                          {plan.billingInterval === 'yearly' && plan.yearlyDiscountPercent > 0 ? (
                            <span className="rounded-full bg-positive-soft px-2.5 py-1 text-xs font-700 text-positive">
                              {t('subscriptionBilling.savePercent', {
                                ns: 'portal',
                                percent: plan.yearlyDiscountPercent,
                              })}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4">
                        <p className="text-2xl font-800 text-foreground">
                          {priceText || t('subscriptionBilling.freePrice', { ns: 'portal' })}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {plan.billingInterval === 'yearly'
                            ? t('subscriptionBilling.billedYearly', { ns: 'portal' })
                            : plan.billingInterval === 'monthly'
                              ? t('subscriptionBilling.perMonth', { ns: 'portal' })
                              : t('subscriptionBilling.notApplicable', { ns: 'portal' })}
                        </p>
                        {plan.billingInterval === 'yearly' ? (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-sm font-600 text-foreground">
                              {t('subscriptionBilling.equivalentPerMonth', {
                                ns: 'portal',
                                amount: equivalentMonthlyText,
                              })}
                            </p>
                            {plan.yearlyDiscountPercent > 0 ? (
                              <p className="text-sm font-600 text-positive">
                                {t('subscriptionBilling.savePercent', {
                                  ns: 'portal',
                                  percent: plan.yearlyDiscountPercent,
                                })}
                              </p>
                            ) : null}
                            {plan.yearlySavingAmount > 0 ? (
                              <p className="text-sm font-600 text-positive">
                                {t('subscriptionBilling.saveAmountPerYear', {
                                  ns: 'portal',
                                  amount: yearlySavingText,
                                })}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-2">
                        {featureList.map((feature) => (
                          <div key={feature.id} className="rounded-2xl bg-secondary/35 px-3 py-2.5">
                            <p className="text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                              {feature.label}
                            </p>
                            <p className="mt-1 text-sm font-600 text-foreground">{feature.value}</p>
                          </div>
                        ))}
                        {plan.featureLimits.map((limit) => (
                          <div key={limit.featureKey} className="rounded-2xl bg-secondary/35 px-3 py-2.5">
                            <p className="text-xs font-700 uppercase tracking-[0.12em] text-muted-foreground">
                              {limit.featureKey}
                            </p>
                            <p className="mt-1 text-sm font-600 text-foreground">{limit.featureValue}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 flex flex-1 items-end">
                        <button
                          type="button"
                          onClick={() => void handleCheckout(plan)}
                          disabled={isCurrentPlan || busyPlanId === plan.id}
                          className="btn-primary w-full justify-center"
                        >
                          {busyPlanId === plan.id ? <Loader2 size={15} className="animate-spin" /> : <ArrowUpRight size={15} />}
                          {isCurrentPlan
                            ? t('subscriptionBilling.samePlanSelected', { ns: 'portal' })
                            : !summary?.hasSubscription
                              ? t('subscriptionBilling.choosePlan', { ns: 'portal' })
                              : billing?.providerConfigured
                                ? isUpgrade
                                  ? t('subscriptionBilling.upgrade', { ns: 'portal' })
                                  : t('subscriptionBilling.downgrade', { ns: 'portal' })
                                : t('subscriptionBilling.contactSupportAction', { ns: 'portal' })}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <div className="flex justify-end">
              <Link href="/settings" className="btn-secondary">
                {t('subscriptionBilling.backToSettings', { ns: 'portal' })}
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
