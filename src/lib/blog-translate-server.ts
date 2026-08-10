import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeRichTextHtml } from '@/lib/cms-pages';
import type { CmsBlogAdminInput, CmsPageRecord } from '@/lib/cms-pages';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildBlogEnglishSourceHash,
  CONTENT_TRANSLATION_ENABLED_LANGS,
  getPlatformEnabledTranslations,
  translateBlogFields,
  type TranslationPerLang,
  type TranslationStatus,
  writeAttemptLog,
  type TranslationAttemptLog,
} from '@/lib/content-translate-server';
import { type SupportedLanguage } from '@/i18n/registry';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const BLOG_TRANSLATABLE_FIELDS: Array<keyof CmsBlogAdminInput> = [
  'title',
  'excerpt',
  'content_html',
  'category',
  'tags',
  'cover_image_alt',
  'seo_title',
  'seo_description',
  'seo_keywords',
  'og_title',
  'og_description',
  'twitter_title',
  'twitter_description',
];

export { BLOG_TRANSLATABLE_FIELDS };

export function blogSourceInputChanged(
  existing: Pick<CmsPageRecord, (typeof BLOG_TRANSLATABLE_FIELDS)[number] | 'seo_keywords' | any>,
  incoming: CmsBlogAdminInput
): boolean {
  for (const key of BLOG_TRANSLATABLE_FIELDS as string[]) {
    const cur: unknown = (existing as any)[key];
    const next: unknown = (incoming as any)[key];
    if (key === 'tags' || key === 'seo_keywords') {
      const a = Array.isArray(cur) ? cur.join('|') : String(cur ?? '');
      const b = Array.isArray(next) ? next.join('|') : String(next ?? '');
      if (a !== b) return true;
      continue;
    }
    if (String(cur ?? '') !== String(next ?? '')) return true;
  }
  return false;
}

export type BlogTranslationStatusRow = {
  language: SupportedLanguage;
  status: TranslationStatus;
  sourceHashMatch: boolean;
  updatedAt?: string;
  errorMessage?: string;
};

export async function loadBlogTranslationStatus(
  admin: AdminClient,
  pageId: string,
  currentSourceHash: string
): Promise<{ enSourceHash: string; statuses: BlogTranslationStatusRow[] }> {
  const [parentResult, translationsResult] = await Promise.all([
    admin.from('cms_pages').select('en_source_version_hash').eq('id', pageId).maybeSingle(),
    admin
      .from('cms_page_translations')
      .select('language_code, translation_status, source_version_hash, last_error_message, updated_at')
      .eq('page_id', pageId),
  ]);
  const enSourceHash = String((parentResult?.data as any)?.en_source_version_hash ?? '');
  const rowMap = new Map<string, any>();
  for (const row of translationsResult.data ?? []) rowMap.set(String(row.language_code), row);
  const statuses: BlogTranslationStatusRow[] = CONTENT_TRANSLATION_ENABLED_LANGS.map((language) => {
    const row = rowMap.get(language);
    const storedHash = String(row?.source_version_hash ?? '');
    return {
      language,
      status: (row?.translation_status as TranslationStatus) || 'missing',
      sourceHashMatch: Boolean(storedHash && storedHash === currentSourceHash),
      updatedAt: row?.updated_at,
      errorMessage: row?.last_error_message || undefined,
    };
  });
  return { enSourceHash, statuses };
}

function normalizeCsvKeywordsToStrings(input: string | string[] | null | undefined): string[] {
  if (Array.isArray(input)) {
    return input.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 50);
  }
  const asStr = String(input ?? '').trim();
  if (!asStr) return [];
  return asStr
    .split(/[,，、]/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);
}

function keywordsToCsv(input: string | string[] | null | undefined): string {
  return normalizeCsvKeywordsToStrings(input).join(', ');
}

