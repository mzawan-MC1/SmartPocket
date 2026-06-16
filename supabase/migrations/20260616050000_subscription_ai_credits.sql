-- ============================================================
-- Migration: 20260616050000_subscription_ai_credits.sql
-- Additive only — no destructive SQL, no modification of prior migrations
-- ============================================================

-- ─── 1. ENUMS ────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_plan_code' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.subscription_plan_code AS ENUM ('free_trial', 'personal', 'family');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_interval' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.billing_interval AS ENUM ('monthly', 'yearly', 'one_time', 'none');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'expired', 'cancelled', 'paused');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'credit_ledger_type' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.credit_ledger_type AS ENUM ('allocation', 'reservation', 'charge', 'refund', 'promotional', 'adjustment');
  END IF;
END $$;

-- ─── 2. TABLES ───────────────────────────────────────────────────────────────

-- subscription_plans: admin-managed, max 3 plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code                 public.subscription_plan_code NOT NULL UNIQUE,
  plan_name                 TEXT NOT NULL,
  description               TEXT,
  price_amount              NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_interval          public.billing_interval NOT NULL DEFAULT 'monthly',
  trial_duration_days       INTEGER NOT NULL DEFAULT 0,
  monthly_ai_credits        INTEGER NOT NULL DEFAULT 0,
  daily_ai_request_limit    INTEGER NOT NULL DEFAULT 0,
  monthly_voice_seconds     INTEGER NOT NULL DEFAULT 0,
  text_ai_enabled           BOOLEAN NOT NULL DEFAULT true,
  voice_ai_enabled          BOOLEAN NOT NULL DEFAULT false,
  ai_history_enabled        BOOLEAN NOT NULL DEFAULT false,
  ai_history_retention_days INTEGER NOT NULL DEFAULT 30,
  managed_people_enabled    BOOLEAN NOT NULL DEFAULT false,
  shared_spaces_enabled     BOOLEAN NOT NULL DEFAULT false,
  standard_reports_enabled  BOOLEAN NOT NULL DEFAULT true,
  family_reports_enabled    BOOLEAN NOT NULL DEFAULT false,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  display_order             INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- subscription_feature_limits: extensible key-value overrides per plan
CREATE TABLE IF NOT EXISTS public.subscription_feature_limits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  feature_val TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, feature_key)
);

-- user_subscriptions: one active subscription per user
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  plan_id             UUID NOT NULL REFERENCES public.subscription_plans(id),
  status              public.subscription_status NOT NULL DEFAULT 'trialing',
  trial_started_at    TIMESTAMPTZ,
  trial_ends_at       TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end   TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- ai_usage_cycles: monthly credit bucket per user
CREATE TABLE IF NOT EXISTS public.ai_usage_cycles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  subscription_id     UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  cycle_start         TIMESTAMPTZ NOT NULL,
  cycle_end           TIMESTAMPTZ NOT NULL,
  credits_allocated   INTEGER NOT NULL DEFAULT 0,
  credits_consumed    INTEGER NOT NULL DEFAULT 0,
  credits_reserved    INTEGER NOT NULL DEFAULT 0,
  credits_refunded    INTEGER NOT NULL DEFAULT 0,
  voice_seconds_used  INTEGER NOT NULL DEFAULT 0,
  requests_today      INTEGER NOT NULL DEFAULT 0,
  last_request_date   DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_cycles_user_period
  ON public.ai_usage_cycles (user_id, cycle_start);

