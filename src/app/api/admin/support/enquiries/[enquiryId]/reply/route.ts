import { NextResponse } from 'next/server';
import { assertValidUuid, parseContactStatus } from '@/lib/support';
import { sendContactReplyEmail } from '@/lib/support-email';
import {
  sanitizeReplyBody,
  buildSupportResponse,
  insertContactEvent,
  loadUserProfileSnapshot,
  requireAdminRouteUser,
} from '@/lib/support-server';

export async function POST(request: Request, context: { params: Promise<{ enquiryId: string }> }) {
  const adminAuth = await requireAdminRouteUser();
  if (!adminAuth.ok) return adminAuth.response;

  const { enquiryId: enquiryIdRaw } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid reply payload.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const enquiryId = assertValidUuid(enquiryIdRaw, 'enquiry id');
  const replyBody = sanitizeReplyBody(body.message);
  let nextStatus = 'waiting_for_customer';
  try {
    nextStatus = body.status ? parseContactStatus(body.status) : 'waiting_for_customer';
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid reply payload.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  if (replyBody.length < 2) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Please enter a reply before sending.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const { data: enquiry, error } = await adminAuth.admin
    .from('contact_submissions')
    .select('*')
    .eq('id', enquiryId)
    .maybeSingle();

  if (error || !enquiry) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 }),
      adminAuth.cookieMutations
    );
  }

  const adminProfile = await loadUserProfileSnapshot(adminAuth.admin, adminAuth.user.id);
  const now = new Date().toISOString();

  const { error: updateError } = await adminAuth.admin
    .from('contact_submissions')
    .update({
      status: nextStatus,
      first_response_at: enquiry.first_response_at || now,
      updated_by: adminAuth.user.id,
    })
    .eq('id', enquiryId);

  if (updateError) {
    return buildSupportResponse(
      NextResponse.json({ error: updateError.message || 'Failed to send reply.' }, { status: 500 }),
      adminAuth.cookieMutations
    );
  }

  await insertContactEvent({
    admin: adminAuth.admin,
    submissionId: enquiryId,
    actorUserId: adminAuth.user.id,
    actorName: adminProfile.fullName,
    actorRole: 'admin',
    eventType: 'admin_reply',
    body: replyBody,
    metadata: {
      status_after_reply: nextStatus,
    },
  });

  if (!enquiry.first_response_at) {
    await insertContactEvent({
      admin: adminAuth.admin,
      submissionId: enquiryId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'first_response_recorded',
      body: 'First response sent to customer.',
    });
  }

  await sendContactReplyEmail({
    submissionId: enquiryId,
    name: enquiry.name,
    email: enquiry.email,
    subject: enquiry.subject,
    referenceNumber: enquiry.reference_number,
    replyMessage: replyBody,
  }).catch((sendError) => {
    console.error('[support] Failed to send contact reply email.', sendError);
  });

  return buildSupportResponse(
    NextResponse.json({ success: true }),
    adminAuth.cookieMutations
  );
}
