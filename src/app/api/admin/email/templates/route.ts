import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { requireEmailAdmin } from '@/lib/email/admin-auth';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireEmailAdmin();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const { data, error } = await admin
    .from('email_templates')
    .select('template_key,name,category,recipient_type,subject,enabled,language_code,updated_at')
    .eq('language_code', 'en')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load templates.' }, { status: 500 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ templates: data || [] }, { status: 200 }),
    cookieMutations
  );
}

