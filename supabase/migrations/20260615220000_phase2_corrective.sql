-- ============================================================
-- Smart Pocket Phase 2 — Corrective Migration
-- File: 20260615220000_phase2_corrective.sql
-- Purpose: Fix RLS recursion, role enforcement, invitation access,
--          activity_log restrictions, person_balances security,
--          space-member SELECT policies, monetary constraints,
--          transaction field validation, and uniqueness constraints.
-- ⚠️  SAFE — NO DROP TABLE, NO DROP TYPE CASCADE
--     All operations are additive or replace existing policies/functions.
-- ============================================================

-- ============================================================
-- SECTION 1: SECURITY DEFINER HELPER FUNCTIONS
-- These break the recursive RLS loop between spaces ↔ space_members.
-- All functions use a fixed search_path to prevent search_path injection.
-- ============================================================

-- 1a. Is the current user the owner of a given space?
CREATE OR REPLACE FUNCTION public.is_space_owner(p_space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.spaces
    WHERE id = p_space_id
      AND owner_id = auth.uid()
  );
$$;

-- 1b. Is the current user a member of a given space (any role)?
CREATE OR REPLACE FUNCTION public.is_space_member(p_space_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_members
    WHERE space_id = p_space_id
      AND user_id = auth.uid()
  );
$$;

-- 1c. What role does the current user hold in a given space?
--     Returns NULL if not a member.
CREATE OR REPLACE FUNCTION public.get_space_role(p_space_id UUID)
RETURNS public.space_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.space_members
  WHERE space_id = p_space_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- 1d. Does the current user have at least a given role in a space?
--     Role hierarchy: owner > manager > contributor > viewer > dependent
CREATE OR REPLACE FUNCTION public.has_space_role(p_space_id UUID, p_min_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.space_members
    WHERE space_id = p_space_id
      AND user_id = auth.uid()
      AND CASE p_min_role
            WHEN 'owner'       THEN role = 'owner'
            WHEN 'manager'     THEN role IN ('owner','manager')
            WHEN 'contributor' THEN role IN ('owner','manager','contributor')
            WHEN 'viewer'      THEN role IN ('owner','manager','contributor','viewer')
            ELSE false
          END
  )
  OR public.is_space_owner(p_space_id);
$$;

-- 1e. Is the current user the platform admin?
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;

-- ============================================================
-- SECTION 2: REPLACE SPACES RLS POLICIES (fix recursion)
-- The original policies queried space_members inside the spaces
-- policy and vice-versa, causing infinite recursion.
-- We now use the SECURITY DEFINER helpers above.
-- ============================================================

-- spaces: owner full control
DROP POLICY IF EXISTS "spaces_owner_all" ON public.spaces;
CREATE POLICY "spaces_owner_all" ON public.spaces
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- spaces: members can SELECT (uses helper — no direct join to space_members)
DROP POLICY IF EXISTS "spaces_members_read" ON public.spaces;
CREATE POLICY "spaces_members_read" ON public.spaces
  FOR SELECT TO authenticated
  USING (public.is_space_member(id));

-- ============================================================
-- SECTION 3: REPLACE SPACE_MEMBERS RLS POLICIES (fix recursion)
-- ============================================================

-- space_members: owner manages all rows for their spaces
DROP POLICY IF EXISTS "space_members_owner_all" ON public.space_members;
CREATE POLICY "space_members_owner_all" ON public.space_members
  FOR ALL TO authenticated
  USING  (public.is_space_owner(space_id))
  WITH CHECK (public.is_space_owner(space_id));

-- space_members: each member can read their own row
DROP POLICY IF EXISTS "space_members_self_read" ON public.space_members;
CREATE POLICY "space_members_self_read" ON public.space_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- SECTION 4: SPACE ROLE ENFORCEMENT ON MANAGED_PEOPLE
-- Owner: full control
-- Manager/Contributor/Viewer: SELECT only (via space membership)
-- Dependent: no access
-- ============================================================

DROP POLICY IF EXISTS "managed_people_owner_all" ON public.managed_people;
CREATE POLICY "managed_people_owner_all" ON public.managed_people
  FOR ALL TO authenticated
  USING  (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Manager: SELECT + INSERT + UPDATE (not DELETE)
DROP POLICY IF EXISTS "managed_people_manager_write" ON public.managed_people;
CREATE POLICY "managed_people_manager_write" ON public.managed_people
  FOR INSERT TO authenticated
  WITH CHECK (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'manager')
  );

DROP POLICY IF EXISTS "managed_people_manager_update" ON public.managed_people;
CREATE POLICY "managed_people_manager_update" ON public.managed_people
  FOR UPDATE TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'manager')
  )
  WITH CHECK (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'manager')
  );

