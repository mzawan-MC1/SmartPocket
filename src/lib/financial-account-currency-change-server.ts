import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { logFinancialAccountsServerError } from '@/lib/financial-accounts-server';
import { convertWithSnapshot } from '@/lib/exchange-rates/conversion';
import { getLatestExchangeRateSnapshot } from '@/lib/exchange-rates/service';
import type { ExchangeRateSnapshotRecord } from '@/lib/exchange-rates/types';
import {
  normalizeCurrencyCode,
  roundAmountForMinorUnits,
  type AccountCurrencyChangeConflictItem,
  type AccountCurrencyChangeConflictType,
  type AccountCurrencyChangePreview,
  type ReportingCurrencyWizardAccountAction,
} from '@/lib/financial-account-currency-change';

export type CurrencyChangeServerAccount = {
  id: string;
  user_id: string;
  name: string;
  account_type: string;
  currency: string;
  current_balance: number | string | null;
  opening_balance: number | string | null;
  is_active: boolean;
  logical_account_id: string | null;
  ownership_type?: string | null;
  scope_type: string | null;
  space_id: string | null;
};

export type CurrencyChangeInspection = {
  currentBalance: number;
  isEmptyAccount: boolean;
  correctionAffectedRecordCount: number;
  conversionAffectedRecordCount: number;
  correctionConflicts: AccountCurrencyChangeConflictItem[];
  conversionConflicts: AccountCurrencyChangeConflictItem[];
};

export type ConversionPreviewTokenPayload = {
  userId: string;
  accountId: string;
  authoritativeBalance: number;
  sourceCurrency: string;
  targetCurrency: string;
  snapshotId: string;
  exchangeRate: number;
  convertedAmount: number;
  roundingAdjustment: number;
  generatedAt: string;
  expiresAt: string;
};

export type ReportingCurrencyBatchTokenAccountPayload = {
  accountId: string;
  action: ReportingCurrencyWizardAccountAction;
  confirmationChecked: boolean;
  sourceCurrency: string;
  targetCurrency: string;
  authoritativeBalance: number;
  convertedAmount: number | null;
  snapshotId: string | null;
  exchangeRate: number | null;
  roundingAdjustment: number | null;
  directUpdateAllowed: boolean;
};

export type ReportingCurrencyBatchTokenPayload = {
  userId: string;
  previousReportingCurrency: string;
  newReportingCurrency: string;
  generatedAt: string;
  expiresAt: string;
  accounts: ReportingCurrencyBatchTokenAccountPayload[];
};

const CONFIGURATION_ERROR_MESSAGE = 'Account currency conversion is temporarily unavailable.';
const CORRECTION_CONFLICT_MESSAGE =
  'This account has linked records that may use their own currencies. Review those items individually before correcting the whole account currency.';
const PREVIEW_TOKEN_MAX_AGE_MS = 10 * 60 * 1000;

function logWizardServerDiagnostic(action: string, context?: Record<string, unknown>) {
  logFinancialAccountsServerError(`reporting-currency-wizard:${action}`, new Error(action), context);
}

function getPreviewSigningSecret() {
  const secret = process.env.ACCOUNT_CURRENCY_PREVIEW_SECRET;
  if (!secret) {
    logWizardServerDiagnostic('preview-secret-missing', {
      hasPreviewSecret: false,
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
    throw new Error(CONFIGURATION_ERROR_MESSAGE);
  }
  return secret;
}

function createSignedToken(payload: ConversionPreviewTokenPayload | ReportingCurrencyBatchTokenPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', getPreviewSigningSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifySignedToken(token: string | null | undefined) {
  if (!token) return null;
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = createHmac('sha256', getPreviewSigningSecret())
    .update(encodedPayload)
    .digest();
  const receivedSignature = Buffer.from(signature, 'base64url');

  if (
    expectedSignature.length !== receivedSignature.length
    || !timingSafeEqual(expectedSignature, receivedSignature)
  ) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
    userId?: string;
    generatedAt?: string;
    expiresAt?: string;
  };
  const generatedAtMs = Date.parse(String(payload.generatedAt || ''));
  const expiresAtMs = Date.parse(String(payload.expiresAt || ''));
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(expiresAtMs)) {
    return null;
  }
  if (expiresAtMs <= generatedAtMs || expiresAtMs - generatedAtMs > PREVIEW_TOKEN_MAX_AGE_MS) {
    return null;
  }
  if (Date.now() > expiresAtMs) {
    return null;
  }

  return payload;
}

