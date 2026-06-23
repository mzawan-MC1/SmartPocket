import type {
  BillingCheckoutResponse,
  BillingMutationResponse,
  BillingPortalResponse,
  SubscriptionPlansResponse,
  SubscriptionSummaryResponse,
  SupportedBillingInterval,
} from '@/lib/subscription/types';

async function parseJsonResponse<T>(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('invalid_response');
  }

  return await response.json() as T;
}

export async function fetchSubscriptionPlans() {
  const response = await fetch('/api/subscription/plans', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('plans_load_failed');
  }

  return parseJsonResponse<SubscriptionPlansResponse>(response);
}

export async function fetchSubscriptionSummary() {
  const response = await fetch('/api/subscription/summary', {
    cache: 'no-store',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('summary_load_failed');
  }

  return parseJsonResponse<SubscriptionSummaryResponse>(response);
}

export async function createBillingCheckoutSession(planCode: string, billingInterval: SupportedBillingInterval) {
  const response = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ planCode, billingInterval }),
  });

  return parseJsonResponse<BillingCheckoutResponse>(response);
}

export async function openBillingPortal() {
  const response = await fetch('/api/billing/portal', {
    method: 'POST',
  });

  return parseJsonResponse<BillingPortalResponse>(response);
}

export async function cancelBillingSubscription() {
  const response = await fetch('/api/billing/cancel', {
    method: 'POST',
  });

  return parseJsonResponse<BillingMutationResponse>(response);
}

export async function resumeBillingSubscription() {
  const response = await fetch('/api/billing/resume', {
    method: 'POST',
  });

  return parseJsonResponse<BillingMutationResponse>(response);
}
