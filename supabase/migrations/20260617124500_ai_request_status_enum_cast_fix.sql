-- ============================================================
-- AI request status enum cast fix
-- Safe additive migration: replace existing AI status RPC bodies
-- without recreating the enum or removing enum values.
-- ============================================================

-- Confirm the exact ai_request_status enum values expected by the
-- current Smart Entry parse/confirm/execute flow before replacing
-- the RPCs that write to public.ai_requests.status.
DO $$
DECLARE
  v_labels TEXT[];
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
  INTO v_labels
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'ai_request_status';

  IF v_labels IS NULL THEN
    RAISE EXCEPTION 'public.ai_request_status enum does not exist';
  END IF;

  IF NOT (
    'pending' = ANY(v_labels)
    AND 'parsed' = ANY(v_labels)
    AND 'clarifying' = ANY(v_labels)
    AND 'confirmed' = ANY(v_labels)
    AND 'executing' = ANY(v_labels)
    AND 'executed' = ANY(v_labels)
    AND 'partially_executed' = ANY(v_labels)
    AND 'cancelled' = ANY(v_labels)
    AND 'failed' = ANY(v_labels)
  ) THEN
    RAISE EXCEPTION 'public.ai_request_status is missing one or more required values: %', v_labels;
  END IF;
END $$;

-- Replace the parse-result RPC so status writes are enum-safe.
-- This function still accepts TEXT inputs for backward-compatible RPC calls,
-- but explicitly casts the status before assignment.
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
    status                  = p_status::public.ai_request_status,
    overall_intent          = CASE
      WHEN p_overall_intent IS NULL THEN NULL
      ELSE p_overall_intent::public.ai_overall_intent
    END,
    language_provider_used  = CASE
      WHEN p_language_provider IS NULL THEN NULL
      ELSE p_language_provider::public.ai_provider_name
    END,
    stt_provider_used       = CASE
      WHEN p_stt_provider IS NULL THEN NULL
      ELSE p_stt_provider::public.ai_provider_name
    END,
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

-- Replace the execution-finalisation RPC so executed/failed/partial writes
-- target the enum column safely.
CREATE OR REPLACE FUNCTION public.rpc_ai_mark_request_executed(
  p_request_id          UUID,
  p_user_id             UUID,
  p_status              TEXT,
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
  IF p_status NOT IN ('executed', 'partially_executed', 'failed') THEN
    RAISE EXCEPTION 'rpc_ai_mark_request_executed: invalid status ''%''', p_status;
  END IF;

  UPDATE public.ai_requests
  SET
    status              = p_status::public.ai_request_status,
    executed_record_ids = p_executed_record_ids,
    error_category      = p_error_category,
    error_message       = p_error_message,
    total_duration_ms   = p_total_duration_ms
  WHERE id      = p_request_id
    AND user_id = p_user_id;
END;
$$;

