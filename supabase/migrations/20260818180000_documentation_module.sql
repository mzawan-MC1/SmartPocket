-- ============================================================
-- Smart Pocket - Documentation Module
-- Migration: 20260818180000_documentation_module.sql
-- Architecture mirrors Blog/FAQ automated translation:
--   - documentation_articles = canonical English source-of-truth
--   - documentation_translations = generated per-language child rows
--     (NOT stored for en; English lives on source row only)
-- English source has a stable en_source_version_hash SHA-256(0..32)
-- slice used to detect when a translation is outdated vs in sync.
-- Rerun safety:
--   - Safe for first-time application on an empty database.
--   - Safe to rerun after a successful prior application
--     (every object is CREATE IF NOT EXISTS or DROP + RECREATE).
--   - Safe additive repair of compatible missing optional/defaulted
--     columns after a rolled-back partial run.
--   - Does not modify unrelated production data.
-- ============================================================

BEGIN;

-- == 1. Source-of-truth table: documentation_articles =========
-- English-only canonical row. locale_code exists ONLY as a
-- hard-coded invariant = 'en' so the column is unnecessary for
-- business logic but is retained as a compatibility guard with
-- a CHECK constraint forcing 'en' only (no admin can accidentally
-- create a non-English source).  We also keep en_source_version_hash
-- for hash-based freshness tracking, exactly mirroring cms_pages.

CREATE TABLE IF NOT EXISTS public.documentation_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  slug TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  locale_code TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'draft',
  enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  en_source_version_hash TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT documentation_articles_slug_format_check CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT documentation_articles_source_always_en CHECK (locale_code = 'en'),
  CONSTRAINT documentation_articles_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT documentation_articles_slug_unique UNIQUE (slug)
);

-- Reparative ADD COLUMN IF NOT EXISTS for every column so a
-- partially-created table (rolled back mid-run) can be healed.
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS slug TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS content_html TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS locale_code TEXT NOT NULL DEFAULT 'en';
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS en_source_version_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.documentation_articles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Constraints applied idempotently via DO $$ blocks so they
-- are never duplicated on a re-run.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_articles_pkey'
       AND conrelid = 'public.documentation_articles'::regclass
  ) THEN
    ALTER TABLE public.documentation_articles
      ADD CONSTRAINT documentation_articles_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_articles_slug_format_check'
       AND conrelid = 'public.documentation_articles'::regclass
  ) THEN
    ALTER TABLE public.documentation_articles
      ADD CONSTRAINT documentation_articles_slug_format_check
      CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_articles_source_always_en'
       AND conrelid = 'public.documentation_articles'::regclass
  ) THEN
    ALTER TABLE public.documentation_articles
      ADD CONSTRAINT documentation_articles_source_always_en
      CHECK (locale_code = 'en');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_articles_status_check'
       AND conrelid = 'public.documentation_articles'::regclass
  ) THEN
    ALTER TABLE public.documentation_articles
      ADD CONSTRAINT documentation_articles_status_check
      CHECK (status IN ('draft', 'published'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_articles_slug_unique'
       AND conrelid = 'public.documentation_articles'::regclass
  ) THEN
    ALTER TABLE public.documentation_articles
      ADD CONSTRAINT documentation_articles_slug_unique UNIQUE (slug);
  END IF;
END $$;

-- Indexes mirror cms_pages patterns.
CREATE INDEX IF NOT EXISTS idx_documentation_articles_public_list ON public.documentation_articles
  (enabled, status, display_order, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documentation_articles_search ON public.documentation_articles
  (enabled, status);

CREATE INDEX IF NOT EXISTS idx_documentation_articles_category ON public.documentation_articles
  (category);

CREATE INDEX IF NOT EXISTS idx_documentation_articles_admin_order ON public.documentation_articles
  (display_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_documentation_articles_source_hash ON public.documentation_articles
  (en_source_version_hash)
  WHERE char_length(en_source_version_hash) > 0;

DROP TRIGGER IF EXISTS update_documentation_articles_updated_at ON public.documentation_articles;
CREATE TRIGGER update_documentation_articles_updated_at
  BEFORE UPDATE ON public.documentation_articles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.documentation_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documentation_articles_public_read ON public.documentation_articles;
CREATE POLICY documentation_articles_public_read
ON public.documentation_articles
FOR SELECT
TO public
USING (
  enabled = true
  AND status = 'published'
);

DROP POLICY IF EXISTS documentation_articles_admin_manage ON public.documentation_articles;
CREATE POLICY documentation_articles_admin_manage
ON public.documentation_articles
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.documentation_articles TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.documentation_articles TO authenticated, service_role;

-- == 2. Generated translation table ============================
-- English row is NOT stored here. Translation rows only exist for
-- the 7 non-English enabled locales, identical to
-- cms_page_translations. ON DELETE CASCADE removes translations
-- when the source article is dropped. UNIQUE(article_id,
-- language_code) prevents duplicate translations for the same
-- source and language.

CREATE TABLE IF NOT EXISTS public.documentation_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.documentation_articles(id) ON DELETE CASCADE,
  language_code TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  content_html TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  source_version_hash TEXT NOT NULL DEFAULT '',
  translation_status TEXT NOT NULL DEFAULT 'missing',
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT documentation_translations_unique UNIQUE (article_id, language_code),
  CONSTRAINT documentation_translations_language_check CHECK (
    language_code IN ('en','ar','fr','ru','tr','zh-CN','es','pt-BR')
  ),
  CONSTRAINT documentation_translations_status_check CHECK (
    translation_status IN ('current','outdated','failed','pending','missing')
  )
);

ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS id UUID PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS article_id UUID NOT NULL;
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS language_code TEXT NOT NULL;
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS content_html TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS source_version_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS translation_status TEXT NOT NULL DEFAULT 'missing';
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS last_error_message TEXT;
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE public.documentation_translations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_translations_pkey'
       AND conrelid = 'public.documentation_translations'::regclass
  ) THEN
    ALTER TABLE public.documentation_translations
      ADD CONSTRAINT documentation_translations_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_translations_article_id_fkey'
       AND conrelid = 'public.documentation_translations'::regclass
  ) THEN
    ALTER TABLE public.documentation_translations
      ADD CONSTRAINT documentation_translations_article_id_fkey
      FOREIGN KEY (article_id) REFERENCES public.documentation_articles(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_translations_unique'
       AND conrelid = 'public.documentation_translations'::regclass
  ) THEN
    ALTER TABLE public.documentation_translations
      ADD CONSTRAINT documentation_translations_unique UNIQUE (article_id, language_code);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_translations_language_check'
       AND conrelid = 'public.documentation_translations'::regclass
  ) THEN
    ALTER TABLE public.documentation_translations
      ADD CONSTRAINT documentation_translations_language_check CHECK (
        language_code IN ('en','ar','fr','ru','tr','zh-CN','es','pt-BR')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'documentation_translations_status_check'
       AND conrelid = 'public.documentation_translations'::regclass
  ) THEN
    ALTER TABLE public.documentation_translations
      ADD CONSTRAINT documentation_translations_status_check CHECK (
        translation_status IN ('current','outdated','failed','pending','missing')
      );
  END IF;
