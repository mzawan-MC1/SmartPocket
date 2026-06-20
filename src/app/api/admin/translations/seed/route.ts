import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';
import { I18N_NAMESPACES, type TranslationNamespace } from '@/i18n/resources';

type SupportedLanguage = 'en' | 'ar' | 'fr' | 'ru';

function flattenJson(value: unknown, prefix = '', out: Record<string, string> = {}) {
  if (typeof value === 'string') {
    if (prefix) out[prefix] = value;
    return out;
  }

  if (!value || typeof value !== 'object') return out;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    flattenJson(child, nextPrefix, out);
  }

  return out;
}

function isValidTranslationKey(value: string) {
  return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(value);
}

export async function POST() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (process.env.NODE_ENV !== 'production') {
    console.info('[admin/translations/seed] user', user?.id ?? 'none');
  }

  if (error || !user) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      cookieMutations
    );
  }

  if (user.app_metadata?.role !== 'admin') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      cookieMutations
    );
  }

  try {
    const localesRoot = path.join(process.cwd(), 'src', 'i18n', 'locales');
    const sourceLanguage: SupportedLanguage = 'en';
    const contentTypes = [...I18N_NAMESPACES];
    const validRows: Array<{
      content_type: string;
      content_key: string;
      language: SupportedLanguage;
      value: string;
      is_approved: boolean;
      is_published: boolean;
    }> = [];
    const invalid: Array<{ content_type: string; content_key: string; reason: string }> = [];

    for (const contentType of contentTypes) {
      const filePath = path.join(localesRoot, sourceLanguage, `${contentType}.json`);
      const raw = await fs.readFile(filePath, 'utf-8').catch(() => null);
      if (!raw) continue;

      const parsed = JSON.parse(raw) as unknown;
      const flat = flattenJson(parsed);
      for (const [content_key, value] of Object.entries(flat)) {
        if (!isValidTranslationKey(content_key)) {
          invalid.push({
            content_type: contentType,
            content_key,
            reason: 'invalid_key_format',
          });
          continue;
        }

        validRows.push({
          content_type: contentType,
          content_key,
          language: sourceLanguage,
          value,
          is_approved: true,
          is_published: true,
        });
      }
    }

    const existingKeys = validRows.map((row) => `${row.content_type}::${row.content_key}`);
    const { data: existingRows, error: existingError } = await supabase
      .from('cms_translations')
      .select('content_type,content_key,language')
      .eq('language', sourceLanguage)
      .in('content_type', contentTypes as TranslationNamespace[])
      .in('content_key', validRows.map((row) => row.content_key));

    if (existingError) {
      throw existingError;
    }

    const existingSet = new Set(
      (existingRows ?? []).map((row) => `${row.content_type}::${row.content_key}`)
    );

    const rowsToInsert = validRows.filter(
      (row) => !existingSet.has(`${row.content_type}::${row.content_key}`)
    );

    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('cms_translations')
        .insert(rowsToInsert);

      if (insertError) {
        console.error('[admin/translations/seed] insert failed:', insertError.message);
        return applySupabaseCookies(
          NextResponse.json({ error: 'Failed to seed translations.' }, { status: 500 }),
          cookieMutations
        );
      }
    }

    const added = rowsToInsert.length;
    const existing = validRows.length - added;
    const skipped = invalid.length;

    return applySupabaseCookies(
      NextResponse.json(
        {
          ok: true,
          content_types: contentTypes.length,
          added,
          existing,
          skipped,
          invalid,
          rows: validRows.length,
        },
        { status: 200 }
      ),
      cookieMutations
    );
  } catch (e) {
    console.error('[admin/translations/seed] error:', e instanceof Error ? e.message : e);
    return applySupabaseCookies(
      NextResponse.json({ error: 'Internal server error' }, { status: 500 }),
      cookieMutations
    );
  }
}
