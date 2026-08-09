import {
  LANGUAGE_CODES,
  LANGUAGE_REGISTRY,
  SUPPORTED_LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
  I18N_STORAGE_KEY,
  I18N_COOKIE_NAME,
  isSupportedLanguage,
  isRTL,
  getLanguageRegistryEntry,
  getIntlLocale,
  getOgLocale,
  type SupportedLanguage,
  type LanguageRegistryEntry,
  type LanguageDirection,
} from './registry';

export {
  LANGUAGE_CODES,
  LANGUAGE_REGISTRY,
  SUPPORTED_LANGUAGES,
  SUPPORTED_LANGUAGE_CODES,
  DEFAULT_LANGUAGE,
  I18N_STORAGE_KEY,
  I18N_COOKIE_NAME,
  isSupportedLanguage,
  isRTL,
  getLanguageRegistryEntry,
  getIntlLocale,
  getOgLocale,
  type SupportedLanguage,
  type LanguageRegistryEntry,
  type LanguageDirection,
};

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
import trCommon from './locales/tr/common.json';
import trAuth from './locales/tr/auth.json';
import trDashboard from './locales/tr/dashboard.json';
import trTransactions from './locales/tr/transactions.json';
import trBudgets from './locales/tr/budgets.json';
import trReports from './locales/tr/reports.json';
import trSettings from './locales/tr/settings.json';
import trAdmin from './locales/tr/admin.json';
import trValidation from './locales/tr/validation.json';
import trPeople from './locales/tr/people.json';
import trPublic from './locales/tr/public.json';
import trPortal from './locales/tr/portal.json';
import zhCnCommon from './locales/zh-CN/common.json';
import zhCnAuth from './locales/zh-CN/auth.json';
import zhCnDashboard from './locales/zh-CN/dashboard.json';
import zhCnTransactions from './locales/zh-CN/transactions.json';
import zhCnBudgets from './locales/zh-CN/budgets.json';
import zhCnReports from './locales/zh-CN/reports.json';
import zhCnSettings from './locales/zh-CN/settings.json';
import zhCnAdmin from './locales/zh-CN/admin.json';
import zhCnValidation from './locales/zh-CN/validation.json';
import zhCnPeople from './locales/zh-CN/people.json';
import zhCnPublic from './locales/zh-CN/public.json';
import zhCnPortal from './locales/zh-CN/portal.json';
import esCommon from './locales/es/common.json';
import esAuth from './locales/es/auth.json';
import esDashboard from './locales/es/dashboard.json';
import esTransactions from './locales/es/transactions.json';
import esBudgets from './locales/es/budgets.json';
import esReports from './locales/es/reports.json';
import esSettings from './locales/es/settings.json';
import esAdmin from './locales/es/admin.json';
import esValidation from './locales/es/validation.json';
import esPeople from './locales/es/people.json';
import esPublic from './locales/es/public.json';
import esPortal from './locales/es/portal.json';
import ptBrCommon from './locales/pt-BR/common.json';
import ptBrAuth from './locales/pt-BR/auth.json';
import ptBrDashboard from './locales/pt-BR/dashboard.json';
import ptBrTransactions from './locales/pt-BR/transactions.json';
import ptBrBudgets from './locales/pt-BR/budgets.json';
import ptBrReports from './locales/pt-BR/reports.json';
import ptBrSettings from './locales/pt-BR/settings.json';
import ptBrAdmin from './locales/pt-BR/admin.json';
import ptBrValidation from './locales/pt-BR/validation.json';
import ptBrPeople from './locales/pt-BR/people.json';
import ptBrPublic from './locales/pt-BR/public.json';
import ptBrPortal from './locales/pt-BR/portal.json';

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
  tr: {
    common: trCommon,
    auth: trAuth,
    dashboard: trDashboard,
    transactions: trTransactions,
    budgets: trBudgets,
    reports: trReports,
    settings: trSettings,
    admin: trAdmin,
    validation: trValidation,
    people: trPeople,
    public: trPublic,
    portal: trPortal,
  },
  'zh-CN': {
    common: zhCnCommon,
    auth: zhCnAuth,
    dashboard: zhCnDashboard,
    transactions: zhCnTransactions,
    budgets: zhCnBudgets,
    reports: zhCnReports,
    settings: zhCnSettings,
    admin: zhCnAdmin,
    validation: zhCnValidation,
    people: zhCnPeople,
    public: zhCnPublic,
    portal: zhCnPortal,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    dashboard: esDashboard,
    transactions: esTransactions,
    budgets: esBudgets,
    reports: esReports,
    settings: esSettings,
    admin: esAdmin,
    validation: esValidation,
    people: esPeople,
    public: esPublic,
    portal: esPortal,
  },
  'pt-BR': {
    common: ptBrCommon,
    auth: ptBrAuth,
    dashboard: ptBrDashboard,
    transactions: ptBrTransactions,
    budgets: ptBrBudgets,
    reports: ptBrReports,
    settings: ptBrSettings,
    admin: ptBrAdmin,
    validation: ptBrValidation,
    people: ptBrPeople,
    public: ptBrPublic,
    portal: ptBrPortal,
  },
};
