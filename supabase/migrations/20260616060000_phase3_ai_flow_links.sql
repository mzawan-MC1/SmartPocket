-- ============================================================
-- Phase 3: AI flow linkage for Smart Entry execution records
-- Safe, additive migration — no DROP TABLE, no destructive ops
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS ai_request_id UUID,
  ADD COLUMN IF NOT EXISTS ai_action_index INTEGER;

ALTER TABLE public.managed_people
  ADD COLUMN IF NOT EXISTS source_ai_request_id UUID;

CREATE INDEX IF NOT EXISTS idx_transactions_ai_request_id
  ON public.transactions(ai_request_id);

CREATE INDEX IF NOT EXISTS idx_transactions_ai_request_action
  ON public.transactions(ai_request_id, ai_action_index);

CREATE INDEX IF NOT EXISTS idx_managed_people_source_ai_request_id
  ON public.managed_people(source_ai_request_id);
