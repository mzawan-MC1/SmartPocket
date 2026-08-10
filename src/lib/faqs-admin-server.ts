import 'server-only';

import type { PostgrestError } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FaqCategoryInput, FaqItemInput } from '@/lib/faqs';
import {
  FAQ_LANGUAGES,
  createEmptyFaqCategoryTranslations,
  createEmptyFaqItemTranslations,
  isFaqLanguageCode,
  sanitizeFaqAnswerHtml,
  sanitizeFaqKeywords,
  sanitizeFaqMultilineText,
  sanitizeFaqSingleLine,
} from '@/lib/faqs';
import { getAdminFaqDashboardData } from '@/lib/faqs-server';
import {
  buildFaqCategoryEnglishSourceHash,
  buildFaqItemEnglishSourceHash,
  CONTENT_TRANSLATION_ENABLED_LANGS,
  getPlatformEnabledTranslations,
  translateFaqCategoryFields,
  translateFaqItemFields,
  type TranslationPerLang,
  type TranslationStatus,
  writeAttemptLog,
} from '@/lib/content-translate-server';
import type { SupportedLanguage } from '@/i18n/registry';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

function isPgConflict(error: PostgrestError | null) {
  return error?.code === '23505';
}

export async function ensureUniqueFaqCategorySlug(args: {
  admin: AdminClient;
  slug: string;
  currentId?: string | null;
}) {
  const { data, error } = await args.admin
    .from('faq_categories')
    .select('id')
    .ilike('slug', args.slug);
  if (error) throw error;
  return !(data || []).some((row) => row.id !== args.currentId);
}

export async function ensureUniqueFaqItemSlug(args: {
  admin: AdminClient;
  slug: string;
  currentId?: string | null;
}) {
  const { data, error } = await args.admin
    .from('faq_items')
    .select('id')
    .ilike('slug', args.slug);
  if (error) throw error;
  return !(data || []).some((row) => row.id !== args.currentId);
}

