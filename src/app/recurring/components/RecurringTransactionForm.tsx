'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import {
  getFieldErrorTextClassName,
  getFieldInputClassName,
  getFieldLabelClassName,
} from '@/lib/form-field-styles';
import {
  createRecurringTransaction,
  getAccounts,
  getCategories,
  type Category,
  type FinancialAccount,
  type RecurringTransaction,
  type TransactionAllocation,
} from '@/lib/finance';
import {
  getActivePersonalFinancialAccounts,
  getFinancialAccountDisplayLabel,
  getPreferredTransactionAccount,
  getSpaceTransactionEligibleAccounts,
} from '@/lib/financial-account-utils';
import { getManagedPeople, type ManagedPerson } from '@/lib/people';
import { getSpaceMembers, type SpaceMember } from '@/lib/spaces';
import { translateSystemCategoryName } from '@/lib/system-category-display';

type SplitMethod = 'none' | 'equal' | 'exact';
type ExecutionPermission = 'owner_only' | 'owner_manager' | 'owner_manager_contributor';
type RecurringFieldKey = 'description' | 'amount' | 'account_id' | 'beneficiaries' | 'exact_allocations';

interface RecurringFormData {
  description: string;
  amount: string;
  transaction_type: 'income' | 'expense';
  frequency: RecurringTransaction['frequency'];
  next_due_date: string;
  merchant: string;
  account_id: string;
  category_id: string;
}

type ParticipantOption = {
  key: string;
  label: string;
  userId: string | null;
  personId: string | null;
};

function buildParticipantKey(userId?: string | null, personId?: string | null) {
  if (userId) return `user:${userId}`;
  if (personId) return `person:${personId}`;
  return '';
}

