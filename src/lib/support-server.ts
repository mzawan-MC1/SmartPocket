import 'server-only';

import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { createServerComponentSupabaseClient } from '@/lib/supabase/server';
import {
  SUPPORT_ATTACHMENT_BUCKET,
  SupportValidationError,
  sanitizeMultilineText,
  sanitizeSingleLineText,
} from '@/lib/support';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

const ATTACHMENT_EXTENSION_MIME_MAP: Record<string, 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf'> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

type UploadIntentRecord = {
  id: string;
  upload_token: string;
  proposed_ticket_id: string;
  ticket_owner_user_id: string;
  requested_by_user_id: string;
  original_file_name: string;
  extension: string;
  mime_type: string;
  file_size_bytes: number;
  storage_bucket: string;
  storage_path: string;
  status: string;
  expires_at: string;
  uploaded_at: string | null;
  finalized_at: string | null;
  failure_reason: string | null;
};

type CleanupAttachmentRow = {
  storage_path?: string | null;
};

export function isSupportValidationError(error: unknown): error is SupportValidationError {
  return error instanceof SupportValidationError;
}

function getExpectedMimeForExtension(extension: string) {
  return ATTACHMENT_EXTENSION_MIME_MAP[extension.toLowerCase()] ?? null;
}

function detectAttachmentMimeFromBytes(bytes: Uint8Array) {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png' as const;
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg' as const;
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp' as const;
  }

  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf' as const;
  }

  return null;
}

export async function verifySupportAttachmentBlob(args: {
  blob: Blob;
  expectedSize: number;
  expectedMimeType: string;
  expectedExtension: string;
}) {
  if (args.blob.size !== args.expectedSize) {
    throw new SupportValidationError('Uploaded attachment size did not match the approved upload intent.');
  }

  const bytes = new Uint8Array(await args.blob.arrayBuffer());
  const detectedMimeType = detectAttachmentMimeFromBytes(bytes);
  const expectedMimeForExtension = getExpectedMimeForExtension(args.expectedExtension);

  if (!detectedMimeType) {
    throw new SupportValidationError('Uploaded attachment content could not be verified.');
  }

  if (!expectedMimeForExtension || detectedMimeType !== expectedMimeForExtension) {
    throw new SupportValidationError('Uploaded attachment file signature did not match the approved extension.');
  }

  if (detectedMimeType !== args.expectedMimeType) {
    throw new SupportValidationError('Uploaded attachment MIME type did not match the approved upload intent.');
  }

  return {
    detectedMimeType,
  };
}

export async function isAuthoritativeAdminUser(args: {
  admin: AdminClient;
  userId: string;
}) {
  const [{ data: profile, error: profileError }, authResult] = await Promise.all([
    args.admin.from('user_profiles').select('id, role, full_name, email').eq('id', args.userId).maybeSingle(),
    args.admin.auth.admin.getUserById(args.userId),
  ]);

  if (profileError) {
    throw profileError;
  }

  const authUser = authResult.data.user;
  const authRole = typeof authUser?.app_metadata?.role === 'string' ? authUser.app_metadata.role : null;
  const profileRole = typeof (profile as { role?: unknown } | null)?.role === 'string' ? (profile as { role: string }).role : null;

  return authRole === 'admin' && profileRole === 'admin';
}

export async function requireAuthenticatedRouteUser() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      response: applySupabaseCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), cookieMutations),
    };
  }

  return { ok: true as const, user, cookieMutations, supabase };
}

export async function requireAdminRouteUser() {
  const auth = await requireAuthenticatedRouteUser();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
        auth.cookieMutations
      ),
    };
  }

  const isAdmin = await isAuthoritativeAdminUser({
    admin,
    userId: auth.user.id,
  }).catch(() => false);

  if (!isAdmin) {
    return {
      ok: false as const,
      response: applySupabaseCookies(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), auth.cookieMutations),
    };
  }

  return {
    ok: true as const,
    user: auth.user,
    cookieMutations: auth.cookieMutations,
    supabase: auth.supabase,
    admin,
  };
}

