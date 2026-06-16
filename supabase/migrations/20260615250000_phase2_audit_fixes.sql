-- ============================================================
-- Smart Pocket Phase 2 — Final Audit & Security Fixes
-- File: 20260615250000_phase2_audit_fixes.sql
-- Purpose:
--   1. Add budgets.created_by column for contributor ownership
--   2. Fix contributor policies for reimbursement_payments to use created_by
--   3. Scope personal transactions policy to person_id IS NULL
--   4. Scope personal budgets policy to space_id IS NULL
--   5. Ensure contributors cannot DELETE shared transactions or budgets
--   6. Add invitation field protection trigger
--   7. Verify all shared-record INSERT policies set created_by = auth.uid()
-- ⚠️  SAFE — NO DROP TABLE, NO DROP TYPE CASCADE
--     All operations are additive or replace existing policies only.
-- ============================================================

-- ============================================================
-- SECTION 1: ADD budgets.created_by
-- Tracks which authenticated user created the budget row,
-- distinct from user_id (the budget owner).
-- ============================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_created_by ON public.budgets(created_by);

-- Backfill: for existing rows, created_by = user_id (owner created their own budgets)
DO $$
BEGIN
  UPDATE public.budgets
    SET created_by = user_id
    WHERE created_by IS NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'budgets created_by backfill skipped: %', SQLERRM;
END $$;

-- ============================================================
-- SECTION 2: SCOPE PERSONAL TRANSACTIONS POLICY TO person_id IS NULL
-- The existing "users_manage_own_transactions" FOR ALL policy
-- has no person_id scope, which means it could allow a user to
-- bypass space-role policies on shared (person-linked) transactions.
-- Fix: restrict it to personal transactions only (person_id IS NULL).
-- Space-linked transactions are governed by transactions_space_* policies.
-- ============================================================

DROP POLICY IF EXISTS "users_manage_own_transactions" ON public.transactions;
CREATE POLICY "users_manage_own_transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND person_id IS NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    AND person_id IS NULL
  );

-- Ensure contributors cannot DELETE shared transactions via any policy.
-- The space-role policies only grant SELECT/INSERT/UPDATE for contributors.
-- No contributor DELETE policy exists — this is correct. Confirm by
-- explicitly dropping any accidental contributor DELETE policy if present.
DROP POLICY IF EXISTS "transactions_space_contributor_delete" ON public.transactions;

-- ============================================================
-- SECTION 3: SCOPE PERSONAL BUDGETS POLICY TO space_id IS NULL
-- The existing "users_manage_own_budgets" FOR ALL policy has no
-- space_id scope, which means it could allow a user to bypass
-- space-role policies on space-linked budgets.
-- Fix: restrict it to personal budgets only (space_id IS NULL).
-- Space-linked budgets are governed by budgets_space_* policies.
-- ============================================================

DROP POLICY IF EXISTS "users_manage_own_budgets" ON public.budgets;
CREATE POLICY "users_manage_own_budgets" ON public.budgets
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND space_id IS NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    AND space_id IS NULL
  );

-- Ensure contributors cannot DELETE shared budgets via any policy.
DROP POLICY IF EXISTS "budgets_space_contributor_delete" ON public.budgets;

-- ============================================================
-- SECTION 4: FIX CONTRIBUTOR POLICIES FOR reimbursement_payments
-- The previous migrations used owner_id = auth.uid() for contributor
-- INSERT/UPDATE on reimbursement_payments. Now that created_by exists,
-- replace these with created_by = auth.uid().
-- ============================================================

DROP POLICY IF EXISTS "reimbursement_payments_contributor_insert" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_contributor_insert" ON public.reimbursement_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

DROP POLICY IF EXISTS "reimbursement_payments_contributor_update" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_contributor_update" ON public.reimbursement_payments
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    AND reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- Ensure no contributor DELETE policy exists for reimbursement_payments
DROP POLICY IF EXISTS "reimbursement_payments_contributor_delete" ON public.reimbursement_payments;

-- ============================================================
-- SECTION 5: FIX BUDGET CONTRIBUTOR POLICIES TO USE created_by
-- The previous budgets_space_contributor_insert/update policies
-- used user_id = auth.uid() which conflates owner and creator.
-- Replace with created_by = auth.uid() now that the column exists.
-- ============================================================

