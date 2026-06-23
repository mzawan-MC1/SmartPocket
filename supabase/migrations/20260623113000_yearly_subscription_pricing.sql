-- ============================================================
-- Migration: 20260623113000_yearly_subscription_pricing.sql
-- Add yearly subscription pricing, whole-AED normalization,
-- and monthly usage-cycle handling inside yearly subscriptions.
-- ============================================================

-- ─── 1. PLAN STRUCTURE / CONSTRAINTS ────────────────────────────────────────

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS yearly_discount_percent NUMERIC(5,0) NOT NULL DEFAULT 0;

ALTER TABLE public.subscription_plans
  ALTER COLUMN price_amount TYPE NUMERIC(10,0)
  USING ROUND(COALESCE(price_amount, 0));

UPDATE public.subscription_plans
SET
  price_amount = ROUND(COALESCE(price_amount, 0)),
  yearly_discount_percent = ROUND(COALESCE(yearly_discount_percent, 0));

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_plan_code_key;

DROP INDEX IF EXISTS public.subscription_plans_plan_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_code_interval
  ON public.subscription_plans (plan_code, billing_interval);

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_price_amount_nonnegative;

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_price_amount_nonnegative
  CHECK (price_amount >= 0);

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_yearly_discount_percent_check;

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_yearly_discount_percent_check
  CHECK (yearly_discount_percent >= 0 AND yearly_discount_percent <= 100);

ALTER TABLE public.subscription_plans
  DROP CONSTRAINT IF EXISTS subscription_plans_paid_interval_check;

ALTER TABLE public.subscription_plans
  ADD CONSTRAINT subscription_plans_paid_interval_check
  CHECK (
    (plan_code = 'free_trial' AND billing_interval = 'none')
    OR
    (plan_code <> 'free_trial' AND billing_interval IN ('monthly', 'yearly'))
  );

