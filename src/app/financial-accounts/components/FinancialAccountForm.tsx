'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import { createAccount, type FinancialAccount, updateAccount } from '@/lib/finance';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { resolveUserDefaultCurrency } from '@/lib/currency-totals';

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'bank', label: 'Bank Account' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'savings', label: 'Savings' },
  { value: 'cash', label: 'Cash' },
  { value: 'digital_wallet', label: 'Digital Wallet' },
  { value: 'investment', label: 'Investment' },
  { value: 'other', label: 'Other' },
];

interface AccountFormData {
  name: string;
  account_type: string;
  currency: string;
  opening_balance: string;
  notes: string;
  include_in_total: boolean;
}

export default function FinancialAccountForm({
  account,
  onSuccess,
  onCancel,
}: {
  account?: FinancialAccount | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { data: referenceData } = useClientReferenceData();
  const platformDefaultCurrency = referenceData?.platformDefaultCurrency || '';
  const [userDefaultCurrency, setUserDefaultCurrency] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<AccountFormData>({
    name: '',
    account_type: 'bank',
    currency: '',
    opening_balance: '0.00',
    notes: '',
    include_in_total: true,
  });

  const defaultCurrency = useMemo(
    () => userDefaultCurrency || platformDefaultCurrency,
    [platformDefaultCurrency, userDefaultCurrency]
  );

  useEffect(() => {
    let cancelled = false;
    void resolveUserDefaultCurrency(platformDefaultCurrency).then((currencyCode) => {
      if (!cancelled) setUserDefaultCurrency(currencyCode);
    });
    return () => {
      cancelled = true;
    };
  }, [platformDefaultCurrency]);

  useEffect(() => {
    if (account) {
      setForm({
        name: account.name,
        account_type: account.account_type,
        currency: account.currency,
        opening_balance: String(account.opening_balance),
        notes: account.notes || '',
        include_in_total: account.include_in_total,
      });
      return;
    }

    setForm({
      name: '',
      account_type: 'bank',
      currency: defaultCurrency,
      opening_balance: '0.00',
      notes: '',
      include_in_total: true,
    });
  }, [account, defaultCurrency]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Account name is required');
      return;
    }
    if (!form.currency) {
      toast.error('Currency is required');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        account_type: form.account_type as FinancialAccount['account_type'],
        currency: form.currency,
        opening_balance: parseFloat(form.opening_balance) || 0,
        notes: form.notes || null,
        include_in_total: form.include_in_total,
      };

      if (account) {
        await updateAccount(account.id, payload);
        toast.success('Account updated');
      } else {
        await createAccount(payload);
        toast.success('Account created');
      }

      dispatchSmartPocketDataChanged({
        source: 'financial-account-form',
        entities: ['financial_accounts', 'dashboard'],
      });
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save account');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Account Name *</label>
        <input
          type="text"
          className="input-base"
          placeholder="e.g. Chase Checking, Cash Wallet"
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Account Type *</label>
          <select className="input-base" value={form.account_type} onChange={(event) => setForm((current) => ({ ...current, account_type: event.target.value }))}>
            {ACCOUNT_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Currency *</label>
          <CurrencySelector
            value={form.currency}
            onChange={(currencyCode) => setForm((current) => ({ ...current, currency: currencyCode }))}
            showCountryCount
            placeholder="Choose currency"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Opening Balance</label>
        <p className="text-xs text-muted-foreground mb-1.5">Current balance of this account. Use negative for credit card debt.</p>
        <input
          type="number"
          step="0.01"
          className="input-base font-tabular"
          placeholder="0.00"
          value={form.opening_balance}
          onChange={(event) => setForm((current) => ({ ...current, opening_balance: event.target.value }))}
        />
      </div>
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Notes</label>
        <textarea rows={2} className="input-base resize-none" placeholder="Optional notes..." value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
        <input
          id="include-in-total-shared"
          type="checkbox"
          className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
          checked={form.include_in_total}
          onChange={(event) => setForm((current) => ({ ...current, include_in_total: event.target.checked }))}
        />
        <label htmlFor="include-in-total-shared" className="text-sm font-500 text-foreground cursor-pointer">
          Include in total balance calculation
        </label>
      </div>
      <div className="flex gap-2 justify-end pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary">
          {isSaving ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : account ? 'Update Account' : 'Add Account'}
        </button>
      </div>
    </div>
  );
}
