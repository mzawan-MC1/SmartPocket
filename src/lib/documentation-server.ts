import 'server-only';

import { createServerComponentSupabaseClient } from '@/lib/supabase/server';
import type {
  DocumentationArticleRecord,
  DocumentationCategoryRecord,
  DocumentationCategoryWithCount,
  DocumentationLanguageCode,
  DocumentationTranslationRecord,
  PublicDocumentationArticle,
} from '@/lib/documentation';
import { normalizeDocumentationLanguage } from '@/lib/documentation';
import type { SupportedLanguage } from '@/i18n/resources';
import { CONTENT_TRANSLATION_ENABLED_LANGS } from '@/lib/content-translate-server';

type AdminSupabase = NonNullable<ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>>;

type PublicArticleRow = Pick<DocumentationArticleRecord,
  | 'id' | 'title' | 'slug' | 'summary' | 'content_html'
  | 'category' | 'status' | 'enabled' | 'display_order'
  | 'featured_in_footer' | 'featured_in_header' | 'featured_order'
  | 'published_at' | 'updated_at' | 'en_source_version_hash'
>;

type TranslationEligible = Pick<DocumentationTranslationRecord,
  | 'article_id' | 'language_code' | 'title' | 'summary' | 'content_html'
  | 'translation_status' | 'source_version_hash'
>;

function mergeToPublic(
  source: PublicArticleRow,
  translation: TranslationEligible | null,
  fallbackLocale: DocumentationLanguageCode,
  requestedLocale: DocumentationLanguageCode
): PublicDocumentationArticle {
  const useTranslation =
    translation &&
    translation.language_code !== 'en' &&
    translation.translation_status === 'current' &&
    source.en_source_version_hash !== null &&
    source.en_source_version_hash.length > 0 &&
    translation.source_version_hash === source.en_source_version_hash &&
    typeof translation.title === 'string' &&
    translation.title.trim().length > 0 &&
    typeof translation.content_html === 'string' &&
    translation.content_html.trim().length > 0;

  if (useTranslation && translation) {
    return {
      id: source.id,
      title: translation.title,
      slug: source.slug,
      summary: translation.summary || source.summary,
      contentHtml: translation.content_html,
      category: source.category,
      localeCode: requestedLocale,
      publishedAt: source.published_at,
      updatedAt: source.updated_at,
    };
  }

  return {
    id: source.id,
    title: source.title,
    slug: source.slug,
    summary: source.summary,
    contentHtml: source.content_html,
    category: source.category,
    localeCode: fallbackLocale,
    publishedAt: source.published_at,
    updatedAt: source.updated_at,
  };
}

export async function getPublicDocumentationList(
  preferredLanguage: SupportedLanguage
): Promise<{ articles: PublicDocumentationArticle[]; effectiveLocale: DocumentationLanguageCode }> {
  const supabase = await createServerComponentSupabaseClient();
  const primaryLocale = normalizeDocumentationLanguage(preferredLanguage);
  const isEnglish = primaryLocale === 'en';

  const { data: rows, error } = await supabase
    .from('documentation_articles')
    .select(`
      id, title, slug, summary, content_html, category, status, enabled,
      display_order, published_at, updated_at, en_source_version_hash
    `)
    .eq('enabled', true)
    .eq('status', 'published')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error || !rows) {
    return { articles: [], effectiveLocale: isEnglish ? 'en' : primaryLocale };
  }

  const sources = rows as PublicArticleRow[];
  const sourceIds = sources.map((s) => s.id);

  let translationsByArticleId: Record<string, TranslationEligible> = {};
  if (!isEnglish && sourceIds.length > 0) {
    const { data: translations } = await supabase
      .from('documentation_translations')
      .select(`
        article_id, language_code, title, summary, content_html,
        translation_status, source_version_hash
      `)
      .in('article_id', sourceIds)
      .eq('language_code', primaryLocale);

    if (translations) {
      for (const t of translations as TranslationEligible[]) {
        translationsByArticleId[t.article_id] = t;
      }
    }
  }

  const articles: PublicDocumentationArticle[] = sources.map((source) =>
    mergeToPublic(source, translationsByArticleId[source.id] ?? null, 'en', primaryLocale)
  );

  return { articles, effectiveLocale: primaryLocale };
}

