'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import { createAccount, type FinancialAccount, updateAccount } from '@/lib/finance';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { resolveUserDefaultCurrency } from '@/lib/currency-totals';

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
  const { t } = useTranslation(['portal', 'common']);
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
      toast.error(t('accounts.form.nameRequired', { ns: 'portal' }));
      return;
    }
    if (!form.currency) {
      toast.error(t('accounts.form.currencyRequired', { ns: 'portal' }));
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
        toast.success(t('accounts.form.updated', { ns: 'portal' }));
      } else {
        await createAccount(payload);
        toast.success(t('accounts.form.created', { ns: 'portal' }));
      }

      dispatchSmartPocketDataChanged({
        source: 'financial-account-form',
        entities: ['financial_accounts', 'dashboard'],
      });
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('accounts.form.saveFailed', { ns: 'portal' }));
    } finally {
      setIsSaving(false);
    }
  };

  const accountTypeOptions = [
    { value: 'bank', label: t('accounts.types.bank', { ns: 'portal' }) },
    { value: 'credit_card', label: t('accounts.types.creditCard', { ns: 'portal' }) },
    { value: 'savings', label: t('accounts.types.savings', { ns: 'portal' }) },
    { value: 'cash', label: t('accounts.types.cash', { ns: 'portal' }) },
    { value: 'digital_wallet', label: t('accounts.types.digitalWallet', { ns: 'portal' }) },
    { value: 'investment', label: t('accounts.types.investment', { ns: 'portal' }) },
    { value: 'other', label: t('accounts.types.other', { ns: 'portal' }) },
  ];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('accounts.form.name', { ns: 'portal' })} *</label>
        <input
          type="text"
          className="input-base"
          placeholder={t('accounts.form.namePlaceholder', { ns: 'portal' })}
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('accounts.form.type', { ns: 'portal' })} *</label>
          <select className="input-base" value={form.account_type} onChange={(event) => setForm((current) => ({ ...current, account_type: event.target.value }))}>
            {accountTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.currency', { ns: 'portal' })} *</label>
          <CurrencySelector
            value={form.currency}
            onChange={(currencyCode) => setForm((current) => ({ ...current, currency: currencyCode }))}
            showCountryCount
            placeholder={t('settlements.chooseCurrency', { ns: 'portal' })}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('accounts.openingBalance', { ns: 'portal' })}</label>
        <p className="text-xs text-muted-foreground mb-1.5">{t('accounts.form.openingBalanceHelper', { ns: 'portal' })}</p>
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
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('reimbursements.notes', { ns: 'portal' })}</label>
        <textarea rows={2} className="input-base resize-none" placeholder={t('accounts.form.notesPlaceholder', { ns: 'portal' })} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
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
          {t('accounts.form.includeInTotal', { ns: 'portal' })}
        </label>
      </div>
      <div className="flex gap-2 justify-end pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">{t('actions.cancel', { ns: 'common' })}</button>
        <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary">
          {isSaving ? <><Loader2 size={15} className="animate-spin" /> {t('status.saving', { ns: 'common' })}</> : account ? t('accounts.form.updateAction', { ns: 'portal' }) : t('accounts.addAccount', { ns: 'portal' })}
        </button>
      </div>
    </div>
  );
}
