-- ============================================================
-- Smart Pocket — Centralize SEO Ownership
-- Migration: 20260623170000_centralize_seo_ownership.sql
-- Safe, additive, and idempotent.
-- ============================================================

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS home_seo_title TEXT,
  ADD COLUMN IF NOT EXISTS home_seo_description TEXT,
  ADD COLUMN IF NOT EXISTS home_seo_keywords TEXT,
  ADD COLUMN IF NOT EXISTS home_og_title TEXT,
  ADD COLUMN IF NOT EXISTS home_og_description TEXT,
  ADD COLUMN IF NOT EXISTS home_social_image_url TEXT,
  ADD COLUMN IF NOT EXISTS home_twitter_title TEXT,
  ADD COLUMN IF NOT EXISTS home_twitter_description TEXT,
  ADD COLUMN IF NOT EXISTS home_twitter_image TEXT,
  ADD COLUMN IF NOT EXISTS home_robots_index BOOLEAN,
  ADD COLUMN IF NOT EXISTS home_robots_follow BOOLEAN;

ALTER TABLE public.cms_pages
  ADD COLUMN IF NOT EXISTS seo_keywords TEXT,
  ADD COLUMN IF NOT EXISTS og_title TEXT,
  ADD COLUMN IF NOT EXISTS og_description TEXT,
  ADD COLUMN IF NOT EXISTS twitter_title TEXT,
  ADD COLUMN IF NOT EXISTS twitter_description TEXT,
  ADD COLUMN IF NOT EXISTS twitter_image_url TEXT,
  ADD COLUMN IF NOT EXISTS canonical_url_override TEXT,
  ADD COLUMN IF NOT EXISTS robots_index BOOLEAN,
  ADD COLUMN IF NOT EXISTS robots_follow BOOLEAN;
