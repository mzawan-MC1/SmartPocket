import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/transactional';

type ContactPayload = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  website?: string;
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const CONTACT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const CONTACT_RATE_LIMIT_MAX_REQUESTS = 5;
const CONTACT_MAX_LENGTHS = {
  name: 120,
  email: 254,
  subject: 160,
  message: 4000,
};

type ContactRateLimitEntry = {
  count: number;
  resetAt: number;
};

const contactRateLimitStore = new Map<string, ContactRateLimitEntry>();

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const realIp = request.headers.get('x-real-ip') || '';
  return forwardedFor.split(',')[0]?.trim() || realIp.trim() || 'unknown';
}

function isRateLimited(key: string) {
  const now = Date.now();
  const existing = contactRateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    contactRateLimitStore.set(key, {
      count: 1,
      resetAt: now + CONTACT_RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  if (existing.count >= CONTACT_RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  existing.count += 1;
  contactRateLimitStore.set(key, existing);
  return false;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ContactPayload;
    const name = body.name?.trim().replace(/\s+/g, ' ') || '';
    const email = body.email?.trim().toLowerCase() || '';
    const subject = body.subject?.trim().replace(/\s+/g, ' ') || '';
    const message = body.message?.trim() || '';
    const website = body.website?.trim() || '';
    const clientIp = getClientIp(request);

    if (website) {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (isRateLimited(`${clientIp}:${email || 'anonymous'}`)) {
      return NextResponse.json(
        { error: 'We could not submit your message right now. Please try again later.' },
        { status: 429 }
      );
    }

    if (!name || !email || !subject || message.length < 20) {
      return NextResponse.json({ error: 'Please complete all required fields.' }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    if (
      name.length > CONTACT_MAX_LENGTHS.name ||
      email.length > CONTACT_MAX_LENGTHS.email ||
      subject.length > CONTACT_MAX_LENGTHS.subject ||
      message.length > CONTACT_MAX_LENGTHS.message
    ) {
      return NextResponse.json({ error: 'Please shorten your message and try again.' }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Contact delivery is temporarily unavailable.' },
        { status: 503 }
      );
    }

    const { data: submission, error } = await admin
      .from('contact_submissions')
      .insert({
        name,
        email,
        subject,
        message,
        status: 'new',
      })
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[contact] Failed to store submission.');
      return NextResponse.json(
        { error: 'We could not submit your message right now. Please try again later.' },
        { status: 500 }
      );
    }

    try {
      const submissionId = (submission as any)?.id as string | undefined;
      const eventKey = submissionId
        ? `admin_contact_form_received:${submissionId}`
        : `admin_contact_form_received:${Date.now()}:${Math.random().toString(16).slice(2)}`;

      await sendTransactionalEmail({
        eventKey,
        templateKey: 'admin_contact_form_received',
        to: { email: 'no-reply@1smartpocket.com', name: 'System' },
        variables: {
          contact_name: name,
          contact_email: email,
          contact_subject: subject,
          contact_message: message,
        },
      });
    } catch {
      console.error('[contact] Failed to send admin notification email.');
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[contact] Unexpected error.');
    return NextResponse.json(
      { error: 'We could not submit your message right now. Please try again later.' },
      { status: 500 }
    );
  }
}
