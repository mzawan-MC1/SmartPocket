 'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import DashboardHeader from '@/app/components/DashboardHeader';
import DashboardMetrics from '@/app/components/DashboardMetrics';
import DashboardCharts from '@/app/components/DashboardCharts';
import RecentTransactions from '@/app/components/RecentTransactions';
import AccountBalances from '@/app/components/AccountBalances';
import UpcomingRecurring from '@/app/components/UpcomingRecurring';
import PeopleDashboardWidget from '@/app/components/PeopleDashboardWidget';
import AIUsageCard from '@/app/components/AIUsageCard';
import Modal from '@/components/ui/Modal';
import AddTransactionModal from '@/app/transactions/components/AddTransactionModal';
import FinancialAccountForm from '@/app/financial-accounts/components/FinancialAccountForm';
import RecurringTransactionForm from '@/app/recurring/components/RecurringTransactionForm';
import AddBudgetForm from '@/app/budgets/components/AddBudgetForm';
import CreateReimbursementForm from '@/app/reimbursements/components/CreateReimbursementForm';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import type { DashboardActivePeriod } from '@/lib/finance';
import { toast } from 'sonner';
import {
  formatCalendarMonthLabel,
  formatFinancialPeriodLabel,
  getMonthContext,
  getPeriodContainingDate,
  type DashboardPeriodPreference,
} from '@/lib/financial-periods';
import { loadUserFinancialPeriodContext, type UserFinancialPeriodContext } from '@/lib/financial-periods/profile';

function getDashboardLocale() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en-US';
}

