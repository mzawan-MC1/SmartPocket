import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import type { FinancialAction, ParsedFinancialInstruction, SmartEntryReview } from '@/lib/ai-types';
import { applySmartEntryReviewToInstruction, getSmartEntryMissingFields, isAccountEligibleForPurpose, isManagedPurpose } from '@/lib/smart-entry';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_TYPES = new Set(['bank', 'credit_card', 'cash', 'savings', 'digital_wallet', 'investment', 'other']);
const RELATIONSHIPS = new Set(['spouse', 'child', 'parent', 'sibling', 'friend', 'relative', 'colleague', 'client', 'other']);
const PURPOSES = new Set([
  'personal_expense',
  'personal_income',
  'borrowed_money',
  'managed_money',
  'loan_repayment',
  'managed_return',
  'transfer',
  'reimbursement',
  'unclear',
]);
const REVIEW_MISSING_FIELDS = new Set(['purpose', 'amount', 'currency', 'person', 'account', 'destinationAccount']);
const ACCOUNT_SCOPES = new Set(['personal', 'managed']);

function jsonWithCookies(
  body: Record<string, unknown>,
  status: number,
  cookieMutations: Parameters<typeof applySupabaseCookies>[1]
) {
  return applySupabaseCookies(NextResponse.json(body, { status }), cookieMutations);
}

