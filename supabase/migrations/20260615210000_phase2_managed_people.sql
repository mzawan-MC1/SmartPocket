-- ============================================================
-- Smart Pocket Phase 2 — Managed People, Spaces, Reimbursements
-- Migration: 20260615210000_phase2_managed_people.sql
-- ⚠️  SAFE MIGRATION — NO DROP TABLE, NO DROP TYPE CASCADE
-- All operations use CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- Safe to run multiple times (fully idempotent).
-- ============================================================

-- ============================================================
-- 1. NEW ENUM TYPES (safe — only create if not exists)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.relationship_type AS ENUM (
    'spouse', 'child', 'parent', 'sibling', 'friend',
    'relative', 'colleague', 'client', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.space_role AS ENUM (
    'owner', 'manager', 'contributor', 'viewer', 'dependent'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invitation_status AS ENUM (
    'pending', 'accepted', 'declined', 'revoked'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reimbursement_status AS ENUM (
    'pending', 'partially_paid', 'settled', 'waived', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.person_transaction_type AS ENUM (
    'money_received',
    'money_returned',
    'expense_from_held',
    'expense_paid_by_user',
    'expense_paid_by_person',
    'reimbursement_due_to_user',
    'reimbursement_due_to_person',
    'reimbursement_received',
    'reimbursement_paid',
    'settlement',
    'adjustment'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.space_type AS ENUM (
    'personal', 'family', 'household', 'child', 'friend', 'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. SPACES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  space_type public.space_type NOT NULL DEFAULT 'personal',
  description TEXT,
  color TEXT DEFAULT '#0f3460',
  icon TEXT DEFAULT 'Home',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. SPACE MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.space_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role public.space_role NOT NULL DEFAULT 'viewer',
  joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(space_id, user_id)
);

-- ============================================================
-- 4. SPACE INVITATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.space_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role public.space_role NOT NULL DEFAULT 'viewer',
  status public.invitation_status NOT NULL DEFAULT 'pending',
  token TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  expires_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 5. MANAGED PEOPLE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.managed_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  relationship public.relationship_type NOT NULL DEFAULT 'other',
  email TEXT,
  phone TEXT,
  photo_url TEXT,
  notes TEXT,
  preferred_currency TEXT DEFAULT 'AED',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  linked_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 6. PERSON ALIASES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.person_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.managed_people(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 7. PERSON LEDGER ENTRIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.person_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES public.managed_people(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  entry_type public.person_transaction_type NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  description TEXT NOT NULL DEFAULT '',
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 8. PERSON BALANCES VIEW (computed)
-- ============================================================
CREATE OR REPLACE VIEW public.person_balances AS
SELECT
  p.id AS person_id,
  p.owner_id,
  p.full_name,
  p.preferred_currency,
  COALESCE(SUM(CASE WHEN e.entry_type = 'money_received' THEN e.amount ELSE 0 END), 0) AS total_received,
  COALESCE(SUM(CASE WHEN e.entry_type = 'money_returned' THEN e.amount ELSE 0 END), 0) AS total_returned,
  COALESCE(SUM(CASE WHEN e.entry_type IN ('expense_from_held', 'expense_paid_by_user', 'expense_paid_by_person') THEN e.amount ELSE 0 END), 0) AS total_expenses,
  COALESCE(SUM(CASE WHEN e.entry_type = 'money_received' THEN e.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN e.entry_type IN ('money_returned', 'expense_from_held') THEN e.amount ELSE 0 END), 0) AS money_held,
  COALESCE(SUM(CASE WHEN e.entry_type IN ('reimbursement_due_to_user', 'expense_paid_by_user') THEN e.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN e.entry_type IN ('reimbursement_received', 'settlement') THEN e.amount ELSE 0 END), 0) AS person_owes_user,
  COALESCE(SUM(CASE WHEN e.entry_type = 'reimbursement_due_to_person' THEN e.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN e.entry_type = 'reimbursement_paid' THEN e.amount ELSE 0 END), 0) AS user_owes_person
FROM public.managed_people p
LEFT JOIN public.person_ledger_entries e
  ON e.person_id = p.id AND e.is_deleted = false
GROUP BY p.id, p.owner_id, p.full_name, p.preferred_currency;

-- ============================================================
-- 9. REIMBURSEMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reimbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.managed_people(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  ledger_entry_id UUID REFERENCES public.person_ledger_entries(id) ON DELETE SET NULL,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  owed_by TEXT NOT NULL DEFAULT 'person',  -- 'person' or 'user'
  owed_to TEXT NOT NULL DEFAULT 'user',    -- 'person' or 'user'
  status public.reimbursement_status NOT NULL DEFAULT 'pending',
  due_date DATE,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT,
  amount_paid NUMERIC(15,2) NOT NULL DEFAULT 0,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 10. REIMBURSEMENT PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reimbursement_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reimbursement_id UUID NOT NULL REFERENCES public.reimbursements(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 11. SETTLEMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES public.managed_people(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  receiving_account_id UUID REFERENCES public.financial_accounts(id) ON DELETE SET NULL,
  description TEXT NOT NULL DEFAULT '',
  notes TEXT,
  attachment_url TEXT,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 12. SETTLEMENT ALLOCATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settlement_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES public.settlements(id) ON DELETE CASCADE,
  reimbursement_id UUID NOT NULL REFERENCES public.reimbursements(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 13. EXTEND TRANSACTIONS TABLE (safe additive columns)
-- ============================================================
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS person_id UUID REFERENCES public.managed_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expense_owner TEXT DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS paid_by TEXT DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS paid_from TEXT DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS use_held_balance BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reimbursement_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reimbursement_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS settlement_reference TEXT DEFAULT NULL;

-- ============================================================
-- 14. ACTIVITY LOGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  previous_value JSONB,
  new_value JSONB,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 15. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_spaces_owner_id ON public.spaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_space_members_space_id ON public.space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_space_members_user_id ON public.space_members(user_id);
CREATE INDEX IF NOT EXISTS idx_space_invitations_space_id ON public.space_invitations(space_id);
CREATE INDEX IF NOT EXISTS idx_space_invitations_email ON public.space_invitations(email);
CREATE INDEX IF NOT EXISTS idx_managed_people_owner_id ON public.managed_people(owner_id);
CREATE INDEX IF NOT EXISTS idx_managed_people_space_id ON public.managed_people(space_id);
CREATE INDEX IF NOT EXISTS idx_person_ledger_person_id ON public.person_ledger_entries(person_id);
CREATE INDEX IF NOT EXISTS idx_person_ledger_owner_id ON public.person_ledger_entries(owner_id);
CREATE INDEX IF NOT EXISTS idx_person_ledger_date ON public.person_ledger_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_reimbursements_owner_id ON public.reimbursements(owner_id);
CREATE INDEX IF NOT EXISTS idx_reimbursements_person_id ON public.reimbursements(person_id);
CREATE INDEX IF NOT EXISTS idx_reimbursements_status ON public.reimbursements(status);
CREATE INDEX IF NOT EXISTS idx_settlements_owner_id ON public.settlements(owner_id);
CREATE INDEX IF NOT EXISTS idx_settlements_person_id ON public.settlements(person_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_transactions_person_id ON public.transactions(person_id);

-- ============================================================
-- 16. UPDATED_AT TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_spaces ON public.spaces;
CREATE TRIGGER set_updated_at_spaces
  BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_space_invitations ON public.space_invitations;
CREATE TRIGGER set_updated_at_space_invitations
  BEFORE UPDATE ON public.space_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_managed_people ON public.managed_people;
CREATE TRIGGER set_updated_at_managed_people
  BEFORE UPDATE ON public.managed_people
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_person_ledger ON public.person_ledger_entries;
CREATE TRIGGER set_updated_at_person_ledger
  BEFORE UPDATE ON public.person_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_reimbursements ON public.reimbursements;
CREATE TRIGGER set_updated_at_reimbursements
  BEFORE UPDATE ON public.reimbursements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_settlements ON public.settlements;
CREATE TRIGGER set_updated_at_settlements
  BEFORE UPDATE ON public.settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 17. ENABLE RLS
-- ============================================================
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.managed_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 18. RLS POLICIES
-- ============================================================

-- spaces: owner full access + members can read
DROP POLICY IF EXISTS "spaces_owner_all" ON public.spaces;
CREATE POLICY "spaces_owner_all" ON public.spaces
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "spaces_members_read" ON public.spaces;
CREATE POLICY "spaces_members_read" ON public.spaces
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT space_id FROM public.space_members WHERE user_id = auth.uid()
    )
  );

-- space_members: owner manages, members read own
DROP POLICY IF EXISTS "space_members_owner_all" ON public.space_members;
CREATE POLICY "space_members_owner_all" ON public.space_members
  FOR ALL TO authenticated
  USING (
    space_id IN (SELECT id FROM public.spaces WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    space_id IN (SELECT id FROM public.spaces WHERE owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "space_members_self_read" ON public.space_members;
CREATE POLICY "space_members_self_read" ON public.space_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- space_invitations: owner manages
DROP POLICY IF EXISTS "space_invitations_owner_all" ON public.space_invitations;
CREATE POLICY "space_invitations_owner_all" ON public.space_invitations
  FOR ALL TO authenticated
  USING (
    space_id IN (SELECT id FROM public.spaces WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    space_id IN (SELECT id FROM public.spaces WHERE owner_id = auth.uid())
  );

-- managed_people: owner full access + space members with appropriate role can read
DROP POLICY IF EXISTS "managed_people_owner_all" ON public.managed_people;
CREATE POLICY "managed_people_owner_all" ON public.managed_people
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "managed_people_space_members_read" ON public.managed_people;
CREATE POLICY "managed_people_space_members_read" ON public.managed_people
  FOR SELECT TO authenticated
  USING (
    space_id IS NOT NULL AND space_id IN (
      SELECT space_id FROM public.space_members WHERE user_id = auth.uid()
    )
  );

-- person_aliases: owner access
DROP POLICY IF EXISTS "person_aliases_owner_all" ON public.person_aliases;
CREATE POLICY "person_aliases_owner_all" ON public.person_aliases
  FOR ALL TO authenticated
  USING (
    person_id IN (SELECT id FROM public.managed_people WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    person_id IN (SELECT id FROM public.managed_people WHERE owner_id = auth.uid())
  );

-- person_ledger_entries: owner full access
DROP POLICY IF EXISTS "person_ledger_owner_all" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_owner_all" ON public.person_ledger_entries
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "person_ledger_space_members_read" ON public.person_ledger_entries;
CREATE POLICY "person_ledger_space_members_read" ON public.person_ledger_entries
  FOR SELECT TO authenticated
  USING (
    person_id IN (
      SELECT mp.id FROM public.managed_people mp
      JOIN public.space_members sm ON sm.space_id = mp.space_id
      WHERE sm.user_id = auth.uid() AND mp.space_id IS NOT NULL
    )
  );

-- reimbursements: owner full access
DROP POLICY IF EXISTS "reimbursements_owner_all" ON public.reimbursements;
CREATE POLICY "reimbursements_owner_all" ON public.reimbursements
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- reimbursement_payments: owner full access
DROP POLICY IF EXISTS "reimbursement_payments_owner_all" ON public.reimbursement_payments;
CREATE POLICY "reimbursement_payments_owner_all" ON public.reimbursement_payments
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- settlements: owner full access
DROP POLICY IF EXISTS "settlements_owner_all" ON public.settlements;
CREATE POLICY "settlements_owner_all" ON public.settlements
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- settlement_allocations: owner access via settlement
DROP POLICY IF EXISTS "settlement_allocations_owner_all" ON public.settlement_allocations;
CREATE POLICY "settlement_allocations_owner_all" ON public.settlement_allocations
  FOR ALL TO authenticated
  USING (
    settlement_id IN (SELECT id FROM public.settlements WHERE owner_id = auth.uid())
  )
  WITH CHECK (
    settlement_id IN (SELECT id FROM public.settlements WHERE owner_id = auth.uid())
  );

-- activity_logs: users see own logs
DROP POLICY IF EXISTS "activity_logs_user_all" ON public.activity_logs;
CREATE POLICY "activity_logs_user_all" ON public.activity_logs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- admin can read all activity logs
DROP POLICY IF EXISTS "activity_logs_admin_read" ON public.activity_logs;
CREATE POLICY "activity_logs_admin_read" ON public.activity_logs
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ============================================================
-- 19. PLATFORM SETTINGS — Phase 2 feature toggles (safe)
-- ============================================================
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS feature_managed_people BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_shared_spaces BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_invitations BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_reimbursements BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS feature_settlements BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS total_workspaces INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_managed_people INTEGER DEFAULT 0;
