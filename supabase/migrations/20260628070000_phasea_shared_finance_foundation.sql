BEGIN;

-- ============================================================
-- Smart Pocket Phase A - Shared Finance Foundation
-- Purpose:
--   1. Extend financial_accounts with scope metadata.
--   2. Add personal-account sharing permissions for Spaces.
--   3. Extend transactions with Space scope and normalized payer metadata.
--   4. Add normalized transaction allocations for split logic.
--   5. Replace account / transaction RLS with scope-aware policies.
--   6. Add trusted RPCs for Space transaction create/update/delete.
--   7. Add trusted RPC for resolving space members with profile data.
-- Safe:
--   - Additive only.
--   - No edits to previously applied migrations.
-- ============================================================

-- ============================================================
-- SECTION 1: ACCOUNT SCOPE + SHARING
-- ============================================================

ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope_type TEXT;

UPDATE public.financial_accounts
SET
  created_by_user_id = COALESCE(created_by_user_id, user_id),
  scope_type = COALESCE(scope_type, CASE WHEN space_id IS NULL THEN 'personal' ELSE 'space' END)
WHERE created_by_user_id IS NULL
   OR scope_type IS NULL;

ALTER TABLE public.financial_accounts
  ALTER COLUMN scope_type SET DEFAULT 'personal';