export async function requireAuthenticatedPageUser() {
  const supabase = await createServerComponentSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/sign-up-login');
  }

  return user;
}

export async function requireAdminPageUser() {
  const user = await requireAuthenticatedPageUser();
  const admin = createAdminClient();

  if (!admin) {
    redirect('/dashboard');
  }

  const isAdmin = await isAuthoritativeAdminUser({
    admin,
    userId: user.id,
  }).catch(() => false);

  if (!isAdmin) {
    redirect('/dashboard');
  }

  return user;
}

export async function loadUserProfileSnapshot(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from('user_profiles')
    .select('id, email, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  return {
    id: userId,
    role: typeof data?.role === 'string' ? data.role : null,
    email: typeof data?.email === 'string' ? data.email : '',
    fullName:
      typeof data?.full_name === 'string' && data.full_name.trim()
        ? data.full_name.trim()
        : (typeof data?.email === 'string' ? data.email.split('@')[0] : 'User'),
  };
}

export function buildSupportResponse(response: NextResponse, cookieMutations: Array<{ name: string; value: string; options: any }>) {
  return applySupabaseCookies(response, cookieMutations);
}

export async function createSignedSupportAttachmentUrl(args: {
  admin: AdminClient;
  path: string;
}) {
  const { data, error } = await args.admin.storage
    .from(SUPPORT_ATTACHMENT_BUCKET)
    .createSignedUrl(args.path, 60 * 30);

  if (error || !data?.signedUrl) {
    throw error || new Error('Failed to create signed attachment URL.');
  }

  return data.signedUrl;
}

export function sanitizeInternalNote(value: unknown) {
  return sanitizeMultilineText(value, 4000);
}

export function sanitizeReplyBody(value: unknown) {
  return sanitizeMultilineText(value, 6000);
}

export function sanitizeSubject(value: unknown) {
  return sanitizeSingleLineText(value, 160);
}

export function sanitizeName(value: unknown) {
  return sanitizeSingleLineText(value, 120);
}

export function sanitizeEmailAddress(value: unknown) {
  return sanitizeSingleLineText(value, 254).toLowerCase();
}

