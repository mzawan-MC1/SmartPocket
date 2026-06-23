-- ============================================================
-- Migration: 20260623100000_customer_billing_infrastructure.sql
-- Provider-ready customer billing infrastructure for self-service
-- subscriptions while preserving existing trial/admin flows.
-- ============================================================

-- ─── 1. BILLING TABLES ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.billing_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider),
  UNIQUE (provider, provider_customer_id)
);

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  provider TEXT NOT NULL,
  provider_subscription_id TEXT NOT NULL,
  provider_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  billing_interval public.billing_interval NOT NULL DEFAULT 'monthly',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  cancelled_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subscription_id),
  CONSTRAINT billing_subscriptions_status_check
    CHECK (status IN ('pending', 'trialing', 'active', 'past_due', 'cancelled', 'expired', 'unpaid', 'incomplete', 'incomplete_expired', 'paused'))
);

CREATE TABLE IF NOT EXISTS public.billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id),
  CONSTRAINT billing_events_processing_status_check
    CHECK (processing_status IN ('pending', 'processing', 'processed', 'duplicate', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.billing_checkout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id),
  billing_interval public.billing_interval NOT NULL,
  provider TEXT NOT NULL,
  provider_session_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  success_url TEXT NOT NULL,
  cancel_url TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT billing_checkout_sessions_status_check
    CHECK (status IN ('pending', 'provider_unavailable', 'ready', 'completed', 'cancelled', 'expired', 'failed'))
);

