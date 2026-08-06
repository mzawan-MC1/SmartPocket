-- ============================================================
-- Personal Subscriptions: provider_key column + targeted alias backfill
-- Migration: 20260806103000_personal_subscription_provider_key.sql
-- ============================================================
-- Forward-only / idempotent. Can safely be applied more than once.
--
-- Authoritative provider catalog lives in TypeScript:
--   src/lib/personal-subscription-providers.ts
-- This migration does NOT duplicate the catalog in SQL. It only:
--   1. Adds the `provider_key` column if missing.
--   2. Runs an explicit, production-only alias backfill for the 4
--      confirmed legacy patterns documented in the backfill spec.
--      All other records remain provider_key = NULL (custom).
--   3. Creates a partial index on provider_key WHERE NOT NULL.
--   4. Removes any permanent public helper functions that the
--      previous (replaced) version of this migration may have
--      leaked into the public schema. Matching helpers are
--      implemented below on pg_temp (session-scoped) so they
--      never persist after the migration connection closes.
-- ============================================================

-- unaccent is required only for the exact normalized-value comparison
-- in the alias backfill below. Supabase's CREATE EXTENSION default
-- (no explicit schema) installs it into public, consistent with the
-- rest of this project's extension usage.
CREATE EXTENSION IF NOT EXISTS unaccent;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'personal_subscriptions'
      AND column_name = 'provider_key'
  ) THEN
    ALTER TABLE public.personal_subscriptions
      ADD COLUMN provider_key TEXT;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- Session-scoped helpers (pg_temp schema). PostgreSQL automatically
-- drops everything in pg_temp when the migration connection closes,
-- so nothing below survives to runtime. search_path is pinned so the
-- function can always resolve public.unaccent regardless of the
-- caller's default search_path.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp._normalize_personal_subscription_match(value TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized TEXT;
BEGIN
  IF value IS NULL THEN
    RETURN NULL;
  END IF;

  normalized := btrim(lower(unaccent(value)));
  normalized := regexp_replace(normalized, '[^a-z0-9]+', ' ', 'g');
  normalized := btrim(normalized);

  IF normalized = '' THEN
    RETURN NULL;
  END IF;

  RETURN normalized;
END;
$$;

-- ----------------------------------------------------------------
-- Targeted alias backfill. ONLY the exact confirmed normalized
-- values enumerated below will update rows. No LIKE/substring
-- matching. No broad family-name heuristics.
--
-- ChatGPT:      ChatGPT, OpenAI, Open AI             (name OR provider)
-- Amazon Prime: Amazon Prime                         (name OR provider)
-- Netflix:      Netflix (name) OR Netflix / Netflix, Inc. (provider only)
-- Trae:         Trae, trae.ai, Trae AI, Trae - Pro Plan, Trae – Pro Plan
--                  (name OR provider — whichever matches)
--
-- Everything else stays provider_key IS NULL and continues to use
-- the generic fallback icon + the user's existing name.
--
-- In-place UPDATE. No INSERTs. No row re-creates. No ON CONFLICT.
-- IDs / user_id / ownership / amounts / currencies / start_date /
-- next_billing_at / notes / recurring_transaction_id all preserved.
-- ----------------------------------------------------------------

DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  WITH candidates AS (
    SELECT
      ps.id,
      pg_temp._normalize_personal_subscription_match(ps.name)     AS n_name,
      pg_temp._normalize_personal_subscription_match(ps.provider) AS n_provider
    FROM public.personal_subscriptions ps
    WHERE ps.provider_key IS NULL
  ),
  matched AS (
    SELECT
      c.id,
      CASE
        -- 1. ChatGPT — exact confirmed normalized values only
        --    All 3 aliases are checked against BOTH name AND provider fields.
        WHEN c.n_name     IN (pg_temp._normalize_personal_subscription_match('ChatGPT'),
                              pg_temp._normalize_personal_subscription_match('OpenAI'),
                              pg_temp._normalize_personal_subscription_match('Open AI'))
          OR c.n_provider IN (pg_temp._normalize_personal_subscription_match('ChatGPT'),
                               pg_temp._normalize_personal_subscription_match('OpenAI'),
                               pg_temp._normalize_personal_subscription_match('Open AI'))
        THEN 'chatgpt'

        -- 2. Amazon Prime — exact confirmed normalized values only
        WHEN c.n_name     = pg_temp._normalize_personal_subscription_match('Amazon Prime')
          OR c.n_provider = pg_temp._normalize_personal_subscription_match('Amazon Prime')
        THEN 'amazon_prime'

        -- 3. Netflix — name = "Netflix" only; provider may be "Netflix" or "Netflix, Inc."
        WHEN c.n_name     = pg_temp._normalize_personal_subscription_match('Netflix')
          OR c.n_provider = pg_temp._normalize_personal_subscription_match('Netflix')
          OR c.n_provider = pg_temp._normalize_personal_subscription_match('Netflix, Inc.')
        THEN 'netflix'

        -- 4. Trae — exact confirmed normalized values only
        --    All 5 aliases are checked against BOTH name AND provider fields.
        WHEN c.n_name     IN (pg_temp._normalize_personal_subscription_match('Trae'),
                              pg_temp._normalize_personal_subscription_match('trae.ai'),
                              pg_temp._normalize_personal_subscription_match('Trae AI'),
                              pg_temp._normalize_personal_subscription_match('Trae - Pro Plan'),
                              pg_temp._normalize_personal_subscription_match('Trae – Pro Plan'))
          OR c.n_provider IN (pg_temp._normalize_personal_subscription_match('Trae'),
                               pg_temp._normalize_personal_subscription_match('trae.ai'),
                               pg_temp._normalize_personal_subscription_match('Trae AI'),
                               pg_temp._normalize_personal_subscription_match('Trae - Pro Plan'),
                               pg_temp._normalize_personal_subscription_match('Trae – Pro Plan'))
        THEN 'trae'

        ELSE NULL
      END AS matched_key
    FROM candidates c
  )
  UPDATE public.personal_subscriptions ps
  SET provider_key = matched.matched_key
  FROM matched
  WHERE ps.id = matched.id
    AND matched.matched_key IS NOT NULL;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled provider_key on % personal_subscriptions rows (4 alias patterns only).', updated_count;
END $$;

CREATE INDEX IF NOT EXISTS idx_personal_subscriptions_provider_key
  ON public.personal_subscriptions(provider_key)
  WHERE provider_key IS NOT NULL;

-- ----------------------------------------------------------------
-- Cleanup any permanent public helpers that the previous version
-- of this migration might have left behind in production. These
-- functions are migration-only; runtime code uses the TypeScript
-- normalizer in src/lib/personal-subscription-providers.ts instead.
--
-- (The current rewrite uses pg_temp.* functions which are scoped to
-- this connection and auto-drop; these DROP statements only sanitize
-- leftover public.* objects from any pre-slimming deployment of this
-- migration file.)
-- ----------------------------------------------------------------

DROP FUNCTION IF EXISTS public._normalize_personal_subscription_match(TEXT);
DROP FUNCTION IF EXISTS public._personal_subscription_match_candidate(TEXT, TEXT);
