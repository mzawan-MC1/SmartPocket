import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { requireAdminRouteUser } from '@/lib/support-server';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const BUCKET = 'documentation-images';
const PUBLIC_URL_PREFIX_INFIX = `/storage/v1/object/public/${BUCKET}/`;

function buildStoragePath(userId: string, originalName: string, ext: string) {
  const sanitized = originalName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
  const ts = Date.now();
  const rand = randomUUID().slice(0, 8);
  return `${userId}/${ts}-${rand}-${sanitized}.${ext}`;
}

function getExtensionFor(mimeType: string, fallbackName: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
  }
  const nameDot = (fallbackName || '').lastIndexOf('.');
  if (nameDot >= 0) {
    const ext = fallbackName.slice(nameDot + 1).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6);
    return ext || 'bin';
  }
  return 'bin';
}

function tryExtractSupabasePublicOrigin(envBase: string | undefined): string | null {
  if (!envBase) return null;
  try {
    const u = new URL(envBase);
    return `${u.origin}`;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminRouteUser();
  if (!auth.ok) return auth.response;
  const { admin, cookieMutations, user } = auth;

  const supabaseAdmin = createAdminClient();
  if (!supabaseAdmin) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
      cookieMutations
    );
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Invalid upload payload.' }, { status: 400 }),
      cookieMutations
    );
  }

  const fileEntry = formData.get('file');
  const captionRaw = formData.get('caption');
  const altRaw = formData.get('alt');
  if (!(fileEntry instanceof File)) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Upload requires a file field.' }, { status: 400 }),
      cookieMutations
    );
  }

  if (!ALLOWED_MIME_TYPES.has(fileEntry.type)) {
    return applySupabaseCookies(
      NextResponse.json(
        { error: `Unsupported image type. Allowed: PNG, JPG, WEBP, GIF.` },
        { status: 400 }
      ),
      cookieMutations
    );
  }

  if (fileEntry.size > MAX_SIZE_BYTES) {
    return applySupabaseCookies(
      NextResponse.json({ error: `Image too large. Maximum 5 MB.` }, { status: 400 }),
      cookieMutations
    );
  }

  if (fileEntry.size === 0) {
    return applySupabaseCookies(
      NextResponse.json({ error: `Empty file.` }, { status: 400 }),
      cookieMutations
    );
  }

  const ext = getExtensionFor(fileEntry.type, fileEntry.name);
  if (ext === 'bin') {
    return applySupabaseCookies(
      NextResponse.json({ error: `Could not determine image extension.` }, { status: 400 }),
      cookieMutations
    );
  }

  const storagePath = buildStoragePath(user.id, fileEntry.name, ext);
  const caption = typeof captionRaw === 'string' ? captionRaw.trim().slice(0, 240) : '';
  const alt = typeof altRaw === 'string' ? altRaw.trim().slice(0, 240) : '';

  try {
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(storagePath, fileEntry.stream() as unknown as File, {
        contentType: fileEntry.type,
        cacheControl: 'public, max-age=31536000, immutable',
        upsert: false,
      });

    if (uploadError) {
      throw uploadError instanceof Error ? uploadError : new Error(String(uploadError));
    }

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
    const publicUrl = data?.publicUrl || '';
    if (!publicUrl) {
      throw new Error('Failed to build public URL for uploaded image.');
    }

    const envOrigin = tryExtractSupabasePublicOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const normalizedUrl =
      envOrigin && !publicUrl.startsWith(envOrigin) && publicUrl.includes(PUBLIC_URL_PREFIX_INFIX)
        ? `${envOrigin}${PUBLIC_URL_PREFIX_INFIX}${storagePath}`
        : publicUrl;

    return applySupabaseCookies(
      NextResponse.json(
        {
          success: true,
          url: normalizedUrl,
          storagePath,
          mime: fileEntry.type,
          size: fileEntry.size,
          caption,
          alt: alt || caption || fileEntry.name,
        },
        { status: 200 }
      ),
      cookieMutations
    );
  } catch (error: any) {
    const message = error instanceof Error ? error.message : String(error || 'Upload failed.');
    return applySupabaseCookies(
      NextResponse.json({ error: message.slice(0, 200) }, { status: 500 }),
      cookieMutations
    );
  }
}
