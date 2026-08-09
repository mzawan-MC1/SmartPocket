import 'server-only';

import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  deriveCmsExcerpt,
  deriveCmsOgDescription,
  deriveCmsOgTitle,
  deriveCmsSeoDescription,
  deriveCmsSeoKeywords,
  deriveCmsSeoTitle,
  deriveCmsTwitterDescription,
  deriveCmsTwitterTitle,
  getCmsPageNavigationLabel,
  sanitizeRichTextHtml,
  type CmsContentType,
  type CmsPageRecord,
} from '@/lib/cms-pages';
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from '@/i18n/registry';

export type PublicCmsPage = CmsPageRecord & {
  navigation_label_resolved: string;
  excerpt_resolved: string;
  seo_title_resolved: string;
  seo_description_resolved: string;
  seo_keywords_resolved: string[];
  og_title_resolved: string;
  og_description_resolved: string;
  twitter_title_resolved: string;
  twitter_description_resolved: string;
  content_html_sanitized: string;
};

async function createAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function normalizePage(page: CmsPageRecord | null) {
  if (!page) {
    return null;
  }

  return {
    ...page,
    navigation_label_resolved: getCmsPageNavigationLabel(page),
    excerpt_resolved: deriveCmsExcerpt(page),
    seo_title_resolved: deriveCmsSeoTitle(page),
    seo_description_resolved: deriveCmsSeoDescription(page),
    seo_keywords_resolved: deriveCmsSeoKeywords(page),
    og_title_resolved: deriveCmsOgTitle(page),
    og_description_resolved: deriveCmsOgDescription(page),
    twitter_title_resolved: deriveCmsTwitterTitle(page),
    twitter_description_resolved: deriveCmsTwitterDescription(page),
    content_html_sanitized: sanitizeRichTextHtml(page.content_html || ''),
  } satisfies PublicCmsPage;
}

async function readPublicCmsPageWithAnonClient(slug: string, contentType: CmsContentType) {
  const supabase = await createAnonClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from('cms_pages')
    .select('*')
    .eq('slug', slug);

  if (contentType === 'blog') {
    query = query.eq('content_type', 'blog');
  } else if (contentType === 'page') {
    query = query.eq('content_type', 'page');
  }

  const { data, error } = await query.maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return (data as CmsPageRecord | null) || null;
}

async function readPublicCmsPageWithAdminClient(slug: string, contentType: CmsContentType) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  let query = admin
    .from('cms_pages')
    .select('*')
    .eq('slug', slug);

  if (contentType === 'blog') {
    query = query.eq('content_type', 'blog');
  } else if (contentType === 'page') {
    query = query.eq('content_type', 'page');
  }

  const { data, error } = await query.maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  const page = (data as CmsPageRecord | null) || null;
  if (!page || page.status !== 'published' || !page.is_enabled) {
    return page;
  }

  return page;
}

