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
    const topSkeletonCards = Array.from({ length: 4 });
    const bottomSkeletonCards = Array.from({ length: 5 });

    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 max-[480px]:grid-cols-2 max-[480px]:gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {topSkeletonCards.map((_, i) => (
            <div key={`skel-top-${i}`} className="metric-card h-full min-h-[176px] animate-pulse px-4 py-3 max-[480px]:min-h-[142px] max-[480px]:px-3 max-[480px]:py-2.5">
              <div className="mb-2.5 h-3.5 w-28 rounded bg-muted max-[480px]:mb-2 max-[480px]:h-3 max-[480px]:w-20" />
              <div className="mb-2 h-8 w-32 rounded bg-muted max-[480px]:mb-1.5 max-[480px]:h-6 max-[480px]:w-24" />
              <div className="h-3 w-20 rounded bg-muted max-[480px]:h-2.5 max-[480px]:w-16" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 max-[480px]:grid-cols-2 max-[480px]:gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {bottomSkeletonCards.map((_, i) => (
            <div key={`skel-bottom-${i}`} className="metric-card h-full min-h-[176px] animate-pulse px-4 py-3 max-[480px]:min-h-[142px] max-[480px]:px-3 max-[480px]:py-2.5">
              <div className="mb-2.5 h-3.5 w-28 rounded bg-muted max-[480px]:mb-2 max-[480px]:h-3 max-[480px]:w-20" />
              <div className="mb-2 h-8 w-32 rounded bg-muted max-[480px]:mb-1.5 max-[480px]:h-6 max-[480px]:w-24" />
              <div className="h-3 w-20 rounded bg-muted max-[480px]:h-2.5 max-[480px]:w-16" />
            </div>
          ))}
        </div>
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
      subtext: t('dashboardMetrics.acrossActiveAccounts'),
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

  const managedCards: DashboardMetricCard[] = [
    {
      id: 'metric-managed-total',
      label: t('dashboardMetrics.cards.managedMoney'),
      valueMetric: metrics.managedMoney,
      change: `${metrics.managedPeopleCount}`,
      changeDir: 'neutral' as const,
      changeLabel: t('dashboardMetrics.peopleWithManagedMoney', { count: metrics.managedPeopleCount }),
      icon: Wallet,
      iconBg: 'bg-info-soft',
      iconColor: 'text-info',
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
      iconBg: 'bg-negative-soft',
      iconColor: 'text-negative',
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
    const valueClassName = isHero
      ? 'inline-flex items-baseline text-[1.56rem] font-800 tracking-[-0.03em] md:text-[1.42rem] lg:text-[1.52rem] xl:text-[1.68rem]'
      : 'inline-flex items-baseline text-[1.2rem] font-800 tracking-[-0.025em] md:text-[1.08rem] lg:text-[1.14rem] xl:text-[1.24rem]';
    const helperChangeLabel = metric.id === 'metric-netflow'
      ? t('dashboardMetrics.netOfIncomeAndExpenses')
      : metric.id === 'metric-upcoming'
        ? t('dashboardMetrics.scheduledThisPeriod')
        : metric.changeLabel;

    return (
      <div
        key={metric.id}
        className={`metric-card flex h-full min-h-[156px] flex-col px-3.5 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg md:min-h-[148px] lg:min-h-[154px] xl:min-h-[160px] max-[480px]:min-h-[148px] max-[480px]:px-3 max-[480px]:py-2.5 ${
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
        <div className="relative mb-1.5 flex items-start justify-between gap-2.5 md:mb-1.5 lg:mb-2 max-[480px]:mb-2 max-[480px]:gap-2">
          <p className="pr-2 text-[11px] font-800 uppercase tracking-[0.12em] text-foreground/88 md:leading-4 lg:text-[11.5px] max-[480px]:pr-1 max-[480px]:text-[10px] max-[480px]:leading-4 max-[480px]:tracking-[0.1em]">{metric.label}</p>
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${metric.iconBg} ring-1 ring-black/5 md:h-8 md:w-8 lg:h-9 lg:w-9 xl:h-9.5 xl:w-9.5 max-[480px]:h-8.5 max-[480px]:w-8.5 max-[480px]:rounded-xl`}>
            <Icon size={17} className={`${metric.iconColor} md:h-[15px] md:w-[15px] lg:h-4 lg:w-4 max-[480px]:h-4 max-[480px]:w-4`} />
          </div>
        </div>
        <div className="mb-0.5 font-tabular leading-tight text-foreground max-[480px]:mb-0.5">
          {metric.valueContent ?? renderMetricValue(metric.valueMetric, isHero ? 'lg' : 'sm', valueClassName, 'font-800')}
        </div>
        {metric.subtext ? (
          <p className="mb-1 text-[12px] leading-[1.3] text-muted-foreground md:hidden max-[480px]:mb-1 max-[480px]:text-[11px] max-[480px]:leading-4">{metric.subtext}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 md:gap-y-0 max-[480px]:gap-x-1 max-[480px]:gap-y-0.5">
          {metric.changeDir === 'up' && <ArrowUp size={13} className="text-positive flex-shrink-0 max-[480px]:h-3 max-[480px]:w-3" />}
          {metric.changeDir === 'down' && <ArrowDown size={13} className="text-negative flex-shrink-0 max-[480px]:h-3 max-[480px]:w-3" />}
          <div className={`text-sm font-700 font-tabular leading-none ${
            metric.changeDir === 'up' ? 'text-positive' :
            metric.changeDir === 'down' ? 'text-negative' : 'text-muted-foreground'
          } md:text-[12px] max-[480px]:text-[11px]`}>
            {metric.changeMetric ? renderMetricValue(metric.changeMetric, 'xs') : metric.change}
          </div>
          <span className="text-[12px] leading-[1.25] text-muted-foreground md:text-[11px] max-[480px]:text-[11px] max-[480px]:leading-4">
            <span className="hidden md:inline">{helperChangeLabel}</span>
            <span className="md:hidden max-[480px]:hidden">{metric.changeLabel}</span>
          </span>
        </div>
        <div className="mt-auto pt-1.5 max-[480px]:pt-1.5">
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
      <div className="space-y-2.5 md:space-y-2 lg:space-y-2.5">
      <div className="flex items-center justify-between gap-2.5 md:gap-2">
        <div>
          <p className="text-base font-800 text-foreground md:text-[15px]">{t('dashboardMetrics.summary')}</p>
          <p className="text-sm text-muted-foreground md:text-[13px] max-[480px]:hidden">
            {t('dashboardMetrics.summaryDescription', { period: activePeriod.label })}
          </p>
          {hasConfigurationWarning ? (
            <p className="mt-0.5 text-sm text-warning md:text-[13px] max-[480px]:text-xs">{t('dashboardMetrics.monthFallbackWarning')}</p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:gap-2.5 lg:gap-3 max-[480px]:grid-cols-2 max-[480px]:gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {topRowCards.map((metric) => renderMetricCard(metric))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:gap-2.5 lg:gap-3 max-[480px]:grid-cols-2 max-[480px]:gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {bottomRowCards.map((metric) => renderMetricCard(metric))}
      </div>
    </div>
  );
}
