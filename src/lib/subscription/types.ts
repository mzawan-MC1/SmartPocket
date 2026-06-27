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
export type SubscriptionFeatureCode =
  | 'text_ai'
  | 'voice_ai'
  | 'receipt_intelligence'
  | 'ai_history'
  | 'managed_people'
  | 'shared_spaces'
  | 'standard_reports'
  | 'family_reports';
export type SubscriptionEntitlementErrorCode =
  | 'feature_not_in_plan'
  | 'plan_inactive'
  | 'subscription_inactive'
  | 'trial_expired'
  | 'usage_exhausted';
export type TopUpResourceType =
  | 'text_credit'
  | 'voice_second'
  | 'receipt_extraction'
  | 'bundle';
export type AiTopUpOrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'cancelled'
  | 'failed'
  | 'refunded'
  | 'payment_reversed';

export interface UsageBalanceSnapshot {
  includedRemaining: number;
  purchasedRemaining: number;
  totalAvailable: number;
}

export interface AiTopUpBalanceSummary {
  resourceType: Exclude<TopUpResourceType, 'bundle'>;
  availableQuantity: number;
  reservedQuantity: number;
  totalPurchasedQuantity: number;
  totalConsumedQuantity: number;
  updatedAt?: string | null;
}

export interface SubscriptionTopUpBalances {
  textCredit: AiTopUpBalanceSummary;
  voiceSecond: AiTopUpBalanceSummary;
  receiptExtraction: AiTopUpBalanceSummary;
}

export interface SubscriptionEntitlements {
  planActive: boolean;
  subscriptionActive: boolean;
  trialExpired: boolean;
  textAi: boolean;
  voiceAi: boolean;
  receiptIntelligence: boolean;
  aiHistory: boolean;
  managedPeople: boolean;
  sharedSpaces: boolean;
  standardReports: boolean;
  familyReports: boolean;
  aiHistoryRetentionDays: number;
}

export interface SubscriptionEntitlementError {
  code: SubscriptionEntitlementErrorCode;
  feature: SubscriptionFeatureCode;
  message: string;
  resource?: Exclude<TopUpResourceType, 'bundle'>;
  includedRemaining?: number;
  topUpRemaining?: number;
  totalAvailable?: number;
  canBuyTopUp?: boolean;
}

export interface AiTopUpProduct {
  id: string;
  resourceType: TopUpResourceType;
  enabled: boolean;
  active: boolean;
  name: string;
  description: string | null;
  unitQuantity: number;
  unitLabel: string | null;
  priceAmount: number;
  currencyCode: string;
  minimumQuantity: number;
  maximumQuantity: number;
  quantityStep: number;
  sortOrder: number;
  bundleComponents?: Partial<Record<Exclude<TopUpResourceType, 'bundle'>, number>>;
  eligiblePlanCodes: PlanCode[];
}

export interface AiTopUpSelectionInput {
  productId: string;
  quantity: number;
}

export interface AiTopUpQuoteLine {
  productId: string;
  productName: string;
  resourceType: TopUpResourceType;
  quantity: number;
  grantedQuantity: number;
  unitPriceAmount: number;
  subtotalAmount: number;
  currencyCode: string;
  bundleComponents?: Partial<Record<Exclude<TopUpResourceType, 'bundle'>, number>>;
}

export interface AiTopUpQuote {
  currencyCode: string;
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  lines: AiTopUpQuoteLine[];
}

export interface AiTopUpQuoteResponse {
  ok: boolean;
  quote?: AiTopUpQuote;
  error?: BillingActionError | SubscriptionEntitlementError;
}

export interface AiTopUpOrderSummary {
  id: string;
  orderReference: string;
  status: AiTopUpOrderStatus;
  currencyCode: string;
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  paymentReference: string | null;
  invoiceReference: string | null;
  invoiceNumber: string | null;
  createdAt: string;
  paidAt: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userFullName?: string | null;
  items: Array<{
    id: string;
    productName: string;
    resourceType: TopUpResourceType;
    quantity: number;
    grantedQuantity: number;
    subtotalAmount: number;
  }>;
}

export interface AiTopUpCheckoutResponse {
  ok: boolean;
  orderId?: string;
  sessionId?: string | null;
  checkoutUrl?: string | null;
  error?: BillingActionError | SubscriptionEntitlementError;
}

export interface AiTopUpCatalogResponse {
  products: AiTopUpProduct[];
  balances: SubscriptionTopUpBalances;
  usage: {
    textCredit: UsageBalanceSnapshot;
    voiceSecond: UsageBalanceSnapshot;
    receiptExtraction: UsageBalanceSnapshot;
  };
  currencyCode: string;
  vatBasisPoints: number;
  canPurchaseTopUps: boolean;
}

export interface AiTopUpHistoryResponse {
  orders: AiTopUpOrderSummary[];
}

export interface AiTopUpAdminCatalogResponse {
  products: AiTopUpProduct[];
}

export interface AiTopUpAdminOrdersResponse {
  orders: AiTopUpOrderSummary[];
}

export interface AiTopUpAdminAdjustmentResponse {
  ok: boolean;
  error?: BillingActionError | { code: 'adjustment_failed'; message: string };
}

export interface SubscriptionFeatureLimit {
  featureKey: string;
  featureValue: string;
}

export interface PublicSubscriptionPlan {
  id: string;
  planCode: PlanCode;
  planName: string;
  description: string | null;
  currencyCode: string;
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
  currencyCode?: string;
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
  aiHistoryRetentionDays?: number;
  managedPeopleEnabled?: boolean;
  sharedSpacesEnabled?: boolean;
  standardReportsEnabled?: boolean;
  familyReportsEnabled?: boolean;
  planActive?: boolean;
  subscriptionActive?: boolean;
  trialExpired?: boolean;
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
  topUpBalances?: SubscriptionTopUpBalances;
  usageAvailability?: {
    textCredit: UsageBalanceSnapshot;
    voiceSecond: UsageBalanceSnapshot;
    receiptExtraction: UsageBalanceSnapshot;
  };
  entitlements?: SubscriptionEntitlements;
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
    | 'invalid_topup_selection'
    | 'topup_not_allowed'
    | 'order_not_found'
    | 'duplicate_payment_fulfillment'
    | 'adjustment_failed'
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