async function selectRows<T>(
  queryPromise: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>
) {
  const result = await queryPromise;
  if (result.error) {
    throw new Error(result.error.message || 'Failed to inspect related records');
  }
  return result.data || [];
}

function buildConflict(
  type: AccountCurrencyChangeConflictType,
  count: number,
  message: string
): AccountCurrencyChangeConflictItem {
  return { type, count, message };
}

export function getConfigurationErrorMessage() {
  return CONFIGURATION_ERROR_MESSAGE;
}

export function getCorrectionConflictMessage() {
  return CORRECTION_CONFLICT_MESSAGE;
}

export function getPreviewTokenMaxAgeMs() {
  return PREVIEW_TOKEN_MAX_AGE_MS;
}

export function numbersMatch(left: number, right: number, epsilon = 0.000001) {
  return Math.abs(left - right) <= epsilon;
}

export function createConversionPreviewToken(payload: ConversionPreviewTokenPayload) {
  return createSignedToken(payload);
}

export function verifyConversionPreviewToken(
  token: string | null | undefined,
  expectedUserId: string
): ConversionPreviewTokenPayload | null {
  const payload = verifySignedToken(token) as ConversionPreviewTokenPayload | null;
  if (!payload || payload.userId !== expectedUserId) {
    return null;
  }
  return payload;
}

export function createReportingCurrencyBatchPreviewToken(payload: ReportingCurrencyBatchTokenPayload) {
  return createSignedToken(payload);
}

export function verifyReportingCurrencyBatchPreviewToken(
  token: string | null | undefined,
  expectedUserId: string
): ReportingCurrencyBatchTokenPayload | null {
  const payload = verifySignedToken(token) as ReportingCurrencyBatchTokenPayload | null;
  if (!payload || payload.userId !== expectedUserId) {
    return null;
  }
  return payload;
}

export async function loadTrustedCurrentBalance(accountId: string, options?: { required?: boolean }) {
  const admin = createAdminClient();
  if (!admin) {
    logWizardServerDiagnostic('admin-client-unavailable', {
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasPreviewSecret: Boolean(process.env.ACCOUNT_CURRENCY_PREVIEW_SECRET),
      rpcName: 'rpc_recalculate_financial_account_balance',
    });
    if (options?.required) {
      throw new Error(CONFIGURATION_ERROR_MESSAGE);
    }
    return null;
  }

  const { data, error } = await admin.rpc('rpc_recalculate_financial_account_balance', {
    p_account_id: accountId,
  });

  if (error) {
    logWizardServerDiagnostic('trusted-balance-rpc-failed', {
      rpcName: 'rpc_recalculate_financial_account_balance',
      supabaseErrorCode: 'code' in error ? error.code : undefined,
      supabaseErrorMessage: error.message || 'Unknown Supabase RPC error',
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasPreviewSecret: Boolean(process.env.ACCOUNT_CURRENCY_PREVIEW_SECRET),
    });
    if (options?.required) {
      throw new Error(CONFIGURATION_ERROR_MESSAGE);
    }
    return null;
  }

  const nextBalance = Number(data);
  if (!Number.isFinite(nextBalance)) {
    logWizardServerDiagnostic('trusted-balance-invalid-result', {
      rpcName: 'rpc_recalculate_financial_account_balance',
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasPreviewSecret: Boolean(process.env.ACCOUNT_CURRENCY_PREVIEW_SECRET),
    });
    if (options?.required) {
      throw new Error(CONFIGURATION_ERROR_MESSAGE);
    }
    return null;
  }

  return nextBalance;
}

