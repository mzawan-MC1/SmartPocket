'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import { useLanguage } from '@/contexts/LanguageContext';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import { resolveCurrencyPreference } from '@/lib/currency-totals';
import { getAccounts, getCategories, type Category, type FinancialAccount } from '@/lib/finance';
import {
  getFieldErrorTextClassName,
  getFieldInputClassName,
  getFieldLabelClassName,
  getRequiredMarkerClassName,
} from '@/lib/form-field-styles';
import {
  getActivePersonalFinancialAccounts,
  getFinancialAccountDisplayLabel,
  getPreferredDocumentAccount,
  getPreferredTransactionAccount,
} from '@/lib/financial-account-utils';
import {
  createPersonalSubscription,
  updatePersonalSubscription,
} from '@/lib/personal-subscriptions';
import {
  PERSONAL_SUBSCRIPTION_BILLING_FREQUENCIES,
  PERSONAL_SUBSCRIPTION_PAYMENT_METHODS,
  PERSONAL_SUBSCRIPTION_REMINDER_OPTIONS,
  PERSONAL_SUBSCRIPTION_STATUSES,
  isPersonalSubscriptionBillingFrequency,
  isPersonalSubscriptionPaymentMethod,
  isPersonalSubscriptionStatus,
  supportsLinkedRecurringExpense,
  type PersonalSubscription,
  type PersonalSubscriptionBillingFrequency,
  type PersonalSubscriptionPaymentMethod,
  type PersonalSubscriptionStatus,
} from '@/lib/personal-subscriptions-shared';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { translateSystemCategoryName } from '@/lib/system-category-display';

interface PersonalSubscriptionFormValues {
  name: string;
  provider: string;
  description: string;
  category_id: string;
  status: PersonalSubscriptionStatus;
  amount: string;
  currency_code: string;
  billing_frequency: PersonalSubscriptionBillingFrequency;
  billing_interval: string;
  start_date: string;
  next_billing_date: string;
  trial_end_date: string;
  contract_end_date: string;
  financial_account_id: string;
  payment_method: PersonalSubscriptionPaymentMethod | '';
  auto_renew: boolean;
  create_linked_recurring_expense: boolean;
  reminder_days_before: string[];
  cancellation_notice_days: string;
  cancellation_deadline: string;
  warning_threshold_amount: string;
  website_url: string;
  account_reference: string;
  notes: string;
}

function mapSubscriptionToFormValues(subscription?: PersonalSubscription | null): PersonalSubscriptionFormValues {
  return {
    name: subscription?.name || '',
    provider: subscription?.provider || '',
    description: subscription?.description || '',
    category_id: subscription?.category_id || '',
    status: subscription?.status || 'active',
    amount: subscription?.amount !== undefined ? String(subscription.amount) : '',
    currency_code: subscription?.currency_code || '',
    billing_frequency: subscription?.billing_frequency || 'monthly',
    billing_interval: String(subscription?.billing_interval || 1),
    start_date: subscription?.start_date || '',
    next_billing_date: subscription?.next_billing_date || '',
    trial_end_date: subscription?.trial_end_date || '',
    contract_end_date: subscription?.contract_end_date || '',
    financial_account_id: subscription?.financial_account_id || '',
    payment_method: subscription?.payment_method || '',
    auto_renew: subscription?.auto_renew ?? true,
    create_linked_recurring_expense: Boolean(subscription?.recurring_transaction_id) || true,
    reminder_days_before: (subscription?.reminder_days_before || [1, 3, 7]).map(String),
    cancellation_notice_days: String(subscription?.cancellation_notice_days || 0),
    cancellation_deadline: subscription?.cancellation_deadline || '',
    warning_threshold_amount:
      subscription?.warning_threshold_amount !== null && subscription?.warning_threshold_amount !== undefined
        ? String(subscription.warning_threshold_amount)
        : '',
    website_url: subscription?.website_url || '',
    account_reference: subscription?.account_reference || '',
    notes: subscription?.notes || '',
  };
}

