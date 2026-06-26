import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import {
  deleteFaqCategory,
  ensureUniqueFaqCategorySlug,
  loadFaqCategoryInputOrNull,
  loadFaqCategoryOrNull,
  loadFaqCategoryQuestionCount,
  mergeCategoryInputWithExisting,
  updateFaqCategory,
} from '@/lib/faqs-admin-server';
import {
  isValidUuid,
  normalizeFaqCategoryInput,
  validateFaqCategoryInput,
  type FaqCategoryInput,
} from '@/lib/faqs';
import { requireAdminRouteUser } from '@/lib/support-server';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Invalid FAQ category.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  try {
    const existing = await loadFaqCategoryInputOrNull(auth.admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'FAQ category not found.' }, { status: 404 }),
        auth.cookieMutations
      );
    }

    const body = (await request.json()) as Partial<FaqCategoryInput>;
    const input = normalizeFaqCategoryInput(
      mergeCategoryInputWithExisting({
        existing,
        input: body,
      })
    );
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
      currentId: id,
    });

    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'A category with this slug already exists.' }, { status: 409 }),
        auth.cookieMutations
      );
    }

    const category = await updateFaqCategory({
      admin: auth.admin,
      categoryId: id,
      input,
    });

    return applySupabaseCookies(
      NextResponse.json({ category }, { status: 200 }),
      auth.cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to update FAQ category.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Invalid FAQ category.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  try {
    const existing = await loadFaqCategoryOrNull(auth.admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'FAQ category not found.' }, { status: 404 }),
        auth.cookieMutations
      );
    }

    const url = new URL(request.url);
    const force = url.searchParams.get('force') === 'true';
    const questionCount = await loadFaqCategoryQuestionCount({
      admin: auth.admin,
      categoryId: id,
    });

    if (questionCount > 0 && !force) {
      return applySupabaseCookies(
        NextResponse.json(
          {
            error: 'This category still contains FAQs. Confirm deletion to remove the category and its FAQs.',
            questionCount,
          },
          { status: 409 }
        ),
        auth.cookieMutations
      );
    }

    await deleteFaqCategory({
      admin: auth.admin,
      categoryId: id,
    });

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      auth.cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to delete FAQ category.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