export async function loadExchangeRateSnapshot(
  supabase: SupabaseClient,
  snapshotId: string
): Promise<ExchangeRateSnapshotRecord> {
  const { data, error } = await supabase
    .from('exchange_rate_snapshots')
    .select('id, base_currency, provider, provider_timestamp, fetched_at, rate_date, rates, status, is_latest, created_at')
    .eq('id', snapshotId)
    .eq('status', 'success')
    .single();

  if (error || !data) {
    logWizardServerDiagnostic('exchange-rate-snapshot-unavailable', {
      snapshotId,
      supabaseErrorCode: error && 'code' in error ? error.code : undefined,
      supabaseErrorMessage: error?.message || 'Exchange-rate snapshot not found',
    });
    throw new Error(error?.message || 'The selected exchange-rate snapshot is unavailable');
  }

  const normalizedRates = Object.fromEntries(
    Object.entries((data.rates || {}) as Record<string, number | string | null>)
      .map(([currencyCode, rawRate]): [string, number] => [currencyCode, Number(rawRate)])
      .filter(([, rate]) => Number.isFinite(rate) && rate > 0)
  ) as Record<string, number>;

  return {
    id: String(data.id),
    provider: String(data.provider || ''),
    base_currency: String(data.base_currency || ''),
    rate_date: String(data.rate_date || ''),
    fetched_at: String(data.fetched_at || ''),
    provider_timestamp: data.provider_timestamp ? String(data.provider_timestamp) : null,
    rates: normalizedRates,
    is_latest: Boolean(data.is_latest),
    status: String(data.status || ''),
    created_at: String(data.created_at || ''),
  };
}

export async function buildConversionPreview(args: {
  supabase: SupabaseClient;
  userId: string;
  accountId: string;
  currentCurrency: string;
  targetCurrency: string;
  minorUnits: number;
  snapshotId?: string | null;
}): Promise<{
  authoritativeBalance: number;
  snapshotId: string;
  exchangeRate: number;
  convertedBalance: number;
  roundingAdjustment: number;
  rateDate: string;
  rateTimestamp: string;
  rateProvider: string;
  previewToken: string;
  previewGeneratedAt: string;
  previewExpiresAt: string;
}> {
  const authoritativeBalance = await loadTrustedCurrentBalance(args.accountId, { required: true });
  if (authoritativeBalance === null) {
    throw new Error(CONFIGURATION_ERROR_MESSAGE);
  }

  const snapshot = args.snapshotId
    ? await loadExchangeRateSnapshot(args.supabase, args.snapshotId)
    : await getLatestExchangeRateSnapshot(args.supabase);

  if (!snapshot) {
    logWizardServerDiagnostic('exchange-rate-snapshot-missing', {
      currentCurrency: args.currentCurrency,
      targetCurrency: args.targetCurrency,
    });
    throw new Error('The current exchange rate is unavailable for this currency pair');
  }

  const conversion = convertWithSnapshot({
    amount: authoritativeBalance,
    fromCurrency: args.currentCurrency,
    toCurrency: args.targetCurrency,
    snapshot,
    lookupMode: 'latest',
  });
  const convertedBalance = roundAmountForMinorUnits(conversion.convertedAmount, args.minorUnits);
  const roundingAdjustment = convertedBalance - conversion.convertedAmount;
  const previewGeneratedAt = new Date().toISOString();
  const previewExpiresAt = new Date(Date.now() + PREVIEW_TOKEN_MAX_AGE_MS).toISOString();
  const previewToken = createConversionPreviewToken({
    userId: args.userId,
    accountId: args.accountId,
    authoritativeBalance,
    sourceCurrency: args.currentCurrency,
    targetCurrency: args.targetCurrency,
    snapshotId: snapshot.id,
    exchangeRate: conversion.rateUsed,
    convertedAmount: convertedBalance,
    roundingAdjustment,
    generatedAt: previewGeneratedAt,
    expiresAt: previewExpiresAt,
  });

  return {
    authoritativeBalance,
    snapshotId: snapshot.id,
    exchangeRate: conversion.rateUsed,
    convertedBalance,
    roundingAdjustment,
    rateDate: conversion.rateDate,
    rateTimestamp: conversion.providerTimestamp || conversion.fetchedAt,
    rateProvider: conversion.provider,
    previewToken,
    previewGeneratedAt,
    previewExpiresAt,
  };
}

