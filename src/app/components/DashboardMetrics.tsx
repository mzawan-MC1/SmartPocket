'use client';
import React, { useCallback, useEffect, useState } from 'react';
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
    const topSkeletonCards = Array.from({ length: 4 });
    const bottomSkeletonCards = Array.from({ length: 5 });

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {topSkeletonCards.map((_, i) => (
            <div key={`skel-top-${i}`} className="metric-card h-full min-h-[176px] animate-pulse px-4 py-3">
              <div className="mb-2.5 h-3.5 w-28 rounded bg-muted" />
              <div className="mb-2 h-8 w-32 rounded bg-muted" />
              <div className="h-3 rounded bg-muted w-20" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {bottomSkeletonCards.map((_, i) => (
            <div key={`skel-bottom-${i}`} className="metric-card h-full min-h-[176px] animate-pulse px-4 py-3">
              <div className="mb-2.5 h-3.5 w-28 rounded bg-muted" />
              <div className="mb-2 h-8 w-32 rounded bg-muted" />
              <div className="h-3 rounded bg-muted w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const isMonthMode = activePeriod.mode === 'month';
  const flowLabel = isMonthMode ? 'Monthly' : 'Period';

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
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md'
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
          />
        ))}
      </div>
    );
  };

  const renderMetricValue = (
    metric: DashboardConvertedMetric,
    size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md'
  ) => {
    if (metric.reportingAmount === null) {
      return renderOriginalCurrencyRows(metric.originalTotals, size);
    }

    return (
      <FormattedCurrencyAmount
        amount={metric.reportingAmount}
        currencyCode={metric.reportingCurrency}
        size={size}
        showCode
      />
    );
  };

  const renderMetricMeta = (metric: DashboardConvertedMetric) => {
    if (metric.reportingAmount === null) {
      return 'Original currencies only';
    }
    if (metric.allOriginalInReportingCurrency) {
      return null;
    }
    return `Reporting total${metric.stale ? ' • stale rate' : ''}`;
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
      <details className="mt-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
        <summary className="cursor-pointer text-xs font-600 text-muted-foreground">
          View original currencies
        </summary>
        <div className="mt-2 space-y-2 text-xs text-muted-foreground">
          <div>{renderOriginalCurrencyRows(metric.originalTotals, 'xs')}</div>
          {metaLabel ? <p>{metaLabel}</p> : null}
          {metric.rateDate ? <p>Rate date: {metric.rateDate}</p> : null}
          {metric.providerTimestamp ? <p>Provider timestamp: {metric.providerTimestamp}</p> : null}
          {metric.fetchedAt ? <p>Fetched at: {metric.fetchedAt}</p> : null}
          {metric.provider ? <p>Provider: {metric.provider}</p> : null}
          {metric.unavailableReason ? <p className="text-warning">{metric.unavailableReason}</p> : null}
          {metric.stale && metric.provider ? <p className="text-warning">Rates are older than the fresh window.</p> : null}
        </div>
      </details>
    );
  };

  const personalCards: DashboardMetricCard[] = [
    {
      id: 'metric-balance',
      label: 'Personal Balance',
      valueMetric: metrics.totalBalance,
      changeMetric: metrics.netCashFlow,
      changeDir: metrics.netCashFlow.originalTotals.every((row) => row.amount >= 0) ? 'up' as const : 'down' as const,
      changeLabel: isMonthMode ? 'net change this month' : 'net change this pay period',
      icon: Wallet,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      hero: true,
      subtext: 'Across your active accounts',
    },
    {
      id: 'metric-income',
      label: `${flowLabel} Income`,
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
      label: `${flowLabel} Expenses`,
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
      label: isMonthMode ? 'Net Cash Flow' : 'Period Cash Flow',
      valueMetric: metrics.netCashFlow,
      change: metrics.netCashFlow.originalTotals.length > 1 ? 'Mixed currencies' : metrics.netCashFlow.originalTotals[0]?.amount >= 0 ? 'Positive' : 'Negative',
      changeDir: metrics.netCashFlow.originalTotals.every((row) => row.amount >= 0) ? 'up' as const : 'down' as const,
      changeLabel: 'income minus expenses',
      icon: ArrowUpDown,
      iconBg: 'bg-info-soft',
      iconColor: 'text-info',
      hero: false,
    },
    {
      id: 'metric-budget',
      label: 'Budget Remaining',
      valueMetric: budgetRemainingMetric,
      valueContent: metrics.budgetConversionUnavailableCount > 0 ? (
        <span className="text-base font-700 text-warning">Unavailable</span>
      ) : undefined,
      change: !hasApplicableBudgets
        ? 'No budgets for this period'
        : metrics.budgetConversionUnavailableCount > 0
          ? 'Conversion unavailable'
          : !hasBudgetSpending
            ? 'No spending in this period'
          : `Across ${metrics.activeBudgetCount} active budget${metrics.activeBudgetCount === 1 ? '' : 's'}`,
      changeDir: 'neutral' as const,
      changeLabel: !hasApplicableBudgets
        ? isMonthMode ? `for ${activePeriod.label}` : `during ${activePeriod.label}`
        : metrics.budgetConversionUnavailableCount > 0
          ? `${metrics.budgetConversionUnavailableCount} active budget${metrics.budgetConversionUnavailableCount === 1 ? '' : 's'} need historical FX data`
          : !hasBudgetSpending
            ? metrics.hasMixedBudgetCycles
              ? `Across active ${metrics.activeBudgetCycleLabels.join(' and ').toLowerCase()} budgets`
              : `Across active ${metrics.activeBudgetCycleLabels[0]?.toLowerCase() || 'budget'} budgets`
          : metrics.hasMixedBudgetCycles
            ? `Across active ${metrics.activeBudgetCycleLabels.join(' and ').toLowerCase()} budgets`
            : `Across active ${metrics.activeBudgetCycleLabels[0]?.toLowerCase() || 'budget'} budgets`,
      icon: Target,
      iconBg: 'bg-warning-soft',
      iconColor: 'text-warning',
      hero: false,
      warningState: metrics.activeBudgetCount > 0 && metrics.budgetConversionUnavailableCount === 0 && budgetRemaining.some((row) => row.usedPct >= 70),
      budgetPct: metrics.activeBudgetCount > 0 && metrics.budgetConversionUnavailableCount === 0 && budgetRemaining.length === 1 ? budgetRemaining[0].usedPct : undefined,
    },
    {
      id: 'metric-upcoming',
      label: 'Upcoming Payments',
      valueMetric: metrics.upcomingPayments,
      change: `${metrics.upcomingPaymentsCount} payment${metrics.upcomingPaymentsCount !== 1 ? 's' : ''}`,
      changeDir: 'neutral' as const,
      changeLabel: isMonthMode ? `scheduled in ${activePeriod.label}` : `due in ${activePeriod.label}`,
      icon: CalendarClock,
      iconBg: 'bg-secondary',
      iconColor: 'text-muted-foreground',
      hero: false,
    },
  ];

  const managedCards: DashboardMetricCard[] = [
    {
      id: 'metric-managed-total',
      label: 'Money I Manage for Others',
      valueMetric: metrics.managedMoney,
      change: `${metrics.managedPeopleCount}`,
      changeDir: 'neutral' as const,
      changeLabel: metrics.managedPeopleCount === 1 ? 'person with managed money' : 'people with managed money',
      icon: Wallet,
      iconBg: 'bg-info-soft',
      iconColor: 'text-info',
      hero: false,
    },
  ];

  const loanCards: DashboardMetricCard[] = [
    {
      id: 'metric-loan-outstanding',
      label: 'Outstanding Loans',
      valueMetric: metrics.outstandingLoanBalance,
      changeMetric: metrics.loanBorrowedThisMonth,
      changeDir: 'neutral' as const,
      changeLabel: `borrowed in ${activePeriod.label}`,
      icon: TrendingDown,
      iconBg: 'bg-negative-soft',
      iconColor: 'text-negative',
      hero: false,
    },
    {
      id: 'metric-loan-repaid',
      label: 'Loan Repayments',
      valueMetric: metrics.loanRepaidThisMonth,
      changeMetric: metrics.loanRepaidThisMonth,
      changeDir: 'neutral' as const,
      changeLabel: `paid in ${activePeriod.label}`,
      icon: ArrowUpDown,
      iconBg: 'bg-accent/10',
      iconColor: 'text-accent',
      hero: false,
    },
  ];

  const topRowCards = [personalCards[0], personalCards[1], personalCards[2], personalCards[3]];
  const bottomRowCards = [personalCards[4], personalCards[5], managedCards[0], loanCards[0], loanCards[1]];

  const renderMetricCard = (metric: DashboardMetricCard) => {
    const Icon = metric.icon;
    const isHero = metric.hero;

    return (
      <div
        key={metric.id}
        className={`metric-card flex h-full min-h-[176px] flex-col px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg ${
          metric.alert ? 'border-negative/30 bg-negative-soft/30' : ''
        } ${metric.warningState ? 'border-warning/30' : ''} ${
          metric.id === 'metric-balance' ? 'border-primary/20 bg-primary/[0.03]' : ''
        }`}
      >
        {isHero && (
          <div className="absolute top-0 right-0 h-32 w-32 opacity-5">
            <div className="h-full w-full translate-x-8 -translate-y-8 rounded-full bg-primary" />
          </div>
        )}
        <div className="relative mb-2.5 flex items-start justify-between gap-3">
          <p className="pr-3 text-xs font-800 uppercase tracking-[0.15em] text-foreground/88">{metric.label}</p>
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl ${metric.iconBg} ring-1 ring-black/5`}>
            <Icon size={19} className={metric.iconColor} />
          </div>
        </div>
        <div className={`mb-1 font-tabular font-800 leading-tight text-foreground ${isHero ? 'text-[1.95rem] md:text-[2.15rem]' : 'text-[1.68rem]'}`}>
          {metric.valueContent ?? renderMetricValue(metric.valueMetric, isHero ? 'xl' : 'lg')}
        </div>
        {metric.subtext ? (
          <p className="mb-1.5 text-[13px] leading-snug text-muted-foreground">{metric.subtext}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {metric.changeDir === 'up' && <ArrowUp size={13} className="text-positive flex-shrink-0" />}
          {metric.changeDir === 'down' && <ArrowDown size={13} className="text-negative flex-shrink-0" />}
          <div className={`text-sm font-700 font-tabular leading-none ${
            metric.changeDir === 'up' ? 'text-positive' :
            metric.changeDir === 'down' ? 'text-negative' : 'text-muted-foreground'
          }`}>
            {metric.changeMetric ? renderMetricValue(metric.changeMetric, 'xs') : metric.change}
          </div>
          <span className="text-[13px] leading-snug text-muted-foreground">{metric.changeLabel}</span>
        </div>
        <div className="mt-auto pt-2">
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-800 text-foreground">Summary</p>
          <p className="text-sm text-muted-foreground">
            Personal balances stay current. {isMonthMode ? 'Monthly' : 'Pay-period'} cards and loan flow follow {activePeriod.label}.
          </p>
          {hasConfigurationWarning ? (
            <p className="mt-1 text-sm text-warning">Pay-period calculations are temporarily using a monthly fallback from Settings.</p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {topRowCards.map((metric) => renderMetricCard(metric))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {bottomRowCards.map((metric) => renderMetricCard(metric))}
      </div>
    </div>
  );
}
