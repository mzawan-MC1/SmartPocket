-- Migration: Phase 1 Multilingual & Currency Schema
-- Timestamp: 20260615141135

-- ============================================================
-- 1. TYPES (safe creation via DO block)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'supported_language' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.supported_language AS ENUM ('en', 'ar', 'fr', 'ru');
  END IF;
END
$$;

-- ============================================================
-- 2. TABLES
-- ============================================================

-- User profiles: base table may already exist from Phase 1.
-- Only create if it doesn't exist (without the new columns).
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add new columns to user_profiles safely (ALTER TABLE ADD COLUMN IF NOT EXISTS)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS preferred_language public.supported_language NOT NULL DEFAULT 'en';

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'AED';

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS country TEXT;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS monthly_income NUMERIC(18, 2);

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS month_start_day INTEGER DEFAULT 1;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light';

-- Platform settings (singleton row)
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  default_language public.supported_language NOT NULL DEFAULT 'en',
  enabled_languages TEXT[] NOT NULL DEFAULT ARRAY['en', 'ar', 'fr', 'ru'],
  default_currency TEXT NOT NULL DEFAULT 'AED',
  enabled_currencies TEXT[] NOT NULL DEFAULT ARRAY['AED', 'USD', 'EUR', 'GBP', 'SAR', 'PKR', 'INR', 'RUB', 'CAD', 'AUD'],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Currency registry
CREATE TABLE IF NOT EXISTS public.currency_registry (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  decimals INTEGER NOT NULL DEFAULT 2,
  default_locale TEXT NOT NULL DEFAULT 'en-US',
  symbol_position TEXT NOT NULL DEFAULT 'before',
  symbol_spacing BOOLEAN NOT NULL DEFAULT false,
  use_symbol BOOLEAN NOT NULL DEFAULT true,
  svg_asset_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 99,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CMS content translations
CREATE TABLE IF NOT EXISTS public.cms_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL,
  content_key TEXT NOT NULL,
  language public.supported_language NOT NULL DEFAULT 'en',
  value TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_user_profiles_id ON public.user_profiles(id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_language ON public.user_profiles(preferred_language);
CREATE INDEX IF NOT EXISTS idx_currency_registry_active ON public.currency_registry(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_translations_unique ON public.cms_translations(content_type, content_key, language);

-- ============================================================
-- 4. FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. ENABLE RLS
-- ============================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_translations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. RLS POLICIES
-- ============================================================

-- user_profiles: users manage own profile
DROP POLICY IF EXISTS "users_manage_own_profile" ON public.user_profiles;
CREATE POLICY "users_manage_own_profile"
ON public.user_profiles
FOR ALL
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- platform_settings: public read, admin write
DROP POLICY IF EXISTS "public_read_platform_settings" ON public.platform_settings;
CREATE POLICY "public_read_platform_settings"
ON public.platform_settings
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "admin_write_platform_settings" ON public.platform_settings;
CREATE POLICY "admin_write_platform_settings"
ON public.platform_settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_user_meta_data->>'role' = 'admin' OR au.raw_app_meta_data->>'role' = 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_user_meta_data->>'role' = 'admin' OR au.raw_app_meta_data->>'role' = 'admin')
  )
);

-- currency_registry: public read, admin write
DROP POLICY IF EXISTS "public_read_currency_registry" ON public.currency_registry;
CREATE POLICY "public_read_currency_registry"
ON public.currency_registry
FOR SELECT
TO public
USING (true);

DROP POLICY IF EXISTS "admin_write_currency_registry" ON public.currency_registry;
CREATE POLICY "admin_write_currency_registry"
ON public.currency_registry
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_user_meta_data->>'role' = 'admin' OR au.raw_app_meta_data->>'role' = 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_user_meta_data->>'role' = 'admin' OR au.raw_app_meta_data->>'role' = 'admin')
  )
);

-- cms_translations: public read approved+published, admin write
DROP POLICY IF EXISTS "public_read_cms_translations" ON public.cms_translations;
CREATE POLICY "public_read_cms_translations"
ON public.cms_translations
FOR SELECT
TO public
USING (is_approved = true AND is_published = true);

DROP POLICY IF EXISTS "admin_manage_cms_translations" ON public.cms_translations;
CREATE POLICY "admin_manage_cms_translations"
ON public.cms_translations
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_user_meta_data->>'role' = 'admin' OR au.raw_app_meta_data->>'role' = 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_user_meta_data->>'role' = 'admin' OR au.raw_app_meta_data->>'role' = 'admin')
  )
);

-- ============================================================
-- 7. TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS update_currency_registry_updated_at ON public.currency_registry;
CREATE TRIGGER update_currency_registry_updated_at
  BEFORE UPDATE ON public.currency_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 8. SEED DATA
-- ============================================================

-- Platform settings (singleton) — insert only if table is empty
INSERT INTO public.platform_settings (id, default_language, enabled_languages, default_currency, enabled_currencies)
SELECT
  gen_random_uuid(),
  'en',
  ARRAY['en', 'ar', 'fr', 'ru'],
  'AED',
  ARRAY['AED', 'USD', 'EUR', 'GBP', 'SAR', 'PKR', 'INR', 'RUB', 'CAD', 'AUD']
WHERE NOT EXISTS (SELECT 1 FROM public.platform_settings);

-- Currency registry seed data
INSERT INTO public.currency_registry (code, name, symbol, decimals, default_locale, symbol_position, symbol_spacing, use_symbol, svg_asset_path, is_active, sort_order)
VALUES
  ('AED', 'UAE Dirham', 'AED', 2, 'en-AE', 'before', true, false, '/currencies/aed-dirham-symbol.svg', true, 1),
  ('USD', 'US Dollar', '$', 2, 'en-US', 'before', false, true, NULL, true, 2),
  ('EUR', 'Euro', '€', 2, 'de-DE', 'before', false, true, NULL, true, 3),
  ('GBP', 'British Pound', '£', 2, 'en-GB', 'before', false, true, NULL, true, 4),
  ('SAR', 'Saudi Riyal', '﷼', 2, 'ar-SA', 'before', true, true, NULL, true, 5),
  ('PKR', 'Pakistani Rupee', '₨', 2, 'ur-PK', 'before', false, true, NULL, true, 6),
  ('INR', 'Indian Rupee', '₹', 2, 'en-IN', 'before', false, true, NULL, true, 7),
  ('RUB', 'Russian Ruble', '₽', 2, 'ru-RU', 'after', true, true, NULL, true, 8),
  ('CAD', 'Canadian Dollar', 'CA$', 2, 'en-CA', 'before', false, true, NULL, true, 9),
  ('AUD', 'Australian Dollar', 'A$', 2, 'en-AU', 'before', false, true, NULL, true, 10)
ON CONFLICT (code) DO NOTHING;
