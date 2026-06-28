import type {
  AiTopUpAdminAdjustmentResponse,
  AiTopUpAdminCatalogResponse,
  AiTopUpAdminOrdersResponse,
  AiTopUpCatalogResponse,
  BillingCheckoutResponse,
  BillingMutationResponse,
  BillingPortalResponse,
  AiTopUpCheckoutResponse,
  AiTopUpHistoryResponse,
  AiTopUpProduct,
  AiTopUpQuoteResponse,
  AiTopUpSelectionInput,
  SubscriptionPlansResponse,
  SubscriptionSummaryResponse,
  SupportedBillingInterval,
} from '@/lib/subscription/types';

type SubscriptionClientRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
};

const DEFAULT_SUBSCRIPTION_SUMMARY_TIMEOUT_MS = 10000;

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

export async function fetchSubscriptionSummary(options: SubscriptionClientRequestOptions = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_SUBSCRIPTION_SUMMARY_TIMEOUT_MS;
  let didTimeout = false;

  const handleExternalAbort = () => {
    controller.abort();
  };

  if (options.signal?.aborted) {
    controller.abort();
  } else {
    options.signal?.addEventListener('abort', handleExternalAbort, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch('/api/subscription/summary', {
      cache: 'no-store',
      signal: controller.signal,
    });

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      throw new Error('summary_load_failed');
    }

    return parseJsonResponse<SubscriptionSummaryResponse>(response);
  } catch (error) {
    if (didTimeout) {
      throw new Error('summary_load_timeout');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', handleExternalAbort);
  }
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

export async function fetchAiTopUpCatalog() {
  const response = await fetch('/api/subscription/topups/catalog', {
    cache: 'no-store',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('topup_catalog_load_failed');
  }

  return parseJsonResponse<AiTopUpCatalogResponse>(response);
}

export async function quoteAiTopUpSelection(lines: AiTopUpSelectionInput[]) {
  const response = await fetch('/api/subscription/topups/quote', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ lines }),
  });

  return parseJsonResponse<AiTopUpQuoteResponse>(response);
}

export async function createAiTopUpCheckout(lines: AiTopUpSelectionInput[]) {
  const response = await fetch('/api/subscription/topups/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ lines }),
  });

  return parseJsonResponse<AiTopUpCheckoutResponse>(response);
}

export async function fetchAiTopUpHistory() {
  const response = await fetch('/api/subscription/topups/history', {
    cache: 'no-store',
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error('topup_history_failed');
  }

  return parseJsonResponse<AiTopUpHistoryResponse>(response);
}

export async function fetchAdminAiTopUpCatalog() {
  const response = await fetch('/api/admin/subscriptions/topups/products', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('admin_topup_catalog_failed');
  }

  return parseJsonResponse<AiTopUpAdminCatalogResponse>(response);
}

export async function saveAdminAiTopUpProduct(product: Partial<AiTopUpProduct>) {
  const response = await fetch('/api/admin/subscriptions/topups/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(product),
  });

  if (!response.ok) {
    throw new Error('admin_topup_product_save_failed');
  }

  return parseJsonResponse<{ product: AiTopUpProduct }>(response);
}

export async function fetchAdminAiTopUpOrders() {
  const response = await fetch('/api/admin/subscriptions/topups/orders', {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('admin_topup_orders_failed');
  }

  return parseJsonResponse<AiTopUpAdminOrdersResponse>(response);
}

export async function createAdminAiTopUpAdjustment(input: {
  userId: string;
  resourceType: Exclude<AiTopUpProduct['resourceType'], 'bundle'>;
  quantityDelta: number;
  reason: string;
}) {
  const response = await fetch('/api/admin/subscriptions/topups/adjustments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  return parseJsonResponse<AiTopUpAdminAdjustmentResponse>(response);
}
