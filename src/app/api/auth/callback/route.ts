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

function buildAuthErrorRedirect(
  request: NextRequest,
  code: 'oauth_cancelled' | 'oauth_provider_error' | 'callback_error',
  message: string
) {
  const redirectUrl = buildAppUrl('/sign-up-login', request);
  redirectUrl.searchParams.set('authError', code);
  redirectUrl.searchParams.set('authMessage', message);
  return NextResponse.redirect(redirectUrl);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const code = searchParams.get('code');
    const next = getSafeNextPath(searchParams.get('next'));
    const authType = searchParams.get('type');
    const providerError = searchParams.get('error');
    const providerErrorDescription = searchParams.get('error_description');

    if (providerError) {
      const isCancelled = providerError === 'access_denied';
      return buildAuthErrorRedirect(
        request,
        isCancelled ? 'oauth_cancelled' : 'oauth_provider_error',
        isCancelled
          ? 'Google sign-in was cancelled before completion.'
          : providerErrorDescription || 'Google sign-in could not be completed.'
      );
    }

    if (!code) {
      return buildAuthErrorRedirect(
        request,
        'callback_error',
        'The Google sign-in callback was incomplete. Please try again.'
      );
    }

    const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !data.user) {
      const safeMessage = error?.message || 'Google sign-in could not be completed.';
      console.error('[api/auth/callback] exchangeCodeForSession failed');
      return buildAuthErrorRedirect(request, 'callback_error', safeMessage);
    }

    const { destination, profileError } = await getPostAuthDestination(supabase, data.user.id, next);
    if (profileError) {
      console.error('[api/auth/callback] profile lookup failed');
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
  } catch (err: any) {
    console.error('[api/auth/callback] Unexpected error');
    return buildAuthErrorRedirect(
      request,
      'callback_error',
      'We could not complete sign-in after returning from Google. Please try again.'
    );
  }
}
