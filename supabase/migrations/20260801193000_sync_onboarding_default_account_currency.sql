-- Migration: Safely synchronize pristine default personal account currencies during onboarding
-- Timestamp: 20260801193000
--
-- Why this exists:
-- - Onboarding saves user_profiles.default_currency and then calls
--   rpc_ensure_default_personal_accounts via /api/financial-accounts/ensure-defaults.
-- - The existing RPC already used the profile currency when creating new default
--   Cash/Bank accounts, but it could reuse an existing default candidate without
--   synchronizing its currency.
-- - That left pre-created empty AED defaults unchanged when onboarding later
--   selected GBP, USD, or another supported currency.
--
-- Safety:
-- - Keep the existing RPC as the single source of truth.
-- - Synchronize currency only for pristine system default personal accounts:
--   zero opening balance, zero trusted current balance, no transactions,
--   no transfers, no subscriptions, and no recurring activity.
-- - Never repurpose or change user-created accounts here.

DROP FUNCTION IF EXISTS public.rpc_ensure_default_personal_accounts(UUID);

CREATE FUNCTION public.rpc_ensure_default_personal_accounts(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  personal_cash_account_id UUID,
  personal_bank_account_id UUID,
  created_cash BOOLEAN,
  created_bank BOOLEAN,
  target_currency TEXT,
  cash_currency TEXT,
  bank_currency TEXT,
  cash_currency_sync_status TEXT,
  bank_currency_sync_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_auth_role TEXT := auth.role();
  v_user_id UUID := COALESCE(p_user_id, v_auth_user_id);
  v_currency TEXT;
  v_cash_candidate RECORD;
  v_bank_candidate RECORD;
  v_cash_trusted_current_balance NUMERIC(24,12) := 0;
  v_bank_trusted_current_balance NUMERIC(24,12) := 0;
  v_cash_total_transactions INTEGER := 0;
  v_bank_total_transactions INTEGER := 0;
  v_cash_total_transfers INTEGER := 0;
  v_bank_total_transfers INTEGER := 0;
  v_cash_total_subscriptions INTEGER := 0;
  v_bank_total_subscriptions INTEGER := 0;
  v_cash_total_recurring INTEGER := 0;
  v_bank_total_recurring INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User id is required';
  END IF;

  IF v_auth_user_id IS NOT NULL
     AND v_auth_user_id <> v_user_id
     AND COALESCE(v_auth_role, '') <> 'service_role' THEN
    RAISE EXCEPTION 'Cannot ensure default accounts for another user';
  END IF;

  PERFORM set_config('smartpocket.allow_default_account_mutation', '1', true);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('default-personal-accounts:%s', v_user_id::TEXT), 0)
  );

  SELECT UPPER(BTRIM(COALESCE(
    NULLIF(up.default_currency, ''),
    NULLIF(ps.default_currency, ''),
    'USD'
  )))
  INTO v_currency
  FROM public.user_profiles AS up
  LEFT JOIN public.platform_settings AS ps ON TRUE
  WHERE up.id = v_user_id;

  v_currency := COALESCE(NULLIF(v_currency, ''), 'USD');
  IF v_currency !~ '^[A-Z]{3}$' THEN
    v_currency := 'USD';
  END IF;

  target_currency := v_currency;

  UPDATE public.financial_accounts
  SET system_default_type = NULL
  WHERE user_id = v_user_id
    AND COALESCE(is_system_default, FALSE) = FALSE
    AND system_default_type IS NOT NULL;

  UPDATE public.financial_accounts
  SET is_system_default = FALSE,
      system_default_type = NULL
  WHERE user_id = v_user_id
    AND system_default_type IN ('personal_cash', 'personal_bank')
    AND COALESCE(is_active, TRUE) = FALSE;

  SELECT fa.id,
         UPPER(BTRIM(COALESCE(fa.currency, ''))) AS currency,
         COALESCE(fa.opening_balance, 0) AS opening_balance
  INTO v_cash_candidate
  FROM public.financial_accounts AS fa
  WHERE fa.user_id = v_user_id
    AND COALESCE(fa.is_active, TRUE) = TRUE
    AND fa.account_type = 'cash'
    AND COALESCE(fa.ownership_type, 'personal') = 'personal'
    AND COALESCE(fa.is_system_default, FALSE) = TRUE
    AND fa.system_default_type = 'personal_cash'
  ORDER BY fa.created_at ASC, fa.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_cash_candidate.id IS NULL THEN
    INSERT INTO public.financial_accounts (
      user_id,
      name,
      account_type,
      currency,
      opening_balance,
      current_balance,
      color,
      icon,
      notes,
      is_active,
      include_in_total,
      sort_order,
      ownership_type,
      is_system_default,
      system_default_type
    )
    VALUES (
      v_user_id,
      'Cash',
      'cash',
      v_currency,
      0,
      0,
      '#0f3460',
      'Wallet',
      NULL,
      TRUE,
      TRUE,
      0,
      'personal',
      TRUE,
      'personal_cash'
    )
    RETURNING id INTO personal_cash_account_id;

    created_cash := TRUE;
    cash_currency := v_currency;
    cash_currency_sync_status := 'created';
  ELSE
    personal_cash_account_id := v_cash_candidate.id;
    created_cash := FALSE;

    UPDATE public.financial_accounts
    SET is_system_default = FALSE,
        system_default_type = NULL
    WHERE user_id = v_user_id
      AND system_default_type = 'personal_cash'
      AND id <> personal_cash_account_id;

    UPDATE public.financial_accounts
    SET ownership_type = 'personal',
        is_system_default = TRUE,
        system_default_type = 'personal_cash',
        is_active = TRUE
    WHERE id = personal_cash_account_id;

    cash_currency := COALESCE(NULLIF(v_cash_candidate.currency, ''), v_currency);

    IF cash_currency = v_currency THEN
      cash_currency_sync_status := 'already_matching';
    ELSE
      SELECT public.rpc_recalculate_financial_account_balance(personal_cash_account_id)
      INTO v_cash_trusted_current_balance;

      SELECT COUNT(*)
      INTO v_cash_total_transactions
      FROM public.transactions
      WHERE account_id = personal_cash_account_id;

      SELECT COUNT(*)
      INTO v_cash_total_transfers
      FROM public.transfers
      WHERE from_account_id = personal_cash_account_id
         OR to_account_id = personal_cash_account_id;

      SELECT COUNT(*)
      INTO v_cash_total_subscriptions
      FROM public.personal_subscriptions
      WHERE financial_account_id = personal_cash_account_id;

      SELECT COUNT(*)
      INTO v_cash_total_recurring
      FROM public.recurring_transactions
      WHERE account_id = personal_cash_account_id;

      IF COALESCE(v_cash_candidate.opening_balance, 0) = 0
         AND COALESCE(v_cash_trusted_current_balance, 0) = 0
         AND v_cash_total_transactions = 0
         AND v_cash_total_transfers = 0
         AND v_cash_total_subscriptions = 0
         AND v_cash_total_recurring = 0 THEN
        UPDATE public.financial_accounts
        SET currency = v_currency
        WHERE id = personal_cash_account_id;

        cash_currency := v_currency;
        cash_currency_sync_status := 'synchronized_pristine';
      ELSE
        cash_currency_sync_status := 'skipped_non_pristine';
      END IF;
    END IF;
  END IF;

  SELECT fa.id,
         UPPER(BTRIM(COALESCE(fa.currency, ''))) AS currency,
         COALESCE(fa.opening_balance, 0) AS opening_balance
  INTO v_bank_candidate
  FROM public.financial_accounts AS fa
  WHERE fa.user_id = v_user_id
    AND COALESCE(fa.is_active, TRUE) = TRUE
    AND fa.account_type = 'bank'
    AND COALESCE(fa.ownership_type, 'personal') = 'personal'
    AND COALESCE(fa.is_system_default, FALSE) = TRUE
    AND fa.system_default_type = 'personal_bank'
  ORDER BY fa.created_at ASC, fa.id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_bank_candidate.id IS NULL THEN
    INSERT INTO public.financial_accounts (
      user_id,
      name,
      account_type,
      currency,
      opening_balance,
      current_balance,
      color,
      icon,
      notes,
      is_active,
      include_in_total,
      sort_order,
      ownership_type,
      is_system_default,
      system_default_type
    )
    VALUES (
      v_user_id,
      'Bank',
      'bank',
      v_currency,
      0,
      0,
      '#0f3460',
      'Building2',
      NULL,
      TRUE,
      TRUE,
      0,
      'personal',
      TRUE,
      'personal_bank'
    )
    RETURNING id INTO personal_bank_account_id;

    created_bank := TRUE;
    bank_currency := v_currency;
    bank_currency_sync_status := 'created';
  ELSE
    personal_bank_account_id := v_bank_candidate.id;
    created_bank := FALSE;

    UPDATE public.financial_accounts
    SET is_system_default = FALSE,
        system_default_type = NULL
    WHERE user_id = v_user_id
      AND system_default_type = 'personal_bank'
      AND id <> personal_bank_account_id;

    UPDATE public.financial_accounts
    SET ownership_type = 'personal',
        is_system_default = TRUE,
        system_default_type = 'personal_bank',
        is_active = TRUE
    WHERE id = personal_bank_account_id;

    bank_currency := COALESCE(NULLIF(v_bank_candidate.currency, ''), v_currency);

    IF bank_currency = v_currency THEN
      bank_currency_sync_status := 'already_matching';
    ELSE
      SELECT public.rpc_recalculate_financial_account_balance(personal_bank_account_id)
      INTO v_bank_trusted_current_balance;

      SELECT COUNT(*)
      INTO v_bank_total_transactions
      FROM public.transactions
      WHERE account_id = personal_bank_account_id;

      SELECT COUNT(*)
      INTO v_bank_total_transfers
      FROM public.transfers
      WHERE from_account_id = personal_bank_account_id
         OR to_account_id = personal_bank_account_id;

      SELECT COUNT(*)
      INTO v_bank_total_subscriptions
      FROM public.personal_subscriptions
      WHERE financial_account_id = personal_bank_account_id;

      SELECT COUNT(*)
      INTO v_bank_total_recurring
      FROM public.recurring_transactions
      WHERE account_id = personal_bank_account_id;

      IF COALESCE(v_bank_candidate.opening_balance, 0) = 0
         AND COALESCE(v_bank_trusted_current_balance, 0) = 0
         AND v_bank_total_transactions = 0
         AND v_bank_total_transfers = 0
         AND v_bank_total_subscriptions = 0
         AND v_bank_total_recurring = 0 THEN
        UPDATE public.financial_accounts
        SET currency = v_currency
        WHERE id = personal_bank_account_id;

        bank_currency := v_currency;
        bank_currency_sync_status := 'synchronized_pristine';
      ELSE
        bank_currency_sync_status := 'skipped_non_pristine';
      END IF;
    END IF;
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ensure_default_personal_accounts(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ensure_default_personal_accounts(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_ensure_default_personal_accounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ensure_default_personal_accounts(UUID) TO service_role;
