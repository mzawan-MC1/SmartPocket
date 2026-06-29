'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  canAutoAdvanceRecurringTransaction,
  formatRecurringFrequencyLabel,
  getRecurringTransactions,
  markRecurringAsPaid,
  type DashboardActivePeriod,
  type RecurringTransaction,
} from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { toast } from 'sonner';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { getCurrentBusinessDate } from '@/lib/financial-periods';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';

function daysUntil(dateStr: string, timezone: string): number {
  const today = new Date(`${getCurrentBusinessDate(timezone)}T12:00:00Z`);
  const due = new Date(`${dateStr}T12:00:00Z`);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized.length === 3 ? normalized : 'USD';
}

export default function UpcomingRecurring({
  activePeriod,
}: {
  activePeriod: DashboardActivePeriod;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getRecurringTransactions();
      const upcoming = all.filter(
        (r) => r.is_active && r.next_due_date >= activePeriod.startDate && r.next_due_date <= activePeriod.endDate
      );
      setItems(upcoming);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [activePeriod.endDate, activePeriod.startDate]);

  useEffect(() => { void load(); }, [load]);

  useSmartPocketDataChanged(['dashboard', 'transactions', 'financial_accounts', 'recurring_transactions', 'profile'], 'UpcomingRecurring', async () => {
    await load();
  });

  const handleMarkPaid = async (item: RecurringTransaction) => {
    setMarkingId(item.id);
    try {
      await markRecurringAsPaid(item);
      toast.success(t('recurring.markedPaid', { ns: 'portal', name: item.description }));
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('recurring.markPaidFailed', { ns: 'portal' }));
    } finally {
      setMarkingId(null);
    }
  };

  const totalDueByCurrency = Array.from(
    items.reduce((map, item) => {
      const currency = normalizeCurrencyCode(item.currency);
      map.set(currency, (map.get(currency) || 0) + Number(item.amount || 0));
      return map;
    }, new Map<string, number>())
  ).map(([currency, amount]) => ({ currency, amount }));

  return (
    <SectionCard
      title={t('dashboardMetrics.cards.upcomingPayments', { ns: 'portal' })}
      description={activePeriod.mode === 'month'
        ? t('recurring.widgetDescriptionMonth', { ns: 'portal', period: activePeriod.label })
        : t('recurring.widgetDescriptionPeriod', { ns: 'portal', period: activePeriod.label })}
      className="flex h-full flex-col rounded-[28px] border border-border/80 bg-card shadow-card-sm transition-shadow duration-200 hover:shadow-card-md"
      action={
        <div className="flex items-center gap-2">
          <StatusBadge status="pending" label={activePeriod.label} />
          <Link href="/recurring" className="text-sm font-700 text-accent transition-colors hover:text-teal-600">
            {t('actions.viewAll', { ns: 'common' })}
          </Link>
        </div>
      }
      bodyClassName="flex flex-1 flex-col p-3"
    >

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={`skel-rec-${i}`} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/15 px-3.5 py-3 animate-pulse">
              <div className="flex-1">
                <div className="h-3 bg-muted rounded w-36 mb-1.5" />
                <div className="h-2.5 bg-muted rounded w-24" />
              </div>
              <div className="h-4 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-6 text-center">
          <div className="mb-3 flex h-20 w-20 items-center justify-center rounded-[24px] bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.22),rgba(255,255,255,0.95)_65%)] shadow-[0_22px_46px_-30px_rgba(147,51,234,0.7)]">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-violet-500/12 text-violet-600">
              <CalendarClock size={30} />
            </div>
          </div>
          <p className="text-lg font-800 tracking-[-0.02em] text-foreground">{t('recurring.noUpcomingTitle', { ns: 'portal' })}</p>
          <p className="mt-2 max-w-[16rem] text-[12.5px] leading-5 text-muted-foreground">
            {activePeriod.mode === 'month'
              ? t('recurring.noUpcomingDescriptionMonth', { ns: 'portal', period: activePeriod.label })
              : t('recurring.noUpcomingDescriptionPeriod', { ns: 'portal', period: activePeriod.label })}
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="space-y-2">
            {items.slice(0, 5).map((item) => {
              const days = daysUntil(item.next_due_date, activePeriod.timezone);
              const urgent = activePeriod.isCurrent && days <= 3;
              const canMarkPaid = canAutoAdvanceRecurringTransaction(item.frequency);
              const dueDate = new Date(item.next_due_date + 'T00:00:00').toLocaleDateString(locale, {
                month: 'short',
                day: 'numeric',
                timeZone: 'UTC',
              });
              return (
                <div key={item.id} className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors hover:bg-muted/40 ${urgent ? 'border-warning/20 bg-warning-soft/25' : 'border-transparent bg-muted/15 hover:border-border/70'}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {urgent && <AlertCircle size={12} className="text-warning flex-shrink-0" />}
                      <p className="text-sm font-600 text-foreground truncate">{item.description}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatRecurringFrequencyLabel(item.frequency, t)} · {dueDate} · {activePeriod.isCurrent
                        ? (days === 0
                          ? t('time.today', { ns: 'common' })
                          : days === 1
                            ? t('recurring.tomorrow', { ns: 'portal' })
                            : t('recurring.daysLeft', { ns: 'portal', count: days }))
                        : t('recurring.scheduled', { ns: 'portal' })}
                    </p>
                    {!canMarkPaid ? (
                      <p className="mt-1 text-[10px] font-600 text-warning">{t('recurring.incompleteSchedule', { ns: 'portal' })}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <FormattedCurrencyAmount
                      amount={Number(item.amount)}
                      currencyCode={item.currency}
                      className="text-sm font-700 font-tabular text-foreground"
                      showCode
                    />
                    {activePeriod.isCurrent && canMarkPaid ? (
                      <button
                        onClick={() => handleMarkPaid(item)}
                        disabled={markingId === item.id}
                        className="text-[10px] font-600 text-accent hover:text-teal-600 flex items-center gap-0.5 transition-colors disabled:opacity-50"
                        aria-label={t('recurring.markItemAsPaid', { ns: 'portal', name: item.description })}
                      >
                        {markingId === item.id
                          ? <Loader2 size={11} className="animate-spin" />
                          : <CheckCircle2 size={11} />
                        }
                        {t('recurring.markAsPaid', { ns: 'portal' })}
                      </button>
                    ) : (
                      <span className="text-[10px] font-600 text-muted-foreground">
                        {canMarkPaid ? t('recurring.scheduled', { ns: 'portal' }) : t('recurring.scheduleIncomplete', { ns: 'portal' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 rounded-2xl border border-border/70 bg-muted/20 px-4 py-3">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="min-w-0 text-muted-foreground">
                {activePeriod.mode === 'month'
                  ? t('recurring.totalScheduled', { ns: 'portal' })
                  : t('recurring.totalDueThisPeriod', { ns: 'portal' })}
              </span>
              <span className="flex flex-shrink-0 flex-col items-end whitespace-nowrap font-700 text-foreground font-tabular">
                {totalDueByCurrency.map((row) => (
                  <FormattedCurrencyAmount
                    key={row.currency}
                    amount={row.amount}
                    currencyCode={row.currency}
                    className="font-700 text-foreground"
                    showCode
                  />
                ))}
              </span>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
