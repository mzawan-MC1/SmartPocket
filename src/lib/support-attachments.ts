import { isSupportedUploadFile } from '@/lib/media-upload';
import {
  assertSupportAttachmentCount,
  type FinalizedSupportUpload,
  getAttachmentExtension,
  parseSupportUploadIntentInput,
  SUPPORT_ATTACHMENT_ALLOWED_EXTENSIONS,
  SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES,
  SUPPORT_ATTACHMENT_MAX_SIZE_BYTES,
} from '@/lib/support';

type UploadIntentItem = {
  intentId?: string;
  uploadToken?: string;
};

type FinalizedAttachmentItem = {
  uploadIntentId?: string;
  fileName?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  extension?: string;
};

export type SupportUploadContext = 'new_ticket' | 'customer_reply' | 'admin_reply';

export async function uploadSupportAttachments(args: {
  ticketId: string;
  context: SupportUploadContext;
  files: File[];
  onFileProgress?: (index: number, progress: number) => void;
}) {
  assertSupportAttachmentCount(args.files.length);

  if (args.files.length === 0) {
    return [];
  }

  const intentDescriptors = args.files.map((file) => {
    isSupportedUploadFile({
      file,
      allowedMimeTypes: [...SUPPORT_ATTACHMENT_ALLOWED_MIME_TYPES],
      allowedExtensions: [...SUPPORT_ATTACHMENT_ALLOWED_EXTENSIONS],
      maxSizeBytes: SUPPORT_ATTACHMENT_MAX_SIZE_BYTES,
    });

    return parseSupportUploadIntentInput({
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    });
  });

  const intentResponse = await fetch('/api/support/attachments/upload-intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticketId: args.ticketId,
      context: args.context,
      files: intentDescriptors,
    }),
  });

  const intentPayload = await intentResponse.json();
  if (!intentResponse.ok) {
    throw new Error(intentPayload?.error || 'Failed to prepare attachment upload.');
  }

  const intentItems: UploadIntentItem[] = Array.isArray(intentPayload?.items) ? intentPayload.items : [];
  if (intentItems.length !== args.files.length) {
    throw new Error('Attachment upload preparation returned an unexpected response.');
  }

  for (const [index, file] of args.files.entries()) {
    const intent = intentItems[index];
    if (!intent?.intentId || !intent.uploadToken) {
      throw new Error('Attachment upload preparation is incomplete.');
    }

    args.onFileProgress?.(index, 15);

    const formData = new FormData();
    formData.append('intentId', intent.intentId);
    formData.append('uploadToken', intent.uploadToken);
    formData.append('file', file);

    const uploadResponse = await fetch('/api/support/attachments/upload', {
      method: 'POST',
      body: formData,
    });

    const uploadPayload = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) {
      throw new Error(uploadPayload?.error || 'Failed to upload attachment.');
    }

    args.onFileProgress?.(index, 80);
  }

  const finalizeResponse = await fetch('/api/support/attachments/finalize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intentIds: intentItems.map((item) => item.intentId),
    }),
  });

  const finalizePayload = await finalizeResponse.json();
  if (!finalizeResponse.ok) {
    throw new Error(finalizePayload?.error || 'Failed to finalize attachment upload.');
  }

  const finalizedItems: FinalizedAttachmentItem[] = Array.isArray(finalizePayload?.uploads)
    ? finalizePayload.uploads
    : [];
  if (finalizedItems.length !== args.files.length) {
    throw new Error('Attachment finalization returned an unexpected response.');
  }

  const finalizedUploads: FinalizedSupportUpload[] = finalizedItems.map((item: FinalizedAttachmentItem, index: number) => {
    args.onFileProgress?.(index, 100);
    return {
      uploadIntentId: String(item.uploadIntentId),
      fileName: String(item.fileName || args.files[index]?.name || ''),
      mimeType: String(item.mimeType || args.files[index]?.type || ''),
      fileSizeBytes: Number(item.fileSizeBytes || args.files[index]?.size || 0),
      extension: String(item.extension || getAttachmentExtension(args.files[index]?.name || '')),
    };
  });

  assertSupportAttachmentCount(finalizedUploads.length);
  return finalizedUploads;
}
