import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import type { FinancialAction, ParsedFinancialInstruction, PersonResolution } from '@/lib/ai-types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCOUNT_TYPES = new Set(['bank', 'credit_card', 'cash', 'savings', 'digital_wallet', 'investment', 'other']);

type AccountResolution = {
  actionIndex: number;
  field: 'account' | 'destinationAccount';
  mode: 'create' | 'select';
  accountId?: string;
  account?: {
    name?: string;
    type?: string;
    currency?: string;
    openingBalance?: number;
    includeInTotal?: boolean;
  };
};

type MutableAction = FinancialAction & { __sourceIndex?: number | null };
type ManagedPersonSummary = {
  id: string;
  full_name: string;
  aliases?: string[];
};
const RELATIONSHIPS = new Set(['spouse', 'child', 'parent', 'sibling', 'friend', 'relative', 'colleague', 'client', 'other']);

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

function sanitizeAccountResolutions(value: unknown): AccountResolution[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const mode = raw.mode === 'create' || raw.mode === 'select' ? raw.mode : null;
      const field = raw.field === 'account' || raw.field === 'destinationAccount' ? raw.field : null;
      const actionIndex = typeof raw.actionIndex === 'number' ? raw.actionIndex : NaN;
      if (!mode || !field || !Number.isInteger(actionIndex) || actionIndex < 0) return null;

      const account = raw.account && typeof raw.account === 'object'
        ? raw.account as Record<string, unknown>
        : null;

      return {
        actionIndex,
        field,
        mode,
        accountId: typeof raw.accountId === 'string' && UUID_PATTERN.test(raw.accountId) ? raw.accountId : undefined,
        account: account
          ? {
              name: typeof account.name === 'string' ? account.name.trim() : undefined,
              type: typeof account.type === 'string' ? account.type : undefined,
              currency: typeof account.currency === 'string' ? account.currency : undefined,
              openingBalance: typeof account.openingBalance === 'number' ? account.openingBalance : undefined,
              includeInTotal: typeof account.includeInTotal === 'boolean' ? account.includeInTotal : undefined,
            }
          : undefined,
      } satisfies AccountResolution;
    })
    .filter((item): item is AccountResolution => item !== null);
}

function sanitizePersonResolutions(value: unknown): PersonResolution[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Record<string, unknown>;
      const mode = raw.mode === 'create' || raw.mode === 'existing' ? raw.mode : null;
      const actionIndex = typeof raw.actionIndex === 'number' ? raw.actionIndex : NaN;
      if (!mode || !Number.isInteger(actionIndex) || actionIndex < 0) return null;

      const actionIndexes = Array.isArray(raw.actionIndexes)
        ? raw.actionIndexes
            .filter((value): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0)
        : undefined;

      const relationship = typeof raw.relationship === 'string' && RELATIONSHIPS.has(raw.relationship)
        ? raw.relationship as PersonResolution['relationship']
        : undefined;

      const personName = typeof raw.personName === 'string' ? raw.personName.trim() : '';
      const personId = typeof raw.personId === 'string' && UUID_PATTERN.test(raw.personId) ? raw.personId : undefined;
      if (!personName) return null;
      if (mode === 'existing' && !personId) return null;

      return {
        actionIndex,
        actionIndexes: actionIndexes && actionIndexes.length > 0 ? actionIndexes : undefined,
        mode,
        personId,
        personName,
        relationship,
        notes: typeof raw.notes === 'string' ? raw.notes.trim() : undefined,
      } satisfies PersonResolution;
    })
    .filter((item): item is PersonResolution => item !== null);
}

function isAccountRequired(action: FinancialAction, field: 'account' | 'destinationAccount') {
  if (field === 'destinationAccount') {
    return action.actionType === 'transfer';
  }

  return [
    'income',
    'expense',
    'transfer',
    'recurring_transaction',
    'expense_paid_for_person',
    'money_received_from_person',
    'expense_from_held_balance',
  ].includes(action.actionType);
}

