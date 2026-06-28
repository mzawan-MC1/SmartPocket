'use client';
import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { resolveCurrencyPreference } from '@/lib/currency-totals';
import { useClientReferenceData } from '@/lib/reference-data/client';

interface AddAccountFormData {
  name: string;
  type: string;
  currency: string;
  openingBalance: string;
  notes: string;
}

interface AddAccountFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

const accountTypes = ['bank', 'credit_card', 'savings', 'cash', 'digital_wallet', 'investment', 'other'] as const;
const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR'];

export default function AddAccountForm({ onSuccess, onCancel }: AddAccountFormProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { data: referenceData } = useClientReferenceData();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<AddAccountFormData>({
    defaultValues: { currency: '', type: 'bank', openingBalance: '0.00' },
  });
  const selectedCurrency = watch('currency');

  useEffect(() => {
    let cancelled = false;

    void resolveCurrencyPreference({
      platformCurrency: referenceData?.platformDefaultCurrency,
    }).then((currencyCode) => {
      if (!cancelled && !selectedCurrency) {
        setValue('currency', currencyCode, { shouldDirty: false });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [referenceData?.platformDefaultCurrency, selectedCurrency, setValue]);

  // Backend integration point: POST /api/accounts
  const onSubmit = async (data: AddAccountFormData) => {
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 900));
    setIsLoading(false);
    onSuccess();
    void data;
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="acct-name" className="block text-sm font-600 text-foreground mb-1.5">
            {t('accounts.form.name', { ns: 'portal' })} <span className="text-negative">*</span>
          </label>
          <input
            id="acct-name"
            type="text"
            className={`input-base ${errors.name ? 'input-error' : ''}`}
            placeholder={t('accounts.form.namePlaceholder', { ns: 'portal' })}
            {...register('name', { required: t('accounts.form.nameRequired', { ns: 'portal' }) })}
          />
          {errors.name && <p className="mt-1.5 text-xs text-negative font-500">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="acct-type" className="block text-sm font-600 text-foreground mb-1.5">
            {t('accounts.form.type', { ns: 'portal' })} <span className="text-negative">*</span>
          </label>
          <select
            id="acct-type"
            className={`input-base ${errors.type ? 'input-error' : ''}`}
            {...register('type', { required: t('accounts.form.typeRequired', { ns: 'portal' }) })}
          >
            {accountTypes.map((accountType) => (
              <option key={`acct-type-${accountType}`} value={accountType}>
                {accountType === 'credit_card'
                  ? t('accounts.types.creditCard', { ns: 'portal' })
                  : t(`accounts.types.${accountType === 'digital_wallet' ? 'digitalWallet' : accountType}`, { ns: 'portal' })}
              </option>
            ))}
          </select>
          {errors.type && <p className="mt-1.5 text-xs text-negative font-500">{errors.type.message}</p>}
        </div>

        <div>
          <label htmlFor="acct-currency" className="block text-sm font-600 text-foreground mb-1.5">
            {t('accounts.form.currency', { ns: 'portal', defaultValue: t('settings.preferences.defaultCurrency', { ns: 'portal' }) })} <span className="text-negative">*</span>
          </label>
          <select
            id="acct-currency"
            className="input-base"
            {...register('currency')}
          >
            {currencies.map((c) => (
              <option key={`currency-${c}`} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="acct-opening" className="block text-sm font-600 text-foreground mb-1.5">
            {t('accounts.openingBalance', { ns: 'portal' })}
          </label>
          <p className="text-xs text-muted-foreground mb-1.5">
            {t('accounts.form.openingBalanceHelper', { ns: 'portal' })}
          </p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-600">$</span>
            <input
              id="acct-opening"
              type="number"
              step="0.01"
              className={`input-base pl-7 font-tabular ${errors.openingBalance ? 'input-error' : ''}`}
              placeholder="0.00"
              {...register('openingBalance', {
                pattern: { value: /^-?\d+(\.\d{0,2})?$/, message: t('validation.validAmount', { ns: 'common' }) },
              })}
            />
          </div>
          {errors.openingBalance && (
            <p className="mt-1.5 text-xs text-negative font-500">{errors.openingBalance.message}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="acct-notes" className="block text-sm font-600 text-foreground mb-1.5">
            {t('people.form.notes', { ns: 'portal' })}
          </label>
          <textarea
            id="acct-notes"
            rows={2}
            className="input-base resize-none"
            placeholder={t('accounts.form.notesPlaceholder', { ns: 'portal' })}
            {...register('notes')}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">{t('actions.cancel', { ns: 'common' })}</button>
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? (
            <><Loader2 size={15} className="animate-spin" />{t('status.creating', { ns: 'common' })}</>
          ) : (
            t('accounts.addAccount', { ns: 'portal' })
          )}
        </button>
      </div>
    </form>
  );
}
