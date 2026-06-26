import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    return 500;
  }

  return Math.max(1, Math.min(2000, Math.floor(numeric)));
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.AI_HISTORY_RETENTION_JOB_SECRET;
  const suppliedSecret = getBearerToken(request) || request.headers.get('x-job-secret') || '';

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Service role is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const targetUserId = typeof (body as { userId?: unknown }).userId === 'string'
    ? (body as { userId: string }).userId.trim() || null
    : null;
  const limit = parseLimit((body as { limit?: unknown }).limit);

  const { data, error } = await admin.rpc('cleanup_ai_history_retention', {
    p_target_user_id: targetUserId,
    p_limit: limit,
  });

  if (error) {
    return NextResponse.json({ error: error.message || 'Cleanup failed.' }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  return NextResponse.json({
    success: true,
    limit,
    targetUserId,
    deletedRequests: rows.length,
    rows,
  });
}
