import { NextResponse } from 'next/server';
import {
  assertValidUuid,
  parseContactPriority,
  parseContactStatus,
  parseNullableUuid,
} from '@/lib/support';
import { sendContactResolvedEmail } from '@/lib/support-email';
import {
  sanitizeInternalNote,
  buildSupportResponse,
  insertContactEvent,
  listAdminUsers,
  loadUserProfileSnapshot,
  requireAdminRouteUser,
  validateAssignedAdminId,
} from '@/lib/support-server';

export async function GET(_request: Request, context: { params: Promise<{ enquiryId: string }> }) {
  const adminAuth = await requireAdminRouteUser();
  if (!adminAuth.ok) return adminAuth.response;

  const { enquiryId: enquiryIdRaw } = await context.params;
  const enquiryId = assertValidUuid(enquiryIdRaw, 'enquiry id');
  const [{ data: enquiry, error: enquiryError }, { data: events, error: eventsError }, admins] = await Promise.all([
    adminAuth.admin.from('contact_submissions').select('*').eq('id', enquiryId).maybeSingle(),
    adminAuth.admin.from('contact_submission_events').select('*').eq('submission_id', enquiryId).order('created_at', { ascending: true }),
    listAdminUsers(adminAuth.admin),
  ]);

  if (enquiryError || !enquiry || eventsError) {
    return buildSupportResponse(
      NextResponse.json({ error: enquiryError?.message || eventsError?.message || 'Failed to load enquiry.' }, { status: 404 }),
      adminAuth.cookieMutations
    );
  }

  return buildSupportResponse(
    NextResponse.json({ enquiry, events: events || [], adminUsers: admins || [] }),
    adminAuth.cookieMutations
  );
}

export async function PATCH(request: Request, context: { params: Promise<{ enquiryId: string }> }) {
  const adminAuth = await requireAdminRouteUser();
  if (!adminAuth.ok) return adminAuth.response;

  const { enquiryId: enquiryIdRaw } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid enquiry update payload.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const enquiryId = assertValidUuid(enquiryIdRaw, 'enquiry id');
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
  let nextStatus = enquiry.status;
  let nextPriority = enquiry.priority;
  let assignedAdminId = enquiry.assigned_admin_id || null;
  try {
    if (Object.prototype.hasOwnProperty.call(body, 'status')) {
      nextStatus = parseContactStatus(body.status);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'priority')) {
      nextPriority = parseContactPriority(body.priority);
    }
    if (Object.prototype.hasOwnProperty.call(body, 'assignedAdminId')) {
      assignedAdminId = parseNullableUuid(body.assignedAdminId, 'assigned administrator id');
      await validateAssignedAdminId({
        admin: adminAuth.admin,
        assignedAdminId,
      });
    }
  } catch (parseError) {
    return buildSupportResponse(
      NextResponse.json({ error: parseError instanceof Error ? parseError.message : 'Invalid enquiry update.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }
  const internalNote = sanitizeInternalNote(body.internalNote);
  const now = new Date().toISOString();

  const appendedNotes = internalNote
    ? `${enquiry.internal_notes ? `${enquiry.internal_notes}\n\n` : ''}[${new Date().toLocaleString()}] ${adminProfile.fullName}: ${internalNote}`
    : enquiry.internal_notes;

  const updates: Record<string, unknown> = {
    status: nextStatus,
    priority: nextPriority,
    assigned_admin_id: assignedAdminId,
    internal_notes: appendedNotes || null,
    updated_by: adminAuth.user.id,
  };

  if (nextStatus === 'resolved' && !enquiry.resolved_at) {
    updates.resolved_at = now;
  }
  if (nextStatus !== 'resolved' && nextStatus !== 'closed' && enquiry.resolved_at) {
    updates.resolved_at = null;
  }

  const { error: updateError } = await adminAuth.admin
    .from('contact_submissions')
    .update(updates)
    .eq('id', enquiryId);

  if (updateError) {
    return buildSupportResponse(
      NextResponse.json({ error: updateError.message || 'Failed to update enquiry.' }, { status: 500 }),
      adminAuth.cookieMutations
    );
  }

  if (enquiry.status !== nextStatus) {
    await insertContactEvent({
      admin: adminAuth.admin,
      submissionId: enquiryId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'status_changed',
      body: `Status changed from ${enquiry.status} to ${nextStatus}.`,
      metadata: { from: enquiry.status, to: nextStatus },
    });
  }

  if (enquiry.priority !== nextPriority) {
    await insertContactEvent({
      admin: adminAuth.admin,
      submissionId: enquiryId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'priority_changed',
      body: `Priority changed from ${enquiry.priority} to ${nextPriority}.`,
      metadata: { from: enquiry.priority, to: nextPriority },
    });
  }

  if ((enquiry.assigned_admin_id || null) !== assignedAdminId) {
    await insertContactEvent({
      admin: adminAuth.admin,
      submissionId: enquiryId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'assignment_changed',
      body: assignedAdminId ? 'Enquiry assigned to an administrator.' : 'Enquiry assignment cleared.',
      metadata: { assigned_admin_id: assignedAdminId },
    });
  }

  if (internalNote) {
    await insertContactEvent({
      admin: adminAuth.admin,
      submissionId: enquiryId,
      actorUserId: adminAuth.user.id,
      actorName: adminProfile.fullName,
      actorRole: 'admin',
      eventType: 'internal_note',
      body: internalNote,
      isInternal: true,
    });
  }

  if (nextStatus === 'resolved' && enquiry.status !== 'resolved') {
    await sendContactResolvedEmail({
      submissionId: enquiryId,
      name: enquiry.name,
      email: enquiry.email,
      subject: enquiry.subject,
      referenceNumber: enquiry.reference_number,
    }).catch((sendError) => {
      console.error('[support] Failed to send contact resolved email.', sendError);
    });
  }

  return buildSupportResponse(
    NextResponse.json({ success: true }),
    adminAuth.cookieMutations
  );
}
