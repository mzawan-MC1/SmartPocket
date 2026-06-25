import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildSupportResponse,
  cleanupSupportAttachmentArtifacts,
  deleteSupportStorageObject,
  loadSupportUploadIntent,
  markSupportUploadIntentFailure,
  requireAuthenticatedRouteUser,
} from '@/lib/support-server';

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

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Invalid attachment upload payload.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  const intentId = typeof formData.get('intentId') === 'string' ? String(formData.get('intentId')) : '';
  const uploadToken = typeof formData.get('uploadToken') === 'string' ? String(formData.get('uploadToken')) : '';
  const fileEntry = formData.get('file');

  if (!intentId || !uploadToken || !(fileEntry instanceof File)) {
    return buildSupportResponse(
      NextResponse.json({ error: 'Attachment upload is missing required fields.' }, { status: 400 }),
      auth.cookieMutations
    );
  }

  let activeStoragePath: string | null = null;

  try {
    const intent = await loadSupportUploadIntent({
      admin,
      intentId,
      uploadToken,
    });

    if (!intent || intent.requested_by_user_id !== auth.user.id) {
      return buildSupportResponse(
        NextResponse.json({ error: 'Attachment upload intent not found.' }, { status: 404 }),
        auth.cookieMutations
      );
    }

    if (new Date(intent.expires_at).getTime() <= Date.now()) {
      await markSupportUploadIntentFailure({
        admin,
        intentId: intent.id,
        reason: 'expired',
      }).catch(() => {});

      return buildSupportResponse(
        NextResponse.json({ error: 'Attachment upload intent has expired. Please add the file again.' }, { status: 400 }),
        auth.cookieMutations
      );
    }

    if (!['pending', 'uploaded'].includes(intent.status)) {
      return buildSupportResponse(
        NextResponse.json({ error: 'Attachment upload intent is no longer active.' }, { status: 400 }),
        auth.cookieMutations
      );
    }

    activeStoragePath = intent.storage_path;

    if (fileEntry.size !== Number(intent.file_size_bytes)) {
      throw new Error('Attachment size did not match the approved upload intent.');
    }

    if (intent.status === 'uploaded') {
      await deleteSupportStorageObject({
        admin,
        path: intent.storage_path,
      }).catch(() => {});
    }

    const { error: uploadError } = await admin.storage
      .from(intent.storage_bucket)
      .upload(intent.storage_path, fileEntry, {
        contentType: intent.mime_type,
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { error: updateError } = await admin
      .from('support_attachment_upload_intents')
      .update({
        status: 'uploaded',
        uploaded_at: new Date().toISOString(),
        failure_reason: null,
      })
      .eq('id', intent.id);

    if (updateError) {
      throw updateError;
    }

    return buildSupportResponse(
      NextResponse.json({ success: true }),
      auth.cookieMutations
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to upload attachment.';

    if (activeStoragePath) {
      await deleteSupportStorageObject({
        admin,
        path: activeStoragePath,
      }).catch(() => {});
    }

    await markSupportUploadIntentFailure({
      admin,
      intentId,
      reason: message,
    }).catch(() => {});

    return buildSupportResponse(
      NextResponse.json({ error: message }, { status: 400 }),
      auth.cookieMutations
    );
  }
}
