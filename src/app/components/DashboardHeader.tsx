'use client';
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function DashboardHeader() {
  const [currentMonth, setCurrentMonth] = useState(5); // June (0-indexed)
  const [currentYear] = useState(2026);

  const prev = () => setCurrentMonth((m) => (m === 0 ? 11 : m - 1));
  const next = () => setCurrentMonth((m) => (m === 11 ? 0 : m + 1));

  return (
    <PageHeader
      title="Dashboard"
      description={`Your financial overview for ${months?.[currentMonth]} ${currentYear}`}
      badge={<StatusBadge status="info" label="Live overview" />}
      actions={
        <div className="section-card flex items-center gap-1 px-2 py-2">
          <button
            onClick={prev}
            className="btn-ghost min-h-0 p-2 rounded-xl"
            aria-label="Previous month"
          >
            <ChevronLeft size={15} className="text-muted-foreground" />
          </button>
          <div className="flex items-center gap-2 px-2">
            <Calendar size={14} className="text-accent" />
            <span className="text-sm font-700 text-foreground whitespace-nowrap">
              {months?.[currentMonth]} {currentYear}
            </span>
          </div>
          <button
            onClick={next}
            className="btn-ghost min-h-0 p-2 rounded-xl"
            aria-label="Next month"
          >
            <ChevronRight size={15} className="text-muted-foreground" />
          </button>
        </div>
      }
    />
  );
}
