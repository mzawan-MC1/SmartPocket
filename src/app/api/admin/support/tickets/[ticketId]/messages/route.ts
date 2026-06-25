import { NextResponse } from 'next/server';
import {
  assertSupportAttachmentCount,
  assertValidUuid,
  parseSupportMessageKind,
  parseTicketStatus,
  type FinalizedSupportUpload,
} from '@/lib/support';
import { sendSupportTicketAdminReplyEmail } from '@/lib/support-email';
import {
  buildSupportResponse,
  loadUserProfileSnapshot,
  requireAdminRouteUser,
  sanitizeInternalNote,
  sanitizeReplyBody,
} from '@/lib/support-server';

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  const adminAuth = await requireAdminRouteUser();
  if (!adminAuth.ok) return adminAuth.response;

  const { ticketId: ticketIdRaw } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid message payload.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const ticketId = assertValidUuid(ticketIdRaw, 'ticket id');
  let kind: 'reply' | 'internal_note';
  let nextStatus: string | null = null;

  try {
    kind = parseSupportMessageKind(body.kind);
    nextStatus = kind === 'reply'
      ? (body.status ? parseTicketStatus(body.status) : 'waiting_for_customer')
      : null;
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid message payload.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const messageBody = kind === 'internal_note' ? sanitizeInternalNote(body.message) : sanitizeReplyBody(body.message);
  const uploads = kind === 'reply' && Array.isArray(body.uploads) ? (body.uploads as FinalizedSupportUpload[]) : [];

  if (messageBody.length < 2) {
    return buildSupportResponse(
      NextResponse.json({ error: kind === 'reply' ? 'Please enter a reply before sending.' : 'Please enter an internal note.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  try {
    assertSupportAttachmentCount(uploads.length);
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid attachments.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const { data: ticket, error } = await adminAuth.admin
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();

  if (error || !ticket) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Ticket not found.' }, { status: 404 }),
      adminAuth.cookieMutations
    );
  }

  try {
    const adminProfile = await loadUserProfileSnapshot(adminAuth.admin, adminAuth.user.id);
    const uploadIntentIds = uploads.map((upload) =>
      assertValidUuid(upload.uploadIntentId, 'attachment upload intent id')
    );
    const { data: messageRows, error: messageError } = await adminAuth.admin.rpc('add_admin_support_ticket_message', {
      p_ticket_id: ticketId,
      p_admin_user_id: adminAuth.user.id,
      p_admin_name: adminProfile.fullName,
      p_message_body: messageBody,
      p_kind: kind,
      p_status: nextStatus,
      p_upload_intent_ids: uploadIntentIds,
    });

    const messageRow = Array.isArray(messageRows) ? messageRows[0] : null;
    if (messageError || !messageRow?.ticket_number) {
      throw messageError || new Error('Failed to save message.');
    }

    if (kind === 'reply') {
      await sendSupportTicketAdminReplyEmail({
        ticketId,
        ticketNumber: messageRow.ticket_number,
        userId: String(messageRow.user_id || ticket.user_id),
        userName: String(messageRow.user_name_snapshot || ticket.user_name_snapshot),
        userEmail: String(messageRow.user_email_snapshot || ticket.user_email_snapshot),
        subject: String(messageRow.subject || ticket.subject),
        replyMessage: messageBody,
      }).catch((sendError) => {
        console.error('[support] Failed to send admin reply email.', sendError);
      });
    }

    return buildSupportResponse(
      NextResponse.json({ success: true }),
      adminAuth.cookieMutations
    );
  } catch (messageInsertError) {
    const status =
      messageInsertError instanceof Error && 'status' in messageInsertError
        ? Number((messageInsertError as { status?: number }).status) || 400
        : 400;
    return buildSupportResponse(
      NextResponse.json(
        { error: messageInsertError instanceof Error ? messageInsertError.message : 'Failed to save message.' },
        { status }
      ),
      adminAuth.cookieMutations
    );
  }
}
