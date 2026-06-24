import { NextResponse } from 'next/server';
import {
  createPersonalSubscription,
  listPersonalSubscriptions,
  sanitizePersonalSubscriptionPayload,
  validatePersonalSubscriptionInput,
} from '@/lib/personal-subscriptions-server';
import { requirePersonalSubscriptionsUser, withPersonalSubscriptionsCookies } from './_lib';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requirePersonalSubscriptionsUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const subscriptions = await listPersonalSubscriptions(auth.supabase, auth.user.id);
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
