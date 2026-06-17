-- Phase 1: global country, currency, and phone reference-data foundation.
-- This migration is additive and idempotent by design.

BEGIN;

ALTER TABLE public.currency_registry
  ADD COLUMN IF NOT EXISTS numeric_code TEXT,
  ADD COLUMN IF NOT EXISTS native_name TEXT,
  ADD COLUMN IF NOT EXISTS narrow_symbol TEXT,
  ADD COLUMN IF NOT EXISTS fallback_symbol TEXT,
  ADD COLUMN IF NOT EXISTS symbol_type TEXT,
  ADD COLUMN IF NOT EXISTS symbol_asset_path TEXT,
  ADD COLUMN IF NOT EXISTS minor_units INTEGER,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_sort_order INTEGER NOT NULL DEFAULT 999,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE public.currency_registry
SET
  fallback_symbol = COALESCE(fallback_symbol, NULLIF(symbol, ''), code),
  minor_units = COALESCE(minor_units, decimals, 2),
  symbol_asset_path = COALESCE(symbol_asset_path, svg_asset_path),
  symbol_type = COALESCE(
    symbol_type,
    CASE
      WHEN COALESCE(symbol_asset_path, svg_asset_path) IS NOT NULL THEN 'asset'
      WHEN COALESCE(NULLIF(symbol, ''), code) = code THEN 'fallback'
      ELSE 'text'
    END
  )
