import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  assertValidUuid,
  parseSupportTicketAction,
  SUPPORT_TICKET_REOPEN_WINDOW_DAYS,
  canReopenTicket,
} from '@/lib/support';
import {
  buildSupportResponse,
  insertSupportEvent,
  loadUserProfileSnapshot,
  requireAuthenticatedRouteUser,
} from '@/lib/support-server';
import { sendSupportTicketStatusEmail } from '@/lib/support-email';

export async function GET(_request: Request, context: { params: Promise<{ ticketId: string }> }) {
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
  const ticketId = assertValidUuid(ticketIdRaw, 'ticket id');

  const { data: ticket, error: ticketError } = await admin
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (ticketError || !ticket) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Ticket not found.' }, { status: 404 }),
      auth.cookieMutations
    );
  }

  const [{ data: messages, error: messagesError }, { data: attachments, error: attachmentsError }, { data: events, error: eventsError }] = await Promise.all([
    admin
      .from('support_ticket_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true }),
    admin
      .from('support_ticket_attachments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
    admin
      .from('support_ticket_events')
      .select('*')
      .eq('ticket_id', ticketId)
      .eq('is_internal', false)
      .order('created_at', { ascending: true }),
  ]);

  if (messagesError || attachmentsError || eventsError) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Failed to load ticket details.' }, { status: 500 }),
      auth.cookieMutations
    );
  }

  await admin
    .from('support_tickets')
    .update({ customer_unread_count: 0 })
    .eq('id', ticketId)
    .eq('user_id', auth.user.id);

  const attachmentsByMessage = new Map<string, any[]>();
  for (const attachment of attachments || []) {
    const existing = attachmentsByMessage.get(attachment.message_id) || [];
    existing.push(attachment);
    attachmentsByMessage.set(attachment.message_id, existing);
  }

  return buildSupportResponse(
    NextResponse.json({
      ticket: {
        ...ticket,
        messages: (messages || []).map((message) => ({
          ...message,
          attachments: attachmentsByMessage.get(message.id) || [],
        })),
        events: events || [],
        reopenWindowDays: SUPPORT_TICKET_REOPEN_WINDOW_DAYS,
      },
    }),
    auth.cookieMutations
  );
}

export async function PATCH(request: Request, context: { params: Promise<{ ticketId: string }> }) {
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
      NextResponse.json({ error: 'Invalid ticket update payload.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  const ticketId = assertValidUuid(ticketIdRaw, 'ticket id');
  let action: 'close' | 'reopen';
  try {
    action = parseSupportTicketAction(body.action);
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Unsupported ticket action.' }, { status: 400 }),
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

  const profile = await loadUserProfileSnapshot(admin, auth.user.id);
  const now = new Date().toISOString();

  if (action === 'close') {
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      return buildSupportResponse(
        NextResponse.json({ error: 'Only resolved tickets can be closed.' }, { status: 400 }),
        auth.cookieMutations
      );
    }

    await admin
      .from('support_tickets')
      .update({ status: 'closed', closed_at: now, updated_at: now })
      .eq('id', ticketId);

    await insertSupportEvent({
      admin,
      ticketId,
      actorUserId: auth.user.id,
      actorName: profile.fullName,
      actorRole: 'user',
      eventType: 'ticket_closed',
      description: 'Customer closed the ticket.',
    });

    return buildSupportResponse(
      NextResponse.json({ success: true, status: 'closed' }),
      auth.cookieMutations
    );
  }

  if (action === 'reopen') {
    if (!canReopenTicket(ticket.resolved_at, ticket.closed_at)) {
      return buildSupportResponse(
        NextResponse.json({ error: 'This ticket can no longer be reopened.' }, { status: 400 }),
        auth.cookieMutations
      );
    }

    await admin
      .from('support_tickets')
      .update({
        status: 'waiting_for_support',
        closed_at: null,
        support_unread_count: 1,
        customer_unread_count: 0,
        updated_at: now,
      })
      .eq('id', ticketId);

    await insertSupportEvent({
      admin,
      ticketId,
      actorUserId: auth.user.id,
      actorName: profile.fullName,
      actorRole: 'user',
      eventType: 'ticket_reopened',
      description: 'Customer reopened the ticket.',
    });

    await sendSupportTicketStatusEmail({
      templateKey: 'customer_support_ticket_reopened',
      eventKey: `customer_support_ticket_reopened:${ticketId}:${Date.now()}`,
      ticketId,
      ticketNumber: ticket.ticket_number,
      userId: auth.user.id,
      userName: ticket.user_name_snapshot,
      userEmail: ticket.user_email_snapshot,
      subject: ticket.subject,
    }).catch((sendError) => {
      console.error('[support] Failed to send ticket reopened email.', sendError);
    });

    return buildSupportResponse(
      NextResponse.json({ success: true, status: 'waiting_for_support' }),
      auth.cookieMutations
    );
  }

  return buildSupportResponse(
    NextResponse.json({ error: 'Unsupported ticket action.' }, { status: 400 }),
    auth.cookieMutations
  );
}
