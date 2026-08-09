-- ============================================================
-- Smart Pocket — Blog + FAQ Automatic Translation Storage
-- Migration: 20260809040000_blog_faq_auto_translations.sql
-- Extends existing Blog/FAQ tables in-place. Single English
-- source of truth on cms_pages / faq_categories / faq_items.
-- Translations are pre-computed during admin save / regenerate
-- / backfill requests, never during public rendering.
-- Rerun safety (accurate):
--   • Safe for a normal first application on an empty database.
--   • Safe to rerun after this migration has been successfully
--     applied (idempotent for columns/defaulted values/constraints
--     / indexes / triggers / policies / grants because every
--     object is created IF NOT EXISTS or dropped + recreated).
--   • Can repair compatible missing optional/defaulted columns
--     that were left absent by a partially completed run where
--     the transaction rolled back before commit.
--   • Does NOT promise reconstruction of arbitrary partially-
--     created tables with unknown or missing required NOT NULL
--     relationship columns (e.g. page_id/language_code with no
--     known FK values). In that unlikely situation, drop the
--     invalid partial table manually and re-apply.
-- Safe for production data; existing FAQ translations are preserved
-- and explicitly initialized to status='outdated' so they are not
-- falsely considered current while source_version_hash is empty.
-- ============================================================

BEGIN;

-- ── 1. Existing FAQ translations: add hash + status + error columns ───
-- Existing rows that predate this migration were not generated from
-- a tracked English hash. We MUST NOT mark them "current" with an
-- empty hash because the freshness comparison
--   stored_hash == parent_en_hash
-- would consider empty == empty as "in sync" for every untouched
-- legacy translation even after the English source changes.
-- Instead we initialize legacy translations as 'outdated' with an
-- empty hash. They will be treated as Missing/Outdated in the admin
-- status UI and safely skipped by the Backfill regenerateAll:false
-- behaviour? NO — backfill regenerateAll:false runs only when
-- status ∈ {failed,missing,pending} OR stored_hash != en_hash.
-- Empty hash == empty en_hash matches; so to force legacy rows to be
-- re-generated once we set status='outdated' AND source_hash='' AND
-- parent_en_source_version_hash='' on parents.  The Admin regenerate
-- button (regenerateAll:true) OR an initial manual English edit on
-- each FAQ (which bumps parent hash and triggers outdated re-run) OR
-- the Backfill with regenerateAll:true will bring them current.
-- Meanwhile the public resolver falls back to EN when translation is
-- outdated/blank, so existing content remains visible and correct.

ALTER TABLE IF EXISTS public.faq_category_translations
  ADD COLUMN IF NOT EXISTS source_version_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS translation_status TEXT NOT NULL DEFAULT 'outdated',
  ADD COLUMN IF NOT EXISTS last_error_message TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS public.faq_item_translations
  ADD COLUMN IF NOT EXISTS source_version_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS translation_status TEXT NOT NULL DEFAULT 'outdated',
  ADD COLUMN IF NOT EXISTS last_error_message TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS public.faq_categories
  ADD COLUMN IF NOT EXISTS en_source_version_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.faq_items
  ADD COLUMN IF NOT EXISTS en_source_version_hash TEXT NOT NULL DEFAULT '';

-- ── 1b. Legacy FAQ translation row normalization ──────────────────────
-- Existing FAQ translation rows that predate this migration were
-- created without a tracked English source hash. The ADD COLUMN
-- defaults above already initialized them as:
--   translation_status = 'outdated'
--   source_version_hash = ''
-- Parents (faq_categories / faq_items) also have en_source_version_hash
-- defaulted to ''.  We MUST NOT promote these legacy rows to 'current'
-- with empty hashes because empty==empty would falsely register as
-- "in sync" after the English source is edited.
--
-- Strategy: leave legacy rows untouched as status='outdated' / hash=''.
--   • Public resolver: outdated status → falls back to English.
--   • Backfill regenerateAll:true: picks up all non-current rows.
--   • Future English edit: bumps parent.en_source_version_hash to a
--     non-empty value, which != '' legacy hash, so regenerateAll:false
--     also treats this pair as stale and regenerates.
--   • Existing translated content (name/description/question/
--     answer_html) is PRESERVED in the row — it is simply not served
--     publicly until a regeneration pass re-confirms it against the
--     current English source and stamps it status='current' with a
--     matching, non-empty hash.
--
-- The UPDATE below is a no-op for data already set by the column
-- defaults, but makes the policy explicit and guarantees correctness
-- even if a prior partial migration left rows in some other state.
DO $$
DECLARE
  r RECORD;