function isExecutingOrExecuted(status: string) {
  return status === 'executing' || status === 'executed' || status === 'partially_executed';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function sanitizeReview(value: unknown): SmartEntryReview | null {
  if (!isObject(value)) return null;

  const sanitizePerson = (input: unknown): SmartEntryReview['person'] => {
    if (!isObject(input)) return undefined;
    return {
      required: input.required === true,
      mode: input.mode === 'existing' || input.mode === 'create' ? input.mode : undefined,
      personId: typeof input.personId === 'string' && UUID_PATTERN.test(input.personId) ? input.personId : undefined,
      name: typeof input.name === 'string' ? input.name.trim() || undefined : undefined,
      relationship: typeof input.relationship === 'string' && RELATIONSHIPS.has(input.relationship)
        ? input.relationship as NonNullable<SmartEntryReview['person']>['relationship']
        : undefined,
      notes: typeof input.notes === 'string' ? input.notes.trim() || undefined : undefined,
    };
  };

  const sanitizeAccount = (input: unknown): SmartEntryReview['account'] => {
    if (!isObject(input)) return undefined;
    return {
      required: input.required === true,
      mode: input.mode === 'existing' || input.mode === 'create' ? input.mode : undefined,
      accountId: typeof input.accountId === 'string' && UUID_PATTERN.test(input.accountId) ? input.accountId : undefined,
      name: typeof input.name === 'string' ? input.name.trim() || undefined : undefined,
      type: typeof input.type === 'string' && ACCOUNT_TYPES.has(input.type)
        ? input.type as NonNullable<SmartEntryReview['account']>['type']
        : undefined,
      currency: typeof input.currency === 'string' ? input.currency.trim().toUpperCase() : undefined,
      includeInTotal: typeof input.includeInTotal === 'boolean' ? input.includeInTotal : undefined,
      scope: typeof input.scope === 'string' && ACCOUNT_SCOPES.has(input.scope)
        ? input.scope as NonNullable<SmartEntryReview['account']>['scope']
        : undefined,
      managedPersonId: typeof input.managedPersonId === 'string' && UUID_PATTERN.test(input.managedPersonId) ? input.managedPersonId : undefined,
      managedPersonName: typeof input.managedPersonName === 'string' ? input.managedPersonName.trim() || undefined : undefined,
    };
  };

  return {
    understanding: Array.isArray(value.understanding)
      ? value.understanding.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
      : [],
    missing: Array.isArray(value.missing)
      ? value.missing.filter((item): item is SmartEntryReview['missing'][number] => typeof item === 'string' && REVIEW_MISSING_FIELDS.has(item))
      : [],
    purpose: typeof value.purpose === 'string' && PURPOSES.has(value.purpose)
      ? value.purpose as SmartEntryReview['purpose']
      : undefined,
    purposeConfidence: typeof value.purposeConfidence === 'number' && Number.isFinite(value.purposeConfidence)
      ? value.purposeConfidence
      : undefined,
    purposeNeedsConfirmation: value.purposeNeedsConfirmation === true,
    purposeOptions: Array.isArray(value.purposeOptions)
      ? value.purposeOptions
          .filter(isObject)
          .map((item) => ({
            id: typeof item.id === 'string' && PURPOSES.has(item.id) ? item.id : undefined,
            label: typeof item.label === 'string' ? item.label.trim() : '',
            description: typeof item.description === 'string' ? item.description.trim() : '',
          }))
          .filter((item): item is NonNullable<SmartEntryReview['purposeOptions']>[number] => !!item.id && !!item.label)
      : undefined,
    amount: typeof value.amount === 'number' && Number.isFinite(value.amount) ? value.amount : undefined,
    receivedAmount: typeof value.receivedAmount === 'number' && Number.isFinite(value.receivedAmount) ? value.receivedAmount : undefined,
    amountActionIndex: typeof value.amountActionIndex === 'number' && Number.isInteger(value.amountActionIndex) && value.amountActionIndex >= 0
      ? value.amountActionIndex
      : undefined,
    amountLabel: typeof value.amountLabel === 'string' ? value.amountLabel.trim() || undefined : undefined,
    amountQuickOptionValue: typeof value.amountQuickOptionValue === 'number' && Number.isFinite(value.amountQuickOptionValue)
      ? value.amountQuickOptionValue
      : undefined,
    amountNeedsConfirmation: value.amountNeedsConfirmation === true,
    currency: typeof value.currency === 'string' ? value.currency.trim().toUpperCase() : undefined,
    person: sanitizePerson(value.person),
    account: sanitizeAccount(value.account),
    destinationAccount: sanitizeAccount(value.destinationAccount),
  };
}

function mergeReview(base: SmartEntryReview | undefined, next: SmartEntryReview): SmartEntryReview {
  return {
    understanding: next.understanding.length > 0 ? next.understanding : base?.understanding || [],
    missing: next.missing,
    purpose: next.purpose || base?.purpose,
    purposeConfidence: typeof next.purposeConfidence === 'number' ? next.purposeConfidence : base?.purposeConfidence,
    purposeNeedsConfirmation: typeof next.purposeNeedsConfirmation === 'boolean' ? next.purposeNeedsConfirmation : base?.purposeNeedsConfirmation,
    purposeOptions: next.purposeOptions || base?.purposeOptions,
    amount: typeof next.amount === 'number' ? next.amount : base?.amount,
    receivedAmount: typeof next.receivedAmount === 'number' ? next.receivedAmount : base?.receivedAmount,
    amountActionIndex: typeof next.amountActionIndex === 'number' ? next.amountActionIndex : base?.amountActionIndex,
    amountLabel: next.amountLabel || base?.amountLabel,
    amountQuickOptionValue: typeof next.amountQuickOptionValue === 'number' ? next.amountQuickOptionValue : base?.amountQuickOptionValue,
    amountNeedsConfirmation: typeof next.amountNeedsConfirmation === 'boolean' ? next.amountNeedsConfirmation : base?.amountNeedsConfirmation,
    currency: next.currency || base?.currency,
    person: { ...(base?.person || {}), ...(next.person || {}) },
    account: { ...(base?.account || {}), ...(next.account || {}) },
    destinationAccount: { ...(base?.destinationAccount || {}), ...(next.destinationAccount || {}) },
  };
}

function validateReviewSelection(review: SmartEntryReview): string | null {
  if (!review.purpose || review.purpose === 'unclear' || review.purposeNeedsConfirmation) {
    return 'Please confirm how this money should be treated.';
  }
  if (review.amountNeedsConfirmation && typeof review.amount !== 'number') {
    return review.amountLabel || 'Please confirm the missing amount.';
  }
  if (review.person?.required) {
    if (review.person.mode === 'existing' && !review.person.personId) {
      return 'Please choose an existing person.';
    }
    if (review.person.mode === 'create' && !review.person.name?.trim()) {
      return 'Please enter a name for the new person.';
    }
    if (!review.person.mode) {
      return 'Please complete the person details.';
    }
  }

  const validateAccount = (
    selection: SmartEntryReview['account'] | SmartEntryReview['destinationAccount'],
    label: string
  ) => {
    if (!selection?.required) return null;
    if (selection.mode === 'existing' && !selection.accountId) {
      return `Please choose an existing ${label}.`;
    }
    if (selection.mode === 'create' && !selection.name?.trim()) {
      return `Please enter a name for the new ${label}.`;
    }
    if (!selection.mode) {
      return `Please complete the ${label} details.`;
    }
    return null;
  };

  return validateAccount(review.account, 'account') || validateAccount(review.destinationAccount, 'destination account');
}

async function replacePendingActions(args: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  requestId: string;
  userId: string;
  actions: FinancialAction[];
}) {
  const admin = args.admin;

  await admin
    .from('ai_pending_actions')
    .delete()
    .eq('request_id', args.requestId)
    .eq('user_id', args.userId);

  if (args.actions.length === 0) {
    return;
  }

  await admin
    .from('ai_pending_actions')
    .insert(
      args.actions.map((action, index) => ({
        user_id: args.userId,
        request_id: args.requestId,
        action_index: index,
        action_type: action.actionType,
        action_data: action,
        status: 'pending',
      }))
    );
}

