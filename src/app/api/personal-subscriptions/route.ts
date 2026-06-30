import { NextRequest, NextResponse } from 'next/server';
import {
  createPersonalSubscription,
  listPersonalSubscriptions,
  sanitizePersonalSubscriptionPayload,
  validatePersonalSubscriptionInput,
} from '@/lib/personal-subscriptions-server';
import { requirePersonalSubscriptionsUser, withPersonalSubscriptionsCookies } from './_lib';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const auth = await requirePersonalSubscriptionsUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const statuses = searchParams.getAll('status').filter(Boolean);
    const nextBillingDateFrom = searchParams.get('nextBillingDateFrom')?.trim() || undefined;
    const nextBillingDateTo = searchParams.get('nextBillingDateTo')?.trim() || undefined;
    const rawLimit = Number(searchParams.get('limit'));
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : undefined;
    const subscriptions = await listPersonalSubscriptions(auth.supabase, auth.user.id, {
      statuses: statuses.length > 0 ? statuses as Array<(typeof statuses)[number]> : undefined,
      nextBillingDateFrom,
      nextBillingDateTo,
      limit,
    });
    return withPersonalSubscriptionsCookies(
      NextResponse.json({ subscriptions }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return withPersonalSubscriptionsCookies(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to load subscriptions' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePersonalSubscriptionsUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const { payload, createLinkedRecurringExpense } = sanitizePersonalSubscriptionPayload(body || {});
    const validationError = validatePersonalSubscriptionInput(payload);

    if (validationError) {
      return withPersonalSubscriptionsCookies(
        NextResponse.json({ error: validationError }, { status: 400 }),
        auth.cookieMutations
      );
    }

    const subscription = await createPersonalSubscription({
      supabase: auth.supabase,
      userId: auth.user.id,
      payload,
      options: {
        createLinkedRecurringExpense,
      },
    });

    return withPersonalSubscriptionsCookies(
      NextResponse.json({ subscription }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return withPersonalSubscriptionsCookies(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create subscription' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}
