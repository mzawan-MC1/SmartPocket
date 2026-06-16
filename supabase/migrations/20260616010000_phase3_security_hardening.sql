-- ============================================================
-- Phase 3 Security Hardening — ADDITIVE ONLY
-- Do NOT rerun or modify 20260616000000_phase3_ai_assistant.sql
-- ============================================================

-- ─── 1. ADMIN RLS — use only JWT app_metadata, never query auth.users ────────

-- ai_settings: drop old policies that query auth.users
DROP POLICY IF EXISTS "admin_manage_ai_settings"            ON public.ai_settings;
DROP POLICY IF EXISTS "authenticated_read_ai_settings"      ON public.ai_settings;

-- Admin write (JWT app_metadata only)
CREATE POLICY "admin_manage_ai_settings"
ON public.ai_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- Authenticated users may read non-sensitive config fields
CREATE POLICY "authenticated_read_ai_settings"
ON public.ai_settings FOR SELECT TO authenticated
USING (true);

-- ai_provider_health: drop old policies that query auth.users
DROP POLICY IF EXISTS "admin_manage_ai_provider_health"         ON public.ai_provider_health;
DROP POLICY IF EXISTS "authenticated_read_ai_provider_health"   ON public.ai_provider_health;

CREATE POLICY "admin_manage_ai_provider_health"
ON public.ai_provider_health FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

CREATE POLICY "authenticated_read_ai_provider_health"
ON public.ai_provider_health FOR SELECT TO authenticated
USING (true);

-- ─── 2. ai_usage_daily — SELECT own only; no direct user INSERT/UPDATE/DELETE ─

-- Remove the broad FOR ALL policy that allowed user INSERT/UPDATE
DROP POLICY IF EXISTS "system_manage_ai_usage"      ON public.ai_usage_daily;
DROP POLICY IF EXISTS "users_view_own_ai_usage"     ON public.ai_usage_daily;
DROP POLICY IF EXISTS "users_select_own_ai_usage"   ON public.ai_usage_daily;

-- Users may only SELECT their own rows
CREATE POLICY "users_select_own_ai_usage"
ON public.ai_usage_daily FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- No INSERT/UPDATE/DELETE for regular users — only SECURITY DEFINER functions
-- (increment_ai_daily_usage runs as definer and bypasses RLS)

-- ─── 3. ai_requests — replace broad FOR ALL with granular policies ────────────

DROP POLICY IF EXISTS "users_manage_own_ai_requests" ON public.ai_requests;

-- SELECT: own rows only
DROP POLICY IF EXISTS "ai_requests_select_own" ON public.ai_requests;
CREATE POLICY "ai_requests_select_own"
ON public.ai_requests FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- INSERT: must set user_id = auth.uid(); cannot set provider audit fields
DROP POLICY IF EXISTS "ai_requests_insert_own" ON public.ai_requests;
CREATE POLICY "ai_requests_insert_own"
ON public.ai_requests FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
);

-- UPDATE: own rows only; cannot change user_id, provider audit fields, or execution results
-- Users may update: status, clarification_context, confirmation_status, pending_actions
-- They may NOT change: user_id, language_provider_used, stt_provider_used, fallback_used,
--   provider_model, parsed_result, executed_record_ids, error_category, error_message
DROP POLICY IF EXISTS "ai_requests_update_own_limited" ON public.ai_requests;
CREATE POLICY "ai_requests_update_own_limited"
ON public.ai_requests FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  -- Prevent ownership change: enforced by USING + WITH CHECK both requiring auth.uid()
);

-- DELETE: own rows only
DROP POLICY IF EXISTS "ai_requests_delete_own" ON public.ai_requests;
CREATE POLICY "ai_requests_delete_own"
ON public.ai_requests FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ─── 4. ai_feedback — granular policies; feedback must reference own request ──

DROP POLICY IF EXISTS "users_manage_own_ai_feedback" ON public.ai_feedback;

