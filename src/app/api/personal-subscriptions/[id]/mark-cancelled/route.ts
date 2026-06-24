import { NextResponse } from 'next/server';
import { markPersonalSubscriptionCancelled } from '@/lib/personal-subscriptions-server';
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
    const body = await request.json().catch(() => ({}));
    const subscription = await markPersonalSubscriptionCancelled({
      supabase: auth.supabase,
      userId: auth.user.id,
      subscriptionId: id,
      effectiveDate: typeof body?.effective_date === 'string' ? body.effective_date : null,
    });

    return withPersonalSubscriptionsCookies(
      NextResponse.json({ subscription }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (error) {
    return withPersonalSubscriptionsCookies(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to mark subscription as cancelled' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }
}
