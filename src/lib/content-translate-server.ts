import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAIConfig, type OpenRouterTextRewriteResponse } from './ai-gateway';
import {
  getOpenRouterBaseUrl,
  getOpenRouterHeaders,
} from './ai-gateway';
import { safeParseJSON } from './ai-types';
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from '@/i18n/registry';

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
  targetLanguage: SupportedLanguage,
  fields: Record<string, string>,
  timeoutMs: number
): Promise<Record<string, string> | null> {
  if (Object.keys(fields).length === 0) return null;
  const config = loadAIConfig();
  if (!config.aiEnabled) return null;

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini';
  const userPrompt = `Translate the following English fields into ${targetLanguage}.

Target language BCP-47: ${targetLanguage}.

Return ONLY valid JSON with exactly these keys:
${JSON.stringify(Object.keys(fields), null, 2)}

English source fields:
${JSON.stringify(fields, null, 2)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      const msg = `Provider HTTP ${response.status}: ${errText.slice(0, 200)}`;
      console.error('[translate:%s:%s] %s', targetLanguage, 'http_error', msg);
      throw new Error(msg);
    }
    const raw = await response.json() as OpenRouterTextRewriteResponse['rawOutput'];
    const choices = (raw as any)?.choices as Array<{ message?: { content?: unknown } }> | undefined;
    const content = choices?.[0]?.message?.content;

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

    if (!contentText) {
      console.error('[translate:%s:%s] %s', targetLanguage, 'empty_text', 'Provider returned no text content.');
      throw new Error('EMPTY: Provider returned no text content.');
    }

    const parsed = safeParseJSON(contentText) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== 'object') {
      const snippet = String(contentText).slice(0, 240);
      console.error('[translate:%s:%s] %s', targetLanguage, 'invalid_json', 'Could not parse structured response.');
      throw new Error(`INVALID_JSON: Could not parse structured response. First 240 chars: ${snippet}`);
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
      console.error('[translate:%s:%s] Missing keys=%s', targetLanguage, 'schema_mismatch', missing.join(','));
      throw new Error(`SCHEMA: Missing or wrong-typed translated fields. Missing keys=${missing.join(',')}; first_keys=${firstKeys}`);
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
      return null;
    }

    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || 'Unknown');
    if (msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout')) return null;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

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
  }
): Promise<{ title: string; excerpt: string; content_html: string; category: string; tags: string[]; cover_image_alt: string; seo_title: string; seo_description: string; seo_keywords: string[]; og_title: string; og_description: string; twitter_title: string; twitter_description: string } | null> {
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
  const translated = await callOpenRouterTranslation(targetLanguage, textFields, 30000);
  if (!translated) return null;
  const splitTags = (csv: string) =>
    csv
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    title: translated.title || englishFields.title,
    excerpt: translated.excerpt || englishFields.excerpt,
    content_html: translated.content_html || englishFields.content_html,
    category: translated.category || englishFields.category,
    tags: splitTags(translated.tags_csv || ''),
    cover_image_alt: translated.cover_image_alt || englishFields.cover_image_alt,
    seo_title: translated.seo_title || englishFields.seo_title,
    seo_description: translated.seo_description || englishFields.seo_description,
    seo_keywords: splitTags(translated.seo_keywords_csv || ''),
    og_title: translated.og_title || englishFields.og_title,
    og_description: translated.og_description || englishFields.og_description,
    twitter_title: translated.twitter_title || englishFields.twitter_title,
    twitter_description: translated.twitter_description || englishFields.twitter_description,
  };
}

export async function translateFaqCategoryFields(
  targetLanguage: SupportedLanguage,
  english: { name: string; description: string }
): Promise<{ name: string; description: string } | null> {
  const translated = await callOpenRouterTranslation(
    targetLanguage,
    { name: english.name, description: english.description },
    20000
  );
  if (!translated) return null;
  return {
    name: translated.name || english.name,
    description: translated.description || english.description,
  };
}

export async function translateFaqItemFields(
  targetLanguage: SupportedLanguage,
  english: { question: string; answer_html: string; keywords: string[] }
): Promise<{ question: string; answer_html: string; keywords: string[] } | null> {
  const translated = await callOpenRouterTranslation(
    targetLanguage,
    {
      question: english.question,
      answer_html: english.answer_html,
      keywords_csv: (english.keywords || []).join(', '),
    },
    25000
  );
  if (!translated) return null;
  return {
    question: translated.question || english.question,
    answer_html: translated.answer_html || english.answer_html,
    keywords: (translated.keywords_csv || '')
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean),
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