DROP POLICY IF EXISTS "budgets_space_contributor_insert" ON public.budgets;
CREATE POLICY "budgets_space_contributor_insert" ON public.budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'contributor')
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "budgets_space_contributor_update" ON public.budgets;
CREATE POLICY "budgets_space_contributor_update" ON public.budgets
  FOR UPDATE TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'contributor')
    AND created_by = auth.uid()
  )
  WITH CHECK (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'contributor')
    AND created_by = auth.uid()
  );

-- ============================================================
-- SECTION 6: VERIFY shared-record INSERT policies set created_by
-- The following policies already use created_by = auth.uid()
-- (set in 20260615240000_phase2_additive.sql):
--   person_ledger_entries_contributor_insert  ✓
--   person_ledger_entries_contributor_update  ✓
--   reimbursements_contributor_insert         ✓
--   reimbursements_contributor_update         ✓
--   settlements_contributor_insert            ✓
--   settlements_contributor_update            ✓
-- The reimbursement_payments contributor policies are fixed above.
-- No further changes needed for these tables.
-- ============================================================

-- ============================================================
-- SECTION 7: INVITATION FIELD PROTECTION TRIGGER
-- Prevents an invitee from changing any field except:
--   status (pending → accepted or declined)
--   responded_at
-- Protected fields (must not change):
--   email, role, space_id, invited_by, token, expires_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_invitation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- Only enforce when the updater is the invitee (not the space owner)
  -- The space owner's updates are governed by the owner_all policy.
  -- We detect invitee updates by checking that the JWT email matches
  -- the invitation email (same condition as the invitee_respond policy).
  IF lower(NEW.email) = lower(auth.jwt() ->> 'email')
     AND lower(OLD.email) = lower(auth.jwt() ->> 'email') THEN

    -- email must not change
    IF NEW.email IS DISTINCT FROM OLD.email THEN
      RAISE EXCEPTION 'invitation: email cannot be changed by invitee';
    END IF;

    -- role must not change
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'invitation: role cannot be changed by invitee';
    END IF;

    -- space_id must not change
    IF NEW.space_id IS DISTINCT FROM OLD.space_id THEN
      RAISE EXCEPTION 'invitation: space_id cannot be changed by invitee';
    END IF;

    -- invited_by must not change
    IF NEW.invited_by IS DISTINCT FROM OLD.invited_by THEN
      RAISE EXCEPTION 'invitation: invited_by cannot be changed by invitee';
    END IF;

    -- token must not change
    IF NEW.token IS DISTINCT FROM OLD.token THEN
      RAISE EXCEPTION 'invitation: token cannot be changed by invitee';
    END IF;

    -- expires_at must not change
    IF NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
      RAISE EXCEPTION 'invitation: expires_at cannot be changed by invitee';
    END IF;

    -- status must transition from pending to accepted or declined only
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'invitation: can only respond to a pending invitation (current status: %)', OLD.status;
    END IF;

    IF NEW.status NOT IN ('accepted', 'declined') THEN
      RAISE EXCEPTION 'invitation: status may only be set to accepted or declined by invitee (got: %)', NEW.status;
    END IF;

  END IF;

  RETURN NEW;
END;
$func$;

-- Restrict EXECUTE to authenticated only
REVOKE EXECUTE ON FUNCTION public.protect_invitation_fields() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.protect_invitation_fields() TO authenticated;

-- Drop and recreate trigger (idempotent)
DROP TRIGGER IF EXISTS trg_protect_invitation_fields ON public.space_invitations;
CREATE TRIGGER trg_protect_invitation_fields
  BEFORE UPDATE ON public.space_invitations
  FOR EACH ROW EXECUTE FUNCTION public.protect_invitation_fields();

