'use client';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Loader2 } from 'lucide-react';

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

const accountTypes = ['Bank', 'Credit Card', 'Savings', 'Cash', 'Digital Wallet', 'Investment', 'Custom'];
const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR'];

export default function AddAccountForm({ onSuccess, onCancel }: AddAccountFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddAccountFormData>({
    defaultValues: { currency: 'USD', type: 'Bank', openingBalance: '0.00' },
  });

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
            Account Name <span className="text-negative">*</span>
          </label>
          <input
            id="acct-name"
            type="text"
            className={`input-base ${errors.name ? 'input-error' : ''}`}
            placeholder="e.g. Chase Checking, Cash Wallet"
            {...register('name', { required: 'Account name is required' })}
          />
          {errors.name && <p className="mt-1.5 text-xs text-negative font-500">{errors.name.message}</p>}
        </div>

        <div>
          <label htmlFor="acct-type" className="block text-sm font-600 text-foreground mb-1.5">
            Account Type <span className="text-negative">*</span>
          </label>
          <select
            id="acct-type"
            className={`input-base ${errors.type ? 'input-error' : ''}`}
            {...register('type', { required: 'Account type is required' })}
          >
            {accountTypes.map((t) => (
              <option key={`acct-type-${t}`} value={t}>{t}</option>
            ))}
          </select>
          {errors.type && <p className="mt-1.5 text-xs text-negative font-500">{errors.type.message}</p>}
        </div>

        <div>
          <label htmlFor="acct-currency" className="block text-sm font-600 text-foreground mb-1.5">
            Currency <span className="text-negative">*</span>
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
            Opening Balance
          </label>
          <p className="text-xs text-muted-foreground mb-1.5">
            The current balance of this account. Use a negative number for credit card debt.
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
                pattern: { value: /^-?\d+(\.\d{0,2})?$/, message: 'Enter a valid amount' },
              })}
            />
          </div>
          {errors.openingBalance && (
            <p className="mt-1.5 text-xs text-negative font-500">{errors.openingBalance.message}</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="acct-notes" className="block text-sm font-600 text-foreground mb-1.5">
            Notes
          </label>
          <textarea
            id="acct-notes"
            rows={2}
            className="input-base resize-none"
            placeholder="Optional notes about this account..."
            {...register('notes')}
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? (
            <><Loader2 size={15} className="animate-spin" />Adding Account...</>
          ) : (
            'Add Account'
          )}
        </button>
      </div>
    </form>
  );
}