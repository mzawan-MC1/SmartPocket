import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import {
  autoTranslateFaqItem,
  deleteFaqItem,
  enItemChanged,
  ensureUniqueFaqItemSlug,
  loadFaqCategoryOrNull,
  loadFaqItemInputOrNull,
  loadFaqItemOrNull,
  loadFaqItemTranslationStatus,
  mergeItemInputWithExisting,
  updateFaqItem,
} from '@/lib/faqs-admin-server';
import {
  isValidUuid,
  normalizeFaqItemInput,
  validateFaqItemInput,
  type FaqItemInput,
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
      NextResponse.json({ error: 'Invalid FAQ.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  try {
    const existing = await loadFaqItemInputOrNull(auth.admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'FAQ not found.' }, { status: 404 }),
        auth.cookieMutations
      );
    }

    const rawBody = (await request.json()) as Partial<FaqItemInput> & { regenerate_translations?: boolean };
    const { regenerate_translations, ...body } = rawBody;
    const merged = mergeItemInputWithExisting({ existing, input: body });
    const input = normalizeFaqItemInput(merged);
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
      currentId: id,
    });

    if (!isUnique) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'An FAQ with this slug already exists.' }, { status: 409 }),
        auth.cookieMutations
      );
    }

    const enChanged = enItemChanged(existing, input);
    const shouldTranslate = regenerate_translations === true || enChanged;

    const item = await updateFaqItem({
      admin: auth.admin,
      itemId: id,
      input,
      enChanged: false,
    });

    let scheduleResult: { sourceHash: string; scheduledLanguages: any[]; totalEnabled: number } | null = null;
    if (shouldTranslate) {
      scheduleResult = await autoTranslateFaqItem(auth.admin, id, input, { regenerateAll: regenerate_translations === true });
    }

    const statusSummary = await loadFaqItemTranslationStatus(
      auth.admin,
      id,
      input.translations.en?.question || '',
      input.translations.en?.answer_html || '',
      Array.isArray(input.translations.en?.keywords) ? input.translations.en.keywords : []
    );

    return applySupabaseCookies(
      NextResponse.json(
        {
          item,
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
      NextResponse.json({ error: (e as any)?.message || 'Failed to update FAQ.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Invalid FAQ.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  try {
    const existing = await loadFaqItemOrNull(auth.admin, id);
    if (!existing) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'FAQ not found.' }, { status: 404 }),
        auth.cookieMutations
      );
    }

    await deleteFaqItem({
      admin: auth.admin,
      itemId: id,
    });

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      auth.cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to delete FAQ.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
