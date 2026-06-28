BEGIN;

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

COMMIT;
