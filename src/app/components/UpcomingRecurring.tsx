'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { getRecurringTransactions, markRecurringAsPaid, type RecurringTransaction } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + 'T00:00:00');
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function UpcomingRecurring() {
  const [items, setItems] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const next7 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    try {
      const all = await getRecurringTransactions();
      const upcoming = all.filter(
        (r) => r.is_active && r.next_due_date >= today && r.next_due_date <= next7
      );
      setItems(upcoming);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useSmartPocketDataChanged(['dashboard', 'transactions', 'financial_accounts', 'recurring_transactions'], 'UpcomingRecurring', async () => {
    await load();
  });

  const handleMarkPaid = async (item: RecurringTransaction) => {
    setMarkingId(item.id);
    try {
      await markRecurringAsPaid(item);
      toast.success(`${item.description} marked as paid`);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark as paid');
    } finally {
      setMarkingId(null);
    }
  };

  const totalDue = items.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <SectionCard
      title="Upcoming Payments"
      description="Recurring items due within the next 7 days."
      action={<StatusBadge status="pending" label="Next 7 days" />}
      bodyClassName="p-0"
    >

      {loading ? (
        <div className="divide-y divide-border">
          {[...Array(3)].map((_, i) => (
            <div key={`skel-rec-${i}`} className="flex items-center gap-3 px-5 py-3 animate-pulse">
              <div className="flex-1">
                <div className="h-3 bg-muted rounded w-36 mb-1.5" />
                <div className="h-2.5 bg-muted rounded w-24" />
              </div>
              <div className="h-4 bg-muted rounded w-16" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="px-5 py-8">
          <EmptyState
            icon={CalendarClock}
            title="No upcoming payments"
            description="No recurring payments due in the next 7 days."
          />
        </div>
      ) : (
        <>
          <div className="divide-y divide-border">
            {items.map((item) => {
              const days = daysUntil(item.next_due_date);
              const urgent = days <= 3;
              const dueDate = new Date(item.next_due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <div key={item.id} className={`flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors ${urgent ? 'bg-warning-soft/30' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {urgent && <AlertCircle size={12} className="text-warning flex-shrink-0" />}
                      <p className="text-sm font-600 text-foreground truncate">{item.description}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {dueDate} · {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days left`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-sm font-700 font-tabular text-foreground">
                      {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(item.amount)}
                    </span>
                    <button
                      onClick={() => handleMarkPaid(item)}
                      disabled={markingId === item.id}
                      className="text-[10px] font-600 text-accent hover:text-teal-600 flex items-center gap-0.5 transition-colors disabled:opacity-50"
                      aria-label={`Mark ${item.description} as paid`}
                    >
                      {markingId === item.id
                        ? <Loader2 size={11} className="animate-spin" />
                        : <CheckCircle2 size={11} />
                      }
                      Mark paid
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-5 py-3 bg-muted/30 border-t border-border">
            <p className="text-xs text-muted-foreground text-center">
              Total due: <span className="font-700 text-foreground font-tabular">
                {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(totalDue)}
              </span>
            </p>
          </div>
        </>
      )}
    </SectionCard>
  );
}
