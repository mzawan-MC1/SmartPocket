-- ============================================================
-- Smart Pocket — Exchange Rate System
-- Migration: 20260618103000_exchange_rate_system.sql
-- ============================================================
-- Safe additive migration only.
-- - Adds exchange-rate snapshot + sync history tables
-- - Adds server-only snapshot persistence function
-- - Adds additive transfer FX metadata fields
-- - Preserves all historical finance amounts/currencies
-- ============================================================

CREATE TABLE IF NOT EXISTS public.exchange_rate_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  base_currency TEXT NOT NULL,
  rate_date DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  provider_timestamp TIMESTAMPTZ,
  rates JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_latest BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'success',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.exchange_rate_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  rate_count INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exchange_rate_snapshots_provider_base_rate_date_key'
      AND conrelid = 'public.exchange_rate_snapshots'::regclass
  ) THEN
    ALTER TABLE public.exchange_rate_snapshots
      ADD CONSTRAINT exchange_rate_snapshots_provider_base_rate_date_key
      UNIQUE (provider, base_currency, rate_date);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'exchange_rate_snapshots_success_only_check'
      AND conrelid = 'public.exchange_rate_snapshots'::regclass
  ) THEN
    ALTER TABLE public.exchange_rate_snapshots
      ADD CONSTRAINT exchange_rate_snapshots_success_only_check
      CHECK (status = 'success');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exchange_rate_snapshots_latest_unique
  ON public.exchange_rate_snapshots (provider, base_currency)
  WHERE is_latest = true;

CREATE INDEX IF NOT EXISTS idx_exchange_rate_snapshots_lookup
  ON public.exchange_rate_snapshots (provider, base_currency, rate_date DESC, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_snapshots_latest
  ON public.exchange_rate_snapshots (is_latest, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_exchange_rate_sync_runs_provider_started
  ON public.exchange_rate_sync_runs (provider, started_at DESC);

ALTER TABLE public.exchange_rate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rate_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_successful_exchange_rate_snapshots" ON public.exchange_rate_snapshots;
CREATE POLICY "authenticated_read_successful_exchange_rate_snapshots"
ON public.exchange_rate_snapshots
FOR SELECT
TO authenticated
USING (status = 'success');

GRANT SELECT ON TABLE public.exchange_rate_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.exchange_rate_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.exchange_rate_sync_runs TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.exchange_rate_snapshots FROM anon, authenticated;
REVOKE ALL ON TABLE public.exchange_rate_sync_runs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.exchange_rate_store_snapshot(
  p_provider TEXT,
  p_base_currency TEXT,
  p_rate_date DATE,
  p_fetched_at TIMESTAMPTZ,
  p_provider_timestamp TIMESTAMPTZ,
  p_rates JSONB,
  p_status TEXT DEFAULT 'success'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
  v_provider TEXT;
  v_base_currency TEXT;
  v_status TEXT;
  v_rates JSONB;
BEGIN
  v_provider := lower(btrim(COALESCE(p_provider, '')));
  v_base_currency := upper(btrim(COALESCE(p_base_currency, '')));
  v_status := lower(COALESCE(NULLIF(btrim(p_status), ''), 'success'));
  v_rates := COALESCE(p_rates, '{}'::jsonb);

  IF v_provider = '' THEN
    RAISE EXCEPTION 'Exchange-rate provider is required';
  END IF;

  IF v_base_currency = '' THEN
    RAISE EXCEPTION 'Exchange-rate base currency is required';
  END IF;

  IF p_rate_date IS NULL THEN
    RAISE EXCEPTION 'Exchange-rate rate_date is required';
  END IF;

  IF p_fetched_at IS NULL THEN
    RAISE EXCEPTION 'Exchange-rate fetched_at is required';
  END IF;

  IF v_status <> 'success' THEN
    RAISE EXCEPTION 'Exchange-rate snapshots only accept successful validated snapshots';
  END IF;

  IF jsonb_typeof(v_rates) <> 'object' THEN
    RAISE EXCEPTION 'Exchange-rate rates payload must be a JSON object';
  END IF;

  IF v_rates = '{}'::jsonb THEN
    RAISE EXCEPTION 'Exchange-rate rates payload must not be empty';
  END IF;

  INSERT INTO public.exchange_rate_snapshots (
    provider,
    base_currency,
    rate_date,
    fetched_at,
    provider_timestamp,
    rates,
    is_latest,
    status
  )
  VALUES (
    v_provider,
    v_base_currency,
    p_rate_date,
    p_fetched_at,
    p_provider_timestamp,
    v_rates,
    false,
    'success'
  )
  ON CONFLICT (provider, base_currency, rate_date)
  DO UPDATE SET
    fetched_at = EXCLUDED.fetched_at,
    provider_timestamp = EXCLUDED.provider_timestamp,
    rates = EXCLUDED.rates,
    status = 'success',
    is_latest = false
  RETURNING id INTO v_snapshot_id;

  UPDATE public.exchange_rate_snapshots
  SET is_latest = false
  WHERE provider = v_provider
    AND base_currency = v_base_currency
    AND id <> v_snapshot_id
    AND is_latest = true;

  UPDATE public.exchange_rate_snapshots
  SET is_latest = true
  WHERE id = v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_rate_store_snapshot(TEXT, TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exchange_rate_store_snapshot(TEXT, TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.exchange_rate_store_snapshot(TEXT, TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exchange_rate_store_snapshot(TEXT, TEXT, DATE, TIMESTAMPTZ, TIMESTAMPTZ, JSONB, TEXT) TO service_role;

ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS source_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS source_currency TEXT,
  ADD COLUMN IF NOT EXISTS destination_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS destination_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(20,10),
  ADD COLUMN IF NOT EXISTS exchange_rate_provider TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate_snapshot_id UUID REFERENCES public.exchange_rate_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS exchange_rate_date DATE,
  ADD COLUMN IF NOT EXISTS exchange_rate_timestamp TIMESTAMPTZ;

UPDATE public.transfers
SET
  source_amount = COALESCE(source_amount, amount),
  source_currency = COALESCE(source_currency, currency),
  destination_amount = COALESCE(destination_amount, amount),
  destination_currency = COALESCE(destination_currency, currency)
WHERE
  source_amount IS NULL
  OR source_currency IS NULL
  OR destination_amount IS NULL
  OR destination_currency IS NULL;

CREATE INDEX IF NOT EXISTS idx_transfers_source_currency ON public.transfers (source_currency);
CREATE INDEX IF NOT EXISTS idx_transfers_destination_currency ON public.transfers (destination_currency);
CREATE INDEX IF NOT EXISTS idx_transfers_exchange_rate_snapshot_id ON public.transfers (exchange_rate_snapshot_id);