CREATE TABLE IF NOT EXISTS public.billing_admin_override_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  target_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  provider TEXT,
  provider_subscription_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_user_provider
  ON public.billing_customers (user_id, provider);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_status
  ON public.billing_subscriptions (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_period
  ON public.billing_subscriptions (current_period_start, current_period_end);

CREATE INDEX IF NOT EXISTS idx_billing_events_provider_status
  ON public.billing_events (provider, processing_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_user_status
  ON public.billing_checkout_sessions (user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_checkout_sessions_provider_session
  ON public.billing_checkout_sessions (provider, provider_session_id)
  WHERE provider_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_admin_override_logs_target_user
  ON public.billing_admin_override_logs (target_user_id, created_at DESC);

-- ─── 2. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_admin_override_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_customers_own_read" ON public.billing_customers;
CREATE POLICY "billing_customers_own_read"
  ON public.billing_customers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "billing_customers_admin_all" ON public.billing_customers;
CREATE POLICY "billing_customers_admin_all"
  ON public.billing_customers FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "billing_subscriptions_own_read" ON public.billing_subscriptions;
CREATE POLICY "billing_subscriptions_own_read"
  ON public.billing_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "billing_subscriptions_admin_all" ON public.billing_subscriptions;
CREATE POLICY "billing_subscriptions_admin_all"
  ON public.billing_subscriptions FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "billing_checkout_sessions_own_read" ON public.billing_checkout_sessions;
CREATE POLICY "billing_checkout_sessions_own_read"
  ON public.billing_checkout_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "billing_checkout_sessions_admin_all" ON public.billing_checkout_sessions;
CREATE POLICY "billing_checkout_sessions_admin_all"
  ON public.billing_checkout_sessions FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "billing_events_admin_all" ON public.billing_events;
CREATE POLICY "billing_events_admin_all"
  ON public.billing_events FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "billing_admin_override_logs_own_read" ON public.billing_admin_override_logs;
CREATE POLICY "billing_admin_override_logs_own_read"
  ON public.billing_admin_override_logs FOR SELECT
  TO authenticated
  USING (target_user_id = auth.uid());

DROP POLICY IF EXISTS "billing_admin_override_logs_admin_all" ON public.billing_admin_override_logs;
CREATE POLICY "billing_admin_override_logs_admin_all"
  ON public.billing_admin_override_logs FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- ─── 3. PLAN / SUMMARY HELPERS ──────────────────────────────────────────────

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
  v_cycle_start TIMESTAMPTZ;
  v_cycle_end TIMESTAMPTZ;
BEGIN
  SELECT
    us.id,
    us.plan_id,
    COALESCE(bs.current_period_start, date_trunc('month', now())),
    COALESCE(bs.current_period_end, date_trunc('month', now()) + INTERVAL '1 month' - INTERVAL '1 second')
  INTO
    v_subscription_id,
    v_plan_id,
    v_cycle_start,
    v_cycle_end
  FROM public.user_subscriptions us
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

  IF v_cycle_end <= v_cycle_start THEN
    v_cycle_start := date_trunc('month', now());
    v_cycle_end := date_trunc('month', now()) + INTERVAL '1 month' - INTERVAL '1 second';
  END IF;

  RETURN QUERY
  SELECT
    v_subscription_id,
    v_plan_id,
    v_cycle_start,
    v_cycle_end;
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
    monthly_receipt_extractions
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
    COALESCE(v_plan.monthly_receipt_extractions, 0)
  )
  ON CONFLICT (user_id, cycle_start) DO UPDATE
  SET
    subscription_id = EXCLUDED.subscription_id,
    cycle_end = EXCLUDED.cycle_end,
    credits_allocated = CASE
      WHEN p_preserve_existing
        THEN GREATEST(
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
      WHEN p_preserve_existing
        THEN GREATEST(
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

CREATE OR REPLACE FUNCTION public.get_or_create_usage_cycle(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_window RECORD;
BEGIN
  SELECT * INTO v_window
  FROM public.resolve_usage_cycle_window(p_user_id)
  LIMIT 1;

  IF v_window.subscription_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public.upsert_usage_cycle_for_window(
    p_user_id,
    v_window.subscription_id,
    v_window.plan_id,
    v_window.cycle_start,
    v_window.cycle_end,
    true
  );
END;
$$;

-- ─── 4. BILLING EVENT / SUBSCRIPTION HELPERS ────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_billing_admin_override(
  p_admin_user_id UUID,
  p_target_user_id UUID,
  p_action_type TEXT,
  p_plan_id UUID DEFAULT NULL,
  p_provider TEXT DEFAULT NULL,
  p_provider_subscription_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.billing_admin_override_logs (
    admin_user_id,
    target_user_id,
    action_type,
    plan_id,
    provider,
    provider_subscription_id,
    details
  )
  VALUES (
    p_admin_user_id,
    p_target_user_id,
    p_action_type,
    p_plan_id,
    p_provider,
    p_provider_subscription_id,
    COALESCE(p_details, '{}'::jsonb)
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
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

  IF p_current_period_start IS NOT NULL AND p_current_period_end IS NOT NULL THEN
    PERFORM public.upsert_usage_cycle_for_window(
      p_user_id,
      v_user_subscription_id,
      v_plan_id,
      p_current_period_start,
      p_current_period_end,
      p_preserve_existing_usage
    );
  END IF;

  RETURN v_billing_subscription_id;
END;
$$;

-- ─── 5. ADMIN FUNCTION UPDATES ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_grant_promotional_credits(
  p_admin_id UUID,
  p_user_id UUID,
  p_credits INTEGER,
  p_notes TEXT DEFAULT 'Promotional grant'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cycle_id UUID;
  v_balance INTEGER;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  UPDATE public.ai_usage_cycles
  SET credits_allocated = credits_allocated + p_credits,
      updated_at = now()
  WHERE id = v_cycle_id;

  SELECT credits_allocated - credits_consumed - credits_reserved
  INTO v_balance
  FROM public.ai_usage_cycles WHERE id = v_cycle_id;

  INSERT INTO public.ai_credit_ledger (
    user_id, cycle_id, ledger_type, credits_delta,
    credits_balance_after, notes
  )
  VALUES (
    p_user_id, v_cycle_id, 'promotional', p_credits,
    v_balance, p_notes
  );

  PERFORM public.log_billing_admin_override(
    p_admin_id,
    p_user_id,
    'grant_promotional_credits',
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'credits', p_credits,
      'notes', p_notes
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
DECLARE
  v_plan_id UUID;
  v_credits INTEGER;
  v_receipt_extractions INTEGER;
  v_cycle_id UUID;
  v_provider_subscription RECORD;
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
      trial_started_at = NULL,
      trial_ends_at = NULL,
      current_period_start = now(),
      current_period_end = now() + INTERVAL '1 month',
      updated_at = now(),
      notes = 'manual_admin_override'
  WHERE user_id = p_user_id;

  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  UPDATE public.ai_usage_cycles
  SET credits_allocated = GREATEST(v_credits, credits_consumed + credits_reserved, credits_allocated),
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

  PERFORM public.log_billing_admin_override(
    p_admin_id,
    p_user_id,
    'change_user_plan',
    v_plan_id,
    v_provider_subscription.provider,
    v_provider_subscription.provider_subscription_id,
    jsonb_build_object(
      'plan_code', p_plan_code,
      'billing_record_preserved', v_provider_subscription.provider_subscription_id IS NOT NULL
    )
  );

  RETURN TRUE;
END;
$$;

-- ─── 6. FUNCTION GRANTS ─────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.resolve_usage_cycle_window(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_usage_cycle_window(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_usage_cycle_for_window(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_usage_cycle_for_window(UUID, UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO service_role;

REVOKE ALL ON FUNCTION public.log_billing_admin_override(UUID, UUID, TEXT, UUID, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_billing_admin_override(UUID, UUID, TEXT, UUID, TEXT, TEXT, JSONB) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.apply_billing_subscription_state(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.billing_interval, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, JSONB, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_billing_subscription_state(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, public.billing_interval, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ, JSONB, BOOLEAN) TO service_role;

