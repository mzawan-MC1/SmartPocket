import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildTransactionalAppUrl } from '@/lib/email/transactional-config';
import { sendTransactionalEmail } from '@/lib/email/transactional';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  SpaceInvitation,
  SpaceInvitationCreateResult,
  SpaceInvitationRespondResult,
  SpaceRole,
} from '@/lib/spaces-shared';
import { isSpaceRole, normalizeInvitationEmail } from '@/lib/spaces-shared';

type InvitationLifecycleStatus = 'accepted' | 'declined' | 'revoked' | 'expired';

type ServiceProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ServiceSpace = {
  id: string;
  owner_id: string;
  name: string;
  color: string | null;
  is_active: boolean;
};

type ServiceInvitationRow = {
  id: string;
  space_id: string;
  invited_by: string;
  invited_user_id?: string | null;
  email: string;
  role: SpaceRole;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  token: string;
  expires_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

type InvitationErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_EMAIL'
  | 'INVALID_ROLE'
  | 'SPACE_NOT_FOUND'
  | 'SPACE_NOT_AVAILABLE'
  | 'INVITATION_DUPLICATE'
  | 'ALREADY_MEMBER'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_EXPIRED'
  | 'INVITATION_REVOKED'
  | 'INVITATION_ALREADY_RESPONDED'
  | 'INVITATION_EMAIL_MISMATCH'
  | 'EMAIL_REQUIRED'
  | 'SYSTEM_UNAVAILABLE';

class InvitationServiceError extends Error {
  code: InvitationErrorCode;
  status: number;

  constructor(code: InvitationErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const SPACE_INVITATION_NOTIFICATION_SOURCE_PREFIX = 'space_invitation:';

function buildInvitationReferenceId(seed?: string) {
  const value = (seed || crypto.randomUUID()).replace(/-/g, '').slice(0, 8).toUpperCase();
  return `SPI-${value}`;
}

function getInvitationNotificationSourceKey(invitationId: string) {
  return `${SPACE_INVITATION_NOTIFICATION_SOURCE_PREFIX}${invitationId}`;
}

function getSafeInviterLabel(profile: ServiceProfile | null) {
  return profile?.full_name?.trim() || profile?.email?.trim() || 'Smart Pocket';
}

function mapInvitationError(error: unknown) {
  if (error instanceof InvitationServiceError) {
    return error;
  }

  const maybeCode = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : '';

  if (maybeCode === '23505') {
    return new InvitationServiceError(
      'INVITATION_DUPLICATE',
      'An active invitation already exists for this email address.',
      409
    );
  }

  return new InvitationServiceError(
    'SYSTEM_UNAVAILABLE',
    'We could not complete the invitation request. Please try again.',
    500
  );
}

function mapRowToInvitation(args: {
  row: ServiceInvitationRow;
  space: ServiceSpace | null;
  inviter: ServiceProfile | null;
}): SpaceInvitation {
  const { row, space, inviter } = args;
  const isExpired = Boolean(row.expires_at && new Date(row.expires_at).getTime() <= Date.now());

  return {
    ...row,
    invited_user_id: row.invited_user_id ?? null,
    space: space
      ? {
          id: space.id,
          name: space.name,
          color: space.color,
          is_active: space.is_active,
        }
      : undefined,
    inviter: inviter
      ? {
          full_name: inviter.full_name,
          email: inviter.email,
        }
      : undefined,
    is_expired: isExpired,
    space_available: Boolean(space?.is_active),
  };
}

async function loadProfilesById(admin: SupabaseClient, userIds: string[]) {
  if (!userIds.length) {
    return new Map<string, ServiceProfile>();
  }

  const { data, error } = await admin
    .from('user_profiles')
    .select('id, full_name, email')
    .in('id', Array.from(new Set(userIds)));

  if (error) {
    throw error;
  }

  return new Map(
    ((data || []) as ServiceProfile[]).map((profile) => [profile.id, profile])
  );
}

async function loadSpacesById(admin: SupabaseClient, spaceIds: string[]) {
  if (!spaceIds.length) {
    return new Map<string, ServiceSpace>();
  }

  const { data, error } = await admin
    .from('spaces')
    .select('id, owner_id, name, color, is_active')
    .in('id', Array.from(new Set(spaceIds)));

  if (error) {
    throw error;
  }

  return new Map(
    ((data || []) as ServiceSpace[]).map((space) => [space.id, space])
  );
}

async function loadPendingInvitationRowsForRecipient(
  admin: SupabaseClient,
  userId: string,
  normalizedEmail: string
) {
  const [byUserId, byEmail] = await Promise.all([
    admin
      .from('space_invitations')
      .select('*')
      .eq('status', 'pending')
      .eq('invited_user_id', userId),
    admin
      .from('space_invitations')
      .select('*')
      .eq('status', 'pending')
      .ilike('email', normalizedEmail),
  ]);

  if (byUserId.error) {
    throw byUserId.error;
  }
  if (byEmail.error) {
    throw byEmail.error;
  }

  const rows = new Map<string, ServiceInvitationRow>();
  for (const row of (byUserId.data || []) as ServiceInvitationRow[]) {
    rows.set(row.id, row);
  }
  for (const row of (byEmail.data || []) as ServiceInvitationRow[]) {
    rows.set(row.id, row);
  }

  return Array.from(rows.values());
}

async function resolveExistingUserByEmail(admin: SupabaseClient, normalizedEmail: string) {
  const { data, error } = await admin
    .from('user_profiles')
    .select('id, full_name, email')
    .ilike('email', normalizedEmail)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ServiceProfile | null) ?? null;
}

async function resolveInvitationNotification(
  admin: SupabaseClient,
  invitationId: string,
  status: InvitationLifecycleStatus
) {
  const sourceKey = getInvitationNotificationSourceKey(invitationId);
  const { data, error } = await admin
    .from('notifications')
    .select('id, metadata')
    .eq('source_key', sourceKey)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  const nextMetadata = {
    ...((data as { metadata?: Record<string, unknown> | null }).metadata || {}),
    invitation_status: status,
    actionable: false,
  };

  await admin
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
      action_url: null,
      metadata: nextMetadata,
    })
    .eq('id', (data as { id: string }).id);

  return true;
}