END $$;

-- Indexes: lookup for (article + language) is the primary query;
-- a work-queue partial index for pending/failed/outdated/missing.
CREATE INDEX IF NOT EXISTS idx_documentation_translations_lookup
  ON public.documentation_translations (article_id, language_code, translation_status);

CREATE INDEX IF NOT EXISTS idx_documentation_translations_work
  ON public.documentation_translations (article_id, translation_status)
  WHERE translation_status IN ('pending','failed','outdated','missing');

DROP TRIGGER IF EXISTS update_documentation_translations_updated_at ON public.documentation_translations;
CREATE TRIGGER update_documentation_translations_updated_at
  BEFORE UPDATE ON public.documentation_translations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- == 3. RLS & Grants for documentation_translations ============
-- Public SELECT: only for USEFUL translations (current, hash
-- non-empty, title non-empty, parent source published+enabled
-- AND source hash matches parent hash i.e. translation is fresh).
-- Orphaned, failed, missing, outdated or blank translations are
-- NOT readable by anon/public; server-side resolver falls back
-- to the English source row when the translation is blocked here.

ALTER TABLE public.documentation_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS documentation_translations_public_read ON public.documentation_translations;
CREATE POLICY documentation_translations_public_read
ON public.documentation_translations
FOR SELECT TO public
USING (
  translation_status = 'current'
  AND char_length(source_version_hash) > 0
  AND char_length(title) > 0
  AND EXISTS (
    SELECT 1 FROM public.documentation_articles a
    WHERE a.id = documentation_translations.article_id
      AND a.status = 'published'
      AND a.enabled = true
      AND char_length(a.en_source_version_hash) > 0
      AND documentation_translations.source_version_hash = a.en_source_version_hash
  )
);

DROP POLICY IF EXISTS documentation_translations_admin_manage ON public.documentation_translations;
CREATE POLICY documentation_translations_admin_manage
ON public.documentation_translations
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.documentation_translations TO anon, authenticated, service_role;
GRANT INSERT, UPDATE, DELETE ON TABLE public.documentation_translations TO authenticated, service_role;

-- Reload PostgREST schema cache so new tables / columns are
-- immediately usable over the Supabase REST / JS client.
NOTIFY pgrst, 'reload schema';

COMMIT;
