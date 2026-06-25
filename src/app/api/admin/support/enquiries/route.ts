import { NextResponse } from 'next/server';
import {
  buildPostgrestOrLikeFilter,
  parseContactPriority,
  parseContactStatus,
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
  const page = Math.max(1, Number(url.searchParams.get('page') || '1'));
  const pageSize = Math.min(25, Math.max(1, Number(url.searchParams.get('pageSize') || '12')));
  const fromDate = sanitizeSingleLineText(url.searchParams.get('from'), 30);
  const toDate = sanitizeSingleLineText(url.searchParams.get('to'), 30);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = adminAuth.admin
    .from('contact_submissions')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  try {
    if (url.searchParams.get('status')) {
      query = query.eq('status', parseContactStatus(url.searchParams.get('status')));
    }
    if (url.searchParams.get('priority')) {
      query = query.eq('priority', parseContactPriority(url.searchParams.get('priority')));
    }
  } catch (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid enquiry filters.' }, { status: 400 }),
      adminAuth.cookieMutations
    );
  }
  if (fromDate) {
    query = query.gte('created_at', `${fromDate}T00:00:00`);
  }
  if (toDate) {
    query = query.lte('created_at', `${toDate}T23:59:59`);
  }
  const searchFilter = buildPostgrestOrLikeFilter(
    ['reference_number', 'name', 'email', 'subject', 'message'],
    search
  );
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const [enquiryResult, admins] = await Promise.all([
    query,
    listAdminUsers(adminAuth.admin),
  ]);

  const { data: items, error, count } = enquiryResult;

  if (error) {
    return buildSupportResponse(
      NextResponse.json({ error: error.message || 'Failed to load enquiries.' }, { status: 500 }),
      adminAuth.cookieMutations
    );
  }

  return buildSupportResponse(
    NextResponse.json({
      items: items || [],
      adminUsers: admins || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
    }),
    adminAuth.cookieMutations
  );
}
