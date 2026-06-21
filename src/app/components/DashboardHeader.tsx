'use client';
import React, { useMemo, useRef } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Repeat,
  RotateCcw,
  Target,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Tabs from '@/components/ui/Tabs';
import type { DashboardActivePeriod } from '@/lib/finance';
import {
  getMonthContext,
  getNextFinancialPeriod,
  getPreviousFinancialPeriod,
  shiftMonthKey,
  type DashboardPeriodPreference,
} from '@/lib/financial-periods';
import type { UserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import { useAuth } from '@/contexts/AuthContext';

type QuickActionId = 'transaction' | 'account' | 'recurring' | 'reimbursement' | 'budget';

export default function DashboardHeader({
  activePeriod,
  viewMode,
  onViewModeChange,
  onSelectedMonthChange,
  onSelectedPayPeriodChange,
  onQuickAction,
  activeQuickAction,
  financialPeriodContext,
}: {
  activePeriod: DashboardActivePeriod;
  viewMode: DashboardPeriodPreference;
  onViewModeChange: (mode: DashboardPeriodPreference) => void;
  onSelectedMonthChange: (monthKey: string) => void;
  onSelectedPayPeriodChange: (startDate: string) => void;
  onQuickAction: (action: QuickActionId, trigger: HTMLElement | null) => void;
  activeQuickAction: QuickActionId | null;
  financialPeriodContext: UserFinancialPeriodContext;
}) {
  const { t } = useTranslation('portal');
  const { user } = useAuth();
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
  const description = t('dashboardHeader.description', {
    period: activePeriod.label,
  });
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || t('topbar.userFallback');
  const currentHour = Number(new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: financialPeriodContext.timezone,
  }).format(new Date()));
  const greetingKey = currentHour < 12
    ? 'dashboardHeader.greeting.morning'
    : currentHour < 18
      ? 'dashboardHeader.greeting.afternoon'
      : 'dashboardHeader.greeting.evening';
  const greeting = t(greetingKey, { name: displayName }).replace(/\s*👋\s*$/, '');
  const quickActions = [
    { id: 'transaction' as QuickActionId, label: t('dashboardHeader.quickActions.transaction'), icon: Plus },
    { id: 'account' as QuickActionId, label: t('dashboardHeader.quickActions.account'), icon: Wallet },
    { id: 'recurring' as QuickActionId, label: t('dashboardHeader.quickActions.recurring'), icon: Repeat },
    { id: 'reimbursement' as QuickActionId, label: t('dashboardHeader.quickActions.reimbursement'), icon: RotateCcw },
    { id: 'budget' as QuickActionId, label: t('dashboardHeader.quickActions.budget'), icon: Target },
  ];
  const quickActionShortLabel = (actionId: QuickActionId) =>
    t(`dashboardHeader.quickActionShort.${actionId}`);

  return (
    <section className="space-y-2">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(34rem,1.45fr)] lg:items-center xl:grid-cols-[minmax(12rem,0.86fr)_minmax(36rem,1.6fr)_16.5rem] xl:gap-3">
        <div className="min-w-0 space-y-0.5">
          <h1 className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[1.68rem] font-800 tracking-[-0.03em] text-foreground max-[480px]:text-[1.55rem] xl:flex-nowrap xl:text-[1.78rem]">
            <span className="truncate">{greeting}</span>
            <span className="inline-flex shrink-0 items-center whitespace-nowrap">👋</span>
          </h1>
          <p className="text-[13px] leading-5 text-muted-foreground md:text-[14px]">
            {description}
          </p>
        </div>

        <div className="min-w-0 overflow-x-auto rounded-[22px] border border-border/80 bg-card px-1.5 py-1.5 shadow-card-sm scrollbar-thin lg:overflow-visible">
          <div className="grid min-w-[34rem] grid-cols-5 items-stretch gap-1">
            {quickActions.map((action) => {
              const Icon = action.icon;
              const isSelected = activeQuickAction === action.id;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                  className={`group flex min-w-0 items-center justify-center gap-2 rounded-[16px] border px-2.5 py-2 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 ${
                    isSelected
                      ? 'border-accent/25 bg-accent/10 text-accent shadow-[0_10px_24px_-18px_rgba(20,184,166,0.85)]'
                      : 'border-transparent text-foreground hover:border-border/80 hover:bg-muted/45'
                  }`}
                  aria-label={action.label}
                  aria-pressed={isSelected}
                >
                  <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl transition-colors ${
                    isSelected ? 'bg-accent/15 text-accent' : 'bg-muted/70 text-muted-foreground group-hover:bg-card group-hover:text-foreground'
                  }`}>
                    <Icon size={15} />
                  </span>
                  <span className="truncate whitespace-nowrap text-[12.5px] font-700 leading-4">
                    {quickActionShortLabel(action.id)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex w-full flex-col gap-1.5 rounded-[20px] border border-border/80 bg-card px-2 py-2 shadow-card-sm">
          <div className="overflow-hidden">
            <Tabs
              items={[
                { id: 'pay_cycle', label: t('dashboardHeader.payPeriod') },
                { id: 'month', label: t('dashboardHeader.month') },
              ]}
              activeId={viewMode}
              onChange={onViewModeChange}
              className="w-full [&_.tabs-root]:w-full [&_.tab-button]:min-h-8 [&_.tab-button]:flex-1 [&_.tab-button]:rounded-xl [&_.tab-button]:px-2 [&_.tab-button]:py-1 [&_.tab-button]:text-[11px] [&_.tab-button]:font-700"
            />
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-muted/35 p-1">
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'month') {
                      onSelectedMonthChange(shiftMonthKey(monthContext.monthKey, -1));
                      return;
                    }
                    onSelectedPayPeriodChange(getPreviousFinancialPeriod(financialPeriodContext.effectiveConfig, activePeriod.startDate).startDate);
                  }}
                  className="flex h-7.5 w-7.5 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card"
                  aria-label={viewMode === 'month' ? t('dashboardHeader.previousMonth') : t('dashboardHeader.previousPayPeriod')}
                >
                  <ChevronLeft size={15} />
                </button>
                {viewMode === 'month' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => monthInputRef.current?.showPicker?.() ?? monthInputRef.current?.click()}
                      className="flex h-7.5 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-[12px] font-700 text-foreground transition-colors hover:bg-card"
                      aria-label={t('dashboardHeader.chooseMonth')}
                    >
                      <Calendar size={14} className="text-accent" />
                      <span className="truncate whitespace-nowrap">{monthContext.label}</span>
                    </button>
                    <input
                      ref={monthInputRef}
                      type="month"
                      className="sr-only"
                      value={monthContext.monthKey}
                      max={currentMonthContext.monthKey}
                      onChange={(event) => onSelectedMonthChange(event.target.value)}
                      aria-label={t('dashboardHeader.dashboardMonth')}
                    />
                  </>
                ) : (
                  <div className="flex h-7.5 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-[12px] font-700 text-foreground">
                    <Calendar size={14} className="text-accent" />
                    <span className="truncate whitespace-nowrap">{activePeriod.label}</span>
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
                  className="flex h-7.5 w-7.5 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card disabled:opacity-40"
                  aria-label={viewMode === 'month' ? t('dashboardHeader.nextMonth') : t('dashboardHeader.nextPayPeriod')}
                  disabled={!canMoveNext}
                >
                  <ChevronRight size={15} />
                </button>
          </div>
        </div>

        {financialPeriodContext.configurationWarning ? (
          <div className="lg:col-span-full rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning">
            {financialPeriodContext.configurationWarning}
          </div>
        ) : null}
      </div>
    </section>
  );
}
