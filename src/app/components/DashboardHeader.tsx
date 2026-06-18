'use client';
import React, { useMemo, useRef } from 'react';
import { Calendar, ChevronLeft, ChevronRight, MoreHorizontal, PiggyBank, Plus, Repeat, RotateCcw, Wallet } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { getCurrentDashboardMonthKey, getDashboardMonthContext, shiftDashboardMonth } from '@/lib/finance';

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
  selectedMonth,
  onSelectedMonthChange,
  onQuickAction,
}: {
  selectedMonth: string;
  onSelectedMonthChange: (monthKey: string) => void;
  onQuickAction: (action: QuickActionId, trigger: HTMLElement | null) => void;
}) {
  const monthInputRef = useRef<HTMLInputElement | null>(null);
  const monthContext = useMemo(() => getDashboardMonthContext(selectedMonth), [selectedMonth]);
  const currentMonthKey = getCurrentDashboardMonthKey();
  const canMoveNext = monthContext.monthKey < currentMonthKey;

  return (
    <PageHeader
      title="Dashboard"
      description={`Your financial overview for ${monthContext.label}`}
      badge={<StatusBadge status="info" label="Live overview" />}
      actions={
        <div className="flex flex-col gap-3 xl:items-end">
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
                onClick={() => onSelectedMonthChange(shiftDashboardMonth(monthContext.monthKey, -1))}
                className="btn-ghost min-h-0 rounded-xl p-2"
                aria-label="Previous month"
              >
                <ChevronLeft size={15} className="text-muted-foreground" />
              </button>
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
                max={currentMonthKey}
                onChange={(event) => onSelectedMonthChange(event.target.value)}
                aria-label="Dashboard month"
              />
              <button
                type="button"
                onClick={() => {
                  if (!canMoveNext) return;
                  onSelectedMonthChange(shiftDashboardMonth(monthContext.monthKey, 1));
                }}
                className="btn-ghost min-h-0 rounded-xl p-2 disabled:opacity-40"
                aria-label="Next month"
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
