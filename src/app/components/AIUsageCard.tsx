'use client';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Zap, Calendar, AlertTriangle, CheckCircle, XCircle, RefreshCw, Clock, Sparkles } from 'lucide-react';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuickActions } from '@/components/quick-actions/QuickActionsContext';

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
  monthly_receipt_extractions?: number;
  text_ai_enabled?: boolean;
  voice_ai_enabled?: boolean;
  ai_history_enabled?: boolean;
  credits_allocated?: number;
  credits_consumed?: number;
  credits_reserved?: number;
  credits_refunded?: number;
  voice_seconds_used?: number;
  requests_today?: number;
  receipt_extractions_included?: number;
  receipt_extractions_used?: number;
  receipt_extractions_reserved?: number;
  receipt_extractions_refunded?: number;
  receipt_extractions_remaining?: number;
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
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-600 text-foreground">{used} / {total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WarningBanner({
  pct,
  t,
}: {
  pct: number;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (pct < 80) return null;
  if (pct >= 100) return (
    <div className="flex items-center gap-2 rounded-xl border border-negative/20 bg-negative-soft px-3 py-2 text-xs font-600 text-negative">
      <XCircle size={14} className="flex-shrink-0" />
      {t('aiUsage.exhausted')}
    </div>
  );
  if (pct >= 95) return (
    <div className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 text-xs font-600 text-warning">
      <AlertTriangle size={14} className="flex-shrink-0" />
      {t('aiUsage.remainingPercent', { percent: 100 - pct })}
    </div>
  );
  return (
    <div className="flex items-center gap-2 rounded-xl border border-warning/20 bg-warning-soft px-3 py-2 text-xs font-600 text-warning">
      <AlertTriangle size={14} className="flex-shrink-0" />
      {t('aiUsage.eightyUsed')}
    </div>
  );
}

