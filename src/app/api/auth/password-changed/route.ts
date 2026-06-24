import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { queuePasswordChangedEmail } from '@/lib/email/transactional';

export const runtime = 'nodejs';

export async function POST() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      cookieMutations
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Email service is not configured.' }, { status: 503 }),
      cookieMutations
    );
  }

  const { data: profile } = await admin
    .from('user_profiles')
    .select('email,full_name')
    .eq('id', user.id)
    .maybeSingle();

  const email = ((profile as any)?.email as string) || user.email || '';
  const name = ((profile as any)?.full_name as string) || user.user_metadata?.full_name || '';

  try {
    await queuePasswordChangedEmail({
      userId: user.id,
      customerEmail: email,
      customerName: name || email.split('@')[0] || 'there',
    });
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ success: true, queued: false }, { status: 200 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ success: true, queued: true }, { status: 200 }),
    cookieMutations
  );
}

