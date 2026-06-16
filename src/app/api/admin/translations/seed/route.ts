import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';

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
    const languages: SupportedLanguage[] = ['en', 'ar', 'fr', 'ru'];

    const contentTypesSet = new Set<string>();
    for (const lang of languages) {
      const langDir = path.join(localesRoot, lang);
      const files = await fs.readdir(langDir);
      files
        .filter((f) => f.endsWith('.json'))
        .forEach((f) => contentTypesSet.add(f.replace(/\.json$/, '')));
    }

    const contentTypes = Array.from(contentTypesSet.values()).sort();

    const rows: Array<{
      content_type: string;
      content_key: string;
      language: SupportedLanguage;
      value: string;
      is_approved: boolean;
      is_published: boolean;
    }> = [];

    for (const contentType of contentTypes) {
      for (const lang of languages) {
        const filePath = path.join(localesRoot, lang, `${contentType}.json`);
        const raw = await fs.readFile(filePath, 'utf-8').catch(() => null);
        if (!raw) continue;

        const parsed = JSON.parse(raw) as unknown;
        const flat = flattenJson(parsed);
        for (const [content_key, value] of Object.entries(flat)) {
          rows.push({
            content_type: contentType,
            content_key,
            language: lang,
            value,
            is_approved: true,
            is_published: true,
          });
        }
      }
    }

    const { error: upsertError } = await supabase
      .from('cms_translations')
      .upsert(rows, { onConflict: 'content_type,content_key,language' });

    if (upsertError) {
      console.error('[admin/translations/seed] upsert failed:', upsertError.message);
      return applySupabaseCookies(
        NextResponse.json({ error: 'Failed to seed translations.' }, { status: 500 }),
        cookieMutations
      );
    }

    return applySupabaseCookies(
      NextResponse.json(
        { ok: true, content_types: contentTypes.length, rows: rows.length },
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

