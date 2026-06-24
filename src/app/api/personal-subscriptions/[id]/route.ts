import { NextResponse } from 'next/server';
import {
  deletePersonalSubscription,
  getPersonalSubscription,
  sanitizePersonalSubscriptionPayload,
  updatePersonalSubscription,
  validatePersonalSubscriptionInput,
} from '@/lib/personal-subscriptions-server';
import { requirePersonalSubscriptionsUser, withPersonalSubscriptionsCookies } from '../_lib';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePersonalSubscriptionsUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const subscription = await getPersonalSubscription(auth.supabase, auth.user.id, id);

    return withPersonalSubscriptionsCookies(
      NextResponse.json({ subscription }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return withPersonalSubscriptionsCookies(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to load subscription' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePersonalSubscriptionsUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const body = await request.json();
    const { payload, createLinkedRecurringExpense } = sanitizePersonalSubscriptionPayload(body || {}, { partial: true });
    const validationError = validatePersonalSubscriptionInput(payload, { partial: true });

    if (validationError) {
      return withPersonalSubscriptionsCookies(
        NextResponse.json({ error: validationError }, { status: 400 }),
        auth.cookieMutations
      );
    }

    const subscription = await updatePersonalSubscription({
      supabase: auth.supabase,
      userId: auth.user.id,
      subscriptionId: id,
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
        { error: error instanceof Error ? error.message : 'Failed to update subscription' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePersonalSubscriptionsUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    await deletePersonalSubscription({
      supabase: auth.supabase,
      userId: auth.user.id,
      subscriptionId: id,
    });

    return withPersonalSubscriptionsCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return withPersonalSubscriptionsCookies(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to delete subscription' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}
