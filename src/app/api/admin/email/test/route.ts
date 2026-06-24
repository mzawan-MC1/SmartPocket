import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/transactional';

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

  const { cookieMutations } = auth;

  try {
    const body = (await request.json().catch(() => ({}))) as TestEmailPayload;
    const recipient = (body.recipient || '').trim();

    if (!recipient || !isValidEmail(recipient)) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'A valid test recipient email is required.' }, { status: 400 }),
        cookieMutations
      );
    }

    const result = await sendTransactionalEmail({
      eventKey: `admin_smtp_test:${new Date().toISOString()}:${recipient.toLowerCase()}`,
      templateKey: 'admin_smtp_test',
      to: { email: recipient },
      variables: { sent_at: new Date().toISOString() },
      isTest: true,
      overrideTo: { email: recipient },
    });

    if (result.status === 'sent') {
      return applySupabaseCookies(
        NextResponse.json({ success: true, messageId: result.providerMessageId }, { status: 200 }),
        cookieMutations
      );
    }

    if (result.status === 'skipped') {
      const errorMessage = result.errorMessage || 'skipped';
      const status = errorMessage === 'email_provider_not_smtp' || errorMessage === 'smtp_not_configured' ? 400 : 409;
      return applySupabaseCookies(
        NextResponse.json({ error: errorMessage }, { status }),
        cookieMutations
      );
    }

    return applySupabaseCookies(
      NextResponse.json({ error: result.errorMessage || 'Failed to send test email.' }, { status: 500 }),
      cookieMutations
    );
  } catch (error: any) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to send test email.' }, { status: 500 }),
      cookieMutations
    );
  }
}
