'use client';
import { createClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/people';

export type SpaceRole = 'owner' | 'manager' | 'contributor' | 'viewer' | 'dependent';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface Space {
  id: string;
  owner_id: string;
  name: string;
  space_type: 'personal' | 'family' | 'household' | 'child' | 'friend' | 'custom';
  description: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SpaceMember {
  id: string;
  space_id: string;
  user_id: string;
  role: SpaceRole;
  joined_at: string;
  created_at: string;
  user_profile?: {
    full_name: string;
    email: string;
    avatar_url: string | null;
  };
}

export interface SpaceInvitation {
  id: string;
  space_id: string;
  invited_by: string;
  email: string;
  role: SpaceRole;
  status: InvitationStatus;
  token: string;
  expires_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  space?: { name: string; color: string | null };
  inviter?: { full_name: string };
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

  await logActivity(user.id, 'space_created', 'spaces', data.id, null, { name: data.name });
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

  await logActivity(user.id, 'space_updated', 'spaces', id, null, payload);
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

  await logActivity(user.id, 'space_archived', 'spaces', id, null, null);
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
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('space_invitations')
    .insert({
      space_id: spaceId,
      invited_by: user.id,
      email: email.toLowerCase().trim(),
      role,
    })
    .select()
    .single();
  if (error) throw error;

  await logActivity(user.id, 'member_invited', 'space_invitations', data.id, null, { email, role });
  return data as SpaceInvitation;
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('space_invitations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', invitationId);
  if (error) throw error;

  await logActivity(user.id, 'invitation_revoked', 'space_invitations', invitationId, null, null);
}

export async function getInvitationByToken(token: string): Promise<SpaceInvitation | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('space_invitations')
    .select(`
      *,
      space:spaces(name, color),
      inviter:user_profiles!space_invitations_invited_by_fkey(full_name)
    `)
    .eq('token', token)
    .single();
  if (error) return null;
  return data as SpaceInvitation;
}

export async function respondToInvitation(
  invitationId: string,
  response: 'accepted' | 'declined'
): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Fetch invitation to verify
  const { data: inv, error: fetchErr } = await supabase
    .from('space_invitations')
    .select('*')
    .eq('id', invitationId)
    .single();
  if (fetchErr || !inv) throw new Error('Invitation not found');

  // Verify JWT email matches invitation email
  const { data: { session } } = await supabase.auth.getSession();
  const jwtEmail = session?.user?.email?.toLowerCase();
  if (!jwtEmail || jwtEmail !== inv.email.toLowerCase()) {
    throw new Error('This invitation was sent to a different email address');
  }

  if (inv.status !== 'pending') throw new Error(`Invitation is already ${inv.status}`);
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    throw new Error('This invitation has expired');
  }

  // Update only status and responded_at — never touch protected fields
  const { error: updateErr } = await supabase
    .from('space_invitations')
    .update({
      status: response,
      responded_at: new Date().toISOString(),
    })
    .eq('id', invitationId);
  if (updateErr) throw updateErr;

  // If accepted, add to space_members (prevent duplicate)
  if (response === 'accepted') {
    const { data: existing } = await supabase
      .from('space_members')
      .select('id')
      .eq('space_id', inv.space_id)
      .eq('user_id', user.id)
      .single();

    if (!existing) {
      const { error: memberErr } = await supabase
        .from('space_members')
        .insert({
          space_id: inv.space_id,
          user_id: user.id,
          role: inv.role,
        });
      if (memberErr) throw memberErr;
    }
  }

  await logActivity(user.id, `invitation_${response}`, 'space_invitations', invitationId, null, { response });
}

export async function getMyPendingInvitations(): Promise<SpaceInvitation[]> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const email = session.user.email?.toLowerCase();
  if (!email) return [];

  const { data, error } = await supabase
    .from('space_invitations')
    .select(`
      *,
      space:spaces(name, color),
      inviter:user_profiles!space_invitations_invited_by_fkey(full_name)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) return [];
  // Filter client-side by email match (RLS already filters by JWT email)
  return ((data || []) as SpaceInvitation[]).filter(
    (inv) => inv.email.toLowerCase() === email
  );
}