export async function getPublicDocumentationDetail(
  slug: string,
  preferredLanguage: SupportedLanguage
): Promise<{ article: PublicDocumentationArticle | null; effectiveLocale: DocumentationLanguageCode }> {
  const supabase = await createServerComponentSupabaseClient();
  const primaryLocale = normalizeDocumentationLanguage(preferredLanguage);
  const safeSlug = slug.toLowerCase().trim();
  const isEnglish = primaryLocale === 'en';

  const { data: sourceRow, error: sourceErr } = await supabase
    .from('documentation_articles')
    .select(`
      id, title, slug, summary, content_html, category, status, enabled,
      display_order, published_at, updated_at, en_source_version_hash
    `)
    .eq('slug', safeSlug)
    .eq('enabled', true)
    .eq('status', 'published')
    .maybeSingle();

  if (sourceErr || !sourceRow) {
    return { article: null, effectiveLocale: primaryLocale };
  }

  const source = sourceRow as PublicArticleRow;
  let translation: TranslationEligible | null = null;

  if (!isEnglish) {
    const { data: transRow } = await supabase
      .from('documentation_translations')
      .select(`
        article_id, language_code, title, summary, content_html,
        translation_status, source_version_hash
      `)
      .eq('article_id', source.id)
      .eq('language_code', primaryLocale)
      .maybeSingle();

    translation = (transRow as TranslationEligible | null) ?? null;
  }

  return {
    article: mergeToPublic(source, translation, 'en', primaryLocale),
    effectiveLocale: primaryLocale,
  };
}

export function isNonEnglishContentLanguage(code: string): boolean {
  return CONTENT_TRANSLATION_ENABLED_LANGS.includes(code as any);
}

export async function getRelatedPublicDocumentationArticles(
  currentSlug: string,
  category: string,
  preferredLanguage: SupportedLanguage,
  limit = 4
): Promise<{ articles: PublicDocumentationArticle[] }> {
  const supabase = await createServerComponentSupabaseClient();
  const primaryLocale = normalizeDocumentationLanguage(preferredLanguage);
  const isEnglish = primaryLocale === 'en';
  const safeSlug = currentSlug.toLowerCase().trim();
  const safeCategory = String(category || '').toLowerCase().trim();

  const sameCategoryIds: string[] = [];
  const allExcludingCurrent: PublicArticleRow[] = [];

  const { data: allRows } = await supabase
    .from('documentation_articles')
    .select(`
      id, title, slug, summary, content_html, category, status, enabled,
      display_order, featured_in_footer, featured_in_header, featured_order,
      published_at, updated_at, en_source_version_hash
    `)
    .eq('enabled', true)
    .eq('status', 'published')
    .neq('slug', safeSlug)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  for (const r of (allRows || []) as PublicArticleRow[]) {
    if (safeCategory && String(r.category || '').toLowerCase().trim() === safeCategory) {
      sameCategoryIds.push(r.id);
    }
    allExcludingCurrent.push(r);
  }

  const sameCategoryRows = allExcludingCurrent.filter((r) => sameCategoryIds.includes(r.id));
  const remaining = allExcludingCurrent.filter((r) => !sameCategoryIds.includes(r.id));

  const orderedRows = [...sameCategoryRows, ...remaining].slice(0, Math.max(3, limit));

  const ids = orderedRows.map((r) => r.id);
  let translationsById: Record<string, TranslationEligible> = {};
  if (!isEnglish && ids.length > 0) {
    const { data: trans } = await supabase
      .from('documentation_translations')
      .select(`
        article_id, language_code, title, summary, content_html,
        translation_status, source_version_hash
      `)
      .in('article_id', ids)
      .eq('language_code', primaryLocale);
    for (const t of (trans || []) as TranslationEligible[]) {
      translationsById[t.article_id] = t;
    }
  }

  const articles = orderedRows.map((source) =>
    mergeToPublic(source, translationsById[source.id] ?? null, 'en', primaryLocale)
  );

  return { articles };
}

