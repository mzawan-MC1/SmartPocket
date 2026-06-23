import { NextResponse } from 'next/server';
import { initiateCheckoutForUser } from '@/lib/subscription/server';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';
import type { SupportedBillingInterval } from '@/lib/subscription/types';

type CheckoutRequestBody = {
  planId?: string;
  billingInterval?: SupportedBillingInterval;
};

export async function POST(request: Request) {
  try {
    const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      );
    }

    const body = (await request.json().catch(() => ({}))) as CheckoutRequestBody;
    if (!body.planId || !body.billingInterval) {
      return applySupabaseCookies(
        NextResponse.json({
          ok: false,
          error: {
            code: 'invalid_plan',
            message: 'A valid plan and billing interval are required.',
          },
        }, { status: 400 }),
        cookieMutations
      );
    }

    const origin = new URL(request.url).origin;
    const successUrl = new URL('/billing/success', origin);
    successUrl.searchParams.set('plan', body.planId);
    successUrl.searchParams.set('interval', body.billingInterval);

    const cancelUrl = new URL('/billing/cancel', origin);
    cancelUrl.searchParams.set('plan', body.planId);
    cancelUrl.searchParams.set('interval', body.billingInterval);

    const payload = await initiateCheckoutForUser({
      userId: user.id,
      email: user.email ?? null,
      planId: body.planId,
      billingInterval: body.billingInterval,
      successUrl: successUrl.toString(),
      cancelUrl: cancelUrl.toString(),
    });

    return applySupabaseCookies(
      NextResponse.json(payload, { status: payload.ok ? 200 : 400 }),
      cookieMutations
    );
  } catch (error) {
    console.error('[billing/checkout] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({
      ok: false,
      error: {
        code: 'checkout_creation_failed',
        message: 'Checkout could not be created.',
      },
    }, { status: 500 });
  }
}
