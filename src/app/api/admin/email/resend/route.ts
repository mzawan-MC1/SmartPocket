import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { requireEmailAdmin } from '@/lib/email/admin-auth';
import { sendTransactionalEmail } from '@/lib/email/transactional';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await requireEmailAdmin();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const body = await request.json().catch(() => ({}));
  const logId = (body as any)?.logId as string | undefined;
  if (!logId) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Missing logId' }, { status: 400 }),
      cookieMutations
    );
  }

  const { data: logRow, error } = await admin
    .from('email_delivery_logs')
    .select('*')
    .eq('id', logId)
    .maybeSingle();

  if (error || !logRow) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Delivery log not found.' }, { status: 404 }),
      cookieMutations
    );
  }

  if ((logRow as any).status !== 'failed') {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Only failed emails can be resent.' }, { status: 400 }),
      cookieMutations
    );
  }

  const retryCount = Number((logRow as any).retry_count ?? 0) + 1;
  const originalEventKey = String((logRow as any).event_key || '');
  const resendEventKey = `${originalEventKey}:manual:${retryCount}`;
  const variables = ((logRow as any).metadata as any)?.variables || {};

  const result = await sendTransactionalEmail({
    eventKey: resendEventKey,
    templateKey: (logRow as any).template_key as string,
    to: { email: (logRow as any).recipient_email as string, name: (logRow as any).recipient_name as string | null },
    userId: (logRow as any).user_id as string | null,
    subscriptionId: (logRow as any).subscription_id as string | null,
    paymentId: (logRow as any).payment_id as string | null,
    variables,
  });

  await admin
    .from('email_delivery_logs')
    .update({ retry_count: retryCount })
    .eq('id', logId);

  return applySupabaseCookies(
    NextResponse.json({ success: true, result }, { status: 200 }),
    cookieMutations
  );
}

