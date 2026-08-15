'use client';

import Link from 'next/link';
import { AlertTriangle, Lock, Loader2, Sparkles } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import { hasSubscriptionFeature } from '@/lib/subscription/entitlements';
import { fetchSubscriptionPlans } from '@/lib/subscription/client';
import type { PlanCode, PublicSubscriptionPlan, SubscriptionFeatureCode } from '@/lib/subscription/types';
import { useTranslation } from 'react-i18next';
import React from 'react';

type SubscriptionFeatureGateProps = React.PropsWithChildren<{
  feature: SubscriptionFeatureCode;
}>;

function getFeatureTranslationKey(feature: SubscriptionFeatureCode) {
  switch (feature) {
    case 'text_ai':
      return 'textAi';
    case 'voice_ai':
      return 'voiceAi';
    case 'receipt_intelligence':
      return 'receiptIntelligence';
    case 'ai_history':
      return 'aiHistory';
    case 'managed_people':
      return 'managedPeople';
    case 'shared_spaces':
      return 'sharedSpaces';
    case 'standard_reports':
      return 'standardReports';
    case 'family_reports':
      return 'familyReports';
    case 'savings':
      return 'savings';
    case 'investments':
      return 'investments';
    case 'exchange_rates':
      return 'exchangeRates';
    case 'calculator':
      return 'calculator';
    default:
      return 'textAi';
  }
}

function planSupportsFeature(plan: PublicSubscriptionPlan, feature: SubscriptionFeatureCode) {
  switch (feature) {
    case 'text_ai':
      return plan.textAiEnabled;
    case 'voice_ai':
      return plan.voiceAiEnabled;
    case 'receipt_intelligence':
      return plan.receiptIntelligenceEnabled;
    case 'ai_history':
      return plan.aiHistoryEnabled;
    case 'managed_people':
      return plan.managedPeopleEnabled;
    case 'shared_spaces':
      return plan.sharedSpacesEnabled;
    case 'standard_reports':
      return plan.standardReportsEnabled;
    case 'family_reports':
      return plan.familyReportsEnabled;
    case 'savings':
      return plan.savingsEnabled;
    case 'investments':
      return plan.investmentsEnabled;
    case 'exchange_rates':
      return plan.exchangeRatesEnabled;
    case 'calculator':
      return plan.calculatorEnabled;
    default:
      return false;
  }
}

function planTierRank(planCode: PublicSubscriptionPlan['planCode']): number {
  switch (planCode) {
    case 'personal': return 0;
    case 'family': return 1;
    case 'free_trial': return 98;
    default: return 99;
  }
}

function getRecommendedPlanCode(plans: PublicSubscriptionPlan[], feature: SubscriptionFeatureCode): PlanCode | null {
  const rankedPlans = plans
    .filter((plan) => plan.isActive && plan.planCode !== 'free_trial' && planSupportsFeature(plan, feature))
    .sort((left, right) => {
      const intervalRank = (value: PublicSubscriptionPlan['billingInterval']) => {
        if (value === 'monthly') return 0;
        if (value === 'yearly') return 1;
        return 2;
      };

      return planTierRank(left.planCode) - planTierRank(right.planCode)
        || left.displayOrder - right.displayOrder
        || intervalRank(left.billingInterval) - intervalRank(right.billingInterval)
        || left.priceAmount - right.priceAmount;
    });

  return rankedPlans[0]?.planCode ?? null;
}

export default function SubscriptionFeatureGate({
  feature,
  children,
}: SubscriptionFeatureGateProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { summary, loading } = useSubscriptionSummary();
  const [recommendedPlanCode, setRecommendedPlanCode] = React.useState<PlanCode | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    fetchSubscriptionPlans()
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setRecommendedPlanCode(getRecommendedPlanCode(payload.plans, feature));
      })
      .catch(() => {
        if (cancelled) {
          return;
        }

        setRecommendedPlanCode(null);
      });

    return () => {
      cancelled = true;
    };
  }, [feature]);

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={16} className="animate-spin" />
          {t('status.loading', { ns: 'common' })}
        </div>
      </div>
    );
  }

  if (hasSubscriptionFeature(summary, feature)) {
    return <>{children}</>;
  }

  const featureKey = getFeatureTranslationKey(feature);
  const isTrialExpired = Boolean(summary?.trialExpired);
  const recommendedPlanLabel = recommendedPlanCode
    ? t(`featureGate.planCodes.${recommendedPlanCode}`, { ns: 'portal' })
    : null;

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(15,52,96,0.04),rgba(15,52,96,0.01))] px-6 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-700 ${
            isTrialExpired
              ? 'bg-warning-soft text-warning'
              : 'bg-muted text-muted-foreground'
          }`}>
            {isTrialExpired ? <AlertTriangle size={12} /> : <Lock size={12} />}
            {isTrialExpired
              ? t('featureGate.badges.expired', { ns: 'portal' })
              : t('featureGate.badges.locked', { ns: 'portal' })}
          </span>
          {recommendedPlanLabel ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-700 text-cyan-700 ring-1 ring-cyan-100">
              <Sparkles size={12} />
              {t('featureGate.recommendedPlan', {
                ns: 'portal',
                plan: recommendedPlanLabel,
              })}
            </span>
          ) : null}
        </div>
      </div>

      <EmptyState
        icon={Lock}
        title={t(`featureGate.featureCopy.${featureKey}.title`, {
          ns: 'portal',
          defaultValue: t('featureGate.title', { ns: 'portal' }),
        })}
        description={t(`featureGate.featureCopy.${featureKey}.description`, {
          ns: 'portal',
          defaultValue: t('featureGate.description', {
            ns: 'portal',
            feature: t(`featureGate.features.${featureKey}`, { ns: 'portal' }),
          }),
        })}
      />
      <div className="mx-6 mb-6 rounded-2xl border border-border/70 bg-muted/25 px-4 py-4 text-center">
        <p className="text-sm font-700 text-foreground">
          {isTrialExpired
            ? t('featureGate.expiredTitle', { ns: 'portal' })
            : t('featureGate.unavailableTitle', { ns: 'portal' })}
        </p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {isTrialExpired
            ? t('featureGate.expiredDescription', { ns: 'portal' })
            : t(`featureGate.featureCopy.${featureKey}.unavailableDescription`, {
                ns: 'portal',
                defaultValue: t('featureGate.unavailableDescription', {
                  ns: 'portal',
                  feature: t(`featureGate.features.${featureKey}`, { ns: 'portal' }),
                }),
              })}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3 px-6 pb-6">
        <Link
          href={recommendedPlanCode
            ? `/settings/subscription?plan=${recommendedPlanCode}`
            : '/settings/subscription'}
          className="btn-primary"
        >
          {t('featureGate.upgradeAction', { ns: 'portal' })}
        </Link>
        <Link href="/dashboard" className="btn-secondary">
          {t('featureGate.backAction', { ns: 'portal' })}
        </Link>
      </div>
    </div>
  );
}
