import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { sanitizeRichTextHtml } from '@/lib/cms-pages';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildDocumentationEnglishSourceHash,
  CONTENT_TRANSLATION_ENABLED_LANGS,
  getPlatformEnabledTranslations,
  translateDocumentationFields,
  type TranslationPerLang,
  type TranslationStatus,
  writeAttemptLog,
} from '@/lib/content-translate-server';
import { type SupportedLanguage } from '@/i18n/registry';
import {
  type DocumentationArticleRecord,
  type DocumentationTranslationStatusResponse,
  type DocumentationTranslationStatusRow,
} from '@/lib/documentation';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const DOCUMENTATION_TRANSLATABLE_FIELDS: Array<'title' | 'summary' | 'content_html' | 'category'> = [
  'title',
  'summary',
  'content_html',
  'category',
];

export { DOCUMENTATION_TRANSLATABLE_FIELDS };

export type { DocumentationTranslationStatusRow, DocumentationTranslationStatusResponse };

export function documentationSourceInputChanged(
  existing: Pick<DocumentationArticleRecord, 'title' | 'summary' | 'content_html' | 'category'>,
  incoming: { title: string; summary: string; content_html: string; category: string }
): boolean {
  for (const key of DOCUMENTATION_TRANSLATABLE_FIELDS) {
    const cur = String((existing as any)[key] ?? '');
    const next = String((incoming as any)[key] ?? '');
    if (cur !== next) return true;
  }
  return false;
}

export async function loadDocumentationTranslationStatus(
  admin: AdminClient,
  articleId: string
): Promise<DocumentationTranslationStatusResponse> {
  const [parentResult, translationsResult] = await Promise.all([
    admin
      .from('documentation_articles')
      .select('en_source_version_hash, updated_at')
      .eq('id', articleId)
      .maybeSingle(),
    admin
      .from('documentation_translations')
      .select('language_code, translation_status, source_version_hash, last_error_message, updated_at')
      .eq('article_id', articleId),
  ]);
  const enSourceHash = String((parentResult?.data as any)?.en_source_version_hash ?? '');
  const rowMap = new Map<string, any>();
  for (const row of translationsResult.data ?? []) rowMap.set(String(row.language_code), row);
  const statuses: DocumentationTranslationStatusRow[] = CONTENT_TRANSLATION_ENABLED_LANGS.map((language) => {
    const row = rowMap.get(language);
    const storedHash = String(row?.source_version_hash ?? '');
    return {
      language,
      status: (row?.translation_status as TranslationStatus) || 'missing',
      sourceHashMatch: Boolean(storedHash && storedHash === enSourceHash),
      updatedAt: row?.updated_at,
      errorMessage: row?.last_error_message || undefined,
    };
  });
  let currentCount = 0;
  let outdatedCount = 0;
  let failedCount = 0;
  let missingCount = 0;
  let pendingCount = 0;
  for (const s of statuses) {
    const effectivelyCurrent = s.status === 'current' && s.sourceHashMatch;
    if (effectivelyCurrent) currentCount += 1;
    else if (s.status === 'outdated') outdatedCount += 1;
    else if (s.status === 'failed') failedCount += 1;
    else if (s.status === 'pending') pendingCount += 1;
    else missingCount += 1;
  }
  return {
    articleId,
    sourceHash: enSourceHash,
    statuses,
    currentCount,
    outdatedCount,
    failedCount,
    missingCount,
    pendingCount,
    totalEnabled: statuses.length,
  };
}

export async function markDocumentationTranslationsOutdated(
  admin: AdminClient,
  articleId: string
): Promise<void> {
  const { error } = await admin
    .from('documentation_translations')
    .update({ translation_status: 'outdated' })
    .eq('article_id', articleId);
  if (error) throw error;
}

function sanitizeDocumentationTranslation(val: {
  title?: string | null;
  summary?: string | null;
  content_html?: string | null;
  category?: string | null;
}) {
  return {
    title: String(val.title || '').trim().slice(0, 240),
    summary: String(val.summary || '').trim().slice(0, 500),
    content_html: sanitizeRichTextHtml(val.content_html || '').slice(0, 40000),
    category: String(val.category || '').trim().slice(0, 80),
  };
}

export type DocumentationEnglishSourceBundle = {
  title: string;
  summary: string;
  content_html: string;
  category: string;
};

export function buildDocumentationSourceBundle(input: {
  title?: string | null;
  summary?: string | null;
  content_html?: string | null;
  category?: string | null;
}): DocumentationEnglishSourceBundle {
  return sanitizeDocumentationTranslation(input);
}

export function computeDocumentationEnglishSourceHash(bundle: DocumentationEnglishSourceBundle): string {
  return buildDocumentationEnglishSourceHash({
    title: bundle.title,
    summary: bundle.summary,
    content_html: bundle.content_html,
    category: bundle.category,
  });
}

export async function getDocumentationEnabledLanguages(admin: AdminClient): Promise<SupportedLanguage[]> {
  const all = await getPlatformEnabledTranslations(
    admin as unknown as SupabaseClient<any, 'public', any>
  );
  return CONTENT_TRANSLATION_ENABLED_LANGS.filter((l) => all.includes(l));
}

