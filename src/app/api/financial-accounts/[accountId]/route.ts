import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  logFinancialAccountsServerError,
  sanitizeFinancialAccountPayload,
  sanitizeSpaceAccountSharingPayload,
  validateFinancialAccountInput,
} from '@/lib/financial-accounts-server';

export const runtime = 'nodejs';

const ACCOUNT_SELECT = `
  *,
  space:spaces(id, name, color),
  space_account_permissions(
    id,
    space_id,
    can_view_space_transactions,
    can_add_space_transactions,
    can_view_balance,
    can_view_full_history,
    space:spaces(id, name, color)
  )
`;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await context.params;
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      cookieMutations
    );
  }

  try {
    const body = await request.json();
    const payload = sanitizeFinancialAccountPayload(body || {});
    const sharingPayload = sanitizeSpaceAccountSharingPayload((body || {}).space_sharing);
    const validationError = validateFinancialAccountInput(payload);
    if (validationError) {
      return applySupabaseCookies(
        NextResponse.json({ error: validationError }, { status: 400 }),
        cookieMutations
      );
    }

    const { data: existingAccount, error: existingAccountError } = await supabase
      .from('financial_accounts')
      .select('id, user_id, space_id, scope_type, is_system_default, system_default_type, account_type, ownership_type, is_active')
      .eq('id', accountId)
      .single();

    if (existingAccountError) {
      return applySupabaseCookies(
        NextResponse.json({ error: existingAccountError.message || 'Account not found' }, { status: 404 }),
        cookieMutations
      );
    }

    const isPersonalOwnedAccount = existingAccount.scope_type === 'personal' && existingAccount.user_id === user.id;
    const isScopeConversion =
      payload.scope_type !== existingAccount.scope_type
      || (payload.scope_type === 'space' && payload.space_id !== existingAccount.space_id)
      || (payload.scope_type === 'personal' && existingAccount.space_id !== null);

    if (isScopeConversion) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Account ownership scope cannot be converted after creation' },
          { status: 400 }
        ),
        cookieMutations
      );
    }

    const isActiveDefaultAccount = existingAccount?.is_system_default && existingAccount?.system_default_type;
    if (isActiveDefaultAccount) {
      const changingAccountType = payload.account_type !== existingAccount.account_type;
      const changingOwnership = payload.ownership_type !== existingAccount.ownership_type;
      const deactivatingAccount = payload.is_active === false;
      const changingScope = payload.scope_type !== existingAccount.scope_type;

      if (changingAccountType || changingOwnership || deactivatingAccount || changingScope) {
        return applySupabaseCookies(
          NextResponse.json(
            {
              error: 'Assign another default account before changing the type, ownership, scope, or active status of this system default',
            },
            { status: 400 }
          ),
          cookieMutations
        );
      }
    }

    if (payload.is_active === false && existingAccount?.is_system_default && existingAccount?.system_default_type) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Assign another default account before archiving this system default' }, { status: 400 }),
        cookieMutations
      );
    }

    const { data, error } = await supabase
      .from('financial_accounts')
      .update({
        ...payload,
        include_in_total: existingAccount.scope_type === 'space' ? false : payload.include_in_total,
      })
      .eq('id', accountId)
      .select(ACCOUNT_SELECT)
      .single();

    if (error) {
      return applySupabaseCookies(
        NextResponse.json({ error: error.message || 'Failed to update account' }, { status: 500 }),
        cookieMutations
      );
    }

    if (Array.isArray((body || {}).space_sharing)) {
      if (!isPersonalOwnedAccount) {
        return applySupabaseCookies(
          NextResponse.json(
            { error: 'Only the personal account owner can manage Space sharing' },
            { status: 403 }
          ),
          cookieMutations
        );
      }

      const { data: existingPermissions, error: permissionsError } = await supabase
        .from('space_account_permissions')
        .select('id, space_id')
        .eq('account_id', accountId);

      if (permissionsError) {
        return applySupabaseCookies(
          NextResponse.json({ error: permissionsError.message || 'Failed to update sharing settings' }, { status: 500 }),
          cookieMutations
        );
      }

      const requestedSpaceIds = new Set(sharingPayload.map((entry) => entry.space_id));
      const obsoleteSpaceIds = ((existingPermissions || []) as Array<{ space_id: string }>)
        .map((entry) => entry.space_id)
        .filter((spaceId) => !requestedSpaceIds.has(spaceId));

      if (obsoleteSpaceIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('space_account_permissions')
          .delete()
          .eq('account_id', accountId)
          .in('space_id', obsoleteSpaceIds);
        if (deleteError) {
          return applySupabaseCookies(
            NextResponse.json({ error: deleteError.message || 'Failed to remove sharing settings' }, { status: 500 }),
            cookieMutations
          );
        }
      }

      if (sharingPayload.length > 0) {
        const { error: upsertError } = await supabase
          .from('space_account_permissions')
          .upsert(
            sharingPayload.map((entry) => ({
              account_id: accountId,
              granted_by_user_id: user.id,
              ...entry,
            })),
            { onConflict: 'space_id,account_id' }
          );

        if (upsertError) {
          return applySupabaseCookies(
            NextResponse.json({ error: upsertError.message || 'Failed to save sharing settings' }, { status: 500 }),
            cookieMutations
          );
        }
      }

      const { data: refreshedAccount, error: refreshedError } = await supabase
        .from('financial_accounts')
        .select(ACCOUNT_SELECT)
        .eq('id', accountId)
        .single();

      if (refreshedError) {
        return applySupabaseCookies(
          NextResponse.json({ error: refreshedError.message || 'Failed to refresh account' }, { status: 500 }),
          cookieMutations
        );
      }

      return applySupabaseCookies(
        NextResponse.json({ account: refreshedAccount }, { status: 200 }),
        cookieMutations
      );
    }

    return applySupabaseCookies(
      NextResponse.json({ account: data }, { status: 200 }),
      cookieMutations
    );
  } catch (error) {
    logFinancialAccountsServerError('update-account-route', error, {
      accountId,
      userId: user.id,
    });
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to update account' }, { status: 500 }),
      cookieMutations
    );
  }
}
