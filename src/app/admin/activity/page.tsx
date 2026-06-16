'use client';
import React, { useState } from 'react';
import { Activity, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const MOCK_ACTIVITY = [
  { id: 'a1', event: 'user.login', user: 'admin@smartpocket.app', ip: '192.168.1.1', timestamp: '2026-06-15 14:30:00', status: 'success' },
  { id: 'a2', event: 'user.signup', user: 'new@example.com', ip: '10.0.0.5', timestamp: '2026-06-15 13:15:00', status: 'success' },
  { id: 'a3', event: 'auth.password_reset', user: 'user@example.com', ip: '172.16.0.2', timestamp: '2026-06-15 11:00:00', status: 'success' },
  { id: 'a4', event: 'admin.settings_updated', user: 'admin@smartpocket.app', ip: '192.168.1.1', timestamp: '2026-06-15 10:45:00', status: 'success' },
  { id: 'a5', event: 'user.login_failed', user: 'unknown@example.com', ip: '203.0.113.1', timestamp: '2026-06-15 09:30:00', status: 'failed' },
];

const EVENT_COLORS: Record<string, string> = {
  'user.login': 'bg-positive-soft text-positive',
  'user.signup': 'bg-info-soft text-info',
  'auth.password_reset': 'bg-warning-soft text-warning',
  'admin.settings_updated': 'bg-accent/10 text-accent',
  'user.login_failed': 'bg-negative-soft text-negative',
};

export default function AdminActivityPage() {
  const [search, setSearch] = useState('');

  const filtered = MOCK_ACTIVITY.filter((a) =>
    !search ||
    a.event.toLowerCase().includes(search.toLowerCase()) ||
    a.user.toLowerCase().includes(search.toLowerCase())
  );

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Activity Log</h1>
            <p className="text-sm text-muted-foreground mt-0.5">System events, user actions, and audit trail</p>
          </div>
          <button onClick={() => toast.info('Refreshing activity log...')} className="btn-secondary">
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* Search */}
        <div className="card-elevated p-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search events or users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-base pl-9 h-9 text-sm"
            />
          </div>
        </div>

        {/* Activity Table */}
        <div className="card-elevated overflow-hidden">
          <div className="p-4 border-b border-border">
            <h2 className="text-base font-700 text-foreground">Recent Events</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Event</th>
                  <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">User</th>
                  <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">IP Address</th>
                  <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Timestamp</th>
                  <th className="px-4 py-3 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`text-xs font-600 px-2 py-0.5 rounded-full ${EVENT_COLORS[item.event] || 'bg-muted text-muted-foreground'}`}>
                        {item.event}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{item.user}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{item.ip}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.timestamp}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-600 px-2 py-0.5 rounded-full ${
                        item.status === 'success' ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Activity log integration with Supabase audit tables requires Phase 2 edge functions.
        </p>
      </div>
  );
}