function sanitizeBlogTranslation(val: {
  title?: string | null;
  excerpt?: string | null;
  content_html?: string | null;
  category?: string | null;
  tags?: string | string[] | null;
  cover_image_alt?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | string[] | null;
  og_title?: string | null;
  og_description?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
}) {
  return {
    title: String(val.title || '').trim().slice(0, 200),
    excerpt: String(val.excerpt || '').trim().slice(0, 500),
    content_html: sanitizeRichTextHtml(val.content_html || '').slice(0, 120000),
    category: String(val.category || '').trim().slice(0, 100),
    tags: normalizeCsvKeywordsToStrings(val.tags).slice(0, 20),
    cover_image_alt: String(val.cover_image_alt || '').trim().slice(0, 240),
    seo_title: String(val.seo_title || '').trim().slice(0, 200),
    seo_description: String(val.seo_description || '').trim().slice(0, 400),
    seo_keywords: keywordsToCsv(val.seo_keywords),
    og_title: String(val.og_title || '').trim().slice(0, 200),
    og_description: String(val.og_description || '').trim().slice(0, 400),
    twitter_title: String(val.twitter_title || '').trim().slice(0, 200),
    twitter_description: String(val.twitter_description || '').trim().slice(0, 400),
  };
}

export async function upsertBlogLocalizedImages(
  admin: AdminClient,
  pageId: string,
  overrides: Partial<
    Record<
      SupportedLanguage,
      {
        cover_image_url?: string | null;
        seo_image_url?: string | null;
        twitter_image_url?: string | null;
      }
    >
  >
) {
  const langs = Object.keys(overrides) as SupportedLanguage[];
  if (langs.length === 0) return;
  const rows = langs.map((language) => {
    const cover = overrides[language]?.cover_image_url;
    const seo = overrides[language]?.seo_image_url;
    const tw = overrides[language]?.twitter_image_url;
    const hasAny = Boolean(
      (cover && String(cover).trim()) || (seo && String(seo).trim()) || (tw && String(tw).trim())
    );
    return {
      page_id: pageId,
      language_code: language,
      cover_image_url: hasAny ? String(cover ?? '').trim().slice(0, 500) || null : null,
      seo_image_url: hasAny ? String(seo ?? '').trim().slice(0, 500) || null : null,
      twitter_image_url: hasAny ? String(tw ?? '').trim().slice(0, 500) || null : null,
    };
  });
  const { error } = await admin
    .from('cms_page_localized_images')
    .upsert(rows, { onConflict: 'page_id,language_code' });
  if (error) throw error;
}

export async function deleteBlogLocalizedImageOverride(
  admin: AdminClient,
  pageId: string,
  language: SupportedLanguage
): Promise<void> {
  const { error } = await admin
    .from('cms_page_localized_images')
    .update({
      cover_image_url: null,
      seo_image_url: null,
      twitter_image_url: null,
      updated_at: new Date().toISOString(),
    })
    .eq('page_id', pageId)
    .eq('language_code', language);
  if (error) throw error;
}

export type BlogEnglishSourceBundle = {
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
};

export function buildBlogSourceBundle(input: {
  title?: string | null;
  excerpt?: string | null;
  content_html?: string | null;
  category?: string | null;
  tags?: string | string[] | null;
  cover_image_alt?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | string[] | null;
  og_title?: string | null;
  og_description?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
}): BlogEnglishSourceBundle {
  return sanitizeBlogTranslation(input);
}

export function computeBlogEnglishSourceHash(bundle: BlogEnglishSourceBundle): string {
  return buildBlogEnglishSourceHash({
    title: bundle.title,
    excerpt: bundle.excerpt,
    content_html: bundle.content_html,
    category: bundle.category,
    tags: bundle.tags,
    cover_image_alt: bundle.cover_image_alt,
    seo_title: bundle.seo_title,
    seo_description: bundle.seo_description,
    seo_keywords: bundle.seo_keywords,
    og_title: bundle.og_title,
    og_description: bundle.og_description,
    twitter_title: bundle.twitter_title,
    twitter_description: bundle.twitter_description,
  });
}

export async function getBlogEnabledLanguages(admin: AdminClient): Promise<SupportedLanguage[]> {
  const all = await getPlatformEnabledTranslations(
    admin as unknown as SupabaseClient<any, 'public', any>
  );
  return CONTENT_TRANSLATION_ENABLED_LANGS.filter((l) => all.includes(l));
}

