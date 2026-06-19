'use client';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Zap, Calendar, TrendingUp, AlertTriangle, CheckCircle, XCircle, RefreshCw, ArrowUpRight, Clock, History } from 'lucide-react';
import { useSmartPocketDataChanged } from '@/lib/data-change';

interface SubscriptionSummary {
  has_subscription: boolean;
  plan_name?: string;
  plan_code?: string;
  status?: string;
  trial_ends_at?: string;
  current_period_end?: string;
  monthly_ai_credits?: number;
  daily_ai_request_limit?: number;
  monthly_voice_seconds?: number;
  text_ai_enabled?: boolean;
  voice_ai_enabled?: boolean;
  ai_history_enabled?: boolean;
  credits_allocated?: number;
  credits_consumed?: number;
  credits_reserved?: number;
  credits_refunded?: number;
  voice_seconds_used?: number;
  requests_today?: number;
  cycle_start?: string;
  cycle_end?: string;
}

type SummaryFetchResult = {
  status: number;
  data: SubscriptionSummary | null;
};

let cachedSummaryResult: SummaryFetchResult | null = null;
let inFlightSummaryRequest: Promise<SummaryFetchResult> | null = null;

async function fetchSubscriptionSummary(force = false): Promise<SummaryFetchResult> {
  if (force) {
    cachedSummaryResult = null;
    inFlightSummaryRequest = null;
  }

  if (cachedSummaryResult) {
    return cachedSummaryResult;
  }

  if (inFlightSummaryRequest) {
    return inFlightSummaryRequest;
  }

  inFlightSummaryRequest = fetch('/api/subscription/summary', {
    cache: 'no-store',
  })
    .then(async (res) => {
      const contentType = res.headers.get('content-type') || '';
      const data = contentType.includes('application/json')
        ? (await res.json()) as SubscriptionSummary
        : null;

      const result = {
        status: res.status,
        data: res.ok ? data : null,
      };

      if (res.ok || res.status === 401) {
        cachedSummaryResult = result;
      }

      return result;
    })
    .catch(() => ({ status: 0, data: null }))
    .finally(() => {
      inFlightSummaryRequest = null;
    });

  return inFlightSummaryRequest;
}

function UsageBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const color =
    pct >= 100 ? 'bg-negative' :
    pct >= 95 ? 'bg-negative' :
    pct >= 80 ? 'bg-warning' :
    'bg-accent';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-600 text-foreground">{used} / {total}</span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WarningBanner({ pct }: { pct: number }) {
  if (pct < 80) return null;
  if (pct >= 100) return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-negative-soft border border-negative/20 text-negative text-xs font-600">
      <XCircle size={14} className="flex-shrink-0" />
      AI credits exhausted. Manual finance entry still available.
    </div>
  );
  if (pct >= 95) return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-warning-soft border border-warning/20 text-warning text-xs font-600">
      <AlertTriangle size={14} className="flex-shrink-0" />
      Only {100 - pct}% of AI credits remaining this month.
    </div>
  );
  return (
    <div className="flex items-center gap-2 p-3 rounded-xl bg-warning-soft border border-warning/20 text-warning text-xs font-600">
      <AlertTriangle size={14} className="flex-shrink-0" />
      80% of AI credits used this month.
    </div>
  );
}

