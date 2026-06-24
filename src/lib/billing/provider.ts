import 'server-only';

import type { BillingAvailability } from '@/lib/subscription/types';
import type { BillingProvider } from '@/lib/billing/types';
import { DisabledBillingProvider } from '@/lib/billing/providers/disabled';

function normalizeProviderName(value: string | undefined) {
  return (value || '').trim().toLowerCase();
}

export function getBillingProvider(): BillingProvider {
  const providerName = normalizeProviderName(process.env.BILLING_PROVIDER);

  switch (providerName) {
    case '':
    case 'disabled':
      return new DisabledBillingProvider();
    default:
      throw new Error(`Unsupported billing provider: ${providerName}`);
  }
}

export function getBillingAvailability(contactEmail?: string | null): BillingAvailability {
  let provider: BillingProvider;

  try {
    provider = getBillingProvider();
  } catch {
    provider = new DisabledBillingProvider();
  }

  return {
    providerConfigured: provider.configured,
    providerName: provider.configured ? provider.name : null,
    supportsCheckout: provider.configured,
    supportsCustomerPortal: Boolean(provider.configured && provider.createCustomerPortal),
    supportsCancellation: Boolean(provider.configured && provider.cancelSubscription),
    contactEmail: contactEmail || null,
  };
}
