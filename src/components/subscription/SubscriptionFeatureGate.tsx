'use client';

import Link from 'next/link';
import { Lock, Loader2 } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import { hasSubscriptionFeature } from '@/lib/subscription/entitlements';
import type { SubscriptionFeatureCode } from '@/lib/subscription/types';
import { useTranslation } from 'react-i18next';

type SubscriptionFeatureGateProps = {
  feature: SubscriptionFeatureCode;
  children: React.ReactNode;
};

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
    default:
      return 'textAi';
  }
}

export default function SubscriptionFeatureGate({
  feature,
  children,
}: SubscriptionFeatureGateProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { summary, loading } = useSubscriptionSummary();

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

  return (
    <div className="card">
      <EmptyState
        icon={Lock}
        title={t('featureGate.title', { ns: 'portal' })}
        description={t('featureGate.description', {
          ns: 'portal',
          feature: t(`featureGate.features.${featureKey}`, { ns: 'portal' }),
        })}
      />
      <div className="flex flex-wrap justify-center gap-3 px-6 pb-6">
        <Link href="/settings/subscription" className="btn-primary">
          {t('featureGate.upgradeAction', { ns: 'portal' })}
        </Link>
        <Link href="/dashboard" className="btn-secondary">
          {t('featureGate.backAction', { ns: 'portal' })}
        </Link>
      </div>
    </div>
  );
}
