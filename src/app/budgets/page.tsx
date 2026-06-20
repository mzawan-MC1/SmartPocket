'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { Plus, AlertCircle, AlertTriangle, Edit2, ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import {
  deleteBudget,
  getBudgetDetailSnapshot,
  getBudgetTrackingOverview,
  type Budget,
  type BudgetDetailSnapshot,
  type BudgetTrackingItem,
  type BudgetTrackingOverview,
} from '@/lib/finance';
import AddBudgetForm from './components/AddBudgetForm';
import dynamic from 'next/dynamic';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import type { BudgetPeriod } from '@/lib/financial-periods';
import { getBudgetPeriodTypeLabel } from '@/lib/financial-periods/budgets';

const BudgetRadialChart = dynamic(() => import('./components/charts/BudgetRadialChart'), { ssr: false });

function getBarClass(status: BudgetTrackingItem['status']) {
  if (status === 'over_budget') return 'budget-bar-red';
  if (status === 'near_limit') return 'budget-bar-amber';
  return 'budget-bar-green';
}

function getStatusTone(status: BudgetTrackingItem['status']) {
  if (status === 'over_budget') return 'text-negative';
  if (status === 'near_limit') return 'text-warning';
  if (status === 'conversion_unavailable') return 'text-warning';
  if (status === 'no_spending') return 'text-muted-foreground';
  return 'text-positive';
}

