import { NextResponse, type NextRequest } from 'next/server';
import {
  getPostAuthDestination,
  isAuthPagePath,
  isOnboardingPath,
} from '@/lib/auth/redirects';
import { buildAppUrl } from '@/lib/auth/urls';
import {
  copySupabaseCookies,
  createMiddlewareSupabaseClient,
} from '@/lib/supabase/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-sp-pathname', pathname);

  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const { supabase, getResponse } = createMiddlewareSupabaseClient(request, requestHeaders);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const supabaseResponse = getResponse();

  const shouldLogAuthDiagnostics =
    isAuthPagePath(pathname) || pathname.startsWith('/onboarding') || pathname.startsWith('/dashboard');

  if (process.env.NODE_ENV !== 'production' && shouldLogAuthDiagnostics) {
    console.info('[middleware]', pathname, user ? 'user' : 'guest');
  }

  function redirectWithCookies(destination: string): NextResponse {
    return copySupabaseCookies(
      supabaseResponse,
      NextResponse.redirect(buildAppUrl(destination, request))
    );
  }

  const publicPrefixes = [
    '/sign-up-login',
    '/auth/',
    '/home',
    '/about',
    '/features',
    '/pricing',
    '/contact',
    '/privacy',
    '/terms',
    '/offline',
  ];

  const isPublicRoute = publicPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );

  if (pathname === '/') {
    if (!user) {
      return redirectWithCookies('/home');
    }

    const { destination, profileError } = await getPostAuthDestination(supabase, user.id, null);
    if (profileError) {
      console.error('[middleware] profile lookup failed:', profileError);
    }
    return redirectWithCookies(destination);
  }

  if (!user && !isPublicRoute) {
    const redirectUrl = buildAppUrl('/sign-up-login', request);
    redirectUrl.searchParams.set('next', pathname);
    return copySupabaseCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  if (user) {
    const loginNext = isAuthPagePath(pathname) ? request.nextUrl.searchParams.get('next') : null;
    const { hasCompletedOnboarding, destination, profileError } = await getPostAuthDestination(
      supabase,
      user.id,
      loginNext
    );

    if (profileError) {
      console.error('[middleware] profile lookup failed:', profileError);
    }

    if (isAuthPagePath(pathname)) {
      return redirectWithCookies(destination);
    }

    if (!hasCompletedOnboarding && !isOnboardingPath(pathname)) {
      return redirectWithCookies('/onboarding');
    }

    if (hasCompletedOnboarding && isOnboardingPath(pathname)) {
      return redirectWithCookies('/dashboard');
    }
  }

  if (pathname.startsWith('/admin')) {
    if (!user) {
      const redirectUrl = buildAppUrl('/sign-up-login', request);
      redirectUrl.searchParams.set('next', pathname);
      return copySupabaseCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
    }

    const appMetadata = user.app_metadata || {};
    const isAdmin = appMetadata.role === 'admin';

    if (!isAdmin) {
      return redirectWithCookies('/dashboard');
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|assets|currencies|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