WHERE
  fallback_symbol IS NULL
  OR minor_units IS NULL
  OR symbol_asset_path IS NULL
  OR symbol_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'currency_registry_symbol_type_check'
      AND conrelid = 'public.currency_registry'::regclass
  ) THEN
    ALTER TABLE public.currency_registry
      ADD CONSTRAINT currency_registry_symbol_type_check
      CHECK (symbol_type IN ('text', 'asset', 'fallback'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'currency_registry_minor_units_check'
      AND conrelid = 'public.currency_registry'::regclass
  ) THEN
    ALTER TABLE public.currency_registry
      ADD CONSTRAINT currency_registry_minor_units_check
      CHECK (minor_units BETWEEN 0 AND 4);
  END IF;
END $$;

ALTER TABLE public.currency_registry
  ALTER COLUMN fallback_symbol SET NOT NULL,
  ALTER COLUMN symbol_type SET NOT NULL,
  ALTER COLUMN minor_units SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.countries (
  iso_alpha2 TEXT PRIMARY KEY,
  iso_alpha3 TEXT NOT NULL,
  iso_numeric TEXT,
  name TEXT NOT NULL,
  native_name TEXT,
  flag TEXT,
  calling_code TEXT,
  calling_code_suffix TEXT,
  calling_code_suffixes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  region TEXT,
  subregion TEXT,
  default_currency_code TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  featured_sort_order INTEGER NOT NULL DEFAULT 999,
  sort_order INTEGER NOT NULL DEFAULT 999,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS iso_alpha2 TEXT,
  ADD COLUMN IF NOT EXISTS iso_alpha3 TEXT,
  ADD COLUMN IF NOT EXISTS iso_numeric TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS native_name TEXT,
  ADD COLUMN IF NOT EXISTS flag TEXT,
  ADD COLUMN IF NOT EXISTS calling_code TEXT,
  ADD COLUMN IF NOT EXISTS calling_code_suffix TEXT,
  ADD COLUMN IF NOT EXISTS calling_code_suffixes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS subregion TEXT,
  ADD COLUMN IF NOT EXISTS default_currency_code TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS featured_sort_order INTEGER NOT NULL DEFAULT 999,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 999,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'countries_iso_alpha2_check'
      AND conrelid = 'public.countries'::regclass
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_iso_alpha2_check
      CHECK (iso_alpha2 ~ '^[A-Z]{2}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'countries_iso_alpha3_check'
      AND conrelid = 'public.countries'::regclass
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_iso_alpha3_check
      CHECK (iso_alpha3 ~ '^[A-Z]{3}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'countries_iso_numeric_check'
      AND conrelid = 'public.countries'::regclass
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_iso_numeric_check
      CHECK (iso_numeric IS NULL OR iso_numeric ~ '^[0-9]{3}$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'countries_calling_code_check'
      AND conrelid = 'public.countries'::regclass
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_calling_code_check
      CHECK (calling_code IS NULL OR calling_code ~ '^\+[0-9]+$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'countries_calling_code_suffix_check'
      AND conrelid = 'public.countries'::regclass
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_calling_code_suffix_check
      CHECK (calling_code_suffix IS NULL OR calling_code_suffix ~ '^[0-9]+$');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'countries_iso_alpha3_unique'
      AND conrelid = 'public.countries'::regclass
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_iso_alpha3_unique UNIQUE (iso_alpha3);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'countries_default_currency_code_fkey'
      AND conrelid = 'public.countries'::regclass
  ) THEN
    ALTER TABLE public.countries
      ADD CONSTRAINT countries_default_currency_code_fkey
      FOREIGN KEY (default_currency_code)
      REFERENCES public.currency_registry (code)
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.country_currencies (
  country_code TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_official BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT country_currencies_pkey PRIMARY KEY (country_code, currency_code),
  CONSTRAINT country_currencies_country_code_fkey
    FOREIGN KEY (country_code)
    REFERENCES public.countries (iso_alpha2)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT country_currencies_currency_code_fkey
    FOREIGN KEY (currency_code)
    REFERENCES public.currency_registry (code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT country_currencies_priority_check
    CHECK (priority >= 1)
);

ALTER TABLE public.country_currencies
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS country_currencies_one_default_per_country_idx
  ON public.country_currencies (country_code)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS countries_active_name_idx
  ON public.countries (is_active, name);

CREATE INDEX IF NOT EXISTS countries_featured_sort_idx
  ON public.countries (is_featured, featured_sort_order, name);

CREATE INDEX IF NOT EXISTS countries_default_currency_code_idx
  ON public.countries (default_currency_code);

CREATE INDEX IF NOT EXISTS countries_calling_code_idx
  ON public.countries (calling_code);

CREATE INDEX IF NOT EXISTS currency_registry_active_name_idx
  ON public.currency_registry (is_active, name);

CREATE INDEX IF NOT EXISTS currency_registry_featured_sort_idx
  ON public.currency_registry (is_featured, featured_sort_order, name);

CREATE INDEX IF NOT EXISTS country_currencies_currency_code_idx
  ON public.country_currencies (currency_code, is_default, priority);

CREATE INDEX IF NOT EXISTS country_currencies_country_code_priority_idx
  ON public.country_currencies (country_code, priority);

DROP TRIGGER IF EXISTS update_countries_updated_at ON public.countries;
CREATE TRIGGER update_countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_country_currencies_updated_at ON public.country_currencies;
CREATE TRIGGER update_country_currencies_updated_at
  BEFORE UPDATE ON public.country_currencies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_currencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_currency_registry" ON public.currency_registry;
CREATE POLICY "public_read_currency_registry"
ON public.currency_registry
FOR SELECT
TO public
USING (is_active = TRUE);

DROP POLICY IF EXISTS "admin_read_currency_registry" ON public.currency_registry;
CREATE POLICY "admin_read_currency_registry"
ON public.currency_registry
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_write_currency_registry" ON public.currency_registry;
CREATE POLICY "admin_write_currency_registry"
ON public.currency_registry
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "public_read_countries" ON public.countries;
CREATE POLICY "public_read_countries"
ON public.countries
FOR SELECT
TO public
USING (is_active = TRUE);

DROP POLICY IF EXISTS "admin_read_countries" ON public.countries;
CREATE POLICY "admin_read_countries"
ON public.countries
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_write_countries" ON public.countries;
CREATE POLICY "admin_write_countries"
ON public.countries
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "public_read_country_currencies" ON public.country_currencies;
CREATE POLICY "public_read_country_currencies"
ON public.country_currencies
FOR SELECT
TO public
USING (
  EXISTS (
    SELECT 1
    FROM public.countries
    WHERE countries.iso_alpha2 = country_currencies.country_code
      AND countries.is_active = TRUE
  )
  AND EXISTS (
    SELECT 1
    FROM public.currency_registry
    WHERE currency_registry.code = country_currencies.currency_code
      AND currency_registry.is_active = TRUE
  )
);

DROP POLICY IF EXISTS "admin_read_country_currencies" ON public.country_currencies;
CREATE POLICY "admin_read_country_currencies"
ON public.country_currencies
FOR SELECT
TO authenticated
USING (public.is_admin());

DROP POLICY IF EXISTS "admin_write_country_currencies" ON public.country_currencies;
CREATE POLICY "admin_write_country_currencies"
ON public.country_currencies
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

GRANT SELECT ON TABLE public.currency_registry TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE
ON TABLE public.currency_registry
TO authenticated;

GRANT SELECT ON TABLE public.countries TO anon, authenticated;
GRANT SELECT ON TABLE public.country_currencies TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE
ON TABLE public.countries
TO authenticated;

GRANT INSERT, UPDATE, DELETE
ON TABLE public.country_currencies
TO authenticated;

COMMIT;
