'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Wallet, TrendingUp, TrendingDown, ArrowUpDown, Target, CalendarClock, ArrowUp, ArrowDown,
} from 'lucide-react';
import { getDashboardMetrics, type DashboardActivePeriod, type DashboardConvertedMetric, type DashboardMetrics } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

interface DashboardMetricCard {
  id: string;
  label: string;
  valueMetric: DashboardConvertedMetric;
  changeDir: 'up' | 'down' | 'neutral';
  changeLabel: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconBg: string;
  iconColor: string;
  hero: boolean;
  changeMetric?: DashboardConvertedMetric;
  change?: string;
  alert?: boolean;
  warningState?: boolean;
  budgetPct?: number;
  valueContent?: React.ReactNode;
  subtext?: string;
}

export default function DashboardMetrics({
  activePeriod,
  hasConfigurationWarning = false,
}: {
  activePeriod: DashboardActivePeriod;
  hasConfigurationWarning?: boolean;
}) {
  const { t } = useTranslation('portal');
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
      <div className="grid grid-cols-2 gap-3 max-[340px]:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {skeletonCards.map((_, i) => (
          <div key={`skel-${i}`} className="metric-card h-full min-h-[110px] animate-pulse rounded-[24px] px-4 py-3 max-[480px]:min-h-[104px] max-[480px]:rounded-[20px] max-[480px]:px-3 max-[480px]:py-2.5">
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
    const metaLabel = renderMetricMeta(metric);
    const shouldShowDetails =
      metric.originalTotals.length > 1 ||
      !metric.allOriginalInReportingCurrency ||
      Boolean(metric.provider) ||
      Boolean(metric.unavailableReason);

    if (!shouldShowDetails) {
      return null;
    }

    return (
      <details className="mt-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2 max-[480px]:mt-1.5">
        <summary className="cursor-pointer text-xs font-600 text-muted-foreground">
          {t('dashboardMetrics.viewOriginalCurrencies')}
        </summary>
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <div>{renderOriginalCurrencyRows(metric.originalTotals, 'xs')}</div>
          {metaLabel ? <p>{metaLabel}</p> : null}
          {metric.rateDate ? <p>{t('dashboardMetrics.rateDate', { value: metric.rateDate })}</p> : null}
          {metric.providerTimestamp ? <p>{t('dashboardMetrics.providerTimestamp', { value: metric.providerTimestamp })}</p> : null}
          {metric.fetchedAt ? <p>{t('dashboardMetrics.fetchedAt', { value: metric.fetchedAt })}</p> : null}
          {metric.provider ? <p>{t('dashboardMetrics.provider', { value: metric.provider })}</p> : null}
          {metric.unavailableReason ? <p className="text-warning">{metric.unavailableReason}</p> : null}
          {metric.stale && metric.provider ? <p className="text-warning">{t('dashboardMetrics.staleRates')}</p> : null}
        </div>
      </details>
    );
  };

  const personalCards: DashboardMetricCard[] = [
    {
      id: 'metric-balance',
      label: t('dashboardMetrics.cards.personalBalance'),
      valueMetric: metrics.totalBalance,
      changeMetric: metrics.netCashFlow,
      changeDir: metrics.netCashFlow.originalTotals.every((row) => row.amount >= 0) ? 'up' as const : 'down' as const,
      changeLabel: isMonthMode ? t('dashboardMetrics.netChangeThisMonth') : t('dashboardMetrics.netChangeThisPayPeriod'),
      icon: Wallet,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      hero: true,
      subtext: t('dashboardMetrics.netBalanceChange', { defaultValue: 'Net balance change' }),
    },
    {
      id: 'metric-income',
      label: t('dashboardMetrics.cards.flowIncome', { flow: flowLabel }),
      valueMetric: metrics.monthlyIncome,
      changeMetric: metrics.monthlyIncome,
      changeDir: 'up' as const,
      changeLabel: activePeriod.label,
      icon: TrendingUp,
      iconBg: 'bg-positive-soft',
      iconColor: 'text-positive',
      hero: false,
    },
    {
      id: 'metric-expenses',
      label: t('dashboardMetrics.cards.flowExpenses', { flow: flowLabel }),
      valueMetric: metrics.monthlyExpenses,
      changeMetric: metrics.monthlyExpenses,
      changeDir: 'down' as const,
      changeLabel: activePeriod.label,
      icon: TrendingDown,
      iconBg: 'bg-negative-soft',
      iconColor: 'text-negative',
      hero: false,
      alert: hasExpenseAlert,
    },
    {
      id: 'metric-netflow',
      label: isMonthMode ? t('dashboardMetrics.cards.netCashFlow') : t('dashboardMetrics.cards.periodCashFlow'),
      valueMetric: metrics.netCashFlow,
      change: metrics.netCashFlow.originalTotals.length > 1 ? t('dashboardMetrics.mixedCurrencies') : metrics.netCashFlow.originalTotals[0]?.amount >= 0 ? t('dashboardMetrics.positive') : t('dashboardMetrics.negative'),
      changeDir: metrics.netCashFlow.originalTotals.every((row) => row.amount >= 0) ? 'up' as const : 'down' as const,
      changeLabel: t('dashboardMetrics.incomeMinusExpenses'),
      icon: ArrowUpDown,
      iconBg: 'bg-info-soft',
      iconColor: 'text-info',
      hero: false,
    },
    {
      id: 'metric-budget',
      label: t('dashboardMetrics.cards.budgetRemaining'),
      valueMetric: budgetRemainingMetric,
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
              ? t('dashboardMetrics.acrossActiveCycleBudgets', { cycles: metrics.activeBudgetCycleLabels.join(` ${t('dashboardMetrics.and')} `).toLowerCase() })
              : t('dashboardMetrics.acrossActiveSingleCycleBudgets', { cycle: (metrics.activeBudgetCycleLabels[0] || t('dashboardMetrics.budget')).toLowerCase() })
          : metrics.hasMixedBudgetCycles
            ? t('dashboardMetrics.acrossActiveCycleBudgets', { cycles: metrics.activeBudgetCycleLabels.join(` ${t('dashboardMetrics.and')} `).toLowerCase() })
            : t('dashboardMetrics.acrossActiveSingleCycleBudgets', { cycle: (metrics.activeBudgetCycleLabels[0] || t('dashboardMetrics.budget')).toLowerCase() }),
      icon: Target,
      iconBg: 'bg-warning-soft',
      iconColor: 'text-warning',
      hero: false,
      warningState: metrics.activeBudgetCount > 0 && metrics.budgetConversionUnavailableCount === 0 && budgetRemaining.some((row) => row.usedPct >= 70),
      budgetPct: metrics.activeBudgetCount > 0 && metrics.budgetConversionUnavailableCount === 0 && budgetRemaining.length === 1 ? budgetRemaining[0].usedPct : undefined,
    },
    {
      id: 'metric-upcoming',
      label: t('dashboardMetrics.cards.upcomingPayments'),
      valueMetric: metrics.upcomingPayments,
      change: t('dashboardMetrics.paymentCount', { count: metrics.upcomingPaymentsCount }),
      changeDir: 'neutral' as const,
      changeLabel: isMonthMode ? t('dashboardMetrics.scheduledIn', { period: activePeriod.label }) : t('dashboardMetrics.dueIn', { period: activePeriod.label }),
      icon: CalendarClock,
      iconBg: 'bg-secondary',
      iconColor: 'text-muted-foreground',
      hero: false,
    },
  ];

  const loanCards: DashboardMetricCard[] = [
    {
      id: 'metric-loan-outstanding',
      label: t('dashboardMetrics.cards.outstandingLoans'),
      valueMetric: metrics.outstandingLoanBalance,
      changeMetric: metrics.loanBorrowedThisMonth,
      changeDir: 'neutral' as const,
      changeLabel: t('dashboardMetrics.borrowedIn', { period: activePeriod.label }),
      icon: TrendingDown,
      iconBg: 'bg-rose-50',
      iconColor: 'text-rose-500',
      hero: false,
    },
    {
      id: 'metric-loan-repaid',
      label: t('dashboardMetrics.cards.loanRepayments'),
      valueMetric: metrics.loanRepaidThisMonth,
      changeMetric: metrics.loanRepaidThisMonth,
      changeDir: 'neutral' as const,
      changeLabel: t('dashboardMetrics.paidIn', { period: activePeriod.label }),
      icon: ArrowUpDown,
      iconBg: 'bg-cyan-50',
      iconColor: 'text-cyan-500',
      hero: false,
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
    const isHero = metric.hero;
    const valueClassName = isHero
      ? 'inline-flex items-baseline text-[1.48rem] font-800 tracking-[-0.03em] max-[480px]:text-[1.22rem] md:text-[1.42rem]'
      : 'inline-flex items-baseline text-[1.18rem] font-800 tracking-[-0.025em] max-[480px]:text-[1.02rem] md:text-[1.14rem]';
    const helperChangeLabel = metric.id === 'metric-netflow'
      ? t('dashboardMetrics.netOfIncomeAndExpenses')
      : metric.id === 'metric-upcoming'
        ? t('dashboardMetrics.scheduledThisPeriod')
        : metric.changeLabel;

    return (
      <div
        key={metric.id}
        className={`metric-card flex h-full min-h-[110px] flex-col rounded-[24px] border border-border/80 px-4 py-3 shadow-card-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-md max-[480px]:min-h-[104px] max-[480px]:rounded-[20px] max-[480px]:px-3 max-[480px]:py-2.5 ${
          metric.alert ? 'border-negative/25 bg-negative-soft/20' : 'bg-card'
        } ${metric.warningState ? 'border-warning/30' : ''} ${
          metric.id === 'metric-balance' ? 'border-blue-100 bg-blue-50/40' : ''
        }`}
      >
        <div className="mb-1.5 flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <p className="text-[13px] font-700 leading-[1.25rem] text-foreground max-[480px]:text-[12px] max-[480px]:leading-[1.1rem]">{metric.label}</p>
            <div className="mt-0.5 font-tabular leading-tight text-foreground">
              {metric.valueContent ?? renderMetricValue(metric.valueMetric, isHero ? 'lg' : 'sm', valueClassName, 'font-800')}
            </div>
          </div>
          <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl max-[480px]:h-8.5 max-[480px]:w-8.5 max-[480px]:rounded-xl ${metric.iconBg}`}>
            <Icon size={18} className={`${metric.iconColor} max-[480px]:h-4 max-[480px]:w-4`} />
          </div>
        </div>
        <div className="mt-auto space-y-1">
          <div className="flex items-start gap-1.5">
            {metric.changeDir === 'up' && <ArrowUp size={13} className="text-positive flex-shrink-0" />}
            {metric.changeDir === 'down' && <ArrowDown size={13} className="text-negative flex-shrink-0" />}
            <div className="min-w-0">
              <div className={`text-sm font-700 font-tabular leading-none max-[480px]:text-[12px] ${
                metric.changeDir === 'up' ? 'text-positive' :
                metric.changeDir === 'down' ? 'text-negative' : 'text-muted-foreground'
              }`}>
                {metric.changeMetric ? renderMetricValue(metric.changeMetric, 'xs') : metric.change}
              </div>
              <p className="mt-1 text-[12.5px] leading-4 text-muted-foreground max-[480px]:text-[11.5px] max-[480px]:leading-[1rem] max-[480px]:line-clamp-none sm:line-clamp-2">
                {helperChangeLabel}
              </p>
            </div>
          </div>
          {metric.subtext ? (
            <p className="text-[12.5px] leading-4 text-muted-foreground max-[480px]:text-[11.5px] max-[480px]:leading-[1rem]">{metric.subtext}</p>
          ) : null}
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
      <div className="grid grid-cols-2 gap-3 max-[340px]:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {metricCards.map((metric) => renderMetricCard(metric))}
      </div>
    </div>
  );
}
