 'use client';
import React, { useCallback, useEffect, useState } from 'react';
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
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { getCurrentDashboardMonthKey, getDashboardMonthContext } from '@/lib/finance';
import { toast } from 'sonner';

export default function DashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentDashboardMonthKey());
  const [activeQuickAction, setActiveQuickAction] = useState<'transaction' | 'account' | 'recurring' | 'reimbursement' | 'budget' | null>(null);
  const [lastTrigger, setLastTrigger] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const storedMonth = window.sessionStorage.getItem('smartpocket.dashboard.month');
    if (storedMonth) {
      setSelectedMonth(getDashboardMonthContext(storedMonth).monthKey);
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem('smartpocket.dashboard.month', selectedMonth);
  }, [selectedMonth]);

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

  const handleSelectedMonthChange = useCallback((monthKey: string) => {
    setSelectedMonth(getDashboardMonthContext(monthKey).monthKey);
  }, []);

  return (
    <AppLayout activeRoute="/dashboard">
      <div className="page-section">
        <DashboardHeader
          selectedMonth={selectedMonth}
          onSelectedMonthChange={handleSelectedMonthChange}
          onQuickAction={openQuickAction}
        />
        <DashboardMetrics selectedMonth={selectedMonth} />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-8 space-y-5">
            <DashboardCharts selectedMonth={selectedMonth} />
            <RecentTransactions />
          </div>
          <div className="xl:col-span-4 space-y-5">
            <AIUsageCard />
            <AccountBalances />
            <PeopleDashboardWidget />
            <UpcomingRecurring selectedMonth={selectedMonth} />
          </div>
        </div>

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