export default function PersonalSubscriptionForm({
  subscription,
  onSuccess,
  onCancel,
  accounts: providedAccounts,
  categories: providedCategories,
}: {
  subscription?: PersonalSubscription | null;
  onSuccess: (subscription: PersonalSubscription) => void;
  onCancel: () => void;
  accounts?: FinancialAccount[];
  categories?: Category[];
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const { data: referenceData } = useClientReferenceData();
  const [accounts, setAccounts] = useState<FinancialAccount[]>(providedAccounts || []);
  const [categories, setCategories] = useState<Category[]>(providedCategories || []);
  const [loadingSupportingData, setLoadingSupportingData] = useState(!providedAccounts || !providedCategories);
  const [saving, setSaving] = useState(false);
  const autoAppliedCurrencyRef = useRef('');
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PersonalSubscriptionFormValues>({
    defaultValues: mapSubscriptionToFormValues(subscription),
  });

  const frequency = watch('billing_frequency');
  const selectedAccountId = watch('financial_account_id');
  const linkedRecurringToggle = watch('create_linked_recurring_expense');
  const selectedCurrencyCode = watch('currency_code');
  const accountOptions = useMemo(
    () => getActivePersonalFinancialAccounts(accounts),
    [accounts]
  );
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.category_type === 'expense'),
    [categories]
  );
  const selectedAccount = useMemo(
    () => accountOptions.find((account) => account.id === selectedAccountId) || null,
    [accountOptions, selectedAccountId]
  );
  const linkedRecurringSupported = supportsLinkedRecurringExpense(
    isPersonalSubscriptionBillingFrequency(frequency) ? frequency : 'monthly'
  );

  useEffect(() => {
    reset(mapSubscriptionToFormValues(subscription));
    autoAppliedCurrencyRef.current = subscription?.currency_code || '';
  }, [subscription, reset]);

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
      providedCategories ? Promise.resolve(providedCategories) : getCategories('expense'),
    ])
      .then(([nextAccounts, nextCategories]) => {
        if (!providedAccounts) {
          setAccounts(nextAccounts.filter((account) => account.is_active));
        }
        if (!providedCategories) {
          setCategories(nextCategories);
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : t('personalSubscriptions.form.loadFailed', { ns: 'portal' }));
      })
      .finally(() => setLoadingSupportingData(false));
  }, [providedAccounts, providedCategories, t]);

  useEffect(() => {
    if (subscription || selectedAccountId || accountOptions.length === 0) return;

    let cancelled = false;

    void resolveCurrencyPreference({
      platformCurrency: referenceData?.platformDefaultCurrency,
      forceRefreshUserDefault: true,
    }).then((currencyCode) => {
      if (cancelled) return;

      const preferred = getPreferredDocumentAccount(accountOptions, 'expense', currencyCode)
        || getPreferredTransactionAccount(accountOptions, 'expense');
      if (!preferred?.id) {
        return;
      }

      autoAppliedCurrencyRef.current = preferred.currency;
      setValue('financial_account_id', preferred.id, { shouldDirty: false });
      setValue('currency_code', preferred.currency, { shouldDirty: false });
    });

    return () => {
      cancelled = true;
    };
  }, [accountOptions, referenceData?.platformDefaultCurrency, selectedAccountId, setValue, subscription]);

  useEffect(() => {
    if (!selectedAccount?.currency) return;
    setValue('currency_code', selectedAccount.currency, { shouldDirty: true });
  }, [selectedAccount?.currency, setValue]);

  useEffect(() => {
    if (subscription || selectedAccount?.currency) return;

    let cancelled = false;

    void resolveCurrencyPreference({
      platformCurrency: referenceData?.platformDefaultCurrency,
      forceRefreshUserDefault: true,
    }).then((currencyCode) => {
      if (cancelled) return;

      const previousAutoCurrency = autoAppliedCurrencyRef.current;
      autoAppliedCurrencyRef.current = currencyCode;

      if (selectedCurrencyCode && selectedCurrencyCode !== previousAutoCurrency) {
        return;
      }

      setValue('currency_code', currencyCode, { shouldDirty: false });
    });

    return () => {
      cancelled = true;
    };
  }, [
    referenceData?.platformDefaultCurrency,
    selectedAccount?.currency,
    selectedCurrencyCode,
    setValue,
    subscription,
  ]);

  useSmartPocketDataChanged(['profile'], 'PersonalSubscriptionFormCurrency', async () => {
    if (subscription || selectedAccount?.currency) {
      return;
    }

    const currencyCode = await resolveCurrencyPreference({
      platformCurrency: referenceData?.platformDefaultCurrency,
      forceRefreshUserDefault: true,
    });
    const previousAutoCurrency = autoAppliedCurrencyRef.current;
    autoAppliedCurrencyRef.current = currencyCode;

    if (selectedCurrencyCode && selectedCurrencyCode !== previousAutoCurrency) {
      return;
    }

    setValue('currency_code', currencyCode, { shouldDirty: false });
  });

  useEffect(() => {
    if (!linkedRecurringSupported) {
      setValue('create_linked_recurring_expense', false, { shouldDirty: true });
    }
  }, [linkedRecurringSupported, setValue]);

  const onSubmit = async (data: PersonalSubscriptionFormValues) => {
    if (selectedAccount?.currency && data.currency_code && data.currency_code !== selectedAccount.currency) {
      toast.error(t('personalSubscriptions.form.accountCurrencyMismatch', {
        ns: 'portal',
        currency: selectedAccount.currency,
      }));
      return;
    }

    if (data.next_billing_date && data.start_date && data.next_billing_date < data.start_date) {
      toast.error(t('personalSubscriptions.form.nextBillingBeforeStart', { ns: 'portal' }));
      return;
    }

    if (data.contract_end_date && data.start_date && data.contract_end_date < data.start_date) {
      toast.error(t('personalSubscriptions.form.contractBeforeStart', { ns: 'portal' }));
      return;
    }

    if (data.cancellation_deadline && data.contract_end_date && data.cancellation_deadline > data.contract_end_date) {
      toast.error(t('personalSubscriptions.form.deadlineAfterContract', { ns: 'portal' }));
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: data.name.trim(),
        provider: data.provider || null,
        description: data.description || null,
        category_id: data.category_id || null,
        status: isPersonalSubscriptionStatus(data.status) ? data.status : 'active',
        amount: Number(data.amount),
        currency_code: data.currency_code,
        billing_frequency: isPersonalSubscriptionBillingFrequency(data.billing_frequency) ? data.billing_frequency : 'monthly',
        billing_interval: Number(data.billing_interval || 1),
        start_date: data.start_date || null,
        next_billing_date: data.next_billing_date || null,
        trial_end_date: data.trial_end_date || null,
        contract_end_date: data.contract_end_date || null,
        financial_account_id: data.financial_account_id || null,
        payment_method: isPersonalSubscriptionPaymentMethod(data.payment_method) ? data.payment_method : null,
        auto_renew: Boolean(data.auto_renew),
        create_linked_recurring_expense:
          linkedRecurringSupported
          && Boolean(data.create_linked_recurring_expense)
          && !subscription?.recurring_transaction_id,
        reminder_days_before: data.reminder_days_before.map(Number),
        cancellation_notice_days: Number(data.cancellation_notice_days || 0),
        cancellation_deadline: data.cancellation_deadline || null,
        warning_threshold_amount: data.warning_threshold_amount ? Number(data.warning_threshold_amount) : null,
        website_url: data.website_url || null,
        account_reference: data.account_reference || null,
        notes: data.notes || null,
      };

      const savedSubscription = subscription?.id
        ? await updatePersonalSubscription(subscription.id, payload)
        : await createPersonalSubscription(payload);

      dispatchSmartPocketDataChanged({
        source: 'personal-subscription-form',
        entities: ['personal_subscriptions', 'dashboard', 'notifications', 'recurring_transactions', 'transactions'],
      });

      toast.success(
        subscription?.id
          ? t('personalSubscriptions.form.updated', { ns: 'portal' })
          : t('personalSubscriptions.form.created', { ns: 'portal' })
      );
      onSuccess(savedSubscription);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('personalSubscriptions.form.saveFailed', { ns: 'portal' }));
    } finally {
      setSaving(false);
    }
  };

  if (loadingSupportingData) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-6 text-center">
        <Loader2 size={18} className="mx-auto mb-2 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">{t('personalSubscriptions.form.loading', { ns: 'portal' })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-700 text-foreground">{t('personalSubscriptions.form.sections.basic', { ns: 'portal' })}</h2>
          <p className="text-xs text-muted-foreground">{t('personalSubscriptions.form.sections.basicDescription', { ns: 'portal' })}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="subscription-name" className={getFieldLabelClassName(Boolean(errors.name))}>
              {t('personalSubscriptions.form.fields.name', { ns: 'portal' })}
              <span className={getRequiredMarkerClassName()}> *</span>
            </label>
            <input
              id="subscription-name"
              type="text"
              aria-invalid={errors.name ? 'true' : 'false'}
              className={getFieldInputClassName('input-base', Boolean(errors.name))}
              {...register('name', { required: t('personalSubscriptions.form.errors.nameRequired', { ns: 'portal' }) })}
            />
            {errors.name ? <p className={getFieldErrorTextClassName()}>{errors.name.message}</p> : null}
          </div>
          <div>
            <label htmlFor="subscription-provider" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.provider', { ns: 'portal' })}
            </label>
            <input id="subscription-provider" type="text" className="input-base" {...register('provider')} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="subscription-category" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.category', { ns: 'portal' })}
            </label>
            <select id="subscription-category" className="input-base" {...register('category_id')}>
              <option value="">{t('transactions.noCategory', { ns: 'portal' })}</option>
              {expenseCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {translateSystemCategoryName(category.name, (key, options) =>
                    t(key, { ...(options || {}), ns: 'common' })
                  )}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="subscription-status" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.status', { ns: 'portal' })}
            </label>
            <select id="subscription-status" className="input-base" {...register('status')}>
              {PERSONAL_SUBSCRIPTION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`personalSubscriptions.statuses.${status}`, { ns: 'portal' })}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="subscription-description" className="mb-1.5 block text-sm font-600 text-foreground">
            {t('personalSubscriptions.form.fields.description', { ns: 'portal' })}
          </label>
          <textarea id="subscription-description" rows={3} className="input-base resize-none" {...register('description')} />
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-700 text-foreground">{t('personalSubscriptions.form.sections.billing', { ns: 'portal' })}</h2>
          <p className="text-xs text-muted-foreground">{t('personalSubscriptions.form.sections.billingDescription', { ns: 'portal' })}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="subscription-amount" className={getFieldLabelClassName(Boolean(errors.amount))}>
              {t('personalSubscriptions.form.fields.amount', { ns: 'portal' })}
              <span className={getRequiredMarkerClassName()}> *</span>
            </label>
            <input
              id="subscription-amount"
              type="number"
              step="0.01"
              min="0"
              aria-invalid={errors.amount ? 'true' : 'false'}
              className={getFieldInputClassName('input-base font-tabular', Boolean(errors.amount))}
              {...register('amount', {
                required: t('personalSubscriptions.form.errors.amountRequired', { ns: 'portal' }),
                validate: (value) => Number(value) >= 0 || t('personalSubscriptions.form.errors.amountMin', { ns: 'portal' }),
              })}
            />
            {errors.amount ? <p className={getFieldErrorTextClassName()}>{errors.amount.message}</p> : null}
          </div>
          <div>
            <CurrencySelector
              label={t('personalSubscriptions.form.fields.currency', { ns: 'portal' })}
              value={watch('currency_code')}
              onChange={(currencyCode) => setValue('currency_code', currencyCode, { shouldDirty: true })}
            />
          </div>
          <div>
            <label htmlFor="subscription-frequency" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.billingFrequency', { ns: 'portal' })} *
            </label>
            <select id="subscription-frequency" className="input-base" {...register('billing_frequency')}>
              {PERSONAL_SUBSCRIPTION_BILLING_FREQUENCIES.map((item) => (
                <option key={item} value={item}>
                  {t(`personalSubscriptions.frequencies.${item}`, { ns: 'portal' })}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="subscription-billing-interval" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.billingInterval', { ns: 'portal' })}
            </label>
            <input
              id="subscription-billing-interval"
              type="number"
              min="1"
              step="1"
              className="input-base"
              {...register('billing_interval')}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t('personalSubscriptions.form.helpers.billingInterval', { ns: 'portal' })}
            </p>
          </div>
          <div>
            <label htmlFor="subscription-next-billing" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.nextBillingDate', { ns: 'portal' })}
            </label>
            <input id="subscription-next-billing" type="date" className="input-base" {...register('next_billing_date')} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="subscription-start-date" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.startDate', { ns: 'portal' })}
            </label>
            <input id="subscription-start-date" type="date" className="input-base" {...register('start_date')} />
          </div>
          <div>
            <label htmlFor="subscription-trial-end" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.trialEndDate', { ns: 'portal' })}
            </label>
            <input id="subscription-trial-end" type="date" className="input-base" {...register('trial_end_date')} />
          </div>
        </div>
        <div>
          <label htmlFor="subscription-contract-end" className="mb-1.5 block text-sm font-600 text-foreground">
            {t('personalSubscriptions.form.fields.contractEndDate', { ns: 'portal' })}
          </label>
          <input id="subscription-contract-end" type="date" className="input-base" {...register('contract_end_date')} />
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-700 text-foreground">{t('personalSubscriptions.form.sections.payment', { ns: 'portal' })}</h2>
          <p className="text-xs text-muted-foreground">{t('personalSubscriptions.form.sections.paymentDescription', { ns: 'portal' })}</p>
        </div>
        <div>
          <label htmlFor="subscription-account" className="mb-1.5 block text-sm font-600 text-foreground">
            {t('personalSubscriptions.form.fields.financialAccount', { ns: 'portal' })}
          </label>
          <select id="subscription-account" className="input-base" {...register('financial_account_id')}>
            <option value="">{t('personalSubscriptions.form.fields.noFinancialAccount', { ns: 'portal' })}</option>
            {accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {getFinancialAccountDisplayLabel(account, {
                  includeCurrency: true,
                  includeDefaultLabel: true,
                })}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="subscription-payment-method" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.paymentMethod', { ns: 'portal' })}
            </label>
            <select id="subscription-payment-method" className="input-base" {...register('payment_method')}>
              <option value="">{t('personalSubscriptions.form.fields.selectPaymentMethod', { ns: 'portal' })}</option>
              {PERSONAL_SUBSCRIPTION_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {t(`personalSubscriptions.paymentMethods.${method}`, { ns: 'portal' })}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
            <label className="flex items-center gap-2 text-sm font-600 text-foreground">
              <input type="checkbox" className="rounded border-border" {...register('auto_renew')} />
              <span>{t('personalSubscriptions.form.fields.autoRenew', { ns: 'portal' })}</span>
            </label>
            <label className={`flex items-start gap-2 text-sm ${!linkedRecurringSupported || subscription?.recurring_transaction_id ? 'opacity-60' : ''}`}>
              <input
                type="checkbox"
                className="mt-0.5 rounded border-border"
                disabled={!linkedRecurringSupported || Boolean(subscription?.recurring_transaction_id)}
                {...register('create_linked_recurring_expense')}
              />
              <span>
                <span className="block font-600 text-foreground">
                  {t('personalSubscriptions.form.fields.createLinkedRecurringExpense', { ns: 'portal' })}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {subscription?.recurring_transaction_id
                    ? t('personalSubscriptions.form.helpers.linkedRecurringExists', { ns: 'portal' })
                    : linkedRecurringSupported
                      ? t('personalSubscriptions.form.helpers.linkedRecurringSupported', { ns: 'portal' })
                      : t('personalSubscriptions.form.helpers.linkedRecurringUnsupported', {
                        ns: 'portal',
                        frequency: t(`personalSubscriptions.frequencies.${frequency}`, { ns: 'portal' }),
                      })}
                </span>
              </span>
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-700 text-foreground">{t('personalSubscriptions.form.sections.reminders', { ns: 'portal' })}</h2>
          <p className="text-xs text-muted-foreground">{t('personalSubscriptions.form.sections.remindersDescription', { ns: 'portal' })}</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-600 text-foreground">{t('personalSubscriptions.form.fields.reminderDaysBefore', { ns: 'portal' })}</p>
          <div className="flex flex-wrap gap-2">
            {PERSONAL_SUBSCRIPTION_REMINDER_OPTIONS.map((day) => (
              <label key={day} className="choice-check-chip inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm">
                <input type="checkbox" value={String(day)} className="rounded border-border" {...register('reminder_days_before')} />
                <span>{t('personalSubscriptions.form.reminderOption', { ns: 'portal', count: day })}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label htmlFor="subscription-notice-days" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.cancellationNoticeDays', { ns: 'portal' })}
            </label>
            <input id="subscription-notice-days" type="number" min="0" step="1" className="input-base" {...register('cancellation_notice_days')} />
          </div>
          <div>
            <label htmlFor="subscription-cancellation-deadline" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.cancellationDeadline', { ns: 'portal' })}
            </label>
            <input id="subscription-cancellation-deadline" type="date" className="input-base" {...register('cancellation_deadline')} />
          </div>
          <div>
            <label htmlFor="subscription-threshold" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.warningThresholdAmount', { ns: 'portal' })}
            </label>
            <input id="subscription-threshold" type="number" min="0" step="0.01" className="input-base" {...register('warning_threshold_amount')} />
          </div>
        </div>
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-sm font-700 text-foreground">{t('personalSubscriptions.form.sections.additional', { ns: 'portal' })}</h2>
          <p className="text-xs text-muted-foreground">{t('personalSubscriptions.form.sections.additionalDescription', { ns: 'portal' })}</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="subscription-website-url" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.websiteUrl', { ns: 'portal' })}
            </label>
            <input id="subscription-website-url" type="url" className="input-base" {...register('website_url')} />
          </div>
          <div>
            <label htmlFor="subscription-account-reference" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.form.fields.accountReference', { ns: 'portal' })}
            </label>
            <input
              id="subscription-account-reference"
              type="text"
              autoComplete="off"
              className="input-base"
              {...register('account_reference')}
            />
          </div>
        </div>
        <div>
          <label htmlFor="subscription-notes" className="mb-1.5 block text-sm font-600 text-foreground">
            {t('personalSubscriptions.form.fields.notes', { ns: 'portal' })}
          </label>
          <textarea id="subscription-notes" rows={4} className="input-base resize-none" {...register('notes')} />
        </div>
      </section>

      <div className={`flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row ${isRTL ? 'sm:justify-start sm:flex-row-reverse' : 'sm:justify-end'}`}>
        <button type="button" onClick={onCancel} className="btn-secondary">
          {t('actions.cancel', { ns: 'common' })}
        </button>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {subscription?.id
                ? t('personalSubscriptions.form.saving', { ns: 'portal' })
                : t('personalSubscriptions.form.creating', { ns: 'portal' })}
            </>
          ) : subscription?.id ? t('personalSubscriptions.form.saveChanges', { ns: 'portal' }) : t('personalSubscriptions.actions.addSubscription', { ns: 'portal' })}
        </button>
      </div>
    </form>
  );
}
