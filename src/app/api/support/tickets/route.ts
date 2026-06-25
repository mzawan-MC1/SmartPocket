import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  assertSupportAttachmentCount,
  assertValidUuid,
  buildPostgrestOrLikeFilter,
  type FinalizedSupportUpload,
  parseTicketCategory,
  parseTicketPriority,
  parseTicketStatus,
  sanitizeMultilineText,
  sanitizeSingleLineText,
} from '@/lib/support';
import {
  buildSupportResponse,
  loadUserProfileSnapshot,
  requireAuthenticatedRouteUser,
} from '@/lib/support-server';
import { sendSupportTicketCreatedEmails } from '@/lib/support-email';

export async function GET(request: Request) {
  const auth = await requireAuthenticatedRouteUser();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  if (!admin) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
      auth.cookieMutations
    );
  }

  const url = new URL(request.url);
  const search = sanitizeSingleLineText(url.searchParams.get('q'), 120);
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = Math.min(20, Math.max(1, Number(url.searchParams.get('pageSize') || '10')));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin
    .from('support_tickets')
    .select(
      'id, ticket_number, subject, category, priority, status, assigned_admin_id, created_at, updated_at, first_response_at, resolved_at, closed_at, support_unread_count, customer_unread_count',
      { count: 'exact' }
    )
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .range(from, to);

  try {
    if (url.searchParams.get('status')) {
      query = query.eq('status', parseTicketStatus(url.searchParams.get('status')));
    }
    if (url.searchParams.get('category')) {
      query = query.eq('category', parseTicketCategory(url.searchParams.get('category')));
    }
    if (url.searchParams.get('priority')) {
      query = query.eq('priority', parseTicketPriority(url.searchParams.get('priority')));
    }
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid ticket filters.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  const searchFilter = buildPostgrestOrLikeFilter(['ticket_number', 'subject'], search);
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error, count } = await query;
  if (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error.message || 'Failed to load tickets.' }, { status: 500 }),
      auth.cookieMutations
    );
  }

  return buildSupportResponse(
    NextResponse.json({
      items: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
    }),
    auth.cookieMutations
  );
}

export async function POST(request: Request) {
  const auth = await requireAuthenticatedRouteUser();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  if (!admin) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
      auth.cookieMutations
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid ticket payload.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  const subject = sanitizeSingleLineText(body.subject, 160);
  const message = sanitizeMultilineText(body.message, 6000);
  const relatedPath = sanitizeSingleLineText(body.relatedPath, 240) || null;
  const errorCode = sanitizeSingleLineText(body.errorCode, 120) || null;
  const uploads = Array.isArray(body.uploads) ? (body.uploads as FinalizedSupportUpload[]) : [];

  if (!subject || message.length < 10) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Please add a subject and a detailed support message.' }, { status: 400 }),
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

  try {
    const ticketId = assertValidUuid(body.ticketId, 'ticket id');
    const category = parseTicketCategory(body.category);
    const priority = parseTicketPriority(body.priority);
    const uploadIntentIds = uploads.map((upload) =>
      assertValidUuid(upload.uploadIntentId, 'attachment upload intent id')
    );
    const profile = await loadUserProfileSnapshot(admin, auth.user.id);
    const { data: createdRows, error: rpcError } = await admin.rpc('create_support_ticket', {
      p_ticket_id: ticketId,
      p_user_id: auth.user.id,
      p_user_name_snapshot: profile.fullName,
      p_user_email_snapshot: profile.email,
      p_subject: subject,
      p_category: category,
      p_priority: priority,
      p_message_body: message,
      p_related_path: relatedPath,
      p_error_code: errorCode,
      p_upload_intent_ids: uploadIntentIds,
    });

    const createdRow = Array.isArray(createdRows) ? createdRows[0] : null;
    if (rpcError || !createdRow?.ticket_id || !createdRow?.ticket_number) {
      throw rpcError || new Error('Failed to create support ticket.');
    }

    await sendSupportTicketCreatedEmails({
      ticketId: createdRow.ticket_id,
      ticketNumber: createdRow.ticket_number,
      userId: auth.user.id,
      userName: profile.fullName,
      userEmail: profile.email,
      subject,
      priority,
      messageBody: message,
    }).catch((error) => {
      console.error('[support] Failed to send ticket-created emails.', error);
    });

    return buildSupportResponse(
      NextResponse.json({
        success: true,
        ticketId: createdRow.ticket_id,
        ticketNumber: createdRow.ticket_number,
        message: `Your support ticket ${createdRow.ticket_number} has been created.`,
      }),
      auth.cookieMutations
    );
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to create ticket.' },
        { status: error instanceof Error && 'status' in error ? Number((error as { status?: number }).status) || 400 : 400 }
      ),
      auth.cookieMutations
    );
  }
}
