import { NextRequest, NextResponse } from 'next/server';
import { getSpaceInvitationPreviewByToken, toInvitationErrorResponse } from '@/lib/spaces-invitations-server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')?.trim() || '';

  if (!token) {
    return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
  }

  try {
    const invitation = await getSpaceInvitationPreviewByToken(token);
    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    }

    return NextResponse.json({ invitation }, { status: 200 });
  } catch (error) {
    const { status, body } = toInvitationErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
