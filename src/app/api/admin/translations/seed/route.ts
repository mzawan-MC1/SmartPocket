import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import {
  applySupabaseCookies,
  createRouteHandlerSupabaseClient,
} from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { I18N_NAMESPACES, type TranslationNamespace } from '@/i18n/resources';

type SupportedLanguage = 'en' | 'ar' | 'fr' | 'ru';
type SeedRow = {
  content_type: string;
  content_key: string;
  language: SupportedLanguage;
  value: string;
  is_approved: boolean;
  is_published: boolean;
};

const SOURCE_LANGUAGE: SupportedLanguage = 'en';
const SELECT_BATCH_SIZE = 150;
const INSERT_BATCH_SIZE = 250;

function flattenJson(value: unknown, prefix = '', out: Record<string, string> = {}) {
  if (typeof value === 'string') {
    if (prefix) out[prefix] = value;
    return out;
  }

  if (!value || typeof value !== 'object') return out;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    flattenJson(child, nextPrefix, out);
  }

  return out;
}

function isValidTranslationKey(value: string) {
  return /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(value);
}

function chunk<T>(items: T[], size: number) {
  if (items.length === 0) return [];

  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function getCompositeKey(row: Pick<SeedRow, 'content_type' | 'content_key' | 'language'>) {
  return `${row.content_type}::${row.content_key}::${row.language}`;
}

function serializeError(error: unknown) {
  if (error instanceof Error) {
    const details = error as Error & {
      code?: string;
      details?: string;
      hint?: string;
      status?: number;
    };
    return {
      message: details.message,
      code: details.code ?? null,
      details: details.details ?? null,
      hint: details.hint ?? null,
      status: details.status ?? null,
    };
  }

  return {
    message: typeof error === 'string' ? error : 'Unknown error',
    code: null,
    details: null,
    hint: null,
    status: null,
  };
}

async function loadSourceRows(localesRoot: string) {
  const contentTypes = [...I18N_NAMESPACES];
  const validRows: SeedRow[] = [];
  const invalid: Array<{ content_type: string; content_key: string; reason: string }> = [];
  const deduped = new Map<string, SeedRow>();
  let duplicateSourceKeys = 0;

  for (const contentType of contentTypes) {
    const filePath = path.join(localesRoot, SOURCE_LANGUAGE, `${contentType}.json`);
    const raw = await fs.readFile(filePath, 'utf-8').catch(() => null);
    if (!raw) continue;

    const parsed = JSON.parse(raw) as unknown;
    const flat = flattenJson(parsed);

    for (const [content_key, value] of Object.entries(flat)) {
      if (!isValidTranslationKey(content_key)) {
        invalid.push({
          content_type: contentType,
          content_key,
          reason: 'invalid_key_format',
        });
        continue;
      }

      const row: SeedRow = {
        content_type: contentType,
        content_key,
        language: SOURCE_LANGUAGE,
        value,
        is_approved: true,
        is_published: true,
      };

      const compositeKey = getCompositeKey(row);
      if (deduped.has(compositeKey)) {
        duplicateSourceKeys += 1;
        continue;
      }

      deduped.set(compositeKey, row);
      validRows.push(row);
    }
  }

  return {
    contentTypes,
    validRows,
    invalid,
    duplicateSourceKeys,
  };
}

export async function POST() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const serviceRoleClient = createAdminClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (process.env.NODE_ENV !== 'production') {
    console.info('[admin/translations/seed] user', user?.id ?? 'none');
  }

  if (error || !user) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      cookieMutations
    );
  }

  const isAdminFromAppMetadata = user.app_metadata?.role === 'admin';
  const isAdminFromUserMetadata = user.user_metadata?.role === 'admin';
  const isAdmin = isAdminFromAppMetadata || (Boolean(serviceRoleClient) && isAdminFromUserMetadata);

  if (!isAdmin) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      cookieMutations
    );
  }

  try {
    const localesRoot = path.join(process.cwd(), 'src', 'i18n', 'locales');
    const adminSupabase = serviceRoleClient ?? supabase;
    const {
      contentTypes,
      validRows,
      invalid,
      duplicateSourceKeys,
    } = await loadSourceRows(localesRoot);

    console.info('[admin/translations/seed] start', {
      userId: user.id,
      contentTypes: contentTypes.length,
      sourceRows: validRows.length,
      invalidRows: invalid.length,
      duplicateSourceKeys,
      usingServiceRole: adminSupabase !== supabase,
      serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      adminRoleSource: isAdminFromAppMetadata ? 'app_metadata' : serviceRoleClient ? 'user_metadata_via_service_role' : 'unknown',
    });

    const existingSet = new Set<string>();
    const selectBatches = chunk(validRows, SELECT_BATCH_SIZE);

    for (const batch of selectBatches) {
      const contentKeyBatch = Array.from(new Set(batch.map((row) => row.content_key)));
      const contentTypeBatch = Array.from(new Set(batch.map((row) => row.content_type)));
      const { data: existingRows, error: existingError } = await adminSupabase
        .from('cms_translations')
        .select('content_type,content_key,language')
        .eq('language', SOURCE_LANGUAGE)
        .in('content_type', contentTypeBatch as TranslationNamespace[])
        .in('content_key', contentKeyBatch);

      if (existingError) {
        throw Object.assign(existingError, {
          phase: 'select_existing_rows',
          batchSize: batch.length,
        });
      }

      for (const row of existingRows ?? []) {
        existingSet.add(
          getCompositeKey({
            content_type: row.content_type,
            content_key: row.content_key,
            language: row.language as SupportedLanguage,
          })
        );
      }
    }

    const rowsToInsert = validRows.filter((row) => !existingSet.has(getCompositeKey(row)));
    const insertBatches = chunk(rowsToInsert, INSERT_BATCH_SIZE);
    let insertedCount = 0;

    for (const batch of insertBatches) {
      const { error: insertError } = await adminSupabase
        .from('cms_translations')
        .upsert(batch, {
          onConflict: 'content_type,content_key,language',
          ignoreDuplicates: true,
        });

      if (insertError) {
        throw Object.assign(insertError, {
          phase: 'insert_missing_rows',
          batchSize: batch.length,
        });
      }

      insertedCount += batch.length;
    }

    const added = insertedCount;
    const existing = validRows.length - added;
    const skipped = invalid.length;

    console.info('[admin/translations/seed] complete', {
      userId: user.id,
      added,
      existing,
      skipped,
      duplicateSourceKeys,
      rows: validRows.length,
      selectBatches: selectBatches.length,
      insertBatches: insertBatches.length,
    });

    return applySupabaseCookies(
      NextResponse.json(
        {
          ok: true,
          content_types: contentTypes.length,
          added,
          existing,
          skipped,
          duplicateSourceKeys,
          invalid,
          rows: validRows.length,
          selectBatches: selectBatches.length,
          insertBatches: insertBatches.length,
          usingServiceRole: adminSupabase !== supabase,
        },
        { status: 200 }
      ),
      cookieMutations
    );
  } catch (e) {
    const serializedError = serializeError(e);
    const phase =
      typeof e === 'object' &&
      e !== null &&
      'phase' in e &&
      typeof (e as { phase?: unknown }).phase === 'string'
        ? (e as { phase: string }).phase
        : 'unknown';
    const batchSize =
      typeof e === 'object' &&
      e !== null &&
      'batchSize' in e &&
      typeof (e as { batchSize?: unknown }).batchSize === 'number'
        ? (e as { batchSize: number }).batchSize
        : null;

    console.error('[admin/translations/seed] failed', {
      phase,
      batchSize,
      serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      error: serializedError,
    });

    return applySupabaseCookies(
      NextResponse.json(
        {
          error: 'Failed to import translation keys from source files.',
          message: serializedError.message,
          details: {
            phase,
            batchSize,
            serviceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          },
        },
        { status: 500 }
      ),
      cookieMutations
    );
  }
}
