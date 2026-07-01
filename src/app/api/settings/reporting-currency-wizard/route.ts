import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logFinancialAccountsServerError } from '@/lib/financial-accounts-server';
import {
  normalizeCurrencyCode,
  type ReportingCurrencyWizardAccountAction,
  type ReportingCurrencyWizardAccountReview,
  type ReportingCurrencyWizardApplyResult,
  type ReportingCurrencyWizardPreview,
  type ReportingCurrencyWizardSelectionInput,
} from '@/lib/financial-account-currency-change';
import {
  buildConversionPreview,
  createReportingCurrencyBatchPreviewToken,
  getConfigurationErrorMessage,
  getCorrectionConflictMessage,
  getPreviewTokenMaxAgeMs,
  inspectAccountCurrencyChange,
  loadActiveCurrencyMinorUnits,
  loadActivePersonalAccountsForWizard,
  loadUserReportingCurrency,
  numbersMatch,
  type CurrencyChangeServerAccount,
  type ReportingCurrencyBatchTokenPayload,
  verifyReportingCurrencyBatchPreviewToken,
} from '@/lib/financial-account-currency-change-server';

export const runtime = 'nodejs';
const PREVIEW_UNAVAILABLE_CODE = 'preview_unavailable';
const PREVIEW_UNAVAILABLE_MESSAGE = 'We couldn’t load your accounts for review. Please try again.';
const PREVIEW_OUTDATED_CODE = 'preview_outdated';
const PREVIEW_OUTDATED_MESSAGE =
  'Some account details changed while you were reviewing them. Please review the updated values and confirm again.';
const APPLY_FAILED_CODE = 'apply_failed';
const APPLY_FAILED_MESSAGE = 'We couldn’t apply your changes. Nothing was changed. Please try again.';
const ACCOUNT_LIST_CHANGED_CODE = 'account_list_changed';
const ACCOUNT_NOT_ELIGIBLE_CODE = 'account_not_eligible';
const BALANCE_CHANGED_CODE = 'balance_changed';
const RATE_CHANGED_CODE = 'rate_changed';
const DEFAULT_ACCOUNT_CONFLICT_CODE = 'default_account_conflict';
const CONFIGURATION_ERROR_CODE = 'configuration_error';
const CONFIGURATION_ERROR_MESSAGE = 'Reporting currency changes are temporarily unavailable. Please try again.';
const APPLY_DEBUG_ENV_FILE = '.dbg/reporting-currency-apply.env';
const APPLY_DEBUG_FALLBACK_URL = 'http://127.0.0.1:7777/event';
const APPLY_DEBUG_FALLBACK_SESSION_ID = 'reporting-currency-apply';

type PreviewBody = {
  intent: 'preview';
  newReportingCurrency: string;
  selections?: ReportingCurrencyWizardSelectionInput[];
};

type ApplyBody = {
  intent: 'apply';
  newReportingCurrency: string;
  selections: ReportingCurrencyWizardSelectionInput[];
  batchPreviewToken: string;
};

type RouteCookieMutations = Awaited<ReturnType<typeof createRouteHandlerSupabaseClient>>['cookieMutations'];
const ACCOUNT_LIST_CHANGED_MESSAGE =
  'Your accounts changed while you were reviewing them. Please review the updated account list before confirming again.';

type ApplyStageDiagnostic = {
  userId?: string;
  stage: string;
  selectedActionCount?: number;
  accountIds?: string[];
  actionNames?: string[];
  rpcName?: string;
  supabaseErrorCode?: string | null;
  supabaseErrorMessage?: string | null;
  supabaseErrorDetails?: string | null;
  supabaseErrorHint?: string | null;
  previewOutdated?: boolean;
  balanceValidationFailed?: boolean;
  rateValidationFailed?: boolean;
  accountListValidationFailed?: boolean;
  accountEligibilityFailed?: boolean;
  defaultAccountConflict?: boolean;
};

function getApplyDebugServerConfig() {
  try {
    const file = readFileSync(APPLY_DEBUG_ENV_FILE, 'utf8');
    return {
      url: file.match(/^DEBUG_SERVER_URL=(.+)$/m)?.[1]?.trim() || APPLY_DEBUG_FALLBACK_URL,
      sessionId: file.match(/^DEBUG_SESSION_ID=(.+)$/m)?.[1]?.trim() || APPLY_DEBUG_FALLBACK_SESSION_ID,
    };
  } catch {
    return {
      url: APPLY_DEBUG_FALLBACK_URL,
      sessionId: APPLY_DEBUG_FALLBACK_SESSION_ID,
    };
  }
}

