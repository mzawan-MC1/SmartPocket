import 'server-only';

import { NextResponse } from 'next/server';
import { requireAdminRouteUserViaJwt } from '@/lib/support-server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import {
  CANONICAL_DOCUMENTATION_CATEGORIES,
  normalizeDocumentationCategoryInput,
  validateDocumentationCategoryInput,
  type DocumentationCategoryInput,
  type DocumentationCategoryRecord,
  type DocumentationCategoryWithCount,
} from '@/lib/documentation';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCUMENTATION_CATEGORIES } from '@/lib/documentation';

type AdminSupabase = NonNullable<ReturnType<typeof createAdminClient>>;

async function ensureUniqueCategorySlug(
  admin: AdminSupabase,
  slug: string,
  excludeId?: string
) {
  try {
    const { data, error } = await admin
      .from('documentation_categories')
      .select('id')
      .eq('slug', slug);

    if (error) throw error;
    const rows = ((data || []) as { id: string }[]);
    if (!excludeId) return rows.length === 0;
    return !rows.some((row) => row.id !== excludeId);
  } catch (err: any) {
    console.error('[ensureUniqueCategorySlug] error:', err?.message ?? err);
    throw err;
  }
}

async function adminGetCategoriesWithCountFast(admin: AdminSupabase, {
  runAutoSeedIfEmpty = true,
}: { runAutoSeedIfEmpty?: boolean } = {}): Promise<DocumentationCategoryWithCount[]> {
  try {
    const { data: cats, error: catsErr } = await admin
      .from('documentation_categories')
      .select('*')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false });

    if (catsErr) throw catsErr;

    const catRows = ((cats || []) as DocumentationCategoryRecord[]);

    if (runAutoSeedIfEmpty && catRows.length === 0) {
      try {
        const discovered = new Set<string>();
        try {
          const { data: articleCats } = await admin
            .from('documentation_articles')
            .select('category');
          for (const r of ((articleCats || []) as Array<{ category: string }>)) {
            const c = String(r.category || '').trim();
            if (c) discovered.add(c);
          }
        } catch { /* swallow */ }
        for (const c of DOCUMENTATION_CATEGORIES) discovered.add(c);
        for (const s of CANONICAL_DOCUMENTATION_CATEGORIES) discovered.add(s.slug);

        const existingAfter = new Set<string>();
        try {
          const { data: rows } = await admin.from('documentation_categories').select('slug');
          for (const r of ((rows || []) as Array<{ slug: string }>)) {
            const sl = String(r.slug || '').trim();
            if (sl) existingAfter.add(sl);
          }
        } catch { /* swallow */ }

        const toInsert: Array<{
          name: string; slug: string; description: string;
          display_order: number; is_active: boolean;
        }> = [];

        const canonicalBySlug = new Map<string, typeof CANONICAL_DOCUMENTATION_CATEGORIES[number]>();
        for (const spec of CANONICAL_DOCUMENTATION_CATEGORIES) canonicalBySlug.set(spec.slug, spec);

        for (const slug of Array.from(discovered)) {
          if (existingAfter.has(slug)) continue;
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
          const canonical = canonicalBySlug.get(slug);
          if (canonical) {
            toInsert.push({
              name: canonical.name,
              slug: canonical.slug,
              description: canonical.description,
              display_order: canonical.display_order,
              is_active: canonical.is_active !== false,
            });
          } else {
            const label = slug
              .split('-')
              .map((p) => (p.length > 0 ? p.charAt(0).toUpperCase() + p.slice(1) : ''))
              .join(' ')
              .trim();
            toInsert.push({
              name: label || slug,
              slug,
              description: '',
              display_order: 50,
              is_active: true,
            });
          }
        }

        if (toInsert.length > 0) {
          try {
            await admin.from('documentation_categories').insert(toInsert);
          } catch (seedErr: any) {
            console.warn('[adminGetCategoriesWithCountFast] auto-seed skipped:', seedErr?.message ?? seedErr);
          }
        }
      } catch (autoSeedErr: any) {
        console.warn('[adminGetCategoriesWithCountFast] auto-seed step failed (non-fatal):', autoSeedErr?.message ?? autoSeedErr);
      }

      try {
        const { data: afterCats, error: afterErr } = await admin
          .from('documentation_categories')
          .select('*')
          .order('display_order', { ascending: true })
          .order('created_at', { ascending: false });
        if (!afterErr && Array.isArray(afterCats)) {
          // Mutate catRows reference: replace empty array with actual seed results
          catRows.splice(0, catRows.length, ...((afterCats as DocumentationCategoryRecord[]) || []));
        }
      } catch (afterErr: any) {
        console.warn('[adminGetCategoriesWithCountFast] post-seed re-read failed (non-fatal):', afterErr?.message ?? afterErr);
      }
    }

    const countsByCategory: Record<string, number> = {};
    try {
      const { data: catCounts, error: countsErr } = await admin
        .from('documentation_articles')
        .select('category');

      if (countsErr && !catCounts) {
        // non-fatal: counts will be 0
      } else {
        for (const row of ((catCounts || []) as Array<{ category: string }>)) {
          const c = String(row.category || '').trim();
          if (c) countsByCategory[c] = (countsByCategory[c] || 0) + 1;
        }
      }
    } catch (countsErr: any) {
      console.warn('[adminGetCategoriesWithCountFast] article counts skipped (non-fatal):', countsErr?.message ?? countsErr);
    }

    return catRows.map((c) => ({
      ...c,
      translations: (c.translations && typeof c.translations === 'object') ? c.translations : {},
      articles_count: countsByCategory[c.slug] || 0,
    }));
  } catch (err: any) {
    console.error('[adminGetCategoriesWithCountFast] fatal error:', err?.message ?? err);
    throw err;
  }
}

export async function GET() {
  const auth = await requireAdminRouteUserViaJwt();
  if (!auth.ok) return auth.response;
  const { cookieMutations, admin } = auth;

  try {
    const categories = await adminGetCategoriesWithCountFast(admin, { runAutoSeedIfEmpty: true });
    return applySupabaseCookies(
      NextResponse.json({ categories: categories ?? [] }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    console.error('[GET /api/admin/documentation/categories] unexpected error:', error?.message ?? error);
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
  const auth = await requireAdminRouteUserViaJwt();
  if (!auth.ok) return auth.response;
  const { admin, cookieMutations, userId } = auth;

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
      translations: (payload.translations && typeof payload.translations === 'object')
        ? payload.translations
        : {},
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
        { category: (data as DocumentationCategoryRecord) ?? null },
        { status: 201 }
      ),
      cookieMutations
    );
  } catch (error: any) {
    console.error('[POST /api/admin/documentation/categories] unexpected error:', error?.message ?? error);
    return applySupabaseCookies(
      NextResponse.json(
        { error: error?.message || 'Failed to create documentation category.' },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
