import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUserViaJwt } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  normalizeDocumentationCategoryInput,
  validateDocumentationCategoryInput,
  type DocumentationCategoryInput,
  type DocumentationCategoryRecord,
} from '@/lib/documentation';

type AdminSupabase = NonNullable<ReturnType<typeof createAdminClient>>;

async function ensureUniqueCategorySlug(
  admin: AdminSupabase,
  slug: string,
  excludeId: string
) {
  try {
    const { data, error } = await admin
      .from('documentation_categories')
      .select('id')
      .eq('slug', slug);

    if (error) throw error;
    const rows = ((data || []) as { id: string }[]);
    return !rows.some((row) => row.id !== excludeId);
  } catch (err: any) {
    console.error('[categories/[id] ensureUniqueCategorySlug] error:', err?.message ?? err);
    throw err;
  }
}

async function adminFastCategoryById(admin: AdminSupabase, id: string): Promise<DocumentationCategoryRecord | null> {
  try {
    const { data, error } = await admin
      .from('documentation_categories')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return {
      ...(data as DocumentationCategoryRecord),
      translations:
        (data as DocumentationCategoryRecord).translations &&
        typeof (data as DocumentationCategoryRecord).translations === 'object'
          ? (data as DocumentationCategoryRecord).translations
          : {},
    };
  } catch (err: any) {
    console.error('[categories/[id] adminFastCategoryById] error:', err?.message ?? err);
    throw err;
  }
}

async function adminFastCategoryHasArticlesAssigned(admin: AdminSupabase, slug: string): Promise<boolean> {
  try {
    const { count, error } = await admin
      .from('documentation_articles')
      .select('*', { count: 'exact', head: true })
      .eq('category', slug);
    if (error) throw error;
    return Number(count || 0) > 0;
  } catch (err: any) {
    console.error('[categories/[id] adminFastCategoryHasArticlesAssigned] error:', err?.message ?? err);
    throw err;
  }
}

export async function PATCH(
  request: Request,
  segment: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRouteUserViaJwt();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations, userId } = auth;
  const { id } = await segment.params;

  try {
    const existing = await adminFastCategoryById(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Documentation category not found.' },
          { status: 404 }
        ),
        cookieMutations
      );
    }

    const body = (await request.json()) as Partial<DocumentationCategoryInput>;
    const quickToggleKeys = ['is_active', 'display_order'] as const;
    const quickToggleKey =
      Object.keys(body).length === 1
        ? (Object.keys(body)[0] as (typeof quickToggleKeys)[number] | undefined)
        : undefined;
    const isQuickToggle = !!quickToggleKey && quickToggleKeys.includes(quickToggleKey);

    if (isQuickToggle) {
      const updatePayload: Partial<DocumentationCategoryRecord> = {
        updated_by: userId,
      };
      if ('is_active' in body) {
        updatePayload.is_active = body.is_active !== false;
      }
      if ('display_order' in body) {
        const raw = Number(body.display_order);
        updatePayload.display_order = Number.isFinite(raw) ? Math.trunc(raw) : 0;
      }
      const { data, error } = await admin
        .from('documentation_categories')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return applySupabaseCookies(
        NextResponse.json(
          { category: (data as DocumentationCategoryRecord) ?? null },
          { status: 200 }
        ),
        cookieMutations
      );
    }

    const payload = normalizeDocumentationCategoryInput({
      name: existing.name,
      slug: existing.slug,
      description: existing.description,
      display_order: existing.display_order,
      is_active: existing.is_active,
      ...body,
    });

    const validation = validateDocumentationCategoryInput(payload);
    if (!validation.valid) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: validation.issues[0]?.message || 'Invalid input.' },
          { status: 400 }
        ),
        cookieMutations
      );
    }

    const isUnique = await ensureUniqueCategorySlug(admin, payload.slug, id);
    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'A category with this slug already exists.' },
          { status: 409 }
        ),
        cookieMutations
      );
    }

    const updatePayload = {
      name: payload.name,
      slug: payload.slug,
      description: payload.description,
      translations: payload.translations && Object.keys(payload.translations).length > 0
        ? payload.translations
        : {},
      display_order: payload.display_order,
      is_active: payload.is_active,
      updated_by: userId,
    };

    const { data, error } = await admin
      .from('documentation_categories')
      .update(updatePayload)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw error;

    return applySupabaseCookies(
      NextResponse.json(
        { category: (data as DocumentationCategoryRecord) ?? null },
        { status: 200 }
      ),
      cookieMutations
    );
  } catch (error: any) {
    console.error('[PATCH /api/admin/documentation/categories/[id]] unexpected error:', error?.message ?? error);
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to update documentation category.' },
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
  const auth = await requireAdminRouteUserViaJwt();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const { id } = await segment.params;

  try {
    const existing = await adminFastCategoryById(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Documentation category not found.' },
          { status: 404 }
        ),
        cookieMutations
      );
    }

    const hasAssigned = await adminFastCategoryHasArticlesAssigned(admin, existing.slug);
    if (hasAssigned) {
      return applySupabaseCookies(
        NextResponse.json(
          {
            error:
              "Cannot delete this category because it is assigned to existing articles. Reassign or delete the articles first.",
          },
          { status: 409 }
        ),
        cookieMutations
      );
    }

    const { error } = await admin
      .from('documentation_categories')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    console.error('[DELETE /api/admin/documentation/categories/[id]] unexpected error:', error?.message ?? error);
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to delete documentation category.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