function reportApplyDebugStage(hypothesisId: string, diagnostic: ApplyStageDiagnostic) {
  const config = getApplyDebugServerConfig();
  logFinancialAccountsServerError('reporting-currency-wizard-apply-stage', new Error(diagnostic.stage), diagnostic);
  // #region debug-point A:apply-route-stage
  void fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId: config.sessionId,
      runId: 'pre-fix',
      hypothesisId,
      location: 'src/app/api/settings/reporting-currency-wizard/route.ts',
      msg: `[DEBUG] ${diagnostic.stage}`,
      data: diagnostic,
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

function routeError(
  error: string,
  message: string,
  cookieMutations: RouteCookieMutations,
  status = 400,
  preview?: ReportingCurrencyWizardPreview
) {
  return applySupabaseCookies(
    NextResponse.json(
      preview ? { error, code: error, message, preview } : { error, code: error, message },
      { status }
    ),
    cookieMutations
  );
}

function previewOutdatedResponse(
  message: string,
  preview: ReportingCurrencyWizardPreview,
  cookieMutations: RouteCookieMutations
) {
  return routeError(PREVIEW_OUTDATED_CODE, message, cookieMutations, 409, preview);
}

function badRequest(message: string, cookieMutations: RouteCookieMutations, status = 400) {
  return routeError('invalid_request', message, cookieMutations, status);
}

type ApplyErrorDescriptor = {
  code: string;
  message: string;
  status: number;
  refreshPreview: boolean;
  previewOutdated?: boolean;
  balanceValidationFailed?: boolean;
  rateValidationFailed?: boolean;
  accountListValidationFailed?: boolean;
  accountEligibilityFailed?: boolean;
  defaultAccountConflict?: boolean;
};

function describeApplyError(error: {
  message?: string | null;
} | null | undefined): ApplyErrorDescriptor {
  const rawMessage = (error?.message || '').trim();
  const message = rawMessage.toLowerCase();
  const configurationMessage = getConfigurationErrorMessage().toLowerCase();

  if (
    message.includes('updated account list')
    || message.includes('accounts changed while you were reviewing')
    || message.includes('reviewed more than once')
  ) {
    return {
      code: ACCOUNT_LIST_CHANGED_CODE,
      message: ACCOUNT_LIST_CHANGED_MESSAGE,
      status: 409,
      refreshPreview: true,
      previewOutdated: true,
      accountListValidationFailed: true,
    };
  }

  if (
    message.includes('balance changed')
    || message.includes('currency changed after the preview')
    || message.includes('reporting currency changed after the preview')
  ) {
    return {
      code: BALANCE_CHANGED_CODE,
      message: PREVIEW_OUTDATED_MESSAGE,
      status: 409,
      refreshPreview: true,
      previewOutdated: true,
      balanceValidationFailed: true,
    };
  }

  if (
    message.includes('exchange rate')
    || message.includes('latest conversion preview')
    || message.includes('rate snapshot')
  ) {
    return {
      code: RATE_CHANGED_CODE,
      message: PREVIEW_OUTDATED_MESSAGE,
      status: 409,
      refreshPreview: true,
      previewOutdated: true,
      rateValidationFailed: true,
    };
  }

  if (
    message.includes('review the updated account choices before confirming')
    || message.includes('confirm that the eligible amounts')
    || message.includes('confirm that the existing amounts')
    || message.includes('linked records')
    || message.includes('recurring')
    || message.includes('subscription')
    || message.includes('cannot be converted yet')
  ) {
    return {
      code: ACCOUNT_NOT_ELIGIBLE_CODE,
      message: 'This account can’t be changed yet because it is used by an active recurring item or subscription.',
      status: 409,
      refreshPreview: true,
      accountEligibilityFailed: true,
    };
  }

  if (message.includes('default')) {
    return {
      code: DEFAULT_ACCOUNT_CONFLICT_CODE,
      message: 'A default account conflict blocked these changes. Review the affected account and confirm again.',
      status: 409,
      refreshPreview: true,
      defaultAccountConflict: true,
    };
  }

  if (
    message.includes(configurationMessage)
    || message.includes('temporarily unavailable')
    || message.includes('admin client unavailable')
  ) {
    return {
      code: CONFIGURATION_ERROR_CODE,
      message: CONFIGURATION_ERROR_MESSAGE,
      status: 500,
      refreshPreview: false,
    };
  }

  return {
    code: APPLY_FAILED_CODE,
    message: APPLY_FAILED_MESSAGE,
    status: 500,
    refreshPreview: false,
  };
}

async function buildRefreshedPreviewForApply(args: {
  supabase: Awaited<ReturnType<typeof createRouteHandlerSupabaseClient>>['supabase'];
  userId: string;
  currentReportingCurrency: string;
  newReportingCurrency: string;
  selections: ReportingCurrencyWizardSelectionInput[];
}) {
  try {
    const refreshed = await buildWizardPreview(args);
    return refreshed.preview;
  } catch {
    return null;
  }
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
      response: routeError('unauthorized', 'Unauthorized', cookieMutations, 401),
    };
  }

  return { ok: true as const, supabase, cookieMutations, user };
}