-- ─── 2. AUTHORITATIVE PRICING HELPERS ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.normalize_subscription_price_amount(p_price NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_price NUMERIC;
BEGIN
  v_price := ROUND(COALESCE(p_price, 0));

  IF v_price < 0 THEN
    RAISE EXCEPTION 'Subscription price must be a non-negative whole AED amount';
  END IF;

  RETURN v_price;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_yearly_discount_percent(p_discount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_discount NUMERIC;
BEGIN
  v_discount := ROUND(COALESCE(p_discount, 0));

  IF v_discount < 0 OR v_discount > 100 THEN
    RAISE EXCEPTION 'Yearly discount percent must be between 0 and 100';
  END IF;

  RETURN v_discount;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_yearly_billed_price(
  p_monthly_price NUMERIC,
  p_yearly_discount_percent NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_monthly_price NUMERIC;
  v_discount NUMERIC;
BEGIN
  v_monthly_price := public.normalize_subscription_price_amount(p_monthly_price);
  v_discount := public.normalize_yearly_discount_percent(p_yearly_discount_percent);

  RETURN ROUND(v_monthly_price * 12 * (1 - (v_discount / 100.0)));
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_yearly_saving_amount(
  p_monthly_price NUMERIC,
  p_yearly_discount_percent NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN (public.normalize_subscription_price_amount(p_monthly_price) * 12)
    - public.calculate_yearly_billed_price(p_monthly_price, p_yearly_discount_percent);
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_equivalent_monthly_subscription_price(
  p_yearly_price NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN ROUND(public.normalize_subscription_price_amount(p_yearly_price) / 12.0);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_billing_usage_cycle_window(
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ,
  p_billing_interval public.billing_interval,
  p_reference_time TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_reference TIMESTAMPTZ := COALESCE(p_reference_time, now());
  v_cycle_start TIMESTAMPTZ;
  v_next_cycle_start TIMESTAMPTZ;
BEGIN
  IF p_billing_interval = 'yearly'
    AND p_period_start IS NOT NULL
    AND p_period_end IS NOT NULL
    AND p_period_end > p_period_start
  THEN
    v_reference := GREATEST(p_period_start, LEAST(v_reference, p_period_end));
    v_cycle_start := p_period_start;

    LOOP
      v_next_cycle_start := v_cycle_start + INTERVAL '1 month';
      EXIT WHEN v_next_cycle_start > v_reference OR v_next_cycle_start >= p_period_end;
      v_cycle_start := v_next_cycle_start;
    END LOOP;

    RETURN QUERY
    SELECT
      v_cycle_start,
      LEAST(p_period_end, (v_cycle_start + INTERVAL '1 month') - INTERVAL '1 second');
    RETURN;
  END IF;

  IF p_billing_interval = 'monthly'
    AND p_period_start IS NOT NULL
    AND p_period_end IS NOT NULL
    AND p_period_end > p_period_start
  THEN
    RETURN QUERY
    SELECT p_period_start, p_period_end;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    date_trunc('month', v_reference),
    date_trunc('month', v_reference) + INTERVAL '1 month' - INTERVAL '1 second';
END;
$$;

-- ─── 3. YEARLY PLAN SYNCHRONIZATION ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_yearly_subscription_feature_limits(
  p_plan_code public.subscription_plan_code
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_monthly_plan_id UUID;
  v_yearly_plan_id UUID;
BEGIN
  IF p_plan_code = 'free_trial' THEN
    RETURN NULL;
  END IF;

  SELECT id
  INTO v_monthly_plan_id
  FROM public.subscription_plans
  WHERE plan_code = p_plan_code
    AND billing_interval = 'monthly'
  LIMIT 1;

  SELECT id
  INTO v_yearly_plan_id
  FROM public.subscription_plans
  WHERE plan_code = p_plan_code
    AND billing_interval = 'yearly'
  LIMIT 1;

  IF v_monthly_plan_id IS NULL OR v_yearly_plan_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.subscription_feature_limits (
    plan_id,
    feature_key,
    feature_val
  )
  SELECT
    v_yearly_plan_id,
    feature_key,
    feature_val
  FROM public.subscription_feature_limits
  WHERE plan_id = v_monthly_plan_id
  ON CONFLICT (plan_id, feature_key) DO UPDATE
  SET feature_val = EXCLUDED.feature_val;

  DELETE FROM public.subscription_feature_limits
  WHERE plan_id = v_yearly_plan_id
    AND feature_key NOT IN (
      SELECT feature_key
      FROM public.subscription_feature_limits
      WHERE plan_id = v_monthly_plan_id
    );

  RETURN v_yearly_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_yearly_subscription_plan(
  p_plan_code public.subscription_plan_code
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_monthly_plan public.subscription_plans%ROWTYPE;
  v_yearly_plan_id UUID;
BEGIN
  IF p_plan_code = 'free_trial' THEN
    DELETE FROM public.subscription_plans
    WHERE plan_code = p_plan_code
      AND billing_interval = 'yearly';
    RETURN NULL;
  END IF;

  SELECT *
  INTO v_monthly_plan
  FROM public.subscription_plans
  WHERE plan_code = p_plan_code
    AND billing_interval = 'monthly'
  LIMIT 1;

  IF NOT FOUND THEN
    DELETE FROM public.subscription_plans
    WHERE plan_code = p_plan_code
      AND billing_interval = 'yearly';
    RETURN NULL;
  END IF;

  INSERT INTO public.subscription_plans (
    plan_code,
    plan_name,
    description,
    price_amount,
    billing_interval,
    trial_duration_days,
    monthly_ai_credits,
    daily_ai_request_limit,
    monthly_voice_seconds,
    monthly_receipt_extractions,
    text_ai_enabled,
    voice_ai_enabled,
    ai_history_enabled,
    ai_history_retention_days,
    managed_people_enabled,
    shared_spaces_enabled,
    standard_reports_enabled,
    family_reports_enabled,
    yearly_discount_percent,
    is_active,
    display_order
  )
  VALUES (
    v_monthly_plan.plan_code,
    v_monthly_plan.plan_name,
    v_monthly_plan.description,
    public.calculate_yearly_billed_price(v_monthly_plan.price_amount, v_monthly_plan.yearly_discount_percent),
    'yearly',
    0,
    v_monthly_plan.monthly_ai_credits,
    v_monthly_plan.daily_ai_request_limit,
    v_monthly_plan.monthly_voice_seconds,
    v_monthly_plan.monthly_receipt_extractions,
    v_monthly_plan.text_ai_enabled,
    v_monthly_plan.voice_ai_enabled,
    v_monthly_plan.ai_history_enabled,
    v_monthly_plan.ai_history_retention_days,
    v_monthly_plan.managed_people_enabled,
    v_monthly_plan.shared_spaces_enabled,
    v_monthly_plan.standard_reports_enabled,
    v_monthly_plan.family_reports_enabled,
    v_monthly_plan.yearly_discount_percent,
    v_monthly_plan.is_active,
    v_monthly_plan.display_order
  )
  ON CONFLICT (plan_code, billing_interval) DO UPDATE
  SET
    plan_name = EXCLUDED.plan_name,
    description = EXCLUDED.description,
    price_amount = EXCLUDED.price_amount,
    trial_duration_days = EXCLUDED.trial_duration_days,
    monthly_ai_credits = EXCLUDED.monthly_ai_credits,
    daily_ai_request_limit = EXCLUDED.daily_ai_request_limit,
    monthly_voice_seconds = EXCLUDED.monthly_voice_seconds,
    monthly_receipt_extractions = EXCLUDED.monthly_receipt_extractions,
    text_ai_enabled = EXCLUDED.text_ai_enabled,
    voice_ai_enabled = EXCLUDED.voice_ai_enabled,
    ai_history_enabled = EXCLUDED.ai_history_enabled,
    ai_history_retention_days = EXCLUDED.ai_history_retention_days,
    managed_people_enabled = EXCLUDED.managed_people_enabled,
    shared_spaces_enabled = EXCLUDED.shared_spaces_enabled,
    standard_reports_enabled = EXCLUDED.standard_reports_enabled,
    family_reports_enabled = EXCLUDED.family_reports_enabled,
    yearly_discount_percent = EXCLUDED.yearly_discount_percent,
    is_active = EXCLUDED.is_active,
    display_order = EXCLUDED.display_order,
    updated_at = now()
  RETURNING id INTO v_yearly_plan_id;

  PERFORM public.sync_yearly_subscription_feature_limits(p_plan_code);

  RETURN v_yearly_plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_subscription_plan_row()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_monthly_plan RECORD;
BEGIN
  NEW.price_amount := public.normalize_subscription_price_amount(NEW.price_amount);
  NEW.yearly_discount_percent := public.normalize_yearly_discount_percent(NEW.yearly_discount_percent);

  IF NEW.plan_code = 'free_trial' THEN
    NEW.billing_interval := 'none';
    NEW.price_amount := 0;
    NEW.yearly_discount_percent := 0;
    RETURN NEW;
  END IF;

  IF NEW.billing_interval = 'yearly' THEN
    SELECT
      price_amount,
      yearly_discount_percent
    INTO v_monthly_plan
    FROM public.subscription_plans
    WHERE plan_code = NEW.plan_code
      AND billing_interval = 'monthly'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;

    IF FOUND THEN
      NEW.yearly_discount_percent := public.normalize_yearly_discount_percent(v_monthly_plan.yearly_discount_percent);
      NEW.price_amount := public.calculate_yearly_billed_price(v_monthly_plan.price_amount, NEW.yearly_discount_percent);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_subscription_plan_row ON public.subscription_plans;
CREATE TRIGGER trg_normalize_subscription_plan_row
  BEFORE INSERT OR UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_subscription_plan_row();

CREATE OR REPLACE FUNCTION public.trigger_sync_yearly_subscription_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.plan_code <> 'free_trial' AND OLD.billing_interval = 'monthly' THEN
      DELETE FROM public.subscription_plans
      WHERE plan_code = OLD.plan_code
        AND billing_interval = 'yearly';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW.plan_code <> 'free_trial' AND NEW.billing_interval = 'monthly' THEN
    PERFORM public.sync_yearly_subscription_plan(NEW.plan_code);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_yearly_subscription_plan ON public.subscription_plans;
CREATE TRIGGER trg_sync_yearly_subscription_plan
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_yearly_subscription_plan();

CREATE OR REPLACE FUNCTION public.trigger_sync_yearly_subscription_feature_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_plan_code public.subscription_plan_code;
  v_interval public.billing_interval;
BEGIN
  SELECT
    plan_code,
    billing_interval
  INTO
    v_plan_code,
    v_interval
  FROM public.subscription_plans
  WHERE id = COALESCE(NEW.plan_id, OLD.plan_id);

  IF v_plan_code IS NOT NULL
    AND v_plan_code <> 'free_trial'
    AND v_interval = 'monthly'
  THEN
    PERFORM public.sync_yearly_subscription_feature_limits(v_plan_code);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_yearly_subscription_feature_limits ON public.subscription_feature_limits;
CREATE TRIGGER trg_sync_yearly_subscription_feature_limits
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_feature_limits
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_sync_yearly_subscription_feature_limits();

-- ─── 4. BACKFILL WHOLE-AED PRICES / YEARLY ROWS ─────────────────────────────

UPDATE public.subscription_plans
SET
  price_amount = public.normalize_subscription_price_amount(price_amount),
  yearly_discount_percent = CASE
    WHEN plan_code = 'free_trial' THEN 0
    ELSE public.normalize_yearly_discount_percent(yearly_discount_percent)
  END,
  updated_at = now()
WHERE true;

SELECT public.sync_yearly_subscription_plan('personal'::public.subscription_plan_code);
SELECT public.sync_yearly_subscription_plan('family'::public.subscription_plan_code);

-- ─── 5. USAGE WINDOW HELPERS FOR YEARLY BILLING ─────────────────────────────

CREATE OR REPLACE FUNCTION public.resolve_usage_cycle_window(p_user_id UUID)
RETURNS TABLE (
  subscription_id UUID,
  plan_id UUID,
  cycle_start TIMESTAMPTZ,
  cycle_end TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_subscription_id UUID;
  v_plan_id UUID;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_billing_interval public.billing_interval;
  v_usage_window RECORD;
BEGIN
  SELECT
    us.id,
    us.plan_id,
    COALESCE(bs.current_period_start, us.current_period_start),
    COALESCE(bs.current_period_end, us.current_period_end),
    COALESCE(bs.billing_interval, sp.billing_interval, 'monthly'::public.billing_interval)
  INTO
    v_subscription_id,
    v_plan_id,
    v_period_start,
    v_period_end,
    v_billing_interval
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp
    ON sp.id = us.plan_id
  LEFT JOIN public.billing_subscriptions bs
    ON bs.user_id = us.user_id
   AND bs.status IN ('trialing', 'active', 'past_due', 'cancelled')
   AND bs.current_period_start IS NOT NULL
   AND bs.current_period_end IS NOT NULL
  WHERE us.user_id = p_user_id
  ORDER BY
    CASE
      WHEN bs.status IN ('trialing', 'active', 'past_due') THEN 0
      ELSE 1
    END,
    bs.updated_at DESC NULLS LAST,
    us.updated_at DESC
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_usage_window
  FROM public.resolve_billing_usage_cycle_window(
    v_period_start,
    v_period_end,
    v_billing_interval,
    now()
  )
  LIMIT 1;

  RETURN QUERY
  SELECT
    v_subscription_id,
    v_plan_id,
    v_usage_window.cycle_start,
    v_usage_window.cycle_end;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_billing_subscription_state(
  p_user_id UUID,
  p_plan_code TEXT,
  p_provider TEXT,
  p_provider_customer_id TEXT,
  p_provider_subscription_id TEXT,
  p_provider_price_id TEXT,
  p_status TEXT,
  p_billing_interval public.billing_interval,
  p_current_period_start TIMESTAMPTZ,
  p_current_period_end TIMESTAMPTZ,
  p_cancel_at_period_end BOOLEAN DEFAULT false,
  p_cancelled_at TIMESTAMPTZ DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_preserve_existing_usage BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_plan_id UUID;
  v_user_subscription_id UUID;
  v_billing_subscription_id UUID;
  v_normalized_status public.subscription_status;
  v_usage_window RECORD;
BEGIN
  SELECT id INTO v_plan_id
  FROM public.subscription_plans
  WHERE plan_code = p_plan_code::public.subscription_plan_code
    AND billing_interval = p_billing_interval
    AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Unsupported plan or billing interval';
  END IF;

  INSERT INTO public.billing_customers (
    user_id,
    provider,
    provider_customer_id
  )
  VALUES (
    p_user_id,
    p_provider,
    p_provider_customer_id
  )
  ON CONFLICT (user_id, provider) DO UPDATE
  SET
    provider_customer_id = EXCLUDED.provider_customer_id,
    updated_at = now();

  INSERT INTO public.billing_subscriptions (
    user_id,
    plan_id,
    provider,
    provider_subscription_id,
    provider_price_id,
    status,
    billing_interval,
    current_period_start,
    current_period_end,
    cancel_at_period_end,
    cancelled_at,
    metadata
  )
  VALUES (
    p_user_id,
    v_plan_id,
    p_provider,
    p_provider_subscription_id,
    NULLIF(p_provider_price_id, ''),
    p_status,
    p_billing_interval,
    p_current_period_start,
    p_current_period_end,
    COALESCE(p_cancel_at_period_end, false),
    p_cancelled_at,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (provider, provider_subscription_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    provider_price_id = EXCLUDED.provider_price_id,
    status = EXCLUDED.status,
    billing_interval = EXCLUDED.billing_interval,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancel_at_period_end = EXCLUDED.cancel_at_period_end,
    cancelled_at = EXCLUDED.cancelled_at,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_billing_subscription_id;

  v_normalized_status := CASE
    WHEN p_status = 'trialing' THEN 'trialing'::public.subscription_status
    WHEN p_status = 'cancelled' THEN 'cancelled'::public.subscription_status
    WHEN p_status IN ('expired', 'unpaid', 'incomplete_expired') THEN 'expired'::public.subscription_status
    WHEN p_status IN ('paused', 'past_due') THEN 'paused'::public.subscription_status
    ELSE 'active'::public.subscription_status
  END;

  INSERT INTO public.user_subscriptions (
    user_id,
    plan_id,
    status,
    trial_started_at,
    trial_ends_at,
    current_period_start,
    current_period_end,
    cancelled_at,
    notes
  )
  VALUES (
    p_user_id,
    v_plan_id,
    v_normalized_status,
    NULL,
    NULL,
    p_current_period_start,
    p_current_period_end,
    p_cancelled_at,
    'provider_managed'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    plan_id = EXCLUDED.plan_id,
    status = EXCLUDED.status,
    trial_started_at = NULL,
    trial_ends_at = NULL,
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    cancelled_at = EXCLUDED.cancelled_at,
    notes = EXCLUDED.notes,
    updated_at = now()
  RETURNING id INTO v_user_subscription_id;

  SELECT *
  INTO v_usage_window
  FROM public.resolve_billing_usage_cycle_window(
    p_current_period_start,
    p_current_period_end,
    p_billing_interval,
    now()
  )
  LIMIT 1;

  IF v_usage_window.cycle_start IS NOT NULL AND v_usage_window.cycle_end IS NOT NULL THEN
    PERFORM public.upsert_usage_cycle_for_window(
      p_user_id,
      v_user_subscription_id,
      v_plan_id,
      v_usage_window.cycle_start,
      v_usage_window.cycle_end,
      p_preserve_existing_usage
    );
  END IF;

  RETURN v_billing_subscription_id;
END;
$$;

-- ─── 6. ADMIN MANUAL ASSIGNMENT WITH INTERVAL CHOICE ────────────────────────

CREATE OR REPLACE FUNCTION public.admin_change_user_plan(
  p_admin_id UUID,
  p_user_id UUID,
  p_plan_code TEXT,
  p_billing_interval public.billing_interval
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_plan_id UUID;
  v_credits INTEGER;
  v_receipt_extractions INTEGER;
  v_trial_duration_days INTEGER;
  v_cycle_id UUID;
  v_provider_subscription RECORD;
  v_period_start TIMESTAMPTZ := now();
  v_period_end TIMESTAMPTZ;
  v_usage_window RECORD;
  v_subscription_status public.subscription_status := 'active';
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  SELECT
    id,
    monthly_ai_credits,
    monthly_receipt_extractions,
    trial_duration_days
  INTO
    v_plan_id,
    v_credits,
    v_receipt_extractions,
    v_trial_duration_days
  FROM public.subscription_plans
  WHERE plan_code = p_plan_code::public.subscription_plan_code
    AND billing_interval = p_billing_interval
    AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan not found for % (%).', p_plan_code, p_billing_interval;
  END IF;

  IF p_plan_code = 'free_trial' THEN
    v_subscription_status := 'trialing';
    v_period_end := v_period_start + (COALESCE(v_trial_duration_days, 0) * INTERVAL '1 day');
  ELSIF p_billing_interval = 'yearly' THEN
    v_period_end := v_period_start + INTERVAL '1 year';
  ELSE
    v_period_end := v_period_start + INTERVAL '1 month';
  END IF;

  UPDATE public.user_subscriptions
  SET
    plan_id = v_plan_id,
    status = v_subscription_status,
    trial_started_at = CASE WHEN v_subscription_status = 'trialing' THEN v_period_start ELSE NULL END,
    trial_ends_at = CASE WHEN v_subscription_status = 'trialing' THEN v_period_end ELSE NULL END,
    current_period_start = v_period_start,
    current_period_end = v_period_end,
    cancelled_at = NULL,
    updated_at = now(),
    notes = 'manual_admin_override'
  WHERE user_id = p_user_id;

  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  UPDATE public.ai_usage_cycles
  SET
    credits_allocated = GREATEST(v_credits, credits_consumed + credits_reserved, credits_allocated),
    receipt_extractions_allocated = GREATEST(COALESCE(v_receipt_extractions, 0), receipt_extractions_consumed + receipt_extractions_reserved, receipt_extractions_allocated),
    updated_at = now()
  WHERE id = v_cycle_id;

  SELECT
    provider,
    provider_subscription_id
  INTO v_provider_subscription
  FROM public.billing_subscriptions
  WHERE user_id = p_user_id
  ORDER BY updated_at DESC
  LIMIT 1;

  SELECT *
  INTO v_usage_window
  FROM public.resolve_billing_usage_cycle_window(
    v_period_start,
    v_period_end,
    p_billing_interval,
    v_period_start
  )
  LIMIT 1;

  IF v_usage_window.cycle_start IS NOT NULL AND v_usage_window.cycle_end IS NOT NULL THEN
    PERFORM public.upsert_usage_cycle_for_window(
      p_user_id,
      (SELECT id FROM public.user_subscriptions WHERE user_id = p_user_id),
      v_plan_id,
      v_usage_window.cycle_start,
      v_usage_window.cycle_end,
      true
    );
  END IF;

  PERFORM public.log_billing_admin_override(
    p_admin_id,
    p_user_id,
    'change_user_plan',
    v_plan_id,
    v_provider_subscription.provider,
    v_provider_subscription.provider_subscription_id,
    jsonb_build_object(
      'plan_code', p_plan_code,
      'billing_interval', p_billing_interval,
      'billing_record_preserved', v_provider_subscription.provider_subscription_id IS NOT NULL
    )
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_change_user_plan(
  p_admin_id UUID,
  p_user_id UUID,
  p_plan_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN public.admin_change_user_plan(
    p_admin_id,
    p_user_id,
    p_plan_code,
    CASE
      WHEN p_plan_code = 'free_trial' THEN 'none'::public.billing_interval
      ELSE 'monthly'::public.billing_interval
    END
  );
END;
$$;

-- ─── 7. FUNCTION GRANTS ──────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.normalize_subscription_price_amount(NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_subscription_price_amount(NUMERIC) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.normalize_yearly_discount_percent(NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_yearly_discount_percent(NUMERIC) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.calculate_yearly_billed_price(NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_yearly_billed_price(NUMERIC, NUMERIC) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.calculate_yearly_saving_amount(NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_yearly_saving_amount(NUMERIC, NUMERIC) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.calculate_equivalent_monthly_subscription_price(NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_equivalent_monthly_subscription_price(NUMERIC) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.resolve_billing_usage_cycle_window(TIMESTAMPTZ, TIMESTAMPTZ, public.billing_interval, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_billing_usage_cycle_window(TIMESTAMPTZ, TIMESTAMPTZ, public.billing_interval, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.sync_yearly_subscription_feature_limits(public.subscription_plan_code) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_yearly_subscription_feature_limits(public.subscription_plan_code) TO service_role;

REVOKE ALL ON FUNCTION public.sync_yearly_subscription_plan(public.subscription_plan_code) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_yearly_subscription_plan(public.subscription_plan_code) TO service_role;

REVOKE ALL ON FUNCTION public.trigger_sync_yearly_subscription_plan() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_sync_yearly_subscription_feature_limits() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.admin_change_user_plan(UUID, UUID, TEXT, public.billing_interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_user_plan(UUID, UUID, TEXT, public.billing_interval) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_change_user_plan(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_user_plan(UUID, UUID, TEXT) TO authenticated;
