-- ============================================================
-- Migration: 20260815203000_savings_investments_calculator_plan_entitlements.sql
--
-- Runs AFTER:
--   20260815193000_savings_goals_and_manual_investments.sql
--
-- Purpose:
--   1. Add the four new finance module feature-toggle BOOLEAN columns
--      to public.subscription_plans:
--        savings_enabled
--        investments_enabled
--        exchange_rates_enabled
--        calculator_enabled
--      All columns are NOT NULL DEFAULT true so existing plan rows
--      and any new plan rows immediately grant access (matching the
--      standard_reports_enabled entitlement policy, not the tiered
--      managed_people / shared_spaces / family_reports policy).
--   2. Re-sync the four new columns per plan_code to their canonical
--      values, mirroring enforce_subscription_plan_entitlement_booleans.sql:
--        free_trial  -> savings / investments / exchange_rates / calculator  all TRUE
--        personal    -> savings / investments / exchange_rates / calculator  all TRUE
--        family      -> savings / investments / exchange_rates / calculator  all TRUE
--      (Same tier as Standard Reports.)
--   3. Re-define the authoritative entitlement helpers with a
--      CREATE OR REPLACE.  Existing logic is preserved verbatim
--      (auth guard, status guard, plan_active guard, trial expiry
--      guard, existing CASE branches, COALESCE pattern).  Only the
--      SELECT column list and CASE dispatch are extended with the
--      four new keys:
--        savings | investments | exchange_rates | calculator
-- ============================================================

BEGIN;

-- ─── 1. ADD NEW COLUMNS TO subscription_plans (idempotent) ────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'subscription_plans'
      AND column_name  = 'savings_enabled'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD COLUMN savings_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'subscription_plans'
      AND column_name  = 'investments_enabled'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD COLUMN investments_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'subscription_plans'
      AND column_name  = 'exchange_rates_enabled'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD COLUMN exchange_rates_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'subscription_plans'
      AND column_name  = 'calculator_enabled'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD COLUMN calculator_enabled BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- ─── 2. ONE-TIME RE-SYNC TO CANONICAL PLAN ENTITLEMENTS ──────
-- Mirror the CASE-plan pattern used in
--   20260805103000_enforce_subscription_plan_entitlement_booleans.sql
-- so any admin drift or future DEFAULT change cannot leave rows in
-- an unexpected state.
--
-- CANONICAL VALUES for the four new finance modules
-- (same tier as standard_reports_enabled):
--   free_trial : all four = TRUE
--   personal   : all four = TRUE
--   family     : all four = TRUE

UPDATE public.subscription_plans
SET
  savings_enabled        = CASE plan_code
                             WHEN 'free_trial' THEN true
                             WHEN 'personal'   THEN true
                             WHEN 'family'     THEN true
                             ELSE savings_enabled
                           END,
  investments_enabled    = CASE plan_code
                             WHEN 'free_trial' THEN true
                             WHEN 'personal'   THEN true
                             WHEN 'family'     THEN true
                             ELSE investments_enabled
                           END,
  exchange_rates_enabled = CASE plan_code
                             WHEN 'free_trial' THEN true
                             WHEN 'personal'   THEN true
                             WHEN 'family'     THEN true
                             ELSE exchange_rates_enabled
                           END,
  calculator_enabled     = CASE plan_code
                             WHEN 'free_trial' THEN true
                             WHEN 'personal'   THEN true
                             WHEN 'family'     THEN true
                             ELSE calculator_enabled
                           END,
  updated_at             = now()
WHERE plan_code IN ('free_trial', 'personal', 'family');

-- ─── 3. EXTEND AUTHENTICATED ENTITLEMENT HELPER ───────────────
-- This function body is identical to the authoritative definition
-- in 20260626230000_subscription_entitlements_and_ai_topups.sql
-- (lines 414-480) except that four columns are ADDED to the SELECT
-- projection and four CASE branches are APPENDED to the feature
-- dispatch switch.  No existing branch, guard, or default was
-- edited; no existing feature code can return a different value
-- after this migration is applied.

