'use client';
import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import SectionCard from '@/components/ui/SectionCard';
import Tabs from '@/components/ui/Tabs';
import { getDashboardMonthContext } from '@/lib/finance';

const IncomeExpenseChart = dynamic(() => import('./charts/IncomeExpenseChart'), { ssr: false });
const SpendingCategoryChart = dynamic(() => import('./charts/SpendingCategoryChart'), { ssr: false });

export default function DashboardCharts({
  selectedMonth,
}: {
  selectedMonth: string;
}) {
  const [activeTab, setActiveTab] = useState<'trend' | 'category'>('trend');
  const monthContext = getDashboardMonthContext(selectedMonth);

  return (
    <SectionCard
      title="Financial Overview"
      description={`Income, expenses, and spending composition through ${monthContext.label}.`}
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
        {activeTab === 'trend' ? <IncomeExpenseChart selectedMonth={selectedMonth} /> : <SpendingCategoryChart selectedMonth={selectedMonth} />}
      </div>
    </SectionCard>
  );
}
