'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';

import { Home, Plus, Users, Mail, MoreVertical, Archive, Edit2, Crown, Shield, Eye, UserPlus, Clock, XCircle, Trash2 } from 'lucide-react';
import {
  getSpaces, createSpace, updateSpace, archiveSpace,
  getSpaceMembers, getSpaceInvitations, inviteToSpace, revokeInvitation,
  updateSpaceMemberRole, removeSpaceMember,
  type Space, type SpaceMember, type SpaceInvitation, type SpaceRole
} from '@/lib/spaces';
import { toast } from 'sonner';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';

const SPACE_TYPE_LABELS: Record<string, string> = {
  personal: 'Personal', family: 'Family', household: 'Household',
  child: 'Child', friend: 'Friend', custom: 'Custom',
};

const ROLE_LABELS: Record<SpaceRole, string> = {
  owner: 'Owner', manager: 'Manager', contributor: 'Contributor',
  viewer: 'Viewer', dependent: 'Dependent',
};

const ROLE_COLORS: Record<SpaceRole, string> = {
  owner: 'bg-accent/10 text-accent',
  manager: 'bg-positive-soft text-positive',
  contributor: 'bg-info-soft text-info',
  viewer: 'bg-muted text-muted-foreground',
  dependent: 'bg-warning-soft text-warning',
};

const ROLE_ICONS: Record<SpaceRole, React.ElementType> = {
  owner: Crown, manager: Shield, contributor: Edit2,
  viewer: Eye, dependent: Users,
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-soft text-warning',
  accepted: 'bg-positive-soft text-positive',
  declined: 'bg-negative-soft text-negative',
  revoked: 'bg-muted text-muted-foreground',
};

const SPACE_COLORS = ['#0f3460', '#00b4d8', '#7c3aed', '#059669', '#d97706', '#dc2626'];

interface SpaceFormData {
  name: string;
  space_type: Space['space_type'];
  description: string;
  color: string;
  icon: string;
}

const DEFAULT_FORM: SpaceFormData = {
  name: '', space_type: 'personal', description: '', color: '#0f3460', icon: 'Home',
};