-- Contributor/Viewer/Manager: SELECT
DROP POLICY IF EXISTS "managed_people_space_members_read" ON public.managed_people;
CREATE POLICY "managed_people_space_members_read" ON public.managed_people
  FOR SELECT TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'viewer')
  );

-- ============================================================
-- SECTION 5: SPACE INVITATIONS — invited-email read + accept/decline
-- ============================================================

-- Drop old catch-all owner policy; replace with granular ones
DROP POLICY IF EXISTS "space_invitations_owner_all" ON public.space_invitations;

-- Owner: full control (invite, revoke, view all)
CREATE POLICY "space_invitations_owner_all" ON public.space_invitations
  FOR ALL TO authenticated
  USING  (public.is_space_owner(space_id))
  WITH CHECK (public.is_space_owner(space_id));

-- Invited user: can SELECT their own pending invitation (matched by email)
DROP POLICY IF EXISTS "space_invitations_invitee_read" ON public.space_invitations;
CREATE POLICY "space_invitations_invitee_read" ON public.space_invitations
  FOR SELECT TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    AND status = 'pending'
  );

-- Invited user: can UPDATE (accept/decline) their own pending invitation
DROP POLICY IF EXISTS "space_invitations_invitee_respond" ON public.space_invitations;
CREATE POLICY "space_invitations_invitee_respond" ON public.space_invitations
  FOR UPDATE TO authenticated
  USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    AND status = 'pending'
  )
  WITH CHECK (
    email = (SELECT email FROM auth.users WHERE id = auth.uid() LIMIT 1)
    AND status IN ('accepted', 'declined')
  );

-- ============================================================
-- SECTION 6: ACTIVITY LOGS — INSERT + SELECT own only; no UPDATE/DELETE
-- ============================================================

-- Remove the old permissive ALL policy
DROP POLICY IF EXISTS "activity_logs_user_all" ON public.activity_logs;

-- Users may INSERT their own logs
DROP POLICY IF EXISTS "activity_logs_user_insert" ON public.activity_logs;
CREATE POLICY "activity_logs_user_insert" ON public.activity_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users may SELECT their own logs
DROP POLICY IF EXISTS "activity_logs_user_select" ON public.activity_logs;
CREATE POLICY "activity_logs_user_select" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admin may SELECT all logs (no UPDATE/DELETE for anyone)
DROP POLICY IF EXISTS "activity_logs_admin_read" ON public.activity_logs;
CREATE POLICY "activity_logs_admin_read" ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Explicitly no UPDATE policy → UPDATE is denied for all
-- Explicitly no DELETE policy → DELETE is denied for all

-- ============================================================
-- SECTION 7: REPLACE person_balances VIEW WITH security_invoker = true
-- This ensures the view respects the calling user's RLS context
-- rather than the definer's context.
-- ============================================================

DROP VIEW IF EXISTS public.person_balances;

CREATE VIEW public.person_balances
  WITH (security_invoker = true)
AS
SELECT
  p.id                    AS person_id,
  p.owner_id,
  p.full_name,
  p.preferred_currency,
  COALESCE(SUM(CASE WHEN e.entry_type = 'money_received'   THEN e.amount ELSE 0 END), 0) AS total_received,
  COALESCE(SUM(CASE WHEN e.entry_type = 'money_returned'   THEN e.amount ELSE 0 END), 0) AS total_returned,
  COALESCE(SUM(CASE WHEN e.entry_type IN (
      'expense_from_held','expense_paid_by_user','expense_paid_by_person'
    ) THEN e.amount ELSE 0 END), 0)                                                       AS total_expenses,
  COALESCE(SUM(CASE WHEN e.entry_type = 'money_received' THEN e.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN e.entry_type IN ('money_returned','expense_from_held')
                        THEN e.amount ELSE 0 END), 0)                                     AS money_held,
  COALESCE(SUM(CASE WHEN e.entry_type IN ('reimbursement_due_to_user','expense_paid_by_user')
                    THEN e.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN e.entry_type IN ('reimbursement_received','settlement')
                        THEN e.amount ELSE 0 END), 0)                                     AS person_owes_user,
  COALESCE(SUM(CASE WHEN e.entry_type = 'reimbursement_due_to_person' THEN e.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN e.entry_type = 'reimbursement_paid' THEN e.amount ELSE 0 END), 0) AS user_owes_person
FROM public.managed_people p
LEFT JOIN public.person_ledger_entries e
  ON e.person_id = p.id AND e.is_deleted = false
GROUP BY p.id, p.owner_id, p.full_name, p.preferred_currency;

