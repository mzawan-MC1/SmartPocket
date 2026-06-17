'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, ArrowUpDown, Target, CalendarClock, ArrowUp, ArrowDown,
} from 'lucide-react';
import { getDashboardMetrics, type DashboardMetrics } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import Icon from '@/components/ui/AppIcon';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

export default function DashboardMetrics() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const nextMetrics = await getDashboardMetrics();
      setMetrics(nextMetrics);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['dashboard', 'transactions', 'financial_accounts'], 'DashboardMetrics', async () => {
    await load();
  });

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={`skel-${i}`} className={`metric-card animate-pulse ${i === 0 ? 'sm:col-span-2' : ''}`}>
            <div className="h-3 bg-muted rounded w-24 mb-3" />
            <div className="h-8 bg-muted rounded w-32 mb-2" />
            <div className="h-3 bg-muted rounded w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (!metrics) return null;

  const budgetTotals = new Map(metrics.totalBudgetByCurrency.map((row) => [row.currency, row.amount]));
  const budgetSpent = new Map(metrics.budgetSpentByCurrency.map((row) => [row.currency, row.amount]));
  const budgetRemaining = Array.from(
    new Set([...budgetTotals.keys(), ...budgetSpent.keys()])
  )
    .map((currency) => ({
      currency,
      amount: (budgetTotals.get(currency) || 0) - (budgetSpent.get(currency) || 0),
      usedPct: (budgetTotals.get(currency) || 0) > 0
        ? ((budgetSpent.get(currency) || 0) / (budgetTotals.get(currency) || 0)) * 100
        : 0,
    }))
    .sort((left, right) => left.currency.localeCompare(right.currency, 'en', { sensitivity: 'base' }));

  const hasSingleCashFlowCurrency =
    metrics.monthlyIncomeByCurrency.length === 1 &&
    metrics.monthlyExpensesByCurrency.length <= 1 &&
    metrics.netCashFlowByCurrency.length === 1 &&
    (metrics.monthlyExpensesByCurrency.length === 0 ||
      metrics.monthlyIncomeByCurrency[0].currency === metrics.monthlyExpensesByCurrency[0].currency) &&
    metrics.monthlyIncomeByCurrency[0].currency === metrics.netCashFlowByCurrency[0].currency;

  const hasExpenseAlert = hasSingleCashFlowCurrency
    ? (metrics.monthlyExpensesByCurrency[0]?.amount || 0) > (metrics.monthlyIncomeByCurrency[0]?.amount || 0)
    : false;

  const renderCurrencyRows = (rows: Array<{ currency: string; amount: number }>, signed = false) => {
    if (rows.length === 0) {
      return <span className="text-muted-foreground">No data</span>;
    }
    return (
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <FormattedCurrencyAmount
            key={`${row.currency}-${row.amount}`}
            amount={signed ? row.amount : Math.abs(row.amount)}
            currencyCode={row.currency}
            showCode
          />
        ))}
      </div>
    );
  };

  const personalCards = [
    {
      id: 'metric-balance',
      label: 'Personal Balance',
      valueRows: metrics.totalBalanceByCurrency,
      changeRows: metrics.netCashFlowByCurrency,
      changeDir: metrics.netCashFlowByCurrency.every((row) => row.amount >= 0) ? 'up' as const : 'down' as const,
      changeLabel: 'net this month by currency',
      icon: Wallet,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      hero: true,
    },
    {
      id: 'metric-income',
      label: 'Monthly Income',
      valueRows: metrics.monthlyIncomeByCurrency,
      changeRows: metrics.monthlyIncomeByCurrency,
      changeDir: 'up' as const,
      changeLabel: 'this month by currency',
      icon: TrendingUp,
      iconBg: 'bg-positive-soft',
      iconColor: 'text-positive',
      hero: false,
    },
    {
      id: 'metric-expenses',
      label: 'Monthly Expenses',
      valueRows: metrics.monthlyExpensesByCurrency,
      changeRows: metrics.monthlyExpensesByCurrency,
      changeDir: 'down' as const,
      changeLabel: 'this month by currency',
      icon: TrendingDown,
      iconBg: 'bg-negative-soft',
      iconColor: 'text-negative',
      hero: false,
      alert: hasExpenseAlert,
    },
    {
      id: 'metric-netflow',
      label: 'Net Cash Flow',
      valueRows: metrics.netCashFlowByCurrency,
      change: metrics.netCashFlowByCurrency.length > 1 ? 'Mixed currencies' : metrics.netCashFlowByCurrency[0]?.amount >= 0 ? 'Positive' : 'Negative',
      changeDir: metrics.netCashFlowByCurrency.every((row) => row.amount >= 0) ? 'up' as const : 'down' as const,
      changeLabel: 'income minus expenses by currency',
      icon: ArrowUpDown,
      iconBg: 'bg-info-soft',
      iconColor: 'text-info',
      hero: false,
    },
    {
      id: 'metric-budget',
      label: 'Budget Remaining',
      valueRows: budgetRemaining.map((row) => ({ currency: row.currency, amount: row.amount })),
      change: budgetRemaining.length === 1 ? `${budgetRemaining[0].usedPct.toFixed(1)}% used` : 'Grouped by currency',
      changeDir: 'neutral' as const,
      changeLabel: budgetRemaining.length === 1 ? 'of current budget' : 'budget usage differs by currency',
      icon: Target,
      iconBg: 'bg-warning-soft',
      iconColor: 'text-warning',
      hero: false,
      warningState: budgetRemaining.some((row) => row.usedPct >= 70),
      budgetPct: budgetRemaining.length === 1 ? budgetRemaining[0].usedPct : undefined,
    },
    {
      id: 'metric-upcoming',
      label: 'Upcoming Payments',
      valueRows: metrics.upcomingPaymentsByCurrency,
      change: `${metrics.upcomingPaymentsCount} payment${metrics.upcomingPaymentsCount !== 1 ? 's' : ''}`,
      changeDir: 'neutral' as const,
      changeLabel: 'due in 7 days',
      icon: CalendarClock,
      iconBg: 'bg-secondary',
      iconColor: 'text-muted-foreground',
      hero: false,
    },
  ];

  const managedCards = [
    {
      id: 'metric-managed-total',
      label: 'Money Managed',
      valueRows: metrics.managedMoneyByCurrency,
      change: `${metrics.managedPeopleCount}`,
      changeDir: 'neutral' as const,
      changeLabel: metrics.managedPeopleCount === 1 ? 'person with managed money' : 'people with managed money',
      icon: Wallet,
      iconBg: 'bg-info-soft',
      iconColor: 'text-info',
      hero: false,
    },
  ];

  const loanCards = [
    {
      id: 'metric-loan-outstanding',
      label: 'Outstanding Loans',
      valueRows: metrics.outstandingLoanBalanceByCurrency,
      changeRows: metrics.loanBorrowedThisMonthByCurrency,
      changeDir: 'neutral' as const,
      changeLabel: 'borrowed this month by currency',
      icon: TrendingDown,
      iconBg: 'bg-negative-soft',
      iconColor: 'text-negative',
      hero: false,
    },
    {
      id: 'metric-loan-repaid',
      label: 'Loan Repayments',
      valueRows: metrics.loanRepaidThisMonthByCurrency,
      changeRows: metrics.loanRepaidThisMonthByCurrency,
      changeDir: 'neutral' as const,
      changeLabel: 'paid this month by currency',
      icon: ArrowUpDown,
      iconBg: 'bg-accent/10',
      iconColor: 'text-accent',
      hero: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-700 text-foreground">My Finances</p>
          <p className="text-xs text-muted-foreground">Personal balances, income, expenses, and budget progress.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {personalCards.map((metric) => {
            const Icon = metric.icon;
            const isHero = metric.hero;
            return (
              <div
                key={metric.id}
                className={`metric-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg ${
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
                  {renderCurrencyRows(metric.valueRows, metric.id === 'metric-netflow')}
                </div>
                <div className="flex items-center gap-1.5">
                  {metric.changeDir === 'up' && <ArrowUp size={12} className="text-positive flex-shrink-0" />}
                  {metric.changeDir === 'down' && <ArrowDown size={12} className="text-negative flex-shrink-0" />}
                  <div className={`text-xs font-600 font-tabular ${
                    metric.changeDir === 'up' ? 'text-positive' :
                    metric.changeDir === 'down' ? 'text-negative' : 'text-muted-foreground'
                  }`}>
                    {metric.changeRows ? renderCurrencyRows(metric.changeRows, metric.id === 'metric-balance') : metric.change}
                  </div>
                  <span className="text-xs text-muted-foreground">{metric.changeLabel}</span>
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

      <div className="space-y-3">
        <div>
          <p className="text-sm font-700 text-foreground">Money I Manage for Others</p>
          <p className="text-xs text-muted-foreground">Kept separate from personal income, expenses, and net worth.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {managedCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.id} className="metric-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                  <div className={`w-10 h-10 rounded-2xl ${metric.iconBg} flex items-center justify-center flex-shrink-0 ring-1 ring-black/5`}>
                    <Icon size={17} className={metric.iconColor} />
                  </div>
                </div>
                <div className="mb-1.5 text-2xl font-800 font-tabular text-foreground">{renderCurrencyRows(metric.valueRows)}</div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-600 font-tabular text-muted-foreground">{metric.change}</span>
                  <span className="text-xs text-muted-foreground">{metric.changeLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-sm font-700 text-foreground">Loans</p>
          <p className="text-xs text-muted-foreground">Borrowed money stays out of personal income and ordinary expenses.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {loanCards.map((metric) => {
            const Icon = metric.icon;
            return (
              <div key={metric.id} className="metric-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-lg">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">{metric.label}</p>
                  <div className={`w-10 h-10 rounded-2xl ${metric.iconBg} flex items-center justify-center flex-shrink-0 ring-1 ring-black/5`}>
                    <Icon size={17} className={metric.iconColor} />
                  </div>
                </div>
                <div className="mb-1.5 text-2xl font-800 font-tabular text-foreground">{renderCurrencyRows(metric.valueRows)}</div>
                <div className="flex items-center gap-1.5">
                  <div className="text-xs font-600 font-tabular text-muted-foreground">
                    {metric.changeRows ? renderCurrencyRows(metric.changeRows) : metric.change}
                  </div>
                  <span className="text-xs text-muted-foreground">{metric.changeLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
