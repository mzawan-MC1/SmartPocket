'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Users, Wallet, TrendingUp, TrendingDown, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPeopleDashboardSummary } from '@/lib/people';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import Link from 'next/link';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

export default function PeopleDashboardWidget() {
  const { t } = useTranslation(['portal', 'common']);
  const [summary, setSummary] = useState<{
    defaultCurrency: string;
    totalHeldByCurrency: Array<{ currency: string; amount: number }>;
    totalOwedToUserByCurrency: Array<{ currency: string; amount: number }>;
    totalOwedByUserByCurrency: Array<{ currency: string; amount: number }>;
    pendingReimbByCurrency: Array<{ currency: string; amount: number }>;
    peopleCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await getPeopleDashboardSummary());
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(
    ['dashboard', 'transactions', 'financial_accounts', 'recurring_transactions'],
    'PeopleDashboardWidget',
    async () => {
      await load();
    }
  );

  if (loading) {
    return (
      <div className="card-elevated animate-pulse p-4">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!summary || summary.peopleCount === 0) return null;

  const renderAmounts = (rows: Array<{ currency: string; amount: number }>, className: string) => {
    const safeRows = rows.length > 0
      ? rows
      : [{ currency: summary.defaultCurrency, amount: 0 }];

    return (
      <div className="flex flex-col gap-1">
        {safeRows.map((row) => (
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
    <div className="card-elevated p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-accent" />
          <h3 className="text-sm font-700 text-foreground">{t('people.detail.dashboardTitle', { ns: 'portal' })}</h3>
        </div>
        <Link href="/people" className="text-xs text-accent font-600 hover:underline">
          {t('actions.viewAll', { ns: 'common' })} ({summary.peopleCount})
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-info-soft p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={13} className="text-info" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">{t('people.moneyHeld', { ns: 'portal' })}</span>
          </div>
          {renderAmounts(summary.totalHeldByCurrency, 'text-base font-700 text-foreground')}
          <p className="text-[10px] text-muted-foreground">{t('people.detail.heldForOthers', { ns: 'portal' })}</p>
        </div>

        <div className="rounded-xl bg-positive-soft p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={13} className="text-positive" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">{t('people.owedToMe', { ns: 'portal' })}</span>
          </div>
          {renderAmounts(summary.totalOwedToUserByCurrency, 'text-base font-700 text-positive')}
          <p className="text-[10px] text-muted-foreground">{t('people.detail.peopleOweMe', { ns: 'portal' })}</p>
        </div>

        <div className="rounded-xl bg-negative-soft p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={13} className="text-negative" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">{t('people.iOwe', { ns: 'portal' })}</span>
          </div>
          {renderAmounts(summary.totalOwedByUserByCurrency, 'text-base font-700 text-negative')}
          <p className="text-[10px] text-muted-foreground">{t('people.detail.iOweOthers', { ns: 'portal' })}</p>
        </div>

        <div className="rounded-xl bg-warning-soft p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <RotateCcw size={13} className="text-warning" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">{t('people.detail.pendingReimbursementsShort', { ns: 'portal' })}</span>
          </div>
          {renderAmounts(summary.pendingReimbByCurrency, 'text-base font-700 text-warning')}
          <p className="text-[10px] text-muted-foreground">{t('reimbursements.outstanding', { ns: 'portal' })}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <Link href="/reimbursements" className="flex-1 rounded-lg border border-border py-2 text-center text-xs font-600 text-foreground transition-colors hover:bg-muted">
          {t('reimbursements.title', { ns: 'portal' })}
        </Link>
        <Link href="/settlements" className="flex-1 rounded-lg border border-border py-2 text-center text-xs font-600 text-foreground transition-colors hover:bg-muted">
          {t('settlements.title', { ns: 'portal' })}
        </Link>
      </div>
    </div>
  );
}
