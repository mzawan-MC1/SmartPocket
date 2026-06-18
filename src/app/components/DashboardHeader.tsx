'use client';
import React, { useMemo, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, MoreHorizontal, PiggyBank, Plus, Repeat, RotateCcw, Wallet } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import Tabs from '@/components/ui/Tabs';
import type { DashboardActivePeriod } from '@/lib/finance';
import { getMonthContext, getNextFinancialPeriod, getPreviousFinancialPeriod, shiftMonthKey, type DashboardPeriodPreference } from '@/lib/financial-periods';
import type { UserFinancialPeriodContext } from '@/lib/financial-periods/profile';

type QuickActionId = 'transaction' | 'account' | 'recurring' | 'reimbursement' | 'budget';

const QUICK_ACTIONS: Array<{ id: QuickActionId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'transaction', label: 'Add Transaction', icon: Plus },
  { id: 'account', label: 'Add Account', icon: Wallet },
  { id: 'recurring', label: 'Add Recurring', icon: Repeat },
  { id: 'reimbursement', label: 'Add Reimbursement', icon: RotateCcw },
];

const MORE_ACTIONS: Array<{ id: QuickActionId; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  { id: 'budget', label: 'Add Budget', icon: PiggyBank },
];

export default function DashboardHeader({
  activePeriod,
  viewMode,
  defaultViewMode,
  onViewModeChange,
  onResetToDefault,
  onSelectedMonthChange,
  onSelectedPayPeriodChange,
  onQuickAction,
  financialPeriodContext,
}: {
  activePeriod: DashboardActivePeriod;
  viewMode: DashboardPeriodPreference;
  defaultViewMode: DashboardPeriodPreference;
  onViewModeChange: (mode: DashboardPeriodPreference) => void;
  onResetToDefault: () => void;
  onSelectedMonthChange: (monthKey: string) => void;
  onSelectedPayPeriodChange: (startDate: string) => void;
  onQuickAction: (action: QuickActionId, trigger: HTMLElement | null) => void;
  financialPeriodContext: UserFinancialPeriodContext;
}) {
  const monthInputRef = useRef<HTMLInputElement | null>(null);
  const monthContext = useMemo(
    () => getMonthContext(activePeriod.monthKey, financialPeriodContext.timezone),
    [activePeriod.monthKey, financialPeriodContext.timezone]
  );
  const currentMonthContext = useMemo(
    () => getMonthContext(undefined, financialPeriodContext.timezone),
    [financialPeriodContext.timezone]
  );
  const canMoveNext = viewMode === 'month'
    ? monthContext.monthKey < currentMonthContext.monthKey
    : activePeriod.endDate < financialPeriodContext.currentFinancialPeriod.endDate;
  const description = activePeriod.mode === 'month'
    ? `Your financial overview for ${activePeriod.label}`
    : `Your financial overview for ${activePeriod.label}`;
  const badgeLabel = financialPeriodContext.hasConfigurationWarning
    ? 'Month fallback'
    : activePeriod.mode === 'month'
      ? 'Month view'
      : 'Pay period view';

  return (
    <PageHeader
      title="Dashboard"
      description={description}
      badge={<StatusBadge status={financialPeriodContext.hasConfigurationWarning ? 'warning' : 'info'} label={badgeLabel} />}
      actions={
        <div className="flex flex-col gap-3 xl:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Tabs
              items={[
                { id: 'pay_cycle', label: 'Pay period' },
                { id: 'month', label: 'Month' },
              ]}
              activeId={viewMode}
              onChange={onViewModeChange}
              className="w-auto"
            />
            {viewMode !== defaultViewMode ? (
              <button type="button" className="btn-ghost h-9 px-3 text-xs" onClick={onResetToDefault}>
                Use saved default
              </button>
            ) : null}
          </div>
          {financialPeriodContext.configurationWarning ? (
            <div className="rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning max-w-[460px]">
              {financialPeriodContext.configurationWarning}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-2 py-2 shadow-card-sm">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                    className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 text-foreground hover:bg-muted"
                    aria-label={action.label}
                  >
                    <Icon size={14} className="text-accent" />
                    <span>{action.label.replace('Add ', '')}</span>
                  </button>
                );
              })}
              <details className="relative">
                <summary className="list-none inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-600 text-foreground hover:bg-muted">
                  <MoreHorizontal size={14} className="text-accent" />
                  <span>More</span>
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-2xl border border-border bg-card p-2 shadow-card-lg">
                  {MORE_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-600 text-foreground hover:bg-muted"
                        aria-label={action.label}
                      >
                        <Icon size={14} className="text-accent" />
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </details>
            </div>
            <div className="section-card flex items-center gap-1 px-2 py-2">
              <button
                type="button"
                onClick={() => {
                  if (viewMode === 'month') {
                    onSelectedMonthChange(shiftMonthKey(monthContext.monthKey, -1));
                    return;
                  }
                  onSelectedPayPeriodChange(getPreviousFinancialPeriod(financialPeriodContext.effectiveConfig, activePeriod.startDate).startDate);
                }}
                className="btn-ghost min-h-0 rounded-xl p-2"
                aria-label={viewMode === 'month' ? 'Previous month' : 'Previous pay period'}
              >
                <ChevronLeft size={15} className="text-muted-foreground" />
              </button>
              {viewMode === 'month' ? (
                <>
                  <button
                    type="button"
                    onClick={() => monthInputRef.current?.showPicker?.() ?? monthInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-muted"
                    aria-label="Choose month"
                  >
                    <Calendar size={14} className="text-accent" />
                    <span className="text-sm font-700 text-foreground whitespace-nowrap">
                      {monthContext.label}
                    </span>
                  </button>
                  <input
                    ref={monthInputRef}
                    type="month"
                    className="sr-only"
                    value={monthContext.monthKey}
                    max={currentMonthContext.monthKey}
                    onChange={(event) => onSelectedMonthChange(event.target.value)}
                    aria-label="Dashboard month"
                  />
                </>
              ) : (
                <div className="flex items-center gap-2 rounded-xl px-2 py-1.5">
                  <Calendar size={14} className="text-accent" />
                  <span className="text-sm font-700 text-foreground whitespace-nowrap">{activePeriod.label}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!canMoveNext) return;
                  if (viewMode === 'month') {
                    onSelectedMonthChange(shiftMonthKey(monthContext.monthKey, 1));
                    return;
                  }
                  onSelectedPayPeriodChange(getNextFinancialPeriod(financialPeriodContext.effectiveConfig, activePeriod.startDate).startDate);
                }}
                className="btn-ghost min-h-0 rounded-xl p-2 disabled:opacity-40"
                aria-label={viewMode === 'month' ? 'Next month' : 'Next pay period'}
                disabled={!canMoveNext}
              >
                <ChevronRight size={15} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      }
    />
  );
}
