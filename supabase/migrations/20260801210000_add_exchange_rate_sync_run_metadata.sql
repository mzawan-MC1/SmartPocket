-- ============================================================
-- Smart Pocket — Exchange Rate Sync Run Metadata
-- Migration: 20260801210000_add_exchange_rate_sync_run_metadata.sql
-- ============================================================
-- Safe additive migration only.
-- - Adds sync_type and rate_date to exchange_rate_sync_runs
-- - Preserves legacy rows as NULL so they remain distinguishable
-- ============================================================

ALTER TABLE public.exchange_rate_sync_runs
  ADD COLUMN IF NOT EXISTS sync_type TEXT,
  ADD COLUMN IF NOT EXISTS rate_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exchange_rate_sync_runs_sync_type_check'
      AND conrelid = 'public.exchange_rate_sync_runs'::regclass
  ) THEN
    ALTER TABLE public.exchange_rate_sync_runs
      ADD CONSTRAINT exchange_rate_sync_runs_sync_type_check
      CHECK (sync_type IS NULL OR sync_type IN ('latest', 'historical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_exchange_rate_sync_runs_sync_type_started
  ON public.exchange_rate_sync_runs (sync_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_sync_runs_rate_date_started
  ON public.exchange_rate_sync_runs (rate_date DESC, started_at DESC);
