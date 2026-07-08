 'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import DashboardHeader from '@/app/components/DashboardHeader';
import DashboardMetrics from '@/app/components/DashboardMetrics';
import DashboardCharts from '@/app/components/DashboardCharts';
import Modal from '@/components/ui/Modal';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import type { DashboardActivePeriod } from '@/lib/finance';
import { toast } from 'sonner';
import {
  formatCalendarMonthLabel,
  formatFinancialPeriodLabel,
  getMonthContext,
  getPeriodContainingDate,
  type DashboardPeriodPreference,
} from '@/lib/financial-periods';
import {
  clearFinancialPeriodProfileCache,
  loadUserFinancialPeriodContext,
  type UserFinancialPeriodContext,
} from '@/lib/financial-periods/profile';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';
import { useAuth } from '@/contexts/AuthContext';
import { ChartSkeleton, KPICardSkeleton, ListItemSkeleton, SectionCardSkeleton } from '@/components/ui/LoadingSkeleton';
import { clearResolvedUserDefaultCurrencyCache } from '@/lib/currency-totals';


const AIUsageCardLazy = dynamic(() => import('@/app/components/AIUsageCard'), {
  loading: () => <SectionCardSkeleton lines={3} className="h-full" />,
});
const RecentTransactionsLazy = dynamic(() => import('@/app/components/RecentTransactions'), {
  loading: () => <SectionCardSkeleton lines={4} className="h-full md:col-span-2 xl:col-span-1" />,
});
const AccountBalancesLazy = dynamic(() => import('@/app/components/AccountBalances'), {
  loading: () => <SectionCardSkeleton lines={4} className="h-full" />,
});
const UpcomingRecurringLazy = dynamic(() => import('@/app/components/UpcomingRecurring'), {
  loading: () => <SectionCardSkeleton lines={4} className="h-full" />,
});
const UpcomingPersonalSubscriptionsLazy = dynamic(() => import('@/app/components/UpcomingPersonalSubscriptions'), {
  loading: () => <SectionCardSkeleton lines={4} className="h-full md:col-span-2 lg:col-span-1" />,
});
const PeopleDashboardWidgetLazy = dynamic(() => import('@/app/components/PeopleDashboardWidget'), {
  loading: () => <SectionCardSkeleton lines={4} className="h-full" />,
});
const ReceiptInsightsCardLazy = dynamic(() => import('@/app/components/ReceiptInsightsCard'), {
  loading: () => <SectionCardSkeleton lines={4} className="h-full" />,
});
const AddTransactionModalLazy = dynamic(() => import('@/app/transactions/components/AddTransactionModal'));
const FinancialAccountFormLazy = dynamic(() => import('@/app/financial-accounts/components/FinancialAccountForm'), {
  loading: () => <DashboardQuickActionFallback />,
});
const RecurringTransactionFormLazy = dynamic(() => import('@/app/recurring/components/RecurringTransactionForm'), {
  loading: () => <DashboardQuickActionFallback />,
});
const AddBudgetFormLazy = dynamic(() => import('@/app/budgets/components/AddBudgetForm'), {
  loading: () => <DashboardQuickActionFallback />,
});
const CreateReimbursementFormLazy = dynamic(() => import('@/app/reimbursements/components/CreateReimbursementForm'), {
  loading: () => <DashboardQuickActionFallback />,
});
const PersonalSubscriptionFormLazy = dynamic(() => import('@/app/personal-subscriptions/components/PersonalSubscriptionForm'), {
  loading: () => <DashboardQuickActionFallback />,
});

function buildMonthActivePeriod(monthKey: string, timezone: string, locale?: string): DashboardActivePeriod {
  const monthContext = getMonthContext(monthKey, timezone, undefined, locale);
  return {
    mode: 'month',
    startDate: monthContext.startDate,
    endDate: monthContext.endDate,
    label: formatCalendarMonthLabel(monthContext.startDate, locale),
    isCurrent: monthContext.isCurrentMonth,
    timezone,
    monthKey: monthContext.monthKey,
  };
}

