-- ============================================================
-- Smart Pocket Phase 1 — Core Finance Schema
-- Migration: 20260615150000_finance_core_schema.sql
-- ============================================================
-- ⚠️  WARNING: DEVELOPMENT-ONLY DESTRUCTIVE MIGRATION
-- ============================================================
-- This migration uses DROP TABLE ... CASCADE and DROP TYPE ... CASCADE
-- to ensure a clean recreation of all finance tables and ENUMs.
--
-- ❌ NEVER RUN THIS MIGRATION AGAINST A DATABASE CONTAINING USER DATA.
-- ❌ Running this will permanently delete all financial_accounts,
--    transactions, budgets, recurring_transactions, transfers,
--    categories, and receipt_attachments records.
--
-- ✅ For all future schema changes, use:
--    supabase/migrations/20260615160000_phase1_corrective_safe.sql
--    or create a new migration using only:
--      - CREATE TABLE IF NOT EXISTS
--      - ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--      - Safe indexes and constraints
-- ============================================================

-- ============================================================
-- 1. TYPES
-- ============================================================
DROP TYPE IF EXISTS public.account_type CASCADE;
CREATE TYPE public.account_type AS ENUM ('bank', 'credit_card', 'cash', 'savings', 'digital_wallet', 'investment', 'other');

DROP TYPE IF EXISTS public.transaction_type CASCADE;
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense', 'transfer');

DROP TYPE IF EXISTS public.budget_period CASCADE;
CREATE TYPE public.budget_period AS ENUM ('monthly', 'weekly', 'yearly', 'custom');

DROP TYPE IF EXISTS public.recurrence_frequency CASCADE;
CREATE TYPE public.recurrence_frequency AS ENUM ('daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly');

DROP TYPE IF EXISTS public.category_type CASCADE;
CREATE TYPE public.category_type AS ENUM ('income', 'expense', 'transfer');

-- ============================================================
-- 2. DROP TABLES (to ensure clean recreation after type drops)
-- ============================================================
DROP TABLE IF EXISTS public.transfers CASCADE;
DROP TABLE IF EXISTS public.receipt_attachments CASCADE;
DROP TABLE IF EXISTS public.recurring_transactions CASCADE;
DROP TABLE IF EXISTS public.budgets CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;
DROP TABLE IF EXISTS public.financial_accounts CASCADE;

-- ============================================================
-- 3. TABLES
-- ============================================================

-- Financial Accounts
CREATE TABLE public.financial_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type public.account_type NOT NULL DEFAULT 'bank',
  currency TEXT NOT NULL DEFAULT 'AED',
  opening_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  current_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#0f3460',
  icon TEXT DEFAULT 'Building2',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  include_in_total BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_type public.category_type NOT NULL DEFAULT 'expense',
  color TEXT DEFAULT '#6b7280',
  icon TEXT DEFAULT 'Tag',
  is_system BOOLEAN NOT NULL DEFAULT false,
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Transactions
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  transaction_type public.transaction_type NOT NULL DEFAULT 'expense',
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  description TEXT NOT NULL DEFAULT '',
  merchant TEXT,
  notes TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_id UUID,
  transfer_pair_id UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Receipt Attachments
CREATE TABLE public.receipt_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Budgets
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  period public.budget_period NOT NULL DEFAULT 'monthly',
  period_start DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  period_end DATE,
  rollover BOOLEAN NOT NULL DEFAULT false,
  alert_at_percent INTEGER DEFAULT 80,
  currency TEXT NOT NULL DEFAULT 'AED',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Recurring Transactions
CREATE TABLE public.recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  transaction_type public.transaction_type NOT NULL DEFAULT 'expense',
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  description TEXT NOT NULL,
  merchant TEXT,
  frequency public.recurrence_frequency NOT NULL DEFAULT 'monthly',
  next_due_date DATE NOT NULL,
  last_run_date DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  auto_create BOOLEAN NOT NULL DEFAULT false,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Transfers (links two transactions)
