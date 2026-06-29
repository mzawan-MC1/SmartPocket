'use client';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Calendar, AlertTriangle, CheckCircle, XCircle, RefreshCw, Clock, Sparkles } from 'lucide-react';
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
  receipt_intelligence_enabled?: boolean;
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

type SummaryApiPayload = {
  summary?: {
    hasSubscription?: boolean;
    planName?: string;
    planCode?: string;
    status?: string;
    trialEndsAt?: string | null;
    currentPeriodEnd?: string | null;
    monthlyAiCredits?: number;
    dailyAiRequestLimit?: number;
    monthlyVoiceSeconds?: number;
    monthlyReceiptExtractions?: number;
    receiptIntelligenceEnabled?: boolean;
    textAiEnabled?: boolean;
    voiceAiEnabled?: boolean;
    aiHistoryEnabled?: boolean;
    creditsAllocated?: number;
    creditsConsumed?: number;
    creditsReserved?: number;
    creditsRefunded?: number;
    voiceSecondsUsed?: number;
    requestsToday?: number;
    receiptExtractionsIncluded?: number;
    receiptExtractionsUsed?: number;
    receiptExtractionsReserved?: number;
    receiptExtractionsRefunded?: number;
    receiptExtractionsRemaining?: number;
    cycleStart?: string | null;
    cycleEnd?: string | null;
  };
};

type WrappedSummary = NonNullable<SummaryApiPayload['summary']>;

type SummaryFetchResult = {
  status: number;
  data: SubscriptionSummary | null;
};

let cachedSummaryResult: SummaryFetchResult | null = null;
let inFlightSummaryRequest: Promise<SummaryFetchResult> | null = null;

function normalizeSummaryPayload(payload: unknown): SubscriptionSummary | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const rawSummary = payload as Partial<SubscriptionSummary>;
  const wrappedSummary = (payload as SummaryApiPayload).summary;
  const summary: WrappedSummary | undefined = wrappedSummary && typeof wrappedSummary === 'object'
    ? wrappedSummary
    : undefined;

  return {
    has_subscription: Boolean(summary?.hasSubscription ?? rawSummary.has_subscription),
    plan_name: summary?.planName ?? rawSummary.plan_name,
    plan_code: summary?.planCode ?? rawSummary.plan_code,
    status: summary?.status ?? rawSummary.status,
    trial_ends_at: summary?.trialEndsAt ?? rawSummary.trial_ends_at,
    current_period_end: summary?.currentPeriodEnd ?? rawSummary.current_period_end,
    monthly_ai_credits: summary?.monthlyAiCredits ?? rawSummary.monthly_ai_credits,
    daily_ai_request_limit: summary?.dailyAiRequestLimit ?? rawSummary.daily_ai_request_limit,
    monthly_voice_seconds: summary?.monthlyVoiceSeconds ?? rawSummary.monthly_voice_seconds,
    monthly_receipt_extractions: summary?.monthlyReceiptExtractions ?? rawSummary.monthly_receipt_extractions,
    receipt_intelligence_enabled: summary?.receiptIntelligenceEnabled ?? rawSummary.receipt_intelligence_enabled,
    text_ai_enabled: summary?.textAiEnabled ?? rawSummary.text_ai_enabled,
    voice_ai_enabled: summary?.voiceAiEnabled ?? rawSummary.voice_ai_enabled,
    ai_history_enabled: summary?.aiHistoryEnabled ?? rawSummary.ai_history_enabled,
    credits_allocated: summary?.creditsAllocated ?? rawSummary.credits_allocated,
    credits_consumed: summary?.creditsConsumed ?? rawSummary.credits_consumed,
    credits_reserved: summary?.creditsReserved ?? rawSummary.credits_reserved,
    credits_refunded: summary?.creditsRefunded ?? rawSummary.credits_refunded,
    voice_seconds_used: summary?.voiceSecondsUsed ?? rawSummary.voice_seconds_used,
    requests_today: summary?.requestsToday ?? rawSummary.requests_today,
    receipt_extractions_included: summary?.receiptExtractionsIncluded ?? rawSummary.receipt_extractions_included,
    receipt_extractions_used: summary?.receiptExtractionsUsed ?? rawSummary.receipt_extractions_used,
    receipt_extractions_reserved: summary?.receiptExtractionsReserved ?? rawSummary.receipt_extractions_reserved,
    receipt_extractions_refunded: summary?.receiptExtractionsRefunded ?? rawSummary.receipt_extractions_refunded,
    receipt_extractions_remaining: summary?.receiptExtractionsRemaining ?? rawSummary.receipt_extractions_remaining,
    cycle_start: summary?.cycleStart ?? rawSummary.cycle_start,
    cycle_end: summary?.cycleEnd ?? rawSummary.cycle_end,
  };
}

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
        ? normalizeSummaryPayload(await res.json())
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

