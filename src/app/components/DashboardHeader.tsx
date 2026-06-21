'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
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
  const { t } = useTranslation('portal');
  const { user } = useAuth();
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
  const directActions = quickActions.filter((action) => action.id === 'transaction' || action.id === 'account');
  const moreActions = quickActions.filter((action) => action.id === 'recurring' || action.id === 'reimbursement' || action.id === 'budget');
  const quickActionSubtitle = (actionId: 'transaction' | 'account' | 'more') =>
    t(`dashboardHeader.quickActionSubtitles.${actionId}`);

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
    <section className="space-y-3">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start xl:gap-5">
        <div className="min-w-0 space-y-1">
          <h1 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[2rem] font-800 tracking-[-0.03em] text-foreground max-[480px]:text-[1.55rem] xl:flex-nowrap">
            <span className="truncate">{greeting}</span>
            <span className="inline-flex shrink-0 items-center whitespace-nowrap">👋</span>
          </h1>
          <p className="text-sm text-muted-foreground md:text-[15px]">
            {description}
          </p>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(34rem,1fr)_18.75rem] lg:items-start xl:w-[54rem]">
          <div className="min-w-0 overflow-x-auto rounded-[26px] border border-border/80 bg-card px-2 py-2 shadow-card-sm scrollbar-thin lg:overflow-visible">
            <div className="grid min-w-[32rem] grid-cols-[minmax(9.4rem,1fr)_minmax(9.4rem,1fr)_minmax(11.1rem,1.18fr)] items-stretch divide-x divide-border/80 rtl:divide-x-reverse">
                {directActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                      className="group flex min-w-0 items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors hover:bg-muted/45"
                      aria-label={action.label}
                    >
                      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                        <Icon size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-700 text-foreground whitespace-nowrap">
                          {quickActionShortLabel(action.id)}
                        </span>
                        <span className="block text-[12.5px] leading-4 text-muted-foreground whitespace-nowrap">
                          {quickActionSubtitle(action.id as 'transaction' | 'account')}
                        </span>
                      </span>
                    </button>
                  );
                })}
                <div className="relative flex-1" ref={moreMenuRef}>
                  <button
                    type="button"
                    onClick={() => setMoreOpen((value) => !value)}
                    className="group flex h-full w-full min-w-0 items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors hover:bg-muted/45"
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-muted/70 text-foreground">
                      <Ellipsis size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-700 text-foreground whitespace-nowrap">
                        {t('dashboardHeader.more')}
                      </span>
                      <span className="block text-[12.5px] leading-4 text-muted-foreground whitespace-nowrap">
                        {quickActionSubtitle('more')}
                      </span>
                    </span>
                    <ChevronDown size={15} className={`text-muted-foreground transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {moreOpen ? (
                    <div
                      role="menu"
                      aria-label={t('dashboardHeader.moreActions')}
                      className="absolute end-0 top-full z-20 mt-2 flex min-w-[14rem] flex-col overflow-hidden rounded-2xl border border-border bg-card p-1.5 shadow-card-lg"
                    >
                      {moreActions.map((action) => {
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
                            className="inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-600 text-foreground transition-colors hover:bg-muted/70"
                          >
                            <Icon size={16} className="text-accent" />
                            <span>{quickActionShortLabel(action.id)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 rounded-[22px] border border-border/80 bg-card px-2.5 py-2.5 shadow-card-sm">
            <div className="overflow-hidden">
              <Tabs
                items={[
                  { id: 'pay_cycle', label: t('dashboardHeader.payPeriod') },
                  { id: 'month', label: t('dashboardHeader.month') },
                ]}
                activeId={viewMode}
                onChange={onViewModeChange}
                className="w-full [&_.tabs-root]:w-full [&_.tab-button]:min-h-[2.1rem] [&_.tab-button]:flex-1 [&_.tab-button]:rounded-[14px] [&_.tab-button]:px-2.5 [&_.tab-button]:py-1.5 [&_.tab-button]:text-[12px] [&_.tab-button]:font-700"
              />
            </div>
            <div className="flex items-center gap-1 rounded-2xl bg-muted/35 p-1">
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'month') {
                      onSelectedMonthChange(shiftMonthKey(monthContext.monthKey, -1));
                      return;
                    }
                    onSelectedPayPeriodChange(getPreviousFinancialPeriod(financialPeriodContext.effectiveConfig, activePeriod.startDate).startDate);
                  }}
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-card"
                  aria-label={viewMode === 'month' ? t('dashboardHeader.previousMonth') : t('dashboardHeader.previousPayPeriod')}
                >
                  <ChevronLeft size={16} />
                </button>
                {viewMode === 'month' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => monthInputRef.current?.showPicker?.() ?? monthInputRef.current?.click()}
                      className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 text-sm font-700 text-foreground transition-colors hover:bg-card"
                      aria-label={t('dashboardHeader.chooseMonth')}
                    >
                      <Calendar size={15} className="text-accent" />
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
                  <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 text-sm font-700 text-foreground">
                    <Calendar size={15} className="text-accent" />
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
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-card disabled:opacity-40"
                  aria-label={viewMode === 'month' ? t('dashboardHeader.nextMonth') : t('dashboardHeader.nextPayPeriod')}
                  disabled={!canMoveNext}
                >
                  <ChevronRight size={16} />
                </button>
            </div>
          </div>

          {financialPeriodContext.configurationWarning ? (
            <div className="w-full rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning lg:max-w-[32rem]">
              {financialPeriodContext.configurationWarning}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
