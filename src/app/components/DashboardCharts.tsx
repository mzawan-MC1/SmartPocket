'use client';
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import SectionCard from '@/components/ui/SectionCard';
import Tabs from '@/components/ui/Tabs';

const IncomeExpenseChart = dynamic(() => import('./charts/IncomeExpenseChart'), { ssr: false });
const SpendingCategoryChart = dynamic(() => import('./charts/SpendingCategoryChart'), { ssr: false });

export default function DashboardCharts() {
  const [activeTab, setActiveTab] = useState<'trend' | 'category'>('trend');

  return (
    <SectionCard
      title="Financial Overview"
      description="Income, expenses, and spending composition across the current period."
      action={
        <Tabs
          items={[
            { id: 'trend', label: 'Income vs Expenses' },
            { id: 'category', label: 'By Category' },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      }
    >
      <div className="h-[260px]">
        {activeTab === 'trend' ? <IncomeExpenseChart /> : <SpendingCategoryChart />}
      </div>
    </SectionCard>
  );
}
