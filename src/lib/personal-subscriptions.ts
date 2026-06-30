import { resolveUserDefaultCurrency } from '@/lib/currency-totals';
import {
  getPersonalSubscriptionsSummaryTotals,
  normalizePersonalSubscriptionRecord,
  type PersonalSubscription,
  type PersonalSubscriptionUpsertInput,
} from '@/lib/personal-subscriptions-shared';

async function parsePersonalSubscriptionsResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body?.error === 'string'
        ? body.error
        : 'Personal subscription request failed'
    );
  }
  return body as Record<string, unknown>;
}

export async function getPersonalSubscriptions(options?: {
  statuses?: PersonalSubscription['status'][];
  nextBillingDateFrom?: string;
  nextBillingDateTo?: string;
  limit?: number;
}) {
  const searchParams = new URLSearchParams();
  options?.statuses?.forEach((status) => {
    if (status) {
      searchParams.append('status', status);
    }
  });
  if (options?.nextBillingDateFrom) {
    searchParams.set('nextBillingDateFrom', options.nextBillingDateFrom);
  }
  if (options?.nextBillingDateTo) {
    searchParams.set('nextBillingDateTo', options.nextBillingDateTo);
  }
  if (options?.limit) {
    searchParams.set('limit', String(options.limit));
  }

  const response = await fetch(`/api/personal-subscriptions${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
  });
  const body = await parsePersonalSubscriptionsResponse(response);
  return ((body.subscriptions as PersonalSubscription[]) || []).map((subscription) =>
    normalizePersonalSubscriptionRecord(subscription)
  );
}

export async function getPersonalSubscriptionById(id: string) {
  const response = await fetch(`/api/personal-subscriptions/${id}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
  });
  const body = await parsePersonalSubscriptionsResponse(response);
  return normalizePersonalSubscriptionRecord(body.subscription as PersonalSubscription);
}

export async function createPersonalSubscription(
  payload: PersonalSubscriptionUpsertInput & { create_linked_recurring_expense?: boolean }
) {
  const response = await fetch('/api/personal-subscriptions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await parsePersonalSubscriptionsResponse(response);
  return normalizePersonalSubscriptionRecord(body.subscription as PersonalSubscription);
}

export async function updatePersonalSubscription(
  id: string,
  payload: Partial<PersonalSubscriptionUpsertInput> & { create_linked_recurring_expense?: boolean }
) {
  const response = await fetch(`/api/personal-subscriptions/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await parsePersonalSubscriptionsResponse(response);
  return normalizePersonalSubscriptionRecord(body.subscription as PersonalSubscription);
}

export async function deletePersonalSubscription(id: string) {
  const response = await fetch(`/api/personal-subscriptions/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  await parsePersonalSubscriptionsResponse(response);
}

export async function markPersonalSubscriptionPaid(id: string) {
  const response = await fetch(`/api/personal-subscriptions/${id}/mark-paid`, {
    method: 'POST',
    credentials: 'include',
  });
  const body = await parsePersonalSubscriptionsResponse(response);
  return normalizePersonalSubscriptionRecord(body.subscription as PersonalSubscription);
}

export async function requestPersonalSubscriptionCancellation(
  id: string,
  payload: {
    request_date?: string | null;
    effective_cancellation_date?: string | null;
    confirmation_reference?: string | null;
    notes?: string | null;
  }
) {
  const response = await fetch(`/api/personal-subscriptions/${id}/request-cancellation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await parsePersonalSubscriptionsResponse(response);
  return normalizePersonalSubscriptionRecord(body.subscription as PersonalSubscription);
}

export async function markPersonalSubscriptionCancelled(
  id: string,
  payload?: { effective_date?: string | null }
) {
  const response = await fetch(`/api/personal-subscriptions/${id}/mark-cancelled`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload || {}),
  });
  const body = await parsePersonalSubscriptionsResponse(response);
  return normalizePersonalSubscriptionRecord(body.subscription as PersonalSubscription);
}

export async function getPersonalSubscriptionsSummary(subscriptions: PersonalSubscription[], todayIso: string) {
  const defaultCurrency = await resolveUserDefaultCurrency();
  return {
    defaultCurrency,
    ...getPersonalSubscriptionsSummaryTotals(subscriptions, todayIso),
  };
}
