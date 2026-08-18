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

async function loadArticleOr404(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string
) {
  const { data, error } = await admin
    .from('documentation_articles')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;

  return (data as DocumentationArticleRecord | null) || null;
}

async function ensureUniqueSlug(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  slug: string,
  currentId: string
) {
  const { data, error } = await admin
    .from('documentation_articles')
    .select('id')
    .eq('slug', slug);

  if (error) throw error;

  const rows = (data || []) as { id: string }[];
  return !rows.some((row) => row.id !== currentId);
}

export async function PATCH(
  request: Request,
  segment: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations, user } = auth;
  const userId = user.id;
  const { id } = await segment.params;

  try {
    const existing = await loadArticleOr404(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Documentation article not found.' },
          { status: 404 }
        ),
        cookieMutations
      );
    }

    const body = (await request.json()) as Partial<DocumentationArticleInput>;

    if (
      Object.keys(body).length === 1 &&
      ('enabled' in body || 'status' in body)
    ) {
      let updatePayload: Partial<DocumentationArticleRecord> = {
        updated_by: userId,
      };

      if ('enabled' in body) {
        updatePayload.enabled = body.enabled !== false;
      }

      if ('status' in body) {
        const nextStatus = body.status === 'published' ? 'published' : 'draft';
        updatePayload.status = nextStatus;
        if (nextStatus === 'published' && !existing.published_at) {
          updatePayload.published_at = new Date().toISOString();
        }
        if (nextStatus === 'draft') {
          updatePayload.published_at = null;
        }
      }

      const { data, error } = await admin
        .from('documentation_articles')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) throw error;

      return applySupabaseCookies(
        NextResponse.json(
          { article: data as DocumentationArticleRecord },
          { status: 200 }
        ),
        cookieMutations
      );
    }

    const payload = normalizeDocumentationArticleInput({
      title: existing.title,
      slug: existing.slug,
      summary: existing.summary,
      content_html: existing.content_html,
      category: existing.category,
      status: existing.status,
      enabled: existing.enabled,
      display_order: existing.display_order,
      ...body,
    });

    const validation = validateDocumentationArticleInput(payload);
    if (!validation.valid) {
      return applySupabaseCookies(
        NextResponse.json({ error: validation.issues[0]?.message || 'Invalid input.' }, { status: 400 }),
        cookieMutations
      );
    }

    const isUnique = await ensureUniqueSlug(admin, payload.slug, id);
    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'An article with this slug already exists.' },
          { status: 409 }
        ),
        cookieMutations
      );
    }

    const coreChanged = documentationSourceInputChanged(
      {
        title: existing.title,
        summary: existing.summary,
        content_html: existing.content_html,
        category: existing.category,
      },
      {
        title: payload.title,
        summary: payload.summary,
        content_html: payload.content_html,
        category: payload.category,
      }
    );

    let enSourceVersionHash: string | null = existing.en_source_version_hash ?? null;
    if (coreChanged) {
      const bundle = buildDocumentationSourceBundle({
        title: payload.title,
        summary: payload.summary,
        content_html: payload.content_html,
        category: payload.category,
      });
      enSourceVersionHash = computeDocumentationEnglishSourceHash(bundle) || null;
      await markDocumentationTranslationsOutdated(admin, id);
    }

    const updatePayload: any = {
      title: payload.title,
      slug: payload.slug,
      summary: payload.summary,
      content_html: payload.content_html,
      category: payload.category,
      status: payload.status,
      enabled: payload.enabled,
      display_order: payload.display_order,
      en_source_version_hash: enSourceVersionHash,
      published_at:
        payload.status === 'published'
          ? existing.published_at || new Date().toISOString()
          : null,
      updated_by: userId,
    };

    const { data, error } = await admin
      .from('documentation_articles')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;

    return applySupabaseCookies(
      NextResponse.json(
        { article: data as DocumentationArticleRecord },
        { status: 200 }
      ),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to update documentation article.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}

export async function DELETE(
  _request: Request,
  segment: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const { id } = await segment.params;

  try {
    const existing = await loadArticleOr404(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Documentation article not found.' },
          { status: 404 }
        ),
        cookieMutations
      );
    }

    const { error: transDelErr } = await admin
      .from('documentation_translations')
      .delete()
      .eq('article_id', id);
    if (transDelErr) throw transDelErr;

    const { error } = await admin
      .from('documentation_articles')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to delete documentation article.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