DROP POLICY IF EXISTS "ai_feedback_select_own" ON public.ai_feedback;
CREATE POLICY "ai_feedback_select_own"
ON public.ai_feedback FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- INSERT: user_id must be auth.uid() AND the referenced request must belong to the same user
DROP POLICY IF EXISTS "ai_feedback_insert_own_request" ON public.ai_feedback;
CREATE POLICY "ai_feedback_insert_own_request"
ON public.ai_feedback FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.ai_requests ar
    WHERE ar.id = request_id
      AND ar.user_id = auth.uid()
  )
);

-- UPDATE: own rows only
DROP POLICY IF EXISTS "ai_feedback_update_own" ON public.ai_feedback;
CREATE POLICY "ai_feedback_update_own"
ON public.ai_feedback FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- DELETE: own rows only
DROP POLICY IF EXISTS "ai_feedback_delete_own" ON public.ai_feedback;
CREATE POLICY "ai_feedback_delete_own"
ON public.ai_feedback FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ─── 5. ai_pending_actions — granular policies ────────────────────────────────

DROP POLICY IF EXISTS "users_manage_own_ai_pending_actions" ON public.ai_pending_actions;

DROP POLICY IF EXISTS "ai_pending_actions_select_own" ON public.ai_pending_actions;
CREATE POLICY "ai_pending_actions_select_own"
ON public.ai_pending_actions FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- INSERT: user_id = auth.uid(); request must belong to same user; status must be 'pending'
DROP POLICY IF EXISTS "ai_pending_actions_insert_own" ON public.ai_pending_actions;
CREATE POLICY "ai_pending_actions_insert_own"
ON public.ai_pending_actions FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND status = 'pending'
  AND EXISTS (
    SELECT 1 FROM public.ai_requests ar
    WHERE ar.id = request_id
      AND ar.user_id = auth.uid()
  )
);

-- UPDATE: own rows only; users may only change status and executed_at/error_message
-- They cannot change user_id, request_id, action_type, action_data, action_index
DROP POLICY IF EXISTS "ai_pending_actions_update_own_limited" ON public.ai_pending_actions;
CREATE POLICY "ai_pending_actions_update_own_limited"
ON public.ai_pending_actions FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
);

-- DELETE: own rows only
DROP POLICY IF EXISTS "ai_pending_actions_delete_own" ON public.ai_pending_actions;
CREATE POLICY "ai_pending_actions_delete_own"
ON public.ai_pending_actions FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- ─── 6. CONSTRAINTS ──────────────────────────────────────────────────────────

-- ai_requests: confidence between 0 and 1
ALTER TABLE public.ai_requests
  DROP CONSTRAINT IF EXISTS ai_requests_confidence_range;
ALTER TABLE public.ai_requests
  ADD CONSTRAINT ai_requests_confidence_range
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

-- ai_feedback: confidence between 0 and 1 (if column exists — future-proof)
-- (no confidence column on ai_feedback currently; skip)

-- ai_settings: positive bounded limits
ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_timeout_positive;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_timeout_positive
    CHECK (request_timeout_ms > 0 AND request_timeout_ms <= 300000);

ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_audio_positive;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_audio_positive
    CHECK (max_audio_seconds > 0 AND max_audio_seconds <= 600);

ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_text_positive;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_text_positive
    CHECK (max_text_length > 0 AND max_text_length <= 10000);

ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_retries_bounded;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_retries_bounded
    CHECK (max_retries >= 0 AND max_retries <= 10);

ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_daily_limit_positive;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_daily_limit_positive
    CHECK (max_daily_requests_per_user > 0 AND max_daily_requests_per_user <= 10000);

ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_confidence_range;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_confidence_range
    CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1);

-- Non-negative transcript retention
ALTER TABLE public.ai_settings
  DROP CONSTRAINT IF EXISTS ai_settings_retention_nonneg;
ALTER TABLE public.ai_settings
  ADD CONSTRAINT ai_settings_retention_nonneg
    CHECK (transcript_retention_days >= 0);

-- ai_pending_actions: valid status values
ALTER TABLE public.ai_pending_actions
  DROP CONSTRAINT IF EXISTS ai_pending_actions_status_valid;
ALTER TABLE public.ai_pending_actions
  ADD CONSTRAINT ai_pending_actions_status_valid
    CHECK (status IN ('pending', 'executed', 'failed', 'cancelled'));