export default function SpacesPage() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSpaceId, setActiveSpaceId] = useState<string | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [invitations, setInvitations] = useState<SpaceInvitation[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState<Space | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<SpaceRole>('viewer');
  const [form, setForm] = useState<SpaceFormData>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const loadSpaces = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getSpaces();
      setSpaces(data);
      if (data.length > 0 && !activeSpaceId) {
        setActiveSpaceId(data[0].id);
      }
    } catch {
      toast.error('Failed to load spaces');
    } finally {
      setLoading(false);
    }
  }, [activeSpaceId]);

  const loadSpaceDetails = useCallback(async (spaceId: string) => {
    setLoadingDetails(true);
    try {
      const [m, inv] = await Promise.all([
        getSpaceMembers(spaceId),
        getSpaceInvitations(spaceId),
      ]);
      setMembers(m);
      setInvitations(inv);
    } catch {
      toast.error('Failed to load space details');
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => { loadSpaces(); }, [loadSpaces]);
  useEffect(() => { if (activeSpaceId) loadSpaceDetails(activeSpaceId); }, [activeSpaceId, loadSpaceDetails]);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || null;

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Space name is required'); return; }
    setSaving(true);
    try {
      await createSpace(form);
      toast.success('Space created');
      setShowCreateModal(false);
      setForm(DEFAULT_FORM);
      loadSpaces();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to create space');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingSpace || !form.name.trim()) { toast.error('Space name is required'); return; }
    setSaving(true);
    try {
      await updateSpace(editingSpace.id, form);
      toast.success('Space updated');
      setEditingSpace(null);
      loadSpaces();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to update space');
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async (space: Space) => {
    if (!confirm(`Archive "${space.name}"? Members will lose access.`)) return;
    try {
      await archiveSpace(space.id);
      toast.success('Space archived');
      if (activeSpaceId === space.id) setActiveSpaceId(null);
      loadSpaces();
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to archive');
    }
    setOpenMenuId(null);
  };

  const handleInvite = async () => {
    if (!activeSpaceId || !inviteEmail.trim()) { toast.error('Email is required'); return; }
    setSaving(true);
    try {
      await inviteToSpace(activeSpaceId, inviteEmail.trim(), inviteRole);
      toast.success(`Invitation sent to ${inviteEmail}`);
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('viewer');
      loadSpaceDetails(activeSpaceId);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to send invitation');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (invId: string) => {
    if (!confirm('Revoke this invitation?')) return;
    try {
      await revokeInvitation(invId);
      toast.success('Invitation revoked');
      if (activeSpaceId) loadSpaceDetails(activeSpaceId);
    } catch {
      toast.error('Failed to revoke invitation');
    }
  };

  const handleRoleChange = async (memberId: string, newRole: SpaceRole) => {
    try {
      await updateSpaceMemberRole(memberId, newRole);
      toast.success('Role updated');
      if (activeSpaceId) loadSpaceDetails(activeSpaceId);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to update role');
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this space?`)) return;
    try {
      await removeSpaceMember(memberId);
      toast.success('Member removed');
      if (activeSpaceId) loadSpaceDetails(activeSpaceId);
    } catch (e: unknown) {
      toast.error((e as Error).message || 'Failed to remove member');
    }
  };

  const openEdit = (space: Space) => {
    setEditingSpace(space);
    setForm({
      name: space.name,
      space_type: space.space_type,
      description: space.description || '',
      color: space.color || '#0f3460',
      icon: space.icon || 'Home',
    });
    setOpenMenuId(null);
  };

  const pendingInvitations = invitations.filter((i) => i.status === 'pending');

  return (
    <AppLayout activeRoute="/spaces">
      <div className="page-section pb-6">
        <PageHeader
          title="Spaces"
          description="Manage shared financial spaces, invitations, and member roles."
          badge={<StatusBadge status="info" label="Shared spaces" />}
          actions={
            <button
              onClick={() => { setForm(DEFAULT_FORM); setShowCreateModal(true); }}
              className="btn-primary"
            >
              <Plus size={16} />
              <span>New Space</span>
            </button>
          }
        />

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="card p-4 animate-pulse h-20 bg-muted" />
            ))}
          </div>
        ) : spaces.length === 0 ? (
          <div className="card p-12 text-center">
            <Home size={48} className="mx-auto text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-600 text-foreground mb-2">No spaces yet</h3>
            <p className="text-sm text-muted-foreground mb-6">Create a shared space for family, household, or friends</p>
            <button
              onClick={() => { setForm(DEFAULT_FORM); setShowCreateModal(true); }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow"
            >
              <Plus size={16} /> Create First Space
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Space List */}
            <div className="space-y-2">
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground px-1 mb-3">Your Spaces</p>
              {spaces.map((space) => (
                <div
                  key={space.id}
                  onClick={() => setActiveSpaceId(space.id)}
                  className={`card p-4 cursor-pointer transition-all ${activeSpaceId === space.id ? 'ring-2 ring-accent' : 'hover:shadow-card-md'}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg flex-shrink-0"
                      style={{ backgroundColor: space.color || '#0f3460' }}
                    >
                      <Home size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-600 text-foreground truncate">{space.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{SPACE_TYPE_LABELS[space.space_type]}</p>
                    </div>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === space.id ? null : space.id); }}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                      >
                        <MoreVertical size={15} />
                      </button>
                      {openMenuId === space.id && (
                        <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-xl shadow-card-md py-1 min-w-[140px]">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEdit(space); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted"
                          >
                            <Edit2 size={14} /> Edit
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleArchive(space); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-negative hover:bg-muted"
                          >
                            <Archive size={14} /> Archive
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Space Detail */}
            <div className="lg:col-span-2 space-y-4">
              {activeSpace ? (
                <>
                  {/* Space Header */}
                  <div className="card p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                          style={{ backgroundColor: activeSpace.color || '#0f3460' }}
                        >
                          <Home size={22} />
                        </div>
                        <div>
                          <h2 className="text-lg font-700 text-foreground">{activeSpace.name}</h2>
                          <p className="text-sm text-muted-foreground capitalize">{SPACE_TYPE_LABELS[activeSpace.space_type]}</p>
                          {activeSpace.description && (
                            <p className="text-xs text-muted-foreground mt-1">{activeSpace.description}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setShowInviteModal(true)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-600 text-foreground hover:bg-muted transition-colors"
                      >
                        <UserPlus size={15} /> Invite
                      </button>
                    </div>
                  </div>

                  {loadingDetails ? (
                    <div className="card p-6 animate-pulse h-32 bg-muted" />
                  ) : (
                    <>
                      {/* Members */}
                      <div className="card p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-700 text-foreground flex items-center gap-2">
                            <Users size={16} className="text-accent" />
                            Members ({members.length})
                          </h3>
                        </div>
                        {members.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">No members yet</p>
                        ) : (
                          <div className="space-y-3">
                            {members.map((member) => {
                              const RoleIcon = ROLE_ICONS[member.role] || Users;
                              return (
                                <div key={member.id} className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full gradient-teal flex items-center justify-center text-white text-sm font-700 flex-shrink-0">
                                    {(member.user_profile?.full_name || 'U').charAt(0).toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-600 text-foreground truncate">
                                      {member.user_profile?.full_name || 'Unknown User'}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {member.user_profile?.email || ''}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {member.role !== 'owner' ? (
                                      <select
                                        value={member.role}
                                        onChange={(e) => handleRoleChange(member.id, e.target.value as SpaceRole)}
                                        className="text-xs px-2 py-1 rounded-lg border border-border bg-card focus:outline-none focus:ring-1 focus:ring-accent/30"
                                      >
                                        {(['manager', 'contributor', 'viewer', 'dependent'] as SpaceRole[]).map((r) => (
                                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-500 flex items-center gap-1 ${ROLE_COLORS[member.role]}`}>
                                        <RoleIcon size={11} /> {ROLE_LABELS[member.role]}
                                      </span>
                                    )}
                                    {member.role !== 'owner' && (
                                      <button
                                        onClick={() => handleRemoveMember(member.id, member.user_profile?.full_name || 'member')}
                                        className="p-1 rounded text-muted-foreground hover:text-negative transition-colors"
                                        title="Remove member"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Invitations */}
                      <div className="card p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-sm font-700 text-foreground flex items-center gap-2">
                            <Mail size={16} className="text-accent" />
                            Invitations ({invitations.length})
                          </h3>
                        </div>
                        {invitations.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">No invitations sent</p>
                        ) : (
                          <div className="space-y-3">
                            {invitations.map((inv) => (
                              <div key={inv.id} className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                                  <Mail size={15} className="text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-600 text-foreground truncate">{inv.email}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-500 ${STATUS_COLORS[inv.status] || 'bg-muted text-muted-foreground'}`}>
                                      {inv.status}
                                    </span>
                                    <span className="text-xs text-muted-foreground capitalize">{ROLE_LABELS[inv.role]}</span>
                                    {inv.expires_at && (
                                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                                        <Clock size={10} /> {new Date(inv.expires_at) < new Date() ? 'Expired' : `Expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {inv.status === 'pending' && (
                                  <button
                                    onClick={() => handleRevoke(inv.id)}
                                    className="text-xs text-negative font-600 hover:underline flex items-center gap-1"
                                  >
                                    <XCircle size={13} /> Revoke
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="card p-12 text-center">
                  <Home size={40} className="mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground">Select a space to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingSpace) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-card-md w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-700 text-foreground">{editingSpace ? 'Edit Space' : 'Create Space'}</h3>
              <button onClick={() => { setShowCreateModal(false); setEditingSpace(null); }} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Name *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Family Finances"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Type</label>
              <select
                value={form.space_type}
                onChange={(e) => setForm({ ...form, space_type: e.target.value as Space['space_type'] })}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {Object.entries(SPACE_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Color</label>
              <div className="flex gap-2 flex-wrap">
                {SPACE_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    className={`w-8 h-8 rounded-lg transition-transform ${form.color === c ? 'scale-110 ring-2 ring-offset-2 ring-accent' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowCreateModal(false); setEditingSpace(null); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingSpace ? handleUpdate : handleCreate}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingSpace ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
          <div className="bg-card rounded-2xl shadow-card-md w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-700 text-foreground">Invite Member</h3>
              <button onClick={() => setShowInviteModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Email Address *</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Role</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as SpaceRole)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              >
                {(['manager', 'contributor', 'viewer', 'dependent'] as SpaceRole[]).map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1.5">
                {inviteRole === 'manager' && 'Can manage people, transactions, budgets, reimbursements and settlements'}
                {inviteRole === 'contributor' && 'Can create and edit permitted financial records'}
                {inviteRole === 'viewer' && 'Read-only access to space data'}
                {inviteRole === 'dependent' && 'No authenticated access unless linked later'}
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? 'Sending...' : 'Send Invitation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
