import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  assertSupportAttachmentCount,
  assertValidUuid,
  SupportValidationError,
} from '@/lib/support';
import {
  buildSupportResponse,
  cleanupSupportAttachmentArtifacts,
  deleteSupportStorageObject,
  isAuthoritativeAdminUser,
  loadSupportUploadIntent,
  markSupportUploadIntentFailure,
  requireAuthenticatedRouteUser,
  verifySupportAttachmentBlob,
} from '@/lib/support-server';

type FinalizeRequestBody = {
  intentIds?: unknown;
};

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

  let body: FinalizeRequestBody = {};
  try {
    body = (await request.json()) as FinalizeRequestBody;
  } catch {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid attachment finalization payload.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  try {
    const intentIds = Array.isArray(body.intentIds)
      ? body.intentIds.map((value) => assertValidUuid(value, 'attachment upload intent id'))
      : [];
    assertSupportAttachmentCount(intentIds.length);

    const isAdmin = await isAuthoritativeAdminUser({
      admin,
      userId: auth.user.id,
    }).catch(() => false);

    const finalizedAttachments: Array<{
      uploadIntentId: string;
      fileName: string;
      mimeType: string;
      fileSizeBytes: number;
      extension: string;
      storagePath: string;
    }> = [];

    for (const intentId of intentIds) {
      const intent = await loadSupportUploadIntent({
        admin,
        intentId,
      });

      if (!intent || intent.requested_by_user_id !== auth.user.id) {
        throw new SupportValidationError('Attachment upload intent not found.');
      }

      if (intent.status !== 'uploaded') {
        throw new SupportValidationError('Attachment upload was not completed.');
      }

      const { data: existingTicket, error: ticketError } = await admin
        .from('support_tickets')
        .select('id, user_id')
        .eq('id', intent.proposed_ticket_id)
        .maybeSingle();

      if (ticketError) {
        throw ticketError;
      }

      if (existingTicket && !isAdmin && existingTicket.user_id !== auth.user.id) {
        throw new SupportValidationError('Ticket not found.');
      }

      const { data: blob, error: downloadError } = await admin.storage
        .from(intent.storage_bucket)
        .download(intent.storage_path);

      if (downloadError || !blob) {
        throw downloadError || new SupportValidationError('Uploaded attachment could not be found.');
      }

      await verifySupportAttachmentBlob({
        blob,
        expectedSize: Number(intent.file_size_bytes),
        expectedMimeType: intent.mime_type,
        expectedExtension: intent.extension,
      });

      const { error: updateIntentError } = await admin
        .from('support_attachment_upload_intents')
        .update({
          status: 'finalized',
          finalized_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq('id', intent.id);

      if (updateIntentError) {
        throw updateIntentError;
      }

      finalizedAttachments.push({
        uploadIntentId: intent.id,
        fileName: intent.original_file_name,
        mimeType: intent.mime_type,
        fileSizeBytes: Number(intent.file_size_bytes),
        extension: intent.extension,
        storagePath: intent.storage_path,
      });
    }

    return buildSupportResponse(
      NextResponse.json({
        uploads: finalizedAttachments.map((attachment) => ({
          uploadIntentId: attachment.uploadIntentId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          fileSizeBytes: attachment.fileSizeBytes,
          extension: attachment.extension,
        })),
      }),
      auth.cookieMutations
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to finalize attachments.';
    const requestedIntentIds = Array.isArray(body.intentIds)
      ? body.intentIds.filter((value): value is string => typeof value === 'string')
      : [];

    for (const intentId of requestedIntentIds) {
      const intent = await loadSupportUploadIntent({
        admin,
        intentId,
      }).catch(() => null);

      if (!intent) continue;

      await deleteSupportStorageObject({
        admin,
        path: intent.storage_path,
      }).catch(() => {});

      await markSupportUploadIntentFailure({
        admin,
        intentId: intent.id,
        reason: message,
      }).catch(() => {});
    }

    return buildSupportResponse(
      NextResponse.json({ error: message }, { status: 400 }),
      auth.cookieMutations
    );
  }
}
