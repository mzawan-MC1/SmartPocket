import type {
  SubscriptionEntitlements,
  SubscriptionFeatureCode,
  SubscriptionSummary,
} from '@/lib/subscription/types';

export function getSubscriptionEntitlements(summary: SubscriptionSummary | null | undefined): SubscriptionEntitlements | null {
  return summary?.entitlements ?? null;
}

export function hasSubscriptionFeature(
  summary: SubscriptionSummary | null | undefined,
  feature: SubscriptionFeatureCode
) {
  const entitlements = getSubscriptionEntitlements(summary);
  if (!entitlements) {
    return false;
  }

  switch (feature) {
    case 'text_ai':
      return entitlements.textAi;
    case 'voice_ai':
      return entitlements.voiceAi;
    case 'receipt_intelligence':
      return entitlements.receiptIntelligence;
    case 'ai_history':
      return entitlements.aiHistory;
    case 'managed_people':
      return entitlements.managedPeople;
    case 'shared_spaces':
      return entitlements.sharedSpaces;
    case 'standard_reports':
      return entitlements.standardReports;
    case 'family_reports':
      return entitlements.familyReports;
    default:
      return false;
  }
}
