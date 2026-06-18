'use client';
import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createBudget, getCategories, type Category } from '@/lib/finance';
import { useEffect } from 'react';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { resolveUserDefaultCurrency } from '@/lib/currency-totals';

interface AddBudgetFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function AddBudgetForm({ onSuccess, onCancel }: AddBudgetFormProps) {
  const { data: referenceData } = useClientReferenceData();
  const [isLoading, setIsLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState({
    name: '',
    category_id: '',
    amount: '',
    currency: referenceData?.platformDefaultCurrency || '',
    period: 'monthly',
    alert_at_percent: '80',
  });

  useEffect(() => {
    getCategories('expense').then(setCategories).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void resolveUserDefaultCurrency(referenceData?.platformDefaultCurrency).then((currencyCode) => {
      if (!cancelled) {
        setForm((current) => (current.currency ? current : { ...current, currency: currencyCode }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [referenceData?.platformDefaultCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() && !form.category_id) { toast.error('Enter a name or select a category'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return; }
    setIsLoading(true);
    try {
      const now = new Date();
      await createBudget({
        name: form.name || categories.find((c) => c.id === form.category_id)?.name || 'Budget',
        category_id: form.category_id || null,
        amount: parseFloat(form.amount),
        currency: form.currency,
        period: form.period as 'monthly' | 'weekly' | 'yearly' | 'custom',
        period_start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
        alert_at_percent: parseInt(form.alert_at_percent) || 80,
        is_active: true,
      });
      onSuccess();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create budget');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Category</label>
        <select className="input-base" value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
          <option value="">Overall Budget (no category)</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Budget Name</label>
        <input type="text" className="input-base" placeholder="e.g. Food & Dining" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Amount *</label>
          <input type="number" step="0.01" min="0.01" className="input-base font-tabular" placeholder="0.00" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Currency</label>
          <CurrencySelector
            value={form.currency}
            onChange={(currencyCode) => setForm((f) => ({ ...f, currency: currencyCode }))}
            placeholder="Choose currency"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Period</label>
          <select className="input-base" value={form.period} onChange={(e) => setForm((f) => ({ ...f, period: e.target.value }))}>
            <option value="monthly">Monthly</option>
            <option value="weekly">Weekly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Alert at %</label>
          <input type="number" min="1" max="100" className="input-base" value={form.alert_at_percent} onChange={(e) => setForm((f) => ({ ...f, alert_at_percent: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? <><Loader2 size={15} className="animate-spin" /> Creating...</> : 'Create Budget'}
        </button>
      </div>
    </form>
  );
}
