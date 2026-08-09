export const LANGUAGE_CODES = ['en', 'ar', 'fr', 'ru', 'tr', 'zh-CN', 'es', 'pt-BR'] as const;

export type SupportedLanguage = (typeof LANGUAGE_CODES)[number];

export type LanguageDirection = 'ltr' | 'rtl';

export type LanguageRegistryEntry = {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  dir: LanguageDirection;
  flag: string;
  intlLocale: string;
  ogLocale: string;
  rtl: boolean;
};

export const LANGUAGE_REGISTRY: Record<SupportedLanguage, LanguageRegistryEntry> = {
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    dir: 'ltr',
    flag: '🇬🇧',
    intlLocale: 'en-GB',
    ogLocale: 'en_US',
    rtl: false,
  },
  ar: {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    dir: 'rtl',
    flag: '🇦🇪',
    intlLocale: 'ar-AE',
    ogLocale: 'ar_AR',
    rtl: true,
  },
  fr: {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    dir: 'ltr',
    flag: '🇫🇷',
    intlLocale: 'fr-FR',
    ogLocale: 'fr_FR',
    rtl: false,
  },
  ru: {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    dir: 'ltr',
    flag: '🇷🇺',
    intlLocale: 'ru-RU',
    ogLocale: 'ru_RU',
    rtl: false,
  },
  tr: {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    dir: 'ltr',
    flag: '🇹🇷',
    intlLocale: 'tr-TR',
    ogLocale: 'tr_TR',
    rtl: false,
  },
  'zh-CN': {
    code: 'zh-CN',
    name: 'Simplified Chinese',
    nativeName: '简体中文',
    dir: 'ltr',
    flag: '🇨🇳',
    intlLocale: 'zh-CN',
    ogLocale: 'zh_CN',
    rtl: false,
  },
  es: {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    dir: 'ltr',
    flag: '🇪🇸',
    intlLocale: 'es-ES',
    ogLocale: 'es_ES',
    rtl: false,
  },
  'pt-BR': {
    code: 'pt-BR',
    name: 'Brazilian Portuguese',
    nativeName: 'Português (Brasil)',
    dir: 'ltr',
    flag: '🇧🇷',
    intlLocale: 'pt-BR',
    ogLocale: 'pt_BR',
    rtl: false,
  },
};

export const SUPPORTED_LANGUAGES: LanguageRegistryEntry[] = LANGUAGE_CODES.map(
  (code) => LANGUAGE_REGISTRY[code]
);

export const SUPPORTED_LANGUAGE_CODES: SupportedLanguage[] = [...LANGUAGE_CODES];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';

export const I18N_STORAGE_KEY = 'sp_language';
export const I18N_COOKIE_NAME = 'sp_language';

const SUPPORTED_LANGUAGE_SET = new Set<string>(LANGUAGE_CODES);

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  if (!value) return false;
  return SUPPORTED_LANGUAGE_SET.has(value);
}

export function isRTL(language: string) {
  return language === 'ar';
}

export function getLanguageRegistryEntry(code: string | SupportedLanguage): LanguageRegistryEntry {
  const safe = isSupportedLanguage(code) ? code : DEFAULT_LANGUAGE;
  return LANGUAGE_REGISTRY[safe];
}

export function getIntlLocale(lang: string): string {
  return getLanguageRegistryEntry(lang).intlLocale;
}

export function getOgLocale(lang: string): string {
  return getLanguageRegistryEntry(lang).ogLocale;
}
