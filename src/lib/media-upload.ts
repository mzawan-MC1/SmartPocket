import { createClient } from '@/lib/supabase/client';
import { createClientId } from '@/lib/uuid';

export interface UploadMediaOptions {
  file: File;
  folder: string;
  filePrefix: string;
  maxSizeBytes: number;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  onProgress?: (progress: number) => void;
}

export interface UploadedMediaResult {
  bucket: 'avatars';
  path: string;
  publicUrl: string;
}

function formatAllowedTypes(extensions: string[]) {
  return extensions.map((extension) => extension.toUpperCase()).join(', ');
}

function getFileExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.trim().toLowerCase();
  return extension || '';
}

export function isSupportedUploadFile(args: {
  file: File;
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxSizeBytes: number;
}) {
  const extension = getFileExtension(args.file.name);
  const hasAllowedExtension = args.allowedExtensions.includes(extension);
  const hasAllowedMimeType = args.allowedMimeTypes.includes(args.file.type);

  if (!hasAllowedExtension || (!hasAllowedMimeType && args.file.type)) {
    throw new Error(`Unsupported file type. Allowed formats: ${formatAllowedTypes(args.allowedExtensions)}.`);
  }

  if (args.file.size > args.maxSizeBytes) {
    const maxSizeMb = args.maxSizeBytes >= 1024 * 1024
      ? `${(args.maxSizeBytes / (1024 * 1024)).toFixed(0)} MB`
      : `${Math.round(args.maxSizeBytes / 1024)} KB`;
    throw new Error(`File is too large. Maximum size is ${maxSizeMb}.`);
  }
}

export async function uploadPublicMedia(options: UploadMediaOptions): Promise<UploadedMediaResult> {
  const supabase = createClient();
  const {
    file,
    folder,
    filePrefix,
    maxSizeBytes,
    allowedMimeTypes,
    allowedExtensions,
    onProgress,
  } = options;

  isSupportedUploadFile({ file, allowedMimeTypes, allowedExtensions, maxSizeBytes });
  onProgress?.(10);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to upload files.');
  }

  onProgress?.(25);

  const extension = getFileExtension(file.name);
  const safePrefix = filePrefix.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const safeFolder = folder.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const path = `${user.id}/${safeFolder}/${safePrefix}-${Date.now()}-${createClientId()}.${extension}`;

  onProgress?.(55);
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    throw uploadError;
  }

  onProgress?.(85);
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  onProgress?.(100);

  return {
    bucket: 'avatars',
    path,
    publicUrl: data.publicUrl,
  };
}
