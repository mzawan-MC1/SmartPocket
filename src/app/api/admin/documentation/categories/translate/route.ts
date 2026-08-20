import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUserViaJwt } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { LANGUAGE_REGISTRY } from '@/i18n/registry';
import {
  CONTENT_TRANSLATION_ENABLED_LANGS,
  callStructuredContentTranslation,
  translateAllLanguages,
} from '@/lib/content-translate-server';
import type { SupportedLanguage } from '@/i18n/registry';
import type { DocumentationCategoryTranslations } from '@/lib/documentation';
import { randomUUID } from 'node:crypto';

type CategoriesTranslateRequestBody = {
  name?: unknown;
  description?: unknown;
  targetLanguages?: unknown;
};

function sanitizeNonEmptyString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.length === 0) return null;
  return v.slice(0, Math.max(1, maxLength));
}

function resolveTargetLanguages(userInput: unknown): SupportedLanguage[] {
  if (!userInput) return CONTENT_TRANSLATION_ENABLED_LANGS as SupportedLanguage[];
  if (!Array.isArray(userInput)) return CONTENT_TRANSLATION_ENABLED_LANGS as SupportedLanguage[];
  const allowed = new Set<string>(CONTENT_TRANSLATION_ENABLED_LANGS);
  const out: SupportedLanguage[] = [];
  for (const raw of userInput) {
    const code = typeof raw === 'string' ? raw.trim() : '';
    if (!code) continue;
    if (allowed.has(code)) out.push(code as SupportedLanguage);
  }
  if (out.length === 0) return CONTENT_TRANSLATION_ENABLED_LANGS as SupportedLanguage[];
  return out;
}

export async function POST(request: Request) {
  const auth = await requireAdminRouteUserViaJwt();
  if (!auth.ok) return auth.response;
  const { cookieMutations } = auth;

  try {
    let parsed: CategoriesTranslateRequestBody;
    try {
      parsed = (await request.json()) as CategoriesTranslateRequestBody;
    } catch {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Invalid JSON payload.' },
          { status: 400 }
        ),
        cookieMutations
      );
    }

    const name = sanitizeNonEmptyString(parsed.name, 120);
    if (!name) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'English category name is required before AI translation can be generated.' },
          { status: 400 }
        ),
        cookieMutations
      );
    }
    const description = sanitizeNonEmptyString(parsed.description, 500) ?? '';

    const targetLanguages = resolveTargetLanguages(parsed.targetLanguages);

    const startTs = Date.now();
    const baseAttemptId = randomUUID();

    const perLangResults = await translateAllLanguages(
      targetLanguages,
      { name, description },
      async (targetLang, { name: srcName, description: srcDescription }) => {
        const reg = LANGUAGE_REGISTRY[targetLang];
        const fields: Record<string, string> = {
          name: srcName,
          description: srcDescription,
        };

        const rtlContext = reg?.rtl
          ? `EXTRA CONTEXT: The target language is ${reg.nativeName} (${targetLang}), which is a RIGHT-TO-LEFT (RTL) script. Translate naturally for Arabic RTL typography; use correct RTL numerals, currency formatting, and native diacritics. Preserve Smart Pocket brand name untranslated.`
          : '';

        const timeoutMs = 25000;
        const { fieldsOut, failure, providerUsed, modelUsed, providerFallback } =
          await callStructuredContentTranslation(
            {
              attemptId: `${baseAttemptId}-${targetLang}`,
              contentType: 'documentation_fields',
              contentId: undefined,
              startTs,
            },
            targetLang,
            fields,
            timeoutMs
          );

        if (!fieldsOut || typeof fieldsOut.name !== 'string' || !fieldsOut.name.trim()) {
          console.warn(
            `[POST /api/admin/documentation/categories/translate] ${targetLang} returned empty name`,
            { providerUsed, providerFallback, modelUsed, failureReason: failure?.safeMessage }
          );
          return null;
        }

        const outName = String(fieldsOut.name || '').trim().slice(0, 120);
        const outDescriptionRaw = typeof fieldsOut.description === 'string' ? fieldsOut.description : '';
        const outDescription = outDescriptionRaw.trim().slice(0, 500);

        return {
          name: outName,
          description: outDescription,
          providerUsed,
          providerFallback,
          modelUsed,
        };
      }
    );

    const translations: DocumentationCategoryTranslations = {};
    let succeeded = 0;
    for (const row of perLangResults) {
      if (!row.result || !row.result.name) continue;
      translations[row.language] = {
        name: row.result.name,
        description: row.result.description && row.result.description.length > 0 ? row.result.description : undefined,
      };
      succeeded += 1;
    }

    if (succeeded === 0) {
      const failures = perLangResults
        .filter((r) => r.status === 'failed')
        .map((r) => `${r.language}: ${r.errorMessage || 'unknown'}`)
        .join('; ');
      console.error(
        `[POST /api/admin/documentation/categories/translate] all ${targetLanguages.length} translations failed.`,
        { failures }
      );
      return applySupabaseCookies(
        NextResponse.json(
          {
            error:
              'AI translation failed for all languages. Please verify Gemini API configuration and retry in a moment.',
          },
          { status: 502 }
        ),
        cookieMutations
      );
    }

    return applySupabaseCookies(
      NextResponse.json(
        {
          translations,
          summary: {
            requested: targetLanguages.length,
            generated: succeeded,
            durationMs: Date.now() - startTs,
          },
        },
        { status: 200 }
      ),
      cookieMutations
    );
  } catch (error: any) {
    console.error(
      '[POST /api/admin/documentation/categories/translate] unexpected error:',
      error?.message ?? error
    );
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to generate AI translations.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
