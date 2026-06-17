'use client';
import React, { useEffect, useState } from 'react';
import { Users, Wallet, TrendingUp, TrendingDown, RotateCcw } from 'lucide-react';
import { getPeopleDashboardSummary } from '@/lib/people';
import Link from 'next/link';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

export default function PeopleDashboardWidget() {
  const [summary, setSummary] = useState<{
    totalHeldByCurrency: Array<{ currency: string; amount: number }>;
    totalOwedToUserByCurrency: Array<{ currency: string; amount: number }>;
    totalOwedByUserByCurrency: Array<{ currency: string; amount: number }>;
    pendingReimbByCurrency: Array<{ currency: string; amount: number }>;
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

  const renderAmounts = (rows: Array<{ currency: string; amount: number }>, className: string) => {
    if (rows.length === 0) {
      return <p className={className}>No data</p>;
    }
    return (
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <FormattedCurrencyAmount
            key={`${row.currency}-${row.amount}`}
            amount={row.amount}
            currencyCode={row.currency}
            className={className}
            showCode
          />
        ))}
      </div>
    );
  };

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
          {renderAmounts(summary.totalHeldByCurrency, 'text-base font-700 text-foreground')}
          <p className="text-[10px] text-muted-foreground">Held for others</p>
        </div>

        <div className="bg-positive-soft rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={13} className="text-positive" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">Owed to Me</span>
          </div>
          {renderAmounts(summary.totalOwedToUserByCurrency, 'text-base font-700 text-positive')}
          <p className="text-[10px] text-muted-foreground">People owe me</p>
        </div>

        <div className="bg-negative-soft rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={13} className="text-negative" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">I Owe</span>
          </div>
          {renderAmounts(summary.totalOwedByUserByCurrency, 'text-base font-700 text-negative')}
          <p className="text-[10px] text-muted-foreground">I owe others</p>
        </div>

        <div className="bg-warning-soft rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <RotateCcw size={13} className="text-warning" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">Pending Reimb.</span>
          </div>
          {renderAmounts(summary.pendingReimbByCurrency, 'text-base font-700 text-warning')}
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
