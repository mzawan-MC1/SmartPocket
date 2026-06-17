'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Plus, AlertCircle, AlertTriangle, Edit2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import { getBudgets, type Budget } from '@/lib/finance';
import AddBudgetForm from './components/AddBudgetForm';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

const BudgetRadialChart = dynamic(() => import('./components/charts/BudgetRadialChart'), { ssr: false });

function getBarClass(pct: number) {
  if (pct >= 100) return 'budget-bar-red';
  if (pct >= 80) return 'budget-bar-amber';
  return 'budget-bar-green';
}

function getStatus(pct: number) {
  if (pct >= 100) return { label: 'Exceeded', variant: 'exceeded' as const };
  if (pct >= 80) return { label: 'Near Limit', variant: 'warning' as const };
  if (pct === 0) return { label: 'Not Started', variant: 'default' as const };
  return { label: 'On Track', variant: 'active' as const };
}

function groupBudgetSummaries(budgets: Budget[]) {
  const grouped = new Map<string, { budget: number; spent: number }>();

  for (const budget of budgets) {
    const currency = (budget.currency || '').trim().toUpperCase();
    if (!currency) continue;

    const current = grouped.get(currency) || { budget: 0, spent: 0 };
    current.budget += Number(budget.amount || 0);
    current.spent += Number(budget.spent || 0);
    grouped.set(currency, current);
  }

  return Array.from(grouped.entries())
    .map(([currency, totals]) => {
      const remaining = totals.budget - totals.spent;
      const utilizationPct = totals.budget > 0 ? (totals.spent / totals.budget) * 100 : 0;
      return {
        currency,
        totalBudget: totals.budget,
        totalSpent: totals.spent,
        remaining,
        utilizationPct,
      };
    })
    .sort((left, right) => left.currency.localeCompare(right.currency, 'en', { sensitivity: 'base' }));
}

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const load = useCallback(() => {
    setLoading(true);
    getBudgets(`${selectedMonth}-01`)
      .then(setBudgets)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [selectedMonth]);

  useEffect(() => { load(); }, [load]);

  const budgetSummaries = useMemo(() => groupBudgetSummaries(budgets), [budgets]);
  const singleCurrencySummary = budgetSummaries.length === 1 ? budgetSummaries[0] : null;
  const onTrack = budgets.filter((b) => (b.spent || 0) / b.amount < 0.8).length;
  const warning = budgets.filter((b) => { const p = (b.spent || 0) / b.amount; return p >= 0.8 && p < 1; }).length;
  const exceeded = budgets.filter((b) => (b.spent || 0) >= b.amount).length;

  const barClass = singleCurrencySummary && singleCurrencySummary.utilizationPct >= 90
    ? 'budget-bar-red'
    : singleCurrencySummary && singleCurrencySummary.utilizationPct >= 70
      ? 'budget-bar-amber'
      : 'budget-bar-green';
  const statusColor = singleCurrencySummary && singleCurrencySummary.utilizationPct >= 90
    ? 'text-negative'
    : singleCurrencySummary && singleCurrencySummary.utilizationPct >= 70
      ? 'text-warning'
      : 'text-positive';

  return (
    <AppLayout activeRoute="/budgets">
      <div className="page-section">
        <PageHeader
          title="Budgets"
          description="Track your spending against budget limits and keep monthly plans visible."
          badge={<StatusBadge status="info" label="Budget planning" />}
          actions={
            <>
              <input
                type="month"
                className="input-base h-11 text-sm w-full sm:w-40"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              />
              <button onClick={() => setShowAddModal(true)} className="btn-primary">
                <Plus size={16} /> Add Budget
              </button>
            </>
          }
        />

        {/* Overview Card */}
        {loading ? (
          <div className="card-elevated p-6 animate-pulse">
            <div className="h-6 bg-muted rounded w-48 mb-4" />
            <div className="h-3 bg-muted rounded w-full" />
          </div>
        ) : budgetSummaries.length > 0 ? (
          <div className="card-elevated p-6">
            <div className="flex flex-col lg:flex-row lg:items-center gap-6">
              {singleCurrencySummary ? (
                <div className="w-40 h-40 flex-shrink-0 mx-auto lg:mx-0">
                  <BudgetRadialChart
                    pct={singleCurrencySummary.utilizationPct}
                    spent={singleCurrencySummary.totalSpent}
                    budget={singleCurrencySummary.totalBudget}
                  />
                </div>
              ) : null}
              <div className="flex-1 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-700 text-foreground">Overall Monthly Budget</h2>
                    {singleCurrencySummary ? (
                      <span className={`text-sm font-700 font-tabular ${statusColor}`}>
                        {singleCurrencySummary.utilizationPct.toFixed(1)}% used
                      </span>
                    ) : (
                      <span className="text-xs font-600 text-muted-foreground">Grouped by currency</span>
                    )}
                  </div>
                  {singleCurrencySummary ? (
                    <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                        style={{ width: `${Math.min(singleCurrencySummary.utilizationPct, 100)}%` }}
                      />
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Mixed-currency budgets are shown per currency to avoid combining unrelated totals.
                    </p>
                  )}
                </div>
                {singleCurrencySummary ? (
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      {
                        id: 'bov-budget',
                        label: 'Total Budget',
                        amount: singleCurrencySummary.totalBudget,
                        color: 'text-foreground',
                      },
                      {
                        id: 'bov-spent',
                        label: 'Spent So Far',
                        amount: singleCurrencySummary.totalSpent,
                        color: singleCurrencySummary.utilizationPct >= 90
                          ? 'text-negative'
                          : singleCurrencySummary.utilizationPct >= 70
                            ? 'text-warning'
                            : 'text-foreground',
                      },
                      {
                        id: 'bov-remaining',
                        label: 'Remaining',
                        amount: singleCurrencySummary.remaining,
                        color: singleCurrencySummary.remaining >= 0 ? 'text-positive' : 'text-negative',
                      },
                    ].map((item) => (
                      <div key={item.id}>
                        <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1">{item.label}</p>
                        <FormattedCurrencyAmount
                          amount={item.amount}
                          currencyCode={singleCurrencySummary.currency}
                          className={`text-xl font-700 font-tabular ${item.color}`}
                          showCode
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {budgetSummaries.map((summary) => {
                      const summaryBarClass = summary.utilizationPct >= 90
                        ? 'budget-bar-red'
                        : summary.utilizationPct >= 70
                          ? 'budget-bar-amber'
                          : 'budget-bar-green';
                      return (
                        <div key={summary.currency} className="rounded-2xl border border-border bg-muted/20 p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-700 text-foreground">{summary.currency}</p>
                            <span className="text-xs font-600 text-muted-foreground">
                              {summary.utilizationPct.toFixed(1)}% used
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-muted overflow-hidden mb-3">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${summaryBarClass}`}
                              style={{ width: `${Math.min(summary.utilizationPct, 100)}%` }}
                            />
                          </div>
                          <div className="space-y-1.5 text-sm">
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Budget</span>
                              <FormattedCurrencyAmount
                                amount={summary.totalBudget}
                                currencyCode={summary.currency}
                                className="font-700 text-foreground"
                                showCode
                              />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">Spent</span>
                              <FormattedCurrencyAmount
                                amount={summary.totalSpent}
                                currencyCode={summary.currency}
                                className={`font-700 ${
                                  summary.utilizationPct >= 90
                                    ? 'text-negative'
                                    : summary.utilizationPct >= 70
                                      ? 'text-warning'
                                      : 'text-foreground'
                                }`}
                                showCode
                              />
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground">{summary.remaining >= 0 ? 'Remaining' : 'Over by'}</span>
                              <FormattedCurrencyAmount
                                amount={Math.abs(summary.remaining)}
                                currencyCode={summary.currency}
                                className={`font-700 ${summary.remaining >= 0 ? 'text-positive' : 'text-negative'}`}
                                showCode
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-1.5 text-xs font-600 text-positive"><span className="w-2 h-2 rounded-full bg-positive" />{onTrack} on track</span>
                  <span className="flex items-center gap-1.5 text-xs font-600 text-warning"><span className="w-2 h-2 rounded-full bg-warning" />{warning} near limit</span>
                  <span className="flex items-center gap-1.5 text-xs font-600 text-negative"><span className="w-2 h-2 rounded-full bg-negative" />{exceeded} exceeded</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Category Budgets */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-700 text-foreground">Category Budgets</h2>
            <button onClick={() => setShowAddModal(true)} className="btn-ghost text-sm text-accent">
              <Plus size={14} /> Add Category Budget
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={`skel-bud-${i}`} className="card-elevated p-5 animate-pulse">
                  <div className="h-4 bg-muted rounded w-32 mb-4" />
                  <div className="h-2 bg-muted rounded w-full mb-3" />
                  <div className="h-3 bg-muted rounded w-24" />
                </div>
              ))}
            </div>
          ) : budgets.length === 0 ? (
            <div className="card-elevated p-12">
              <EmptyState
                icon={Plus}
                title="No budgets yet"
                description="Create your first budget to start tracking spending limits."
                action={{ label: 'Add Budget', onClick: () => setShowAddModal(true) }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4">
              {budgets.map((bud) => {
                const spent = bud.spent || 0;
                const pct = bud.amount > 0 ? (spent / bud.amount) * 100 : 0;
                const remaining = bud.amount - spent;
                const status = getStatus(pct);
                const barClass = getBarClass(pct);
                const catColor = bud.category?.color || '#6b7280';

                return (
                  <div
                    key={bud.id}
                    className={`card-elevated p-5 hover:shadow-card-md transition-shadow duration-200 ${
                      pct >= 100 ? 'border-negative/30 bg-negative-soft/10' : pct >= 80 ? 'border-warning/30' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: catColor + '20' }}>
                          <span className="text-base" style={{ color: catColor }}>●</span>
                        </div>
                        <div>
                          <p className="text-sm font-700 text-foreground">{bud.category?.name || bud.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {pct >= 100 && <AlertCircle size={11} className="text-negative" />}
                            {pct >= 80 && pct < 100 && <AlertTriangle size={11} className="text-warning" />}
                            <span className={`text-[10px] font-600 ${
                              status.variant === 'exceeded' ? 'text-negative' :
                              status.variant === 'warning' ? 'text-warning' :
                              status.variant === 'active' ? 'text-positive' : 'text-muted-foreground'
                            }`}>{status.label}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        onClick={() => toast.info('Edit budget coming soon')}
                        title={`Edit ${bud.name} budget`}
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>

                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <FormattedCurrencyAmount
                          amount={spent}
                          currencyCode={bud.currency}
                          className="text-xs text-muted-foreground"
                          textOnly
                        />
                        <span className="text-xs font-600 font-tabular text-muted-foreground">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Allocated</p>
                        <FormattedCurrencyAmount
                          amount={bud.amount}
                          currencyCode={bud.currency}
                          className="text-sm font-700 font-tabular text-foreground"
                          showCode
                        />
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-muted-foreground">{remaining >= 0 ? 'Remaining' : 'Over by'}</p>
                        <FormattedCurrencyAmount
                          amount={Math.abs(remaining)}
                          currencyCode={bud.currency}
                          className={`text-sm font-700 font-tabular ${remaining >= 0 ? 'text-positive' : 'text-negative'}`}
                          showCode
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => setShowAddModal(true)}
                className="card-elevated border-dashed border-2 border-border hover:border-accent hover:bg-accent/5 transition-all duration-200 flex flex-col items-center justify-center gap-2 p-8 min-h-[180px] group"
              >
                <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-accent/10 flex items-center justify-center transition-colors">
                  <Plus size={20} className="text-muted-foreground group-hover:text-accent transition-colors" />
                </div>
                <p className="text-sm font-600 text-muted-foreground group-hover:text-accent transition-colors">Add Category Budget</p>
              </button>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Set Category Budget" size="md">
        <AddBudgetForm
          onSuccess={() => { setShowAddModal(false); toast.success('Budget created'); load(); }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>
    </AppLayout>
  );
}
