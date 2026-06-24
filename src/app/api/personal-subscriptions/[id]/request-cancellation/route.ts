import { NextResponse } from 'next/server';
import { requestPersonalSubscriptionCancellation } from '@/lib/personal-subscriptions-server';
import { requirePersonalSubscriptionsUser, withPersonalSubscriptionsCookies } from '../../_lib';

export const runtime = 'nodejs';

export async function POST(
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
    const subscription = await requestPersonalSubscriptionCancellation({
      supabase: auth.supabase,
      userId: auth.user.id,
      subscriptionId: id,
      input: {
        request_date: typeof body?.request_date === 'string' ? body.request_date : null,
        effective_cancellation_date:
          typeof body?.effective_cancellation_date === 'string' ? body.effective_cancellation_date : null,
        confirmation_reference:
          typeof body?.confirmation_reference === 'string' ? body.confirmation_reference : null,
        notes: typeof body?.notes === 'string' ? body.notes : null,
      },
    });

    return withPersonalSubscriptionsCookies(
      NextResponse.json({ subscription }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return withPersonalSubscriptionsCookies(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to request cancellation' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}
