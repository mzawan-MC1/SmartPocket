'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, ArrowUpDown, Target, CalendarClock, ArrowUp, ArrowDown,
} from 'lucide-react';
import { getDashboardMetrics, getDashboardMonthContext, type DashboardConvertedMetric, type DashboardMetrics } from '@/lib/finance';
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
}

export default function DashboardMetrics({
  selectedMonth,
}: {
  selectedMonth: string;
}) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const monthContext = getDashboardMonthContext(selectedMonth);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextMetrics = await getDashboardMetrics({ selectedMonth: monthContext.monthKey });
      setMetrics(nextMetrics);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [monthContext.monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['dashboard', 'transactions', 'financial_accounts'], 'DashboardMetrics', async () => {
    await load();
  });

  if (loading) {
    const skeletonCards = [
      'xl:col-span-6 sm:col-span-2',
      'xl:col-span-3',
      'xl:col-span-3',
      'xl:col-span-4',
      'xl:col-span-4',
      'xl:col-span-4',
      'xl:col-span-4',
      'xl:col-span-4',
      'xl:col-span-4',
    ];

    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
        {skeletonCards.map((spanClass, i) => (
          <div key={`skel-${i}`} className={`metric-card h-full min-h-[220px] animate-pulse ${spanClass}`}>
            <div className="h-3 bg-muted rounded w-24 mb-3" />
            <div className="h-8 bg-muted rounded w-32 mb-2" />
            <div className="h-3 bg-muted rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

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
      changeLabel: 'net this month',
      icon: Wallet,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      hero: true,
    },
    {
      id: 'metric-income',
      label: 'Monthly Income',
      valueMetric: metrics.monthlyIncome,
      changeMetric: metrics.monthlyIncome,
      changeDir: 'up' as const,
      changeLabel: monthContext.label,
      icon: TrendingUp,
      iconBg: 'bg-positive-soft',
      iconColor: 'text-positive',
      hero: false,
    },
    {
      id: 'metric-expenses',
      label: 'Monthly Expenses',
      valueMetric: metrics.monthlyExpenses,
      changeMetric: metrics.monthlyExpenses,
      changeDir: 'down' as const,
      changeLabel: monthContext.label,
      icon: TrendingDown,
      iconBg: 'bg-negative-soft',
      iconColor: 'text-negative',
      hero: false,
      alert: hasExpenseAlert,
    },
    {
      id: 'metric-netflow',
      label: 'Net Cash Flow',
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
      change: metrics.activeBudgetCount === 0
        ? 'No active budget'
        : budgetRemaining.length === 1
          ? `${budgetRemaining[0].usedPct.toFixed(1)}% used`
          : 'Grouped by currency',
      changeDir: 'neutral' as const,
      changeLabel: metrics.activeBudgetCount === 0
        ? 'for this month'
        : budgetRemaining.length === 1
          ? 'of current budget'
          : 'budget usage differs by currency',
      icon: Target,
      iconBg: 'bg-warning-soft',
      iconColor: 'text-warning',
      hero: false,
      warningState: metrics.activeBudgetCount > 0 && budgetRemaining.some((row) => row.usedPct >= 70),
      budgetPct: metrics.activeBudgetCount > 0 && budgetRemaining.length === 1 ? budgetRemaining[0].usedPct : undefined,
    },
    {
      id: 'metric-upcoming',
      label: 'Upcoming Payments',
      valueMetric: metrics.upcomingPayments,
      change: `${metrics.upcomingPaymentsCount} payment${metrics.upcomingPaymentsCount !== 1 ? 's' : ''}`,
      changeDir: 'neutral' as const,
      changeLabel: `scheduled in ${monthContext.label}`,
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
      changeLabel: `borrowed in ${monthContext.label}`,
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
      changeLabel: `paid in ${monthContext.label}`,
      icon: ArrowUpDown,
      iconBg: 'bg-accent/10',
      iconColor: 'text-accent',
      hero: false,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-700 text-foreground">Summary</p>
          <p className="text-xs text-muted-foreground">Personal balances stay current. Monthly cards and loan flow follow {monthContext.label}.</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
        {[...personalCards, ...managedCards, ...loanCards].map((metric) => {
          const Icon = metric.icon;
          const isHero = metric.hero;
          const desktopSpan = metric.id === 'metric-balance'
            ? 'xl:col-span-6'
            : metric.id === 'metric-income' || metric.id === 'metric-expenses'
              ? 'xl:col-span-3'
              : 'xl:col-span-4';

          return (
            <div
              key={metric.id}
              className={`metric-card flex h-full min-h-[220px] flex-col transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg ${desktopSpan} ${
                isHero ? 'sm:col-span-2' : 'col-span-1'
              } ${metric.alert ? 'border-negative/30 bg-negative-soft/30' : ''} ${
                metric.warningState ? 'border-warning/30' : ''
              }`}
            >
              {isHero && (
                <div className="absolute top-0 right-0 w-32 h-32 opacity-5">
                  <div className="w-full h-full rounded-full bg-primary translate-x-8 -translate-y-8" />
                </div>
              )}
              <div className="flex items-start justify-between mb-3 relative">
                <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                <div className={`w-10 h-10 rounded-2xl ${metric.iconBg} flex items-center justify-center flex-shrink-0 ring-1 ring-black/5`}>
                  <Icon size={17} className={metric.iconColor} />
                </div>
              </div>
              <div className={`font-tabular font-800 text-foreground ${isHero ? 'text-3xl md:text-[2rem]' : 'text-2xl'} mb-1.5`}>
                {renderMetricValue(metric.valueMetric, isHero ? 'xl' : 'lg')}
              </div>
              <div className="flex items-center gap-1.5">
                {metric.changeDir === 'up' && <ArrowUp size={12} className="text-positive flex-shrink-0" />}
                {metric.changeDir === 'down' && <ArrowDown size={12} className="text-negative flex-shrink-0" />}
                <div className={`text-xs font-600 font-tabular ${
                  metric.changeDir === 'up' ? 'text-positive' :
                  metric.changeDir === 'down' ? 'text-negative' : 'text-muted-foreground'
                }`}>
                  {metric.changeMetric ? renderMetricValue(metric.changeMetric, 'xs') : metric.change}
                </div>
                <span className="text-xs text-muted-foreground">{metric.changeLabel}</span>
              </div>
              <div className="mt-auto pt-3">
                {renderMetricDetails(metric.valueMetric)}
              </div>
              {metric.warningState && metric.budgetPct !== undefined && (
                <div className="mt-3">
                  <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${metric.budgetPct >= 90 ? 'budget-bar-red' : 'budget-bar-amber'}`}
                      style={{ width: `${Math.min(metric.budgetPct, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
