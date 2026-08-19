import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  normalizeDocumentationArticleInput,
  validateDocumentationArticleInput,
  type DocumentationArticleInput,
  type DocumentationArticleRecord,
} from '@/lib/documentation';
import {
  buildDocumentationSourceBundle,
  computeDocumentationEnglishSourceHash,
  markDocumentationTranslationsOutdated,
  documentationSourceInputChanged,
} from '@/lib/documentation-translate-server';

async function ensureUniqueSlug(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  slug: string,
  excludeId?: string
) {
  let query = admin
    .from('documentation_articles')
    .select('id')
    .eq('slug', slug);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as { id: string }[];
  if (!excludeId) return rows.length === 0;
  return !rows.some((row) => row.id !== excludeId);
}

export async function GET() {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;

  const { data, error } = await admin
    .from('documentation_articles')
    .select('*')
    .order('display_order', { ascending: true })
    .order('updated_at', { ascending: false });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: 'Failed to load documentation articles.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json(
      { articles: (data as DocumentationArticleRecord[]) || [] },
      { status: 200 }
    ),
    cookieMutations
  );
}

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations, user } = auth;
  const userId = user.id;

  try {
    const body = (await request.json()) as Partial<DocumentationArticleInput>;
    const payload = normalizeDocumentationArticleInput(body);

    const validation = validateDocumentationArticleInput(payload);
    if (!validation.valid) {
      return applySupabaseCookies(
        NextResponse.json({ error: validation.issues[0]?.message || 'Invalid input.' }, { status: 400 }),
        cookieMutations
      );
    }

    const isUnique = await ensureUniqueSlug(admin, payload.slug);
    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'An article with this slug already exists.' },
          { status: 409 }
        ),
        cookieMutations
      );
    }

    const bundle = buildDocumentationSourceBundle({
      title: payload.title,
      summary: payload.summary,
      content_html: payload.content_html,
      category: payload.category,
    });
    const enSourceVersionHash = computeDocumentationEnglishSourceHash(bundle);

    const insertPayload = {
      title: payload.title,
      slug: payload.slug,
      summary: payload.summary,
      content_html: payload.content_html,
      category: payload.category,
      status: payload.status,
      enabled: payload.enabled,
      display_order: payload.display_order,
      featured_in_footer: payload.featured_in_footer,
      featured_in_header: payload.featured_in_header,
      featured_order: payload.featured_order,
      en_source_version_hash: enSourceVersionHash || null,
      published_at: payload.status === 'published' ? new Date().toISOString() : null,
      created_by: userId,
      updated_by: userId,
    };

    const { data, error } = await admin
      .from('documentation_articles')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) throw error;

    return applySupabaseCookies(
      NextResponse.json(
        { article: data as DocumentationArticleRecord },
        { status: 201 }
      ),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to create documentation article.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
