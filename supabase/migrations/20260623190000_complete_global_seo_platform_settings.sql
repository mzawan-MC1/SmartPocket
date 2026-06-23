-- Complete the Global SEO platform_settings schema used by /admin/seo.

ALTER TABLE public.platform_settings
ADD COLUMN IF NOT EXISTS title_template TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'platform_settings'
      AND column_name = 'keywords'
      AND udt_name <> '_text'
  ) THEN
    ALTER TABLE public.platform_settings
    ALTER COLUMN keywords TYPE TEXT[]
    USING CASE
      WHEN keywords IS NULL THEN NULL
      WHEN btrim(keywords) = '' THEN ARRAY[]::TEXT[]
      ELSE array_remove(
        regexp_split_to_array(keywords, '\s*,\s*'),
        ''
      )
    END;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'platform_settings'
      AND column_name = 'home_seo_keywords'
      AND udt_name <> '_text'
  ) THEN
    ALTER TABLE public.platform_settings
    ALTER COLUMN home_seo_keywords TYPE TEXT[]
    USING CASE
      WHEN home_seo_keywords IS NULL THEN NULL
      WHEN btrim(home_seo_keywords) = '' THEN ARRAY[]::TEXT[]
      ELSE array_remove(
        regexp_split_to_array(home_seo_keywords, '\s*,\s*'),
        ''
      )
    END;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';