function isPersonRequired(action: FinancialAction) {
  return [
    'money_received_from_person',
    'money_returned_to_person',
    'expense_from_held_balance',
    'expense_paid_for_person',
    'expense_paid_by_person',
    'reimbursement_payment',
    'settlement',
  ].includes(action.actionType);
}

function normalizeName(value: string | undefined) {
  return (value || '').trim().toLowerCase();
}

function sanitizeCurrency(value: string | undefined) {
  const currency = (value || 'AED').trim().toUpperCase().replace(/[^A-Z]/g, '');
  return currency.length === 3 ? currency : 'AED';
}

function withSourceIndexes(instruction: ParsedFinancialInstruction): ParsedFinancialInstruction & { actions: MutableAction[] } {
  return {
    ...instruction,
    actions: instruction.actions.map((action, index) => ({
      ...action,
      warnings: [...(action.warnings || [])],
      __sourceIndex: index,
    })),
  };
}

function stripSourceIndexes(instruction: ParsedFinancialInstruction & { actions: MutableAction[] }): ParsedFinancialInstruction {
  return {
    ...instruction,
    actions: instruction.actions.map((action) => {
      const { __sourceIndex, ...cleanAction } = action;
      return cleanAction;
    }),
  };
}

function findMutableActionIndex(actions: MutableAction[], sourceIndex: number) {
  return actions.findIndex((action) => action.__sourceIndex === sourceIndex);
}

function resolvePersonByIdOrName(personId: string | undefined, personName: string | undefined, people: ManagedPersonSummary[]) {
  const normalizedName = normalizeName(personName);

  return people.find((person) => {
    if (personId && person.id === personId) return true;
    if (!normalizedName) return false;
    if (normalizeName(person.full_name) === normalizedName) return true;
    return (person.aliases || []).some((alias) => normalizeName(alias) === normalizedName);
  }) || null;
}

function applyPersonResolutions(args: {
  instruction: ParsedFinancialInstruction;
  resolutions: PersonResolution[];
  selectedPeople: ManagedPersonSummary[];
}) {
  const nextInstruction = withSourceIndexes(args.instruction);
  const insertedCreates = new Set<string>();

  for (const resolution of args.resolutions.sort((a, b) => a.actionIndex - b.actionIndex)) {
    const targetIndexes = Array.from(new Set([resolution.actionIndex, ...(resolution.actionIndexes || [])])).sort((a, b) => a - b);
    if (targetIndexes.length === 0) continue;

    if (resolution.mode === 'existing') {
      const selectedPerson = args.selectedPeople.find((person) => person.id === resolution.personId);
      if (!selectedPerson) {
        throw new Error('Selected managed person not found.');
      }

      for (const sourceIndex of targetIndexes) {
        const actionIndex = findMutableActionIndex(nextInstruction.actions, sourceIndex);
        const targetAction = actionIndex >= 0 ? nextInstruction.actions[actionIndex] : null;
        if (!targetAction || !isPersonRequired(targetAction)) {
          throw new Error('Invalid managed person resolution target.');
        }
        targetAction.personId = selectedPerson.id;
        targetAction.personName = selectedPerson.full_name;
      }
      continue;
    }

    const personName = resolution.personName.trim();
    if (!personName) {
      throw new Error('Managed person name is required.');
    }

    const firstTargetIndex = findMutableActionIndex(nextInstruction.actions, targetIndexes[0]);
    if (firstTargetIndex < 0) {
      throw new Error('Invalid managed person resolution target.');
    }

    const createKey = `${normalizeName(personName)}:${targetIndexes.join(',')}`;
    if (!insertedCreates.has(createKey)) {
      const syntheticCreateAction: MutableAction = {
        actionType: 'create_managed_person',
        personName,
        relationship: resolution.relationship || 'other',
        notes: resolution.notes || undefined,
        confidence: 1,
        warnings: [],
        description: `Create managed person: ${personName}`,
        __sourceIndex: null,
      };
      nextInstruction.actions.splice(firstTargetIndex, 0, syntheticCreateAction);
      insertedCreates.add(createKey);
    }

    for (const sourceIndex of targetIndexes) {
      const actionIndex = findMutableActionIndex(nextInstruction.actions, sourceIndex);
      const targetAction = actionIndex >= 0 ? nextInstruction.actions[actionIndex] : null;
      if (!targetAction || !isPersonRequired(targetAction)) {
        throw new Error('Invalid managed person resolution target.');
      }
      targetAction.personId = undefined;
      targetAction.personName = personName;
      if (resolution.relationship) {
        targetAction.relationship = resolution.relationship;
      }
    }
  }

  return stripSourceIndexes(nextInstruction);
}

