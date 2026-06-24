import { NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  sanitizeFinancialAccountPayload,
  validateFinancialAccountInput,
} from '@/lib/financial-accounts-server';

export const runtime = 'nodejs';

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
    const validationError = validateFinancialAccountInput(payload);
    if (validationError) {
      return applySupabaseCookies(
        NextResponse.json({ error: validationError }, { status: 400 }),
        cookieMutations
      );
    }

    const { data: existingAccount, error: existingAccountError } = await supabase
      .from('financial_accounts')
      .select('id, is_system_default, system_default_type, account_type, ownership_type, is_active')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .single();

    if (existingAccountError) {
      return applySupabaseCookies(
        NextResponse.json({ error: existingAccountError.message || 'Failed to update account' }, { status: 500 }),
        cookieMutations
      );
    }

    const isActiveDefaultAccount = existingAccount?.is_system_default && existingAccount?.system_default_type;
    if (isActiveDefaultAccount) {
      const changingAccountType = payload.account_type !== existingAccount.account_type;
      const changingOwnership = payload.ownership_type !== 'personal';
      const deactivatingAccount = payload.is_active === false;

      if (changingAccountType || changingOwnership || deactivatingAccount) {
        return applySupabaseCookies(
          NextResponse.json(
            {
              error: 'Assign another default account before changing the type, ownership, or active status of this system default',
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
      .update(payload)
      .eq('id', accountId)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) {
      return applySupabaseCookies(
        NextResponse.json({ error: error.message || 'Failed to update account' }, { status: 500 }),
        cookieMutations
      );
    }

    return applySupabaseCookies(
      NextResponse.json({ account: data }, { status: 200 }),
      cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to update account' }, { status: 500 }),
      cookieMutations
    );
  }
}
