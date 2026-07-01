import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logFinancialAccountsServerError } from '@/lib/financial-accounts-server';
import {
  normalizeCurrencyCode,
  type AccountCurrencyChangeMode,
  type AccountCurrencyChangeConflictItem,
  type AccountCurrencyChangePreview,
  type ApplyAccountCurrencyChangeResult,
} from '@/lib/financial-account-currency-change';
import {
  buildConversionPreview,
  buildSingleAccountPreview,
  getConfigurationErrorMessage,
  getCorrectionConflictMessage,
  getPreviewTokenMaxAgeMs,
  inspectAccountCurrencyChange,
  loadActiveCurrencyMinorUnits,
  numbersMatch,
  type CurrencyChangeServerAccount,
  verifyConversionPreviewToken,
} from '@/lib/financial-account-currency-change-server';

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

const CORRECTION_CONFLICT_MESSAGE = getCorrectionConflictMessage();
const CONFIGURATION_ERROR_MESSAGE = getConfigurationErrorMessage();
const PREVIEW_TOKEN_MAX_AGE_MS = getPreviewTokenMaxAgeMs();

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
        account_type,
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

    const [inspection, targetCurrencyMeta] = await Promise.all([
      inspectAccountCurrencyChange({
        supabase,
        account: account as CurrencyChangeServerAccount,
        currentCurrency,
        requireAuthoritativeBalance: mode === 'conversion',
      }),
      loadActiveCurrencyMinorUnits(supabase, targetCurrency),
    ]);

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
        const previewPayload = verifyConversionPreviewToken(applyBody.previewToken, user.id);
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
            minorUnits: targetCurrencyMeta.minorUnits,
            snapshotId: applyBody.snapshotId || null,
          });
          return previewOutdatedResponse(
            'The account balance changed after the preview. Review the updated conversion before confirming again.',
            buildSingleAccountPreview({
              account: account as CurrencyChangeServerAccount,
              currentCurrency,
              targetCurrency,
              inspection,
              conversionPreview: updatedPreview,
              minorUnits: targetCurrencyMeta.minorUnits,
              mode: 'conversion',
            }),
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
          minorUnits: targetCurrencyMeta.minorUnits,
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
            buildSingleAccountPreview({
              account: account as CurrencyChangeServerAccount,
              currentCurrency,
              targetCurrency,
              inspection,
              conversionPreview: currentPreview,
              minorUnits: targetCurrencyMeta.minorUnits,
              mode: 'conversion',
            }),
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
          account: account as CurrencyChangeServerAccount,
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

    const preview: AccountCurrencyChangePreview = buildSingleAccountPreview({
      account: account as CurrencyChangeServerAccount,
      currentCurrency,
      targetCurrency,
      inspection,
      conversionPreview: null,
      minorUnits: targetCurrencyMeta.minorUnits,
      mode,
    });

    if (mode === 'conversion' && !inspection.isEmptyAccount) {
      const conversionPreview = await buildConversionPreview({
        supabase,
        userId: user.id,
        accountId,
        currentCurrency,
        targetCurrency,
        minorUnits: targetCurrencyMeta.minorUnits,
      });
      Object.assign(
        preview,
        buildSingleAccountPreview({
          account: account as CurrencyChangeServerAccount,
          currentCurrency,
          targetCurrency,
          inspection,
          conversionPreview,
          minorUnits: targetCurrencyMeta.minorUnits,
          mode,
        })
      );
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