function applyAccountResolutions(args: {
  instruction: ParsedFinancialInstruction;
  resolutions: AccountResolution[];
  selectedAccounts: Array<{ id: string; name: string }>;
}) {
  const nextInstruction = withSourceIndexes(args.instruction);

  for (const resolution of args.resolutions.sort((a, b) => a.actionIndex - b.actionIndex)) {
    const targetIndex = findMutableActionIndex(nextInstruction.actions, resolution.actionIndex);
    const targetAction = nextInstruction.actions[targetIndex];
    if (!targetAction || !isAccountRequired(targetAction, resolution.field)) {
      throw new Error('Invalid account resolution target.');
    }

    if (resolution.mode === 'select') {
      const selectedAccount = args.selectedAccounts.find((account) => account.id === resolution.accountId);
      if (!selectedAccount) {
        throw new Error('Selected account not found.');
      }

      if (resolution.field === 'account') {
        targetAction.accountId = selectedAccount.id;
        targetAction.accountName = selectedAccount.name;
      } else {
        targetAction.destinationAccountId = selectedAccount.id;
        targetAction.destinationAccountName = selectedAccount.name;
      }
      continue;
    }

    const accountName = resolution.account?.name?.trim();
    if (!accountName) {
      throw new Error('Account name is required.');
    }

    const accountType = resolution.account?.type && ACCOUNT_TYPES.has(resolution.account.type)
      ? resolution.account.type
      : 'cash';

    const syntheticCreateAction: FinancialAction = {
      actionType: 'create_account',
      accountName,
      accountType: accountType as FinancialAction['accountType'],
      currency: sanitizeCurrency(resolution.account?.currency),
      openingBalance: typeof resolution.account?.openingBalance === 'number' ? resolution.account.openingBalance : 0,
      includeInTotal: resolution.account?.includeInTotal !== false,
      confidence: 1,
      warnings: [],
      description: `Create ${accountType.replace('_', ' ')} account: ${accountName}`,
    };

    nextInstruction.actions.splice(targetIndex, 0, syntheticCreateAction);

    const adjustedTarget = nextInstruction.actions[targetIndex + 1];
    if (resolution.field === 'account') {
      adjustedTarget.accountId = undefined;
      adjustedTarget.accountName = accountName;
    } else {
      adjustedTarget.destinationAccountId = undefined;
      adjustedTarget.destinationAccountName = accountName;
    }
  }

  return stripSourceIndexes(nextInstruction);
}

function hasUnresolvedRequiredAccounts(
  instruction: ParsedFinancialInstruction,
  existingAccounts: Array<{ id: string; name: string }>
) {
  const availableNames = new Set(existingAccounts.map((account) => normalizeName(account.name)));

  for (const action of instruction.actions) {
    if (action.actionType === 'create_account' && action.accountName) {
      availableNames.add(normalizeName(action.accountName));
      continue;
    }

    if (isAccountRequired(action, 'account')) {
      if (action.accountId) continue;
      if (!action.accountName || !availableNames.has(normalizeName(action.accountName))) {
        return true;
      }
    }

    if (isAccountRequired(action, 'destinationAccount')) {
      if (action.destinationAccountId) continue;
      if (!action.destinationAccountName || !availableNames.has(normalizeName(action.destinationAccountName))) {
        return true;
      }
    }
  }

  return false;
}

