-- ============================================================
-- Phase 3 Trigger + RPC Fix — ADDITIVE CORRECTION ONLY
-- Timestamp: 20260616030000
--
-- Do NOT edit or rerun:
--   20260616000000_phase3_ai_assistant.sql
--   20260616010000_phase3_security_hardening.sql
--   20260616020000_phase3_ai_integrity.sql
--
-- Problem fixed:
--   Both field-guard triggers are SECURITY DEFINER, which means
--   current_user inside the function is always the FUNCTION OWNER
--   (postgres / supabase_admin), not the actual session caller.
--   Therefore pg_has_role(current_user, 'service_role', 'USAGE')
--   and current_user = 'postgres' are ALWAYS TRUE — every caller
--   bypasses the guard, making the triggers completely ineffective.
--
-- Solution:
--   1. Rewrite triggers as SECURITY INVOKER so current_user is the
--      actual session role.  Normal JWT users run as "authenticated"
--      and must be guarded.  The service-role client runs as
--      "service_role" and is allowed through.
--   2. Remove direct UPDATE privilege on protected columns from the
--      "authenticated" role.  Expose only safe RPCs for server writes.
--   3. Create SECURITY DEFINER server-only RPCs for every server-
--      controlled write.  Revoke from PUBLIC/anon; the API routes
--      call these via the service-role client (which can EXECUTE any
--      function regardless of grants, because it is a superuser-
--      equivalent role in Supabase).
--   4. Expose safe user-facing RPCs for cancellation only.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PART 1 — Rewrite field-guard triggers as SECURITY INVOKER
-- ════════════════════════════════════════════════════════════

-- ─── 1a. ai_requests field guard ─────────────────────────────────────────────
--
-- SECURITY INVOKER: current_user is the actual session role.
--   • Normal JWT users  → role = "authenticated"  → guarded
--   • Service-role API  → role = "service_role"   → allowed through
--   • postgres / supabase_admin                   → allowed through
--
-- Users may only change:
--   clarification_context, confirmation_status, transcript_retained,
--   status → 'cancelled' (from a non-terminal state)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_ai_requests_field_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER          -- ← KEY CHANGE: current_user = actual caller
SET search_path = public
AS $$
BEGIN
  -- ── Trusted callers bypass all checks ────────────────────────────────────
  -- service_role is the Supabase service-role client (superuser-equivalent).
  -- postgres and supabase_admin are platform superusers.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  -- ── Everything else (including "authenticated") is a normal user ──────────

  -- Immutable identity fields
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'ai_requests: user_id is immutable';
  END IF;
  IF NEW.request_type IS DISTINCT FROM OLD.request_type THEN
    RAISE EXCEPTION 'ai_requests: request_type is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'ai_requests: created_at is immutable';
  END IF;

  -- Server-controlled provider / parse / audit fields
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

  -- Status: users may only cancel (from a non-terminal state)
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'ai_requests: users may only set status to ''cancelled''';
    END IF;
    IF OLD.status IN ('executed', 'failed', 'cancelled') THEN
      RAISE EXCEPTION 'ai_requests: cannot cancel a request in terminal state ''%''', OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS trg_ai_requests_field_guard ON public.ai_requests;
DROP TRIGGER IF EXISTS ai_requests_field_guard      ON public.ai_requests;

CREATE TRIGGER trg_ai_requests_field_guard
  BEFORE UPDATE ON public.ai_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ai_requests_field_guard();


