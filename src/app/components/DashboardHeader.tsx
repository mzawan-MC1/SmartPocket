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
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';

type QuickActionId = 'transaction' | 'account' | 'personal_subscription' | 'recurring' | 'reimbursement' | 'budget';

function getFirstName(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return '';
  const firstToken = normalized.split(/\s+/)[0];
  return firstToken || normalized;
}

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
  const { user, profile } = useAuth();
  const { dir, language } = useLanguage();
  const isArabic = language === 'ar';
  const monthInputRef = useRef<HTMLInputElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const monthContext = useMemo(
    () => getMonthContext(activePeriod.monthKey, financialPeriodContext.timezone, undefined, getIntlLocale(language)),
    [activePeriod.monthKey, financialPeriodContext.timezone, language]
  );
  const currentMonthContext = useMemo(
    () => getMonthContext(undefined, financialPeriodContext.timezone, undefined, getIntlLocale(language)),
    [financialPeriodContext.timezone, language]
  );
  const PreviousIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;
  const canMoveNext = viewMode === 'month'
    ? monthContext.monthKey < currentMonthContext.monthKey
    : activePeriod.endDate < financialPeriodContext.currentFinancialPeriod.endDate;
  const description = t('dashboardHeader.description', {
    period: activePeriod.label,
  });
  const registeredName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || t('topbar.userFallback');
  const firstName = getFirstName(registeredName) || registeredName;
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
  const greeting = t(greetingKey, { name: firstName }).replace(/\s*👋\s*$/, '');
  const quickActions = [
    { id: 'transaction' as QuickActionId, label: t('dashboardHeader.quickActions.transaction'), icon: Plus },
    { id: 'account' as QuickActionId, label: t('dashboardHeader.quickActions.account'), icon: Wallet },
    {
      id: 'personal_subscription' as QuickActionId,
      label: t('dashboardHeader.quickActions.personalSubscriptions'),
      icon: Calendar,
    },
    { id: 'recurring' as QuickActionId, label: t('dashboardHeader.quickActions.recurring'), icon: Repeat },
    { id: 'reimbursement' as QuickActionId, label: t('dashboardHeader.quickActions.reimbursement'), icon: RotateCcw },
    { id: 'budget' as QuickActionId, label: t('dashboardHeader.quickActions.budget'), icon: Target },
  ];
  const quickActionShortLabel = (actionId: QuickActionId) => {
    if (actionId === 'personal_subscription') {
      return t('dashboardHeader.quickActionShort.personalSubscriptions');
    }
    return t(`dashboardHeader.quickActionShort.${actionId}`);
  };
  const directActions = quickActions.filter((action) =>
    action.id === 'transaction' || action.id === 'account' || action.id === 'personal_subscription'
  );
  const moreActions = quickActions.filter((action) => action.id === 'recurring' || action.id === 'reimbursement' || action.id === 'budget');

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
    <section className="space-y-2">
      <div className="grid grid-cols-1 gap-2.5 md:gap-3 lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.98fr)] lg:items-start xl:grid-cols-[minmax(18rem,1.1fr)_minmax(22rem,0.96fr)_14.75rem] xl:items-start xl:gap-3">
        <div className="min-w-0 space-y-1.5 rounded-[20px] border border-transparent py-0.5">
          <h1 className={`flex items-center gap-x-1 gap-y-0 font-800 tracking-[-0.03em] text-foreground lg:text-[1.5rem] xl:flex-nowrap xl:text-[1.6rem] ${
            isArabic
              ? 'text-[1.08rem] leading-[1.3] max-[480px]:text-[1.06rem] max-[360px]:flex-wrap max-[360px]:text-[1rem]'
              : 'text-[1.04rem] max-[480px]:text-[0.98rem] max-[360px]:flex-wrap max-[360px]:text-[0.9rem]'
          }`}>
            <span className="min-w-0 whitespace-nowrap max-[360px]:whitespace-normal">{greeting}</span>
            <span className="inline-flex shrink-0 items-center whitespace-nowrap">👋</span>
          </h1>
          <p className={`max-w-[34rem] text-muted-foreground ${
            isArabic
              ? 'text-[12px] leading-5 md:text-[12.5px] md:leading-5 lg:text-[13px]'
              : 'text-[11px] leading-4 md:text-[12px] md:leading-[1.05rem] lg:text-[12.5px]'
          }`}>
            {description}
          </p>
        </div>

        <div className="min-w-0 rounded-[18px] border border-border/70 bg-card/90 px-1 py-1 shadow-card-sm">
          <div className="grid grid-cols-4 items-stretch gap-0.5">
            {directActions.map((action) => {
              const Icon = action.icon;
              const isSelected = activeQuickAction === action.id;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                  className={`group flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[12px] border border-transparent px-1.5 py-1.5 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-1 max-[480px]:px-1.5 max-[480px]:py-1.5 ${
                    isSelected
                      ? 'border-accent/20 bg-accent/10 text-accent shadow-[0_10px_24px_-20px_rgba(20,184,166,0.8)]'
                      : 'text-foreground/90 hover:border-border/60 hover:bg-muted/40'
                  }`}
                  aria-label={action.label}
                  aria-pressed={isSelected}
                >
                  <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg transition-colors max-[480px]:h-5.5 max-[480px]:w-5.5 ${
                    isSelected ? 'bg-accent/15 text-accent' : 'bg-muted/60 text-muted-foreground group-hover:bg-card group-hover:text-foreground'
                  }`}>
                    <Icon size={13} />
                  </span>
                  <span className={`line-clamp-2 min-h-[1.4rem] text-center font-700 ${
                    isArabic
                      ? 'text-[10.5px] leading-4 max-[480px]:text-[10px] max-[480px]:leading-3.5'
                      : 'text-[10px] leading-3.5 max-[480px]:text-[9.5px] max-[480px]:leading-3'
                  }`}>
                    {quickActionShortLabel(action.id)}
                  </span>
                </button>
              );
            })}
            <div className="relative" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((value) => !value)}
                className={`group flex h-full w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-[12px] border border-transparent px-1.5 py-1.5 text-center transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-1 max-[480px]:px-1.5 max-[480px]:py-1.5 ${
                  activeQuickAction === 'recurring' || activeQuickAction === 'reimbursement' || activeQuickAction === 'budget' || moreOpen
                    ? 'border-accent/20 bg-accent/10 text-accent shadow-[0_10px_24px_-20px_rgba(20,184,166,0.8)]'
                    : 'text-foreground/90 hover:border-border/60 hover:bg-muted/40'
                }`}
                aria-haspopup="menu"
                aria-expanded={moreOpen}
              >
                <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg transition-colors max-[480px]:h-5.5 max-[480px]:w-5.5 ${
                  activeQuickAction === 'recurring' || activeQuickAction === 'reimbursement' || activeQuickAction === 'budget' || moreOpen
                    ? 'bg-accent/15 text-accent'
                    : 'bg-muted/60 text-muted-foreground group-hover:bg-card group-hover:text-foreground'
                }`}>
                  <Ellipsis size={13} />
                </span>
                <span className={isArabic ? 'text-[10.5px] font-700 leading-4 max-[480px]:text-[10px]' : 'text-[10px] font-700 leading-3.5 max-[480px]:text-[9.5px]'}>
                  {t('dashboardHeader.more')}
                </span>
                <ChevronDown size={12} className={`flex-shrink-0 text-muted-foreground/90 transition-transform ${moreOpen ? 'rotate-180' : ''}`} />
              </button>
              {moreOpen ? (
                <div
                  role="menu"
                  aria-label={t('dashboardHeader.moreActions')}
                  className="absolute end-0 top-full z-20 mt-1.5 flex min-w-[12rem] flex-col overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-card-lg"
                >
                  {moreActions.map((action) => {
                    const Icon = action.icon;
                    const isSelected = activeQuickAction === action.id;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        role="menuitem"
                        onClick={(event) => {
                          setMoreOpen(false);
                          onQuickAction(action.id, event.currentTarget);
                        }}
                        className={`inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-600 transition-colors ${
                          isSelected ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-muted/70'
                        }`}
                      >
                        <Icon size={16} className={isSelected ? 'text-accent' : 'text-muted-foreground'} />
                        <span>{quickActionShortLabel(action.id)}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-1 rounded-[18px] border border-border/70 bg-card/90 px-1.5 py-1.5 shadow-card-sm">
          <div className="overflow-hidden">
            <Tabs
              items={[
                { id: 'pay_cycle', label: t('dashboardHeader.payPeriod') },
                { id: 'month', label: t('dashboardHeader.month') },
              ]}
              activeId={viewMode}
              onChange={onViewModeChange}
              className="w-full [&_.tabs-root]:w-full [&_.tab-button]:min-h-7 [&_.tab-button]:flex-1 [&_.tab-button]:rounded-xl [&_.tab-button]:px-2 [&_.tab-button]:py-0.5 [&_.tab-button]:text-[10px] [&_.tab-button]:font-700"
            />
          </div>
          <div className="flex items-center gap-0.5 rounded-xl bg-muted/30 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'month') {
                      onSelectedMonthChange(shiftMonthKey(monthContext.monthKey, -1));
                      return;
                    }
                    onSelectedPayPeriodChange(getPreviousFinancialPeriod(financialPeriodContext.effectiveConfig, activePeriod.startDate).startDate);
                  }}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card"
                  aria-label={viewMode === 'month' ? t('dashboardHeader.previousMonth') : t('dashboardHeader.previousPayPeriod')}
                >
                  <PreviousIcon size={15} />
                </button>
                {viewMode === 'month' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => monthInputRef.current?.showPicker?.() ?? monthInputRef.current?.click()}
                    className={`flex h-7 min-w-0 flex-1 items-center gap-1 rounded-lg px-2 font-700 text-foreground transition-colors hover:bg-card ${
                      isArabic ? 'text-[11.5px] leading-5' : 'text-[11px]'
                    }`}
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
                  <div className={`flex h-7 min-w-0 flex-1 items-center gap-1 rounded-lg px-2 font-700 text-foreground ${
                    isArabic ? 'text-[11.5px] leading-5' : 'text-[11px]'
                  }`}>
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
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card disabled:opacity-40"
                  aria-label={viewMode === 'month' ? t('dashboardHeader.nextMonth') : t('dashboardHeader.nextPayPeriod')}
                  disabled={!canMoveNext}
                >
                  <NextIcon size={15} />
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
