import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import {
  normalizeDocumentationCategoryInput,
  validateDocumentationCategoryInput,
  type DocumentationCategoryInput,
  type DocumentationCategoryRecord,
} from '@/lib/documentation';
import {
  adminDocumentationCategoryHasAssignedArticles,
  adminGetDocumentationCategoryById,
} from '@/lib/documentation-server';

async function ensureUniqueCategorySlug(
  admin: NonNullable<ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>>,
  slug: string,
  excludeId: string
) {
  const { data, error } = await admin
    .from('documentation_categories')
    .select('id')
    .eq('slug', slug);

  if (error) throw error;

  const rows = (data || []) as { id: string }[];
  return !rows.some((row) => row.id !== excludeId);
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
    const existing = await adminGetDocumentationCategoryById(admin, id);
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
      let updatePayload: Partial<DocumentationCategoryRecord> = {
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
          { category: data as DocumentationCategoryRecord },
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
        { category: data as DocumentationCategoryRecord },
        { status: 200 }
      ),
      cookieMutations
    );
  } catch (error: any) {
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
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const { id } = await segment.params;

  try {
    const existing = await adminGetDocumentationCategoryById(admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Documentation category not found.' },
          { status: 404 }
        ),
        cookieMutations
      );
    }

    const hasAssigned = await adminDocumentationCategoryHasAssignedArticles(admin, existing.slug);
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
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to delete documentation category.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
