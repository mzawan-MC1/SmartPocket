import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import {
  createFaqCategory,
  ensureUniqueFaqCategorySlug,
  listFaqCategoriesForApi,
} from '@/lib/faqs-admin-server';
import {
  normalizeFaqCategoryInput,
  validateFaqCategoryInput,
  type FaqCategoryInput,
} from '@/lib/faqs';
import { requireAdminRouteUser } from '@/lib/support-server';

export async function GET(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim().toLowerCase() || '';
  const status = searchParams.get('status') || 'all';

  try {
    const categories = await listFaqCategoriesForApi();
    const filtered = categories.filter((category) => {
      const matchesQuery =
        !query ||
        category.slug.toLowerCase().includes(query) ||
        Object.values(category.translations).some((translation) =>
          translation.name.toLowerCase().includes(query) ||
          translation.description.toLowerCase().includes(query)
        );

      const matchesStatus =
        status === 'all' ||
        (status === 'active' ? category.is_active : !category.is_active);

      return matchesQuery && matchesStatus;
    });

    return applySupabaseCookies(
      NextResponse.json({ categories: filtered }, { status: 200 }),
      auth.cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load FAQ categories.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as Partial<FaqCategoryInput>;
    const input = normalizeFaqCategoryInput(body);
    const validationError = validateFaqCategoryInput(input);

    if (validationError) {
      return applySupabaseCookies(
        NextResponse.json({ error: validationError }, { status: 400 }),
        auth.cookieMutations
      );
    }

    const isUnique = await ensureUniqueFaqCategorySlug({
      admin: auth.admin,
      slug: input.slug,
    });

    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'A category with this slug already exists.' }, { status: 409 }),
        auth.cookieMutations
      );
    }

    const category = await createFaqCategory({
      admin: auth.admin,
      input,
    });

    return applySupabaseCookies(
      NextResponse.json({ category }, { status: 201 }),
      auth.cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to create FAQ category.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
