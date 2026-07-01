'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wallet, TrendingUp, TrendingDown, ArrowUpDown, Target, CalendarClock, ArrowUp, ArrowDown,
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
  return provider.replace(/_/g, ' ');
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
  const providerTimestamp = formatCompactDateTime(metric.providerTimestamp, locale);
  const fetchedAt = formatCompactDateTime(metric.fetchedAt, locale);
  const providerName = formatProviderName(metric.provider);
  const showHistoricalStatus = metric.lookupMode === 'previous_available';

  return (
    <div className="mt-2 rounded-2xl border border-border/70 bg-muted/15 px-3 py-2.5 max-[480px]:mt-1.5">
      <button
        type="button"
        className="text-xs font-700 text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => {
          const nextOpen = !isOpen;
          setIsOpen(nextOpen);
          if (!nextOpen) {
            setShowRateDetails(false);
          }
        }}
        aria-expanded={isOpen}
      >
        {t('dashboardMetrics.viewOriginalCurrencies', {
          defaultValue: 'View original currencies',
        })}
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

          {showHistoricalStatus ? (
            <p className="rounded-xl bg-muted/40 px-2.5 py-2 text-foreground/90">
              {t('dashboardMetrics.historicalRateUsed', {
                defaultValue: 'Historical exchange rate used',
              })}
            </p>
          ) : null}

          {metric.stale ? (
            <p className="rounded-xl bg-warning-soft/20 px-2.5 py-2 text-warning">
              {t('dashboardMetrics.staleRatesCompact', {
                defaultValue: 'A recent rate was unavailable, so Smart Pocket used the latest available historical rate.',
              })}
            </p>
          ) : null}

          {metric.unavailableReason ? (
            <p className="rounded-xl bg-warning-soft/20 px-2.5 py-2 text-warning">{metric.unavailableReason}</p>
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
            <button
              type="button"
              className="text-xs font-700 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => {
                setIsOpen(false);
                setShowRateDetails(false);
              }}
            >
              {t('dashboardMetrics.hideOriginalCurrencies', {
                defaultValue: 'Hide',
              })}
            </button>
          </div>

          {showRateDetails ? (
            <div className="rounded-xl border border-border/70 bg-card px-3 py-2.5">
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {providerName ? (
                  <p>
                    {t('dashboardMetrics.provider', { value: providerName })}
                  </p>
                ) : null}
                {providerTimestamp ? (
                  <p>
                    {t('dashboardMetrics.providerTimestampCompact', {
                      defaultValue: 'Provider timestamp: {{value}}',
                      value: providerTimestamp,
                    })}
                  </p>
                ) : null}
                {fetchedAt ? (
                  <p>
                    {t('dashboardMetrics.fetchedAtCompact', {
                      defaultValue: 'Fetched: {{value}}',
                      value: fetchedAt,
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
}: {
  activePeriod: DashboardActivePeriod;
  hasConfigurationWarning?: boolean;
}) {
  const { t } = useTranslation('portal');
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
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
      ? 'inline-flex items-baseline text-[1.72rem] font-800 tracking-[-0.035em] max-[480px]:text-[1.42rem] md:text-[1.68rem] lg:text-[1.78rem]'
      : isSupporting
        ? 'inline-flex items-baseline text-[1.08rem] font-700 tracking-[-0.02em] max-[480px]:text-[0.98rem] md:text-[1.05rem]'
        : 'inline-flex items-baseline text-[1.18rem] font-800 tracking-[-0.025em] max-[480px]:text-[1.02rem] md:text-[1.14rem]';
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
                ? 'min-h-0 text-[14px] font-800 tracking-[-0.015em] text-foreground max-[480px]:text-[12.5px]'
                : isSupporting
                  ? 'text-[13px] font-800 tracking-[-0.012em] text-foreground/88 max-[480px]:text-[11.75px]'
                  : 'text-[13.5px] font-800 tracking-[-0.012em] text-foreground/95 max-[480px]:text-[12.25px]'
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
                  isPrimary ? 'text-[0.95rem] font-800 md:text-[1rem]' : isSupporting ? 'text-[0.82rem] font-700 md:text-[0.85rem]' : 'text-sm font-700'
                } ${
                  metric.changeDir === 'up' ? 'text-positive' :
                  metric.changeDir === 'down' ? 'text-negative' : 'text-muted-foreground'
                }`}>
                  {secondaryContent}
                </div>
                <p className={`mt-1.5 text-muted-foreground max-[480px]:leading-[1rem] ${
                  isPrimary
                    ? 'text-[12px] font-600 leading-4 max-[480px]:text-[11.5px] lg:mt-2'
                    : isSupporting
                      ? 'text-[11.5px] leading-[0.95rem] max-[480px]:text-[11px] lg:mt-1.5'
                      : 'text-[12.5px] leading-4 max-[480px]:text-[11.5px] lg:mt-2'
                }`}>
                  {helperChangeLabel}
                </p>
              </div>
            </div>
          ) : (
            <p className={`text-muted-foreground max-[480px]:leading-[1rem] ${
              isPrimary
                ? 'text-[12px] font-600 leading-4 max-[480px]:text-[11.5px]'
                : isSupporting
                  ? 'text-[11.5px] leading-[0.95rem] max-[480px]:text-[11px]'
                  : 'text-[12.5px] leading-4 max-[480px]:text-[11.5px]'
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
