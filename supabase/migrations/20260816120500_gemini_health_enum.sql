-- ============================================================
-- Gemini provider health schema extension
-- Additive, idempotent migration for Supabase AI health tables.
-- Run this manually in the Supabase SQL Editor before deploying
-- the application code that inserts 'gemini' / 'gemini_voice'
-- rows and reports 'disabled' provider status.
--
-- NOTE: placeholder rows for the new providers are intentionally
-- NOT inserted here. New enum values added inside a transaction
-- are not usable until that transaction commits; health endpoints
-- will create/upsert the required rows after both the migration
-- and the updated application code are deployed.
-- ============================================================

-- 1. Extend ai_provider_name enum with Gemini entries.
--    Existing preserved: openrouter, openrouter_voice, vps_ai,
--    cloud_stt, vps_stt, mock.
ALTER TYPE public.ai_provider_name
  ADD VALUE IF NOT EXISTS 'gemini';

ALTER TYPE public.ai_provider_name
  ADD VALUE IF NOT EXISTS 'gemini_voice';

-- 2. Extend ai_provider_health_status enum with 'disabled' so that
--    legacy OpenRouter (when OPENROUTER_ENABLED=false) and cloud-only
--    VPS AI can report 'disabled' without raising a check constraint
--    error. Existing preserved: healthy, degraded, offline,
--    not_configured.
ALTER TYPE public.ai_provider_health_status
  ADD VALUE IF NOT EXISTS 'disabled';
