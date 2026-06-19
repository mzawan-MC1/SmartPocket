-- ============================================================
-- Smart Pocket — Repair canonical country calling codes
-- Migration: 20260619170000_repair_country_calling_codes.sql
-- Fixes root-only calling_code values generated from idd.root and
-- strengthens validation so truncated one-digit zone prefixes such as
-- +4 or +9 cannot be stored as country calling codes.
-- ============================================================

BEGIN;

DO $$
DECLARE
  repaired_count INTEGER := 0;
BEGIN
  WITH canonical_repairs AS (
    SELECT
      iso_alpha2,
      CASE
        WHEN calling_code IS NULL THEN NULL
        WHEN calling_code !~ '^\+[0-9]+$' THEN calling_code
        WHEN calling_code_suffix ~ '^\d+$'
          AND char_length(regexp_replace(calling_code, '\D', '', 'g')) = 1
          AND regexp_replace(calling_code, '\D', '', 'g') NOT IN ('1', '7')
          THEN calling_code || calling_code_suffix
        ELSE calling_code
      END AS canonical_calling_code
    FROM public.countries
  ),
  rows_to_update AS (
    SELECT
      countries.iso_alpha2,
      canonical_repairs.canonical_calling_code
    FROM public.countries AS countries
    JOIN canonical_repairs
      ON canonical_repairs.iso_alpha2 = countries.iso_alpha2
    WHERE COALESCE(countries.calling_code, '') <> COALESCE(canonical_repairs.canonical_calling_code, '')
  )
  UPDATE public.countries AS countries
  SET calling_code = rows_to_update.canonical_calling_code
  FROM rows_to_update
  WHERE countries.iso_alpha2 = rows_to_update.iso_alpha2;

  GET DIAGNOSTICS repaired_count = ROW_COUNT;
  RAISE NOTICE 'Repaired % country calling_code rows.', repaired_count;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'countries_canonical_calling_code_check'
      AND conrelid = 'public.countries'::regclass
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_canonical_calling_code_check
      CHECK (
        calling_code IS NULL
        OR (
          calling_code ~ '^\+[0-9]+$'
          AND (
            char_length(regexp_replace(calling_code, '\D', '', 'g')) >= 2
            OR regexp_replace(calling_code, '\D', '', 'g') IN ('1', '7')
          )
        )
      );
  END IF;
END $$;

COMMIT;
