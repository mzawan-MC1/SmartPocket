-- ============================================================
-- Personal default Cash/Bank accounts and bank-detail metadata
-- Migration: 20260624100000_personal_default_accounts.sql
-- ============================================================

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS ownership_type TEXT,
  ADD COLUMN IF NOT EXISTS system_default_type TEXT,
  ADD COLUMN IF NOT EXISTS is_system_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS account_holder_name TEXT,
  ADD COLUMN IF NOT EXISTS account_number_masked TEXT,
  ADD COLUMN IF NOT EXISTS iban TEXT,
  ADD COLUMN IF NOT EXISTS swift_bic TEXT,
  ADD COLUMN IF NOT EXISTS branch_name TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_type TEXT;

ALTER TABLE public.financial_accounts
  ALTER COLUMN ownership_type SET DEFAULT 'personal',
  ALTER COLUMN is_system_default SET DEFAULT FALSE;

UPDATE public.financial_accounts
SET ownership_type = 'personal'
WHERE ownership_type IS NULL;

UPDATE public.financial_accounts
SET system_default_type = NULL
WHERE COALESCE(is_system_default, FALSE) = FALSE
  AND system_default_type IS NOT NULL;

UPDATE public.financial_accounts
SET is_system_default = FALSE,
    system_default_type = NULL
WHERE (
    COALESCE(is_system_default, FALSE) = TRUE
    AND system_default_type IS NULL
  )
  OR (
    system_default_type = 'personal_cash'
    AND (
      COALESCE(is_system_default, FALSE) = FALSE
      OR account_type <> 'cash'
      OR COALESCE(ownership_type, 'personal') <> 'personal'
      OR COALESCE(is_active, TRUE) = FALSE
    )
  )
  OR (
    system_default_type = 'personal_bank'
    AND (
      COALESCE(is_system_default, FALSE) = FALSE
      OR account_type <> 'bank'
      OR COALESCE(ownership_type, 'personal') <> 'personal'
      OR COALESCE(is_active, TRUE) = FALSE
    )
  );

WITH ranked_defaults AS (
  SELECT
    fa.id,
    ROW_NUMBER() OVER (
      PARTITION BY fa.user_id, fa.system_default_type
      ORDER BY fa.created_at ASC, fa.id ASC
    ) AS row_num
  FROM public.financial_accounts AS fa
  WHERE fa.is_system_default = TRUE
    AND fa.system_default_type IN ('personal_cash', 'personal_bank')
)
UPDATE public.financial_accounts AS fa
SET is_system_default = FALSE,
    system_default_type = NULL