BEGIN
  -- faq_category_translations: legacy rows
  FOR r IN
    SELECT t.ctid
      FROM public.faq_category_translations t
      JOIN public.faq_categories c ON c.id = t.category_id
     WHERE t.translation_status = 'outdated'
       AND char_length(COALESCE(t.source_version_hash, '')) = 0
       AND char_length(COALESCE(c.en_source_version_hash, '')) = 0
  LOOP
    UPDATE public.faq_category_translations
       SET translation_status = 'outdated',
           source_version_hash = ''
     WHERE ctid = r.ctid;
  END LOOP;

  -- faq_item_translations: legacy rows
  FOR r IN
    SELECT t.ctid
      FROM public.faq_item_translations t
      JOIN public.faq_items i ON i.id = t.item_id
     WHERE t.translation_status = 'outdated'
       AND char_length(COALESCE(t.source_version_hash, '')) = 0
       AND char_length(COALESCE(i.en_source_version_hash, '')) = 0
  LOOP
    UPDATE public.faq_item_translations
       SET translation_status = 'outdated',
           source_version_hash = ''
     WHERE ctid = r.ctid;
  END LOOP;
END $$;

-- Freshness / status CHECK constraints on FAQ translation tables.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'faq_category_translations_status_check'
       AND conrelid = 'public.faq_category_translations'::regclass
  ) THEN
    ALTER TABLE public.faq_category_translations
      ADD CONSTRAINT faq_category_translations_status_check
      CHECK (translation_status IN ('current','outdated','failed','pending','missing'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'faq_item_translations_status_check'
       AND conrelid = 'public.faq_item_translations'::regclass
  ) THEN
    ALTER TABLE public.faq_item_translations
      ADD CONSTRAINT faq_item_translations_status_check
      CHECK (translation_status IN ('current','outdated','failed','pending','missing'));
  END IF;
END $$;

-- Update legacy FAQ translation defaults for NEW rows inserted after
-- this migration (fresh EN inserts should seed EN rows as current).
ALTER TABLE IF EXISTS public.faq_category_translations
  ALTER COLUMN translation_status SET DEFAULT 'current';
ALTER TABLE IF EXISTS public.faq_item_translations
  ALTER COLUMN translation_status SET DEFAULT 'current';

-- Status-only indexes on FAQ translations (unique composites already
-- cover page_id+language_code primary lookups; we need only the
-- pending/failed partial for work-lists and backfill scans).
CREATE INDEX IF NOT EXISTS idx_faq_category_translations_work
  ON public.faq_category_translations (category_id, translation_status)
  WHERE translation_status IN ('pending','failed','outdated','missing');

CREATE INDEX IF NOT EXISTS idx_faq_item_translations_work
  ON public.faq_item_translations (item_id, translation_status)
  WHERE translation_status IN ('pending','failed','outdated','missing');

-- ── 2. CMS / Blog source-of-truth hash column ────────────────────────

ALTER TABLE IF EXISTS public.cms_pages
  ADD COLUMN IF NOT EXISTS en_source_version_hash TEXT NOT NULL DEFAULT '';

-- ── 3. CMS / Blog translation table (per (page, language_code)) ──────
-- English row is NOT stored here; English source lives on cms_pages
-- directly. Translation rows only exist for the enabled non-English
-- locales, which is consistent with the existing FAQ child tables.
-- seo_keywords is TEXT (comma-separated CSV, matching the parent
-- cms_pages.seo_keywords TEXT column) — NOT a Postgres array, to keep
-- the storage shape identical across parent and children so the
-- fallback merge can compare apples-to-apples.

CREATE TABLE IF NOT EXISTS public.cms_page_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.cms_pages(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  cover_image_alt TEXT NOT NULL DEFAULT '',
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  seo_keywords TEXT NOT NULL DEFAULT '',
  og_title TEXT NOT NULL DEFAULT '',
  og_description TEXT NOT NULL DEFAULT '',
  twitter_title TEXT NOT NULL DEFAULT '',
  twitter_description TEXT NOT NULL DEFAULT '',
  source_version_hash TEXT NOT NULL DEFAULT '',
  translation_status TEXT NOT NULL DEFAULT 'missing',
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cms_page_translations_unique UNIQUE (page_id, language_code),
  CONSTRAINT cms_page_translations_language_check CHECK (
    language_code IN ('en','ar','fr','ru','tr','zh-CN','es','pt-BR')
  ),
  CONSTRAINT cms_page_translations_status_check CHECK (
    translation_status IN ('current','outdated','failed','pending','missing')
  )
);

ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS page_id UUID NOT NULL;
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS language_code TEXT NOT NULL;
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS excerpt TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS content_html TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS cover_image_alt TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS seo_title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS seo_description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS seo_keywords TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS og_title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS og_description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS twitter_title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS twitter_description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS source_version_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS translation_status TEXT NOT NULL DEFAULT 'missing';
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.cms_page_translations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_page_translations_pkey'
       AND conrelid = 'public.cms_page_translations'::regclass
  ) THEN
    ALTER TABLE public.cms_page_translations
      ADD CONSTRAINT cms_page_translations_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_page_translations_page_id_fkey'
       AND conrelid = 'public.cms_page_translations'::regclass
  ) THEN
    ALTER TABLE public.cms_page_translations
      ADD CONSTRAINT cms_page_translations_page_id_fkey
      FOREIGN KEY (page_id) REFERENCES public.cms_pages(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_page_translations_unique'
       AND conrelid = 'public.cms_page_translations'::regclass
  ) THEN
    ALTER TABLE public.cms_page_translations
      ADD CONSTRAINT cms_page_translations_unique UNIQUE (page_id, language_code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_page_translations_language_check'
       AND conrelid = 'public.cms_page_translations'::regclass
  ) THEN
    ALTER TABLE public.cms_page_translations
      ADD CONSTRAINT cms_page_translations_language_check CHECK (
        language_code IN ('en','ar','fr','ru','tr','zh-CN','es','pt-BR')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_page_translations_status_check'
       AND conrelid = 'public.cms_page_translations'::regclass
  ) THEN
    ALTER TABLE public.cms_page_translations
      ADD CONSTRAINT cms_page_translations_status_check CHECK (
        translation_status IN ('current','outdated','failed','pending','missing')
      );
  END IF;
