BEGIN;

-- ============================================================
-- Smart Pocket Phase B - Space Money Movement
-- Purpose:
--   1. Extend transfers with scope + purpose metadata.
--   2. Add a normalized contribution ledger linked to transfers/manual rows.
--   3. Generalize reimbursements and settlements for Space member flows.
--   4. Add trusted RPCs for scoped transfers, settlement apply, and
--      Space recurring execution.
--   5. Keep the authoritative engine on the existing finance tables.
-- Safe:
--   - Additive only.
--   - No edits to previously applied migrations.
-- ============================================================

-- ============================================================
-- SECTION 1: TRANSFER SCOPE + CONTRIBUTIONS
-- ============================================================

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_scope_type TEXT,
  ADD COLUMN IF NOT EXISTS destination_scope_type TEXT,
  ADD COLUMN IF NOT EXISTS source_space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS destination_space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_purpose TEXT,
  ADD COLUMN IF NOT EXISTS reimbursement_id UUID REFERENCES public.reimbursements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES public.settlements(id) ON DELETE SET NULL;

UPDATE public.transfers AS tr
SET
  created_by_user_id = COALESCE(tr.created_by_user_id, tr.user_id),
  source_scope_type = COALESCE(
    tr.source_scope_type,
    fa_from.scope_type,
    CASE WHEN fa_from.space_id IS NULL THEN 'personal' ELSE 'space' END
  ),
  destination_scope_type = COALESCE(
    tr.destination_scope_type,
    fa_to.scope_type,
    CASE WHEN fa_to.space_id IS NULL THEN 'personal' ELSE 'space' END
  ),
  source_space_id = COALESCE(tr.source_space_id, fa_from.space_id),
  destination_space_id = COALESCE(tr.destination_space_id, fa_to.space_id),
  transfer_purpose = COALESCE(tr.transfer_purpose, 'normal_transfer')
FROM public.financial_accounts AS fa_from,
     public.financial_accounts AS fa_to
WHERE fa_from.id = tr.from_account_id
  AND fa_to.id = tr.to_account_id;

