export type SubscriptionSummaryStatus =
  | 'trialing'
  | 'active'
  | 'expired'
  | 'past_due'
  | 'cancelled'
  | 'paused'
  | 'inactive'
  | 'unavailable';

export type PlanCode = 'free_trial' | 'personal' | 'family';
export type SupportedBillingInterval = 'monthly' | 'yearly' | 'none';

export interface SubscriptionFeatureLimit {
  featureKey: string;
  featureValue: string;
}

export interface PublicSubscriptionPlan {
  id: string;
  planCode: PlanCode;
  planName: string;
  description: string | null;
  priceAmount: number;
  billingInterval: SupportedBillingInterval;
  monthlyBasePriceAmount: number;
  yearlyDiscountPercent: number;
  yearlySavingAmount: number;
  equivalentMonthlyPriceAmount: number;
  trialDurationDays: number;
  monthlyAiCredits: number;
  dailyAiRequestLimit: number;
  monthlyVoiceSeconds: number;
  monthlyReceiptExtractions: number;
  receiptIntelligenceEnabled: boolean;
  textAiEnabled: boolean;
  voiceAiEnabled: boolean;
  aiHistoryEnabled: boolean;
  aiHistoryRetentionDays: number;
  managedPeopleEnabled: boolean;
  sharedSpacesEnabled: boolean;
  standardReportsEnabled: boolean;
  familyReportsEnabled: boolean;
  isActive: boolean;
  displayOrder: number;
  featureLimits: SubscriptionFeatureLimit[];
}

export interface SubscriptionSummary {
  hasSubscription: boolean;
  planId?: string;
  planName?: string;
  planCode?: PlanCode;
  planDescription?: string | null;
  status?: SubscriptionSummaryStatus;
  rawStatus?: string | null;
  billingStatus?: string | null;
  billingInterval?: SupportedBillingInterval;
  priceAmount?: number;
  monthlyBasePriceAmount?: number;
  yearlyDiscountPercent?: number;
  yearlySavingAmount?: number;
  equivalentMonthlyPriceAmount?: number;
  trialEndsAt?: string | null;
  trialDaysRemaining?: number | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cycleStart?: string | null;
  cycleEnd?: string | null;
  cancelledAt?: string | null;
  cancelAtPeriodEnd?: boolean;
  provider?: string | null;
  providerSubscriptionId?: string | null;
  providerPriceId?: string | null;
  providerManaged?: boolean;
  manualAssignment?: boolean;
  monthlyAiCredits?: number;
  dailyAiRequestLimit?: number;
  monthlyVoiceSeconds?: number;
  monthlyReceiptExtractions?: number;
  receiptIntelligenceEnabled?: boolean;
  textAiEnabled?: boolean;
  voiceAiEnabled?: boolean;
  aiHistoryEnabled?: boolean;
  creditsAllocated?: number;
  creditsConsumed?: number;
  creditsReserved?: number;
  creditsRefunded?: number;
  voiceSecondsUsed?: number;
  requestsToday?: number;
  receiptExtractionsIncluded?: number;
  receiptExtractionsUsed?: number;
  receiptExtractionsReserved?: number;
  receiptExtractionsRefunded?: number;
  receiptExtractionsRemaining?: number;
}

export interface BillingAvailability {
  providerConfigured: boolean;
  providerName: string | null;
  supportsCheckout: boolean;
  supportsCustomerPortal: boolean;
  supportsCancellation: boolean;
  contactEmail: string | null;
}

export interface SubscriptionPlansResponse {
  plans: PublicSubscriptionPlan[];
  billing: BillingAvailability;
}

export interface SubscriptionSummaryResponse {
  summary: SubscriptionSummary;
  billing: BillingAvailability;
}

export interface BillingActionError {
  code:
    | 'billing_provider_unavailable'
    | 'invalid_plan'
    | 'inactive_plan'
    | 'unsupported_billing_interval'
    | 'same_plan_selected'
    | 'checkout_creation_failed'
    | 'invalid_webhook_signature'
    | 'duplicate_billing_event'
    | 'subscription_activation_failed'
    | 'subscription_not_found';
  message: string;
}

export interface BillingCheckoutResponse {
  ok: boolean;
  checkoutUrl?: string | null;
  sessionId?: string | null;
  error?: BillingActionError;
}

export interface BillingPortalResponse {
  ok: boolean;
  portalUrl?: string | null;
  error?: BillingActionError;
}

export interface BillingMutationResponse {
  ok: boolean;
  error?: BillingActionError;
}