export async function loadFaqCategoryOrNull(admin: AdminClient, id: string) {
  const { data, error } = await admin.from('faq_categories').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadFaqItemOrNull(admin: AdminClient, id: string) {
  const { data, error } = await admin.from('faq_items').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function loadFaqCategoryInputOrNull(admin: AdminClient, id: string) {
  const [category, translationsResult] = await Promise.all([
    loadFaqCategoryOrNull(admin, id),
    admin
      .from('faq_category_translations')
      .select('language_code, name, description')
      .eq('category_id', id),
  ]);
  if (!category) return null;
  if (translationsResult.error) throw translationsResult.error;
  const translations = createEmptyFaqCategoryTranslations();
  for (const row of translationsResult.data || []) {
    const languageCode = row.language_code;
    if (!isFaqLanguageCode(languageCode)) continue;
    translations[languageCode] = {
      name: row.name || '',
      description: row.description || '',
    };
  }
  return {
    slug: category.slug,
    icon: category.icon,
    sort_order: category.sort_order,
    is_active: category.is_active,
    translations,
  } satisfies FaqCategoryInput;
}

export async function loadFaqItemInputOrNull(admin: AdminClient, id: string) {
  const [item, translationsResult] = await Promise.all([
    loadFaqItemOrNull(admin, id),
    admin
      .from('faq_item_translations')
      .select('language_code, question, answer_html, keywords')
      .eq('item_id', id),
  ]);
  if (!item) return null;
  if (translationsResult.error) throw translationsResult.error;
  const translations = createEmptyFaqItemTranslations();
  for (const row of translationsResult.data || []) {
    const languageCode = row.language_code;
    if (!isFaqLanguageCode(languageCode)) continue;
    translations[languageCode] = {
      question: row.question || '',
      answer_html: row.answer_html || '',
      keywords: Array.isArray(row.keywords) ? row.keywords : [],
    };
  }
  return {
    category_id: item.category_id,
    slug: item.slug,
    sort_order: item.sort_order,
    is_active: item.is_active,
    is_featured: item.is_featured,
    translations,
  } satisfies FaqItemInput;
}

async function saveFaqCategoryTranslations(
  admin: AdminClient,
  categoryId: string,
  input: FaqCategoryInput,
  translationRows?: Array<{
    language_code: string;
    name?: string;
    description?: string;
    source_version_hash?: string;
    translation_status?: TranslationStatus;
    last_error_message?: string | null;
  }>
) {
  const overrideMap = new Map<string, any>();
  for (const r of translationRows || []) overrideMap.set(r.language_code, r);
  const rows = FAQ_LANGUAGES.map((language) => {
    const override = overrideMap.get(language);
    return {
      category_id: categoryId,
      language_code: language,
      name: override?.name ?? input.translations[language].name,
      description: override?.description ?? input.translations[language].description,
      source_version_hash: override?.source_version_hash ?? '',
      translation_status: override?.translation_status ?? (language === 'en' ? 'current' : 'missing'),
      last_error_message: override?.last_error_message ?? null,
    };
  });
  const { error } = await admin
    .from('faq_category_translations')
    .upsert(rows, { onConflict: 'category_id,language_code' });
  if (error) throw error;
}

async function saveFaqItemTranslations(
  admin: AdminClient,
  itemId: string,
  input: FaqItemInput,
  translationRows?: Array<{
    language_code: string;
    question?: string;
    answer_html?: string;
    keywords?: string[];
    source_version_hash?: string;
    translation_status?: TranslationStatus;
    last_error_message?: string | null;
  }>
) {
  const overrideMap = new Map<string, any>();
  for (const r of translationRows || []) overrideMap.set(r.language_code, r);
  const rows = FAQ_LANGUAGES.map((language) => {
    const override = overrideMap.get(language);
    return {
      item_id: itemId,
      language_code: language,
      question: override?.question ?? input.translations[language].question,
      answer_html: override?.answer_html ?? input.translations[language].answer_html,
      keywords: override?.keywords ?? input.translations[language].keywords,
      source_version_hash: override?.source_version_hash ?? '',
      translation_status: override?.translation_status ?? (language === 'en' ? 'current' : 'missing'),
      last_error_message: override?.last_error_message ?? null,
    };
  });
  const { error } = await admin
    .from('faq_item_translations')
    .upsert(rows, { onConflict: 'item_id,language_code' });
  if (error) throw error;
}

export type FaqTranslationStatusSummary = {
  enSourceHash: string;
  statuses: Array<{
    language: SupportedLanguage;
    status: TranslationStatus;
    sourceHashMatch: boolean;
    errorMessage?: string;
    updatedAt?: string;
  }>;
};

export async function loadFaqItemTranslationStatus(
  admin: AdminClient,
  itemId: string,
  enQuestion: string,
  enAnswerHtml: string,
  enKeywords: string[]
): Promise<FaqTranslationStatusSummary> {
  const enSourceHash = buildFaqItemEnglishSourceHash({
    enQuestion,
    enAnswerHtml,
    enKeywords,
  });
  const [parent, rows] = await Promise.all([
    admin.from('faq_items').select('en_source_version_hash').eq('id', itemId).maybeSingle(),
    admin
      .from('faq_item_translations')
      .select('language_code, translation_status, source_version_hash, last_error_message, updated_at')
      .eq('item_id', itemId),
  ]);
  const map = new Map<string, any>();
  for (const row of rows.data ?? []) map.set(String(row.language_code), row);
  const saved = String((parent?.data as any)?.en_source_version_hash ?? '');
  return {
    enSourceHash: saved || enSourceHash,
    statuses: CONTENT_TRANSLATION_ENABLED_LANGS.map((language) => {
      const row = map.get(language);
      const storedHash = String(row?.source_version_hash ?? '');
      return {
        language,
        status: (row?.translation_status as TranslationStatus) || 'missing',
        sourceHashMatch: Boolean(storedHash && storedHash === enSourceHash),
        errorMessage: row?.last_error_message || undefined,
        updatedAt: row?.updated_at,
      };
    }),
  };
}

export async function loadFaqCategoryTranslationStatus(
  admin: AdminClient,
  categoryId: string,
  enName: string,
  enDescription: string
): Promise<FaqTranslationStatusSummary> {
  const enSourceHash = buildFaqCategoryEnglishSourceHash({
    enName,
    enDescription,
  });
  const [parent, rows] = await Promise.all([
    admin.from('faq_categories').select('en_source_version_hash').eq('id', categoryId).maybeSingle(),
    admin
      .from('faq_category_translations')
      .select('language_code, translation_status, source_version_hash, last_error_message, updated_at')
      .eq('category_id', categoryId),
  ]);
  const map = new Map<string, any>();
  for (const row of rows.data ?? []) map.set(String(row.language_code), row);
  const saved = String((parent?.data as any)?.en_source_version_hash ?? '');
  return {
    enSourceHash: saved || enSourceHash,
    statuses: CONTENT_TRANSLATION_ENABLED_LANGS.map((language) => {
      const row = map.get(language);
      const storedHash = String(row?.source_version_hash ?? '');
      return {
        language,
        status: (row?.translation_status as TranslationStatus) || 'missing',
        sourceHashMatch: Boolean(storedHash && storedHash === enSourceHash),
        errorMessage: row?.last_error_message || undefined,
        updatedAt: row?.updated_at,
      };
    }),
  };
}

export async function upsertFaqCategoryTranslations(args: {
  admin: AdminClient;
  categoryId: string;
  input: FaqCategoryInput;
}) {
  await saveFaqCategoryTranslations(args.admin, args.categoryId, args.input);
}

export async function upsertFaqItemTranslations(args: {
  admin: AdminClient;
  itemId: string;
  input: FaqItemInput;
}) {
  await saveFaqItemTranslations(args.admin, args.itemId, args.input);
}

async function getFaqEnabledLanguages(admin: AdminClient): Promise<SupportedLanguage[]> {
  const all = await getPlatformEnabledTranslations(admin as any);
  return CONTENT_TRANSLATION_ENABLED_LANGS.filter((l) => all.includes(l));
}

async function loadFaqCategoryPendingTranslations(
  admin: AdminClient,
  categoryId: string,
  sourceHash: string
): Promise<{
  needsWork: SupportedLanguage[];
  existingLanguagesWorkStatuses: Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }>;
}> {
  const result = await admin
    .from('faq_category_translations')
    .select('language_code, translation_status, source_version_hash')
    .eq('category_id', categoryId);
  const map = new Map<string, { status: TranslationStatus; hash: string }>();
  for (const r of result.data ?? []) {
    map.set(String((r as any).language_code), {
      status: (r as any).translation_status as TranslationStatus,
      hash: String((r as any).source_version_hash ?? ''),
    });
  }
  const existingLanguagesWorkStatuses: Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }> = [];
  const enabled = await getFaqEnabledLanguages(admin);
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

async function loadFaqItemPendingTranslations(
  admin: AdminClient,
  itemId: string,
  sourceHash: string
): Promise<{
  needsWork: SupportedLanguage[];
  existingLanguagesWorkStatuses: Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }>;
}> {
  const result = await admin
    .from('faq_item_translations')
    .select('language_code, translation_status, source_version_hash')
    .eq('item_id', itemId);
  const map = new Map<string, { status: TranslationStatus; hash: string }>();
  for (const r of result.data ?? []) {
    map.set(String((r as any).language_code), {
      status: (r as any).translation_status as TranslationStatus,
      hash: String((r as any).source_version_hash ?? ''),
    });
  }
  const existingLanguagesWorkStatuses: Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }> = [];
  const enabled = await getFaqEnabledLanguages(admin);
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

