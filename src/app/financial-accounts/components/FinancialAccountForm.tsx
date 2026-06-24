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
import type { FinancialBankAccountType } from '@/lib/financial-account-utils';

interface AccountFormData {
  name: string;
  account_type: string;
  ownership_type: string;
  currency: string;
  opening_balance: string;
  notes: string;
  include_in_total: boolean;
  is_active: boolean;
  bank_name: string;
  account_holder_name: string;
  account_number_masked: string;
  iban: string;
  swift_bic: string;
  branch_name: string;
  bank_account_type: string;
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
    ownership_type: 'personal',
    currency: '',
    opening_balance: '0.00',
    notes: '',
    include_in_total: true,
    is_active: true,
    bank_name: '',
    account_holder_name: '',
    account_number_masked: '',
    iban: '',
    swift_bic: '',
    branch_name: '',
    bank_account_type: 'current',
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
        ownership_type: account.ownership_type || 'personal',
        currency: account.currency,
        opening_balance: String(account.opening_balance),
        notes: account.notes || '',
        include_in_total: account.include_in_total,
        is_active: account.is_active,
        bank_name: account.bank_name || '',
        account_holder_name: account.account_holder_name || '',
        account_number_masked: account.account_number_masked || '',
        iban: account.iban || '',
        swift_bic: account.swift_bic || '',
        branch_name: account.branch_name || '',
        bank_account_type: account.bank_account_type || 'current',
      });
      return;
    }

    setForm({
      name: '',
      account_type: 'bank',
      ownership_type: 'personal',
      currency: defaultCurrency,
      opening_balance: '0.00',
      notes: '',
      include_in_total: true,
      is_active: true,
      bank_name: '',
      account_holder_name: '',
      account_number_masked: '',
      iban: '',
      swift_bic: '',
      branch_name: '',
      bank_account_type: 'current',
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
        ownership_type: form.ownership_type as FinancialAccount['ownership_type'],
        currency: form.currency,
        opening_balance: parseFloat(form.opening_balance) || 0,
        notes: form.notes || null,
        include_in_total: form.include_in_total,
        is_active: form.is_active,
        bank_name: form.account_type === 'bank' ? form.bank_name || null : null,
        account_holder_name: form.account_type === 'bank' ? form.account_holder_name || null : null,
        account_number_masked: form.account_type === 'bank' ? form.account_number_masked || null : null,
        iban: form.account_type === 'bank' ? form.iban || null : null,
        swift_bic: form.account_type === 'bank' ? form.swift_bic || null : null,
        branch_name: form.account_type === 'bank' ? form.branch_name || null : null,
        bank_account_type: form.account_type === 'bank'
          ? (form.bank_account_type || null) as FinancialBankAccountType | null
          : null,
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

  const ownershipTypeOptions = [
    { value: 'personal', label: t('accounts.personalOwnershipLabel', { ns: 'portal', defaultValue: 'Personal' }) },
    { value: 'shared', label: t('accounts.sharedOwnershipLabel', { ns: 'portal', defaultValue: 'Shared' }) },
    { value: 'business', label: t('accounts.businessOwnershipLabel', { ns: 'portal', defaultValue: 'Business' }) },
    { value: 'other', label: t('accounts.otherOwnershipLabel', { ns: 'portal', defaultValue: 'Other' }) },
  ];

  const bankAccountTypeOptions = [
    { value: 'current', label: t('accounts.bankAccountTypes.current', { ns: 'portal', defaultValue: 'Current' }) },
    { value: 'savings', label: t('accounts.bankAccountTypes.savings', { ns: 'portal', defaultValue: 'Savings' }) },
    { value: 'credit_card', label: t('accounts.bankAccountTypes.creditCard', { ns: 'portal', defaultValue: 'Credit card' }) },
    { value: 'wallet', label: t('accounts.bankAccountTypes.wallet', { ns: 'portal', defaultValue: 'Wallet' }) },
    { value: 'other', label: t('accounts.bankAccountTypes.other', { ns: 'portal', defaultValue: 'Other' }) },
  ];

  const isBankAccount = form.account_type === 'bank';

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
          <label className="block text-sm font-600 text-foreground mb-1.5">
            {t('accounts.form.ownershipType', { ns: 'portal', defaultValue: 'Ownership type' })} *
          </label>
          <select
            className="input-base"
            value={form.ownership_type}
            onChange={(event) => setForm((current) => ({ ...current, ownership_type: event.target.value }))}
          >
            {ownershipTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.currency', { ns: 'portal' })} *</label>
          <CurrencySelector
            value={form.currency}
            onChange={(currencyCode) => setForm((current) => ({ ...current, currency: currencyCode }))}
            showCountryCount
            placeholder={t('settlements.chooseCurrency', { ns: 'portal' })}
          />
        </div>
        <label className="flex items-center gap-3 rounded-xl bg-muted/40 p-3 sm:mt-7">
          <input
            type="checkbox"
            className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
            checked={form.is_active}
            onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
          />
          <span className="text-sm font-500 text-foreground">
            {t('accounts.form.activeStatus', { ns: 'portal', defaultValue: 'Active account' })}
          </span>
        </label>
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
      {isBankAccount ? (
        <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-700 text-foreground">
              {t('accounts.form.bankDetailsTitle', { ns: 'portal', defaultValue: 'Bank details' })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('accounts.form.bankDetailsHelper', {
                ns: 'portal',
                defaultValue: 'Only masked account numbers are shown in the app. Use this section for optional banking details.',
              })}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('accounts.form.bankName', { ns: 'portal', defaultValue: 'Bank name' })}
              </label>
              <input
                type="text"
                className="input-base"
                value={form.bank_name}
                onChange={(event) => setForm((current) => ({ ...current, bank_name: event.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('accounts.form.accountHolderName', { ns: 'portal', defaultValue: 'Account holder name' })}
              </label>
              <input
                type="text"
                className="input-base"
                value={form.account_holder_name}
                onChange={(event) => setForm((current) => ({ ...current, account_holder_name: event.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('accounts.form.maskedAccountNumber', { ns: 'portal', defaultValue: 'Masked account number' })}
              </label>
              <input
                type="text"
                className="input-base"
                placeholder="****1234"
                value={form.account_number_masked}
                onChange={(event) => setForm((current) => ({ ...current, account_number_masked: event.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('accounts.form.bankAccountType', { ns: 'portal', defaultValue: 'Bank account type' })}
              </label>
              <select
                className="input-base"
                value={form.bank_account_type}
                onChange={(event) => setForm((current) => ({ ...current, bank_account_type: event.target.value }))}
              >
                {bankAccountTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('accounts.form.iban', { ns: 'portal', defaultValue: 'IBAN' })}
              </label>
              <input
                type="text"
                className="input-base"
                value={form.iban}
                onChange={(event) => setForm((current) => ({ ...current, iban: event.target.value.toUpperCase() }))}
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('accounts.form.swiftBic', { ns: 'portal', defaultValue: 'SWIFT / BIC' })}
              </label>
              <input
                type="text"
                className="input-base"
                value={form.swift_bic}
                onChange={(event) => setForm((current) => ({ ...current, swift_bic: event.target.value.toUpperCase() }))}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">
              {t('accounts.form.branchName', { ns: 'portal', defaultValue: 'Branch name' })}
            </label>
            <input
              type="text"
              className="input-base"
              value={form.branch_name}
              onChange={(event) => setForm((current) => ({ ...current, branch_name: event.target.value }))}
            />
          </div>
        </div>
      ) : null}
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
