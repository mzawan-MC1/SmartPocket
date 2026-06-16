-- ============================================================
-- Phase 3 AI Integrity — ADDITIVE ONLY
-- Do NOT rerun or modify 20260616000000_phase3_ai_assistant.sql
-- Do NOT rerun or modify 20260616010000_phase3_security_hardening.sql
-- ============================================================

-- ─── 1. ai_requests field-protection trigger ──────────────────────────────────
--
-- Normal authenticated users may only change:
--   clarification_context, confirmation_status, transcript_retained,
--   and cancellation-related status changes (status → 'cancelled').
--
-- Server-side code (service role / SECURITY DEFINER) bypasses RLS and
-- therefore also bypasses this trigger (trigger runs as the row owner's
-- role; service-role sessions are superuser-equivalent and skip triggers
-- that check current_setting('role') — we detect them via pg_has_role).
--
-- Fields locked from normal users:
--   user_id, request_type, language_provider_used, stt_provider_used,
--   fallback_used, provider_model, parsed_result, executed_record_ids,
--   confidence, error_category, error_message, usage_metadata, created_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_ai_requests_field_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service-role / postgres superuser to update any field freely.
  -- pg_has_role returns TRUE when the current session has the 'service_role'
  -- or 'postgres' role (both are superuser-equivalent in Supabase).
  IF pg_has_role(current_user, 'service_role', 'USAGE')
     OR current_user = 'postgres'
     OR current_user = 'supabase_admin'
  THEN
    RETURN NEW;
  END IF;

  -- ── Locked fields — raise if the caller tried to change them ──────────────

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'ai_requests: user_id is immutable';
  END IF;

  IF NEW.request_type IS DISTINCT FROM OLD.request_type THEN
    RAISE EXCEPTION 'ai_requests: request_type is immutable';
  END IF;

  IF NEW.language_provider_used IS DISTINCT FROM OLD.language_provider_used THEN
    RAISE EXCEPTION 'ai_requests: language_provider_used is server-controlled';
  END IF;

  IF NEW.stt_provider_used IS DISTINCT FROM OLD.stt_provider_used THEN
    RAISE EXCEPTION 'ai_requests: stt_provider_used is server-controlled';
  END IF;

  IF NEW.fallback_used IS DISTINCT FROM OLD.fallback_used THEN
    RAISE EXCEPTION 'ai_requests: fallback_used is server-controlled';
  END IF;

  IF NEW.provider_model IS DISTINCT FROM OLD.provider_model THEN
    RAISE EXCEPTION 'ai_requests: provider_model is server-controlled';
  END IF;

  IF NEW.parsed_result IS DISTINCT FROM OLD.parsed_result THEN
    RAISE EXCEPTION 'ai_requests: parsed_result is server-controlled';
  END IF;

  IF NEW.executed_record_ids IS DISTINCT FROM OLD.executed_record_ids THEN
    RAISE EXCEPTION 'ai_requests: executed_record_ids is server-controlled';
  END IF;

  IF NEW.confidence IS DISTINCT FROM OLD.confidence THEN
    RAISE EXCEPTION 'ai_requests: confidence is server-controlled';
  END IF;

  IF NEW.error_category IS DISTINCT FROM OLD.error_category THEN
    RAISE EXCEPTION 'ai_requests: error_category is server-controlled';
  END IF;

  IF NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'ai_requests: error_message is server-controlled';
  END IF;

  IF NEW.usage_metadata IS DISTINCT FROM OLD.usage_metadata THEN
    RAISE EXCEPTION 'ai_requests: usage_metadata is server-controlled';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ai_requests: created_at is immutable';
  END IF;

  -- ── Status changes — users may only cancel ────────────────────────────────
  -- If status is being changed, the only allowed transition for a normal user
  -- is to set it to 'cancelled'. All other status transitions are server-only.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'ai_requests: users may only set status to ''cancelled''';
    END IF;
    -- Only allow cancellation from a non-terminal state
    IF OLD.status IN ('executed', 'failed', 'cancelled') THEN
      RAISE EXCEPTION 'ai_requests: cannot cancel a request in terminal state ''%''', OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger (idempotent)
