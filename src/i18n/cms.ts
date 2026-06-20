import type i18n from 'i18next';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_LANGUAGE,
  I18N_NAMESPACES,
  type SupportedLanguage,
  type TranslationNamespace,
} from '@/i18n/resources';

type CmsTranslationRow = {
  content_type: string;
  content_key: string;
  language: SupportedLanguage;
  value: string;
};

type NamespaceResources = Partial<Record<TranslationNamespace, Record<string, unknown>>>;
type CachedLanguageResources = Partial<Record<SupportedLanguage, NamespaceResources>>;

type CacheEntry = {
  fetchedAt: number;
  resources: CachedLanguageResources;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const STORAGE_PREFIX = 'smartpocket.cms-i18n.';
const memoryCache = new Map<SupportedLanguage, CacheEntry>();
const inFlight = new Map<SupportedLanguage, Promise<CachedLanguageResources>>();

function getStorageKey(language: SupportedLanguage) {
  return `${STORAGE_PREFIX}${language}`;
}

function shouldUseCache(entry: CacheEntry | null | undefined) {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

function safeReadCachedResources(language: SupportedLanguage) {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(language));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as CacheEntry;
    return shouldUseCache(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeWriteCachedResources(language: SupportedLanguage, entry: CacheEntry) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getStorageKey(language), JSON.stringify(entry));
  } catch {
    // Ignore quota or serialization failures and keep the in-memory cache.
  }
}

function setNestedValue(target: Record<string, unknown>, dottedKey: string, value: string) {
  const parts = dottedKey.split('.').filter(Boolean);
  if (parts.length === 0) return;

  let cursor: Record<string, unknown> = target;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const isLeaf = index === parts.length - 1;
    if (isLeaf) {
      cursor[part] = value;
      return;
    }

    const nextValue = cursor[part];
    if (!nextValue || typeof nextValue !== 'object' || Array.isArray(nextValue)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
}

function buildEmptyResourceMap(): CachedLanguageResources {
  return {
    en: {},
    ar: {},
    fr: {},
    ru: {},
  };
}

function normalizeContentType(value: string): TranslationNamespace | null {
  return I18N_NAMESPACES.includes(value as TranslationNamespace)
    ? (value as TranslationNamespace)
    : null;
}

function rowsToResourceMap(rows: CmsTranslationRow[]) {
  const resources = buildEmptyResourceMap();

  for (const row of rows) {
    const namespace = normalizeContentType(row.content_type);
    if (!namespace) continue;

    if (!resources[row.language]) {
      resources[row.language] = {};
    }
    if (!resources[row.language]![namespace]) {
      resources[row.language]![namespace] = {};
    }

    setNestedValue(resources[row.language]![namespace]!, row.content_key, row.value);
  }

  return resources;
}

async function fetchCmsResources(language: SupportedLanguage) {
  const languages =
    language === DEFAULT_LANGUAGE ? [DEFAULT_LANGUAGE] : [DEFAULT_LANGUAGE, language];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('cms_translations')
    .select('content_type,content_key,language,value')
    .in('content_type', I18N_NAMESPACES)
    .in('language', languages)
    .eq('is_approved', true)
    .eq('is_published', true);

  if (error) {
    throw error;
  }

  return rowsToResourceMap((data ?? []) as CmsTranslationRow[]);
}

export async function loadCmsResourcesForLanguage(language: SupportedLanguage) {
  const memoryEntry = memoryCache.get(language);
  if (shouldUseCache(memoryEntry)) {
    return memoryEntry!.resources;
  }

  const storedEntry = safeReadCachedResources(language);
  if (storedEntry) {
    memoryCache.set(language, storedEntry);
    return storedEntry.resources;
  }

  const existingPromise = inFlight.get(language);
  if (existingPromise) {
    return existingPromise;
  }

  const nextPromise = fetchCmsResources(language)
    .then((resources) => {
      const entry = {
        fetchedAt: Date.now(),
        resources,
      };
      memoryCache.set(language, entry);
      safeWriteCachedResources(language, entry);
      return resources;
    })
    .finally(() => {
      inFlight.delete(language);
    });

  inFlight.set(language, nextPromise);
  return nextPromise;
}

export function applyCmsResourcesToI18n(
  instance: typeof i18n,
  resources: CachedLanguageResources
) {
  for (const language of Object.keys(resources) as SupportedLanguage[]) {
    const namespaces = resources[language];
    if (!namespaces) continue;

    for (const namespace of Object.keys(namespaces) as TranslationNamespace[]) {
      const bundle = namespaces[namespace];
      if (!bundle) continue;

      instance.addResourceBundle(language, namespace, bundle, true, true);
    }
  }
}

export function clearCmsResourceCache(language?: SupportedLanguage) {
  if (language) {
    memoryCache.delete(language);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(getStorageKey(language));
    }
    return;
  }

  memoryCache.clear();
  if (typeof window !== 'undefined') {
    (['en', 'ar', 'fr', 'ru'] as SupportedLanguage[]).forEach((code) => {
      window.localStorage.removeItem(getStorageKey(code));
    });
  }
}