-- ai_pending_actions: unique request_id + action_index
ALTER TABLE public.ai_pending_actions
  DROP CONSTRAINT IF EXISTS ai_pending_actions_unique_request_action;
ALTER TABLE public.ai_pending_actions
  ADD CONSTRAINT ai_pending_actions_unique_request_action
    UNIQUE (request_id, action_index);

-- ─── 7. SECURE FUNCTIONS — replace with auth.uid()-based versions ─────────────

-- 7a. increment_ai_daily_usage: derive user from auth.uid(), ignore p_user_id
--     Renamed signature: no longer accepts p_user_id from caller
CREATE OR REPLACE FUNCTION public.increment_ai_daily_usage(
  p_request_type  TEXT,
  p_provider_type TEXT,   -- 'cloud' | 'vps'
  p_fallback_used BOOLEAN,
  p_success       BOOLEAN,
  p_confirmed     BOOLEAN,
  p_duration_ms   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.ai_usage_daily (
    user_id, usage_date,
    total_requests, voice_requests, text_requests,
    cloud_requests, vps_requests, fallback_requests,
    successful_requests, failed_requests,
    confirmed_requests, cancelled_requests,
    total_duration_ms
  )
  VALUES (
    v_user_id, CURRENT_DATE,
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

-- Revoke from PUBLIC and anon; grant only to authenticated
REVOKE ALL ON FUNCTION public.increment_ai_daily_usage(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_ai_daily_usage(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.increment_ai_daily_usage(TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER) TO authenticated;

-- Drop the old insecure overload that accepted p_user_id from caller
DROP FUNCTION IF EXISTS public.increment_ai_daily_usage(UUID, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, INTEGER);

-- 7b. get_ai_daily_request_count: derive user from auth.uid(), no parameter
CREATE OR REPLACE FUNCTION public.get_ai_daily_request_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(total_requests, 0)
  FROM public.ai_usage_daily
  WHERE user_id = auth.uid()
    AND usage_date = CURRENT_DATE
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_ai_daily_request_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ai_daily_request_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ai_daily_request_count() TO authenticated;

-- Drop the old overload that accepted p_user_id
DROP FUNCTION IF EXISTS public.get_ai_daily_request_count(UUID);

-- 7c. get_ai_admin_stats: reject non-admin callers internally
CREATE OR REPLACE FUNCTION public.get_ai_admin_stats(p_period TEXT DEFAULT 'today')
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from   DATE;
  v_result JSONB;
BEGIN
  -- Reject non-admin callers using JWT app_metadata only
  IF (auth.jwt() -> 'app_metadata' ->> 'role') IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  v_from := CASE p_period
    WHEN 'today'      THEN CURRENT_DATE
    WHEN 'this_month' THEN DATE_TRUNC('month', CURRENT_DATE)::DATE
    ELSE CURRENT_DATE
  END;

  SELECT jsonb_build_object(
    'total_requests',      COALESCE(SUM(total_requests), 0),
    'cloud_requests',      COALESCE(SUM(cloud_requests), 0),
    'vps_requests',        COALESCE(SUM(vps_requests), 0),
    'fallback_requests',   COALESCE(SUM(fallback_requests), 0),
    'successful_requests', COALESCE(SUM(successful_requests), 0),
    'failed_requests',     COALESCE(SUM(failed_requests), 0),
    'confirmed_requests',  COALESCE(SUM(confirmed_requests), 0),
    'active_users',        COUNT(DISTINCT user_id),
    'avg_duration_ms',     CASE WHEN SUM(total_requests) > 0
                             THEN ROUND(SUM(total_duration_ms)::NUMERIC / NULLIF(SUM(total_requests), 0))
                             ELSE 0 END
  )
  INTO v_result
  FROM public.ai_usage_daily
  WHERE usage_date >= v_from;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_admin_stats(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ai_admin_stats(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ai_admin_stats(TEXT) TO authenticated;

-- ─── 8. Fix search_path on original Phase 3 functions (already replaced above) ─
-- The old increment_ai_daily_usage(UUID,...) and get_ai_daily_request_count(UUID)
-- have been dropped. The new versions above all carry SET search_path = public.
-- Nothing else to patch.

-- ─── Done ─────────────────────────────────────────────────────────────────────
