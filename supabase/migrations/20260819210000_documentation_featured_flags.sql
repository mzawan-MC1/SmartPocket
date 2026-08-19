-- ============================================================
-- Smart Pocket - Learning / Documentation featured flags
-- Additive migration ONLY. Safe to rerun (idempotent).
-- ============================================================
-- Steps for Zubair:
--   1. Open Supabase Dashboard SQL Editor
--   2. Paste and run this entire file
--   3. Confirm 0 rows affected is OK for ADD COLUMN IF NOT EXISTS
--
-- Purpose:
--   - featured_in_footer  : show link in public site footer "Learn" section
--   - featured_in_header  : show link in public header Documentation dropdown
--   - featured_order      : sort order within featured lists (lower first)
--   - documentation-images storage bucket: admin-uploaded screenshots
-- ============================================================

-- 1. Add featured columns to source-of-truth table
ALTER TABLE IF EXISTS public.documentation_articles
  ADD COLUMN IF NOT EXISTS featured_in_footer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_in_header boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS featured_order integer NOT NULL DEFAULT 0;

-- 2. Covering indexes for public featured queries
CREATE INDEX IF NOT EXISTS documentation_articles_featured_footer_idx
  ON public.documentation_articles (featured_order ASC, display_order ASC, created_at DESC)
  WHERE enabled = true AND status = 'published' AND featured_in_footer = true;

CREATE INDEX IF NOT EXISTS documentation_articles_featured_header_idx
  ON public.documentation_articles (featured_order ASC, display_order ASC, created_at DESC)
  WHERE enabled = true AND status = 'published' AND featured_in_header = true;

-- 3. Ensure documentation-images storage bucket (public read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentation-images',
  'documentation-images',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage RLS — public read, admin write
-- NOTE: Admin check uses JWT app_metadata ONLY (project hardened convention,
--       see phase3_security_hardening.sql: never query auth.users from RLS).
DROP POLICY IF EXISTS "documentation-images: public read" ON storage.objects;
CREATE POLICY "documentation-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'documentation-images');

DROP POLICY IF EXISTS "documentation-images: admins write" ON storage.objects;
CREATE POLICY "documentation-images: admins write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documentation-images'
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