function hasUnresolvedRequiredPeople(
  instruction: ParsedFinancialInstruction,
  existingPeople: ManagedPersonSummary[]
) {
  const availablePeople = [...existingPeople];

  for (const action of instruction.actions) {
    if (action.actionType === 'create_managed_person' && action.personName) {
      availablePeople.push({
        id: `new:${normalizeName(action.personName)}`,
        full_name: action.personName,
        aliases: [],
      });
      continue;
    }

    if (!isPersonRequired(action)) continue;
    if (resolvePersonByIdOrName(action.personId, action.personName, availablePeople)) continue;
    return true;
  }

  return false;
}

async function replacePendingActions(args: {
  admin: ReturnType<typeof createAdminClient>;
  requestId: string;
  userId: string;
  actions: FinancialAction[];
}) {
  await args.admin
    .from('ai_pending_actions')
    .delete()
    .eq('request_id', args.requestId)
    .eq('user_id', args.userId);

  if (args.actions.length === 0) {
    return;
  }

  await args.admin
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
    const accountResolutions = sanitizeAccountResolutions(body.accountResolutions);
    const personResolutions = sanitizePersonResolutions(body.personResolutions);

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
      if (accountResolutions.length > 0 || personResolutions.length > 0) {
        return jsonWithCookies(
          { error: 'This Smart Entry request is already confirmed and can no longer be edited.' },
          409,
          cookieMutations
        );
      }
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

    let nextInstruction = aiRequest.parsed_result as ParsedFinancialInstruction | null;
    if (!nextInstruction || !Array.isArray(nextInstruction.actions)) {
      return jsonWithCookies({ error: 'This Smart Entry request cannot be confirmed in its current state.' }, 409, cookieMutations);
    }

    if (personResolutions.length > 0) {
      const selectedPersonIds = personResolutions
        .filter((resolution) => resolution.mode === 'existing' && resolution.personId)
        .map((resolution) => resolution.personId as string);

      const { data: selectedPeopleRows, error: selectedPeopleError } = selectedPersonIds.length > 0
        ? await admin
            .from('managed_people')
            .select('id, full_name')
            .eq('owner_id', user.id)
            .eq('is_active', true)
            .eq('is_archived', false)
            .in('id', selectedPersonIds)
        : { data: [], error: null };

      if (selectedPeopleError) {
        console.error('[AI Confirm] Failed to load selected managed people:', selectedPeopleError.message);
        return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
      }

      try {
        nextInstruction = applyPersonResolutions({
          instruction: nextInstruction,
          resolutions: personResolutions,
          selectedPeople: (selectedPeopleRows || []) as ManagedPersonSummary[],
        });
      } catch (resolutionError) {
        return jsonWithCookies(
          { error: resolutionError instanceof Error ? resolutionError.message : 'Invalid managed person resolution.' },
          409,
          cookieMutations
        );
      }
    }

    if (accountResolutions.length > 0) {
      const selectedAccountIds = accountResolutions
        .filter((resolution) => resolution.mode === 'select' && resolution.accountId)
        .map((resolution) => resolution.accountId as string);

      const { data: selectedAccounts, error: selectedAccountsError } = selectedAccountIds.length > 0
        ? await admin
            .from('financial_accounts')
            .select('id, name')
            .eq('user_id', user.id)
            .in('id', selectedAccountIds)
        : { data: [], error: null };

      if (selectedAccountsError) {
        console.error('[AI Confirm] Failed to load selected accounts:', selectedAccountsError.message);
        return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
      }

      try {
        nextInstruction = applyAccountResolutions({
          instruction: nextInstruction,
          resolutions: accountResolutions,
          selectedAccounts: (selectedAccounts || []) as Array<{ id: string; name: string }>,
        });
      } catch (resolutionError) {
        return jsonWithCookies(
          { error: resolutionError instanceof Error ? resolutionError.message : 'Invalid account resolution.' },
          409,
          cookieMutations
        );
      }
    }

    const { data: currentAccounts, error: currentAccountsError } = await admin
      .from('financial_accounts')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const { data: currentPeopleRows, error: currentPeopleError } = await admin
      .from('managed_people')
      .select('id, full_name')
      .eq('owner_id', user.id)
      .eq('is_active', true)
      .eq('is_archived', false);

    const currentPeople = ((currentPeopleRows || []) as ManagedPersonSummary[]);

    const { data: aliasRows, error: aliasError } = currentPeople.length > 0
      ? await admin
          .from('person_aliases')
          .select('person_id, alias')
          .in('person_id', currentPeople.map((person) => person.id))
      : { data: [], error: null };

    if (currentAccountsError) {
      console.error('[AI Confirm] Failed to load current accounts:', currentAccountsError.message);
      return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
    }
    if (currentPeopleError) {
      console.error('[AI Confirm] Failed to load current managed people:', currentPeopleError.message);
      return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
    }
    if (aliasError) {
      console.error('[AI Confirm] Failed to load managed person aliases:', aliasError.message);
      return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
    }

    const aliasesByPersonId = new Map<string, string[]>();
    for (const row of (aliasRows || []) as Array<{ person_id: string; alias: string }>) {
      const existingAliases = aliasesByPersonId.get(row.person_id) || [];
      existingAliases.push(row.alias);
      aliasesByPersonId.set(row.person_id, existingAliases);
    }

    const currentPeopleWithAliases = currentPeople.map((person) => ({
      ...person,
      aliases: aliasesByPersonId.get(person.id) || [],
    }));

    if (hasUnresolvedRequiredAccounts(nextInstruction, (currentAccounts || []) as Array<{ id: string; name: string }>)) {
      return jsonWithCookies(
        { error: 'This Smart Entry request still has unresolved account references.' },
        409,
        cookieMutations
      );
    }

    if (hasUnresolvedRequiredPeople(nextInstruction, currentPeopleWithAliases)) {
      return jsonWithCookies(
        { error: 'This Smart Entry request still has unresolved managed people.' },
        409,
        cookieMutations
      );
    }

    if (accountResolutions.length > 0 || personResolutions.length > 0) {
      const { error: resolutionUpdateError } = await admin
        .from('ai_requests')
        .update({
          parsed_result: nextInstruction,
          pending_actions: nextInstruction.actions,
          missing_fields: [],
          requires_clarification: false,
          error_category: null,
          error_message: null,
        })
        .eq('id', requestId)
        .eq('user_id', user.id)
        .eq('status', 'parsed')
        .is('confirmation_status', null);

      if (resolutionUpdateError) {
        console.error('[AI Confirm] Failed to persist resolutions:', resolutionUpdateError.message);
        return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
      }

      await replacePendingActions({
        admin,
        requestId,
        userId: user.id,
        actions: nextInstruction.actions,
      });
    }

    const { data: updatedRows, error: updateError } = await admin
      .from('ai_requests')
      .update({
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

    const { data: refreshedRequest, error: refreshError } = await admin
      .from('ai_requests')
      .select('status, confirmation_status')
      .eq('id', requestId)
      .eq('user_id', user.id)
      .single();

    if (refreshError || !refreshedRequest) {
      return jsonWithCookies({ error: 'Request not found' }, 404, cookieMutations);
    }

    if (refreshedRequest.status === 'confirmed' && refreshedRequest.confirmation_status === 'confirmed') {
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

    if (isExecutingOrExecuted(refreshedRequest.status)) {
      return jsonWithCookies(
        { error: 'This Smart Entry request is already being processed.' },
        409,
        cookieMutations
      );
    }

    return jsonWithCookies(
      { error: 'This Smart Entry request cannot be confirmed in its current state.' },
      409,
      cookieMutations
    );
  } catch (error) {
    console.error('[AI Confirm] Unexpected error:', error instanceof Error ? error.message : error);
    return jsonWithCookies({ error: 'Confirmation is temporarily unavailable.' }, 500, cookieMutations);
  }
}
