-- ============================================================
-- Smart Pocket — Persist platform contact phone country code
-- Migration: 20260619143000_platform_contact_phone_country_code.sql
-- Adds a dedicated country-code field for CMS/public contact phone
-- persistence and backfills the known legacy UAE local-number case.
-- ============================================================

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS contact_phone_country_code TEXT DEFAULT '';

UPDATE public.platform_settings
SET contact_phone_country_code = 'AE'
WHERE COALESCE(contact_phone_country_code, '') = ''
  AND regexp_replace(COALESCE(contact_phone, ''), '\D', '', 'g') IN ('508322799', '971508322799');

UPDATE public.platform_settings
SET contact_phone = '+971508322799'
WHERE regexp_replace(COALESCE(contact_phone, ''), '\D', '', 'g') = '508322799';
