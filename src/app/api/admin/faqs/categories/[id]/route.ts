import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import {
  autoTranslateFaqCategory,
  deleteFaqCategory,
  enCategoryChanged,
  ensureUniqueFaqCategorySlug,
  loadFaqCategoryInputOrNull,
  loadFaqCategoryOrNull,
  loadFaqCategoryQuestionCount,
  loadFaqCategoryTranslationStatus,
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

    const rawBody = (await request.json()) as Partial<FaqCategoryInput> & { regenerate_translations?: boolean };
    const { regenerate_translations, ...body } = rawBody;
    const merged = mergeCategoryInputWithExisting({ existing, input: body });
    const input = normalizeFaqCategoryInput(merged);
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

    const enChanged = enCategoryChanged(existing, input);
    const shouldTranslate = regenerate_translations === true || enChanged;

    const category = await updateFaqCategory({
      admin: auth.admin,
      categoryId: id,
      input,
      enChanged: false,
    });

    let scheduleResult: { sourceHash: string; scheduledLanguages: any[]; totalEnabled: number } | null = null;
    if (shouldTranslate) {
      scheduleResult = await autoTranslateFaqCategory(auth.admin, id, input, { regenerateAll: regenerate_translations === true });
    }

    const statusSummary = await loadFaqCategoryTranslationStatus(
      auth.admin,
      id,
      input.translations.en?.name || '',
      input.translations.en?.description || ''
    );

    return applySupabaseCookies(
      NextResponse.json(
        {
          category,
          translation: {
            statuses: statusSummary.statuses,
            enSourceHash: statusSummary.enSourceHash,
            perLanguage: [],
            scheduledLanguages: scheduleResult?.scheduledLanguages ?? [],
            totalEnabled: scheduleResult?.totalEnabled ?? 0,
            skippedTranslations: !shouldTranslate,
          },
        },
        { status: 200 }
      ),
      auth.cookieMutations
    );
  } catch (e) {
    return applySupabaseCookies(
      NextResponse.json({ error: (e as any)?.message || 'Failed to update FAQ category.' }, { status: 500 }),
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
