-- ============================================================
-- Smart Pocket Phase 1 — Storage Bucket Setup Instructions
-- ============================================================
-- Run this SQL in Supabase SQL Editor AFTER creating the buckets
-- manually in Supabase Dashboard → Storage → New Bucket.
--
-- STEP 1: Create buckets in Supabase Dashboard → Storage:
--
--   Bucket name: receipts
--   Public:      NO  (private)
--   File size limit: 10 MB
--   Allowed MIME types: image/*, application/pdf
--
--   Bucket name: avatars
--   Public:      YES (public)
--   File size limit: 5 MB
--   Allowed MIME types: image/*
--
--   Bucket name: exports
--   Public:      NO  (private)
--   File size limit: 50 MB
--   Allowed MIME types: text/csv, application/pdf, application/json
--
-- STEP 2: Run the RLS policies below.
-- ============================================================

-- ── receipts bucket (private) ────────────────────────────────
-- Users can only access their own files under /{user_id}/...

DROP POLICY IF EXISTS "receipts: owner select" ON storage.objects;
CREATE POLICY "receipts: owner select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "receipts: owner insert" ON storage.objects;
CREATE POLICY "receipts: owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "receipts: owner delete" ON storage.objects;
CREATE POLICY "receipts: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── avatars bucket (public read, authenticated write own) ────
DROP POLICY IF EXISTS "avatars: public read" ON storage.objects;
CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars: owner insert" ON storage.objects;
CREATE POLICY "avatars: owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars: owner update" ON storage.objects;
CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "avatars: owner delete" ON storage.objects;
CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── exports bucket (private) ─────────────────────────────────
DROP POLICY IF EXISTS "exports: owner select" ON storage.objects;
CREATE POLICY "exports: owner select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'exports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "exports: owner insert" ON storage.objects;
CREATE POLICY "exports: owner insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'exports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "exports: owner delete" ON storage.objects;
CREATE POLICY "exports: owner delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'exports'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