function groupBudgetSummaries(items: BudgetTrackingItem[]) {
  const grouped = new Map<string, { budget: number; spent: number }>();

  for (const item of items.filter((entry) => entry.remainingAmount !== null)) {
    const currency = (item.budget.currency || '').trim().toUpperCase();
    if (!currency) continue;

    const current = grouped.get(currency) || { budget: 0, spent: 0 };
    current.budget += Number(item.budget.amount || 0);
    current.spent += Number(item.spentAmount || 0);
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

const PERIOD_FILTERS: Array<'all' | BudgetPeriod> = ['all', 'weekly', 'biweekly', 'semimonthly', 'monthly', 'custom'];

export default function BudgetsPage() {
  const [overview, setOverview] = useState<BudgetTrackingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<'all' | BudgetPeriod>('all');
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [detailBudget, setDetailBudget] = useState<Budget | null>(null);
  const [detailReferenceDate, setDetailReferenceDate] = useState<string | null>(null);
  const [detailSnapshot, setDetailSnapshot] = useState<BudgetDetailSnapshot | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getBudgetTrackingOverview({
      periodFilter,
      locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
    })
      .then(setOverview)
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [periodFilter]);

  useEffect(() => { load(); }, [load]);
  useSmartPocketDataChanged(['budgets', 'transactions', 'profile'], 'BudgetsPage', async () => {
    load();
  });

  useEffect(() => {
    if (!detailBudget) return;
    setDetailLoading(true);
    setDetailSnapshot(null);
    getBudgetDetailSnapshot({
      budgetId: detailBudget.id,
      referenceDate: detailReferenceDate || undefined,
      locale: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
    })
      .then(setDetailSnapshot)
      .catch((error) => toast.error(error.message))
      .finally(() => setDetailLoading(false));
  }, [detailBudget, detailReferenceDate]);

  const items = overview?.items || [];
  const budgetSummaries = useMemo(() => groupBudgetSummaries(items), [items]);
  const singleCurrencySummary = budgetSummaries.length === 1 ? budgetSummaries[0] : null;
  const onTrack = items.filter((item) => item.status === 'on_track').length;
  const warning = items.filter((item) => item.status === 'near_limit').length;
  const exceeded = items.filter((item) => item.status === 'over_budget').length;
  const unavailable = items.filter((item) => item.status === 'conversion_unavailable').length;

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
      <div className="page-section max-[480px]:gap-3">
        <PageHeader
          title="Budgets"
          description="Track spending against each budget's own stored period without rewriting it when your planning settings change."
          badge={<StatusBadge status="info" label="Budget planning" />}
          compact
          className="max-[480px]:gap-1.5 [&_.page-title]:max-[480px]:text-[1.45rem] [&_.page-subtitle]:max-[480px]:mt-0.5 [&_.page-subtitle]:max-[480px]:text-[13px] [&_.page-subtitle]:max-[480px]:leading-4"
          actionsClassName="w-full sm:w-auto"
          actions={
            <div className="flex w-full sm:w-auto">
              <button onClick={() => {
                setEditingBudget(null);
                setShowAddModal(true);
              }} className="btn-primary w-full px-3 py-2.5 text-sm sm:w-auto">
                <Plus size={16} /> Add Budget
              </button>
            </div>
          }
        />
        <div className="flex flex-wrap gap-2 max-[480px]:gap-1.5">
          {PERIOD_FILTERS.map((filterValue) => {
            const selected = periodFilter === filterValue;
            return (
              <button
                key={filterValue}
                type="button"
                aria-pressed={selected}
                onClick={() => setPeriodFilter(filterValue)}
                className={`rounded-xl border px-3 py-2 text-xs font-600 max-[480px]:px-2.5 max-[480px]:py-1.5 ${selected ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-card text-foreground hover:border-accent/40'}`}
              >
                {filterValue === 'all' ? 'All budgets' : getBudgetPeriodTypeLabel(filterValue)}
              </button>
            );
          })}
        </div>

        {/* Overview Card */}
        {loading ? (
          <div className="card-elevated animate-pulse p-6 max-[480px]:p-4">
            <div className="h-6 bg-muted rounded w-48 mb-4" />
            <div className="h-3 bg-muted rounded w-full" />
          </div>
        ) : budgetSummaries.length > 0 ? (
          <div className="card-elevated p-6 max-[480px]:p-4">
            <div className="flex flex-col gap-4 max-[480px]:gap-4 lg:flex-row lg:items-center lg:gap-6">
              {singleCurrencySummary ? (
                <div className="mx-auto h-32 w-32 flex-shrink-0 max-[480px]:h-28 max-[480px]:w-28 lg:mx-0 lg:h-40 lg:w-40">
                  <BudgetRadialChart
                    pct={singleCurrencySummary.utilizationPct}
                    spent={singleCurrencySummary.totalSpent}
                    budget={singleCurrencySummary.totalBudget}
                  />
                </div>
              ) : null}
              <div className="flex-1 space-y-3 max-[480px]:space-y-3 sm:space-y-4">
                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-700 text-foreground">Budget Overview</h2>
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
                  <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:grid-cols-3 sm:gap-4">
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
                          className={`text-lg font-700 font-tabular max-[480px]:text-base ${item.color}`}
                          showCode
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {budgetSummaries.map((summary) => {
                      const summaryBarClass = summary.utilizationPct >= 90
                        ? 'budget-bar-red'
                        : summary.utilizationPct >= 70
                          ? 'budget-bar-amber'
                          : 'budget-bar-green';
                      return (
                        <div key={summary.currency} className="rounded-2xl border border-border bg-muted/20 p-4 max-[480px]:p-3.5">
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
                <div className="flex flex-wrap items-center gap-3 max-[480px]:gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-600 text-positive"><span className="w-2 h-2 rounded-full bg-positive" />{onTrack} on track</span>
                  <span className="flex items-center gap-1.5 text-xs font-600 text-warning"><span className="w-2 h-2 rounded-full bg-warning" />{warning} near limit</span>
                  <span className="flex items-center gap-1.5 text-xs font-600 text-negative"><span className="w-2 h-2 rounded-full bg-negative" />{exceeded} exceeded</span>
                  {unavailable > 0 ? (
                    <span className="flex items-center gap-1.5 text-xs font-600 text-warning"><span className="w-2 h-2 rounded-full bg-warning" />{unavailable} conversion unavailable</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Category Budgets */}
        <div className="space-y-3 max-[480px]:space-y-3 sm:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-700 text-foreground">Category Budgets</h2>
            <button onClick={() => {
              setEditingBudget(null);
              setShowAddModal(true);
            }} className="btn-ghost h-9 px-2.5 text-sm text-accent">
              <Plus size={14} /> Add Category Budget
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-2 xl:gap-4 2xl:grid-cols-3">
              {[...Array(4)].map((_, i) => (
                <div key={`skel-bud-${i}`} className="card-elevated animate-pulse p-5 max-[480px]:p-4">
                  <div className="h-4 bg-muted rounded w-32 mb-4" />
                  <div className="h-2 bg-muted rounded w-full mb-3" />
                  <div className="h-3 bg-muted rounded w-24" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="card-elevated p-12 max-[480px]:p-5">
              <EmptyState
                icon={Plus}
                title="No budgets yet"
                description="Create your first budget to start tracking stored weekly, monthly, or custom spending limits."
                action={{
                  label: 'Add Budget',
                  onClick: () => {
                    setEditingBudget(null);
                    setShowAddModal(true);
                  },
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-2 xl:gap-4 2xl:grid-cols-3">
              {items.map((item) => {
                const bud = item.budget;
                const barClass = getBarClass(item.status);
                const catColor = bud.category?.color || '#6b7280';

                return (
                  <div
                    key={bud.id}
                    onClick={() => {
                      setDetailBudget(bud);
                      setDetailSnapshot(null);
                      setDetailReferenceDate(item.period.startDate);
                    }}
                    className={`card-elevated p-4 transition-shadow duration-200 hover:shadow-card-md max-[480px]:p-3.5 ${
                      item.status === 'over_budget' ? 'border-negative/30 bg-negative-soft/10' : item.status === 'near_limit' ? 'border-warning/30' : ''
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: catColor + '20' }}>
                          <span className="text-base" style={{ color: catColor }}>●</span>
                        </div>
                        <div>
                          <p className="text-sm font-700 text-foreground">{bud.category?.name || bud.name}</p>
                          <p className="text-[11px] text-muted-foreground">{item.periodTypeLabel} budget</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            {item.status === 'over_budget' && <AlertCircle size={11} className="text-negative" />}
                            {item.status === 'near_limit' && <AlertTriangle size={11} className="text-warning" />}
                            <span className={`text-[10px] font-600 ${getStatusTone(item.status)}`}>{item.statusLabel}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingBudget(bud);
                        }}
                        title={`Edit ${bud.name} budget`}
                      >
                        <Edit2 size={13} />
                      </button>
                    </div>

                    <div className="mb-3">
                      <p className="mb-2 text-xs text-muted-foreground">{item.period.label}</p>
                      <div className="flex items-center justify-between mb-1.5">
                        {item.spentAmount !== null ? (
                          <FormattedCurrencyAmount
                            amount={item.spentAmount}
                            currencyCode={bud.currency}
                            className="text-xs text-muted-foreground"
                            textOnly
                          />
                        ) : (
                          <span className="text-xs text-warning">Conversion unavailable</span>
                        )}
                        <span className="text-xs font-600 font-tabular text-muted-foreground">
                          {item.progressPct !== null ? `${item.progressPct.toFixed(0)}%` : 'N/A'}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${Math.min(item.progressPct || 0, 100)}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Budget amount</p>
                        <FormattedCurrencyAmount
                          amount={bud.amount}
                          currencyCode={bud.currency}
                          className="text-sm font-700 font-tabular text-foreground"
                          showCode
                        />
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-muted-foreground">{item.remainingAmount !== null && item.remainingAmount >= 0 ? 'Remaining' : 'Over by'}</p>
                        {item.remainingAmount !== null ? (
                          <FormattedCurrencyAmount
                            amount={Math.abs(item.remainingAmount)}
                            currencyCode={bud.currency}
                            className={`text-sm font-700 font-tabular ${item.remainingAmount >= 0 ? 'text-positive' : 'text-negative'}`}
                            showCode
                          />
                        ) : (
                          <p className="text-sm font-700 text-warning">Unavailable</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{item.transactionCount} transaction{item.transactionCount === 1 ? '' : 's'} in this period</span>
                      <span>{item.warning ? 'Check Settings or FX history' : item.period.label}</span>
                    </div>
                  </div>
                );
              })}

              <button
                onClick={() => {
                  setEditingBudget(null);
                  setShowAddModal(true);
                }}
                className="card-elevated group flex min-h-[160px] flex-col items-center justify-center gap-2 border-2 border-dashed border-border p-6 transition-all duration-200 hover:border-accent hover:bg-accent/5 max-[480px]:min-h-[140px] max-[480px]:p-5"
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

      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingBudget(null);
        }}
        title="Set Category Budget"
        size="md"
      >
        <AddBudgetForm
          onSuccess={() => { setShowAddModal(false); setEditingBudget(null); toast.success('Budget saved'); load(); }}
          onCancel={() => {
            setShowAddModal(false);
            setEditingBudget(null);
          }}
        />
      </Modal>
      <Modal
        isOpen={!!editingBudget && !showAddModal}
        onClose={() => setEditingBudget(null)}
        title={`Edit ${editingBudget?.category?.name || editingBudget?.name || 'Budget'}`}
        size="md"
      >
        {editingBudget ? (
          <AddBudgetForm
            budget={editingBudget}
            onSuccess={() => { setEditingBudget(null); toast.success('Budget updated'); load(); }}
            onCancel={() => setEditingBudget(null)}
          />
        ) : null}
      </Modal>
      <Modal
        isOpen={!!detailBudget}
        onClose={() => {
          setDetailBudget(null);
          setDetailSnapshot(null);
          setDetailReferenceDate(null);
        }}
        title={detailBudget?.category?.name || detailBudget?.name || 'Budget details'}
        size="lg"
      >
        {detailLoading || !detailSnapshot ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading budget details...</div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setDetailReferenceDate(detailSnapshot.previousPeriod.startDate)}
                className="btn-ghost h-9 px-3"
                aria-label="Previous budget period"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                type="button"
                onClick={() => setDetailReferenceDate(null)}
                className="btn-secondary h-9 px-3"
              >
                Current period
              </button>
              <button
                type="button"
                onClick={() => setDetailReferenceDate(detailSnapshot.nextPeriod.startDate)}
                className="btn-ghost h-9 px-3"
                aria-label="Next budget period"
              >
                Next <ChevronRight size={14} />
              </button>
              <StatusBadge status={detailSnapshot.status === 'over_budget' ? 'error' : detailSnapshot.status === 'near_limit' ? 'warning' : 'info'} label={detailSnapshot.statusLabel} />
            </div>
            <div className="rounded-2xl border border-border bg-muted/20 p-4">
              <p className="text-sm font-700 text-foreground">{detailSnapshot.periodTypeLabel}</p>
              <p className="text-xs text-muted-foreground mt-1">{detailSnapshot.period.label}</p>
              {detailSnapshot.warning ? (
                <p className="mt-2 text-sm text-warning">{detailSnapshot.warning}</p>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[11px] text-muted-foreground">Budget amount</p>
                <FormattedCurrencyAmount amount={detailSnapshot.budget.amount} currencyCode={detailSnapshot.budget.currency} className="text-lg font-700 text-foreground" showCode />
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[11px] text-muted-foreground">Spent</p>
                {detailSnapshot.spentAmount !== null ? (
                  <FormattedCurrencyAmount amount={detailSnapshot.spentAmount} currencyCode={detailSnapshot.budget.currency} className="text-lg font-700 text-foreground" showCode />
                ) : (
                  <p className="text-sm font-700 text-warning">Historical exchange rate unavailable</p>
                )}
              </div>
              <div className="rounded-2xl border border-border p-4">
                <p className="text-[11px] text-muted-foreground">{detailSnapshot.remainingAmount !== null && detailSnapshot.remainingAmount >= 0 ? 'Remaining' : 'Over by'}</p>
                {detailSnapshot.remainingAmount !== null ? (
                  <FormattedCurrencyAmount amount={Math.abs(detailSnapshot.remainingAmount)} currencyCode={detailSnapshot.budget.currency} className={`text-lg font-700 ${detailSnapshot.remainingAmount >= 0 ? 'text-positive' : 'text-negative'}`} showCode />
                ) : (
                  <p className="text-sm font-700 text-warning">Unavailable</p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-700 text-foreground">Progress</p>
                <span className="text-xs font-600 text-muted-foreground">
                  {detailSnapshot.progressPct !== null ? `${detailSnapshot.progressPct.toFixed(1)}% used` : 'Conversion unavailable'}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${getBarClass(detailSnapshot.status)}`} style={{ width: `${Math.min(detailSnapshot.progressPct || 0, 100)}%` }} />
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-700 text-foreground">Category transactions</p>
                <span className="text-xs text-muted-foreground">{detailSnapshot.transactions.length} item{detailSnapshot.transactions.length === 1 ? '' : 's'}</span>
              </div>
              {detailSnapshot.transactions.length === 0 ? (
                <div className="rounded-2xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground">No spending in this period.</div>
              ) : (
                <div className="space-y-2">
                  {detailSnapshot.transactions.map((transaction) => (
                    <div key={transaction.id} className="rounded-2xl border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-600 text-foreground">{transaction.merchant || transaction.description || 'Expense'}</p>
                          <p className="text-xs text-muted-foreground">{transaction.transaction_date}</p>
                        </div>
                        <FormattedCurrencyAmount amount={transaction.amount} currencyCode={transaction.currency} className="text-sm font-700 text-foreground" showCode />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setEditingBudget(detailSnapshot.budget);
                  setDetailBudget(null);
                  setDetailSnapshot(null);
                  setDetailReferenceDate(null);
                }}
              >
                <Edit2 size={14} /> Edit Budget
              </button>
              <button
                type="button"
                className="btn-ghost text-negative"
                onClick={async () => {
                  await deleteBudget(detailSnapshot.budget.id);
                  toast.success('Budget archived');
                  setDetailBudget(null);
                  load();
                }}
              >
                Archive Budget
              </button>
            </div>
          </div>
        )}
      </Modal>
    </AppLayout>
  );
}
