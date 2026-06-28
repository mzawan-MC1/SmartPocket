'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
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
import { formatCurrencyText } from '@/lib/currency-formatting';
import { getIntlLocale } from '@/lib/locale';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import {
  getAccountTransferCapabilities,
  getFinancialAccountScopeType,
} from '@/lib/financial-account-utils';

type TransferPurpose =
  | 'normal_transfer'
  | 'member_contribution'
  | 'reimbursement_payout'
  | 'settlement';

interface TransferFormData {
  from_account_id: string;
  to_account_id: string;
  amount: string;
  description: string;
  transfer_date: string;
  notes: string;
  transfer_purpose: TransferPurpose;
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
  const { t, i18n } = useTranslation(['portal', 'common']);
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<FinancialAccount[]>(providedAccounts || []);
  const [loadingAccounts, setLoadingAccounts] = useState(!providedAccounts);
  const [isLoading, setIsLoading] = useState(false);
  const [latestSnapshot, setLatestSnapshot] = useState<Awaited<ReturnType<typeof getLatestExchangeRateSnapshot>> | null>(null);
  const [latestSnapshotError, setLatestSnapshotError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState<TransferFormData>({
    from_account_id: '',
    to_account_id: '',
    amount: '',
    description: '',
    transfer_date: new Date().toISOString().split('T')[0],
    notes: '',
    transfer_purpose: 'normal_transfer',
  });
  const locale = getIntlLocale(i18n.resolvedLanguage || i18n.language || 'en');

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

  const accountOptions = useMemo(
    () => accounts
      .filter((account) => account.is_active)
      .filter((account) => {
        if (getFinancialAccountScopeType(account) === 'space') {
          return true;
        }
        return account.user_id === user?.id;
      })
      .map((account) => ({
        account,
        capabilities: getAccountTransferCapabilities(account),
      })),
    [accounts, user?.id]
  );
  const fromAccountOptions = useMemo(
    () => accountOptions.filter((option) => option.capabilities.canUseAsTransferSource),
    [accountOptions]
  );
  const fromAccount = fromAccountOptions.find((option) => option.account.id === form.from_account_id)?.account
    || accountOptions.find((option) => option.account.id === form.from_account_id)?.account;
  const toAccountOptions = useMemo(
    () => accountOptions.filter((option) =>
      option.account.id !== form.from_account_id && option.capabilities.canUseAsTransferDestination
    ),
    [accountOptions, form.from_account_id]
  );
  const toAccount = toAccountOptions.find((option) => option.account.id === form.to_account_id)?.account
    || accountOptions.find((option) => option.account.id === form.to_account_id)?.account;

  const formatAccountBalanceText = (account: FinancialAccount) =>
    formatCurrencyText(account.current_balance, {
      currencyCode: account.currency,
      locale,
    });

  const canShowAccountBalance = useCallback((account: FinancialAccount) => {
    if (getFinancialAccountScopeType(account) === 'space') {
      return true;
    }
    return account.user_id === user?.id;
  }, [user?.id]);

  const getScopeLabel = (account: FinancialAccount) => {
    const scope = getFinancialAccountScopeType(account);
    if (scope === 'space') {
      return t('spaces.title', {
        ns: 'portal',
        defaultValue: 'Space',
      });
    }
    return t('transfers.form.personalScope', {
      ns: 'portal',
      defaultValue: 'Personal',
    });
  };

  const getAccountDescriptor = (account: FinancialAccount) => {
    if (account.is_system_default && account.system_default_type === 'personal_cash') {
      return t('transfers.form.systemDefaultLabels.personalCash', { ns: 'portal' });
    }

    if (account.is_system_default && account.system_default_type === 'personal_bank') {
      return t('transfers.form.systemDefaultLabels.personalBank', { ns: 'portal' });
    }

    const bankName = account.bank_name?.trim();
    if (bankName && bankName.toLowerCase() !== account.name.trim().toLowerCase()) {
      return bankName;
    }

    return null;
  };

  const getAccountOptionLabel = (account: FinancialAccount) => {
    const descriptor = getAccountDescriptor(account);
    const parts = [account.name, getScopeLabel(account)];

    if (descriptor) {
      parts.push(descriptor);
    }

    if (canShowAccountBalance(account)) {
      return `${parts.join(' · ')} \u2014 ${formatAccountBalanceText(account)}`;
    }

    return parts.join(' · ');
  };

  const transferRoute = useMemo(() => {
    if (!fromAccount || !toAccount) return null;
    const fromScope = getFinancialAccountScopeType(fromAccount);
    const toScope = getFinancialAccountScopeType(toAccount);
    return {
      fromScope,
      toScope,
      key: `${fromScope}_to_${toScope}` as
        | 'personal_to_personal'
        | 'personal_to_space'
        | 'space_to_personal'
        | 'space_to_space',
    };
  }, [fromAccount, toAccount]);
  const allowedPurposes = useMemo<TransferPurpose[]>(() => {
    if (!transferRoute) return ['normal_transfer'];
    if (transferRoute.key === 'personal_to_space') {
      return ['normal_transfer', 'member_contribution'];
    }
    return ['normal_transfer'];
  }, [transferRoute]);
  const recommendedPurpose: TransferPurpose = transferRoute?.key === 'personal_to_space'
    ? 'member_contribution'
    : 'normal_transfer';
  const getPurposeLabel = (purpose: TransferPurpose) => {
    switch (purpose) {
      case 'member_contribution':
        return t('transfers.form.purposes.memberContribution', {
          ns: 'portal',
          defaultValue: 'Member contribution',
        });
      case 'reimbursement_payout':
        return t('transfers.form.purposes.reimbursementPayout', {
          ns: 'portal',
          defaultValue: 'Reimbursement payout',
        });
      case 'settlement':
        return t('transfers.form.purposes.settlement', {
          ns: 'portal',
          defaultValue: 'Settlement',
        });
      case 'normal_transfer':
      default:
        return t('transfers.form.purposes.normalTransfer', {
          ns: 'portal',
          defaultValue: 'Normal transfer',
        });
    }
  };
  const getRouteLabel = () => {
    switch (transferRoute?.key) {
      case 'personal_to_space':
        return t('transfers.form.routes.personalToSpace', {
          ns: 'portal',
          defaultValue: 'Personal to Space',
        });
      case 'space_to_personal':
        return t('transfers.form.routes.spaceToPersonal', {
          ns: 'portal',
          defaultValue: 'Space to Personal',
        });
      case 'space_to_space':
        return t('transfers.form.routes.spaceToSpace', {
          ns: 'portal',
          defaultValue: 'Space to Space',
        });
      case 'personal_to_personal':
      default:
        return t('transfers.form.routes.personalToPersonal', {
          ns: 'portal',
          defaultValue: 'Personal to Personal',
        });
    }
  };
  const hasAccounts = fromAccountOptions.length > 0;
  const hasDestinationAccounts = toAccountOptions.length > 0;
  const selectAccountPlaceholder = hasAccounts
    ? t('transfers.form.selectAccount', { ns: 'portal' })
    : t('transfers.form.noAccountsAvailable', { ns: 'portal' });
  const selectDestinationPlaceholder = hasDestinationAccounts
    ? t('transfers.form.selectAccount', { ns: 'portal' })
    : t('transfers.form.noAccountsAvailable', { ns: 'portal' });

  useEffect(() => {
    if (!allowedPurposes.includes(form.transfer_purpose)) {
      setForm((current) => ({
        ...current,
        transfer_purpose: allowedPurposes.includes(recommendedPurpose)
          ? recommendedPurpose
          : allowedPurposes[0] || 'normal_transfer',
      }));
    }
  }, [allowedPurposes, form.transfer_purpose, recommendedPurpose]);

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
    setSubmitError(null);
    if (!form.from_account_id || !form.to_account_id) {
      const message = t('transfers.form.selectBothAccounts', { ns: 'portal' });
      setSubmitError(message);
      toast.error(message);
      return;
    }
    if (form.from_account_id === form.to_account_id) {
      const message = t('transfers.form.chooseDifferentAccounts', { ns: 'portal' });
      setSubmitError(message);
      toast.error(message);
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      const message = t('settlements.validAmountError', { ns: 'portal' });
      setSubmitError(message);
      toast.error(message);
      return;
    }

    setIsLoading(true);
    try {
      const sourceAccount = accounts.find((account) => account.id === form.from_account_id);
      const destinationAccount = accounts.find((account) => account.id === form.to_account_id);
      if (!sourceAccount?.currency || !destinationAccount?.currency) {
        const message = t('transfers.form.accountsNeedCurrencies', { ns: 'portal' });
        setSubmitError(message);
        toast.error(message);
        return;
      }
      if (
        sourceAccount.currency !== destinationAccount.currency &&
        (!transferPreview || !transferPreview.available || transferPreview.destinationAmount === null)
      ) {
        const message = transferPreview?.error || t('transfers.form.crossCurrencyPreviewRequired', { ns: 'portal' });
        setSubmitError(message);
        toast.error(message);
        return;
      }
      if (form.transfer_purpose === 'member_contribution' && transferRoute?.key !== 'personal_to_space') {
        const message = t('transfers.form.invalidContributionRoute', {
          ns: 'portal',
          defaultValue: 'Member contributions must move from a personal account into a Space account.',
        });
        setSubmitError(message);
        toast.error(message);
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
        transfer_purpose: form.transfer_purpose,
      });

      const changedEntities: SmartPocketDataEntity[] = [
        'transfers',
        'financial_accounts',
        'transactions',
        'dashboard',
      ];
      if (transferRoute && transferRoute.key !== 'personal_to_personal') {
        changedEntities.push('spaces');
      }

      dispatchSmartPocketDataChanged({
        source: 'add-transfer-form',
        entities: changedEntities,
      });
      toast.success(t('transfers.form.completed', { ns: 'portal' }));
      onSuccess();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('transfers.form.createFailed', { ns: 'portal' });
      setSubmitError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (loadingAccounts) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-6 text-center">
        <Loader2 size={18} className="mx-auto mb-2 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">{t('transfers.form.loadingAccounts', { ns: 'portal' })}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-[480px]:space-y-3" noValidate>
      <div className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">
            {t('transfers.form.fromAccount', { ns: 'portal' })}
          </label>
          <select
            className="input-base h-11 max-w-full truncate pr-10 max-[480px]:h-10"
            value={form.from_account_id}
            onChange={(event) => setForm((current) => ({ ...current, from_account_id: event.target.value }))}
            disabled={!hasAccounts}
            title={fromAccount ? getAccountOptionLabel(fromAccount) : undefined}
          >
            <option value="">{selectAccountPlaceholder}</option>
            {fromAccountOptions.map(({ account }) => (
              <option key={account.id} value={account.id} title={getAccountOptionLabel(account)}>
                {getAccountOptionLabel(account)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">
            {t('transfers.form.toAccount', { ns: 'portal' })}
          </label>
          <select
            className="input-base h-11 max-w-full truncate pr-10 max-[480px]:h-10"
            value={form.to_account_id}
            onChange={(event) => setForm((current) => ({ ...current, to_account_id: event.target.value }))}
            disabled={!hasDestinationAccounts}
            title={toAccount ? getAccountOptionLabel(toAccount) : undefined}
          >
            <option value="">{selectDestinationPlaceholder}</option>
            {toAccountOptions.map(({ account }) => (
                <option key={account.id} value={account.id} title={getAccountOptionLabel(account)}>
                  {getAccountOptionLabel(account)}
                </option>
              ))}
          </select>
        </div>
      </div>

      {transferRoute ? (
        <div className="rounded-xl border border-border bg-muted/10 p-3">
          <div className="grid grid-cols-1 gap-3 min-[430px]:grid-cols-2">
            <div>
              <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                {t('transfers.form.routeLabel', {
                  ns: 'portal',
                  defaultValue: 'Transfer route',
                })}
              </p>
              <p className="mt-1 text-sm font-600 text-foreground">{getRouteLabel()}</p>
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                {t('transfers.form.transferPurpose', {
                  ns: 'portal',
                  defaultValue: 'Transfer purpose',
                })}
              </label>
              <select
                className="input-base h-10"
                value={form.transfer_purpose}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  transfer_purpose: event.target.value as TransferPurpose,
                }))}
              >
                {allowedPurposes.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {getPurposeLabel(purpose)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      ) : null}

      <div>
        <label className="mb-1.5 block text-sm font-600 text-foreground">
          {t('transactions.form.amount', { ns: 'portal' })}
        </label>
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
          {allowedPurposes.includes('member_contribution')
            ? t('transfers.form.helper', { ns: 'portal' })
            : t('transfers.form.genericHelper', {
              ns: 'portal',
              defaultValue: 'Use the reimbursements or settlements pages for obligation-linked payouts. This form handles direct account transfers and member contributions.',
            })}
        </p>
      </div>

      {submitError ? (
        <div className="rounded-xl border border-negative/20 bg-negative-soft/50 px-4 py-3 text-sm text-negative">
          {submitError}
        </div>
      ) : null}

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
