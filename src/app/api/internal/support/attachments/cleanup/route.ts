import { NextRequest, NextResponse } from 'next/server';
import { SUPPORT_ATTACHMENT_BUCKET } from '@/lib/support';
import { createAdminClient } from '@/lib/supabase/admin';

type CleanupRpcRow = {
  intent_id?: string | null;
  attachment_id?: string | null;
  storage_path?: string | null;
};

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice(7).trim();
}

function parseLimit(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 50;
  }

  return Math.max(1, Math.min(200, Math.floor(numeric)));
}

async function runCleanupSource(args: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  rpcName:
    | 'cleanup_expired_support_attachment_upload_intents'
    | 'cleanup_abandoned_support_attachment_upload_intents'
    | 'cleanup_abandoned_support_ticket_attachments';
  source: 'expired_upload_intents' | 'abandoned_finalized_upload_intents' | 'abandoned_ticket_attachments';
  limit: number;
}) {
  const { data, error } = await args.admin.rpc(args.rpcName, {
    p_limit: args.limit,
  });

  if (error) {
    return {
      source: args.source,
      rpcName: args.rpcName,
      rpcError: error.message || 'Cleanup RPC failed.',
      deletedCount: 0,
      failedCount: 0,
      results: [] as Array<{
        recordId: string | null;
        storagePath: string | null;
        deleted: boolean;
        error: string | null;
      }>,
    };
  }

  const rows: CleanupRpcRow[] = Array.isArray(data)
    ? data.filter((row): row is CleanupRpcRow => Boolean(row && typeof row === 'object'))
    : [];

  const results: Array<{
    recordId: string | null;
    storagePath: string | null;
    deleted: boolean;
    error: string | null;
  }> = [];

  for (const row of rows) {
    const recordId =
      typeof row.intent_id === 'string'
        ? row.intent_id
        : typeof row.attachment_id === 'string'
          ? row.attachment_id
          : null;

    if (!row.storage_path) {
      results.push({
        recordId,
        storagePath: null,
        deleted: false,
        error: 'Cleanup RPC returned a row without a storage path.',
      });
      continue;
    }

    const { error: deleteError } = await args.admin.storage
      .from(SUPPORT_ATTACHMENT_BUCKET)
      .remove([row.storage_path]);

    results.push({
      recordId,
      storagePath: row.storage_path,
      deleted: !deleteError,
      error: deleteError?.message || null,
    });
  }

  return {
    source: args.source,
    rpcName: args.rpcName,
    rpcError: null,
    deletedCount: results.filter((result) => result.deleted).length,
    failedCount: results.filter((result) => !result.deleted).length,
    results,
  };
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.SUPPORT_ATTACHMENT_JOB_SECRET;
  const suppliedSecret = getBearerToken(request) || request.headers.get('x-job-secret') || '';

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Service role is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const limit = parseLimit((body as { limit?: unknown }).limit);

  const sources = await Promise.all([
    runCleanupSource({
      admin,
      rpcName: 'cleanup_expired_support_attachment_upload_intents',
      source: 'expired_upload_intents',
      limit,
    }),
    runCleanupSource({
      admin,
      rpcName: 'cleanup_abandoned_support_attachment_upload_intents',
      source: 'abandoned_finalized_upload_intents',
      limit,
    }),
    runCleanupSource({
      admin,
      rpcName: 'cleanup_abandoned_support_ticket_attachments',
      source: 'abandoned_ticket_attachments',
      limit,
    }),
  ]);

  return NextResponse.json({
    success: sources.every((source) => !source.rpcError),
    limit,
    sources,
  });
}
