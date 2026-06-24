-- ============================================================
-- Harden AI finalisation for voice metering
-- - serializes finalisation using a ledger row lock
-- - makes repeated finalisation idempotent
-- - increments voice seconds only for voice requests
-- - prevents partial cycle updates when required rows are missing
-- ============================================================

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
v_ledger_type public.credit_ledger_type;
v_cycle_exists BOOLEAN;
BEGIN
/*

* Lock the ledger row so concurrent finalisation attempts cannot
* both observe it as a reservation and increment usage twice.
  */
  SELECT
  COALESCE(request_type, 'text'),
  COALESCE(credit_cost, ABS(credits_delta), p_credit_cost),
  ledger_type
  INTO
  v_request_type,
  v_credit_cost,
  v_ledger_type
  FROM public.ai_credit_ledger
  WHERE id = p_ledger_id
  AND user_id = p_user_id
  FOR UPDATE;

IF NOT FOUND THEN
RETURN FALSE;
END IF;

/*

* A previously completed finalisation is treated as a successful,
* idempotent retry.
  */
  IF v_ledger_type = 'charge' THEN
  RETURN TRUE;
  END IF;

IF v_ledger_type <> 'reservation' THEN
RETURN FALSE;
END IF;

/*

* Validate the usage cycle before changing either usage or ledger
* state, preventing a partial finalisation.
  */
  SELECT EXISTS (
  SELECT 1
  FROM public.ai_usage_cycles
  WHERE id = p_cycle_id
  AND user_id = p_user_id
  )
  INTO v_cycle_exists;

IF NOT v_cycle_exists THEN
RETURN FALSE;
END IF;

IF v_request_type = 'receipt_extraction' THEN
UPDATE public.ai_usage_cycles
SET
receipt_extractions_reserved =
GREATEST(0, receipt_extractions_reserved - 1),
receipt_extractions_consumed =
receipt_extractions_consumed + 1,
updated_at = now()
WHERE id = p_cycle_id
AND user_id = p_user_id;
ELSE
UPDATE public.ai_usage_cycles
SET
credits_reserved =
GREATEST(0, credits_reserved - v_credit_cost),
credits_consumed =
credits_consumed + v_credit_cost,
voice_seconds_used = CASE
WHEN v_request_type = 'voice'
AND p_speech_duration_ms IS NOT NULL
AND p_speech_duration_ms > 0
THEN
voice_seconds_used
+ CEIL(p_speech_duration_ms::NUMERIC / 1000)::INTEGER
ELSE voice_seconds_used
END,
updated_at = now()
WHERE id = p_cycle_id
AND user_id = p_user_id;
END IF;

SELECT
credits_allocated - credits_consumed - credits_reserved
INTO v_balance
FROM public.ai_usage_cycles
WHERE id = p_cycle_id
AND user_id = p_user_id;

UPDATE public.ai_credit_ledger
SET
ledger_type = 'charge',
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
AND user_id = p_user_id
AND ledger_type = 'reservation';

IF NOT FOUND THEN
/*
* This should not normally occur because the row is locked.
* Raising an exception ensures the earlier usage-cycle update
* is rolled back instead of leaving partial metering.
*/
RAISE EXCEPTION
'AI credit finalisation failed for ledger %',
p_ledger_id;
END IF;

RETURN TRUE;
END;
$$;