-- ai_credit_ledger: immutable audit trail of every credit movement
CREATE TABLE IF NOT EXISTS public.ai_credit_ledger (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  cycle_id              UUID REFERENCES public.ai_usage_cycles(id) ON DELETE SET NULL,
  ai_request_id         UUID,  -- references ai_requests.id (no FK to avoid cross-migration dep)
  ledger_type           public.credit_ledger_type NOT NULL,
  credits_delta         INTEGER NOT NULL,  -- positive = add, negative = deduct
  credits_balance_after INTEGER,
  input_tokens          INTEGER,
  output_tokens         INTEGER,
  total_tokens          INTEGER,
  speech_duration_ms    INTEGER,
  provider_name         TEXT,
  model_name            TEXT,
  estimated_cost_usd    NUMERIC(10,6),
  credit_cost           INTEGER,
  was_refunded          BOOLEAN NOT NULL DEFAULT false,
  idempotency_key       TEXT,
  source_request_id     TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_user_id
  ON public.ai_credit_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_credit_ledger_cycle_id
  ON public.ai_credit_ledger (cycle_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_credit_ledger_idempotency
  ON public.ai_credit_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─── 3. INDEXES ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
  ON public.subscription_plans (is_active, display_order);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id
  ON public.user_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_ai_usage_cycles_user_id
  ON public.ai_usage_cycles (user_id, cycle_end DESC);

-- ─── 4. FUNCTIONS ────────────────────────────────────────────────────────────

-- Helper: check if caller is admin
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' = 'admin')
  )
$$;

-- Assign Free Trial on first signup
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
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Get free_trial plan
  SELECT 
    id, 
    monthly_ai_credits, 
    trial_duration_days 
  INTO 
    v_plan_id, 
    v_credits, 
    v_trial_days 
  FROM public.subscription_plans
  WHERE plan_code = 'free_trial' 
    AND is_active = true
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Free trial plan not found or inactive';
  END IF;

  v_trial_end := v_now + (v_trial_days * INTERVAL '1 day');

  -- Upsert subscription
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

  -- Create first monthly usage cycle
  INSERT INTO public.ai_usage_cycles (
    user_id, subscription_id,
    cycle_start, cycle_end,
    credits_allocated
  )
  VALUES (
    p_user_id, v_sub_id,
    date_trunc('month', v_now),
    date_trunc('month', v_now) + INTERVAL '1 month' - INTERVAL '1 second',
    v_credits
  )
  ON CONFLICT (user_id, cycle_start) DO NOTHING
  RETURNING id INTO v_cycle_id;

  -- Ledger: initial allocation
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

-- Trigger: auto-assign free trial on new user_profiles row
CREATE OR REPLACE FUNCTION public.handle_new_user_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  BEGIN
    PERFORM public.assign_free_trial(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Non-fatal: log but don't block user creation
    RAISE WARNING 'assign_free_trial failed for user %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_profile_created_subscription ON public.user_profiles;
CREATE TRIGGER on_user_profile_created_subscription
  AFTER INSERT ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_subscription();

-- Get or create current usage cycle for a user
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
BEGIN
  SELECT id INTO v_cycle_id
  FROM public.ai_usage_cycles
  WHERE user_id = p_user_id
    AND cycle_start = v_start
  LIMIT 1;

  IF v_cycle_id IS NOT NULL THEN
    RETURN v_cycle_id;
  END IF;

  -- Get subscription credits
  SELECT us.id, sp.monthly_ai_credits
  INTO v_sub_id, v_credits
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  INSERT INTO public.ai_usage_cycles (
    user_id, subscription_id, cycle_start, cycle_end, credits_allocated
  )
  VALUES (p_user_id, v_sub_id, v_start, v_end, COALESCE(v_credits, 0))
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

-- Check AI access: returns error code or NULL if allowed
-- Returns: NULL = allowed, else error string
CREATE OR REPLACE FUNCTION public.check_ai_access(
  p_user_id    UUID,
  p_request_type TEXT  -- 'text' or 'voice'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sub        RECORD;
  v_plan       RECORD;
  v_cycle      RECORD;
  v_cycle_id   UUID;
  v_today      DATE := CURRENT_DATE;
  v_credit_cost INTEGER;
BEGIN
  -- Load subscription + plan
  SELECT us.*, sp.plan_code, sp.monthly_ai_credits, sp.daily_ai_request_limit,
         sp.monthly_voice_seconds, sp.text_ai_enabled, sp.voice_ai_enabled,
         sp.is_active AS plan_active
  INTO v_sub
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 'no_subscription';
  END IF;

  -- Plan active check
  IF NOT v_sub.plan_active THEN
    RETURN 'plan_inactive';
  END IF;

  -- Subscription status check
  IF v_sub.status NOT IN ('trialing', 'active') THEN
    RETURN 'subscription_expired';
  END IF;

  -- Trial expiry check
  IF v_sub.status = 'trialing' AND v_sub.trial_ends_at < now() THEN
    RETURN 'trial_expired';
  END IF;

  -- Feature check
  IF p_request_type = 'text' AND NOT v_sub.text_ai_enabled THEN
    RETURN 'text_ai_disabled';
  END IF;
  IF p_request_type = 'voice' AND NOT v_sub.voice_ai_enabled THEN
    RETURN 'voice_ai_disabled';
  END IF;

  -- Get/create cycle
  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  SELECT * INTO v_cycle FROM public.ai_usage_cycles WHERE id = v_cycle_id;

  -- Daily request limit
  IF v_cycle.last_request_date = v_today THEN
    IF v_cycle.requests_today >= v_sub.daily_ai_request_limit THEN
      RETURN 'daily_limit_reached';
    END IF;
  END IF;

  -- Credit cost
  v_credit_cost := CASE
    WHEN p_request_type = 'voice' THEN 2
    ELSE 1
  END;

  -- Monthly credit check
  IF (v_cycle.credits_consumed + v_cycle.credits_reserved + v_credit_cost) > v_cycle.credits_allocated THEN
    RETURN 'credits_exhausted';
  END IF;

  -- Voice seconds check (rough: 2 credits = ~60s, checked separately)
  IF p_request_type = 'voice' AND v_sub.monthly_voice_seconds > 0 THEN
    IF v_cycle.voice_seconds_used >= v_sub.monthly_voice_seconds THEN
      RETURN 'voice_limit_reached';
    END IF;
  END IF;

  RETURN NULL;  -- allowed
END;
$$;

-- Reserve credits atomically before AI processing
CREATE OR REPLACE FUNCTION public.reserve_ai_credits(
  p_user_id        UUID,
  p_request_type   TEXT,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cycle_id    UUID;
  v_credit_cost INTEGER;
  v_ledger_id   UUID;
  v_balance     INTEGER;
  v_access_err  TEXT;
BEGIN
  -- Re-check access inside transaction
  v_access_err := public.check_ai_access(p_user_id, p_request_type);
  IF v_access_err IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_access_err);
  END IF;

  v_credit_cost := CASE WHEN p_request_type = 'voice' THEN 2 ELSE 1 END;
  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);

  -- Atomic reservation
  UPDATE public.ai_usage_cycles
  SET credits_reserved = credits_reserved + v_credit_cost,
      updated_at = now()
  WHERE id = v_cycle_id
    AND (credits_consumed + credits_reserved + v_credit_cost) <= credits_allocated;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'credits_exhausted');
  END IF;

  -- Update daily counter
  UPDATE public.ai_usage_cycles
  SET requests_today = CASE WHEN last_request_date = CURRENT_DATE THEN requests_today + 1 ELSE 1 END,
      last_request_date = CURRENT_DATE,
      updated_at = now()
  WHERE id = v_cycle_id;

  -- Ledger entry
  SELECT credits_allocated - credits_consumed - credits_reserved
  INTO v_balance
  FROM public.ai_usage_cycles WHERE id = v_cycle_id;

  INSERT INTO public.ai_credit_ledger (
    user_id, cycle_id, ledger_type, credits_delta,
    credits_balance_after, credit_cost, idempotency_key, notes
  )
  VALUES (
    p_user_id, v_cycle_id, 'reservation', -v_credit_cost,
    v_balance, v_credit_cost, p_idempotency_key, 'Reserved before AI processing'
  )
  RETURNING id INTO v_ledger_id;

  RETURN jsonb_build_object(
    'ok', true,
    'cycle_id', v_cycle_id,
    'ledger_id', v_ledger_id,
    'credits_reserved', v_credit_cost
  );
END;
$$;

-- Finalise credits after successful AI processing
CREATE OR REPLACE FUNCTION public.finalise_ai_credits(
  p_user_id          UUID,
  p_cycle_id         UUID,
  p_ledger_id        UUID,
  p_ai_request_id    UUID DEFAULT NULL,
  p_input_tokens     INTEGER DEFAULT NULL,
  p_output_tokens    INTEGER DEFAULT NULL,
  p_total_tokens     INTEGER DEFAULT NULL,
  p_speech_duration_ms INTEGER DEFAULT NULL,
  p_provider_name    TEXT DEFAULT NULL,
  p_model_name       TEXT DEFAULT NULL,
  p_estimated_cost   NUMERIC DEFAULT NULL,
  p_credit_cost      INTEGER DEFAULT 1
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Move from reserved to consumed
  UPDATE public.ai_usage_cycles
  SET credits_reserved = GREATEST(0, credits_reserved - p_credit_cost),
      credits_consumed = credits_consumed + p_credit_cost,
      voice_seconds_used = CASE
        WHEN p_speech_duration_ms IS NOT NULL
        THEN voice_seconds_used + CEIL(p_speech_duration_ms::NUMERIC / 1000)::INTEGER
        ELSE voice_seconds_used
      END,
      updated_at = now()
  WHERE id = p_cycle_id AND user_id = p_user_id;

  SELECT credits_allocated - credits_consumed - credits_reserved
  INTO v_balance
  FROM public.ai_usage_cycles WHERE id = p_cycle_id;

  -- Update ledger entry with provider details
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
      credit_cost = p_credit_cost,
      credits_balance_after = v_balance
  WHERE id = p_ledger_id AND user_id = p_user_id;

  RETURN TRUE;
END;
$$;

-- Refund reserved credits on provider/system failure
CREATE OR REPLACE FUNCTION public.refund_ai_credits(
  p_user_id   UUID,
  p_cycle_id  UUID,
  p_ledger_id UUID,
  p_reason    TEXT DEFAULT 'provider_failure'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_credit_cost INTEGER;
  v_balance     INTEGER;
BEGIN
  SELECT ABS(credits_delta) INTO v_credit_cost
  FROM public.ai_credit_ledger
  WHERE id = p_ledger_id AND user_id = p_user_id;

  IF v_credit_cost IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Release reservation
  UPDATE public.ai_usage_cycles
  SET credits_reserved = GREATEST(0, credits_reserved - v_credit_cost),
      credits_refunded = credits_refunded + v_credit_cost,
      updated_at = now()
  WHERE id = p_cycle_id AND user_id = p_user_id;

  SELECT credits_allocated - credits_consumed - credits_reserved
  INTO v_balance
  FROM public.ai_usage_cycles WHERE id = p_cycle_id;

  -- Mark original ledger as refunded
  UPDATE public.ai_credit_ledger
  SET was_refunded = true, notes = COALESCE(notes, '') || ' | Refunded: ' || p_reason
  WHERE id = p_ledger_id AND user_id = p_user_id;

  -- Insert refund entry
  INSERT INTO public.ai_credit_ledger (
    user_id, cycle_id, ledger_type, credits_delta,
    credits_balance_after, was_refunded, notes
  )
  VALUES (
    p_user_id, p_cycle_id, 'refund', v_credit_cost,
    v_balance, true, 'Refund: ' || p_reason
  );

  RETURN TRUE;
END;
$$;

-- Get user subscription summary (used by dashboard card)
CREATE OR REPLACE FUNCTION public.get_user_subscription_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_sub    RECORD;
  v_cycle  RECORD;
  v_today  DATE := CURRENT_DATE;
  v_requests_today INTEGER := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() AND NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT us.id, us.status, us.trial_ends_at, us.current_period_end,
         sp.plan_name, sp.plan_code, sp.monthly_ai_credits,
         sp.daily_ai_request_limit, sp.monthly_voice_seconds,
         sp.text_ai_enabled, sp.voice_ai_enabled, sp.ai_history_enabled
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
    'text_ai_enabled', v_sub.text_ai_enabled,
    'voice_ai_enabled', v_sub.voice_ai_enabled,
    'ai_history_enabled', v_sub.ai_history_enabled,
    'credits_allocated', COALESCE(v_cycle.credits_allocated, 0),
    'credits_consumed', COALESCE(v_cycle.credits_consumed, 0),
    'credits_reserved', COALESCE(v_cycle.credits_reserved, 0),
    'credits_refunded', COALESCE(v_cycle.credits_refunded, 0),
    'voice_seconds_used', COALESCE(v_cycle.voice_seconds_used, 0),
    'requests_today', v_requests_today,
    'cycle_start', v_cycle.cycle_start,
    'cycle_end', v_cycle.cycle_end
  );
END;
$$;

-- Admin: grant promotional credits
CREATE OR REPLACE FUNCTION public.admin_grant_promotional_credits(
  p_admin_id  UUID,
  p_user_id   UUID,
  p_credits   INTEGER,
  p_notes     TEXT DEFAULT 'Promotional grant'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_cycle_id UUID;
  v_balance  INTEGER;
BEGIN
  -- Verify caller is admin
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

  RETURN TRUE;
END;
$$;

-- Admin: change user plan
CREATE OR REPLACE FUNCTION public.admin_change_user_plan(
  p_admin_id UUID,
  p_user_id  UUID,
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
  v_cycle_id UUID;
BEGIN
  IF NOT public.is_admin_user() THEN
    RAISE EXCEPTION 'Permission denied: admin only';
  END IF;

  SELECT id, monthly_ai_credits INTO v_plan_id, v_credits
  FROM public.subscription_plans
  WHERE plan_code = p_plan_code::public.subscription_plan_code AND is_active = true
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

  -- Update current cycle allocation
  v_cycle_id := public.get_or_create_usage_cycle(p_user_id);
  UPDATE public.ai_usage_cycles
  SET credits_allocated = v_credits, updated_at = now()
  WHERE id = v_cycle_id;

  RETURN TRUE;
END;
$$;

-- Admin: aggregate usage stats
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

-- ─── 5. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_feature_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_credit_ledger ENABLE ROW LEVEL SECURITY;

-- subscription_plans: public read, admin write
DROP POLICY IF EXISTS "plans_public_read" ON public.subscription_plans;
CREATE POLICY "plans_public_read"
  ON public.subscription_plans FOR SELECT
  TO public USING (true);

DROP POLICY IF EXISTS "plans_admin_write" ON public.subscription_plans;
CREATE POLICY "plans_admin_write"
  ON public.subscription_plans FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- subscription_feature_limits: public read, admin write
DROP POLICY IF EXISTS "feature_limits_public_read" ON public.subscription_feature_limits;
CREATE POLICY "feature_limits_public_read"
  ON public.subscription_feature_limits FOR SELECT
  TO public USING (true);

DROP POLICY IF EXISTS "feature_limits_admin_write" ON public.subscription_feature_limits;
CREATE POLICY "feature_limits_admin_write"
  ON public.subscription_feature_limits FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- user_subscriptions: own row only
DROP POLICY IF EXISTS "user_subscriptions_own" ON public.user_subscriptions;
CREATE POLICY "user_subscriptions_own"
  ON public.user_subscriptions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_subscriptions_admin" ON public.user_subscriptions;
CREATE POLICY "user_subscriptions_admin"
  ON public.user_subscriptions FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- ai_usage_cycles: own row only
DROP POLICY IF EXISTS "ai_usage_cycles_own" ON public.ai_usage_cycles;
CREATE POLICY "ai_usage_cycles_own"
  ON public.ai_usage_cycles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "ai_usage_cycles_admin" ON public.ai_usage_cycles;
CREATE POLICY "ai_usage_cycles_admin"
  ON public.ai_usage_cycles FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

-- ai_credit_ledger: own rows only (read), no direct write
DROP POLICY IF EXISTS "ai_credit_ledger_own_read" ON public.ai_credit_ledger;
CREATE POLICY "ai_credit_ledger_own_read"
  ON public.ai_credit_ledger FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ─── 6. SEED DEFAULT PLANS ───────────────────────────────────────────────────

INSERT INTO public.subscription_plans (
  plan_code, plan_name, description,
  price_amount, billing_interval,
  trial_duration_days,
  monthly_ai_credits, daily_ai_request_limit, monthly_voice_seconds,
  text_ai_enabled, voice_ai_enabled,
  ai_history_enabled, ai_history_retention_days,
  managed_people_enabled, shared_spaces_enabled,
  standard_reports_enabled, family_reports_enabled,
  is_active, display_order
) VALUES
  (
    'free_trial', 'Free Trial',
    'Try Smart Pocket AI for 2 months — no credit card required',
    0, 'none', 60,
    50, 5, 600,
    true, true,
    false, 30,
    false, false,
    true, false,
    true, 1
  ),
  (
    'personal', 'Personal',
    'Full AI-powered finance tracking for individuals',
    9.99, 'monthly', 0,
    300, 25, 3600,
    true, true,
    true, 90,
    false, false,
    true, false,
    true, 2
  ),
  (
    'family', 'Family',
    'Shared AI finance management for households',
    19.99, 'monthly', 0,
    1000, 75, 15000,
    true, true,
    true, 365,
    true, true,
    true, true,
    true, 3
  )
ON CONFLICT (plan_code) DO UPDATE SET
  plan_name                = EXCLUDED.plan_name,
  description              = EXCLUDED.description,
  price_amount             = EXCLUDED.price_amount,
  billing_interval         = EXCLUDED.billing_interval,
  trial_duration_days      = EXCLUDED.trial_duration_days,
  monthly_ai_credits       = EXCLUDED.monthly_ai_credits,
  daily_ai_request_limit   = EXCLUDED.daily_ai_request_limit,
  monthly_voice_seconds    = EXCLUDED.monthly_voice_seconds,
  text_ai_enabled          = EXCLUDED.text_ai_enabled,
  voice_ai_enabled         = EXCLUDED.voice_ai_enabled,
  ai_history_enabled       = EXCLUDED.ai_history_enabled,
  ai_history_retention_days = EXCLUDED.ai_history_retention_days,
  managed_people_enabled   = EXCLUDED.managed_people_enabled,
  shared_spaces_enabled    = EXCLUDED.shared_spaces_enabled,
  standard_reports_enabled = EXCLUDED.standard_reports_enabled,
  family_reports_enabled   = EXCLUDED.family_reports_enabled,
  is_active                = EXCLUDED.is_active,
  display_order            = EXCLUDED.display_order,
  updated_at               = now();

-- Backfill existing users who have no subscription
DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN
    SELECT up.id FROM public.user_profiles up
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_subscriptions us WHERE us.user_id = up.id
    )
  LOOP
    BEGIN
      PERFORM public.assign_free_trial(v_user.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Backfill failed for user %: %', v_user.id, SQLERRM;
    END;
  END LOOP;
END $$;

-- ─── 7. RPC GRANTS (EXPLICIT) ────────────────────────────────────────────────
-- Lock down function execution (do not expose admin or service-only RPCs to anon/public)

REVOKE ALL ON FUNCTION public.is_admin_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_user() TO authenticated;

REVOKE ALL ON FUNCTION public.get_user_subscription_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_subscription_summary(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_subscription_admin_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subscription_admin_stats() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_grant_promotional_credits(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_grant_promotional_credits(UUID, UUID, INTEGER, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_change_user_plan(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_change_user_plan(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_free_trial(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_free_trial(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_or_create_usage_cycle(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_usage_cycle(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.check_ai_access(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_ai_access(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_ai_credits(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_ai_credits(UUID, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.finalise_ai_credits(UUID, UUID, UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT, NUMERIC, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalise_ai_credits(UUID, UUID, UUID, UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT, NUMERIC, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.refund_ai_credits(UUID, UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_ai_credits(UUID, UUID, UUID, TEXT) TO service_role;
