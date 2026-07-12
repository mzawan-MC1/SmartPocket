'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { clearClientReferenceDataCache } from '@/lib/reference-data/client';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';
import { subscribeToMediaQueryChange } from '@/lib/browser-compat';

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
const DASHBOARD_BOOTSTRAP_TIMEOUT_MS = 12000;

function buildDashboardSignInHref() {
  return `/sign-up-login?next=${encodeURIComponent('/dashboard')}`;
}

function isAuthSessionError(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error || '');
  const normalizedMessage = errorMessage.toLowerCase();
  const errorStatus =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : null;
  const errorCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '').toLowerCase()
      : '';
  const errorName =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name || '').toLowerCase()
      : '';

  return errorStatus === 401
    || errorStatus === 403
    || errorCode === 'pgrst301'
    || errorName === 'authapierror'
    || normalizedMessage.includes('jwt')
    || normalizedMessage.includes('auth session missing')
    || normalizedMessage.includes('invalid refresh token')
    || normalizedMessage.includes('refresh token not found')
    || normalizedMessage.includes('refresh_token_not_found')
    || normalizedMessage.includes('session not found');
}

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
    return subscribeToMediaQueryChange(mediaQuery, updateMatch);
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
  const router = useRouter();
  const supabase = React.useMemo(() => createSupabaseClient(), []);
  const dashboardLocale = getIntlLocale(language);
  const [periodContext, setPeriodContext] = useState<UserFinancialPeriodContext | null>(null);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [periodLoadError, setPeriodLoadError] = useState<string | null>(null);
  const [showSlowLoadState, setShowSlowLoadState] = useState(false);
  const [routeRecoveryInProgress, setRouteRecoveryInProgress] = useState(false);
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

  const withDashboardTimeout = useCallback(
    async (promise: Promise<UserFinancialPeriodContext>, timeoutMs = DASHBOARD_BOOTSTRAP_TIMEOUT_MS) => (
      await Promise.race([
        promise,
        new Promise<UserFinancialPeriodContext>((_, reject) => {
          window.setTimeout(() => {
            reject(new Error('dashboard-bootstrap-timeout'));
          }, timeoutMs);
        }),
      ])
    ),
    []
  );

  const clearDashboardBootstrapCaches = useCallback(() => {
    clearFinancialPeriodProfileCache();
    clearResolvedUserDefaultCurrencyCache();
    clearClientReferenceDataCache();
  }, []);

  const resetDashboardBootstrapState = useCallback(() => {
    latestPeriodRequestRef.current += 1;
    setPeriodContext(null);
    setViewMode(null);
    setSelectedMonth('');
    setSelectedPayPeriodStart('');
    setPeriodLoadError(null);
    setShowSlowLoadState(false);
    setPeriodLoading(true);
  }, []);

  const redirectToRecoveredDestination = useCallback((destination: string) => {
    setRouteRecoveryInProgress(true);
    router.replace(destination, { scroll: destination !== '/dashboard' });
  }, [router]);

  const loadPeriodContext = useCallback(async (options?: { forceRefresh?: boolean; surfaceToast?: boolean }) => {
    const requestId = latestPeriodRequestRef.current + 1;
    latestPeriodRequestRef.current = requestId;
    setPeriodLoading(true);
    setPeriodLoadError(null);
    setShowSlowLoadState(false);

    const slowLoadTimer = window.setTimeout(() => {
      if (latestPeriodRequestRef.current === requestId) {
        setShowSlowLoadState(true);
      }
    }, DASHBOARD_SLOW_LOAD_MS);

    try {
      const nextContext = await withDashboardTimeout(loadUserFinancialPeriodContext({
        userId: user?.id ?? null,
      }));
      if (latestPeriodRequestRef.current !== requestId) return;
      setRouteRecoveryInProgress(false);
      setPeriodContext(nextContext);
    } catch (error) {
      if (latestPeriodRequestRef.current !== requestId) return;
      console.error(error);
      if (isAuthSessionError(error)) {
        clearDashboardBootstrapCaches();
        void supabase.auth.signOut().catch(() => {});
        redirectToRecoveredDestination(buildDashboardSignInHref());
        return;
      }
      setPeriodLoadError(t('shared.dashboardLoadFailedDescription'));
      if (options?.surfaceToast) {
        toast.error(t('shared.dashboardLoadFailedDescription'));
      }
    } finally {
      window.clearTimeout(slowLoadTimer);
      if (latestPeriodRequestRef.current === requestId) {
        setPeriodLoading(false);
      }
    }
  }, [clearDashboardBootstrapCaches, redirectToRecoveredDestination, supabase.auth, t, user?.id, withDashboardTimeout]);

  const runDashboardBootstrap = useCallback(async (options?: {
    forceRefresh?: boolean;
    surfaceToast?: boolean;
    resetState?: boolean;
  }) => {
    if (authLoading) return;

    if (options?.forceRefresh) {
      clearDashboardBootstrapCaches();
    }
    if (options?.resetState) {
      resetDashboardBootstrapState();
    }

    try {
      if (!user?.id) {
        clearDashboardBootstrapCaches();
        resetDashboardBootstrapState();
        redirectToRecoveredDestination(buildDashboardSignInHref());
        return;
      }

      setRouteRecoveryInProgress(false);
      await loadPeriodContext({
        forceRefresh: options?.forceRefresh,
        surfaceToast: options?.surfaceToast,
      });
    } catch (error) {
      setRouteRecoveryInProgress(false);
      setPeriodLoadError(t('shared.dashboardLoadFailedDescription'));
      setPeriodLoading(false);
      if (options?.surfaceToast) {
        toast.error(t('shared.dashboardLoadFailedDescription'));
      }
    }
  }, [
    authLoading,
    clearDashboardBootstrapCaches,
    loadPeriodContext,
    redirectToRecoveredDestination,
    resetDashboardBootstrapState,
    t,
    user?.id,
  ]);

  useEffect(() => {
    if (authLoading) return;
    void runDashboardBootstrap({ forceRefresh: true, resetState: true });
  }, [authLoading, runDashboardBootstrap, user?.id]);

  useEffect(() => {
    if (authLoading || !user?.id) return;
    void fetch('/api/financial-accounts/ensure-defaults', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  }, [authLoading, user?.id]);

  useSmartPocketDataChanged(['profile'], 'DashboardPagePeriodContext', async () => {
    await runDashboardBootstrap({ forceRefresh: true });
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
    void runDashboardBootstrap({ forceRefresh: true });
  }, [authLoading, periodContext, periodLoadError, periodLoading, runDashboardBootstrap, showSlowLoadState, viewMode]);

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

  const mobileModeToggle = React.useMemo(() => {
    if (!periodContext || !viewMode) return null;

    const monthPeriod = buildMonthActivePeriod(
      selectedMonth || getMonthContext(undefined, periodContext.timezone).monthKey,
      periodContext.timezone,
      dashboardLocale
    );
    const payPeriod = buildPayPeriodActivePeriod(
      selectedPayPeriodStart || periodContext.currentFinancialPeriod.startDate,
      periodContext,
      dashboardLocale
    );

    const sameRange = monthPeriod.startDate === payPeriod.startDate && monthPeriod.endDate === payPeriod.endDate;
    if (sameRange) {
      return null;
    }

    return viewMode === 'month'
      ? {
          label: t('dashboardHeader.payPeriod'),
          onToggle: () => handleViewModeChange('pay_cycle'),
        }
      : {
          label: t('dashboardMetrics.monthly'),
          onToggle: () => handleViewModeChange('month'),
        };
  }, [
    dashboardLocale,
    handleViewModeChange,
    periodContext,
    selectedMonth,
    selectedPayPeriodStart,
    t,
    viewMode,
  ]);

  const handleRetryDashboardBootstrap = useCallback(() => {
    void runDashboardBootstrap({
      forceRefresh: true,
      surfaceToast: true,
      resetState: true,
    });
  }, [runDashboardBootstrap]);

  const showDesktopRightRail = isXlUp === true;
  const viewportReady = isMdUp !== null && isXlUp !== null;
  const coreReady = Boolean(periodContext && activePeriod && viewMode);
  const showLoadFallback = !routeRecoveryInProgress && !authLoading && !coreReady && (!periodLoading || showSlowLoadState);
  const readyPeriodContext = coreReady ? periodContext : null;
  const readyActivePeriod = coreReady ? activePeriod : null;
  const readyViewMode = coreReady ? viewMode : null;

  return (
    <AppLayout
      activeRoute="/dashboard"
      hideMobileTopbar
      hideMobileFooter
      mobileContentPaddingBottomClassName="pb-[calc(env(safe-area-inset-bottom)+130px)] max-[480px]:pb-[calc(env(safe-area-inset-bottom)+142px)] sm:pb-9 lg:pb-9"
    >
      <div className="page-section gap-3.5 md:gap-4 lg:gap-5 max-[480px]:gap-3 pt-[calc(env(safe-area-inset-top)+20px)] md:pt-0">
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
                  onClick={handleRetryDashboardBootstrap}
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
            {!viewportReady ? (
              <div className="space-y-4 max-[480px]:space-y-3">
                <SectionCardSkeleton lines={3} />
                <SectionCardSkeleton lines={4} />
                <SectionCardSkeleton lines={4} />
              </div>
            ) : isMdUp ? (
              <div className="space-y-4 md:space-y-5 lg:space-y-5 max-[480px]:space-y-3">
                <div className="grid grid-cols-1 items-start gap-4 md:gap-5 md:grid-cols-12 xl:grid-cols-[minmax(0,8.35fr)_minmax(20rem,3.65fr)]">
                  <div className="md:col-span-12 xl:col-[1]">
                    <DashboardMetrics activePeriod={readyActivePeriod!} hasConfigurationWarning={readyPeriodContext!.hasConfigurationWarning} />
                  </div>
                  <div className="hidden md:block md:col-span-12 xl:col-[2] xl:row-span-2 xl:row-start-1 xl:self-start">
                    <div className="space-y-4 xl:w-[108%] xl:max-w-[23rem]">
                      <AIUsageCardLazy />
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
            ) : (
              <div className="space-y-4 max-[480px]:space-y-3 pb-6">
                <DashboardMetrics
                  activePeriod={readyActivePeriod!}
                  hasConfigurationWarning={readyPeriodContext!.hasConfigurationWarning}
                  variant="mobile-dashboard"
                  mobileAfterSummary={<AIUsageCardLazy variant="mobile-featured" />}
                  mobileModeToggle={mobileModeToggle}
                />
                <RecentTransactionsLazy variant="mobile-dashboard" />
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-800 tracking-[-0.02em] text-foreground">
                      {t('dashboardSections.smartSuggestionsTitle')}
                    </h2>
                  </div>
                  <UpcomingPersonalSubscriptionsLazy activePeriod={readyActivePeriod!} compact dashboardSuggestion />
                </section>

                <section className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-3.5 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.14)]">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[15px] font-800 tracking-[-0.02em] text-foreground">
                      {t('dashboardSections.moneyHealthTitle')}
                    </h2>
                  </div>
                  {readyPeriodContext?.configurationWarning ? (
                    <div className="mt-2 rounded-2xl border border-warning/25 bg-warning-soft px-3 py-2.5">
                      <p className="text-[13px] font-700 text-foreground">
                        {t('dashboardSections.moneyHealthConfigTitle')}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                        {readyPeriodContext.configurationWarning}
                      </p>
                      <div className="mt-2">
                        <Link
                          href="/settings"
                          className="inline-flex h-9 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-[13px] font-700 text-foreground shadow-sm transition-colors hover:bg-slate-50"
                        >
                          {t('dashboardSections.moneyHealthReviewAction')}
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-2xl bg-slate-50 px-3 py-3 text-center">
                      <p className="text-[13px] font-700 text-foreground">
                        {t('dashboardSections.moneyHealthEmptyTitle')}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                        {t('dashboardSections.moneyHealthEmptyDescription')}
                      </p>
                    </div>
                  )}
                </section>
              </div>
            )}
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
