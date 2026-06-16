-- ============================================================
-- Smart Pocket Phase 2 — Additive Columns + Budget Space RLS
-- File: 20260615240000_phase2_additive.sql
-- Purpose:
--   1. Add budgets.space_id (nullable FK to spaces)
--   2. Add created_by to shared financial tables where contributor
--      ownership must be tracked (separate from owner_id)
--   3. Safe backfill: created_by = owner_id for existing rows
--   4. Space-role RLS for budgets now that space_id exists
-- ⚠️  SAFE — NO DROP TABLE, NO DROP TYPE CASCADE
--     All operations are additive and idempotent.
-- ============================================================

-- ============================================================
-- SECTION 1: ADD budgets.space_id
-- ============================================================
ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_budgets_space_id ON public.budgets(space_id);

-- ============================================================
-- SECTION 2: ADD created_by to shared financial tables
-- These tables already have owner_id (the space owner / primary
-- user who manages the record). created_by tracks which
-- authenticated user (contributor/manager) actually created
-- the row — distinct from owner_id.
-- ============================================================

ALTER TABLE public.person_ledger_entries
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.reimbursements
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.reimbursement_payments
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.settlements
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- ============================================================
-- SECTION 3: SAFE BACKFILL
-- For existing rows, set created_by = owner_id.
-- This is safe because all existing rows were created by the
-- owner themselves (no contributors existed before Phase 2).
-- ============================================================
DO $$
BEGIN
  UPDATE public.person_ledger_entries
    SET created_by = owner_id
    WHERE created_by IS NULL;

  UPDATE public.reimbursements
    SET created_by = owner_id
    WHERE created_by IS NULL;

  UPDATE public.reimbursement_payments
    SET created_by = owner_id
    WHERE created_by IS NULL;

  UPDATE public.settlements
    SET created_by = owner_id
    WHERE created_by IS NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Backfill skipped or partial: %', SQLERRM;
END $$;

-- ============================================================
-- SECTION 4: INDEXES on created_by
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ple_created_by ON public.person_ledger_entries(created_by);
CREATE INDEX IF NOT EXISTS idx_reimb_created_by ON public.reimbursements(created_by);
CREATE INDEX IF NOT EXISTS idx_reimb_pay_created_by ON public.reimbursement_payments(created_by);
CREATE INDEX IF NOT EXISTS idx_settlements_created_by ON public.settlements(created_by);

-- ============================================================
-- SECTION 5: SPACE-ROLE RLS FOR BUDGETS
-- Now that budgets.space_id exists, add space-role policies.
-- Personal budgets (space_id IS NULL) remain owner-only.
-- ============================================================

-- Drop any previously deferred budget space policies
DROP POLICY IF EXISTS "budgets_space_owner_all"        ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_manager_select"   ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_manager_insert"   ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_manager_update"   ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_contributor_select" ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_contributor_insert" ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_contributor_update" ON public.budgets;
DROP POLICY IF EXISTS "budgets_space_viewer_select"    ON public.budgets;

-- Space Owner: full control over space-linked budgets
CREATE POLICY "budgets_space_owner_all" ON public.budgets
  FOR ALL TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.is_space_owner(space_id)
  )
  WITH CHECK (
    space_id IS NOT NULL
    AND public.is_space_owner(space_id)
  );

-- Manager: SELECT + INSERT + UPDATE on space-linked budgets
CREATE POLICY "budgets_space_manager_select" ON public.budgets
  FOR SELECT TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'manager')
  );

CREATE POLICY "budgets_space_manager_insert" ON public.budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'manager')
  );

CREATE POLICY "budgets_space_manager_update" ON public.budgets
  FOR UPDATE TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'manager')
  )
  WITH CHECK (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'manager')
  );

-- Contributor: SELECT + INSERT own + UPDATE own
CREATE POLICY "budgets_space_contributor_select" ON public.budgets
  FOR SELECT TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'contributor')
  );

CREATE POLICY "budgets_space_contributor_insert" ON public.budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'contributor')
    AND user_id = auth.uid()
  );

CREATE POLICY "budgets_space_contributor_update" ON public.budgets
  FOR UPDATE TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'contributor')
    AND user_id = auth.uid()
  )
  WITH CHECK (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'contributor')
    AND user_id = auth.uid()
  );

-- Viewer: SELECT only
CREATE POLICY "budgets_space_viewer_select" ON public.budgets
  FOR SELECT TO authenticated
  USING (
    space_id IS NOT NULL
    AND public.has_space_role(space_id, 'viewer')
  );

-- ============================================================
-- SECTION 6: UPDATE CONTRIBUTOR RLS ON FINANCIAL TABLES
-- Replace owner_id checks with created_by for contributor
-- INSERT/UPDATE policies (now that created_by column exists).
-- ============================================================

-- person_ledger_entries contributor insert/update
DROP POLICY IF EXISTS "person_ledger_entries_contributor_insert" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_entries_contributor_insert" ON public.person_ledger_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
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
    created_by = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- reimbursements contributor insert/update
DROP POLICY IF EXISTS "reimbursements_contributor_insert" ON public.reimbursements;
CREATE POLICY "reimbursements_contributor_insert" ON public.reimbursements
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
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
    created_by = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );

-- settlements contributor insert/update
DROP POLICY IF EXISTS "settlements_contributor_insert" ON public.settlements;
CREATE POLICY "settlements_contributor_insert" ON public.settlements
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
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
    created_by = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND person_id IN (
      SELECT mp.id FROM public.managed_people mp
      WHERE mp.space_id IS NOT NULL
        AND public.has_space_role(mp.space_id, 'contributor')
    )
  );
