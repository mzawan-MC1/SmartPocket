import { NextResponse } from 'next/server';
import { ensureUserSubscriptionSummary } from '@/lib/subscription/server';
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

    if (process.env.NODE_ENV !== 'production') {
      console.info('[init-trial] user', user?.id ?? 'none');
    }

    if (error || !user) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      );
    }

    const { summary, initResult, errorMessage } = await ensureUserSubscriptionSummary(user.id);

    if (errorMessage) {
      console.error('[init-trial] summary error:', errorMessage);
      return applySupabaseCookies(
        NextResponse.json({ error: 'Failed to initialize subscription.' }, { status: 500 }),
        cookieMutations
      );
    }

    return applySupabaseCookies(
      NextResponse.json(
        {
          ok: true,
          status: initResult,
          has_subscription: summary.hasSubscription,
          plan_code: summary.planCode ?? null,
        },
        { status: 200 }
      ),
      cookieMutations
    );
  } catch (err) {
    console.error('[init-trial] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