async function readPublicCmsPagesWithAnonClient(contentType: CmsContentType) {
  const supabase = await createAnonClient();
  if (!supabase) {
    return null;
  }

  let query = supabase
    .from('cms_pages')
    .select('*')
    .eq('status', 'published')
    .eq('is_enabled', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (contentType === 'blog') {
    query = query.eq('content_type', 'blog');
  } else if (contentType === 'page') {
    query = query.eq('content_type', 'page');
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data as CmsPageRecord[] | null) || [];
}

async function readPublicCmsPagesWithAdminClient(contentType: CmsContentType) {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  let query = admin
    .from('cms_pages')
    .select('*')
    .eq('status', 'published')
    .eq('is_enabled', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('sort_order', { ascending: true })
    .order('title', { ascending: true });

  if (contentType === 'blog') {
    query = query.eq('content_type', 'blog');
  } else if (contentType === 'page') {
    query = query.eq('content_type', 'page');
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data as CmsPageRecord[] | null) || [];
}

async function getPublicCmsContentBySlugInternal(
  slug: string,
  contentType: CmsContentType
): Promise<PublicCmsPage | null> {
  noStore();

  try {
    const anonPage = await readPublicCmsPageWithAnonClient(slug, contentType);
    if (anonPage) {
      return normalizePage(anonPage);
    }
  } catch {}

  try {
    const adminPage = await readPublicCmsPageWithAdminClient(slug, contentType);
    if (adminPage && adminPage.status === 'published' && adminPage.is_enabled) {
      return normalizePage(adminPage);
    }
  } catch {}

  return null;
}

export const getPublicCmsPageBySlug = cache(async (slug: string): Promise<PublicCmsPage | null> =>
  getPublicCmsContentBySlugInternal(slug, 'page')
);

export const getPublicBlogPostBySlug = cache(async (slug: string): Promise<PublicCmsPage | null> =>
  getPublicCmsContentBySlugInternal(slug, 'blog')
);

export const getAnyCmsPageBySlug = cache(async (slug: string): Promise<CmsPageRecord | null> => {
  noStore();

  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from('cms_pages')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return (data as CmsPageRecord | null) || null;
});

async function listPublicCmsContentInternal(contentType: CmsContentType): Promise<PublicCmsPage[]> {
  noStore();

  try {
    const anonPages = await readPublicCmsPagesWithAnonClient(contentType);
    if (anonPages) {
      return anonPages.map((page) => normalizePage(page)!).filter(Boolean);
    }
  } catch {}

  try {
    const adminPages = await readPublicCmsPagesWithAdminClient(contentType);
    if (adminPages) {
      return adminPages.map((page) => normalizePage(page)!).filter(Boolean);
    }
  } catch {}

  return [];
}

export const listPublicCmsPages = cache(async (): Promise<PublicCmsPage[]> =>
  listPublicCmsContentInternal('page')
);

export const listPublicBlogPosts = cache(async (): Promise<PublicCmsPage[]> =>
  listPublicCmsContentInternal('blog')
);

export const listFeaturedBlogPosts = cache(async (): Promise<PublicCmsPage[]> => {
  const posts = await listPublicBlogPosts();
  return posts.filter((post) => post.is_featured);
});

export async function listRelatedBlogPosts(
  currentPost: Pick<PublicCmsPage, 'id' | 'category' | 'tags'>,
  limit = 3
): Promise<PublicCmsPage[]> {
  const posts = await listPublicBlogPosts();
  const currentTags = new Set((currentPost.tags || []).map((tag) => tag.toLowerCase()));

  return posts
    .filter((post) => post.id !== currentPost.id)
    .map((post) => {
      const sharedTagCount = (post.tags || []).reduce(
        (count, tag) => count + (currentTags.has(tag.toLowerCase()) ? 1 : 0),
        0
      );
      const sameCategory =
        currentPost.category &&
        post.category &&
        currentPost.category.trim().toLowerCase() === post.category.trim().toLowerCase();

      return {
        post,
        score: (sameCategory ? 5 : 0) + sharedTagCount,
      };
    })
    .filter((entry) => entry.score > 0 || Boolean(entry.post.is_featured))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.post);
}

type CmsPageTranslationRow = {
  page_id: string;
  language_code: string;
  title: string;
  excerpt: string;
  content_html: string;
  category: string;
  tags: string[];
  cover_image_alt: string;
  seo_title: string;
  seo_description: string;
  seo_keywords: string;
  og_title: string;
  og_description: string;
  twitter_title: string;
  twitter_description: string;
  translation_status: string;
  source_version_hash?: string;
  last_error_message?: string | null;
};

type CmsPageLocalizedImageRow = {
  page_id: string;
  language_code: string;
  cover_image_url: string | null;
  seo_image_url: string | null;
  twitter_image_url: string | null;
};

function isPublicTranslationRowEligible(
  r: CmsPageTranslationRow,
  languageCode: SupportedLanguage,
  parentEnSourceHash: string
): boolean {
  if (!r) return false;
  if (languageCode === 'en') return true;
  const statusOk = r.translation_status === 'current';
  const hashNonEmpty = Boolean(r.source_version_hash && String(r.source_version_hash).trim().length > 0);
  const hashMatch = hashNonEmpty && Boolean(parentEnSourceHash) && r.source_version_hash === parentEnSourceHash;
  const titleOk = Boolean(r.title && String(r.title).trim().length > 0);
  return statusOk && hashNonEmpty && hashMatch && titleOk;
}

export const loadBlogPostTranslationsForPage = cache(async (pageId: string) => {
  noStore();
  const admin = createAdminClient();
  try {
    if (!admin) return [] as CmsPageTranslationRow[];
    const { data, error } = await admin
      .from('cms_page_translations')
      .select(
        'page_id,language_code,title,excerpt,content_html,category,tags,cover_image_alt,seo_title,seo_description,seo_keywords,og_title,og_description,twitter_title,twitter_description,translation_status,source_version_hash'
      )
      .eq('page_id', pageId);
    if (error) return [] as CmsPageTranslationRow[];
    return ((data as CmsPageTranslationRow[] | null) || []);
  } catch {
    return [] as CmsPageTranslationRow[];
  }
});

export const loadBlogPostLocalizedImagesForPage = cache(async (pageId: string) => {
  noStore();
  const admin = createAdminClient();
  try {
    if (!admin) return [] as CmsPageLocalizedImageRow[];
    const { data, error } = await admin
      .from('cms_page_localized_images')
      .select('page_id,language_code,cover_image_url,seo_image_url,twitter_image_url')
      .eq('page_id', pageId);
    if (error) return [] as CmsPageLocalizedImageRow[];
    return ((data as CmsPageLocalizedImageRow[] | null) || []).filter(
      (r) =>
        Boolean(r.cover_image_url?.trim()) ||
        Boolean(r.seo_image_url?.trim()) ||
        Boolean(r.twitter_image_url?.trim())
    );
  } catch {
    return [] as CmsPageLocalizedImageRow[];
  }
});

function pickSupportedLanguageCode(code: string | SupportedLanguage): SupportedLanguage | null {
  return SUPPORTED_LANGUAGE_CODES.includes(code as SupportedLanguage)
    ? (code as SupportedLanguage)
    : null;
}

function splitKeywordsCsvOrNull(value: string | null | undefined): string[] | null {
  if (value == null) return null;
  const parts = value
    .split(/[,，、]/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : null;
}

function useTranslationFieldOrFallback<T>(
  txValue: T | null | undefined,
  fallback: T
): T {
  if (typeof txValue === 'string') {
    return txValue.trim().length > 0 ? (txValue as T) : fallback;
  }
  if (Array.isArray(txValue)) {
    return txValue.length > 0 ? (txValue as T) : fallback;
  }
  return fallback;
}

export function applyBlogTranslation(
  page: PublicCmsPage,
  options: {
    selectedLanguage: SupportedLanguage;
    translations: CmsPageTranslationRow[];
    localizedImages?: CmsPageLocalizedImageRow[] | null;
    parentEnSourceHash: string;
  }
): PublicCmsPage {
  const lang = pickSupportedLanguageCode(options.selectedLanguage);
  if (!lang || lang === 'en') return page;

  const translations = options.translations || [];
  const images = options.localizedImages || [];
  const primary = translations.find((t) => t.language_code === lang);

  if (!primary || !isPublicTranslationRowEligible(primary, lang, options.parentEnSourceHash)) {
    return page;
  }

  const p = primary;

  const title = useTranslationFieldOrFallback(p.title, page.title);
  const excerpt = useTranslationFieldOrFallback(p.excerpt, page.excerpt);
  const contentHtml = useTranslationFieldOrFallback(p.content_html, page.content_html);
  const category = useTranslationFieldOrFallback(p.category, page.category);
  const tags = useTranslationFieldOrFallback<string[] | null>(p.tags, page.tags);
  const coverImageAlt = useTranslationFieldOrFallback(p.cover_image_alt, page.cover_image_alt);
  const seoTitle = useTranslationFieldOrFallback(p.seo_title, page.seo_title);
  const seoDesc = useTranslationFieldOrFallback(p.seo_description, page.seo_description);
  const seoKeywords = useTranslationFieldOrFallback(p.seo_keywords, page.seo_keywords);
  const ogTitle = useTranslationFieldOrFallback(p.og_title, page.og_title);
  const ogDesc = useTranslationFieldOrFallback(p.og_description, page.og_description);
  const twitterTitle = useTranslationFieldOrFallback(p.twitter_title, page.twitter_title);
  const twitterDesc = useTranslationFieldOrFallback(p.twitter_description, page.twitter_description);

  const img = images.find((r) => r.language_code === lang) || null;
  const coverImageUrl =
    img && img.cover_image_url && img.cover_image_url.trim()
      ? img.cover_image_url
      : page.cover_image_url;
  const seoImageUrl =
    img && img.seo_image_url && img.seo_image_url.trim() ? img.seo_image_url : page.seo_image_url;
  const twitterImageUrl =
    img && img.twitter_image_url && img.twitter_image_url.trim()
      ? img.twitter_image_url
      : page.twitter_image_url;

  const baseRecord: CmsPageRecord = {
    ...page,
    title,
    excerpt,
    content_html: contentHtml,
    category,
    tags,
    cover_image_alt: coverImageAlt,
    cover_image_url: coverImageUrl,
    seo_title: seoTitle,
    seo_description: seoDesc,
    seo_keywords: seoKeywords,
    seo_image_url: seoImageUrl,
    og_title: ogTitle,
    og_description: ogDesc,
    twitter_title: twitterTitle,
    twitter_description: twitterDesc,
    twitter_image_url: twitterImageUrl,
  };

  return {
    ...baseRecord,
    navigation_label_resolved: getCmsPageNavigationLabel(baseRecord),
    excerpt_resolved: deriveCmsExcerpt(baseRecord),
    seo_title_resolved: deriveCmsSeoTitle(baseRecord),
    seo_description_resolved: deriveCmsSeoDescription(baseRecord),
    seo_keywords_resolved: deriveCmsSeoKeywords(baseRecord),
    og_title_resolved: deriveCmsOgTitle(baseRecord),
    og_description_resolved: deriveCmsOgDescription(baseRecord),
    twitter_title_resolved: deriveCmsTwitterTitle(baseRecord),
    twitter_description_resolved: deriveCmsTwitterDescription(baseRecord),
    content_html_sanitized: sanitizeRichTextHtml(baseRecord.content_html || ''),
  } satisfies PublicCmsPage;
}

export async function resolveLocalizedBlogPost(
  page: PublicCmsPage | null,
  language: SupportedLanguage
): Promise<PublicCmsPage | null> {
  if (!page) return null;
  if (language === 'en') return page;
  const [translations, localizedImages] = await Promise.all([
    loadBlogPostTranslationsForPage(page.id),
    loadBlogPostLocalizedImagesForPage(page.id),
  ]);
  return applyBlogTranslation(page, { selectedLanguage: language, translations, localizedImages, parentEnSourceHash: page.en_source_version_hash ?? '' });
}

export async function resolveLocalizedBlogList(
  pages: PublicCmsPage[],
  language: SupportedLanguage
): Promise<PublicCmsPage[]> {
  if (!pages.length || language === 'en') return pages;
  const ids = pages.map((p) => p.id);
  noStore();
  const admin = createAdminClient();
  let translations: CmsPageTranslationRow[] = [];
  let images: CmsPageLocalizedImageRow[] = [];
  if (admin) {
    try {
      const [tRes, iRes] = await Promise.all([
        admin
          .from('cms_page_translations')
          .select(
            'page_id,language_code,title,excerpt,content_html,category,tags,cover_image_alt,seo_title,seo_description,seo_keywords,og_title,og_description,twitter_title,twitter_description,translation_status,source_version_hash'
          )
          .in('page_id', ids),
        admin
          .from('cms_page_localized_images')
          .select('page_id,language_code,cover_image_url,seo_image_url,twitter_image_url')
          .in('page_id', ids),
      ]);
      if (!tRes.error) translations = (tRes.data as CmsPageTranslationRow[] | null) || [];
      if (!iRes.error) images = ((iRes.data as CmsPageLocalizedImageRow[] | null) || []).filter(
        (r) =>
          Boolean(r.cover_image_url?.trim()) ||
          Boolean(r.seo_image_url?.trim()) ||
          Boolean(r.twitter_image_url?.trim())
      );
    } catch {}
  }
  return pages.map((p) =>
    applyBlogTranslation(p, {
      selectedLanguage: language,
      translations: translations.filter((t) => t.page_id === p.id),
      localizedImages: images.filter((r) => r.page_id === p.id),
      parentEnSourceHash: p.en_source_version_hash ?? '',
    })
  );
}
