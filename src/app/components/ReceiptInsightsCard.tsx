'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Repeat, ShoppingBag, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { getNotificationPreferences, type NotificationPreferences } from '@/lib/notifications';
import type { DashboardActivePeriod } from '@/lib/finance';
import { formatCurrencyValue } from '@/lib/currency-formatting';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';

type ReceiptDashboardInsight = {
  id: string;
  type: 'top_repeated_item' | 'price_increase' | 'recurring_due' | 'highest_spend_item';
  itemName?: string | null;
  purchaseCount?: number | null;
  percentageChange?: number | null;
  dueDate?: string | null;
  totalSpent?: number | null;
  currency?: string | null;
  actionItemName?: string | null;
};

function formatInsightDate(value: string | null | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default function ReceiptInsightsCard({ activePeriod }: { activePeriod: DashboardActivePeriod }) {
  const { t } = useTranslation('portal');
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const isArabic = language === 'ar';
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<ReceiptDashboardInsight[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [response, nextPreferences] = await Promise.all([
        fetch(`/api/reports/item-insights?mode=dashboard&startDate=${activePeriod.startDate}&endDate=${activePeriod.endDate}`, {
          credentials: 'include',
          cache: 'no-store',
        }),
        getNotificationPreferences(),
      ]);
      const payload = await response.json().catch(() => ({}));
      setInsights(Array.isArray(payload?.insights) ? payload.insights : []);
      setPreferences(nextPreferences);
    } catch {
      setInsights([]);
      setPreferences(null);
    } finally {
      setLoading(false);
    }
  }, [activePeriod.endDate, activePeriod.startDate]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['transactions', 'transaction_documents', 'notifications', 'dashboard'], 'ReceiptInsightsCard', async () => {
    await load();
  });

  const visibleInsights = useMemo(() => insights.filter((insight) => {
    if (!preferences) return true;
    if (insight.type === 'price_increase') return preferences.significant_item_price_increase_alerts;
    if (insight.type === 'recurring_due') return preferences.recurring_purchase_due_alerts;
    if (insight.type === 'highest_spend_item') return preferences.high_item_or_category_spend_alerts;
    return true;
  }).slice(0, 3), [insights, preferences]);

  const getIcon = (type: ReceiptDashboardInsight['type']) => {
    if (type === 'price_increase') return TrendingUp;
    if (type === 'recurring_due') return Repeat;
    if (type === 'highest_spend_item') return AlertTriangle;
    return ShoppingBag;
  };

  const getInsightTitle = (insight: ReceiptDashboardInsight) => {
    switch (insight.type) {
      case 'top_repeated_item':
        return t('receiptInsights.types.topRepeatedItem.title');
      case 'price_increase':
        return t('receiptInsights.types.priceIncrease.title');
      case 'recurring_due':
        return t('receiptInsights.types.recurringDue.title');
      case 'highest_spend_item':
        return t('receiptInsights.types.highestSpendItem.title');
      default:
        return t('receiptInsights.title');
    }
  };

  const getInsightBody = (insight: ReceiptDashboardInsight) => {
    switch (insight.type) {
      case 'top_repeated_item':
        return t('receiptInsights.types.topRepeatedItem.description', {
          itemName: insight.itemName,
          purchaseCount: insight.purchaseCount ?? 0,
          currency: insight.currency,
        });
      case 'price_increase':
        return t('receiptInsights.types.priceIncrease.description', {
          itemName: insight.itemName,
          percent: Math.round(insight.percentageChange ?? 0),
        });
      case 'recurring_due':
        return t('receiptInsights.types.recurringDue.description', {
          itemName: insight.itemName,
          dueDate: formatInsightDate(insight.dueDate, locale) || insight.dueDate,
        });
      case 'highest_spend_item': {
        const amountText = insight.totalSpent !== null && insight.totalSpent !== undefined
          ? formatCurrencyValue(insight.totalSpent, {
              currencyCode: insight.currency || undefined,
              locale,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }).text
          : null;
        return t('receiptInsights.types.highestSpendItem.description', {
          itemName: insight.itemName,
          amount: amountText || insight.currency || '',
        });
      }
      default:
        return '';
    }
  };

  return (
    <div className="card-elevated h-full rounded-[28px] border border-border/80 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <ShoppingBag size={18} />
            </div>
            <div>
              <h3 className={`font-800 text-foreground ${isArabic ? 'text-[1.05rem] leading-6' : 'text-base'}`}>{t('receiptInsights.title')}</h3>
              <p className={`text-muted-foreground ${isArabic ? 'text-[12.5px] leading-5' : 'text-xs'}`}>{t('receiptInsights.description')}</p>
            </div>
          </div>
        </div>
        <Link href="/reports/item-insights" className="text-sm font-700 text-accent transition-colors hover:text-accent/80">
          {t('receiptInsights.link')}
        </Link>
      </div>

      {loading ? (
        <div className="flex min-h-[180px] items-center justify-center">
          <Loader2 size={18} className="animate-spin text-accent" />
        </div>
      ) : visibleInsights.length === 0 ? (
        <div className={`rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-muted-foreground ${isArabic ? 'text-[13px] leading-6' : 'text-sm'}`}>
          {t('receiptInsights.empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleInsights.map((insight) => {
            const Icon = getIcon(insight.type);
            return (
              <div key={insight.id} className="rounded-2xl border border-border p-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-muted/50 text-accent">
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className={`font-700 text-foreground ${isArabic ? 'text-[14.5px] leading-6' : 'text-sm'}`}>{getInsightTitle(insight)}</p>
                    <p className={`mt-1 text-muted-foreground ${isArabic ? 'text-[13px] leading-6' : 'text-sm'}`}>{getInsightBody(insight)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
