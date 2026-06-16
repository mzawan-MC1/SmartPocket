-- ============================================================
-- Phase 3 Additive Correction — Enum Values + RPC Grants
-- Timestamp: 20260616040000
--
-- Do NOT edit or rerun:
--   20260616000000_phase3_ai_assistant.sql
--   20260616010000_phase3_security_hardening.sql
--   20260616020000_phase3_ai_integrity.sql
--   20260616030000_phase3_trigger_rpc_fix.sql
--
-- Fixes:
--   1. Add missing enum values 'executing' and 'partially_executed'
--      to public.ai_request_status using guarded DO blocks
--      (idempotent — safe to run multiple times).
--
--   2. Explicitly GRANT EXECUTE on all six server-only RPCs to
--      service_role.  The previous migration only REVOKEd from
--      PUBLIC/anon/authenticated but never explicitly granted to
--      service_role.  Although service_role is superuser-equivalent
--      in Supabase and can bypass most permission checks, an
--      explicit GRANT ensures the RPCs are callable even in
--      environments where the superuser bypass is restricted.
--
--   3. Confirm that PUBLIC, anon, and authenticated remain revoked
--      from all six server-only RPCs.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PART 1 — Add missing enum values to ai_request_status
--
-- Preferred final set:
--   pending, parsed, clarifying, confirmed,
--   executing, executed, partially_executed,
--   cancelled, failed
--
-- Already present (from 20260616000000):
--   pending, parsed, clarifying, confirmed,
--   executed, cancelled, failed
--
-- Missing:
--   executing, partially_executed
-- ════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Add 'executing' if not already present
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_enum e
    JOIN   pg_type t ON t.oid = e.enumtypid
    WHERE  t.typname = 'ai_request_status'
      AND  e.enumlabel = 'executing'
  ) THEN
    ALTER TYPE public.ai_request_status ADD VALUE 'executing' AFTER 'confirmed';
  END IF;
END $$;

DO $$
BEGIN
  -- Add 'partially_executed' if not already present
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_enum e
    JOIN   pg_type t ON t.oid = e.enumtypid
    WHERE  t.typname = 'ai_request_status'
      AND  e.enumlabel = 'partially_executed'
  ) THEN
    ALTER TYPE public.ai_request_status ADD VALUE 'partially_executed' AFTER 'executed';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- PART 2 — Explicitly GRANT EXECUTE on server-only RPCs
--           to service_role; keep revoked from others
--
-- Note: Each REVOKE is repeated here to be idempotent and
-- self-contained — safe even if the previous migration already
-- applied them.
-- ════════════════════════════════════════════════════════════

-- ─── rpc_ai_set_parsed_result ─────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.rpc_ai_set_parsed_result(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, NUMERIC, TEXT, TEXT, JSONB, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_set_parsed_result(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, NUMERIC, TEXT, TEXT, JSONB, INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_set_parsed_result(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, NUMERIC, TEXT, TEXT, JSONB, INTEGER
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ai_set_parsed_result(
  UUID, UUID, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, JSONB, NUMERIC, TEXT, TEXT, JSONB, INTEGER
) TO service_role;


-- ─── rpc_ai_mark_request_executing ───────────────────────────────────────────

REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executing(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executing(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executing(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ai_mark_request_executing(UUID, UUID) TO service_role;


-- ─── rpc_ai_mark_request_executed ────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executed(
  UUID, UUID, TEXT, JSONB, TEXT, TEXT, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executed(
  UUID, UUID, TEXT, JSONB, TEXT, TEXT, INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_executed(
  UUID, UUID, TEXT, JSONB, TEXT, TEXT, INTEGER
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ai_mark_request_executed(
  UUID, UUID, TEXT, JSONB, TEXT, TEXT, INTEGER
) TO service_role;


-- ─── rpc_ai_mark_request_failed ──────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_failed(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_failed(UUID, UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_request_failed(UUID, UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ai_mark_request_failed(UUID, UUID, TEXT, TEXT) TO service_role;


-- ─── rpc_ai_mark_pending_action_executed ─────────────────────────────────────

REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_executed(UUID, UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_executed(UUID, UUID, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_executed(UUID, UUID, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ai_mark_pending_action_executed(UUID, UUID, TIMESTAMPTZ) TO service_role;


-- ─── rpc_ai_mark_pending_action_failed ───────────────────────────────────────

REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_failed(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_failed(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.rpc_ai_mark_pending_action_failed(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_ai_mark_pending_action_failed(UUID, UUID, TEXT) TO service_role;


-- ════════════════════════════════════════════════════════════
-- PART 3 — Update rpc_ai_mark_request_executing to accept
--           'executing' now that the enum value exists.
--           Also update rpc_ai_mark_request_executed to accept
--           'partially_executed' now that the enum value exists.
--
-- The functions in 20260616030000 used TEXT parameters so they
-- already accept any string — the enum constraint is on the
-- table column.  The UPDATE statements will now succeed because
-- the enum values exist.  No function body change needed.
-- ════════════════════════════════════════════════════════════

-- Verify enum values are present (will raise if missing)
DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM   pg_enum e
  JOIN   pg_type t ON t.oid = e.enumtypid
  WHERE  t.typname = 'ai_request_status'
    AND  e.enumlabel IN ('executing', 'partially_executed');

  IF v_count < 2 THEN
    RAISE EXCEPTION
      'ai_request_status enum is missing required values. Expected 2, found %', v_count;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════
-- PART 4 — Test documentation
-- ════════════════════════════════════════════════════════════
--
-- Test A: confirmed → executing → executed
--   1. Create a request with status = 'confirmed'
--   2. Via service-role: SELECT rpc_ai_mark_request_executing('<id>', '<uid>');
--      → status becomes 'executing'
--   3. Via service-role: SELECT rpc_ai_mark_request_executed('<id>', '<uid>', 'executed', NULL, NULL, NULL, 100);
--      → status becomes 'executed'
--
-- Test B: confirmed → executing → partially_executed
--   Same as A but step 3 passes 'partially_executed'
--   → status becomes 'partially_executed'
--
-- Test C: confirmed → failed
--   Via service-role: SELECT rpc_ai_mark_request_failed('<id>', '<uid>', 'execution_error', 'msg');
--   → status becomes 'failed'
--
-- Test D: Normal authenticated user cannot call server-only RPCs
--   As authenticated user (anon key):
--   SELECT rpc_ai_mark_request_executing('<id>', '<uid>');
--   → ERROR: permission denied for function rpc_ai_mark_request_executing
--
-- Test E: service_role route can call every required RPC
--   Via API route (service-role client):
--   All six RPCs execute without permission errors.
-- ════════════════════════════════════════════════════════════
