import 'server-only';

import type {
  BillingProvider,
  CancelSubscriptionInput,
  CheckoutSessionResult,
  CreateCheckoutInput,
  CustomerPortalInput,
  CustomerPortalResult,
  ResumeSubscriptionInput,
  VerifiedBillingEvent,
} from '@/lib/billing/types';

function providerUnavailableError() {
  return new Error('billing_provider_unavailable');
}

export class DisabledBillingProvider implements BillingProvider {
  readonly name = 'disabled';
  readonly configured = false;

  async createCheckoutSession(_input: CreateCheckoutInput): Promise<CheckoutSessionResult> {
    throw providerUnavailableError();
  }

  async verifyWebhook(_request: Request): Promise<VerifiedBillingEvent> {
    throw providerUnavailableError();
  }

  async createCustomerPortal(_input: CustomerPortalInput): Promise<CustomerPortalResult> {
    throw providerUnavailableError();
  }

  async cancelSubscription(_input: CancelSubscriptionInput): Promise<void> {
    throw providerUnavailableError();
  }

  async resumeSubscription(_input: ResumeSubscriptionInput): Promise<void> {
    throw providerUnavailableError();
  }
}
