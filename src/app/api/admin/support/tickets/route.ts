import { NextResponse } from 'next/server';
import {
  buildPostgrestOrLikeFilter,
  parseNullableUuid,
  parseTicketCategory,
  parseTicketPriority,
  parseTicketStatus,
  sanitizeSingleLineText,
} from '@/lib/support';
import {
  buildSupportResponse,
  listAdminUsers,
  requireAdminRouteUser,
} from '@/lib/support-server';

export async function GET(request: Request) {
  const adminAuth = await requireAdminRouteUser();
  if (!adminAuth.ok) return adminAuth.response;

  const url = new URL(request.url);
  const search = sanitizeSingleLineText(url.searchParams.get('q'), 120);
  const assigned = sanitizeSingleLineText(url.searchParams.get('assigned'), 64);
  const fromDate = sanitizeSingleLineText(url.searchParams.get('from'), 30);
  const toDate = sanitizeSingleLineText(url.searchParams.get('to'), 30);
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = Math.min(25, Math.max(1, Number(url.searchParams.get('pageSize') || '12')));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminAuth.admin
    .from('support_tickets')
    .select('*', { count: 'exact' })
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
    if (assigned === 'unassigned') {
      query = query.is('assigned_admin_id', null);
    } else if (assigned) {
      query = query.eq('assigned_admin_id', parseNullableUuid(assigned, 'assigned administrator id'));
    }
    if (fromDate) {
      query = query.gte('created_at', `${fromDate}T00:00:00`);
    }
    if (toDate) {
      query = query.lte('created_at', `${toDate}T23:59:59`);
    }
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid ticket filters.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }

  const searchFilter = buildPostgrestOrLikeFilter(
    ['ticket_number', 'user_name_snapshot', 'user_email_snapshot', 'subject'],
    search
  );
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const [listResult, adminUsersResult, metricsResult] = await Promise.all([
    query,
    listAdminUsers(adminAuth.admin),
    adminAuth.admin.rpc('get_support_ticket_metrics'),
  ]);

  if (listResult.error || metricsResult.error) {
    return buildSupportResponse(
      NextResponse.json({ error: listResult.error?.message || metricsResult.error?.message || 'Failed to load tickets.' }, { status: 500 }),
      adminAuth.cookieMutations
    );
  }

  const metricsRow = Array.isArray(metricsResult.data) ? metricsResult.data[0] : null;
  const metrics = {
    totalOpen: Number(metricsRow?.total_open || 0),
    unassigned: Number(metricsRow?.unassigned || 0),
    urgent: Number(metricsRow?.urgent || 0),
    waitingForSupport: Number(metricsRow?.waiting_for_support || 0),
    waitingForCustomer: Number(metricsRow?.waiting_for_customer || 0),
    resolvedToday: Number(metricsRow?.resolved_today || 0),
    averageFirstResponseHours:
      metricsRow?.average_first_response_hours === null || metricsRow?.average_first_response_hours === undefined
        ? null
        : Number(metricsRow.average_first_response_hours),
    averageResolutionHours:
      metricsRow?.average_resolution_hours === null || metricsRow?.average_resolution_hours === undefined
        ? null
        : Number(metricsRow.average_resolution_hours),
  };

  return buildSupportResponse(
    NextResponse.json({
      items: listResult.data || [],
      adminUsers: adminUsersResult,
      metrics,
      pagination: {
        page,
        pageSize,
        total: listResult.count || 0,
        totalPages: Math.max(1, Math.ceil((listResult.count || 0) / pageSize)),
      },
    }),
    adminAuth.cookieMutations
  );
}
