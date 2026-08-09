import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from '@/i18n/registry';
import { PLATFORM_SETTINGS_CACHE_TAG } from '@/lib/platform-settings-server';

const SUPPORTED_SET = new Set<string>(SUPPORTED_LANGUAGE_CODES as readonly string[]);

type Body = {
  defaultLanguage?: unknown;
  enabledLanguages?: unknown;
};

export async function PATCH(req: Request) {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

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

  const admin = createAdminClient();
  if (!admin) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }),
      cookieMutations
    );
  }

  const defaultRaw = body.defaultLanguage;
  const enabledRaw = body.enabledLanguages;

  const defaultLanguage = SUPPORTED_SET.has(String(defaultRaw ?? '')) ? (String(defaultRaw) as SupportedLanguage) : 'en';

  const enabledList = Array.isArray(enabledRaw)
    ? (enabledRaw
        .map((c) => String(c ?? ''))
        .filter((c) => SUPPORTED_SET.has(c)) as SupportedLanguage[])
    : [];

  if (!enabledList.includes(defaultLanguage)) {
    enabledList.unshift(defaultLanguage);
  }
  const dedupedEnabled = [...new Set<SupportedLanguage>(enabledList)];

  if (!dedupedEnabled.includes('en')) {
    dedupedEnabled.unshift('en');
  }

  const { error: writeError, data } = await admin
    .from('platform_settings')
    .update({
      default_language: defaultLanguage,
      enabled_languages: dedupedEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq('singleton_lock', true)
    .select('default_language, enabled_languages, updated_at')
    .maybeSingle();

  if (writeError || !data) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: writeError?.message || 'Failed to update platform settings row.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }

  revalidateTag(PLATFORM_SETTINGS_CACHE_TAG);

  const returnedEnabled = Array.isArray(data.enabled_languages) ? data.enabled_languages : dedupedEnabled;
  const returnedDefault = String(data.default_language || defaultLanguage);
  const persistSource = Array.isArray(data.enabled_languages) && data.enabled_languages.length > 0 ? 'database' : 'fallback';

  return applySupabaseCookies(
    NextResponse.json(
      {
        defaultLanguage: SUPPORTED_SET.has(returnedDefault) ? returnedDefault : 'en',
        enabledLanguages: returnedEnabled.filter((c: unknown) => SUPPORTED_SET.has(String(c))),
        persistSource,
        updatedAt: data.updated_at,
      },
      { status: 200 }
    ),
    cookieMutations
  );
}
