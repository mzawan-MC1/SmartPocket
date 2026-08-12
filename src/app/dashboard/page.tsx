'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Plus, MessageSquare, Mic, FileUp, ArrowRight } from 'lucide-react';
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
import { useQuickActions } from '@/components/quick-actions/QuickActionsContext';
import { getPeopleDashboardSummary } from '@/lib/people';

const AIUsageCardLazy = dynamic(() => import('@/app/components/AIUsageCard'), {
  loading: () => <SectionCardSkeleton lines={3} className="h-full" />,
});
const RecentTransactionsLazy = dynamic(() => import('@/app/components/RecentTransactions'), {
  loading: () => <SectionCardSkeleton lines={4} className="h-full md:col-span-2 xl:col-span-1" />,
});
const UpcomingRecurringLazy = dynamic(() => import('@/app/components/UpcomingRecurring'), {
  loading: () => <SectionCardSkeleton lines={4} className="h-full" />,
});
const UpcomingPersonalSubscriptionsLazy = dynamic(() => import('@/app/components/UpcomingPersonalSubscriptions'), {
  loading: () => <SectionCardSkeleton lines={4} className="h-full md:col-span-2 lg:col-span-1" />,
});
const PeopleDashboardWidgetLazy = dynamic(() => import('@/app/components/PeopleDashboardWidget'), {
  loading: () => (
    <div className="space-y-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-5 w-40 rounded-lg bg-muted" />
        <div className="h-4 w-28 rounded-full bg-muted" />
      </div>
      <div className="space-y-2">
        <div className="h-6 w-40 rounded-lg bg-muted" />
        <div className="h-10 w-full rounded-xl bg-muted" />
      </div>
    </div>
  ),
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
interface BudgetPreviewCardsLocalProps {
  activePeriod: DashboardActivePeriod;
}
const BudgetPreviewCardsLazy = dynamic(
  () => import('@/app/components/BudgetPreviewCards') as Promise<{ default: React.ComponentType<BudgetPreviewCardsLocalProps> }>,
  {
    loading: () => (<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 min-w-0 min-h-0">{Array.from({length:4}).map((_,i)=>(<div key={`bskel-${i}`} className="rounded-2xl border border-border/50 p-3 bg-card h-full"><ListItemSkeleton count={2} className="h-full" /></div>))}</div>),
  }
);

interface AccountPreviewCardsLocalProps {
  hideSensitive?: boolean;
  periodNetByAccountId?: Map<string, number> | null;
}
const AccountPreviewCardsLazy = dynamic(
  () => import('@/app/components/AccountPreviewCards') as Promise<{ default: React.ComponentType<AccountPreviewCardsLocalProps> }>,
  {
    loading: () => (<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 min-w-0 min-h-0">{Array.from({length:4}).map((_,i)=>(<div key={`askel-${i}`} className="rounded-2xl border border-border/50 p-3 bg-card h-full"><ListItemSkeleton count={2} className="h-full" /></div>))}</div>),
  }
);

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

const AIUsageOrbLazy = dynamic(() => import('@/app/components/AIUsageCard').then((mod) => ({ default: mod.default })), {
  loading: () => null,
  ssr: true,
});

function SmartAIDashboardCard() {
  const { t } = useTranslation('portal');
  const quickActions = useQuickActions();

  function openAI(actionId: 'smart_entry' | 'voice_entry' | 'document_entry') {
    quickActions?.openQuickAction(actionId);
  }

  return (
    <div className="col-span-1 lg:col-span-1 min-w-0 overflow-hidden rounded-[22px] border border-purple-200/60 dark:border-purple-400/20 bg-gradient-to-br from-purple-500 via-purple-600 to-indigo-600 text-white p-4 shadow-lg">
      <div className="flex flex-col gap-0 min-w-0">
        <div className="flex flex-row items-start justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <h2 className="text-[15px] font-800 tracking-[-0.02em]">
              {t('dashboardSections.smartAiTitle', 'Smart AI')}
            </h2>
            <p className="mt-1 text-[12px] leading-[1.25rem] text-white/85">
              {t('dashboardSections.smartAiSubtitle', 'Capture expenses, income and more — hands-free')}
            </p>
          </div>
          <div className="flex-shrink-0 min-h-[40px] min-w-[40px]">
            <AIUsageOrbLazy variant="desktop-preview-orb" />
          </div>
        </div>
        <div className="mt-3.5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 min-w-0">
            <button
              type="button"
              onClick={() => openAI('smart_entry')}
              className="rounded-2xl bg-white/10 hover:bg-white/15 p-2.5 transition-colors border border-white/10 backdrop-blur-sm cursor-pointer min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label={t('dashboardSections.smartAiTypeIt', 'Type it')}
            >
              <div className="flex flex-row sm:flex-col items-center sm:items-center justify-start sm:justify-center gap-2.5 sm:gap-1.5 min-w-0">
                <MessageSquare size={16} className="flex-shrink-0" />
                <span className="text-[11.5px] font-700 leading-tight min-w-0 truncate text-white">
                  {t('dashboardSections.smartAiTypeIt', 'Type it')}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openAI('voice_entry')}
              className="rounded-2xl bg-white/10 hover:bg-white/15 p-2.5 transition-colors border border-white/10 backdrop-blur-sm cursor-pointer min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label={t('dashboardSections.smartAiSayIt', 'Say it')}
            >
              <div className="flex flex-row sm:flex-col items-center sm:items-center justify-start sm:justify-center gap-2.5 sm:gap-1.5 min-w-0">
                <Mic size={16} className="flex-shrink-0" />
                <span className="text-[11.5px] font-700 leading-tight min-w-0 truncate text-white">
                  {t('dashboardSections.smartAiSayIt', 'Say it')}
                </span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => openAI('document_entry')}
              className="rounded-2xl bg-white/10 hover:bg-white/15 p-2.5 transition-colors border border-white/10 backdrop-blur-sm cursor-pointer min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              aria-label={t('dashboardSections.smartAiUpload', 'Upload receipt')}
            >
              <div className="flex flex-row sm:flex-col items-center sm:items-center justify-start sm:justify-center gap-2.5 sm:gap-1.5 min-w-0">
                <FileUp size={16} className="flex-shrink-0" />
                <span className="text-[11.5px] font-700 leading-tight min-w-0 truncate text-white">
                  {t('dashboardSections.smartAiUpload', 'Upload receipt')}
                </span>
              </div>
            </button>
          </div>
          <div className="mt-3.5 flex min-w-0">
            <button
              type="button"
              onClick={() => openAI('smart_entry')}
              className="rounded-full bg-white text-purple-700 px-4 h-9 font-700 text-[12px] inline-flex w-full items-center justify-center gap-1.5 shadow-sm hover:shadow min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-1 focus-visible:ring-offset-purple-600"
              aria-label={t('dashboardSections.smartAiOpenAssistant', 'Open AI Assistant')}
            >
              {t('dashboardSections.smartAiOpenAssistant', 'Open AI Assistant')}
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
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
  const [activeQuickAction, setActiveQuickAction] = useState<'transaction' | 'account' | 'personal_subscription' | 'recurring' | 'reimbursement' | 'budget' | 'money_in' | 'money_out' | null>(null);
  const [lastTrigger, setLastTrigger] = useState<HTMLElement | null>(null);
  const isMdUp = useMinWidth(768);
  const isXlUp = useMinWidth(1280);
  const [globalHideSensitive, setGlobalHideSensitive] = useState(false);
  const [periodNetByAccountId, setPeriodNetByAccountId] = useState<Map<string, number> | null>(null);
  void useDeferredMount(true, '650px 0px');
  void useDeferredMount(true, '900px 0px');
  const latestBootstrapRequestRef = useRef(0);
  const lastLifecycleRevalidationRef = useRef(0);
  const initialBootstrapStartedRef = useRef(false);
  const initialBootstrapCompletedRef = useRef(false);
  const bootstrapInFlightRequestRef = useRef<number | null>(null);
  const bootstrapUserIdRef = useRef<string | null | undefined>(undefined);
  const [sharedPeopleSummary, setSharedPeopleSummary] = useState<Awaited<ReturnType<typeof getPeopleDashboardSummary>> | null>(null);
  const [sharedPeopleSummaryLoading, setSharedPeopleSummaryLoading] = useState(true);

  const withDashboardTimeout = useCallback(
    async (promise: Promise<UserFinancialPeriodContext>, timeoutMs = DASHBOARD_BOOTSTRAP_TIMEOUT_MS) => {
      let timeoutId: number | null = null;
      try {
        return await Promise.race([
          promise,
          new Promise<UserFinancialPeriodContext>((_, reject) => {
            timeoutId = window.setTimeout(() => {
              reject(new Error('dashboard-bootstrap-timeout'));
            }, timeoutMs);
          }),
        ]);
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
      }
    },
    []
  );

  const clearDashboardBootstrapCaches = useCallback(() => {
    clearFinancialPeriodProfileCache(user?.id ?? undefined);
    clearResolvedUserDefaultCurrencyCache();
    clearClientReferenceDataCache();
  }, [user?.id]);

  const resetDashboardBootstrapState = useCallback(() => {
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

  const deriveDashboardBootstrapState = useCallback((nextContext: UserFinancialPeriodContext) => {
    const savedMode = readDashboardSessionStorage(DASHBOARD_VIEW_STORAGE_KEY);
    const nextViewMode = savedMode === 'pay_cycle' || savedMode === 'month'
      ? savedMode
      : nextContext.defaultDashboardPeriod;
    const currentMonthKey = getMonthContext(undefined, nextContext.timezone).monthKey;
    const storedMonthKey = readDashboardSessionStorage(DASHBOARD_MONTH_STORAGE_KEY) || currentMonthKey;
    const normalizedMonthKey = getMonthContext(storedMonthKey, nextContext.timezone).monthKey;
    const storedPayPeriodStart = readDashboardSessionStorage(DASHBOARD_PAY_PERIOD_STORAGE_KEY) || nextContext.currentFinancialPeriod.startDate;
    const normalizedPayPeriod = buildPayPeriodActivePeriod(storedPayPeriodStart, nextContext, dashboardLocale);

    return {
      periodContext: nextContext,
      viewMode: nextViewMode,
      selectedMonth: normalizedMonthKey,
      selectedPayPeriodStart: normalizedPayPeriod.startDate,
    };
  }, [dashboardLocale]);

  const loadPeriodContext = useCallback(async (options?: { forceRefresh?: boolean }) => {
    if (options?.forceRefresh) {
      clearDashboardBootstrapCaches();
    }

    return await withDashboardTimeout(loadUserFinancialPeriodContext({
      userId: user?.id ?? null,
    }), DASHBOARD_BOOTSTRAP_TIMEOUT_MS);
  }, [clearDashboardBootstrapCaches, user?.id, withDashboardTimeout]);

  const runDashboardBootstrap = useCallback(async (options?: {
    forceRefresh?: boolean;
    surfaceToast?: boolean;
    resetState?: boolean;
  }) => {
    if (authLoading) return;
    if (bootstrapInFlightRequestRef.current !== null && !options?.forceRefresh) {
      return;
    }

    const requestId = latestBootstrapRequestRef.current + 1;
    latestBootstrapRequestRef.current = requestId;
    bootstrapInFlightRequestRef.current = requestId;

    if (options?.resetState) {
      initialBootstrapCompletedRef.current = false;
      resetDashboardBootstrapState();
    }

    setPeriodLoading(true);
    setPeriodLoadError(null);
    setShowSlowLoadState(false);
    setRouteRecoveryInProgress(false);

    const slowLoadTimer = window.setTimeout(() => {
      if (latestBootstrapRequestRef.current === requestId) {
        setShowSlowLoadState(true);
      }
    }, DASHBOARD_SLOW_LOAD_MS);

    try {
      if (!user?.id) {
        clearDashboardBootstrapCaches();
        if (latestBootstrapRequestRef.current === requestId) {
          resetDashboardBootstrapState();
          redirectToRecoveredDestination(buildDashboardSignInHref());
        }
        return;
      }

      const nextContext = await loadPeriodContext({
        forceRefresh: options?.forceRefresh,
      });
      if (latestBootstrapRequestRef.current !== requestId) return;

      const nextState = deriveDashboardBootstrapState(nextContext);
      setPeriodContext(nextState.periodContext);
      setViewMode(nextState.viewMode);
      setSelectedMonth(nextState.selectedMonth);
      setSelectedPayPeriodStart(nextState.selectedPayPeriodStart);
      setPeriodLoadError(null);
      setShowSlowLoadState(false);
      setRouteRecoveryInProgress(false);
    } catch (error) {
      if (latestBootstrapRequestRef.current !== requestId) return;
      setRouteRecoveryInProgress(false);
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
      if (bootstrapInFlightRequestRef.current === requestId) {
        bootstrapInFlightRequestRef.current = null;
      }
      if (latestBootstrapRequestRef.current === requestId) {
        setPeriodLoading(false);
        initialBootstrapCompletedRef.current = true;
      }
    }
  }, [
    authLoading,
    clearDashboardBootstrapCaches,
    deriveDashboardBootstrapState,
    loadPeriodContext,
    redirectToRecoveredDestination,
    resetDashboardBootstrapState,
    supabase.auth,
    t,
    user?.id,
  ]);

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (bootstrapUserIdRef.current === undefined) {
      bootstrapUserIdRef.current = nextUserId;
      return;
    }

    if (bootstrapUserIdRef.current === nextUserId) {
      return;
    }

    bootstrapUserIdRef.current = nextUserId;
    latestBootstrapRequestRef.current += 1;
    lastLifecycleRevalidationRef.current = 0;
    initialBootstrapStartedRef.current = false;
    initialBootstrapCompletedRef.current = false;
    bootstrapInFlightRequestRef.current = null;
    resetDashboardBootstrapState();
    setRouteRecoveryInProgress(false);
  }, [resetDashboardBootstrapState, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (initialBootstrapStartedRef.current) return;
    initialBootstrapStartedRef.current = true;
    initialBootstrapCompletedRef.current = false;
    void runDashboardBootstrap({ resetState: true });
  }, [authLoading, runDashboardBootstrap, user?.id]);

  useEffect(() => {
    if (authLoading || !user?.id || !periodContext) return;
    void fetch('/api/financial-accounts/ensure-defaults', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
  }, [authLoading, periodContext, user?.id]);

  useSmartPocketDataChanged(['profile'], 'DashboardPagePeriodContext', async () => {
    await runDashboardBootstrap({ forceRefresh: true });
  });

  const loadSharedPeopleSummary = useCallback(async () => {
    setSharedPeopleSummaryLoading(true);
    try {
      setSharedPeopleSummary(await getPeopleDashboardSummary());
    } catch {
      setSharedPeopleSummary(null);
    } finally {
      setSharedPeopleSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSharedPeopleSummary();
  }, [loadSharedPeopleSummary]);

  useSmartPocketDataChanged(
    ['dashboard', 'transactions', 'financial_accounts', 'recurring_transactions'],
    'DashboardPageSharedPeopleSummary',
    async () => {
      await loadSharedPeopleSummary();
    }
  );

  const revalidateFromLifecycle = useCallback((forceRefresh = false) => {
    if (authLoading) return;
    if (!initialBootstrapCompletedRef.current && !forceRefresh) return;

    const coreReady = Boolean(periodContext && viewMode);
    if (coreReady && !periodLoadError && !showSlowLoadState && !periodLoading && !forceRefresh) {
      return;
    }

    const now = Date.now();
    if (now - lastLifecycleRevalidationRef.current < DASHBOARD_REVALIDATE_DEBOUNCE_MS) {
      return;
    }
    lastLifecycleRevalidationRef.current = now;
    void runDashboardBootstrap({ forceRefresh });
  }, [authLoading, periodContext, periodLoadError, periodLoading, runDashboardBootstrap, showSlowLoadState, viewMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        revalidateFromLifecycle(true);
        return;
      }

      if (!initialBootstrapCompletedRef.current) {
        return;
      }

      if (!periodContext || !viewMode || periodLoadError) {
        revalidateFromLifecycle();
      }
    };

    const handleVisibilityChange = () => {
      if (!initialBootstrapCompletedRef.current) return;
      if (document.visibilityState === 'visible' && (!periodContext || !viewMode || periodLoadError || periodLoading)) {
        revalidateFromLifecycle();
      }
    };

    const handleFocus = () => {
      if (!initialBootstrapCompletedRef.current) return;
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
    action: 'transaction' | 'account' | 'personal_subscription' | 'recurring' | 'reimbursement' | 'budget' | 'money_in' | 'money_out',
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
    latestBootstrapRequestRef.current += 1;
    void runDashboardBootstrap({
      forceRefresh: true,
      surfaceToast: true,
      resetState: true,
    });
  }, [runDashboardBootstrap]);

  void isXlUp;
  const viewportReady = isMdUp !== null && isXlUp !== null;
  const coreReady = Boolean(periodContext && activePeriod && viewMode);
  const showLoadFallback = !routeRecoveryInProgress && !authLoading && (Boolean(periodLoadError) || showSlowLoadState);
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
      <div className="page-section gap-3 md:gap-3.5 lg:gap-4.5 max-[480px]:gap-3 pt-[calc(env(safe-area-inset-top)+20px)] md:pt-0">
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
              <div className="space-y-3 md:space-y-3.5 lg:space-y-4 max-[480px]:space-y-3">
                <div className="grid grid-cols-1 items-start gap-3 md:gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <div className="col-span-1 lg:col-span-1 min-w-0">
                    <DashboardMetrics activePeriod={readyActivePeriod!} hasConfigurationWarning={readyPeriodContext!.hasConfigurationWarning} hideSensitive={globalHideSensitive} onHideSensitiveChange={setGlobalHideSensitive} onPeriodNetByAccountIdChange={setPeriodNetByAccountId} />
                  </div>
                  <SmartAIDashboardCard />
                </div>

                <div className="section-card rounded-[22px] overflow-hidden min-w-0">
                  <div className="section-card-header flex flex-row justify-between items-center min-w-0 px-4 py-3">
                    <h2 className="text-[14px] font-800 tracking-[-0.02em] text-foreground truncate">
                      {t('dashboardSections.yourBudgetsTitle', 'Your Budgets')}
                    </h2>
                    <Link
                      href="/budgets"
                      className="text-[12px] font-700 text-accent inline-flex items-center gap-1 flex-shrink-0"
                    >
                      {t('dashboardSections.seeAllBudgets', 'See all Budgets')}
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                  <div className="section-card-body px-4 py-3 min-w-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 items-stretch min-h-0 min-w-0">
                      <BudgetPreviewCardsLazy activePeriod={readyActivePeriod!} />
                    </div>
                  </div>
                </div>

                <div className="section-card rounded-[22px] overflow-hidden min-w-0">
                  <div className="section-card-header flex flex-row justify-between items-center min-w-0 px-4 py-3">
                    <h2 className="text-[14px] font-800 tracking-[-0.02em] text-foreground truncate">
                      {t('dashboardSections.yourAccountsTitle', 'Your Accounts')}
                    </h2>
                    <Link
                      href="/financial-accounts"
                      className="text-[12px] font-700 text-accent inline-flex items-center gap-1 flex-shrink-0"
                    >
                      {t('dashboardSections.seeAllAccounts', 'See all Accounts')}
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                  <div className="section-card-body px-4 py-3 min-w-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-stretch min-w-0">
                      <AccountPreviewCardsLazy hideSensitive={globalHideSensitive} periodNetByAccountId={periodNetByAccountId} />
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => openQuickAction('account', e.currentTarget as HTMLElement)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openQuickAction('account', e.currentTarget as HTMLElement);
                          }
                        }}
                        className="rounded-2xl border border-dashed border-border/70 hover:bg-muted/30 transition-colors cursor-pointer p-3 min-h-[96px] flex flex-col items-center justify-center text-muted-foreground gap-1.5"
                      >
                        <Plus size={18} />
                        <span className="text-[12px] font-700">
                          {t('dashboardSections.addAccountTile', 'Add Account')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-3.5 items-start">
                  <div className="col-span-1 min-w-0 h-full min-h-0 flex flex-col">
                    <UpcomingRecurringLazy activePeriod={readyActivePeriod!} />
                  </div>
                  <div className="col-span-1 min-w-0 h-full min-h-0 flex flex-col">
                    <PeopleDashboardWidgetLazy
                      variant="iOwe"
                      preloadedPeopleSummary={sharedPeopleSummary}
                      isPeopleSummaryLoading={sharedPeopleSummaryLoading}
                    />
                  </div>
                  <div className="col-span-1 min-w-0 h-full min-h-0 flex flex-col">
                    <PeopleDashboardWidgetLazy
                      variant="owedToMe"
                      preloadedPeopleSummary={sharedPeopleSummary}
                      isPeopleSummaryLoading={sharedPeopleSummaryLoading}
                    />
                  </div>
                  <div className="col-span-1 min-w-0 h-full min-h-0 flex flex-col">
                    <UpcomingPersonalSubscriptionsLazy activePeriod={readyActivePeriod!} />
                  </div>
                </div>

                <div className="grid grid-cols-1 items-start gap-3.5 md:gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(18rem,1fr)]">
                  <div className="col-span-1 lg:col-span-1 section-card rounded-[22px] overflow-hidden min-w-0">
                    <div className="section-card-header min-w-0 px-4 py-3">
                      <h2 className="text-[14px] font-800 tracking-[-0.02em] text-foreground truncate">
                        {t('dashboardSections.financialOverviewTitle', 'Financial Overview')}
                      </h2>
                    </div>
                    <div className="section-card-body px-4 py-3 min-w-0">
                      <DashboardCharts activePeriod={readyActivePeriod!} hasConfigurationWarning={readyPeriodContext!.hasConfigurationWarning} compact desktopChartHeight={220} />
                    </div>
                  </div>
                  <div className="col-span-1 lg:col-span-1 section-card rounded-[22px] overflow-hidden min-w-0">
                    <div className="section-card-header flex flex-row justify-between items-center min-w-0 px-4 py-3">
                      <h2 className="text-[14px] font-800 tracking-[-0.02em] text-foreground truncate">
                        {t('dashboardSections.recentActivityTitle', 'Recent Activity')}
                      </h2>
                      <Link
                        href="/transactions"
                        className="text-[12px] font-700 text-accent inline-flex items-center gap-1 flex-shrink-0"
                      >
                        {t('dashboardSections.seeAllTransactions', 'See all Money In & Out')}
                        <ArrowRight size={13} />
                      </Link>
                    </div>
                    <div className="section-card-body p-0 min-w-0">
                      <RecentTransactionsLazy variant="dashboard-section" rowDensity="compact" />
                    </div>
                  </div>
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
                  hideSensitive={globalHideSensitive}
                  onHideSensitiveChange={setGlobalHideSensitive}
                />
                <RecentTransactionsLazy variant="mobile-dashboard" />
                <UpcomingPersonalSubscriptionsLazy activePeriod={readyActivePeriod!} compact dashboardSuggestion />

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

        {activeQuickAction === 'money_in' ? (
          <AddTransactionModalLazy
            isOpen
            onClose={closeQuickAction}
            initialMode="single"
            initialTransactionType="income"
          />
        ) : null}

        {activeQuickAction === 'money_out' ? (
          <AddTransactionModalLazy
            isOpen
            onClose={closeQuickAction}
            initialMode="single"
            initialTransactionType="expense"
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
