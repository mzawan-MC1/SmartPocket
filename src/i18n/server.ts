import 'server-only';

import { cookies, headers } from 'next/headers';
import { createServerComponentSupabaseClient } from '@/lib/supabase/server';
import type { PlatformSettingsSnapshot } from '@/lib/platform-settings';
import {
  DEFAULT_LANGUAGE,
  isRTL,
  isSupportedLanguage,
  type SupportedLanguage,
} from '@/i18n/resources';

const I18N_COOKIE_NAME = 'sp_language';

export type InitialI18nState = {
  language: SupportedLanguage;
  dir: 'ltr' | 'rtl';
  isAdminRoute: boolean;
};

async function getRequestPathname() {
  const requestHeaders = await headers();
  return requestHeaders.get('x-sp-pathname') || '';
}

async function getBrowserPreference() {
  const cookieStore = await cookies();
  const cookieLanguage = cookieStore.get(I18N_COOKIE_NAME)?.value;
  return isSupportedLanguage(cookieLanguage) ? cookieLanguage : null;
}

async function getProfilePreference() {
  try {
    const supabase = await createServerComponentSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) return null;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('preferred_language')
      .eq('id', user.id)
      .single();

    if (error) return null;

    return isSupportedLanguage(data?.preferred_language)
      ? data.preferred_language
      : null;
  } catch {
    return null;
  }
}

export async function resolveInitialI18nState(
  settings: PlatformSettingsSnapshot
): Promise<InitialI18nState> {
  const pathname = await getRequestPathname();
  const isAdminRoute = pathname.startsWith('/admin');

  if (isAdminRoute) {
    return {
      language: DEFAULT_LANGUAGE,
      dir: 'ltr',
      isAdminRoute: true,
    };
  }

  const profileLanguage = await getProfilePreference();
  const browserLanguage = await getBrowserPreference();
  const platformLanguage = isSupportedLanguage(settings.localization.defaultLanguage)
    ? settings.localization.defaultLanguage
    : DEFAULT_LANGUAGE;
  const language = profileLanguage || browserLanguage || platformLanguage || DEFAULT_LANGUAGE;

  return {
    language,
    dir: isRTL(language) ? 'rtl' : 'ltr',
    isAdminRoute: false,
  };
}
