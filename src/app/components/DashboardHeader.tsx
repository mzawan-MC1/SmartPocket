'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Settings,
  User,
  Wallet,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Tabs from '@/components/ui/Tabs';
import NotificationBell from '@/components/NotificationBell';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import UserAvatar from '@/components/ui/UserAvatar';
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
import { getPreferredPointerDownEventName } from '@/lib/browser-compat';

type QuickActionId = 'transaction' | 'money_in' | 'money_out' | 'account' | 'personal_subscription' | 'recurring' | 'reimbursement' | 'budget';

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
  onQuickAction(action: QuickActionId, trigger: HTMLElement | null): void;
  activeQuickAction: QuickActionId | null;
  financialPeriodContext: UserFinancialPeriodContext;
}) {
  const { t } = useTranslation('portal');
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const { dir, language } = useLanguage();
  const router = useRouter();
  const isArabic = language === 'ar';
  const monthInputRef = useRef<HTMLInputElement | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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
  const headingFallback = t('dashboardHeader.title');
  const registeredName = authLoading
    ? ''
    : profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || '';
  const firstName = getFirstName(registeredName) || registeredName;
  const displayEmail = authLoading ? null : user?.email ?? null;
  const displayAvatarUrl = authLoading ? null : profile?.avatar_url ?? null;
  let headingText = headingFallback;

  if (firstName) {
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
    headingText = t(greetingKey, { name: firstName }).replace(/\s*ðŸ‘‹\s*$/, '');
  }

  const mobileHeadingText = headingText
    .replace(/,\s*/g, ' ')
    .replace(/!\s*$/, '')
    .trim();
  const quickActions = [
    { id: 'money_in' as QuickActionId, label: t('dashboardHeader.quickActions.moneyIn', { defaultValue: 'Money In' }), icon: ArrowDown },
    { id: 'money_out' as QuickActionId, label: t('dashboardHeader.quickActions.moneyOut', { defaultValue: 'Money Out' }), icon: ArrowUp },
    { id: 'account' as QuickActionId, label: t('dashboardHeader.quickActions.addAccount', { ns: 'portal', defaultValue: 'Add Account' }), icon: Wallet },
    {
      id: 'personal_subscription' as QuickActionId,
      label: t('dashboardHeader.quickActions.addSubscription', { ns: 'portal', defaultValue: 'Add Subscription' }),
      icon: Calendar,
    },
  ];
  const quickActionShortLabel = (actionId: QuickActionId) => {
    if (actionId === 'personal_subscription') {
      return t('dashboardHeader.quickActions.addSubscription', { ns: 'portal', defaultValue: 'Add Subscription' });
    }
    if (actionId === 'account') {
      return t('dashboardHeader.quickActions.addAccount', { ns: 'portal', defaultValue: 'Add Account' });
    }
    if (actionId === 'money_in') {
      return t('dashboardHeader.quickActions.moneyIn', { defaultValue: 'Money In' });
    }
    if (actionId === 'money_out') {
      return t('dashboardHeader.quickActions.moneyOut', { defaultValue: 'Money Out' });
    }
    return t(`dashboardHeader.quickActionShort.${actionId}`);
  };
  const directActions = quickActions;

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      router.push('/sign-up-login');
    } finally {
      setUserMenuOpen(false);
    }
  }, [router, signOut]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
      }
    };

    const pointerDownEvent = getPreferredPointerDownEventName();
    document.addEventListener(pointerDownEvent, handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener(pointerDownEvent, handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <section className="space-y-1.5">
      <div className="md:hidden space-y-3">
        <div className="flex items-start justify-between gap-1.5">
          <div className="min-w-0 flex-1">
            <h1
              className={`min-w-0 truncate whitespace-nowrap font-800 tracking-[-0.028em] text-foreground ${
                isArabic ? 'text-[20px] leading-[1.08] max-[380px]:text-[19px] max-[360px]:text-[18px]' : 'text-[20px] leading-[1.08] max-[380px]:text-[19px] max-[360px]:text-[18px]'
              }`}
              title={mobileHeadingText}
            >
              {mobileHeadingText}
            </h1>
            <p className={`mt-1 text-muted-foreground ${isArabic ? 'text-[14px] leading-5' : 'text-[14px] leading-5'}`}>
              {t('dashboardHeader.mobileSubtitle')}
            </p>
          </div>
          <div className="shrink-0">
            <div className="flex items-center gap-1">
              <div className="flex h-10 min-w-[50px] items-center justify-center rounded-full border border-slate-200/80 bg-white px-1 shadow-[0_10px_22px_-18px_rgba(15,23,42,0.24)] [&_button]:h-8 [&_button]:gap-1 [&_button]:rounded-full [&_button]:border [&_button]:border-slate-200 [&_button]:bg-slate-50 [&_button]:px-1.5 [&_button_svg]:h-[14px] [&_button_svg]:w-[14px]">
                <LanguageSwitcher variant="compact" theme="light" />
              </div>
              <div className="[&_.notification-bell-trigger]:flex [&_.notification-bell-trigger]:h-10 [&_.notification-bell-trigger]:w-10 [&_.notification-bell-trigger]:items-center [&_.notification-bell-trigger]:justify-center [&_.notification-bell-trigger]:rounded-full [&_.notification-bell-trigger]:border [&_.notification-bell-trigger]:border-slate-200/80 [&_.notification-bell-trigger]:bg-white [&_.notification-bell-trigger]:p-0 [&_.notification-bell-trigger]:shadow-[0_10px_22px_-18px_rgba(15,23,42,0.24)] [&_.notification-bell-trigger_svg]:h-[19px] [&_.notification-bell-trigger_svg]:w-[19px]">
                <NotificationBell />
              </div>
              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((value) => !value)}
                  className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-slate-200/80 bg-white p-0 shadow-[0_10px_22px_-18px_rgba(15,23,42,0.24)]"
                  aria-label={t('dashboardHeader.mobileProfileMenu', { defaultValue: 'Profile menu' })}
                  aria-expanded={userMenuOpen}
                >
                  <UserAvatar
                    fullName={registeredName}
                    email={displayEmail}
                    avatarUrl={displayAvatarUrl}
                    className="h-full w-full rounded-full text-[11px]"
                    textClassName="text-[11px]"
                    iconClassName="h-4 w-4"
                  />
                </button>

                {userMenuOpen ? (
                  <div className="absolute end-0 top-full z-40 mt-2 w-[min(14rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white py-1.5 shadow-[0_18px_36px_-24px_rgba(15,23,42,0.24)]">
                    <div className="border-b border-slate-200 px-3 py-2.5">
                      <p className="truncate text-sm font-700 text-foreground">{registeredName || headingFallback}</p>
                      {displayEmail ? <p className="truncate text-[11px] text-muted-foreground">{displayEmail}</p> : null}
                    </div>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-slate-50"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings size={15} className="text-muted-foreground" />
                      {t('topbar.settings')}
                    </Link>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-slate-50"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <User size={15} className="text-muted-foreground" />
                      {t('topbar.userMenu', { defaultValue: 'Profile' })}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm text-negative transition-colors hover:bg-negative-soft"
                    >
                      <LogOut size={15} />
                      {t('topbar.signOut')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {financialPeriodContext.configurationWarning ? (
          <div className="rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning">
            {financialPeriodContext.configurationWarning}
          </div>
        ) : null}
      </div>

      <div className="hidden grid-cols-1 gap-1 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-2 lg:gap-2.5 xl:grid-cols-[auto_minmax(0,1fr)_auto] xl:items-center xl:gap-3">
        <div className="min-w-0 md:space-y-1.5 md:max-w-none space-y-1.5 max-w-[22rem] rounded-[20px] border border-transparent py-0.5 xl:flex-none xl:space-y-1.5 xl:max-w-[22rem]">
          <h1 className={`flex items-center gap-x-1 gap-y-0 font-800 tracking-[-0.03em] text-foreground lg:text-[1.2rem] xl:flex-nowrap xl:text-[1.3rem] ${
            isArabic
              ? 'text-[1.02rem] leading-[1.3] max-[480px]:text-[1.06rem] max-[360px]:flex-wrap max-[360px]:text-[1rem]'
              : 'text-[0.98rem] max-[480px]:text-[0.98rem] max-[360px]:flex-wrap max-[360px]:text-[0.9rem]'
          }`}>
            <span className="min-w-0 whitespace-nowrap max-[360px]:whitespace-normal">{headingText}</span>
          </h1>
          <p className={`mt-0.5 max-w-[34rem] text-muted-foreground ${
            isArabic
              ? 'text-[12px] leading-5 md:text-[12.5px] md:leading-5 lg:text-[12.5px]'
              : 'text-[11px] leading-4 md:text-[12px] md:leading-[1.05rem] lg:text-[12.5px]'
          }`}>
            {description}
          </p>
          <div className="min-w-0 md:flex md:flex-wrap md:items-center md:gap-1.5 xl:hidden">
            {directActions.map((action) => {
              const Icon = action.icon;
              const isSelected = activeQuickAction === action.id;
              const isMoneyIn = action.id === 'money_in';
              const isMoneyOut = action.id === 'money_out';
              const isColored = isMoneyIn || isMoneyOut;
              return (
                <button
                  key={`md-${action.id}`}
                  type="button"
                  onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                  className={`inline-flex h-9 items-center whitespace-nowrap rounded-2xl px-3 text-[12.5px] font-700 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                    isMoneyIn
                      ? 'border border-positive/30 bg-positive text-white hover:bg-positive/90 active:bg-positive/80 focus-visible:ring-positive/50 shadow-[0_8px_20px_-12px_rgba(34,197,94,0.7)] gap-1.5'
                      : isMoneyOut
                        ? 'border border-negative/30 bg-negative text-white hover:bg-negative/90 active:bg-negative/80 focus-visible:ring-negative/50 shadow-[0_8px_20px_-12px_rgba(239,68,68,0.7)] gap-1.5'
                        : isSelected
                          ? 'border border-accent/20 bg-accent/10 text-accent shadow-sm shadow-[0_10px_24px_-20px_rgba(20,184,166,0.8)] focus-visible:ring-accent/35 gap-1.5'
                          : 'border border-border/70 bg-card text-foreground hover:bg-muted/50 focus-visible:ring-accent/35 shadow-sm gap-1.5'
                  }`}
                  aria-label={action.label}
                  aria-pressed={isSelected}
                >
                  <Icon size={14.5} className={`${isColored ? 'text-white' : ''} flex-shrink-0`} />
                  <span className="leading-none whitespace-nowrap">{quickActionShortLabel(action.id)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden xl:flex xl:justify-center">
          <div className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap xl:gap-1.5 xl:justify-center">
            {directActions.map((action) => {
              const Icon = action.icon;
              const isSelected = activeQuickAction === action.id;
              const isMoneyIn = action.id === 'money_in';
              const isMoneyOut = action.id === 'money_out';
              const isColored = isMoneyIn || isMoneyOut;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={(event) => onQuickAction(action.id, event.currentTarget)}
                  className={`inline-flex h-9 items-center whitespace-nowrap rounded-2xl px-3 text-[12.5px] font-700 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 xl:px-3 ${
                    isMoneyIn
                      ? 'border border-positive/30 bg-positive text-white hover:bg-positive/90 active:bg-positive/80 focus-visible:ring-positive/50 shadow-[0_8px_20px_-12px_rgba(34,197,94,0.7)] gap-1.5'
                      : isMoneyOut
                        ? 'border border-negative/30 bg-negative text-white hover:bg-negative/90 active:bg-negative/80 focus-visible:ring-negative/50 shadow-[0_8px_20px_-12px_rgba(239,68,68,0.7)] gap-1.5'
                        : isSelected
                          ? 'border border-accent/20 bg-accent/10 text-accent shadow-sm shadow-[0_10px_24px_-20px_rgba(20,184,166,0.8)] focus-visible:ring-accent/35 gap-1.5'
                          : 'border border-border/70 bg-card text-foreground hover:bg-muted/50 focus-visible:ring-accent/35 shadow-sm gap-1.5'
                  }`}
                  aria-label={action.label}
                  aria-pressed={isSelected}
                >
                  <Icon size={14.5} className={`${isColored ? 'text-white' : ''} flex-shrink-0`} />
                  <span className="leading-none whitespace-nowrap">{quickActionShortLabel(action.id)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="md:justify-self-end md:self-start xl:self-auto flex w-fit flex-none flex-col gap-0.5 rounded-[16px] border border-border/70 bg-card/90 px-0.5 py-0.5 shadow-card-sm">
          <div className="overflow-hidden w-fit px-0.5">
            <Tabs
              items={[
                { id: 'pay_cycle', label: t('dashboardHeader.payPeriod') },
                { id: 'month', label: t('dashboardHeader.month') },
              ]}
              activeId={viewMode}
              onChange={onViewModeChange}
              className="w-fit [&_.tabs-root]:w-fit [&_.tab-button]:min-h-[24px] [&_.tab-button]:rounded-lg [&_.tab-button]:px-2 [&_.tab-button]:py-0.5 [&_.tab-button]:text-[10px] [&_.tab-button]:font-700 [&_.tab-button]:whitespace-nowrap [&_.tab-button]:flex-none"
            />
          </div>
          <div className="flex items-center justify-center gap-0.5 rounded-lg bg-muted/30 p-0.5 w-fit self-center">
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'month') {
                      onSelectedMonthChange(shiftMonthKey(monthContext.monthKey, -1));
                      return;
                    }
                    onSelectedPayPeriodChange(getPreviousFinancialPeriod(financialPeriodContext.effectiveConfig, activePeriod.startDate).startDate);
                  }}
                  className="flex h-[24px] w-[24px] flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card"
                  aria-label={viewMode === 'month' ? t('dashboardHeader.previousMonth') : t('dashboardHeader.previousPayPeriod')}
                >
                  <PreviousIcon size={13} />
                </button>
                {viewMode === 'month' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => monthInputRef.current?.showPicker?.() ?? monthInputRef.current?.click()}
                    className={`flex h-6 items-center gap-1.5 rounded-md px-1.5 font-700 text-foreground transition-colors hover:bg-card whitespace-nowrap flex-none ${
                      isArabic ? 'text-[10.5px] leading-5' : 'text-[10px]'
                    }`}
                      aria-label={t('dashboardHeader.chooseMonth')}
                    >
                      <Calendar size={13} className="text-accent flex-shrink-0" />
                      <span className="whitespace-nowrap">{monthContext.label}</span>
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
                  <div className={`flex h-6 items-center gap-1.5 rounded-md px-1.5 font-700 text-foreground whitespace-nowrap flex-none ${
                    isArabic ? 'text-[10.5px] leading-5' : 'text-[10px]'
                  }`}>
                    <Calendar size={13} className="text-accent flex-shrink-0" />
                    <span className="whitespace-nowrap">{activePeriod.label}</span>
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
                  className="flex h-[24px] w-[24px] flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card disabled:opacity-40"
                  aria-label={viewMode === 'month' ? t('dashboardHeader.nextMonth') : t('dashboardHeader.nextPayPeriod')}
                  disabled={!canMoveNext}
                >
                  <NextIcon size={13} />
                </button>
          </div>
        </div>

        {financialPeriodContext.configurationWarning ? (
          <div className="md:col-span-full rounded-2xl border border-warning/30 bg-warning-soft/40 px-3 py-2 text-xs text-warning">
            {financialPeriodContext.configurationWarning}
          </div>
        ) : null}
      </div>
    </section>
  );
}
