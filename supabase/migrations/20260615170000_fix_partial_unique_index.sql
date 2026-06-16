-- ============================================================
-- Smart Pocket — Corrective Migration
-- Migration: 20260615170000_fix_partial_unique_index.sql
-- Purpose:
--   1. Drop the global unique constraint uq_system_categories_name_type
--      (it incorrectly blocks user-created categories with the same
--       name+type as a system category).
--   2. Replace it with a partial unique index that covers only
--      system categories (is_system = true AND user_id IS NULL).
--   3. Re-seed system categories idempotently using WHERE NOT EXISTS
--      (ON CONFLICT cannot reliably target a partial index).
--   4. Fix the hardcoded canonical_url default — replace the
--      Rocket preview URL with an empty string so each deployment
--      can set its own value.
-- ⚠️  SAFE MIGRATION — no DROP TABLE, no DROP TYPE CASCADE.
-- ============================================================

-- ============================================================
-- 1. DROP THE GLOBAL UNIQUE CONSTRAINT (if it still exists)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_system_categories_name_type'
      AND conrelid = 'public.categories'::regclass
  ) THEN
    ALTER TABLE public.categories
      DROP CONSTRAINT uq_system_categories_name_type;
  END IF;
END;
$$;

-- ============================================================
-- 2. CREATE PARTIAL UNIQUE INDEX (system categories only)
--    Covers only rows where is_system = true AND user_id IS NULL.
--    User-created categories are free to reuse any name+type.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_categories_name_type
  ON public.categories (name, category_type)
  WHERE is_system = true AND user_id IS NULL;

-- ============================================================
-- 3. FIX canonical_url DEFAULT — remove hardcoded Rocket URL
-- ============================================================
ALTER TABLE public.platform_settings
  ALTER COLUMN canonical_url SET DEFAULT '';

-- Update any existing rows that still carry the old hardcoded value
-- so they inherit the correct empty/configurable default.
UPDATE public.platform_settings
SET canonical_url = ''
WHERE canonical_url = 'https://smartpocke9976.builtwithrocket.new';

-- ============================================================
-- 4. SYSTEM CATEGORIES SEED — idempotent via WHERE NOT EXISTS
--    ON CONFLICT cannot target a partial index reliably, so each
--    row is guarded by a NOT EXISTS check on (name, category_type)
--    among system categories only.
-- ============================================================
INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Salary', 'income', '#059669', 'TrendingUp', true, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Salary' AND category_type = 'income' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Freelance', 'income', '#10b981', 'Briefcase', true, 2
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Freelance' AND category_type = 'income' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Investment', 'income', '#0ea5e9', 'BarChart2', true, 3
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Investment' AND category_type = 'income' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Other Income', 'income', '#6366f1', 'Plus', true, 4
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Other Income' AND category_type = 'income' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Housing', 'expense', '#7c3aed', 'Home', true, 10
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Housing' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Food & Dining', 'expense', '#f97316', 'Utensils', true, 11
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Food & Dining' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Transport', 'expense', '#2563eb', 'Car', true, 12
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Transport' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Utilities', 'expense', '#8b5cf6', 'Zap', true, 13
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Utilities' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Shopping', 'expense', '#d97706', 'ShoppingBag', true, 14
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Shopping' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Healthcare', 'expense', '#ec4899', 'Heart', true, 15
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Healthcare' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Entertainment', 'expense', '#dc2626', 'Gamepad2', true, 16
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Entertainment' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Travel', 'expense', '#0ea5a0', 'Plane', true, 17
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Travel' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Education', 'expense', '#0284c7', 'BookOpen', true, 18
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Education' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Personal Care', 'expense', '#db2777', 'Smile', true, 19
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Personal Care' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Subscriptions', 'expense', '#7c3aed', 'Repeat', true, 20
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Subscriptions' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Other Expense', 'expense', '#6b7280', 'Tag', true, 21
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Other Expense' AND category_type = 'expense' AND is_system = true AND user_id IS NULL
);

INSERT INTO public.categories (id, user_id, name, category_type, color, icon, is_system, sort_order)
SELECT gen_random_uuid(), NULL, 'Transfer', 'transfer', '#0ea5e9', 'ArrowLeftRight', true, 30
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories
  WHERE name = 'Transfer' AND category_type = 'transfer' AND is_system = true AND user_id IS NULL
);