function normalizeSelections(selections: ReportingCurrencyWizardSelectionInput[] | undefined) {
  const map = new Map<string, ReportingCurrencyWizardSelectionInput>();

  for (const selection of selections || []) {
    if (!selection || typeof selection.accountId !== 'string') continue;
    const normalizedAction = selection.action;
    if (
      normalizedAction !== 'keep'
      && normalizedAction !== 'conversion'
      && normalizedAction !== 'correction'
    ) {
      continue;
    }
    map.set(selection.accountId, {
      accountId: selection.accountId,
      action: normalizedAction,
      confirmationChecked: selection.confirmationChecked === true,
    });
  }

  return map;
}

function buildCorrectionBlockedReason(accountName: string) {
  return 'This account has linked items that may use their own currencies. Keep this account unchanged or review those items separately before correcting it.';
}

function buildConversionBlockedReason(accountName: string) {
  return 'This account cannot be converted yet because it is used by active recurring items or subscriptions.';
}

function buildKeepMessage(currentCurrency: string, targetCurrency: string, alreadyMatchesTargetCurrency: boolean) {
  if (alreadyMatchesTargetCurrency) {
    return `This account already uses ${targetCurrency}. No account record changes are needed.`;
  }
  return `This account will remain in ${currentCurrency}. Dashboard totals and reports will still show its converted value in ${targetCurrency}.`;
}

function buildStatusMessage(args: {
  alreadyMatchesTargetCurrency: boolean;
  targetCurrency: string;
  inspection: Awaited<ReturnType<typeof inspectAccountCurrencyChange>>;
  correctionEligible: boolean;
  conversionEligible: boolean;
}) {
  if (args.alreadyMatchesTargetCurrency) {
    return `This account already uses ${args.targetCurrency}.`;
  }
  if (args.inspection.isEmptyAccount) {
    return 'This account is empty. Its currency can be changed directly without conversion or archiving.';
  }
  if (!args.conversionEligible && args.inspection.conversionConflicts.length > 0) {
    return buildConversionBlockedReason('');
  }
  if (!args.correctionEligible && args.inspection.correctionConflicts.length > 0) {
    return buildCorrectionBlockedReason('');
  }
  return null;
}

