-- ============================================================
-- Atomic loan repayment RPC
-- Migration: 20260621110000_rpc_record_loan_repayment.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_record_loan_repayment(
  p_person_id UUID,
  p_account_id UUID,
  p_amount NUMERIC,
  p_repayment_date DATE,
  p_notes TEXT,
  p_currency TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID,
  ledger_entry_id UUID,
  settlement_id UUID,
  remaining_outstanding NUMERIC,
  account_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_person RECORD;
  v_account RECORD;
  v_amount NUMERIC(15,2);
  v_currency TEXT;
  v_account_currency TEXT;
  v_outstanding NUMERIC(15,2);
  v_description TEXT;
  v_payment_method TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_amount := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'Repayment amount must be greater than 0';
  END IF;

  IF p_repayment_date IS NULL THEN
    RAISE EXCEPTION 'Repayment date is required';
  END IF;

  IF p_notes IS NULL OR BTRIM(p_notes) = '' THEN
    RAISE EXCEPTION 'Notes are required for a loan repayment';
  END IF;

  SELECT id, owner_id, full_name, is_active, is_archived
  INTO v_person
  FROM public.managed_people
  WHERE id = p_person_id
    AND owner_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected person was not found';
  END IF;

  IF COALESCE(v_person.is_archived, false) OR NOT COALESCE(v_person.is_active, true) THEN
    RAISE EXCEPTION 'Selected person is inactive';
  END IF;

  SELECT id, user_id, currency, account_type, opening_balance, is_active
  INTO v_account
  FROM public.financial_accounts
  WHERE id = p_account_id
    AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Selected account was not found';
  END IF;

  IF NOT COALESCE(v_account.is_active, true) THEN
    RAISE EXCEPTION 'Selected account is inactive';
  END IF;

  v_account_currency := UPPER(BTRIM(COALESCE(v_account.currency, 'AED')));
  v_currency := UPPER(BTRIM(COALESCE(NULLIF(p_currency, ''), v_account.currency, 'AED')));

  IF v_currency <> v_account_currency THEN
    RAISE EXCEPTION 'Repayment currency must match the selected account currency (%)', v_account_currency;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      format('loan-repayment:%s:%s:%s', v_user_id::TEXT, p_person_id::TEXT, v_currency),
      0
    )
  );

  SELECT COALESCE(SUM(
    CASE
      WHEN entry_type = 'reimbursement_due_to_person' THEN amount
      WHEN entry_type = 'reimbursement_paid' THEN -amount
      ELSE 0
    END
  ), 0)::NUMERIC(15,2)
  INTO v_outstanding
  FROM public.person_ledger_entries
  WHERE person_id = p_person_id
    AND owner_id = v_user_id
    AND is_deleted = false
    AND reference_type = 'loan'
    AND UPPER(BTRIM(currency)) = v_currency;

  IF v_outstanding <= 0 THEN
    RAISE EXCEPTION 'No outstanding % loan balance remains for %', v_currency, v_person.full_name;
  END IF;

  IF v_amount > v_outstanding THEN
    RAISE EXCEPTION 'Repayment exceeds the outstanding % loan balance of %', v_currency, TO_CHAR(v_outstanding, 'FM999999999999990.00');
  END IF;

  v_description := COALESCE(NULLIF(BTRIM(p_description), ''), format('Loan repayment to %s', v_person.full_name));
  v_payment_method := CASE
    WHEN v_account.account_type::TEXT = 'cash' THEN 'cash'
    ELSE 'bank_transfer'
  END;

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
    person_id,
    expense_owner,
    paid_by,
    paid_from,
    use_held_balance,
    reimbursement_required,
    reimbursement_status
  )
  VALUES (
    v_user_id,
    p_account_id,
    NULL,
    'expense',
    v_amount,
    v_currency,
    v_description,
    NULL,
    BTRIM(p_notes),
    p_repayment_date,
    ARRAY[]::TEXT[],
    false,
    p_person_id,
    'user',
    'user',
    'account',
    false,
    false,
    NULL
  )
  RETURNING id INTO transaction_id;

  INSERT INTO public.person_ledger_entries (
    person_id,
    owner_id,
    created_by,
    entry_type,
    amount,
    currency,
    description,
    transaction_id,
    reference_id,
    reference_type,
    notes,
    entry_date,
    is_deleted
  )
  VALUES (
    p_person_id,
    v_user_id,
    v_user_id,
    'reimbursement_paid',
    v_amount,
    v_currency,
    v_description,
    transaction_id,
    transaction_id,
    'loan',
    BTRIM(p_notes),
    p_repayment_date,
    false
  )
  RETURNING id INTO ledger_entry_id;

  INSERT INTO public.settlements (
    owner_id,
    person_id,
    created_by,
    amount,
    currency,
    settlement_date,
    payment_method,
    receiving_account_id,
    description,
    notes,
    is_deleted
  )
  VALUES (
    v_user_id,
    p_person_id,
    v_user_id,
    v_amount,
    v_currency,
    p_repayment_date,
    v_payment_method,
    NULL,
    v_description,
    BTRIM(p_notes),
    false
  )
  RETURNING id INTO settlement_id;

  UPDATE public.transactions
  SET settlement_reference = settlement_id::TEXT
  WHERE id = transaction_id
    AND user_id = v_user_id;

  UPDATE public.financial_accounts AS fa
  SET current_balance = fa.opening_balance
    + COALESCE((
      SELECT SUM(t.amount)
      FROM public.transactions AS t
      WHERE t.account_id = fa.id
        AND t.user_id = v_user_id
        AND t.transaction_type = 'income'
    ), 0)
    - COALESCE((
      SELECT SUM(t.amount)
      FROM public.transactions AS t
      WHERE t.account_id = fa.id
        AND t.user_id = v_user_id
        AND t.transaction_type = 'expense'
    ), 0)
    + COALESCE((
      SELECT SUM(tr.amount)
      FROM public.transfers AS tr
      WHERE tr.to_account_id = fa.id
        AND tr.user_id = v_user_id
    ), 0)
    - COALESCE((
      SELECT SUM(tr.amount)
      FROM public.transfers AS tr
      WHERE tr.from_account_id = fa.id
        AND tr.user_id = v_user_id
    ), 0)
  WHERE fa.id = p_account_id
    AND fa.user_id = v_user_id
  RETURNING fa.current_balance INTO account_balance;

  remaining_outstanding := ROUND((v_outstanding - v_amount)::NUMERIC, 2);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_loan_repayment(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_record_loan_repayment(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_record_loan_repayment(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_loan_repayment(UUID, UUID, NUMERIC, DATE, TEXT, TEXT, TEXT) TO authenticated;
