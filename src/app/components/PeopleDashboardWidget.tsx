'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Users, Wallet, TrendingUp, TrendingDown, RotateCcw, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPeopleDashboardSummary } from '@/lib/people';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import Link from 'next/link';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

type PeopleDashboardVariant = 'all' | 'iOwe' | 'owedToMe';
type PeopleDashboardSummary = ReturnType<typeof getPeopleDashboardSummary>;

type PeopleDashboardWidgetProps = {
  variant?: PeopleDashboardVariant;
  preloadedPeopleSummary?: Awaited<PeopleDashboardSummary> | null | undefined;
  isPeopleSummaryLoading?: boolean;
};

export default function PeopleDashboardWidget({
  variant = 'all',
  preloadedPeopleSummary,
  isPeopleSummaryLoading,
}: PeopleDashboardWidgetProps) {
  const { t } = useTranslation(['portal', 'common']);
  const [internalSummary, setInternalSummary] = useState<Awaited<PeopleDashboardSummary> | null>(null);
  const [internalLoading, setInternalLoading] = useState(true);

  const usingPreloaded = preloadedPeopleSummary !== undefined || isPeopleSummaryLoading !== undefined;

  const summary = usingPreloaded ? (preloadedPeopleSummary ?? null) : internalSummary;
  const loading = usingPreloaded ? Boolean(isPeopleSummaryLoading) : internalLoading;

  const load = useCallback(async () => {
    setInternalLoading(true);
    try {
      setInternalSummary(await getPeopleDashboardSummary());
    } catch {
      setInternalSummary(null);
    } finally {
      setInternalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (usingPreloaded) return;
    void load();
  }, [load, usingPreloaded]);

  useSmartPocketDataChanged(
    ['dashboard', 'transactions', 'financial_accounts', 'recurring_transactions'],
    'PeopleDashboardWidget',
    async () => {
      if (usingPreloaded) return;
      await load();
    }
  );

  if (loading) {
    if (variant === 'all') {
      return (
        <div className="card-elevated h-full animate-pulse p-4">
          <div className="h-4 bg-muted rounded w-1/3 mb-4" />
          <div className="grid grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 bg-muted rounded-xl" />)}
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-3 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 rounded-lg bg-muted" />
          <div className="h-4 w-28 rounded-full bg-muted" />
        </div>
        <div className="space-y-2">
          <div className="h-6 w-40 rounded-lg bg-muted" />
          <div className="h-4 w-full rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  const hasAnyData = Boolean(summary && summary.peopleCount > 0);
  const hasIOwe = Boolean(summary && summary.totalOwedByUserByCurrency.some((r) => r.amount > 0));
  const hasOwedToMe = Boolean(summary && summary.totalOwedToUserByCurrency.some((r) => r.amount > 0));

  if (variant === 'all') {
    if (!hasAnyData) return null;
  }

  const renderAmounts = (rows: Array<{ currency: string; amount: number }>, className: string) => {
    const safeRows = rows.length > 0
      ? rows
      : summary
        ? [{ currency: summary.defaultCurrency, amount: 0 }]
        : [];

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

  if (variant === 'iOwe') {
    return (
      <div className="section-card h-full overflow-hidden flex min-h-0 flex-col rounded-[22px]">
        <div className="section-card-header flex flex-row justify-between items-center min-w-0 !px-4 !pt-3 !pb-0">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingDown size={16} className="text-negative flex-shrink-0" />
            <h2 className="text-[14px] font-800 tracking-[-0.02em] text-foreground truncate">
              {t('dashboardSections.moneyYouOwe', { defaultValue: 'Money You Owe' })}
            </h2>
          </div>
          <Link
            href="/settlements"
            className="text-[12px] font-700 text-accent inline-flex items-center gap-1 flex-shrink-0"
          >
            {t('dashboardSections.seeAllSettlements', { defaultValue: 'See all settlements' })}
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="section-card-body min-w-0 flex-1 !px-4 !py-3">
          {!hasAnyData || !hasIOwe ? (
            <div className="rounded-xl bg-muted/30 px-3 py-2 text-[12px] font-600 text-muted-foreground flex items-center gap-2">
              <TrendingDown size={14} className="text-negative" />
              <span>{t('dashboardSections.moneyYouOweEmptyTitle', { defaultValue: 'Nothing owed right now' })}</span>
            </div>
          ) : (
            <div className="space-y-2 min-w-0">
              <div className="rounded-xl bg-negative-soft p-2.5 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">
                    {t('people.iOwe', { ns: 'portal' })}
                  </span>
                </div>
                {renderAmounts(summary!.totalOwedByUserByCurrency, 'text-base font-700 text-negative')}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (variant === 'owedToMe') {
    return (
      <div className="section-card h-full overflow-hidden flex min-h-0 flex-col rounded-[22px]">
        <div className="section-card-header flex flex-row justify-between items-center min-w-0 !px-4 !pt-3 !pb-0">
          <div className="flex items-center gap-2 min-w-0">
            <TrendingUp size={16} className="text-positive flex-shrink-0" />
            <h2 className="text-[14px] font-800 tracking-[-0.02em] text-foreground truncate">
              {t('dashboardSections.moneyOwedToYou', { defaultValue: 'Money Owed to You' })}
            </h2>
          </div>
          <Link
            href="/people"
            className="text-[12px] font-700 text-accent inline-flex items-center gap-1 flex-shrink-0"
          >
            {t('dashboardSections.seeAllBeneficiaries', { defaultValue: 'See all Beneficiaries' })}
            <ArrowRight size={12} />
          </Link>
        </div>
        <div className="section-card-body min-w-0 flex-1 !px-4 !py-3">
          {!hasAnyData || !hasOwedToMe ? (
            <div className="rounded-xl bg-muted/30 px-3 py-2 text-[12px] font-600 text-muted-foreground flex items-center gap-2">
              <TrendingUp size={14} className="text-positive" />
              <span>{t('dashboardSections.moneyOwedToYouEmptyTitle', { defaultValue: 'No receivables pending' })}</span>
            </div>
          ) : (
            <div className="space-y-2 min-w-0">
              <div className="rounded-xl bg-positive-soft p-2.5 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">
                    {t('people.owedToMe', { ns: 'portal' })}
                  </span>
                </div>
                {renderAmounts(summary!.totalOwedToUserByCurrency, 'text-base font-700 text-positive')}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="card-elevated h-full p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-accent" />
          <h3 className="text-sm font-700 text-foreground">{t('people.detail.dashboardTitle', { ns: 'portal' })}</h3>
        </div>
        <Link href="/people" className="text-xs text-accent font-600 hover:underline">
          {t('actions.viewAll', { ns: 'common' })} ({summary!.peopleCount})
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-xl bg-info-soft p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={13} className="text-info" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">{t('people.moneyHeld', { ns: 'portal' })}</span>
          </div>
          {renderAmounts(summary!.totalHeldByCurrency, 'text-base font-700 text-foreground')}
          <p className="text-[10px] text-muted-foreground">{t('people.detail.heldForOthers', { ns: 'portal' })}</p>
        </div>

        <div className="rounded-xl bg-positive-soft p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={13} className="text-positive" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">{t('people.owedToMe', { ns: 'portal' })}</span>
          </div>
          {renderAmounts(summary!.totalOwedToUserByCurrency, 'text-base font-700 text-positive')}
          <p className="text-[10px] text-muted-foreground">{t('people.detail.peopleOweMe', { ns: 'portal' })}</p>
        </div>

        <div className="rounded-xl bg-negative-soft p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={13} className="text-negative" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">{t('people.iOwe', { ns: 'portal' })}</span>
          </div>
          {renderAmounts(summary!.totalOwedByUserByCurrency, 'text-base font-700 text-negative')}
          <p className="text-[10px] text-muted-foreground">{t('people.detail.iOweOthers', { ns: 'portal' })}</p>
        </div>

        <div className="rounded-xl bg-warning-soft p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <RotateCcw size={13} className="text-warning" />
            <span className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">{t('people.detail.pendingReimbursementsShort', { ns: 'portal' })}</span>
          </div>
          {renderAmounts(summary!.pendingReimbByCurrency, 'text-base font-700 text-warning')}
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
