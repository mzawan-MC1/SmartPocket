-- ============================================================
-- Smart Pocket Phase 1 — Global Pay Cycle & Financial Periods
-- Migration: 20260618120000_global_financial_periods_phase1.sql
-- ============================================================
-- Safe additive migration only. Do not modify historical data.
-- ============================================================

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS income_frequency TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS pay_cycle_anchor_date DATE,
  ADD COLUMN IF NOT EXISTS weekly_payday TEXT,
  ADD COLUMN IF NOT EXISTS semimonthly_day_1 SMALLINT,
  ADD COLUMN IF NOT EXISTS semimonthly_day_2 SMALLINT,
  ADD COLUMN IF NOT EXISTS monthly_payday_rule TEXT NOT NULL DEFAULT 'last_day',
  ADD COLUMN IF NOT EXISTS monthly_payday_day SMALLINT,
  ADD COLUMN IF NOT EXISTS default_dashboard_period TEXT NOT NULL DEFAULT 'month',
  ADD COLUMN IF NOT EXISTS default_budget_period TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS week_starts_on TEXT NOT NULL DEFAULT 'monday',
  ADD COLUMN IF NOT EXISTS week_starts_on_custom_day SMALLINT,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS custom_cycle_days SMALLINT;

UPDATE public.user_profiles
SET
  income_frequency = COALESCE(NULLIF(income_frequency, ''), 'monthly'),
  monthly_payday_rule = COALESCE(NULLIF(monthly_payday_rule, ''), 'last_day'),
  default_dashboard_period = COALESCE(NULLIF(default_dashboard_period, ''), 'month'),
  default_budget_period = COALESCE(NULLIF(default_budget_period, ''), 'monthly'),
  week_starts_on = COALESCE(NULLIF(week_starts_on, ''), 'monday'),
  timezone = COALESCE(NULLIF(timezone, ''), 'UTC');

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS budget_period TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS period_anchor_date DATE,
  ADD COLUMN IF NOT EXISTS custom_period_days SMALLINT;

UPDATE public.budgets
SET budget_period = COALESCE(NULLIF(budget_period, ''), 'monthly');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_income_frequency_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_income_frequency_check
      CHECK (income_frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_default_dashboard_period_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_default_dashboard_period_check
      CHECK (default_dashboard_period IN ('pay_cycle', 'month'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_default_budget_period_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_default_budget_period_check
      CHECK (default_budget_period IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_week_starts_on_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_week_starts_on_check
      CHECK (week_starts_on IN ('monday', 'sunday', 'saturday', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_weekly_payday_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_weekly_payday_check
      CHECK (
        weekly_payday IS NULL OR
        weekly_payday IN ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_semimonthly_day_1_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_semimonthly_day_1_check
      CHECK (semimonthly_day_1 IS NULL OR semimonthly_day_1 BETWEEN 0 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_semimonthly_day_2_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_semimonthly_day_2_check
      CHECK (semimonthly_day_2 IS NULL OR semimonthly_day_2 BETWEEN 0 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_monthly_payday_rule_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_monthly_payday_rule_check
      CHECK (monthly_payday_rule IN ('specific_day', 'last_day', 'last_working_day'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_monthly_payday_day_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_monthly_payday_day_check
      CHECK (monthly_payday_day IS NULL OR monthly_payday_day BETWEEN 1 AND 31);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_week_starts_on_custom_day_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_week_starts_on_custom_day_check
      CHECK (week_starts_on_custom_day IS NULL OR week_starts_on_custom_day BETWEEN 0 AND 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_profiles_custom_cycle_days_check'
      AND conrelid = 'public.user_profiles'::regclass
  ) THEN
    ALTER TABLE public.user_profiles
      ADD CONSTRAINT user_profiles_custom_cycle_days_check
      CHECK (custom_cycle_days IS NULL OR custom_cycle_days BETWEEN 2 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budgets_budget_period_check'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_budget_period_check
      CHECK (budget_period IN ('weekly', 'biweekly', 'semimonthly', 'monthly', 'custom'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'budgets_custom_period_days_check'
      AND conrelid = 'public.budgets'::regclass
  ) THEN
    ALTER TABLE public.budgets
      ADD CONSTRAINT budgets_custom_period_days_check
      CHECK (custom_period_days IS NULL OR custom_period_days BETWEEN 2 AND 90);
  END IF;
END
$$;