export async function POST(req: NextRequest) {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonWithCookies({ error: 'Unauthorized' }, 401, cookieMutations);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonWithCookies({ error: 'Invalid request id' }, 400, cookieMutations);
    }

    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (!UUID_PATTERN.test(requestId)) {
      return jsonWithCookies({ error: 'Invalid request id' }, 400, cookieMutations);
    }
    const review = sanitizeReview(body.review);
    if (!review) {
      return jsonWithCookies({ error: 'Invalid Smart Entry review data.' }, 400, cookieMutations);
    }

    const admin = createAdminClient();
    if (!admin) {
      console.error('[AI Confirm] Missing service-role Supabase client');
      return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
    }

    const { data: aiRequest, error: fetchError } = await admin
      .from('ai_requests')
      .select('id, user_id, status, confirmation_status, parsed_result')
      .eq('id', requestId)
      .single();

    if (fetchError || !aiRequest) {
      return jsonWithCookies({ error: 'Request not found' }, 404, cookieMutations);
    }

    if (aiRequest.user_id !== user.id) {
      return jsonWithCookies({ error: 'Forbidden' }, 403, cookieMutations);
    }

    if (aiRequest.status === 'confirmed' && aiRequest.confirmation_status === 'confirmed') {
      return jsonWithCookies(
        {
          success: true,
          requestId,
          status: 'confirmed',
          confirmationStatus: 'confirmed',
          alreadyConfirmed: true,
        },
        200,
        cookieMutations
      );
    }

    if (isExecutingOrExecuted(aiRequest.status)) {
      return jsonWithCookies(
        { error: 'This Smart Entry request is already being processed.' },
        409,
        cookieMutations
      );
    }

    if (aiRequest.status !== 'parsed' || aiRequest.confirmation_status !== null) {
      return jsonWithCookies(
        { error: 'This Smart Entry request cannot be confirmed in its current state.' },
        409,
        cookieMutations
      );
    }

    const storedInstruction = aiRequest.parsed_result as ParsedFinancialInstruction | null;
    if (!storedInstruction || !Array.isArray(storedInstruction.actions)) {
      return jsonWithCookies({ error: 'This Smart Entry request cannot be confirmed in its current state.' }, 409, cookieMutations);
    }
    const mergedReview = mergeReview(storedInstruction.review, review);
    const reviewSelectionError = validateReviewSelection(mergedReview);
    if (reviewSelectionError) {
      return jsonWithCookies({ error: reviewSelectionError }, 409, cookieMutations);
    }
    const selectedPersonIds = mergedReview.person?.personId ? [mergedReview.person.personId] : [];
    const selectedAccountIds = [
      mergedReview.account?.accountId,
      mergedReview.destinationAccount?.accountId,
    ].filter((value): value is string => !!value);

    const { data: selectedPeopleRows, error: selectedPeopleError } = selectedPersonIds.length > 0
      ? await admin
          .from('managed_people')
          .select('id, full_name, relationship')
          .eq('owner_id', user.id)
          .eq('is_active', true)
          .eq('is_archived', false)
          .in('id', selectedPersonIds)
      : { data: [], error: null };
    const { data: selectedAccountsRows, error: selectedAccountsError } = selectedAccountIds.length > 0
      ? await admin
          .from('financial_accounts')
          .select('id, name, account_type, currency, include_in_total')
          .eq('user_id', user.id)
          .in('id', selectedAccountIds)
      : { data: [], error: null };
    const { data: allPeopleRows, error: allPeopleError } = await admin
      .from('managed_people')
      .select('id, full_name')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .eq('is_archived', false);

    if (selectedPeopleError) {
      console.error('[AI Confirm] Failed to load selected people:', selectedPeopleError.message);
      return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
    }
    if (selectedAccountsError) {
      console.error('[AI Confirm] Failed to load selected accounts:', selectedAccountsError.message);
      return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
    }
    if (allPeopleError) {
      console.error('[AI Confirm] Failed to load people for account eligibility:', allPeopleError.message);
      return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
    }

    const selectedPerson = mergedReview.person?.personId
      ? (selectedPeopleRows || []).find((row) => row.id === mergedReview.person?.personId)
      : null;
    if (mergedReview.person?.mode === 'existing' && !selectedPerson) {
      return jsonWithCookies({ error: 'Selected person not found.' }, 409, cookieMutations);
    }

    const selectedPrimaryAccount = mergedReview.account?.accountId
      ? (selectedAccountsRows || []).find((row) => row.id === mergedReview.account?.accountId)
      : null;
    if (mergedReview.account?.mode === 'existing' && !selectedPrimaryAccount) {
      return jsonWithCookies({ error: 'Selected account not found.' }, 409, cookieMutations);
    }
    if (
      mergedReview.account?.mode === 'existing' &&
      selectedPrimaryAccount &&
      !isAccountEligibleForPurpose({
        purpose: mergedReview.purpose,
        field: 'account',
        personName: selectedPerson?.full_name || mergedReview.person?.name,
        account: {
          id: selectedPrimaryAccount.id,
          name: selectedPrimaryAccount.name,
          type: selectedPrimaryAccount.account_type,
          currency: selectedPrimaryAccount.currency,
          includeInTotal: selectedPrimaryAccount.include_in_total,
        },
        people: (allPeopleRows || []).map((row) => ({
          id: row.id,
          fullName: row.full_name,
        })),
      })
    ) {
      return jsonWithCookies({ error: 'Selected account does not match this Smart Entry purpose.' }, 409, cookieMutations);
    }

    const selectedDestinationAccount = mergedReview.destinationAccount?.accountId
      ? (selectedAccountsRows || []).find((row) => row.id === mergedReview.destinationAccount?.accountId)
      : null;
    if (mergedReview.destinationAccount?.mode === 'existing' && !selectedDestinationAccount) {
      return jsonWithCookies({ error: 'Selected destination account not found.' }, 409, cookieMutations);
    }
    if (
      mergedReview.destinationAccount?.mode === 'existing' &&
      selectedDestinationAccount &&
      !isAccountEligibleForPurpose({
        purpose: mergedReview.purpose,
        field: 'destinationAccount',
        personName: selectedPerson?.full_name || mergedReview.person?.name,
        account: {
          id: selectedDestinationAccount.id,
          name: selectedDestinationAccount.name,
          type: selectedDestinationAccount.account_type,
          currency: selectedDestinationAccount.currency,
          includeInTotal: selectedDestinationAccount.include_in_total,
        },
        people: (allPeopleRows || []).map((row) => ({
          id: row.id,
          fullName: row.full_name,
        })),
      })
    ) {
      return jsonWithCookies({ error: 'Selected destination account does not match this Smart Entry purpose.' }, 409, cookieMutations);
    }

    const nextInstruction = applySmartEntryReviewToInstruction({
      ...storedInstruction,
      review: {
        ...mergedReview,
        person: mergedReview.person
          ? {
              ...mergedReview.person,
              personId: selectedPerson?.id,
              name: selectedPerson?.full_name || mergedReview.person.name,
              relationship: (selectedPerson?.relationship as NonNullable<NonNullable<SmartEntryReview['person']>['relationship']>) || mergedReview.person.relationship,
            }
          : undefined,
        account: mergedReview.account
          ? {
              ...mergedReview.account,
              accountId: selectedPrimaryAccount?.id,
              name: selectedPrimaryAccount?.name || mergedReview.account.name,
              type: (selectedPrimaryAccount?.account_type as NonNullable<NonNullable<SmartEntryReview['account']>['type']>) || mergedReview.account.type,
              currency: selectedPrimaryAccount?.currency || mergedReview.account.currency,
              includeInTotal: isManagedPurpose(mergedReview.purpose)
                ? false
                : mergedReview.account.includeInTotal !== false,
              managedPersonId: selectedPerson?.id || mergedReview.account.managedPersonId,
              managedPersonName: selectedPerson?.full_name || mergedReview.account.managedPersonName,
            }
          : undefined,
        destinationAccount: mergedReview.destinationAccount
          ? {
              ...mergedReview.destinationAccount,
              accountId: selectedDestinationAccount?.id,
              name: selectedDestinationAccount?.name || mergedReview.destinationAccount.name,
              type: (selectedDestinationAccount?.account_type as NonNullable<NonNullable<SmartEntryReview['destinationAccount']>['type']>) || mergedReview.destinationAccount.type,
              currency: selectedDestinationAccount?.currency || mergedReview.destinationAccount.currency,
            }
          : undefined,
      },
    });

    const missing = getSmartEntryMissingFields(nextInstruction);
    nextInstruction.review = {
      ...(nextInstruction.review as SmartEntryReview),
      missing,
    };
    nextInstruction.missingFields = [...missing];
    nextInstruction.requiresClarification = false;
    nextInstruction.clarificationQuestions = [];

    if (missing.length > 0) {
      return jsonWithCookies(
        { error: `This Smart Entry request still needs: ${missing.join(', ')}.` },
        409,
        cookieMutations
      );
    }

    await replacePendingActions({
      admin,
      requestId,
      userId: user.id,
      actions: nextInstruction.actions,
    });

    const { data: updatedRows, error: updateError } = await admin
      .from('ai_requests')
      .update({
        parsed_result: nextInstruction,
        pending_actions: nextInstruction.actions,
        missing_fields: [],
        requires_clarification: false,
        clarification_context: null,
        status: 'confirmed',
        confirmation_status: 'confirmed',
        error_category: null,
        error_message: null,
      })
      .eq('id', requestId)
      .eq('user_id', user.id)
      .eq('status', 'parsed')
      .is('confirmation_status', null)
      .select('id');

    if (updateError) {
      console.error('[AI Confirm] Failed to update request:', updateError.message);
      return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
    }

    if ((updatedRows ?? []).length > 0) {
      return jsonWithCookies(
        {
          success: true,
          requestId,
          status: 'confirmed',
          confirmationStatus: 'confirmed',
          alreadyConfirmed: false,
        },
        200,
        cookieMutations
      );
    }
    return jsonWithCookies({ error: 'This Smart Entry request cannot be confirmed in its current state.' }, 409, cookieMutations);
  } catch (error) {
    console.error('[AI Confirm] Unexpected error:', error instanceof Error ? error.message : error);
    return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
  }
}