CREATE OR REPLACE FUNCTION public.subscription_feature_enabled_for_user(
  p_user_id UUID,
  p_feature TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sub RECORD;
  v_enabled BOOLEAN := FALSE;
BEGIN
  -- ── AUTH GUARD (preserved verbatim) ───────────────────────
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- ── SELECT: same 8 original columns + 4 new columns ───────
  SELECT
    us.status,
    us.trial_ends_at,
    sp.is_active AS plan_active,
    sp.text_ai_enabled,
    sp.voice_ai_enabled,
    sp.receipt_intelligence_enabled,
    sp.ai_history_enabled,
    sp.managed_people_enabled,
    sp.shared_spaces_enabled,
    sp.standard_reports_enabled,
    sp.family_reports_enabled,
    sp.savings_enabled,
    sp.investments_enabled,
    sp.exchange_rates_enabled,
    sp.calculator_enabled
  INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- ── PLAN INACTIVE GUARD (preserved verbatim) ──────────────
  IF NOT COALESCE(v_sub.plan_active, false) THEN
    RETURN FALSE;
  END IF;

  -- ── STATUS GUARD (preserved verbatim) ─────────────────────
  IF v_sub.status NOT IN ('trialing', 'active') THEN
    RETURN FALSE;
  END IF;

  -- ── TRIAL EXPIRED GUARD (preserved verbatim) ──────────────
  IF v_sub.status = 'trialing' AND v_sub.trial_ends_at IS NOT NULL AND v_sub.trial_ends_at < now() THEN
    RETURN FALSE;
  END IF;

  -- ── FEATURE DISPATCH: 8 original branches preserved + 4 new
  --    appended.  ELSE FALSE unchanged. ───────────────────────
  v_enabled := CASE p_feature
    -- ── Original branches (preserved verbatim) ────────────
    WHEN 'text_ai'              THEN COALESCE(v_sub.text_ai_enabled, false)
    WHEN 'voice_ai'             THEN COALESCE(v_sub.voice_ai_enabled, false)
    WHEN 'receipt_intelligence' THEN COALESCE(v_sub.receipt_intelligence_enabled, false)
    WHEN 'ai_history'           THEN COALESCE(v_sub.ai_history_enabled, false)
    WHEN 'managed_people'       THEN COALESCE(v_sub.managed_people_enabled, false)
    WHEN 'shared_spaces'        THEN COALESCE(v_sub.shared_spaces_enabled, false)
    WHEN 'standard_reports'     THEN COALESCE(v_sub.standard_reports_enabled, false)
    WHEN 'family_reports'       THEN COALESCE(v_sub.family_reports_enabled, false)
    -- ── New branches (appended, originals untouched) ─────
    WHEN 'savings'              THEN COALESCE(v_sub.savings_enabled, false)
    WHEN 'investments'          THEN COALESCE(v_sub.investments_enabled, false)
    WHEN 'exchange_rates'       THEN COALESCE(v_sub.exchange_rates_enabled, false)
    WHEN 'calculator'           THEN COALESCE(v_sub.calculator_enabled, false)
    ELSE FALSE
  END;

  RETURN COALESCE(v_enabled, false);
END;
$$;

-- ─── 4. RE-DECLARE CURRENT-USER WRAPPER (preserved verbatim) ──
-- Body is identical to the authoritative definition in
-- 20260626230000_subscription_entitlements_and_ai_topups.sql L482.
-- Re-creating it here ensures its dependency pointer targets the
-- function body we just defined.

CREATE OR REPLACE FUNCTION public.subscription_feature_enabled_for_current_user(p_feature TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT public.subscription_feature_enabled_for_user(auth.uid(), p_feature);
$$;

COMMIT;
