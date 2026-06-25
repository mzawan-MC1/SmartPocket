import { NextResponse } from 'next/server';
import {
  assertValidUuid,
  parseNullableUuid,
  parseSupportBulkAction,
  parseTicketStatus,
  validateBulkSupportStatusTransition,
} from '@/lib/support';
import {
  buildSupportResponse,
  insertSupportEvent,
  loadUserProfileSnapshot,
  requireAdminRouteUser,
  validateAssignedAdminId,
} from '@/lib/support-server';

export async function POST(request: Request) {
  const adminAuth = await requireAdminRouteUser();
  if (!adminAuth.ok) return adminAuth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid bulk update payload.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  let ticketIds: string[] = [];
  let action: 'assign' | 'status';
  try {
    ticketIds = Array.isArray(body.ticketIds)
      ? Array.from(new Set(body.ticketIds.map((value) => assertValidUuid(value, 'ticket id'))))
      : [];
    action = parseSupportBulkAction(body.action);
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid bulk update payload.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  if (ticketIds.length === 0) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Select at least one ticket.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const adminProfile = await loadUserProfileSnapshot(adminAuth.admin, adminAuth.user.id);
  const { data: tickets, error: ticketsError } = await adminAuth.admin
    .from('support_tickets')
    .select('id, status, assigned_admin_id, resolved_at, closed_at')
    .in('id', ticketIds);

  if (ticketsError) {
    return buildSupportResponse(
      NextResponse.json({ error: ticketsError.message || 'Failed to load selected tickets.' }, { status: 500 }),
      adminAuth.cookieMutations
    );
  }

  const ticketMap = new Map((tickets || []).map((ticket) => [ticket.id, ticket]));
  const results: Array<{
    ticketId: string;
    success: boolean;
    error: string | null;
    changed: boolean;
  }> = [];

  if (action === 'assign') {
    let assignedAdminId: string | null;
    try {
      assignedAdminId = parseNullableUuid(body.assignedAdminId, 'assigned administrator id');
      await validateAssignedAdminId({
        admin: adminAuth.admin,
        assignedAdminId,
      });
    } catch (error) {
      return buildSupportResponse(
        NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid assignment.' }, { status: 400 }),
        adminAuth.cookieMutations
      );
    }

    for (const ticketId of ticketIds) {
      const ticket = ticketMap.get(ticketId);
      if (!ticket) {
        results.push({ ticketId, success: false, error: 'Ticket not found.', changed: false });
        continue;
      }

      const changed = (ticket.assigned_admin_id || null) !== assignedAdminId;
      const { error: updateError } = await adminAuth.admin
        .from('support_tickets')
        .update({ assigned_admin_id: assignedAdminId })
        .eq('id', ticketId);

      if (updateError) {
        results.push({ ticketId, success: false, error: updateError.message || 'Failed to update assignment.', changed: false });
        continue;
      }

      await insertSupportEvent({
        admin: adminAuth.admin,
        ticketId,
        actorUserId: adminAuth.user.id,
        actorName: adminProfile.fullName,
        actorRole: 'admin',
        eventType: 'assignment_changed',
        description: assignedAdminId ? 'Ticket assignment updated in bulk.' : 'Ticket assignment cleared in bulk.',
        metadata: {
          assigned_admin_id: assignedAdminId,
          changed,
        },
      });

      results.push({ ticketId, success: true, error: null, changed });
    }

    return buildSupportResponse(
      NextResponse.json({
        success: results.some((result) => result.success),
        results,
      }),
      adminAuth.cookieMutations
    );
  }

  let statusTarget: ReturnType<typeof parseTicketStatus>;
  try {
    statusTarget = parseTicketStatus(body.status);
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid bulk status.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  for (const ticketId of ticketIds) {
    const ticket = ticketMap.get(ticketId);
    if (!ticket) {
      results.push({ ticketId, success: false, error: 'Ticket not found.', changed: false });
      continue;
    }

    try {
      validateBulkSupportStatusTransition({
        currentStatus: ticket.status,
        nextStatus: statusTarget,
      });
    } catch (error) {
      results.push({
        ticketId,
        success: false,
        error: error instanceof Error ? error.message : 'Invalid bulk status transition.',
        changed: false,
      });
      continue;
    }

    const changed = ticket.status !== statusTarget;
    const updates: Record<string, unknown> = {
      status: statusTarget,
    };
    if (statusTarget === 'resolved') {
      updates.resolved_at = ticket.resolved_at || new Date().toISOString();
      updates.closed_at = null;
    }

    const { error: updateError } = await adminAuth.admin
      .from('support_tickets')
      .update(updates)
      .eq('id', ticketId);

    if (updateError) {
      results.push({ ticketId, success: false, error: updateError.message || 'Failed to update status.', changed: false });
      continue;
    }

    await insertSupportEvent({
      admin: adminAuth.admin,
      ticketId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'status_changed',
      description: changed
        ? `Ticket status changed in bulk update to ${statusTarget}.`
        : `Bulk status action confirmed ${statusTarget}.`,
      metadata: { from: ticket.status, to: statusTarget, changed },
    });

    results.push({ ticketId, success: true, error: null, changed });
  }

  return buildSupportResponse(
    NextResponse.json({
      success: results.some((result) => result.success),
      results,
    }),
    adminAuth.cookieMutations
  );
}
