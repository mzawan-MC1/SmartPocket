import { NextRequest, NextResponse } from 'next/server';
import { getPostAuthDestination, getSafeNextPath } from '@/lib/auth/redirects';
import { buildAppUrl } from '@/lib/auth/urls';
import {
  encodeMarketingEventsCookie,
  MARKETING_EVENT_COOKIE_NAME,
  type QueuedMarketingEvent,
} from '@/lib/marketing-event-cookie';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const next = getSafeNextPath(searchParams.get('next'));
  const authType = searchParams.get('type');

  if (!code) {
    return NextResponse.redirect(buildAppUrl('/sign-up-login', request));
  }

  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error('[api/auth/callback] exchangeCodeForSession failed:', error?.message);
    return NextResponse.redirect(buildAppUrl('/sign-up-login', request));
  }

  const { destination, profileError } = await getPostAuthDestination(supabase, data.user.id, next);
  if (profileError) {
    console.error('[api/auth/callback] profile lookup failed:', profileError);
  }

  const response = NextResponse.redirect(buildAppUrl(destination, request));
  const queuedEvents: QueuedMarketingEvent[] = [];

  if (authType === 'signup') {
    queuedEvents.push(
      { name: 'email_confirmed', params: { method: 'email_link' } },
      { name: 'sign_up_completed', params: { method: 'email_link' } },
      { name: 'trial_started', params: { source: 'signup_confirmation' } }
    );
  }

  if (authType === 'magiclink') {
    queuedEvents.push({ name: 'login', params: { method: 'magic_link' } });
  }

  if (queuedEvents.length > 0) {
    response.cookies.set(MARKETING_EVENT_COOKIE_NAME, encodeMarketingEventsCookie(queuedEvents), {
      httpOnly: false,
      maxAge: 60,
      path: '/',
      sameSite: 'lax',
      secure: request.nextUrl.protocol === 'https:',
    });
  }

  return applySupabaseCookies(response, cookieMutations);
}
