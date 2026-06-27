import type { SupportedBillingInterval } from '@/lib/subscription/types';

export type BillingProviderName = string;

export interface CreateCheckoutInput {
  userId: string;
  email: string | null;
  planId: string;
  planCode: string;
  planName: string;
  currencyCode: string;
  billingInterval: SupportedBillingInterval;
  priceAmount: number;
  successUrl: string;
  cancelUrl: string;
  checkoutSessionId: string;
}

export interface CreateOneTimeCheckoutInput {
  userId: string;
  email: string | null;
  orderId: string;
  orderReference: string;
  currencyCode: string;
  subtotalAmount: number;
  vatAmount: number;
  totalAmount: number;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, unknown>;
}

export interface CheckoutSessionResult {
  checkoutUrl: string;
  providerSessionId: string;
  providerPriceId?: string | null;
}

export interface CustomerPortalInput {
  userId: string;
  email: string | null;
  returnUrl: string;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
}

export interface CustomerPortalResult {
  portalUrl: string;
}

export interface CancelSubscriptionInput {
  userId: string;
  providerSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
}

export interface ResumeSubscriptionInput {
  userId: string;
  providerSubscriptionId: string;
}

export interface VerifiedBillingSubscriptionPayload {
  userId: string;
  planCode: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId?: string | null;
  status: string;
  billingInterval: SupportedBillingInterval;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt?: string | null;
  metadata?: Record<string, unknown>;
}

export interface VerifiedBillingTopUpOrderPayload {
  orderId: string;
  userId: string;
  paymentReference: string;
  metadata?: Record<string, unknown>;
}

export interface VerifiedBillingEvent {
  provider: BillingProviderName;
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  subscription?: VerifiedBillingSubscriptionPayload | null;
  topUpOrder?: VerifiedBillingTopUpOrderPayload | null;
}

export interface BillingProvider {
  readonly name: BillingProviderName;
  readonly configured: boolean;
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSessionResult>;
  createOneTimeCheckoutSession?(input: CreateOneTimeCheckoutInput): Promise<CheckoutSessionResult>;
  verifyWebhook(request: Request): Promise<VerifiedBillingEvent>;
  createCustomerPortal?(input: CustomerPortalInput): Promise<CustomerPortalResult>;
  cancelSubscription?(input: CancelSubscriptionInput): Promise<void>;
  resumeSubscription?(input: ResumeSubscriptionInput): Promise<void>;
}