function UsageBar({
  used,
  total,
  label,
  usedLabel,
  totalLabel,
}: {
  used: number;
  total: number;
  label: string;
  usedLabel?: string | number;
  totalLabel?: string | number;
}) {
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
        <span className="text-xs font-600 text-foreground">{usedLabel ?? used} / {totalLabel ?? total}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function UsageRow({
  title,
  helper,
  value,
  totalLabel,
  progressLabel,
  used,
  total,
  usedLabel,
  progressTotalLabel,
  remainingText,
  danger = false,
}: {
  title: string;
  helper: string;
  value: string | number;
  totalLabel: string;
  progressLabel: string;
  used: number;
  total: number;
  usedLabel?: string | number;
  progressTotalLabel?: string | number;
  remainingText?: string;
  danger?: boolean;
}) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-700 text-foreground">{title}</p>
          <p className="text-[11px] leading-4 text-muted-foreground">{helper}</p>
        </div>
        <p className={`whitespace-nowrap text-sm font-800 sm:text-base ${danger ? 'text-negative' : 'text-foreground'}`}>
          {value}
          <span className="ms-1 text-[11px] font-600 text-muted-foreground">/ {totalLabel}</span>
        </p>
      </div>
      <div className="mt-1.5">
        <UsageBar
          used={used}
          total={total}
          label={progressLabel}
          usedLabel={usedLabel}
          totalLabel={progressTotalLabel}
        />
      </div>
      {remainingText ? (
        <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{remainingText}</p>
      ) : null}
    </div>
  );
}

function formatVoiceMinutes(seconds: number) {
  const minutes = Math.max(0, seconds) / 60;
  if (minutes === 0) return '0';
  if (minutes < 10) return minutes.toFixed(1).replace(/\.0$/, '');
  return minutes.toFixed(1).replace(/\.0$/, '');
}

function formatVoiceUsage(seconds: number) {
  const normalized = Math.max(0, Math.ceil(seconds));
  if (normalized <= 0) return '0';
  if (normalized < 60) return `${normalized} sec`;
  return `${formatVoiceMinutes(normalized)} min`;
}

function formatVoiceTotal(seconds: number) {
  if (seconds <= 0) return 'None';
  return `${formatVoiceMinutes(seconds)} min`;
}

function formatVoiceRemaining(seconds: number) {
  const normalized = Math.max(0, Math.ceil(seconds));
  if (normalized <= 0) return '0 min remaining';
  if (normalized < 60) return `${normalized} sec remaining`;
  return `${formatVoiceMinutes(normalized)} min remaining`;
}

