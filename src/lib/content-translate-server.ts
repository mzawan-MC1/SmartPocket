import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAIConfig, type OpenRouterTextRewriteResponse } from './ai-gateway';
import {
  getOpenRouterBaseUrl,
  getOpenRouterHeaders,
} from './ai-gateway';
import { isOpenRouterEnabled } from './ai-provider-config';
import { safeParseJSON } from './ai-types';
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from '@/i18n/registry';

export const TRANSLATION_PROVIDER_TIMEOUT_MS = 50_000;

export type TranslationAttemptStage =
  | 'start'
  | 'provider_request_failed'
  | 'provider_returned_no_text'
  | 'unsupported_gateway_response_shape'
  | 'invalid_json'
  | 'schema_validation_failed'
  | 'required_translation_fields_empty'
  | 'disabled_or_empty_input'
  | 'abort_or_timeout'
  | 'provider_timeout'
  | 'database_upsert_failed'
  | 'success';

export type TranslationAttemptLog = {
  attemptId: string;
  contentType: 'blog_fields' | 'faq_category_fields' | 'faq_item_fields';
  contentId?: string;
  targetLanguage: string;
  model: string;
  providerStatus: number | null;
  stage: TranslationAttemptStage;
  responseShape: string;
  candidateTextExists: boolean;
  candidateTextLength: number;
  errorCategory: string | null;
  errorMessageSafe: string | null;
  elapsedMs: number;
};

export type TranslationFailure = {
  stage: Exclude<TranslationAttemptStage, 'start' | 'success'>;
  safeMessage: string;
};

function newAttemptId(): string {
  const h = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 12; i++) s += h[Math.floor(Math.random() * 16)];
  return 'txl_' + s;
}

export function writeAttemptLog(entry: TranslationAttemptLog): void {
  const line = JSON.stringify(entry);
  if (entry.stage === 'success' || entry.stage === 'start') {
    console.log(line);
  } else {
    console.error(line);
  }
}

function classifyResponseShape(content: unknown): string {
  if (content == null) return 'null';
  if (typeof content === 'string') return 'string';
  if (Array.isArray(content)) return 'block_array';
  if (typeof content === 'object') return 'json_object';
  return 'unsupported';
}

export const CONTENT_TRANSLATION_ENABLED_LANGS = SUPPORTED_LANGUAGE_CODES.filter((l) => l !== 'en');

export type TranslationStatus = 'current' | 'outdated' | 'failed' | 'pending' | 'missing';

const TRANSLATION_SYSTEM_PROMPT = `You are an accurate, natural translator for Smart Pocket, a personal finance application.

RULES:
- Translate ONLY English source fields into the requested target language.
- Preserve all HTML structure: headings, paragraphs, lists, bold/italic, links, code blocks, blockquotes, line breaks.
- Preserve URLs exactly as given. Never rewrite links.
- Keep the exact string "Smart Pocket" untranslated everywhere.
- Keep product names, currencies, amounts, dates, slugs, codes, IDs, author names, numeric values unchanged.
- Never invent new claims, features, or metadata.
- Keep emoji and formatting symbols intact.
- If a field is empty, return it empty.
- Return STRICT, VALID JSON only. No prose, no markdown fences, no commentary.

JSON schema (top-level keys match the requested fields; every value must be a string):
{
  "<field1>": "<translated value>",
  "<field2>": "<translated value>"
}`;

function buildSourceHash(values: Array<unknown>): string {
  const joined = values
    .map((v) => {
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.map((x) => String(x ?? '')).join(',');
      return String(v ?? '');
    })
    .join('\u0001');
  return createHash('sha256').update(joined).digest('hex').slice(0, 32);
}

export function buildBlogEnglishSourceHash(blog: {
  title: string;
  excerpt?: string | null;
  content_html: string;
  category?: string | null;
  tags?: string[] | null;
  cover_image_alt?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  seo_keywords?: string | string[] | null;
  og_title?: string | null;
  og_description?: string | null;
  twitter_title?: string | null;
  twitter_description?: string | null;
}): string {
  return buildSourceHash([
    blog.title,
    blog.excerpt,
    blog.content_html,
    blog.category,
    Array.isArray(blog.tags) ? blog.tags.join(',') : blog.tags,
    blog.cover_image_alt,
    blog.seo_title,
    blog.seo_description,
    Array.isArray(blog.seo_keywords)
      ? blog.seo_keywords.join(',')
      : typeof blog.seo_keywords === 'string'
        ? blog.seo_keywords
        : '',
    blog.og_title,
    blog.og_description,
    blog.twitter_title,
    blog.twitter_description,
  ]);
}

