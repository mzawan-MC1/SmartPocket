import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import {
  normalizeDocumentationCategoryInput,
  validateDocumentationCategoryInput,
  type DocumentationCategoryInput,
  type DocumentationCategoryRecord,
  type DocumentationCategoryWithCount,
} from '@/lib/documentation';
import {
  adminGetAllDocumentationCategoriesWithCount,
} from '@/lib/documentation-server';

async function ensureUniqueCategorySlug(
  admin: NonNullable<ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>>,
  slug: string,
  excludeId?: string
) {
  let query = admin
    .from('documentation_categories')
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

  try {
    const categories = await adminGetAllDocumentationCategoriesWithCount(admin);
    return applySupabaseCookies(
      NextResponse.json({ categories }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to load documentation categories.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations, user } = auth;
  const userId = user.id;

  try {
    const body = (await request.json()) as Partial<DocumentationCategoryInput>;
    const payload = normalizeDocumentationCategoryInput(body);

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

    const isUnique = await ensureUniqueCategorySlug(admin, payload.slug);
    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'A category with this slug already exists.' },
          { status: 409 }
        ),
        cookieMutations
      );
    }

    const insertPayload = {
      name: payload.name,
      slug: payload.slug,
      description: payload.description,
      display_order: payload.display_order,
      is_active: payload.is_active,
      created_by: userId,
      updated_by: userId,
    };

    const { data, error } = await admin
      .from('documentation_categories')
      .insert(insertPayload)
      .select('*')
      .single();

    if (error) throw error;

    return applySupabaseCookies(
      NextResponse.json(
        { category: data as DocumentationCategoryRecord },
        { status: 201 }
      ),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to create documentation category.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