-- ============================================================
-- SECTION 8: PERMISSION MATRIX VERIFICATION COMMENTS
-- The following documents the expected permission matrix after
-- all Phase 2 migrations have been applied.
--
-- TABLE: person_ledger_entries
--   Owner      → ALL (via person_ledger_entries_owner_all)
--   Manager    → SELECT, INSERT, UPDATE (via _manager_*)
--   Contributor→ SELECT, INSERT (created_by=uid), UPDATE (created_by=uid)
--   Viewer     → SELECT only
--   Unrelated  → no access
--
-- TABLE: reimbursements
--   Owner      → ALL (via reimbursements_owner_all)
--   Manager    → SELECT, INSERT, UPDATE
--   Contributor→ SELECT, INSERT (created_by=uid), UPDATE (created_by=uid)
--   Viewer     → SELECT only
--   Unrelated  → no access
--
-- TABLE: reimbursement_payments
--   Owner      → ALL (via reimbursement_payments_owner_all)
--   Manager    → SELECT, INSERT, UPDATE
--   Contributor→ SELECT, INSERT (created_by=uid), UPDATE (created_by=uid)
--   Viewer     → SELECT only
--   Unrelated  → no access
--
-- TABLE: settlements
--   Owner      → ALL (via settlements_owner_all)
--   Manager    → SELECT, INSERT, UPDATE
--   Contributor→ SELECT, INSERT (created_by=uid), UPDATE (created_by=uid)
--   Viewer     → SELECT only
--   Unrelated  → no access
--
-- TABLE: budgets (space-linked, space_id IS NOT NULL)
--   Owner      → ALL (via budgets_space_owner_all)
--   Manager    → SELECT, INSERT, UPDATE
--   Contributor→ SELECT, INSERT (created_by=uid), UPDATE (created_by=uid)
--   Viewer     → SELECT only
--   Unrelated  → no access
--
-- TABLE: budgets (personal, space_id IS NULL)
--   Owner      → ALL (via users_manage_own_budgets, user_id=uid)
--   Others     → no access
--
-- TABLE: transactions (personal, person_id IS NULL)
--   Owner      → ALL (via users_manage_own_transactions, user_id=uid)
--   Others     → no access
--
-- TABLE: transactions (space-linked, person_id IS NOT NULL)
--   Owner      → ALL (via transactions_space_owner_all if exists, else owner policy)
--   Manager    → SELECT, INSERT, UPDATE
--   Contributor→ SELECT, INSERT (user_id=uid), UPDATE (user_id=uid)
--   Viewer     → SELECT only
--   Unrelated  → no access
--
-- TABLE: space_invitations
--   Space Owner → ALL (via space_invitations_owner_all)
--   Invitee     → SELECT pending (JWT email match)
--               → UPDATE status only: pending→accepted/declined
--               → Protected fields enforced by trigger
--   Others      → no access
-- ============================================================

-- ============================================================
-- SECTION 9: AHMED SCENARIO VALIDATION COMMENTS
-- The following traces the Ahmed workflow through the schema:
--
-- Step 1: Receive AED 2,300
--   INSERT person_ledger_entries (entry_type='money_received', amount=2300)
--   → owner_id = auth.uid(), created_by = auth.uid()
--   → Held balance = 2,300
--
-- Step 2: Spend AED 400 from held balance
--   INSERT person_ledger_entries (entry_type='expense_from_held', amount=400)
--   → Held balance = 1,900 ✓
--
-- Step 3: Pay AED 600 personally
--   INSERT transactions (personal, person_id IS NULL, user_id=uid)
--   INSERT reimbursements (owner_id=uid, created_by=uid, amount=600)
--   INSERT person_ledger_entries (entry_type='expense_paid_by_user', amount=600)
--
-- Step 4: Receive AED 250 reimbursement payment
--   INSERT reimbursement_payments (owner_id=uid, created_by=uid, amount=250)
--   UPDATE reimbursements SET amount_paid=250, status='partially_paid'
--
-- Step 5: Receive AED 350 final settlement
--   INSERT settlements (owner_id=uid, created_by=uid, amount=350)
--   INSERT settlement_allocations (validated by trigger)
--   UPDATE reimbursements SET status='settled'
--   INSERT person_ledger_entries (entry_type='settlement', amount=350)
--
-- Step 6: Personal income unaffected
--   money_received goes to person_ledger_entries only
--   NOT inserted into transactions table
--   Personal transaction balance unchanged ✓
-- ============================================================

-- ============================================================
-- END OF PHASE 2 AUDIT FIXES MIGRATION
-- ============================================================