export async function inspectAccountCurrencyChange(args: {
  supabase: SupabaseClient;
  account: CurrencyChangeServerAccount;
  currentCurrency: string;
  requireAuthoritativeBalance?: boolean;
}) {
  const { supabase, account, currentCurrency } = args;
  const trustedCurrentBalance = (
    await loadTrustedCurrentBalance(account.id, { required: args.requireAuthoritativeBalance === true })
  ) ?? Number(account.current_balance || 0);

  const [
    transactionRows,
    transferRows,
    subscriptionRows,
    recurringRows,
    settlementRows,
    spaceContributionRows,
  ] = await Promise.all([
    selectRows(
      supabase
        .from('transactions')
        .select('id, currency, transaction_context, space_id')
        .eq('account_id', account.id)
    ),
    selectRows(
      supabase
        .from('transfers')
        .select('id, currency, source_currency, destination_currency')
        .or(`from_account_id.eq.${account.id},to_account_id.eq.${account.id}`)
    ),
    selectRows(
      supabase
        .from('personal_subscriptions')
        .select('id, status')
        .eq('financial_account_id', account.id)
    ),
    selectRows(
      supabase
        .from('recurring_transactions')
        .select('id, currency, space_id, is_active')
        .eq('account_id', account.id)
    ),
    selectRows(
      supabase
        .from('settlements')
        .select('id, currency')
        .eq('receiving_account_id', account.id)
        .eq('is_deleted', false)
    ),
    selectRows(
      supabase
        .from('space_contributions')
        .select('id, currency')
        .eq('destination_account_id', account.id)
    ),
  ]);

  const transactionIds = transactionRows.map((row) => row.id);
  const reimbursements = transactionIds.length > 0
    ? await selectRows(
        supabase
          .from('reimbursements')
          .select('id, currency')
          .in('transaction_id', transactionIds)
          .eq('is_deleted', false)
      )
    : [];

  const reimbursementIds = reimbursements.map((row) => row.id);
  const reimbursementPayments = reimbursementIds.length > 0
    ? await selectRows(
        supabase
          .from('reimbursement_payments')
          .select('id, currency')
          .in('reimbursement_id', reimbursementIds)
      )
    : [];

  const sharedSpaceTransactionsCount = transactionRows.filter(
    (row) => row.transaction_context === 'space' || row.space_id !== null
  ).length;
  const independentTransactionCurrencyCount = transactionRows.filter(
    (row) => normalizeCurrencyCode(row.currency) !== currentCurrency
  ).length;
  const correctionSafeTransactionsCount = transactionRows.filter(
    (row) => normalizeCurrencyCode(row.currency) === currentCurrency
      && row.transaction_context !== 'space'
      && row.space_id === null
  ).length;

  const activeRecurringCount = recurringRows.filter((row) => row.is_active === true).length;
  const activeSubscriptionsCount = subscriptionRows.filter(
    (row) => row.status !== 'cancelled' && row.status !== 'expired'
  ).length;

  const crossCurrencyTransferCount = transferRows.filter((row) => {
    const baseCurrency = normalizeCurrencyCode(row.currency);
    const sourceCurrency = normalizeCurrencyCode(row.source_currency) || baseCurrency;
    const destinationCurrency = normalizeCurrencyCode(row.destination_currency) || baseCurrency;

    return !sourceCurrency
      || !destinationCurrency
      || sourceCurrency !== currentCurrency
      || destinationCurrency !== currentCurrency
      || sourceCurrency !== destinationCurrency;
  }).length;

  const correctionConflicts: AccountCurrencyChangeConflictItem[] = [];

  if (account.scope_type === 'space' || account.space_id) {
    correctionConflicts.push(
      buildConflict(
        'shared_space_account',
        1,
        'Space-owned accounts and shared-space finance records must be reviewed individually before correcting account currency.'
      )
    );
  }
  if (sharedSpaceTransactionsCount > 0) {
    correctionConflicts.push(
      buildConflict(
        'shared_space_transactions',
        sharedSpaceTransactionsCount,
        'Space-linked transactions are attached to this account and block automatic currency correction.'
      )
    );
  }
  if (independentTransactionCurrencyCount > 0) {
    correctionConflicts.push(
      buildConflict(
        'independent_currency_transactions',
        independentTransactionCurrencyCount,
        'Some transactions already use their own explicit currency and cannot be relabeled automatically.'
      )
    );
  }
  if (recurringRows.length > 0) {
    correctionConflicts.push(
      buildConflict(
        'recurring_transactions',
        recurringRows.length,
        'This account has recurring items that may use their own currency. Review those items before correcting the whole account currency.'
      )
    );
  }
  if (transferRows.length > 0) {
    correctionConflicts.push(
      buildConflict(
        'linked_transfers',
        transferRows.length,
        'Transfers linked to this account must be reviewed individually before correcting the whole account currency.'
      )
    );
    if (crossCurrencyTransferCount > 0) {
      correctionConflicts.push(
        buildConflict(
          'cross_currency_transfers',
          crossCurrencyTransferCount,
          'Cross-currency transfers are linked to this account and block automatic currency correction.'
        )
      );
    }
  }
  if (subscriptionRows.length > 0) {
    correctionConflicts.push(
      buildConflict(
        'personal_subscriptions',
        subscriptionRows.length,
        'Personal subscriptions linked to this account use their own currency records and block automatic currency correction.'
      )
    );
  }
  if (reimbursements.length > 0) {
    correctionConflicts.push(
      buildConflict(
        'reimbursements',
        reimbursements.length,
        'Reimbursements linked to this account must be reviewed individually before correcting the whole account currency.'
      )
    );
  }
  if (reimbursementPayments.length > 0) {
    correctionConflicts.push(
      buildConflict(
        'reimbursement_payments',
        reimbursementPayments.length,
        'Reimbursement payments linked to this account must be reviewed individually before correcting the whole account currency.'
      )
    );
  }
  if (settlementRows.length > 0) {
    correctionConflicts.push(
      buildConflict(
        'settlements',
        settlementRows.length,
        'Settlements linked to this account must be reviewed individually before correcting the whole account currency.'
      )
    );
  }
  if (spaceContributionRows.length > 0) {
    correctionConflicts.push(
      buildConflict(
        'space_contributions',
        spaceContributionRows.length,
        'Space contributions linked to this account must be reviewed individually before correcting the whole account currency.'
      )
    );
  }

  const conversionConflicts: AccountCurrencyChangeConflictItem[] = [];
  if (activeRecurringCount > 0) {
    conversionConflicts.push(
      buildConflict(
        'active_recurring',
        activeRecurringCount,
        'Reassign active recurring items before converting this account.'
      )
    );
  }
  if (activeSubscriptionsCount > 0) {
    conversionConflicts.push(
      buildConflict(
        'active_subscriptions',
        activeSubscriptionsCount,
        'Reassign active subscriptions before converting this account.'
      )
    );
  }

  const isEmptyAccount =
    trustedCurrentBalance === 0
    && transactionRows.length === 0
    && transferRows.length === 0
    && subscriptionRows.length === 0
    && recurringRows.length === 0
    && reimbursements.length === 0
    && reimbursementPayments.length === 0
    && settlementRows.length === 0
    && spaceContributionRows.length === 0;

  return {
    currentBalance: trustedCurrentBalance,
    isEmptyAccount,
    correctionAffectedRecordCount: correctionConflicts.length > 0
      ? 0
      : correctionSafeTransactionsCount + 1,
    conversionAffectedRecordCount: isEmptyAccount ? 1 : 2,
    correctionConflicts,
    conversionConflicts,
  } satisfies CurrencyChangeInspection;
}

