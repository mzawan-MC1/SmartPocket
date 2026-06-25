import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertValidUuid } from '@/lib/support';
import {
  buildSupportResponse,
  createSignedSupportAttachmentUrl,
  deleteSupportStorageObject,
  insertSupportEvent,
  isAuthoritativeAdminUser,
  loadUserProfileSnapshot,
  requireAuthenticatedRouteUser,
} from '@/lib/support-server';

export async function GET(_request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  const auth = await requireAuthenticatedRouteUser();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  if (!admin) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
      auth.cookieMutations
    );
  }

  const { attachmentId: attachmentIdRaw } = await context.params;
  const attachmentId = assertValidUuid(attachmentIdRaw, 'attachment id');
  const { data: attachment, error } = await admin
    .from('support_ticket_attachments')
    .select(`
      id,
      ticket_id,
      storage_bucket,
      storage_path,
      file_name,
      mime_type,
      file_size_bytes,
      message_id,
      support_tickets!inner (
        id,
        user_id
      )
    `)
    .eq('id', attachmentId)
    .maybeSingle();

  if (error || !attachment) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Attachment not found.' }, { status: 404 }),
      auth.cookieMutations
    );
  }

  const ticketOwnerId =
    attachment &&
    typeof attachment === 'object' &&
    attachment.support_tickets &&
    typeof attachment.support_tickets === 'object' &&
    'user_id' in attachment.support_tickets &&
    typeof attachment.support_tickets.user_id === 'string'
      ? attachment.support_tickets.user_id
      : null;
  const isAdmin = await isAuthoritativeAdminUser({
    admin,
    userId: auth.user.id,
  }).catch(() => false);

  if (!isAdmin && ticketOwnerId !== auth.user.id) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      auth.cookieMutations
    );
  }

  try {
    const signedUrl = await createSignedSupportAttachmentUrl({
      admin,
      path: attachment.storage_path,
    });

    return buildSupportResponse(
      NextResponse.json({
        signedUrl,
        fileName: attachment.file_name,
        mimeType: attachment.mime_type,
        fileSizeBytes: attachment.file_size_bytes,
      }),
      auth.cookieMutations
    );
  } catch (signedUrlError: any) {
    return buildSupportResponse(
      NextResponse.json({ error: signedUrlError?.message || 'Failed to create signed URL.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ attachmentId: string }> }) {
  const auth = await requireAuthenticatedRouteUser();
  if (!auth.ok) return auth.response;

  const admin = createAdminClient();
  if (!admin) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
      auth.cookieMutations
    );
  }

  const { attachmentId: attachmentIdRaw } = await context.params;
  const attachmentId = assertValidUuid(attachmentIdRaw, 'attachment id');
  const { data: attachment, error } = await admin
    .from('support_ticket_attachments')
    .select(`
      id,
      ticket_id,
      message_id,
      upload_intent_id,
      uploaded_by_user_id,
      storage_path,
      file_name,
      support_tickets!inner (
        id,
        user_id
      ),
      support_ticket_messages (
        sender_user_id,
        sender_role
      )
    `)
    .eq('id', attachmentId)
    .maybeSingle();

  if (error || !attachment) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Attachment not found.' }, { status: 404 }),
      auth.cookieMutations
    );
  }

  const ticketOwnerId =
    attachment.support_tickets &&
    typeof attachment.support_tickets === 'object' &&
    'user_id' in attachment.support_tickets &&
    typeof attachment.support_tickets.user_id === 'string'
      ? attachment.support_tickets.user_id
      : null;
  const messageMeta =
    Array.isArray(attachment.support_ticket_messages) && attachment.support_ticket_messages.length > 0
      ? attachment.support_ticket_messages[0]
      : null;
  const messageSenderId =
    messageMeta && typeof messageMeta.sender_user_id === 'string' ? messageMeta.sender_user_id : null;
  const messageSenderRole =
    messageMeta && typeof messageMeta.sender_role === 'string' ? messageMeta.sender_role : null;
  const isAdmin = await isAuthoritativeAdminUser({
    admin,
    userId: auth.user.id,
  }).catch(() => false);
  const isOwnerDeletingOwnMessageAttachment =
    ticketOwnerId === auth.user.id &&
    messageSenderId === auth.user.id &&
    messageSenderRole === 'user';

  if (!isAdmin && !isOwnerDeletingOwnMessageAttachment) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      auth.cookieMutations
    );
  }

  try {
    await deleteSupportStorageObject({
      admin,
      path: attachment.storage_path,
    });

    const { error: deleteError } = await admin
      .from('support_ticket_attachments')
      .delete()
      .eq('id', attachment.id);

    if (deleteError) {
      throw deleteError;
    }

    if (attachment.upload_intent_id) {
      await admin
        .from('support_attachment_upload_intents')
        .update({
          status: 'cancelled',
          failure_reason: 'attachment_deleted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', attachment.upload_intent_id);
    }

    const actorProfile = await loadUserProfileSnapshot(admin, auth.user.id);
    await insertSupportEvent({
      admin,
      ticketId: attachment.ticket_id,
      actorUserId: auth.user.id,
      actorName: actorProfile.fullName,
      actorRole: isAdmin ? 'admin' : 'user',
      eventType: 'attachment_deleted',
      description: `${isAdmin ? 'Support' : 'Customer'} deleted attachment ${attachment.file_name}.`,
      metadata: {
        attachment_id: attachment.id,
        attachment_name: attachment.file_name,
        message_id: attachment.message_id,
      },
      isInternal: isAdmin,
    });

    return buildSupportResponse(
      NextResponse.json({ success: true }),
      auth.cookieMutations
    );
  } catch (deleteAttachmentError: any) {
    return buildSupportResponse(
      NextResponse.json({ error: deleteAttachmentError?.message || 'Failed to delete attachment.' }, { status: 500 }),
      auth.cookieMutations
    );
  }
}