function sanitizeFaqCategoryTranslation(val: { name?: string | null; description?: string | null }) {
  return {
    name: sanitizeFaqSingleLine(val.name, 120),
    description: sanitizeFaqMultilineText(val.description, 400),
  };
}

function sanitizeFaqItemTranslation(val: { question?: string | null; answer_html?: string | null; keywords?: string | string[] | null }) {
  return {
    question: sanitizeFaqSingleLine(val.question, 240),
    answer_html: sanitizeFaqAnswerHtml(val.answer_html),
    keywords: sanitizeFaqKeywords(val.keywords),
  };
}

export async function autoTranslateFaqCategory(
  admin: AdminClient,
  categoryId: string,
  input: FaqCategoryInput,
  options: { regenerateAll?: boolean } = {}
): Promise<{ sourceHash: string; scheduledLanguages: SupportedLanguage[]; totalEnabled: number }> {
  const en = input.translations.en;
  const sourceHash = buildFaqCategoryEnglishSourceHash({
    enName: en.name,
    enDescription: en.description,
  });
  const enabled = await getFaqEnabledLanguages(admin);
  const { needsWork, existingLanguagesWorkStatuses } = options.regenerateAll
    ? {
        needsWork: [...enabled],
        existingLanguagesWorkStatuses: [] as Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }>,
      }
    : await loadFaqCategoryPendingTranslations(admin, categoryId, sourceHash);

  if (needsWork.length > 0) {
    const upsertRows = needsWork.map((language) => ({
      category_id: categoryId,
      language_code: language,
      name: '',
      description: '',
      source_version_hash: '',
      translation_status: 'pending' as TranslationStatus,
      last_error_message: null,
    }));
    const { error } = await admin
      .from('faq_category_translations')
      .upsert(upsertRows, { onConflict: 'category_id,language_code', ignoreDuplicates: false });
    if (error) throw error;
  }

  const { error: parentHashError } = await admin
    .from('faq_categories')
    .update({ en_source_version_hash: sourceHash, updated_at: new Date().toISOString() })
    .eq('id', categoryId);
  if (parentHashError) throw parentHashError;

  return {
    sourceHash,
    scheduledLanguages: needsWork,
    totalEnabled: enabled.length,
  };
}

