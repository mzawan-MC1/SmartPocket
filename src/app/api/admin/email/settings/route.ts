import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type EmailSettingsPayload = {
  email_provider?: 'supabase' | 'smtp';
  smtp_host?: string;
  smtp_port?: string;
  smtp_user?: string;
  smtp_password?: string;
  clear_smtp_password?: boolean;
  from_email?: string;
  from_name?: string;
  reply_to_email?: string;
  support_email?: string;
  email_logo_url?: string;
  footer_company_name?: string;
  footer_website_url?: string;
  footer_copyright?: string;
  test_recipient_email?: string;
};

async function requireAdmin() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      ),
    };
  }

  if (user.app_metadata?.role !== 'admin') {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        cookieMutations
      ),
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
        cookieMutations
      ),
    };
  }

  return { ok: true as const, admin, cookieMutations };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  const { admin, cookieMutations } = auth;
  const [{ data: settings }, { data: secrets }] = await Promise.all([
    admin.from('platform_settings').select('*').maybeSingle(),
    admin.from('platform_email_secrets').select('smtp_password').maybeSingle(),
  ]);

  return applySupabaseCookies(
    NextResponse.json(
      {
        settings: settings || null,
        passwordConfigured: Boolean(secrets?.smtp_password),
      },
      { status: 200 }
    ),
    cookieMutations
  );
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  const { admin, cookieMutations } = auth;

  try {
    const body = (await request.json()) as EmailSettingsPayload;
    const publicPayload = {
      email_provider: body.email_provider === 'smtp' ? 'smtp' : 'supabase',
      smtp_host: (body.smtp_host || '').trim(),
      smtp_port: (body.smtp_port || '').trim(),
      smtp_user: (body.smtp_user || '').trim(),
      from_email: (body.from_email || '').trim(),
      from_name: (body.from_name || '').trim(),
      reply_to_email: (body.reply_to_email || '').trim(),
      support_email: (body.support_email || '').trim(),
      email_logo_url: (body.email_logo_url || '').trim(),
      footer_company_name: (body.footer_company_name || '').trim(),
      footer_website_url: (body.footer_website_url || '').trim(),
      footer_copyright: (body.footer_copyright || '').trim(),
      test_recipient_email: (body.test_recipient_email || '').trim(),
    };

    const existingSettings = await admin
      .from('platform_settings')
      .select('id')
      .maybeSingle();

    if (existingSettings.error) {
      throw existingSettings.error;
    }

    if (existingSettings.data?.id) {
      const { error } = await admin
        .from('platform_settings')
        .update(publicPayload)
        .eq('id', existingSettings.data.id);
      if (error) throw error;
    } else {
      const { error } = await admin
        .from('platform_settings')
        .insert({ ...publicPayload, singleton_lock: true });
      if (error) throw error;
    }

    const nextPassword = (body.smtp_password || '').trim();
    if (body.clear_smtp_password || nextPassword) {
      const { error } = await admin
        .from('platform_email_secrets')
        .upsert(
          {
            singleton_lock: true,
            smtp_password: body.clear_smtp_password ? null : nextPassword,
          },
          { onConflict: 'singleton_lock' }
        );

      if (error) {
        throw error;
      }
    }

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to save email settings.' }, { status: 500 }),
      cookieMutations
    );
  }
}