async function createInvitationNotification(args: {
  admin: SupabaseClient;
  invitedUserId: string;
  invitation: ServiceInvitationRow;
  space: ServiceSpace;
  inviter: ServiceProfile | null;
}) {
  const { admin, invitedUserId, invitation, space, inviter } = args;
  const sourceKey = getInvitationNotificationSourceKey(invitation.id);
  const inviterLabel = getSafeInviterLabel(inviter);
  const message = `You were invited to join "${space.name}" as a ${invitation.role}.`;

  const { data: existing, error: existingError } = await admin
    .from('notifications')
    .select('id')
    .eq('user_id', invitedUserId)
    .eq('source_key', sourceKey)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return 'existing' as const;
  }

  const { error } = await admin
    .from('notifications')
    .insert({
      user_id: invitedUserId,
      type: 'space_invitation',
      title: 'Space invitation',
      message,
      action_url: `/invite/${invitation.token}`,
      source_key: sourceKey,
      metadata: {
        invitation_id: invitation.id,
        space_id: invitation.space_id,
        space_name: space.name,
        inviter_name: inviter?.full_name || null,
        inviter_email: inviter?.email || null,
        role: invitation.role,
        expires_at: invitation.expires_at,
        actionable: true,
        invitation_status: invitation.status,
      },
    });

  if (error) {
    throw error;
  }

  return 'created' as const;
}

async function insertActivityLog(args: {
  admin: SupabaseClient;
  userId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}) {
  await args.admin.from('activity_logs').insert({
    user_id: args.userId,
    action: args.action,
    entity_type: args.entityType,
    entity_id: args.entityId,
    previous_value: args.previousValue,
    new_value: args.newValue,
  });
}