function buildMonthActivePeriod(monthKey: string, timezone: string, locale?: string): DashboardActivePeriod {
  const monthContext = getMonthContext(monthKey, timezone);
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

export default function DashboardPage() {
  const dashboardLocale = getDashboardLocale();
  const [periodContext, setPeriodContext] = useState<UserFinancialPeriodContext | null>(null);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [viewMode, setViewMode] = useState<DashboardPeriodPreference | null>(null);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedPayPeriodStart, setSelectedPayPeriodStart] = useState('');
  const [activeQuickAction, setActiveQuickAction] = useState<'transaction' | 'account' | 'recurring' | 'reimbursement' | 'budget' | null>(null);
  const [lastTrigger, setLastTrigger] = useState<HTMLElement | null>(null);

  const loadPeriodContext = useCallback(async () => {
    setPeriodLoading(true);
    try {
      const nextContext = await loadUserFinancialPeriodContext();
      setPeriodContext(nextContext);
    } catch (error) {
      console.error(error);
      toast.error('Failed to load your planning period settings.');
    } finally {
      setPeriodLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPeriodContext();
  }, [loadPeriodContext]);

  useSmartPocketDataChanged(['profile'], 'DashboardPagePeriodContext', async () => {
    await loadPeriodContext();
  });

  useEffect(() => {
    if (!periodContext) return;

    const savedMode = window.sessionStorage.getItem('smartpocket.dashboard.view');
    const nextViewMode = savedMode === 'pay_cycle' || savedMode === 'month'
      ? savedMode
      : periodContext.defaultDashboardPeriod;
    const currentMonthKey = getMonthContext(undefined, periodContext.timezone).monthKey;
    const storedMonthKey = window.sessionStorage.getItem('smartpocket.dashboard.month') || currentMonthKey;
    const normalizedMonthKey = getMonthContext(storedMonthKey, periodContext.timezone).monthKey;
    const storedPayPeriodStart = window.sessionStorage.getItem('smartpocket.dashboard.pay-period-start') || periodContext.currentFinancialPeriod.startDate;
    const normalizedPayPeriod = buildPayPeriodActivePeriod(storedPayPeriodStart, periodContext, dashboardLocale);

    setViewMode((current) => current || nextViewMode);
    setSelectedMonth((current) => current || normalizedMonthKey);
    setSelectedPayPeriodStart((current) => current || normalizedPayPeriod.startDate);
  }, [periodContext]);

  useEffect(() => {
    if (!viewMode) return;
    window.sessionStorage.setItem('smartpocket.dashboard.view', viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!selectedMonth) return;
    window.sessionStorage.setItem('smartpocket.dashboard.month', selectedMonth);
  }, [selectedMonth]);

  useEffect(() => {
    if (!selectedPayPeriodStart) return;
    window.sessionStorage.setItem('smartpocket.dashboard.pay-period-start', selectedPayPeriodStart);
  }, [selectedPayPeriodStart]);

  const closeQuickAction = useCallback(() => {
    setActiveQuickAction(null);
    window.requestAnimationFrame(() => {
      lastTrigger?.focus();
    });
  }, [lastTrigger]);

  const openQuickAction = useCallback((
    action: 'transaction' | 'account' | 'recurring' | 'reimbursement' | 'budget',
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

  const handleResetToDefault = useCallback(() => {
    if (!periodContext) return;
    setViewMode(periodContext.defaultDashboardPeriod);
    setSelectedMonth(getMonthContext(undefined, periodContext.timezone).monthKey);
    setSelectedPayPeriodStart(periodContext.currentFinancialPeriod.startDate);
  }, [periodContext]);

  const handlePayPeriodChange = useCallback((startDate: string) => {
    if (!periodContext) return;
    setSelectedPayPeriodStart(buildPayPeriodActivePeriod(startDate, periodContext, dashboardLocale).startDate);
  }, [dashboardLocale, periodContext]);

  return (
    <AppLayout activeRoute="/dashboard">
      <div className="page-section">
        {periodLoading || !periodContext || !activePeriod || !viewMode ? (
          <div className="section-card">
            <div className="section-card-body flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
              <Loader2 size={22} className="animate-spin text-accent" />
              <div>
                <p className="text-sm font-600 text-foreground">Loading planning period</p>
                <p className="text-xs text-muted-foreground">Smart Pocket is loading your saved pay-cycle and timezone settings.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <DashboardHeader
              activePeriod={activePeriod}
              defaultViewMode={periodContext.defaultDashboardPeriod}
              viewMode={viewMode}
              onViewModeChange={handleViewModeChange}
              onResetToDefault={handleResetToDefault}
              onSelectedMonthChange={handleSelectedMonthChange}
              onSelectedPayPeriodChange={handlePayPeriodChange}
              onQuickAction={openQuickAction}
              financialPeriodContext={periodContext}
            />
            <DashboardMetrics activePeriod={activePeriod} hasConfigurationWarning={periodContext.hasConfigurationWarning} />
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
              <div className="xl:col-span-8 space-y-5">
                <DashboardCharts activePeriod={activePeriod} hasConfigurationWarning={periodContext.hasConfigurationWarning} />
                <RecentTransactions />
              </div>
              <div className="xl:col-span-4 space-y-5">
                <AIUsageCard />
                <AccountBalances />
                <PeopleDashboardWidget />
                <UpcomingRecurring activePeriod={activePeriod} />
              </div>
            </div>
          </>
        )}

        <AddTransactionModal
          isOpen={activeQuickAction === 'transaction'}
          onClose={closeQuickAction}
          initialMode="single"
        />

        <Modal isOpen={activeQuickAction === 'account'} onClose={closeQuickAction} title="Add Account" size="md">
          <FinancialAccountForm onSuccess={closeQuickAction} onCancel={closeQuickAction} />
        </Modal>

        <Modal isOpen={activeQuickAction === 'recurring'} onClose={closeQuickAction} title="Add Recurring Transaction" size="md">
          <RecurringTransactionForm onSuccess={closeQuickAction} onCancel={closeQuickAction} />
        </Modal>

        <Modal isOpen={activeQuickAction === 'budget'} onClose={closeQuickAction} title="Set Category Budget" size="md">
          <AddBudgetForm
            onSuccess={() => {
              dispatchSmartPocketDataChanged({
                source: 'dashboard-budget-quick-action',
                entities: ['dashboard'],
              });
              toast.success('Budget created');
              closeQuickAction();
            }}
            onCancel={closeQuickAction}
          />
        </Modal>

        <Modal isOpen={activeQuickAction === 'reimbursement'} onClose={closeQuickAction} title="Add Reimbursement" size="md">
          <CreateReimbursementForm onSuccess={closeQuickAction} onCancel={closeQuickAction} />
        </Modal>
      </div>
    </AppLayout>
  );
}