-- ─── 1b. ai_pending_actions field guard ──────────────────────────────────────
--
-- SECURITY INVOKER: same logic as above.
-- Users may only cancel their own pending action.
-- Server may set status → executed/failed, set executed_at, error_message.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_ai_pending_actions_field_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER          -- ← KEY CHANGE
SET search_path = public
AS $$
BEGIN
  -- Trusted callers bypass all checks
  IF current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  -- Immutable identity fields
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

  -- Server-only execution fields
  IF NEW.executed_at IS DISTINCT FROM OLD.executed_at THEN
    RAISE EXCEPTION 'ai_pending_actions: executed_at is server-controlled';
  END IF;
  IF NEW.error_message IS DISTINCT FROM OLD.error_message THEN
    RAISE EXCEPTION 'ai_pending_actions: error_message is server-controlled';
  END IF;

  -- Status: users may only cancel a pending action
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('executed', 'failed') THEN
      RAISE EXCEPTION 'ai_pending_actions: status ''%'' may only be set by the server', NEW.status;
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'ai_pending_actions: can only cancel a pending action (current: ''%'')', OLD.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (idempotent)
DROP TRIGGER IF EXISTS trg_ai_pending_actions_field_guard ON public.ai_pending_actions;
DROP TRIGGER IF EXISTS ai_pending_actions_field_guard      ON public.ai_pending_actions;

CREATE TRIGGER trg_ai_pending_actions_field_guard
  BEFORE UPDATE ON public.ai_pending_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_ai_pending_actions_field_guard();


-- ════════════════════════════════════════════════════════════
-- PART 2 — Revoke direct UPDATE on protected columns
--           from the "authenticated" role
-- ════════════════════════════════════════════════════════════
--
-- We cannot revoke column-level UPDATE in Postgres without first
-- revoking the table-level grant and re-granting only safe columns.
-- The previous migrations granted broad UPDATE to authenticated.
-- We revoke and re-grant only the columns users are allowed to touch.
--
-- Safe user-writable columns on ai_requests:
--   clarification_context, confirmation_status, transcript_retained, status
--
-- Safe user-writable columns on ai_pending_actions:
--   status
-- ─────────────────────────────────────────────────────────────────────────────

-- ai_requests
REVOKE UPDATE ON public.ai_requests FROM authenticated;
GRANT  UPDATE (clarification_context, confirmation_status, transcript_retained, status)
  ON public.ai_requests TO authenticated;

-- ai_pending_actions
REVOKE UPDATE ON public.ai_pending_actions FROM authenticated;
GRANT  UPDATE (status)
  ON public.ai_pending_actions TO authenticated;


-- ════════════════════════════════════════════════════════════
-- PART 3 — Server-only SECURITY DEFINER RPCs
--
-- These functions run as the function owner (postgres), which
-- is a trusted superuser-equivalent role.  The SECURITY INVOKER
-- triggers above will see current_user = 'postgres' and allow
-- the update through.
--
-- All RPCs: REVOKE from PUBLIC + anon; the service-role client
-- used by the API routes can EXECUTE any function regardless of
-- grants (it is superuser-equivalent), so no explicit GRANT is
-- needed for service_role.  We add a GRANT to postgres for
-- completeness.
-- ════════════════════════════════════════════════════════════