function buildPayPeriodActivePeriod(startDate: string, context: UserFinancialPeriodContext, locale?: string): DashboardActivePeriod {
  const period = getPeriodContainingDate(context.effectiveConfig, startDate);
  const currentPeriod = context.currentFinancialPeriod;
  const clampedPeriod = period.endDate > currentPeriod.endDate ? currentPeriod : period;
  return {
    mode: 'pay_cycle',
    startDate: clampedPeriod.startDate,
    endDate: clampedPeriod.endDate,
    label: formatFinancialPeriodLabel(clampedPeriod, locale),
    isCurrent: clampedPeriod.startDate === currentPeriod.startDate && clampedPeriod.endDate === currentPeriod.endDate,
    timezone: context.timezone,
  };
}

function DashboardQuickActionFallback() {
  return (
    <div className="space-y-3 py-1">
      <div className="skeleton h-10 w-full rounded-xl" />
      <div className="skeleton h-10 w-full rounded-xl" />
      <div className="skeleton h-24 w-full rounded-2xl" />
    </div>
  );
}

const DASHBOARD_VIEW_STORAGE_KEY = 'smartpocket.dashboard.view';
const DASHBOARD_MONTH_STORAGE_KEY = 'smartpocket.dashboard.month';
const DASHBOARD_PAY_PERIOD_STORAGE_KEY = 'smartpocket.dashboard.pay-period-start';
const DASHBOARD_REVALIDATE_DEBOUNCE_MS = 1500;
const DASHBOARD_SLOW_LOAD_MS = 5000;

// #region debug-point B:dashboard-bootstrap-report
function reportDashboardFirstLoadEvent(payload: Record<string, unknown>) {
  try {
    if (process.env.NEXT_PUBLIC_SP_DEBUG !== '1') return;
    if (typeof window === 'undefined') return;

    const url =
      process.env.NEXT_PUBLIC_SP_DEBUG_URL
      || `http://${window.location.hostname}:7777/event`;
    if (!url) return;

    const body = JSON.stringify({
      sessionId: 'dashboard-first-load',
      runId: 'pre-fix',
      hypothesisId: 'B',
      ts: Date.now(),
      source: 'dashboard/page',
      ...payload,
    });

    if ('sendBeacon' in navigator) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }

    void fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {}
}
// #endregion

function readDashboardSessionStorage(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeDashboardSessionStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore sessionStorage failures so the dashboard can still render.
  }
}

function useMinWidth(minWidth: number) {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia(`(min-width: ${minWidth}px)`);
    const updateMatch = () => setMatches(mediaQuery.matches);

    updateMatch();
    mediaQuery.addEventListener('change', updateMatch);
    return () => {
      mediaQuery.removeEventListener('change', updateMatch);
    };
  }, [minWidth]);

  return matches;
}

function useDeferredMount(enabled = true, rootMargin = '700px 0px') {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shouldMount, setShouldMount] = useState(!enabled);

  useEffect(() => {
    if (!enabled || shouldMount) {
      if (!shouldMount) {
        setShouldMount(true);
      }
      return;
    }

    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setShouldMount(true);
      return;
    }

    const target = ref.current;
    if (!target) {
      setShouldMount(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShouldMount(true);
        observer.disconnect();
      }
    }, { rootMargin });

    observer.observe(target);
    return () => {
      observer.disconnect();
    };
  }, [enabled, rootMargin, shouldMount]);

  return { ref, shouldMount };
}

