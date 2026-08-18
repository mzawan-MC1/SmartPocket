import 'server-only';

import { createServerComponentSupabaseClient } from '@/lib/supabase/server';
import type {
  DocumentationArticleRecord,
  DocumentationLanguageCode,
  DocumentationTranslationRecord,
  PublicDocumentationArticle,
} from '@/lib/documentation';
import { normalizeDocumentationLanguage } from '@/lib/documentation';
import type { SupportedLanguage } from '@/i18n/resources';
import { CONTENT_TRANSLATION_ENABLED_LANGS } from '@/lib/content-translate-server';

type PublicArticleRow = Pick<DocumentationArticleRecord,
  | 'id' | 'title' | 'slug' | 'summary' | 'content_html'
  | 'category' | 'status' | 'enabled' | 'display_order'
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
