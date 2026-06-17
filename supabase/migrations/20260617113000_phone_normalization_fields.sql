-- Additive phone normalization fields for managed people.
-- Safe to review and run manually after application changes are deployed.

ALTER TABLE IF EXISTS public.managed_people
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS phone_country_code TEXT,
  ADD COLUMN IF NOT EXISTS phone_display TEXT;