function UsageUnavailableRow({
  title,
  helper,
  valueLabel,
}: {
  title: string;
  helper: string;
  valueLabel: string;
}) {
  return (
    <div className="py-2.5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-700 text-foreground">{title}</p>
          <p className="text-[11px] leading-4 text-muted-foreground">{helper}</p>
        </div>
        <p className="whitespace-nowrap text-sm font-800 text-muted-foreground sm:text-base">
          {valueLabel}
        </p>
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
      <div className="card-elevated animate-pulse rounded-[28px] border border-border/80 bg-[linear-gradient(180deg,rgba(139,92,246,0.10),rgba(255,255,255,0.96))] p-4 shadow-[0_24px_70px_-48px_rgba(124,58,237,0.75)]">
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
          <div className="space-y-2 rounded-2xl border border-white/70 bg-white/72 p-3">
            {[1, 2, 3].map((item) => <div key={item} className="h-12 rounded-xl bg-secondary" />)}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-12 rounded-xl bg-secondary" />)}
          </div>
        </div>
      </div>
    );
  }

  if (!summary?.has_subscription) {
    return (
      <div className="card-elevated rounded-[28px] border border-border/80 bg-[linear-gradient(180deg,rgba(139,92,246,0.10),rgba(255,255,255,0.96))] p-4 shadow-[0_24px_70px_-48px_rgba(124,58,237,0.75)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 shadow-[0_12px_24px_-20px_rgba(139,92,246,0.9)]">
              <span className="absolute inset-1 rounded-xl bg-violet-500/10 blur-md" />
              <Sparkles size={17} className="relative z-[1]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-800 text-foreground">{t('aiUsage.assistantTitle')}</h3>
                <Link
                  href="/ai-history"
                  className="inline-flex items-center rounded-full border border-violet-200/80 bg-white/72 px-2.5 py-1 text-[11px] font-700 text-violet-700 transition-colors hover:bg-white hover:text-violet-800"
                >
                  {t('aiUsage.history')}
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
          className="inline-flex items-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-700 text-white shadow-card-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-card-md"
        >
          <Sparkles size={14} />
          {t('aiUsage.openAssistant')}
        </button>
      </div>
    );
  }

  const textUsed = summary.requests_today ?? 0;
  const textTotal = summary.daily_ai_request_limit ?? 0;
  const textPct = textTotal > 0 ? Math.round((textUsed / textTotal) * 100) : 0;
  const voiceUsedSeconds = Math.max(0, summary.voice_seconds_used ?? 0);
  const voiceTotalSeconds = Math.max(0, summary.monthly_voice_seconds ?? 0);
  const voiceUsedDisplay = formatVoiceUsage(voiceUsedSeconds);
  const voiceTotalDisplay = voiceTotalSeconds > 0 ? formatVoiceTotal(voiceTotalSeconds) : String(t('aiUsage.none'));
  const voicePct = voiceTotalSeconds > 0 ? Math.round((voiceUsedSeconds / voiceTotalSeconds) * 100) : 0;
  const voiceRemainingText = formatVoiceRemaining(Math.max(0, voiceTotalSeconds - voiceUsedSeconds));

  const receiptEnabled = Boolean(summary.receipt_intelligence_enabled);
  const receiptIncluded = receiptEnabled ? (summary.receipt_extractions_included ?? summary.monthly_receipt_extractions ?? 0) : 0;
  const receiptUsed = summary.receipt_extractions_used ?? 0;
  const receiptReserved = summary.receipt_extractions_reserved ?? 0;
  const receiptUsageTotal = receiptUsed + receiptReserved;
  const receiptRemaining = typeof summary.receipt_extractions_remaining === 'number'
    ? (receiptEnabled ? summary.receipt_extractions_remaining : 0)
    : Math.max(0, receiptIncluded - receiptUsed - receiptReserved);
  const receiptPct = receiptEnabled && receiptIncluded > 0 ? Math.round((receiptUsageTotal / receiptIncluded) * 100) : 0;

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
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-800 text-foreground">{t('aiUsage.assistantTitle')}</h3>
                <Link
                  href="/ai-history"
                  className="inline-flex items-center rounded-full border border-violet-200/80 bg-white/72 px-2.5 py-1 text-[11px] font-700 text-violet-700 transition-colors hover:bg-white hover:text-violet-800"
                >
                  {t('aiUsage.history')}
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

        <div className="rounded-2xl border border-white/70 bg-white/72 px-3 py-2.5 backdrop-blur-sm">
          <div className="divide-y divide-border/50">
            <UsageRow
              title={t('aiUsage.textAi')}
              helper={t('aiUsage.requestsUsedToday')}
              value={textUsed}
              totalLabel={String(textTotal || t('aiUsage.none'))}
              progressLabel={t('aiUsage.textAiRequests')}
              used={textUsed}
              total={textTotal}
            />
            <UsageRow
              title={t('aiUsage.voiceAi')}
              helper={t('aiUsage.voiceUsedIncluded')}
              value={voiceUsedDisplay}
              totalLabel={voiceTotalDisplay}
              progressLabel={t('aiUsage.voiceMinutes')}
              used={voiceUsedSeconds}
              total={voiceTotalSeconds}
              usedLabel={voiceUsedDisplay}
              progressTotalLabel={voiceTotalDisplay}
              remainingText={voiceRemainingText}
            />
            {receiptEnabled ? (
              <UsageRow
                title={t('aiUsage.receiptIntelligence')}
                helper={t('aiUsage.receiptUsedIncluded')}
                value={receiptUsageTotal}
                totalLabel={String(receiptIncluded)}
                progressLabel={t('aiUsage.receiptDocuments')}
                used={receiptUsageTotal}
                total={receiptIncluded}
                remainingText={t('aiUsage.receiptRemaining', { count: receiptRemaining })}
                danger={receiptRemaining === 0 && receiptIncluded > 0}
              />
            ) : (
              <UsageUnavailableRow
                title={t('aiUsage.receiptIntelligence')}
                helper={t('aiUsage.receiptUsedIncluded')}
                valueLabel={t('subscriptionBilling.disabled', { ns: 'portal', defaultValue: 'Not included' })}
              />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl border border-white/70 bg-white/64 px-3 py-2.5 backdrop-blur-sm">
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-700 uppercase tracking-[0.12em] text-muted-foreground">{t('aiUsage.receiptRemainingCard')}</p>
            {receiptEnabled ? (
              <p className={`text-sm font-800 sm:text-base ${receiptRemaining === 0 && receiptIncluded > 0 ? 'text-negative' : 'text-foreground'}`}>
                {receiptRemaining}
                <span className="ms-1 text-xs font-600 text-muted-foreground">/ {receiptIncluded}</span>
              </p>
            ) : (
              <p className="text-sm font-800 text-muted-foreground sm:text-base">
                {t('subscriptionBilling.disabled', { ns: 'portal', defaultValue: 'Not included' })}
              </p>
            )}
          </div>
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-700 uppercase tracking-[0.12em] text-muted-foreground">{t('aiUsage.requestsToday')}</p>
            <p className="text-sm font-800 text-foreground sm:text-base">
              {summary.requests_today ?? 0}
              <span className="ms-1 text-xs font-600 text-muted-foreground">/ {summary.daily_ai_request_limit ?? t('aiUsage.none')}</span>
            </p>
          </div>
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-700 uppercase tracking-[0.12em] text-muted-foreground">{t('aiUsage.resetDate')}</p>
            <p className="flex items-center gap-1 text-sm font-700 text-foreground">
              <Calendar size={12} className="text-muted-foreground" />
              {resetDate}
            </p>
          </div>
          <div className="min-w-0">
            <p className="mb-0.5 text-[10px] font-700 uppercase tracking-[0.12em] text-muted-foreground">{t('aiUsage.status')}</p>
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-700 text-white shadow-card-sm transition-all duration-150 hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-card-md"
          >
            <Sparkles size={14} />
            {t('aiUsage.openAssistant')}
          </button>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-violet-700">
            {(summary.plan_code === 'free_trial' || summary.status !== 'active') ? (
              <Link href="/settings/subscription" className="font-600 transition-colors hover:text-violet-800">
                {t('aiUsage.upgrade')}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
