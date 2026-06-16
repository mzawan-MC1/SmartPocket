'use client';
import React from 'react';
import dynamic from 'next/dynamic';

const BudgetRadialChart = dynamic(() => import('./charts/BudgetRadialChart'), { ssr: false });

// Backend integration point: fetch from /api/budgets/summary?month=YYYY-MM
const overview = {
  totalBudget: 5000,
  totalSpent: 3363.22,
  remaining: 1636.78,
  utilizationPct: 67.2,
  categories: { onTrack: 5, warning: 2, exceeded: 1 },
};

export default function BudgetOverviewCard() {
  const pct = overview?.utilizationPct;
  const barClass = pct >= 90 ? 'budget-bar-red' : pct >= 70 ? 'budget-bar-amber' : 'budget-bar-green';
  const statusColor = pct >= 90 ? 'text-negative' : pct >= 70 ? 'text-warning' : 'text-positive';

  return (
    <div className="card-elevated p-6">
      <div className="flex flex-col lg:flex-row lg:items-center gap-6">
        {/* Radial Chart */}
        <div className="w-40 h-40 flex-shrink-0 mx-auto lg:mx-0">
          <BudgetRadialChart pct={pct} spent={overview?.totalSpent} budget={overview?.totalBudget} />
        </div>

        {/* Details */}
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-700 text-foreground">Overall Monthly Budget</h2>
              <span className={`text-sm font-700 font-tabular ${statusColor}`}>{pct?.toFixed(1)}% used</span>
            </div>
            <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { id: 'bov-budget', label: 'Total Budget', value: `$${overview?.totalBudget?.toLocaleString()}`, color: 'text-foreground' },
              { id: 'bov-spent', label: 'Spent So Far', value: `$${overview?.totalSpent?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: pct >= 90 ? 'text-negative' : pct >= 70 ? 'text-warning' : 'text-foreground' },
              { id: 'bov-remaining', label: 'Remaining', value: `$${overview?.remaining?.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, color: 'text-positive' },
            ]?.map((item) => (
              <div key={item?.id}>
                <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1">{item?.label}</p>
                <p className={`text-xl font-700 font-tabular ${item?.color}`}>{item?.value}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1.5 text-xs font-600 text-positive">
              <span className="w-2 h-2 rounded-full bg-positive" />
              {overview?.categories?.onTrack} on track
            </span>
            <span className="flex items-center gap-1.5 text-xs font-600 text-warning">
              <span className="w-2 h-2 rounded-full bg-warning" />
              {overview?.categories?.warning} near limit
            </span>
            <span className="flex items-center gap-1.5 text-xs font-600 text-negative">
              <span className="w-2 h-2 rounded-full bg-negative" />
              {overview?.categories?.exceeded} exceeded
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}