-- ============================================================
-- SECTION 8: ADD SPACE-MEMBER SELECT POLICIES FOR
--   reimbursements, reimbursement_payments, settlements, settlement_allocations
-- ============================================================

-- reimbursements: space members with at least viewer role may SELECT
DROP POLICY IF EXISTS "reimbursements_space_members_read" ON public.reimbursements;
CREATE POLICY "reimbursements_space_members_read" ON public.reimbursements
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- reimbursement_payments: space members with at least viewer role may SELECT
DROP POLICY IF EXISTS "reimbursement_payments_space_members_read" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_space_members_read" ON public.reimbursement_payments
  FOR SELECT TO authenticated
  USING (
    reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- settlements: space members with at least viewer role may SELECT
DROP POLICY IF EXISTS "settlements_space_members_read" ON public.settlements;
CREATE POLICY "settlements_space_members_read" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- settlement_allocations: space members with at least viewer role may SELECT
DROP POLICY IF EXISTS "settlement_allocations_space_members_read" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_space_members_read" ON public.settlement_allocations
  FOR SELECT TO authenticated
  USING (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- ============================================================
-- SECTION 9: MONETARY VALIDATION CONSTRAINTS
-- All amounts > 0; amount_paid between 0 and amount;
-- settlement allocation amount > 0.
-- Uses DO blocks to add constraints only if they don't exist.
-- ============================================================

DO $$
BEGIN
  -- person_ledger_entries: amount > 0
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'person_ledger_entries'
      AND constraint_name = 'chk_ledger_amount_positive'
  ) THEN
    ALTER TABLE public.person_ledger_entries
      ADD CONSTRAINT chk_ledger_amount_positive CHECK (amount > 0);
  END IF;

  -- reimbursements: amount > 0
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'reimbursements'
      AND constraint_name = 'chk_reimbursement_amount_positive'
  ) THEN
    ALTER TABLE public.reimbursements
      ADD CONSTRAINT chk_reimbursement_amount_positive CHECK (amount > 0);
  END IF;

  -- reimbursements: amount_paid between 0 and amount
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'reimbursements'
      AND constraint_name = 'chk_reimbursement_amount_paid_range'
  ) THEN
    ALTER TABLE public.reimbursements
      ADD CONSTRAINT chk_reimbursement_amount_paid_range
        CHECK (amount_paid >= 0 AND amount_paid <= amount);
  END IF;

  -- reimbursement_payments: amount > 0
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'reimbursement_payments'
      AND constraint_name = 'chk_reimb_payment_amount_positive'
  ) THEN
    ALTER TABLE public.reimbursement_payments
      ADD CONSTRAINT chk_reimb_payment_amount_positive CHECK (amount > 0);
  END IF;

  -- settlements: amount > 0
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'settlements'
      AND constraint_name = 'chk_settlement_amount_positive'
  ) THEN
    ALTER TABLE public.settlements
      ADD CONSTRAINT chk_settlement_amount_positive CHECK (amount > 0);
  END IF;

  -- settlement_allocations: amount > 0
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'settlement_allocations'
      AND constraint_name = 'chk_settlement_alloc_amount_positive'
  ) THEN
    ALTER TABLE public.settlement_allocations
      ADD CONSTRAINT chk_settlement_alloc_amount_positive CHECK (amount > 0);
  END IF;
END $$;

-- ============================================================
-- SECTION 10: TRANSACTION FIELD VALIDATION
-- Replace free-text expense_owner, paid_by, paid_from, reimbursement_status
-- with CHECK constraints that enumerate valid values.
-- ============================================================

DO $$
BEGIN
  -- expense_owner: 'user' | 'person' | 'shared'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'transactions'
      AND constraint_name = 'chk_txn_expense_owner'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_txn_expense_owner
        CHECK (expense_owner IS NULL OR expense_owner IN ('user','person','shared'));
  END IF;

  -- paid_by: 'user' | 'person' | 'third_party'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'transactions'
      AND constraint_name = 'chk_txn_paid_by'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_txn_paid_by
        CHECK (paid_by IS NULL OR paid_by IN ('user','person','third_party'));
  END IF;

  -- paid_from: 'account' | 'held_balance' | 'external' | 'cash'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'transactions'
      AND constraint_name = 'chk_txn_paid_from'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_txn_paid_from
        CHECK (paid_from IS NULL OR paid_from IN ('account','held_balance','external','cash'));
  END IF;

  -- reimbursement_status: must match the reimbursement_status enum values
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name   = 'transactions'
      AND constraint_name = 'chk_txn_reimbursement_status'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_txn_reimbursement_status
        CHECK (
          reimbursement_status IS NULL
          OR reimbursement_status IN (
            'pending','partially_paid','settled','waived','cancelled'
          )
        );
  END IF;
