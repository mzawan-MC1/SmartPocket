import { NextResponse } from 'next/server';
import { ensureUserSubscriptionSummaryWithUserClient, getAuthenticatedSubscriptionSummary } from '@/lib/subscription/server';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

export async function GET() {
  try {
    const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (process.env.NODE_ENV !== 'production') {
      console.info('[subscription/summary] user', user?.id ?? 'none');
      console.info('[subscription/summary] service_role_configured', Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY));
    }

    if (error || !user) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      );
    }

    const ensured = await ensureUserSubscriptionSummaryWithUserClient(user.id, supabase);
    if (ensured.errorMessage) {
      console.error('[subscription/summary] summary error:', ensured.errorMessage);
      if (ensured.errorMessage.startsWith('config:')) {
        return applySupabaseCookies(
          NextResponse.json({
            summary: ensured.summary,
            billing: {
              providerConfigured: false,
              providerName: null,
              supportsCheckout: false,
              supportsCustomerPortal: false,
              supportsCancellation: false,
              contactEmail: null,
            },
          }, { status: 200 }),
          cookieMutations
        );
      }

      return applySupabaseCookies(
        NextResponse.json({ error: 'Failed to load subscription summary.' }, { status: 500 }),
        cookieMutations
      );
    }

    const payload = await getAuthenticatedSubscriptionSummary(user.id);

    return applySupabaseCookies(NextResponse.json(payload, { status: 200 }), cookieMutations);
  } catch (err) {
    console.error('[subscription/summary] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
