-- ============================================================
-- Smart Pocket — Safe Account Currency Change
-- Migration: 20260701183000_account_currency_change_safety.sql
-- ============================================================
-- Safe additive migration only.
-- - Adds logical account versioning metadata
-- - Adds dedicated account currency change audit history
-- - Adds trusted RPC for atomic correction / conversion
-- - Preserves existing finance records and RLS rules
-- ============================================================

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS logical_account_id UUID,
  ADD COLUMN IF NOT EXISTS previous_account_id UUID,
  ADD COLUMN IF NOT EXISTS replaced_by_account_id UUID,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

UPDATE public.financial_accounts
SET logical_account_id = id
WHERE logical_account_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_logical_account_fk'
      AND conrelid = 'public.financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_logical_account_fk
      FOREIGN KEY (logical_account_id)
      REFERENCES public.financial_accounts(id)
      ON DELETE NO ACTION
      DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_previous_account_fk'
      AND conrelid = 'public.financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_previous_account_fk
      FOREIGN KEY (previous_account_id)
      REFERENCES public.financial_accounts(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_replaced_by_account_fk'
      AND conrelid = 'public.financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_replaced_by_account_fk
      FOREIGN KEY (replaced_by_account_id)
      REFERENCES public.financial_accounts(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_archive_reason_check'
      AND conrelid = 'public.financial_accounts'::regclass
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_archive_reason_check
      CHECK (
        archive_reason IS NULL
        OR archive_reason IN ('manual_archive', 'currency_conversion')
      );
  END IF;
END $$;

ALTER TABLE public.financial_accounts
  ALTER COLUMN logical_account_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS financial_accounts_logical_account_idx
  ON public.financial_accounts (logical_account_id, created_at);

CREATE INDEX IF NOT EXISTS financial_accounts_previous_account_idx
  ON public.financial_accounts (previous_account_id);

CREATE INDEX IF NOT EXISTS financial_accounts_replaced_by_account_idx
  ON public.financial_accounts (replaced_by_account_id);

CREATE INDEX IF NOT EXISTS financial_accounts_archived_at_idx
  ON public.financial_accounts (archived_at DESC);

CREATE OR REPLACE FUNCTION public.trg_financial_accounts_assign_logical_account_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  IF NEW.logical_account_id IS NULL THEN
    NEW.logical_account_id := NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS financial_accounts_assign_logical_account_id ON public.financial_accounts;
CREATE TRIGGER financial_accounts_assign_logical_account_id
  BEFORE INSERT ON public.financial_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_financial_accounts_assign_logical_account_id();

CREATE TABLE IF NOT EXISTS public.account_currency_change_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  logical_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  old_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  new_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  previous_currency TEXT NOT NULL,
  new_currency TEXT NOT NULL,
  previous_balance NUMERIC(18,4) NOT NULL,
  resulting_balance NUMERIC(18,4) NOT NULL,
  exchange_rate NUMERIC(24,12),
  rate_provider TEXT,
  rate_timestamp TIMESTAMPTZ,
  exchange_rate_snapshot_id UUID REFERENCES public.exchange_rate_snapshots(id) ON DELETE SET NULL,
  rounding_adjustment NUMERIC(24,12),
  numeric_values_changed BOOLEAN NOT NULL DEFAULT FALSE,
  affected_record_count INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  failure_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_currency_change_audits_action_type_check'
      AND conrelid = 'public.account_currency_change_audits'::regclass
  ) THEN
    ALTER TABLE public.account_currency_change_audits
      ADD CONSTRAINT account_currency_change_audits_action_type_check
      CHECK (action_type IN ('currency_correction', 'currency_conversion'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_currency_change_audits_status_check'
      AND conrelid = 'public.account_currency_change_audits'::regclass
  ) THEN
    ALTER TABLE public.account_currency_change_audits
      ADD CONSTRAINT account_currency_change_audits_status_check
      CHECK (status IN ('completed', 'blocked', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'account_currency_change_audits_currency_code_check'
      AND conrelid = 'public.account_currency_change_audits'::regclass
  ) THEN
    ALTER TABLE public.account_currency_change_audits
      ADD CONSTRAINT account_currency_change_audits_currency_code_check
      CHECK (
        previous_currency ~ '^[A-Z]{3}$'
        AND new_currency ~ '^[A-Z]{3}$'
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS account_currency_change_audits_user_created_idx
  ON public.account_currency_change_audits (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_currency_change_audits_logical_account_idx
  ON public.account_currency_change_audits (logical_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_currency_change_audits_account_idx
  ON public.account_currency_change_audits (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_currency_change_audits_old_new_idx
  ON public.account_currency_change_audits (old_account_id, new_account_id, created_at DESC);

ALTER TABLE public.account_currency_change_audits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_account_currency_change_audits" ON public.account_currency_change_audits;
CREATE POLICY "users_select_own_account_currency_change_audits"
ON public.account_currency_change_audits
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_insert_own_account_currency_change_audits" ON public.account_currency_change_audits;
REVOKE INSERT ON TABLE public.account_currency_change_audits FROM authenticated;
GRANT SELECT ON TABLE public.account_currency_change_audits TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_change_financial_account_currency(
  p_actor_user_id UUID,
  p_account_id UUID,
  p_action_type TEXT,
  p_target_currency TEXT,
  p_reason TEXT DEFAULT NULL,
  p_confirmation_checked BOOLEAN DEFAULT FALSE,
  p_exchange_rate_snapshot_id UUID DEFAULT NULL,
  p_expected_source_balance NUMERIC DEFAULT NULL,
  p_expected_converted_amount NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  logical_account_id UUID,
  old_account_id UUID,
  new_account_id UUID,
  action_type TEXT,
  previous_currency TEXT,
  new_currency TEXT,
  previous_balance NUMERIC,
  resulting_balance NUMERIC,
  affected_record_count INTEGER,
  direct_update BOOLEAN,
  audit_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id UUID := auth.uid();
  v_user_id UUID := COALESCE(p_actor_user_id, v_auth_user_id);
  v_account public.financial_accounts%ROWTYPE;
  v_target_currency TEXT := UPPER(BTRIM(COALESCE(p_target_currency, '')));
  v_minor_units INTEGER;
  v_snapshot public.exchange_rate_snapshots%ROWTYPE;
  v_rate_used NUMERIC(24,12);
  v_converted_balance_raw NUMERIC(24,12);
  v_converted_balance NUMERIC(24,12);
  v_rounding_adjustment NUMERIC(24,12) := 0;
  v_requires_replacement BOOLEAN := TRUE;
  v_is_empty_account BOOLEAN := FALSE;
  v_total_transactions INTEGER := 0;
  v_total_transfers INTEGER := 0;
  v_total_subscriptions INTEGER := 0;
  v_total_recurring INTEGER := 0;
  v_total_reimbursements INTEGER := 0;
  v_total_settlements INTEGER := 0;
  v_total_reimbursement_payments INTEGER := 0;
  v_total_space_contributions INTEGER := 0;
  v_total_shared_transactions INTEGER := 0;
  v_total_shared_recurring INTEGER := 0;
  v_mismatch_transactions INTEGER := 0;
  v_cross_currency_transfers INTEGER := 0;
  v_active_recurring_count INTEGER := 0;
  v_active_subscription_count INTEGER := 0;
  v_correction_safe_transactions INTEGER := 0;
  v_affected_transactions INTEGER := 0;
  v_affected_account_rows INTEGER := 0;
  v_affected_total INTEGER := 0;
  v_new_account_id UUID := NULL;
  v_old_default_type TEXT := NULL;
  v_old_is_system_default BOOLEAN := FALSE;
  v_old_account_id UUID := p_account_id;
  v_logical_account_id UUID := NULL;
  v_audit_id UUID := NULL;
  v_trusted_current_balance NUMERIC(24,12) := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_auth_user_id IS NOT NULL
     AND p_actor_user_id IS NOT NULL
     AND v_auth_user_id <> p_actor_user_id THEN
    RAISE EXCEPTION 'Actor mismatch';
  END IF;

  IF p_action_type NOT IN ('currency_correction', 'currency_conversion') THEN
    RAISE EXCEPTION 'Unsupported currency change action';
  END IF;

  IF v_target_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Target currency must be a valid three-letter currency code';
  END IF;

  SELECT *
  INTO v_account
  FROM public.financial_accounts
  WHERE id = p_account_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected account was not found';
  END IF;

  IF COALESCE(v_account.is_active, FALSE) = FALSE THEN
    RAISE EXCEPTION 'Archived accounts cannot change currency';
  END IF;

  IF UPPER(COALESCE(v_account.currency, '')) = v_target_currency THEN
    RAISE EXCEPTION 'Choose a different currency';
  END IF;

  SELECT minor_units
  INTO v_minor_units
  FROM public.currency_registry
  WHERE code = v_target_currency
    AND is_active = TRUE
  LIMIT 1;

  IF v_minor_units IS NULL THEN
    RAISE EXCEPTION 'The selected currency is unavailable';
  END IF;

  v_logical_account_id := COALESCE(v_account.logical_account_id, v_account.id);
  v_old_default_type := v_account.system_default_type;
  v_old_is_system_default := COALESCE(v_account.is_system_default, FALSE);
  v_trusted_current_balance := public.rpc_recalculate_financial_account_balance(v_account.id);
  v_account.current_balance := v_trusted_current_balance;

  SELECT COUNT(*)
  INTO v_total_transactions
  FROM public.transactions
  WHERE account_id = v_account.id;

  SELECT COUNT(*)
  INTO v_total_transfers
  FROM public.transfers
  WHERE from_account_id = v_account.id
     OR to_account_id = v_account.id;

  SELECT COUNT(*)
  INTO v_total_subscriptions
  FROM public.personal_subscriptions
  WHERE financial_account_id = v_account.id;

  SELECT COUNT(*)
  INTO v_total_recurring
  FROM public.recurring_transactions
  WHERE account_id = v_account.id;

  SELECT COUNT(*)
  INTO v_total_shared_transactions
  FROM public.transactions
  WHERE account_id = v_account.id
    AND (
      transaction_context = 'space'
      OR space_id IS NOT NULL
    );

  SELECT COUNT(*)
  INTO v_total_shared_recurring
  FROM public.recurring_transactions
  WHERE account_id = v_account.id
    AND space_id IS NOT NULL;

  SELECT COUNT(*)
  INTO v_total_reimbursements
  FROM public.reimbursements
  WHERE transaction_id IN (
    SELECT id
    FROM public.transactions
    WHERE account_id = v_account.id
  )
    AND is_deleted = FALSE;

  SELECT COUNT(*)
  INTO v_total_reimbursement_payments
  FROM public.reimbursement_payments
  WHERE reimbursement_id IN (
    SELECT r.id
    FROM public.reimbursements AS r
    WHERE r.transaction_id IN (
      SELECT id
      FROM public.transactions
      WHERE account_id = v_account.id
    )
      AND r.is_deleted = FALSE
  );

  SELECT COUNT(*)
  INTO v_total_settlements
  FROM public.settlements
  WHERE receiving_account_id = v_account.id
    AND is_deleted = FALSE;

  SELECT COUNT(*)
  INTO v_total_space_contributions
  FROM public.space_contributions
  WHERE destination_account_id = v_account.id;

  v_is_empty_account :=
    COALESCE(v_account.current_balance, 0) = 0
    AND v_total_transactions = 0
    AND v_total_transfers = 0
    AND v_total_subscriptions = 0
    AND v_total_recurring = 0
    AND v_total_reimbursements = 0
    AND v_total_reimbursement_payments = 0
    AND v_total_settlements = 0
    AND v_total_space_contributions = 0
    AND v_total_shared_transactions = 0
    AND v_total_shared_recurring = 0;

  IF p_action_type = 'currency_conversion' THEN
    SELECT COUNT(*)
    INTO v_active_recurring_count
    FROM public.recurring_transactions
    WHERE account_id = v_account.id
      AND is_active = TRUE;

    SELECT COUNT(*)
    INTO v_active_subscription_count
    FROM public.personal_subscriptions
    WHERE financial_account_id = v_account.id
      AND status NOT IN ('cancelled', 'expired');

    IF v_active_recurring_count > 0 THEN
      RAISE EXCEPTION 'Reassign active recurring items before converting this account';
    END IF;

    IF v_active_subscription_count > 0 THEN
      RAISE EXCEPTION 'Reassign active subscriptions before converting this account';
    END IF;
  END IF;

  IF p_action_type = 'currency_correction' THEN
    IF p_confirmation_checked IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Confirm that the existing amounts were entered in the new currency';
    END IF;

    SELECT COUNT(*)
    INTO v_mismatch_transactions
    FROM public.transactions
    WHERE account_id = v_account.id
      AND UPPER(COALESCE(currency, '')) <> UPPER(v_account.currency);

    SELECT COUNT(*)
    INTO v_cross_currency_transfers
    FROM public.transfers
    WHERE from_account_id = v_account.id
       OR to_account_id = v_account.id;

    SELECT COUNT(*)
    INTO v_correction_safe_transactions
    FROM public.transactions
    WHERE account_id = v_account.id
      AND UPPER(COALESCE(currency, '')) = UPPER(v_account.currency)
      AND COALESCE(transaction_context, 'personal') <> 'space'
      AND space_id IS NULL;

    IF (
      COALESCE(v_account.scope_type, 'personal') = 'space'
      OR v_account.space_id IS NOT NULL
      OR v_total_shared_transactions > 0
      OR v_total_transfers > 0
      OR v_total_subscriptions > 0
      OR v_total_recurring > 0
      OR v_total_reimbursements > 0
      OR v_total_reimbursement_payments > 0
      OR v_total_settlements > 0
      OR v_total_space_contributions > 0
      OR v_mismatch_transactions > 0
      OR v_cross_currency_transfers > 0
    ) THEN
      RAISE EXCEPTION 'This account has linked records that may use their own currencies. Review those items individually before correcting the whole account currency.';
    END IF;

    UPDATE public.transactions
    SET currency = v_target_currency
    WHERE account_id = v_account.id
      AND UPPER(COALESCE(currency, '')) = UPPER(v_account.currency)
      AND COALESCE(transaction_context, 'personal') <> 'space'
      AND space_id IS NULL;
    GET DIAGNOSTICS v_affected_transactions = ROW_COUNT;

    UPDATE public.financial_accounts
    SET currency = v_target_currency
    WHERE id = v_account.id;
    GET DIAGNOSTICS v_affected_account_rows = ROW_COUNT;

    v_affected_total :=
      v_affected_transactions
      + v_affected_account_rows;

    INSERT INTO public.account_currency_change_audits (
      user_id,
      logical_account_id,
      account_id,
      old_account_id,
      new_account_id,
      action_type,
      previous_currency,
      new_currency,
      previous_balance,
      resulting_balance,
      exchange_rate,
      rate_provider,
      rate_timestamp,
      exchange_rate_snapshot_id,
      rounding_adjustment,
      numeric_values_changed,
      affected_record_count,
      reason,
      status,
      metadata,
      confirmed_at
    )
    VALUES (
      v_user_id,
      v_logical_account_id,
      v_account.id,
      v_account.id,
      NULL,
      'currency_correction',
      UPPER(v_account.currency),
      v_target_currency,
      COALESCE(v_account.current_balance, 0),
      COALESCE(v_account.current_balance, 0),
      NULL,
      NULL,
      NULL,
      NULL,
      0,
      FALSE,
      v_affected_total,
      NULLIF(BTRIM(COALESCE(p_reason, '')), ''),
      'completed',
      jsonb_build_object(
        'opening_balance', COALESCE(v_account.opening_balance, 0),
        'blocked_conflict_types', jsonb_build_array(),
        'affected_breakdown', jsonb_build_object(
          'transactions', v_affected_transactions,
          'account', v_affected_account_rows
        )
      ),
      CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_audit_id;

    logical_account_id := v_logical_account_id;
    old_account_id := v_old_account_id;
    new_account_id := NULL;
    action_type := 'currency_correction';
    previous_currency := UPPER(v_account.currency);
    new_currency := v_target_currency;
    previous_balance := COALESCE(v_account.current_balance, 0);
    resulting_balance := COALESCE(v_account.current_balance, 0);
    affected_record_count := v_affected_total;
    direct_update := TRUE;
    audit_id := v_audit_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_is_empty_account THEN
    UPDATE public.financial_accounts
    SET currency = v_target_currency
    WHERE id = v_account.id;

    GET DIAGNOSTICS v_affected_account_rows = ROW_COUNT;

    INSERT INTO public.account_currency_change_audits (
      user_id,
      logical_account_id,
      account_id,
      old_account_id,
      new_account_id,
      action_type,
      previous_currency,
      new_currency,
      previous_balance,
      resulting_balance,
      exchange_rate,
      rate_provider,
      rate_timestamp,
      exchange_rate_snapshot_id,
      rounding_adjustment,
      numeric_values_changed,
      affected_record_count,
      reason,
      status,
      metadata,
      confirmed_at
    )
    VALUES (
      v_user_id,
      v_logical_account_id,
      v_account.id,
      v_account.id,
      NULL,
      'currency_conversion',
      UPPER(v_account.currency),
      v_target_currency,
      COALESCE(v_account.current_balance, 0),
      COALESCE(v_account.current_balance, 0),
      NULL,
      NULL,
      NULL,
      NULL,
      0,
      FALSE,
      v_affected_account_rows,
      NULLIF(BTRIM(COALESCE(p_reason, '')), ''),
      'completed',
      jsonb_build_object(
        'direct_update', TRUE,
        'opening_balance', COALESCE(v_account.opening_balance, 0),
        'blocked_conflict_types', jsonb_build_array()
      ),
      CURRENT_TIMESTAMP
    )
    RETURNING id INTO v_audit_id;

    logical_account_id := v_logical_account_id;
    old_account_id := v_old_account_id;
    new_account_id := NULL;
    action_type := 'currency_conversion';
    previous_currency := UPPER(v_account.currency);
    new_currency := v_target_currency;
    previous_balance := COALESCE(v_account.current_balance, 0);
    resulting_balance := COALESCE(v_account.current_balance, 0);
    affected_record_count := v_affected_account_rows;
    direct_update := TRUE;
    audit_id := v_audit_id;
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_exchange_rate_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'A rate snapshot is required to convert this account';
  END IF;

  SELECT *
  INTO v_snapshot
  FROM public.exchange_rate_snapshots
  WHERE id = p_exchange_rate_snapshot_id
    AND status = 'success';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The selected exchange-rate snapshot is unavailable';
  END IF;

  IF UPPER(COALESCE(v_snapshot.base_currency, '')) = UPPER(v_account.currency) THEN
    v_rate_used := (v_snapshot.rates ->> v_target_currency)::NUMERIC;
  ELSIF UPPER(COALESCE(v_snapshot.base_currency, '')) = v_target_currency THEN
    v_rate_used := 1 / NULLIF((v_snapshot.rates ->> UPPER(v_account.currency))::NUMERIC, 0);
  ELSE
    v_rate_used :=
      NULLIF((v_snapshot.rates ->> v_target_currency)::NUMERIC, 0)
      / NULLIF((v_snapshot.rates ->> UPPER(v_account.currency))::NUMERIC, 0);
  END IF;

  IF v_rate_used IS NULL OR NOT (v_rate_used > 0) THEN
    RAISE EXCEPTION 'Exchange rate is unavailable for this currency pair';
  END IF;

  v_converted_balance_raw := COALESCE(v_account.current_balance, 0) * v_rate_used;
  v_converted_balance := ROUND(v_converted_balance_raw, v_minor_units);
  v_rounding_adjustment := v_converted_balance - v_converted_balance_raw;
  v_requires_replacement := TRUE;

  IF p_expected_source_balance IS NULL OR p_expected_converted_amount IS NULL THEN
    RAISE EXCEPTION 'Review the latest conversion preview before confirming this account conversion';
  END IF;

  IF ABS(COALESCE(v_account.current_balance, 0) - p_expected_source_balance) > 0.000001 THEN
    RAISE EXCEPTION 'The account balance changed after the preview. Review the updated conversion before confirming again.';
  END IF;

  IF ABS(v_converted_balance - p_expected_converted_amount) > 0.000001 THEN
    RAISE EXCEPTION 'The account balance changed after the preview. Review the updated conversion before confirming again.';
  END IF;

  PERFORM set_config('smartpocket.allow_default_account_mutation', '1', true);

  IF v_old_is_system_default AND v_old_default_type IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(
      hashtextextended(format('set-default-financial-account:%s:%s', v_user_id::TEXT, v_old_default_type), 0)
    );

    UPDATE public.financial_accounts
    SET is_system_default = FALSE,
        system_default_type = NULL
    WHERE id = v_account.id;
  END IF;

  INSERT INTO public.financial_accounts (
    user_id,
    created_by_user_id,
    name,
    account_type,
    ownership_type,
    scope_type,
    space_id,
    system_default_type,
    is_system_default,
    currency,
    opening_balance,
    current_balance,
    color,
    icon,
    notes,
    bank_name,
    account_holder_name,
    account_number_masked,
    iban,
    swift_bic,
    branch_name,
    bank_account_type,
    is_active,
    include_in_total,
    sort_order,
    logical_account_id,
    previous_account_id,
    replaced_by_account_id,
    archived_at,
    archive_reason
  )
  VALUES (
    v_account.user_id,
    COALESCE(v_account.created_by_user_id, v_user_id),
    v_account.name,
    v_account.account_type,
    v_account.ownership_type,
    v_account.scope_type,
    v_account.space_id,
    NULL,
    FALSE,
    v_target_currency,
    v_converted_balance,
    v_converted_balance,
    v_account.color,
    v_account.icon,
    v_account.notes,
    v_account.bank_name,
    v_account.account_holder_name,
    v_account.account_number_masked,
    v_account.iban,
    v_account.swift_bic,
    v_account.branch_name,
    v_account.bank_account_type,
    TRUE,
    v_account.include_in_total,
    v_account.sort_order,
    v_logical_account_id,
    v_account.id,
    NULL,
    NULL,
    NULL
  )
  RETURNING id INTO v_new_account_id;

  IF v_old_is_system_default AND v_old_default_type IS NOT NULL THEN
    UPDATE public.financial_accounts
    SET is_system_default = TRUE,
        system_default_type = v_old_default_type
    WHERE id = v_new_account_id;
  END IF;

  IF COALESCE(v_account.scope_type, 'personal') = 'personal' THEN
    INSERT INTO public.space_account_permissions (
      account_id,
      space_id,
      granted_by_user_id,
      can_view_space_transactions,
      can_add_space_transactions,
      can_view_balance,
      can_view_full_history
    )
    SELECT
      v_new_account_id,
      sap.space_id,
      COALESCE(v_account.created_by_user_id, v_user_id),
      sap.can_view_space_transactions,
      sap.can_add_space_transactions,
      sap.can_view_balance,
      sap.can_view_full_history
    FROM public.space_account_permissions AS sap
    WHERE sap.account_id = v_account.id
    ON CONFLICT (space_id, account_id) DO NOTHING;
  END IF;

  UPDATE public.financial_accounts
  SET is_active = FALSE,
      is_system_default = FALSE,
      system_default_type = NULL,
      replaced_by_account_id = v_new_account_id,
      archived_at = CURRENT_TIMESTAMP,
      archive_reason = 'currency_conversion'
  WHERE id = v_account.id;

  INSERT INTO public.account_currency_change_audits (
    user_id,
    logical_account_id,
    account_id,
    old_account_id,
    new_account_id,
    action_type,
    previous_currency,
    new_currency,
    previous_balance,
    resulting_balance,
    exchange_rate,
    rate_provider,
    rate_timestamp,
    exchange_rate_snapshot_id,
    rounding_adjustment,
    numeric_values_changed,
    affected_record_count,
    reason,
    status,
    metadata,
    confirmed_at
  )
  VALUES (
    v_user_id,
    v_logical_account_id,
    v_new_account_id,
    v_account.id,
    v_new_account_id,
    'currency_conversion',
    UPPER(v_account.currency),
    v_target_currency,
    COALESCE(v_account.current_balance, 0),
    v_converted_balance,
    v_rate_used,
    v_snapshot.provider,
    COALESCE(v_snapshot.provider_timestamp, v_snapshot.fetched_at),
    v_snapshot.id,
    v_rounding_adjustment,
    TRUE,
    2,
    NULLIF(BTRIM(COALESCE(p_reason, '')), ''),
    'completed',
    jsonb_build_object(
      'direct_update', FALSE,
      'opening_balance', COALESCE(v_account.opening_balance, 0),
      'new_opening_balance', v_converted_balance,
      'rate_date', v_snapshot.rate_date,
      'blocked_conflict_types', jsonb_build_array(),
      'default_reassigned', v_old_is_system_default
    ),
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO v_audit_id;

  logical_account_id := v_logical_account_id;
  old_account_id := v_old_account_id;
  new_account_id := v_new_account_id;
  action_type := 'currency_conversion';
  previous_currency := UPPER(v_account.currency);
  new_currency := v_target_currency;
  previous_balance := COALESCE(v_account.current_balance, 0);
  resulting_balance := v_converted_balance;
  affected_record_count := 2;
  direct_update := FALSE;
  audit_id := v_audit_id;
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
  SET is_active = FALSE,
      archived_at = CURRENT_TIMESTAMP,
      archive_reason = COALESCE(archive_reason, 'manual_archive')
  WHERE id = p_account_id
    AND user_id = v_user_id;

  archived_account_id := p_account_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_change_financial_account_currency(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_change_financial_account_currency(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID, NUMERIC, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_change_financial_account_currency(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID, NUMERIC, NUMERIC) FROM authenticated;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.rpc_change_financial_account_currency(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, UUID, NUMERIC, NUMERIC) TO service_role;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.rpc_archive_financial_account(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_archive_financial_account(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_archive_financial_account(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
