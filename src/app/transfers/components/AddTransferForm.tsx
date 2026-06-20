'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  dispatchSmartPocketDataChanged,
  type SmartPocketDataEntity,
} from '@/lib/data-change';
import { convertWithSnapshot } from '@/lib/exchange-rates/conversion';
import { getLatestExchangeRateSnapshot } from '@/lib/exchange-rates/service';
import {
  createTransfer,
  getAccounts,
  type FinancialAccount,
} from '@/lib/finance';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';

interface TransferFormData {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  description: string;
  transfer_date: string;
  notes: string;
}

export default function AddTransferForm({
  accounts: providedAccounts,
  onSuccess,
  onCancel,
}: {
  accounts?: FinancialAccount[];
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const [accounts, setAccounts] = useState<FinancialAccount[]>(providedAccounts || []);
  const [loadingAccounts, setLoadingAccounts] = useState(!providedAccounts);
  const [isLoading, setIsLoading] = useState(false);
  const [latestSnapshot, setLatestSnapshot] = useState<Awaited<ReturnType<typeof getLatestExchangeRateSnapshot>> | null>(null);
  const [latestSnapshotError, setLatestSnapshotError] = useState<string | null>(null);
  const [form, setForm] = useState<TransferFormData>({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    description: '',
    transfer_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  useEffect(() => {
    if (providedAccounts) {
      setAccounts(providedAccounts);
      setLoadingAccounts(false);
      return;
    }

    let cancelled = false;
    setLoadingAccounts(true);
    void getAccounts()
      .then((nextAccounts) => {
        if (!cancelled) {
          setAccounts(nextAccounts.filter((account) => account.is_active));
        }
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : t('accounts.loadFailed', { ns: 'portal' })))
      .finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [providedAccounts]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void getLatestExchangeRateSnapshot(supabase)
      .then((snapshot) => {
        if (!cancelled) {
          setLatestSnapshot(snapshot);
          setLatestSnapshotError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLatestSnapshot(null);
          setLatestSnapshotError(error instanceof Error ? error.message : t('transfers.form.exchangeRatesFailed', { ns: 'portal' }));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const fromAccount = accounts.find((account) => account.id === form.from_account_id);
  const toAccount = accounts.find((account) => account.id === form.to_account_id);

  const transferPreview = useMemo(() => {
    const numericAmount = Number(form.amount);
    if (!fromAccount?.currency || !toAccount?.currency || !Number.isFinite(numericAmount) || numericAmount <= 0) {
      return null;
    }

    if (fromAccount.currency === toAccount.currency) {
      return {
        available: true,
        sameCurrency: true,
        sourceAmount: numericAmount,
        sourceCurrency: fromAccount.currency,
        destinationAmount: numericAmount,
        destinationCurrency: toAccount.currency,
        rateUsed: 1,
        provider: null,
        rateDate: null,
        providerTimestamp: null,
        fetchedAt: null,
        stale: false,
        snapshotId: null as string | null,
        error: null as string | null,
      };
    }

    if (!latestSnapshot) {
      return {
        available: false,
        sameCurrency: false,
        sourceAmount: numericAmount,
        sourceCurrency: fromAccount.currency,
        destinationAmount: null,
        destinationCurrency: toAccount.currency,
        rateUsed: null,
        provider: null,
        rateDate: null,
        providerTimestamp: null,
        fetchedAt: null,
        stale: true,
        snapshotId: null,
        error: latestSnapshotError || t('transfers.form.noExchangeRateSnapshot', { ns: 'portal' }),
      };
    }

    try {
      const conversion = convertWithSnapshot({
        amount: numericAmount,
        fromCurrency: fromAccount.currency,
        toCurrency: toAccount.currency,
        snapshot: latestSnapshot,
        lookupMode: 'latest',
      });

      return {
        available: true,
        sameCurrency: false,
        sourceAmount: numericAmount,
        sourceCurrency: fromAccount.currency,
        destinationAmount: conversion.convertedAmount,
        destinationCurrency: toAccount.currency,
        rateUsed: conversion.rateUsed,
        provider: conversion.provider,
        rateDate: conversion.rateDate,
        providerTimestamp: conversion.providerTimestamp,
        fetchedAt: conversion.fetchedAt,
        stale: conversion.stale,
        snapshotId: latestSnapshot.id,
        error: null,
      };
    } catch (error) {
      return {
        available: false,
        sameCurrency: false,
        sourceAmount: numericAmount,
        sourceCurrency: fromAccount.currency,
        destinationAmount: null,
        destinationCurrency: toAccount.currency,
        rateUsed: null,
        provider: null,
        rateDate: null,
        providerTimestamp: null,
        fetchedAt: null,
        stale: true,
        snapshotId: latestSnapshot.id,
        error: error instanceof Error ? error.message : t('transfers.form.previewFailed', { ns: 'portal' }),
      };
    }
  }, [form.amount, fromAccount, latestSnapshot, latestSnapshotError, toAccount]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.from_account_id || !form.to_account_id) {
      toast.error(t('transfers.form.selectBothAccounts', { ns: 'portal' }));
      return;
    }
    if (form.from_account_id === form.to_account_id) {
      toast.error(t('transfers.form.chooseDifferentAccounts', { ns: 'portal' }));
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error(t('settlements.validAmountError', { ns: 'portal' }));
      return;
    }

    setIsLoading(true);
    try {
      const sourceAccount = accounts.find((account) => account.id === form.from_account_id);
      const destinationAccount = accounts.find((account) => account.id === form.to_account_id);
      if (!sourceAccount?.currency || !destinationAccount?.currency) {
        toast.error(t('transfers.form.accountsNeedCurrencies', { ns: 'portal' }));
        return;
      }
      if (
        sourceAccount.currency !== destinationAccount.currency &&
        (!transferPreview || !transferPreview.available || transferPreview.destinationAmount === null)
      ) {
        toast.error(transferPreview?.error || t('transfers.form.crossCurrencyPreviewRequired', { ns: 'portal' }));
        return;
      }

      await createTransfer({
        from_account_id: form.from_account_id,
        to_account_id: form.to_account_id,
        amount: parseFloat(form.amount),
        currency: sourceAccount.currency,
        source_amount: parseFloat(form.amount),
        source_currency: sourceAccount.currency,
        destination_amount: transferPreview?.destinationAmount ?? parseFloat(form.amount),
        destination_currency: destinationAccount.currency,
        exchange_rate: transferPreview?.rateUsed ?? 1,
        exchange_rate_provider: transferPreview?.sameCurrency ? null : transferPreview?.provider ?? null,
        exchange_rate_snapshot_id: transferPreview?.sameCurrency ? null : transferPreview?.snapshotId ?? null,
        exchange_rate_date: transferPreview?.sameCurrency ? form.transfer_date : transferPreview?.rateDate ?? null,
        exchange_rate_timestamp:
          transferPreview?.sameCurrency ? null : transferPreview?.providerTimestamp ?? transferPreview?.fetchedAt ?? null,
        description: form.description || t('transfers.transferFallback', { ns: 'portal' }),
        transfer_date: form.transfer_date,
        notes: form.notes || undefined,
      });

      const changedEntities: SmartPocketDataEntity[] = [
        'transfers',
        'financial_accounts',
        'transactions',
        'dashboard',
      ];

      dispatchSmartPocketDataChanged({
        source: 'add-transfer-form',
        entities: changedEntities,
      });
      toast.success(t('transfers.form.completed', { ns: 'portal' }));
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('transfers.form.createFailed', { ns: 'portal' }));
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingAccounts) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-6 text-center">
        <Loader2 size={18} className="mx-auto mb-2 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">{t('transfers.form.loading', { ns: 'portal' })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-[480px]:space-y-3" noValidate>
      <div className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">From Account *</label>
          <select
            className="input-base h-11 max-[480px]:h-10"
            value={form.from_account_id}
            onChange={(event) => setForm((current) => ({ ...current, from_account_id: event.target.value }))}
          >
            <option value="">Select account...</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name} ({account.currency} {account.current_balance})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">To Account *</label>
          <select
            className="input-base h-11 max-[480px]:h-10"
            value={form.to_account_id}
            onChange={(event) => setForm((current) => ({ ...current, to_account_id: event.target.value }))}
          >
            <option value="">Select account...</option>
            {accounts
              .filter((account) => account.id !== form.from_account_id)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-600 text-foreground">Amount *</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          className="input-base h-12 text-base font-tabular max-[480px]:h-11"
          placeholder="0.00"
          value={form.amount}
          onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
        />
      </div>

      {transferPreview && fromAccount && toAccount ? (
        <div
          className={`rounded-xl border p-3 ${
            transferPreview.available ? 'border-info/20 bg-info-soft/40' : 'border-warning/30 bg-warning-soft/20'
          }`}
        >
          <p className="text-xs font-700 uppercase tracking-[0.14em] text-muted-foreground">{t('transfers.form.preview', { ns: 'portal' })}</p>
          <div className="mt-2 flex items-center gap-2 text-sm font-600 text-foreground">
            <FormattedCurrencyAmount amount={transferPreview.sourceAmount} currencyCode={transferPreview.sourceCurrency} size="sm" />
            <ChevronRight size={14} className="text-muted-foreground" />
            {transferPreview.destinationAmount !== null ? (
              <FormattedCurrencyAmount amount={transferPreview.destinationAmount} currencyCode={transferPreview.destinationCurrency} size="sm" />
            ) : (
              <span className="text-warning">{transferPreview.error}</span>
            )}
          </div>
          {!transferPreview.sameCurrency && transferPreview.available ? (
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <p>{t('accounts.summary.provider', { ns: 'portal', value: transferPreview.provider || t('aiHistory.unknown', { ns: 'portal' }) })}</p>
              <p>{t('accounts.summary.rateDate', { ns: 'portal', value: transferPreview.rateDate || t('aiHistory.unknown', { ns: 'portal' }) })}</p>
              {transferPreview.stale ? <p className="text-warning">{t('transfers.form.stalePreview', { ns: 'portal' })}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">{t('settlements.descriptionLabel', { ns: 'portal' })}</label>
          <input
            type="text"
            className="input-base h-11 max-[480px]:h-10"
            placeholder={t('transfers.form.descriptionPlaceholder', { ns: 'portal' })}
            value={form.description}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">{t('settlements.date', { ns: 'portal' })}</label>
          <input
            type="date"
            className="input-base h-11 max-[480px]:h-10"
            value={form.transfer_date}
            onChange={(event) => setForm((current) => ({ ...current, transfer_date: event.target.value }))}
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-600 text-foreground">{t('reimbursements.notes', { ns: 'portal' })}</label>
        <textarea
          rows={2}
          className="input-base resize-none"
          placeholder={t('transfers.form.notesPlaceholder', { ns: 'portal' })}
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
        />
      </div>

      <div className="rounded-xl border border-info/20 bg-info-soft/40 p-3">
        <p className="text-xs font-600 text-info">
          {t('transfers.form.helper', { ns: 'portal' })}
        </p>
      </div>

      <div className="sticky bottom-0 safe-area-bottom border-t border-border bg-card/95 pt-3 backdrop-blur max-[480px]:-mx-4 max-[480px]:px-4">
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1">
            {t('actions.cancel', { ns: 'common' })}
          </button>
          <button type="submit" disabled={isLoading} className="btn-primary flex-1">
            {isLoading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {t('transfers.form.processing', { ns: 'portal' })}
              </>
            ) : (
              t('transfers.form.completeAction', { ns: 'portal' })
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