DROP TRIGGER IF EXISTS ai_requests_field_guard ON public.ai_requests;
CREATE TRIGGER ai_requests_field_guard
  BEFORE UPDATE ON public.ai_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ai_requests_field_guard();

-- ─── 2. ai_pending_actions field-protection trigger ───────────────────────────
--
-- Normal users may only cancel their own pending action
-- (set status = 'cancelled' when current status = 'pending').
--
-- Locked from normal users:
--   user_id, request_id, action_index, action_type, action_data, created_at
--
-- Only trusted server-side code may:
--   • set status to 'executed' or 'failed'
--   • set executed_at
--   • set error_message
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_ai_pending_actions_field_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service-role / postgres superuser to update any field freely.
  IF pg_has_role(current_user, 'service_role', 'USAGE')
     OR current_user = 'postgres'
     OR current_user = 'supabase_admin'
  THEN
    RETURN NEW;
  END IF;

  -- ── Locked fields ─────────────────────────────────────────────────────────

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'ai_pending_actions: user_id is immutable';
  END IF;

  IF NEW.request_id IS DISTINCT FROM OLD.request_id THEN
    RAISE EXCEPTION 'ai_pending_actions: request_id is immutable';
  END IF;

  IF NEW.action_index IS DISTINCT FROM OLD.action_index THEN
    RAISE EXCEPTION 'ai_pending_actions: action_index is immutable';
  END IF;

  IF NEW.action_type IS DISTINCT FROM OLD.action_type THEN
    RAISE EXCEPTION 'ai_pending_actions: action_type is immutable';
  END IF;

  IF NEW.action_data IS DISTINCT FROM OLD.action_data THEN
    RAISE EXCEPTION 'ai_pending_actions: action_data is immutable';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ai_pending_actions: created_at is immutable';
  END IF;

  -- ── Server-only fields — block normal users ───────────────────────────────

  IF NEW.executed_at IS DISTINCT FROM OLD.executed_at THEN
    RAISE EXCEPTION 'ai_pending_actions: executed_at is server-controlled';
  END IF;

  IF NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'ai_pending_actions: error_message is server-controlled';
  END IF;

  -- ── Status changes — users may only cancel pending actions ────────────────
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Block server-only transitions for normal users
    IF NEW.status IN ('executed', 'failed') THEN
      RAISE EXCEPTION 'ai_pending_actions: status ''%'' may only be set by the server', NEW.status;
    END IF;
    -- Only allow cancellation from 'pending'
    IF NEW.status = 'cancelled' AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'ai_pending_actions: can only cancel a pending action (current status: ''%'')', OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger (idempotent)
DROP TRIGGER IF EXISTS ai_pending_actions_field_guard ON public.ai_pending_actions;
CREATE TRIGGER ai_pending_actions_field_guard
  BEFORE UPDATE ON public.ai_pending_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ai_pending_actions_field_guard();

-- ─── 3. Fix get_ai_daily_request_count — always COALESCE to 0 ────────────────
--
-- The previous version used:
--   SELECT COALESCE(total_requests, 0) ... LIMIT 1
-- which returns NULL (not 0) when no row exists, because LIMIT 1 on an
-- empty result set returns no rows — not a row with a NULL value.
-- The outer COALESCE(total_requests, 0) only handles a NULL column value,
-- not a missing row.  We fix this with a subquery COALESCE.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_ai_daily_request_count()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT total_requests
    FROM public.ai_usage_daily
    WHERE user_id = auth.uid()
      AND usage_date = CURRENT_DATE
    LIMIT 1
  ), 0);
$$;

REVOKE ALL ON FUNCTION public.get_ai_daily_request_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ai_daily_request_count() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_ai_daily_request_count() TO authenticated;

-- ─── Done ─────────────────────────────────────────────────────────────────────
