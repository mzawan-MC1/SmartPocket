-- Migration: Fix new-user currency defaults and default-account seeding
-- Timestamp: 20260629110000
--
-- Why this exists:
-- - Earlier schema/function defaults hardcoded AED at the database layer.
-- - New users could therefore receive AED in user_profiles.default_currency
--   before onboarding or settings saved their chosen currency.
-- - Default Cash/Bank accounts were then seeded from that stored profile
--   currency, causing incorrect AED default accounts for users who later chose
--   GBP or another currency.
--
-- Safety:
-- - This migration changes defaults for future writes only.
-- - It does NOT update existing user profiles or existing financial accounts.
-- - Default accounts must continue to resolve currency dynamically in this
--   order: user profile currency -> platform settings currency -> USD.

-- Remove the schema-level AED fallback for future user_profiles rows.
-- Table defaults cannot safely depend on platform_settings, so USD is the
-- final database-safe fallback.
ALTER TABLE public.user_profiles
  ALTER COLUMN default_currency SET DEFAULT 'USD';

-- New users should have an explicit default_currency at insert time rather
-- than inheriting a stale schema default. Prefer user metadata when supplied,
-- then platform settings, then USD.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata_currency TEXT;
  v_platform_currency TEXT;
  v_default_currency TEXT;
BEGIN
  v_metadata_currency := UPPER(BTRIM(COALESCE(NEW.raw_user_meta_data->>'default_currency', '')));
  IF v_metadata_currency !~ '^[A-Z]{3}$' THEN
    v_metadata_currency := NULL;
  END IF;

  SELECT UPPER(BTRIM(NULLIF(ps.default_currency, '')))
  INTO v_platform_currency
  FROM public.platform_settings AS ps
  LIMIT 1;

  IF COALESCE(v_platform_currency, '') !~ '^[A-Z]{3}$' THEN
    v_platform_currency := NULL;
  END IF;

  v_default_currency := COALESCE(v_metadata_currency, v_platform_currency, 'USD');

  INSERT INTO public.user_profiles (id, email, full_name, avatar_url, role, default_currency)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    'user',
    v_default_currency
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Default personal accounts must never fall back to AED. They should seed from
-- the stored user profile currency first, then platform settings, then USD.
-- This function intentionally does NOT rewrite currency on existing accounts;
-- historical/default records keep their stored currency unless changed
-- explicitly in a later approved data migration.
CREATE OR REPLACE FUNCTION public.rpc_ensure_default_personal_accounts(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  personal_cash_account_id UUID,
  personal_bank_account_id UUID,
  created_cash BOOLEAN,
  created_bank BOOLEAN
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

  SELECT fa.id
  INTO v_cash_candidate
  FROM public.financial_accounts AS fa
  WHERE fa.user_id = v_user_id
    AND COALESCE(fa.is_active, TRUE) = TRUE
    AND fa.account_type = 'cash'
    AND COALESCE(fa.ownership_type, 'personal') = 'personal'
  ORDER BY
    CASE
      WHEN fa.is_system_default = TRUE AND fa.system_default_type = 'personal_cash' THEN 0
      ELSE 1
    END,
    fa.created_at ASC,
    fa.id ASC
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
  END IF;

  SELECT fa.id
  INTO v_bank_candidate
  FROM public.financial_accounts AS fa
  WHERE fa.user_id = v_user_id
    AND COALESCE(fa.is_active, TRUE) = TRUE
    AND fa.account_type = 'bank'
    AND COALESCE(fa.ownership_type, 'personal') = 'personal'
  ORDER BY
    CASE
      WHEN fa.is_system_default = TRUE AND fa.system_default_type = 'personal_bank' THEN 0
      ELSE 1
    END,
    fa.created_at ASC,
    fa.id ASC
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
  END IF;

  RETURN NEXT;
END;
$$;