export function buildSingleAccountPreview(args: {
  account: CurrencyChangeServerAccount;
  currentCurrency: string;
  targetCurrency: string;
  inspection: CurrencyChangeInspection;
  conversionPreview?: {
    authoritativeBalance: number;
    snapshotId: string;
    exchangeRate: number;
    convertedBalance: number;
    roundingAdjustment: number;
    rateDate: string;
    rateTimestamp: string;
    rateProvider: string;
    previewToken: string;
    previewGeneratedAt: string;
    previewExpiresAt: string;
  } | null;
  minorUnits: number;
  mode: 'correction' | 'conversion';
}): AccountCurrencyChangePreview {
  const automationConflicts = args.mode === 'conversion'
    ? args.inspection.conversionConflicts
    : args.inspection.correctionConflicts;

  return {
    accountId: args.account.id,
    logicalAccountId: String(args.account.logical_account_id || args.account.id),
    accountName: String(args.account.name || ''),
    currentCurrency: args.currentCurrency,
    targetCurrency: args.targetCurrency,
    currentBalance: args.conversionPreview?.authoritativeBalance ?? args.inspection.currentBalance,
    isEmptyAccount: args.inspection.isEmptyAccount,
    directUpdateAllowed: args.mode === 'conversion' && args.inspection.isEmptyAccount,
    requiresReplacementAccount: args.mode === 'conversion' && !args.inspection.isEmptyAccount,
    affectedRecordCount: args.mode === 'conversion'
      ? args.inspection.conversionAffectedRecordCount
      : args.inspection.correctionAffectedRecordCount,
    mixedCurrencyConflict: args.mode === 'correction' && args.inspection.correctionConflicts.length > 0,
    mixedCurrencyMessage: args.mode === 'correction' && args.inspection.correctionConflicts.length > 0
      ? CORRECTION_CONFLICT_MESSAGE
      : null,
    automationConflict: automationConflicts.length > 0,
    automationConflictMessage: automationConflicts[0]?.message || null,
    conflicts: automationConflicts,
    exchangeRate: args.conversionPreview?.exchangeRate ?? null,
    convertedBalance: args.mode === 'correction'
      ? args.inspection.currentBalance
      : args.conversionPreview?.convertedBalance ?? null,
    snapshotId: args.conversionPreview?.snapshotId ?? null,
    rateDate: args.conversionPreview?.rateDate ?? null,
    rateTimestamp: args.conversionPreview?.rateTimestamp ?? null,
    rateProvider: args.conversionPreview?.rateProvider ?? null,
    roundingAdjustment: args.conversionPreview?.roundingAdjustment ?? null,
    roundingMinorUnits: args.mode === 'conversion' ? args.minorUnits : null,
    previewToken: args.conversionPreview?.previewToken ?? null,
    previewGeneratedAt: args.conversionPreview?.previewGeneratedAt ?? null,
    previewExpiresAt: args.conversionPreview?.previewExpiresAt ?? null,
  };
}

