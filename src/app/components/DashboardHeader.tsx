'use client';
import React, { useMemo, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Plus, Repeat, RotateCcw, Target, Wallet } from 'lucide-react';
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
  { id: 'budget', label: 'Add Budget', icon: Target },
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
      className="items-start gap-3 lg:flex-nowrap lg:items-center lg:justify-between"
      actionsClassName="w-full lg:w-auto lg:flex-1"
      actions={
        <div className="flex w-full flex-col gap-1.5 lg:items-end">
          <div className="flex w-full flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1 rounded-2xl border border-border/90 bg-card px-1.5 py-1.5 shadow-card-md lg:flex-nowrap lg:justify-end">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-transparent bg-transparent px-2.5 text-sm font-700 text-foreground transition-colors hover:border-border/80 hover:bg-muted/75"
                    aria-label={action.label}
                  >
                    <Icon size={15} className="text-accent" />
                    <span>{action.label.replace('Add ', '')}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/90 bg-card px-1 py-1 shadow-card-sm lg:flex-nowrap">
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
                <button type="button" className="btn-ghost h-8.5 whitespace-nowrap px-2 text-[11px]" onClick={onResetToDefault}>
                  Use saved default
                </button>
              ) : null}
              <div className="hidden h-5 w-px bg-border/80 lg:block" />
              <div className="inline-flex items-center gap-0.5 rounded-xl bg-muted/35 px-0.5 py-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'month') {
                      onSelectedMonthChange(shiftMonthKey(monthContext.monthKey, -1));
                      return;
                    }
                    onSelectedPayPeriodChange(getPreviousFinancialPeriod(financialPeriodContext.effectiveConfig, activePeriod.startDate).startDate);
                  }}
                  className="btn-ghost min-h-0 rounded-lg p-1"
                  aria-label={viewMode === 'month' ? 'Previous month' : 'Previous pay period'}
                >
                  <ChevronLeft size={18} className="text-muted-foreground" />
                </button>
                {viewMode === 'month' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => monthInputRef.current?.showPicker?.() ?? monthInputRef.current?.click()}
                      className="flex h-8 items-center gap-1.5 rounded-lg px-1.5 hover:bg-card"
                      aria-label="Choose month"
                    >
                      <Calendar size={16} className="text-accent" />
                      <span className="whitespace-nowrap text-[13px] font-700 text-foreground">
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
                  <div className="flex h-8 items-center gap-1.5 rounded-lg px-1.5">
                    <Calendar size={16} className="text-accent" />
                    <span className="whitespace-nowrap text-[13px] font-700 text-foreground">{activePeriod.label}</span>
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
                  className="btn-ghost min-h-0 rounded-lg p-1 disabled:opacity-40"
                  aria-label={viewMode === 'month' ? 'Next month' : 'Next pay period'}
                  disabled={!canMoveNext}
                >
                  <ChevronRight size={18} className="text-muted-foreground" />
                </button>
              </div>
            </div>
          </div>
          {financialPeriodContext.configurationWarning ? (
            <div className="w-full rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning lg:max-w-[520px]">
              {financialPeriodContext.configurationWarning}
            </div>
          ) : null}
        </div>
      }
    />
  );
}