export type ProcessOneFaqCategoryResult = TranslationPerLang<{ name: string; description: string }> & {
  attemptId: string;
  errorStage: string | null;
};

export async function processOneFaqCategoryTranslation(
  admin: AdminClient,
  categoryId: string,
  language: SupportedLanguage,
  input: FaqCategoryInput
): Promise<ProcessOneFaqCategoryResult> {
  const en = input.translations.en;
  const sourceHash = buildFaqCategoryEnglishSourceHash({
    enName: en.name,
    enDescription: en.description,
  });
  const aiTranslateResult = await translateFaqCategoryFields(
    language,
    { name: en.name, description: en.description },
    { contentId: categoryId }
  );
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

  const priorRow = (
    await admin
      .from('faq_category_translations')
      .select('name, description, source_version_hash')
      .eq('category_id', categoryId)
      .eq('language_code', language)
      .maybeSingle()
  ).data as any;
  const priorHasContent = Boolean(
    priorRow && (String(priorRow.name || '') || String(priorRow.description || ''))
  );

  if (aiResult) {
    const sanitized = sanitizeFaqCategoryTranslation(aiResult as any);
    const enNameNonEmpty = en.name.trim() !== '';
    const translatedNameEmpty = sanitized.name.trim() === '';
    if (enNameNonEmpty && translatedNameEmpty) {
      errorStage = 'schema_validation_failed';
      errorMsg = `[${attemptId}] schema_validation_failed: Schema/empty-error: translated category name is empty while English source has content.`;
    } else {
      const { error } = await admin.from('faq_category_translations').upsert(
        [
          {
            category_id: categoryId,
            language_code: language,
            name: sanitized.name,
            description: sanitized.description,
            source_version_hash: sourceHash,
            translation_status: 'current' as TranslationStatus,
            last_error_message: null,
          },
        ],
        { onConflict: 'category_id,language_code' }
      );
      if (error) {
        const dbErrMsg = error instanceof Error ? error.message : 'Failed to persist translation row.';
        errorStage = 'database_upsert_failed';
        errorMsg = `[${attemptId}] database_upsert_failed: ${dbErrMsg}`;
        writeAttemptLog({
          attemptId,
          contentType: 'faq_category_fields',
          contentId: categoryId,
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
          errorMessage: errorMsg.slice(0, 500),
          attemptId,
          errorStage,
        };
      }
      return { language, status: 'current', result: sanitized, attemptId, errorStage: null };
    }
  }

  const preserve: any = priorHasContent
    ? {
        name: String(priorRow?.name || ''),
        description: String(priorRow?.description || ''),
        source_version_hash: String(priorRow?.source_version_hash ?? ''),
        translation_status: 'outdated' as TranslationStatus,
      }
    : {
        name: '',
        description: '',
        source_version_hash: '',
        translation_status: 'failed' as TranslationStatus,
      };
  const finalErrorMessage = String(errorMsg || `[${attemptId}] required_translation_fields_empty: Translation failed.`).slice(0, 500);
  const { error: persistErr } = await admin
    .from('faq_category_translations')
    .upsert(
      [
        {
          category_id: categoryId,
          language_code: language,
          ...preserve,
          last_error_message: finalErrorMessage,
        },
      ],
      { onConflict: 'category_id,language_code' }
    );
  if (persistErr) {
    const persistMsg = `persist: ${String(persistErr.message || persistErr)}`;
    const combinedMsg = finalErrorMessage + ' | ' + persistMsg;
    writeAttemptLog({
      attemptId,
      contentType: 'faq_category_fields',
      contentId: categoryId,
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
      status: (priorHasContent ? 'outdated' : 'failed') as TranslationStatus,
      errorMessage: combinedMsg.slice(0, 500),
      attemptId,
      errorStage,
    };
  }
  return {
    language,
    status: (priorHasContent ? 'outdated' : 'failed') as TranslationStatus,
    errorMessage: finalErrorMessage,
    attemptId,
    errorStage,
  };
}

export async function autoTranslateFaqItem(
  admin: AdminClient,
  itemId: string,
  input: FaqItemInput,
  options: { regenerateAll?: boolean } = {}
): Promise<{ sourceHash: string; scheduledLanguages: SupportedLanguage[]; totalEnabled: number }> {
  const en = input.translations.en;
  const sourceHash = buildFaqItemEnglishSourceHash({
    enQuestion: en.question,
    enAnswerHtml: en.answer_html,
    enKeywords: en.keywords,
  });
  const enabled = await getFaqEnabledLanguages(admin);
  const { needsWork, existingLanguagesWorkStatuses } = options.regenerateAll
    ? {
        needsWork: [...enabled],
        existingLanguagesWorkStatuses: [] as Array<{ language: SupportedLanguage; status: TranslationStatus; hash: string }>,
      }
    : await loadFaqItemPendingTranslations(admin, itemId, sourceHash);

  if (needsWork.length > 0) {
    const upsertRows = needsWork.map((language) => ({
      item_id: itemId,
      language_code: language,
      question: '',
      answer_html: '',
      keywords: [],
      source_version_hash: '',
      translation_status: 'pending' as TranslationStatus,
      last_error_message: null,
    }));
    const { error } = await admin
      .from('faq_item_translations')
      .upsert(upsertRows, { onConflict: 'item_id,language_code', ignoreDuplicates: false });
    if (error) throw error;
  }

  const { error: parentHashError } = await admin
    .from('faq_items')
    .update({ en_source_version_hash: sourceHash, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (parentHashError) throw parentHashError;

  return {
    sourceHash,
    scheduledLanguages: needsWork,
    totalEnabled: enabled.length,
  };
}

export type ProcessOneFaqItemResult = TranslationPerLang<{ question: string; answer_html: string; keywords: string[] }> & {
  attemptId: string;
  errorStage: string | null;
};

export async function processOneFaqItemTranslation(
  admin: AdminClient,
  itemId: string,
  language: SupportedLanguage,
  input: FaqItemInput
): Promise<ProcessOneFaqItemResult> {
  const en = input.translations.en;
  const sourceHash = buildFaqItemEnglishSourceHash({
    enQuestion: en.question,
    enAnswerHtml: en.answer_html,
    enKeywords: en.keywords,
  });
  const aiTranslateResult = await translateFaqItemFields(
    language,
    {
      question: en.question,
      answer_html: en.answer_html,
      keywords: en.keywords,
    },
    { contentId: itemId }
  );
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

  const priorRow = (
    await admin
      .from('faq_item_translations')
      .select('question, answer_html, keywords, source_version_hash')
      .eq('item_id', itemId)
      .eq('language_code', language)
      .maybeSingle()
  ).data as any;
  const priorHasContent = Boolean(
    priorRow && (String(priorRow.question || '') || String(priorRow.answer_html || ''))
  );

  if (aiResult) {
    const sanitized = sanitizeFaqItemTranslation(aiResult as any);
    const enQuestionNonEmpty = en.question.trim() !== '';
    const translatedQuestionEmpty = sanitized.question.trim() === '';
    const translatedAnswerEmpty = sanitized.answer_html.trim() === '';
    if (enQuestionNonEmpty && (translatedQuestionEmpty || translatedAnswerEmpty)) {
      errorStage = 'schema_validation_failed';
      errorMsg = `[${attemptId}] schema_validation_failed: Schema/empty-error: translated question or answer_html is empty while English source has content.`;
    } else {
      const { error } = await admin.from('faq_item_translations').upsert(
        [
          {
            item_id: itemId,
            language_code: language,
            question: sanitized.question,
            answer_html: sanitized.answer_html,
            keywords: sanitized.keywords,
            source_version_hash: sourceHash,
            translation_status: 'current' as TranslationStatus,
            last_error_message: null,
          },
        ],
        { onConflict: 'item_id,language_code' }
      );
      if (error) {
        const dbErrMsg = error instanceof Error ? error.message : 'Failed to persist translation row.';
        errorStage = 'database_upsert_failed';
        errorMsg = `[${attemptId}] database_upsert_failed: ${dbErrMsg}`;
        writeAttemptLog({
          attemptId,
          contentType: 'faq_item_fields',
          contentId: itemId,
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
          errorMessage: errorMsg.slice(0, 500),
          attemptId,
          errorStage,
        };
      }
      return { language, status: 'current', result: sanitized, attemptId, errorStage: null };
    }
  }

  const preserve: any = priorHasContent
    ? {
        question: String(priorRow?.question || ''),
        answer_html: String(priorRow?.answer_html || ''),
        keywords: Array.isArray(priorRow?.keywords) ? priorRow.keywords : [],
        source_version_hash: String(priorRow?.source_version_hash ?? ''),
        translation_status: 'outdated' as TranslationStatus,
      }
    : {
        question: '',
        answer_html: '',
        keywords: [],
        source_version_hash: '',
        translation_status: 'failed' as TranslationStatus,
      };
  const finalErrorMessage = String(errorMsg || `[${attemptId}] required_translation_fields_empty: Translation failed.`).slice(0, 500);
  const { error: persistErr } = await admin
    .from('faq_item_translations')
    .upsert(
      [
        {
          item_id: itemId,
          language_code: language,
          ...preserve,
          last_error_message: finalErrorMessage,
        },
      ],
      { onConflict: 'item_id,language_code' }
    );
  if (persistErr) {
    const persistMsg = `persist: ${String(persistErr.message || persistErr)}`;
    const combinedMsg = finalErrorMessage + ' | ' + persistMsg;
    writeAttemptLog({
      attemptId,
      contentType: 'faq_item_fields',
      contentId: itemId,
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
      status: (priorHasContent ? 'outdated' : 'failed') as TranslationStatus,
      errorMessage: combinedMsg.slice(0, 500),
      attemptId,
      errorStage,
    };
  }
  return {
    language,
    status: (priorHasContent ? 'outdated' : 'failed') as TranslationStatus,
    errorMessage: finalErrorMessage,
    attemptId,
    errorStage,
  };
}

export async function createFaqCategory(args: { admin: AdminClient; input: FaqCategoryInput }) {
  const { data, error } = await args.admin
    .from('faq_categories')
    .insert({
      slug: args.input.slug,
      icon: args.input.icon,
      sort_order: args.input.sort_order,
      is_active: args.input.is_active,
    })
    .select('*')
    .single();
  if (error) {
    if (isPgConflict(error)) throw new Error('A category with this slug already exists.');
    throw error;
  }
  await autoTranslateFaqCategory(args.admin, data.id, args.input, { regenerateAll: true });
  return data;
}

export async function updateFaqCategory(args: {
  admin: AdminClient;
  categoryId: string;
  input: FaqCategoryInput;
  enChanged?: boolean;
}) {
  const { data, error } = await args.admin
    .from('faq_categories')
    .update({
      slug: args.input.slug,
      icon: args.input.icon,
      sort_order: args.input.sort_order,
      is_active: args.input.is_active,
    })
    .eq('id', args.categoryId)
    .select('*')
    .single();
  if (error) {
    if (isPgConflict(error)) throw new Error('A category with this slug already exists.');
    throw error;
  }
  await saveFaqCategoryTranslations(args.admin, args.categoryId, args.input, [
    {
      language_code: 'en',
      name: args.input.translations.en.name,
      description: args.input.translations.en.description,
      source_version_hash: '',
      translation_status: 'current',
      last_error_message: null,
    },
  ]);
  if (args.enChanged !== false) {
    await autoTranslateFaqCategory(args.admin, args.categoryId, args.input, { regenerateAll: false });
  }
  return data;
}

export async function createFaqItem(args: { admin: AdminClient; input: FaqItemInput }) {
  const { data, error } = await args.admin
    .from('faq_items')
    .insert({
      category_id: args.input.category_id,
      slug: args.input.slug,
      sort_order: args.input.sort_order,
      is_active: args.input.is_active,
      is_featured: args.input.is_featured,
    })
    .select('*')
    .single();
  if (error) {
    if (isPgConflict(error)) throw new Error('An FAQ with this slug already exists.');
    throw error;
  }
  await saveFaqItemTranslations(args.admin, data.id, args.input, [
    {
      language_code: 'en',
      question: args.input.translations.en.question,
      answer_html: args.input.translations.en.answer_html,
      keywords: args.input.translations.en.keywords,
      source_version_hash: '',
      translation_status: 'current',
      last_error_message: null,
    },
  ]);
  await autoTranslateFaqItem(args.admin, data.id, args.input, { regenerateAll: true });
  return data;
}

export async function updateFaqItem(args: {
  admin: AdminClient;
  itemId: string;
  input: FaqItemInput;
  enChanged?: boolean;
}) {
  const { data, error } = await args.admin
    .from('faq_items')
    .update({
      category_id: args.input.category_id,
      slug: args.input.slug,
      sort_order: args.input.sort_order,
      is_active: args.input.is_active,
      is_featured: args.input.is_featured,
    })
    .eq('id', args.itemId)
    .select('*')
    .single();
  if (error) {
    if (isPgConflict(error)) throw new Error('An FAQ with this slug already exists.');
    throw error;
  }
  await saveFaqItemTranslations(args.admin, args.itemId, args.input, [
    {
      language_code: 'en',
      question: args.input.translations.en.question,
      answer_html: args.input.translations.en.answer_html,
      keywords: args.input.translations.en.keywords,
      source_version_hash: '',
      translation_status: 'current',
      last_error_message: null,
    },
  ]);
  if (args.enChanged !== false) {
    await autoTranslateFaqItem(args.admin, args.itemId, args.input, { regenerateAll: false });
  }
  return data;
}

export function enCategoryChanged(
  prev: FaqCategoryInput,
  next: FaqCategoryInput
) {
  const a = prev.translations.en;
  const b = next.translations.en;
  return a.name !== b.name || a.description !== b.description;
}

export function enItemChanged(prev: FaqItemInput, next: FaqItemInput) {
  const a = prev.translations.en;
  const b = next.translations.en;
  if (a.question !== b.question) return true;
  if (a.answer_html !== b.answer_html) return true;
  const ak = (a.keywords || []).join('|');
  const bk = (b.keywords || []).join('|');
  return ak !== bk;
}

export function mergeItemInputWithExisting(args: {
  existing: FaqItemInput;
  input: Partial<FaqItemInput>;
}): FaqItemInput;
export function mergeItemInputWithExisting(args: {
  input: Partial<FaqItemInput>;
  existing?: FaqItemInput | null;
}): Partial<FaqItemInput>;
export function mergeItemInputWithExisting(args:
  | { existing: FaqItemInput; input: Partial<FaqItemInput> }
  | { input: Partial<FaqItemInput>; existing?: FaqItemInput | null }
): any {
  const existingOrNull =
    'existing' in args
      ? args.existing
      : args.existing ?? null;
  const inputArg = args.input;
  const base: FaqItemInput = (existingOrNull ?? {
    category_id: '',
    slug: '',
    sort_order: 0,
    is_active: true,
    is_featured: false,
    translations: createEmptyFaqItemTranslations(),
  }) as FaqItemInput;
  const result: FaqItemInput = {
    ...base,
    translations: createEmptyFaqItemTranslations(),
  };
  for (const lang of FAQ_LANGUAGES) {
    result.translations[lang] = {
      ...base.translations[lang],
      ...inputArg.translations?.[lang],
    };
  }
  result.category_id = typeof inputArg.category_id === 'string' ? inputArg.category_id : base.category_id;
  result.slug = typeof inputArg.slug === 'string' ? inputArg.slug : base.slug;
  result.sort_order = Number.isFinite(inputArg.sort_order as number)
    ? Number(inputArg.sort_order)
    : base.sort_order;
  result.is_active = typeof inputArg.is_active === 'boolean' ? inputArg.is_active : base.is_active;
  result.is_featured = typeof inputArg.is_featured === 'boolean' ? inputArg.is_featured : base.is_featured;
  return result;
}

export function mergeCategoryInputWithExisting(args: {
  existing: FaqCategoryInput;
  input: Partial<FaqCategoryInput>;
}): FaqCategoryInput;
export function mergeCategoryInputWithExisting(args: {
  input: Partial<FaqCategoryInput>;
  existing?: FaqCategoryInput | null;
}): Partial<FaqCategoryInput>;
export function mergeCategoryInputWithExisting(args:
  | { existing: FaqCategoryInput; input: Partial<FaqCategoryInput> }
  | { input: Partial<FaqCategoryInput>; existing?: FaqCategoryInput | null }
): any {
  const existingOrNull =
    'existing' in args
      ? args.existing
      : args.existing ?? null;
  const inputArg = args.input;
  const base: FaqCategoryInput = (existingOrNull ?? {
    slug: '',
    icon: null,
    sort_order: 0,
    is_active: true,
    translations: createEmptyFaqCategoryTranslations(),
  }) as FaqCategoryInput;
  const result: FaqCategoryInput = {
    ...base,
    translations: createEmptyFaqCategoryTranslations(),
  };
  for (const lang of FAQ_LANGUAGES) {
    result.translations[lang] = {
      ...base.translations[lang],
      ...inputArg.translations?.[lang],
    };
  }
  result.slug = typeof inputArg.slug === 'string' ? inputArg.slug : base.slug;
  result.icon = typeof inputArg.icon === 'string' || inputArg.icon === null ? inputArg.icon : base.icon;
  result.sort_order = Number.isFinite(inputArg.sort_order as number)
    ? Number(inputArg.sort_order)
    : base.sort_order;
  result.is_active = typeof inputArg.is_active === 'boolean' ? inputArg.is_active : base.is_active;
  return result;
}

export async function deleteFaqCategory(args: {
  admin: AdminClient;
  categoryId: string;
}) {
  const { error } = await args.admin
    .from('faq_categories')
    .delete()
    .eq('id', args.categoryId);

  if (error) {
    throw error;
  }
}

export async function deleteFaqItem(args: {
  admin: AdminClient;
  itemId: string;
}) {
  const { error } = await args.admin
    .from('faq_items')
    .delete()
    .eq('id', args.itemId);

  if (error) {
    throw error;
  }
}

export async function reorderFaqCategories(args: {
  admin: AdminClient;
  ids: string[];
}) {
  for (const [index, id] of args.ids.entries()) {
    const { error } = await args.admin
      .from('faq_categories')
      .update({ sort_order: index * 10 })
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      throw error;
    }
  }
}

export async function reorderFaqItems(args: {
  admin: AdminClient;
  ids: string[];
}) {
  for (const [index, id] of args.ids.entries()) {
    const { error } = await args.admin
      .from('faq_items')
      .update({ sort_order: index * 10 })
      .eq('id', id)
      .select('id')
      .single();

    if (error) {
      throw error;
    }
  }
}

export async function loadFaqCategoryQuestionCount(args: {
  admin: AdminClient;
  categoryId: string;
}) {
  const { count, error } = await args.admin
    .from('faq_items')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', args.categoryId);

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function listFaqCategoriesForApi() {
  const data = await getAdminFaqDashboardData();
  return data.categories;
}

export async function listFaqItemsForApi() {
  const data = await getAdminFaqDashboardData();
  return data.items;
}
