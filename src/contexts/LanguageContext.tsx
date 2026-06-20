'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_LANGUAGE,
  I18N_COOKIE_NAME,
  I18N_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  isRTL,
  isSupportedLanguage,
  type SupportedLanguage,
} from '@/i18n/resources';

interface LanguageContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  dir: 'ltr' | 'rtl';
  isRTL: boolean;
  supportedLanguages: typeof SUPPORTED_LANGUAGES;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  dir: 'ltr',
  isRTL: false,
  supportedLanguages: SUPPORTED_LANGUAGES,
});

export const useLanguage = () => useContext(LanguageContext);

function persistBrowserLanguage(language: SupportedLanguage) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(I18N_STORAGE_KEY, language);
  document.cookie = `${I18N_COOKIE_NAME}=${encodeURIComponent(language)}; path=/; max-age=31536000; samesite=lax`;
}

function readBrowserLanguage() {
  if (typeof window === 'undefined') return null;

  const stored = window.localStorage.getItem(I18N_STORAGE_KEY);
  return isSupportedLanguage(stored) ? stored : null;
}

export function LanguageProvider({
  children,
  initialLanguage = DEFAULT_LANGUAGE,
}: {
  children: React.ReactNode;
  initialLanguage?: SupportedLanguage;
}) {
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { localization } = usePlatformSettings();
  const [language, setLanguageState] = useState<SupportedLanguage>(initialLanguage);
  const profileRequestRef = useRef<string | null>(null);
  const isAdminRoute = pathname.startsWith('/admin');
  const effectiveLanguage = isAdminRoute ? DEFAULT_LANGUAGE : language;
  const supportedLanguages = useMemo(() => {
    const enabled = new Set<SupportedLanguage>(localization.enabledLanguages || []);
    return SUPPORTED_LANGUAGES.filter((entry) => enabled.has(entry.code as SupportedLanguage));
  }, [localization.enabledLanguages]);

  useEffect(() => {
    if (isAdminRoute) return;

    const browserLanguage = readBrowserLanguage();
    if (browserLanguage && browserLanguage !== language) {
      setLanguageState(browserLanguage);
      return;
    }

    const platformLanguage = isSupportedLanguage(localization.defaultLanguage)
      ? localization.defaultLanguage
      : DEFAULT_LANGUAGE;
    if (platformLanguage !== language) {
      setLanguageState(platformLanguage);
    }
  }, [isAdminRoute, language, localization.defaultLanguage]);

  useEffect(() => {
    const dir = isRTL(effectiveLanguage) ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = effectiveLanguage;

    import('@/i18n/config').then(({ default: i18n }) => {
      if (i18n.language !== effectiveLanguage) {
        i18n.changeLanguage(effectiveLanguage);
      }
    });
  }, [effectiveLanguage]);

  useEffect(() => {
    if (authLoading || isAdminRoute || !user?.id) {
      return;
    }

    if (profileRequestRef.current === user.id) {
      return;
    }

    profileRequestRef.current = user.id;
    const supabase = createClient();

    void supabase
      .from('user_profiles')
      .select('preferred_language')
      .eq('id', user.id)
      .single()
      .then((result: { data: { preferred_language: string | null } | null; error: unknown }) => {
        const { data, error } = result;
        if (error) return;
        if (!isSupportedLanguage(data?.preferred_language)) return;

        if (data.preferred_language !== language) {
          setLanguageState(data.preferred_language);
        }
        persistBrowserLanguage(data.preferred_language);
      });
  }, [authLoading, isAdminRoute, language, user?.id]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    if (isAdminRoute || !isSupportedLanguage(lang)) return;

    setLanguageState(lang);
    persistBrowserLanguage(lang);

    if (user?.id) {
      const supabase = createClient();
      void supabase
        .from('user_profiles')
        .update({ preferred_language: lang })
        .eq('id', user.id);
    }
  }, [isAdminRoute, user?.id]);

  const dir = isRTL(effectiveLanguage) ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider
      value={{
        language: effectiveLanguage,
        setLanguage,
        dir,
        isRTL: isRTL(effectiveLanguage),
        supportedLanguages,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
