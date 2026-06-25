import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { sendContactAcknowledgementEmail } from '@/lib/support-email';
import { hasTooManyLinks, isValidEmail, sanitizeMultilineText, sanitizeSingleLineText } from '@/lib/support';
import { insertContactEvent } from '@/lib/support-server';

type ContactPayload = {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
  sourcePage?: string;
  website?: string;
};

const CONTACT_MAX_LENGTHS = {
  name: 120,
  email: 254,
  phone: 40,
  subject: 160,
  message: 4000,
  sourcePage: 240,
};

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const realIp = request.headers.get('x-real-ip') || '';
  return forwardedFor.split(',')[0]?.trim() || realIp.trim() || 'unknown';
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeEmailResult(result: {
  success?: boolean;
  status?: 'sent' | 'failed' | 'skipped';
  errorMessage?: string | null;
} | null | undefined) {
  if (!result) {
    return {
      status: 'failed' as const,
      error: 'unknown_email_result',
    };
  }

  return {
    status: result.status || (result.success ? 'sent' : 'failed'),
    error: result.success ? null : result.errorMessage || 'email_delivery_failed',
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as ContactPayload;
    const name = sanitizeSingleLineText(body.name, CONTACT_MAX_LENGTHS.name);
    const email = sanitizeSingleLineText(body.email, CONTACT_MAX_LENGTHS.email).toLowerCase();
    const phone = sanitizeSingleLineText(body.phone, CONTACT_MAX_LENGTHS.phone);
    const subject = sanitizeSingleLineText(body.subject, CONTACT_MAX_LENGTHS.subject);
    const message = sanitizeMultilineText(body.message, CONTACT_MAX_LENGTHS.message);
    const sourcePage = sanitizeSingleLineText(body.sourcePage, CONTACT_MAX_LENGTHS.sourcePage);
    const website = sanitizeSingleLineText(body.website, 120);
    const clientIp = getClientIp(request);
    const normalizedSourcePage = sourcePage.startsWith('/') ? sourcePage : '/contact';
    const isLikelySpam = hasTooManyLinks(subject) || hasTooManyLinks(message);

    if (website) {
      return NextResponse.json({ success: true }, { status: 200 });
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
      phone.length > CONTACT_MAX_LENGTHS.phone ||
      subject.length > CONTACT_MAX_LENGTHS.subject ||
      message.length > CONTACT_MAX_LENGTHS.message ||
      normalizedSourcePage.length > CONTACT_MAX_LENGTHS.sourcePage
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

    const emailHash = sha256(email);
    const ipHash = sha256(clientIp);
    const contentHash = sha256(`${email}\n${subject}\n${message}`);
    const { data: guardResultRaw, error: guardError } = await admin.rpc('check_contact_submission_guard', {
      p_email_hash: emailHash,
      p_ip_hash: ipHash,
      p_content_hash: contentHash,
      p_rate_window_seconds: 900,
      p_rate_limit: 5,
      p_duplicate_window_seconds: 600,
    });

    if (guardError) {
      console.error('[contact] Failed to evaluate contact submission guard.', guardError);
      return NextResponse.json(
        { error: 'We could not submit your message right now. Please try again later.' },
        { status: 500 }
      );
    }

    const guardResult =
      guardResultRaw && typeof guardResultRaw === 'object'
        ? (guardResultRaw as {
            rate_limited?: boolean;
            duplicate?: boolean;
            accepted?: boolean;
          })
        : {};

    if (guardResult.rate_limited) {
      return NextResponse.json(
        { error: 'We could not submit your message right now. Please try again later.' },
        { status: 429 }
      );
    }

    if (guardResult.duplicate) {
      const duplicateCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: duplicateSubmission } = await admin
        .from('contact_submissions')
        .select('id, reference_number')
        .eq('email', email)
        .eq('subject', subject)
        .eq('message', message)
        .gte('created_at', duplicateCutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return NextResponse.json(
        {
          success: true,
          referenceNumber: duplicateSubmission?.reference_number || null,
          message: duplicateSubmission?.reference_number
            ? `Thanks, your enquiry is already in our queue. Reference: ${duplicateSubmission.reference_number}.`
            : 'Thanks, your enquiry is already in our queue.',
        },
        { status: 200 }
      );
    }

    const { data: submission, error } = await admin
      .from('contact_submissions')
      .insert({
        name,
        email,
        phone: phone || null,
        subject,
        message,
        source_page: normalizedSourcePage,
        status: isLikelySpam ? 'spam' : 'new',
        priority: isLikelySpam ? 'low' : 'normal',
        admin_notification_status: 'pending',
        admin_notification_error: null,
        customer_acknowledgement_status: 'pending',
        customer_acknowledgement_error: null,
        last_email_error: null,
        last_notified_at: null,
      })
      .select('id, reference_number')
      .maybeSingle();

    if (error) {
      console.error('[contact] Failed to store submission.');
      return NextResponse.json(
        { error: 'We could not submit your message right now. Please try again later.' },
        { status: 500 }
      );
    }

    const submissionId = (submission as any)?.id as string | undefined;
    const referenceNumber = (submission as any)?.reference_number as string | undefined;

    if (submissionId) {
      await insertContactEvent({
        admin,
        submissionId,
        actorName: 'System',
        actorRole: 'system',
        eventType: 'submitted',
        body: 'Contact enquiry received from public form.',
        metadata: {
          reference_number: referenceNumber || null,
          source_page: normalizedSourcePage,
          phone: phone || null,
          spam_flagged: isLikelySpam,
        },
      }).catch(() => {});
    }

    const adminNotificationResult = await sendTransactionalEmail({
      eventKey: submissionId
        ? `admin_contact_form_received:${submissionId}`
        : `admin_contact_form_received:${Date.now()}:${Math.random().toString(16).slice(2)}`,
      templateKey: 'admin_contact_form_received',
      to: { email: 'no-reply@1smartpocket.com', name: 'System' },
      variables: {
        contact_name: name,
        contact_email: email,
        contact_phone: phone,
        contact_subject: subject,
        contact_message: message,
        reference_number: referenceNumber || '',
        source_page: normalizedSourcePage,
      },
    }).catch((sendError) => {
      console.error('[contact] Failed to send admin notification email.', sendError);
      return {
        success: false,
        providerMessageId: null,
        errorMessage: sendError instanceof Error ? sendError.message : 'admin_notification_failed',
        retryable: true,
        status: 'failed' as const,
      };
    });

    const acknowledgementResult =
      submissionId && referenceNumber
        ? await sendContactAcknowledgementEmail({
            submissionId,
            name,
            email,
            subject,
            message,
            referenceNumber,
          }).catch((sendError) => {
            console.error('[contact] Failed to send acknowledgement email.', sendError);
            return {
              success: false,
              providerMessageId: null,
              errorMessage: sendError instanceof Error ? sendError.message : 'customer_acknowledgement_failed',
              retryable: true,
              status: 'failed' as const,
            };
          })
        : {
            success: false,
            providerMessageId: null,
            errorMessage: submissionId ? 'customer_acknowledgement_unavailable' : 'submission_missing',
            retryable: false,
            status: 'skipped' as const,
          };

    const normalizedAdminResult = normalizeEmailResult(adminNotificationResult);
    const normalizedAcknowledgementResult = normalizeEmailResult(acknowledgementResult);

    if (submissionId) {
      const emailErrors = [
        normalizedAdminResult.error,
        normalizedAcknowledgementResult.error,
      ].filter((value): value is string => Boolean(value));

      await admin
        .from('contact_submissions')
        .update({
          admin_notification_status: normalizedAdminResult.status,
          admin_notification_error: normalizedAdminResult.error,
          customer_acknowledgement_status: normalizedAcknowledgementResult.status,
          customer_acknowledgement_error: normalizedAcknowledgementResult.error,
          last_email_error: emailErrors.length > 0 ? emailErrors.join('; ') : null,
          last_notified_at: normalizedAdminResult.status === 'sent' ? new Date().toISOString() : null,
        })
        .eq('id', submissionId);
    }

    return NextResponse.json(
      {
        success: true,
        referenceNumber: referenceNumber || null,
        message: referenceNumber
          ? `Thanks for contacting Smart Pocket. Your reference number is ${referenceNumber}.`
          : 'Thanks for contacting Smart Pocket. Your enquiry has been received.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[contact] Unexpected error.');
    return NextResponse.json(
      { error: 'We could not submit your message right now. Please try again later.' },
      { status: 500 }
    );
  }
}
