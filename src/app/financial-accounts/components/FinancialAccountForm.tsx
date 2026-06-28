'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import { createAccount, type FinancialAccount, updateAccount } from '@/lib/finance';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { resolveCurrencyPreference } from '@/lib/currency-totals';
import {
  getFinancialAccountScopeType,
  type FinancialBankAccountType,
  type FinancialAccountScopeType,
} from '@/lib/financial-account-utils';
import { getMySpaceMemberships, type Space } from '@/lib/spaces';

interface SharingFormEntry {
  space_id: string;
  space_name: string;
  enabled: boolean;
  can_add_space_transactions: boolean;
  can_view_balance: boolean;
  can_view_full_history: boolean;
}

interface FormSpaceOption {
  id: string;
  name: string;
}

interface AccountFormData {
  name: string;
  account_type: string;
  ownership_type: string;
  scope_type: FinancialAccountScopeType;
  space_id: string;
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
  space_sharing: SharingFormEntry[];
}

const EMPTY_FORM: AccountFormData = {
  name: '',
  account_type: 'bank',
  ownership_type: 'personal',
  scope_type: 'personal',
  space_id: '',
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
  space_sharing: [],
};

function mergeSpaceSharing(
  spaces: FormSpaceOption[],
  account?: FinancialAccount | null
): SharingFormEntry[] {
  const existing = new Map(
    ((account?.space_account_permissions || []).map((permission) => [
      permission.space_id,
      permission,
    ]))
  );

  return spaces.map((space) => {
    const permission = existing.get(space.id);
    return {
      space_id: space.id,
      space_name: space.name,
      enabled: Boolean(permission),
      can_add_space_transactions: permission?.can_add_space_transactions === true,
      can_view_balance: permission?.can_view_balance === true,
      can_view_full_history: permission?.can_view_full_history === true,
    };
  });
}