async function sendSpaceInvitationEmail(args: {
  invitation: ServiceInvitationRow;
  inviter: ServiceProfile | null;
  invitedUser: ServiceProfile | null;
  space: ServiceSpace;
}) {
  const settings = await getPlatformSettingsSnapshot();
  const invitationUrl = buildTransactionalAppUrl(`/invite/${args.invitation.token}`, settings);
  const recipientName = args.invitedUser?.full_name?.trim()
    || args.invitation.email.split('@')[0]
    || 'there';
  const inviterName = getSafeInviterLabel(args.inviter);

  return sendTransactionalEmail({
    eventKey: `space_invitation:${args.invitation.id}`,
    templateKey: 'space_invitation',
    to: {
      email: args.invitation.email,
      name: recipientName,
    },
    userId: args.invitedUser?.id || null,
    variables: {
      recipient_name: recipientName,
      recipient_email: args.invitation.email,
      inviter_name: inviterName,
      space_name: args.space.name,
      role: args.invitation.role,
      invitation_url: invitationUrl,
      expires_at: args.invitation.expires_at
        ? new Date(args.invitation.expires_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : '',
      platform_name: settings.branding.appName,
      support_email: settings.publicUi.contactEmail || settings.email.supportEmail || '',
    },
  });
}

export async function createSpaceInvitation(args: {
  userSupabase: SupabaseClient;
  ownerUserId: string;
  spaceId: string;
  email: string;
  role: string;
}): Promise<SpaceInvitationCreateResult> {
  const admin = createAdminClient();
  if (!admin) {
    throw new InvitationServiceError('SYSTEM_UNAVAILABLE', 'The invitation service is not configured.', 503);
  }

  const normalizedEmail = normalizeInvitationEmail(args.email);
  if (!normalizedEmail) {
    throw new InvitationServiceError('EMAIL_REQUIRED', 'Enter an email address.');
  }
  if (!isSpaceRole(args.role) || args.role === 'owner') {
    throw new InvitationServiceError('INVALID_ROLE', 'Select a valid invitation role.');
  }

  try {
    const [{ data: space, error: spaceError }, inviter] = await Promise.all([
      args.userSupabase
        .from('spaces')
        .select('id, owner_id, name, color, is_active')
        .eq('id', args.spaceId)
        .single(),
      loadProfilesById(admin, [args.ownerUserId]).then((profiles) => profiles.get(args.ownerUserId) ?? null),
    ]);

    if (spaceError || !space) {
      throw new InvitationServiceError('SPACE_NOT_FOUND', 'The selected space was not found.', 404);
    }

    const typedSpace = space as ServiceSpace;
    if (typedSpace.owner_id !== args.ownerUserId) {
      throw new InvitationServiceError('UNAUTHORIZED', 'You do not have permission to invite people to this space.', 403);
    }
    if (!typedSpace.is_active) {
      throw new InvitationServiceError('SPACE_NOT_AVAILABLE', 'This space is no longer available.', 409);
    }

    const invitedUser = await resolveExistingUserByEmail(admin, normalizedEmail);
    if (invitedUser?.id) {
      const { data: existingMember, error: memberError } = await admin
        .from('space_members')
        .select('id')
        .eq('space_id', args.spaceId)
        .eq('user_id', invitedUser.id)
        .maybeSingle();

      if (memberError) {
        throw memberError;
      }
      if (existingMember) {
        throw new InvitationServiceError('ALREADY_MEMBER', 'This user is already a member of this space.', 409);
      }
    }

    const insertPayload: Record<string, unknown> = {
      space_id: args.spaceId,
      invited_by: args.ownerUserId,
      email: normalizedEmail,
      role: args.role,
    };
    if (invitedUser?.id) {
      insertPayload.invited_user_id = invitedUser.id;
    }

    const { data: invitationRow, error: insertError } = await args.userSupabase
      .from('space_invitations')
      .insert(insertPayload)
      .select('*')
      .single();

    if (insertError || !invitationRow) {
      throw insertError || new Error('invitation_insert_failed');
    }

    const invitation = invitationRow as ServiceInvitationRow;
    const notificationStatus = invitedUser?.id
      ? await createInvitationNotification({
          admin,
          invitedUserId: invitedUser.id,
          invitation,
          space: typedSpace,
          inviter,
        })
      : 'skipped' as const;

    let emailStatus: SpaceInvitationCreateResult['emailStatus'] = 'skipped';
    let warning: string | null = null;

    try {
      const delivery = await sendSpaceInvitationEmail({
        invitation,
        inviter,
        invitedUser,
        space: typedSpace,
      });
      emailStatus = delivery.status;
      if (delivery.status !== 'sent') {
        warning = 'The invitation was saved, but the email could not be delivered.';
      }
    } catch (emailError) {
      const referenceId = buildInvitationReferenceId();
      console.error('[space-invitations:create:email_failed]', {
        referenceId,
        invitationId: invitation.id,
        spaceId: args.spaceId,
        ownerUserId: args.ownerUserId,
        message: emailError instanceof Error ? emailError.message : 'unknown_error',
      });
      emailStatus = 'failed';
      warning = 'The invitation was saved, but the email could not be delivered.';
    }

    await insertActivityLog({
      admin,
      userId: args.ownerUserId,
      action: 'member_invited',
      entityType: 'space_invitations',
      entityId: invitation.id,
      previousValue: null,
      newValue: {
        email: normalizedEmail,
        role: args.role,
        invited_user_id: invitedUser?.id || null,
      },
    });

    return {
      invitation: mapRowToInvitation({
        row: invitation,
        space: typedSpace,
        inviter,
      }),
      notificationStatus,
      emailStatus,
      warning,
    };
  } catch (error) {
    throw mapInvitationError(error);
  }
}

export async function getReceivedSpaceInvitations(args: {
  userId: string;
  email: string;
}): Promise<SpaceInvitation[]> {
  const admin = createAdminClient();
  if (!admin) {
    throw new InvitationServiceError('SYSTEM_UNAVAILABLE', 'The invitation service is not configured.', 503);
  }

  const normalizedEmail = normalizeInvitationEmail(args.email);
  const rows = await loadPendingInvitationRowsForRecipient(admin, args.userId, normalizedEmail);

  const spaceIds = rows.map((row) => row.space_id);
  const inviterIds = rows.map((row) => row.invited_by);

  const [spacesById, profilesById, memberships] = await Promise.all([
    loadSpacesById(admin, spaceIds),
    loadProfilesById(admin, inviterIds),
    spaceIds.length
      ? admin
          .from('space_members')
          .select('space_id')
          .eq('user_id', args.userId)
          .in('space_id', Array.from(new Set(spaceIds)))
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (memberships.error) {
    throw memberships.error;
  }

  const existingMemberships = new Set(
    ((memberships.data || []) as Array<{ space_id: string }>).map((row) => row.space_id)
  );

  const invitations: SpaceInvitation[] = [];
  for (const row of rows) {
    const space = spacesById.get(row.space_id) ?? null;
    const normalizedRowEmail = normalizeInvitationEmail(row.email);
    const isRecipientMatch = row.invited_user_id === args.userId || normalizedRowEmail === normalizedEmail;
    const isExpired = Boolean(row.expires_at && new Date(row.expires_at).getTime() <= Date.now());

    if (!isRecipientMatch) {
      continue;
    }
    if (existingMemberships.has(row.space_id)) {
      continue;
    }
    if (!space || !space.is_active) {
      continue;
    }
    if (isExpired) {
      await resolveInvitationNotification(admin, row.id, 'expired');
      continue;
    }

    invitations.push(
      mapRowToInvitation({
        row,
        space,
        inviter: profilesById.get(row.invited_by) ?? null,
      })
    );
  }

  return invitations.sort((left, right) => right.created_at.localeCompare(left.created_at));
}

export async function getSpaceInvitationPreviewByToken(token: string): Promise<SpaceInvitation | null> {
  const admin = createAdminClient();
  if (!admin) {
    throw new InvitationServiceError('SYSTEM_UNAVAILABLE', 'The invitation service is not configured.', 503);
  }

  const { data, error } = await admin
    .from('space_invitations')
    .select('*')
    .eq('token', token)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }

  const row = data as ServiceInvitationRow;
  const [spacesById, profilesById] = await Promise.all([
    loadSpacesById(admin, [row.space_id]),
    loadProfilesById(admin, [row.invited_by]),
  ]);

  const invitation = mapRowToInvitation({
    row,
    space: spacesById.get(row.space_id) ?? null,
    inviter: profilesById.get(row.invited_by) ?? null,
  });

  if (invitation.is_expired && invitation.status === 'pending') {
    await resolveInvitationNotification(admin, invitation.id, 'expired');
  }

  return invitation;
}

export async function respondToSpaceInvitation(args: {
  userSupabase: SupabaseClient;
  invitationId?: string | null;
  token?: string | null;
  response: 'accepted' | 'declined';
}): Promise<SpaceInvitationRespondResult> {
  try {
    const { data, error } = await args.userSupabase.rpc('rpc_respond_to_space_invitation', {
      p_invitation_id: args.invitationId || null,
      p_token: args.token || null,
      p_response: args.response,
    });

    if (error) {
      throw error;
    }

    const result = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    if (!result) {
      throw new InvitationServiceError('INVITATION_NOT_FOUND', 'Invitation not found.', 404);
    }

    return {
      invitationId: String(result.invitation_id || args.invitationId || ''),
      spaceId: typeof result.space_id === 'string' ? result.space_id : null,
      status: String(result.status || args.response) as 'accepted' | 'declined',
      membershipCreated: Boolean(result.membership_created),
      alreadyMember: Boolean(result.already_member),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    switch (message) {
      case 'INVITATION_NOT_FOUND':
        throw new InvitationServiceError('INVITATION_NOT_FOUND', 'Invitation not found.', 404);
      case 'INVITATION_EMAIL_MISMATCH':
        throw new InvitationServiceError('INVITATION_EMAIL_MISMATCH', 'Sign in with the email address that received this invitation.', 403);
      case 'INVITATION_EXPIRED':
        throw new InvitationServiceError('INVITATION_EXPIRED', 'This invitation has expired.', 409);
      case 'INVITATION_REVOKED':
        throw new InvitationServiceError('INVITATION_REVOKED', 'This invitation was revoked.', 409);
      case 'INVITATION_ALREADY_RESPONDED':
        throw new InvitationServiceError('INVITATION_ALREADY_RESPONDED', 'This invitation was already processed.', 409);
      case 'SPACE_NOT_FOUND':
        throw new InvitationServiceError('SPACE_NOT_FOUND', 'This space is no longer available.', 404);
      default:
        throw mapInvitationError(error);
    }
  }
}

export async function revokeSpaceInvitation(args: {
  userSupabase: SupabaseClient;
  ownerUserId: string;
  invitationId: string;
}) {
  const admin = createAdminClient();
  if (!admin) {
    throw new InvitationServiceError('SYSTEM_UNAVAILABLE', 'The invitation service is not configured.', 503);
  }

  try {
    const { data: row, error } = await args.userSupabase
      .from('space_invitations')
      .select('*')
      .eq('id', args.invitationId)
      .single();

    if (error || !row) {
      throw new InvitationServiceError('INVITATION_NOT_FOUND', 'Invitation not found.', 404);
    }

    const invitation = row as ServiceInvitationRow;
    if (invitation.status !== 'pending') {
      throw new InvitationServiceError('INVITATION_ALREADY_RESPONDED', 'This invitation was already processed.', 409);
    }

    const { error: updateError } = await args.userSupabase
      .from('space_invitations')
      .update({
        status: 'revoked',
        updated_at: new Date().toISOString(),
      })
      .eq('id', args.invitationId)
      .eq('status', 'pending');

    if (updateError) {
      throw updateError;
    }

    await resolveInvitationNotification(admin, args.invitationId, 'revoked');
    await insertActivityLog({
      admin,
      userId: args.ownerUserId,
      action: 'invitation_revoked',
      entityType: 'space_invitations',
      entityId: args.invitationId,
      previousValue: {
        status: 'pending',
      },
      newValue: {
        status: 'revoked',
      },
    });

    return { ok: true as const };
  } catch (error) {
    throw mapInvitationError(error);
  }
}

export function toInvitationErrorResponse(error: unknown) {
  const mapped = mapInvitationError(error);
  const referenceId = mapped.status >= 500 ? buildInvitationReferenceId() : null;

  if (mapped.status >= 500) {
    console.error('[space-invitations:unexpected]', {
      referenceId,
      code: mapped.code,
      message: mapped.message,
    });
  }

  return {
    status: mapped.status,
    body: {
      error: referenceId
        ? `${mapped.message} Reference: ${referenceId}`
        : mapped.message,
      code: mapped.code,
      referenceId,
    },
  };
}
