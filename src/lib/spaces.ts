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
    .from('space_members')
    .select(`
      *,
      user_profile:user_profiles(full_name, email, avatar_url)
    `)
    .eq('space_id', spaceId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as SpaceMember[];
}

export async function updateSpaceMemberRole(memberId: string, role: SpaceRole): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('space_members')
    .update({ role })
    .eq('id', memberId);
  if (error) throw error;
}

export async function removeSpaceMember(memberId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('space_members')
    .delete()
    .eq('id', memberId);
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
