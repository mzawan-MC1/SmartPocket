'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import {
  createRecurringTransaction,
  getAccounts,
  getCategories,
  type Category,
  type FinancialAccount,
  type RecurringTransaction,
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

export default function RecurringTransactionForm({
  onSuccess,
  onCancel,
  accounts: providedAccounts,
  categories: providedCategories,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  accounts?: FinancialAccount[];
  categories?: Category[];
}) {
  const [accounts, setAccounts] = useState<FinancialAccount[]>(providedAccounts || []);
  const [categories, setCategories] = useState<Category[]>(providedCategories || []);
  const [loadingSupportingData, setLoadingSupportingData] = useState(!providedAccounts || !providedCategories);
  const [isLoading, setIsLoading] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<RecurringFormData>({
    defaultValues: {
      transaction_type: 'expense',
      frequency: 'monthly',
      next_due_date: new Date().toISOString().split('T')[0],
    },
  });

  useEffect(() => {
    if (providedAccounts) setAccounts(providedAccounts);
    if (providedCategories) setCategories(providedCategories);
  }, [providedAccounts, providedCategories]);

  useEffect(() => {
    if (providedAccounts && providedCategories) {
      setLoadingSupportingData(false);
      return;
    }

    setLoadingSupportingData(true);
    Promise.all([
      providedAccounts ? Promise.resolve(providedAccounts) : getAccounts(),
      providedCategories ? Promise.resolve(providedCategories) : getCategories(),
    ])
      .then(([nextAccounts, nextCategories]) => {
        if (!providedAccounts) setAccounts(nextAccounts.filter((account) => account.is_active));
        if (!providedCategories) setCategories(nextCategories);
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load recurring form data'))
      .finally(() => setLoadingSupportingData(false));
  }, [providedAccounts, providedCategories]);

  const txnType = watch('transaction_type');
  const filteredCategories = useMemo(
    () => categories.filter((category) => category.category_type === txnType),
    [categories, txnType]
  );

  const onSubmit = async (data: RecurringFormData) => {
    if (!data.account_id) {
      toast.error('Please select an account');
      return;
    }

    setIsLoading(true);
    try {
      const selectedAccount = accounts.find((account) => account.id === data.account_id);
      if (!selectedAccount?.currency) {
        toast.error('Selected account is missing a currency');
        return;
      }

      await createRecurringTransaction({
        account_id: data.account_id,
        category_id: data.category_id || null,
        transaction_type: data.transaction_type,
        amount: parseFloat(data.amount),
        currency: selectedAccount.currency,
        description: data.description,
        merchant: data.merchant || null,
        frequency: data.frequency as RecurringTransaction['frequency'],
        next_due_date: data.next_due_date,
        is_active: true,
        auto_create: false,
      });

      dispatchSmartPocketDataChanged({
        source: 'recurring-transaction-form',
        entities: ['recurring_transactions', 'dashboard'],
      });
      toast.success('Recurring transaction created');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create recurring transaction');
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingSupportingData) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-6 text-center">
        <Loader2 size={18} className="mx-auto mb-2 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">Loading recurring form...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div>
        <label htmlFor="rec-desc-shared" className="block text-sm font-600 text-foreground mb-1.5">Description *</label>
        <input id="rec-desc-shared" type="text" className={`input-base ${errors.description ? 'input-error' : ''}`} placeholder="e.g. Netflix Subscription"
          {...register('description', { required: 'Description is required' })}
        />
        {errors.description && <p className="mt-1.5 text-xs text-negative font-500">{errors.description.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rec-type-shared" className="block text-sm font-600 text-foreground mb-1.5">Type</label>
          <select id="rec-type-shared" className="input-base" {...register('transaction_type')}>
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </div>
        <div>
          <label htmlFor="rec-freq-shared" className="block text-sm font-600 text-foreground mb-1.5">Frequency</label>
          <select id="rec-freq-shared" className="input-base" {...register('frequency')}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Twice a month and custom recurring schedules need dedicated recurrence fields and are not available yet.
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="rec-account-shared" className="block text-sm font-600 text-foreground mb-1.5">Account *</label>
        <select id="rec-account-shared" className={`input-base ${errors.account_id ? 'input-error' : ''}`} {...register('account_id', { required: 'Select an account' })}>
          <option value="">Select account...</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        {errors.account_id && <p className="mt-1.5 text-xs text-negative font-500">{errors.account_id.message}</p>}
      </div>

      <div>
        <label htmlFor="rec-category-shared" className="block text-sm font-600 text-foreground mb-1.5">Category</label>
        <select id="rec-category-shared" className="input-base" {...register('category_id')}>
          <option value="">No category</option>
          {filteredCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="rec-amount-shared" className="block text-sm font-600 text-foreground mb-1.5">Amount *</label>
        <input id="rec-amount-shared" type="number" step="0.01" min="0.01" className={`input-base font-tabular ${errors.amount ? 'input-error' : ''}`} placeholder="0.00"
          {...register('amount', { required: 'Amount is required', min: { value: 0.01, message: 'Must be greater than 0' } })}
        />
        {errors.amount && <p className="mt-1.5 text-xs text-negative font-500">{errors.amount.message}</p>}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rec-merchant-shared" className="block text-sm font-600 text-foreground mb-1.5">Merchant</label>
          <input id="rec-merchant-shared" type="text" className="input-base" placeholder="e.g. Netflix" {...register('merchant')} />
        </div>
        <div>
          <label htmlFor="rec-next-date-shared" className="block text-sm font-600 text-foreground mb-1.5">Next Due Date</label>
          <input id="rec-next-date-shared" type="date" className="input-base" {...register('next_due_date')} />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? <><Loader2 size={15} className="animate-spin" /> Creating...</> : 'Add Recurring'}
        </button>
      </div>
    </form>
  );
}
