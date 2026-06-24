'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';

type DeliveryLog = {
  id: string;
  event_key: string;
  template_key: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  status: 'queued' | 'sent' | 'failed' | 'skipped';
  provider_message_id: string | null;
  error_message: string | null;
  retry_count: number;
  user_id: string | null;
  subscription_id: string | null;
  payment_id: string | null;
  created_at: string;
  sent_at: string | null;
};

export default function AdminEmailLogsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [logs, setLogs] = useState<DeliveryLog[]>([]);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = async (showSpinner: boolean) => {
    if (showSpinner) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const qs = new URLSearchParams();
      qs.set('limit', '100');
      if (statusFilter !== 'all') {
        qs.set('status', statusFilter);
      }
      const res = await fetch(`/api/admin/email/delivery-logs?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to load logs.');
      setLogs((json?.logs || []) as DeliveryLog[]);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load logs.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, [statusFilter]);

  const resend = async (logId: string) => {
    setResendingId(logId);
    try {
      const res = await fetch('/api/admin/email/resend', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ logId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Failed to resend.');
      toast.success('Resend requested');
      await load(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to resend.');
    } finally {
      setResendingId(null);
    }
  };

  const rows = useMemo(() => logs, [logs]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={22} className="animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-700 text-foreground">Email delivery logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Audit sent, failed, and skipped messages with safe retry control.</p>
        </div>
        <button
          onClick={() => void load(false)}
          disabled={isRefreshing}
          className="btn-secondary"
        >
          {isRefreshing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          Refresh
        </button>
      </div>

      <div className="card-elevated p-4 flex items-center gap-3">
        <label className="text-sm font-600 text-foreground">Status</label>
        <select
          className="input-base w-56"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="queued">Queued</option>
          <option value="skipped">Skipped</option>
        </select>
      </div>

      <div className="card-elevated overflow-hidden">
        <div className="overflow-auto">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-4 py-3 font-700 text-foreground">Date</th>
                <th className="px-4 py-3 font-700 text-foreground">Template</th>
                <th className="px-4 py-3 font-700 text-foreground">Recipient</th>
                <th className="px-4 py-3 font-700 text-foreground">Subject</th>
                <th className="px-4 py-3 font-700 text-foreground">Status</th>
                <th className="px-4 py-3 font-700 text-foreground">Provider ID</th>
                <th className="px-4 py-3 font-700 text-foreground">Retries</th>
                <th className="px-4 py-3 font-700 text-foreground">Links</th>
                <th className="px-4 py-3 font-700 text-foreground">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <tr key={log.id} className="border-t border-border">
                  <td className="px-4 py-3 text-muted-foreground">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="font-600 text-foreground">{log.template_key}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[320px]">{log.event_key}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-600 text-foreground">{log.recipient_email}</div>
                    {log.error_message ? <div className="text-xs text-negative mt-1">{log.error_message}</div> : null}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div className="truncate max-w-[260px]" title={log.subject}>{log.subject}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      log.status === 'sent'
                        ? 'bg-positive-soft text-positive'
                        : log.status === 'failed'
                          ? 'bg-negative-soft text-negative'
                          : log.status === 'queued'
                            ? 'bg-warning-soft text-warning'
                            : 'bg-muted text-muted-foreground'
                    }`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{log.provider_message_id || '-'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.retry_count}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <div className="truncate max-w-[240px]">user: {log.user_id || '-'}</div>
                    <div className="truncate max-w-[240px]">sub: {log.subscription_id || '-'}</div>
                    <div className="truncate max-w-[240px]">pay: {log.payment_id || '-'}</div>
                  </td>
                  <td className="px-4 py-3">
                    {log.status === 'failed' ? (
                      <button
                        className="btn-secondary"
                        onClick={() => void resend(log.id)}
                        disabled={resendingId === log.id}
                      >
                        {resendingId === log.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        Resend
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-muted-foreground" colSpan={9}>No delivery logs found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
