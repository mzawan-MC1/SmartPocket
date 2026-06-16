'use client';
import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { Repeat, Plus, Play, Pause, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  getRecurringTransactions, createRecurringTransaction, updateRecurringTransaction,
  markRecurringAsPaid, getAccounts, getCategories,
  type RecurringTransaction, type FinancialAccount, type Category,
} from '@/lib/finance';

interface RecurringFormData {
  description: string;
  amount: string;
  transaction_type: 'income' | 'expense';
  frequency: string;
  next_due_date: string;
  merchant: string;
  account_id: string;
  category_id: string;
}

export default function RecurringPage() {
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<RecurringFormData>({
    defaultValues: {
      transaction_type: 'expense',
      frequency: 'monthly',
      next_due_date: new Date().toISOString().split('T')[0],
    },
  });

  const txnType = watch('transaction_type');

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

  const onSubmit = async (data: RecurringFormData) => {
    if (!data.account_id) { toast.error('Please select an account'); return; }
    setIsLoading(true);
    try {
      await createRecurringTransaction({
        account_id: data.account_id,
        category_id: data.category_id || null,
        transaction_type: data.transaction_type,
        amount: parseFloat(data.amount),
        currency: accounts.find((a) => a.id === data.account_id)?.currency || 'AED',
        description: data.description,
        merchant: data.merchant || null,
        frequency: data.frequency as RecurringTransaction['frequency'],
        next_due_date: data.next_due_date,
        is_active: true,
        auto_create: false,
      });
      toast.success('Recurring transaction created');
      reset();
      setShowAddModal(false);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create recurring transaction');
    } finally {
      setIsLoading(false);
    }
  };

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
  const totalMonthly = activeItems.filter((r) => r.transaction_type === 'expense').reduce((s, r) => s + Number(r.amount), 0);
  const totalIncome = activeItems.filter((r) => r.transaction_type === 'income').reduce((s, r) => s + Number(r.amount), 0);

  const filteredCategories = categories.filter((c) => c.category_type === txnType);

  return (
    <AppLayout activeRoute="/recurring">
      <div className="page-section">
        <PageHeader
          title="Recurring Transactions"
          description="Manage subscriptions, bills, and regular income with clear due-date tracking."
          badge={<StatusBadge status="info" label="Recurring" />}
          actions={
            <button onClick={() => setShowAddModal(true)} className="btn-primary">
              <Plus size={16} /> Add Recurring
            </button>
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card-elevated p-4">
            <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Monthly Expenses</p>
            <p className="text-xl font-700 font-tabular text-negative">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(totalMonthly)}</p>
            <p className="text-xs text-muted-foreground mt-1">{activeItems.filter((r) => r.transaction_type === 'expense').length} active subscriptions</p>
          </div>
          <div className="card-elevated p-4">
            <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Monthly Income</p>
            <p className="text-xl font-700 font-tabular text-positive">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(totalIncome)}</p>
            <p className="text-xs text-muted-foreground mt-1">{activeItems.filter((r) => r.transaction_type === 'income').length} income sources</p>
          </div>
          <div className="card-elevated p-4">
            <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">Net Monthly</p>
            <p className={`text-xl font-700 font-tabular ${totalIncome - totalMonthly >= 0 ? 'text-positive' : 'text-negative'}`}>
              {totalIncome - totalMonthly >= 0 ? '+' : ''}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(totalIncome - totalMonthly)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">After recurring expenses</p>
          </div>
        </div>

        {/* Recurring List */}
        <div className="card-elevated overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
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
              {activeItems.map((item) => (
                <div key={item.id} className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${item.transaction_type === 'income' ? 'bg-positive-soft' : 'bg-negative-soft'}`}>
                    <Repeat size={18} className={item.transaction_type === 'income' ? 'text-positive' : 'text-negative'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-600 text-foreground truncate">{item.description}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.merchant && `${item.merchant} · `}{item.frequency} · Next: {item.next_due_date}
                      {item.account && ` · ${item.account.name}`}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-sm font-700 font-tabular ${item.transaction_type === 'income' ? 'text-positive' : 'text-negative'}`}>
                      {item.transaction_type === 'income' ? '+' : '-'}{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(item.amount)}
                    </p>
                    <div className="flex items-center gap-1 mt-1 justify-end">
                      <button
                        onClick={() => handleMarkPaid(item)}
                        disabled={markingId === item.id}
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
              ))}
            </div>
          )}
        </div>

        {/* Paused Items */}
        {pausedItems.length > 0 && (
          <div className="card-elevated overflow-hidden">
            <div className="p-4 border-b border-border">
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
                    <p className="text-xs text-muted-foreground">{item.frequency} · Paused</p>
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
      <Modal isOpen={showAddModal} onClose={() => { setShowAddModal(false); reset(); }} title="Add Recurring Transaction" size="md">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="rec-desc" className="block text-sm font-600 text-foreground mb-1.5">Description *</label>
            <input id="rec-desc" type="text" className={`input-base ${errors.description ? 'input-error' : ''}`} placeholder="e.g. Netflix Subscription"
              {...register('description', { required: 'Description is required' })}
            />
            {errors.description && <p className="mt-1.5 text-xs text-negative font-500">{errors.description.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rec-type" className="block text-sm font-600 text-foreground mb-1.5">Type</label>
              <select id="rec-type" className="input-base" {...register('transaction_type')}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
            <div>
              <label htmlFor="rec-freq" className="block text-sm font-600 text-foreground mb-1.5">Frequency</label>
              <select id="rec-freq" className="input-base" {...register('frequency')}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="rec-account" className="block text-sm font-600 text-foreground mb-1.5">Account *</label>
            <select id="rec-account" className={`input-base ${errors.account_id ? 'input-error' : ''}`} {...register('account_id', { required: 'Select an account' })}>
              <option value="">Select account...</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            {errors.account_id && <p className="mt-1.5 text-xs text-negative font-500">{errors.account_id.message}</p>}
          </div>

          <div>
            <label htmlFor="rec-category" className="block text-sm font-600 text-foreground mb-1.5">Category</label>
            <select id="rec-category" className="input-base" {...register('category_id')}>
              <option value="">No category</option>
              {filteredCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="rec-amount" className="block text-sm font-600 text-foreground mb-1.5">Amount *</label>
            <input id="rec-amount" type="number" step="0.01" min="0.01" className={`input-base font-tabular ${errors.amount ? 'input-error' : ''}`} placeholder="0.00"
              {...register('amount', { required: 'Amount is required', min: { value: 0.01, message: 'Must be greater than 0' } })}
            />
            {errors.amount && <p className="mt-1.5 text-xs text-negative font-500">{errors.amount.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="rec-merchant" className="block text-sm font-600 text-foreground mb-1.5">Merchant</label>
              <input id="rec-merchant" type="text" className="input-base" placeholder="e.g. Netflix" {...register('merchant')} />
            </div>
            <div>
              <label htmlFor="rec-next-date" className="block text-sm font-600 text-foreground mb-1.5">Next Due Date</label>
              <input id="rec-next-date" type="date" className="input-base" {...register('next_due_date')} />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-border">
            <button type="button" onClick={() => { setShowAddModal(false); reset(); }} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={isLoading} className="btn-primary">
              {isLoading ? <><Loader2 size={15} className="animate-spin" /> Creating...</> : 'Add Recurring'}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
