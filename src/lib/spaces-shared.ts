export const SPACE_ROLES = ['owner', 'manager', 'contributor', 'viewer', 'dependent'] as const;
export type SpaceRole = (typeof SPACE_ROLES)[number];

export const INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'revoked'] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

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
  invited_user_id?: string | null;
  email: string;
  role: SpaceRole;
  status: InvitationStatus;
  token: string;
  expires_at: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
  space?: {
    id?: string;
    name: string;
    color: string | null;
    is_active?: boolean;
  };
  inviter?: {
    full_name: string | null;
    email?: string | null;
  };
  is_expired?: boolean;
  space_available?: boolean;
}

export interface SpaceInvitationCreateResult {
  invitation: SpaceInvitation;
  notificationStatus: 'created' | 'existing' | 'skipped';
  emailStatus: 'sent' | 'failed' | 'skipped';
  warning: string | null;
}

export interface SpaceInvitationRespondResult {
  invitationId: string;
  spaceId: string | null;
  status: 'accepted' | 'declined';
  membershipCreated: boolean;
  alreadyMember: boolean;
}

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isSpaceRole(value: string): value is SpaceRole {
  return (SPACE_ROLES as readonly string[]).includes(value);
}
