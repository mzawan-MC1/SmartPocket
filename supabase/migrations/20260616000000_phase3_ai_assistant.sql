-- ============================================================
-- Phase 3: AI Assistant & Voice Transaction Entry
-- Safe, additive migration — no DROP TABLE, no destructive ops
-- ============================================================

-- ─── ENUM TYPES (safe create — no DROP CASCADE) ──────────────

DO $$ BEGIN
  CREATE TYPE public.ai_mode AS ENUM (
    'cloud_only',
    'vps_only',
    'cloud_primary',
    'vps_primary'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_request_type AS ENUM (
    'voice',
    'text'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_request_status AS ENUM (
    'pending',
    'parsed',
    'clarifying',
    'confirmed',
    'executed',
    'cancelled',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_provider_name AS ENUM (
    'openrouter',
    'vps_ai',
    'cloud_stt',
    'vps_stt',
    'mock'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_provider_health_status AS ENUM (
    'healthy',
    'degraded',
    'offline',
    'not_configured'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_feedback_type AS ENUM (
    'correct',
    'partially_correct',
    'incorrect'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_overall_intent AS ENUM (
    'personal_transaction',
    'managed_person_transaction',
    'transfer',
    'reimbursement',
    'settlement',
    'budget',
    'recurring_transaction',
    'multiple_actions',
    'unclear'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── TABLE: ai_settings ──────────────────────────────────────
-- Non-sensitive AI configuration. Secrets live server-side only.

CREATE TABLE IF NOT EXISTS public.ai_settings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Singleton row per platform (not per user)
  singleton_key               TEXT NOT NULL DEFAULT 'global' UNIQUE,

  ai_enabled                  BOOLEAN NOT NULL DEFAULT false,
  ai_mode                     public.ai_mode NOT NULL DEFAULT 'cloud_primary',

  -- Provider selection (names only — no secrets)
  primary_language_provider   TEXT NOT NULL DEFAULT 'openrouter',
  fallback_language_provider  TEXT NOT NULL DEFAULT 'vps_ai',
  primary_stt_provider        TEXT NOT NULL DEFAULT 'cloud_stt',
  fallback_stt_provider       TEXT NOT NULL DEFAULT 'vps_stt',

  -- Model names (not secrets)
  openrouter_model            TEXT,
  vps_language_model          TEXT,
  cloud_stt_model             TEXT,
  vps_stt_model               TEXT,

  -- VPS endpoint URLs (not secrets — just addresses)
  vps_ai_base_url             TEXT,
  vps_stt_base_url            TEXT,

  -- Behaviour
  request_timeout_ms          INTEGER NOT NULL DEFAULT 20000,
  max_retries                 INTEGER NOT NULL DEFAULT 1,
  confidence_threshold        NUMERIC(4,3) NOT NULL DEFAULT 0.800,
  require_confirmation        BOOLEAN NOT NULL DEFAULT true,
  max_audio_seconds           INTEGER NOT NULL DEFAULT 120,
  max_daily_requests_per_user INTEGER NOT NULL DEFAULT 100,
  max_text_length             INTEGER NOT NULL DEFAULT 2000,
  enable_auto_fallback        BOOLEAN NOT NULL DEFAULT true,

  -- Audit & retention
  enable_audit_logs           BOOLEAN NOT NULL DEFAULT true,
  enable_transcript_retention BOOLEAN NOT NULL DEFAULT false,
  transcript_retention_days   INTEGER NOT NULL DEFAULT 30,

  -- Config status (masked — never expose raw keys)
  openrouter_configured       BOOLEAN NOT NULL DEFAULT false,
  cloud_stt_configured        BOOLEAN NOT NULL DEFAULT false,
  vps_ai_configured           BOOLEAN NOT NULL DEFAULT false,
  vps_stt_configured          BOOLEAN NOT NULL DEFAULT false,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── TABLE: ai_requests ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,

  request_type          public.ai_request_type NOT NULL DEFAULT 'text',
  status                public.ai_request_status NOT NULL DEFAULT 'pending',
  overall_intent        public.ai_overall_intent,

  -- Input
  raw_text              TEXT,
  transcript            TEXT,
  transcript_retained   BOOLEAN NOT NULL DEFAULT false,
  input_language        TEXT NOT NULL DEFAULT 'en',
  detected_language     TEXT,

  -- Provider tracking
  language_provider_used  public.ai_provider_name,
  stt_provider_used       public.ai_provider_name,
  fallback_used           BOOLEAN NOT NULL DEFAULT false,
  provider_model          TEXT,

  -- Parsed result (structured JSON — validated before storage)
  parsed_result         JSONB,
  pending_actions       JSONB,
  clarification_context JSONB,

  -- Execution
  executed_record_ids   JSONB,   -- array of {table, id} after confirmed save
  confirmation_status   TEXT,    -- 'confirmed' | 'cancelled' | null

  -- Performance
  stt_duration_ms       INTEGER,
  parse_duration_ms     INTEGER,
  total_duration_ms     INTEGER,

  -- Quality
  confidence            NUMERIC(4,3),
  warnings              JSONB,
  missing_fields        JSONB,
  requires_clarification BOOLEAN NOT NULL DEFAULT false,

  -- Error tracking
  error_category        TEXT,
  error_message         TEXT,

  -- Idempotency
  idempotency_key       TEXT UNIQUE,

  -- Token/usage metadata (provider-reported, no secrets)
  usage_metadata        JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── TABLE: ai_usage_daily ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  usage_date          DATE NOT NULL DEFAULT CURRENT_DATE,

  total_requests      INTEGER NOT NULL DEFAULT 0,
  voice_requests      INTEGER NOT NULL DEFAULT 0,
  text_requests       INTEGER NOT NULL DEFAULT 0,
  cloud_requests      INTEGER NOT NULL DEFAULT 0,
  vps_requests        INTEGER NOT NULL DEFAULT 0,
  fallback_requests   INTEGER NOT NULL DEFAULT 0,
  successful_requests INTEGER NOT NULL DEFAULT 0,
  failed_requests     INTEGER NOT NULL DEFAULT 0,
  confirmed_requests  INTEGER NOT NULL DEFAULT 0,
  cancelled_requests  INTEGER NOT NULL DEFAULT 0,

  total_duration_ms   BIGINT NOT NULL DEFAULT 0,

  UNIQUE (user_id, usage_date)
);

-- ─── TABLE: ai_provider_health ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_provider_health (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            public.ai_provider_name NOT NULL,
  status              public.ai_provider_health_status NOT NULL DEFAULT 'not_configured',
  last_checked_at     TIMESTAMPTZ,
  last_success_at     TIMESTAMPTZ,
  last_failure_at     TIMESTAMPTZ,
  -- Sanitised error — never expose secrets
  last_error_category TEXT,
  response_time_ms    INTEGER,
  model_used          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

-- ─── TABLE: ai_feedback ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  request_id      UUID NOT NULL REFERENCES public.ai_requests(id) ON DELETE CASCADE,
  feedback_type   public.ai_feedback_type NOT NULL,
  -- Which fields were wrong (no financial data stored here)
  wrong_fields    JSONB,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── TABLE: ai_pending_actions ───────────────────────────────
-- Temporary staging for confirmed-but-not-yet-executed actions

CREATE TABLE IF NOT EXISTS public.ai_pending_actions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  request_id      UUID NOT NULL REFERENCES public.ai_requests(id) ON DELETE CASCADE,
  action_index    INTEGER NOT NULL DEFAULT 0,
  action_type     TEXT NOT NULL,
  action_data     JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | executed | failed | cancelled
  executed_at     TIMESTAMPTZ,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── INDEXES ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ai_requests_user_id       ON public.ai_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_status        ON public.ai_requests(status);
CREATE INDEX IF NOT EXISTS idx_ai_requests_created_at    ON public.ai_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_requests_idempotency   ON public.ai_requests(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_usage_daily_user_date  ON public.ai_usage_daily(user_id, usage_date DESC);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_user_id       ON public.ai_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_request_id    ON public.ai_feedback(request_id);

CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_user   ON public.ai_pending_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_req    ON public.ai_pending_actions(request_id);
CREATE INDEX IF NOT EXISTS idx_ai_pending_actions_status ON public.ai_pending_actions(status);

-- ─── FUNCTIONS ───────────────────────────────────────────────

-- Increment daily usage counter (upsert)
CREATE OR REPLACE FUNCTION public.increment_ai_daily_usage(
  p_user_id         UUID,
  p_request_type    TEXT,
  p_provider_type   TEXT,   -- 'cloud' | 'vps'
  p_fallback_used   BOOLEAN,
  p_success         BOOLEAN,
  p_confirmed       BOOLEAN,
  p_duration_ms     INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ai_usage_daily (
    user_id, usage_date,
    total_requests, voice_requests, text_requests,
    cloud_requests, vps_requests, fallback_requests,
    successful_requests, failed_requests,
    confirmed_requests, cancelled_requests,
    total_duration_ms
  )
  VALUES (
    p_user_id, CURRENT_DATE,
    1,
    CASE WHEN p_request_type = 'voice' THEN 1 ELSE 0 END,
    CASE WHEN p_request_type = 'text'  THEN 1 ELSE 0 END,
    CASE WHEN p_provider_type = 'cloud' THEN 1 ELSE 0 END,
    CASE WHEN p_provider_type = 'vps'   THEN 1 ELSE 0 END,
    CASE WHEN p_fallback_used THEN 1 ELSE 0 END,
    CASE WHEN p_success THEN 1 ELSE 0 END,
    CASE WHEN NOT p_success THEN 1 ELSE 0 END,
    CASE WHEN p_confirmed THEN 1 ELSE 0 END,
    0,
    COALESCE(p_duration_ms, 0)
  )
  ON CONFLICT (user_id, usage_date) DO UPDATE SET
    total_requests      = ai_usage_daily.total_requests + 1,
    voice_requests      = ai_usage_daily.voice_requests      + CASE WHEN p_request_type = 'voice' THEN 1 ELSE 0 END,
    text_requests       = ai_usage_daily.text_requests       + CASE WHEN p_request_type = 'text'  THEN 1 ELSE 0 END,
    cloud_requests      = ai_usage_daily.cloud_requests      + CASE WHEN p_provider_type = 'cloud' THEN 1 ELSE 0 END,
    vps_requests        = ai_usage_daily.vps_requests        + CASE WHEN p_provider_type = 'vps'   THEN 1 ELSE 0 END,
    fallback_requests   = ai_usage_daily.fallback_requests   + CASE WHEN p_fallback_used THEN 1 ELSE 0 END,
    successful_requests = ai_usage_daily.successful_requests + CASE WHEN p_success THEN 1 ELSE 0 END,
    failed_requests     = ai_usage_daily.failed_requests     + CASE WHEN NOT p_success THEN 1 ELSE 0 END,
    confirmed_requests  = ai_usage_daily.confirmed_requests  + CASE WHEN p_confirmed THEN 1 ELSE 0 END,
    total_duration_ms   = ai_usage_daily.total_duration_ms   + COALESCE(p_duration_ms, 0);
END;
$$;

-- Get user's daily request count (for rate limiting)
CREATE OR REPLACE FUNCTION public.get_ai_daily_request_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(total_requests, 0)
  FROM public.ai_usage_daily
  WHERE user_id = p_user_id AND usage_date = CURRENT_DATE
  LIMIT 1;
$$;

-- Admin aggregate stats (no personal data exposed)
CREATE OR REPLACE FUNCTION public.get_ai_admin_stats(p_period TEXT DEFAULT 'today')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_from DATE;
  v_result JSONB;
BEGIN
  v_from := CASE p_period
    WHEN 'today'        THEN CURRENT_DATE
    WHEN 'this_month'   THEN DATE_TRUNC('month', CURRENT_DATE)::DATE
    ELSE CURRENT_DATE
  END;

  SELECT jsonb_build_object(
    'total_requests',     COALESCE(SUM(total_requests), 0),
    'cloud_requests',     COALESCE(SUM(cloud_requests), 0),
    'vps_requests',       COALESCE(SUM(vps_requests), 0),
    'fallback_requests',  COALESCE(SUM(fallback_requests), 0),
    'successful_requests',COALESCE(SUM(successful_requests), 0),
    'failed_requests',    COALESCE(SUM(failed_requests), 0),
    'confirmed_requests', COALESCE(SUM(confirmed_requests), 0),
    'active_users',       COUNT(DISTINCT user_id),
    'avg_duration_ms',    CASE WHEN SUM(total_requests) > 0
                            THEN ROUND(SUM(total_duration_ms)::NUMERIC / NULLIF(SUM(total_requests), 0))
                            ELSE 0 END
  )
  INTO v_result
  FROM public.ai_usage_daily
  WHERE usage_date >= v_from;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

-- ─── ENABLE RLS ───────────────────────────────────────────────

ALTER TABLE public.ai_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_requests         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_daily      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_health  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_pending_actions  ENABLE ROW LEVEL SECURITY;

-- ─── RLS POLICIES ────────────────────────────────────────────

-- ai_settings: admin read/write, authenticated read (non-sensitive fields only)
DROP POLICY IF EXISTS "admin_manage_ai_settings" ON public.ai_settings;
CREATE POLICY "admin_manage_ai_settings"
ON public.ai_settings FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' = 'admin' OR au.raw_user_meta_data->>'role' = 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' = 'admin' OR au.raw_user_meta_data->>'role' = 'admin')
  )
);

DROP POLICY IF EXISTS "authenticated_read_ai_settings" ON public.ai_settings;
CREATE POLICY "authenticated_read_ai_settings"
ON public.ai_settings FOR SELECT TO authenticated
USING (true);

-- ai_requests: users see only their own
DROP POLICY IF EXISTS "users_manage_own_ai_requests" ON public.ai_requests;
CREATE POLICY "users_manage_own_ai_requests"
ON public.ai_requests FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ai_usage_daily: users see only their own
DROP POLICY IF EXISTS "users_view_own_ai_usage" ON public.ai_usage_daily;
CREATE POLICY "users_view_own_ai_usage"
ON public.ai_usage_daily FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "system_manage_ai_usage" ON public.ai_usage_daily;
CREATE POLICY "system_manage_ai_usage"
ON public.ai_usage_daily FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ai_provider_health: admin write, authenticated read
DROP POLICY IF EXISTS "admin_manage_ai_provider_health" ON public.ai_provider_health;
CREATE POLICY "admin_manage_ai_provider_health"
ON public.ai_provider_health FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' = 'admin' OR au.raw_user_meta_data->>'role' = 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' = 'admin' OR au.raw_user_meta_data->>'role' = 'admin')
  )
);

DROP POLICY IF EXISTS "authenticated_read_ai_provider_health" ON public.ai_provider_health;
CREATE POLICY "authenticated_read_ai_provider_health"
ON public.ai_provider_health FOR SELECT TO authenticated
USING (true);

-- ai_feedback: users manage their own
DROP POLICY IF EXISTS "users_manage_own_ai_feedback" ON public.ai_feedback;
CREATE POLICY "users_manage_own_ai_feedback"
ON public.ai_feedback FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ai_pending_actions: users manage their own
DROP POLICY IF EXISTS "users_manage_own_ai_pending_actions" ON public.ai_pending_actions;
CREATE POLICY "users_manage_own_ai_pending_actions"
ON public.ai_pending_actions FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ─── SEED: ai_settings singleton ─────────────────────────────

INSERT INTO public.ai_settings (singleton_key)
VALUES ('global')
ON CONFLICT (singleton_key) DO NOTHING;

-- ─── SEED: ai_provider_health initial rows ───────────────────

INSERT INTO public.ai_provider_health (provider, status) VALUES
  ('openrouter', 'not_configured'),
  ('vps_ai',     'not_configured'),
  ('cloud_stt',  'not_configured'),
  ('vps_stt',    'not_configured')
ON CONFLICT (provider) DO NOTHING;