async function buildWizardPreview(args: {
  supabase: Awaited<ReturnType<typeof createRouteHandlerSupabaseClient>>['supabase'];
  userId: string;
  currentReportingCurrency: string;
  newReportingCurrency: string;
  selections?: ReportingCurrencyWizardSelectionInput[];
}) {
  const selectionMap = normalizeSelections(args.selections);
  const [accounts, targetCurrencyMeta] = await Promise.all([
    loadActivePersonalAccountsForWizard(args.supabase, args.userId),
    loadActiveCurrencyMinorUnits(args.supabase, args.newReportingCurrency),
  ]);

  const reviews: ReportingCurrencyWizardAccountReview[] = [];

  for (const account of accounts) {
    const currentCurrency = normalizeCurrencyCode(account.currency);
    if (!currentCurrency) {
      throw new Error('An account has an invalid currency and cannot be reviewed');
    }

    const inspection = await inspectAccountCurrencyChange({
      supabase: args.supabase,
      account,
      currentCurrency,
      requireAuthoritativeBalance: true,
    });

    const alreadyMatchesTargetCurrency = currentCurrency === args.newReportingCurrency;
    const selection = selectionMap.get(account.id);
    const selectedAction: ReportingCurrencyWizardAccountAction = selection?.action || 'keep';
    const confirmationChecked = selection?.confirmationChecked === true;

    const correctionEligible =
      !alreadyMatchesTargetCurrency
      && inspection.correctionConflicts.length === 0;

    let conversionPreview: Awaited<ReturnType<typeof buildConversionPreview>> | null = null;
    let conversionBlockedReason: string | null = null;

    if (!alreadyMatchesTargetCurrency && !inspection.isEmptyAccount) {
      try {
        conversionPreview = await buildConversionPreview({
          supabase: args.supabase,
          userId: args.userId,
          accountId: account.id,
          currentCurrency,
          targetCurrency: args.newReportingCurrency,
          minorUnits: targetCurrencyMeta.minorUnits,
        });
      } catch (error) {
        conversionBlockedReason = error instanceof Error ? error.message : 'The current exchange rate is unavailable for this currency pair';
      }
    }

    const conversionEligible =
      !alreadyMatchesTargetCurrency
      && inspection.conversionConflicts.length === 0
      && (inspection.isEmptyAccount || conversionPreview !== null);

    const selectionError =
      selectedAction === 'correction'
        ? (!correctionEligible
            ? buildCorrectionBlockedReason(account.name)
            : !confirmationChecked
              ? `Confirm that all eligible amounts in ${account.name} were originally entered in ${args.newReportingCurrency}.`
              : null)
        : selectedAction === 'conversion'
          ? (!conversionEligible
              ? conversionBlockedReason || buildConversionBlockedReason(account.name)
              : null)
          : null;

    reviews.push({
      accountId: account.id,
      logicalAccountId: String(account.logical_account_id || account.id),
      accountName: account.name,
      accountType: account.account_type,
      currentCurrency,
      targetCurrency: args.newReportingCurrency,
      currentBalance: conversionPreview?.authoritativeBalance ?? inspection.currentBalance,
      alreadyMatchesTargetCurrency,
      statusMessage: buildStatusMessage({
        alreadyMatchesTargetCurrency,
        targetCurrency: args.newReportingCurrency,
        inspection,
        correctionEligible,
        conversionEligible,
      }),
      selectedAction,
      selectionError,
      keepMessage: buildKeepMessage(currentCurrency, args.newReportingCurrency, alreadyMatchesTargetCurrency),
      conversion: {
        eligible: conversionEligible,
        blockedReason: alreadyMatchesTargetCurrency
          ? `This account already uses ${args.newReportingCurrency}.`
          : conversionBlockedReason || (inspection.conversionConflicts.length > 0 ? buildConversionBlockedReason(account.name) : null),
        conflicts: inspection.conversionConflicts,
        directUpdateAllowed: inspection.isEmptyAccount,
        requiresReplacementAccount: !inspection.isEmptyAccount,
        exchangeRate: conversionPreview?.exchangeRate ?? null,
        convertedBalance: inspection.isEmptyAccount ? inspection.currentBalance : conversionPreview?.convertedBalance ?? null,
        snapshotId: conversionPreview?.snapshotId ?? null,
        rateDate: conversionPreview?.rateDate ?? null,
        rateTimestamp: conversionPreview?.rateTimestamp ?? null,
        rateProvider: conversionPreview?.rateProvider ?? null,
        roundingAdjustment: conversionPreview?.roundingAdjustment ?? null,
        roundingMinorUnits: targetCurrencyMeta.minorUnits,
        previewToken: conversionPreview?.previewToken ?? null,
        previewGeneratedAt: conversionPreview?.previewGeneratedAt ?? null,
        previewExpiresAt: conversionPreview?.previewExpiresAt ?? null,
      },
      correction: {
        eligible: correctionEligible,
        blockedReason: alreadyMatchesTargetCurrency
          ? `This account already uses ${args.newReportingCurrency}.`
          : inspection.correctionConflicts.length > 0
            ? buildCorrectionBlockedReason(account.name)
            : null,
        conflicts: inspection.correctionConflicts,
        correctedBalance: inspection.currentBalance,
        confirmationChecked,
      },
    });
  }

  const reviewGeneratedAt = new Date().toISOString();
  const reviewExpiresAt = new Date(Date.now() + getPreviewTokenMaxAgeMs()).toISOString();
  const tokenPayload: ReportingCurrencyBatchTokenPayload = {
    userId: args.userId,
    previousReportingCurrency: args.currentReportingCurrency,
    newReportingCurrency: args.newReportingCurrency,
    generatedAt: reviewGeneratedAt,
    expiresAt: reviewExpiresAt,
    accounts: reviews.map((review) => ({
      accountId: review.accountId,
      action: review.selectedAction,
      confirmationChecked: review.correction.confirmationChecked,
      sourceCurrency: review.currentCurrency,
      targetCurrency: review.targetCurrency,
      authoritativeBalance: review.currentBalance,
      convertedAmount: review.selectedAction === 'conversion'
        ? review.conversion.convertedBalance
        : review.selectedAction === 'correction'
          ? review.correction.correctedBalance
          : null,
      snapshotId: review.selectedAction === 'conversion' ? review.conversion.snapshotId : null,
      exchangeRate: review.selectedAction === 'conversion' ? review.conversion.exchangeRate : null,
      roundingAdjustment: review.selectedAction === 'conversion' ? review.conversion.roundingAdjustment : null,
      directUpdateAllowed: review.selectedAction === 'conversion' && review.conversion.directUpdateAllowed,
    })),
  };

  return {
    preview: {
      currentReportingCurrency: args.currentReportingCurrency,
      newReportingCurrency: args.newReportingCurrency,
      reviewGeneratedAt,
      reviewExpiresAt,
      batchPreviewToken: createReportingCurrencyBatchPreviewToken(tokenPayload),
      accounts: reviews,
    } satisfies ReportingCurrencyWizardPreview,
    tokenPayload,
  };
}

