-- ============================================================
-- Migration: 20260622103000_receipt_intelligence_metering.sql
-- Separate public Receipt Intelligence allowances while keeping
-- the shared AI credit ledger for internal cost tracking.
-- ============================================================

DO $$
BEGIN
  ALTER TABLE public.subscription_plans
    ADD COLUMN IF NOT EXISTS monthly_receipt_extractions INTEGER NOT NULL DEFAULT 10;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.ai_usage_cycles
    ADD COLUMN IF NOT EXISTS receipt_extractions_allocated INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS receipt_extractions_consumed INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS receipt_extractions_reserved INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS receipt_extractions_refunded INTEGER NOT NULL DEFAULT 0;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.ai_credit_ledger
    ADD COLUMN IF NOT EXISTS request_type TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.ai_usage_daily
    ADD COLUMN IF NOT EXISTS receipt_extraction_requests INTEGER NOT NULL DEFAULT 0;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

ALTER TYPE public.document_extraction_job_status ADD VALUE IF NOT EXISTS 'processing';

DO $$
BEGIN
  ALTER TABLE public.document_extraction_jobs
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS credit_ledger_id UUID REFERENCES public.ai_credit_ledger(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_extraction_jobs_user_idempotency
  ON public.document_extraction_jobs (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_extraction_jobs_credit_ledger_id
  ON public.document_extraction_jobs (credit_ledger_id)
  WHERE credit_ledger_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_credit_ledger_request_type_check'
      AND conrelid = 'public.ai_credit_ledger'::regclass
  ) THEN
    ALTER TABLE public.ai_credit_ledger
      ADD CONSTRAINT ai_credit_ledger_request_type_check
      CHECK (
        request_type IS NULL
        OR request_type IN ('text', 'voice', 'receipt_extraction')
      );
  END IF;
END $$;

UPDATE public.subscription_plans
SET monthly_receipt_extractions = COALESCE(monthly_receipt_extractions, 10);

UPDATE public.ai_usage_cycles uc
SET receipt_extractions_allocated = COALESCE(sp.monthly_receipt_extractions, 10)
FROM public.user_subscriptions us
JOIN public.subscription_plans sp ON sp.id = us.plan_id
WHERE uc.subscription_id = us.id
  AND COALESCE(uc.receipt_extractions_allocated, 0) = 0;

UPDATE public.ai_credit_ledger cl
SET request_type = ar.request_type
FROM public.ai_requests ar
WHERE cl.ai_request_id = ar.id
  AND cl.request_type IS NULL;

CREATE OR REPLACE FUNCTION public.ai_request_credit_cost(p_request_type TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN p_request_type = 'voice' THEN 2
    ELSE 1
  END;
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
  v_sub_id  UUID;
  v_cycle_id UUID;
  v_now     TIMESTAMPTZ := now();
  v_trial_days INTEGER;
  v_trial_end TIMESTAMPTZ;
  v_credits INTEGER;
  v_receipt_extractions INTEGER;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
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
    COALESCE(v_receipt_extractions, 10)
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

CREATE OR REPLACE FUNCTION public.get_or_create_usage_cycle(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cycle_id UUID;
  v_now      TIMESTAMPTZ := now();
  v_start    TIMESTAMPTZ := date_trunc('month', v_now);
  v_end      TIMESTAMPTZ := date_trunc('month', v_now) + INTERVAL '1 month' - INTERVAL '1 second';
  v_sub_id   UUID;
  v_credits  INTEGER := 0;
  v_receipt_extractions INTEGER := 10;
BEGIN
  SELECT id INTO v_cycle_id
  FROM public.ai_usage_cycles
  WHERE user_id = p_user_id
    AND cycle_start = v_start
  LIMIT 1;

  IF v_cycle_id IS NOT NULL THEN
    RETURN v_cycle_id;
  END IF;

  SELECT us.id, sp.monthly_ai_credits, sp.monthly_receipt_extractions
  INTO v_sub_id, v_credits, v_receipt_extractions
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

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
    v_sub_id,
    v_start,
    v_end,
    COALESCE(v_credits, 0),
    COALESCE(v_receipt_extractions, 10)
  )
  ON CONFLICT (user_id, cycle_start) DO NOTHING
  RETURNING id INTO v_cycle_id;

  IF v_cycle_id IS NULL THEN
    SELECT id INTO v_cycle_id
    FROM public.ai_usage_cycles
    WHERE user_id = p_user_id AND cycle_start = v_start
    LIMIT 1;
  END IF;

  RETURN v_cycle_id;
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
BEGIN
  SELECT
    us.*,
    sp.plan_code,
    sp.monthly_ai_credits,
    sp.daily_ai_request_limit,
    sp.monthly_voice_seconds,
    sp.monthly_receipt_extractions,
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

  IF p_request_type = 'receipt_extraction' AND COALESCE(v_sub.monthly_receipt_extractions, 0) <= 0 THEN
    RETURN 'receipt_ai_disabled';
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
    IF (v_cycle.receipt_extractions_consumed + v_cycle.receipt_extractions_reserved + 1) > v_cycle.receipt_extractions_allocated THEN
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
    UPDATE public.ai_usage_cycles
    SET receipt_extractions_reserved = receipt_extractions_reserved + 1,
        updated_at = now()
    WHERE id = v_cycle_id
      AND (receipt_extractions_consumed + receipt_extractions_reserved + 1) <= receipt_extractions_allocated;

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

CREATE OR REPLACE FUNCTION public.finalise_ai_credits(
  p_user_id UUID,
  p_cycle_id UUID,
  p_ledger_id UUID,
  p_ai_request_id UUID DEFAULT NULL,
  p_input_tokens INTEGER DEFAULT NULL,
  p_output_tokens INTEGER DEFAULT NULL,
  p_total_tokens INTEGER DEFAULT NULL,
  p_speech_duration_ms INTEGER DEFAULT NULL,
  p_provider_name TEXT DEFAULT NULL,
  p_model_name TEXT DEFAULT NULL,
  p_estimated_cost NUMERIC DEFAULT NULL,
  p_credit_cost INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance INTEGER;
  v_request_type TEXT;
  v_credit_cost INTEGER;
BEGIN
  SELECT
    COALESCE(request_type, 'text'),
    COALESCE(credit_cost, ABS(credits_delta), p_credit_cost)
  INTO
    v_request_type,
    v_credit_cost
  FROM public.ai_credit_ledger
  WHERE id = p_ledger_id
    AND user_id = p_user_id;

  IF v_request_type = 'receipt_extraction' THEN
    UPDATE public.ai_usage_cycles
    SET receipt_extractions_reserved = GREATEST(0, receipt_extractions_reserved - 1),
        receipt_extractions_consumed = receipt_extractions_consumed + 1,
        updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;
  ELSE
    UPDATE public.ai_usage_cycles
    SET credits_reserved = GREATEST(0, credits_reserved - v_credit_cost),
        credits_consumed = credits_consumed + v_credit_cost,
        voice_seconds_used = CASE
          WHEN p_speech_duration_ms IS NOT NULL
          THEN voice_seconds_used + CEIL(p_speech_duration_ms::NUMERIC / 1000)::INTEGER
          ELSE voice_seconds_used
        END,
        updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;
  END IF;

  SELECT credits_allocated - credits_consumed - credits_reserved
  INTO v_balance
  FROM public.ai_usage_cycles
  WHERE id = p_cycle_id;

  UPDATE public.ai_credit_ledger
  SET ledger_type = 'charge',
      ai_request_id = p_ai_request_id,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      total_tokens = p_total_tokens,
      speech_duration_ms = p_speech_duration_ms,
      provider_name = p_provider_name,
      model_name = p_model_name,
      estimated_cost_usd = p_estimated_cost,
      credit_cost = v_credit_cost,
      request_type = v_request_type,
      credits_balance_after = v_balance
  WHERE id = p_ledger_id
    AND user_id = p_user_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_ai_credits(
  p_user_id UUID,
  p_cycle_id UUID,
  p_ledger_id UUID,
  p_reason TEXT DEFAULT 'provider_failure'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_credit_cost INTEGER;
  v_balance INTEGER;
  v_request_type TEXT;
BEGIN
  SELECT
    COALESCE(ABS(credits_delta), credit_cost, 1),
    COALESCE(request_type, 'text')
  INTO
    v_credit_cost,
    v_request_type
  FROM public.ai_credit_ledger
  WHERE id = p_ledger_id
    AND user_id = p_user_id;

  IF v_credit_cost IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_request_type = 'receipt_extraction' THEN
    UPDATE public.ai_usage_cycles
    SET receipt_extractions_reserved = GREATEST(0, receipt_extractions_reserved - 1),
        receipt_extractions_refunded = receipt_extractions_refunded + 1,
        updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;
  ELSE
    UPDATE public.ai_usage_cycles
    SET credits_reserved = GREATEST(0, credits_reserved - v_credit_cost),
        credits_refunded = credits_refunded + v_credit_cost,
        updated_at = now()
    WHERE id = p_cycle_id
      AND user_id = p_user_id;
  END IF;

  SELECT credits_allocated - credits_consumed - credits_reserved
  INTO v_balance
  FROM public.ai_usage_cycles
  WHERE id = p_cycle_id;

  UPDATE public.ai_credit_ledger
  SET was_refunded = true,
      request_type = v_request_type,
      notes = COALESCE(notes, '') || ' | Refunded: ' || p_reason
  WHERE id = p_ledger_id
    AND user_id = p_user_id;

  INSERT INTO public.ai_credit_ledger (
    user_id,
    cycle_id,
    ledger_type,
    credits_delta,
    credits_balance_after,
    was_refunded,
    credit_cost,
    request_type,
    notes
  )
  VALUES (
    p_user_id,
    p_cycle_id,
    'refund',
    v_credit_cost,
    v_balance,
    true,
    v_credit_cost,
    v_request_type,
    'Refund: ' || p_reason
  );

  RETURN TRUE;
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
    'monthly_receipt_extractions', v_sub.monthly_receipt_extractions,
    'text_ai_enabled', v_sub.text_ai_enabled,
    'voice_ai_enabled', v_sub.voice_ai_enabled,
    'ai_history_enabled', v_sub.ai_history_enabled,
    'credits_allocated', COALESCE(v_cycle.credits_allocated, 0),
    'credits_consumed', COALESCE(v_cycle.credits_consumed, 0),
    'credits_reserved', COALESCE(v_cycle.credits_reserved, 0),
    'credits_refunded', COALESCE(v_cycle.credits_refunded, 0),
    'voice_seconds_used', COALESCE(v_cycle.voice_seconds_used, 0),
    'requests_today', v_requests_today,
    'receipt_extractions_included', COALESCE(v_cycle.receipt_extractions_allocated, COALESCE(v_sub.monthly_receipt_extractions, 0)),
    'receipt_extractions_used', COALESCE(v_cycle.receipt_extractions_consumed, 0),
    'receipt_extractions_reserved', COALESCE(v_cycle.receipt_extractions_reserved, 0),
    'receipt_extractions_refunded', COALESCE(v_cycle.receipt_extractions_refunded, 0),
    'receipt_extractions_remaining', GREATEST(
      0,
      COALESCE(v_cycle.receipt_extractions_allocated, COALESCE(v_sub.monthly_receipt_extractions, 0))
      - COALESCE(v_cycle.receipt_extractions_consumed, 0)
      - COALESCE(v_cycle.receipt_extractions_reserved, 0)
    ),
    'cycle_start', v_cycle.cycle_start,
    'cycle_end', v_cycle.cycle_end
  );
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
DECLARE
  v_plan_id UUID;
  v_credits INTEGER;
  v_receipt_extractions INTEGER;
  v_cycle_id UUID;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  SELECT id, monthly_ai_credits, monthly_receipt_extractions
  INTO v_plan_id, v_credits, v_receipt_extractions
  FROM public.subscription_plans
  WHERE plan_code = p_plan_code::public.subscription_plan_code
    AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Plan not found: %', p_plan_code;
  END IF;

  UPDATE public.user_subscriptions
  SET plan_id = v_plan_id,
      status = 'active',
      current_period_start = now(),
      current_period_end = now() + INTERVAL '1 month',
      updated_at = now()
  WHERE user_id = p_user_id;

  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  UPDATE public.ai_usage_cycles
  SET credits_allocated = v_credits,
      receipt_extractions_allocated = COALESCE(v_receipt_extractions, 10),
      updated_at = now()
  WHERE id = v_cycle_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_admin_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  SELECT jsonb_build_object(
    'total_subscribers', COUNT(DISTINCT us.user_id),
    'trialing', COUNT(DISTINCT us.user_id) FILTER (WHERE us.status = 'trialing'),
    'active', COUNT(DISTINCT us.user_id) FILTER (WHERE us.status = 'active'),
    'expired', COUNT(DISTINCT us.user_id) FILTER (WHERE us.status = 'expired'),
    'total_credits_consumed', COALESCE(SUM(uc.credits_consumed), 0),
    'total_voice_seconds', COALESCE(SUM(uc.voice_seconds_used), 0),
    'total_receipt_extractions', COALESCE(SUM(uc.receipt_extractions_consumed), 0),
    'estimated_cost_usd', COALESCE(SUM(cl.estimated_cost_usd), 0)
  )
  INTO v_result
  FROM public.user_subscriptions us
  LEFT JOIN public.ai_usage_cycles uc ON uc.user_id = us.user_id
    AND uc.cycle_start = date_trunc('month', now())
  LEFT JOIN public.ai_credit_ledger cl ON cl.user_id = us.user_id
    AND cl.created_at >= date_trunc('month', now())
    AND cl.ledger_type = 'charge';

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_ai_daily_usage(
  p_user_id UUID,
  p_request_type TEXT,
  p_provider_type TEXT,
  p_fallback_used BOOLEAN,
  p_success BOOLEAN,
  p_confirmed BOOLEAN,
  p_duration_ms INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ai_usage_daily (
    user_id,
    usage_date,
    total_requests,
    voice_requests,
    text_requests,
    receipt_extraction_requests,
    cloud_requests,
    vps_requests,
    fallback_requests,
    successful_requests,
    failed_requests,
    confirmed_requests,
    cancelled_requests,
    total_duration_ms
  )
  VALUES (
    p_user_id,
    CURRENT_DATE,
    1,
    CASE WHEN p_request_type = 'voice' THEN 1 ELSE 0 END,
    CASE WHEN p_request_type = 'text' THEN 1 ELSE 0 END,
    CASE WHEN p_request_type = 'receipt_extraction' THEN 1 ELSE 0 END,
    CASE WHEN p_provider_type = 'cloud' THEN 1 ELSE 0 END,
    CASE WHEN p_provider_type = 'vps' THEN 1 ELSE 0 END,
    CASE WHEN p_fallback_used THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN NOT p_success THEN 1 ELSE 0 END,
    CASE WHEN p_confirmed THEN 1 ELSE 0 END,
    0,
    COALESCE(p_duration_ms, 0)
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    total_requests = public.ai_usage_daily.total_requests + 1,
    voice_requests = public.ai_usage_daily.voice_requests + CASE WHEN p_request_type = 'voice' THEN 1 ELSE 0 END,
    text_requests = public.ai_usage_daily.text_requests + CASE WHEN p_request_type = 'text' THEN 1 ELSE 0 END,
    receipt_extraction_requests = public.ai_usage_daily.receipt_extraction_requests + CASE WHEN p_request_type = 'receipt_extraction' THEN 1 ELSE 0 END,
    cloud_requests = public.ai_usage_daily.cloud_requests + CASE WHEN p_provider_type = 'cloud' THEN 1 ELSE 0 END,
    vps_requests = public.ai_usage_daily.vps_requests + CASE WHEN p_provider_type = 'vps' THEN 1 ELSE 0 END,
    fallback_requests = public.ai_usage_daily.fallback_requests + CASE WHEN p_fallback_used THEN 1 ELSE 0 END,
    successful_requests = public.ai_usage_daily.successful_requests + CASE WHEN p_success THEN 1 ELSE 0 END,
    failed_requests = public.ai_usage_daily.failed_requests + CASE WHEN NOT p_success THEN 1 ELSE 0 END,
    confirmed_requests = public.ai_usage_daily.confirmed_requests + CASE WHEN p_confirmed THEN 1 ELSE 0 END,
    total_duration_ms = public.ai_usage_daily.total_duration_ms + COALESCE(p_duration_ms, 0);
END;
$$;
