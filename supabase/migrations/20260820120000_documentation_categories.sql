-- ============================================================
-- Smart Pocket - Documentation Categories Management
-- Migration: 20260820120000_documentation_categories.sql
--
-- Introduces a dedicated documentation_categories table so
-- admins can manage category metadata (name, slug, order,
-- active flag) via the Admin portal instead of relying on
-- hardcoded client-side constants.  documentation_articles
-- continues to store category as a TEXT slug (loose coupling,
-- no hard FK on existing article rows) but we add a foreign
-- key style lookup index.
--
-- Re-run safety: CREATE IF NOT EXISTS + ADD COLUMN IF NOT
-- EXISTS on every column; idempotent after partial rollback.
-- ============================================================

BEGIN;

-- == 1. documentation_categories table ======================

CREATE TABLE IF NOT EXISTS public.documentation_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT documentation_categories_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT documentation_categories_slug_unique UNIQUE (slug)
);

ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.documentation_categories ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentation_categories_pkey' AND conrelid = 'public.documentation_categories'::regclass) THEN
    ALTER TABLE public.documentation_categories ADD CONSTRAINT documentation_categories_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentation_categories_slug_format_check' AND conrelid = 'public.documentation_categories'::regclass) THEN
    ALTER TABLE public.documentation_categories ADD CONSTRAINT documentation_categories_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentation_categories_slug_unique' AND conrelid = 'public.documentation_categories'::regclass) THEN
    ALTER TABLE public.documentation_categories ADD CONSTRAINT documentation_categories_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- Indexes: admin list by order + public list by active flag.
CREATE INDEX IF NOT EXISTS idx_documentation_categories_admin_order
  ON public.documentation_categories (display_order ASC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_documentation_categories_public_active
  ON public.documentation_categories (is_active, display_order ASC)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS update_documentation_categories_updated_at ON public.documentation_categories;
CREATE TRIGGER update_documentation_categories_updated_at
  BEFORE UPDATE ON public.documentation_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.documentation_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documentation_categories_public_read ON public.documentation_categories;
CREATE POLICY documentation_categories_public_read
ON public.documentation_categories
FOR SELECT TO public
USING (is_active = true);

DROP POLICY IF EXISTS documentation_categories_admin_manage ON public.documentation_categories;
CREATE POLICY documentation_categories_admin_manage
ON public.documentation_categories
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.documentation_categories TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.documentation_categories TO authenticated, service_role;

-- == 2. Seed canonical 9 categories (slug-aliased where needed)
--     ON CONFLICT DO NOTHING so this migration can be re-run
--     safely on existing environments.

INSERT INTO public.documentation_categories (name, slug, description, display_order, is_active) VALUES
  ('Getting Started',                 'getting-started',        'Welcome, onboarding, and initial setup guides.',    1,  true),
  ('AI Smart Entry',                  'ai-smart-entry',         'Receipt OCR, Smart AI parsing, and Voice Entry.',   2,  true),
  ('Accounts & Wallets',              'accounts',               'Bank accounts, wallets, cards, and currencies.',    3,  true),
  ('Budgets',                         'budgets',                'Spending limits, budgeting plans and targets.',     4,  true),
  ('Transactions / Cash Flow',        'transactions',           'Expense, income, transfers and cash flow views.',   5,  true),
  ('Personal Subscriptions',          'personal-subscriptions', 'Recurring bills, plan subscriptions and tracking.', 6,  true),
  ('Shared Money & Spaces',           'people-spaces',          'Groups, shared money, invitations and settlements.',7,  true),
  ('Savings & Financial Tools',       'savings-tools',          'Savings goals, investments, calculators, FX.',      8,  true),
  ('General',                         'general',                'Platform settings, plans and troubleshooting.',     99, true)
ON CONFLICT (slug) DO NOTHING;

-- Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';

COMMIT;
