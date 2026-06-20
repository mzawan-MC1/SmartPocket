'use client';

import React, { useEffect } from 'react';
import i18n from '@/i18n/config';
import { applyCmsResourcesToI18n, loadCmsResourcesForLanguage } from '@/i18n/cms';
import { useLanguage } from '@/contexts/LanguageContext';

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();

  useEffect(() => {
    void loadCmsResourcesForLanguage(language)
      .then((resources) => {
        applyCmsResourcesToI18n(i18n, resources);
        if (i18n.language !== language) {
          void i18n.changeLanguage(language);
        }
      })
      .catch(() => {
        // Base local resources remain available as the fallback path.
      });
  }, [language]);

  return <>{children}</>;
}
