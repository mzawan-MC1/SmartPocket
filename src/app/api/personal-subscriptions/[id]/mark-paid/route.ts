import { NextResponse } from 'next/server';
import { markPersonalSubscriptionPaid } from '@/lib/personal-subscriptions-server';
import { requirePersonalSubscriptionsUser, withPersonalSubscriptionsCookies } from '../../_lib';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requirePersonalSubscriptionsUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const subscription = await markPersonalSubscriptionPaid({
      supabase: auth.supabase,
      userId: auth.user.id,
      subscriptionId: id,
    });

    return withPersonalSubscriptionsCookies(
      NextResponse.json({ subscription }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return withPersonalSubscriptionsCookies(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to mark subscription as paid' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}
