'use client';
import React, { useState, useEffect } from 'react';
import { Users, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import SearchField from '@/components/ui/SearchField';


interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  preferred_language: string;
  default_currency: string;
  created_at: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err?.message);
    } finally {
      setIsLoading(false);
    }
  };

  const filtered = users.filter((u) =>
    !search ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground mt-0.5">View and manage registered users</p>
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

        {/* Users Table */}
        <div className="card-elevated overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={24} className="animate-spin text-accent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={40} className="text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm font-600 text-foreground mb-1">No users found</p>
              <p className="text-xs text-muted-foreground">Users will appear here after they sign up</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">User</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Role</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Language</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Currency</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full gradient-teal flex items-center justify-center text-white text-xs font-700 flex-shrink-0">
                            {(u.full_name || u.email || '?')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-600 text-foreground">{u.full_name || '—'}</p>
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
                      <td className="px-4 py-3 text-sm text-foreground">{(u.preferred_language || 'en').toUpperCase()}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{u.default_currency || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-600 px-2 py-0.5 rounded-full ${
                          u.is_active ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'
                        }`}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
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
