'use client';
import React, { useEffect, useState } from 'react';
import { Users, Wallet, TrendingUp, TrendingDown, RotateCcw } from 'lucide-react';
import { getPeopleDashboardSummary } from '@/lib/people';
import Link from 'next/link';

function formatAmt(value: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export default function PeopleDashboardWidget() {
  const [summary, setSummary] = useState<{
    totalHeld: number;
    totalOwedToUser: number;
    totalOwedByUser: number;
    pendingReimbTotal: number;
    peopleCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPeopleDashboardSummary()
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card-elevated p-5 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!summary || summary.peopleCount === 0) return null;

  return (
    <div className="card-elevated p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-accent" />
          <h3 className="text-sm font-700 text-foreground">People & Finances</h3>
        </div>
        <Link href="/people" className="text-xs text-accent font-600 hover:underline">
          View All ({summary.peopleCount})
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-info-soft rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={13} className="text-info" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">Money Held</span>
          </div>
          <p className="text-base font-700 text-foreground">AED {formatAmt(summary.totalHeld)}</p>
          <p className="text-[10px] text-muted-foreground">Held for others</p>
        </div>

        <div className="bg-positive-soft rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={13} className="text-positive" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">Owed to Me</span>
          </div>
          <p className="text-base font-700 text-positive">AED {formatAmt(summary.totalOwedToUser)}</p>
          <p className="text-[10px] text-muted-foreground">People owe me</p>
        </div>

        <div className="bg-negative-soft rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={13} className="text-negative" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">I Owe</span>
          </div>
          <p className="text-base font-700 text-negative">AED {formatAmt(summary.totalOwedByUser)}</p>
          <p className="text-[10px] text-muted-foreground">I owe others</p>
        </div>

        <div className="bg-warning-soft rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <RotateCcw size={13} className="text-warning" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">Pending Reimb.</span>
          </div>
          <p className="text-base font-700 text-warning">AED {formatAmt(summary.pendingReimbTotal)}</p>
          <p className="text-[10px] text-muted-foreground">Outstanding</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Link href="/reimbursements" className="flex-1 text-center py-2 rounded-lg border border-border text-xs font-600 text-foreground hover:bg-muted transition-colors">
          Reimbursements
        </Link>
        <Link href="/settlements" className="flex-1 text-center py-2 rounded-lg border border-border text-xs font-600 text-foreground hover:bg-muted transition-colors">
          Settlements
        </Link>
      </div>
    </div>
  );
}