CREATE TABLE public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  from_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  to_account_id UUID NOT NULL REFERENCES public.financial_accounts(id) ON DELETE CASCADE,
  from_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  to_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  amount NUMERIC(15,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'AED',
  description TEXT DEFAULT '',
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 4. INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_financial_accounts_user_id ON public.financial_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON public.categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_type ON public.categories(category_type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON public.transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON public.transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_receipt_attachments_transaction_id ON public.receipt_attachments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON public.budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_id ON public.recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_next_due ON public.recurring_transactions(next_due_date);
CREATE INDEX IF NOT EXISTS idx_transfers_user_id ON public.transfers(user_id);

-- ============================================================
-- 5. FUNCTIONS
-- ============================================================

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 6. ENABLE RLS
-- ============================================================
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. RLS POLICIES
-- ============================================================

-- financial_accounts
DROP POLICY IF EXISTS "users_manage_own_financial_accounts" ON public.financial_accounts;
CREATE POLICY "users_manage_own_financial_accounts" ON public.financial_accounts
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- categories: users manage their own + can read system categories
DROP POLICY IF EXISTS "users_read_categories" ON public.categories;
CREATE POLICY "users_read_categories" ON public.categories
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR is_system = true);

DROP POLICY IF EXISTS "users_manage_own_categories" ON public.categories;
CREATE POLICY "users_manage_own_categories" ON public.categories
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- transactions
DROP POLICY IF EXISTS "users_manage_own_transactions" ON public.transactions;
CREATE POLICY "users_manage_own_transactions" ON public.transactions
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- receipt_attachments
DROP POLICY IF EXISTS "users_manage_own_receipt_attachments" ON public.receipt_attachments;
CREATE POLICY "users_manage_own_receipt_attachments" ON public.receipt_attachments
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- budgets
DROP POLICY IF EXISTS "users_manage_own_budgets" ON public.budgets;
CREATE POLICY "users_manage_own_budgets" ON public.budgets
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- recurring_transactions
DROP POLICY IF EXISTS "users_manage_own_recurring_transactions" ON public.recurring_transactions;
CREATE POLICY "users_manage_own_recurring_transactions" ON public.recurring_transactions
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- transfers
DROP POLICY IF EXISTS "users_manage_own_transfers" ON public.transfers;
CREATE POLICY "users_manage_own_transfers" ON public.transfers
FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 8. TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_at_financial_accounts ON public.financial_accounts;
CREATE TRIGGER set_updated_at_financial_accounts
  BEFORE UPDATE ON public.financial_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_categories ON public.categories;
CREATE TRIGGER set_updated_at_categories
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_transactions ON public.transactions;
CREATE TRIGGER set_updated_at_transactions
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_budgets ON public.budgets;
CREATE TRIGGER set_updated_at_budgets
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_recurring_transactions ON public.recurring_transactions;
CREATE TRIGGER set_updated_at_recurring_transactions
  BEFORE UPDATE ON public.recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_transfers ON public.transfers;
CREATE TRIGGER set_updated_at_transfers
  BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 9. SYSTEM CATEGORIES (public, no user_id)
-- ============================================================
INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order) VALUES
  (gen_random_uuid(), NULL, 'Salary', 'income', '#059669', 'Briefcase', true, 1),
  (gen_random_uuid(), NULL, 'Freelance', 'income', '#0ea5e9', 'Laptop', true, 2),
  (gen_random_uuid(), NULL, 'Investment Returns', 'income', '#8b5cf6', 'TrendingUp', true, 3),
  (gen_random_uuid(), NULL, 'Other Income', 'income', '#6b7280', 'Plus', true, 4),
  (gen_random_uuid(), NULL, 'Food & Dining', 'expense', '#f97316', 'UtensilsCrossed', true, 10),
  (gen_random_uuid(), NULL, 'Housing', 'expense', '#7c3aed', 'Home', true, 11),
  (gen_random_uuid(), NULL, 'Transport', 'expense', '#2563eb', 'Car', true, 12),
  (gen_random_uuid(), NULL, 'Utilities', 'expense', '#8b5cf6', 'Zap', true, 13),
  (gen_random_uuid(), NULL, 'Shopping', 'expense', '#d97706', 'ShoppingBag', true, 14),
  (gen_random_uuid(), NULL, 'Healthcare', 'expense', '#ec4899', 'Heart', true, 15),
  (gen_random_uuid(), NULL, 'Entertainment', 'expense', '#dc2626', 'Tv', true, 16),
  (gen_random_uuid(), NULL, 'Travel', 'expense', '#0891b2', 'Plane', true, 17),
  (gen_random_uuid(), NULL, 'Education', 'expense', '#16a34a', 'BookOpen', true, 18),
  (gen_random_uuid(), NULL, 'Personal Care', 'expense', '#db2777', 'Sparkles', true, 19),
  (gen_random_uuid(), NULL, 'Subscriptions', 'expense', '#7c3aed', 'RefreshCw', true, 20),
  (gen_random_uuid(), NULL, 'Savings', 'expense', '#059669', 'PiggyBank', true, 21),
  (gen_random_uuid(), NULL, 'Other', 'expense', '#6b7280', 'MoreHorizontal', true, 22),
  (gen_random_uuid(), NULL, 'Transfer', 'transfer', '#0ea5e9', 'ArrowLeftRight', true, 30)
ON CONFLICT DO NOTHING;
