import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export async function requirePersonalSubscriptionsUser() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      ),
    };
  }

  return { ok: true as const, supabase, cookieMutations, user };
}

export function withPersonalSubscriptionsCookies(
  response: NextResponse,
  cookieMutations: Array<{ name: string; value: string; options: import('@supabase/ssr').CookieOptions }>
) {
  return applySupabaseCookies(response, cookieMutations);
}
