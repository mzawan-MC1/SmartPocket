-- ============================================================
-- Smart Pocket — CMS Pages Blog Support
-- Migration: 20260707224500_cms_pages_blog_support.sql
-- Extends cms_pages so pages and blog posts share one CMS source.
-- ============================================================

BEGIN;

ALTER TABLE public.cms_pages
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'page',
  ADD COLUMN IF NOT EXISTS excerpt TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_alt TEXT,
  ADD COLUMN IF NOT EXISTS author_name TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reading_time_minutes INTEGER;

UPDATE public.cms_pages
SET content_type = 'page'
WHERE content_type IS NULL OR content_type = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cms_pages_content_type_check'
      AND conrelid = 'public.cms_pages'::regclass
  ) THEN
    ALTER TABLE public.cms_pages
      ADD CONSTRAINT cms_pages_content_type_check
      CHECK (content_type IN ('page', 'blog'));
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cms_pages_reading_time_minutes_check'
      AND conrelid = 'public.cms_pages'::regclass
  ) THEN
    ALTER TABLE public.cms_pages
      ADD CONSTRAINT cms_pages_reading_time_minutes_check
      CHECK (reading_time_minutes IS NULL OR reading_time_minutes > 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_cms_pages_public_blog_posts
  ON public.cms_pages (content_type, status, is_enabled, published_at DESC, updated_at DESC)
  WHERE content_type = 'blog';

CREATE INDEX IF NOT EXISTS idx_cms_pages_featured_blog_posts
  ON public.cms_pages (published_at DESC, updated_at DESC)
  WHERE content_type = 'blog'
    AND status = 'published'
    AND is_enabled = true
    AND is_featured = true;

COMMIT;