export default function FinancialAccountForm({
  account,
  onSuccess,
  onCancel,
  allowedSpaces,
  initialScopeType,
  initialSpaceId,
  hideScopeControls = false,
}: {
  account?: FinancialAccount | null;
  onSuccess: () => void;
  onCancel: () => void;
  allowedSpaces?: Array<Pick<Space, 'id' | 'name'>>;
  initialScopeType?: FinancialAccountScopeType;
  initialSpaceId?: string | null;
  hideScopeControls?: boolean;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { data: referenceData } = useClientReferenceData();
  const platformDefaultCurrency = referenceData?.platformDefaultCurrency || '';
  const [isSaving, setIsSaving] = useState(false);
  const [loadedSpaces, setLoadedSpaces] = useState<FormSpaceOption[]>([]);
  const [form, setForm] = useState<AccountFormData>(EMPTY_FORM);
  const autoAppliedCurrencyRef = useRef('');
  const availableSpaces = useMemo<FormSpaceOption[]>(
    () => (allowedSpaces || loadedSpaces).map((space) => ({ id: space.id, name: space.name })),
    [allowedSpaces, loadedSpaces]
  );
  const scopeLockedToSpace = hideScopeControls && initialScopeType === 'space' && !!initialSpaceId;
  const selectedScopeSpace = useMemo(
    () => availableSpaces.find((space) => space.id === form.space_id) || null,
    [availableSpaces, form.space_id]
  );
  const sharingTargets = useMemo(() => {
    if (scopeLockedToSpace && initialSpaceId) {
      return availableSpaces.filter((space) => space.id === initialSpaceId);
    }
    return availableSpaces;
  }, [availableSpaces, initialSpaceId, scopeLockedToSpace]);

  const refreshCreateModeCurrency = useCallback(async () => {
    if (account) {
      autoAppliedCurrencyRef.current = '';
      return;
    }

    const currencyCode = await resolveCurrencyPreference({
      platformCurrency: platformDefaultCurrency,
      forceRefreshUserDefault: true,
    });
    const previousAutoCurrency = autoAppliedCurrencyRef.current;
    autoAppliedCurrencyRef.current = currencyCode;

    setForm((current) => {
      if (current.currency && current.currency !== previousAutoCurrency) {
        return current;
      }

      return current.currency === currencyCode
        ? current
        : { ...current, currency: currencyCode };
    });
  }, [account, platformDefaultCurrency]);

  useEffect(() => {
    if (allowedSpaces) {
      return;
    }

    let cancelled = false;
    void getMySpaceMemberships()
      .then((memberships) => {
        if (cancelled) return;
        const uniqueSpaces = Array.from(
          new Map(
            memberships.map((membership) => [
              membership.space.id,
              { id: membership.space.id, name: membership.space.name },
            ])
          ).values()
        );
        setLoadedSpaces(uniqueSpaces);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadedSpaces([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowedSpaces]);

  useEffect(() => {
    if (account) {
      const scopeType = getFinancialAccountScopeType(account);
      setForm({
        name: account.name,
        account_type: account.account_type,
        ownership_type: scopeType === 'space' ? 'shared' : (account.ownership_type || 'personal'),
        scope_type: scopeType,
        space_id: account.space_id || initialSpaceId || '',
        currency: account.currency,
        opening_balance: String(account.opening_balance),
        notes: account.notes || '',
        include_in_total: scopeType === 'space' ? false : account.include_in_total,
        is_active: account.is_active,
        bank_name: account.bank_name || '',
        account_holder_name: account.account_holder_name || '',
        account_number_masked: account.account_number_masked || '',
        iban: account.iban || '',
        swift_bic: account.swift_bic || '',
        branch_name: account.branch_name || '',
        bank_account_type: account.bank_account_type || 'current',
        space_sharing: mergeSpaceSharing(sharingTargets, account),
      });
      return;
    }

    setForm({
      ...EMPTY_FORM,
      ownership_type: 'personal',
      scope_type: scopeLockedToSpace || initialScopeType === 'space' ? 'space' : 'personal',
      space_id: initialScopeType === 'space' ? (initialSpaceId || '') : '',
      currency: '',
      include_in_total: initialScopeType === 'space' ? false : true,
      space_sharing: mergeSpaceSharing(sharingTargets, null),
    });
  }, [
    account,
    initialScopeType,
    initialSpaceId,
    scopeLockedToSpace,
    sharingTargets,
  ]);

  useEffect(() => {
    let cancelled = false;

    void refreshCreateModeCurrency().catch(() => {
      if (!cancelled) {
        autoAppliedCurrencyRef.current = '';
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshCreateModeCurrency]);

  useSmartPocketDataChanged(['profile'], 'FinancialAccountFormCurrency', async () => {
    await refreshCreateModeCurrency();
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      space_sharing: mergeSpaceSharing(sharingTargets, account).map((entry) => {
        const existingEntry = current.space_sharing.find((item) => item.space_id === entry.space_id);
        return existingEntry
          ? { ...entry, ...existingEntry, space_name: entry.space_name }
          : entry;
      }),
    }));
  }, [account, sharingTargets]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error(t('accounts.form.nameRequired', { ns: 'portal' }));
      return;
    }
    if (!form.currency) {
      toast.error(t('accounts.form.currencyRequired', { ns: 'portal' }));
      return;
    }
    if (form.scope_type === 'space' && !form.space_id) {
      toast.error(t('accounts.form.spaceRequired', {
        ns: 'portal',
        defaultValue: 'Select a Space for this account.',
      }));
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        account_type: form.account_type as FinancialAccount['account_type'],
        ownership_type: (
          form.scope_type === 'space'
            ? 'shared'
            : form.ownership_type
        ) as FinancialAccount['ownership_type'],
        scope_type: form.scope_type,
        space_id: form.scope_type === 'space' ? form.space_id : null,
        currency: form.currency,
        opening_balance: parseFloat(form.opening_balance) || 0,
        notes: form.notes || null,
        include_in_total: form.scope_type === 'space' ? false : form.include_in_total,
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
        space_sharing: form.scope_type === 'personal'
          ? form.space_sharing
            .filter((entry) => entry.enabled)
            .map((entry) => ({
              space_id: entry.space_id,
              can_view_space_transactions: true,
              can_add_space_transactions: entry.can_add_space_transactions,
              can_view_balance: entry.can_view_balance,
              can_view_full_history: entry.can_view_full_history,
            }))
          : [],
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
  const scopeTypeOptions = [
    {
      value: 'personal',
      label: t('accounts.form.scopePersonal', { ns: 'portal', defaultValue: 'Personal account' }),
    },
    {
      value: 'space',
      label: t('accounts.form.scopeSpace', { ns: 'portal', defaultValue: 'Space account' }),
    },
  ];

  const bankAccountTypeOptions = [
    { value: 'current', label: t('accounts.bankAccountTypes.current', { ns: 'portal', defaultValue: 'Current' }) },
    { value: 'savings', label: t('accounts.bankAccountTypes.savings', { ns: 'portal', defaultValue: 'Savings' }) },
    { value: 'credit_card', label: t('accounts.bankAccountTypes.creditCard', { ns: 'portal', defaultValue: 'Credit card' }) },
    { value: 'wallet', label: t('accounts.bankAccountTypes.wallet', { ns: 'portal', defaultValue: 'Wallet' }) },
    { value: 'other', label: t('accounts.bankAccountTypes.other', { ns: 'portal', defaultValue: 'Other' }) },
  ];

  const isBankAccount = form.account_type === 'bank';
  const isSpaceAccount = form.scope_type === 'space';
  const showSharingSection = !isSpaceAccount && sharingTargets.length > 0;

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
      {hideScopeControls ? (
        isSpaceAccount && selectedScopeSpace ? (
          <div className="rounded-2xl border border-border bg-muted/20 p-3">
            <p className="text-sm font-600 text-foreground">
              {t('accounts.form.spaceAccountFor', {
                ns: 'portal',
                defaultValue: 'Space account for {{space}}',
                space: selectedScopeSpace.name,
              })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('accounts.form.spaceAccountHelper', {
                ns: 'portal',
                defaultValue: 'This account belongs to the selected Space and is visible to its members.',
              })}
            </p>
          </div>
        ) : null
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">
              {t('accounts.form.scopeLabel', { ns: 'portal', defaultValue: 'Account scope' })}
            </label>
            <select
              className="input-base"
              value={form.scope_type}
              onChange={(event) => {
                const nextScope = event.target.value as FinancialAccountScopeType;
                setForm((current) => ({
                  ...current,
                  scope_type: nextScope,
                  space_id: nextScope === 'space'
                    ? current.space_id || initialSpaceId || availableSpaces[0]?.id || ''
                    : '',
                  ownership_type: nextScope === 'space' ? 'shared' : current.ownership_type,
                  include_in_total: nextScope === 'space' ? false : current.include_in_total,
                }));
              }}
            >
              {scopeTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
          {isSpaceAccount ? (
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('spaces.title', { ns: 'portal' })} *
              </label>
              <select
                className="input-base"
                value={form.space_id}
                onChange={(event) => setForm((current) => ({ ...current, space_id: event.target.value }))}
              >
                <option value="">{t('accounts.form.selectSpace', {
                  ns: 'portal',
                  defaultValue: 'Select a Space',
                })}</option>
                {availableSpaces.map((space) => (
                  <option key={space.id} value={space.id}>{space.name}</option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('accounts.form.type', { ns: 'portal' })} *</label>
          <select className="input-base" value={form.account_type} onChange={(event) => setForm((current) => ({ ...current, account_type: event.target.value }))}>
            {accountTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        {!isSpaceAccount ? (
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
        ) : (
          <div className="rounded-xl bg-muted/40 p-3 sm:mt-7">
            <p className="text-sm font-500 text-foreground">
              {t('accounts.form.spaceOwnershipSummary', {
                ns: 'portal',
                defaultValue: 'Space accounts are treated as shared space-owned funding sources.',
              })}
            </p>
          </div>
        )}
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
        <p className="text-xs text-muted-foreground mb-1.5">
          {isSpaceAccount
            ? t('accounts.form.spaceOpeningBalanceHelper', {
              ns: 'portal',
              defaultValue: 'This opening balance seeds the Space-owned account.',
            })
            : t('accounts.form.openingBalanceHelper', { ns: 'portal' })}
        </p>
        <input
          type="number"
          step="0.01"
          className="input-base font-tabular"
          placeholder="0.00"
          value={form.opening_balance}
          onChange={(event) => setForm((current) => ({ ...current, opening_balance: event.target.value }))}
        />
      </div>
      {showSharingSection ? (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
          <div>
            <p className="text-sm font-700 text-foreground">
              {t('accounts.form.spaceSharingTitle', {
                ns: 'portal',
                defaultValue: 'Share with Spaces',
              })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('accounts.form.spaceSharingHelper', {
                ns: 'portal',
                defaultValue: 'Shared personal accounts keep balances and full history private by default. Space members only see Space-linked transactions unless you grant more access.',
              })}
            </p>
          </div>
          <div className="space-y-3">
            {form.space_sharing.map((entry) => (
              <div key={entry.space_id} className="rounded-xl border border-border bg-card p-3">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-border accent-accent"
                    checked={entry.enabled}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setForm((current) => ({
                        ...current,
                        space_sharing: current.space_sharing.map((item) => item.space_id === entry.space_id
                          ? {
                            ...item,
                            enabled,
                            can_add_space_transactions: enabled ? item.can_add_space_transactions : false,
                            can_view_balance: enabled ? item.can_view_balance : false,
                            can_view_full_history: enabled ? item.can_view_full_history : false,
                          }
                          : item),
                      }));
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-600 text-foreground">{entry.space_name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('accounts.form.spaceSharingTransactionsOnly', {
                        ns: 'portal',
                        defaultValue: 'Enables this Space to use the account for linked Space transactions only.',
                      })}
                    </p>
                  </div>
                </label>
                {entry.enabled ? (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-accent"
                        checked={entry.can_add_space_transactions}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            space_sharing: current.space_sharing.map((item) => item.space_id === entry.space_id
                              ? { ...item, can_add_space_transactions: event.target.checked }
                              : item),
                          }));
                        }}
                      />
                      {t('accounts.form.allowSpaceTransactions', {
                        ns: 'portal',
                        defaultValue: 'Allow new Space transactions',
                      })}
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-accent"
                        checked={entry.can_view_balance}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            space_sharing: current.space_sharing.map((item) => item.space_id === entry.space_id
                              ? { ...item, can_view_balance: event.target.checked }
                              : item),
                          }));
                        }}
                      />
                      {t('accounts.form.allowBalanceVisibility', {
                        ns: 'portal',
                        defaultValue: 'Allow balance visibility',
                      })}
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border accent-accent"
                        checked={entry.can_view_full_history}
                        onChange={(event) => {
                          setForm((current) => ({
                            ...current,
                            space_sharing: current.space_sharing.map((item) => item.space_id === entry.space_id
                              ? { ...item, can_view_full_history: event.target.checked }
                              : item),
                          }));
                        }}
                      />
                      {t('accounts.form.allowFullHistoryVisibility', {
                        ns: 'portal',
                        defaultValue: 'Allow full history visibility',
                      })}
                    </label>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
          disabled={isSpaceAccount}
          onChange={(event) => setForm((current) => ({ ...current, include_in_total: event.target.checked }))}
        />
        <label htmlFor="include-in-total-shared" className="text-sm font-500 text-foreground cursor-pointer">
          {isSpaceAccount
            ? t('accounts.form.excludeSpaceAccountsFromPersonalTotals', {
              ns: 'portal',
              defaultValue: 'Space accounts stay out of personal net worth totals',
            })
            : t('accounts.form.includeInTotal', { ns: 'portal' })}
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