export async function loadActivePersonalAccountsForWizard(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select(`
      id,
      user_id,
      name,
      account_type,
      currency,
      current_balance,
      opening_balance,
      is_active,
      logical_account_id,
      ownership_type,
      scope_type,
      space_id
    `)
    .eq('user_id', userId)
    .eq('is_active', true)
    .is('space_id', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    logWizardServerDiagnostic('load-active-personal-accounts-failed', {
      userId,
      supabaseErrorCode: 'code' in error ? error.code : undefined,
      supabaseErrorMessage: error.message || 'Failed to load accounts',
    });
    throw new Error(error.message || 'Failed to load accounts');
  }

  return ((data || []) as CurrencyChangeServerAccount[]).filter((account) => {
    const ownershipType = (account.ownership_type || 'personal').trim().toLowerCase();
    const scopeType = (account.scope_type || 'personal').trim().toLowerCase();
    return ownershipType === 'personal' && scopeType === 'personal' && !account.space_id;
  });
}

export async function loadActiveCurrencyMinorUnits(supabase: SupabaseClient, code: string) {
  const { data, error } = await supabase
    .from('currency_registry')
    .select('code, minor_units, is_active')
    .eq('code', code)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    logWizardServerDiagnostic('reporting-currency-unavailable', {
      currencyCode: code,
      supabaseErrorCode: error && 'code' in error ? error.code : undefined,
      supabaseErrorMessage: error?.message || 'Selected currency is unavailable',
    });
    throw new Error('The selected currency is unavailable');
  }

  return {
    code: String(data.code),
    minorUnits: Number(data.minor_units || 0),
  };
}

export async function loadUserReportingCurrency(supabase: SupabaseClient, userId: string) {
  const [{ data: profile, error: profileError }, { data: platformSettings }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('default_currency')
      .eq('id', userId)
      .single(),
    supabase
      .from('platform_settings')
      .select('default_currency')
      .single(),
  ]);

  if (profileError) {
    throw new Error(profileError.message || 'Failed to load reporting currency');
  }

  return normalizeCurrencyCode(profile?.default_currency)
    || normalizeCurrencyCode(platformSettings?.default_currency)
    || 'USD';
}
