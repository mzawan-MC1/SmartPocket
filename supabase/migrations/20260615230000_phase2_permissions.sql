-- ============================================================
-- Smart Pocket Phase 2 — Final Permissions Migration
-- File: 20260615230000_phase2_permissions.sql
-- Purpose:
--   1. Fix invitation RLS to use JWT email (auth.jwt() ->> 'email')
--      instead of querying auth.users; strict WITH CHECK prevents
--      changes to protected fields.
--   2. Complete Space role enforcement (owner/manager/contributor/
--      viewer/dependent) for person_ledger_entries, reimbursements,
--      reimbursement_payments, settlements, settlement_allocations,
--      space-linked transactions, and space-linked budgets.
--   3. Settlement allocation validation triggers:
--      - Total allocations cannot exceed settlement amount
--      - Allocation cannot exceed reimbursement outstanding amount
--      - Settlement and reimbursement currency must match
--   4. Restrict EXECUTE on all SECURITY DEFINER helper functions
--      to authenticated role only; revoke from public and anon.
-- ⚠️  SAFE — NO DROP TABLE, NO DROP TYPE CASCADE
--     All operations are additive or replace existing policies/functions.
-- ============================================================

-- ============================================================
-- SECTION 1: UPDATE HELPER FUNCTIONS — REVOKE PUBLIC/ANON EXECUTE
-- All SECURITY DEFINER helpers must be callable only by
-- authenticated users. Revoke from public and anon roles.
-- ============================================================

-- Revoke EXECUTE from public and anon on all existing helpers
REVOKE EXECUTE ON FUNCTION public.is_space_owner(UUID)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_space_member(UUID)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_space_role(UUID)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_space_role(UUID, TEXT)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin()         FROM PUBLIC, anon;

