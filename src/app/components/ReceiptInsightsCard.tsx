'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Loader2, Repeat, ShoppingBag, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { getNotificationPreferences, type NotificationPreferences } from '@/lib/notifications';
import type { DashboardActivePeriod } from '@/lib/finance';

type ReceiptDashboardInsight = {
  id: string;
  type: 'top_repeated_item' | 'price_increase' | 'recurring_due' | 'highest_spend_item';
  title: string;
  body: string;
  actionItemName?: string | null;
};

export default function ReceiptInsightsCard({ activePeriod }: { activePeriod: DashboardActivePeriod }) {
  const { t } = useTranslation('portal');
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

  return (
    <div className="card-elevated h-full rounded-[28px] border border-border/80 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <ShoppingBag size={18} />
            </div>
            <div>
              <h3 className="text-base font-800 text-foreground">{t('receiptInsights.title', { defaultValue: 'Receipt Insights' })}</h3>
              <p className="text-xs text-muted-foreground">{t('receiptInsights.description', { defaultValue: 'A compact view of repeated items, price changes, and upcoming purchases.' })}</p>
            </div>
          </div>
        </div>
        <Link href="/reports/item-insights" className="text-sm font-700 text-accent transition-colors hover:text-accent/80">
          {t('receiptInsights.link', { defaultValue: 'Item Insights' })}
        </Link>
      </div>

      {loading ? (
        <div className="flex min-h-[180px] items-center justify-center">
          <Loader2 size={18} className="animate-spin text-accent" />
        </div>
      ) : visibleInsights.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          {t('receiptInsights.empty', { defaultValue: 'No receipt insights are available for the selected period.' })}
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
                    <p className="text-sm font-700 text-foreground">{insight.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{insight.body}</p>
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