FROM ranked_defaults AS rd
WHERE fa.id = rd.id
  AND rd.row_num > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_ownership_type_check'
      AND conrelid = 'public.financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_ownership_type_check
      CHECK (ownership_type IN ('personal', 'shared', 'business', 'other'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_system_default_type_check'
      AND conrelid = 'public.financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_system_default_type_check
      CHECK (
        system_default_type IS NULL
        OR system_default_type IN ('personal_cash', 'personal_bank')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_bank_account_type_check'
      AND conrelid = 'public.financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_bank_account_type_check
      CHECK (
        bank_account_type IS NULL
        OR bank_account_type IN ('current', 'savings', 'credit_card', 'wallet', 'other')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_default_consistency_check'
      AND conrelid = 'public.financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_default_consistency_check
      CHECK (
        (
          COALESCE(is_system_default, FALSE) = FALSE
          AND system_default_type IS NULL
        )
        OR (
          system_default_type = 'personal_cash'
          AND COALESCE(is_system_default, FALSE) = TRUE
          AND account_type = 'cash'
          AND ownership_type = 'personal'
          AND COALESCE(is_active, TRUE) = TRUE
        )
        OR (
          system_default_type = 'personal_bank'
          AND COALESCE(is_system_default, FALSE) = TRUE
          AND account_type = 'bank'
          AND ownership_type = 'personal'
          AND COALESCE(is_active, TRUE) = TRUE
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS financial_accounts_user_default_cash_idx
  ON public.financial_accounts (user_id)
  WHERE is_system_default = TRUE
    AND system_default_type = 'personal_cash';

CREATE UNIQUE INDEX IF NOT EXISTS financial_accounts_user_default_bank_idx
  ON public.financial_accounts (user_id)
  WHERE is_system_default = TRUE
    AND system_default_type = 'personal_bank';

CREATE OR REPLACE FUNCTION public.trg_financial_accounts_default_field_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('smartpocket.allow_default_account_mutation', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.is_system_default, FALSE) = TRUE
       OR NEW.system_default_type IS NOT NULL THEN
      RAISE EXCEPTION 'System default fields are server-controlled';
    END IF;

    RETURN NEW;
  END IF;

  IF NEW.is_system_default IS DISTINCT FROM OLD.is_system_default
     OR NEW.system_default_type IS DISTINCT FROM OLD.system_default_type THEN
    RAISE EXCEPTION 'System default fields are server-controlled';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_accounts_default_field_guard ON public.financial_accounts;
CREATE TRIGGER financial_accounts_default_field_guard
  BEFORE INSERT OR UPDATE ON public.financial_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_financial_accounts_default_field_guard();

CREATE OR REPLACE FUNCTION public.trg_financial_accounts_default_delete_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Future trusted cleanup flows must set this transaction-local flag
  -- before deleting a user_profile / auth.users row that cascades into
  -- public.financial_accounts deletes.
  IF current_setting('smartpocket.allow_default_account_delete', true) = '1' THEN
    RETURN OLD;
  END IF;

  IF COALESCE(OLD.is_system_default, FALSE) = TRUE
     OR OLD.system_default_type IS NOT NULL THEN
    RAISE EXCEPTION 'Assign another default account before deleting this system default';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS financial_accounts_default_delete_guard ON public.financial_accounts;
CREATE TRIGGER financial_accounts_default_delete_guard
  BEFORE DELETE ON public.financial_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_financial_accounts_default_delete_guard();

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
    'AED'
  )))
  INTO v_currency
  FROM public.user_profiles AS up
  LEFT JOIN public.platform_settings AS ps ON TRUE
  WHERE up.id = v_user_id;

  v_currency := COALESCE(NULLIF(v_currency, ''), 'AED');

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

CREATE OR REPLACE FUNCTION public.rpc_set_default_financial_account(
  p_account_id UUID,
  p_default_type TEXT
)
RETURNS TABLE (
  previous_account_id UUID,
  current_account_id UUID,
  assigned_default_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_default_type NOT IN ('personal_cash', 'personal_bank') THEN
    RAISE EXCEPTION 'Unsupported default type';
  END IF;

  SELECT
    fa.id,
    fa.user_id,
    fa.account_type,
    fa.is_active,
    fa.include_in_total,
    COALESCE(fa.ownership_type, 'personal') AS resolved_ownership_type
  INTO v_account
  FROM public.financial_accounts AS fa
  WHERE fa.id = p_account_id
    AND fa.user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected account was not found';
  END IF;

  IF COALESCE(v_account.is_active, TRUE) = FALSE THEN
    RAISE EXCEPTION 'Default account must be active';
  END IF;

  IF v_account.resolved_ownership_type <> 'personal' THEN
    RAISE EXCEPTION 'Only personal accounts can be set as a system default';
  END IF;

  IF p_default_type = 'personal_cash' AND v_account.account_type <> 'cash' THEN
    RAISE EXCEPTION 'Default Cash must use a cash account';
  END IF;

  IF p_default_type = 'personal_bank' AND v_account.account_type <> 'bank' THEN
    RAISE EXCEPTION 'Default Bank must use a bank account';
  END IF;

  PERFORM set_config('smartpocket.allow_default_account_mutation', '1', true);

  PERFORM pg_advisory_xact_lock(
    hashtextextended(format('set-default-financial-account:%s:%s', v_user_id::TEXT, p_default_type), 0)
  );

  SELECT fa.id
  INTO previous_account_id
  FROM public.financial_accounts AS fa
  WHERE fa.user_id = v_user_id
    AND fa.is_system_default = TRUE
    AND fa.system_default_type = p_default_type
    AND fa.id <> p_account_id
  ORDER BY fa.created_at ASC, fa.id ASC
  LIMIT 1
  FOR UPDATE;

  UPDATE public.financial_accounts
  SET is_system_default = FALSE,
      system_default_type = NULL
  WHERE user_id = v_user_id
    AND system_default_type = p_default_type
    AND id <> p_account_id;

  UPDATE public.financial_accounts
  SET ownership_type = 'personal',
      is_system_default = TRUE,
      system_default_type = p_default_type,
      is_active = TRUE
  WHERE id = p_account_id
    AND user_id = v_user_id;

  current_account_id := p_account_id;
  assigned_default_type := p_default_type;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_archive_financial_account(
  p_account_id UUID
)
RETURNS TABLE (
  archived_account_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, user_id, is_system_default, system_default_type
  INTO v_account
  FROM public.financial_accounts
  WHERE id = p_account_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected account was not found';
  END IF;

  IF COALESCE(v_account.is_system_default, FALSE) = TRUE
     AND v_account.system_default_type IS NOT NULL THEN
    RAISE EXCEPTION 'Assign another default account before archiving this system default';
  END IF;

  UPDATE public.financial_accounts
  SET is_active = FALSE
  WHERE id = p_account_id
    AND user_id = v_user_id;

  archived_account_id := p_account_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ensure_default_personal_accounts(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ensure_default_personal_accounts(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_ensure_default_personal_accounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ensure_default_personal_accounts(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_set_default_financial_account(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_set_default_financial_account(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_default_financial_account(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_archive_financial_account(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_archive_financial_account(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_archive_financial_account(UUID) TO authenticated;

REVOKE INSERT (is_system_default, system_default_type) ON TABLE public.financial_accounts FROM authenticated;
REVOKE UPDATE (is_system_default, system_default_type) ON TABLE public.financial_accounts FROM authenticated;

DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN
    SELECT id
    FROM public.user_profiles
  LOOP
    PERFORM *
    FROM public.rpc_ensure_default_personal_accounts(v_user.id);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