function previewMatchesToken(preview: ReportingCurrencyWizardPreview, tokenPayload: ReportingCurrencyBatchTokenPayload) {
  if (
    preview.currentReportingCurrency !== tokenPayload.previousReportingCurrency
    || preview.newReportingCurrency !== tokenPayload.newReportingCurrency
    || preview.accounts.length !== tokenPayload.accounts.length
  ) {
    return false;
  }

  for (let index = 0; index < preview.accounts.length; index += 1) {
    const review = preview.accounts[index];
    const tokenAccount = tokenPayload.accounts[index];
    if (!tokenAccount) return false;
    if (
      review.accountId !== tokenAccount.accountId
      || review.selectedAction !== tokenAccount.action
      || review.currentCurrency !== tokenAccount.sourceCurrency
      || review.targetCurrency !== tokenAccount.targetCurrency
      || !numbersMatch(review.currentBalance, tokenAccount.authoritativeBalance)
      || review.correction.confirmationChecked !== tokenAccount.confirmationChecked
    ) {
      return false;
    }

    if (review.selectedAction === 'conversion') {
      if (
        !numbersMatch(review.conversion.convertedBalance ?? 0, tokenAccount.convertedAmount ?? 0)
        || !numbersMatch(review.conversion.exchangeRate ?? 0, tokenAccount.exchangeRate ?? 0)
        || !numbersMatch(review.conversion.roundingAdjustment ?? 0, tokenAccount.roundingAdjustment ?? 0)
        || review.conversion.snapshotId !== tokenAccount.snapshotId
        || review.conversion.directUpdateAllowed !== tokenAccount.directUpdateAllowed
      ) {
        return false;
      }
    }
  }

  return true;
}

function buildRpcAccountActions(preview: ReportingCurrencyWizardPreview) {
  return preview.accounts.map((review) => ({
    account_id: review.accountId,
    action: review.selectedAction,
    source_currency: review.currentCurrency,
    target_currency: review.selectedAction === 'keep' ? review.currentCurrency : review.targetCurrency,
    expected_source_balance: review.currentBalance,
    expected_converted_amount: review.selectedAction === 'conversion'
      ? review.conversion.convertedBalance
      : null,
    exchange_rate_snapshot_id: review.selectedAction === 'conversion' && !review.conversion.directUpdateAllowed
      ? review.conversion.snapshotId
      : null,
    confirmation_checked: review.selectedAction === 'correction' ? review.correction.confirmationChecked : false,
    direct_update_allowed: review.selectedAction === 'conversion' ? review.conversion.directUpdateAllowed : false,
  }));
}

