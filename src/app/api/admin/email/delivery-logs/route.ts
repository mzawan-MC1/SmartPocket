import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { requireEmailAdmin } from '@/lib/email/admin-auth';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = await requireEmailAdmin();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));

  let query = admin
    .from('email_delivery_logs')
    .select('id,event_key,template_key,recipient_email,recipient_name,user_id,subscription_id,payment_id,subject,provider_message_id,status,error_message,retry_count,sent_at,created_at,metadata')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load delivery logs.' }, { status: 500 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ logs: data || [] }, { status: 200 }),
    cookieMutations
  );
}

