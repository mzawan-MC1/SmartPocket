import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUserViaJwt } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { LANGUAGE_REGISTRY } from '@/i18n/registry';
import {
  CONTENT_TRANSLATION_ENABLED_LANGS,
  TRANSLATION_PROVIDER_TIMEOUT_MS,
  translateAllLanguages,
  translateDocumentationCategoryFields,
} from '@/lib/content-translate-server';
import type { SupportedLanguage } from '@/i18n/registry';
import type { DocumentationCategoryTranslations } from '@/lib/documentation';

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

    const perLangResults = await translateAllLanguages(
      targetLanguages,
      { name, description },
      async (targetLang, { name: srcName, description: srcDescription }) => {
        const reg = LANGUAGE_REGISTRY[targetLang];

        // Mirror exact article/blog helper calling signature:
        // TRANSLATION_PROVIDER_TIMEOUT_MS = 50s (same as translateBlogFields / translateDocumentationFields default)
        // SSoT translateDocumentationCategoryFields internally calls:
        //   callStructuredContentTranslation with documentation_category_fields contentType
        //   writeAttemptLog for consistency
        // On RTL (ar only), append contextual RTL prompt to description as source hint so
        // Gemini produces native Arabic RTL typography / numerals / diacritics — matching
        // the articles architecture that preserves brand + domain context.
        const rtlContextExtra =
          reg?.rtl === true
            ? ` — ${reg.nativeName} (${targetLang}) RIGHT-TO-LEFT (RTL) SCRIPT CONTEXT: Translate naturally for Arabic RTL typography; use correct RTL numerals, currency formatting, and native diacritics. Preserve "Smart Pocket" brand name untranslated.`
            : '';
        const descriptionWithContext = rtlContextExtra
          ? `${srcDescription}${srcDescription ? ' ' : ''}${rtlContextExtra}`
          : srcDescription;

        const { translatedFields, failure, attemptId } = await translateDocumentationCategoryFields(
          targetLang,
          { name: srcName, description: descriptionWithContext },
          { contentId: undefined }
        );

        if (!translatedFields || typeof translatedFields.name !== 'string' || !translatedFields.name.trim()) {
          console.warn(
            `[POST /api/admin/documentation/categories/translate] ${targetLang} returned empty name (attempt=${attemptId})`,
            { failureReason: failure?.safeMessage }
          );
          return null;
        }

        const outName = String(translatedFields.name || '').trim().slice(0, 120);
        const outDescriptionRaw = typeof translatedFields.description === 'string'
          ? translatedFields.description
          : '';
        const outDescription = rtlContextExtra
          ? outDescriptionRaw.replace(rtlContextExtra.trim(), '').trim().slice(0, 500)
          : outDescriptionRaw.trim().slice(0, 500);

        return {
          name: outName,
          description: outDescription,
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
            providerTimeoutMs: TRANSLATION_PROVIDER_TIMEOUT_MS,
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