export default function AIUsageCard() {
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUnavailable, setIsUnavailable] = useState(false);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    try {
      const result = await fetchSubscriptionSummary(force);

      if (result.status === 200) {
        setSummary(result.data);
        setIsUnavailable(result.data?.status === 'unavailable');
        return;
      }

      if (result.status === 401) {
        setSummary(null);
        setIsUnavailable(true);
        return;
      }

      setSummary(null);
      setIsUnavailable(true);
    } catch {
      setSummary(null);
      setIsUnavailable(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['ai_usage', 'dashboard', 'transactions', 'financial_accounts'], 'AIUsageCard', async () => {
    await load(true);
  });

  if (loading) {
    return (
      <div className="card-elevated animate-pulse p-4">
        <div className="h-4 bg-secondary rounded w-1/2 mb-4" />
        <div className="space-y-3">
          <div className="h-3 bg-secondary rounded" />
          <div className="h-3 bg-secondary rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!summary?.has_subscription) {
    return (
      <div className="card-elevated p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-accent" />
          <h3 className="text-sm font-700 text-foreground">AI Usage</h3>
        </div>
        {isUnavailable || summary?.status === 'unavailable' ? (
          <p className="text-xs text-muted-foreground mb-3">Usage is currently unavailable.</p>
        ) : (
        <p className="text-xs text-muted-foreground mb-3">No active subscription found.</p>
        )}
        <Link href="/pricing" className="btn-primary text-xs py-2 px-3 inline-flex items-center gap-1.5">
          View Plans <ArrowUpRight size={12} />
        </Link>
      </div>
    );
  }

  const creditsUsed = (summary.credits_consumed ?? 0) + (summary.credits_reserved ?? 0);
  const creditsTotal = summary.credits_allocated ?? 0;
  const creditsPct = creditsTotal > 0 ? Math.round((creditsUsed / creditsTotal) * 100) : 0;
  const creditsRemaining = Math.max(0, creditsTotal - creditsUsed);

  const voiceUsedMin = Math.round((summary.voice_seconds_used ?? 0) / 60);
  const voiceTotalMin = Math.round((summary.monthly_voice_seconds ?? 0) / 60);

  const isTrialing = summary.status === 'trialing';
  const trialDaysLeft = isTrialing && summary.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(summary.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;

  const resetDate = summary.cycle_end
    ? new Date(summary.cycle_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '—';

  return (
    <div className="card-elevated space-y-3 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Zap size={15} className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-700 text-foreground">AI Usage</h3>
            <p className="text-[11px] text-muted-foreground">{summary.plan_name}</p>
          </div>
        </div>
        <button onClick={() => void load(true)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" aria-label="Refresh">
          <RefreshCw size={13} className="text-muted-foreground" />
        </button>
      </div>

      {/* Warning banner */}
      <WarningBanner pct={creditsPct} />

      {/* Trial badge */}
      {isTrialing && trialDaysLeft !== null && (
        <div className="flex items-center gap-1.5 text-xs text-info font-600">
          <Clock size={12} />
          {trialDaysLeft > 0 ? `${trialDaysLeft} trial days remaining` : 'Trial expired'}
        </div>
      )}

      {/* Credit bars */}
      <div className="space-y-2.5">
        <UsageBar used={creditsUsed} total={creditsTotal} label="AI Credits" />
        {voiceTotalMin > 0 && (
          <UsageBar used={voiceUsedMin} total={voiceTotalMin} label="Voice minutes" />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-secondary/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Credits left</p>
          <p className={`text-base font-700 ${creditsRemaining === 0 ? 'text-negative' : 'text-foreground'}`}>
            {creditsRemaining}
          </p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Requests today</p>
          <p className="text-base font-700 text-foreground">
            {summary.requests_today ?? 0}
            <span className="text-xs font-400 text-muted-foreground">/{summary.daily_ai_request_limit ?? '—'}</span>
          </p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Reset date</p>
          <p className="text-sm font-600 text-foreground flex items-center gap-1">
            <Calendar size={11} className="text-muted-foreground" />
            {resetDate}
          </p>
        </div>
        <div className="rounded-xl bg-secondary/50 p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Status</p>
          <p className="text-sm font-600 text-foreground capitalize flex items-center gap-1">
            {summary.status === 'active' || summary.status === 'trialing'
              ? <CheckCircle size={11} className="text-positive" />
              : <XCircle size={11} className="text-negative" />}
            {summary.status}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {summary.ai_history_enabled && (
          <Link href="/ai-history" className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 flex-1 justify-center">
            <History size={12} />
            AI History
          </Link>
        )}
        {(summary.plan_code === 'free_trial' || summary.status !== 'active') && (
          <Link href="/pricing" className="btn-primary text-xs py-2 px-3 flex items-center gap-1.5 flex-1 justify-center">
            <TrendingUp size={12} />
            Upgrade
          </Link>
        )}
      </div>
    </div>
  );
}