ALTER TABLE public.transfers
  ALTER COLUMN source_scope_type SET DEFAULT 'personal',
  ALTER COLUMN destination_scope_type SET DEFAULT 'personal',
  ALTER COLUMN transfer_purpose SET DEFAULT 'normal_transfer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transfers_source_scope_type_check'
  ) THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_source_scope_type_check
      CHECK (source_scope_type IN ('personal', 'space'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transfers_destination_scope_type_check'
  ) THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_destination_scope_type_check
      CHECK (destination_scope_type IN ('personal', 'space'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transfers_purpose_check'
  ) THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_purpose_check
      CHECK (transfer_purpose IN ('normal_transfer', 'member_contribution', 'reimbursement_payout', 'settlement'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transfers_source_scope_consistency_check'
  ) THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_source_scope_consistency_check
      CHECK (
        (source_scope_type = 'personal' AND source_space_id IS NULL)
        OR (source_scope_type = 'space' AND source_space_id IS NOT NULL)
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transfers_destination_scope_consistency_check'
  ) THEN
    ALTER TABLE public.transfers
      ADD CONSTRAINT transfers_destination_scope_consistency_check
      CHECK (
        (destination_scope_type = 'personal' AND destination_space_id IS NULL)
        OR (destination_scope_type = 'space' AND destination_space_id IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.space_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  contributor_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  contributor_managed_person_id UUID REFERENCES public.managed_people(id) ON DELETE SET NULL,
  source_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  destination_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  transfer_id UUID UNIQUE REFERENCES public.transfers(id) ON DELETE SET NULL,
  manual_transaction_id UUID UNIQUE REFERENCES public.transactions(id) ON DELETE SET NULL,
  amount NUMERIC(18,2) NOT NULL,
  currency TEXT NOT NULL,
  contributed_at DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.space_contributions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at_space_contributions ON public.space_contributions;
CREATE TRIGGER set_updated_at_space_contributions
  BEFORE UPDATE ON public.space_contributions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'space_contributions_single_contributor_check'
  ) THEN
    ALTER TABLE public.space_contributions
      ADD CONSTRAINT space_contributions_single_contributor_check
      CHECK (num_nonnulls(contributor_user_id, contributor_managed_person_id) = 1);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'space_contributions_single_origin_check'
  ) THEN
    ALTER TABLE public.space_contributions
      ADD CONSTRAINT space_contributions_single_origin_check
      CHECK (num_nonnulls(transfer_id, manual_transaction_id) = 1);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_transfers_source_space_id
  ON public.transfers(source_space_id)
  WHERE source_space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_destination_space_id
  ON public.transfers(destination_space_id)
  WHERE destination_space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_transfer_purpose
  ON public.transfers(transfer_purpose);

CREATE INDEX IF NOT EXISTS idx_space_contributions_space_id
  ON public.space_contributions(space_id);

CREATE INDEX IF NOT EXISTS idx_space_contributions_contributor_user_id
  ON public.space_contributions(contributor_user_id)
  WHERE contributor_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_space_contributions_manual_transaction_id
  ON public.space_contributions(manual_transaction_id)
  WHERE manual_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_space_contributions_transfer_id
  ON public.space_contributions(transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_space_contributions_manual_transaction_id
  ON public.space_contributions(manual_transaction_id)
  WHERE manual_transaction_id IS NOT NULL;

-- ============================================================
-- SECTION 2: GENERALIZE REIMBURSEMENTS + SETTLEMENTS
-- ============================================================

ALTER TABLE public.reimbursements
  ALTER COLUMN person_id DROP NOT NULL;

ALTER TABLE public.reimbursements
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_allocation_id UUID REFERENCES public.transaction_allocations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payer_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payer_person_id UUID REFERENCES public.managed_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS beneficiary_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS beneficiary_person_id UUID REFERENCES public.managed_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS generated_from TEXT,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

UPDATE public.reimbursements
SET
  beneficiary_person_id = COALESCE(beneficiary_person_id, person_id),
  original_amount = COALESCE(original_amount, amount),
  generated_from = COALESCE(generated_from, 'manual'),
  created_by_user_id = COALESCE(created_by_user_id, owner_id)
WHERE beneficiary_person_id IS NULL
   OR original_amount IS NULL
   OR generated_from IS NULL
   OR created_by_user_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reimbursements_single_payer_check'
  ) THEN
    ALTER TABLE public.reimbursements
      ADD CONSTRAINT reimbursements_single_payer_check
      CHECK (num_nonnulls(payer_user_id, payer_person_id) <= 1);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reimbursements_single_beneficiary_check'
  ) THEN
    ALTER TABLE public.reimbursements
      ADD CONSTRAINT reimbursements_single_beneficiary_check
      CHECK (
        CASE
          WHEN space_id IS NULL THEN
            beneficiary_user_id IS NULL
            AND COALESCE(beneficiary_person_id, person_id) IS NOT NULL
          ELSE num_nonnulls(
            beneficiary_user_id,
            COALESCE(beneficiary_person_id, person_id)
          ) = 1
        END
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reimbursements_generated_from_check'
  ) THEN
    ALTER TABLE public.reimbursements
      ADD CONSTRAINT reimbursements_generated_from_check
      CHECK (generated_from IN ('manual', 'space_allocation', 'correction'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reimbursements_unique_transaction_allocation
  ON public.reimbursements(transaction_allocation_id)
  WHERE transaction_allocation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reimbursements_space_id
  ON public.reimbursements(space_id)
  WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reimbursements_payer_user_id
  ON public.reimbursements(payer_user_id)
  WHERE payer_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reimbursements_beneficiary_user_id
  ON public.reimbursements(beneficiary_user_id)
  WHERE beneficiary_user_id IS NOT NULL;

ALTER TABLE public.reimbursement_payments
  ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES public.settlements(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES public.transfers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_notes TEXT;

UPDATE public.reimbursement_payments
SET created_by_user_id = COALESCE(created_by_user_id, owner_id)
WHERE created_by_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_reimbursement_payments_settlement_id
  ON public.reimbursement_payments(settlement_id)
  WHERE settlement_id IS NOT NULL;

ALTER TABLE public.settlements
  ALTER COLUMN person_id DROP NOT NULL;

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payer_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payer_person_id UUID REFERENCES public.managed_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receiver_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS receiver_person_id UUID REFERENCES public.managed_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transfer_id UUID REFERENCES public.transfers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_status TEXT,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_notes TEXT;

ALTER TABLE public.settlement_allocations
  ADD COLUMN IF NOT EXISTS is_reversed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

UPDATE public.settlements
SET
  receiver_person_id = COALESCE(receiver_person_id, person_id),
  created_by_user_id = COALESCE(created_by_user_id, owner_id),
  correction_status = COALESCE(correction_status, 'applied')
WHERE receiver_person_id IS NULL
   OR created_by_user_id IS NULL
   OR correction_status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settlements_single_payer_check'
  ) THEN
    ALTER TABLE public.settlements
      ADD CONSTRAINT settlements_single_payer_check
      CHECK (num_nonnulls(payer_user_id, payer_person_id) <= 1);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settlements_single_receiver_check'
  ) THEN
    ALTER TABLE public.settlements
      ADD CONSTRAINT settlements_single_receiver_check
      CHECK (
        CASE
          WHEN space_id IS NULL THEN
            receiver_user_id IS NULL
            AND COALESCE(receiver_person_id, person_id) IS NOT NULL
          ELSE num_nonnulls(
            receiver_user_id,
            COALESCE(receiver_person_id, person_id)
          ) = 1
        END
      );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settlements_correction_status_check'
  ) THEN
    ALTER TABLE public.settlements
      ADD CONSTRAINT settlements_correction_status_check
      CHECK (correction_status IN ('applied', 'reversal_pending', 'reversed'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_settlements_space_id
  ON public.settlements(space_id)
  WHERE space_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_settlements_transfer_id
  ON public.settlements(transfer_id)
  WHERE transfer_id IS NOT NULL;

-- ============================================================
-- SECTION 3: SPACE RECURRING METADATA
-- ============================================================

ALTER TABLE public.recurring_transactions
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS paid_by_person_id UUID REFERENCES public.managed_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS split_method TEXT,
  ADD COLUMN IF NOT EXISTS allocation_template JSONB,
  ADD COLUMN IF NOT EXISTS execution_permissions TEXT;

UPDATE public.recurring_transactions
SET
  created_by_user_id = COALESCE(created_by_user_id, user_id),
  split_method = COALESCE(split_method, 'none'),
  allocation_template = COALESCE(allocation_template, '[]'::JSONB),
  execution_permissions = COALESCE(execution_permissions, 'owner_manager')
WHERE created_by_user_id IS NULL
   OR split_method IS NULL
   OR allocation_template IS NULL
   OR execution_permissions IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recurring_transactions_split_method_check'
  ) THEN
    ALTER TABLE public.recurring_transactions
      ADD CONSTRAINT recurring_transactions_split_method_check
      CHECK (split_method IN ('none', 'equal', 'exact', 'percentage', 'shares'));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recurring_transactions_execution_permissions_check'
  ) THEN
    ALTER TABLE public.recurring_transactions
      ADD CONSTRAINT recurring_transactions_execution_permissions_check
      CHECK (execution_permissions IN ('owner_only', 'owner_manager', 'owner_manager_contributor'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_recurring_transactions_space_id
  ON public.recurring_transactions(space_id)
  WHERE space_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_validate_space_recurring_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_account public.financial_accounts%ROWTYPE;
  v_participant JSONB;
  v_member_user_id UUID;
  v_managed_person_id UUID;
  v_seen_keys TEXT[] := ARRAY[]::TEXT[];
  v_key TEXT;
  v_percentage NUMERIC(18,6) := 0;
  v_shares NUMERIC(18,6) := 0;
  v_allocated_amount NUMERIC(18,2) := 0;
  v_total_percentage NUMERIC(18,6) := 0;
  v_total_shares NUMERIC(18,6) := 0;
  v_total_exact NUMERIC(18,2) := 0;
  v_total_amount NUMERIC(18,2) := ROUND(COALESCE(NEW.amount, 0)::NUMERIC, 2);
  v_creator_id UUID;
BEGIN
  IF NEW.space_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  NEW.created_by_user_id := COALESCE(NEW.created_by_user_id, NEW.user_id, v_user_id);
  NEW.split_method := COALESCE(NULLIF(BTRIM(NEW.split_method), ''), 'none');
  NEW.execution_permissions := COALESCE(NULLIF(BTRIM(NEW.execution_permissions), ''), 'owner_manager');
  NEW.allocation_template := COALESCE(NEW.allocation_template, '[]'::JSONB);
  NEW.currency := UPPER(COALESCE(NULLIF(BTRIM(NEW.currency), ''), ''));
  v_creator_id := COALESCE(NEW.created_by_user_id, NEW.user_id, v_user_id);

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Recurring transaction amount must be greater than 0';
  END IF;

  IF NEW.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Recurring transaction currency must be a valid three-letter currency code';
  END IF;

  IF NEW.account_id IS NULL THEN
    RAISE EXCEPTION 'A financial account is required for Space recurring transactions';
  END IF;

  SELECT *
  INTO v_account
  FROM public.financial_accounts
  WHERE id = NEW.account_id;

  IF NOT FOUND OR COALESCE(v_account.is_active, false) = false THEN
    RAISE EXCEPTION 'Recurring transaction account could not be found or is inactive';
  END IF;

  IF UPPER(COALESCE(v_account.currency, '')) IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'Recurring transaction currency must match the selected account currency';
  END IF;

  IF COALESCE(v_account.scope_type, CASE WHEN v_account.space_id IS NULL THEN 'personal' ELSE 'space' END) = 'space' THEN
    IF v_account.space_id IS DISTINCT FROM NEW.space_id THEN
      RAISE EXCEPTION 'Recurring transaction account must belong to the selected Space';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1
      FROM public.space_account_permissions AS sap
      WHERE sap.space_id = NEW.space_id
        AND sap.account_id = NEW.account_id
        AND sap.can_add_space_transactions = true
    ) THEN
      RAISE EXCEPTION 'Recurring transaction account is not shared for Space transactions';
    END IF;
  END IF;

  IF num_nonnulls(NEW.paid_by_user_id, NEW.paid_by_person_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one payer is required for Space recurring transactions';
  END IF;

  IF NEW.paid_by_user_id IS NOT NULL
     AND NOT public.is_space_member_user(NEW.space_id, NEW.paid_by_user_id) THEN
    RAISE EXCEPTION 'Recurring transaction payer must belong to the selected Space';
  END IF;

  IF NEW.paid_by_person_id IS NOT NULL
     AND NOT public.is_space_managed_person(NEW.space_id, NEW.paid_by_person_id) THEN
    RAISE EXCEPTION 'Recurring managed payer must be linked to the selected Space';
  END IF;

  IF jsonb_typeof(COALESCE(NEW.allocation_template, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Recurring allocation template must be an array';
  END IF;

  IF jsonb_array_length(COALESCE(NEW.allocation_template, '[]'::JSONB)) = 0 THEN
    RAISE EXCEPTION 'At least one allocation participant is required for Space recurring transactions';
  END IF;

  IF NEW.split_method = 'none'
     AND jsonb_array_length(COALESCE(NEW.allocation_template, '[]'::JSONB)) <> 1 THEN
    RAISE EXCEPTION 'Single-beneficiary recurring transactions require exactly one allocation participant';
  END IF;

  FOR v_participant IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(NEW.allocation_template, '[]'::JSONB))
  LOOP
    v_member_user_id := NULLIF(v_participant ->> 'member_user_id', '')::UUID;
    v_managed_person_id := NULLIF(v_participant ->> 'managed_person_id', '')::UUID;
    v_percentage := NULLIF(v_participant ->> 'percentage', '')::NUMERIC;
    v_shares := NULLIF(v_participant ->> 'shares', '')::NUMERIC;
    v_allocated_amount := ROUND(COALESCE(NULLIF(v_participant ->> 'allocated_amount', '')::NUMERIC, 0), 2);

    IF num_nonnulls(v_member_user_id, v_managed_person_id) <> 1 THEN
      RAISE EXCEPTION 'Each recurring allocation must reference exactly one participant';
    END IF;

    IF v_member_user_id IS NOT NULL
       AND NOT public.is_space_member_user(NEW.space_id, v_member_user_id) THEN
      RAISE EXCEPTION 'Recurring allocation participants must belong to the selected Space';
    END IF;

    IF v_managed_person_id IS NOT NULL
       AND NOT public.is_space_managed_person(NEW.space_id, v_managed_person_id) THEN
      RAISE EXCEPTION 'Recurring managed participants must be linked to the selected Space';
    END IF;

    v_key := public.space_finance_participant_key(v_member_user_id, v_managed_person_id);
    IF v_key IS NULL THEN
      RAISE EXCEPTION 'Recurring allocation participant could not be resolved';
    END IF;

    IF array_position(v_seen_keys, v_key) IS NOT NULL THEN
      RAISE EXCEPTION 'Recurring allocation participants must be unique';
    END IF;
    v_seen_keys := array_append(v_seen_keys, v_key);

    IF NEW.split_method = 'exact' THEN
      IF v_allocated_amount < 0 THEN
        RAISE EXCEPTION 'Recurring exact allocations must be non-negative';
      END IF;
      v_total_exact := v_total_exact + v_allocated_amount;
    ELSIF NEW.split_method = 'percentage' THEN
      IF v_percentage IS NULL OR v_percentage < 0 THEN
        RAISE EXCEPTION 'Recurring allocation percentages must be non-negative';
      END IF;
      v_total_percentage := v_total_percentage + v_percentage;
    ELSIF NEW.split_method = 'shares' THEN
      IF v_shares IS NULL OR v_shares <= 0 THEN
        RAISE EXCEPTION 'Recurring allocation shares must be greater than 0';
      END IF;
      v_total_shares := v_total_shares + v_shares;
    END IF;
  END LOOP;

  IF NEW.split_method = 'exact' AND ABS(v_total_exact - v_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Recurring exact allocation totals must match the recurring amount';
  END IF;

  IF NEW.split_method = 'percentage' AND ABS(v_total_percentage - 100) > 0.0001 THEN
    RAISE EXCEPTION 'Recurring allocation percentages must total 100';
  END IF;

  IF NEW.split_method = 'shares' AND v_total_shares <= 0 THEN
    RAISE EXCEPTION 'Recurring allocation shares must total greater than 0';
  END IF;

  IF public.has_space_role(NEW.space_id, 'manager') THEN
    RETURN NEW;
  END IF;

  IF NOT (
    public.has_space_role(NEW.space_id, 'contributor')
    AND NEW.execution_permissions = 'owner_manager_contributor'
    AND v_creator_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Only a manager or an authorized contributor may save this Space recurring transaction';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_space_recurring_transaction
  ON public.recurring_transactions;
CREATE TRIGGER trg_validate_space_recurring_transaction
  BEFORE INSERT OR UPDATE ON public.recurring_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_validate_space_recurring_transaction();

-- ============================================================
-- SECTION 4: HELPERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_financial_account_scope_metadata(
  p_account_id UUID
)
RETURNS TABLE (
  account_id UUID,
  owner_user_id UUID,
  scope_type TEXT,
  space_id UUID,
  currency TEXT,
  is_active BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fa.id,
    fa.user_id,
    fa.scope_type,
    fa.space_id,
    fa.currency,
    fa.is_active
  FROM public.financial_accounts AS fa
  WHERE fa.id = p_account_id
    AND auth.uid() IS NOT NULL
    AND (
      fa.user_id = auth.uid()
      OR (
        COALESCE(fa.scope_type, CASE WHEN fa.space_id IS NULL THEN 'personal' ELSE 'space' END) = 'space'
        AND fa.space_id IS NOT NULL
        AND public.has_space_role(fa.space_id, 'viewer')
      )
      OR EXISTS (
        SELECT 1
        FROM public.space_account_permissions AS sap
        WHERE sap.account_id = fa.id
          AND public.has_space_role(sap.space_id, 'viewer')
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.space_finance_participant_key(
  p_user_id UUID,
  p_person_id UUID
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_user_id IS NOT NULL THEN CONCAT('user:', p_user_id::TEXT)
    WHEN p_person_id IS NOT NULL THEN CONCAT('person:', p_person_id::TEXT)
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.space_finance_reimbursement_status(
  p_amount NUMERIC,
  p_amount_paid NUMERIC
)
RETURNS public.reimbursement_status
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_amount_paid, 0) <= 0 THEN 'pending'::public.reimbursement_status
    WHEN COALESCE(p_amount_paid, 0) >= COALESCE(p_amount, 0) THEN 'settled'::public.reimbursement_status
    ELSE 'partially_paid'::public.reimbursement_status
  END
$$;

CREATE OR REPLACE FUNCTION public.space_transfer_member_permission(
  p_space_id UUID,
  p_role TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_role = 'owner' THEN public.has_space_role(p_space_id, 'owner')
    WHEN p_role = 'manager' THEN public.has_space_role(p_space_id, 'manager')
    WHEN p_role = 'contributor' THEN public.has_space_role(p_space_id, 'contributor')
    ELSE public.has_space_role(p_space_id, 'viewer')
  END
$$;

CREATE OR REPLACE FUNCTION public.sync_space_reimbursements_for_transaction(
  p_transaction_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction public.transactions%ROWTYPE;
  v_allocation RECORD;
  v_existing public.reimbursements%ROWTYPE;
  v_reimbursement_id UUID;
  v_expected_amount NUMERIC(18,2);
  v_needed_reimbursement_ids UUID[] := ARRAY[]::UUID[];
  v_payer_key TEXT;
  v_beneficiary_key TEXT;
  v_description TEXT;
BEGIN
  SELECT *
  INTO v_transaction
  FROM public.transactions
  WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_transaction.transaction_context IS DISTINCT FROM 'space'
     OR v_transaction.space_id IS NULL
     OR v_transaction.transaction_type IS DISTINCT FROM 'expense'::public.transaction_type THEN
    IF EXISTS (
      SELECT 1
      FROM public.reimbursements AS r
      WHERE r.transaction_id = p_transaction_id
        AND r.space_id IS NOT NULL
        AND r.generated_from = 'space_allocation'
        AND COALESCE(r.amount_paid, 0) > 0
        AND r.is_deleted = false
    ) THEN
      RAISE EXCEPTION 'Cannot automatically change a shared expense that already has settlement history';
    END IF;

    UPDATE public.reimbursements AS r
    SET
      status = 'cancelled',
      is_deleted = true,
      updated_at = NOW()
    WHERE r.transaction_id = p_transaction_id
      AND r.space_id IS NOT NULL
      AND r.generated_from = 'space_allocation'
      AND COALESCE(r.amount_paid, 0) = 0
      AND r.is_deleted = false;

    RETURN;
  END IF;

  v_payer_key := public.space_finance_participant_key(
    v_transaction.paid_by_user_id,
    v_transaction.paid_by_person_id
  );

  IF v_payer_key IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.reimbursements AS r
      WHERE r.transaction_id = p_transaction_id
        AND r.space_id = v_transaction.space_id
        AND r.generated_from = 'space_allocation'
        AND COALESCE(r.amount_paid, 0) > 0
        AND r.is_deleted = false
    ) THEN
      RAISE EXCEPTION 'Payer changes require a correction flow after settlements exist';
    END IF;

    UPDATE public.reimbursements AS r
    SET
      status = 'cancelled',
      is_deleted = true,
      updated_at = NOW()
    WHERE r.transaction_id = p_transaction_id
      AND r.space_id = v_transaction.space_id
      AND r.generated_from = 'space_allocation'
      AND COALESCE(r.amount_paid, 0) = 0
      AND r.is_deleted = false;

    RETURN;
  END IF;

  FOR v_allocation IN
    SELECT *
    FROM public.transaction_allocations
    WHERE transaction_id = p_transaction_id
    ORDER BY created_at ASC, id ASC
  LOOP
    v_expected_amount := ROUND(COALESCE(v_allocation.allocated_amount, 0), 2);
    IF v_expected_amount <= 0 THEN
      CONTINUE;
    END IF;

    v_beneficiary_key := public.space_finance_participant_key(
      v_allocation.member_user_id,
      v_allocation.managed_person_id
    );

    IF v_beneficiary_key IS NULL OR v_beneficiary_key = v_payer_key THEN
      CONTINUE;
    END IF;

    SELECT *
    INTO v_existing
    FROM public.reimbursements
    WHERE transaction_allocation_id = v_allocation.id
    LIMIT 1;

    v_description := CONCAT(
      COALESCE(NULLIF(BTRIM(v_transaction.description), ''), 'Shared expense'),
      ' reimbursement'
    );

    IF FOUND THEN
      IF COALESCE(v_existing.amount_paid, 0) > v_expected_amount + 0.01 THEN
        RAISE EXCEPTION 'Cannot reduce a settled reimbursement below the paid amount without a correction flow';
      END IF;

      UPDATE public.reimbursements AS r
      SET
        owner_id = COALESCE(r.owner_id, v_transaction.user_id),
        person_id = COALESCE(v_allocation.managed_person_id, r.person_id),
        transaction_id = v_transaction.id,
        amount = v_expected_amount,
        currency = v_transaction.currency,
        owed_by = CASE WHEN v_allocation.managed_person_id IS NOT NULL THEN 'person' ELSE 'user' END,
        owed_to = CASE WHEN v_transaction.paid_by_person_id IS NOT NULL THEN 'person' ELSE 'user' END,
        status = public.space_finance_reimbursement_status(v_expected_amount, r.amount_paid),
        description = v_description,
        space_id = v_transaction.space_id,
        payer_user_id = v_transaction.paid_by_user_id,
        payer_person_id = v_transaction.paid_by_person_id,
        beneficiary_user_id = v_allocation.member_user_id,
        beneficiary_person_id = v_allocation.managed_person_id,
        original_amount = v_expected_amount,
        generated_from = 'space_allocation',
        created_by_user_id = COALESCE(r.created_by_user_id, v_transaction.created_by_user_id, v_transaction.user_id),
        is_deleted = false,
        updated_at = NOW()
      WHERE r.id = v_existing.id;

      v_reimbursement_id := v_existing.id;
    ELSE
      INSERT INTO public.reimbursements (
        owner_id,
        person_id,
        transaction_id,
        amount,
        currency,
        owed_by,
        owed_to,
        status,
        description,
        amount_paid,
        is_deleted,
        space_id,
        transaction_allocation_id,
        payer_user_id,
        payer_person_id,
        beneficiary_user_id,
        beneficiary_person_id,
        original_amount,
        generated_from,
        created_by_user_id
      )
      VALUES (
        v_transaction.user_id,
        v_allocation.managed_person_id,
        v_transaction.id,
        v_expected_amount,
        v_transaction.currency,
        CASE WHEN v_allocation.managed_person_id IS NOT NULL THEN 'person' ELSE 'user' END,
        CASE WHEN v_transaction.paid_by_person_id IS NOT NULL THEN 'person' ELSE 'user' END,
        'pending',
        v_description,
        0,
        false,
        v_transaction.space_id,
        v_allocation.id,
        v_transaction.paid_by_user_id,
        v_transaction.paid_by_person_id,
        v_allocation.member_user_id,
        v_allocation.managed_person_id,
        v_expected_amount,
        'space_allocation',
        COALESCE(v_transaction.created_by_user_id, v_transaction.user_id)
      )
      RETURNING id INTO v_reimbursement_id;
    END IF;

    v_needed_reimbursement_ids := array_append(v_needed_reimbursement_ids, v_reimbursement_id);
  END LOOP;

  FOR v_existing IN
    SELECT *
    FROM public.reimbursements
    WHERE transaction_id = p_transaction_id
      AND space_id = v_transaction.space_id
      AND generated_from = 'space_allocation'
      AND is_deleted = false
  LOOP
    IF array_position(v_needed_reimbursement_ids, v_existing.id) IS NULL THEN
      IF COALESCE(v_existing.amount_paid, 0) > 0 THEN
        RAISE EXCEPTION 'Cannot remove a settled reimbursement automatically. Use a correction flow.';
      END IF;

      UPDATE public.reimbursements AS r
      SET
        status = 'cancelled',
        is_deleted = true,
        updated_at = NOW()
      WHERE r.id = v_existing.id;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_space_reimbursements_from_allocations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_space_reimbursements_for_transaction(COALESCE(NEW.transaction_id, OLD.transaction_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_space_reimbursements_from_allocations
  ON public.transaction_allocations;
-- Reimbursement synchronization must happen after the authoritative save path
-- has replaced the full allocation set, not row-by-row during allocation churn.

CREATE OR REPLACE FUNCTION public.trg_sync_space_reimbursements_from_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_space_reimbursements_for_transaction(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_space_reimbursements_from_transactions
  ON public.transactions;
-- Reimbursement synchronization for shared expenses is invoked explicitly from
-- the trusted Space transaction RPC after allocations are persisted.

CREATE OR REPLACE FUNCTION public.trg_guard_space_transaction_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.transaction_context = 'space'
     AND OLD.space_id IS NOT NULL
     AND OLD.transaction_type = 'expense'::public.transaction_type THEN
    IF EXISTS (
      SELECT 1
      FROM public.reimbursements AS r
      WHERE r.transaction_id = OLD.id
        AND r.space_id = OLD.space_id
        AND r.generated_from = 'space_allocation'
        AND COALESCE(r.amount_paid, 0) > 0
        AND r.is_deleted = false
    ) THEN
      RAISE EXCEPTION 'Cannot delete a shared expense with settlement history. Use a correction flow.';
    END IF;

    UPDATE public.reimbursements AS r
    SET
      status = 'cancelled',
      is_deleted = true,
      updated_at = NOW()
    WHERE r.transaction_id = OLD.id
      AND r.space_id = OLD.space_id
      AND r.generated_from = 'space_allocation'
      AND r.is_deleted = false;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_space_transaction_delete
  ON public.transactions;
CREATE TRIGGER trg_guard_space_transaction_delete
  BEFORE DELETE ON public.transactions
  FOR EACH ROW
  WHEN (OLD.transaction_context = 'space')
  EXECUTE FUNCTION public.trg_guard_space_transaction_delete();

-- ============================================================
-- SECTION 5: TRUSTED RPCS
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_create_scoped_transfer(
  p_from_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_source_amount NUMERIC DEFAULT NULL,
  p_source_currency TEXT DEFAULT NULL,
  p_destination_amount NUMERIC DEFAULT NULL,
  p_destination_currency TEXT DEFAULT NULL,
  p_exchange_rate NUMERIC DEFAULT NULL,
  p_exchange_rate_provider TEXT DEFAULT NULL,
  p_exchange_rate_snapshot_id UUID DEFAULT NULL,
  p_exchange_rate_date DATE DEFAULT NULL,
  p_exchange_rate_timestamp TIMESTAMPTZ DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_transfer_date DATE DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_transfer_purpose TEXT DEFAULT 'normal_transfer',
  p_recipient_user_id UUID DEFAULT NULL,
  p_reimbursement_id UUID DEFAULT NULL,
  p_settlement_id UUID DEFAULT NULL
)
RETURNS TABLE (
  transfer_id UUID,
  from_transaction_id UUID,
  to_transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_from_account public.financial_accounts%ROWTYPE;
  v_to_account public.financial_accounts%ROWTYPE;
  v_reimbursement public.reimbursements%ROWTYPE;
  v_settlement public.settlements%ROWTYPE;
  v_from_scope TEXT;
  v_to_scope TEXT;
  v_transfer_date DATE := COALESCE(p_transfer_date, CURRENT_DATE);
  v_source_amount NUMERIC(18,2) := ROUND(COALESCE(p_source_amount, p_amount)::NUMERIC, 2);
  v_destination_amount NUMERIC(18,2) := ROUND(COALESCE(p_destination_amount, p_amount)::NUMERIC, 2);
  v_source_currency TEXT;
  v_destination_currency TEXT;
  v_from_transaction_user_id UUID;
  v_to_transaction_user_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF ROUND(COALESCE(p_amount, 0)::NUMERIC, 2) <= 0 THEN
    RAISE EXCEPTION 'Transfer amount must be greater than 0';
  END IF;

  IF p_from_account_id IS NULL OR p_to_account_id IS NULL THEN
    RAISE EXCEPTION 'Both transfer accounts are required';
  END IF;

  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'Source and destination accounts must be different';
  END IF;

  IF p_transfer_purpose NOT IN ('normal_transfer', 'member_contribution', 'reimbursement_payout', 'settlement') THEN
    RAISE EXCEPTION 'Unsupported transfer purpose';
  END IF;

  IF v_source_amount <= 0 THEN
    RAISE EXCEPTION 'Source transfer amount must be greater than 0';
  END IF;

  IF v_destination_amount <= 0 THEN
    RAISE EXCEPTION 'Destination transfer amount must be greater than 0';
  END IF;

  SELECT *
  INTO v_from_account
  FROM public.financial_accounts
  WHERE id = p_from_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source transfer account not found';
  END IF;

  SELECT *
  INTO v_to_account
  FROM public.financial_accounts
  WHERE id = p_to_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Destination transfer account not found';
  END IF;

  IF COALESCE(v_from_account.is_active, false) = false
     OR COALESCE(v_to_account.is_active, false) = false THEN
    RAISE EXCEPTION 'Transfers require active accounts';
  END IF;

  v_from_scope := COALESCE(v_from_account.scope_type, CASE WHEN v_from_account.space_id IS NULL THEN 'personal' ELSE 'space' END);
  v_to_scope := COALESCE(v_to_account.scope_type, CASE WHEN v_to_account.space_id IS NULL THEN 'personal' ELSE 'space' END);
  v_source_currency := UPPER(COALESCE(NULLIF(BTRIM(p_source_currency), ''), NULLIF(BTRIM(p_currency), ''), v_from_account.currency));
  v_destination_currency := UPPER(COALESCE(NULLIF(BTRIM(p_destination_currency), ''), NULLIF(BTRIM(p_currency), ''), v_to_account.currency));
  v_from_transaction_user_id := CASE
    WHEN v_from_scope = 'personal' THEN v_from_account.user_id
    ELSE v_user_id
  END;
  v_to_transaction_user_id := CASE
    WHEN v_to_scope = 'personal' THEN v_to_account.user_id
    ELSE v_user_id
  END;

  IF v_source_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Source transfer currency must be a valid three-letter currency code';
  END IF;

  IF v_destination_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Destination transfer currency must be a valid three-letter currency code';
  END IF;

  IF UPPER(COALESCE(v_from_account.currency, '')) <> v_source_currency THEN
    RAISE EXCEPTION 'Source transfer currency must match the source account currency';
  END IF;

  IF UPPER(COALESCE(v_to_account.currency, '')) <> v_destination_currency THEN
    RAISE EXCEPTION 'Destination transfer currency must match the destination account currency';
  END IF;

  IF v_from_scope = 'personal' AND v_from_account.user_id IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'You may only transfer from your own personal accounts';
  END IF;

  IF v_from_scope = 'space' AND (
    v_from_account.space_id IS NULL
    OR NOT public.has_space_role(v_from_account.space_id, 'manager')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to move money from the selected Space account';
  END IF;

  IF p_recipient_user_id IS NOT NULL
     AND v_to_scope = 'personal'
     AND v_to_account.user_id IS DISTINCT FROM p_recipient_user_id THEN
    RAISE EXCEPTION 'Destination personal account does not belong to the selected recipient';
  END IF;

  IF p_reimbursement_id IS NOT NULL THEN
    SELECT *
    INTO v_reimbursement
    FROM public.reimbursements AS r
    WHERE r.id = p_reimbursement_id
      AND r.is_deleted = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked reimbursement could not be found for the selected transfer';
    END IF;
  END IF;

  IF p_settlement_id IS NOT NULL THEN
    SELECT *
    INTO v_settlement
    FROM public.settlements AS s
    WHERE s.id = p_settlement_id
      AND s.is_deleted = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Linked settlement could not be found for the selected transfer';
    END IF;
  END IF;

  IF v_to_scope = 'personal' AND v_to_account.user_id IS DISTINCT FROM v_user_id THEN
    IF p_transfer_purpose = 'settlement'
      AND p_settlement_id IS NOT NULL
      AND v_settlement.space_id IS NOT NULL
      AND v_settlement.receiver_user_id = v_to_account.user_id
      AND COALESCE(v_settlement.correction_status, 'applied') = 'applied'
      AND p_recipient_user_id = v_to_account.user_id THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Destination personal account must belong to the current user unless it is the exact validated recipient for a linked settlement';
    END IF;
  END IF;

  IF v_to_scope = 'space' AND (
    v_to_account.space_id IS NULL
    OR NOT public.has_space_role(v_to_account.space_id, 'viewer')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to transfer into the selected Space account';
  END IF;

  IF p_transfer_purpose = 'member_contribution' AND NOT (v_from_scope = 'personal' AND v_to_scope = 'space') THEN
    RAISE EXCEPTION 'Member contributions must move from a personal account into a Space account';
  END IF;

  IF p_transfer_purpose = 'member_contribution' AND (
    v_to_account.space_id IS NULL
    OR NOT public.has_space_role(v_to_account.space_id, 'contributor')
  ) THEN
    RAISE EXCEPTION 'You do not have permission to record a contribution for the selected Space';
  END IF;

  IF p_transfer_purpose = 'reimbursement_payout' THEN
    RAISE EXCEPTION 'Reimbursement payouts must use the reimbursement workflow so linked reimbursement balances update atomically';
  END IF;

  IF p_reimbursement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Linked reimbursements are not supported in the generic transfer RPC';
  END IF;

  IF p_settlement_id IS NOT NULL
     AND (
       v_settlement.space_id IS NULL
       OR NOT public.has_space_role(v_settlement.space_id, 'viewer')
     ) THEN
    RAISE EXCEPTION 'Linked settlement is not accessible for this Space';
  END IF;

  IF p_transfer_purpose = 'settlement' THEN
    IF p_settlement_id IS NULL THEN
      RAISE EXCEPTION 'Settlement transfers require a linked settlement';
    END IF;

    IF COALESCE(v_settlement.correction_status, 'applied') <> 'applied' THEN
      RAISE EXCEPTION 'Only active settlements may create account movement';
    END IF;

    IF public.space_finance_participant_key(
      v_settlement.payer_user_id,
      v_settlement.payer_person_id
    ) = public.space_finance_participant_key(
      v_settlement.receiver_user_id,
      COALESCE(v_settlement.receiver_person_id, v_settlement.person_id)
    ) THEN
      RAISE EXCEPTION 'Settlement payer and receiver must be different participants';
    END IF;

    IF v_settlement.payer_user_id IS NULL OR v_settlement.receiver_user_id IS NULL THEN
      RAISE EXCEPTION 'Settlement account movement requires user participants on both sides';
    END IF;

    IF v_from_scope <> 'personal' OR v_to_scope <> 'personal' THEN
      RAISE EXCEPTION 'Settlement account movement must transfer between the payer and receiver personal accounts';
    END IF;

    IF v_from_account.user_id IS DISTINCT FROM v_settlement.payer_user_id THEN
      RAISE EXCEPTION 'Settlement source account must belong to the settlement payer';
    END IF;

    IF v_to_account.user_id IS DISTINCT FROM v_settlement.receiver_user_id THEN
      RAISE EXCEPTION 'Settlement destination account must belong to the settlement receiver';
    END IF;

    IF UPPER(COALESCE(v_settlement.currency, '')) IS DISTINCT FROM v_source_currency
       OR UPPER(COALESCE(v_settlement.currency, '')) IS DISTINCT FROM v_destination_currency THEN
      RAISE EXCEPTION 'Settlement transfer currencies must match the settlement currency';
    END IF;

    IF ABS(v_source_amount - ROUND(COALESCE(v_settlement.amount, 0)::NUMERIC, 2)) > 0.01
       OR ABS(v_destination_amount - ROUND(COALESCE(v_settlement.amount, 0)::NUMERIC, 2)) > 0.01 THEN
      RAISE EXCEPTION 'Settlement transfer amounts must match the linked settlement amount';
    END IF;

    IF p_recipient_user_id IS DISTINCT FROM v_settlement.receiver_user_id THEN
      RAISE EXCEPTION 'Settlement transfer recipient must match the linked settlement receiver';
    END IF;
  ELSIF p_settlement_id IS NOT NULL THEN
    RAISE EXCEPTION 'Linked settlements are only supported for settlement transfers';
  END IF;

  INSERT INTO public.transactions (
    user_id,
    account_id,
    transaction_type,
    amount,
    currency,
    description,
    notes,
    transaction_date,
    transfer_pair_id,
    space_id,
    transaction_context,
    created_by_user_id
  )
  VALUES (
    v_from_transaction_user_id,
    p_from_account_id,
    'transfer'::public.transaction_type,
    v_source_amount,
    v_source_currency,
    COALESCE(NULLIF(BTRIM(p_description), ''), 'Transfer out'),
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    v_transfer_date,
    NULL,
    v_from_account.space_id,
    CASE WHEN v_from_scope = 'space' THEN 'space' ELSE 'personal' END,
    v_user_id
  )
  RETURNING id INTO from_transaction_id;

  INSERT INTO public.transactions (
    user_id,
    account_id,
    transaction_type,
    amount,
    currency,
    description,
    notes,
    transaction_date,
    transfer_pair_id,
    space_id,
    transaction_context,
    created_by_user_id
  )
  VALUES (
    v_to_transaction_user_id,
    p_to_account_id,
    'transfer'::public.transaction_type,
    v_destination_amount,
    v_destination_currency,
    COALESCE(NULLIF(BTRIM(p_description), ''), 'Transfer in'),
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    v_transfer_date,
    from_transaction_id,
    v_to_account.space_id,
    CASE WHEN v_to_scope = 'space' THEN 'space' ELSE 'personal' END,
    v_user_id
  )
  RETURNING id INTO to_transaction_id;

  UPDATE public.transactions
  SET transfer_pair_id = to_transaction_id
  WHERE id = from_transaction_id;

  INSERT INTO public.transfers (
    user_id,
    created_by_user_id,
    from_account_id,
    to_account_id,
    from_transaction_id,
    to_transaction_id,
    amount,
    currency,
    source_amount,
    source_currency,
    destination_amount,
    destination_currency,
    exchange_rate,
    exchange_rate_provider,
    exchange_rate_snapshot_id,
    exchange_rate_date,
    exchange_rate_timestamp,
    description,
    transfer_date,
    notes,
    source_scope_type,
    destination_scope_type,
    source_space_id,
    destination_space_id,
    transfer_purpose,
    reimbursement_id,
    settlement_id
  )
  VALUES (
    v_user_id,
    v_user_id,
    p_from_account_id,
    p_to_account_id,
    from_transaction_id,
    to_transaction_id,
    v_source_amount,
    v_source_currency,
    v_source_amount,
    v_source_currency,
    v_destination_amount,
    v_destination_currency,
    p_exchange_rate,
    NULLIF(BTRIM(COALESCE(p_exchange_rate_provider, '')), ''),
    p_exchange_rate_snapshot_id,
    p_exchange_rate_date,
    p_exchange_rate_timestamp,
    COALESCE(NULLIF(BTRIM(p_description), ''), 'Transfer'),
    v_transfer_date,
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    v_from_scope,
    v_to_scope,
    v_from_account.space_id,
    v_to_account.space_id,
    p_transfer_purpose,
    p_reimbursement_id,
    p_settlement_id
  )
  RETURNING id INTO transfer_id;

  IF p_transfer_purpose = 'member_contribution' THEN
    INSERT INTO public.space_contributions (
      space_id,
      contributor_user_id,
      source_account_id,
      destination_account_id,
      transfer_id,
      amount,
      currency,
      contributed_at,
      notes,
      created_by_user_id
    )
    VALUES (
      v_to_account.space_id,
      v_user_id,
      p_from_account_id,
      p_to_account_id,
      transfer_id,
      v_destination_amount,
      v_destination_currency,
      v_transfer_date,
      NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
      v_user_id
    );
  END IF;

  PERFORM public.rpc_recalculate_financial_account_balance(p_from_account_id);
  PERFORM public.rpc_recalculate_financial_account_balance(p_to_account_id);

  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_apply_space_settlement(
  p_space_id UUID,
  p_payer_user_id UUID DEFAULT NULL,
  p_payer_person_id UUID DEFAULT NULL,
  p_receiver_user_id UUID DEFAULT NULL,
  p_receiver_person_id UUID DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_currency TEXT DEFAULT NULL,
  p_settlement_date DATE DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_from_account_id UUID DEFAULT NULL,
  p_to_account_id UUID DEFAULT NULL,
  p_allocations JSONB DEFAULT '[]'::JSONB
)
RETURNS TABLE (
  settlement_id UUID,
  transfer_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_total_amount NUMERIC(18,2) := ROUND(COALESCE(p_amount, 0)::NUMERIC, 2);
  v_settlement_currency TEXT := UPPER(COALESCE(NULLIF(BTRIM(p_currency), ''), 'AED'));
  v_settlement_id UUID;
  v_transfer_id UUID := NULL;
  v_transfer_row RECORD;
  v_allocation RECORD;
  v_reimbursement public.reimbursements%ROWTYPE;
  v_reimbursement_id UUID;
  v_allocated NUMERIC(18,2);
  v_total_allocated NUMERIC(18,2) := 0;
  v_outstanding NUMERIC(18,2);
  v_allocation_count INTEGER := 0;
  v_seen_reimbursement_ids UUID[] := ARRAY[]::UUID[];
  v_payer_key TEXT;
  v_receiver_key TEXT;
  v_from_account public.financial_accounts%ROWTYPE;
  v_to_account public.financial_accounts%ROWTYPE;
  v_from_scope TEXT;
  v_to_scope TEXT;
  v_locked_reimbursement_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_space_id IS NULL THEN
    RAISE EXCEPTION 'Space is required';
  END IF;

  IF num_nonnulls(p_payer_user_id, p_payer_person_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one settlement payer is required';
  END IF;

  IF num_nonnulls(p_receiver_user_id, p_receiver_person_id) <> 1 THEN
    RAISE EXCEPTION 'Exactly one settlement receiver is required';
  END IF;

  IF NOT (
    public.has_space_role(p_space_id, 'manager')
    OR p_payer_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Only the payer, a manager, or the owner may record this settlement';
  END IF;

  v_payer_key := public.space_finance_participant_key(
    p_payer_user_id,
    p_payer_person_id
  );
  v_receiver_key := public.space_finance_participant_key(
    p_receiver_user_id,
    p_receiver_person_id
  );

  IF v_payer_key IS NULL OR v_receiver_key IS NULL THEN
    RAISE EXCEPTION 'Settlement participants are required';
  END IF;

  IF v_payer_key = v_receiver_key THEN
    RAISE EXCEPTION 'Settlement payer and receiver must be different participants';
  END IF;

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than 0';
  END IF;

  IF v_settlement_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Settlement currency must be a valid three-letter currency code';
  END IF;

  IF jsonb_typeof(COALESCE(p_allocations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Settlement allocations payload must be an array';
  END IF;

  SELECT COUNT(*)
  INTO v_allocation_count
  FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::JSONB));

  IF v_allocation_count = 0 THEN
    RAISE EXCEPTION 'At least one reimbursement allocation is required';
  END IF;

  IF (p_from_account_id IS NULL) <> (p_to_account_id IS NULL) THEN
    RAISE EXCEPTION 'Settlement account movement requires both source and destination accounts';
  END IF;

  IF p_from_account_id IS NOT NULL THEN
    IF p_payer_user_id IS NULL OR p_receiver_user_id IS NULL THEN
      RAISE EXCEPTION 'Account movement settlements require user participants on both sides';
    END IF;

    IF p_payer_user_id IS DISTINCT FROM v_user_id THEN
      RAISE EXCEPTION 'Only the paying user may execute settlement account movement';
    END IF;

    SELECT *
    INTO v_from_account
    FROM public.financial_accounts
    WHERE id = p_from_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Settlement source account not found';
    END IF;

    SELECT *
    INTO v_to_account
    FROM public.financial_accounts
    WHERE id = p_to_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Settlement destination account not found';
    END IF;

    IF COALESCE(v_from_account.is_active, false) = false
       OR COALESCE(v_to_account.is_active, false) = false THEN
      RAISE EXCEPTION 'Settlement account movement requires active accounts';
    END IF;

    v_from_scope := COALESCE(v_from_account.scope_type, CASE WHEN v_from_account.space_id IS NULL THEN 'personal' ELSE 'space' END);
    v_to_scope := COALESCE(v_to_account.scope_type, CASE WHEN v_to_account.space_id IS NULL THEN 'personal' ELSE 'space' END);

    IF v_from_scope <> 'personal' OR v_to_scope <> 'personal' THEN
      RAISE EXCEPTION 'Settlement account movement must use the payer and receiver personal accounts';
    END IF;

    IF v_from_account.user_id IS DISTINCT FROM p_payer_user_id THEN
      RAISE EXCEPTION 'Settlement source account must belong to the settlement payer';
    END IF;

    IF v_to_account.user_id IS DISTINCT FROM p_receiver_user_id THEN
      RAISE EXCEPTION 'Settlement destination account must belong to the settlement receiver';
    END IF;

    IF UPPER(COALESCE(v_from_account.currency, '')) IS DISTINCT FROM v_settlement_currency
       OR UPPER(COALESCE(v_to_account.currency, '')) IS DISTINCT FROM v_settlement_currency THEN
      RAISE EXCEPTION 'Settlement account currencies must match the settlement currency';
    END IF;
  END IF;

  FOR v_allocation IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::JSONB))
  LOOP
    v_reimbursement_id := NULLIF(v_allocation.value ->> 'reimbursement_id', '')::UUID;
    IF v_reimbursement_id IS NULL THEN
      RAISE EXCEPTION 'Each settlement allocation must include reimbursement_id';
    END IF;

    IF array_position(v_seen_reimbursement_ids, v_reimbursement_id) IS NOT NULL THEN
      RAISE EXCEPTION 'Duplicate reimbursement allocations are not allowed';
    END IF;
    v_seen_reimbursement_ids := array_append(v_seen_reimbursement_ids, v_reimbursement_id);
  END LOOP;

  FOR v_reimbursement IN
    SELECT *
    FROM public.reimbursements
    WHERE id = ANY(v_seen_reimbursement_ids)
      AND space_id = p_space_id
      AND is_deleted = false
    ORDER BY id
    FOR UPDATE
  LOOP
    v_locked_reimbursement_ids := array_append(v_locked_reimbursement_ids, v_reimbursement.id);
  END LOOP;

  IF COALESCE(array_length(v_locked_reimbursement_ids, 1), 0) <> COALESCE(array_length(v_seen_reimbursement_ids, 1), 0) THEN
    RAISE EXCEPTION 'One or more reimbursements could not be found for this Space';
  END IF;

  FOR v_allocation IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::JSONB))
  LOOP
    v_reimbursement_id := NULLIF(v_allocation.value ->> 'reimbursement_id', '')::UUID;
    SELECT *
    INTO v_reimbursement
    FROM public.reimbursements
    WHERE id = v_reimbursement_id
      AND space_id = p_space_id
      AND is_deleted = false;

    v_allocated := ROUND(COALESCE(NULLIF(v_allocation.value ->> 'amount', '')::NUMERIC, 0), 2);
    IF v_allocated <= 0 THEN
      RAISE EXCEPTION 'Settlement allocations must be greater than 0';
    END IF;

    IF UPPER(COALESCE(v_reimbursement.currency, '')) IS DISTINCT FROM v_settlement_currency THEN
      RAISE EXCEPTION 'Settlement allocation currency must match the reimbursement currency';
    END IF;

    IF public.space_finance_participant_key(
      v_reimbursement.beneficiary_user_id,
      COALESCE(v_reimbursement.beneficiary_person_id, v_reimbursement.person_id)
    ) IS DISTINCT FROM v_payer_key THEN
      RAISE EXCEPTION 'Settlement payer must match the reimbursement beneficiary';
    END IF;

    IF public.space_finance_participant_key(
      v_reimbursement.payer_user_id,
      v_reimbursement.payer_person_id
    ) IS DISTINCT FROM v_receiver_key THEN
      RAISE EXCEPTION 'Settlement receiver must match the reimbursement payer';
    END IF;

    v_outstanding := ROUND(COALESCE(v_reimbursement.amount, 0) - COALESCE(v_reimbursement.amount_paid, 0), 2);

    IF v_outstanding <= 0 THEN
      RAISE EXCEPTION 'Settlement allocations require reimbursements with outstanding amounts greater than 0';
    END IF;

    IF v_allocated > v_outstanding + 0.01 THEN
      RAISE EXCEPTION 'Settlement allocation exceeds reimbursement outstanding amount';
    END IF;

    v_total_allocated := v_total_allocated + v_allocated;
  END LOOP;

  IF ABS(v_total_allocated - v_total_amount) > 0.01 THEN
    RAISE EXCEPTION 'Settlement allocations must exactly match the settlement amount';
  END IF;

  INSERT INTO public.settlements (
    owner_id,
    person_id,
    amount,
    currency,
    settlement_date,
    payment_method,
    description,
    notes,
    is_deleted,
    space_id,
    payer_user_id,
    payer_person_id,
    receiver_user_id,
    receiver_person_id,
    created_by_user_id,
    correction_status
  )
  VALUES (
    v_user_id,
    p_receiver_person_id,
    v_total_amount,
    v_settlement_currency,
    COALESCE(p_settlement_date, CURRENT_DATE),
    CASE WHEN p_from_account_id IS NOT NULL AND p_to_account_id IS NOT NULL THEN 'account_transfer' ELSE 'off_platform' END,
    COALESCE(NULLIF(BTRIM(p_description), ''), 'Settlement'),
    NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
    false,
    p_space_id,
    p_payer_user_id,
    p_payer_person_id,
    p_receiver_user_id,
    p_receiver_person_id,
    v_user_id,
    'applied'
  )
  RETURNING id INTO v_settlement_id;

  FOR v_allocation IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::JSONB))
  LOOP
    v_reimbursement_id := NULLIF(v_allocation.value ->> 'reimbursement_id', '')::UUID;

    SELECT *
    INTO v_reimbursement
    FROM public.reimbursements
    WHERE id = v_reimbursement_id
      AND space_id = p_space_id
      AND is_deleted = false;

    v_allocated := ROUND(COALESCE(NULLIF(v_allocation.value ->> 'amount', '')::NUMERIC, 0), 2);

    INSERT INTO public.settlement_allocations (
      settlement_id,
      reimbursement_id,
      amount
    )
    VALUES (
      v_settlement_id,
      v_reimbursement.id,
      v_allocated
    );

    INSERT INTO public.reimbursement_payments (
      reimbursement_id,
      owner_id,
      amount,
      currency,
      payment_date,
      payment_method,
      notes,
      settlement_id,
      created_by_user_id
    )
    VALUES (
      v_reimbursement.id,
      v_user_id,
      v_allocated,
      v_reimbursement.currency,
      COALESCE(p_settlement_date, CURRENT_DATE),
      'settlement',
      NULLIF(BTRIM(COALESCE(p_notes, '')), ''),
      v_settlement_id,
      v_user_id
    );

    UPDATE public.reimbursements AS r
    SET
      amount_paid = COALESCE(r.amount_paid, 0) + v_allocated,
      status = public.space_finance_reimbursement_status(
        r.amount,
        COALESCE(r.amount_paid, 0) + v_allocated
      ),
      updated_at = NOW()
    WHERE r.id = v_reimbursement.id;
  END LOOP;

  IF p_from_account_id IS NOT NULL AND p_to_account_id IS NOT NULL THEN
    SELECT *
    INTO v_transfer_row
    FROM public.rpc_create_scoped_transfer(
      p_from_account_id,
      p_to_account_id,
      v_total_amount,
      v_settlement_currency,
      v_total_amount,
      v_settlement_currency,
      v_total_amount,
      v_settlement_currency,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      CONCAT(COALESCE(NULLIF(BTRIM(p_description), ''), 'Settlement'), ' transfer'),
      COALESCE(p_settlement_date, CURRENT_DATE),
      p_notes,
      'settlement',
      p_receiver_user_id,
      NULL,
      v_settlement_id
    );

    v_transfer_id := v_transfer_row.transfer_id;

    UPDATE public.settlements
    SET transfer_id = v_transfer_id
    WHERE id = v_settlement_id;

    UPDATE public.reimbursement_payments
    SET transfer_id = v_transfer_id
    WHERE settlement_id = v_settlement_id;
  END IF;

  settlement_id := v_settlement_id;
  transfer_id := v_transfer_id;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reverse_space_settlement(
  p_settlement_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
  settlement_id UUID,
  reversed_reimbursement_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_settlement public.settlements%ROWTYPE;
  v_payment RECORD;
  v_reversed_count INTEGER := 0;
  v_reversal_notes TEXT := NULLIF(BTRIM(COALESCE(p_notes, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_settlement
  FROM public.settlements
  WHERE id = p_settlement_id
    AND is_deleted = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Settlement could not be found';
  END IF;

  IF COALESCE(v_settlement.space_id, NULL) IS NULL THEN
    RAISE EXCEPTION 'This reversal RPC only supports Space settlements';
  END IF;

  IF COALESCE(v_settlement.correction_status, 'applied') <> 'applied' THEN
    RAISE EXCEPTION 'Settlement has already entered a correction flow';
  END IF;

  IF v_settlement.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Settlement has already been reversed';
  END IF;

  IF NOT (
    public.has_space_role(v_settlement.space_id, 'manager')
    OR v_settlement.payer_user_id = v_user_id
    OR v_settlement.created_by_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You do not have permission to reverse this settlement';
  END IF;

  IF v_settlement.transfer_id IS NOT NULL THEN
    RAISE EXCEPTION 'Settlements with account movement require a dedicated correction flow';
  END IF;

  UPDATE public.settlements
  SET
    correction_status = 'reversal_pending',
    updated_at = NOW()
  WHERE id = v_settlement.id;

  FOR v_payment IN
    SELECT rp.id, rp.reimbursement_id, rp.amount, rp.is_reversed
    FROM public.reimbursement_payments AS rp
    WHERE rp.settlement_id = v_settlement.id
    ORDER BY rp.created_at DESC, rp.id DESC
  LOOP
    IF COALESCE(v_payment.is_reversed, false) THEN
      RAISE EXCEPTION 'Settlement payment records have already been reversed';
    END IF;

    UPDATE public.reimbursements AS r
    SET
      amount_paid = GREATEST(0, COALESCE(r.amount_paid, 0) - COALESCE(v_payment.amount, 0)),
      status = public.space_finance_reimbursement_status(
        r.amount,
        GREATEST(0, COALESCE(r.amount_paid, 0) - COALESCE(v_payment.amount, 0))
      ),
      updated_at = NOW()
    WHERE r.id = v_payment.reimbursement_id;

    UPDATE public.reimbursement_payments AS rp
    SET
      is_reversed = true,
      reversed_at = NOW(),
      reversed_by_user_id = v_user_id,
      reversal_notes = v_reversal_notes
    WHERE rp.id = v_payment.id;

    v_reversed_count := v_reversed_count + 1;
  END LOOP;

  UPDATE public.settlement_allocations AS sa
  SET
    is_reversed = true,
    reversed_at = NOW(),
    reversed_by_user_id = v_user_id
  WHERE sa.settlement_id = v_settlement.id
    AND COALESCE(sa.is_reversed, false) = false;

  UPDATE public.settlements
  SET
    correction_status = 'reversed',
    reversed_at = NOW(),
    reversed_by_user_id = v_user_id,
    reversal_notes = v_reversal_notes,
    notes = CONCAT_WS(E'\n', NULLIF(BTRIM(notes), ''), v_reversal_notes),
    updated_at = NOW()
  WHERE id = v_settlement.id;

  settlement_id := v_settlement.id;
  reversed_reimbursement_count := v_reversed_count;
  RETURN NEXT;
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

  -- Synchronize generated reimbursements only after the authoritative transaction
  -- and its full allocation set have been persisted.
  PERFORM public.sync_space_reimbursements_for_transaction(v_existing_transaction.id);

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

CREATE OR REPLACE FUNCTION public.rpc_execute_space_recurring_transaction(
  p_recurring_id UUID
)
RETURNS TABLE (
  transaction_id UUID,
  next_due_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_recurring public.recurring_transactions%ROWTYPE;
  v_rpc_row RECORD;
  v_due_date DATE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO v_recurring
  FROM public.recurring_transactions
  WHERE id = p_recurring_id
    AND is_active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recurring transaction not found';
  END IF;

  IF v_recurring.space_id IS NULL THEN
    RAISE EXCEPTION 'This RPC only executes Space recurring transactions';
  END IF;

  IF NOT (
    (v_recurring.execution_permissions = 'owner_only' AND public.has_space_role(v_recurring.space_id, 'owner'))
    OR (v_recurring.execution_permissions = 'owner_manager' AND public.has_space_role(v_recurring.space_id, 'manager'))
    OR (v_recurring.execution_permissions = 'owner_manager_contributor' AND public.has_space_role(v_recurring.space_id, 'contributor'))
  ) THEN
    RAISE EXCEPTION 'You do not have permission to execute this recurring Space transaction';
  END IF;

  SELECT *
  INTO v_rpc_row
  FROM public.rpc_upsert_space_transaction(
    NULL,
    v_recurring.space_id,
    v_recurring.account_id,
    v_recurring.category_id,
    v_recurring.transaction_type::TEXT,
    v_recurring.amount,
    v_recurring.currency,
    v_recurring.description,
    v_recurring.merchant,
    NULL,
    v_recurring.next_due_date,
    COALESCE(v_recurring.tags, ARRAY[]::TEXT[]),
    true,
    v_recurring.id,
    v_recurring.paid_by_user_id,
    v_recurring.paid_by_person_id,
    v_recurring.split_method,
    COALESCE(v_recurring.allocation_template, '[]'::JSONB)
  );

  v_due_date := CASE v_recurring.frequency
    WHEN 'daily' THEN v_recurring.next_due_date + INTERVAL '1 day'
    WHEN 'weekly' THEN v_recurring.next_due_date + INTERVAL '7 day'
    WHEN 'biweekly' THEN v_recurring.next_due_date + INTERVAL '14 day'
    WHEN 'monthly' THEN (v_recurring.next_due_date + INTERVAL '1 month')
    WHEN 'quarterly' THEN (v_recurring.next_due_date + INTERVAL '3 month')
    WHEN 'yearly' THEN (v_recurring.next_due_date + INTERVAL '1 year')
    ELSE NULL
  END::DATE;

  IF v_due_date IS NULL THEN
    RAISE EXCEPTION 'Recurring schedule is incomplete for automatic execution';
  END IF;

  UPDATE public.recurring_transactions
  SET
    last_run_date = v_recurring.next_due_date,
    next_due_date = v_due_date,
    updated_at = NOW()
  WHERE id = p_recurring_id;

  transaction_id := v_rpc_row.transaction_id;
  next_due_date := v_due_date;
  RETURN NEXT;
END;
$$;

-- ============================================================
-- SECTION 6: RLS
-- ============================================================

DROP POLICY IF EXISTS "users_manage_own_transfers" ON public.transfers;
CREATE POLICY "users_manage_own_transfers" ON public.transfers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "transfers_space_member_select" ON public.transfers;
CREATE POLICY "transfers_space_member_select" ON public.transfers
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (source_space_id IS NOT NULL AND public.has_space_role(source_space_id, 'viewer'))
    OR (destination_space_id IS NOT NULL AND public.has_space_role(destination_space_id, 'viewer'))
  );

DROP POLICY IF EXISTS "reimbursements_owner_all" ON public.reimbursements;
CREATE POLICY "reimbursements_owner_all" ON public.reimbursements
  FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    AND space_id IS NULL
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND space_id IS NULL
  );

DROP POLICY IF EXISTS "reimbursement_payments_owner_all" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_owner_all" ON public.reimbursement_payments
  FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    AND reimbursement_id IN (
      SELECT r.id
      FROM public.reimbursements AS r
      WHERE r.space_id IS NULL
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND reimbursement_id IN (
      SELECT r.id
      FROM public.reimbursements AS r
      WHERE r.space_id IS NULL
    )
  );

DROP POLICY IF EXISTS "settlements_owner_all" ON public.settlements;
CREATE POLICY "settlements_owner_all" ON public.settlements
  FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    AND space_id IS NULL
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND space_id IS NULL
  );

DROP POLICY IF EXISTS "settlement_allocations_owner_all" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_owner_all" ON public.settlement_allocations
  FOR ALL TO authenticated
  USING (
    settlement_id IN (
      SELECT s.id
      FROM public.settlements AS s
      WHERE s.owner_id = auth.uid()
        AND s.space_id IS NULL
    )
  )
  WITH CHECK (
    settlement_id IN (
      SELECT s.id
      FROM public.settlements AS s
      WHERE s.owner_id = auth.uid()
        AND s.space_id IS NULL
    )
  );

DROP POLICY IF EXISTS "space_contributions_space_member_select" ON public.space_contributions;
CREATE POLICY "space_contributions_space_member_select" ON public.space_contributions
  FOR SELECT TO authenticated
  USING (public.has_space_role(space_id, 'viewer'));

DROP POLICY IF EXISTS "space_contributions_space_contributor_insert" ON public.space_contributions;
DROP POLICY IF EXISTS "space_contributions_space_manager_update" ON public.space_contributions;

DROP POLICY IF EXISTS "reimbursements_space_scope_select" ON public.reimbursements;
CREATE POLICY "reimbursements_space_scope_select" ON public.reimbursements
  FOR SELECT TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'viewer')
  );

DROP POLICY IF EXISTS "reimbursements_space_scope_insert" ON public.reimbursements;
DROP POLICY IF EXISTS "reimbursements_space_scope_update" ON public.reimbursements;

DROP POLICY IF EXISTS "reimbursement_payments_space_scope_select" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_space_scope_select" ON public.reimbursement_payments
  FOR SELECT TO authenticated
  USING (
    reimbursement_id IN (
      SELECT r.id
      FROM public.reimbursements AS r
      WHERE r.space_id IS NOT NULL
        AND public.has_space_role(r.space_id, 'viewer')
    )
  );

DROP POLICY IF EXISTS "reimbursement_payments_space_scope_insert" ON public.reimbursement_payments;
DROP POLICY IF EXISTS "settlements_space_scope_select" ON public.settlements;
CREATE POLICY "settlements_space_scope_select" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'viewer')
  );

DROP POLICY IF EXISTS "settlements_space_scope_insert" ON public.settlements;
DROP POLICY IF EXISTS "settlements_space_scope_update" ON public.settlements;

DROP POLICY IF EXISTS "settlement_allocations_space_scope_select" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_space_scope_select" ON public.settlement_allocations
  FOR SELECT TO authenticated
  USING (
    settlement_id IN (
      SELECT s.id
      FROM public.settlements AS s
      WHERE s.space_id IS NOT NULL
        AND public.has_space_role(s.space_id, 'viewer')
    )
  );

DROP POLICY IF EXISTS "settlement_allocations_space_scope_insert" ON public.settlement_allocations;

DROP POLICY IF EXISTS "users_manage_own_recurring_transactions" ON public.recurring_transactions;
CREATE POLICY "users_manage_own_recurring_transactions" ON public.recurring_transactions
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND space_id IS NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    AND space_id IS NULL
  );

DROP POLICY IF EXISTS "recurring_transactions_space_scope_select" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_space_scope_select" ON public.recurring_transactions
  FOR SELECT TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'viewer')
  );

DROP POLICY IF EXISTS "recurring_transactions_space_scope_insert" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_space_scope_insert" ON public.recurring_transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    space_id IS NOT NULL
    AND (
      public.has_space_role(space_id, 'manager')
      OR (
        public.has_space_role(space_id, 'contributor')
        AND execution_permissions = 'owner_manager_contributor'
        AND COALESCE(created_by_user_id, user_id, auth.uid()) = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "recurring_transactions_space_scope_update" ON public.recurring_transactions;
CREATE POLICY "recurring_transactions_space_scope_update" ON public.recurring_transactions
  FOR UPDATE TO authenticated
  USING (
    space_id IS NOT NULL
    AND (
      public.has_space_role(space_id, 'manager')
      OR (
        public.has_space_role(space_id, 'contributor')
        AND execution_permissions = 'owner_manager_contributor'
        AND COALESCE(created_by_user_id, user_id) = auth.uid()
      )
    )
  )
  WITH CHECK (
    space_id IS NOT NULL
    AND (
      public.has_space_role(space_id, 'manager')
      OR (
        public.has_space_role(space_id, 'contributor')
        AND execution_permissions = 'owner_manager_contributor'
        AND COALESCE(created_by_user_id, user_id) = auth.uid()
      )
    )
  );

-- ============================================================
-- SECTION 7: EXECUTE GRANTS
-- ============================================================

REVOKE ALL ON FUNCTION public.get_financial_account_scope_metadata(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.space_finance_participant_key(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.space_finance_participant_key(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.space_finance_reimbursement_status(NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.space_finance_reimbursement_status(NUMERIC, NUMERIC) TO authenticated;

REVOKE ALL ON FUNCTION public.space_transfer_member_permission(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.space_transfer_member_permission(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.sync_space_reimbursements_for_transaction(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.trg_sync_space_reimbursements_from_allocations() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.trg_sync_space_reimbursements_from_transactions() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.trg_guard_space_transaction_delete() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.trg_validate_space_recurring_transaction() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.rpc_create_scoped_transfer(
  UUID, UUID, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, DATE, TIMESTAMPTZ, TEXT, DATE, TEXT, TEXT, UUID, UUID, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_scoped_transfer(
  UUID, UUID, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, TEXT, UUID, DATE, TIMESTAMPTZ, TEXT, DATE, TEXT, TEXT, UUID, UUID, UUID
) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_apply_space_settlement(
  UUID, UUID, UUID, UUID, UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, UUID, UUID, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_apply_space_settlement(
  UUID, UUID, UUID, UUID, UUID, NUMERIC, TEXT, DATE, TEXT, TEXT, UUID, UUID, JSONB
) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_reverse_space_settlement(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reverse_space_settlement(UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.rpc_execute_space_recurring_transaction(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_execute_space_recurring_transaction(UUID) TO authenticated;

COMMIT;
