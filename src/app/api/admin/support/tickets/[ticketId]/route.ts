import { NextResponse } from 'next/server';
import {
  assertValidUuid,
  parseNullableUuid,
  parseTicketCategory,
  parseTicketPriority,
  parseTicketStatus,
  toTitleLabel,
} from '@/lib/support';
import { sendSupportTicketStatusEmail } from '@/lib/support-email';
import {
  buildSupportResponse,
  insertSupportEvent,
  listAdminUsers,
  loadUserProfileSnapshot,
  requireAdminRouteUser,
  validateAssignedAdminId,
} from '@/lib/support-server';

export async function GET(_request: Request, context: { params: Promise<{ ticketId: string }> }) {
  const adminAuth = await requireAdminRouteUser();
  if (!adminAuth.ok) return adminAuth.response;

  const { ticketId: ticketIdRaw } = await context.params;
  const ticketId = assertValidUuid(ticketIdRaw, 'ticket id');
  const [{ data: ticket, error: ticketError }, { data: messages, error: messagesError }, { data: attachments, error: attachmentsError }, { data: events, error: eventsError }, admins] = await Promise.all([
    adminAuth.admin.from('support_tickets').select('*').eq('id', ticketId).maybeSingle(),
    adminAuth.admin.from('support_ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }).limit(200),
    adminAuth.admin.from('support_ticket_attachments').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }).limit(200),
    adminAuth.admin.from('support_ticket_events').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true }).limit(200),
    listAdminUsers(adminAuth.admin),
  ]);

  if (ticketError || !ticket || messagesError || attachmentsError || eventsError) {
    return buildSupportResponse(
      NextResponse.json({ error: ticketError?.message || messagesError?.message || attachmentsError?.message || eventsError?.message || 'Failed to load ticket.' }, { status: 404 }),
      adminAuth.cookieMutations
    );
  }

  await adminAuth.admin
    .from('support_tickets')
    .update({ support_unread_count: 0 })
    .eq('id', ticketId);

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
      },
      adminUsers: admins,
    }),
    adminAuth.cookieMutations
  );
}

