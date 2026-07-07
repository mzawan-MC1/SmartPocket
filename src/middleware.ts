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
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const rawHost = (forwardedHost || request.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  const rawProto = (forwardedProto || request.nextUrl.protocol.replace(/:$/, '') || '').split(',')[0].trim().toLowerCase();

  if (process.env.NODE_ENV === 'production') {
    const isWww = rawHost === 'www.1smartpocket.com';
    const isCanonical = rawHost === '1smartpocket.com' || isWww;
    const needsHttps = rawProto === 'http';

    if (isCanonical && (isWww || needsHttps)) {
      const canonicalUrl = new URL(request.nextUrl.href);
      canonicalUrl.protocol = 'https:';
      canonicalUrl.hostname = '1smartpocket.com';
      canonicalUrl.port = '';
      return NextResponse.redirect(canonicalUrl, 308);
    }
  }

  const publicTechnicalRoutes = new Set([
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.webmanifest',
  ]);

  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (publicTechnicalRoutes.has(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const { supabase, getResponse } = createMiddlewareSupabaseClient(request, requestHeaders);
  const supabaseResponse = getResponse();
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] | null = null;

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const message = String((error as any)?.message || '');
      const isRefreshTokenMissing =
        message.includes('Refresh Token Not Found')
        || message.includes('refresh_token_not_found')
        || message.includes('Invalid Refresh Token');

      if (isRefreshTokenMissing) {
        request.cookies.getAll().forEach((cookie) => {
          if (!cookie.name.startsWith('sb-')) return;
          supabaseResponse.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
        });
        user = null;
      } else {
        user = data.user ?? null;
      }
    } else {
      user = data.user ?? null;
    }
  } catch {
    request.cookies.getAll().forEach((cookie) => {
      if (!cookie.name.startsWith('sb-')) return;
      supabaseResponse.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
    });
    user = null;
  }

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
    '/faqs',
    '/privacy',
    '/terms',
    '/offline',
  '/invite',
  ];

  const isPublicRoute =
    publicTechnicalRoutes.has(pathname) ||
    publicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

  if (pathname === '/') {
    if (!user) {
      // Unauthenticated users stay on public homepage
      return NextResponse.next({ request: { headers: requestHeaders } });
    }

    const { destination, profileError } = await getPostAuthDestination(supabase, user.id, null);
    if (profileError) {
      console.error('[middleware] profile lookup failed:', profileError);
    }
    return redirectWithCookies(destination);
  }

  if (pathname === '/home') {
    // /home permanently redirects to canonical homepage /
    const canonicalUrl = new URL(request.nextUrl.href);
    canonicalUrl.pathname = '/';
    return NextResponse.redirect(canonicalUrl, 308);
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
