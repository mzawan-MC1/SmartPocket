import { NextResponse } from 'next/server';
import { createCustomerPortalForUser } from '@/lib/subscription/server';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

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

    const origin = new URL(request.url).origin;
    const payload = await createCustomerPortalForUser(
      user.id,
      user.email ?? null,
      new URL('/settings/subscription', origin).toString()
    );

    return applySupabaseCookies(
      NextResponse.json(payload, { status: payload.ok ? 200 : 400 }),
      cookieMutations
    );
  } catch (error) {
    console.error('[billing/portal] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({
      ok: false,
      error: {
        code: 'billing_provider_unavailable',
        message: 'Billing portal is unavailable.',
      },
    }, { status: 500 });
  }
}
