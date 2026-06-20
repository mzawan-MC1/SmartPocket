'use client';

import React, { useEffect, useRef } from 'react';
import i18n from '@/i18n/config';
import { applyCmsResourcesToI18n, loadCmsResourcesForLanguage } from '@/i18n/cms';
import { useLanguage } from '@/contexts/LanguageContext';

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const syncLanguageRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    syncLanguageRef.current = language;

    void loadCmsResourcesForLanguage(language)
      .then((resources) => {
        if (cancelled || syncLanguageRef.current !== language) {
          return;
        }

        applyCmsResourcesToI18n(i18n, resources);

        if (i18n.resolvedLanguage !== language) {
          void i18n.changeLanguage(language);
        }
      })
      .catch(() => {
        // Base local resources remain available as the fallback path.
      });

    return () => {
      cancelled = true;
    };
  }, [language]);

  return <>{children}</>;
}
