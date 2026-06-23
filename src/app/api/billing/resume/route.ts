import { NextResponse } from 'next/server';
import { resumeSubscription } from '@/lib/subscription/server';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

export async function POST() {
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

    const payload = await resumeSubscription(user.id);
    return applySupabaseCookies(
      NextResponse.json(payload, { status: payload.ok ? 200 : 400 }),
      cookieMutations
    );
  } catch (error) {
    console.error('[billing/resume] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json({
      ok: false,
      error: {
        code: 'subscription_not_found',
        message: 'Subscription could not be resumed.',
      },
    }, { status: 500 });
  }
}