export default function DashboardPage() {
  const { t } = useTranslation('portal');
  const { language } = useLanguage();
  const { loading: authLoading, user } = useAuth();
  const dashboardLocale = getIntlLocale(language);
  const [periodContext, setPeriodContext] = useState<UserFinancialPeriodContext | null>(null);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [periodLoadError, setPeriodLoadError] = useState<string | null>(null);
  const [showSlowLoadState, setShowSlowLoadState] = useState(false);
  const [viewMode, setViewMode] = useState<DashboardPeriodPreference | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedPayPeriodStart, setSelectedPayPeriodStart] = useState('');
  const [activeQuickAction, setActiveQuickAction] = useState<'transaction' | 'account' | 'personal_subscription' | 'recurring' | 'reimbursement' | 'budget' | null>(null);
  const [lastTrigger, setLastTrigger] = useState<HTMLElement | null>(null);
  const isMdUp = useMinWidth(768);
  const isXlUp = useMinWidth(1280);
  const firstLowerGrid = useDeferredMount(true, '650px 0px');
  const secondLowerGrid = useDeferredMount(true, '900px 0px');
  const latestPeriodRequestRef = useRef(0);
  const lastLifecycleRevalidationRef = useRef(0);

  const loadPeriodContext = useCallback(async (options?: { forceRefresh?: boolean; surfaceToast?: boolean }) => {
    const requestId = latestPeriodRequestRef.current + 1;
    latestPeriodRequestRef.current = requestId;
    setPeriodLoading(true);
    setPeriodLoadError(null);
    setShowSlowLoadState(false);
    // #region debug-point B:dashboard-load-start
    reportDashboardFirstLoadEvent({
      location: 'dashboard/page.tsx:loadPeriodContext:start',
      msg: '[DEBUG] dashboard period context load started',
      data: {
        requestId,
        forceRefresh: Boolean(options?.forceRefresh),
        surfaceToast: Boolean(options?.surfaceToast),
        hasUserId: Boolean(user?.id),
      },
    });
    // #endregion

    const slowLoadTimer = window.setTimeout(() => {
      if (latestPeriodRequestRef.current === requestId) {
        setShowSlowLoadState(true);
        // #region debug-point B:dashboard-slow-load
        reportDashboardFirstLoadEvent({
          location: 'dashboard/page.tsx:loadPeriodContext:slow-load',
          msg: '[DEBUG] dashboard period context load crossed slow-load threshold',
          data: {
            requestId,
            hasPeriodContext: Boolean(periodContext),
            hasViewMode: Boolean(viewMode),
          },
        });
        // #endregion
      }
    }, DASHBOARD_SLOW_LOAD_MS);

    try {
      if (options?.forceRefresh) {
        clearFinancialPeriodProfileCache();
        clearResolvedUserDefaultCurrencyCache();
      }
      const nextContext = await loadUserFinancialPeriodContext({
        userId: user?.id ?? null,
      });
      if (latestPeriodRequestRef.current !== requestId) return;
      setPeriodContext(nextContext);
      // #region debug-point B:dashboard-load-success
      reportDashboardFirstLoadEvent({
        location: 'dashboard/page.tsx:loadPeriodContext:success',
        msg: '[DEBUG] dashboard period context load succeeded',
        data: {
          requestId,
          defaultDashboardPeriod: nextContext.defaultDashboardPeriod,
          hasConfigurationWarning: nextContext.hasConfigurationWarning,
        },
      });
      // #endregion
    } catch (error) {
      if (latestPeriodRequestRef.current !== requestId) return;
      console.error(error);
      setPeriodLoadError(t('shared.dashboardLoadFailedDescription'));
      // #region debug-point B:dashboard-load-error
      reportDashboardFirstLoadEvent({
        location: 'dashboard/page.tsx:loadPeriodContext:error',
        msg: '[DEBUG] dashboard period context load failed',
        data: {
          requestId,
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      // #endregion
      if (options?.surfaceToast) {
        toast.error(t('shared.dashboardLoadFailedDescription'));
      }
    } finally {
      window.clearTimeout(slowLoadTimer);
      if (latestPeriodRequestRef.current === requestId) {
        setPeriodLoading(false);
        // #region debug-point B:dashboard-load-finally
        reportDashboardFirstLoadEvent({
          location: 'dashboard/page.tsx:loadPeriodContext:finally',
          msg: '[DEBUG] dashboard period context load finished',
          data: {
            requestId,
          },
        });
        // #endregion
      }
    }
  }, [periodContext, t, user?.id, viewMode]);

  useEffect(() => {
    if (authLoading) return;
    // #region debug-point B:dashboard-auth-ready
    reportDashboardFirstLoadEvent({
      location: 'dashboard/page.tsx:auth-ready-effect',
      msg: '[DEBUG] dashboard auth-ready effect fired',
      data: {
        authLoading,
        hasUserId: Boolean(user?.id),
      },
    });
    // #endregion
    void loadPeriodContext({ forceRefresh: true });
  }, [authLoading, user?.id, loadPeriodContext]);

  useEffect(() => {
    if (authLoading || !user?.id) return;
    void fetch('/api/financial-accounts/ensure-defaults', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  }, [authLoading, user?.id]);

  useSmartPocketDataChanged(['profile'], 'DashboardPagePeriodContext', async () => {
    await loadPeriodContext({ forceRefresh: true });
  });

  const revalidateFromLifecycle = useCallback((forceRefresh = false) => {
    if (authLoading) return;

    const coreReady = Boolean(periodContext && viewMode);
    if (coreReady && !periodLoadError && !showSlowLoadState && !periodLoading && !forceRefresh) {
      return;
    }

    const now = Date.now();
    if (now - lastLifecycleRevalidationRef.current < DASHBOARD_REVALIDATE_DEBOUNCE_MS) {
      return;
    }
    lastLifecycleRevalidationRef.current = now;
    void loadPeriodContext({ forceRefresh: true });
  }, [authLoading, loadPeriodContext, periodContext, periodLoadError, periodLoading, showSlowLoadState, viewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted || !periodContext || !viewMode || periodLoadError) {
        revalidateFromLifecycle(true);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!periodContext || !viewMode || periodLoadError || periodLoading)) {
        revalidateFromLifecycle();
      }
    };

    const handleFocus = () => {
      if (!document.hidden && (!periodContext || !viewMode || periodLoadError || periodLoading)) {
        revalidateFromLifecycle();
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [periodContext, periodLoadError, periodLoading, revalidateFromLifecycle, viewMode]);

  useEffect(() => {
    if (!periodContext) return;

    const savedMode = readDashboardSessionStorage(DASHBOARD_VIEW_STORAGE_KEY);
    const nextViewMode = savedMode === 'pay_cycle' || savedMode === 'month'
      ? savedMode
      : periodContext.defaultDashboardPeriod;
    const currentMonthKey = getMonthContext(undefined, periodContext.timezone).monthKey;
    const storedMonthKey = readDashboardSessionStorage(DASHBOARD_MONTH_STORAGE_KEY) || currentMonthKey;
    const normalizedMonthKey = getMonthContext(storedMonthKey, periodContext.timezone).monthKey;
    const storedPayPeriodStart = readDashboardSessionStorage(DASHBOARD_PAY_PERIOD_STORAGE_KEY) || periodContext.currentFinancialPeriod.startDate;
    const normalizedPayPeriod = buildPayPeriodActivePeriod(storedPayPeriodStart, periodContext, dashboardLocale);

    setViewMode((current) => current || nextViewMode);
    setSelectedMonth((current) => current || normalizedMonthKey);
    setSelectedPayPeriodStart((current) => current || normalizedPayPeriod.startDate);
    // #region debug-point B:dashboard-view-init
    reportDashboardFirstLoadEvent({
      location: 'dashboard/page.tsx:periodContext-effect',
      msg: '[DEBUG] dashboard period context initialized local view state',
      data: {
        nextViewMode,
        normalizedMonthKey,
        normalizedPayPeriodStart: normalizedPayPeriod.startDate,
      },
    });
    // #endregion
  }, [periodContext]);

  useEffect(() => {
    if (!viewMode) return;
    writeDashboardSessionStorage(DASHBOARD_VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!selectedMonth) return;
    writeDashboardSessionStorage(DASHBOARD_MONTH_STORAGE_KEY, selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    if (!selectedPayPeriodStart) return;
    writeDashboardSessionStorage(DASHBOARD_PAY_PERIOD_STORAGE_KEY, selectedPayPeriodStart);
  }, [selectedPayPeriodStart]);

  const closeQuickAction = useCallback(() => {
    setActiveQuickAction(null);
    window.requestAnimationFrame(() => {
      lastTrigger?.focus();
    });
  }, [lastTrigger]);

  const openQuickAction = useCallback((
    action: 'transaction' | 'account' | 'personal_subscription' | 'recurring' | 'reimbursement' | 'budget',
    trigger: HTMLElement | null
  ) => {
    setLastTrigger(trigger);
    setActiveQuickAction(action);
  }, []);

  const activePeriod = React.useMemo<DashboardActivePeriod | null>(() => {
    if (!periodContext || !viewMode) return null;
    if (viewMode === 'month') {
      return buildMonthActivePeriod(
        selectedMonth || getMonthContext(undefined, periodContext.timezone).monthKey,
        periodContext.timezone,
        dashboardLocale
      );
    }
    return buildPayPeriodActivePeriod(
      selectedPayPeriodStart || periodContext.currentFinancialPeriod.startDate,
      periodContext,
      dashboardLocale
    );
  }, [dashboardLocale, periodContext, selectedMonth, selectedPayPeriodStart, viewMode]);

  const handleSelectedMonthChange = useCallback((monthKey: string) => {
    if (!periodContext) return;
    setSelectedMonth(getMonthContext(monthKey, periodContext.timezone).monthKey);
  }, [periodContext]);

  const handleViewModeChange = useCallback((nextMode: DashboardPeriodPreference) => {
    if (!periodContext) return;
    setViewMode(nextMode);
    if (nextMode === 'month') {
      setSelectedMonth((current) => current || getMonthContext(undefined, periodContext.timezone).monthKey);
      return;
    }
    setSelectedPayPeriodStart((current) => current || periodContext.currentFinancialPeriod.startDate);
  }, [periodContext]);

  const handlePayPeriodChange = useCallback((startDate: string) => {
    if (!periodContext) return;
    setSelectedPayPeriodStart(buildPayPeriodActivePeriod(startDate, periodContext, dashboardLocale).startDate);
  }, [dashboardLocale, periodContext]);

  const showDesktopRightRail = isXlUp === true;
  const coreReady = Boolean(periodContext && activePeriod && viewMode);
  const showLoadFallback = !authLoading && !coreReady && (!periodLoading || showSlowLoadState);
  const readyPeriodContext = coreReady ? periodContext : null;
  const readyActivePeriod = coreReady ? activePeriod : null;
  const readyViewMode = coreReady ? viewMode : null;

  useEffect(() => {
    // #region debug-point B:dashboard-core-ready-state
    reportDashboardFirstLoadEvent({
      location: 'dashboard/page.tsx:core-ready-state',
      msg: '[DEBUG] dashboard core readiness changed',
      data: {
        authLoading,
        periodLoading,
        showSlowLoadState,
        hasPeriodContext: Boolean(periodContext),
        hasActivePeriod: Boolean(activePeriod),
        hasViewMode: Boolean(viewMode),
        coreReady,
        hasPeriodLoadError: Boolean(periodLoadError),
      },
    });
    // #endregion
  }, [activePeriod, authLoading, coreReady, periodContext, periodLoadError, periodLoading, showSlowLoadState, viewMode]);

  return (
    <AppLayout activeRoute="/dashboard">
      <div className="page-section gap-3.5 md:gap-4 lg:gap-5 max-[480px]:gap-3">
        {!coreReady ? (
          showLoadFallback ? (
            <div className="section-card">
              <div className="section-card-body flex min-h-[260px] flex-col items-center justify-center gap-3 text-center">
                <div className="space-y-2">
                  <h2 className="text-lg font-800 text-foreground">
                    {showSlowLoadState
                      ? t('shared.dashboardSlowLoadTitle')
                      : t('shared.dashboardLoadFailedTitle')}
                  </h2>
                  <p className="mx-auto max-w-md text-sm text-muted-foreground">
                    {showSlowLoadState
                      ? t('shared.dashboardSlowLoadDescription')
                      : periodLoadError || t('shared.dashboardLoadFailedDescription')}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary h-10 px-4 text-sm"
                  onClick={() => {
                    setShowSlowLoadState(false);
                    void loadPeriodContext({ forceRefresh: true, surfaceToast: true });
                  }}
                >
                  <RotateCcw size={15} />
                  {t('shared.tryAgain')}
                </button>
              </div>
            </div>
          ) : (
          <div className="space-y-4 md:space-y-5 lg:space-y-5 max-[480px]:space-y-3">
            <SectionCardSkeleton lines={2} />
            <div className="grid grid-cols-1 items-start gap-4 md:gap-5 md:grid-cols-12 xl:grid-cols-[minmax(0,8.35fr)_minmax(20rem,3.65fr)]">
              <div className="grid grid-cols-2 gap-3 max-[340px]:grid-cols-1 md:col-span-12 md:grid-cols-4 lg:grid-cols-3 xl:col-[1]">
                {Array.from({ length: 6 }).map((_, index) => (
                  <KPICardSkeleton key={`dashboard-kpi-skeleton-${index + 1}`} />
                ))}
              </div>
              <div className="hidden md:col-span-12 md:block xl:col-[2] xl:row-span-2 xl:row-start-1 xl:self-start">
                <div className="space-y-4 xl:w-[108%] xl:max-w-[23rem]">
                  <SectionCardSkeleton lines={3} className="h-full" />
                  <div className="hidden xl:block">
                    <SectionCardSkeleton lines={4} className="h-full" />
                  </div>
                </div>
              </div>
              <div className="md:col-span-12 xl:col-[1]">
                <div className="section-card">
                  <div className="section-card-header">
                    <div className="space-y-2">
                      <div className="h-5 w-40 rounded-lg bg-muted" />
                      <div className="h-3 w-56 rounded-lg bg-muted" />
                    </div>
                  </div>
                  <div className="section-card-body">
                    <ChartSkeleton height={300} />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-4">
              <SectionCardSkeleton lines={4} className="h-full md:col-span-2 xl:col-span-1" />
              {Array.from({ length: 2 }).map((_, index) => (
                <SectionCardSkeleton key={`dashboard-mid-skeleton-${index + 1}`} lines={4} className="h-full" />
              ))}
            </div>
              <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3 lg:gap-4 xl:grid-cols-2">
                <div className="section-card md:col-span-2 lg:col-span-1 xl:hidden">
                <div className="section-card-header">
                  <div className="space-y-2">
                    <div className="h-5 w-40 rounded-lg bg-muted" />
                    <div className="h-3 w-52 rounded-lg bg-muted" />
                  </div>
                </div>
                <div className="section-card-body p-0">
                  <ListItemSkeleton count={4} />
                </div>
              </div>
              <SectionCardSkeleton lines={4} className="h-full" />
              <SectionCardSkeleton lines={4} className="h-full" />
            </div>
          </div>
          )
        ) : (
          <>
            <DashboardHeader
              activePeriod={readyActivePeriod!}
              viewMode={readyViewMode!}
              onViewModeChange={handleViewModeChange}
              onSelectedMonthChange={handleSelectedMonthChange}
              onSelectedPayPeriodChange={handlePayPeriodChange}
              onQuickAction={openQuickAction}
              activeQuickAction={activeQuickAction}
              financialPeriodContext={readyPeriodContext!}
            />
            <div className="space-y-4 md:space-y-5 lg:space-y-5 max-[480px]:space-y-3">
              <div className="grid grid-cols-1 items-start gap-4 md:gap-5 md:grid-cols-12 xl:grid-cols-[minmax(0,8.35fr)_minmax(20rem,3.65fr)]">
                <div className="md:col-span-12 xl:col-[1]">
                  <DashboardMetrics activePeriod={readyActivePeriod!} hasConfigurationWarning={readyPeriodContext!.hasConfigurationWarning} />
                </div>
                <div className="hidden md:block md:col-span-12 xl:col-[2] xl:row-span-2 xl:row-start-1 xl:self-start">
                  <div className="space-y-4 xl:w-[108%] xl:max-w-[23rem]">
                    {isMdUp
                      ? <AIUsageCardLazy />
                      : <SectionCardSkeleton lines={3} className="h-full" />
                    }
                    {showDesktopRightRail ? (
                      <UpcomingPersonalSubscriptionsLazy activePeriod={readyActivePeriod!} compact />
                    ) : null}
                  </div>
                </div>
                <div className="md:col-span-12 xl:col-[1]">
                  <DashboardCharts activePeriod={readyActivePeriod!} hasConfigurationWarning={readyPeriodContext!.hasConfigurationWarning} />
                </div>
              </div>
              <div ref={firstLowerGrid.ref} className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-3 xl:gap-4">
                {firstLowerGrid.shouldMount ? (
                  <>
                    <div className="md:col-span-2 xl:col-span-1">
                      <RecentTransactionsLazy />
                    </div>
                    <div>
                      <UpcomingRecurringLazy activePeriod={readyActivePeriod!} />
                    </div>
                    <div>
                      <AccountBalancesLazy />
                    </div>
                  </>
                ) : (
                  <>
                    <SectionCardSkeleton lines={4} className="h-full md:col-span-2 xl:col-span-1" />
                    <SectionCardSkeleton lines={4} className="h-full" />
                    <SectionCardSkeleton lines={4} className="h-full" />
                  </>
                )}
              </div>
              <div ref={secondLowerGrid.ref} className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-3 lg:gap-4 xl:grid-cols-2">
                {secondLowerGrid.shouldMount ? (
                  <>
                    {!showDesktopRightRail ? (
                      <div className="h-full md:col-span-2 lg:col-span-1 xl:hidden">
                        <UpcomingPersonalSubscriptionsLazy activePeriod={readyActivePeriod!} />
                      </div>
                    ) : null}
                    <div className="h-full">
                      <PeopleDashboardWidgetLazy />
                    </div>
                    <div className="h-full">
                      <ReceiptInsightsCardLazy activePeriod={readyActivePeriod!} />
                    </div>
                  </>
                ) : (
                  <>
                    {!showDesktopRightRail ? (
                      <SectionCardSkeleton lines={4} className="h-full md:col-span-2 lg:col-span-1 xl:hidden" />
                    ) : null}
                    <SectionCardSkeleton lines={4} className="h-full" />
                    <SectionCardSkeleton lines={4} className="h-full" />
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {activeQuickAction === 'transaction' ? (
          <AddTransactionModalLazy
            isOpen
            onClose={closeQuickAction}
            initialMode="single"
          />
        ) : null}

        {activeQuickAction === 'account' ? (
          <Modal
            isOpen
            onClose={closeQuickAction}
            title={t('dashboardHeader.quickActions.account')}
            size="md"
          >
            <FinancialAccountFormLazy onSuccess={closeQuickAction} onCancel={closeQuickAction} />
          </Modal>
        ) : null}

        {activeQuickAction === 'personal_subscription' ? (
          <Modal
            isOpen
            onClose={closeQuickAction}
            title={t('personalSubscriptions.newTitle')}
            size="lg"
          >
            <PersonalSubscriptionFormLazy
              onSuccess={() => closeQuickAction()}
              onCancel={closeQuickAction}
            />
          </Modal>
        ) : null}

        {activeQuickAction === 'recurring' ? (
          <Modal
            isOpen
            onClose={closeQuickAction}
            title={t('dashboardHeader.quickActions.recurring')}
            size="md"
          >
            <RecurringTransactionFormLazy onSuccess={closeQuickAction} onCancel={closeQuickAction} />
          </Modal>
        ) : null}

        {activeQuickAction === 'budget' ? (
          <Modal
            isOpen
            onClose={closeQuickAction}
            title={t('dashboardHeader.quickActions.budget')}
            size="md"
          >
            <AddBudgetFormLazy
              onSuccess={() => {
                toast.success(t('budgets.addSuccess'));
                closeQuickAction();
              }}
              onCancel={closeQuickAction}
            />
          </Modal>
        ) : null}

        {activeQuickAction === 'reimbursement' ? (
          <Modal
            isOpen
            onClose={closeQuickAction}
            title={t('dashboardHeader.quickActions.reimbursement')}
            size="md"
          >
            <CreateReimbursementFormLazy onSuccess={closeQuickAction} onCancel={closeQuickAction} />
          </Modal>
        ) : null}
      </div>
    </AppLayout>
  );
}