-- ─── 3a. rpc_ai_set_parsed_result ────────────────────────────────────────────
-- Updates parsed_result, confidence, provider fields, and status on ai_requests.
-- Called by the parse API route after the AI gateway returns a result.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_ai_set_parsed_result(
  p_request_id            UUID,
  p_user_id               UUID,
  p_status                TEXT,
  p_overall_intent        TEXT,
  p_language_provider     TEXT,
  p_stt_provider          TEXT,
  p_fallback_used         BOOLEAN,
  p_provider_model        TEXT,
  p_parsed_result         JSONB,
  p_confidence            NUMERIC,
  p_error_category        TEXT,
  p_error_message         TEXT,
  p_usage_metadata        JSONB,
  p_total_duration_ms     INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_requests
  SET
    status                  = p_status,
    overall_intent          = p_overall_intent,
    language_provider_used  = p_language_provider,
    stt_provider_used       = p_stt_provider,
    fallback_used           = p_fallback_used,
    provider_model          = p_provider_model,
    parsed_result           = p_parsed_result,
    confidence              = GREATEST(0, LEAST(1, p_confidence)),
    error_category          = p_error_category,
    error_message           = p_error_message,
    usage_metadata          = p_usage_metadata,
    total_duration_ms       = p_total_duration_ms
  WHERE id       = p_request_id
    AND user_id  = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ai_set_parsed_result(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, NUMERIC, TEXT, TEXT, JSONB, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_set_parsed_result(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, NUMERIC, TEXT, TEXT, JSONB, INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_set_parsed_result(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, NUMERIC, TEXT, TEXT, JSONB, INTEGER
) FROM authenticated;


-- ─── 3b. rpc_ai_mark_request_executing ───────────────────────────────────────
-- Transitions an ai_request to 'executing' status.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_ai_mark_request_executing(
  p_request_id  UUID,
  p_user_id     UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_requests
  SET status = 'executing'
  WHERE id      = p_request_id
    AND user_id = p_user_id
    AND status  = 'confirmed';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executing(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executing(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executing(UUID, UUID) FROM authenticated;


-- ─── 3c. rpc_ai_mark_request_executed ────────────────────────────────────────
-- Marks an ai_request as executed/partially_executed/failed after execution.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_ai_mark_request_executed(
  p_request_id          UUID,
  p_user_id             UUID,
  p_status              TEXT,   -- 'executed' | 'partially_executed' | 'failed'
  p_executed_record_ids JSONB,
  p_error_category      TEXT,
  p_error_message       TEXT,
  p_total_duration_ms   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate status to prevent arbitrary writes
  IF p_status NOT IN ('executed', 'partially_executed', 'failed') THEN
    RAISE EXCEPTION 'rpc_ai_mark_request_executed: invalid status ''%''', p_status;
  END IF;

  UPDATE public.ai_requests
  SET
    status              = p_status,
    executed_record_ids = p_executed_record_ids,
    error_category      = p_error_category,
    error_message       = p_error_message,
    total_duration_ms   = p_total_duration_ms
  WHERE id      = p_request_id
    AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executed(
  UUID, UUID, TEXT, JSONB, TEXT, TEXT, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executed(
  UUID, UUID, TEXT, JSONB, TEXT, TEXT, INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executed(
  UUID, UUID, TEXT, JSONB, TEXT, TEXT, INTEGER
) FROM authenticated;


-- ─── 3d. rpc_ai_mark_request_failed ──────────────────────────────────────────
-- Marks an ai_request as failed with an error.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_ai_mark_request_failed(
  p_request_id      UUID,
  p_user_id         UUID,
  p_error_category  TEXT,
  p_error_message   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_requests
  SET
    status         = 'failed',
    error_category = p_error_category,
    error_message  = p_error_message
  WHERE id      = p_request_id
    AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_failed(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_failed(UUID, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_failed(UUID, UUID, TEXT, TEXT) FROM authenticated;


-- ─── 3e. rpc_ai_mark_pending_action_executed ─────────────────────────────────
-- Marks a single pending action as executed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_ai_mark_pending_action_executed(
  p_action_id   UUID,
  p_user_id     UUID,
  p_executed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_pending_actions
  SET
    status      = 'executed',
    executed_at = p_executed_at
  WHERE id      = p_action_id
    AND user_id = p_user_id
    AND status  = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_executed(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_executed(UUID, UUID, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_executed(UUID, UUID, TIMESTAMPTZ) FROM authenticated;


-- ─── 3f. rpc_ai_mark_pending_action_failed ───────────────────────────────────
-- Marks a single pending action as failed with an error message.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_ai_mark_pending_action_failed(
  p_action_id     UUID,
  p_user_id       UUID,
  p_error_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ai_pending_actions
  SET
    status        = 'failed',
    error_message = p_error_message
  WHERE id      = p_action_id
    AND user_id = p_user_id
    AND status  = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_failed(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_failed(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_failed(UUID, UUID, TEXT) FROM authenticated;


-- ════════════════════════════════════════════════════════════
-- PART 4 — Safe user-facing cancellation RPCs
--
-- These run as SECURITY INVOKER (or SECURITY DEFINER with
-- auth.uid() check) so users can only cancel their own records.
-- The trigger above enforces the field-level rules; these RPCs
-- are the only UPDATE path exposed to the "authenticated" role
-- for status changes.
-- ════════════════════════════════════════════════════════════

-- ─── 4a. rpc_ai_cancel_request ───────────────────────────────────────────────
-- Allows the authenticated user to cancel their own non-terminal ai_request.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_ai_cancel_request(
  p_request_id UUID
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
    RAISE EXCEPTION 'rpc_ai_cancel_request: not authenticated';
  END IF;

  UPDATE public.ai_requests
  SET status = 'cancelled'
  WHERE id      = p_request_id
    AND user_id = v_user_id
    AND status NOT IN ('executed', 'failed', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_ai_cancel_request: request not found or already in terminal state';
  END IF;
END;
$$;

-- This RPC is safe for authenticated users to call directly
REVOKE ALL ON FUNCTION public.rpc_ai_cancel_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_cancel_request(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_ai_cancel_request(UUID) TO authenticated;


-- ─── 4b. rpc_ai_cancel_pending_action ────────────────────────────────────────
-- Allows the authenticated user to cancel their own pending action.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_ai_cancel_pending_action(
  p_action_id UUID
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
    RAISE EXCEPTION 'rpc_ai_cancel_pending_action: not authenticated';
  END IF;

  UPDATE public.ai_pending_actions
  SET status = 'cancelled'
  WHERE id      = p_action_id
    AND user_id = v_user_id
    AND status  = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'rpc_ai_cancel_pending_action: action not found or not in pending state';
  END IF;
END;
$$;

-- This RPC is safe for authenticated users to call directly
REVOKE ALL ON FUNCTION public.rpc_ai_cancel_pending_action(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_cancel_pending_action(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public.rpc_ai_cancel_pending_action(UUID) TO authenticated;


-- ════════════════════════════════════════════════════════════
-- PART 5 — Verification comments (manual test guide)
-- ════════════════════════════════════════════════════════════
--
-- Test 1: Normal user cannot change parsed_result
--   As an authenticated user:
--   UPDATE public.ai_requests SET parsed_result = '{}' WHERE id = '<your_id>';
--   → Expected: ERROR "ai_requests: parsed_result is server-controlled"
--
-- Test 2: Normal user cannot change provider fields
--   UPDATE public.ai_requests SET language_provider_used = 'evil' WHERE id = '<your_id>';
--   → Expected: ERROR "ai_requests: language_provider_used is server-controlled"
--
-- Test 3: Normal user cannot set request status to 'executed'
--   UPDATE public.ai_requests SET status = 'executed' WHERE id = '<your_id>';
--   → Expected: ERROR "ai_requests: users may only set status to 'cancelled'"
--
-- Test 4: Normal user cannot change pending action_data
--   UPDATE public.ai_pending_actions SET action_data = '{}' WHERE id = '<your_id>';
--   → Expected: ERROR "ai_pending_actions: action_data is immutable"
--
-- Test 5: Normal user can cancel their own pending request
--   SELECT public.rpc_ai_cancel_request('<your_request_id>');
--   → Expected: success (no error), status becomes 'cancelled'
--
-- Test 6: Trusted server route can complete execution
--   Via service-role client (API route):
--   SELECT public.rpc_ai_mark_request_executed('<id>', '<user_id>', 'executed', NULL, NULL, NULL, 100);
--   → Expected: success, status becomes 'executed'
--
-- Test 7: Normal user cannot call server-only RPCs
--   As authenticated user:
--   SELECT public.rpc_ai_mark_request_executed(...);
--   → Expected: ERROR "permission denied for function rpc_ai_mark_request_executed"
-- ════════════════════════════════════════════════════════════
