'use client';

import { createClient } from '@/lib/supabase/client';
import {
  normalizeInvitationEmail,
  type Space,
  type SpaceInvitation,
  type SpaceInvitationCreateResult,
  type SpaceInvitationRespondResult,
  type SpaceMember,
  type SpaceRole,
} from '@/lib/spaces-shared';

export type {
  InvitationStatus,
  Space,
  SpaceInvitation,
  SpaceInvitationCreateResult,
  SpaceInvitationRespondResult,
  SpaceMember,
  SpaceRole,
} from '@/lib/spaces-shared';

export const SPACE_MEMBER_ASSIGNABLE_ROLES: readonly SpaceRole[] = ['manager', 'contributor', 'viewer', 'dependent'];

type SpaceMemberPermissionArgs = {
  actorRole: SpaceRole | null;
  actorUserId: string | null;
  targetMember: Pick<SpaceMember, 'role' | 'user_id'> | null | undefined;
};

function canManageTargetSpaceMember({ actorRole, actorUserId, targetMember }: SpaceMemberPermissionArgs) {
  if (!actorRole || !actorUserId || !targetMember) {
    return false;
  }

  if (targetMember.user_id === actorUserId) {
    return false;
  }

  if (targetMember.role === 'owner') {
    return false;
  }

  return actorRole === 'owner';
}

export function canManageSpaceMemberRole(args: SpaceMemberPermissionArgs) {
  return canManageTargetSpaceMember(args);
}

export function canRemoveSpaceMember(args: SpaceMemberPermissionArgs) {
  return canManageTargetSpaceMember(args);
}

async function logSpaceActivity(
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  previousValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null
) {
  try {
    const supabase = createClient();
    await supabase.from('activity_logs').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      previous_value: previousValue,
      new_value: newValue,
    });
  } catch {
    // Activity logs must not break the primary user action.
  }
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : typeof payload?.error?.message === 'string'
        ? payload.error.message
        : 'Request failed';
    throw new Error(message);
  }
  return payload as T;
}

// ─── Spaces CRUD ──────────────────────────────────────────────────────────────

export async function getSpaces(): Promise<Space[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('spaces')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as Space[];
}

export async function getMySpaceMemberships(): Promise<Array<{ space: Space; role: SpaceRole }>> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('space_members')
    .select(`
      role,
      space:spaces(*)
    `)
    .order('created_at', { ascending: true });
  if (error) throw error;

  return ((data || []) as Array<{ role: SpaceRole; space: Space | null }>)
    .filter((row) => !!row.space)
    .map((row) => ({
      role: row.role,
      space: row.space as Space,
    }));
}

export async function createSpace(payload: Partial<Space>): Promise<Space> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('spaces')
    .insert({ ...payload, owner_id: user.id })
    .select()
    .single();
  if (error) throw error;

  // Add owner as member
  await supabase.from('space_members').insert({
    space_id: data.id,
    user_id: user.id,
    role: 'owner',
  });

  await logSpaceActivity(user.id, 'space_created', 'spaces', data.id, null, { name: data.name });
  return data as Space;
}

export async function updateSpace(id: string, payload: Partial<Space>): Promise<Space> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('spaces')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  await logSpaceActivity(user.id, 'space_updated', 'spaces', id, null, payload);
  return data as Space;
}

export async function archiveSpace(id: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('spaces')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;

  await logSpaceActivity(user.id, 'space_archived', 'spaces', id, null, null);
}

// ─── Space Members ────────────────────────────────────────────────────────────

export async function getSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .rpc('rpc_get_space_members_with_profiles', {
      p_space_id: spaceId,
    });
  if (error) throw error;
  return ((data || []) as Array<SpaceMember & {
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  }>).map((member) => ({
    id: member.id,
    space_id: member.space_id,
    user_id: member.user_id,
    role: member.role,
    joined_at: member.joined_at,
    created_at: member.created_at,
    user_profile: {
      full_name: member.full_name || '',
      email: member.email || '',
      avatar_url: member.avatar_url || null,
    },
  }));
}

export async function updateSpaceMemberRole(spaceId: string, memberId: string, role: SpaceRole): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  if (!SPACE_MEMBER_ASSIGNABLE_ROLES.includes(role)) {
    throw new Error('Invalid member role.');
  }

  const members = await getSpaceMembers(spaceId);
  const actorMember = members.find((member) => member.user_id === user.id);
  const targetMember = members.find((member) => member.id === memberId);
  if (!targetMember) {
    throw new Error('Member not found.');
  }
  if (!canManageSpaceMemberRole({
    actorRole: actorMember?.role || null,
    actorUserId: user.id,
    targetMember,
  })) {
    throw new Error('You are not allowed to update this member role.');
  }

  const { error } = await supabase
    .from('space_members')
    .update({ role })
    .eq('id', memberId)
    .eq('space_id', spaceId);
  if (error) throw error;
}

export async function removeSpaceMember(spaceId: string, memberId: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const members = await getSpaceMembers(spaceId);
  const actorMember = members.find((member) => member.user_id === user.id);
  const targetMember = members.find((member) => member.id === memberId);
  if (!targetMember) {
    throw new Error('Member not found.');
  }
  if (!canRemoveSpaceMember({
    actorRole: actorMember?.role || null,
    actorUserId: user.id,
    targetMember,
  })) {
    throw new Error('You are not allowed to remove this member.');
  }

  const { error } = await supabase
    .from('space_members')
    .delete()
    .eq('id', memberId)
    .eq('space_id', spaceId);
  if (error) throw error;
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function getSpaceInvitations(spaceId: string): Promise<SpaceInvitation[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('space_invitations')
    .select('*')
    .eq('space_id', spaceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as SpaceInvitation[];
}

export async function inviteToSpace(spaceId: string, email: string, role: SpaceRole): Promise<SpaceInvitation> {
  const response = await fetch('/api/spaces/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spaceId,
      email: normalizeInvitationEmail(email),
      role,
    }),
  });
  const payload = await readJsonResponse<SpaceInvitationCreateResult>(response);
  return payload.invitation;
}

export async function inviteToSpaceDetailed(
  spaceId: string,
  email: string,
  role: SpaceRole
): Promise<SpaceInvitationCreateResult> {
  const response = await fetch('/api/spaces/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      spaceId,
      email: normalizeInvitationEmail(email),
      role,
    }),
  });
  return readJsonResponse<SpaceInvitationCreateResult>(response);
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const response = await fetch('/api/spaces/invitations/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitationId }),
  });
  await readJsonResponse<{ ok: true }>(response);
}

export async function getInvitationByToken(token: string): Promise<SpaceInvitation | null> {
  const response = await fetch(`/api/spaces/invitations/token?token=${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (response.status === 404) {
    return null;
  }
  const payload = await readJsonResponse<{ invitation: SpaceInvitation | null }>(response);
  return payload.invitation;
}

export async function respondToInvitation(
  invitationId: string,
  response: 'accepted' | 'declined',
  token?: string | null
): Promise<SpaceInvitationRespondResult> {
  const apiResponse = await fetch('/api/spaces/invitations/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invitationId,
      token: token || null,
      response,
    }),
  });
  return readJsonResponse<SpaceInvitationRespondResult>(apiResponse);
}

export async function getMyPendingInvitations(): Promise<SpaceInvitation[]> {
  const response = await fetch('/api/spaces/invitations/received', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  const payload = await readJsonResponse<{ invitations: SpaceInvitation[] }>(response);
  return payload.invitations;
}