export async function loadDocumentationPendingTranslations(
  admin: AdminClient,
  articleId: string,
  sourceHash: string
): Promise<{
  needsWork: SupportedLanguage[];
  existingLanguagesWorkStatuses: Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }>;
}> {
  const result = await admin
    .from('documentation_translations')
    .select('language_code, translation_status, source_version_hash')
    .eq('article_id', articleId);
  const map = new Map<string, { status: TranslationStatus; hash: string }>();
  for (const r of result.data ?? []) {
    map.set(String((r as any).language_code), {
      status: (r as any).translation_status as TranslationStatus,
      hash: String((r as any).source_version_hash ?? ''),
    });
  }
  const existingLanguagesWorkStatuses: Array<{
    language: SupportedLanguage;
    status: TranslationStatus;
    hash: string;
  }> = [];
  const enabled = await getDocumentationEnabledLanguages(admin);
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

export async function scheduleDocumentationTranslations(
  admin: AdminClient,
  articleId: string,
  bundle: DocumentationEnglishSourceBundle,
  options: { regenerateAll?: boolean } = {}
): Promise<{
  sourceHash: string;
  scheduledLanguages: SupportedLanguage[];
  totalEnabled: number;
}> {
  const sourceHash = computeDocumentationEnglishSourceHash(bundle);
  const enabled = await getDocumentationEnabledLanguages(admin);
  const { needsWork, existingLanguagesWorkStatuses } = options.regenerateAll
    ? {
        needsWork: [...enabled],
        existingLanguagesWorkStatuses: [] as Array<{
          language: SupportedLanguage;
          status: TranslationStatus;
          hash: string;
        }>,
      }
    : await loadDocumentationPendingTranslations(admin, articleId, sourceHash);

  if (needsWork.length > 0) {
    const upsertRows = needsWork.map((language) => ({
      article_id: articleId,
      language_code: language,
      title: '',
      summary: '',
      content_html: '',
      category: '',
      source_version_hash: '',
      translation_status: 'pending' as TranslationStatus,
      last_error_message: null,
    }));
    const { error } = await admin
      .from('documentation_translations')
      .upsert(upsertRows, { onConflict: 'article_id,language_code', ignoreDuplicates: false });
    if (error) throw error;
  }

  const { error: parentHashError } = await admin
    .from('documentation_articles')
    .update({ en_source_version_hash: sourceHash, updated_at: new Date().toISOString() })
    .eq('id', articleId);
  if (parentHashError) throw parentHashError;

  return {
    sourceHash,
    scheduledLanguages: needsWork,
    totalEnabled: enabled.length,
  };
}

export type ProcessOneDocumentationResult = TranslationPerLang<DocumentationEnglishSourceBundle> & {
  attemptId: string;
  errorStage: string | null;
};

export async function processOneDocumentationTranslation(
  admin: AdminClient,
  articleId: string,
  language: SupportedLanguage,
  bundle: DocumentationEnglishSourceBundle
): Promise<ProcessOneDocumentationResult> {
  const sourceHash = computeDocumentationEnglishSourceHash(bundle);
  const aiTranslateResult = await translateDocumentationFields(language, bundle, { contentId: articleId });
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
      .from('documentation_translations')
      .select('title, summary, content_html, category, source_version_hash, translation_status')
      .eq('article_id', articleId)
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
  let sanitized: ReturnType<typeof sanitizeDocumentationTranslation> | null = null;
  if (aiResult) {
    sanitized = sanitizeDocumentationTranslation(aiResult as any);
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
    const { error } = await admin.from('documentation_translations').upsert(
      [
        {
          article_id: articleId,
          language_code: language,
          title: sanitized.title,
          summary: sanitized.summary,
          content_html: sanitized.content_html,
          category: sanitized.category,
          source_version_hash: sourceHash,
          translation_status: 'current' as TranslationStatus,
          last_error_message: null,
        },
      ],
      { onConflict: 'article_id,language_code' }
    );
    if (error) {
      const dbErrMsg = error instanceof Error ? error.message : 'Failed to persist translation row.';
      errorStage = 'database_upsert_failed';
      errorMsg = `[${attemptId}] database_upsert_failed: ${dbErrMsg}`;
      writeAttemptLog({
        attemptId,
        contentType: 'documentation_fields',
        contentId: articleId,
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
        summary: String(priorRow?.summary || ''),
        content_html: String(priorRow?.content_html || ''),
        category: String(priorRow?.category || ''),
        source_version_hash: String(priorRow?.source_version_hash ?? ''),
        translation_status: 'outdated' as TranslationStatus,
      }
    : {
        title: '',
        summary: '',
        content_html: '',
        category: '',
        source_version_hash: '',
        translation_status: 'failed' as TranslationStatus,
      };
  const finalErrorMessage = String(errorMsg || `[${attemptId}] required_translation_fields_empty: Translation failed.`).slice(0, 500);
  const { error: persistErr } = await admin
    .from('documentation_translations')
    .upsert(
      [
        {
          article_id: articleId,
          language_code: language,
          ...preserve,
          last_error_message: finalErrorMessage,
        },
      ],
      { onConflict: 'article_id,language_code' }
    );
  if (persistErr) {
    const persistMsg = `persist: ${String(persistErr.message || persistErr)}`;
    const combinedMsg = finalErrorMessage + ' | ' + persistMsg;
    writeAttemptLog({
      attemptId,
      contentType: 'documentation_fields',
      contentId: articleId,
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

export async function saveDocumentationTranslationsForArticle(
  admin: AdminClient,
  articleId: string,
  englishSource: DocumentationEnglishSourceBundle,
  options: { regenerateAll?: boolean } = {}
): Promise<{ sourceHash: string; scheduledLanguages: SupportedLanguage[]; totalEnabled: number }> {
  return scheduleDocumentationTranslations(admin, articleId, englishSource, options);
}
