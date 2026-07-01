import { createClient } from '@/lib/supabase/client';
import { isSupportedUploadFile } from '@/lib/media-upload';

const AVATAR_BUCKET = 'avatars';
const AVATAR_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const AVATAR_ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.trim().toLowerCase() || 'png';
}

function buildAvatarPath(userId: string, extension: string) {
  return `${userId}/avatar.${extension}`;
}

function withAvatarVersion(url: string) {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${Date.now()}`;
}

async function listExistingAvatarPaths(userId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).list(userId, {
    limit: 20,
    sortBy: { column: 'name', order: 'asc' },
  });

  if (error) {
    throw error;
  }

  return (data || [])
    .map((entry: { name?: string | null }) => entry.name || '')
    .filter((name: string) => name.startsWith('avatar.'))
    .map((name: string) => `${userId}/${name}`);
}

async function updateProfileAvatar(args: {
  userId: string;
  avatarUrl: string | null;
}) {
  const supabase = createClient();
  const { error } = await supabase
    .from('user_profiles')
    .update({ avatar_url: args.avatarUrl })
    .eq('id', args.userId);

  if (error) {
    throw error;
  }

  const { error: authError } = await supabase.auth.updateUser({
    data: {
      avatar_url: args.avatarUrl || '',
    },
  });

  if (authError) {
    throw authError;
  }
}

export async function uploadCurrentUserAvatar(args: {
  file: File;
  onProgress?: (progress: number) => void;
}) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to upload a profile photo.');
  }

  isSupportedUploadFile({
    file: args.file,
    allowedMimeTypes: AVATAR_ALLOWED_MIME_TYPES,
    allowedExtensions: AVATAR_ALLOWED_EXTENSIONS,
    maxSizeBytes: AVATAR_MAX_SIZE_BYTES,
  });

  args.onProgress?.(10);
  const existingPaths = await listExistingAvatarPaths(user.id);
  if (existingPaths.length > 0) {
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove(existingPaths);
    if (removeError) {
      throw removeError;
    }
  }

  args.onProgress?.(40);
  const extension = getFileExtension(args.file.name);
  const avatarPath = buildAvatarPath(user.id, extension);
  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(avatarPath, args.file, {
    cacheControl: '3600',
    upsert: true,
    contentType: args.file.type || undefined,
  });

  if (uploadError) {
    throw uploadError;
  }

  args.onProgress?.(80);
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(avatarPath);
  const versionedUrl = withAvatarVersion(data.publicUrl);
  await updateProfileAvatar({ userId: user.id, avatarUrl: versionedUrl });
  args.onProgress?.(100);

  return {
    avatarUrl: versionedUrl,
  };
}

export async function removeCurrentUserAvatar() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to remove a profile photo.');
  }

  const existingPaths = await listExistingAvatarPaths(user.id);
  if (existingPaths.length > 0) {
    const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove(existingPaths);
    if (removeError) {
      throw removeError;
    }
  }

  await updateProfileAvatar({ userId: user.id, avatarUrl: null });
}
