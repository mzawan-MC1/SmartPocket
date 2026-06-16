import React from 'react';
import AppLayout from '@/components/AppLayout';
import DashboardHeader from '@/app/components/DashboardHeader';
import DashboardMetrics from '@/app/components/DashboardMetrics';
import DashboardCharts from '@/app/components/DashboardCharts';
import RecentTransactions from '@/app/components/RecentTransactions';
import AccountBalances from '@/app/components/AccountBalances';
import UpcomingRecurring from '@/app/components/UpcomingRecurring';
import PeopleDashboardWidget from '@/app/components/PeopleDashboardWidget';
import AIUsageCard from '@/app/components/AIUsageCard';

export default function DashboardPage() {
  return (
    <AppLayout activeRoute="/dashboard">
      <div className="page-section">
        <DashboardHeader />
        <DashboardMetrics />
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-8 space-y-5">
            <DashboardCharts />
            <RecentTransactions />
          </div>
          <div className="xl:col-span-4 space-y-5">
            <AIUsageCard />
            <AccountBalances />
            <PeopleDashboardWidget />
            <UpcomingRecurring />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