export default function AIUsageCard() {
  const { t } = useTranslation('portal');
  const { language } = useLanguage();
  const quickActions = useQuickActions();
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

  useSmartPocketDataChanged(['ai_usage', 'dashboard', 'transactions', 'transaction_documents', 'financial_accounts'], 'AIUsageCard', async () => {
    await load(true);
  });

  if (loading) {
    return (
      <div className="card-elevated animate-pulse rounded-[28px] border border-border/80 bg-[linear-gradient(180deg,rgba(139,92,246,0.10),rgba(255,255,255,0.96))] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-secondary" />
            <div className="h-3 w-36 rounded bg-secondary" />
          </div>
          <div className="h-10 w-10 rounded-full bg-secondary" />
        </div>
        <div className="space-y-3">
          <div className="h-2 rounded bg-secondary" />
          <div className="h-2 rounded bg-secondary" />
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-14 rounded-2xl bg-secondary" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!summary?.has_subscription) {
    return (
      <div className="card-elevated rounded-[28px] border border-border/80 bg-[linear-gradient(180deg,rgba(139,92,246,0.10),rgba(255,255,255,0.96))] p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 shadow-[0_12px_24px_-20px_rgba(139,92,246,0.9)]">
              <span className="absolute inset-1 rounded-xl bg-violet-500/10 blur-md" />
              <Sparkles size={17} className="relative z-[1]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-base font-800 text-foreground">{t('aiUsage.assistantTitle')}</h3>
                <Link href="/ai-history" className="text-sm font-700 text-violet-700 transition-colors hover:text-violet-800">
                  ({t('aiUsage.history')})
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">{t('aiUsage.companion')}</p>
            </div>
          </div>
          <button
            onClick={() => void load(true)}
            className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-white/80"
            aria-label={t('aiHistory.refresh')}
          >
            <RefreshCw size={14} />
          </button>
        </div>
        {isUnavailable || summary?.status === 'unavailable' ? (
          <p className="mb-3 text-sm text-muted-foreground">{t('aiUsage.unavailable')}</p>
        ) : (
          <p className="mb-3 text-sm text-muted-foreground">{t('aiUsage.noSubscription')}</p>
        )}
        <button
          type="button"
          onClick={() => quickActions?.openQuickAction('smart_entry')}
          className="inline-flex items-center gap-1.5 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-700 text-white shadow-card-sm transition-colors hover:bg-violet-700"
        >
          <Zap size={13} />
          {t('aiUsage.openAssistant')}
        </button>
      </div>
    );
  }

  const textUsed = summary.requests_today ?? 0;
  const textTotal = summary.daily_ai_request_limit ?? 0;
  const textPct = textTotal > 0 ? Math.round((textUsed / textTotal) * 100) : 0;
  const voiceUsedMin = Math.round((summary.voice_seconds_used ?? 0) / 60);
  const voiceTotalMin = Math.round((summary.monthly_voice_seconds ?? 0) / 60);
  const voicePct = voiceTotalMin > 0 ? Math.round((voiceUsedMin / voiceTotalMin) * 100) : 0;
  const voiceRemainingMin = Math.max(0, voiceTotalMin - voiceUsedMin);

  const receiptIncluded = summary.receipt_extractions_included ?? summary.monthly_receipt_extractions ?? 0;
  const receiptUsed = summary.receipt_extractions_used ?? 0;
  const receiptReserved = summary.receipt_extractions_reserved ?? 0;
  const receiptRemaining = typeof summary.receipt_extractions_remaining === 'number'
    ? summary.receipt_extractions_remaining
    : Math.max(0, receiptIncluded - receiptUsed - receiptReserved);
  const receiptPct = receiptIncluded > 0 ? Math.round(((receiptUsed + receiptReserved) / receiptIncluded) * 100) : 0;

  const peakPct = Math.max(textPct, voicePct, receiptPct);

  const isTrialing = summary.status === 'trialing';
  const trialDaysLeft = isTrialing && summary.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(summary.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;

  const resetDate = summary.cycle_end
    ? new Date(summary.cycle_end).toLocaleDateString(
      language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : language === 'ru' ? 'ru' : 'en-US',
      { month: 'short', day: 'numeric' }
    )
    : t('aiUsage.none');
  const statusLabel = summary.status === 'active'
    ? t('status.active', { ns: 'common' })
    : summary.status === 'trialing'
      ? t('aiUsage.trialing')
      : summary.status === 'inactive'
        ? t('status.inactive', { ns: 'common' })
        : summary.status;

  return (
    <div className="card-elevated rounded-[28px] border border-violet-100 bg-[linear-gradient(180deg,rgba(139,92,246,0.12),rgba(255,255,255,0.98))] p-4 shadow-[0_24px_70px_-48px_rgba(124,58,237,0.75)]">
      <div className="flex flex-col gap-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 shadow-[0_14px_28px_-22px_rgba(139,92,246,0.95)]">
              <span className="absolute -inset-1 rounded-[20px] bg-violet-400/18 blur-lg" />
              <span className="absolute inset-1 rounded-xl bg-white/70" />
              <Sparkles size={17} className="relative z-[1]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="text-base font-800 text-foreground">{t('aiUsage.assistantTitle')}</h3>
                <Link href="/ai-history" className="text-sm font-700 text-violet-700 transition-colors hover:text-violet-800">
                  ({t('aiUsage.history')})
                </Link>
              </div>
              <p className="text-[12.5px] text-muted-foreground">{t('aiUsage.companion')}</p>
            </div>
          </div>
          <button
            onClick={() => void load(true)}
            className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-white/80"
            aria-label={t('aiHistory.refresh')}
          >
            <RefreshCw size={14} className="text-muted-foreground" />
          </button>
        </div>
        <WarningBanner pct={peakPct} t={t} />
        {isTrialing && trialDaysLeft !== null ? (
          <div className="flex items-center gap-1.5 text-xs font-600 text-violet-700">
            <Clock size={12} />
            {trialDaysLeft > 0 ? t('aiUsage.trialDaysRemaining', { count: trialDaysLeft }) : t('aiUsage.trialExpired')}
          </div>
        ) : null}

        <div className="grid gap-2.5">
          <div className="rounded-2xl border border-white/70 bg-white/75 p-3 backdrop-blur-sm">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-700 text-foreground">{t('aiUsage.textAi')}</p>
                <p className="text-xs text-muted-foreground">{t('aiUsage.requestsUsedToday')}</p>
              </div>
              <p className="text-base font-800 text-foreground sm:text-lg">
                {textUsed}
                <span className="ms-1 text-xs font-600 text-muted-foreground">/ {textTotal || t('aiUsage.none')}</span>
              </p>
            </div>
            <UsageBar used={textUsed} total={textTotal} label={t('aiUsage.textAiRequests')} />
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/75 p-3 backdrop-blur-sm">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-700 text-foreground">{t('aiUsage.voiceAi')}</p>
                <p className="text-xs text-muted-foreground">{t('aiUsage.voiceUsedIncluded')}</p>
              </div>
              <p className="text-base font-800 text-foreground sm:text-lg">
                {voiceUsedMin}
                <span className="ms-1 text-xs font-600 text-muted-foreground">/ {voiceTotalMin || t('aiUsage.none')}</span>
              </p>
            </div>
            <UsageBar used={voiceUsedMin} total={voiceTotalMin} label={t('aiUsage.voiceMinutes')} />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('aiUsage.remainingMinutes', { count: voiceRemainingMin })}
            </p>
          </div>

          <div className="rounded-2xl border border-white/70 bg-white/75 p-3 backdrop-blur-sm">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-700 text-foreground">{t('aiUsage.receiptIntelligence')}</p>
                <p className="text-xs text-muted-foreground">{t('aiUsage.receiptUsedIncluded')}</p>
              </div>
              <p className={`text-base font-800 sm:text-lg ${receiptRemaining === 0 && receiptIncluded > 0 ? 'text-negative' : 'text-foreground'}`}>
                {receiptUsed}
                <span className="ms-1 text-xs font-600 text-muted-foreground">/ {receiptIncluded || t('aiUsage.none')}</span>
              </p>
            </div>
            <UsageBar used={receiptUsed + receiptReserved} total={receiptIncluded} label={t('aiUsage.receiptDocuments')} />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('aiUsage.receiptRemaining', { count: receiptRemaining })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-2.5 backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-700 uppercase tracking-[0.14em] text-muted-foreground">{t('aiUsage.receiptRemainingCard')}</p>
            <p className={`text-base font-800 sm:text-lg ${receiptRemaining === 0 && receiptIncluded > 0 ? 'text-negative' : 'text-foreground'}`}>
              {receiptRemaining}
              <span className="ms-1 text-xs font-600 text-muted-foreground">/ {receiptIncluded || t('aiUsage.none')}</span>
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-2.5 backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-700 uppercase tracking-[0.14em] text-muted-foreground">{t('aiUsage.requestsToday')}</p>
            <p className="text-base font-800 text-foreground sm:text-lg">
              {summary.requests_today ?? 0}
              <span className="ms-1 text-xs font-600 text-muted-foreground">/ {summary.daily_ai_request_limit ?? t('aiUsage.none')}</span>
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-2.5 backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-700 uppercase tracking-[0.14em] text-muted-foreground">{t('aiUsage.resetDate')}</p>
            <p className="flex items-center gap-1 text-sm font-700 text-foreground">
              <Calendar size={12} className="text-muted-foreground" />
              {resetDate}
            </p>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/70 px-3 py-2.5 backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-700 uppercase tracking-[0.14em] text-muted-foreground">{t('aiUsage.status')}</p>
            <p className="flex items-center gap-1 text-sm font-700 text-foreground">
              {summary.status === 'active' || summary.status === 'trialing'
                ? <CheckCircle size={12} className="text-positive" />
                : <XCircle size={12} className="text-negative" />}
              {statusLabel}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => quickActions?.openQuickAction('smart_entry')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-700 text-white shadow-card-sm transition-colors hover:bg-violet-700"
          >
            <Zap size={14} />
            {t('aiUsage.openAssistant')}
          </button>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-violet-700">
            {(summary.plan_code === 'free_trial' || summary.status !== 'active') ? (
              <Link href="/pricing" className="font-600 transition-colors hover:text-violet-800">
                {t('aiUsage.upgrade')}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
