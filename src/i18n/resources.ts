import enCommon from './locales/en/common.json';
import enAuth from './locales/en/auth.json';
import enDashboard from './locales/en/dashboard.json';
import enTransactions from './locales/en/transactions.json';
import enBudgets from './locales/en/budgets.json';
import enReports from './locales/en/reports.json';
import enSettings from './locales/en/settings.json';
import enAdmin from './locales/en/admin.json';
import enValidation from './locales/en/validation.json';
import enPeople from './locales/en/people.json';
import enPublic from './locales/en/public.json';
import enPortal from './locales/en/portal.json';
import arCommon from './locales/ar/common.json';
import arAuth from './locales/ar/auth.json';
import arDashboard from './locales/ar/dashboard.json';
import arTransactions from './locales/ar/transactions.json';
import arBudgets from './locales/ar/budgets.json';
import arReports from './locales/ar/reports.json';
import arSettings from './locales/ar/settings.json';
import arAdmin from './locales/ar/admin.json';
import arValidation from './locales/ar/validation.json';
import arPeople from './locales/ar/people.json';
import arPublic from './locales/ar/public.json';
import arPortal from './locales/ar/portal.json';
import frCommon from './locales/fr/common.json';
import frAuth from './locales/fr/auth.json';
import frDashboard from './locales/fr/dashboard.json';
import frTransactions from './locales/fr/transactions.json';
import frBudgets from './locales/fr/budgets.json';
import frReports from './locales/fr/reports.json';
import frSettings from './locales/fr/settings.json';
import frAdmin from './locales/fr/admin.json';
import frValidation from './locales/fr/validation.json';
import frPeople from './locales/fr/people.json';
import frPublic from './locales/fr/public.json';
import frPortal from './locales/fr/portal.json';
import ruCommon from './locales/ru/common.json';
import ruAuth from './locales/ru/auth.json';
import ruDashboard from './locales/ru/dashboard.json';
import ruTransactions from './locales/ru/transactions.json';
import ruBudgets from './locales/ru/budgets.json';
import ruReports from './locales/ru/reports.json';
import ruSettings from './locales/ru/settings.json';
import ruAdmin from './locales/ru/admin.json';
import ruValidation from './locales/ru/validation.json';
import ruPeople from './locales/ru/people.json';
import ruPublic from './locales/ru/public.json';
import ruPortal from './locales/ru/portal.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' as const },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' as const },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' as const },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr' as const },
];

export type SupportedLanguage = 'en' | 'ar' | 'fr' | 'ru';
export type TranslationNamespace =
  | 'common'
  | 'auth'
  | 'dashboard'
  | 'transactions'
  | 'budgets'
  | 'reports'
  | 'settings'
  | 'admin'
  | 'validation'
  | 'people'
  | 'public'
  | 'portal';

export const I18N_NAMESPACES: TranslationNamespace[] = [
  'common',
  'auth',
  'dashboard',
  'transactions',
  'budgets',
  'reports',
  'settings',
  'admin',
  'validation',
  'people',
  'public',
  'portal',
];

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en';
export const I18N_STORAGE_KEY = 'sp_language';
export const I18N_COOKIE_NAME = 'sp_language';

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return value === 'en' || value === 'ar' || value === 'fr' || value === 'ru';
}

export function isRTL(language: string) {
  return language === 'ar';
}

export const BASE_I18N_RESOURCES: Record<SupportedLanguage, Record<TranslationNamespace, Record<string, unknown>>> = {
  en: {
    common: enCommon,
    auth: enAuth,
    dashboard: enDashboard,
    transactions: enTransactions,
    budgets: enBudgets,
    reports: enReports,
    settings: enSettings,
    admin: enAdmin,
    validation: enValidation,
    people: enPeople,
    public: enPublic,
    portal: enPortal,
  },
  ar: {
    common: arCommon,
    auth: arAuth,
    dashboard: arDashboard,
    transactions: arTransactions,
    budgets: arBudgets,
    reports: arReports,
    settings: arSettings,
    admin: arAdmin,
    validation: arValidation,
    people: arPeople,
    public: arPublic,
    portal: arPortal,
  },
  fr: {
    common: frCommon,
    auth: frAuth,
    dashboard: frDashboard,
    transactions: frTransactions,
    budgets: frBudgets,
    reports: frReports,
    settings: frSettings,
    admin: frAdmin,
    validation: frValidation,
    people: frPeople,
    public: frPublic,
    portal: frPortal,
  },
  ru: {
    common: ruCommon,
    auth: ruAuth,
    dashboard: ruDashboard,
    transactions: ruTransactions,
    budgets: ruBudgets,
    reports: ruReports,
    settings: ruSettings,
    admin: ruAdmin,
    validation: ruValidation,
    people: ruPeople,
    public: ruPublic,
    portal: ruPortal,
  },
};