export async function POST(request: Request) {
  const auth = await requireRouteUser();
  if (!auth.ok) {
    return auth.response;
  }

  const { supabase, cookieMutations, user } = auth;
  let requestIntent: PreviewBody['intent'] | ApplyBody['intent'] | null = null;

  try {
    const body = await request.json() as PreviewBody | ApplyBody;
    requestIntent = body?.intent;
    const newReportingCurrency = normalizeCurrencyCode(body?.newReportingCurrency);

    if (!newReportingCurrency) {
      return badRequest('Choose a valid reporting currency', cookieMutations);
    }

    const currentReportingCurrency = await loadUserReportingCurrency(supabase, user.id);
    if (currentReportingCurrency === newReportingCurrency) {
      return badRequest('Choose a different reporting currency', cookieMutations);
    }

    if (requestIntent === 'preview') {
      try {
        const { preview } = await buildWizardPreview({
          supabase,
          userId: user.id,
          currentReportingCurrency,
          newReportingCurrency,
          selections: body.selections,
        });

        return applySupabaseCookies(
          NextResponse.json({ preview }, { status: 200 }),
          cookieMutations
        );
      } catch (error) {
        logFinancialAccountsServerError('reporting-currency-wizard-preview', error, {
          userId: user.id,
          routeStep: 'build-preview',
          newReportingCurrency,
          hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          hasPreviewSecret: Boolean(process.env.ACCOUNT_CURRENCY_PREVIEW_SECRET),
        });
        return routeError(
          error instanceof Error && error.message === getConfigurationErrorMessage()
            ? CONFIGURATION_ERROR_CODE
            : PREVIEW_UNAVAILABLE_CODE,
          error instanceof Error && error.message === getConfigurationErrorMessage()
            ? CONFIGURATION_ERROR_MESSAGE
            : PREVIEW_UNAVAILABLE_MESSAGE,
          cookieMutations,
          500
        );
      }
    }

    const applyBody = body as ApplyBody;
    if (!applyBody.batchPreviewToken) {
      return badRequest('Review the latest account changes before confirming', cookieMutations);
    }

    reportApplyDebugStage('A', {
      userId: user.id,
      stage: 'apply-request-received',
      selectedActionCount: Array.isArray(applyBody.selections) ? applyBody.selections.length : 0,
      accountIds: Array.isArray(applyBody.selections) ? applyBody.selections.map((selection) => selection.accountId) : [],
      actionNames: Array.isArray(applyBody.selections) ? applyBody.selections.map((selection) => selection.action) : [],
    });

    const tokenPayload = verifyReportingCurrencyBatchPreviewToken(applyBody.batchPreviewToken, user.id);
    if (!tokenPayload) {
      reportApplyDebugStage('B', {
        userId: user.id,
        stage: 'apply-token-invalid',
        selectedActionCount: Array.isArray(applyBody.selections) ? applyBody.selections.length : 0,
        accountIds: Array.isArray(applyBody.selections) ? applyBody.selections.map((selection) => selection.accountId) : [],
        actionNames: Array.isArray(applyBody.selections) ? applyBody.selections.map((selection) => selection.action) : [],
        previewOutdated: true,
      });
      return badRequest('Review the latest account changes before confirming', cookieMutations);
    }

    reportApplyDebugStage('B', {
      userId: user.id,
      stage: 'apply-token-verified',
      selectedActionCount: tokenPayload.accounts.length,
      accountIds: tokenPayload.accounts.map((account) => account.accountId),
      actionNames: tokenPayload.accounts.map((account) => account.action),
    });

    if (
      tokenPayload.previousReportingCurrency !== currentReportingCurrency
      || tokenPayload.newReportingCurrency !== newReportingCurrency
    ) {
      const { preview } = await buildWizardPreview({
        supabase,
        userId: user.id,
        currentReportingCurrency,
        newReportingCurrency,
        selections: applyBody.selections,
      });
      reportApplyDebugStage('B', {
        userId: user.id,
        stage: 'apply-token-preview-currency-mismatch',
        selectedActionCount: preview.accounts.length,
        accountIds: preview.accounts.map((account) => account.accountId),
        actionNames: preview.accounts.map((account) => account.selectedAction),
        previewOutdated: true,
      });
      return previewOutdatedResponse(
        'Some account balances or exchange rates changed after your review. Please review the updated values before confirming again.',
        preview,
        cookieMutations
      );
    }

    const { preview } = await buildWizardPreview({
      supabase,
      userId: user.id,
      currentReportingCurrency,
      newReportingCurrency,
      selections: applyBody.selections,
    });

    reportApplyDebugStage('C', {
      userId: user.id,
      stage: 'apply-preview-rebuilt',
      selectedActionCount: preview.accounts.length,
      accountIds: preview.accounts.map((account) => account.accountId),
      actionNames: preview.accounts.map((account) => account.selectedAction),
    });

    const hasSelectionErrors = preview.accounts.some((review) => Boolean(review.selectionError));
    if (hasSelectionErrors) {
      reportApplyDebugStage('C', {
        userId: user.id,
        stage: 'apply-selection-validation-failed',
        selectedActionCount: preview.accounts.length,
        accountIds: preview.accounts.filter((account) => Boolean(account.selectionError)).map((account) => account.accountId),
        actionNames: preview.accounts.filter((account) => Boolean(account.selectionError)).map((account) => account.selectedAction),
        previewOutdated: true,
        balanceValidationFailed: preview.accounts.some((account) => account.selectionError?.toLowerCase().includes('balance')),
        rateValidationFailed: preview.accounts.some((account) => account.selectionError?.toLowerCase().includes('rate')),
        accountEligibilityFailed: true,
      });
      return previewOutdatedResponse(
        'Review the highlighted account choices before confirming.',
        preview,
        cookieMutations
      );
    }

    if (!previewMatchesToken(preview, tokenPayload)) {
      reportApplyDebugStage('C', {
        userId: user.id,
        stage: 'apply-preview-token-mismatch',
        selectedActionCount: preview.accounts.length,
        accountIds: preview.accounts.map((account) => account.accountId),
        actionNames: preview.accounts.map((account) => account.selectedAction),
        previewOutdated: true,
      });
      return previewOutdatedResponse(
        'Some account balances or exchange rates changed after your review. Please review the updated values before confirming again.',
        preview,
        cookieMutations
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      logFinancialAccountsServerError('reporting-currency-wizard-apply-admin-client', new Error('Admin client unavailable'), {
        userId: user.id,
        routeStep: 'apply-admin-client',
        hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
        hasPreviewSecret: Boolean(process.env.ACCOUNT_CURRENCY_PREVIEW_SECRET),
      });
      reportApplyDebugStage('D', {
        userId: user.id,
        stage: 'apply-admin-client-unavailable',
        selectedActionCount: preview.accounts.length,
        accountIds: preview.accounts.map((account) => account.accountId),
        actionNames: preview.accounts.map((account) => account.selectedAction),
        rpcName: 'rpc_change_reporting_currency_with_account_review',
      });
      return routeError(CONFIGURATION_ERROR_CODE, CONFIGURATION_ERROR_MESSAGE, cookieMutations, 500);
    }

    const rpcAccountActions = buildRpcAccountActions(preview);
    reportApplyDebugStage('D', {
      userId: user.id,
      stage: 'apply-rpc-payload-built',
      selectedActionCount: rpcAccountActions.length,
      accountIds: rpcAccountActions.map((account) => String(account.account_id)),
      actionNames: rpcAccountActions.map((account) => String(account.action)),
      rpcName: 'rpc_change_reporting_currency_with_account_review',
    });

    const { data, error } = await admin.rpc('rpc_change_reporting_currency_with_account_review', {
      p_actor_user_id: user.id,
      p_previous_reporting_currency: currentReportingCurrency,
      p_new_reporting_currency: newReportingCurrency,
      p_account_actions: rpcAccountActions,
    });

    if (error) {
      const descriptor = describeApplyError(error);
      reportApplyDebugStage('E', {
        userId: user.id,
        stage: 'apply-rpc-error',
        selectedActionCount: rpcAccountActions.length,
        accountIds: rpcAccountActions.map((account) => String(account.account_id)),
        actionNames: rpcAccountActions.map((account) => String(account.action)),
        rpcName: 'rpc_change_reporting_currency_with_account_review',
        supabaseErrorCode: 'code' in error ? error.code : null,
        supabaseErrorMessage: error.message || null,
        supabaseErrorDetails: 'details' in error ? error.details || null : null,
        supabaseErrorHint: 'hint' in error ? error.hint || null : null,
        previewOutdated: error.message?.includes('preview') || error.message?.includes('changed') || error.message?.includes('updated'),
        balanceValidationFailed: error.message?.toLowerCase().includes('balance changed'),
        rateValidationFailed: error.message?.toLowerCase().includes('exchange rate'),
        accountListValidationFailed: error.message?.toLowerCase().includes('updated account list'),
        accountEligibilityFailed: error.message?.toLowerCase().includes('subscription') || error.message?.toLowerCase().includes('recurring'),
        defaultAccountConflict: error.message?.toLowerCase().includes('default'),
      });
      logFinancialAccountsServerError('reporting-currency-wizard-apply', error, {
        userId: user.id,
        routeStep: 'apply-rpc',
        newReportingCurrency,
        selectedActionCount: rpcAccountActions.length,
        accountIds: rpcAccountActions.map((account) => String(account.account_id)),
        actionNames: rpcAccountActions.map((account) => String(account.action)),
        rpcName: 'rpc_change_reporting_currency_with_account_review',
        supabaseErrorCode: 'code' in error ? error.code : undefined,
        supabaseErrorMessage: error.message || 'Unknown Supabase RPC error',
        supabaseErrorDetails: 'details' in error ? error.details : undefined,
        supabaseErrorHint: 'hint' in error ? error.hint : undefined,
        previewOutdated: descriptor.previewOutdated === true,
        balanceValidationFailed: descriptor.balanceValidationFailed === true,
        rateValidationFailed: descriptor.rateValidationFailed === true,
        accountListValidationFailed: descriptor.accountListValidationFailed === true,
        accountEligibilityFailed: descriptor.accountEligibilityFailed === true,
        defaultAccountConflict: descriptor.defaultAccountConflict === true,
      });
      if (descriptor.refreshPreview) {
        const refreshedPreview = await buildRefreshedPreviewForApply({
          supabase,
          userId: user.id,
          currentReportingCurrency: await loadUserReportingCurrency(supabase, user.id),
          newReportingCurrency,
          selections: applyBody.selections,
        });
        return routeError(
          descriptor.code,
          descriptor.message,
          cookieMutations,
          descriptor.status,
          refreshedPreview || undefined
        );
      }

      return routeError(descriptor.code, descriptor.message, cookieMutations, descriptor.status);
    }

    const rpcResult = (Array.isArray(data) ? data[0] : data) as Omit<ReportingCurrencyWizardApplyResult, 'blockedAccountsCount'> | null;
    const blockedAccountsCount = preview.accounts.filter(
      (review) =>
        review.selectedAction === 'keep'
        && review.currentCurrency !== review.targetCurrency
        && (!review.conversion.eligible || !review.correction.eligible)
    ).length;
    const result = rpcResult
      ? ({
          ...rpcResult,
          blockedAccountsCount,
        } satisfies ReportingCurrencyWizardApplyResult)
      : null;
    if (!result) {
      reportApplyDebugStage('E', {
        userId: user.id,
        stage: 'apply-result-missing',
        selectedActionCount: rpcAccountActions.length,
        accountIds: rpcAccountActions.map((account) => String(account.account_id)),
        actionNames: rpcAccountActions.map((account) => String(account.action)),
        rpcName: 'rpc_change_reporting_currency_with_account_review',
      });
      return badRequest('The reporting currency update did not return a result', cookieMutations, 500);
    }

    reportApplyDebugStage('E', {
      userId: user.id,
      stage: 'apply-result-parsed',
      selectedActionCount: rpcAccountActions.length,
      accountIds: rpcAccountActions.map((account) => String(account.account_id)),
      actionNames: rpcAccountActions.map((account) => String(account.action)),
      rpcName: 'rpc_change_reporting_currency_with_account_review',
    });

    return applySupabaseCookies(
      NextResponse.json({ result }, { status: 200 }),
      cookieMutations
    );
  } catch (error) {
    const descriptor = requestIntent === 'apply'
      ? describeApplyError(error instanceof Error ? error : null)
      : null;
    logFinancialAccountsServerError('reporting-currency-wizard-route', error, {
      userId: user.id,
      requestIntent,
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      hasPreviewSecret: Boolean(process.env.ACCOUNT_CURRENCY_PREVIEW_SECRET),
    });
    return routeError(
      requestIntent === 'preview'
        ? (error instanceof Error && error.message === getConfigurationErrorMessage()
            ? CONFIGURATION_ERROR_CODE
            : PREVIEW_UNAVAILABLE_CODE)
        : descriptor?.code || APPLY_FAILED_CODE,
      requestIntent === 'preview'
        ? (error instanceof Error && error.message === getConfigurationErrorMessage()
            ? CONFIGURATION_ERROR_MESSAGE
            : PREVIEW_UNAVAILABLE_MESSAGE)
        : descriptor?.message || APPLY_FAILED_MESSAGE,
      cookieMutations,
      requestIntent === 'apply' ? descriptor?.status || 500 : 500
    );
  }
}
