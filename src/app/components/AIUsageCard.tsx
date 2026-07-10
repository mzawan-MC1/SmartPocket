'use client';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Calendar, Clock, FileUp, History, Keyboard, Mic, RefreshCw, Sparkles } from 'lucide-react';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuickActions } from '@/components/quick-actions/QuickActionsContext';
import Modal from '@/components/ui/Modal';
import { createClient } from '@/lib/supabase/client';

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
  usage_availability?: {
    text_credit?: {
      included_remaining?: number;
      purchased_remaining?: number;
      total_available?: number;
    };
    voice_second?: {
      included_remaining?: number;
      purchased_remaining?: number;
      total_available?: number;
    };
    receipt_extraction?: {
      included_remaining?: number;
      purchased_remaining?: number;
      total_available?: number;
    };
  };
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
    usageAvailability?: {
      textCredit?: {
        includedRemaining?: number;
        purchasedRemaining?: number;
        totalAvailable?: number;
      };
      voiceSecond?: {
        includedRemaining?: number;
        purchasedRemaining?: number;
        totalAvailable?: number;
      };
      receiptExtraction?: {
        includedRemaining?: number;
        purchasedRemaining?: number;
        totalAvailable?: number;
      };
    };
  };
};

type WrappedSummary = NonNullable<SummaryApiPayload['summary']>;

type SummaryFetchResult = {
  status: number;
  data: SubscriptionSummary | null;
};

type UsageMetricTone = 'normal' | 'warning' | 'exhausted';

type UsageMetric = {
  id: 'text' | 'voice' | 'receipt';
  title: string;
  helper: string;
  valueText: string;
  valueNumber: string;
  valueLabel: string;
  usedText: string | null;
  progressLabel: string;
  tone: UsageMetricTone;
  total: number;
  used: number;
  percent: number | null;
};