export function buildFaqCategoryEnglishSourceHash(cat: {
  enName: string;
  enDescription: string;
}): string {
  return buildSourceHash([cat.enName, cat.enDescription]);
}

export function buildFaqItemEnglishSourceHash(item: {
  enQuestion: string;
  enAnswerHtml: string;
  enKeywords: string[];
}): string {
  return buildSourceHash([item.enQuestion, item.enAnswerHtml, item.enKeywords.join(',')]);
}

async function callOpenRouterTranslation(
  attempt: { attemptId: string; contentType: TranslationAttemptLog['contentType']; contentId?: string; startTs: number; model: string },
  targetLanguage: SupportedLanguage,
  fields: Record<string, string>,
  timeoutMs: number
): Promise<{ fieldsOut: Record<string, string> | null; failure: TranslationFailure | null }> {
  if (!isOpenRouterEnabled()) {
    return {
      fieldsOut: null,
      failure: {
        stage: 'provider_request_failed',
        safeMessage: 'OpenRouter provider is disabled. Set OPENROUTER_ENABLED=true to enable content translation.',
      },
    };
  }
  const model = attempt.model;
  if (Object.keys(fields).length === 0) {
    writeAttemptLog({
      attemptId: attempt.attemptId,
      contentType: attempt.contentType,
      contentId: attempt.contentId,
      targetLanguage,
      model,
      providerStatus: null,
      stage: 'disabled_or_empty_input',
      responseShape: 'null',
      candidateTextExists: false,
      candidateTextLength: 0,
      errorCategory: 'disabled_or_empty_input',
      errorMessageSafe: 'No translatable fields provided.',
      elapsedMs: Date.now() - attempt.startTs,
    });
    return { fieldsOut: null, failure: { stage: 'disabled_or_empty_input', safeMessage: 'No translatable fields provided.' } };
  }
  const config = loadAIConfig();
  if (!config.aiEnabled) {
    writeAttemptLog({
      attemptId: attempt.attemptId,
      contentType: attempt.contentType,
      contentId: attempt.contentId,
      targetLanguage,
      model,
      providerStatus: null,
      stage: 'disabled_or_empty_input',
      responseShape: 'null',
      candidateTextExists: false,
      candidateTextLength: 0,
      errorCategory: 'disabled_or_empty_input',
      errorMessageSafe: 'AI translation is disabled in platform settings.',
      elapsedMs: Date.now() - attempt.startTs,
    });
    return { fieldsOut: null, failure: { stage: 'disabled_or_empty_input', safeMessage: 'AI translation is disabled in platform settings.' } };
  }

  const userPrompt = `Translate the following English fields into ${targetLanguage}.

Target language BCP-47: ${targetLanguage}.

Return ONLY valid JSON with exactly these keys:
${JSON.stringify(Object.keys(fields), null, 2)}

English source fields:
${JSON.stringify(fields, null, 2)}`;

  const controller = new AbortController();
  let providerTimeoutTriggered = false;
  const timer = setTimeout(() => {
    providerTimeoutTriggered = true;
    controller.abort();
  }, timeoutMs);
  let providerStatus: number | null = null;
  let responseShape: string = 'null';
  let candidateTextExists = false;
  let candidateTextLength = 0;
  try {
    const response = await fetch(`${getOpenRouterBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: getOpenRouterHeaders(),
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: TRANSLATION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
        max_tokens: 4096,
      }),
      signal: controller.signal,
    });
    providerStatus = response.status;
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const safeMsg = `Provider HTTP ${response.status}: ${errText.slice(0, 200)}`;
      writeAttemptLog({
        attemptId: attempt.attemptId,
        contentType: attempt.contentType,
        contentId: attempt.contentId,
        targetLanguage,
        model,
        providerStatus,
        stage: 'provider_request_failed',
        responseShape: 'null',
        candidateTextExists: false,
        candidateTextLength: 0,
        errorCategory: 'provider_request_failed',
        errorMessageSafe: safeMsg,
        elapsedMs: Date.now() - attempt.startTs,
      });
      throw new Error(`[${attempt.attemptId}] provider_request_failed: ${safeMsg}`);
    }
    const raw = await response.json() as OpenRouterTextRewriteResponse['rawOutput'];
    const choices = (raw as any)?.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const content = choices?.[0]?.message?.content;
    responseShape = classifyResponseShape(content);

    let contentText: string;
    if (typeof content === 'string') {
      contentText = content.trim();
    } else if (Array.isArray(content)) {
      contentText = content
        .filter((b: any) => b?.type === 'text')
        .map((b: any) => String(b.text || ''))
        .join('')
        .trim();
    } else {
      contentText = '';
    }

    contentText = contentText
      .replace(/^```[\w-]*\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();

    candidateTextExists = !!contentText;
    candidateTextLength = contentText.length;

    if (!contentText) {
      writeAttemptLog({
        attemptId: attempt.attemptId,
        contentType: attempt.contentType,
        contentId: attempt.contentId,
        targetLanguage,
        model,
        providerStatus,
        stage: 'provider_returned_no_text',
        responseShape,
        candidateTextExists,
        candidateTextLength,
        errorCategory: 'provider_returned_no_text',
        errorMessageSafe: 'Provider returned no text content.',
        elapsedMs: Date.now() - attempt.startTs,
      });
      throw new Error(`[${attempt.attemptId}] provider_returned_no_text: Provider returned no text content.`);
    }

    const parsed = safeParseJSON(contentText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      const snippet = String(contentText).slice(0, 240);
      writeAttemptLog({
        attemptId: attempt.attemptId,
        contentType: attempt.contentType,
        contentId: attempt.contentId,
        targetLanguage,
        model,
        providerStatus,
        stage: 'invalid_json',
        responseShape,
        candidateTextExists,
        candidateTextLength,
        errorCategory: 'invalid_json',
        errorMessageSafe: 'Could not parse structured response.',
        elapsedMs: Date.now() - attempt.startTs,
      });
      throw new Error(`[${attempt.attemptId}] invalid_json: Could not parse structured response. First 240 chars: ${snippet}`);
    }

    const requiredCoreFields = ['title', 'content_html'];
    const missing: string[] = [];
    for (const key of Object.keys(fields)) {
      const sourceHasContent = fields[key].trim().length > 0;
      const isRequiredCore = requiredCoreFields.includes(key);
      if (sourceHasContent || isRequiredCore) {
        const outVal = (parsed as Record<string, unknown>)[key];
        if (typeof outVal !== 'string') {
          missing.push(key);
        }
      }
    }
    if (missing.length > 0) {
      const firstKeys = JSON.stringify(Object.keys(parsed)).slice(0, 120);
      writeAttemptLog({
        attemptId: attempt.attemptId,
        contentType: attempt.contentType,
        contentId: attempt.contentId,
        targetLanguage,
        model,
        providerStatus,
        stage: 'schema_validation_failed',
        responseShape,
        candidateTextExists,
        candidateTextLength,
        errorCategory: 'schema_validation_failed',
        errorMessageSafe: `Missing or wrong-typed translated fields. Missing keys=${missing.join(',')}`,
        elapsedMs: Date.now() - attempt.startTs,
      });
      throw new Error(`[${attempt.attemptId}] schema_validation_failed: Missing or wrong-typed translated fields. Missing keys=${missing.join(',')}; first_keys=${firstKeys}`);
    }

    const result: Record<string, string> = {};
    for (const key of Object.keys(fields)) {
      result[key] = typeof parsed[key] === 'string' ? String(parsed[key]) : fields[key];
    }

    let anyNonEmptyRequired = false;
    for (const key of Object.keys(fields)) {
      const sourceHasContent = fields[key].trim().length > 0;
      const isRequiredCore = requiredCoreFields.includes(key);
      if ((sourceHasContent || isRequiredCore) && result[key].trim().length > 0) {
        anyNonEmptyRequired = true;
        break;
      }
    }
    if (!anyNonEmptyRequired) {
      writeAttemptLog({
        attemptId: attempt.attemptId,
        contentType: attempt.contentType,
        contentId: attempt.contentId,
        targetLanguage,
        model,
        providerStatus,
        stage: 'required_translation_fields_empty',
        responseShape,
        candidateTextExists,
        candidateTextLength,
        errorCategory: 'required_translation_fields_empty',
        errorMessageSafe: 'All required translation fields came back empty.',
        elapsedMs: Date.now() - attempt.startTs,
      });
      return { fieldsOut: null, failure: { stage: 'required_translation_fields_empty', safeMessage: 'All required translation fields came back empty.' } };
    }

    writeAttemptLog({
      attemptId: attempt.attemptId,
      contentType: attempt.contentType,
      contentId: attempt.contentId,
      targetLanguage,
      model,
      providerStatus,
      stage: 'success',
      responseShape,
      candidateTextExists,
      candidateTextLength,
      errorCategory: null,
      errorMessageSafe: null,
      elapsedMs: Date.now() - attempt.startTs,
    });
    return { fieldsOut: result, failure: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || 'Unknown');
    if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) {
      const resolvedStage: Exclude<TranslationAttemptStage, 'start' | 'success'> = providerTimeoutTriggered
        ? 'provider_timeout'
        : 'abort_or_timeout';
      const safeMsg = providerTimeoutTriggered
        ? `Provider call exceeded the ${timeoutMs} ms timeout configured for translation.`
        : 'Aborted or timed out.';
      writeAttemptLog({
        attemptId: attempt.attemptId,
        contentType: attempt.contentType,
        contentId: attempt.contentId,
        targetLanguage,
        model,
        providerStatus,
        stage: resolvedStage,
        responseShape,
        candidateTextExists,
        candidateTextLength,
        errorCategory: resolvedStage,
        errorMessageSafe: safeMsg,
        elapsedMs: Date.now() - attempt.startTs,
      });
      return { fieldsOut: null, failure: { stage: resolvedStage, safeMessage: safeMsg } };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export type BlogFieldsTranslated = { title: string; excerpt: string; content_html: string; category: string; tags: string[]; cover_image_alt: string; seo_title: string; seo_description: string; seo_keywords: string[]; og_title: string; og_description: string; twitter_title: string; twitter_description: string };

export type TranslateFieldsResult<T> = {
  translatedFields: T | null;
  attemptId: string;
  failure: TranslationFailure | null;
};

export async function translateBlogFields(
  targetLanguage: SupportedLanguage,
  englishFields: {
    title: string;
    excerpt: string;
    content_html: string;
    category: string;
    tags: string[];
    cover_image_alt: string;
    seo_title: string;
    seo_description: string;
    seo_keywords: string[];
    og_title: string;
    og_description: string;
    twitter_title: string;
    twitter_description: string;
  },
  options?: { contentId?: string }
): Promise<TranslateFieldsResult<BlogFieldsTranslated>> {
  const attemptId = newAttemptId();
  const startTs = Date.now();
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini';
  writeAttemptLog({
    attemptId,
    contentType: 'blog_fields',
    contentId: options?.contentId,
    targetLanguage,
    model,
    providerStatus: null,
    stage: 'start',
    responseShape: 'null',
    candidateTextExists: false,
    candidateTextLength: 0,
    errorCategory: null,
    errorMessageSafe: null,
    elapsedMs: 0,
  });
  const textFields: Record<string, string> = {
    title: englishFields.title,
    excerpt: englishFields.excerpt,
    content_html: englishFields.content_html,
    category: englishFields.category,
    tags_csv: (englishFields.tags || []).join(', '),
    cover_image_alt: englishFields.cover_image_alt,
    seo_title: englishFields.seo_title,
    seo_description: englishFields.seo_description,
    seo_keywords_csv: (englishFields.seo_keywords || []).join(', '),
    og_title: englishFields.og_title,
    og_description: englishFields.og_description,
    twitter_title: englishFields.twitter_title,
    twitter_description: englishFields.twitter_description,
  };
  const translated = await callOpenRouterTranslation(
    { attemptId, contentType: 'blog_fields', contentId: options?.contentId, startTs, model },
    targetLanguage,
    textFields,
    TRANSLATION_PROVIDER_TIMEOUT_MS
  );
  if (translated.failure || !translated.fieldsOut) {
    return { translatedFields: null, attemptId, failure: translated.failure };
  }
  const splitTags = (csv: string) =>
    csv
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    translatedFields: {
      title: translated.fieldsOut.title || englishFields.title,
      excerpt: translated.fieldsOut.excerpt || englishFields.excerpt,
      content_html: translated.fieldsOut.content_html || englishFields.content_html,
      category: translated.fieldsOut.category || englishFields.category,
      tags: splitTags(translated.fieldsOut.tags_csv || ''),
      cover_image_alt: translated.fieldsOut.cover_image_alt || englishFields.cover_image_alt,
      seo_title: translated.fieldsOut.seo_title || englishFields.seo_title,
      seo_description: translated.fieldsOut.seo_description || englishFields.seo_description,
      seo_keywords: splitTags(translated.fieldsOut.seo_keywords_csv || ''),
      og_title: translated.fieldsOut.og_title || englishFields.og_title,
      og_description: translated.fieldsOut.og_description || englishFields.og_description,
      twitter_title: translated.fieldsOut.twitter_title || englishFields.twitter_title,
      twitter_description: translated.fieldsOut.twitter_description || englishFields.twitter_description,
    },
    attemptId,
    failure: null,
  };
}

export async function translateFaqCategoryFields(
  targetLanguage: SupportedLanguage,
  english: { name: string; description: string },
  options?: { contentId?: string }
): Promise<TranslateFieldsResult<{ name: string; description: string }>> {
  const attemptId = newAttemptId();
  const startTs = Date.now();
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini';
  writeAttemptLog({
    attemptId,
    contentType: 'faq_category_fields',
    contentId: options?.contentId,
    targetLanguage,
    model,
    providerStatus: null,
    stage: 'start',
    responseShape: 'null',
    candidateTextExists: false,
    candidateTextLength: 0,
    errorCategory: null,
    errorMessageSafe: null,
    elapsedMs: 0,
  });
  const translated = await callOpenRouterTranslation(
    { attemptId, contentType: 'faq_category_fields', contentId: options?.contentId, startTs, model },
    targetLanguage,
    { name: english.name, description: english.description },
    TRANSLATION_PROVIDER_TIMEOUT_MS
  );
  if (translated.failure || !translated.fieldsOut) {
    return { translatedFields: null, attemptId, failure: translated.failure };
  }
  return {
    translatedFields: {
      name: translated.fieldsOut.name || english.name,
      description: translated.fieldsOut.description || english.description,
    },
    attemptId,
    failure: null,
  };
}

export async function translateFaqItemFields(
  targetLanguage: SupportedLanguage,
  english: { question: string; answer_html: string; keywords: string[] },
  options?: { contentId?: string }
): Promise<TranslateFieldsResult<{ question: string; answer_html: string; keywords: string[] }>> {
  const attemptId = newAttemptId();
  const startTs = Date.now();
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini';
  writeAttemptLog({
    attemptId,
    contentType: 'faq_item_fields',
    contentId: options?.contentId,
    targetLanguage,
    model,
    providerStatus: null,
    stage: 'start',
    responseShape: 'null',
    candidateTextExists: false,
    candidateTextLength: 0,
    errorCategory: null,
    errorMessageSafe: null,
    elapsedMs: 0,
  });
  const translated = await callOpenRouterTranslation(
    { attemptId, contentType: 'faq_item_fields', contentId: options?.contentId, startTs, model },
    targetLanguage,
    {
      question: english.question,
      answer_html: english.answer_html,
      keywords_csv: (english.keywords || []).join(', '),
    },
    TRANSLATION_PROVIDER_TIMEOUT_MS
  );
  if (translated.failure || !translated.fieldsOut) {
    return { translatedFields: null, attemptId, failure: translated.failure };
  }
  return {
    translatedFields: {
      question: translated.fieldsOut.question || english.question,
      answer_html: translated.fieldsOut.answer_html || english.answer_html,
      keywords: (translated.fieldsOut.keywords_csv || '')
        .split(/[,，、]/)
        .map((s) => s.trim())
        .filter(Boolean),
    },
    attemptId,
    failure: null,
  };
}

export type TranslationPerLang<T> = {
  language: SupportedLanguage;
  status: TranslationStatus;
  errorMessage?: string;
  result?: T;
};

export async function translateAllLanguages<TInput, TResult>(
  targetLanguages: SupportedLanguage[],
  input: TInput,
  fn: (lang: SupportedLanguage, input: TInput) => Promise<TResult | null>
): Promise<TranslationPerLang<TResult>[]> {
  const results: TranslationPerLang<TResult>[] = [];
  for (const lang of targetLanguages) {
    try {
      const result = await fn(lang, input);
      results.push({
        language: lang,
        status: result ? 'current' : 'failed',
        result: result || undefined,
        errorMessage: result ? undefined : 'Empty translation response from provider.',
      });
    } catch (err) {
      results.push({
        language: lang,
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : String(err || 'Translation failed.'),
      });
    }
  }
  return results;
}

export async function getPlatformEnabledTranslations(admin: SupabaseClient<any, 'public', any>): Promise<SupportedLanguage[]> {
  const { data } = await admin
    .from('platform_settings')
    .select('enabled_languages, default_language')
    .eq('singleton_lock', true)
    .maybeSingle();
  const enabledRaw = Array.isArray(data?.enabled_languages) ? data.enabled_languages : [];
  const enabled = CONTENT_TRANSLATION_ENABLED_LANGS.filter((l) =>
    enabledRaw.length > 0 ? (enabledRaw as unknown[]).includes(l) : true
  );
  return enabled;
}
