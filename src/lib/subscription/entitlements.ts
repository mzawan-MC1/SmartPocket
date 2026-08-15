import type {
  SubscriptionEntitlements,
  SubscriptionFeatureCode,
  SubscriptionSummary,
} from '@/lib/subscription/types';

export type SubscriptionFeatureAccessState = 'unresolved' | 'allowed' | 'restricted';

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
    case 'savings':
      return entitlements.savings;
    case 'investments':
      return entitlements.investments;
    case 'exchange_rates':
      return entitlements.exchangeRates;
    case 'calculator':
      return entitlements.calculator;
    default:
      return false;
  }
}

export function getSubscriptionFeatureAccess(
  summary: SubscriptionSummary | null | undefined,
  loading: boolean,
  feature: SubscriptionFeatureCode
): SubscriptionFeatureAccessState {
  if (loading) {
    return 'unresolved';
  }

  const entitlements = getSubscriptionEntitlements(summary);
  if (!entitlements) {
    return 'unresolved';
  }

  return hasSubscriptionFeature(summary, feature) ? 'allowed' : 'restricted';
}