export async function loadBlogPendingTranslations(
  admin: AdminClient,
  pageId: string,
  sourceHash: string
): Promise<{ needsWork: SupportedLanguage[]; existingLanguagesWorkStatuses: Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }> }> {
  const result = await admin
    .from('cms_page_translations')
    .select('language_code, translation_status, source_version_hash')
    .eq('page_id', pageId);
  const map = new Map<string, { status: TranslationStatus; hash: string }>();
  for (const r of result.data ?? []) {
    map.set(String((r as any).language_code), {
      status: (r as any).translation_status as TranslationStatus,
      hash: String((r as any).source_version_hash ?? ''),
    });
  }
  const existingLanguagesWorkStatuses: Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }> = [];
  const enabled = await getBlogEnabledLanguages(admin);
  const needsWork: SupportedLanguage[] = [];
  for (const lang of enabled) {
    const row = map.get(lang);
    if (row) existingLanguagesWorkStatuses.push({ language: lang, status: row.status, hash: row.hash });
    if (!row) {
      needsWork.push(lang);
      continue;
    }
    if (row.hash !== sourceHash) {
      needsWork.push(lang);
      continue;
    }
    if (row.status === 'failed' || row.status === 'missing' || row.status === 'pending') {
      needsWork.push(lang);
    }
  }
  return { needsWork, existingLanguagesWorkStatuses };
}

export async function scheduleBlogTranslations(
  admin: AdminClient,
  pageId: string,
  bundle: BlogEnglishSourceBundle,
  options: { regenerateAll?: boolean } = {}
): Promise<{
  sourceHash: string;
  scheduledLanguages: SupportedLanguage[];
  totalEnabled: number;
}> {
  const sourceHash = computeBlogEnglishSourceHash(bundle);
  const enabled = await getBlogEnabledLanguages(admin);
  const { needsWork, existingLanguagesWorkStatuses } = options.regenerateAll
    ? {
        needsWork: [...enabled],
        existingLanguagesWorkStatuses: [] as Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }>,
      }
    : await loadBlogPendingTranslations(admin, pageId, sourceHash);

  if (needsWork.length > 0) {
    const upsertRows = needsWork.map((language) => ({
      page_id: pageId,
      language_code: language,
      title: String(
        (existingLanguagesWorkStatuses.find((s) => s.language === language)?.hash ?? '') ? '' : ''
      ),
      source_version_hash: '',
      translation_status: 'pending' as TranslationStatus,
      last_error_message: null,
    }));
    const { error } = await admin
      .from('cms_page_translations')
      .upsert(upsertRows, { onConflict: 'page_id,language_code', ignoreDuplicates: false });
    if (error) throw error;
  }

  const { error: parentHashError } = await admin
    .from('cms_pages')
    .update({ en_source_version_hash: sourceHash, updated_at: new Date().toISOString() })
    .eq('id', pageId);
  if (parentHashError) throw parentHashError;

  return {
    sourceHash,
    scheduledLanguages: needsWork,
    totalEnabled: enabled.length,
  };
}

export type ProcessOneBlogResult = TranslationPerLang<BlogEnglishSourceBundle> & {
  attemptId: string;
  errorStage: string | null;
};

