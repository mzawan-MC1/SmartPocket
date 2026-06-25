import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  assertSupportAttachmentCount,
  assertValidUuid,
  buildSupportAttachmentStoragePath,
  createClientId,
  parseSupportUploadIntentInput,
} from '@/lib/support';
import {
  buildSupportResponse,
  cleanupSupportAttachmentArtifacts,
  isAuthoritativeAdminUser,
  requireAuthenticatedRouteUser,
} from '@/lib/support-server';

type UploadIntentRequestBody = {
  ticketId?: unknown;
  context?: unknown;
  files?: unknown;
};

type SupportUploadContext = 'new_ticket' | 'customer_reply' | 'admin_reply';

function parseUploadContext(value: unknown): SupportUploadContext {
  if (value === 'new_ticket' || value === 'customer_reply' || value === 'admin_reply') {
    return value;
  }

  throw new Error('Invalid upload context.');
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

  await cleanupSupportAttachmentArtifacts(admin);

  let body: UploadIntentRequestBody = {};
  try {
    body = (await request.json()) as UploadIntentRequestBody;
  } catch {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid attachment upload request.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  try {
    const ticketId = assertValidUuid(body.ticketId, 'ticket id');
    const context = parseUploadContext(body.context);
    const files = Array.isArray(body.files) ? body.files.map((file) => parseSupportUploadIntentInput(file)) : [];
    assertSupportAttachmentCount(files.length);

    const isAdmin = await isAuthoritativeAdminUser({
      admin,
      userId: auth.user.id,
    }).catch(() => false);

    const { data: existingTicket, error: ticketError } = await admin
      .from('support_tickets')
      .select('id, user_id')
      .eq('id', ticketId)
      .maybeSingle();

    if (ticketError) {
      throw ticketError;
    }

    let ticketOwnerUserId = auth.user.id;

    if (context === 'new_ticket') {
      if (existingTicket) {
        return buildSupportResponse(
          NextResponse.json({ error: 'New ticket attachment uploads require a proposed ticket ID that is not already in use.' }, { status: 400 }),
          auth.cookieMutations
        );
      }
      ticketOwnerUserId = auth.user.id;
    } else if (context === 'customer_reply') {
      if (!existingTicket) {
        return buildSupportResponse(
          NextResponse.json({ error: 'Customer reply attachment uploads require an existing ticket.' }, { status: 400 }),
          auth.cookieMutations
        );
      }

      if (existingTicket.user_id !== auth.user.id) {
        return buildSupportResponse(
          NextResponse.json({ error: 'Ticket not found.' }, { status: 404 }),
          auth.cookieMutations
        );
      }

      ticketOwnerUserId = auth.user.id;
    } else {
      if (!isAdmin) {
        return buildSupportResponse(
          NextResponse.json({ error: 'Admin reply attachment uploads require administrator access.' }, { status: 403 }),
          auth.cookieMutations
        );
      }

      if (!existingTicket) {
        return buildSupportResponse(
          NextResponse.json({ error: 'Admin reply attachment uploads require an existing ticket.' }, { status: 400 }),
          auth.cookieMutations
        );
      }

      ticketOwnerUserId = existingTicket.user_id;
    }

    const payload = files.map((file) => ({
      upload_token: createClientId(),
      proposed_ticket_id: ticketId,
      ticket_owner_user_id: ticketOwnerUserId,
      requested_by_user_id: auth.user.id,
      original_file_name: file.fileName,
      extension: file.extension,
      mime_type: file.mimeType,
      file_size_bytes: file.size,
      storage_bucket: 'support-attachments',
      storage_path: buildSupportAttachmentStoragePath({
        ownerUserId: ticketOwnerUserId,
        ticketId,
        extension: file.extension,
      }),
      status: 'pending',
    }));

    const { data: insertedIntents, error: insertError } = await admin
      .from('support_attachment_upload_intents')
      .insert(payload)
      .select('id, upload_token, original_file_name, mime_type, file_size_bytes, extension');

    if (insertError || !insertedIntents) {
      throw insertError || new Error('Failed to prepare attachment upload.');
    }

    return buildSupportResponse(
      NextResponse.json({
        items: insertedIntents.map((intent) => ({
          intentId: intent.id,
          uploadToken: intent.upload_token,
          fileName: intent.original_file_name,
          type: intent.mime_type,
          size: intent.file_size_bytes,
          extension: intent.extension,
        })),
      }),
      auth.cookieMutations
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to prepare attachment upload.';
    return buildSupportResponse(
      NextResponse.json({ error: message }, { status: 400 }),
      auth.cookieMutations
    );
  }
}