function parseParticipantKey(key: string) {
  if (key.startsWith('user:')) {
    return { userId: key.slice(5), personId: null as string | null };
  }
  if (key.startsWith('person:')) {
    return { userId: null as string | null, personId: key.slice(7) };
  }
  return { userId: null as string | null, personId: null as string | null };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export default function RecurringTransactionForm({
  onSuccess,
  onCancel,
  accounts: providedAccounts,
  categories: providedCategories,
  initialValues,
  spaceId = null,
  spaceName = null,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  accounts?: FinancialAccount[];
  categories?: Category[];
  initialValues?: Partial<RecurringFormData>;
  spaceId?: string | null;
  spaceName?: string | null;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<FinancialAccount[]>(providedAccounts || []);
  const [categories, setCategories] = useState<Category[]>(providedCategories || []);
  const [managedPeople, setManagedPeople] = useState<ManagedPerson[]>([]);
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([]);
  const [loadingSupportingData, setLoadingSupportingData] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState<RecurringFormData>({
    description: initialValues?.description || '',
    amount: initialValues?.amount || '',
    transaction_type: initialValues?.transaction_type || 'expense',
    frequency: initialValues?.frequency || 'monthly',
    next_due_date: initialValues?.next_due_date || new Date().toISOString().split('T')[0],
    merchant: initialValues?.merchant || '',
    account_id: initialValues?.account_id || '',
    category_id: initialValues?.category_id || '',
  });
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [executionPermissions, setExecutionPermissions] = useState<ExecutionPermission>('owner_manager_contributor');
  const [payerKey, setPayerKey] = useState('');
  const [beneficiaryKeys, setBeneficiaryKeys] = useState<string[]>([]);
  const [exactAllocationAmounts, setExactAllocationAmounts] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RecurringFieldKey, string>>>({});

  useEffect(() => {
    let cancelled = false;
    setLoadingSupportingData(true);

    Promise.all([
      providedAccounts ? Promise.resolve(providedAccounts) : getAccounts(),
      providedCategories ? Promise.resolve(providedCategories) : getCategories(),
      spaceId ? getSpaceMembers(spaceId) : Promise.resolve([] as SpaceMember[]),
      spaceId ? getManagedPeople() : Promise.resolve([] as ManagedPerson[]),
    ])
      .then(([nextAccounts, nextCategories, nextMembers, nextPeople]) => {
        if (cancelled) return;
        setAccounts((nextAccounts || []).filter((account) => account.is_active));
        setCategories(nextCategories || []);
        setSpaceMembers(nextMembers || []);
        setManagedPeople(nextPeople || []);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : t('recurring.form.loadFailed', { ns: 'portal' }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingSupportingData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [providedAccounts, providedCategories, spaceId, t]);

  const selectorAccounts = useMemo(
    () => spaceId
      ? getSpaceTransactionEligibleAccounts(accounts, spaceId)
      : getActivePersonalFinancialAccounts(accounts),
    [accounts, spaceId]
  );
  const filteredCategories = useMemo(
    () => categories.filter((category) => category.category_type === form.transaction_type),
    [categories, form.transaction_type]
  );

  useEffect(() => {
    if (form.account_id || selectorAccounts.length === 0) return;
    const preferred = getPreferredTransactionAccount(selectorAccounts, form.transaction_type);
    if (preferred?.id) {
      setForm((current) => ({ ...current, account_id: preferred.id }));
    }
  }, [form.account_id, form.transaction_type, selectorAccounts]);

  const participantOptions = useMemo<ParticipantOption[]>(() => {
    if (!spaceId) return [];

    const memberOptions = spaceMembers.map((member) => ({
      key: buildParticipantKey(member.user_id, null),
      label: member.user_id === user?.id
        ? t('common:you', { defaultValue: 'You' })
        : member.user_profile?.full_name || t('recurring.form.spaceMember', {
          ns: 'portal',
          defaultValue: 'Space member',
        }),
      userId: member.user_id,
      personId: null,
    }));

    const managedPersonOptions = managedPeople.map((person) => ({
      key: buildParticipantKey(null, person.id),
      label: `${person.full_name} (${t('recurring.form.managedPerson', {
        ns: 'portal',
        defaultValue: 'Managed person',
      })})`,
      userId: null,
      personId: person.id,
    }));

    return [...memberOptions, ...managedPersonOptions];
  }, [managedPeople, spaceId, spaceMembers, t, user?.id]);

  useEffect(() => {
    if (!spaceId || participantOptions.length === 0) return;

    if (!payerKey) {
      const defaultPayer = participantOptions.find((option) => option.userId === user?.id) || participantOptions[0];
      setPayerKey(defaultPayer.key);
    }

    if (beneficiaryKeys.length === 0) {
      const defaultBeneficiary = participantOptions.find((option) => option.userId === user?.id) || participantOptions[0];
      setBeneficiaryKeys([defaultBeneficiary.key]);
    }
  }, [beneficiaryKeys.length, participantOptions, payerKey, spaceId, user?.id]);

  useEffect(() => {
    if (splitMethod !== 'none' || beneficiaryKeys.length <= 1) return;
    if (!beneficiaryKeys.includes(payerKey) && payerKey) {
      setBeneficiaryKeys([payerKey]);
    }
  }, [beneficiaryKeys, payerKey, splitMethod]);

  useEffect(() => {
    setFieldErrors((current) => {
      if (!current.beneficiaries && !current.exact_allocations) return current;
      const next = { ...current };
      delete next.beneficiaries;
      delete next.exact_allocations;
      return next;
    });
  }, [splitMethod]);

  const toggleBeneficiary = (participantKey: string) => {
    setFieldErrors((current) => {
      if (!current.beneficiaries) return current;
      const next = { ...current };
      delete next.beneficiaries;
      return next;
    });
    setBeneficiaryKeys((current) => {
      if (splitMethod === 'none') {
        return [participantKey];
      }
      return current.includes(participantKey)
        ? current.filter((key) => key !== participantKey)
        : [...current, participantKey];
    });
  };

  const updateFormField = <K extends keyof RecurringFormData>(field: K, value: RecurringFormData[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field in fieldErrors) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field as RecurringFieldKey];
        return next;
      });
    }
  };

  const buildAllocationTemplate = (amountValue: number): TransactionAllocation[] => {
    const selections = beneficiaryKeys.map((key) => ({
      key,
      ...parseParticipantKey(key),
    }));

    if (selections.length === 0) {
      throw new Error(t('recurring.form.beneficiariesRequired', {
        ns: 'portal',
        defaultValue: 'Select at least one beneficiary.',
      }));
    }

    if (splitMethod === 'none' && selections.length !== 1) {
      throw new Error(t('recurring.form.singleBeneficiaryRequired', {
        ns: 'portal',
        defaultValue: 'Single-beneficiary recurring items require exactly one beneficiary.',
      }));
    }

    if (splitMethod === 'exact') {
      const exactAllocations = selections.map((selection) => ({
        selection,
        amount: roundMoney(Number(exactAllocationAmounts[selection.key] || 0)),
      }));
      const totalExact = roundMoney(exactAllocations.reduce((sum, allocation) => sum + allocation.amount, 0));
      if (Math.abs(totalExact - amountValue) > 0.01) {
        throw new Error(t('recurring.form.exactAllocationMismatch', {
          ns: 'portal',
          defaultValue: 'Exact allocations must total the recurring amount.',
        }));
      }

      return exactAllocations.map(({ selection, amount }) => ({
        member_user_id: selection.userId,
        managed_person_id: selection.personId,
        allocated_amount: amount,
        reimbursement_required: buildParticipantKey(selection.userId, selection.personId) !== payerKey,
      }));
    }

    const baseAmount = splitMethod === 'none'
      ? amountValue
      : roundMoney(amountValue / selections.length);

    let runningAllocated = 0;
    return selections.map((selection, index) => {
      const allocatedAmount = splitMethod === 'none'
        ? amountValue
        : index === selections.length - 1
          ? roundMoney(amountValue - runningAllocated)
          : baseAmount;

      runningAllocated = roundMoney(runningAllocated + allocatedAmount);
      return {
        member_user_id: selection.userId,
        managed_person_id: selection.personId,
        allocated_amount: allocatedAmount,
        reimbursement_required: buildParticipantKey(selection.userId, selection.personId) !== payerKey,
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    if (!form.description.trim()) {
      const message = t('settlements.descriptionRequired', { ns: 'portal' });
      setFieldErrors({ description: message });
      setSubmitError(message);
      toast.error(message);
      return;
    }

    const amountValue = roundMoney(Number(form.amount || 0));
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      const message = t('recurring.form.amountMin', { ns: 'portal' });
      setFieldErrors({ amount: message });
      setSubmitError(message);
      toast.error(message);
      return;
    }

    if (!form.account_id) {
      const message = t('recurring.form.accountRequired', { ns: 'portal' });
      setFieldErrors({ account_id: message });
      setSubmitError(message);
      toast.error(message);
      return;
    }

    const selectedAccount = accounts.find((account) => account.id === form.account_id);
    if (!selectedAccount?.currency) {
      const message = t('recurring.form.accountCurrencyMissing', { ns: 'portal' });
      setFieldErrors({ account_id: message });
      setSubmitError(message);
      toast.error(message);
      return;
    }

    setFieldErrors({});
    setIsLoading(true);
    try {
      const parsedPayer = parseParticipantKey(payerKey);
      const allocationTemplate = spaceId ? buildAllocationTemplate(amountValue) : null;

      await createRecurringTransaction({
        account_id: form.account_id,
        category_id: form.category_id || null,
        transaction_type: form.transaction_type,
        amount: amountValue,
        currency: selectedAccount.currency,
        description: form.description.trim(),
        merchant: form.merchant.trim() || null,
        frequency: form.frequency,
        next_due_date: form.next_due_date,
        is_active: true,
        auto_create: false,
        space_id: spaceId || null,
        paid_by_user_id: spaceId ? parsedPayer.userId : null,
        paid_by_person_id: spaceId ? parsedPayer.personId : null,
        split_method: spaceId ? splitMethod : null,
        allocation_template: allocationTemplate,
        execution_permissions: spaceId ? executionPermissions : null,
      });

      dispatchSmartPocketDataChanged({
        source: 'recurring-transaction-form',
        entities: spaceId ? ['recurring_transactions', 'dashboard', 'spaces'] : ['recurring_transactions', 'dashboard'],
      });
      toast.success(t('recurring.form.created', { ns: 'portal' }));
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('recurring.form.createFailed', { ns: 'portal' });
      if (message === t('recurring.form.beneficiariesRequired', {
        ns: 'portal',
        defaultValue: 'Select at least one beneficiary.',
      }) || message === t('recurring.form.singleBeneficiaryRequired', {
        ns: 'portal',
        defaultValue: 'Single-beneficiary recurring items require exactly one beneficiary.',
      })) {
        setFieldErrors({ beneficiaries: message });
      } else if (message === t('recurring.form.exactAllocationMismatch', {
        ns: 'portal',
        defaultValue: 'Exact allocations must total the recurring amount.',
      })) {
        setFieldErrors({ exact_allocations: message });
      }
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingSupportingData) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-6 text-center">
        <Loader2 size={18} className="mx-auto mb-2 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">{t('recurring.form.loading', { ns: 'portal' })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {spaceId ? (
        <div className="rounded-xl border border-info/20 bg-info-soft/40 p-3 text-sm text-info">
          {t('recurring.form.spaceRecurringNotice', {
            ns: 'portal',
            defaultValue: `This recurring transaction will post into ${spaceName || 'the selected Space'} using the authoritative Space transaction save path.`,
            space: spaceName || 'the selected Space',
          })}
        </div>
      ) : null}

      <div>
        <label htmlFor="rec-desc-shared" className={getFieldLabelClassName(Boolean(fieldErrors.description))}>
          {t('settlements.descriptionLabel', { ns: 'portal' })} *
        </label>
        <input
          id="rec-desc-shared"
          type="text"
          className={getFieldInputClassName('input-base', Boolean(fieldErrors.description))}
          placeholder={t('recurring.form.descriptionPlaceholder', { ns: 'portal' })}
          value={form.description}
          onChange={(event) => updateFormField('description', event.target.value)}
        />
        {fieldErrors.description ? <p className={getFieldErrorTextClassName()}>{fieldErrors.description}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rec-type-shared" className="block text-sm font-600 text-foreground mb-1.5">
            {t('categories.form.type', { ns: 'portal' })}
          </label>
          <select
            id="rec-type-shared"
            className="input-base"
            value={form.transaction_type}
            onChange={(event) => setForm((current) => ({
              ...current,
              transaction_type: event.target.value as RecurringFormData['transaction_type'],
            }))}
          >
            <option value="expense">{t('transactions.types.expense', { ns: 'portal' })}</option>
            <option value="income">{t('transactions.types.income', { ns: 'portal' })}</option>
          </select>
        </div>
        <div>
          <label htmlFor="rec-freq-shared" className="block text-sm font-600 text-foreground mb-1.5">
            {t('recurring.form.frequency', { ns: 'portal' })}
          </label>
          <select
            id="rec-freq-shared"
            className="input-base"
            value={form.frequency}
            onChange={(event) => setForm((current) => ({
              ...current,
              frequency: event.target.value as RecurringTransaction['frequency'],
            }))}
          >
            <option value="daily">{t('recurring.form.frequencies.daily', { ns: 'portal' })}</option>
            <option value="weekly">{t('recurring.form.frequencies.weekly', { ns: 'portal' })}</option>
            <option value="biweekly">{t('recurring.form.frequencies.biweekly', { ns: 'portal' })}</option>
            <option value="monthly">{t('recurring.form.frequencies.monthly', { ns: 'portal' })}</option>
            <option value="quarterly">{t('recurring.form.frequencies.quarterly', { ns: 'portal' })}</option>
            <option value="yearly">{t('recurring.form.frequencies.yearly', { ns: 'portal' })}</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="rec-account-shared" className={getFieldLabelClassName(Boolean(fieldErrors.account_id))}>
          {t('settlements.account', { ns: 'portal' })} *
        </label>
        <select
          id="rec-account-shared"
          className={getFieldInputClassName('input-base', Boolean(fieldErrors.account_id))}
          value={form.account_id}
          onChange={(event) => updateFormField('account_id', event.target.value)}
        >
          <option value="">{t('transactions.selectAccount', { ns: 'portal' })}</option>
          {selectorAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {getFinancialAccountDisplayLabel(account, {
                includeCurrency: true,
                includeDefaultLabel: true,
              })}
            </option>
          ))}
        </select>
        {fieldErrors.account_id ? <p className={getFieldErrorTextClassName()}>{fieldErrors.account_id}</p> : null}
      </div>

      <div>
        <label htmlFor="rec-category-shared" className="block text-sm font-600 text-foreground mb-1.5">
          {t('categories.title', { ns: 'portal' })}
        </label>
        <select
          id="rec-category-shared"
          className="input-base"
          value={form.category_id}
          onChange={(event) => setForm((current) => ({ ...current, category_id: event.target.value }))}
        >
          <option value="">{t('transactions.noCategory', { ns: 'portal' })}</option>
          {filteredCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {translateSystemCategoryName(category.name, (key, options) =>
                t(key, { ...(options || {}), ns: 'common' })
              )}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="rec-amount-shared" className={getFieldLabelClassName(Boolean(fieldErrors.amount))}>
          {t('settlements.amount', { ns: 'portal' })} *
        </label>
        <input
          id="rec-amount-shared"
          type="number"
          step="0.01"
          min="0.01"
          className={getFieldInputClassName('input-base font-tabular', Boolean(fieldErrors.amount))}
          placeholder="0.00"
          value={form.amount}
          onChange={(event) => updateFormField('amount', event.target.value)}
        />
        {fieldErrors.amount ? <p className={getFieldErrorTextClassName()}>{fieldErrors.amount}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="rec-merchant-shared" className="block text-sm font-600 text-foreground mb-1.5">
            {t('transactions.merchantSource', { ns: 'portal' })}
          </label>
          <input
            id="rec-merchant-shared"
            type="text"
            className="input-base"
            placeholder={t('recurring.form.merchantPlaceholder', { ns: 'portal' })}
            value={form.merchant}
            onChange={(event) => setForm((current) => ({ ...current, merchant: event.target.value }))}
          />
        </div>
        <div>
          <label htmlFor="rec-next-date-shared" className="block text-sm font-600 text-foreground mb-1.5">
            {t('recurring.form.nextDueDate', { ns: 'portal' })}
          </label>
          <input
            id="rec-next-date-shared"
            type="date"
            className="input-base"
            value={form.next_due_date}
            onChange={(event) => setForm((current) => ({ ...current, next_due_date: event.target.value }))}
          />
        </div>
      </div>

      {spaceId ? (
        <div className={`space-y-4 rounded-xl border bg-muted/10 p-4 ${fieldErrors.beneficiaries || fieldErrors.exact_allocations ? 'border-negative/40 bg-negative-soft/20' : 'border-border'}`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('recurring.form.payer', { ns: 'portal', defaultValue: 'Payer' })}
              </label>
              <select
                className="input-base"
                value={payerKey}
                onChange={(event) => setPayerKey(event.target.value)}
              >
                <option value="">{t('recurring.form.selectPayer', { ns: 'portal', defaultValue: 'Select payer' })}</option>
                {participantOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">
                {t('recurring.form.executionPermissions', { ns: 'portal', defaultValue: 'Execution permissions' })}
              </label>
              <select
                className="input-base"
                value={executionPermissions}
                onChange={(event) => setExecutionPermissions(event.target.value as ExecutionPermission)}
              >
                <option value="owner_only">{t('recurring.form.execution.ownerOnly', { ns: 'portal', defaultValue: 'Owner only' })}</option>
                <option value="owner_manager">{t('recurring.form.execution.ownerManager', { ns: 'portal', defaultValue: 'Owner and manager' })}</option>
                <option value="owner_manager_contributor">{t('recurring.form.execution.ownerManagerContributor', { ns: 'portal', defaultValue: 'Owner, manager, and contributor' })}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">
              {t('recurring.form.splitMethod', { ns: 'portal', defaultValue: 'Split method' })}
            </label>
            <select
              className="input-base"
              value={splitMethod}
              onChange={(event) => setSplitMethod(event.target.value as SplitMethod)}
            >
              <option value="none">{t('recurring.form.split.none', { ns: 'portal', defaultValue: 'Single beneficiary' })}</option>
              <option value="equal">{t('recurring.form.split.equal', { ns: 'portal', defaultValue: 'Equal split' })}</option>
              <option value="exact">{t('recurring.form.split.exact', { ns: 'portal', defaultValue: 'Exact amounts' })}</option>
            </select>
          </div>

          <div>
            <p className={getFieldLabelClassName(Boolean(fieldErrors.beneficiaries || fieldErrors.exact_allocations), 'mb-1.5 block text-sm font-600')}>
              {t('recurring.form.beneficiaries', { ns: 'portal', defaultValue: 'Beneficiaries' })}
            </p>
            <div className="space-y-2">
              {participantOptions.map((option) => {
                const checked = beneficiaryKeys.includes(option.key);
                return (
                  <div key={option.key} className={`rounded-xl border bg-card p-3 ${fieldErrors.beneficiaries || fieldErrors.exact_allocations ? 'border-negative/30' : 'border-border'}`}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <label className="flex items-center gap-3 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBeneficiary(option.key)}
                          className="rounded"
                        />
                        <span>{option.label}</span>
                      </label>
                      {splitMethod === 'exact' && checked ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={getFieldInputClassName('input-base md:w-40', Boolean(fieldErrors.exact_allocations))}
                          placeholder="0.00"
                          value={exactAllocationAmounts[option.key] || ''}
                          onChange={(event) => {
                            setFieldErrors((current) => {
                              if (!current.exact_allocations) return current;
                              const next = { ...current };
                              delete next.exact_allocations;
                              return next;
                            });
                            setExactAllocationAmounts((current) => ({
                              ...current,
                              [option.key]: event.target.value,
                            }));
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {fieldErrors.beneficiaries ? <p className={getFieldErrorTextClassName()}>{fieldErrors.beneficiaries}</p> : null}
            {!fieldErrors.beneficiaries && fieldErrors.exact_allocations ? (
              <p className={getFieldErrorTextClassName()}>{fieldErrors.exact_allocations}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {submitError ? (
        <div className="rounded-xl border border-negative/20 bg-negative-soft/50 px-4 py-3 text-sm text-negative">
          {submitError}
        </div>
      ) : null}

      <div className="flex gap-2 justify-end pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">{t('actions.cancel', { ns: 'common' })}</button>
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? <><Loader2 size={15} className="animate-spin" /> {t('recurring.form.creating', { ns: 'portal' })}</> : t('recurring.add', { ns: 'portal' })}
        </button>
      </div>
    </form>
  );
}
