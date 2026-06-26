'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  AlertTriangle,
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
import AiTopUpPurchaseSection from '@/components/subscription/AiTopUpPurchaseSection';
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
import { trackMarketingEvent } from '@/lib/analytics';
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
      value: plan.receiptIntelligenceEnabled
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

      trackMarketingEvent('checkout_started', {
        plan_code: plan.planCode,
        billing_interval: plan.billingInterval,
      });
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
          compact
          className="mb-4"
          actionsClassName="flex items-center justify-end"
          actions={
            <button
              type="button"
              onClick={() => void load()}
              className="btn-secondary h-10 px-3"
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
          <div className="space-y-4">
            <SectionCard
              className="overflow-hidden"
              bodyClassName="p-0"
            >
              <div className="border-b border-border/70 bg-muted/20 px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="text-sm font-800 text-foreground">
                      {t('subscriptionBilling.currentPlanTitle', { ns: 'portal' })}
                    </p>
                    {summary ? (
                      <StatusBadge
                        status={getBadgeTone(summary.status)}
                        label={getSummaryStatusLabel(summary, t)}
                      />
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('subscriptionBilling.currentPlanDescription', { ns: 'portal' })}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.15fr_1fr_0.9fr]">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">
                        {t('subscriptionBilling.currentPlan', { ns: 'portal' })}
                      </p>
                      <p className="mt-1 truncate text-base font-800 text-foreground">
                        {summary?.planName || t('subscriptionBilling.noPlan', { ns: 'portal' })}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-700 text-foreground">
                          {summary?.billingInterval
                            ? t(`subscriptionBilling.intervals.${summary.billingInterval}`, { ns: 'portal' })
                            : t('subscriptionBilling.notApplicable', { ns: 'portal' })}
                        </span>
                        {typeof summary?.priceAmount === 'number' && summary.priceAmount > 0 ? (
                          <span dir="ltr" className="text-sm font-800 text-foreground">
                            {formatPlanPrice(summary.priceAmount, locale, currencies)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <dl className="grid gap-2 rounded-2xl border border-border/70 bg-card px-3 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('subscriptionBilling.billingPeriod', { ns: 'portal' })}</dt>
                      <dd className="font-700 text-foreground">
                        {currentPeriodText || t('subscriptionBilling.notApplicable', { ns: 'portal' })}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('subscriptionBilling.trialEnds', { ns: 'portal' })}</dt>
                      <dd className="font-700 text-foreground">
                        {trialEndText || t('subscriptionBilling.notApplicable', { ns: 'portal' })}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('subscriptionBilling.renewalDate', { ns: 'portal' })}</dt>
                      <dd className="font-700 text-foreground">
                        {formatDate(summary?.currentPeriodEnd, locale) || t('subscriptionBilling.notApplicable', { ns: 'portal' })}
                      </dd>
                    </div>
                    {typeof summary?.trialDaysRemaining === 'number' ? (
                      <div className="flex items-center justify-between gap-3">
                        <dt className="text-muted-foreground">{t('subscriptionBilling.status.trialing', { ns: 'portal' })}</dt>
                        <dd className="text-xs font-700 text-muted-foreground">
                          {summary.trialDaysRemaining > 0
                            ? t('subscriptionBilling.trialDaysRemaining', { ns: 'portal', count: summary.trialDaysRemaining })
                            : t('subscriptionBilling.trialExpired', { ns: 'portal' })}
                        </dd>
                      </div>
                    ) : null}
                    {summary?.cancelAtPeriodEnd ? (
                      <div className="pt-1 text-xs font-700 text-warning">
                        {t('subscriptionBilling.cancelAtPeriodEnd', { ns: 'portal' })}
                      </div>
                    ) : null}
                  </dl>
                </div>

                <div className="rounded-3xl border border-border/70 bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-accent" />
                      <p className="text-sm font-800 text-foreground">
                        {t('subscriptionBilling.usageTitle', { ns: 'portal' })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 space-y-3">
                    {[
                      {
                        label: t('subscriptionBilling.features.textAi', { ns: 'portal' }),
                        used: summary?.requestsToday ?? 0,
                        total: summary?.dailyAiRequestLimit ?? 0,
                        disabled: false,
                      },
                      {
                        label: t('subscriptionBilling.features.voiceAi', { ns: 'portal' }),
                        used: Math.round((summary?.voiceSecondsUsed ?? 0) / 60),
                        total: Math.round((summary?.monthlyVoiceSeconds ?? 0) / 60),
                        disabled: false,
                      },
                      {
                        label: t('subscriptionBilling.features.receiptIntelligence', { ns: 'portal' }),
                        used: (summary?.receiptExtractionsUsed ?? 0) + (summary?.receiptExtractionsReserved ?? 0),
                        total: summary?.receiptIntelligenceEnabled ? (summary?.receiptExtractionsIncluded ?? 0) : 0,
                        disabled: !summary?.receiptIntelligenceEnabled,
                      },
                    ].map((metric) => {
                      const ratio = metric.total > 0 ? Math.min(1, Math.max(0, metric.used / metric.total)) : 0;
                      return (
                        <div key={metric.label} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="font-600 text-foreground">{metric.label}</span>
                            {metric.disabled ? (
                              <span className="font-800 text-muted-foreground">
                                {t('subscriptionBilling.disabled', { ns: 'portal' })}
                              </span>
                            ) : (
                              <span className="font-800 text-foreground">
                                {metric.used} / {metric.total}
                              </span>
                            )}
                          </div>
                          {!metric.disabled ? (
                            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary/60">
                              <div
                                className="h-full rounded-full bg-accent transition-[width]"
                                style={{ width: `${Math.round(ratio * 100)}%` }}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-3xl border border-border/70 bg-card p-4">
                  <p className="text-sm font-800 text-foreground">{t('subscriptionBilling.manageSubscription', { ns: 'portal' })}</p>

                  <div className="mt-4 space-y-2">
                    {billing?.supportsCustomerPortal ? (
                      <button
                        type="button"
                        onClick={handlePortal}
                        disabled={portalBusy}
                        className="btn-primary w-full justify-center"
                      >
                        {portalBusy ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />}
                        {t('subscriptionBilling.manageSubscription', { ns: 'portal' })}
                      </button>
                    ) : null}

                    {billing?.supportsCancellation && !summary?.cancelAtPeriodEnd ? (
                      <button
                        type="button"
                        onClick={handleCancel}
                        disabled={cancelBusy}
                        className="btn-secondary w-full justify-center"
                      >
                        {cancelBusy ? <Loader2 size={15} className="animate-spin" /> : <Calendar size={15} />}
                        {t('subscriptionBilling.cancelAtPeriodEndAction', { ns: 'portal' })}
                      </button>
                    ) : null}

                    {billing?.supportsCancellation && summary?.cancelAtPeriodEnd ? (
                      <button
                        type="button"
                        onClick={handleResume}
                        disabled={resumeBusy}
                        className="btn-secondary w-full justify-center"
                      >
                        {resumeBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                        {t('subscriptionBilling.resumeSubscription', { ns: 'portal' })}
                      </button>
                    ) : null}

                    {!billing?.supportsCustomerPortal && !billing?.supportsCancellation ? (
                      <div className="rounded-2xl border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                        {t('subscriptionBilling.checkoutUnavailable', { ns: 'portal' })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </SectionCard>

            <AiTopUpPurchaseSection summary={summary} />

            {!billing?.providerConfigured ? (
              <div className="rounded-3xl border border-warning/30 bg-warning-soft/20 px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-warning-soft text-warning ring-1 ring-warning/20">
                    <AlertTriangle size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-800 text-foreground">
                      {t('subscriptionBilling.checkoutUnavailable', { ns: 'portal' })}
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {billing?.contactEmail
                        ? t('subscriptionBilling.contactSupportToUpgrade', {
                            ns: 'portal',
                            email: billing.contactEmail,
                          })
                        : t('subscriptionBilling.contactSupportGeneric', { ns: 'portal' })}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            <SectionCard
              title={t('subscriptionBilling.choosePlan', { ns: 'portal' })}
              description={t('subscriptionBilling.choosePlanDescription', { ns: 'portal' })}
              action={availableIntervals.length > 1 ? (
                <div className="inline-flex rounded-full border border-border bg-secondary/50 p-1">
                  {(['monthly', 'yearly'] as const).map((interval) => {
                    const supported = availableIntervals.includes(interval);
                    const active = selectedInterval === interval;
                    return (
                      <button
                        key={interval}
                        type="button"
                        onClick={() => supported && setSelectedInterval(interval)}
                        disabled={!supported}
                        className={`relative inline-flex min-w-[8.5rem] items-center justify-center rounded-full px-4 py-2 text-sm font-800 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 ${
                          active
                            ? 'bg-accent text-white shadow-sm ring-1 ring-accent/40'
                            : 'text-muted-foreground hover:bg-card/70 hover:text-foreground'
                        } ${!supported ? 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground' : ''}`}
                      >
                        {t(`subscriptionBilling.intervals.${interval}`, { ns: 'portal' })}
                      </button>
                    );
                  })}
                </div>
              ) : undefined}
              className="overflow-hidden"
            >
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
                      className={`group relative flex h-full flex-col rounded-3xl border bg-card p-5 shadow-card-sm transition-shadow ${
                        highlightedPlanCode === plan.planCode
                          ? 'border-accent ring-2 ring-accent/15'
                          : 'border-border'
                      } ${plan.planCode === 'personal' ? 'bg-accent/5 hover:shadow-card-md' : 'hover:shadow-card-md'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-lg font-900 text-foreground">{plan.planName}</h2>
                            {isCurrentPlan ? (
                              <StatusBadge status="success" label={t('subscriptionBilling.currentPlan', { ns: 'portal' })} />
                            ) : null}
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {plan.description || t('subscriptionBilling.noDescription', { ns: 'portal' })}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-800 text-muted-foreground">
                            {t(`subscriptionBilling.intervals.${plan.billingInterval}`, { ns: 'portal' })}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4">
                        <p dir="ltr" className="text-3xl font-900 tracking-tight text-foreground">
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
                          <div className="mt-3 rounded-2xl border border-positive/20 bg-positive-soft/20 px-3 py-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              {plan.yearlyDiscountPercent > 0 ? (
                                <span className="inline-flex rounded-full bg-positive-soft px-2.5 py-1 text-xs font-800 text-positive">
                                  {t('subscriptionBilling.savePercent', {
                                    ns: 'portal',
                                    percent: plan.yearlyDiscountPercent,
                                  })}
                                </span>
                              ) : null}
                              {plan.yearlySavingAmount > 0 ? (
                                <span dir="ltr" className="text-sm font-800 text-positive">
                                  {t('subscriptionBilling.saveAmountPerYear', {
                                    ns: 'portal',
                                    amount: yearlySavingText,
                                  })}
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-sm font-600 text-foreground">
                              {t('subscriptionBilling.equivalentPerMonth', {
                                ns: 'portal',
                                amount: equivalentMonthlyText,
                              })}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 space-y-2">
                        <ul className="space-y-2">
                          {featureList.map((feature) => {
                            const disabled = feature.value === t('subscriptionBilling.disabled', { ns: 'portal' });
                            return (
                              <li key={feature.id} className="flex items-start justify-between gap-3 rounded-2xl bg-secondary/25 px-3 py-2.5">
                                <div className="flex min-w-0 items-start gap-2">
                                  <CheckCircle2 size={16} className={disabled ? 'mt-0.5 text-muted-foreground/50' : 'mt-0.5 text-positive'} />
                                  <div className="min-w-0">
                                    <p className={`text-sm font-700 ${disabled ? 'text-muted-foreground' : 'text-foreground'}`}>
                                      {feature.label}
                                    </p>
                                    <p className={`text-sm ${disabled ? 'text-muted-foreground' : 'text-muted-foreground'}`}>
                                      {feature.value}
                                    </p>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                        </ul>

                        {plan.featureLimits.length > 0 ? (
                          <div className="rounded-2xl border border-border/70 bg-card px-3 py-2.5">
                            {plan.featureLimits.map((limit) => (
                              <div key={limit.featureKey} className="flex items-center justify-between gap-3 py-1 text-sm">
                                <span className="text-muted-foreground">{limit.featureKey}</span>
                                <span className="font-700 text-foreground">{limit.featureValue}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-5 flex flex-1 items-end">
                        <button
                          type="button"
                          onClick={() => void handleCheckout(plan)}
                          disabled={isCurrentPlan || busyPlanId === plan.id}
                          className={`w-full justify-center ${isCurrentPlan ? 'btn-secondary' : 'btn-primary'}`}
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
