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
  plan: PublicSubscriptionPlan,
  locale: string,
  currencies: any[]
) {
  if (plan.priceAmount <= 0 || plan.billingInterval === 'none') {
    return null;
  }

  return formatCurrencyText(plan.priceAmount, {
    currencyCode: 'AED',
    currencies,
    locale,
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

  const currencies = referenceData?.snapshot?.currencies ?? [];
  const highlightedPlanId = searchParams.get('plan');

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

  const currentPlan = plans.find((plan) => plan.id === summary?.planId) || null;
  const currentPlanPrice = currentPlan?.priceAmount ?? 0;
  const currentPeriodText = formatDateRange(summary?.currentPeriodStart, summary?.currentPeriodEnd, locale);
  const trialEndText = formatDate(summary?.trialEndsAt, locale);

  const handleCheckout = async (plan: PublicSubscriptionPlan) => {
    if (!billing) return;

    if (!billing.providerConfigured) {
      if (billing.contactEmail) {
        window.location.href = `mailto:${billing.contactEmail}`;
      } else {
        router.push('/contact');
      }
      return;
    }

    setBusyPlanId(plan.id);
    try {
      const response = await createBillingCheckoutSession(plan.id, plan.billingInterval as SupportedBillingInterval);
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
              <div className="grid gap-4 xl:grid-cols-3 md:grid-cols-2">
                {plans.map((plan) => {
                  const isCurrentPlan = summary?.planId === plan.id && summary?.billingInterval === plan.billingInterval;
                  const isUpgrade = plan.priceAmount >= currentPlanPrice;
                  const priceText = formatPlanPrice(plan, locale, currencies);
                  const featureList = featureRows(plan, t);

                  return (
                    <div
                      key={plan.id}
                      className={`flex h-full flex-col rounded-3xl border bg-card p-5 shadow-card-sm ${
                        highlightedPlanId === plan.id
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
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-700 text-muted-foreground">
                          {t(`subscriptionBilling.intervals.${plan.billingInterval}`, { ns: 'portal' })}
                        </span>
                      </div>

                      <div className="mt-4">
                        <p className="text-2xl font-800 text-foreground">
                          {priceText || t('subscriptionBilling.freePrice', { ns: 'portal' })}
                        </p>
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
