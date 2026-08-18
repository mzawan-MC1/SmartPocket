import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildDocumentationSourceBundle,
  scheduleDocumentationTranslations,
} from '@/lib/documentation-translate-server';
import { CONTENT_TRANSLATION_ENABLED_LANGS } from '@/lib/content-translate-server';

type Params = Promise<{ id: string }>;

export const maxDuration = 60;

export async function POST(
  request: Request,
  segment: { params: Params }
) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  const params = await segment.params;
  const id = String(params.id || '').trim();
  if (!id) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Missing documentation ID required.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  const admin = auth.admin ?? createAdminClient();
  if (!admin) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Supabase service role is not configured.' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }

  try {
    const { data: article, error: articleErr } = await admin
      .from('documentation_articles')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (articleErr) throw articleErr;
    if (!article) throw new Error('Documentation article not found.');

    const raw = article as any;

    const bundle = buildDocumentationSourceBundle({
      title: raw.title,
      summary: raw.summary,
      content_html: raw.content_html,
      category: raw.category,
    });

    await scheduleDocumentationTranslations(admin, id, bundle, { regenerateAll: true });

    const { data: translations, error: transErr } = await admin
      .from('documentation_translations')
      .select('language_code, translation_status')
      .eq('article_id', id)
      .in('language_code', CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[])
      .in('translation_status', ['pending', 'failed', 'missing', 'outdated']);
    if (transErr) throw transErr;

    const workItems: Array<{ type: 'documentation_article'; id: string; language: string }> = [];
    if (translations) {
      for (const row of translations as any[]) {
        const language = String(row.language_code || '');
        if (!(CONTENT_TRANSLATION_ENABLED_LANGS as readonly string[]).includes(language)) continue;
        workItems.push({ type: 'documentation_article', id, language });
      }
    }

    return applySupabaseCookies(
      NextResponse.json({ regenerated: true, workItems }, { status: 200 }),
      auth.cookieMutations
    );
  } catch (e: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: e?.message || 'Failed to regenerate translations.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
