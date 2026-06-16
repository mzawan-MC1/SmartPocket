-- Migration: Add public-facing columns to platform_settings
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING guards)

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS hero_title         text DEFAULT '',
  ADD COLUMN IF NOT EXISTS hero_subtitle      text DEFAULT '',
  ADD COLUMN IF NOT EXISTS hero_cta_primary   text DEFAULT '',
  ADD COLUMN IF NOT EXISTS hero_cta_secondary text DEFAULT '',
  ADD COLUMN IF NOT EXISTS sticky_header      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_tagline     text DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_twitter     text DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_github      text DEFAULT '',
  ADD COLUMN IF NOT EXISTS social_linkedin    text DEFAULT '';
