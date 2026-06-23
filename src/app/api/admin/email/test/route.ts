import { NextResponse } from 'next/server';
import { buildTestEmailTemplate } from '@/lib/email/templates';
import { sendSmtpEmail } from '@/lib/email/smtp';
import { normalizePlatformSettings } from '@/lib/platform-settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type TestEmailPayload = {
  recipient?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

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

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  const { admin, cookieMutations } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as TestEmailPayload;
    const [{ data: rawSettings, error: settingsError }, { data: secrets, error: secretsError }] =
      await Promise.all([
        admin.from('platform_settings').select('*').maybeSingle(),
        admin.from('platform_email_secrets').select('smtp_password').maybeSingle(),
      ]);

    if (settingsError) {
      throw settingsError;
    }

    if (secretsError) {
      throw secretsError;
    }

    const settings = normalizePlatformSettings(rawSettings || null);
    const recipient = (body.recipient || settings.email.testRecipientEmail || '').trim();

    if (!recipient || !isValidEmail(recipient)) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'A valid test recipient email is required.' }, { status: 400 }),
        cookieMutations
      );
    }

    if (settings.email.provider !== 'smtp') {
      return applySupabaseCookies(
        NextResponse.json(
          {
            error:
              'Test sending from the application is available for SMTP mode only. Supabase-managed auth delivery must be tested from the Supabase Dashboard.',
          },
          { status: 400 }
        ),
        cookieMutations
      );
    }

    if (!settings.email.smtpHost || !settings.email.smtpPort || !settings.email.smtpUser || !secrets?.smtp_password) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'SMTP host, port, username, and saved password are required before sending a test email.' },
          { status: 400 }
        ),
        cookieMutations
      );
    }

    const message = buildTestEmailTemplate(settings);

    await sendSmtpEmail({
      host: settings.email.smtpHost,
      port: Number(settings.email.smtpPort),
      username: settings.email.smtpUser,
      password: secrets.smtp_password,
      from: `${settings.email.fromName} <${settings.email.fromEmail}>`,
      to: recipient,
      replyTo: settings.email.replyToEmail,
      subject: message.subject,
      html: message.html,
    });

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to send test email.' }, { status: 500 }),
      cookieMutations
    );
  }
}
