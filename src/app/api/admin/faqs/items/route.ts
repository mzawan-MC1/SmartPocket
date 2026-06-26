import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import {
  createFaqItem,
  ensureUniqueFaqItemSlug,
  listFaqItemsForApi,
  loadFaqCategoryOrNull,
} from '@/lib/faqs-admin-server';
import {
  normalizeFaqItemInput,
  validateFaqItemInput,
  type FaqItemInput,
} from '@/lib/faqs';
import { requireAdminRouteUser } from '@/lib/support-server';

export async function GET(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim().toLowerCase() || '';
  const categoryId = searchParams.get('categoryId') || 'all';
  const status = searchParams.get('status') || 'all';
  const featured = searchParams.get('featured') || 'all';

  try {
    const items = await listFaqItemsForApi();
    const filtered = items.filter((item) => {
      const matchesQuery =
        !query ||
        item.slug.toLowerCase().includes(query) ||
        item.category_name.toLowerCase().includes(query) ||
        Object.values(item.translations).some((translation) =>
          translation.question.toLowerCase().includes(query) ||
          translation.answer_html.toLowerCase().includes(query) ||
          translation.keywords.some((keyword) => keyword.toLowerCase().includes(query))
        );

      const matchesCategory = categoryId === 'all' || item.category_id === categoryId;
      const matchesStatus =
        status === 'all' ||
        (status === 'active' ? item.is_active : !item.is_active);
      const matchesFeatured =
        featured === 'all' ||
        (featured === 'featured' ? item.is_featured : !item.is_featured);

      return matchesQuery && matchesCategory && matchesStatus && matchesFeatured;
    });

    return applySupabaseCookies(
      NextResponse.json({ items: filtered }, { status: 200 }),
      auth.cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load FAQs.' }, { status: 500 }),
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
    const body = (await request.json()) as Partial<FaqItemInput>;
    const input = normalizeFaqItemInput(body);
    const validationError = validateFaqItemInput(input);

    if (validationError) {
      return applySupabaseCookies(
        NextResponse.json({ error: validationError }, { status: 400 }),
        auth.cookieMutations
      );
    }

    const category = await loadFaqCategoryOrNull(auth.admin, input.category_id);
    if (!category) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Select a valid category.' }, { status: 400 }),
        auth.cookieMutations
      );
    }

    const isUnique = await ensureUniqueFaqItemSlug({
      admin: auth.admin,
      slug: input.slug,
    });

    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'An FAQ with this slug already exists.' }, { status: 409 }),
        auth.cookieMutations
      );
    }

    const item = await createFaqItem({
      admin: auth.admin,
      input,
    });

    return applySupabaseCookies(
      NextResponse.json({ item }, { status: 201 }),
      auth.cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to create FAQ.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
