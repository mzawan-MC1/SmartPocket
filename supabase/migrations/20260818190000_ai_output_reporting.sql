-- ============================================================
-- Additive Microsoft Store Certification: AI Output Reporting
-- ============================================================
-- Policy 11.16 — users must be able to report inappropriate AI
-- output.  We reuse the existing authenticated support tickets
-- system and only add:
--   1. a new ticket category 'ai_output_report' to the existing
--      CHECK constraint on public.support_tickets.category
--      (the column is plain TEXT with an IN-list CHECK, NOT a
--      Postgres enum — see migration 20260625183000 L228/L244)
--   2. a JSONB column `ai_output_report_context` on support_tickets
--      that holds the safe, non-duplicative metadata (feature,
--      reference IDs, reason, provider/model).  NO sensitive
--      content is copied; we reference existing AI history or
--      document extraction records.
--
-- Existing RLS policies on `support_tickets` continue to apply:
--   - authenticated user can only READ their own tickets
--   - admin user can READ/WRITE all tickets
--   - service_role has full access
-- ============================================================

-- 1. Extend the category CHECK constraint (plain TEXT + IN-list,
--    NOT a Postgres enum — so we must DROP + re-create the CHECK
--    with the original 11 values plus the new one).
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category IN (
    'account',
    'transactions',
    'financial_accounts',
    'subscriptions',
    'payments',
    'reports',
    'smart_entry_ai',
    'technical_error',
    'feature_request',
    'security',
    'other',
    'ai_output_report'
  ));

-- 2. Safe JSONB metadata column for the AI output report payload
--    (non-duplicative — stores only reference IDs, provider/model
--    headers, reason enum, user note — never raw AI output or
--    receipt/PDF blobs).
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ai_output_report_context JSONB;

COMMENT ON COLUMN public.support_tickets.ai_output_report_context IS
  'Safe reference metadata for AI output reports (Microsoft Store Policy 11.16). '
  'Expected keys: feature (text_ai|voice_ai|receipt_document_ai|ai_assistant), '
  'referenceId (ai_history_id or extraction referenceId or draft id), '
  'reason (inappropriate|inaccurate|offensive|unsafe|other), '
  'userNote (optional string), '
  'provider (string|null), primaryModel (string|null), finalModel (string|null), '
  'fallbackUsed (boolean|null). Never stores raw receipt/PDF or raw AI text output.';