export async function getFeaturedPublicDocumentationArticles(
  slot: 'header' | 'footer',
  preferredLanguage: SupportedLanguage,
  limit = 4
): Promise<{ articles: PublicDocumentationArticle[] }> {
  const supabase = await createServerComponentSupabaseClient();
  const primaryLocale = normalizeDocumentationLanguage(preferredLanguage);
  const isEnglish = primaryLocale === 'en';
  const filterColumn = slot === 'footer' ? 'featured_in_footer' : 'featured_in_header';

  const { data: rows } = await supabase
    .from('documentation_articles')
    .select(`
      id, title, slug, summary, content_html, category, status, enabled,
      display_order, featured_in_footer, featured_in_header, featured_order,
      published_at, updated_at, en_source_version_hash
    `)
    .eq('enabled', true)
    .eq('status', 'published')
    .eq(filterColumn, true)
    .order('featured_order', { ascending: true })
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  const sources = ((rows || []) as PublicArticleRow[]).slice(0, limit);
  const ids = sources.map((s) => s.id);
  let translationsById: Record<string, TranslationEligible> = {};
  if (!isEnglish && ids.length > 0) {
    const { data: trans } = await supabase
      .from('documentation_translations')
      .select(`
        article_id, language_code, title, summary, content_html,
        translation_status, source_version_hash
      `)
      .in('article_id', ids)
      .eq('language_code', primaryLocale);
    for (const t of (trans || []) as TranslationEligible[]) {
      translationsById[t.article_id] = t;
    }
  }

  const articles = sources.map((source) =>
    mergeToPublic(source, translationsById[source.id] ?? null, 'en', primaryLocale)
  );

  return { articles };
}

export async function adminGetAllDocumentationCategoriesWithCount(
  admin: AdminSupabase
): Promise<DocumentationCategoryWithCount[]> {
  const { data: cats, error: catsErr } = await admin
    .from('documentation_categories')
    .select('*')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (catsErr) throw catsErr;

  const { count, error: countErr } = await admin
    .from('documentation_articles')
    .select('category', { count: 'exact', head: false });

  if (countErr && !count) {
    // count error is non-fatal; fall back to zero counts
  }

  const countsByCategory: Record<string, number> = {};
  for (const row of (count as Array<{ category: string }> | null) || []) {
    const c = String(row.category || '').trim();
    if (c) countsByCategory[c] = (countsByCategory[c] || 0) + 1;
  }

  return ((cats || []) as DocumentationCategoryRecord[]).map((c) => ({
    ...c,
    articles_count: countsByCategory[c.slug] || 0,
  }));
}

export async function getPublicActiveDocumentationCategories(
  preferredLanguage?: SupportedLanguage
): Promise<DocumentationCategoryRecord[]> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from('documentation_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error || !data) {
    return [];
  }
  return (data as DocumentationCategoryRecord[]) || [];
}

export async function adminGetDocumentationCategoryById(
  admin: AdminSupabase,
  id: string
): Promise<DocumentationCategoryRecord | null> {
  const { data, error } = await admin
    .from('documentation_categories')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as DocumentationCategoryRecord | null) || null;
}

export async function adminDocumentationCategoryHasAssignedArticles(
  admin: AdminSupabase,
  slug: string
): Promise<boolean> {
  const { count, error } = await admin
    .from('documentation_articles')
    .select('*', { count: 'exact', head: true })
    .eq('category', slug);
  if (error) throw error;
  return Number(count || 0) > 0;
}
