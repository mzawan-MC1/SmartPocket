import { NextResponse, type NextRequest } from 'next/server';
import {
  getPostAuthDestination,
  isAuthPagePath,
  isOnboardingPath,
} from '@/lib/auth/redirects';
import { buildAppUrl } from '@/lib/auth/urls';
import {
  buildDesktopEntryPath,
  DESKTOP_MODE_COOKIE_NAME,
  isDesktopShellModeEnabled,
} from '@/lib/desktop-shell';
import {
  copySupabaseCookies,
  createMiddlewareSupabaseClient,
} from '@/lib/supabase/server';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const pathWithSearch = `${pathname}${request.nextUrl.search}`;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-sp-pathname', pathname);
  const userAgent = request.headers.get('user-agent');
  const desktopQuery = request.nextUrl.searchParams.get('desktop');
  requestHeaders.set('x-sp-desktop-query', desktopQuery === '1' ? '1' : '');
  const desktopCookie = request.cookies.get(DESKTOP_MODE_COOKIE_NAME)?.value ?? null;
  const isDesktopShellRequest = isDesktopShellModeEnabled({
    userAgent,
    desktopQuery,
    desktopCookie,
  });
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  const rawHost = (forwardedHost || request.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  const rawProto = (forwardedProto || request.nextUrl.protocol.replace(/:$/, '') || '').split(',')[0].trim().toLowerCase();

  function applyDesktopModeCookie(response: NextResponse) {
    if (isDesktopShellRequest) {
      response.cookies.set(DESKTOP_MODE_COOKIE_NAME, '1', {
        path: '/',
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
      });
    } else if (desktopCookie === '1') {
      response.cookies.set(DESKTOP_MODE_COOKIE_NAME, '', {
        path: '/',
        maxAge: 0,
      });
    }

    return response;
  }

  if (process.env.NODE_ENV === 'production') {
    const isWww = rawHost === 'www.1smartpocket.com';
    const isCanonical = rawHost === '1smartpocket.com' || isWww;
    const needsHttps = rawProto === 'http';

    if (isCanonical && (isWww || needsHttps)) {
      const canonicalUrl = new URL(request.nextUrl.href);
      canonicalUrl.protocol = 'https:';
      canonicalUrl.hostname = '1smartpocket.com';
      canonicalUrl.port = '';
      return applyDesktopModeCookie(NextResponse.redirect(canonicalUrl, 308));
    }
  }

  const publicTechnicalRoutes = new Set([
    '/robots.txt',
    '/sitemap.xml',
    '/manifest.webmanifest',
  ]);

  if (pathname.startsWith('/api/')) {
    return applyDesktopModeCookie(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (pathname.startsWith('/_next/')) {
    return applyDesktopModeCookie(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (pathname.startsWith('/@vite/')) {
    return applyDesktopModeCookie(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  if (publicTechnicalRoutes.has(pathname)) {
    return applyDesktopModeCookie(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const { supabase, getResponse } = createMiddlewareSupabaseClient(request, requestHeaders);
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
        const latestResponse = getResponse();
        request.cookies.getAll().forEach((cookie) => {
          if (!cookie.name.startsWith('sb-')) return;
          latestResponse.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
        });
        user = null;
      } else {
        user = data.user ?? null;
      }
    } else {
      user = data.user ?? null;
    }
  } catch {
    const latestResponse = getResponse();
    request.cookies.getAll().forEach((cookie) => {
      if (!cookie.name.startsWith('sb-')) return;
      latestResponse.cookies.set(cookie.name, '', { path: '/', maxAge: 0 });
    });
    user = null;
  }

  const shouldLogAuthDiagnostics =
    isAuthPagePath(pathname) || pathname.startsWith('/onboarding') || pathname.startsWith('/dashboard');

  if (process.env.NODE_ENV !== 'production' && shouldLogAuthDiagnostics) {
    console.info('[middleware]', pathname, user ? 'user' : 'guest');
  }

  function redirectWithCookies(destination: string): NextResponse {
    return applyDesktopModeCookie(copySupabaseCookies(
      getResponse(),
      NextResponse.redirect(buildAppUrl(destination, request))
    ));
  }

  function redirectDesktopEntry() {
    return redirectWithCookies(buildDesktopEntryPath());
  }

  const publicPrefixes = [
    '/sign-up-login',
    '/auth/',
    '/home',
    '/desktop-app',
    '/about',
    '/features',
    '/pricing',
    '/blog',
    '/security',
    '/ai-receipt-scanner',
    '/ai-voice-expense-tracker',
    '/family-budget-app',
    '/shared-expenses',
    '/multi-currency-expense-tracker',
    '/expense-tracker-uae',
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

  const blockedDesktopPublicPrefixes = [
    '/home',
    '/desktop-app',
    '/about',
    '/features',
    '/pricing',
    '/blog',
    '/security',
    '/ai-receipt-scanner',
    '/ai-voice-expense-tracker',
    '/family-budget-app',
    '/shared-expenses',
    '/multi-currency-expense-tracker',
    '/expense-tracker-uae',
    '/contact',
    '/faqs',
    '/privacy',
    '/terms',
    '/offline',
    '/invite',
  ];

  const isBlockedDesktopPublicRoute =
    pathname === '/'
    || blockedDesktopPublicPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix));

  if (isDesktopShellRequest && isBlockedDesktopPublicRoute) {
    return user ? redirectWithCookies('/dashboard') : redirectDesktopEntry();
  }

  if (pathname === '/') {
    if (!user) {
      // Unauthenticated users stay on public homepage
      return applyDesktopModeCookie(NextResponse.next({ request: { headers: requestHeaders } }));
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
    return applyDesktopModeCookie(NextResponse.redirect(canonicalUrl, 308));
  }

  if (!user && !isPublicRoute) {
    const redirectUrl = buildAppUrl(
      isDesktopShellRequest ? buildDesktopEntryPath() : '/sign-up-login',
      request
    );
    redirectUrl.searchParams.set('next', pathWithSearch);
    return applyDesktopModeCookie(copySupabaseCookies(getResponse(), NextResponse.redirect(redirectUrl)));
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
      const redirectUrl = buildAppUrl(
        isDesktopShellRequest ? buildDesktopEntryPath() : '/sign-up-login',
        request
      );
      redirectUrl.searchParams.set('next', pathWithSearch);
      return applyDesktopModeCookie(copySupabaseCookies(getResponse(), NextResponse.redirect(redirectUrl)));
    }

    const appMetadata = user.app_metadata || {};
    const isAdmin = appMetadata.role === 'admin';

    if (!isAdmin) {
      return redirectWithCookies('/dashboard');
    }
  }

  return applyDesktopModeCookie(getResponse());
}

export const config = {
  matcher: [
    '/((?!_next|favicon.ico|assets|currencies|manifest.json|@vite|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
