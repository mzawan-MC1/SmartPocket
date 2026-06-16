'use client';
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Plus } from 'lucide-react';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function BudgetsHeader() {
  const [month, setMonth] = useState(5);
  const year = 2026;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-700 text-foreground tracking-tight">Budgets</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track spending against your monthly allocations</p>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 card-elevated px-3 py-1.5 rounded-xl">
          <button
            onClick={() => setMonth((m) => (m === 0 ? 11 : m - 1))}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} className="text-muted-foreground" />
          </button>
          <div className="flex items-center gap-1.5 px-2">
            <Calendar size={13} className="text-accent" />
            <span className="text-sm font-600 text-foreground">{months?.[month]} {year}</span>
          </div>
          <button
            onClick={() => setMonth((m) => (m === 11 ? 0 : m + 1))}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Next month"
          >
            <ChevronRight size={14} className="text-muted-foreground" />
          </button>
        </div>

        <button className="btn-primary">
          <Plus size={15} />
          Set Budget
        </button>
      </div>
    </div>
  );
}