export async function loadSupportUploadIntent(args: {
  admin: AdminClient;
  intentId?: string;
  uploadToken?: string;
}) {
  let query = args.admin
    .from('support_attachment_upload_intents')
    .select('*')
    .limit(1);

  if (args.intentId) {
    query = query.eq('id', args.intentId);
  }

  if (args.uploadToken) {
    query = query.eq('upload_token', args.uploadToken);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return (data as UploadIntentRecord | null) ?? null;
}

export async function cleanupExpiredSupportAttachmentUploads(admin: AdminClient) {
  const { data, error } = await admin.rpc('cleanup_expired_support_attachment_upload_intents', {
    p_limit: 50,
  });

  if (error) {
    return;
  }

  const expiredRows = Array.isArray(data)
    ? data.filter((row): row is { storage_path?: string | null } => Boolean(row && typeof row === 'object'))
    : [];

  const paths = expiredRows
    .map((row) => (typeof row.storage_path === 'string' ? row.storage_path : null))
    .filter((value): value is string => Boolean(value));

  if (paths.length > 0) {
    await admin.storage.from(SUPPORT_ATTACHMENT_BUCKET).remove(paths);
  }
}

export async function cleanupAbandonedSupportUploadIntents(admin: AdminClient) {
  const { data, error } = await admin.rpc('cleanup_abandoned_support_attachment_upload_intents', {
    p_limit: 50,
  });

  if (error) {
    return;
  }

  const staleRows = Array.isArray(data)
    ? data.filter((row): row is { storage_path?: string | null } => Boolean(row && typeof row === 'object'))
    : [];

  const paths = staleRows
    .map((row) => (typeof row.storage_path === 'string' ? row.storage_path : null))
    .filter((value): value is string => Boolean(value));

  if (paths.length > 0) {
    await admin.storage.from(SUPPORT_ATTACHMENT_BUCKET).remove(paths);
  }
}

export async function cleanupAbandonedSupportAttachments(admin: AdminClient) {
  const { data, error } = await admin.rpc('cleanup_abandoned_support_ticket_attachments', {
    p_limit: 50,
  });

  if (error) {
    return;
  }

  const staleRows = Array.isArray(data)
    ? data.filter((row): row is CleanupAttachmentRow => Boolean(row && typeof row === 'object'))
    : [];

  const paths = staleRows
    .map((row) => (typeof row.storage_path === 'string' ? row.storage_path : null))
    .filter((value): value is string => Boolean(value));

  if (paths.length > 0) {
    await admin.storage.from(SUPPORT_ATTACHMENT_BUCKET).remove(paths);
  }
}

export async function cleanupSupportAttachmentArtifacts(admin: AdminClient) {
  await Promise.all([
    cleanupExpiredSupportAttachmentUploads(admin),
    cleanupAbandonedSupportUploadIntents(admin),
    cleanupAbandonedSupportAttachments(admin),
  ]);
}

export async function deleteSupportStorageObject(args: {
  admin: AdminClient;
  path: string;
}) {
  const { error } = await args.admin.storage
    .from(SUPPORT_ATTACHMENT_BUCKET)
    .remove([args.path]);

  if (error) {
    throw error;
  }
}

export async function markSupportUploadIntentFailure(args: {
  admin: AdminClient;
  intentId: string;
  reason: string;
}) {
  const { error } = await args.admin
    .from('support_attachment_upload_intents')
    .update({
      status: 'failed',
      failure_reason: args.reason,
    })
    .eq('id', args.intentId);

  if (error) {
    throw error;
  }
}

export async function listAdminUsers(admin: AdminClient) {
  const { data, error } = await admin
    .from('user_profiles')
    .select('id, full_name, email, role')
    .eq('role', 'admin')
    .order('full_name', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];
  const validAdmins = await Promise.all(
    rows.map(async (row) => {
      const isAdmin = await isAuthoritativeAdminUser({
        admin,
        userId: row.id,
      }).catch(() => false);

      return isAdmin ? row : null;
    })
  );

  return validAdmins.filter((row): row is NonNullable<typeof row> => Boolean(row));
}

export async function validateAssignedAdminId(args: {
  admin: AdminClient;
  assignedAdminId: string | null;
}) {
  if (!args.assignedAdminId) {
    return null;
  }

  const { data: profile, error } = await args.admin
    .from('user_profiles')
    .select('id, full_name, email, role')
    .eq('id', args.assignedAdminId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!profile) {
    throw new SupportValidationError('Assigned administrator is invalid.');
  }

  const isAdmin = await isAuthoritativeAdminUser({
    admin: args.admin,
    userId: args.assignedAdminId,
  }).catch(() => false);

  if (!isAdmin) {
    throw new SupportValidationError('Assigned administrator is invalid.');
  }

  return profile;
}

export async function insertContactEvent(args: {
  admin: AdminClient;
  submissionId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: 'system' | 'admin';
  eventType: string;
  body?: string | null;
  isInternal?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await args.admin.from('contact_submission_events').insert({
    submission_id: args.submissionId,
    actor_user_id: args.actorUserId || null,
    actor_name: args.actorName || null,
    actor_role: args.actorRole || 'system',
    event_type: args.eventType,
    body: args.body || null,
    is_internal: Boolean(args.isInternal),
    metadata: args.metadata || {},
  });

  if (error) throw error;
}

export async function insertSupportEvent(args: {
  admin: AdminClient;
  ticketId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: 'system' | 'user' | 'admin';
  eventType: string;
  description: string;
  isInternal?: boolean;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await args.admin.from('support_ticket_events').insert({
    ticket_id: args.ticketId,
    actor_user_id: args.actorUserId || null,
    actor_name: args.actorName || null,
    actor_role: args.actorRole || 'system',
    event_type: args.eventType,
    description: args.description,
    is_internal: Boolean(args.isInternal),
    metadata: args.metadata || {},
  });

  if (error) throw error;
}
