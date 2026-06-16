import { NextRequest, NextResponse } from 'next/server';
import { getPostAuthDestination, getSafeNextPath } from '@/lib/auth/redirects';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = getSafeNextPath(searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(new URL('/sign-up-login', request.url));
  }

  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error('[api/auth/callback] exchangeCodeForSession failed:', error?.message);
    return NextResponse.redirect(new URL('/sign-up-login', request.url));
  }

  const { destination, profileError } = await getPostAuthDestination(supabase, data.user.id, next);
  if (profileError) {
    console.error('[api/auth/callback] profile lookup failed:', profileError);
  }

  return applySupabaseCookies(
    NextResponse.redirect(new URL(destination, request.url)),
    cookieMutations
  );
}