export async function processOneBlogTranslation(
  admin: AdminClient,
  pageId: string,
  language: SupportedLanguage,
  bundle: BlogEnglishSourceBundle
): Promise<ProcessOneBlogResult> {
  const sourceHash = computeBlogEnglishSourceHash(bundle);
  const enPayload = {
    ...bundle,
    tags: bundle.tags,
    seo_keywords: normalizeCsvKeywordsToStrings(bundle.seo_keywords),
  };
  const aiTranslateResult = await translateBlogFields(language, enPayload as any, { contentId: pageId });
  const attemptId = aiTranslateResult.attemptId;
  let aiResult = aiTranslateResult.translatedFields;
  let errorStage: string | null = aiTranslateResult.failure?.stage ?? null;
  let errorMsg: string | null = null;
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini';
  if (aiTranslateResult.failure) {
    errorMsg = `[${attemptId}] ${aiTranslateResult.failure.stage}: ${aiTranslateResult.failure.safeMessage}`;
  } else {
    try {
      if (!aiResult) {
        errorStage = 'required_translation_fields_empty';
        throw new Error(`[${attemptId}] required_translation_fields_empty: Empty AI translation result.`);
      }
    } catch (err) {
      errorMsg =
        err instanceof Error ? String(err.message || 'Translation failed.') : 'Translation failed.';
      if (errorStage === null) {
        const msg = errorMsg;
        if (msg.includes('provider_request_failed')) errorStage = 'provider_request_failed';
        else if (msg.includes('provider_returned_no_text')) errorStage = 'provider_returned_no_text';
        else if (msg.includes('invalid_json')) errorStage = 'invalid_json';
        else if (msg.includes('schema_validation_failed')) errorStage = 'schema_validation_failed';
        else if (msg.includes('unsupported_gateway_response_shape')) errorStage = 'unsupported_gateway_response_shape';
        else errorStage = 'required_translation_fields_empty';
      }
    }
  }

  const priorRowFull = (
    await admin
      .from('cms_page_translations')
      .select(
        'title, excerpt, content_html, category, tags, cover_image_alt, seo_title, seo_description, seo_keywords, og_title, og_description, twitter_title, twitter_description, source_version_hash, translation_status'
      )
      .eq('page_id', pageId)
      .eq('language_code', language)
      .maybeSingle()
  ).data as any;
  const priorRow = priorRowFull;
  const priorHasContent = Boolean(
    priorRow && (String(priorRow.title || '') || String(priorRow.content_html || ''))
  );
  const priorWasCurrent = priorRow?.translation_status === 'current';
  const priorSourceHash = String(priorRow?.source_version_hash ?? '');
  const priorSuccessfulWithMatchingHash = priorWasCurrent && priorSourceHash === sourceHash;

  let effectivelyFailed = !aiResult;
  let sanitized: ReturnType<typeof sanitizeBlogTranslation> | null = null;
  if (aiResult) {
    sanitized = sanitizeBlogTranslation(aiResult as any);
    const titleEmptyAfterFallback = !String(sanitized.title || '').trim();
    const contentEmptyAfterFallback = !String(sanitized.content_html || '').trim();
    if (titleEmptyAfterFallback || contentEmptyAfterFallback) {
      effectivelyFailed = true;
      if (!errorMsg) {
        errorStage = 'schema_validation_failed';
        errorMsg = `[${attemptId}] schema_validation_failed: Translation produced empty core fields.${titleEmptyAfterFallback ? ' title' : ''}${contentEmptyAfterFallback ? ' content_html' : ''}`;
      }
    }
  }

  if (aiResult && sanitized && !effectivelyFailed) {
    const { error } = await admin.from('cms_page_translations').upsert(
      [
        {
          page_id: pageId,
          language_code: language,
          title: sanitized.title,
          excerpt: sanitized.excerpt,
          content_html: sanitized.content_html,
          category: sanitized.category,
          tags: sanitized.tags,
          cover_image_alt: sanitized.cover_image_alt,
          seo_title: sanitized.seo_title,
          seo_description: sanitized.seo_description,
          seo_keywords: sanitized.seo_keywords,
          og_title: sanitized.og_title,
          og_description: sanitized.og_description,
          twitter_title: sanitized.twitter_title,
          twitter_description: sanitized.twitter_description,
          source_version_hash: sourceHash,
          translation_status: 'current' as TranslationStatus,
          last_error_message: null,
        },
      ],
      { onConflict: 'page_id,language_code' }
    );
    if (error) {
      const dbErrMsg = error instanceof Error ? error.message : 'Failed to persist translation row.';
      errorStage = 'database_upsert_failed';
      errorMsg = `[${attemptId}] database_upsert_failed: ${dbErrMsg}`;
      writeAttemptLog({
        attemptId,
        contentType: 'blog_fields',
        contentId: pageId,
        targetLanguage: language,
        model,
        providerStatus: null,
        stage: 'database_upsert_failed',
        responseShape: 'null',
        candidateTextExists: false,
        candidateTextLength: 0,
        errorCategory: 'database_upsert_failed',
        errorMessageSafe: dbErrMsg.slice(0, 300),
        elapsedMs: 0,
      });
      return {
        language,
        status: 'failed',
        result: undefined,
        errorMessage: errorMsg.slice(0, 500),
        attemptId,
        errorStage,
      };
    }
    return { language, status: 'current', result: bundle, errorMessage: undefined, attemptId, errorStage: null };
  }

  const shouldPreservePrior = priorHasContent || priorSuccessfulWithMatchingHash;
  const preserve: any = shouldPreservePrior
    ? {
        title: String(priorRow?.title || ''),
        excerpt: String(priorRow?.excerpt || ''),
        content_html: String(priorRow?.content_html || ''),
        category: String(priorRow?.category || ''),
        tags: Array.isArray(priorRow?.tags) ? priorRow.tags : [],
        cover_image_alt: String(priorRow?.cover_image_alt || ''),
        seo_title: String(priorRow?.seo_title || ''),
        seo_description: String(priorRow?.seo_description || ''),
        seo_keywords: keywordsToCsv(priorRow?.seo_keywords),
        og_title: String(priorRow?.og_title || ''),
        og_description: String(priorRow?.og_description || ''),
        twitter_title: String(priorRow?.twitter_title || ''),
        twitter_description: String(priorRow?.twitter_description || ''),
        source_version_hash: String(priorRow?.source_version_hash ?? ''),
        translation_status: 'outdated' as TranslationStatus,
      }
    : {
        title: '',
        excerpt: '',
        content_html: '',
        category: '',
        tags: [],
        cover_image_alt: '',
        seo_title: '',
        seo_description: '',
        seo_keywords: '',
        og_title: '',
        og_description: '',
        twitter_title: '',
        twitter_description: '',
        source_version_hash: '',
        translation_status: 'failed' as TranslationStatus,
      };
  const finalErrorMessage = String(errorMsg || `[${attemptId}] required_translation_fields_empty: Translation failed.`).slice(0, 500);
  const { error: persistErr } = await admin
    .from('cms_page_translations')
    .upsert(
      [
        {
          page_id: pageId,
          language_code: language,
          ...preserve,
          last_error_message: finalErrorMessage,
        },
      ],
      { onConflict: 'page_id,language_code' }
    );
  if (persistErr) {
    const persistMsg = `persist: ${String(persistErr.message || persistErr)}`;
    const combinedMsg = finalErrorMessage + ' | ' + persistMsg;
    writeAttemptLog({
      attemptId,
      contentType: 'blog_fields',
      contentId: pageId,
      targetLanguage: language,
      model,
      providerStatus: null,
      stage: 'database_upsert_failed',
      responseShape: 'null',
      candidateTextExists: false,
      candidateTextLength: 0,
      errorCategory: 'database_upsert_failed',
      errorMessageSafe: persistMsg.slice(0, 300),
      elapsedMs: 0,
    });
    errorStage = 'database_upsert_failed';
    return {
      language,
      status: (shouldPreservePrior ? 'outdated' : 'failed') as TranslationStatus,
      result: undefined,
      errorMessage: combinedMsg.slice(0, 500),
      attemptId,
      errorStage,
    };
  }
  return {
    language,
    status: (shouldPreservePrior ? 'outdated' : 'failed') as TranslationStatus,
    result: undefined,
    errorMessage: finalErrorMessage,
    attemptId,
    errorStage,
  };
}

export async function saveBlogTranslationsForPage(
  admin: AdminClient,
  pageId: string,
  englishSource: BlogEnglishSourceBundle,
  options: { regenerateAll?: boolean } = {}
): Promise<{ sourceHash: string; scheduledLanguages: SupportedLanguage[]; totalEnabled: number }> {
  return scheduleBlogTranslations(admin, pageId, englishSource, options);
}
