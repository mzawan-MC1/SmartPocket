'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { SupportedLanguage, isRTL, SUPPORTED_LANGUAGES } from '@/i18n/config';

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

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Read from localStorage on mount
    const stored = localStorage.getItem('sp_language') as SupportedLanguage | null;
    const valid = SUPPORTED_LANGUAGES.map((l) => l.code);
    if (stored && valid.includes(stored)) {
      setLanguageState(stored);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    // Apply direction to document
    const dir = isRTL(language) ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
    // Update i18n
    import('@/i18n/config').then(({ default: i18n }) => {
      if (i18n.language !== language) {
        i18n.changeLanguage(language);
      }
    });
  }, [language, mounted]);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang);
    localStorage.setItem('sp_language', lang);
  }, []);

  const dir = isRTL(language) ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        dir,
        isRTL: isRTL(language),
        supportedLanguages: SUPPORTED_LANGUAGES,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}