export async function PATCH(request: Request, context: { params: Promise<{ ticketId: string }> }) {
  const adminAuth = await requireAdminRouteUser();
  if (!adminAuth.ok) return adminAuth.response;

  const { ticketId: ticketIdRaw } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid ticket update payload.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const ticketId = assertValidUuid(ticketIdRaw, 'ticket id');
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

  const adminProfile = await loadUserProfileSnapshot(adminAuth.admin, adminAuth.user.id);
  let nextStatus = ticket.status;
  let nextCategory = ticket.category;
  let nextPriority = ticket.priority;
  let nextAssignedAdminId = ticket.assigned_admin_id || null;
  const hasStatusUpdate = Object.prototype.hasOwnProperty.call(body, 'status');
  const hasCategoryUpdate = Object.prototype.hasOwnProperty.call(body, 'category');
  const hasPriorityUpdate = Object.prototype.hasOwnProperty.call(body, 'priority');
  const hasAssignmentUpdate = Object.prototype.hasOwnProperty.call(body, 'assignedAdminId');

  try {
    if (hasStatusUpdate) {
      nextStatus = parseTicketStatus(body.status);
    }
    if (hasCategoryUpdate) {
      nextCategory = parseTicketCategory(body.category);
    }
    if (hasPriorityUpdate) {
      nextPriority = parseTicketPriority(body.priority);
    }
    if (hasAssignmentUpdate) {
      nextAssignedAdminId = parseNullableUuid(body.assignedAdminId, 'assigned administrator id');
      await validateAssignedAdminId({
        admin: adminAuth.admin,
        assignedAdminId: nextAssignedAdminId,
      });
    }
  } catch (parseError) {
    return buildSupportResponse(
      NextResponse.json({ error: parseError instanceof Error ? parseError.message : 'Invalid ticket update.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  if (!hasStatusUpdate && !hasCategoryUpdate && !hasPriorityUpdate && !hasAssignmentUpdate) {
    return buildSupportResponse(
      NextResponse.json({ error: 'No ticket changes were provided.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {};
  if (hasStatusUpdate && ticket.status !== nextStatus) {
    updates.status = nextStatus;
    updates.resolved_at = nextStatus === 'resolved' ? (ticket.resolved_at || now) : null;
    updates.closed_at = nextStatus === 'closed' ? (ticket.closed_at || now) : null;
  }
  if (hasCategoryUpdate && ticket.category !== nextCategory) {
    updates.category = nextCategory;
  }
  if (hasPriorityUpdate && ticket.priority !== nextPriority) {
    updates.priority = nextPriority;
  }
  if (hasAssignmentUpdate && (ticket.assigned_admin_id || null) !== nextAssignedAdminId) {
    updates.assigned_admin_id = nextAssignedAdminId;
  }

  if (Object.keys(updates).length === 0) {
    return buildSupportResponse(
      NextResponse.json({ success: true }),
      adminAuth.cookieMutations
    );
  }

  const { error: updateError } = await adminAuth.admin
    .from('support_tickets')
    .update(updates)
    .eq('id', ticketId);

  if (updateError) {
    return buildSupportResponse(
      NextResponse.json({ error: updateError.message || 'Failed to update ticket.' }, { status: 500 }),
      adminAuth.cookieMutations
    );
  }

  if (hasStatusUpdate && ticket.status !== nextStatus) {
    await insertSupportEvent({
      admin: adminAuth.admin,
      ticketId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'status_changed',
      description: `Status changed from ${toTitleLabel(ticket.status)} to ${toTitleLabel(nextStatus)}.`,
      metadata: { from: ticket.status, to: nextStatus },
    });
  }

  if (hasCategoryUpdate && ticket.category !== nextCategory) {
    await insertSupportEvent({
      admin: adminAuth.admin,
      ticketId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'category_changed',
      description: `Category changed from ${toTitleLabel(ticket.category)} to ${toTitleLabel(nextCategory)}.`,
      metadata: { from: ticket.category, to: nextCategory },
    });
  }

  if (hasPriorityUpdate && ticket.priority !== nextPriority) {
    await insertSupportEvent({
      admin: adminAuth.admin,
      ticketId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'priority_changed',
      description: `Priority changed from ${toTitleLabel(ticket.priority)} to ${toTitleLabel(nextPriority)}.`,
      metadata: { from: ticket.priority, to: nextPriority },
    });
  }

  if (hasAssignmentUpdate && (ticket.assigned_admin_id || null) !== nextAssignedAdminId) {
    await insertSupportEvent({
      admin: adminAuth.admin,
      ticketId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'assignment_changed',
      description: nextAssignedAdminId ? 'Ticket assignment updated.' : 'Ticket unassigned.',
      metadata: { assigned_admin_id: nextAssignedAdminId },
    });
  }

  if (hasStatusUpdate && ticket.status !== nextStatus && ['waiting_for_customer', 'in_progress', 'resolved', 'closed'].includes(nextStatus)) {
    const templateKey = nextStatus === 'resolved'
      ? 'customer_support_ticket_resolved'
      : 'customer_support_ticket_status_changed';

    await sendSupportTicketStatusEmail({
      templateKey: templateKey as 'customer_support_ticket_status_changed' | 'customer_support_ticket_resolved',
      eventKey: `${templateKey}:${ticketId}:${Date.now()}`,
      ticketId,
      ticketNumber: ticket.ticket_number,
      userId: ticket.user_id,
      userName: ticket.user_name_snapshot,
      userEmail: ticket.user_email_snapshot,
      subject: ticket.subject,
      status: nextStatus,
    }).catch((sendError) => {
      console.error('[support] Failed to send ticket status email.', sendError);
    });
  }

  return buildSupportResponse(
    NextResponse.json({ success: true }),
    adminAuth.cookieMutations
  );
}
