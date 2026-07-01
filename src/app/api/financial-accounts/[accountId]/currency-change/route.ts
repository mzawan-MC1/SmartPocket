import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logFinancialAccountsServerError } from '@/lib/financial-accounts-server';
import { convertWithSnapshot } from '@/lib/exchange-rates/conversion';
import { getLatestExchangeRateSnapshot } from '@/lib/exchange-rates/service';
import type { ExchangeRateSnapshotRecord } from '@/lib/exchange-rates/types';
import {
  normalizeCurrencyCode,
  roundAmountForMinorUnits,
  type AccountCurrencyChangeMode,
  type AccountCurrencyChangeConflictItem,
  type AccountCurrencyChangePreview,
  type ApplyAccountCurrencyChangeResult,
} from '@/lib/financial-account-currency-change';

export const runtime = 'nodejs';

type PreviewBody = {
  intent: 'preview';
  mode: AccountCurrencyChangeMode;
  targetCurrency: string;
};

type ApplyBody = {
  intent: 'apply';
  mode: AccountCurrencyChangeMode;
  targetCurrency: string;
  reason?: string;
  confirmationChecked?: boolean;
  snapshotId?: string | null;
  previewToken?: string | null;
};

type RouteCookieMutations = Awaited<ReturnType<typeof createRouteHandlerSupabaseClient>>['cookieMutations'];

function badRequest(message: string, cookieMutations: RouteCookieMutations) {
  return applySupabaseCookies(
    NextResponse.json({ error: message }, { status: 400 }),
    cookieMutations
  );
}

function conflictResponse(
  message: string,
  conflicts: AccountCurrencyChangeConflictItem[],
  cookieMutations: RouteCookieMutations,
  status = 409
) {
  return applySupabaseCookies(
    NextResponse.json({ error: message, conflicts }, { status }),
    cookieMutations
  );
}

async function requireRouteUser() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      ),
    };
  }

  return { ok: true as const, supabase, cookieMutations, user };
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

type RouteAccount = {
  id: string;
  user_id: string;
  name: string;
  currency: string;
  current_balance: number | string | null;
  opening_balance: number | string | null;
  is_active: boolean;
  logical_account_id: string | null;
  scope_type: string | null;
  space_id: string | null;
};

type CurrencyChangeInspection = {
  currentBalance: number;
  isEmptyAccount: boolean;
  correctionAffectedRecordCount: number;
  conversionAffectedRecordCount: number;
  correctionConflicts: AccountCurrencyChangeConflictItem[];
  conversionConflicts: AccountCurrencyChangeConflictItem[];
};

