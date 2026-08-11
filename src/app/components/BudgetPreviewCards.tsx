'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Target, ArrowRight } from 'lucide-react';
import {
  getBudgetTrackingOverview,
  type BudgetTrackingItem,
  type DashboardActivePeriod,
} from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';

interface BudgetPreviewCardsProps {
  activePeriod: DashboardActivePeriod;
}

function getStatusColorClass(pct: number | null): string {
  if (pct === null) return 'text-muted-foreground';
  if (pct >= 100) return 'text-negative';
  if (pct >= 80) return 'text-warning';
  return 'text-accent';
}

function getBarColorClass(pct: number | null): string {
  if (pct === null) return 'bg-muted-foreground/30';
  if (pct >= 100) return 'budget-bar-red';
  if (pct >= 80) return 'budget-bar-amber';
  return 'budget-bar-green';
}

function getBadgeColorClass(pct: number | null): string {
  if (pct === null) return 'bg-muted/50 text-muted-foreground';
  if (pct >= 100) return 'bg-negative-soft/50 text-negative';
  if (pct >= 80) return 'bg-warning-soft/50 text-warning';
  return 'bg-positive-soft/50 text-positive';
}

function BudgetCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 p-3 h-full flex flex-col gap-3 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-3.5 bg-muted rounded w-24" />
        <div className="h-4 bg-muted rounded w-12" />
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="h-7 bg-muted rounded w-20" />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-3 bg-muted rounded w-16" />
          <div className="h-3 bg-muted rounded w-16" />
        </div>
        <div className="h-2 bg-muted rounded-full" />
      </div>
    </div>
  );
}

export default function BudgetPreviewCards({ activePeriod }: BudgetPreviewCardsProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const [items, setItems] = useState<BudgetTrackingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await getBudgetTrackingOverview({
        referenceDate: activePeriod.startDate,
        locale,
      });
      setItems(overview.items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [activePeriod.startDate, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['budgets', 'transactions'], 'BudgetPreviewCards', async () => {
    await load();
  });

  if (loading) {
    return (
      <>
        {[0, 1, 2, 3].map((i) => (
          <BudgetCardSkeleton key={`budget-skel-${i}`} />
        ))}
      </>
    );
  }

  if (items.length === 0) {
    return (
      <div className="md:col-span-4 col-span-1 rounded-2xl border border-dashed border-border/70 p-4 text-center bg-muted/20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-muted/40 flex items-center justify-center text-muted-foreground">
            <Target size={18} />
          </div>
          <div>
            <h3 className="text-[14px] font-700 text-foreground">
              {t('budgetPreview.emptyTitle', { ns: 'portal', defaultValue: 'No budgets yet' })}
            </h3>
            <p className="mt-1 text-[11.5px] text-muted-foreground max-w-sm">
              {t('budgetPreview.emptyDesc', {
                ns: 'portal',
                defaultValue: 'Set up a budget to track spending against your targets.',
              })}
            </p>
          </div>
          <Link
            href="/budgets"
            className="inline-flex items-center gap-1.5 text-[12px] font-700 text-accent hover:underline"
          >
            {t('budgets.addCategoryBudget', { ns: 'portal', defaultValue: 'Add Budget' })}
            <ArrowRight size={12} />
          </Link>
        </div>
      </div>
    );
  }

  const visibleBudgets = items.slice(0, 4);

  return (
    <>
      {visibleBudgets.map((item) => {
        const budget = item.budget;
        const pct = item.progressPct;
        const spentAmount = item.spentAmount ?? 0;
        const limitAmount = Number(budget.amount) || 0;
        const statusColor = getStatusColorClass(pct);
        const barColor = getBarColorClass(pct);
        const badgeColor = getBadgeColorClass(pct);
        const displayPct = pct !== null ? Math.min(pct, 999) : 0;
        const categoryName = budget.category?.name
          ? translateSystemCategoryName(budget.category.name, t)
          : null;

        return (
          <div
            key={budget.id}
            className="rounded-2xl border border-border/60 bg-card/80 hover:bg-card px-3.5 py-3 transition-colors h-full flex flex-col gap-1.5 min-w-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-700 text-foreground truncate">
                {budget.name}
              </span>
              {categoryName && (
                <span
                  className={`text-[9.5px] font-600 px-1.5 py-[1px] rounded-full truncate flex-shrink-0 ${badgeColor}`}
                >
                  {categoryName}
                </span>
              )}
            </div>

            <div className="flex-1 flex items-center pt-1 min-w-0">
              <div className="w-full flex min-w-0 items-center justify-between gap-2">
                <span className={`text-[20px] font-800 font-tabular ${statusColor} flex-shrink-0`}>
                  {displayPct.toFixed(0)}%
                </span>
                <div className="flex min-w-0 items-center justify-end gap-1.5 text-[11px] whitespace-nowrap">
                  <FormattedCurrencyAmount
                    amount={spentAmount}
                    currencyCode={budget.currency}
                    size="xs"
                    numberClassName="font-600 font-tabular text-muted-foreground"
                  />
                  <span className="text-muted-foreground/70 font-500 flex-shrink-0">/</span>
                  <FormattedCurrencyAmount
                    amount={limitAmount}
                    currencyCode={budget.currency}
                    size="xs"
                    numberClassName="font-600 font-tabular text-muted-foreground"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 mt-auto min-w-0">
              <div className="bg-muted rounded-full overflow-hidden h-1.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                  style={{ width: `${Math.min(displayPct, 100)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
