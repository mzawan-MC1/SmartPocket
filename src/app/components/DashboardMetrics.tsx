'use client';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Wallet, TrendingUp, TrendingDown, ArrowUpDown, Target, CalendarClock, ArrowUp, ArrowDown,
} from 'lucide-react';
import { getDashboardMetrics, type DashboardMetrics } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import Icon from '@/components/ui/AppIcon';


function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

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

  const budgetPct = metrics.totalBudget > 0 ? (metrics.budgetSpent / metrics.totalBudget) * 100 : 0;
  const budgetRemaining = metrics.totalBudget - metrics.budgetSpent;

  const personalCards = [
    {
      id: 'metric-balance',
      label: 'Personal Balance',
      value: formatCurrency(metrics.totalBalance),
      change: metrics.netCashFlow >= 0 ? `+${formatCurrency(metrics.netCashFlow)}` : formatCurrency(metrics.netCashFlow),
      changeDir: metrics.netCashFlow >= 0 ? 'up' as const : 'down' as const,
      changeLabel: 'net this month',
      icon: Wallet,
      iconBg: 'bg-primary/10',
      iconColor: 'text-primary',
      hero: true,
    },
    {
      id: 'metric-income',
      label: 'Monthly Income',
      value: formatCurrency(metrics.monthlyIncome),
      change: formatCurrency(metrics.monthlyIncome),
      changeDir: 'up' as const,
      changeLabel: 'this month',
      icon: TrendingUp,
      iconBg: 'bg-positive-soft',
      iconColor: 'text-positive',
      hero: false,
    },
    {
      id: 'metric-expenses',
      label: 'Monthly Expenses',
      value: formatCurrency(metrics.monthlyExpenses),
      change: formatCurrency(metrics.monthlyExpenses),
      changeDir: 'down' as const,
      changeLabel: 'this month',
      icon: TrendingDown,
      iconBg: 'bg-negative-soft',
      iconColor: 'text-negative',
      hero: false,
      alert: metrics.monthlyExpenses > metrics.monthlyIncome,
    },
    {
      id: 'metric-netflow',
      label: 'Net Cash Flow',
      value: (metrics.netCashFlow >= 0 ? '+' : '') + formatCurrency(metrics.netCashFlow),
      change: metrics.netCashFlow >= 0 ? 'Positive' : 'Negative',
      changeDir: metrics.netCashFlow >= 0 ? 'up' as const : 'down' as const,
      changeLabel: 'income minus expenses',
      icon: ArrowUpDown,
      iconBg: 'bg-info-soft',
      iconColor: 'text-info',
      hero: false,
    },
    {
      id: 'metric-budget',
      label: 'Budget Remaining',
      value: formatCurrency(budgetRemaining),
      change: `${budgetPct.toFixed(1)}% used`,
      changeDir: 'neutral' as const,
      changeLabel: `of ${formatCurrency(metrics.totalBudget)} budget`,
      icon: Target,
      iconBg: 'bg-warning-soft',
      iconColor: 'text-warning',
      hero: false,
      warningState: budgetPct >= 70,
      budgetPct,
    },
    {
      id: 'metric-upcoming',
      label: 'Upcoming Payments',
      value: formatCurrency(metrics.upcomingPaymentsTotal),
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
      value: formatCurrency(metrics.managedMoneyTotal),
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
      value: formatCurrency(metrics.outstandingLoanBalance),
      change: formatCurrency(metrics.loanBorrowedThisMonth),
      changeDir: 'neutral' as const,
      changeLabel: 'borrowed this month',
      icon: TrendingDown,
      iconBg: 'bg-negative-soft',
      iconColor: 'text-negative',
      hero: false,
    },
    {
      id: 'metric-loan-repaid',
      label: 'Loan Repayments',
      value: formatCurrency(metrics.loanRepaidThisMonth),
      change: formatCurrency(metrics.loanRepaidThisMonth),
      changeDir: 'neutral' as const,
      changeLabel: 'paid this month',
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
                <p className={`font-tabular font-800 text-foreground ${isHero ? 'text-3xl md:text-[2rem]' : 'text-2xl'} mb-1.5`}>
                  {metric.value}
                </p>
                <div className="flex items-center gap-1.5">
                  {metric.changeDir === 'up' && <ArrowUp size={12} className="text-positive flex-shrink-0" />}
                  {metric.changeDir === 'down' && <ArrowDown size={12} className="text-negative flex-shrink-0" />}
                  <span className={`text-xs font-600 font-tabular ${
                    metric.changeDir === 'up' ? 'text-positive' :
                    metric.changeDir === 'down' ? 'text-negative' : 'text-muted-foreground'
                  }`}>{metric.change}</span>
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
                <p className="mb-1.5 text-2xl font-800 font-tabular text-foreground">{metric.value}</p>
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
                <p className="mb-1.5 text-2xl font-800 font-tabular text-foreground">{metric.value}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-600 font-tabular text-muted-foreground">{metric.change}</span>
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
