import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  assertSupportAttachmentCount,
  assertValidUuid,
  canReopenTicket,
  sanitizeMultilineText,
  type FinalizedSupportUpload,
} from '@/lib/support';
import {
  buildSupportResponse,
  loadUserProfileSnapshot,
  requireAuthenticatedRouteUser,
} from '@/lib/support-server';
import { sendSupportTicketCustomerReplyEmail } from '@/lib/support-email';

export async function POST(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  const auth = await requireAuthenticatedRouteUser();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  if (!admin) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
      auth.cookieMutations
    );
  }

  const { ticketId: ticketIdRaw } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid reply payload.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  const ticketId = assertValidUuid(ticketIdRaw, 'ticket id');
  const replyBody = sanitizeMultilineText(body.message, 6000);
  const uploads = Array.isArray(body.uploads) ? (body.uploads as FinalizedSupportUpload[]) : [];

  if (replyBody.length < 2) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Please enter a reply before sending.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  try {
    assertSupportAttachmentCount(uploads.length);
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid attachments.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  const { data: ticket, error } = await admin
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (error || !ticket) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Ticket not found.' }, { status: 404 }),
      auth.cookieMutations
    );
  }

  if ((ticket.status === 'resolved' || ticket.status === 'closed') && !canReopenTicket(ticket.resolved_at, ticket.closed_at)) {
    return buildSupportResponse(
      NextResponse.json({ error: 'This ticket is closed and can no longer receive replies.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  try {
    const profile = await loadUserProfileSnapshot(admin, auth.user.id);
    const uploadIntentIds = uploads.map((upload) =>
      assertValidUuid(upload.uploadIntentId, 'attachment upload intent id')
    );
    const { data: replyRows, error: replyError } = await admin.rpc('add_support_ticket_message', {
      p_ticket_id: ticketId,
      p_user_id: auth.user.id,
      p_sender_name: profile.fullName,
      p_message_body: replyBody,
      p_upload_intent_ids: uploadIntentIds,
    });

    const replyRow = Array.isArray(replyRows) ? replyRows[0] : null;
    if (replyError || !replyRow?.ticket_number) {
      throw replyError || new Error('Failed to save reply.');
    }

    await sendSupportTicketCustomerReplyEmail({
      ticketId,
      ticketNumber: replyRow.ticket_number,
      userId: auth.user.id,
      userName: String(replyRow.user_name_snapshot || ticket.user_name_snapshot || profile.fullName),
      userEmail: String(replyRow.user_email_snapshot || ticket.user_email_snapshot || profile.email),
      subject: String(replyRow.subject || ticket.subject || ''),
      replyMessage: replyBody,
    }).catch((sendError) => {
      console.error('[support] Failed to send customer-reply notification.', sendError);
    });

    return buildSupportResponse(
      NextResponse.json({ success: true }),
      auth.cookieMutations
    );
  } catch (replyError) {
    const status =
      replyError instanceof Error && 'status' in replyError
        ? Number((replyError as { status?: number }).status) || 400
        : 400;
    return buildSupportResponse(
      NextResponse.json(
        { error: replyError instanceof Error ? replyError.message : 'Failed to send reply.' },
        { status }
      ),
      auth.cookieMutations
    );
  }
}