END $$;

-- Unique composite is enough for page+language lookups; only add one
-- partial index over the work-set statuses for backfill / pending
-- scans, and one for JOIN-optimized list lookups.
CREATE INDEX IF NOT EXISTS idx_cms_page_translations_lookup
  ON public.cms_page_translations (page_id, language_code, translation_status);

CREATE INDEX IF NOT EXISTS idx_cms_page_translations_work
  ON public.cms_page_translations (page_id, translation_status)
  WHERE translation_status IN ('pending','failed','outdated','missing');

-- ── 4. Per-language optional Blog image override ──────────────────────
-- Only cover + seo (og) + twitter overrides because those are the
-- three image slots that already exist on cms_pages itself (confirmed
-- via the 20260623150000_launch_readiness_foundation migration which
-- added seo_image_url, plus 20260623170000_centralize_seo_ownership
-- which added twitter_image_url).  og_image_url is not a separate
-- column on the parent; seo_image_url is the OG preview source.
-- Per-locale rows are UPSERT on (page_id, language_code).  A row with
-- all three URLs empty/NULL is semantically identical to "no override
-- exists" — the public loader falls through to the default
-- cms_pages.{cover_image_url, seo_image_url, twitter_image_url}.

CREATE TABLE IF NOT EXISTS public.cms_page_localized_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.cms_pages(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  cover_image_url TEXT,
  seo_image_url TEXT,
  twitter_image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cms_page_localized_images_unique UNIQUE (page_id, language_code),
  CONSTRAINT cms_page_localized_images_language_check CHECK (
    language_code IN ('en','ar','fr','ru','tr','zh-CN','es','pt-BR')
  )
);