ALTER TABLE public.financial_accounts
  ALTER COLUMN scope_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_scope_type_check'
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_scope_type_check
      CHECK (scope_type IN ('personal', 'space'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'financial_accounts_scope_consistency_check'
  ) THEN
    ALTER TABLE public.financial_accounts
      ADD CONSTRAINT financial_accounts_scope_consistency_check
      CHECK (
        (scope_type = 'personal' AND space_id IS NULL)
        OR (scope_type = 'space' AND space_id IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.space_account_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  granted_by_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  can_view_space_transactions BOOLEAN NOT NULL DEFAULT true,
  can_add_space_transactions BOOLEAN NOT NULL DEFAULT false,
  can_view_balance BOOLEAN NOT NULL DEFAULT false,
  can_view_full_history BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (space_id, account_id)
);

ALTER TABLE public.space_account_permissions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at_space_account_permissions ON public.space_account_permissions;
CREATE TRIGGER set_updated_at_space_account_permissions
  BEFORE UPDATE ON public.space_account_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_space_account_permission_account_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_scope_type TEXT;
  v_account_space_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    fa.scope_type,
    fa.space_id
  INTO
    v_account_scope_type,
    v_account_space_id
  FROM public.financial_accounts AS fa
  WHERE fa.id = NEW.account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_account_scope_type IS DISTINCT FROM 'personal' OR v_account_space_id IS NOT NULL THEN
    RAISE EXCEPTION 'Space account permissions can target personal accounts only';
  END IF;

  IF NOT public.has_space_role(NEW.space_id, 'viewer') THEN
    RAISE EXCEPTION 'You can only share a personal account with a Space you belong to';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_space_account_permission_account_scope
  ON public.space_account_permissions;
CREATE TRIGGER enforce_space_account_permission_account_scope
  BEFORE INSERT OR UPDATE ON public.space_account_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_space_account_permission_account_scope();

-- ============================================================
-- SECTION 2: TRANSACTION SCOPE + ALLOCATIONS
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by_person_id UUID REFERENCES public.managed_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_context TEXT,
  ADD COLUMN IF NOT EXISTS split_method TEXT;

UPDATE public.transactions
SET
  created_by_user_id = COALESCE(created_by_user_id, user_id),
  transaction_context = COALESCE(transaction_context, CASE WHEN space_id IS NULL THEN 'personal' ELSE 'space' END),
  split_method = COALESCE(split_method, 'none')
WHERE created_by_user_id IS NULL
   OR transaction_context IS NULL
   OR split_method IS NULL;

ALTER TABLE public.transactions
  ALTER COLUMN transaction_context SET DEFAULT 'personal';

ALTER TABLE public.transactions
  ALTER COLUMN transaction_context SET NOT NULL;

ALTER TABLE public.transactions
  ALTER COLUMN split_method SET DEFAULT 'none';

ALTER TABLE public.transactions
  ALTER COLUMN split_method SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_transaction_context_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_transaction_context_check
      CHECK (transaction_context IN ('personal', 'space'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_split_method_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_split_method_check
      CHECK (split_method IN ('none', 'equal', 'exact', 'percentage', 'shares'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_scope_consistency_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_scope_consistency_check
      CHECK (
        (transaction_context = 'personal' AND space_id IS NULL)
        OR (transaction_context = 'space' AND space_id IS NOT NULL)
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_single_structured_payer_check'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_single_structured_payer_check
      CHECK (num_nonnulls(paid_by_user_id, paid_by_person_id) <= 1);
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.transaction_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  member_user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  managed_person_id UUID REFERENCES public.managed_people(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  percentage NUMERIC(9,4),
  shares NUMERIC(18,4),
  reimbursement_required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transaction_allocations ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at_transaction_allocations ON public.transaction_allocations;
CREATE TRIGGER set_updated_at_transaction_allocations
  BEFORE UPDATE ON public.transaction_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_allocations_single_participant_check'
  ) THEN
    ALTER TABLE public.transaction_allocations
      ADD CONSTRAINT transaction_allocations_single_participant_check
      CHECK (num_nonnulls(member_user_id, managed_person_id) = 1);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_allocations_amount_non_negative_check'
  ) THEN
    ALTER TABLE public.transaction_allocations
      ADD CONSTRAINT transaction_allocations_amount_non_negative_check
      CHECK (allocated_amount >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_allocations_percentage_non_negative_check'
  ) THEN
    ALTER TABLE public.transaction_allocations
      ADD CONSTRAINT transaction_allocations_percentage_non_negative_check
      CHECK (percentage IS NULL OR percentage >= 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transaction_allocations_shares_positive_check'
  ) THEN
    ALTER TABLE public.transaction_allocations
      ADD CONSTRAINT transaction_allocations_shares_positive_check
      CHECK (shares IS NULL OR shares > 0);
  END IF;
END;
$$;

-- ============================================================
-- SECTION 3: INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_financial_accounts_scope_type
  ON public.financial_accounts(scope_type);

CREATE INDEX IF NOT EXISTS idx_financial_accounts_space_id
  ON public.financial_accounts(space_id)
  WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_financial_accounts_created_by_user_id
  ON public.financial_accounts(created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_space_account_permissions_space_id
  ON public.space_account_permissions(space_id);

CREATE INDEX IF NOT EXISTS idx_space_account_permissions_account_id
  ON public.space_account_permissions(account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_space_id
  ON public.transactions(space_id)
  WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_transaction_context
  ON public.transactions(transaction_context);

CREATE INDEX IF NOT EXISTS idx_transactions_created_by_user_id
  ON public.transactions(created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_paid_by_user_id
  ON public.transactions(paid_by_user_id)
  WHERE paid_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_paid_by_person_id
  ON public.transactions(paid_by_person_id)
  WHERE paid_by_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transaction_allocations_transaction_id
  ON public.transaction_allocations(transaction_id);

CREATE INDEX IF NOT EXISTS idx_transaction_allocations_space_id
  ON public.transaction_allocations(space_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_allocations_unique_member
  ON public.transaction_allocations(transaction_id, member_user_id)
  WHERE member_user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_allocations_unique_managed_person
  ON public.transaction_allocations(transaction_id, managed_person_id)
  WHERE managed_person_id IS NOT NULL;

-- ============================================================
-- SECTION 4: FINANCE HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_space_member_user(p_space_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_members AS sm
    WHERE sm.space_id = p_space_id
      AND sm.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_space_managed_person(p_space_id UUID, p_person_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.managed_people AS mp
    WHERE mp.id = p_person_id
      AND mp.space_id = p_space_id
      AND mp.linked_user_id IS NULL
      AND mp.is_archived = false
  );
$$;

CREATE OR REPLACE FUNCTION public.rpc_recalculate_financial_account_balance(
  p_account_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening_balance NUMERIC(18,2);
  v_income_total NUMERIC(18,2) := 0;
  v_expense_total NUMERIC(18,2) := 0;
  v_transfer_in_total NUMERIC(18,2) := 0;
  v_transfer_out_total NUMERIC(18,2) := 0;
  v_new_balance NUMERIC(18,2);
BEGIN
  SELECT fa.opening_balance
  INTO v_opening_balance
  FROM public.financial_accounts AS fa
  WHERE fa.id = p_account_id;

  IF v_opening_balance IS NULL THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  SELECT COALESCE(SUM(t.amount), 0)
  INTO v_income_total
  FROM public.transactions AS t
  WHERE t.account_id = p_account_id
    AND t.transaction_type = 'income';

  SELECT COALESCE(SUM(t.amount), 0)
  INTO v_expense_total
  FROM public.transactions AS t
  WHERE t.account_id = p_account_id
    AND t.transaction_type = 'expense';

  SELECT COALESCE(SUM(COALESCE(tr.destination_amount, tr.amount)), 0)
  INTO v_transfer_in_total
  FROM public.transfers AS tr
  WHERE tr.to_account_id = p_account_id;

  SELECT COALESCE(SUM(COALESCE(tr.source_amount, tr.amount)), 0)
  INTO v_transfer_out_total
  FROM public.transfers AS tr
  WHERE tr.from_account_id = p_account_id;

  v_new_balance := COALESCE(v_opening_balance, 0)
    + COALESCE(v_income_total, 0)
    - COALESCE(v_expense_total, 0)
    + COALESCE(v_transfer_in_total, 0)
    - COALESCE(v_transfer_out_total, 0);

  UPDATE public.financial_accounts AS fa
  SET current_balance = v_new_balance
  WHERE fa.id = p_account_id;

  RETURN v_new_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_get_space_members_with_profiles(
  p_space_id UUID
)
RETURNS TABLE (
  id UUID,
  space_id UUID,
  user_id UUID,
  role public.space_role,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  full_name TEXT,
  email TEXT,
  avatar_url TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_space_role(p_space_id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    sm.id,
    sm.space_id,
    sm.user_id,
    sm.role,
    sm.joined_at,
    sm.created_at,
    up.full_name,
    up.email,
    up.avatar_url
  FROM public.space_members AS sm
  LEFT JOIN public.user_profiles AS up
    ON up.id = sm.user_id
  WHERE sm.space_id = p_space_id
  ORDER BY sm.created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_upsert_space_transaction(
  p_transaction_id UUID,
  p_space_id UUID,
  p_account_id UUID,
  p_category_id UUID DEFAULT NULL,
  p_transaction_type TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_merchant TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_transaction_date DATE DEFAULT NULL,
  p_tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_is_recurring BOOLEAN DEFAULT false,
  p_recurring_id UUID DEFAULT NULL,
  p_paid_by_user_id UUID DEFAULT NULL,
  p_paid_by_person_id UUID DEFAULT NULL,
  p_split_method TEXT DEFAULT 'none',
  p_allocations JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE (
  transaction_id UUID,
  account_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_transaction public.transactions%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE;
  v_total_amount NUMERIC(18,2);
  v_old_account_id UUID := NULL;
  v_allocation_count INTEGER := 0;
  v_sum_exact NUMERIC(18,2) := 0;
  v_sum_percentage NUMERIC(18,4) := 0;
  v_sum_shares NUMERIC(18,4) := 0;
  v_seen_keys TEXT[] := ARRAY[]::TEXT[];
  v_allocation_record RECORD;
  v_member_user_id UUID;
  v_managed_person_id UUID;
  v_key TEXT;
  v_allocated_amount NUMERIC(18,2);
  v_percentage NUMERIC(18,4);
  v_shares NUMERIC(18,4);
  v_running_allocated NUMERIC(18,2) := 0;
  v_ordinal INTEGER := 0;
  v_action TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_space_id IS NULL THEN
    RAISE EXCEPTION 'Space is required';
  END IF;

  IF NOT public.has_space_role(p_space_id, 'contributor') THEN
    RAISE EXCEPTION 'You do not have permission to create Space transactions';
  END IF;

  IF p_transaction_type IS NULL OR p_transaction_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Unsupported transaction type';
  END IF;

  v_total_amount := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  IF p_currency IS NULL OR LENGTH(TRIM(p_currency)) <> 3 THEN
    RAISE EXCEPTION 'Currency is required';
  END IF;

  IF p_transaction_date IS NULL THEN
    RAISE EXCEPTION 'Transaction date is required';
  END IF;

  IF COALESCE(TRIM(p_description), '') = '' THEN
    RAISE EXCEPTION 'Description is required';
  END IF;

  IF p_split_method NOT IN ('none', 'equal', 'exact', 'percentage', 'shares') THEN
    RAISE EXCEPTION 'Unsupported split method';
  END IF;

  SELECT fa.*
  INTO v_account
  FROM public.financial_accounts AS fa
  WHERE fa.id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;

  IF v_account.scope_type = 'space' THEN
    IF v_account.space_id IS DISTINCT FROM p_space_id THEN
      RAISE EXCEPTION 'Space account does not belong to the selected Space';
    END IF;
  ELSE
    IF v_account.user_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Only the account owner may use a shared personal account for Space transactions';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.space_account_permissions AS sap
      WHERE sap.space_id = p_space_id
        AND sap.account_id = p_account_id
        AND sap.can_add_space_transactions = true
    ) THEN
      RAISE EXCEPTION 'This account is not shared for Space transactions';
    END IF;
  END IF;

  IF p_paid_by_user_id IS NOT NULL AND p_paid_by_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only one payer is supported';
  END IF;

  IF p_paid_by_user_id IS NOT NULL
     AND NOT public.is_space_member_user(p_space_id, p_paid_by_user_id) THEN
    RAISE EXCEPTION 'Selected payer is not a member of the Space';
  END IF;

  IF p_paid_by_person_id IS NOT NULL
     AND NOT public.is_space_managed_person(p_space_id, p_paid_by_person_id) THEN
    RAISE EXCEPTION 'Selected managed person is not linked to the Space';
  END IF;

  IF p_paid_by_user_id IS NULL
     AND p_paid_by_person_id IS NULL
     AND v_account.scope_type <> 'space' THEN
    RAISE EXCEPTION 'Payer is required for shared personal account transactions';
  END IF;

  IF jsonb_typeof(COALESCE(p_allocations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Allocations payload must be an array';
  END IF;

  SELECT COUNT(*)
  INTO v_allocation_count
  FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::JSONB));

  IF v_allocation_count = 0 THEN
    RAISE EXCEPTION 'At least one beneficiary allocation is required';
  END IF;

  IF p_split_method = 'none' AND v_allocation_count <> 1 THEN
    RAISE EXCEPTION 'Single-beneficiary transactions require exactly one allocation';
  END IF;

  FOR v_allocation_record IN
    SELECT
      allocation.value AS allocation_value,
      allocation.ordinality::INTEGER AS allocation_ordinal
    FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::JSONB)) WITH ORDINALITY AS allocation(value, ordinality)
    ORDER BY allocation.ordinality
  LOOP
    v_member_user_id := NULLIF(v_allocation_record.allocation_value ->> 'member_user_id', '')::UUID;
    v_managed_person_id := NULLIF(v_allocation_record.allocation_value ->> 'managed_person_id', '')::UUID;
    v_percentage := NULLIF(v_allocation_record.allocation_value ->> 'percentage', '')::NUMERIC;
    v_shares := NULLIF(v_allocation_record.allocation_value ->> 'shares', '')::NUMERIC;
    v_allocated_amount := ROUND(COALESCE(NULLIF(v_allocation_record.allocation_value ->> 'allocated_amount', '')::NUMERIC, 0), 2);

    IF num_nonnulls(v_member_user_id, v_managed_person_id) <> 1 THEN
      RAISE EXCEPTION 'Each allocation must target exactly one participant';
    END IF;

    IF v_member_user_id IS NOT NULL
       AND NOT public.is_space_member_user(p_space_id, v_member_user_id) THEN
      RAISE EXCEPTION 'One or more selected members do not belong to the Space';
    END IF;

    IF v_managed_person_id IS NOT NULL
       AND NOT public.is_space_managed_person(p_space_id, v_managed_person_id) THEN
      RAISE EXCEPTION 'One or more selected managed people are not linked to the Space';
    END IF;

    v_key := COALESCE(v_member_user_id::TEXT, CONCAT('person:', v_managed_person_id::TEXT));
    IF array_position(v_seen_keys, v_key) IS NOT NULL THEN
      RAISE EXCEPTION 'Duplicate allocation participant detected';
    END IF;
    v_seen_keys := array_append(v_seen_keys, v_key);

    IF p_split_method = 'exact' THEN
      IF v_allocated_amount < 0 THEN
        RAISE EXCEPTION 'Exact allocations must be non-negative';
      END IF;
      v_sum_exact := v_sum_exact + v_allocated_amount;
    ELSIF p_split_method = 'percentage' THEN
      IF v_percentage IS NULL OR v_percentage < 0 THEN
        RAISE EXCEPTION 'Percentages must be non-negative';
      END IF;
      v_sum_percentage := v_sum_percentage + v_percentage;
    ELSIF p_split_method = 'shares' THEN
      IF v_shares IS NULL OR v_shares <= 0 THEN
        RAISE EXCEPTION 'Shares must be greater than 0';
      END IF;
      v_sum_shares := v_sum_shares + v_shares;
    END IF;
  END LOOP;

  IF p_split_method = 'exact' AND ABS(v_sum_exact - v_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Exact split totals must match the transaction amount';
  END IF;

  IF p_split_method = 'percentage' AND ABS(v_sum_percentage - 100) > 0.0001 THEN
    RAISE EXCEPTION 'Percentages must total 100';
  END IF;

  IF p_split_method = 'shares' AND v_sum_shares <= 0 THEN
    RAISE EXCEPTION 'Shares total must be greater than 0';
  END IF;

  IF p_transaction_id IS NOT NULL THEN
    SELECT t.*
    INTO v_existing_transaction
    FROM public.transactions AS t
    WHERE t.id = p_transaction_id
      AND t.space_id = p_space_id
      AND t.transaction_context = 'space';

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Space transaction not found';
    END IF;

    IF NOT public.has_space_role(v_existing_transaction.space_id, 'manager')
       AND v_existing_transaction.created_by_user_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Only the creator, a manager, or the owner may edit this Space transaction';
    END IF;

    v_old_account_id := v_existing_transaction.account_id;
    v_action := 'space_transaction_updated';

    UPDATE public.transactions AS t
    SET
      account_id = p_account_id,
      category_id = p_category_id,
      transaction_type = p_transaction_type::public.transaction_type,
      amount = v_total_amount,
      currency = UPPER(TRIM(p_currency)),
      description = TRIM(p_description),
      merchant = NULLIF(TRIM(COALESCE(p_merchant, '')), ''),
      notes = NULLIF(TRIM(COALESCE(p_notes, '')), ''),
      transaction_date = p_transaction_date,
      tags = COALESCE(p_tags, ARRAY[]::TEXT[]),
      is_recurring = COALESCE(p_is_recurring, false),
      recurring_id = p_recurring_id,
      space_id = p_space_id,
      transaction_context = 'space',
      created_by_user_id = COALESCE(t.created_by_user_id, v_user_id),
      paid_by_user_id = p_paid_by_user_id,
      paid_by_person_id = p_paid_by_person_id,
      split_method = p_split_method
    WHERE t.id = p_transaction_id
    RETURNING *
    INTO v_existing_transaction;
  ELSE
    v_action := 'space_transaction_created';

    INSERT INTO public.transactions (
      user_id,
      account_id,
      category_id,
      transaction_type,
      amount,
      currency,
      description,
      merchant,
      notes,
      transaction_date,
      tags,
      is_recurring,
      recurring_id,
      space_id,
      created_by_user_id,
      paid_by_user_id,
      paid_by_person_id,
      transaction_context,
      split_method
    )
    VALUES (
      v_user_id,
      p_account_id,
      p_category_id,
      p_transaction_type::public.transaction_type,
      v_total_amount,
      UPPER(TRIM(p_currency)),
      TRIM(p_description),
      NULLIF(TRIM(COALESCE(p_merchant, '')), ''),
      NULLIF(TRIM(COALESCE(p_notes, '')), ''),
      p_transaction_date,
      COALESCE(p_tags, ARRAY[]::TEXT[]),
      COALESCE(p_is_recurring, false),
      p_recurring_id,
      p_space_id,
      v_user_id,
      p_paid_by_user_id,
      p_paid_by_person_id,
      'space',
      p_split_method
    )
    RETURNING *
    INTO v_existing_transaction;
  END IF;

  DELETE FROM public.transaction_allocations AS ta
  WHERE ta.transaction_id = v_existing_transaction.id;

  v_running_allocated := 0;
  v_ordinal := 0;

  FOR v_allocation_record IN
    SELECT
      allocation.value AS allocation_value,
      allocation.ordinality::INTEGER AS allocation_ordinal
    FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::JSONB)) WITH ORDINALITY AS allocation(value, ordinality)
    ORDER BY allocation.ordinality
  LOOP
    v_ordinal := v_ordinal + 1;
    v_member_user_id := NULLIF(v_allocation_record.allocation_value ->> 'member_user_id', '')::UUID;
    v_managed_person_id := NULLIF(v_allocation_record.allocation_value ->> 'managed_person_id', '')::UUID;
    v_percentage := NULLIF(v_allocation_record.allocation_value ->> 'percentage', '')::NUMERIC;
    v_shares := NULLIF(v_allocation_record.allocation_value ->> 'shares', '')::NUMERIC;
    v_allocated_amount := ROUND(COALESCE(NULLIF(v_allocation_record.allocation_value ->> 'allocated_amount', '')::NUMERIC, 0), 2);

    IF p_split_method = 'none' THEN
      v_allocated_amount := v_total_amount;
    ELSIF p_split_method = 'equal' THEN
      IF v_ordinal = v_allocation_count THEN
        v_allocated_amount := ROUND(v_total_amount - v_running_allocated, 2);
      ELSE
        v_allocated_amount := ROUND(v_total_amount / v_allocation_count, 2);
      END IF;
    ELSIF p_split_method = 'percentage' THEN
      IF v_ordinal = v_allocation_count THEN
        v_allocated_amount := ROUND(v_total_amount - v_running_allocated, 2);
      ELSE
        v_allocated_amount := ROUND(v_total_amount * COALESCE(v_percentage, 0) / 100, 2);
      END IF;
    ELSIF p_split_method = 'shares' THEN
      IF v_ordinal = v_allocation_count THEN
        v_allocated_amount := ROUND(v_total_amount - v_running_allocated, 2);
      ELSE
        v_allocated_amount := ROUND(v_total_amount * COALESCE(v_shares, 0) / v_sum_shares, 2);
      END IF;
    END IF;

    v_running_allocated := v_running_allocated + v_allocated_amount;

    INSERT INTO public.transaction_allocations (
      transaction_id,
      space_id,
      member_user_id,
      managed_person_id,
      allocated_amount,
      percentage,
      shares,
      reimbursement_required
    )
    VALUES (
      v_existing_transaction.id,
      p_space_id,
      v_member_user_id,
      v_managed_person_id,
      v_allocated_amount,
      CASE WHEN p_split_method = 'percentage' THEN v_percentage ELSE NULL END,
      CASE WHEN p_split_method = 'shares' THEN v_shares ELSE NULL END,
      COALESCE((v_allocation_record.allocation_value ->> 'reimbursement_required')::BOOLEAN, false)
    );
  END LOOP;

  PERFORM public.rpc_recalculate_financial_account_balance(p_account_id);

  IF v_old_account_id IS NOT NULL AND v_old_account_id IS DISTINCT FROM p_account_id THEN
    PERFORM public.rpc_recalculate_financial_account_balance(v_old_account_id);
  END IF;

  INSERT INTO public.activity_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    previous_value,
    new_value
  )
  VALUES (
    v_user_id,
    v_action,
    'transactions',
    v_existing_transaction.id,
    CASE
      WHEN p_transaction_id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'account_id', v_old_account_id,
        'space_id', p_space_id
      )
    END,
    jsonb_build_object(
      'account_id', p_account_id,
      'space_id', p_space_id,
      'transaction_type', p_transaction_type,
      'amount', v_total_amount,
      'split_method', p_split_method
    )
  );

  RETURN QUERY
  SELECT
    v_existing_transaction.id,
    v_existing_transaction.account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_delete_space_transaction(
  p_transaction_id UUID
)
RETURNS TABLE (
  transaction_id UUID,
  account_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_existing_transaction public.transactions%ROWTYPE;
  v_affected_document_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT t.*
  INTO v_existing_transaction
  FROM public.transactions AS t
  WHERE t.id = p_transaction_id
    AND t.transaction_context = 'space'
    AND t.space_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Space transaction not found';
  END IF;

  IF NOT public.has_space_role(v_existing_transaction.space_id, 'manager')
     AND v_existing_transaction.created_by_user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Only the creator, a manager, or the owner may delete this Space transaction';
  END IF;

  WITH affected_documents AS (
    SELECT DISTINCT document_id
    FROM (
      SELECT d.id AS document_id
      FROM public.transaction_documents AS d
      WHERE d.user_id = v_existing_transaction.user_id
        AND d.primary_transaction_id = v_existing_transaction.id

      UNION

      SELECT ti.document_id
      FROM public.transaction_items AS ti
      WHERE ti.user_id = v_existing_transaction.user_id
        AND ti.transaction_id = v_existing_transaction.id
        AND ti.document_id IS NOT NULL

      UNION

      SELECT d.id AS document_id
      FROM public.transaction_documents AS d
      JOIN public.receipt_attachments AS ra
        ON ra.file_url = d.storage_path
       AND ra.user_id = v_existing_transaction.user_id
      WHERE d.user_id = v_existing_transaction.user_id
        AND ra.transaction_id = v_existing_transaction.id

      UNION

      SELECT j.document_id
      FROM public.document_extraction_jobs AS j
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(j.saved_transaction_ids) = 'array' THEN j.saved_transaction_ids
          ELSE '[]'::JSONB
        END
      ) AS saved(transaction_id_text)
      WHERE j.user_id = v_existing_transaction.user_id
        AND saved.transaction_id_text = v_existing_transaction.id::TEXT
    ) AS affected
    WHERE document_id IS NOT NULL
  )
  SELECT COALESCE(array_agg(document_id), ARRAY[]::UUID[])
  INTO v_affected_document_ids
  FROM affected_documents;

  DELETE FROM public.transaction_allocations AS ta
  WHERE ta.transaction_id = v_existing_transaction.id;

  DELETE FROM public.transactions AS t
  WHERE t.id = v_existing_transaction.id;

  PERFORM public.sync_transaction_document_active_links(
    v_existing_transaction.user_id,
    CASE
      WHEN array_length(v_affected_document_ids, 1) IS NULL THEN NULL
      ELSE v_affected_document_ids
    END
  );

  PERFORM public.rpc_recalculate_financial_account_balance(v_existing_transaction.account_id);

  INSERT INTO public.activity_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    previous_value,
    new_value
  )
  VALUES (
    v_user_id,
    'space_transaction_deleted',
    'transactions',
    v_existing_transaction.id,
    jsonb_build_object(
      'account_id', v_existing_transaction.account_id,
      'space_id', v_existing_transaction.space_id,
      'transaction_type', v_existing_transaction.transaction_type,
      'amount', v_existing_transaction.amount
    ),
    NULL
  );

  RETURN QUERY
  SELECT
    v_existing_transaction.id,
    v_existing_transaction.account_id;
END;
$$;

-- ============================================================
-- SECTION 5: RLS
-- ============================================================

DROP POLICY IF EXISTS "users_manage_own_financial_accounts" ON public.financial_accounts;

DROP POLICY IF EXISTS "financial_accounts_personal_owner_select" ON public.financial_accounts;
CREATE POLICY "financial_accounts_personal_owner_select" ON public.financial_accounts
  FOR SELECT TO authenticated
  USING (
    scope_type = 'personal'
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "financial_accounts_personal_owner_insert" ON public.financial_accounts;
CREATE POLICY "financial_accounts_personal_owner_insert" ON public.financial_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    scope_type = 'personal'
    AND space_id IS NULL
    AND user_id = auth.uid()
    AND COALESCE(created_by_user_id, auth.uid()) = auth.uid()
  );

DROP POLICY IF EXISTS "financial_accounts_personal_owner_update" ON public.financial_accounts;
CREATE POLICY "financial_accounts_personal_owner_update" ON public.financial_accounts
  FOR UPDATE TO authenticated
  USING (
    scope_type = 'personal'
    AND user_id = auth.uid()
  )
  WITH CHECK (
    scope_type = 'personal'
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "financial_accounts_personal_owner_delete" ON public.financial_accounts;
CREATE POLICY "financial_accounts_personal_owner_delete" ON public.financial_accounts
  FOR DELETE TO authenticated
  USING (
    scope_type = 'personal'
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "financial_accounts_space_member_select" ON public.financial_accounts;
CREATE POLICY "financial_accounts_space_member_select" ON public.financial_accounts
  FOR SELECT TO authenticated
  USING (
    scope_type = 'space'
    AND space_id IS NOT NULL
    AND public.has_space_role(space_id, 'viewer')
  );

DROP POLICY IF EXISTS "financial_accounts_space_manager_insert" ON public.financial_accounts;
CREATE POLICY "financial_accounts_space_manager_insert" ON public.financial_accounts
  FOR INSERT TO authenticated
  WITH CHECK (
    scope_type = 'space'
    AND space_id IS NOT NULL
    AND user_id = auth.uid()
    AND COALESCE(created_by_user_id, auth.uid()) = auth.uid()
    AND public.has_space_role(space_id, 'manager')
  );

DROP POLICY IF EXISTS "financial_accounts_space_manager_update" ON public.financial_accounts;
CREATE POLICY "financial_accounts_space_manager_update" ON public.financial_accounts
  FOR UPDATE TO authenticated
  USING (
    scope_type = 'space'
    AND space_id IS NOT NULL
    AND public.has_space_role(space_id, 'manager')
  )
  WITH CHECK (
    scope_type = 'space'
    AND space_id IS NOT NULL
    AND public.has_space_role(space_id, 'manager')
  );

DROP POLICY IF EXISTS "financial_accounts_space_owner_delete" ON public.financial_accounts;
CREATE POLICY "financial_accounts_space_owner_delete" ON public.financial_accounts
  FOR DELETE TO authenticated
  USING (
    scope_type = 'space'
    AND space_id IS NOT NULL
    AND public.has_space_role(space_id, 'owner')
  );

DROP POLICY IF EXISTS "space_account_permissions_owner_select" ON public.space_account_permissions;
CREATE POLICY "space_account_permissions_owner_select" ON public.space_account_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.financial_accounts AS fa
      WHERE fa.id = account_id
        AND fa.user_id = auth.uid()
        AND fa.scope_type = 'personal'
        AND fa.space_id IS NULL
    )
  );

DROP POLICY IF EXISTS "space_account_permissions_owner_insert" ON public.space_account_permissions;
CREATE POLICY "space_account_permissions_owner_insert" ON public.space_account_permissions
  FOR INSERT TO authenticated
  WITH CHECK (
    granted_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.financial_accounts AS fa
      WHERE fa.id = account_id
        AND fa.user_id = auth.uid()
        AND fa.scope_type = 'personal'
        AND fa.space_id IS NULL
    )
  );

DROP POLICY IF EXISTS "space_account_permissions_owner_update" ON public.space_account_permissions;
CREATE POLICY "space_account_permissions_owner_update" ON public.space_account_permissions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.financial_accounts AS fa
      WHERE fa.id = account_id
        AND fa.user_id = auth.uid()
        AND fa.scope_type = 'personal'
        AND fa.space_id IS NULL
    )
  )
  WITH CHECK (
    granted_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.financial_accounts AS fa
      WHERE fa.id = account_id
        AND fa.user_id = auth.uid()
        AND fa.scope_type = 'personal'
        AND fa.space_id IS NULL
    )
  );

DROP POLICY IF EXISTS "space_account_permissions_owner_delete" ON public.space_account_permissions;
CREATE POLICY "space_account_permissions_owner_delete" ON public.space_account_permissions
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.financial_accounts AS fa
      WHERE fa.id = account_id
        AND fa.user_id = auth.uid()
        AND fa.scope_type = 'personal'
        AND fa.space_id IS NULL
    )
  );

DROP POLICY IF EXISTS "users_manage_own_transactions" ON public.transactions;

DROP POLICY IF EXISTS "transactions_personal_owner_all" ON public.transactions;
CREATE POLICY "transactions_personal_owner_all" ON public.transactions
  FOR ALL TO authenticated
  USING (
    transaction_context = 'personal'
    AND space_id IS NULL
    AND user_id = auth.uid()
  )
  WITH CHECK (
    transaction_context = 'personal'
    AND space_id IS NULL
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "transactions_space_member_select" ON public.transactions;
CREATE POLICY "transactions_space_member_select" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    transaction_context = 'space'
    AND space_id IS NOT NULL
    AND public.has_space_role(space_id, 'viewer')
  );

DROP POLICY IF EXISTS "transaction_allocations_space_member_select" ON public.transaction_allocations;
CREATE POLICY "transaction_allocations_space_member_select" ON public.transaction_allocations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.transactions AS t
      WHERE t.id = transaction_id
        AND t.transaction_context = 'space'
        AND t.space_id IS NOT NULL
        AND public.has_space_role(t.space_id, 'viewer')
    )
  );

-- ============================================================
-- SECTION 6: EXECUTE GRANTS
-- ============================================================

REVOKE ALL ON FUNCTION public.is_space_member_user(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_space_member_user(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.is_space_member_user(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_member_user(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_space_managed_person(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_space_managed_person(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.is_space_managed_person(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_managed_person(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_recalculate_financial_account_balance(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_recalculate_financial_account_balance(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_recalculate_financial_account_balance(UUID) FROM authenticated;

REVOKE ALL ON FUNCTION public.rpc_get_space_members_with_profiles(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_get_space_members_with_profiles(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_get_space_members_with_profiles(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_space_members_with_profiles(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_upsert_space_transaction(
  UUID,
  UUID,
  UUID,
  UUID,
  TEXT,
  NUMERIC,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  TEXT[],
  BOOLEAN,
  UUID,
  UUID,
  UUID,
  TEXT,
  JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_upsert_space_transaction(
  UUID,
  UUID,
  UUID,
  UUID,
  TEXT,
  NUMERIC,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  TEXT[],
  BOOLEAN,
  UUID,
  UUID,
  UUID,
  TEXT,
  JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_upsert_space_transaction(
  UUID,
  UUID,
  UUID,
  UUID,
  TEXT,
  NUMERIC,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  TEXT[],
  BOOLEAN,
  UUID,
  UUID,
  UUID,
  TEXT,
  JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_upsert_space_transaction(
  UUID,
  UUID,
  UUID,
  UUID,
  TEXT,
  NUMERIC,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  TEXT[],
  BOOLEAN,
  UUID,
  UUID,
  UUID,
  TEXT,
  JSONB
) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_delete_space_transaction(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_delete_space_transaction(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_delete_space_transaction(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_space_transaction(UUID) TO authenticated;

COMMIT;