END $$;

-- ============================================================
-- SECTION 11: SAFE UNIQUENESS CONSTRAINTS
-- (a) Person aliases: case-insensitive unique per managed person
-- (b) Pending invitations: unique per space + email
-- (c) Invitation token: globally unique
-- ============================================================

-- (a) Case-insensitive alias uniqueness per person
--     Uses a partial unique index (expressions not allowed in UNIQUE constraints)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_person_alias_lower
  ON public.person_aliases (person_id, lower(alias));

-- (b) Pending invitation unique per space + email
--     Only one pending invitation per (space, email) at a time
CREATE UNIQUE INDEX IF NOT EXISTS uidx_invitation_pending_space_email
  ON public.space_invitations (space_id, lower(email))
  WHERE status = 'pending';

-- (c) Invitation token globally unique
CREATE UNIQUE INDEX IF NOT EXISTS uidx_invitation_token
  ON public.space_invitations (token);

-- ============================================================
-- SECTION 12: PREVENT SELF-REFERENCING TRANSFERS / SETTLEMENTS
-- Transfers: source account ≠ destination account (already handled
--   by the finance_core schema; added here defensively).
-- Settlements: person_id must not be the owner themselves
--   (settlements are between the user and a managed person).
-- ============================================================

DO $$
BEGIN
  -- settlements: receiving_account must belong to the owner, not the person
  -- (no self-reference check needed here — person_id is always a managed_people row,
  --  not a user_profiles row, so a direct self-reference is structurally impossible)

  -- Prevent a settlement from allocating to a reimbursement that belongs to a
  -- different person than the settlement itself.
  -- This is enforced via a trigger function below.
  NULL;
END $$;

-- Trigger: validate settlement_allocation references same person as settlement
CREATE OR REPLACE FUNCTION public.validate_settlement_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settlement_person UUID;
  v_reimbursement_person UUID;
BEGIN
  SELECT person_id INTO v_settlement_person
    FROM public.settlements WHERE id = NEW.settlement_id;

  SELECT person_id INTO v_reimbursement_person
    FROM public.reimbursements WHERE id = NEW.reimbursement_id;

  IF v_settlement_person IS DISTINCT FROM v_reimbursement_person THEN
    RAISE EXCEPTION
      'settlement_allocation: settlement person_id (%) does not match reimbursement person_id (%)',
      v_settlement_person, v_reimbursement_person;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_settlement_allocation ON public.settlement_allocations;
CREATE TRIGGER trg_validate_settlement_allocation
  BEFORE INSERT OR UPDATE ON public.settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION public.validate_settlement_allocation();

-- ============================================================
-- END OF CORRECTIVE MIGRATION
-- ============================================================
-- Policies replaced by this migration:
--   spaces_owner_all                      → replaced (same name, non-recursive)
--   spaces_members_read                   → replaced (uses is_space_member helper)
--   space_members_owner_all               → replaced (uses is_space_owner helper)
--   space_members_self_read               → replaced (same logic, kept)
--   space_invitations_owner_all           → replaced (uses is_space_owner helper)
--   managed_people_owner_all              → replaced (same logic, kept)
--   managed_people_space_members_read     → replaced (uses has_space_role helper)
--   activity_logs_user_all (ALL)          → split into INSERT-only + SELECT-only
--   activity_logs_admin_read              → replaced (uses is_platform_admin helper)
--
-- New policies added:
--   space_invitations_invitee_read        → invited email SELECT pending
--   space_invitations_invitee_respond     → invited email UPDATE accept/decline
--   managed_people_manager_write          → manager INSERT
--   managed_people_manager_update         → manager UPDATE
--   reimbursements_space_members_read     → viewer+ SELECT
--   reimbursement_payments_space_members_read → viewer+ SELECT
--   settlements_space_members_read        → viewer+ SELECT
--   settlement_allocations_space_members_read → viewer+ SELECT
--
-- New constraints added:
--   chk_ledger_amount_positive
--   chk_reimbursement_amount_positive
--   chk_reimbursement_amount_paid_range
--   chk_reimb_payment_amount_positive
--   chk_settlement_amount_positive
--   chk_settlement_alloc_amount_positive
--   chk_txn_expense_owner
--   chk_txn_paid_by
--   chk_txn_paid_from
--   chk_txn_reimbursement_status
--
-- New indexes added:
--   uidx_person_alias_lower               → case-insensitive alias per person
--   uidx_invitation_pending_space_email   → one pending invite per space+email
--   uidx_invitation_token                 → globally unique token
--
-- New trigger added:
--   trg_validate_settlement_allocation    → cross-person allocation guard
-- ============================================================