ALTER TABLE public.cms_page_localized_images ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE public.cms_page_localized_images ADD COLUMN IF NOT EXISTS page_id UUID NOT NULL;
ALTER TABLE public.cms_page_localized_images ADD COLUMN IF NOT EXISTS language_code TEXT NOT NULL;
ALTER TABLE public.cms_page_localized_images ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE public.cms_page_localized_images ADD COLUMN IF NOT EXISTS seo_image_url TEXT;
ALTER TABLE public.cms_page_localized_images ADD COLUMN IF NOT EXISTS twitter_image_url TEXT;
ALTER TABLE public.cms_page_localized_images ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.cms_page_localized_images ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_page_localized_images_pkey'
       AND conrelid = 'public.cms_page_localized_images'::regclass
  ) THEN
    ALTER TABLE public.cms_page_localized_images
      ADD CONSTRAINT cms_page_localized_images_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_page_localized_images_page_id_fkey'
       AND conrelid = 'public.cms_page_localized_images'::regclass
  ) THEN
    ALTER TABLE public.cms_page_localized_images
      ADD CONSTRAINT cms_page_localized_images_page_id_fkey
      FOREIGN KEY (page_id) REFERENCES public.cms_pages(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_page_localized_images_unique'
       AND conrelid = 'public.cms_page_localized_images'::regclass
  ) THEN
    ALTER TABLE public.cms_page_localized_images
      ADD CONSTRAINT cms_page_localized_images_unique UNIQUE (page_id, language_code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'cms_page_localized_images_language_check'
       AND conrelid = 'public.cms_page_localized_images'::regclass
  ) THEN
    ALTER TABLE public.cms_page_localized_images
      ADD CONSTRAINT cms_page_localized_images_language_check CHECK (
        language_code IN ('en','ar','fr','ru','tr','zh-CN','es','pt-BR')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cms_page_localized_images_lookup
  ON public.cms_page_localized_images (page_id, language_code);

-- ── 5. Updated-at triggers (confirm public.set_updated_at exists in
--       20260615150000_finance_core_schema before using it; this
--       migration is additive, so DROP + CREATE keeps idempotency). ──

DROP TRIGGER IF EXISTS update_cms_page_translations_updated_at ON public.cms_page_translations;
CREATE TRIGGER update_cms_page_translations_updated_at
  BEFORE UPDATE ON public.cms_page_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS update_cms_page_localized_images_updated_at ON public.cms_page_localized_images;
CREATE TRIGGER update_cms_page_localized_images_updated_at
  BEFORE UPDATE ON public.cms_page_localized_images
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Existing FAQ translation tables already had updated_at triggers
-- installed by 20260626170000_faqs_module.sql; we don't touch them.

-- ── 6. RLS & Grants ──────────────────────────────────────────────────
-- Existing FAQ RLS + grants (faq_categories / faq_items /
-- faq_category_translations / faq_item_translations) were defined by
-- 20260626170000_faqs_module.sql and are preserved as-is. We only
-- extend RLS / grants for the two NEW cms_* translation tables and we
-- mirror the established convention exactly:
--   • authenticated + is_admin() → FOR ALL write
--   • public/anon            → SELECT only via a subquery that
--                               confirms the parent cms_page is
--                               published + enabled (and additionally
--                               for cms_page_translations we require
--                               the row to be useful translation text,
--                               i.e. NOT {failed, missing, blank}).

ALTER TABLE IF EXISTS public.cms_page_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cms_page_localized_images ENABLE ROW LEVEL SECURITY;

-- cms_page_translations: public SELECT only for USEFUL translations
-- attached to a published + enabled page.  Draft, failed, missing,
-- pending or outdated/blank translations are NOT directly readable
-- by the public; the server-side loader falls back to the English
-- row on cms_pages whenever the requested translation row is absent
-- or blocked here, which enforces the "English fallback" guarantee
-- at the data-access layer as well as in resolver code.
DROP POLICY IF EXISTS cms_page_translations_public_read ON public.cms_page_translations;
CREATE POLICY cms_page_translations_public_read
ON public.cms_page_translations
FOR SELECT TO public
USING (
  translation_status = 'current'
  AND char_length(source_version_hash) > 0
  AND char_length(title) > 0
  AND EXISTS (
    SELECT 1 FROM public.cms_pages p
    WHERE p.id = cms_page_translations.page_id
      AND p.status = 'published'
      AND p.is_enabled = true
      AND char_length(p.en_source_version_hash) > 0
      AND cms_page_translations.source_version_hash = p.en_source_version_hash
  )
);

-- cms_page_localized_images: public SELECT only for rows where at
-- least one override URL is non-empty, belonging to a published page.
-- Rows with all NULL/empty URLs are semantically "no override" and
-- we hide them from anon scans.
DROP POLICY IF EXISTS cms_page_localized_images_public_read ON public.cms_page_localized_images;
CREATE POLICY cms_page_localized_images_public_read
ON public.cms_page_localized_images
FOR SELECT TO public
USING (
  (
    char_length(COALESCE(cover_image_url, '')) > 0 OR
    char_length(COALESCE(seo_image_url,   '')) > 0 OR
    char_length(COALESCE(twitter_image_url, '')) > 0
  )
  AND EXISTS (
    SELECT 1 FROM public.cms_pages p
    WHERE p.id = cms_page_localized_images.page_id
      AND p.status = 'published'
      AND p.is_enabled = true
  )
);

-- Admin writes for authenticated users where public.is_admin() = true.
DROP POLICY IF EXISTS cms_page_translations_admin_manage ON public.cms_page_translations;
CREATE POLICY cms_page_translations_admin_manage
ON public.cms_page_translations
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS cms_page_localized_images_admin_manage ON public.cms_page_localized_images;
CREATE POLICY cms_page_localized_images_admin_manage
ON public.cms_page_localized_images
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Grants: anon/authenticated get SELECT on new tables; authenticated
-- gets INSERT/UPDATE/DELETE (RLS gates it to admins); service_role
-- gets full access as required for the server-side translator layer
-- which runs via createAdminClient() = service_role Supabase client.
GRANT SELECT ON TABLE public.cms_page_translations TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.cms_page_localized_images TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.cms_page_translations TO authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.cms_page_localized_images TO authenticated, service_role;

-- Reload PostgREST schema cache so the new tables / columns are
-- immediately usable over the Supabase REST / JS client.
NOTIFY pgrst, 'reload schema';

COMMIT;
