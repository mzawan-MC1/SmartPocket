-- ============================================================
-- Smart Pocket MVP v2: Savings goals & manual investment records
-- ============================================================
-- Safe, additive-only migration. Run once in Supabase SQL editor
-- if you are not using `supabase db push` / migration orchestration.
--
-- Creates:
--   1. public.savings_goal_category ENUM
--   2. public.investment_asset_type   ENUM
--   3. public.savings_goals           TABLE (user-owned, RLS enabled)
--   4. public.manual_investments      TABLE (user-owned, RLS enabled)
--   5. Utility indexes + RLS self-ownership SELECT/INSERT/UPDATE/DELETE
-- ============================================================

-- ---------- ENUMS ----------

DO $$ BEGIN
  CREATE TYPE public.savings_goal_category AS ENUM (
    'emergency',
    'travel',
    'rent_or_bills',
    'education',
    'car_or_home',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.investment_asset_type AS ENUM (
    'stocks',
    'crypto',
    'property',
    'gold_commodities',
    'funds',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ---------- 1. Savings goals ----------

CREATE TABLE IF NOT EXISTS public.savings_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES public.user_profiles(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL
    CONSTRAINT savings_goals_name_check CHECK (char_length(name) <= 120),

  category public.savings_goal_category NOT NULL
    DEFAULT 'other',

  currency TEXT NOT NULL DEFAULT 'USD',

  target_amount NUMERIC(15,2) NOT NULL
    CONSTRAINT savings_goals_target_positive CHECK (target_amount >= 0),

  current_saved NUMERIC(15,2) NOT NULL DEFAULT 0
    CONSTRAINT savings_goals_saved_nonneg CHECK (current_saved >= 0),

  monthly_contribution NUMERIC(15,2) NOT NULL DEFAULT 0
    CONSTRAINT savings_goals_monthly_nonneg CHECK (monthly_contribution >= 0),

  target_date DATE,

  linked_account_id UUID
    REFERENCES public.financial_accounts(id)
    ON DELETE SET NULL,

  notes TEXT
    CONSTRAINT savings_goals_notes_check CHECK (char_length(notes) <= 1000),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS savings_goals_user_id_idx
  ON public.savings_goals(user_id);
CREATE INDEX IF NOT EXISTS savings_goals_category_idx
  ON public.savings_goals(category);
CREATE INDEX IF NOT EXISTS savings_goals_target_date_idx
  ON public.savings_goals(target_date);

ALTER TABLE public.savings_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS savings_goals_select_self ON public.savings_goals;
CREATE POLICY savings_goals_select_self
  ON public.savings_goals
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS savings_goals_insert_self ON public.savings_goals;
CREATE POLICY savings_goals_insert_self
  ON public.savings_goals
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS savings_goals_update_self ON public.savings_goals;
CREATE POLICY savings_goals_update_self
  ON public.savings_goals
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS savings_goals_delete_self ON public.savings_goals;
CREATE POLICY savings_goals_delete_self
  ON public.savings_goals
  FOR DELETE
  USING (auth.uid() = user_id);


-- ---------- 2. Manual investment records ----------

CREATE TABLE IF NOT EXISTS public.manual_investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL
    REFERENCES public.user_profiles(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL
    CONSTRAINT manual_investments_name_check CHECK (char_length(name) <= 160),

  asset_type public.investment_asset_type NOT NULL
    DEFAULT 'other',

  currency TEXT NOT NULL DEFAULT 'USD',

  amount_invested NUMERIC(15,2) NOT NULL
    CONSTRAINT manual_investments_invested_nonneg CHECK (amount_invested >= 0),

  current_value NUMERIC(15,2) NOT NULL
    CONSTRAINT manual_investments_current_nonneg CHECK (current_value >= 0),

  purchase_date DATE,

  notes TEXT
    CONSTRAINT manual_investments_notes_check CHECK (char_length(notes) <= 1000),

  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS manual_investments_user_id_idx
  ON public.manual_investments(user_id);
CREATE INDEX IF NOT EXISTS manual_investments_asset_type_idx
  ON public.manual_investments(asset_type);
CREATE INDEX IF NOT EXISTS manual_investments_purchase_date_idx
  ON public.manual_investments(purchase_date);

ALTER TABLE public.manual_investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS manual_investments_select_self ON public.manual_investments;
CREATE POLICY manual_investments_select_self
  ON public.manual_investments
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS manual_investments_insert_self ON public.manual_investments;
CREATE POLICY manual_investments_insert_self
  ON public.manual_investments
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS manual_investments_update_self ON public.manual_investments;
CREATE POLICY manual_investments_update_self
  ON public.manual_investments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS manual_investments_delete_self ON public.manual_investments;
CREATE POLICY manual_investments_delete_self
  ON public.manual_investments
  FOR DELETE
  USING (auth.uid() = user_id);


-- ---------- 3. Ownership validation for linked financial account (savings_goals) ----------
-- Parity with public.validate_personal_subscription_relationships pattern:
-- a savings goal's linked_account_id must belong to the same user (or be NULL).

CREATE OR REPLACE FUNCTION public.validate_savings_goals_linked_account_owner()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  linked_account_user_id UUID;
BEGIN
  IF NEW.linked_account_id IS NOT NULL THEN
    SELECT fa.user_id
      INTO linked_account_user_id
      FROM public.financial_accounts AS fa
     WHERE fa.id = NEW.linked_account_id;

    IF linked_account_user_id IS NULL OR linked_account_user_id <> NEW.user_id THEN
      RAISE EXCEPTION 'Selected financial account does not belong to this user';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_savings_goals_linked_account_owner
  ON public.savings_goals;

CREATE TRIGGER validate_savings_goals_linked_account_owner
  BEFORE INSERT OR UPDATE ON public.savings_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_savings_goals_linked_account_owner();


-- ---------- 4. updated_at triggers (reuse project-wide public.set_updated_at()) ----------

DROP TRIGGER IF EXISTS set_updated_at_savings_goals ON public.savings_goals;
CREATE TRIGGER set_updated_at_savings_goals
  BEFORE UPDATE ON public.savings_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_manual_investments ON public.manual_investments;
CREATE TRIGGER set_updated_at_manual_investments
  BEFORE UPDATE ON public.manual_investments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
