'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import Modal from '@/components/ui/Modal';
import FormSection from '@/components/ui/FormSection';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import {
  applyAccountCurrencyChange,
  createAccount,
  previewAccountCurrencyChange,
  type FinancialAccount,
  updateAccount,
} from '@/lib/finance';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import {
  getFieldErrorTextClassName,
  getFieldInputClassName,
  getFieldLabelClassName,
} from '@/lib/form-field-styles';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { resolveCurrencyPreference } from '@/lib/currency-totals';
import {
  getFinancialAccountScopeType,
  type FinancialBankAccountType,
  type FinancialAccountScopeType,
} from '@/lib/financial-account-utils';
import {
  normalizeCurrencyCode,
  type AccountCurrencyChangeMode,
  type AccountCurrencyChangePreview,
} from '@/lib/financial-account-currency-change';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';
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

type FinancialAccountFieldKey = 'name' | 'currency' | 'space_id';

const EMPTY_FORM: AccountFormData = {
  name: '',
  account_type: 'cash',
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
  initialCurrencyWorkflowOpen = false,
}: {
  account?: FinancialAccount | null;
  onSuccess: () => void;
  onCancel: () => void;
  allowedSpaces?: Array<Pick<Space, 'id' | 'name'>>;
  initialScopeType?: FinancialAccountScopeType;
  initialSpaceId?: string | null;
  hideScopeControls?: boolean;
  initialCurrencyWorkflowOpen?: boolean;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { data: referenceData } = useClientReferenceData();
  const platformDefaultCurrency = referenceData?.platformDefaultCurrency || '';
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FinancialAccountFieldKey, string>>>({});
  const [loadedSpaces, setLoadedSpaces] = useState<FormSpaceOption[]>([]);
  const [form, setForm] = useState<AccountFormData>(EMPTY_FORM);
  const [sharingExpanded, setSharingExpanded] = useState(false);
  const [bankDetailsExpanded, setBankDetailsExpanded] = useState(false);
  const [showCurrencyWorkflow, setShowCurrencyWorkflow] = useState(Boolean(account) && initialCurrencyWorkflowOpen);
  const [currencyMode, setCurrencyMode] = useState<AccountCurrencyChangeMode | null>(null);
  const [currencyTarget, setCurrencyTarget] = useState('');
  const [currencyPreview, setCurrencyPreview] = useState<AccountCurrencyChangePreview | null>(null);
  const [currencyPreviewLoading, setCurrencyPreviewLoading] = useState(false);
  const [currencyApplying, setCurrencyApplying] = useState(false);
  const [currencyConfirmChecked, setCurrencyConfirmChecked] = useState(false);
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
  const currentCurrencyCode = normalizeCurrencyCode(account?.currency || form.currency);
  const currentCurrencyRecord = getCurrencyByCode(referenceData?.snapshot?.currencies ?? [], currentCurrencyCode);
  const targetCurrencyRecord = getCurrencyByCode(referenceData?.snapshot?.currencies ?? [], currencyTarget);

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
      setSharingExpanded((account.space_account_permissions || []).length > 0);
      setBankDetailsExpanded(Boolean(
        account.account_type === 'bank' && (
          account.bank_name ||
          account.account_holder_name ||
          account.account_number_masked ||
          account.iban ||
          account.swift_bic ||
          account.branch_name ||
          (account.bank_account_type && account.bank_account_type !== 'current')
        )
      ));
      setShowCurrencyWorkflow(initialCurrencyWorkflowOpen);
      setCurrencyMode(null);
      setCurrencyTarget('');
      setCurrencyPreview(null);
      setCurrencyConfirmChecked(false);
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
    setSharingExpanded(false);
    setBankDetailsExpanded(false);
    setShowCurrencyWorkflow(false);
    setCurrencyMode(null);
    setCurrencyTarget('');
    setCurrencyPreview(null);
    setCurrencyConfirmChecked(false);
  }, [
    account,
    initialCurrencyWorkflowOpen,
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

  const updateField = <K extends keyof AccountFormData>(field: K, value: AccountFormData[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field in fieldErrors) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field as FinancialAccountFieldKey];
        return next;
      });
    }
  };

  const resetCurrencyWorkflow = useCallback((keepOpen = false) => {
    setShowCurrencyWorkflow(keepOpen);
    setCurrencyMode(null);
    setCurrencyTarget('');
    setCurrencyPreview(null);
    setCurrencyConfirmChecked(false);
  }, []);

  const handlePreviewCurrencyChange = useCallback(async () => {
    if (!account || !currencyMode) {
      return;
    }
    if (!currencyTarget) {
      toast.error(t('accounts.form.currencyRequired', { ns: 'portal' }));
      return;
    }
    if (currencyTarget === currentCurrencyCode) {
      toast.error(t('accounts.currencyChange.chooseDifferentCurrency', {
        ns: 'portal',
        defaultValue: 'Choose a different currency.',
      }));
      return;
    }

    setCurrencyPreviewLoading(true);
    try {
      const preview = await previewAccountCurrencyChange(account.id, {
        mode: currencyMode,
        targetCurrency: currencyTarget,
      });
      setCurrencyPreview(preview);
      setCurrencyConfirmChecked(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('accounts.currencyChange.previewFailed', {
        ns: 'portal',
        defaultValue: 'Failed to preview the currency change.',
      }));
    } finally {
      setCurrencyPreviewLoading(false);
    }
  }, [account, currencyMode, currencyTarget, currentCurrencyCode, t]);

  const handleApplyCurrencyChange = useCallback(async () => {
    if (!account || !currencyMode || !currencyPreview) {
      return;
    }
    if (currencyMode === 'correction' && !currencyConfirmChecked) {
      toast.error(t('accounts.currencyChange.confirmCorrectionRequired', {
        ns: 'portal',
        defaultValue: 'Confirm that the existing amounts were entered in the new currency.',
      }));
      return;
    }

    setCurrencyApplying(true);
    try {
      await applyAccountCurrencyChange(account.id, {
        mode: currencyMode,
        targetCurrency: currencyPreview.targetCurrency,
        reason: currencyMode === 'correction' ? 'wrong_currency_selected' : 'convert_account_currency',
        confirmationChecked: currencyMode === 'correction' ? currencyConfirmChecked : undefined,
        snapshotId: currencyMode === 'conversion' ? currencyPreview.snapshotId : null,
        previewToken: currencyMode === 'conversion' ? currencyPreview.previewToken : null,
      });
      toast.success(
        currencyMode === 'correction'
          ? t('accounts.currencyChange.correctionApplied', {
              ns: 'portal',
              defaultValue: 'Account currency corrected.',
            })
          : t('accounts.currencyChange.conversionApplied', {
              ns: 'portal',
              defaultValue: 'Account currency converted safely.',
            })
      );
      dispatchSmartPocketDataChanged({
        source: 'financial-account-currency-change',
        entities: ['financial_accounts', 'dashboard', 'transactions', 'recurring_transactions'],
      });
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('accounts.currencyChange.applyFailed', {
        ns: 'portal',
        defaultValue: 'Failed to change the account currency.',
      }));
    } finally {
      setCurrencyApplying(false);
    }
  }, [account, currencyConfirmChecked, currencyMode, currencyPreview, onSuccess, t]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      const message = t('accounts.form.nameRequired', { ns: 'portal' });
      setFieldErrors({ name: message });
      toast.error(message);
      return;
    }
    if (!form.currency) {
      const message = t('accounts.form.currencyRequired', { ns: 'portal' });
      setFieldErrors({ currency: message });
      toast.error(message);
      return;
    }
    if (form.scope_type === 'space' && !form.space_id) {
      const message = t('accounts.form.spaceRequired', {
        ns: 'portal',
        defaultValue: 'Select a Space for this account.',
      });
      setFieldErrors({ space_id: message });
      toast.error(message);
      return;
    }

    setFieldErrors({});
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
  const hasEnabledSharing = form.space_sharing.some((entry) => entry.enabled);
  const hasBankDetailsValue = Boolean(
    form.bank_name ||
    form.account_holder_name ||
    form.account_number_masked ||
    form.iban ||
    form.swift_bic ||
    form.branch_name ||
    form.bank_account_type !== 'current'
  );
  const compactInputClassName = 'input-base text-sm max-[640px]:min-h-[2.75rem] max-[640px]:px-3 max-[640px]:py-2.5';
  const compactCardClassName = 'rounded-xl border border-border bg-muted/15 p-3';
  const sharingSummary = hasEnabledSharing
    ? t('accounts.form.spaceSharingEnabledSummary', {
      ns: 'portal',
      defaultValue: '{{count}} Space access enabled',
      count: form.space_sharing.filter((entry) => entry.enabled).length,
    })
    : t('accounts.form.spaceSharingCollapsed', {
      ns: 'portal',
      defaultValue: 'No Spaces can use this account yet.',
    });
  const bankDetailsSummary = hasBankDetailsValue
    ? t('accounts.form.bankDetailsConfigured', {
      ns: 'portal',
      defaultValue: 'Bank details added',
    })
    : t('accounts.form.bankDetailsCollapsed', {
      ns: 'portal',
      defaultValue: 'Optional bank details are hidden until you need them.',
    });
  const canPreviewCurrencyChange = Boolean(account && currencyMode && currencyTarget && currencyTarget !== currentCurrencyCode);
  const currencyWorkflowBlocked = currencyApplying || currencyPreviewLoading;

  return (
    <div className="space-y-3.5">
      <div>
        <label className={getFieldLabelClassName(Boolean(fieldErrors.name))}>{t('accounts.form.name', { ns: 'portal' })} *</label>
        <input
          type="text"
          className={getFieldInputClassName(compactInputClassName, Boolean(fieldErrors.name))}
          placeholder={t('accounts.form.namePlaceholder', { ns: 'portal' })}
          value={form.name}
          onChange={(event) => updateField('name', event.target.value)}
        />
        {fieldErrors.name ? <p className={getFieldErrorTextClassName()}>{fieldErrors.name}</p> : null}
      </div>

      {hideScopeControls ? (
        isSpaceAccount && selectedScopeSpace ? (
          <div className={compactCardClassName}>
            <p className="text-sm font-600 text-foreground">
              {t('accounts.form.spaceAccountFor', {
                ns: 'portal',
                space: selectedScopeSpace.name,
              })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('accounts.form.spaceAccountHelper', {
                ns: 'portal',
              })}
            </p>
          </div>
        ) : null
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        {!hideScopeControls ? (
          <div className="min-w-0">
            <label className="mb-1.5 block text-sm font-600 text-foreground">
              {t('accounts.form.scopeLabel', { ns: 'portal', defaultValue: 'Account scope' })}
            </label>
            <select
              className={`${compactInputClassName} min-w-0 w-full`}
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
        ) : null}
        <div className="min-w-0">
          <label className="mb-1.5 block text-sm font-600 text-foreground">{t('accounts.form.type', { ns: 'portal' })} *</label>
          <select
            className={`${compactInputClassName} min-w-0 w-full`}
            value={form.account_type}
            onChange={(event) => {
              const nextType = event.target.value;
              setForm((current) => ({ ...current, account_type: nextType }));
              if (nextType !== 'bank') {
                setBankDetailsExpanded(false);
              }
            }}
          >
            {accountTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </div>

      {!hideScopeControls && isSpaceAccount ? (
        <div>
          <label className={getFieldLabelClassName(Boolean(fieldErrors.space_id))}>
            {t('spaces.title', { ns: 'portal' })} *
          </label>
          <select
            className={getFieldInputClassName(`${compactInputClassName} w-full`, Boolean(fieldErrors.space_id))}
            value={form.space_id}
            onChange={(event) => updateField('space_id', event.target.value)}
          >
            <option value="">{t('accounts.form.selectSpace', {
              ns: 'portal',
              defaultValue: 'Select a Space',
            })}</option>
            {availableSpaces.map((space) => (
              <option key={space.id} value={space.id}>{space.name}</option>
            ))}
          </select>
          {fieldErrors.space_id ? <p className={getFieldErrorTextClassName()}>{fieldErrors.space_id}</p> : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        {!isSpaceAccount ? (
          <div className="min-w-0">
            <label className="mb-1.5 block text-sm font-600 text-foreground">
              {t('accounts.form.ownershipType', { ns: 'portal', defaultValue: 'Ownership type' })} *
            </label>
            <select
              className={`${compactInputClassName} min-w-0 w-full`}
              value={form.ownership_type}
              onChange={(event) => setForm((current) => ({ ...current, ownership_type: event.target.value }))}
            >
              {ownershipTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        ) : (
          <div className="min-w-0 rounded-xl bg-muted/40 px-3 py-2.5">
            <p className="text-sm font-500 text-foreground">
              {t('accounts.form.spaceOwnershipSummary', {
                ns: 'portal',
                defaultValue: 'Space accounts are treated as shared space-owned funding sources.',
              })}
            </p>
          </div>
        )}
        <div className="min-w-0">
          <label className={getFieldLabelClassName(Boolean(fieldErrors.currency))}>{t('accounts.form.currency', { ns: 'portal' })} *</label>
          {account ? (
            <div className="space-y-2">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-sm font-700 text-foreground">
                  {currentCurrencyRecord?.name || currentCurrencyCode}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('accounts.currencyChange.editHelper', {
                    ns: 'portal',
                    defaultValue: 'Existing accounts use a secure currency-change workflow so values never change silently.',
                  })}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-secondary h-9 px-3 text-sm"
                    onClick={() => setShowCurrencyWorkflow(true)}
                  >
                    {t('accounts.currencyChange.openAction', {
                      ns: 'portal',
                      defaultValue: 'Change Currency',
                    })}
                  </button>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs font-600 text-muted-foreground">
                    {currentCurrencyCode}
                  </span>
                </div>
              </div>
              {fieldErrors.currency ? <p className={getFieldErrorTextClassName()}>{fieldErrors.currency}</p> : null}
            </div>
          ) : (
            <div className={fieldErrors.currency ? 'rounded-xl border border-negative/40 bg-negative-soft/40 p-1' : ''}>
              <CurrencySelector
                value={form.currency}
                onChange={(currencyCode) => updateField('currency', currencyCode)}
                showCountryCount
                placeholder={t('settlements.chooseCurrency', { ns: 'portal' })}
                helperText={fieldErrors.currency || undefined}
              />
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <label className="flex min-h-[40px] items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer rounded border-border accent-accent"
            checked={form.is_active}
            onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
          />
          <span className="text-sm font-500 text-foreground">
            {t('accounts.form.activeStatus', { ns: 'portal', defaultValue: 'Active account' })}
          </span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 min-[420px]:items-start">
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">{t('accounts.openingBalance', { ns: 'portal' })}</label>
          <p className="mb-1.5 text-xs text-muted-foreground">
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
            className={`${compactInputClassName} font-tabular`}
            placeholder={t('settlements.amountPlaceholder', { ns: 'portal' })}
            value={form.opening_balance}
            onChange={(event) => setForm((current) => ({ ...current, opening_balance: event.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">{t('reimbursements.notes', { ns: 'portal' })}</label>
          <textarea
            rows={3}
            className="input-base min-h-[88px] resize-none py-2.5 text-sm"
            placeholder={t('accounts.form.notesPlaceholder', { ns: 'portal' })}
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          />
        </div>
      </div>

      {showSharingSection ? (
        <FormSection
          variant="secondary"
          title={t('accounts.form.spaceSharingTitle', {
            ns: 'portal',
            defaultValue: 'Share with Spaces',
          })}
          description={sharingSummary}
          collapsible
          expanded={sharingExpanded}
          onExpandedChange={setSharingExpanded}
          bodyClassName="space-y-2.5"
        >
          {sharingExpanded ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t('accounts.form.spaceSharingHelper', {
                  ns: 'portal',
                  defaultValue: 'Shared personal accounts keep balances and full history private by default. Space members only see Space-linked transactions unless you grant more access.',
                })}
              </p>
              {form.space_sharing.map((entry) => (
                <div key={entry.space_id} className="rounded-xl border border-border bg-card p-2.5">
                  <label className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
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
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('accounts.form.spaceSharingTransactionsOnly', {
                          ns: 'portal',
                          defaultValue: 'Enables this Space to use the account for linked Space transactions only.',
                        })}
                      </p>
                    </div>
                  </label>
                  {entry.enabled ? (
                    <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm text-foreground">
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
                      <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm text-foreground">
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
                      <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-sm text-foreground">
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
            </>
          ) : null}
        </FormSection>
      ) : null}

      {isBankAccount ? (
        <FormSection
          variant="neutral"
          title={t('accounts.form.bankDetailsTitle', { ns: 'portal', defaultValue: 'Bank details' })}
          description={bankDetailsSummary}
          collapsible
          expanded={bankDetailsExpanded}
          onExpandedChange={setBankDetailsExpanded}
          bodyClassName="space-y-3"
        >
          {bankDetailsExpanded ? (
            <>
              <p className="text-xs text-muted-foreground">
                {t('accounts.form.bankDetailsHelper', {
                  ns: 'portal',
                  defaultValue: 'Only masked account numbers are shown in the app. Use this section for optional banking details.',
                })}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-600 text-foreground">
                    {t('accounts.form.bankName', { ns: 'portal', defaultValue: 'Bank name' })}
                  </label>
                  <input
                    type="text"
                    className={compactInputClassName}
                    value={form.bank_name}
                    onChange={(event) => setForm((current) => ({ ...current, bank_name: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-600 text-foreground">
                    {t('accounts.form.accountHolderName', { ns: 'portal', defaultValue: 'Account holder name' })}
                  </label>
                  <input
                    type="text"
                    className={compactInputClassName}
                    value={form.account_holder_name}
                    onChange={(event) => setForm((current) => ({ ...current, account_holder_name: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-600 text-foreground">
                    {t('accounts.form.maskedAccountNumber', { ns: 'portal', defaultValue: 'Masked account number' })}
                  </label>
                  <input
                    type="text"
                    className={compactInputClassName}
                    placeholder={t('accounts.form.maskedAccountPlaceholder', { ns: 'portal' })}
                    value={form.account_number_masked}
                    onChange={(event) => setForm((current) => ({ ...current, account_number_masked: event.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-600 text-foreground">
                    {t('accounts.form.bankAccountType', { ns: 'portal', defaultValue: 'Bank account type' })}
                  </label>
                  <select
                    className={compactInputClassName}
                    value={form.bank_account_type}
                    onChange={(event) => setForm((current) => ({ ...current, bank_account_type: event.target.value }))}
                  >
                    {bankAccountTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-600 text-foreground">
                    {t('accounts.form.iban', { ns: 'portal', defaultValue: 'IBAN' })}
                  </label>
                  <input
                    type="text"
                    className={compactInputClassName}
                    value={form.iban}
                    onChange={(event) => setForm((current) => ({ ...current, iban: event.target.value.toUpperCase() }))}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-600 text-foreground">
                    {t('accounts.form.swiftBic', { ns: 'portal', defaultValue: 'SWIFT / BIC' })}
                  </label>
                  <input
                    type="text"
                    className={compactInputClassName}
                    value={form.swift_bic}
                    onChange={(event) => setForm((current) => ({ ...current, swift_bic: event.target.value.toUpperCase() }))}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-600 text-foreground">
                  {t('accounts.form.branchName', { ns: 'portal', defaultValue: 'Branch name' })}
                </label>
                <input
                  type="text"
                  className={compactInputClassName}
                  value={form.branch_name}
                  onChange={(event) => setForm((current) => ({ ...current, branch_name: event.target.value }))}
                />
              </div>
            </>
          ) : null}
        </FormSection>
      ) : null}

      <div className="flex items-center gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5">
        <input
          id="include-in-total-shared"
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded border-border accent-accent"
          checked={form.include_in_total}
          disabled={isSpaceAccount}
          onChange={(event) => setForm((current) => ({ ...current, include_in_total: event.target.checked }))}
        />
        <label htmlFor="include-in-total-shared" className="cursor-pointer text-sm font-500 text-foreground">
          {isSpaceAccount
            ? t('accounts.form.excludeSpaceAccountsFromPersonalTotals', {
              ns: 'portal',
              defaultValue: 'Space accounts stay out of personal net worth totals',
            })
            : t('accounts.form.includeInTotal', { ns: 'portal' })}
        </label>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="order-2 btn-secondary h-10 w-full px-4 text-sm sm:order-1 sm:w-auto">{t('actions.cancel', { ns: 'common' })}</button>
        <button type="button" onClick={handleSave} disabled={isSaving || currencyApplying} className="order-1 btn-primary h-10 w-full px-4 text-sm sm:order-2 sm:w-auto">
          {isSaving ? <><Loader2 size={15} className="animate-spin" /> {t('status.saving', { ns: 'common' })}</> : account ? t('accounts.form.updateAction', { ns: 'portal' }) : t('accounts.addAccount', { ns: 'portal' })}
        </button>
      </div>

      {account ? (
        <Modal
          isOpen={showCurrencyWorkflow}
          onClose={() => {
            if (!currencyWorkflowBlocked) {
              resetCurrencyWorkflow(false);
            }
          }}
          title={t('accounts.currencyChange.openAction', {
            ns: 'portal',
            defaultValue: 'Change Currency',
          })}
          description={t('accounts.currencyChange.whyQuestion', {
            ns: 'portal',
            defaultValue: 'Why are you changing the currency?',
          })}
          size="md"
          closeOnBackdrop={!currencyWorkflowBlocked}
          closeOnEscape={!currencyWorkflowBlocked}
          stickyFooter
          footer={
            <div className="flex flex-col gap-2 p-4 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                className="btn-secondary h-10 w-full px-4 text-sm sm:w-auto"
                onClick={() => resetCurrencyWorkflow(false)}
                disabled={currencyWorkflowBlocked}
              >
                {t('actions.cancel', { ns: 'common' })}
              </button>
              {currencyPreview ? (
                <>
                  {currencyMode === 'conversion' ? (
                    <button
                      type="button"
                      className="btn-secondary h-10 w-full px-4 text-sm sm:w-auto"
                      onClick={() => resetCurrencyWorkflow(false)}
                      disabled={currencyWorkflowBlocked}
                    >
                      {t('accounts.currencyChange.keepOriginalCurrency', {
                        ns: 'portal',
                        defaultValue: 'Keep Original Currency',
                      })}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-primary h-10 w-full px-4 text-sm sm:w-auto"
                    onClick={handleApplyCurrencyChange}
                    disabled={
                      currencyWorkflowBlocked
                      || currencyPreview.mixedCurrencyConflict
                      || currencyPreview.automationConflict
                      || (currencyMode === 'correction' && !currencyConfirmChecked)
                    }
                  >
                    {currencyApplying ? (
                      <><Loader2 size={15} className="animate-spin" /> {t('status.processing', { ns: 'common' })}</>
                    ) : currencyMode === 'correction' ? (
                      t('accounts.currencyChange.correctAction', {
                        ns: 'portal',
                        defaultValue: 'Correct Currency',
                      })
                    ) : (
                      t('accounts.currencyChange.convertAction', {
                        ns: 'portal',
                        defaultValue: 'Convert Currency',
                      })
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-primary h-10 w-full px-4 text-sm sm:w-auto"
                  onClick={handlePreviewCurrencyChange}
                  disabled={!canPreviewCurrencyChange || currencyWorkflowBlocked}
                >
                  {currencyPreviewLoading ? (
                    <><Loader2 size={15} className="animate-spin" /> {t('status.loading', { ns: 'common' })}</>
                  ) : (
                    t('accounts.currencyChange.previewAction', {
                      ns: 'portal',
                      defaultValue: 'Preview',
                    })
                  )}
                </button>
              )}
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-2">
              <button
                type="button"
                className={`rounded-2xl border p-3 text-left transition-colors ${currencyMode === 'correction' ? 'border-accent bg-accent/5' : 'border-border bg-card hover:bg-muted/20'}`}
                onClick={() => {
                  setCurrencyMode('correction');
                  setCurrencyPreview(null);
                  setCurrencyConfirmChecked(false);
                }}
                disabled={currencyWorkflowBlocked}
              >
                <p className="text-sm font-700 text-foreground">
                  {t('accounts.currencyChange.optionCorrectionTitle', {
                    ns: 'portal',
                    defaultValue: 'The wrong currency was selected',
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('accounts.currencyChange.optionCorrectionDescription', {
                    ns: 'portal',
                    defaultValue: 'Correct Currency. Keep all numerical values unchanged.',
                  })}
                </p>
              </button>
              <button
                type="button"
                className={`rounded-2xl border p-3 text-left transition-colors ${currencyMode === 'conversion' ? 'border-accent bg-accent/5' : 'border-border bg-card hover:bg-muted/20'}`}
                onClick={() => {
                  setCurrencyMode('conversion');
                  setCurrencyPreview(null);
                  setCurrencyConfirmChecked(false);
                }}
                disabled={currencyWorkflowBlocked}
              >
                <p className="text-sm font-700 text-foreground">
                  {t('accounts.currencyChange.optionConversionTitle', {
                    ns: 'portal',
                    defaultValue: 'I want to convert this account',
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('accounts.currencyChange.optionConversionDescription', {
                    ns: 'portal',
                    defaultValue: 'Convert Currency. Apply an exchange rate and preserve the previous account version.',
                  })}
                </p>
              </button>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-600 text-foreground">
                {t('accounts.currencyChange.targetCurrencyLabel', {
                  ns: 'portal',
                  defaultValue: 'Target currency',
                })}
              </label>
              <CurrencySelector
                value={currencyTarget}
                onChange={(currencyCode) => {
                  setCurrencyTarget(currencyCode);
                  setCurrencyPreview(null);
                  setCurrencyConfirmChecked(false);
                }}
                showCountryCount
                placeholder={t('accounts.currencyChange.targetCurrencyPlaceholder', {
                  ns: 'portal',
                  defaultValue: 'Choose the new currency',
                })}
              />
            </div>

            {currencyPreview ? (
              <div className="space-y-3 rounded-2xl border border-border bg-muted/15 p-4">
                {currencyPreview.mixedCurrencyConflict ? (
                  <div className="rounded-xl border border-warning/30 bg-warning-soft/20 p-3 text-sm text-foreground">
                    {currencyPreview.mixedCurrencyMessage}
                  </div>
                ) : null}

                {currencyPreview.automationConflict ? (
                  <div className="rounded-xl border border-warning/30 bg-warning-soft/20 p-3 text-sm text-foreground">
                    {currencyPreview.automationConflictMessage}
                  </div>
                ) : null}

                {currencyPreview.conflicts.length > 0 ? (
                  <div className="rounded-xl border border-warning/30 bg-warning-soft/10 p-3 text-sm text-foreground">
                    <p className="font-700">
                      {t('accounts.currencyChange.conflictsTitle', {
                        ns: 'portal',
                        defaultValue: 'Review these linked records first',
                      })}
                    </p>
                    <ul className="mt-2 space-y-1 text-muted-foreground">
                      {currencyPreview.conflicts.map((conflict) => (
                        <li key={`${conflict.type}-${conflict.count}`}>
                          {conflict.message} ({conflict.count})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {currencyMode === 'correction' ? (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-700 text-foreground">
                        {t('accounts.currencyChange.correctionTitle', {
                          ns: 'portal',
                          defaultValue: 'Correct account currency?',
                        })}
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t('accounts.currencyChange.correctionMessage', {
                          ns: 'portal',
                          defaultValue: 'You selected {{fromCurrency}}, but the amounts in this account were actually entered in {{toCurrency}}.',
                          fromCurrency: currentCurrencyRecord?.name || currentCurrencyCode,
                          toCurrency: targetCurrencyRecord?.name || currencyPreview.targetCurrency,
                        })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3">
                      <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                        {t('accounts.currencyChange.previewLabel', {
                          ns: 'portal',
                          defaultValue: 'Preview',
                        })}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-3 text-sm font-700 text-foreground">
                        <FormattedCurrencyAmount amount={currencyPreview.currentBalance} currencyCode={currentCurrencyCode} />
                        <span aria-hidden="true">→</span>
                        <FormattedCurrencyAmount amount={currencyPreview.currentBalance} currencyCode={currencyPreview.targetCurrency} />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('accounts.currencyChange.correctionHelper', {
                        ns: 'portal',
                        defaultValue: 'No exchange rate will be applied. The numerical values will remain unchanged.',
                      })}
                    </p>
                    <label className="flex items-start gap-2 rounded-xl border border-border bg-card p-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                        checked={currencyConfirmChecked}
                        onChange={(event) => setCurrencyConfirmChecked(event.target.checked)}
                        disabled={currencyWorkflowBlocked}
                      />
                      <span className="text-sm text-foreground">
                        {t('accounts.currencyChange.correctionCheckbox', {
                          ns: 'portal',
                          defaultValue: 'I confirm that all amounts in this account were originally entered in {{currency}}.',
                          currency: targetCurrencyRecord?.name || currencyPreview.targetCurrency,
                        })}
                      </span>
                    </label>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <p className="text-sm font-700 text-foreground">
                        {t('accounts.currencyChange.conversionTitle', {
                          ns: 'portal',
                          defaultValue: 'Convert account currency?',
                        })}
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {currencyPreview.directUpdateAllowed
                          ? t('accounts.currencyChange.emptyConversionMessage', {
                              ns: 'portal',
                              defaultValue: 'This account is empty, so Smart Pocket can update the currency directly without archiving the account.',
                            })
                          : t('accounts.currencyChange.conversionMessage', {
                              ns: 'portal',
                              defaultValue: 'Smart Pocket will convert this account from {{fromCurrency}} to {{toCurrency}} using the current exchange rate. Your current account will be archived, and a new account will be created. Previous transactions will stay in their original currency.',
                              fromCurrency: currentCurrencyRecord?.name || currentCurrencyCode,
                              toCurrency: targetCurrencyRecord?.name || currencyPreview.targetCurrency,
                            })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-3 text-sm">
                      <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            {t('accounts.currencyChange.accountNameLabel', {
                              ns: 'portal',
                              defaultValue: 'Account',
                            })}
                          </span>
                          <span className="font-700 text-foreground">{account.name}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            {t('accounts.currencyChange.currentCurrencyLabel', {
                              ns: 'portal',
                              defaultValue: 'Current currency',
                            })}
                          </span>
                          <span className="font-700 text-foreground">{currentCurrencyCode}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            {t('accounts.currencyChange.targetCurrencyLabel', {
                              ns: 'portal',
                              defaultValue: 'Target currency',
                            })}
                          </span>
                          <span className="font-700 text-foreground">{currencyPreview.targetCurrency}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">
                            {t('accounts.currentBalance', { ns: 'portal' })}
                          </span>
                          <FormattedCurrencyAmount amount={currencyPreview.currentBalance} currencyCode={currentCurrencyCode} className="font-700 text-foreground" />
                        </div>
                        {currencyPreview.exchangeRate !== null ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {t('accounts.currencyChange.exchangeRateLabel', {
                                ns: 'portal',
                                defaultValue: 'Exchange rate',
                              })}
                            </span>
                            <span className="font-700 text-foreground">{currencyPreview.exchangeRate}</span>
                          </div>
                        ) : null}
                        {currencyPreview.convertedBalance !== null ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {t('accounts.currencyChange.convertedBalanceLabel', {
                                ns: 'portal',
                                defaultValue: 'Converted balance',
                              })}
                            </span>
                            <FormattedCurrencyAmount amount={currencyPreview.convertedBalance} currencyCode={currencyPreview.targetCurrency} className="font-700 text-foreground" />
                          </div>
                        ) : null}
                        {currencyPreview.rateTimestamp ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {t('accounts.currencyChange.rateTimeLabel', {
                                ns: 'portal',
                                defaultValue: 'Rate date/time',
                              })}
                            </span>
                            <span className="font-600 text-foreground">{currencyPreview.rateTimestamp}</span>
                          </div>
                        ) : null}
                        {currencyPreview.rateProvider ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {t('accounts.currencyChange.rateProviderLabel', {
                                ns: 'portal',
                                defaultValue: 'Rate provider',
                              })}
                            </span>
                            <span className="font-600 text-foreground">{currencyPreview.rateProvider}</span>
                          </div>
                        ) : null}
                        {currencyPreview.roundingMinorUnits !== null ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-muted-foreground">
                              {t('accounts.currencyChange.roundingLabel', {
                                ns: 'portal',
                                defaultValue: 'Rounding',
                              })}
                            </span>
                            <span className="font-600 text-foreground">
                              {t('accounts.currencyChange.roundingValue', {
                                ns: 'portal',
                                defaultValue: 'Final amount only ({{minorUnits}} dp)',
                                minorUnits: currencyPreview.roundingMinorUnits,
                              })}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