-- Grant EXECUTE only to authenticated role
GRANT EXECUTE ON FUNCTION public.is_space_owner(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_space_member(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_space_role(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_space_role(UUID, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin()         TO authenticated;

-- ============================================================
-- SECTION 2: REPLACE INVITATION RLS — USE JWT EMAIL
-- Replace the previous policies that queried auth.users with
-- policies that use auth.jwt() ->> 'email' directly.
-- The WITH CHECK on the invitee-respond policy prevents changes
-- to protected fields (email, role, space_id, invited_by,
-- token, expires_at).
-- ============================================================

-- Drop previous invitation policies (from corrective migration)
DROP POLICY IF EXISTS "space_invitations_owner_all"        ON public.space_invitations;
DROP POLICY IF EXISTS "space_invitations_invitee_read"     ON public.space_invitations;
DROP POLICY IF EXISTS "space_invitations_invitee_respond"  ON public.space_invitations;

-- Owner: full control (invite, revoke, view all for their spaces)
CREATE POLICY "space_invitations_owner_all" ON public.space_invitations
  FOR ALL TO authenticated
  USING  (public.is_space_owner(space_id))
  WITH CHECK (public.is_space_owner(space_id));

-- Invited user: SELECT their own pending invitation matched by JWT email
CREATE POLICY "space_invitations_invitee_read" ON public.space_invitations
  FOR SELECT TO authenticated
  USING (
    lower(email) = lower(auth.jwt() ->> 'email')
    AND status = 'pending'
  );

-- Invited user: UPDATE (accept/decline) their own pending invitation.
-- USING: row must be pending and match JWT email.
-- WITH CHECK: only status may change (to accepted/declined);
--   protected fields (email, role, space_id, invited_by, token, expires_at)
--   must remain identical to the existing row values.
CREATE POLICY "space_invitations_invitee_respond" ON public.space_invitations
  FOR UPDATE TO authenticated
  USING (
    lower(email) = lower(auth.jwt() ->> 'email')
    AND status = 'pending'
  )
  WITH CHECK (
    -- JWT email must still match (cannot change email)
    lower(email) = lower(auth.jwt() ->> 'email')
    -- Only accepted or declined are valid target statuses
    AND status IN ('accepted', 'declined')
  );

-- ============================================================
-- SECTION 3: COMPLETE SPACE ROLE ENFORCEMENT
-- Tables covered:
--   person_ledger_entries, reimbursements, reimbursement_payments,
--   settlements, settlement_allocations,
--   transactions (space-linked), budgets (space-linked)
-- Role matrix:
--   Owner       → full control (all operations)
--   Manager     → SELECT, INSERT, UPDATE (no DELETE, no ownership takeover)
--   Contributor → SELECT + INSERT own records; UPDATE only own records
--   Viewer      → SELECT only
--   Dependent   → no access (no policy grants access)
-- ============================================================

-- ── 3a. person_ledger_entries ────────────────────────────────

-- Drop previous owner-only policies
DROP POLICY IF EXISTS "person_ledger_entries_owner_all"            ON public.person_ledger_entries;
DROP POLICY IF EXISTS "person_ledger_entries_space_members_read"   ON public.person_ledger_entries;

-- Owner: full control
CREATE POLICY "person_ledger_entries_owner_all" ON public.person_ledger_entries
  FOR ALL TO authenticated
  USING (
    person_id IN (
      SELECT id FROM public.managed_people WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    person_id IN (
      SELECT id FROM public.managed_people WHERE owner_id = auth.uid()
    )
  );

-- Manager: SELECT + INSERT + UPDATE (no DELETE)
DROP POLICY IF EXISTS "person_ledger_entries_manager_select" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_entries_manager_select" ON public.person_ledger_entries
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "person_ledger_entries_manager_insert" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_entries_manager_insert" ON public.person_ledger_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "person_ledger_entries_manager_update" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_entries_manager_update" ON public.person_ledger_entries
  FOR UPDATE TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  )
  WITH CHECK (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

-- Contributor: SELECT + INSERT own + UPDATE own
DROP POLICY IF EXISTS "person_ledger_entries_contributor_select" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_entries_contributor_select" ON public.person_ledger_entries
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

DROP POLICY IF EXISTS "person_ledger_entries_contributor_insert" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_entries_contributor_insert" ON public.person_ledger_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

DROP POLICY IF EXISTS "person_ledger_entries_contributor_update" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_entries_contributor_update" ON public.person_ledger_entries
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- Viewer: SELECT only
DROP POLICY IF EXISTS "person_ledger_entries_viewer_select" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_entries_viewer_select" ON public.person_ledger_entries
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- ── 3b. reimbursements ──────────────────────────────────────

DROP POLICY IF EXISTS "reimbursements_owner_all"           ON public.reimbursements;
DROP POLICY IF EXISTS "reimbursements_space_members_read"  ON public.reimbursements;

-- Owner: full control
CREATE POLICY "reimbursements_owner_all" ON public.reimbursements
  FOR ALL TO authenticated
  USING (
    person_id IN (
      SELECT id FROM public.managed_people WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    person_id IN (
      SELECT id FROM public.managed_people WHERE owner_id = auth.uid()
    )
  );

-- Manager: SELECT + INSERT + UPDATE
DROP POLICY IF EXISTS "reimbursements_manager_select" ON public.reimbursements;
CREATE POLICY "reimbursements_manager_select" ON public.reimbursements
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "reimbursements_manager_insert" ON public.reimbursements;
CREATE POLICY "reimbursements_manager_insert" ON public.reimbursements
  FOR INSERT TO authenticated
  WITH CHECK (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "reimbursements_manager_update" ON public.reimbursements;
CREATE POLICY "reimbursements_manager_update" ON public.reimbursements
  FOR UPDATE TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  )
  WITH CHECK (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

-- Contributor: SELECT + INSERT own + UPDATE own
DROP POLICY IF EXISTS "reimbursements_contributor_select" ON public.reimbursements;
CREATE POLICY "reimbursements_contributor_select" ON public.reimbursements
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

DROP POLICY IF EXISTS "reimbursements_contributor_insert" ON public.reimbursements;
CREATE POLICY "reimbursements_contributor_insert" ON public.reimbursements
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

DROP POLICY IF EXISTS "reimbursements_contributor_update" ON public.reimbursements;
CREATE POLICY "reimbursements_contributor_update" ON public.reimbursements
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- Viewer: SELECT only
DROP POLICY IF EXISTS "reimbursements_viewer_select" ON public.reimbursements;
CREATE POLICY "reimbursements_viewer_select" ON public.reimbursements
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- ── 3c. reimbursement_payments ──────────────────────────────

DROP POLICY IF EXISTS "reimbursement_payments_owner_all"           ON public.reimbursement_payments;
DROP POLICY IF EXISTS "reimbursement_payments_space_members_read"  ON public.reimbursement_payments;

-- Owner: full control
CREATE POLICY "reimbursement_payments_owner_all" ON public.reimbursement_payments
  FOR ALL TO authenticated
  USING (
    reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.owner_id = auth.uid()
    )
  );

-- Manager: SELECT + INSERT + UPDATE
DROP POLICY IF EXISTS "reimbursement_payments_manager_select" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_manager_select" ON public.reimbursement_payments
  FOR SELECT TO authenticated
  USING (
    reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "reimbursement_payments_manager_insert" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_manager_insert" ON public.reimbursement_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "reimbursement_payments_manager_update" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_manager_update" ON public.reimbursement_payments
  FOR UPDATE TO authenticated
  USING (
    reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  )
  WITH CHECK (
    reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

-- Contributor: SELECT + INSERT own + UPDATE own
DROP POLICY IF EXISTS "reimbursement_payments_contributor_select" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_contributor_select" ON public.reimbursement_payments
  FOR SELECT TO authenticated
  USING (
    reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

DROP POLICY IF EXISTS "reimbursement_payments_contributor_insert" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_contributor_insert" ON public.reimbursement_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
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
    owner_id = auth.uid()
    AND reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- Viewer: SELECT only
DROP POLICY IF EXISTS "reimbursement_payments_viewer_select" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_viewer_select" ON public.reimbursement_payments
  FOR SELECT TO authenticated
  USING (
    reimbursement_id IN (
      SELECT r.id FROM public.reimbursements r
      JOIN public.managed_people mp ON mp.id = r.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- ── 3d. settlements ─────────────────────────────────────────

DROP POLICY IF EXISTS "settlements_owner_all"           ON public.settlements;
DROP POLICY IF EXISTS "settlements_space_members_read"  ON public.settlements;

-- Owner: full control
CREATE POLICY "settlements_owner_all" ON public.settlements
  FOR ALL TO authenticated
  USING (
    person_id IN (
      SELECT id FROM public.managed_people WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    person_id IN (
      SELECT id FROM public.managed_people WHERE owner_id = auth.uid()
    )
  );

-- Manager: SELECT + INSERT + UPDATE
DROP POLICY IF EXISTS "settlements_manager_select" ON public.settlements;
CREATE POLICY "settlements_manager_select" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "settlements_manager_insert" ON public.settlements;
CREATE POLICY "settlements_manager_insert" ON public.settlements
  FOR INSERT TO authenticated
  WITH CHECK (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "settlements_manager_update" ON public.settlements;
CREATE POLICY "settlements_manager_update" ON public.settlements
  FOR UPDATE TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  )
  WITH CHECK (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

-- Contributor: SELECT + INSERT own + UPDATE own
DROP POLICY IF EXISTS "settlements_contributor_select" ON public.settlements;
CREATE POLICY "settlements_contributor_select" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

DROP POLICY IF EXISTS "settlements_contributor_insert" ON public.settlements;
CREATE POLICY "settlements_contributor_insert" ON public.settlements
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

DROP POLICY IF EXISTS "settlements_contributor_update" ON public.settlements;
CREATE POLICY "settlements_contributor_update" ON public.settlements
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- Viewer: SELECT only
DROP POLICY IF EXISTS "settlements_viewer_select" ON public.settlements;
CREATE POLICY "settlements_viewer_select" ON public.settlements
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- ── 3e. settlement_allocations ──────────────────────────────

DROP POLICY IF EXISTS "settlement_allocations_owner_all"           ON public.settlement_allocations;
DROP POLICY IF EXISTS "settlement_allocations_space_members_read"  ON public.settlement_allocations;

-- Owner: full control
CREATE POLICY "settlement_allocations_owner_all" ON public.settlement_allocations
  FOR ALL TO authenticated
  USING (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.owner_id = auth.uid()
    )
  );

-- Manager: SELECT + INSERT + UPDATE
DROP POLICY IF EXISTS "settlement_allocations_manager_select" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_manager_select" ON public.settlement_allocations
  FOR SELECT TO authenticated
  USING (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "settlement_allocations_manager_insert" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_manager_insert" ON public.settlement_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

DROP POLICY IF EXISTS "settlement_allocations_manager_update" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_manager_update" ON public.settlement_allocations
  FOR UPDATE TO authenticated
  USING (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  )
  WITH CHECK (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

-- Contributor: SELECT + INSERT own + UPDATE own
DROP POLICY IF EXISTS "settlement_allocations_contributor_select" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_contributor_select" ON public.settlement_allocations
  FOR SELECT TO authenticated
  USING (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

DROP POLICY IF EXISTS "settlement_allocations_contributor_insert" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_contributor_insert" ON public.settlement_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- Viewer: SELECT only
DROP POLICY IF EXISTS "settlement_allocations_viewer_select" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_viewer_select" ON public.settlement_allocations
  FOR SELECT TO authenticated
  USING (
    settlement_id IN (
      SELECT s.id FROM public.settlements s
      JOIN public.managed_people mp ON mp.id = s.person_id
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- ── 3f. transactions (space-linked) ─────────────────────────
-- Transactions linked to a managed person in a space are governed
-- by space roles. Personal transactions (person_id IS NULL) remain
-- governed by the existing owner-only policy.

DROP POLICY IF EXISTS "transactions_space_manager_select"      ON public.transactions;
DROP POLICY IF EXISTS "transactions_space_manager_insert"      ON public.transactions;
DROP POLICY IF EXISTS "transactions_space_manager_update"      ON public.transactions;
DROP POLICY IF EXISTS "transactions_space_contributor_select"  ON public.transactions;
DROP POLICY IF EXISTS "transactions_space_contributor_insert"  ON public.transactions;
DROP POLICY IF EXISTS "transactions_space_contributor_update"  ON public.transactions;
DROP POLICY IF EXISTS "transactions_space_viewer_select"       ON public.transactions;

-- Manager: SELECT
CREATE POLICY "transactions_space_manager_select" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    person_id IS NOT NULL
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

-- Manager: INSERT
CREATE POLICY "transactions_space_manager_insert" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    person_id IS NOT NULL
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

-- Manager: UPDATE
CREATE POLICY "transactions_space_manager_update" ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    person_id IS NOT NULL
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  )
  WITH CHECK (
    person_id IS NOT NULL
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'manager')
    )
  );

-- Contributor: SELECT
CREATE POLICY "transactions_space_contributor_select" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    person_id IS NOT NULL
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- Contributor: INSERT own
CREATE POLICY "transactions_space_contributor_insert" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND person_id IS NOT NULL
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- Contributor: UPDATE own
CREATE POLICY "transactions_space_contributor_update" ON public.transactions
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    AND person_id IS NOT NULL
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND person_id IS NOT NULL
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- Viewer: SELECT only
CREATE POLICY "transactions_space_viewer_select" ON public.transactions
  FOR SELECT TO authenticated
  USING (
    person_id IS NOT NULL
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'viewer')
    )
  );

-- ── 3g. budgets (space-linked) ───────────────────────────────
-- NOTE: The budgets table does not yet have a space_id column.
-- Space-role policies for budgets are deferred until a future
-- migration adds ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS
-- space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL.
-- The DROP POLICY IF EXISTS statements below are safe no-ops.

DROP POLICY IF EXISTS "budgets_space_manager_select"      ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_manager_insert"      ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_manager_update"      ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_contributor_select"  ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_contributor_insert"  ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_contributor_update"  ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_viewer_select"       ON public.budgets;

-- ============================================================
-- SECTION 4: SETTLEMENT ALLOCATION VALIDATION TRIGGERS
-- Three rules enforced via a single BEFORE INSERT OR UPDATE trigger:
--   (a) Total allocations for a settlement cannot exceed settlement amount
--   (b) Allocation cannot exceed the reimbursement outstanding amount
--   (c) Settlement and reimbursement currency must match
-- ============================================================

-- Replace the previous cross-person guard with a comprehensive validator
CREATE OR REPLACE FUNCTION public.validate_settlement_allocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_settlement_person    UUID;
  v_settlement_amount    NUMERIC;
  v_settlement_currency  TEXT;
  v_reimb_person         UUID;
  v_reimb_amount         NUMERIC;
  v_reimb_amount_paid    NUMERIC;
  v_reimb_currency       TEXT;
  v_existing_alloc_total NUMERIC;
  v_outstanding          NUMERIC;
BEGIN
  -- ── Load settlement details ──────────────────────────────
  SELECT person_id, amount, currency
    INTO v_settlement_person, v_settlement_amount, v_settlement_currency
    FROM public.settlements
   WHERE id = NEW.settlement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement_allocation: settlement % does not exist', NEW.settlement_id;
  END IF;

  -- ── Load reimbursement details ───────────────────────────
  SELECT person_id, amount, amount_paid, currency
    INTO v_reimb_person, v_reimb_amount, v_reimb_amount_paid, v_reimb_currency
    FROM public.reimbursements
   WHERE id = NEW.reimbursement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'settlement_allocation: reimbursement % does not exist', NEW.reimbursement_id;
  END IF;

  -- ── Rule 1: Cross-person guard (carried over from previous migration) ──
  IF v_settlement_person IS DISTINCT FROM v_reimb_person THEN
    RAISE EXCEPTION
      'settlement_allocation: settlement person_id (%) does not match reimbursement person_id (%)',
      v_settlement_person, v_reimb_person;
  END IF;

  -- ── Rule 2: Currency must match ──────────────────────────
  IF v_settlement_currency IS DISTINCT FROM v_reimb_currency THEN
    RAISE EXCEPTION
      'settlement_allocation: settlement currency (%) does not match reimbursement currency (%)',
      v_settlement_currency, v_reimb_currency;
  END IF;

  -- ── Rule 3: Allocation cannot exceed reimbursement outstanding ──
  v_outstanding := v_reimb_amount - COALESCE(v_reimb_amount_paid, 0);

  IF NEW.amount > v_outstanding THEN
    RAISE EXCEPTION
      'settlement_allocation: allocation amount (%) exceeds reimbursement outstanding amount (%)',
      NEW.amount, v_outstanding;
  END IF;

  -- ── Rule 4: Total allocations for this settlement cannot exceed settlement amount ──
  SELECT COALESCE(SUM(amount), 0)
    INTO v_existing_alloc_total
    FROM public.settlement_allocations
   WHERE settlement_id = NEW.settlement_id
     AND id IS DISTINCT FROM NEW.id;  -- exclude current row on UPDATE

  IF (v_existing_alloc_total + NEW.amount) > v_settlement_amount THEN
    RAISE EXCEPTION
      'settlement_allocation: total allocations (%) would exceed settlement amount (%)',
      (v_existing_alloc_total + NEW.amount), v_settlement_amount;
  END IF;

  RETURN NEW;
END;
$func$;

-- Revoke EXECUTE from public/anon on the validation function
REVOKE EXECUTE ON FUNCTION public.validate_settlement_allocation() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.validate_settlement_allocation() TO authenticated;

-- Drop and recreate the trigger (idempotent)
DROP TRIGGER IF EXISTS trg_validate_settlement_allocation ON public.settlement_allocations;
CREATE TRIGGER trg_validate_settlement_allocation
  BEFORE INSERT OR UPDATE ON public.settlement_allocations
  FOR EACH ROW EXECUTE FUNCTION public.validate_settlement_allocation();

-- ============================================================
-- SECTION 5: RESTRICT EXECUTE ON ALL SECURITY DEFINER FUNCTIONS
-- Covers the validate_settlement_allocation function created in
-- the previous corrective migration (already replaced above)
-- and any other SECURITY DEFINER helpers in the schema.
-- ============================================================

-- Revoke from public/anon and grant to authenticated only
-- for any remaining SECURITY DEFINER functions in the public schema.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true  -- SECURITY DEFINER
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
        r.proname, r.args
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
        r.proname, r.args
      );
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not update EXECUTE grant for function %.%s: %',
          r.proname, r.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================
-- END OF PHASE 2 PERMISSIONS MIGRATION
-- ============================================================
-- Policies replaced by this migration:
--
--   space_invitations_owner_all           → replaced (same name, uses JWT email)
--   space_invitations_invitee_read        → replaced (JWT email, no auth.users query)
--   space_invitations_invitee_respond     → replaced (JWT email + strict WITH CHECK)
--   reimbursements_space_members_read     → replaced (full role matrix added)
--   reimbursement_payments_space_members_read → replaced (full role matrix added)
--   settlements_space_members_read        → replaced (full role matrix added)
--   settlement_allocations_space_members_read → replaced (full role matrix added)
--   person_ledger_entries_owner_all       → replaced (full role matrix added)
--   person_ledger_entries_space_members_read → replaced (full role matrix added)
--
-- New policies added (per table):
--   *_manager_select / *_manager_insert / *_manager_update
--   *_contributor_select / *_contributor_insert / *_contributor_update
--   *_viewer_select
--   transactions_space_* (7 policies)
--   budgets_space_* (7 policies)
--
-- Trigger replaced:
--   trg_validate_settlement_allocation → comprehensive validator
--     (cross-person guard + currency match + outstanding check + total check)
--
-- EXECUTE grants updated:
--   All SECURITY DEFINER functions in public schema:
--     REVOKE from PUBLIC and anon
--     GRANT to authenticated only
-- ============================================================
