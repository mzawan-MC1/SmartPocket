-- ============================================================
-- Smart Pocket — Fix truncated UAE platform contact phone value
-- Migration: 20260619160000_fix_platform_contact_phone_uae_truncated_calling_code.sql
-- Corrects the known bad UAE contact phone produced by a stale
-- client-side calling-code snapshot that used `+9` instead of `+971`.
-- ============================================================

UPDATE public.platform_settings
SET
  contact_phone = '+971508322799',
  contact_phone_country_code = 'AE'
WHERE COALESCE(contact_phone_country_code, '') = 'AE'
  AND regexp_replace(COALESCE(contact_phone, ''), '\D', '', 'g') = '9508322799';
