'use client';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Calendar, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { useLanguage } from '@/contexts/LanguageContext';
import { useQuickActions } from '@/components/quick-actions/QuickActionsContext';
import StatusBadge from '@/components/ui/StatusBadge';

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
  usedText: string | null;
  progressLabel: string;
  tone: UsageMetricTone;
  total: number;
  used: number;
  percent: number | null;
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
    tone === 'exhausted' ? 'bg-negative' :
    tone === 'warning' ? 'bg-warning' :
    'bg-accent';

  return (
    <div
      className="h-2 overflow-hidden rounded-full bg-muted/50"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(used, total)}
    >
      <div className={`h-full rounded-full transition-all ${barTone}`} style={{ width: `${pct}%` }} />
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

  const formatResetDate = (value?: string | null) => {
    if (!value) return null;
    return new Date(value).toLocaleDateString(
      language === 'ar' ? 'ar' : language === 'fr' ? 'fr' : language === 'ru' ? 'ru' : 'en-US',
      { month: 'short', day: 'numeric' }
    );
  };

  if (loading) {
    return (
      <div className="card-elevated animate-pulse rounded-[24px] border border-border/80 bg-card p-3.5 shadow-card-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-2xl bg-secondary" />
            <div className="space-y-2">
              <div className="h-4 w-24 rounded bg-secondary" />
              <div className="h-3 w-36 rounded bg-secondary" />
            </div>
          </div>
          <div className="h-7 w-20 rounded-full bg-secondary" />
        </div>
        <div className="mt-3 space-y-2.5">
          <div className="rounded-2xl border border-border/70 bg-muted/15 px-3 py-3">
            <div className="h-3 w-20 rounded bg-secondary" />
            <div className="mt-3 h-8 w-28 rounded bg-secondary" />
            <div className="mt-3 h-2 w-full rounded bg-secondary" />
            <div className="mt-2 h-3 w-32 rounded bg-secondary" />
          </div>
          <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/10 px-3 py-2.5">
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
  const textMetric: UsageMetric | null = textEnabled
    ? {
        id: 'text',
        title: t('aiUsage.textAi'),
        helper: t('aiUsage.requestsUsedToday'),
        valueText: t('aiUsage.requestsCount', { count: textRemaining }),
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
  const voiceMetric: UsageMetric | null = voiceEnabled
    ? {
        id: 'voice',
        title: t('aiUsage.voiceAi'),
        helper: t('aiUsage.voiceUsedIncluded'),
        valueText: formatVoiceRemaining(voiceRemainingSeconds, t),
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
  const receiptMetric: UsageMetric | null = receiptEnabled
    ? {
        id: 'receipt',
        title: t('aiUsage.receiptIntelligence'),
        helper: t('aiUsage.receiptUsedIncluded'),
        valueText: t('aiUsage.receiptCount', { count: receiptRemaining }),
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

  const renderHeader = (showHistory: boolean, badge?: React.ReactNode) => (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-600">
          <Sparkles size={16} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-800 tracking-[-0.02em] text-foreground">{t('aiUsage.assistantTitle')}</h3>
            {badge}
          </div>
          <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">{t('aiUsage.companion')}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {showHistory ? (
          <Link
            href="/ai-history"
            className="inline-flex items-center rounded-full border border-border/70 bg-card px-2.5 py-1 text-[11px] font-700 text-foreground transition-colors hover:bg-muted/30"
          >
            {t('aiUsage.history')}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => void load(true)}
          className="rounded-xl p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35"
          aria-label={t('aiHistory.refresh')}
        >
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  );

  if (isUnavailable) {
    return (
      <div className="card-elevated rounded-[24px] border border-border/80 bg-card p-3.5 shadow-card-sm">
        <div className="flex flex-col gap-3">
          {renderHeader(Boolean(summary?.ai_history_enabled), <StatusBadge status="warning" label={t('aiUsage.unavailableBadge')} />)}
          <div className="rounded-2xl border border-border/70 bg-muted/10 px-3 py-3">
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
      <div className="card-elevated rounded-[24px] border border-border/80 bg-card p-3.5 shadow-card-sm">
        <div className="flex flex-col gap-3">
          {renderHeader(false)}
          <div className="rounded-2xl border border-border/70 bg-muted/10 px-3 py-3">
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
      <div className="card-elevated rounded-[24px] border border-border/80 bg-card p-3.5 shadow-card-sm">
        <div className="flex flex-col gap-3">
          {renderHeader(Boolean(summary.ai_history_enabled), <StatusBadge status="warning" label={t('aiUsage.noAccessBadge')} />)}
          <div className="rounded-2xl border border-border/70 bg-muted/10 px-3 py-3">
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
    <div className="card-elevated rounded-[24px] border border-border/80 bg-card p-3.5 shadow-card-sm">
      <div className="flex flex-col gap-3">
        {renderHeader(
          Boolean(summary.ai_history_enabled),
          <StatusBadge
            status={peakPercent >= 100 ? 'warning' : isTrialing ? 'pending' : 'ai'}
            label={isTrialing ? t('aiUsage.trialing') : t('status.active', { ns: 'common' })}
            className="px-2 py-0.5 text-[10px]"
          />
        )}

        {usageMessage ? <UsageAlert message={usageMessage.text} tone={usageMessage.tone} /> : null}

        {isTrialing && trialDaysLeft !== null ? (
          <div className="flex items-center gap-1.5 text-[11px] font-600 text-muted-foreground">
            <Clock size={12} className="text-muted-foreground" />
            {trialDaysLeft > 0 ? t('aiUsage.trialDaysRemaining', { count: trialDaysLeft }) : t('aiUsage.trialExpired')}
          </div>
        ) : null}

        {primaryMetric ? (
          <div className="rounded-2xl border border-border/70 bg-muted/10 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-700 uppercase tracking-[0.12em] text-muted-foreground">
                  {t('aiUsage.remaining')}
                </p>
                <p className="mt-2 text-xl font-800 tracking-[-0.02em] text-foreground tabular-nums md:text-[1.35rem]">
                  {primaryMetric.valueText}
                </p>
                <p className="mt-1 text-sm font-700 text-foreground">{primaryMetric.title}</p>
                <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{primaryMetric.helper}</p>
              </div>
              {resetDate ? (
                <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-card px-2.5 py-1 text-[10px] font-700 text-muted-foreground">
                  <Calendar size={11} />
                  {t('aiUsage.resetsOn', { date: resetDate })}
                </div>
              ) : null}
            </div>

            {primaryMetric.total > 0 ? (
              <div className="mt-3 space-y-2">
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
              <p className="mt-3 text-[11px] leading-4 text-muted-foreground">{primaryMetric.usedText ?? t('aiUsage.noneRemaining')}</p>
            )}
          </div>
        ) : null}

        {secondaryMetrics.length > 0 ? (
          <div className="rounded-2xl border border-border/70 bg-muted/5 px-3 py-2">
            <div className="divide-y divide-border/50">
              {secondaryMetrics.map((metric) => (
                <div key={metric.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-700 text-foreground">{metric.title}</p>
                    <p className="text-[11px] leading-4 text-muted-foreground">{metric.helper}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-800 tabular-nums ${
                      metric.tone === 'exhausted'
                        ? 'text-negative'
                        : metric.tone === 'warning'
                          ? 'text-warning'
                          : 'text-foreground'
                    }`}>
                      {metric.valueText}
                    </p>
                    {metric.usedText ? (
                      <p className="text-[11px] leading-4 text-muted-foreground">{metric.usedText}</p>
                    ) : (
                      <p className="text-[11px] leading-4 text-muted-foreground">{t('aiUsage.noneRemaining')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
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
  );
}
