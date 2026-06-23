-- Make Receipt Intelligence a first-class plan entitlement with an explicit enable flag.

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS receipt_intelligence_enabled BOOLEAN;

UPDATE public.subscription_plans
SET receipt_intelligence_enabled = CASE
  WHEN COALESCE(monthly_receipt_extractions, 0) > 0 THEN true
  ELSE false
END
WHERE receipt_intelligence_enabled IS NULL;

ALTER TABLE public.subscription_plans
  ALTER COLUMN receipt_intelligence_enabled SET DEFAULT false;

ALTER TABLE public.subscription_plans
  ALTER COLUMN receipt_intelligence_enabled SET NOT NULL;

CREATE OR REPLACE FUNCTION public.plan_receipt_intelligence_quota(
  p_receipt_intelligence_enabled BOOLEAN,
  p_monthly_receipt_extractions INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN COALESCE(p_receipt_intelligence_enabled, false)
      THEN GREATEST(COALESCE(p_monthly_receipt_extractions, 0), 0)
    ELSE 0
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_usage_cycle_for_window(
  p_user_id UUID,
  p_subscription_id UUID,
  p_plan_id UUID,
  p_cycle_start TIMESTAMPTZ,
  p_cycle_end TIMESTAMPTZ,
  p_preserve_existing BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cycle_id UUID;
  v_plan RECORD;
BEGIN
  SELECT
    monthly_ai_credits,
    monthly_receipt_extractions,
    receipt_intelligence_enabled
  INTO v_plan
  FROM public.subscription_plans
  WHERE id = p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found for usage cycle sync';
  END IF;

  INSERT INTO public.ai_usage_cycles (
    user_id,
    subscription_id,
    cycle_start,
    cycle_end,
    credits_allocated,
    receipt_extractions_allocated
  )
  VALUES (
    p_user_id,
    p_subscription_id,
    p_cycle_start,
    p_cycle_end,
    COALESCE(v_plan.monthly_ai_credits, 0),
    public.plan_receipt_intelligence_quota(
      v_plan.receipt_intelligence_enabled,
      v_plan.monthly_receipt_extractions
    )
  )
  ON CONFLICT (user_id, cycle_start) DO UPDATE
  SET
    subscription_id = EXCLUDED.subscription_id,
    cycle_end = EXCLUDED.cycle_end,
    credits_allocated = CASE
      WHEN p_preserve_existing THEN GREATEST(
        public.ai_usage_cycles.credits_allocated,
        EXCLUDED.credits_allocated,
        public.ai_usage_cycles.credits_consumed + public.ai_usage_cycles.credits_reserved
      )
      ELSE GREATEST(
        EXCLUDED.credits_allocated,
        public.ai_usage_cycles.credits_consumed + public.ai_usage_cycles.credits_reserved
      )
    END,
    receipt_extractions_allocated = CASE
      WHEN p_preserve_existing THEN GREATEST(
        public.ai_usage_cycles.receipt_extractions_allocated,
        EXCLUDED.receipt_extractions_allocated,
        public.ai_usage_cycles.receipt_extractions_consumed + public.ai_usage_cycles.receipt_extractions_reserved
      )
      ELSE GREATEST(
        EXCLUDED.receipt_extractions_allocated,
        public.ai_usage_cycles.receipt_extractions_consumed + public.ai_usage_cycles.receipt_extractions_reserved
      )
    END,
    updated_at = now()
  RETURNING id INTO v_cycle_id;

  RETURN v_cycle_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_free_trial(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_plan_id UUID;
  v_sub_id UUID;
  v_cycle_id UUID;
  v_now TIMESTAMPTZ := now();
  v_trial_days INTEGER;
  v_trial_end TIMESTAMPTZ;
  v_credits INTEGER;
  v_receipt_extractions INTEGER;
  v_receipt_intelligence_enabled BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT
    id,
    monthly_ai_credits,
    monthly_receipt_extractions,
    receipt_intelligence_enabled,
    trial_duration_days
  INTO
    v_plan_id,
    v_credits,
    v_receipt_extractions,
    v_receipt_intelligence_enabled,
    v_trial_days
  FROM public.subscription_plans
  WHERE plan_code = 'free_trial'
    AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Free trial plan not found or inactive';
  END IF;

  v_trial_end := v_now + (v_trial_days * INTERVAL '1 day');

  INSERT INTO public.user_subscriptions (
    user_id, plan_id, status,
    trial_started_at, trial_ends_at,
    current_period_start, current_period_end
  )
  VALUES (
    p_user_id, v_plan_id, 'trialing',
    v_now, v_trial_end,
    v_now, v_trial_end
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_sub_id;

  IF v_sub_id IS NULL THEN
    SELECT id INTO v_sub_id FROM public.user_subscriptions WHERE user_id = p_user_id;
    RETURN v_sub_id;
  END IF;

  INSERT INTO public.ai_usage_cycles (
    user_id, subscription_id,
    cycle_start, cycle_end,
    credits_allocated,
    receipt_extractions_allocated
  )
  VALUES (
    p_user_id, v_sub_id,
    date_trunc('month', v_now),
    date_trunc('month', v_now) + INTERVAL '1 month' - INTERVAL '1 second',
    v_credits,
    public.plan_receipt_intelligence_quota(
      v_receipt_intelligence_enabled,
      v_receipt_extractions
    )
  )
  ON CONFLICT (user_id, cycle_start) DO NOTHING
  RETURNING id INTO v_cycle_id;

  IF v_cycle_id IS NOT NULL THEN
    INSERT INTO public.ai_credit_ledger (
      user_id, cycle_id, ledger_type, credits_delta,
      credits_balance_after, notes
    )
    VALUES (
      p_user_id, v_cycle_id, 'allocation', v_credits,
      v_credits, 'Free trial initial allocation'
    );
  END IF;

  RETURN v_sub_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_ai_access(
  p_user_id UUID,
  p_request_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sub RECORD;
  v_cycle RECORD;
  v_cycle_id UUID;
  v_today DATE := CURRENT_DATE;
  v_credit_cost INTEGER;
  v_receipt_limit INTEGER := 0;
BEGIN
  SELECT
    us.*,
    sp.plan_code,
    sp.monthly_ai_credits,
    sp.daily_ai_request_limit,
    sp.monthly_voice_seconds,
    sp.monthly_receipt_extractions,
    sp.receipt_intelligence_enabled,
    sp.text_ai_enabled,
    sp.voice_ai_enabled,
    sp.is_active AS plan_active
  INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'no_subscription';
  END IF;

  IF NOT v_sub.plan_active THEN
    RETURN 'plan_inactive';
  END IF;

  IF v_sub.status NOT IN ('trialing', 'active') THEN
    RETURN 'subscription_expired';
  END IF;

  IF v_sub.status = 'trialing' AND v_sub.trial_ends_at < now() THEN
    RETURN 'trial_expired';
  END IF;

  IF p_request_type = 'text' AND NOT v_sub.text_ai_enabled THEN
    RETURN 'text_ai_disabled';
  END IF;

  IF p_request_type = 'voice' AND NOT v_sub.voice_ai_enabled THEN
    RETURN 'voice_ai_disabled';
  END IF;

  IF p_request_type = 'receipt_extraction' THEN
    IF NOT COALESCE(v_sub.receipt_intelligence_enabled, false) THEN
      RETURN 'receipt_ai_disabled';
    END IF;

    IF COALESCE(v_sub.monthly_receipt_extractions, 0) <= 0 THEN
      RETURN 'receipt_zero_quota';
    END IF;
  END IF;

  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  SELECT * INTO v_cycle
  FROM public.ai_usage_cycles
  WHERE id = v_cycle_id;

  IF p_request_type <> 'receipt_extraction' AND v_cycle.last_request_date = v_today THEN
    IF v_cycle.requests_today >= v_sub.daily_ai_request_limit THEN
      RETURN 'daily_limit_reached';
    END IF;
  END IF;

  IF p_request_type = 'receipt_extraction' THEN
    v_receipt_limit := GREATEST(
      COALESCE(v_cycle.receipt_extractions_allocated, 0),
      public.plan_receipt_intelligence_quota(
        v_sub.receipt_intelligence_enabled,
        v_sub.monthly_receipt_extractions
      ),
      COALESCE(v_cycle.receipt_extractions_consumed, 0) + COALESCE(v_cycle.receipt_extractions_reserved, 0)
    );

    IF (v_cycle.receipt_extractions_consumed + v_cycle.receipt_extractions_reserved + 1) > v_receipt_limit THEN
      RETURN 'receipt_limit_reached';
    END IF;

    RETURN NULL;
  END IF;

  v_credit_cost := public.ai_request_credit_cost(p_request_type);

  IF (v_cycle.credits_consumed + v_cycle.credits_reserved + v_credit_cost) > v_cycle.credits_allocated THEN
    RETURN 'credits_exhausted';
  END IF;

  IF p_request_type = 'voice' AND v_sub.monthly_voice_seconds > 0 THEN
    IF v_cycle.voice_seconds_used >= v_sub.monthly_voice_seconds THEN
      RETURN 'voice_limit_reached';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_credits(
  p_user_id UUID,
  p_request_type TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cycle_id UUID;
  v_credit_cost INTEGER;
  v_ledger_id UUID;
  v_balance INTEGER;
  v_access_err TEXT;
  v_existing_cycle_id UUID;
  v_existing_credit_cost INTEGER;
  v_existing_request_type TEXT;
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    SELECT
      id,
      cycle_id,
      COALESCE(credit_cost, ABS(credits_delta), public.ai_request_credit_cost(COALESCE(request_type, p_request_type))),
      COALESCE(request_type, p_request_type)
    INTO
      v_ledger_id,
      v_existing_cycle_id,
      v_existing_credit_cost,
      v_existing_request_type
    FROM public.ai_credit_ledger
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'cycle_id', v_existing_cycle_id,
        'ledger_id', v_ledger_id,
        'credits_reserved', COALESCE(v_existing_credit_cost, 1),
        'duplicate', true,
        'request_type', v_existing_request_type
      );
    END IF;
  END IF;

  v_access_err := public.check_ai_access(p_user_id, p_request_type);
  IF v_access_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_access_err);
  END IF;

  v_credit_cost := public.ai_request_credit_cost(p_request_type);
  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  IF p_request_type = 'receipt_extraction' THEN
    UPDATE public.ai_usage_cycles uc
    SET
      receipt_extractions_allocated = GREATEST(
        uc.receipt_extractions_allocated,
        public.plan_receipt_intelligence_quota(
          sp.receipt_intelligence_enabled,
          sp.monthly_receipt_extractions
        ),
        uc.receipt_extractions_consumed + uc.receipt_extractions_reserved + 1
      ),
      receipt_extractions_reserved = uc.receipt_extractions_reserved + 1,
      updated_at = now()
    FROM public.user_subscriptions us
    JOIN public.subscription_plans sp ON sp.id = us.plan_id
    WHERE uc.id = v_cycle_id
      AND us.id = uc.subscription_id
      AND us.user_id = p_user_id
      AND (uc.receipt_extractions_consumed + uc.receipt_extractions_reserved + 1) <= GREATEST(
        COALESCE(uc.receipt_extractions_allocated, 0),
        public.plan_receipt_intelligence_quota(
          sp.receipt_intelligence_enabled,
          sp.monthly_receipt_extractions
        )
      );

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'receipt_limit_reached');
    END IF;
  ELSE
    UPDATE public.ai_usage_cycles
    SET credits_reserved = credits_reserved + v_credit_cost,
        updated_at = now()
    WHERE id = v_cycle_id
      AND (credits_consumed + credits_reserved + v_credit_cost) <= credits_allocated;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'credits_exhausted');
    END IF;

    UPDATE public.ai_usage_cycles
    SET requests_today = CASE WHEN last_request_date = CURRENT_DATE THEN requests_today + 1 ELSE 1 END,
        last_request_date = CURRENT_DATE,
        updated_at = now()
    WHERE id = v_cycle_id;
  END IF;

  SELECT credits_allocated - credits_consumed - credits_reserved
  INTO v_balance
  FROM public.ai_usage_cycles
  WHERE id = v_cycle_id;

  BEGIN
    INSERT INTO public.ai_credit_ledger (
      user_id,
      cycle_id,
      ledger_type,
      credits_delta,
      credits_balance_after,
      credit_cost,
      idempotency_key,
      request_type,
      notes
    )
    VALUES (
      p_user_id,
      v_cycle_id,
      'reservation',
      -v_credit_cost,
      v_balance,
      v_credit_cost,
      p_idempotency_key,
      p_request_type,
      'Reserved before AI processing'
    )
    RETURNING id INTO v_ledger_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_request_type = 'receipt_extraction' THEN
        UPDATE public.ai_usage_cycles
        SET receipt_extractions_reserved = GREATEST(0, receipt_extractions_reserved - 1),
            updated_at = now()
        WHERE id = v_cycle_id;
      ELSE
        UPDATE public.ai_usage_cycles
        SET credits_reserved = GREATEST(0, credits_reserved - v_credit_cost),
            requests_today = CASE
              WHEN last_request_date = CURRENT_DATE THEN GREATEST(0, requests_today - 1)
              ELSE requests_today
            END,
            updated_at = now()
        WHERE id = v_cycle_id;
      END IF;

      SELECT
        id,
        cycle_id,
        COALESCE(credit_cost, ABS(credits_delta), v_credit_cost)
      INTO
        v_ledger_id,
        v_existing_cycle_id,
        v_existing_credit_cost
      FROM public.ai_credit_ledger
      WHERE idempotency_key = p_idempotency_key
      LIMIT 1;

      RETURN jsonb_build_object(
        'ok', true,
        'cycle_id', v_existing_cycle_id,
        'ledger_id', v_ledger_id,
        'credits_reserved', COALESCE(v_existing_credit_cost, v_credit_cost),
        'duplicate', true,
        'request_type', p_request_type
      );
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'cycle_id', v_cycle_id,
    'ledger_id', v_ledger_id,
    'credits_reserved', v_credit_cost,
    'duplicate', false,
    'request_type', p_request_type
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_subscription_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sub RECORD;
  v_cycle RECORD;
  v_today DATE := CURRENT_DATE;
  v_requests_today INTEGER := 0;
  v_receipt_included INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT
    us.id,
    us.status,
    us.trial_ends_at,
    us.current_period_end,
    sp.plan_name,
    sp.plan_code,
    sp.monthly_ai_credits,
    sp.daily_ai_request_limit,
    sp.monthly_voice_seconds,
    sp.monthly_receipt_extractions,
    sp.receipt_intelligence_enabled,
    sp.text_ai_enabled,
    sp.voice_ai_enabled,
    sp.ai_history_enabled
  INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('has_subscription', false);
  END IF;

  SELECT * INTO v_cycle
  FROM public.ai_usage_cycles
  WHERE user_id = p_user_id
    AND cycle_start = date_trunc('month', now())
  LIMIT 1;

  IF v_cycle.last_request_date = v_today THEN
    v_requests_today := v_cycle.requests_today;
  END IF;

  IF COALESCE(v_sub.receipt_intelligence_enabled, false) THEN
    v_receipt_included := GREATEST(
      COALESCE(v_cycle.receipt_extractions_allocated, 0),
      public.plan_receipt_intelligence_quota(
        v_sub.receipt_intelligence_enabled,
        v_sub.monthly_receipt_extractions
      ),
      COALESCE(v_cycle.receipt_extractions_consumed, 0) + COALESCE(v_cycle.receipt_extractions_reserved, 0)
    );
  END IF;

  RETURN jsonb_build_object(
    'has_subscription', true,
    'plan_name', v_sub.plan_name,
    'plan_code', v_sub.plan_code,
    'status', v_sub.status,
    'trial_ends_at', v_sub.trial_ends_at,
    'current_period_end', v_sub.current_period_end,
    'monthly_ai_credits', v_sub.monthly_ai_credits,
    'daily_ai_request_limit', v_sub.daily_ai_request_limit,
    'monthly_voice_seconds', v_sub.monthly_voice_seconds,
    'monthly_receipt_extractions', COALESCE(v_sub.monthly_receipt_extractions, 0),
    'receipt_intelligence_enabled', COALESCE(v_sub.receipt_intelligence_enabled, false),
    'text_ai_enabled', v_sub.text_ai_enabled,
    'voice_ai_enabled', v_sub.voice_ai_enabled,
    'ai_history_enabled', v_sub.ai_history_enabled,
    'credits_allocated', COALESCE(v_cycle.credits_allocated, 0),
    'credits_consumed', COALESCE(v_cycle.credits_consumed, 0),
    'credits_reserved', COALESCE(v_cycle.credits_reserved, 0),
    'credits_refunded', COALESCE(v_cycle.credits_refunded, 0),
    'voice_seconds_used', COALESCE(v_cycle.voice_seconds_used, 0),
    'requests_today', v_requests_today,
    'receipt_extractions_included', v_receipt_included,
    'receipt_extractions_used', COALESCE(v_cycle.receipt_extractions_consumed, 0),
    'receipt_extractions_reserved', COALESCE(v_cycle.receipt_extractions_reserved, 0),
    'receipt_extractions_refunded', COALESCE(v_cycle.receipt_extractions_refunded, 0),
    'receipt_extractions_remaining', CASE
      WHEN COALESCE(v_sub.receipt_intelligence_enabled, false) THEN GREATEST(
        0,
        v_receipt_included
        - COALESCE(v_cycle.receipt_extractions_consumed, 0)
        - COALESCE(v_cycle.receipt_extractions_reserved, 0)
      )
      ELSE 0
    END,
    'cycle_start', v_cycle.cycle_start,
    'cycle_end', v_cycle.cycle_end
  );
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
    receipt_intelligence_enabled,
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
    v_monthly_plan.receipt_intelligence_enabled,
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
    receipt_intelligence_enabled = EXCLUDED.receipt_intelligence_enabled,
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
  v_receipt_intelligence_enabled BOOLEAN;
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
    receipt_intelligence_enabled,
    trial_duration_days
  INTO
    v_plan_id,
    v_credits,
    v_receipt_extractions,
    v_receipt_intelligence_enabled,
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
    receipt_extractions_allocated = GREATEST(
      public.plan_receipt_intelligence_quota(
        v_receipt_intelligence_enabled,
        v_receipt_extractions
      ),
      receipt_extractions_consumed + receipt_extractions_reserved,
      receipt_extractions_allocated
    ),
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

REVOKE ALL ON FUNCTION public.plan_receipt_intelligence_quota(BOOLEAN, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.plan_receipt_intelligence_quota(BOOLEAN, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
