'use client';

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  BASE_I18N_RESOURCES,
  DEFAULT_LANGUAGE,
  I18N_NAMESPACES,
  isRTL,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/i18n/resources';

if (!i18n.isInitialized) {
  i18n
    .use(initReactI18next)
    .init({
      resources: BASE_I18N_RESOURCES,
      lng: DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      defaultNS: 'common',
      ns: I18N_NAMESPACES,
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });
}

export default i18n;
