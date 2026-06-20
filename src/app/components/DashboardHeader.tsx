'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Plus, Repeat, RotateCcw, Target, Wallet } from 'lucide-react';
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

const DIRECT_ACTIONS = QUICK_ACTIONS.filter((action) => action.id === 'transaction' || action.id === 'account');
const MORE_ACTIONS = QUICK_ACTIONS.filter((action) => action.id === 'recurring' || action.id === 'reimbursement' || action.id === 'budget');

export default function DashboardHeader({
  activePeriod,
  viewMode,
  onViewModeChange,
  onSelectedMonthChange,
  onSelectedPayPeriodChange,
  onQuickAction,
  financialPeriodContext,
}: {
  activePeriod: DashboardActivePeriod;
  viewMode: DashboardPeriodPreference;
  onViewModeChange: (mode: DashboardPeriodPreference) => void;
  onSelectedMonthChange: (monthKey: string) => void;
  onSelectedPayPeriodChange: (startDate: string) => void;
  onQuickAction: (action: QuickActionId, trigger: HTMLElement | null) => void;
  financialPeriodContext: UserFinancialPeriodContext;
}) {
  const monthInputRef = useRef<HTMLInputElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
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

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <PageHeader
      title="Dashboard"
      description={description}
      badge={<StatusBadge status={financialPeriodContext.hasConfigurationWarning ? 'warning' : 'info'} label={badgeLabel} />}
      compact
      className="items-start gap-2 md:gap-1.5 max-[480px]:gap-1.5 [&_.page-title]:text-[1.875rem] [&_.page-title]:font-800 md:[&_.page-title]:text-[1.72rem] lg:[&_.page-title]:text-[1.78rem] max-[480px]:[&_.page-title]:text-[1.45rem] [&_.page-subtitle]:mt-1 [&_.page-subtitle]:max-w-[34rem] [&_.page-subtitle]:text-sm [&_.page-subtitle]:leading-5 md:[&_.page-subtitle]:mt-0.5 md:[&_.page-subtitle]:text-[13px] md:[&_.page-subtitle]:leading-[1.35] max-[480px]:[&_.page-subtitle]:mt-0.5 max-[480px]:[&_.page-subtitle]:text-[13px] max-[480px]:[&_.page-subtitle]:leading-4 2xl:grid 2xl:grid-cols-[minmax(280px,1fr)_auto] 2xl:items-center"
      actionsClassName="w-full min-w-0 xl:w-[39rem] xl:flex-none 2xl:w-auto"
      actions={
        <div className="flex w-full flex-col gap-1.5 max-[480px]:gap-1.5 xl:items-end 2xl:flex-row 2xl:items-center 2xl:gap-2">
          <div className="order-1 flex w-full flex-wrap items-center justify-start gap-1 rounded-2xl border border-border/90 bg-card px-1 py-1 shadow-card md:gap-0.5 md:rounded-xl md:px-0.5 md:py-0.5 max-[480px]:gap-0.5 max-[480px]:rounded-[18px] xl:flex-nowrap xl:justify-end 2xl:order-2 2xl:w-auto 2xl:justify-start">
              <Tabs
                items={[
                  { id: 'pay_cycle', label: 'Pay period' },
                  { id: 'month', label: 'Month' },
                ]}
                activeId={viewMode}
                onChange={onViewModeChange}
                className="w-auto [&_.tab-button]:min-h-[2rem] [&_.tab-button]:px-2 [&_.tab-button]:py-1 [&_.tab-button]:text-[12px] [&_.tab-button]:leading-4 md:[&_.tab-button]:min-h-[1.875rem] md:[&_.tab-button]:px-1.5 md:[&_.tab-button]:text-[11px] max-[480px]:[&_.tab-button]:min-h-[1.875rem] max-[480px]:[&_.tab-button]:px-1.5 max-[480px]:[&_.tab-button]:text-[11px]"
              />
              <div className="hidden h-4 w-px bg-border/80 xl:block" />
              <div className="inline-flex min-w-0 items-center gap-0.5 rounded-xl bg-muted/35 px-0.5 py-0.5 md:rounded-lg max-[480px]:flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'month') {
                      onSelectedMonthChange(shiftMonthKey(monthContext.monthKey, -1));
                      return;
                    }
                    onSelectedPayPeriodChange(getPreviousFinancialPeriod(financialPeriodContext.effectiveConfig, activePeriod.startDate).startDate);
                  }}
                  className="btn-ghost min-h-0 rounded-lg p-0.5 md:rounded-md"
                  aria-label={viewMode === 'month' ? 'Previous month' : 'Previous pay period'}
                >
                  <ChevronLeft size={16} className="text-muted-foreground md:h-[15px] md:w-[15px]" />
                </button>
                {viewMode === 'month' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => monthInputRef.current?.showPicker?.() ?? monthInputRef.current?.click()}
                      className="flex h-8 min-w-0 items-center gap-1 rounded-lg px-1.5 hover:bg-card md:h-7 md:rounded-md md:px-1.25 max-[480px]:flex-1"
                      aria-label="Choose month"
                    >
                      <Calendar size={14} className="text-accent md:h-[13px] md:w-[13px]" />
                      <span className="truncate whitespace-nowrap text-[13px] font-700 text-foreground md:text-[12px] max-[480px]:text-[12px]">
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
                  <div className="flex h-8 min-w-0 items-center gap-1 rounded-lg px-1.5 md:h-7 md:rounded-md md:px-1.25 max-[480px]:flex-1">
                    <Calendar size={14} className="text-accent md:h-[13px] md:w-[13px]" />
                    <span className="truncate whitespace-nowrap text-[13px] font-700 text-foreground md:text-[12px] max-[480px]:text-[12px]">{activePeriod.label}</span>
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
                  className="btn-ghost min-h-0 rounded-lg p-0.5 md:rounded-md disabled:opacity-40"
                  aria-label={viewMode === 'month' ? 'Next month' : 'Next pay period'}
                  disabled={!canMoveNext}
                >
                  <ChevronRight size={16} className="text-muted-foreground md:h-[15px] md:w-[15px]" />
                </button>
              </div>
          </div>
          <div className="order-2 flex w-full items-center gap-1 overflow-x-auto rounded-2xl border border-border/90 bg-card px-1.5 py-1.5 shadow-card-md scrollbar-thin max-[480px]:justify-start max-[480px]:rounded-[18px] md:hidden 2xl:order-1 2xl:w-auto 2xl:flex-nowrap 2xl:overflow-visible">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                  className="inline-flex h-[30px] shrink-0 items-center gap-1 rounded-xl border border-transparent bg-transparent px-1.5 text-[12px] font-700 text-foreground transition-colors hover:border-border/80 hover:bg-muted/75 max-[480px]:h-8 max-[480px]:px-2 xl:text-[13px]"
                  aria-label={action.label}
                >
                  <Icon size={15} className="text-accent" />
                  <span>{action.label.replace('Add ', '')}</span>
                </button>
              );
            })}
          </div>
          <div className="order-2 hidden w-full items-center justify-end gap-1.5 md:flex 2xl:order-1 2xl:w-auto">
            {DIRECT_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border/80 bg-card px-2.5 text-[12px] font-700 text-foreground shadow-card-sm transition-colors hover:bg-muted/70 lg:h-[34px] lg:px-3 lg:text-[13px]"
                  aria-label={action.label}
                >
                  <Icon size={15} className="text-accent lg:h-4 lg:w-4" />
                  <span>{action.label.replace('Add ', '')}</span>
                </button>
              );
            })}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((value) => !value)}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-border/80 bg-card px-2.5 text-[12px] font-700 text-foreground shadow-card-sm transition-colors hover:bg-muted/70 lg:h-[34px] lg:px-3 lg:text-[13px]"
                aria-haspopup="menu"
                aria-expanded={moreOpen}
              >
                <span>More</span>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
              {moreOpen ? (
                <div
                  role="menu"
                  aria-label="More dashboard actions"
                  className="absolute end-0 top-full z-20 mt-2 flex min-w-[12rem] flex-col overflow-hidden rounded-xl border border-border bg-card p-1 shadow-card-lg"
                >
                  {MORE_ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        role="menuitem"
                        onClick={(event) => {
                          setMoreOpen(false);
                          onQuickAction(action.id, event.currentTarget);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-700 text-foreground transition-colors hover:bg-muted/70 lg:text-[13px]"
                      >
                        <Icon size={15} className="text-accent" />
                        <span>{action.label.replace('Add ', '')}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
          {financialPeriodContext.configurationWarning ? (
            <div className="w-full rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning md:rounded-xl md:px-2.5 md:py-1.5 max-[480px]:px-2.5 max-[480px]:py-2 lg:max-w-[520px]">
              {financialPeriodContext.configurationWarning}
            </div>
          ) : null}
        </div>
      }
    />
  );
}
