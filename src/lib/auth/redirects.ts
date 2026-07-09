import type { SupabaseClient } from '@supabase/supabase-js';

export function getSafeNextPath(next: string | null): string | null {
  if (!next) return null;

  try {
    const parsedUrl = new URL(next, 'https://smartpocket.local');
    if (parsedUrl.origin !== 'https://smartpocket.local') {
      return null;
    }

    const { pathname, search, hash } = parsedUrl;
    if (!pathname.startsWith('/') || pathname.startsWith('//')) return null;
    if (pathname === '/api' || pathname.startsWith('/api/')) return null;
    if (pathname.startsWith('/sign-up-login') || pathname.startsWith('/auth/')) return null;

    return `${pathname}${search}${hash}`;
  } catch {
    return null;
  }
}

export async function getPostAuthDestination(
  supabase: SupabaseClient,
  userId: string,
  next: string | null
) {
  const safeNext = getSafeNextPath(next);
  const { data: profile, error } = await supabase
    .from('user_profiles')
    .select('onboarding_completed_at')
    .eq('id', userId)
    .maybeSingle();

  const hasCompletedOnboarding = Boolean(profile?.onboarding_completed_at);

  if (error) {
    return {
      hasCompletedOnboarding: false,
      destination: '/onboarding',
      profileError: error.message,
    };
  }

  if (!hasCompletedOnboarding) {
    return {
      hasCompletedOnboarding: false,
      destination: '/onboarding',
      profileError: null,
    };
  }

  return {
    hasCompletedOnboarding: true,
    destination: safeNext ?? '/dashboard',
    profileError: null,
  };
}

export function isAuthPagePath(pathname: string) {
  return pathname === '/sign-up-login' || pathname.startsWith('/sign-up-login/');
}

export function isOnboardingPath(pathname: string) {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/');
}
