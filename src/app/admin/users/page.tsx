'use client';
import React, { useState, useEffect } from 'react';
import { Shield, Users, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import SearchField from '@/components/ui/SearchField';

interface AdminUserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  language: string | null;
  currency: string | null;
  is_active: boolean;
  email_verified: boolean;
  created_at: string | null;
  last_sign_in_at: string | null;
}

type UserSection = 'administrators' | 'users';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [section, setSection] = useState<UserSection>('administrators');

  useEffect(() => {
    void loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to load users.');
      }

      setUsers(Array.isArray(json?.users) ? json.users : []);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err?.message);
    } finally {
      setIsLoading(false);
    }
  };

  const administrators = users.filter((user) => user.role === 'admin');
  const regularUsers = users.filter((user) => user.role !== 'admin');
  const visibleUsers = section === 'administrators' ? administrators : regularUsers;
  const filtered = visibleUsers.filter((u) =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.name?.toLowerCase().includes(search.toLowerCase())
  );

  const emptyLabel = section === 'administrators' ? 'No administrators found' : 'No users found';
  const emptyDescription =
    section === 'administrators'
      ? 'Administrators with role = admin will appear here.'
      : 'Registered non-admin users will appear here after they sign up.';

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">View all registered accounts from Supabase Auth and profile data</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{users.length} total users</span>
          </div>
        </div>

        {/* Search */}
        <div className="card-elevated p-4">
          <SearchField
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            inputClassName="h-9"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setSection('administrators')}
            className={`card-elevated flex items-center justify-between p-4 text-left transition-colors ${
              section === 'administrators' ? 'border-accent bg-accent/5' : 'hover:border-accent/40'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <Shield size={18} />
              </div>
              <div>
                <p className="text-sm font-700 text-foreground">Administrators</p>
                <p className="text-xs text-muted-foreground">Role = admin</p>
              </div>
            </div>
            <span className="rounded-full bg-card px-2.5 py-1 text-xs font-700 text-foreground">
              {administrators.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSection('users')}
            className={`card-elevated flex items-center justify-between p-4 text-left transition-colors ${
              section === 'users' ? 'border-accent bg-accent/5' : 'hover:border-accent/40'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Users size={18} />
              </div>
              <div>
                <p className="text-sm font-700 text-foreground">Users</p>
                <p className="text-xs text-muted-foreground">All non-admin accounts</p>
              </div>
            </div>
            <span className="rounded-full bg-card px-2.5 py-1 text-xs font-700 text-foreground">
              {regularUsers.length}
            </span>
          </button>
        </div>

        {/* Users Table */}
        <div className="card-elevated overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={40} className="text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm font-600 text-foreground mb-1">{emptyLabel}</p>
              <p className="text-xs text-muted-foreground">{emptyDescription}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">User</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Role</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Language</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Currency</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Email</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Joined</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Last sign-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full gradient-teal flex items-center justify-center text-white text-xs font-700 flex-shrink-0">
                            {(u.name || u.email || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-600 text-foreground">{u.name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-600 px-2 py-0.5 rounded-full ${
                          u.role === 'admin' ? 'bg-accent/10 text-accent' : 'bg-muted text-muted-foreground'
                        }`}>
                          {u.role || 'user'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-foreground">{(u.language || 'en').toUpperCase()}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{u.currency || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-600 px-2 py-0.5 rounded-full ${
                          u.is_active ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'
                        }`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-600 px-2 py-0.5 rounded-full ${
                          u.email_verified ? 'bg-positive-soft text-positive' : 'bg-warning/10 text-warning'
                        }`}>
                          {u.email_verified ? 'Verified' : 'Pending'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Admin Note */}
        <div className="card-elevated p-4 border-l-4 border-accent">
          <p className="text-sm text-foreground font-600 mb-1">To grant admin access</p>
          <p className="text-xs text-muted-foreground">
            Go to Supabase Dashboard → Authentication → Users → Edit user → App Metadata and set:{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-xs">{`{"role": "admin"}`}</code>
          </p>
        </div>
      </div>
  );
}