type ConversionPreviewTokenPayload = {
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

const CORRECTION_CONFLICT_MESSAGE =
  'This account has linked records that may use their own currencies. Review those items individually before correcting the whole account currency.';
const CONFIGURATION_ERROR_MESSAGE = 'Account currency conversion is temporarily unavailable.';
const PREVIEW_TOKEN_MAX_AGE_MS = 10 * 60 * 1000;

function buildConflict(type: AccountCurrencyChangeConflictItem['type'], count: number, message: string) {
  return { type, count, message } satisfies AccountCurrencyChangeConflictItem;
}

function previewOutdatedResponse(
  message: string,
  preview: AccountCurrencyChangePreview,
  cookieMutations: RouteCookieMutations
) {
  return applySupabaseCookies(
    NextResponse.json({ error: message, code: 'preview_outdated', preview }, { status: 409 }),
    cookieMutations
  );
}

function getPreviewSigningSecret() {
  const secret = process.env.ACCOUNT_CURRENCY_PREVIEW_SECRET;
  if (!secret) {
    throw new Error(CONFIGURATION_ERROR_MESSAGE);
  }
  return secret;
}

function createPreviewToken(payload: ConversionPreviewTokenPayload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', getPreviewSigningSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function verifyPreviewToken(token: string | null | undefined, expectedUserId: string) {
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

  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as ConversionPreviewTokenPayload;
  const generatedAtMs = Date.parse(payload.generatedAt);
  const expiresAtMs = Date.parse(payload.expiresAt);
  if (!Number.isFinite(generatedAtMs) || !Number.isFinite(expiresAtMs)) {
    return null;
  }
  if (expiresAtMs <= generatedAtMs || expiresAtMs - generatedAtMs > PREVIEW_TOKEN_MAX_AGE_MS) {
    return null;
  }
  if (Date.now() > expiresAtMs) {
    return null;
  }
  if (payload.userId !== expectedUserId) {
    return null;
  }
  return payload;
}

function numbersMatch(left: number, right: number, epsilon = 0.000001) {
  return Math.abs(left - right) <= epsilon;
}

async function loadTrustedCurrentBalance(accountId: string, options?: { required?: boolean }) {
  const admin = createAdminClient();
  if (!admin) {
    if (options?.required) {
      throw new Error(CONFIGURATION_ERROR_MESSAGE);
    }
    return null;
  }

  const { data, error } = await admin.rpc('rpc_recalculate_financial_account_balance', {
    p_account_id: accountId,
  });

  if (error) {
    if (options?.required) {
      throw new Error(CONFIGURATION_ERROR_MESSAGE);
    }
    return null;
  }

  const nextBalance = Number(data);
  if (!Number.isFinite(nextBalance)) {
    if (options?.required) {
      throw new Error(CONFIGURATION_ERROR_MESSAGE);
    }
    return null;
  }

  return nextBalance;
}

async function loadExchangeRateSnapshot(
  supabase: Awaited<ReturnType<typeof createRouteHandlerSupabaseClient>>['supabase'],
  snapshotId: string
): Promise<ExchangeRateSnapshotRecord> {
  const { data, error } = await supabase
    .from('exchange_rate_snapshots')
    .select('id, base_currency, provider, provider_timestamp, fetched_at, rate_date, rates, status, is_latest, created_at')
    .eq('id', snapshotId)
    .eq('status', 'success')
    .single();

  if (error || !data) {
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

async function buildConversionPreview(args: {
  supabase: Awaited<ReturnType<typeof createRouteHandlerSupabaseClient>>['supabase'];
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
  const previewToken = createPreviewToken({
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

async function inspectAccountCurrencyChange(args: {
  supabase: Awaited<ReturnType<typeof createRouteHandlerSupabaseClient>>['supabase'];
  account: RouteAccount;
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

export async function POST(
  request: Request,
  context: { params: Promise<{ accountId: string }> }
) {
  const auth = await requireRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { accountId } = await context.params;
  const { supabase, cookieMutations, user } = auth;

  try {
    const body = await request.json() as PreviewBody | ApplyBody;
    const targetCurrency = normalizeCurrencyCode(body?.targetCurrency);
    const mode = body?.mode;

    if (!mode || (mode !== 'correction' && mode !== 'conversion')) {
      return badRequest('Choose how you want to change this account currency', cookieMutations);
    }

    if (!targetCurrency) {
      return badRequest('Choose a valid target currency', cookieMutations);
    }

    const { data: account, error: accountError } = await supabase
      .from('financial_accounts')
      .select(`
        id,
        user_id,
        name,
        currency,
        current_balance,
        opening_balance,
        is_active,
        logical_account_id,
        scope_type,
        space_id
      `)
      .eq('id', accountId)
      .single();

    if (accountError || !account || account.user_id !== user.id) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Account not found' }, { status: 404 }),
        cookieMutations
      );
    }

    if (!account.is_active) {
      return badRequest('Archived accounts cannot change currency', cookieMutations);
    }

    const currentCurrency = normalizeCurrencyCode(account.currency);
    if (!currentCurrency) {
      return badRequest('The current account currency is invalid', cookieMutations);
    }

    if (currentCurrency === targetCurrency) {
      return badRequest('Choose a different currency', cookieMutations);
    }

    const [inspection, targetCurrencyRow] = await Promise.all([
      inspectAccountCurrencyChange({
        supabase,
        account: account as RouteAccount,
        currentCurrency,
        requireAuthoritativeBalance: mode === 'conversion',
      }),
      supabase
        .from('currency_registry')
        .select('code, minor_units, is_active')
        .eq('code', targetCurrency)
        .eq('is_active', true)
        .single(),
    ]);

    if (targetCurrencyRow.error || !targetCurrencyRow.data) {
      return badRequest('The selected currency is unavailable', cookieMutations);
    }

    if (body.intent === 'apply') {
      const applyBody = body as ApplyBody;
      if (mode === 'correction' && inspection.correctionConflicts.length > 0) {
        return conflictResponse(
          CORRECTION_CONFLICT_MESSAGE,
          inspection.correctionConflicts,
          cookieMutations
        );
      }
      if (mode === 'conversion' && inspection.conversionConflicts.length > 0) {
        return conflictResponse(
          inspection.conversionConflicts[0]?.message || 'This account cannot be converted right now.',
          inspection.conversionConflicts,
          cookieMutations
        );
      }
      if (mode === 'conversion' && !inspection.isEmptyAccount && !applyBody.snapshotId) {
        return badRequest('A rate snapshot is required to convert this account', cookieMutations);
      }
      if (mode === 'conversion' && !inspection.isEmptyAccount && !applyBody.previewToken) {
        return badRequest('Review the latest conversion preview before confirming this account conversion', cookieMutations);
      }

      let expectedSourceBalance: number | null = null;
      let expectedConvertedAmount: number | null = null;
      const mutationClient = createAdminClient();

      if (mode === 'conversion' && !inspection.isEmptyAccount) {
        const previewPayload = verifyPreviewToken(applyBody.previewToken, user.id);
        if (!previewPayload) {
          return badRequest('Review the latest conversion preview before confirming this account conversion', cookieMutations);
        }

        const previewAgeMs = Date.now() - Date.parse(previewPayload.generatedAt);
        if (!Number.isFinite(previewAgeMs) || previewAgeMs > PREVIEW_TOKEN_MAX_AGE_MS) {
          const updatedPreview = await buildConversionPreview({
            supabase,
            userId: user.id,
            accountId,
            currentCurrency,
            targetCurrency,
            minorUnits: Number(targetCurrencyRow.data.minor_units || 0),
            snapshotId: applyBody.snapshotId || null,
          });
          return previewOutdatedResponse(
            'The account balance changed after the preview. Review the updated conversion before confirming again.',
            {
              accountId,
              logicalAccountId: String(account.logical_account_id || account.id),
              accountName: String(account.name || ''),
              currentCurrency,
              targetCurrency,
              currentBalance: updatedPreview.authoritativeBalance,
              isEmptyAccount: false,
              directUpdateAllowed: false,
              requiresReplacementAccount: true,
              affectedRecordCount: inspection.conversionAffectedRecordCount,
              mixedCurrencyConflict: false,
              mixedCurrencyMessage: null,
              automationConflict: inspection.conversionConflicts.length > 0,
              automationConflictMessage: inspection.conversionConflicts[0]?.message || null,
              conflicts: inspection.conversionConflicts,
              exchangeRate: updatedPreview.exchangeRate,
              convertedBalance: updatedPreview.convertedBalance,
              snapshotId: updatedPreview.snapshotId,
              rateDate: updatedPreview.rateDate,
              rateTimestamp: updatedPreview.rateTimestamp,
              rateProvider: updatedPreview.rateProvider,
              roundingAdjustment: updatedPreview.roundingAdjustment,
              roundingMinorUnits: Number(targetCurrencyRow.data.minor_units || 0),
              previewToken: updatedPreview.previewToken,
              previewGeneratedAt: updatedPreview.previewGeneratedAt,
              previewExpiresAt: updatedPreview.previewExpiresAt,
            },
            cookieMutations
          );
        }

        if (
          previewPayload.userId !== user.id
          || previewPayload.accountId !== accountId
          || previewPayload.sourceCurrency !== currentCurrency
          || previewPayload.targetCurrency !== targetCurrency
          || previewPayload.snapshotId !== applyBody.snapshotId
        ) {
          return badRequest('Review the latest conversion preview before confirming this account conversion', cookieMutations);
        }

        const currentPreview = await buildConversionPreview({
          supabase,
          userId: user.id,
          accountId,
          currentCurrency,
          targetCurrency,
          minorUnits: Number(targetCurrencyRow.data.minor_units || 0),
          snapshotId: applyBody.snapshotId || null,
        });

        const previewStillValid =
          numbersMatch(currentPreview.authoritativeBalance, previewPayload.authoritativeBalance)
          && numbersMatch(currentPreview.convertedBalance, previewPayload.convertedAmount)
          && numbersMatch(currentPreview.exchangeRate, previewPayload.exchangeRate)
          && numbersMatch(currentPreview.roundingAdjustment, previewPayload.roundingAdjustment)
          && currentPreview.snapshotId === previewPayload.snapshotId;

        if (!previewStillValid) {
          return previewOutdatedResponse(
            'The account balance changed after the preview. Review the updated conversion before confirming again.',
            {
              accountId,
              logicalAccountId: String(account.logical_account_id || account.id),
              accountName: String(account.name || ''),
              currentCurrency,
              targetCurrency,
              currentBalance: currentPreview.authoritativeBalance,
              isEmptyAccount: false,
              directUpdateAllowed: false,
              requiresReplacementAccount: true,
              affectedRecordCount: inspection.conversionAffectedRecordCount,
              mixedCurrencyConflict: false,
              mixedCurrencyMessage: null,
              automationConflict: inspection.conversionConflicts.length > 0,
              automationConflictMessage: inspection.conversionConflicts[0]?.message || null,
              conflicts: inspection.conversionConflicts,
              exchangeRate: currentPreview.exchangeRate,
              convertedBalance: currentPreview.convertedBalance,
              snapshotId: currentPreview.snapshotId,
              rateDate: currentPreview.rateDate,
              rateTimestamp: currentPreview.rateTimestamp,
              rateProvider: currentPreview.rateProvider,
              roundingAdjustment: currentPreview.roundingAdjustment,
              roundingMinorUnits: Number(targetCurrencyRow.data.minor_units || 0),
              previewToken: currentPreview.previewToken,
              previewGeneratedAt: currentPreview.previewGeneratedAt,
              previewExpiresAt: currentPreview.previewExpiresAt,
            },
            cookieMutations
          );
        }

        expectedSourceBalance = currentPreview.authoritativeBalance;
        expectedConvertedAmount = currentPreview.convertedBalance;
      }

      if (!mutationClient) {
        return applySupabaseCookies(
          NextResponse.json({ error: CONFIGURATION_ERROR_MESSAGE }, { status: 500 }),
          cookieMutations
        );
      }

      const rpcActionType = mode === 'correction' ? 'currency_correction' : 'currency_conversion';
      const { data, error } = await mutationClient.rpc('rpc_change_financial_account_currency', {
        p_actor_user_id: user.id,
        p_account_id: accountId,
        p_action_type: rpcActionType,
        p_target_currency: targetCurrency,
        p_reason: applyBody.reason || null,
        p_confirmation_checked: applyBody.confirmationChecked === true,
        p_exchange_rate_snapshot_id: applyBody.snapshotId || null,
        p_expected_source_balance: expectedSourceBalance,
        p_expected_converted_amount: expectedConvertedAmount,
      });

      if (error) {
        const refreshedInspection = await inspectAccountCurrencyChange({
          supabase,
          account: account as RouteAccount,
          currentCurrency,
        });
        if (mode === 'correction' && refreshedInspection.correctionConflicts.length > 0) {
          return conflictResponse(
            CORRECTION_CONFLICT_MESSAGE,
            refreshedInspection.correctionConflicts,
            cookieMutations
          );
        }
        if (mode === 'conversion' && refreshedInspection.conversionConflicts.length > 0) {
          return conflictResponse(
            refreshedInspection.conversionConflicts[0]?.message || 'This account cannot be converted right now.',
            refreshedInspection.conversionConflicts,
            cookieMutations
          );
        }
        return badRequest(error.message || 'Failed to change the account currency', cookieMutations);
      }

      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
      if (!row) {
        return applySupabaseCookies(
          NextResponse.json({ error: 'Currency change did not return a result' }, { status: 500 }),
          cookieMutations
        );
      }

      const result: ApplyAccountCurrencyChangeResult = {
        logicalAccountId: String(row.logical_account_id || ''),
        oldAccountId: String(row.old_account_id || ''),
        newAccountId: row.new_account_id ? String(row.new_account_id) : null,
        actionType: String(row.action_type || '') as ApplyAccountCurrencyChangeResult['actionType'],
        previousCurrency: String(row.previous_currency || ''),
        newCurrency: String(row.new_currency || ''),
        previousBalance: Number(row.previous_balance || 0),
        resultingBalance: Number(row.resulting_balance || 0),
        affectedRecordCount: Number(row.affected_record_count || 0),
        directUpdate: row.direct_update === true,
        auditId: String(row.audit_id || ''),
      };

      return applySupabaseCookies(
        NextResponse.json({ result }, { status: 200 }),
        cookieMutations
      );
    }

    const preview: AccountCurrencyChangePreview = {
      accountId,
      logicalAccountId: String(account.logical_account_id || account.id),
      accountName: String(account.name || ''),
      currentCurrency,
      targetCurrency,
      currentBalance: inspection.currentBalance,
      isEmptyAccount: inspection.isEmptyAccount,
      directUpdateAllowed: mode === 'conversion' ? inspection.isEmptyAccount : inspection.correctionConflicts.length === 0,
      requiresReplacementAccount: mode === 'conversion' ? !inspection.isEmptyAccount : false,
      affectedRecordCount: mode === 'correction'
        ? inspection.correctionAffectedRecordCount
        : inspection.conversionAffectedRecordCount,
      mixedCurrencyConflict: mode === 'correction' ? inspection.correctionConflicts.length > 0 : false,
      mixedCurrencyMessage: mode === 'correction' && inspection.correctionConflicts.length > 0
        ? CORRECTION_CONFLICT_MESSAGE
        : null,
      automationConflict: mode === 'conversion' && inspection.conversionConflicts.length > 0,
      automationConflictMessage: mode === 'conversion' && inspection.conversionConflicts.length > 0
        ? inspection.conversionConflicts[0]?.message || 'This account cannot be converted right now.'
        : null,
      conflicts: mode === 'correction' ? inspection.correctionConflicts : inspection.conversionConflicts,
      exchangeRate: null,
      convertedBalance: null,
      snapshotId: null,
      rateDate: null,
      rateTimestamp: null,
      rateProvider: null,
      roundingAdjustment: null,
      roundingMinorUnits: Number(targetCurrencyRow.data.minor_units || 0),
      previewToken: null,
      previewGeneratedAt: null,
      previewExpiresAt: null,
    };

    if (mode === 'conversion' && !inspection.isEmptyAccount) {
      const conversionPreview = await buildConversionPreview({
        supabase,
        userId: user.id,
        accountId,
        currentCurrency,
        targetCurrency,
        minorUnits: Number(targetCurrencyRow.data.minor_units || 0),
      });

      preview.currentBalance = conversionPreview.authoritativeBalance;
      preview.exchangeRate = conversionPreview.exchangeRate;
      preview.convertedBalance = conversionPreview.convertedBalance;
      preview.snapshotId = conversionPreview.snapshotId;
      preview.rateDate = conversionPreview.rateDate;
      preview.rateTimestamp = conversionPreview.rateTimestamp;
      preview.rateProvider = conversionPreview.rateProvider;
      preview.roundingAdjustment = conversionPreview.roundingAdjustment;
      preview.previewToken = conversionPreview.previewToken;
      preview.previewGeneratedAt = conversionPreview.previewGeneratedAt;
      preview.previewExpiresAt = conversionPreview.previewExpiresAt;
    }

    return applySupabaseCookies(
      NextResponse.json({ preview }, { status: 200 }),
      cookieMutations
    );
  } catch (error) {
    logFinancialAccountsServerError('account-currency-change-route', error, {
      accountId,
      userId: user.id,
    });
    return applySupabaseCookies(
      NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to change account currency' }, { status: 500 }),
      cookieMutations
    );
  }
}
