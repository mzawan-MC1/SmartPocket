import { NextResponse } from 'next/server';
import { createAiTopUpCheckoutForUser } from '@/lib/subscription/topups-server';
import type { AiTopUpSelectionInput } from '@/lib/subscription/types';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

type CheckoutBody = {
  lines?: AiTopUpSelectionInput[];
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

    const body = (await request.json().catch(() => ({}))) as CheckoutBody;
    const origin = new URL(request.url).origin;
    const successUrl = new URL('/billing/success', origin);
    successUrl.searchParams.set('source', 'topup');

    const cancelUrl = new URL('/billing/cancel', origin);
    cancelUrl.searchParams.set('source', 'topup');

    const payload = await createAiTopUpCheckoutForUser({
      userId: user.id,
      email: user.email ?? null,
      lines: body.lines ?? [],
      successUrl: successUrl.toString(),
      cancelUrl: cancelUrl.toString(),
    });

    return applySupabaseCookies(
      NextResponse.json(payload, { status: payload.ok ? 200 : 400 }),
      cookieMutations
    );
  } catch (error) {
    console.error('[subscription/topups/checkout] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({
      ok: false,
      error: {
        code: 'checkout_creation_failed',
        message: 'Unable to create one-time checkout.',
      },
    }, { status: 500 });
  }
}
