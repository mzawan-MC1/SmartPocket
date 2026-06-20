'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Repeat, Plus, Play, Pause, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import {
  canAutoAdvanceRecurringTransaction,
  formatRecurringFrequencyLabel,
  getRecurringTransactions, updateRecurringTransaction,
  markRecurringAsPaid, getAccounts, getCategories,
  type RecurringTransaction, type FinancialAccount, type Category,
} from '@/lib/finance';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import RecurringTransactionForm from './components/RecurringTransactionForm';

function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return normalized.length === 3 ? normalized : 'USD';
}

export default function RecurringPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([getRecurringTransactions(), getAccounts(), getCategories()])
      .then(([recs, accts, cats]) => {
        setRecurring(recs);
        setAccounts(accts.filter((a) => a.is_active));
        setCategories(cats);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useSmartPocketDataChanged(['recurring_transactions', 'financial_accounts', 'profile'], 'RecurringPage', async () => {
    load();
  });

  const handleTogglePause = async (item: RecurringTransaction) => {
    try {
      await updateRecurringTransaction(item.id, { is_active: !item.is_active });
      toast.success(item.is_active ? `Paused ${item.description}` : `Resumed ${item.description}`);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    }
  };

  const handleMarkPaid = async (item: RecurringTransaction) => {
    setMarkingId(item.id);
    try {
      await markRecurringAsPaid(item);
      toast.success(`${item.description} marked as paid — next due date updated`);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to mark as paid');
    } finally {
      setMarkingId(null);
    }
  };

  const handleDelete = async (item: RecurringTransaction) => {
    if (!confirm(`Delete "${item.description}"?`)) return;
    try {
      await updateRecurringTransaction(item.id, { is_active: false });
      toast.success('Recurring transaction removed');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const activeItems = recurring.filter((r) => r.is_active);
  const pausedItems = recurring.filter((r) => !r.is_active);
  const groupByCurrency = (items: RecurringTransaction[]) =>
    Array.from(
      items.reduce((map, item) => {
        const currency = normalizeCurrencyCode(item.currency);
        map.set(currency, (map.get(currency) || 0) + Number(item.amount || 0));
        return map;
      }, new Map<string, number>())
    ).map(([currency, amount]) => ({ currency, amount }));

  const totalMonthly = groupByCurrency(activeItems.filter((r) => r.transaction_type === 'expense'));
  const totalIncome = groupByCurrency(activeItems.filter((r) => r.transaction_type === 'income'));
  const netMonthlyMap = new Map<string, number>();
  for (const row of totalIncome) {
    netMonthlyMap.set(row.currency, (netMonthlyMap.get(row.currency) || 0) + row.amount);
  }
  for (const row of totalMonthly) {
    netMonthlyMap.set(row.currency, (netMonthlyMap.get(row.currency) || 0) - row.amount);
  }
  const netMonthly = Array.from(netMonthlyMap.entries()).map(([currency, amount]) => ({ currency, amount }));

  return (
    <AppLayout activeRoute="/recurring">
      <div className="page-section max-[480px]:gap-3">
        <PageHeader
          title="Recurring Transactions"
          description="Manage subscriptions, bills, and regular income with clear due-date tracking."
          badge={<StatusBadge status="info" label="Recurring" />}
          compact
          className="max-[480px]:gap-2 [&_.page-subtitle]:max-[480px]:hidden"
          actionsClassName="w-full sm:w-auto"
          actions={
            <button onClick={() => setShowAddModal(true)} className="btn-primary max-[480px]:w-full">
              <Plus size={16} /> Add Recurring
            </button>
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-3">
          <div className="card-elevated p-4 max-[480px]:p-3">
            <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Scheduled Expenses</p>
            <div className="text-xl font-700 font-tabular text-negative">
              {totalMonthly.map((row) => (
                <FormattedCurrencyAmount key={`expense-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-xl font-700 text-negative" showCode />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{activeItems.filter((r) => r.transaction_type === 'expense').length} active recurring expenses</p>
          </div>
          <div className="card-elevated p-4 max-[480px]:p-3">
            <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Scheduled Income</p>
            <div className="text-xl font-700 font-tabular text-positive">
              {totalIncome.map((row) => (
                <FormattedCurrencyAmount key={`income-${row.currency}`} amount={row.amount} currencyCode={row.currency} className="text-xl font-700 text-positive" showCode />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{activeItems.filter((r) => r.transaction_type === 'income').length} income sources</p>
          </div>
          <div className="card-elevated p-4 max-[480px]:p-3">
            <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Net Scheduled</p>
            <div className="text-xl font-700 font-tabular">
              {netMonthly.map((row) => (
                <FormattedCurrencyAmount
                  key={`net-${row.currency}`}
                  amount={row.amount}
                  currencyCode={row.currency}
                  className={`text-xl font-700 ${row.amount >= 0 ? 'text-positive' : 'text-negative'}`}
                  showCode
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across active supported schedules</p>
          </div>
        </div>

        {/* Recurring List */}
          <div className="card-elevated overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-4 max-[480px]:px-3 max-[480px]:py-3">
            <h2 className="text-base font-700 text-foreground">Active Recurring</h2>
            <span className="text-xs text-muted-foreground">{activeItems.length} active</span>
          </div>

          {loading ? (
            <div className="divide-y divide-border">
              {[...Array(4)].map((_, i) => (
                <div key={`skel-rec-${i}`} className="flex items-center gap-4 p-4 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-muted flex-shrink-0" />
                  <div className="flex-1">
                    <div className="h-3 bg-muted rounded w-36 mb-1.5" />
                    <div className="h-2.5 bg-muted rounded w-48" />
                  </div>
                  <div className="h-4 bg-muted rounded w-20" />
                </div>
              ))}
            </div>
          ) : activeItems.length === 0 ? (
            <div className="p-12">
              <EmptyState
                icon={Repeat}
                title="No recurring transactions"
                description="Add subscriptions, bills, or regular income to track them here."
                action={{ label: 'Add Recurring', onClick: () => setShowAddModal(true) }}
              />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {activeItems.map((item) => {
                const canMarkPaid = canAutoAdvanceRecurringTransaction(item.frequency);
                return (
                <div key={item.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/30 max-[480px]:items-start max-[480px]:gap-3 max-[480px]:p-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.transaction_type === 'income' ? 'bg-positive-soft' : 'bg-negative-soft'}`}>
                    <Repeat size={18} className={item.transaction_type === 'income' ? 'text-positive' : 'text-negative'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-600 text-foreground truncate">{item.description}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.merchant && `${item.merchant} · `}{formatRecurringFrequencyLabel(item.frequency)} · Next: {item.next_due_date}
                      {item.account && ` · ${item.account.name}`}
                    </p>
                    {!canMarkPaid ? (
                      <p className="mt-1 text-[10px] font-600 text-warning">Recurring schedule is incomplete for automatic next-date calculation.</p>
                    ) : null}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-700 font-tabular ${item.transaction_type === 'income' ? 'text-positive' : 'text-negative'}`}>
                      <FormattedCurrencyAmount
                        amount={item.transaction_type === 'income' ? Number(item.amount) : -Math.abs(Number(item.amount))}
                        currencyCode={item.currency}
                        className={`text-sm font-700 ${item.transaction_type === 'income' ? 'text-positive' : 'text-negative'}`}
                        showCode
                      />
                    </p>
                    <div className="flex items-center gap-1 mt-1 justify-end">
                      <button
                        onClick={() => handleMarkPaid(item)}
                        disabled={markingId === item.id || !canMarkPaid}
                        className="flex items-center gap-0.5 text-[10px] font-600 text-accent hover:text-teal-600 transition-colors disabled:opacity-50"
                        aria-label="Mark as paid"
                      >
                        {markingId === item.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                        Paid
                      </button>
                      <button onClick={() => handleTogglePause(item)} className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center" aria-label="Pause">
                        <Pause size={12} className="text-warning" />
                      </button>
                      <button onClick={() => handleDelete(item)} className="w-6 h-6 rounded hover:bg-negative-soft flex items-center justify-center" aria-label="Delete">
                        <Trash2 size={12} className="text-negative" />
                      </button>
                    </div>
                  </div>
                </div>
              )})}
            </div>
          )}
        </div>

        {/* Paused Items */}
        {pausedItems.length > 0 && (
          <div className="card-elevated overflow-hidden">
            <div className="border-b border-border p-4 max-[480px]:px-3 max-[480px]:py-3">
              <h2 className="text-base font-700 text-muted-foreground">Paused ({pausedItems.length})</h2>
            </div>
            <div className="divide-y divide-border">
              {pausedItems.map((item) => (
                <div key={item.id} className="flex items-center gap-4 p-4 opacity-60 hover:bg-muted/30 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                    <Repeat size={18} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-600 text-foreground truncate">{item.description}</p>
                    <p className="text-xs text-muted-foreground">{formatRecurringFrequencyLabel(item.frequency)} · Paused</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleTogglePause(item)} className="w-7 h-7 rounded hover:bg-muted flex items-center justify-center" aria-label="Resume">
                      <Play size={13} className="text-positive" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); }} title="Add Recurring Transaction" size="md">
        <RecurringTransactionForm
          accounts={accounts}
          categories={categories}
          onSuccess={() => {
            setShowAddModal(false);
            load();
          }}
          onCancel={() => { setShowAddModal(false); }}
        />
      </Modal>
    </AppLayout>
  );
}
