'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wallet, TrendingUp, TrendingDown, ArrowUpDown, Target, CalendarClock, ArrowUp, ArrowDown, ChevronDown, ChevronUp, Eye,
} from 'lucide-react';
import { getDashboardMetrics, type DashboardActivePeriod, type DashboardConvertedMetric, type DashboardMetrics } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { getBudgetPeriodTypeLabel } from '@/lib/financial-periods/budgets';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';

interface DashboardMetricCard {
  id: string;
  label: string;
  valueMetric: DashboardConvertedMetric;
  priority: 'primary' | 'secondary' | 'supporting';
  changeDir: 'up' | 'down' | 'neutral';
  changeLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconBg: string;
  iconColor: string;
  changeMetric?: DashboardConvertedMetric;
  change?: string;
  alert?: boolean;
  warningState?: boolean;
  budgetPct?: number;
  valueContent?: React.ReactNode;
}

function formatCompactDate(value: string | null, locale: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function formatCompactDateTime(value: string | null, locale: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed);
}

function formatCompactRate(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatProviderName(provider: string | null) {
  if (!provider) return null;
  if (provider === 'open_exchange_rates') {
    return 'Open Exchange Rates';
  }
  return provider
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function OriginalCurrencyDisclosure({
  metric,
  locale,
  t,
}: {
  metric: DashboardConvertedMetric;
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showRateDetails, setShowRateDetails] = useState(false);

  const shouldShowDisclosure =
    metric.reportingAmount !== null
    && (!metric.allOriginalInReportingCurrency || metric.originalTotals.length > 1 || Boolean(metric.unavailableReason));

  if (!shouldShowDisclosure) {
    return null;
  }

  const singleOriginal = metric.originalTotals.length === 1 ? metric.originalTotals[0] : null;
  const hasConvertibleSingleOriginal = Boolean(
    singleOriginal
    && metric.reportingAmount !== null
    && singleOriginal.currency !== metric.reportingCurrency
    && Math.abs(Number(singleOriginal.amount || 0)) > 0.000001
  );
  const derivedRate = hasConvertibleSingleOriginal && singleOriginal
    ? Math.abs(metric.reportingAmount as number) / Math.abs(singleOriginal.amount)
    : null;
  const rateDate = formatCompactDate(metric.rateDate, locale);
  const updatedAt = formatCompactDateTime(metric.providerTimestamp || metric.fetchedAt, locale);
  const providerName = formatProviderName(metric.provider);

  return (
    <div className="mt-2 rounded-2xl border border-border/70 bg-muted/15 px-3 py-2.5 max-[480px]:mt-1.5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-1.5 text-left text-xs font-700 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (!nextOpen) {
            setShowRateDetails(false);
          }
        }}
        aria-expanded={isOpen}
      >
        <span>
          {isOpen
            ? t('dashboardMetrics.originalCurrencyDetails', {
                defaultValue: 'Original currency details',
              })
            : t('dashboardMetrics.viewOriginalCurrencies', {
                defaultValue: 'View original currencies',
              })}
        </span>
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {isOpen ? (
        <div className="mt-3 space-y-2.5 text-xs text-muted-foreground">
          <div className="flex items-start justify-between gap-3">
            <span className="font-700 text-foreground/90">
              {t('dashboardMetrics.originalAmountLabel', {
                defaultValue: metric.originalTotals.length > 1 ? 'Original amounts' : 'Original amount',
              })}
            </span>
            <div className="text-right">
              {metric.originalTotals.map((row) => (
                <FormattedCurrencyAmount
                  key={`${row.currency}-${row.amount}`}
                  amount={row.amount}
                  currencyCode={row.currency}
                  textOnly
                  className="text-xs font-700 text-foreground"
                />
              ))}
            </div>
          </div>

          {derivedRate !== null && singleOriginal ? (
            <div className="flex items-start justify-between gap-3">
              <span className="font-700 text-foreground/90">
                {t('dashboardMetrics.conversionLabel', {
                  defaultValue: 'Conversion',
                })}
              </span>
              <span className="text-right text-foreground/90">
                {t('dashboardMetrics.conversionValue', {
                  defaultValue: '1 {{from}} = {{rate}} {{to}}',
                  from: singleOriginal.currency,
                  rate: formatCompactRate(derivedRate, locale),
                  to: metric.reportingCurrency,
                })}
              </span>
            </div>
          ) : null}

          {rateDate ? (
            <div className="flex items-start justify-between gap-3">
              <span className="font-700 text-foreground/90">
                {t('dashboardMetrics.rateDateLabel', {
                  defaultValue: 'Rate date',
                })}
              </span>
              <span className="text-right text-foreground/90">{rateDate}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 pt-0.5">
            <button
              type="button"
              className="text-xs font-700 text-accent transition-colors hover:text-accent/80"
              onClick={() => setShowRateDetails((current) => !current)}
              aria-expanded={showRateDetails}
            >
              {t('dashboardMetrics.rateDetails', {
                defaultValue: 'Rate details',
              })}
            </button>
          </div>

          {showRateDetails ? (
            <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {providerName ? (
                  <p>
                    {t('dashboardMetrics.source', {
                      defaultValue: 'Source: {{value}}',
                      value: providerName,
                    })}
                  </p>
                ) : null}
                {updatedAt ? (
                  <p>
                    {t('dashboardMetrics.updatedAt', {
                      defaultValue: 'Updated: {{value}}',
                      value: updatedAt,
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function DashboardMetrics({
  activePeriod,
  hasConfigurationWarning = false,
  variant = 'default',
  mobileAfterSummary,
}: {
  activePeriod: DashboardActivePeriod;
  hasConfigurationWarning?: boolean;
  variant?: 'default' | 'mobile-dashboard';
  mobileAfterSummary?: React.ReactNode;
}) {
  const { t } = useTranslation('portal');
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const isArabic = language === 'ar';
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextMetrics = await getDashboardMetrics({
        startDate: activePeriod.startDate,
        endDate: activePeriod.endDate,
        mode: activePeriod.mode,
      });
      setMetrics(nextMetrics);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [activePeriod.endDate, activePeriod.mode, activePeriod.startDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['dashboard', 'transactions', 'financial_accounts'], 'DashboardMetrics', async () => {
    await load();
  });

  if (loading) {
    if (variant === 'mobile-dashboard') {
      return (
        <div className="space-y-3">
          <div className="animate-pulse rounded-[28px] bg-[linear-gradient(135deg,#0f3cbf,#1ab8f4)] p-5 text-white shadow-[0_18px_42px_-20px_rgba(37,99,235,0.5)]">
            <div className="h-4 w-28 rounded bg-white/20" />
            <div className="mt-4 h-10 w-44 rounded bg-white/20" />
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
              <div className="space-y-2">
                <div className="h-3 w-16 rounded bg-white/20" />
                <div className="h-6 w-24 rounded bg-white/20" />
              </div>
              <div className="space-y-2">
                <div className="h-3 w-16 rounded bg-white/20" />
                <div className="h-6 w-24 rounded bg-white/20" />
              </div>
            </div>
          </div>
          {mobileAfterSummary ? (
            <div className="animate-none">
              {mobileAfterSummary}
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-2.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`mobile-metric-skeleton-${index}`} className="animate-pulse rounded-[22px] border border-border/70 bg-card p-3">
                <div className="h-10 w-10 rounded-2xl bg-muted" />
                <div className="mt-4 h-3 w-16 rounded bg-muted" />
                <div className="mt-2 h-5 w-20 rounded bg-muted" />
                <div className="mt-2 h-3 w-14 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      );
    }

    const skeletonCards = Array.from({ length: 8 });

    return (
      <div className="grid grid-cols-2 gap-3 max-[340px]:grid-cols-1 md:grid-cols-4 lg:grid-cols-3">
        {skeletonCards.map((_, i) => (
          <div
            key={`skel-${i}`}
            className={`metric-card h-full min-h-[116px] animate-pulse rounded-[24px] px-4 py-3.5 max-[480px]:min-h-[104px] max-[480px]:rounded-[20px] max-[480px]:px-3 max-[480px]:py-2.5 ${
              i === 0
                ? 'col-span-2 max-[340px]:col-span-1 md:col-span-2 lg:col-span-2'
                : i === 5
                  ? 'col-span-2 max-[340px]:col-span-1 md:col-span-2 lg:col-span-1'
                  : i >= 6
                    ? 'md:col-span-2 lg:col-span-1'
                    : ''
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3.5 w-24 rounded bg-muted" />
                <div className="h-6 w-28 rounded bg-muted" />
              </div>
              <div className="h-10 w-10 rounded-2xl bg-muted" />
            </div>
            <div className="h-3 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const isMonthMode = activePeriod.mode === 'month';
  const flowLabel = isMonthMode ? t('dashboardMetrics.monthly') : t('dashboardMetrics.period');

  const budgetTotals = new Map(metrics.totalBudget.originalTotals.map((row) => [row.currency, row.amount]));
  const budgetSpent = new Map(metrics.budgetSpent.originalTotals.map((row) => [row.currency, row.amount]));
  const budgetRemaining = Array.from(new Set([...budgetTotals.keys(), ...budgetSpent.keys()]))
    .map((currency) => ({
      currency,
      amount: (budgetTotals.get(currency) || 0) - (budgetSpent.get(currency) || 0),
      usedPct: (budgetTotals.get(currency) || 0) > 0
        ? ((budgetSpent.get(currency) || 0) / (budgetTotals.get(currency) || 0)) * 100
        : 0,
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency, 'en', { sensitivity: 'base' }));

  const budgetRemainingMetric: DashboardConvertedMetric = {
    originalTotals: budgetRemaining.map((row) => ({ currency: row.currency, amount: row.amount })),
    reportingCurrency: metrics.defaultCurrency,
    reportingAmount:
      metrics.totalBudget.reportingAmount !== null && metrics.budgetSpent.reportingAmount !== null
        ? metrics.totalBudget.reportingAmount - metrics.budgetSpent.reportingAmount
        : null,
    allOriginalInReportingCurrency: budgetRemaining.every((row) => row.currency === metrics.defaultCurrency),
    conversionAvailable:
      budgetRemaining.every((row) => row.currency === metrics.defaultCurrency) ||
      (metrics.totalBudget.conversionAvailable && metrics.budgetSpent.conversionAvailable),
    rateDate: metrics.totalBudget.rateDate || metrics.budgetSpent.rateDate,
    provider: metrics.totalBudget.provider || metrics.budgetSpent.provider,
    providerTimestamp: metrics.totalBudget.providerTimestamp || metrics.budgetSpent.providerTimestamp,
    fetchedAt: metrics.totalBudget.fetchedAt || metrics.budgetSpent.fetchedAt,
    freshness: metrics.totalBudget.freshness,
    stale: metrics.totalBudget.stale || metrics.budgetSpent.stale,
    lookupMode: metrics.totalBudget.lookupMode,
    unavailableReason: metrics.totalBudget.unavailableReason || metrics.budgetSpent.unavailableReason,
  };
  const hasApplicableBudgets = metrics.activeBudgetCount > 0;
  const hasBudgetSpending = metrics.budgetSpent.originalTotals.some((row) => Math.abs(Number(row.amount || 0)) > 0);

  const hasSingleCashFlowCurrency =
    metrics.monthlyIncome.originalTotals.length === 1 &&
    metrics.monthlyExpenses.originalTotals.length <= 1 &&
    metrics.netCashFlow.originalTotals.length === 1 &&
    (metrics.monthlyExpenses.originalTotals.length === 0 ||
      metrics.monthlyIncome.originalTotals[0].currency === metrics.monthlyExpenses.originalTotals[0].currency) &&
    metrics.monthlyIncome.originalTotals[0].currency === metrics.netCashFlow.originalTotals[0].currency;

  const hasExpenseAlert = hasSingleCashFlowCurrency
    ? (metrics.monthlyExpenses.originalTotals[0]?.amount || 0) > (metrics.monthlyIncome.originalTotals[0]?.amount || 0)
    : false;

  const renderOriginalCurrencyRows = (
    rows: Array<{ currency: string; amount: number }>,
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md',
    className = '',
    numberClassName = ''
  ) => {
    const safeRows = rows.length > 0
      ? rows
      : [{ currency: metrics.defaultCurrency, amount: 0 }];

    return (
      <div className="flex flex-col gap-1">
        {safeRows.map((row) => (
          <FormattedCurrencyAmount
            key={`${row.currency}-${row.amount}`}
            amount={row.amount}
            currencyCode={row.currency}
            size={size}
            showCode
            className={className}
            numberClassName={numberClassName}
          />
        ))}
      </div>
    );
  };

  const renderMetricValue = (
    metric: DashboardConvertedMetric,
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md',
    className = '',
    numberClassName = ''
  ) => {
    if (metric.reportingAmount === null) {
      return renderOriginalCurrencyRows(metric.originalTotals, size, className, numberClassName);
    }

    return (
      <FormattedCurrencyAmount
        amount={metric.reportingAmount}
        currencyCode={metric.reportingCurrency}
        size={size}
        showCode
        className={className}
        numberClassName={numberClassName}
      />
    );
  };

  const renderMetricMeta = (metric: DashboardConvertedMetric) => {
    if (metric.reportingAmount === null) {
      return t('dashboardMetrics.originalCurrenciesOnly');
    }
    if (metric.allOriginalInReportingCurrency) {
      return null;
    }
    return metric.stale
      ? t('dashboardMetrics.reportingTotalStale')
      : t('dashboardMetrics.reportingTotal');
  };

  const renderMetricDetails = (metric: DashboardConvertedMetric) => {
    return <OriginalCurrencyDisclosure metric={metric} locale={locale} t={t} />;
  };

  const isZeroAmount = (amount: number | null | undefined) => Math.abs(Number(amount || 0)) < 0.000001;

  const isZeroMetric = (metric: DashboardConvertedMetric | undefined) => {
    if (!metric) return true;
    if (metric.originalTotals.length > 0) {
      return metric.originalTotals.every((row) => isZeroAmount(row.amount));
    }
    return isZeroAmount(metric.reportingAmount);
  };

  const getSignedDirection = (metric: DashboardConvertedMetric | undefined): DashboardMetricCard['changeDir'] => {
    if (!metric || isZeroMetric(metric)) return 'neutral';
    return metric.originalTotals.every((row) => row.amount >= 0) ? 'up' : 'down';
  };

  const getFixedDirection = (
    metric: DashboardConvertedMetric | undefined,
    nonZeroDirection: Extract<DashboardMetricCard['changeDir'], 'up' | 'down'>
  ): DashboardMetricCard['changeDir'] => {
    if (!metric || isZeroMetric(metric)) return 'neutral';
    return nonZeroDirection;
  };

  const personalCards: DashboardMetricCard[] = [
    {
      id: 'metric-balance',
      label: t('dashboardMetrics.cards.personalBalance'),
      valueMetric: metrics.totalBalance,
      priority: 'primary',
      changeMetric: metrics.netCashFlow,
      changeDir: getSignedDirection(metrics.netCashFlow),
      changeLabel: isMonthMode ? t('dashboardMetrics.netChangeThisMonth') : t('dashboardMetrics.netChangeThisPayPeriod'),
      icon: Wallet,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
    },
    {
      id: 'metric-income',
      label: t('dashboardMetrics.cards.flowIncome', { flow: flowLabel }),
      valueMetric: metrics.monthlyIncome,
      priority: 'secondary',
      changeDir: getFixedDirection(metrics.monthlyIncome, 'up'),
      changeLabel: activePeriod.label,
      icon: TrendingUp,
      iconBg: 'bg-positive-soft',
      iconColor: 'text-positive',
    },
    {
      id: 'metric-expenses',
      label: t('dashboardMetrics.cards.flowExpenses', { flow: flowLabel }),
      valueMetric: metrics.monthlyExpenses,
      priority: 'secondary',
      changeDir: getFixedDirection(metrics.monthlyExpenses, 'down'),
      changeLabel: activePeriod.label,
      icon: TrendingDown,
      iconBg: 'bg-negative-soft',
      iconColor: 'text-negative',
      alert: hasExpenseAlert,
    },
    {
      id: 'metric-netflow',
      label: isMonthMode ? t('dashboardMetrics.cards.netCashFlow') : t('dashboardMetrics.cards.periodCashFlow'),
      valueMetric: metrics.netCashFlow,
      priority: 'secondary',
      change: isZeroMetric(metrics.netCashFlow)
        ? undefined
        : metrics.netCashFlow.originalTotals.length > 1
          ? t('dashboardMetrics.mixedCurrencies')
          : metrics.netCashFlow.originalTotals[0]?.amount >= 0
            ? t('dashboardMetrics.positive')
            : t('dashboardMetrics.negative'),
      changeDir: getSignedDirection(metrics.netCashFlow),
      changeLabel: t('dashboardMetrics.incomeMinusExpenses'),
      icon: ArrowUpDown,
      iconBg: 'bg-info-soft',
      iconColor: 'text-info',
    },
    {
      id: 'metric-budget',
      label: t('dashboardMetrics.cards.budgetRemaining'),
      valueMetric: budgetRemainingMetric,
      priority: 'secondary',
      valueContent: metrics.budgetConversionUnavailableCount > 0 ? (
        <span className="text-[0.95rem] font-700 text-warning md:text-[0.9rem] lg:text-[0.95rem]">{t('dashboardMetrics.unavailable')}</span>
      ) : undefined,
      change: !hasApplicableBudgets
        ? t('dashboardMetrics.noBudgetsForPeriod')
        : metrics.budgetConversionUnavailableCount > 0
          ? t('dashboardMetrics.conversionUnavailable')
          : !hasBudgetSpending
            ? t('dashboardMetrics.noSpendingInPeriod')
            : t('dashboardMetrics.acrossActiveBudgetCount', { count: metrics.activeBudgetCount }),
      changeDir: 'neutral' as const,
      changeLabel: !hasApplicableBudgets
        ? isMonthMode ? t('dashboardMetrics.forPeriod', { period: activePeriod.label }) : t('dashboardMetrics.duringPeriod', { period: activePeriod.label })
        : metrics.budgetConversionUnavailableCount > 0
          ? t('dashboardMetrics.budgetsNeedHistoricalFx', { count: metrics.budgetConversionUnavailableCount })
          : !hasBudgetSpending
            ? metrics.hasMixedBudgetCycles
              ? t('dashboardMetrics.acrossActiveCycleBudgets', {
                  cycles: metrics.activeBudgetCyclePeriods
                    .map((period) => getBudgetPeriodTypeLabel(period, t).toLowerCase())
                    .join(` ${t('dashboardMetrics.and')} `),
                })
              : t('dashboardMetrics.acrossActiveSingleCycleBudgets', {
                  cycle: getBudgetPeriodTypeLabel(metrics.activeBudgetCyclePeriods[0] || 'monthly', t).toLowerCase(),
                })
          : metrics.hasMixedBudgetCycles
            ? t('dashboardMetrics.acrossActiveCycleBudgets', {
                cycles: metrics.activeBudgetCyclePeriods
                  .map((period) => getBudgetPeriodTypeLabel(period, t).toLowerCase())
                  .join(` ${t('dashboardMetrics.and')} `),
              })
            : t('dashboardMetrics.acrossActiveSingleCycleBudgets', {
                cycle: getBudgetPeriodTypeLabel(metrics.activeBudgetCyclePeriods[0] || 'monthly', t).toLowerCase(),
              }),
      icon: Target,
      iconBg: 'bg-warning-soft',
      iconColor: 'text-warning',
      warningState: metrics.activeBudgetCount > 0 && metrics.budgetConversionUnavailableCount === 0 && budgetRemaining.some((row) => row.usedPct >= 70),
      budgetPct: metrics.activeBudgetCount > 0 && metrics.budgetConversionUnavailableCount === 0 && budgetRemaining.length === 1 ? budgetRemaining[0].usedPct : undefined,
    },
    {
      id: 'metric-upcoming',
      label: t('dashboardMetrics.cards.upcomingPayments'),
      valueMetric: metrics.upcomingPayments,
      priority: 'secondary',
      change: t('dashboardMetrics.paymentCount', { count: metrics.upcomingPaymentsCount }),
      changeDir: 'neutral' as const,
      changeLabel: isMonthMode ? t('dashboardMetrics.scheduledIn', { period: activePeriod.label }) : t('dashboardMetrics.dueIn', { period: activePeriod.label }),
      icon: CalendarClock,
      iconBg: 'bg-secondary',
      iconColor: 'text-muted-foreground',
    },
  ];

  const loanCards: DashboardMetricCard[] = [
    {
      id: 'metric-loan-outstanding',
      label: t('dashboardMetrics.cards.outstandingLoans'),
      valueMetric: metrics.outstandingLoanBalance,
      priority: 'supporting',
      changeMetric: isZeroMetric(metrics.loanBorrowedThisMonth) ? undefined : metrics.loanBorrowedThisMonth,
      changeDir: 'neutral' as const,
      changeLabel: t('dashboardMetrics.borrowedIn', { period: activePeriod.label }),
      icon: TrendingDown,
      iconBg: 'bg-rose-50',
      iconColor: 'text-rose-500',
    },
    {
      id: 'metric-loan-repaid',
      label: t('dashboardMetrics.cards.loanRepayments'),
      valueMetric: metrics.loanRepaidThisMonth,
      priority: 'supporting',
      changeDir: 'neutral' as const,
      changeLabel: t('dashboardMetrics.paidIn', { period: activePeriod.label }),
      icon: ArrowUpDown,
      iconBg: 'bg-cyan-50',
      iconColor: 'text-cyan-500',
    },
  ];

  personalCards[0].iconBg = 'bg-blue-50';
  personalCards[0].iconColor = 'text-blue-500';
  personalCards[1].iconBg = 'bg-emerald-50';
  personalCards[1].iconColor = 'text-emerald-500';
  personalCards[2].iconBg = 'bg-rose-50';
  personalCards[2].iconColor = 'text-rose-500';
  personalCards[3].iconBg = 'bg-indigo-50';
  personalCards[3].iconColor = 'text-indigo-500';
  personalCards[4].iconBg = 'bg-amber-50';
  personalCards[4].iconColor = 'text-amber-500';
  personalCards[5].iconBg = 'bg-violet-50';
  personalCards[5].iconColor = 'text-violet-500';

  const metricCards = [
    personalCards[0],
    personalCards[1],
    personalCards[2],
    personalCards[3],
    personalCards[4],
    personalCards[5],
    loanCards[0],
    loanCards[1],
  ];

  if (variant === 'mobile-dashboard') {
    const netCashFlowPositive = (metrics.netCashFlow.reportingAmount ?? 0) >= 0;
    const budgetUsagePct = budgetRemaining.length === 1
      ? Math.max(0, Math.min(100, Math.round(budgetRemaining[0].usedPct)))
      : null;
    const budgetUsageLabel = budgetUsagePct !== null
      ? t('dashboardMetrics.mobileBudgetUsed', { percent: budgetUsagePct })
      : hasApplicableBudgets
        ? t('dashboardMetrics.mobileBudgetMixed')
        : t('dashboardMetrics.mobileBudgetEmpty');
    const upcomingCountLabel = metrics.upcomingPaymentsCount > 0
      ? t('dashboardMetrics.mobileUpcomingCount', { count: metrics.upcomingPaymentsCount })
      : t('dashboardMetrics.mobileUpcomingEmpty');
    const netLabel = activePeriod.mode === 'month'
      ? t('dashboardMetrics.mobileThisMonth')
      : t('dashboardMetrics.mobileThisPeriod');

    const renderMobileCurrencyText = (metric: DashboardConvertedMetric, className: string) => {
      if (metric.reportingAmount === null) {
        const safeRows = metric.originalTotals.length > 0
          ? metric.originalTotals
          : [{ currency: metrics.defaultCurrency, amount: 0 }];

        return (
          <div className="flex flex-col gap-1.5">
            {safeRows.map((row) => (
              <FormattedCurrencyAmount
                key={`${row.currency}-${row.amount}`}
                amount={row.amount}
                currencyCode={row.currency}
                locale={locale}
                textOnly
                showCode
                className={className}
              />
            ))}
          </div>
        );
      }

      return (
        <FormattedCurrencyAmount
          amount={metric.reportingAmount}
          currencyCode={metric.reportingCurrency}
          locale={locale}
          textOnly
          showCode
          className={className}
        />
      );
    };

    return (
      <div className="space-y-3.5">
        {hasConfigurationWarning ? (
          <p className="text-sm text-warning">{t('dashboardMetrics.monthFallbackWarning')}</p>
        ) : null}

        <section className="relative overflow-hidden rounded-[30px] bg-[linear-gradient(135deg,#0f3cbf_0%,#105ce0_42%,#18baf6_100%)] p-5 text-white shadow-[0_22px_46px_-22px_rgba(37,99,235,0.6)]">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 bottom-[-3.5rem] h-48 w-48 rounded-full border border-white/10 opacity-70" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-4 bottom-2 h-40 w-40 rounded-full border border-white/10 opacity-70" />
          <div aria-hidden="true" className="pointer-events-none absolute right-8 bottom-12 h-24 w-24 rounded-full border border-white/10 opacity-70" />

          <div className="relative z-[1]">
            <div className="flex items-center gap-2 text-[13px] font-600 text-white/90">
              <span>{t('dashboardMetrics.mobileSummaryTitle')}</span>
              <Eye size={16} className="text-white/85" />
            </div>

            <div className="mt-3 font-tabular">
              {renderMobileCurrencyText(
                metrics.totalBalance,
                'inline-flex items-baseline whitespace-nowrap text-[40px] font-800 leading-[1.02] tracking-[-0.04em] text-white max-[360px]:text-[36px]'
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/15 pt-4">
              <div className="space-y-1.5">
                <p className="text-[12px] font-500 text-white/80">{t('dashboardMetrics.mobileIncome')}</p>
                <div className="font-tabular">
                  {renderMobileCurrencyText(
                    metrics.monthlyIncome,
                    'inline-flex items-baseline whitespace-nowrap text-[16px] font-700 leading-none tracking-[-0.03em] text-white'
                  )}
                </div>
              </div>
              <div className="space-y-1.5 border-s border-white/15 ps-3">
                <p className="text-[12px] font-500 text-white/80">{t('dashboardMetrics.mobileExpenses')}</p>
                <div className="font-tabular">
                  {renderMobileCurrencyText(
                    metrics.monthlyExpenses,
                    'inline-flex items-baseline whitespace-nowrap text-[16px] font-700 leading-none tracking-[-0.03em] text-white'
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 border-t border-white/15 pt-3 text-[12px] font-700">
              {netCashFlowPositive ? (
                <ArrowUp size={16} className="text-[#4ade80]" />
              ) : (
                <ArrowDown size={16} className="text-[#fda4af]" />
              )}
              <div className={`font-tabular ${netCashFlowPositive ? 'text-[#86efac]' : 'text-[#fecdd3]'}`}>
                {renderMobileCurrencyText(
                  metrics.netCashFlow,
                  'inline-flex items-baseline text-[13px] font-800 leading-none tracking-[-0.02em]'
                )}
              </div>
              <span className="text-white/90">{netLabel}</span>
            </div>
          </div>
        </section>

        {mobileAfterSummary ? (
          <div>
            {mobileAfterSummary}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-2.5">
          <article className="rounded-[20px] border border-emerald-100/80 bg-[linear-gradient(180deg,#ffffff,#f3fbf7)] p-3 shadow-[0_14px_28px_-24px_rgba(16,185,129,0.55)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
              <TrendingUp size={17} />
            </div>
            <p className="mt-2.5 text-[11px] font-700 leading-4 text-slate-700">{netLabel}</p>
            <p className={`mt-1 text-[0.98rem] font-800 leading-none tracking-[-0.03em] ${netCashFlowPositive ? 'text-emerald-600' : 'text-rose-500'}`}>
              {netCashFlowPositive ? t('dashboardMetrics.mobilePositiveShort') : t('dashboardMetrics.mobileNegativeShort')}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{t('dashboardMetrics.mobileNetCashFlow')}</p>
          </article>

          <article className="rounded-[20px] border border-violet-100/80 bg-[linear-gradient(180deg,#ffffff,#f7f4ff)] p-3 shadow-[0_14px_28px_-24px_rgba(139,92,246,0.45)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              <CalendarClock size={17} />
            </div>
            <p className="mt-2.5 text-[11px] font-700 leading-4 text-slate-700">{t('dashboardMetrics.mobileUpcoming')}</p>
            <p className="mt-1 text-[0.98rem] font-800 leading-none tracking-[-0.03em] text-violet-600">
              {metrics.upcomingPaymentsCount > 0 ? metrics.upcomingPaymentsCount : '0'}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{upcomingCountLabel}</p>
          </article>

          <article className="rounded-[20px] border border-amber-100/90 bg-[linear-gradient(180deg,#ffffff,#fff7ed)] p-3 shadow-[0_14px_28px_-24px_rgba(245,158,11,0.4)]">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <Target size={17} />
            </div>
            <p className="mt-2.5 text-[11px] font-700 leading-4 text-slate-700">{t('dashboardMetrics.mobileBudget')}</p>
            <p className="mt-1 text-[0.98rem] font-800 leading-none tracking-[-0.03em] text-amber-600">
              {budgetUsagePct !== null ? `${budgetUsagePct}%` : t('dashboardMetrics.mobileBudgetFallbackShort')}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">{budgetUsageLabel}</p>
            {budgetUsagePct !== null ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-amber-100">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#fb923c,#f59e0b)]"
                  style={{ width: `${budgetUsagePct}%` }}
                />
              </div>
            ) : null}
          </article>
        </div>
      </div>
    );
  }

  const renderMetricCard = (metric: DashboardMetricCard) => {
    const Icon = metric.icon;
    const isPrimary = metric.priority === 'primary';
    const isSupporting = metric.priority === 'supporting';
    const isUpcomingCard = metric.id === 'metric-upcoming';
    const gridSpanClassName = isPrimary
      ? 'col-span-2 max-[340px]:col-span-1 md:col-span-2 lg:col-span-2'
      : isUpcomingCard
        ? 'col-span-2 max-[340px]:col-span-1 md:col-span-2 lg:col-span-1'
        : isSupporting
          ? 'md:col-span-2 lg:col-span-1'
          : '';
    const hasDistinctSecondaryMetric = Boolean(metric.changeMetric && metric.changeMetric !== metric.valueMetric);
    const secondaryContent = hasDistinctSecondaryMetric
      ? renderMetricValue(metric.changeMetric!, 'xs')
      : metric.change;
    const hasSecondaryContent = Boolean(secondaryContent);
    const valueClassName = isPrimary
      ? `inline-flex items-baseline font-800 tracking-[-0.035em] md:text-[1.68rem] lg:text-[1.78rem] ${isArabic ? 'text-[1.76rem] leading-[1.25] max-[480px]:text-[1.5rem]' : 'text-[1.72rem] max-[480px]:text-[1.42rem]'}`
      : isSupporting
        ? `inline-flex items-baseline font-700 tracking-[-0.02em] md:text-[1.05rem] ${isArabic ? 'text-[1.11rem] leading-[1.3] max-[480px]:text-[1.02rem]' : 'text-[1.08rem] max-[480px]:text-[0.98rem]'}`
        : `inline-flex items-baseline font-800 tracking-[-0.025em] md:text-[1.14rem] ${isArabic ? 'text-[1.22rem] leading-[1.28] max-[480px]:text-[1.08rem]' : 'text-[1.18rem] max-[480px]:text-[1.02rem]'}`;
    const helperChangeLabel = metric.id === 'metric-netflow'
      ? t('dashboardMetrics.netOfIncomeAndExpenses')
      : metric.id === 'metric-upcoming'
        ? t('dashboardMetrics.scheduledThisPeriod')
        : metric.changeLabel;
    const primaryDirectionAccent = metric.changeDir === 'down' ? 'from-rose-200/55 via-transparent to-transparent' : 'from-sky-200/55 via-transparent to-transparent';
    const primaryOrbAccent = metric.changeDir === 'down' ? 'bg-rose-200/45' : 'bg-sky-200/55';
    const primaryRingAccent = metric.changeDir === 'down'
      ? 'border-rose-200/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(255,241,242,0.92))]'
      : 'border-sky-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(239,246,255,0.92))]';

    return (
      <div
        key={metric.id}
        className={`metric-card flex h-full min-h-[116px] flex-col rounded-[24px] border border-border/80 px-4 py-3.5 shadow-card-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-muted/15 hover:shadow-card-md max-[480px]:min-h-[104px] max-[480px]:rounded-[20px] max-[480px]:px-3 max-[480px]:py-2.5 ${
          metric.alert ? 'border-negative/25 bg-negative-soft/20' : 'bg-card'
        } ${metric.warningState ? 'border-warning/30' : ''} ${
          isPrimary ? 'border-sky-200/85 bg-[linear-gradient(160deg,rgba(249,252,255,0.98),rgba(239,246,255,0.93))] px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_38px_-24px_rgba(59,130,246,0.3)] max-[480px]:px-3.5 max-[480px]:py-3' : ''
        } ${
          isSupporting ? 'border-border/65 bg-muted/30 hover:bg-muted/40' : ''
        } ${gridSpanClassName}`}
      >
        {isPrimary ? (
          <>
            <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.78),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.6),transparent_32%)]`} />
            <div aria-hidden="true" className={`pointer-events-none absolute -top-10 end-4 h-28 w-28 rounded-full blur-2xl ${primaryOrbAccent}`} />
            <div aria-hidden="true" className={`pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-br ${primaryDirectionAccent}`} />
          </>
        ) : null}
        <div className={`relative z-[1] mb-1.5 flex items-start justify-between gap-2.5 ${isPrimary ? 'lg:mb-2.5' : 'lg:mb-2'}`}>
          <div className={`min-w-0 ${isPrimary ? 'space-y-1.5 lg:space-y-2.5' : 'lg:space-y-2'}`}>
            <p className={`min-h-[2.45rem] leading-[1.25rem] max-[480px]:min-h-[2.2rem] max-[480px]:leading-[1.1rem] ${
              isPrimary
                ? `min-h-0 font-800 tracking-[-0.015em] text-foreground ${isArabic ? 'text-[14.5px] leading-6 max-[480px]:text-[13.25px] max-[480px]:leading-5' : 'text-[14px] max-[480px]:text-[12.5px]'}`
                : isSupporting
                  ? `font-800 tracking-[-0.012em] text-foreground/88 ${isArabic ? 'text-[13.25px] leading-5 max-[480px]:text-[12.25px] max-[480px]:leading-5' : 'text-[13px] max-[480px]:text-[11.75px]'}`
                  : `font-800 tracking-[-0.012em] text-foreground/95 ${isArabic ? 'text-[13.75px] leading-5 max-[480px]:text-[12.75px] max-[480px]:leading-5' : 'text-[13.5px] max-[480px]:text-[12.25px]'}`
            }`}>
              {metric.label}
            </p>
            <div className={`mt-0.5 min-h-[2.2rem] font-tabular leading-tight ${isSupporting ? 'text-foreground/90' : 'text-foreground'} lg:mt-0`}>
              {metric.valueContent ?? renderMetricValue(metric.valueMetric, isPrimary ? 'xl' : isSupporting ? 'xs' : 'sm', valueClassName, isPrimary ? 'font-800' : 'font-700')}
            </div>
          </div>
          <div className={`relative z-[1] flex flex-shrink-0 items-center justify-center ${isPrimary ? 'h-11 w-11 rounded-[18px] border shadow-[0_14px_24px_-18px_rgba(37,99,235,0.45)]' : 'h-10 w-10 rounded-2xl'} max-[480px]:h-8.5 max-[480px]:w-8.5 max-[480px]:rounded-xl ${isPrimary ? primaryRingAccent : metric.iconBg}`}>
            <Icon size={isPrimary ? 19 : 18} className={`${metric.iconColor} max-[480px]:h-4 max-[480px]:w-4`} />
          </div>
        </div>
        <div className={`relative z-[1] mt-auto ${isPrimary ? 'space-y-1.5 lg:space-y-2.5' : 'space-y-1.5 lg:space-y-2'}`}>
          {hasSecondaryContent ? (
            <div className="flex items-start gap-1.5">
              {metric.changeDir === 'up' && <ArrowUp size={13} className="text-positive flex-shrink-0" />}
              {metric.changeDir === 'down' && <ArrowDown size={13} className="text-negative flex-shrink-0" />}
              <div className="min-w-0">
                <div className={`font-tabular leading-none max-[480px]:text-[12px] ${
                  isPrimary ? (isArabic ? 'text-[0.98rem] font-800 leading-5 md:text-[1rem]' : 'text-[0.95rem] font-800 md:text-[1rem]') : isSupporting ? (isArabic ? 'text-[0.86rem] font-700 leading-5 md:text-[0.88rem]' : 'text-[0.82rem] font-700 md:text-[0.85rem]') : (isArabic ? 'text-[0.92rem] font-700 leading-5' : 'text-sm font-700')
                } ${
                  metric.changeDir === 'up' ? 'text-positive' :
                  metric.changeDir === 'down' ? 'text-negative' : 'text-muted-foreground'
                }`}>
                  {secondaryContent}
                </div>
                <p className={`mt-1.5 text-muted-foreground max-[480px]:leading-[1rem] ${
                  isPrimary
                    ? isArabic ? 'text-[12.5px] font-600 leading-5 max-[480px]:text-[12px] lg:mt-2' : 'text-[12px] font-600 leading-4 max-[480px]:text-[11.5px] lg:mt-2'
                    : isSupporting
                      ? isArabic ? 'text-[12px] leading-5 max-[480px]:text-[11.5px] lg:mt-1.5' : 'text-[11.5px] leading-[0.95rem] max-[480px]:text-[11px] lg:mt-1.5'
                      : isArabic ? 'text-[13px] leading-5 max-[480px]:text-[12px] lg:mt-2' : 'text-[12.5px] leading-4 max-[480px]:text-[11.5px] lg:mt-2'
                }`}>
                  {helperChangeLabel}
                </p>
              </div>
            </div>
          ) : (
            <p className={`text-muted-foreground max-[480px]:leading-[1rem] ${
              isPrimary
                ? isArabic ? 'text-[12.5px] font-600 leading-5 max-[480px]:text-[12px]' : 'text-[12px] font-600 leading-4 max-[480px]:text-[11.5px]'
                : isSupporting
                  ? isArabic ? 'text-[12px] leading-5 max-[480px]:text-[11.5px]' : 'text-[11.5px] leading-[0.95rem] max-[480px]:text-[11px]'
                  : isArabic ? 'text-[13px] leading-5 max-[480px]:text-[12px]' : 'text-[12.5px] leading-4 max-[480px]:text-[11.5px]'
            }`}>
              {helperChangeLabel}
            </p>
          )}
          {renderMetricDetails(metric.valueMetric)}
        </div>
        {metric.warningState && metric.budgetPct !== undefined && (
          <div className="mt-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${metric.budgetPct >= 90 ? 'budget-bar-red' : 'budget-bar-amber'}`}
                style={{ width: `${Math.min(metric.budgetPct, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      {hasConfigurationWarning ? (
        <p className="text-sm text-warning">{t('dashboardMetrics.monthFallbackWarning')}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 max-[340px]:grid-cols-1 md:grid-cols-4 lg:grid-cols-3">
        {metricCards.map((metric) => renderMetricCard(metric))}
      </div>
    </div>
  );
}
