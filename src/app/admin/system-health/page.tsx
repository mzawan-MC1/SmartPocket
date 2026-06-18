'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface ExchangeRateStatusPayload {
  configured: boolean;
  summary?: {
    provider: string | null;
    baseCurrency: string | null;
    rateDate: string | null;
    fetchedAt: string | null;
    providerTimestamp: string | null;
    rateCount: number;
    freshness: 'fresh' | 'stale' | 'unavailable';
    stale: boolean;
    lastFailureMessage: string | null;
  };
  latestRun?: {
    started_at: string;
    completed_at: string | null;
    status: string;
    rate_count: number | null;
    error_message: string | null;
  } | null;
  error?: string;
}

export default function AdminSystemHealthPage() {
  const [status, setStatus] = useState<ExchangeRateStatusPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/exchange-rates/status', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load exchange-rate status');
      }
      setStatus(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load exchange-rate status';
      setStatus({
        configured: false,
        error: message,
      });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const refreshRates = async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/admin/exchange-rates/status', {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'Exchange-rate refresh failed');
      }
      toast.success('Exchange rates refreshed successfully');
      await loadStatus();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Exchange-rate refresh failed');
    } finally {
      setRefreshing(false);
    }
  };

  const summary = status?.summary;
  const latestRun = status?.latestRun;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-700 text-foreground tracking-tight">System Health</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Provider status and operational checks</p>
      </div>

      <div className="card-elevated p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-600 text-foreground">Exchange Rates</p>
            <p className="text-xs text-muted-foreground mt-1">
              Cached provider status, sync freshness, and last operational result.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshRates()}
            disabled={loading || refreshing}
            className="btn-secondary text-sm"
          >
            {refreshing ? <><Loader2 size={14} className="animate-spin" />Refreshing...</> : <><RefreshCw size={14} />Refresh Rates</>}
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">
            Loading exchange-rate status...
          </div>
        ) : !status?.configured || !summary ? (
          <div className="rounded-xl border border-warning/30 bg-warning-soft/20 p-4">
            <p className="text-sm font-600 text-foreground">Exchange-rate status is unavailable.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {status?.error || 'The admin route could not load the latest exchange-rate summary.'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border p-4">
                <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Provider</p>
                <p className="mt-1 text-sm font-700 text-foreground">{summary.provider || 'Unavailable'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Base currency: {summary.baseCurrency || '—'}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Latest Sync</p>
                <p className="mt-1 text-sm font-700 text-foreground">{summary.fetchedAt || 'Unavailable'}</p>
                <p className="mt-1 text-xs text-muted-foreground">Provider timestamp: {summary.providerTimestamp || '—'}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Snapshot</p>
                <p className="mt-1 text-sm font-700 text-foreground">{summary.rateDate || 'Unavailable'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{summary.rateCount} rates cached</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Freshness</p>
                <p className={`mt-1 text-sm font-700 ${summary.freshness === 'fresh' ? 'text-positive' : summary.freshness === 'stale' ? 'text-warning' : 'text-negative'}`}>
                  {summary.freshness}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {summary.stale ? 'Review sync timing or provider health.' : 'Rates are within the fresh window.'}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border p-4 space-y-2">
              <p className="text-sm font-600 text-foreground">Operational History</p>
              <p className="text-xs text-muted-foreground">
                Latest run status: {latestRun?.status || 'Unavailable'}
              </p>
              <p className="text-xs text-muted-foreground">
                Started: {latestRun?.started_at || '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                Completed: {latestRun?.completed_at || '—'}
              </p>
              {summary.lastFailureMessage ? (
                <p className="text-xs text-warning">Last failure: {summary.lastFailureMessage}</p>
              ) : (
                <p className="text-xs text-muted-foreground">No recorded sync failures.</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
