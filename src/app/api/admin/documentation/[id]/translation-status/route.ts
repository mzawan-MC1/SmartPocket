import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadDocumentationTranslationStatus } from '@/lib/documentation-translate-server';

type Params = Promise<{ id: string }>;

export async function GET(
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

  const { data: existingArticle, error: articleErr } = await admin
    .from('documentation_articles')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (articleErr) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: articleErr.message || 'Failed to lookup documentation article.' },
        { status: 500 }
      ),
      auth.cookieMutations
    );
  }

  if (!existingArticle) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Documentation article not found.' },
        { status: 404 }
      ),
      auth.cookieMutations
    );
  }

  const result = await loadDocumentationTranslationStatus(admin, id);

  return applySupabaseCookies(
    NextResponse.json(result, { status: 200 }),
    auth.cookieMutations
  );
}