type AIHistoryItem = {
  id: string;
  request_type: 'voice' | 'text';
  status: string;
  raw_text: string | null;
  created_at: string;
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
    usage_availability: summary?.usageAvailability
      ? {
          text_credit: summary.usageAvailability.textCredit
            ? {
                included_remaining: summary.usageAvailability.textCredit.includedRemaining,
                purchased_remaining: summary.usageAvailability.textCredit.purchasedRemaining,
                total_available: summary.usageAvailability.textCredit.totalAvailable,
              }
            : undefined,
          voice_second: summary.usageAvailability.voiceSecond
            ? {
                included_remaining: summary.usageAvailability.voiceSecond.includedRemaining,
                purchased_remaining: summary.usageAvailability.voiceSecond.purchasedRemaining,
                total_available: summary.usageAvailability.voiceSecond.totalAvailable,
              }
            : undefined,
          receipt_extraction: summary.usageAvailability.receiptExtraction
            ? {
                included_remaining: summary.usageAvailability.receiptExtraction.includedRemaining,
                purchased_remaining: summary.usageAvailability.receiptExtraction.purchasedRemaining,
                total_available: summary.usageAvailability.receiptExtraction.totalAvailable,
              }
            : undefined,
        }
      : rawSummary.usage_availability,
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

function UsageProgress({
  label,
  used,
  total,
  tone,
}: {
  label: string;
  used: number;
  total: number;
  tone: UsageMetricTone;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const barTone =
    tone === 'exhausted'
      ? 'bg-[linear-gradient(90deg,rgba(220,38,38,0.78),rgba(239,68,68,0.92))]'
      : tone === 'warning'
        ? 'bg-[linear-gradient(90deg,rgba(217,119,6,0.76),rgba(245,158,11,0.92))]'
        : 'bg-[linear-gradient(90deg,rgba(109,40,217,0.78),rgba(139,92,246,0.96))]';

  return (
    <div
      className="h-2.5 overflow-hidden rounded-full bg-violet-100/70 ring-1 ring-violet-200/40"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(used, total)}
    >
      <div className={`h-full rounded-full shadow-[0_4px_12px_-6px_rgba(124,58,237,0.55)] transition-all ${barTone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function UsageAlert({
  message,
  tone,
}: {
  message: string;
  tone: 'warning' | 'error';
}) {
  return (
    <div
      className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-600 leading-4 ${
        tone === 'error'
          ? 'border-negative/20 bg-negative-soft text-negative'
          : 'border-warning/20 bg-warning-soft text-warning'
      }`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
    >
      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function formatVoiceAmount(
  seconds: number,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const normalized = Math.max(0, Math.ceil(seconds));
  if (normalized < 60) {
    return t('aiUsage.secondsShort', { count: normalized });
  }
  return t('aiUsage.minutesShort', { count: Math.round(normalized / 60) });
}

function formatVoiceRemaining(
  seconds: number,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const normalized = Math.max(0, Math.ceil(seconds));
  if (normalized < 60) {
    return t('aiUsage.secondsRemaining', { count: normalized });
  }
  return t('aiUsage.minutesRemaining', { count: Math.round(normalized / 60) });
}

function getUsageTone(used: number, total: number): UsageMetricTone {
  if (total <= 0) return 'normal';
  const pct = Math.round((used / total) * 100);
  if (pct >= 100) return 'exhausted';
  if (pct >= 80) return 'warning';
  return 'normal';
}

function getUsageToneWithAvailability(used: number, total: number, remaining: number): UsageMetricTone {
  if (total > 0) {
    return getUsageTone(used, total);
  }
  return remaining === 0 ? 'exhausted' : 'normal';
}

function getPeakPercent(metrics: UsageMetric[]) {
  return metrics.reduce((peak, metric) => Math.max(peak, metric.percent ?? 0), 0);
}

function getRemainingDisplayParts(
  metricId: UsageMetric['id'],
  remaining: number,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (metricId === 'text') {
    return {
      valueNumber: `${remaining}`,
      valueLabel: t('aiUsage.requestsRemainingLabel', { count: remaining }),
    };
  }

  if (metricId === 'receipt') {
    return {
      valueNumber: `${remaining}`,
      valueLabel: t('aiUsage.scansRemainingLabel', { count: remaining }),
    };
  }

  const normalized = Math.max(0, Math.ceil(remaining));
  if (normalized < 60) {
    return {
      valueNumber: `${normalized}`,
      valueLabel: t('aiUsage.secondsRemainingLabel', { count: normalized }),
    };
  }

  const minutes = Math.round(normalized / 60);
  return {
    valueNumber: `${minutes}`,
    valueLabel: t('aiUsage.minutesRemainingLabel', { count: minutes }),
  };
}

function CompactStatus({
  label,
  tone = 'default',
}: {
  label: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-700 leading-none ${
        tone === 'warning'
          ? 'border-warning/25 bg-warning-soft text-warning'
          : 'border-violet-200/80 bg-violet-500/10 text-violet-700'
      }`}
    >
      {label}
    </span>
  );
}

export default function AIUsageCard({
  variant = 'default',
}: {
  variant?: 'default' | 'mobile-featured';
}) {
  const { t } = useTranslation('portal');
  const { language } = useLanguage();
  const quickActions = useQuickActions();
  const [summary, setSummary] = useState<SubscriptionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUnavailable, setIsUnavailable] = useState(false);
  const [usageSheetOpen, setUsageSheetOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<AIHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const supabase = createClient();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const { data, error } = await supabase
        .from('ai_requests')
        .select('id,request_type,status,raw_text,created_at')
        .gte('created_at', monthStart.toISOString())
        .order('created_at', { ascending: false })
        .limit(8);

      if (error) throw error;
      setHistoryItems((data || []) as AIHistoryItem[]);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!usageSheetOpen) return;
    void loadHistory();
  }, [loadHistory, usageSheetOpen]);

  const formatResetDate = (value?: string | null) => {
    if (!value) return null;
    return new Date(value).toLocaleDateString(
      language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : language === 'ru' ? 'ru' : 'en-US',
      { month: 'short', day: 'numeric' }
    );
  };

  if (loading) {
    return (
      <div className="card-elevated animate-pulse rounded-[24px] border border-violet-200/45 bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(248,247,255,0.95)_58%,rgba(243,248,255,0.93))] p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_16px_36px_-20px_rgba(76,29,149,0.18)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-2xl bg-violet-100/80" />
            <div className="space-y-2">
              <div className="h-4 w-24 rounded bg-secondary" />
              <div className="h-3 w-36 rounded bg-secondary" />
            </div>
          </div>
          <div className="h-7 w-20 rounded-full bg-secondary" />
        </div>
        <div className="mt-3 space-y-2.5">
          <div className="rounded-2xl border border-violet-200/55 bg-[linear-gradient(160deg,rgba(255,255,255,0.92),rgba(245,243,255,0.86))] px-3 py-3">
            <div className="h-3 w-20 rounded bg-secondary" />
            <div className="mt-3 h-8 w-28 rounded bg-secondary" />
            <div className="mt-3 h-2 w-full rounded bg-secondary" />
            <div className="mt-2 h-3 w-32 rounded bg-secondary" />
          </div>
          <div className="space-y-2 rounded-2xl border border-slate-200/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.72),rgba(241,245,249,0.68))] px-3 py-2.5">
            {[1, 2].map((item) => (
              <div key={item} className="h-10 rounded-xl bg-secondary" />
            ))}
          </div>
          <div className="h-10 w-full rounded-2xl bg-secondary" />
        </div>
      </div>
    );
  }

  const resetDate = formatResetDate(summary?.cycle_end);
  const isTrialing = summary?.status === 'trialing';
  const trialDaysLeft = isTrialing && summary?.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(summary.trial_ends_at).getTime() - Date.now()) / 86400000))
    : null;
  const textEnabled = Boolean(summary?.text_ai_enabled);
  const voiceEnabled = Boolean(summary?.voice_ai_enabled);
  const receiptEnabled = Boolean(summary?.receipt_intelligence_enabled);
  const hasAnyAiAccess = textEnabled || voiceEnabled || receiptEnabled;
  const textAvailability = summary?.usage_availability?.text_credit;
  const voiceAvailability = summary?.usage_availability?.voice_second;
  const receiptAvailability = summary?.usage_availability?.receipt_extraction;

  const textUsed = summary?.requests_today ?? 0;
  const textTotal = summary?.daily_ai_request_limit ?? 0;
  const textRemaining = Math.max(0, textAvailability?.total_available ?? (textTotal - textUsed));
  const textDisplay = getRemainingDisplayParts('text', textRemaining, t);
  const textMetric: UsageMetric | null = textEnabled
    ? {
        id: 'text',
        title: t('aiUsage.textAi'),
        helper: t('aiUsage.requestsUsedToday'),
        valueText: t('aiUsage.requestsCount', { count: textRemaining }),
        valueNumber: textDisplay.valueNumber,
        valueLabel: textDisplay.valueLabel,
        usedText: textTotal > 0
          ? t('aiUsage.usedOfTotal', { used: textUsed, total: textTotal })
          : textRemaining > 0
            ? t('aiUsage.availableNow')
            : t('aiUsage.noneRemaining'),
        progressLabel: t('aiUsage.textAi'),
        tone: getUsageToneWithAvailability(textUsed, textTotal, textRemaining),
        total: textTotal,
        used: textUsed,
        percent: textTotal > 0 ? Math.min(100, Math.round((textUsed / textTotal) * 100)) : null,
      }
    : null;

  const voiceUsedSeconds = Math.max(0, summary?.voice_seconds_used ?? 0);
  const voiceTotalSeconds = Math.max(0, summary?.monthly_voice_seconds ?? 0);
  const voiceRemainingSeconds = Math.max(0, voiceAvailability?.total_available ?? (voiceTotalSeconds - voiceUsedSeconds));
  const voiceDisplay = getRemainingDisplayParts('voice', voiceRemainingSeconds, t);
  const voiceMetric: UsageMetric | null = voiceEnabled
    ? {
        id: 'voice',
        title: t('aiUsage.voiceAi'),
        helper: t('aiUsage.voiceUsedIncluded'),
        valueText: formatVoiceRemaining(voiceRemainingSeconds, t),
        valueNumber: voiceDisplay.valueNumber,
        valueLabel: voiceDisplay.valueLabel,
        usedText: voiceTotalSeconds > 0
          ? t('aiUsage.usedOfTotal', {
              used: formatVoiceAmount(voiceUsedSeconds, t),
              total: formatVoiceAmount(voiceTotalSeconds, t),
            })
          : voiceRemainingSeconds > 0
            ? t('aiUsage.availableNow')
            : t('aiUsage.noneRemaining'),
        progressLabel: t('aiUsage.voiceAi'),
        tone: getUsageToneWithAvailability(voiceUsedSeconds, voiceTotalSeconds, voiceRemainingSeconds),
        total: voiceTotalSeconds,
        used: voiceUsedSeconds,
        percent: voiceTotalSeconds > 0 ? Math.min(100, Math.round((voiceUsedSeconds / voiceTotalSeconds) * 100)) : null,
      }
    : null;

  const receiptIncluded = receiptEnabled ? (summary?.receipt_extractions_included ?? summary?.monthly_receipt_extractions ?? 0) : 0;
  const receiptUsed = summary?.receipt_extractions_used ?? 0;
  const receiptReserved = summary?.receipt_extractions_reserved ?? 0;
  const receiptUsageTotal = receiptUsed + receiptReserved;
  const receiptRemaining = typeof receiptAvailability?.total_available === 'number'
    ? (receiptEnabled ? receiptAvailability.total_available : 0)
    : typeof summary?.receipt_extractions_remaining === 'number'
    ? (receiptEnabled ? summary.receipt_extractions_remaining : 0)
    : Math.max(0, receiptIncluded - receiptUsageTotal);
  const receiptDisplay = getRemainingDisplayParts('receipt', receiptRemaining, t);
  const receiptMetric: UsageMetric | null = receiptEnabled
    ? {
        id: 'receipt',
        title: t('aiUsage.receiptIntelligence'),
        helper: t('aiUsage.receiptUsedIncluded'),
        valueText: t('aiUsage.receiptCount', { count: receiptRemaining }),
        valueNumber: receiptDisplay.valueNumber,
        valueLabel: receiptDisplay.valueLabel,
        usedText: receiptIncluded > 0
          ? t('aiUsage.usedOfTotal', { used: receiptUsageTotal, total: receiptIncluded })
          : receiptRemaining > 0
            ? t('aiUsage.availableNow')
            : t('aiUsage.noneRemaining'),
        progressLabel: t('aiUsage.receiptIntelligence'),
        tone: getUsageToneWithAvailability(receiptUsageTotal, receiptIncluded, receiptRemaining),
        total: receiptIncluded,
        used: receiptUsageTotal,
        percent: receiptIncluded > 0 ? Math.min(100, Math.round((receiptUsageTotal / receiptIncluded) * 100)) : null,
      }
    : null;

  const usageMetrics = [textMetric, voiceMetric, receiptMetric].filter((metric): metric is UsageMetric => Boolean(metric));
  const primaryMetric = usageMetrics.find((metric) => metric.total > 0) ?? usageMetrics[0] ?? null;
  const secondaryMetrics = usageMetrics.filter((metric) => metric.id !== primaryMetric?.id);
  const peakPercent = getPeakPercent(usageMetrics);
  const allRemainingExhausted = usageMetrics.length > 0 && usageMetrics.every((metric) => metric.tone === 'exhausted');
  const showUpgradeLink = (summary?.plan_code === 'free_trial' || summary?.status !== 'active');

  let usageMessage: { tone: 'warning' | 'error'; text: string } | null = null;
  if (allRemainingExhausted || peakPercent >= 100) {
    usageMessage = { tone: 'error', text: t('aiUsage.exhausted') };
  } else if (peakPercent >= 95) {
    usageMessage = { tone: 'warning', text: t('aiUsage.remainingPercent', { percent: 100 - peakPercent }) };
  } else if (peakPercent >= 80) {
    usageMessage = { tone: 'warning', text: t('aiUsage.eightyUsed') };
  }

  const statusLabel = isTrialing ? t('aiUsage.trialing') : t('status.active', { ns: 'common' });
  const statusTone = peakPercent >= 100 || isTrialing ? 'warning' : 'default';
  const outerCardClassName = 'card-elevated rounded-[24px] border border-violet-200/55 bg-[linear-gradient(150deg,rgba(252,250,255,0.98),rgba(246,242,255,0.96)_54%,rgba(241,246,255,0.94))] p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_18px_38px_-22px_rgba(91,33,182,0.24)]';
  const primarySurfaceClassName = 'rounded-[18px] border border-violet-200/55 bg-[linear-gradient(160deg,rgba(255,255,255,0.92),rgba(245,243,255,0.86))] px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_14px_28px_-20px_rgba(109,40,217,0.24)]';
  const secondarySurfaceClassName = 'rounded-[18px] border border-slate-200/70 bg-[linear-gradient(160deg,rgba(255,255,255,0.72),rgba(241,245,249,0.68))] px-3 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]';
  const textHistoryCount = historyItems.filter((item) => item.request_type === 'text').length;
  const voiceHistoryCount = historyItems.filter((item) => item.request_type === 'voice').length;
  const receiptHistoryCount = receiptUsageTotal;
  const totalAiActions = textHistoryCount + voiceHistoryCount + receiptHistoryCount;

  const renderHeader = (showHistory: boolean, badge?: React.ReactNode) => (
    <div className="grid grid-cols-[auto,minmax(0,1fr)] gap-x-2.5 gap-y-1">
      <div className="row-span-2 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl border border-violet-200/70 bg-[linear-gradient(180deg,rgba(139,92,246,0.16),rgba(139,92,246,0.08))] text-violet-600 shadow-[0_10px_18px_-14px_rgba(109,40,217,0.55)]">
        <Sparkles size={15} />
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <h3 className="truncate text-[15px] font-700 tracking-[-0.02em] text-foreground">{t('aiUsage.assistantTitle')}</h3>
          {badge}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {showHistory ? (
            <Link
              href="/ai-history"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-600 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
              aria-label={t('aiUsage.history')}
            >
              <History size={12} />
              <span className="whitespace-nowrap">{t('aiUsage.history')}</span>
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void load(true)}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
            aria-label={t('aiHistory.refresh')}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>
      <p className="truncate text-[11px] leading-4 text-muted-foreground">{t('aiUsage.companion')}</p>
    </div>
  );

  if (variant === 'mobile-featured' && !loading && !isUnavailable && summary?.has_subscription && hasAnyAiAccess) {
    const actionCards = [
      {
        id: 'type',
        title: t('aiUsage.mobileFeature.typeTitle'),
        description: t('aiUsage.mobileFeature.typeDescription'),
        icon: Keyboard,
        onClick: () => quickActions?.openQuickAction('smart_entry'),
        className: 'border-blue-200/85 bg-[linear-gradient(180deg,rgba(239,246,255,0.95),rgba(255,255,255,0.82))] text-blue-700 shadow-[0_14px_28px_-26px_rgba(37,99,235,0.38)]',
      },
      {
        id: 'voice',
        title: t('aiUsage.mobileFeature.voiceTitle'),
        description: t('aiUsage.mobileFeature.voiceDescription'),
        icon: Mic,
        onClick: () => quickActions?.openQuickAction('voice_entry'),
        className: 'border-slate-200/70 bg-white/75 text-slate-700 shadow-[0_14px_28px_-26px_rgba(15,23,42,0.12)]',
      },
      {
        id: 'upload',
        title: t('aiUsage.mobileFeature.uploadTitle'),
        description: t('aiUsage.mobileFeature.uploadDescription'),
        icon: FileUp,
        onClick: () => quickActions?.openQuickAction('smart_entry'),
        className: 'border-slate-200/70 bg-white/75 text-slate-700 shadow-[0_14px_28px_-26px_rgba(15,23,42,0.12)]',
      },
    ];

    return (
      <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff_0%,#eff6ff_100%)] p-3.5 shadow-[0_18px_40px_-28px_rgba(59,130,246,0.28)]">
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 top-8 h-32 w-32 rounded-full bg-sky-200/30 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -left-14 bottom-5 h-32 w-32 rounded-full bg-blue-200/25 blur-2xl" />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-slate-900">
              <Sparkles size={17} className="text-[#2f7cff]" />
              <h2 className="text-[1.08rem] font-800 tracking-[-0.02em]">{t('aiUsage.mobileFeature.title')}</h2>
            </div>
            <p className="mt-1 truncate text-[12px] leading-5 text-slate-600">
              {t('aiUsage.mobileFeature.description')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setUsageSheetOpen(true)}
            className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#ffffff_0%,#dbeafe_36%,#bfdbfe_100%)] shadow-[0_18px_30px_-24px_rgba(37,99,235,0.55)] transition-transform duration-150 hover:scale-[1.03] active:scale-[0.98]"
            aria-label={t('aiUsage.history', { defaultValue: 'AI Usage' })}
          >
            <div className="absolute inset-[7px] rounded-full bg-[linear-gradient(135deg,#1d4ed8,#38bdf8)]" />
            <div className="absolute inset-[3px] rounded-full border border-white/45" />
            <div className="relative flex items-center justify-center">
              <Sparkles size={15} className="text-white drop-shadow-sm" />
            </div>
          </button>
        </div>

        <div className="relative mt-3.5 grid grid-cols-3 gap-2">
          {actionCards.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                className={`flex min-h-[82px] flex-col items-start rounded-[18px] border px-2.5 py-2.5 text-left transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 ${action.className}`}
              >
                <div className="flex w-full items-center gap-1.5">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-white/92 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.24)]">
                    <Icon size={14} />
                  </div>
                  <p className="whitespace-nowrap text-[12.5px] font-800 tracking-[-0.02em] text-slate-900">
                    {action.title}
                  </p>
                </div>
                <p className="mt-1.5 line-clamp-2 text-[10px] leading-3.5 text-slate-600">{action.description}</p>
              </button>
            );
          })}
        </div>

        <div className="relative mt-3.5 flex items-center justify-center gap-1.5 rounded-full bg-white/82 px-3 py-1.5 text-center text-[10.5px] font-600 text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <Sparkles size={13} className="text-[#2f7cff]" />
          <span>{t('aiUsage.mobileFeature.footer')}</span>
        </div>
      </section>
    );
  }

  if (isUnavailable) {
    return (
      <div className={outerCardClassName}>
        <div className="flex flex-col gap-2.5">
          {renderHeader(Boolean(summary?.ai_history_enabled), <CompactStatus label={t('aiUsage.unavailableBadge')} tone="warning" />)}
          <div className={primarySurfaceClassName}>
            <p className="text-sm font-700 text-foreground">{t('aiUsage.unavailableTitle')}</p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{t('aiUsage.unavailable')}</p>
          </div>
          <button
            type="button"
            onClick={() => quickActions?.openQuickAction('smart_entry')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-700 text-white shadow-card-sm transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35"
          >
            <Sparkles size={14} />
            {t('aiUsage.openAssistant')}
          </button>
        </div>
      </div>
    );
  }

  if (!summary?.has_subscription) {
    return (
      <div className={outerCardClassName}>
        <div className="flex flex-col gap-2.5">
          {renderHeader(false)}
          <div className={primarySurfaceClassName}>
            <p className="text-sm font-700 text-foreground">{t('aiUsage.noSubscriptionTitle')}</p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{t('aiUsage.noSubscription')}</p>
          </div>
          <Link
            href="/settings/subscription"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-700 text-white shadow-card-sm transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35"
          >
            <Sparkles size={14} />
            {t('aiUsage.upgrade')}
          </Link>
        </div>
      </div>
    );
  }

  if (!hasAnyAiAccess) {
    return (
      <div className={outerCardClassName}>
        <div className="flex flex-col gap-2.5">
          {renderHeader(Boolean(summary.ai_history_enabled), <CompactStatus label={t('aiUsage.noAccessBadge')} tone="warning" />)}
          <div className={primarySurfaceClassName}>
            <p className="text-sm font-700 text-foreground">{t('aiUsage.noAccessTitle')}</p>
            <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{t('aiUsage.noAccess')}</p>
          </div>
          {showUpgradeLink ? (
            <Link
              href="/settings/subscription"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-700 text-white shadow-card-sm transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35"
            >
              <Sparkles size={14} />
              {t('aiUsage.upgrade')}
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={outerCardClassName}>
        <div className="flex flex-col gap-2.5">
        {renderHeader(Boolean(summary.ai_history_enabled), <CompactStatus label={statusLabel} tone={statusTone} />)}

        {usageMessage ? <UsageAlert message={usageMessage.text} tone={usageMessage.tone} /> : null}

        {isTrialing && trialDaysLeft !== null ? (
          <div className="flex items-center gap-1.5 text-[11px] font-600 text-muted-foreground">
            <Clock size={12} className="text-muted-foreground" />
            {trialDaysLeft > 0 ? t('aiUsage.trialDaysRemaining', { count: trialDaysLeft }) : t('aiUsage.trialExpired')}
          </div>
        ) : null}

        {primaryMetric ? (
          <div className={primarySurfaceClassName}>
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-[13px] font-700 text-foreground">{primaryMetric.title}</p>
              {resetDate ? (
                <div className="inline-flex shrink-0 items-center gap-1 text-[11px] font-600 text-muted-foreground">
                  <Calendar size={11} />
                  <span className="whitespace-nowrap">{t('aiUsage.resetsOn', { date: resetDate })}</span>
                </div>
              ) : null}
            </div>

            <div className="mt-2 flex items-end gap-2">
              <span dir="ltr" className="text-[1.7rem] font-800 leading-none tracking-[-0.03em] text-foreground tabular-nums md:text-[1.85rem]">
                {primaryMetric.valueNumber}
              </span>
              <span className="pb-0.5 text-[12px] font-600 leading-4 text-muted-foreground">
                {primaryMetric.valueLabel}
              </span>
            </div>

            {primaryMetric.total > 0 ? (
              <div className="mt-2.5 space-y-1.5">
                <UsageProgress
                  label={primaryMetric.progressLabel}
                  used={primaryMetric.used}
                  total={primaryMetric.total}
                  tone={primaryMetric.tone}
                />
                {primaryMetric.usedText ? (
                  <p className="text-[11px] leading-4 text-muted-foreground">{primaryMetric.usedText}</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{primaryMetric.usedText ?? t('aiUsage.noneRemaining')}</p>
            )}
          </div>
        ) : null}

        {secondaryMetrics.length > 0 ? (
          <div className={secondarySurfaceClassName}>
            <div className="divide-y divide-border/50">
              {secondaryMetrics.map((metric) => (
                <div key={metric.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 first:pt-2 last:pb-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-700 text-foreground">{metric.title}</p>
                    <p className="text-[11px] leading-4 text-muted-foreground">{metric.helper}</p>
                  </div>
                  <div className="min-w-[98px] text-right">
                    <span className={`inline-flex items-baseline justify-end gap-1 text-[15px] font-800 leading-none tabular-nums ${
                      metric.tone === 'exhausted'
                        ? 'text-negative'
                        : metric.tone === 'warning'
                          ? 'text-warning'
                          : 'text-foreground'
                    }`}>
                      <span dir="ltr">{metric.valueNumber}</span>
                      <span className="text-[11px] font-700 leading-none text-current/90">{metric.valueLabel}</span>
                    </span>
                    {metric.usedText ? (
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{metric.usedText}</p>
                    ) : (
                      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{t('aiUsage.noneRemaining')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2 pt-0.5">
          <button
            type="button"
            onClick={() => quickActions?.openQuickAction('smart_entry')}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-700 text-white shadow-card-sm transition-colors hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/35"
          >
            <Sparkles size={14} />
            {t('aiUsage.openAssistant')}
          </button>
          {showUpgradeLink ? (
            <div className="flex justify-center">
              <Link href="/settings/subscription" className="text-xs font-700 text-accent transition-colors hover:text-teal-600">
                {t('aiUsage.upgrade')}
              </Link>
            </div>
          ) : null}
        </div>
        </div>
      </div>

      <Modal
        isOpen={usageSheetOpen}
        onClose={() => setUsageSheetOpen(false)}
        title={t('aiUsage.title', { defaultValue: 'AI Usage' })}
        description={t('aiUsage.recentActivitySubtitle', {
          defaultValue: 'Your recent AI activity',
        })}
        size="md"
        mobileLayout="sheet"
        contentClassName="sm:max-w-lg"
        bodyClassName="space-y-3"
      >
        <div className="grid grid-cols-2 gap-2.5">
          {[
            {
              id: 'text',
              label: t('aiUsage.textEntries', { defaultValue: 'Text entries' }),
              value: textHistoryCount,
            },
            {
              id: 'voice',
              label: t('aiUsage.voiceEntries', { defaultValue: 'Voice entries' }),
              value: voiceHistoryCount,
            },
            {
              id: 'uploads',
              label: t('aiUsage.uploadEntries', { defaultValue: 'Receipt scans' }),
              value: receiptHistoryCount,
            },
            {
              id: 'total',
              label: t('aiUsage.totalActions', { defaultValue: 'AI actions this month' }),
              value: totalAiActions,
            },
          ].map((stat) => (
            <div key={stat.id} className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] px-3 py-3">
              <p className="text-[11px] font-700 text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-[1.1rem] font-800 tracking-[-0.03em] text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-800 text-foreground">{t('aiUsage.history', { defaultValue: 'History' })}</p>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-slate-100"
              aria-label={t('aiHistory.refresh', { defaultValue: 'Refresh' })}
            >
              <RefreshCw size={14} className={historyLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          {historyLoading ? (
            <div className="flex min-h-[8rem] items-center justify-center">
              <RefreshCw size={18} className="animate-spin text-accent" />
            </div>
          ) : historyItems.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 px-3 py-4 text-center">
              <p className="text-sm font-700 text-foreground">
                {t('aiUsage.emptyHistoryTitle', { defaultValue: 'No AI usage yet this month.' })}
              </p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                {t('aiUsage.emptyHistoryBody', { defaultValue: 'Try Smart Entry, voice, or receipt upload to see activity here.' })}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {historyItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 px-3 py-2.5">
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${
                    item.request_type === 'voice' ? 'bg-sky-100 text-sky-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {item.request_type === 'voice' ? <Mic size={14} /> : <Keyboard size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-700 text-foreground">
                      {item.raw_text || t('aiUsage.history', { defaultValue: 'AI action' })}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString(
                        language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : language === 'ru' ? 'ru' : 'en-US',
                        { month: 'short', day: 'numeric' }
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
