-- Migration: Security Fixes for Multilingual & Currency Schema
-- Timestamp: 20260615143416
--
-- Fixes applied:
--   1. Replace broad FOR ALL profile policy with separate SELECT / UPDATE policies
--      that prevent users from changing role, is_active, email, or other protected fields.
--   2. Fix handle_new_user() to always hardcode role = 'user'.
--   3. Replace all admin RLS checks that query auth.users with secure JWT app_metadata.
--   4. Add updated_at triggers for platform_settings and cms_translations.
--   5. Enforce a true singleton on platform_settings via a CHECK constraint.
-- ============================================================

-- ============================================================
-- 1. FIX handle_new_user() — always hardcode role = 'user'
--    Never read role from raw_user_meta_data.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    'user'  -- always hardcoded; never read from metadata
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. SECURE ADMIN HELPER FUNCTION
--    Returns true only when the caller's JWT app_metadata
--    contains role = 'admin'.  Never touches auth.users table.
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin';
$$;

-- ============================================================
-- 3. FIX user_profiles RLS POLICIES
--    Remove the broad FOR ALL policy and replace with:
--      a) SELECT — own row only
--      b) UPDATE — own row only, but protected columns
--         (role, is_active, email) are guarded by a secure
--         function so the DB rejects any attempt to change them.
--    No INSERT or DELETE allowed directly (auth trigger handles INSERT).
-- ============================================================

-- Drop the old broad policy
DROP POLICY IF EXISTS "users_manage_own_profile" ON public.user_profiles;

-- 3a. SELECT own profile
DROP POLICY IF EXISTS "users_select_own_profile" ON public.user_profiles;
CREATE POLICY "users_select_own_profile"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- 3b. UPDATE own profile — protected fields are enforced by the
--     check function below; the WITH CHECK clause ensures the
--     submitted row cannot change role, is_active, or email.
DROP POLICY IF EXISTS "users_update_own_profile" ON public.user_profiles;
CREATE POLICY "users_update_own_profile"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  -- Prevent elevation: submitted role must equal the stored role
  AND role = (SELECT role FROM public.user_profiles WHERE id = auth.uid())
  -- Prevent deactivation: submitted is_active must equal the stored value
  AND is_active = (SELECT is_active FROM public.user_profiles WHERE id = auth.uid())
  -- Prevent email change via profile table
  AND email = (SELECT email FROM public.user_profiles WHERE id = auth.uid())
);

-- No INSERT policy for regular users — the auth trigger inserts the row.
-- No DELETE policy for regular users — profiles are deleted via CASCADE on auth.users.

-- ============================================================
-- 4. FIX platform_settings RLS POLICIES
--    Use JWT app_metadata for admin check; no auth.users query.
-- ============================================================

DROP POLICY IF EXISTS "admin_write_platform_settings" ON public.platform_settings;
CREATE POLICY "admin_write_platform_settings"
ON public.platform_settings
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Public read policy is already correct; recreate for clarity.
DROP POLICY IF EXISTS "public_read_platform_settings" ON public.platform_settings;
CREATE POLICY "public_read_platform_settings"
ON public.platform_settings
FOR SELECT
TO public
USING (true);

-- ============================================================
-- 5. FIX currency_registry RLS POLICIES
--    Use JWT app_metadata for admin check; no auth.users query.
-- ============================================================

DROP POLICY IF EXISTS "admin_write_currency_registry" ON public.currency_registry;
CREATE POLICY "admin_write_currency_registry"
ON public.currency_registry
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Public read policy is already correct; recreate for clarity.
DROP POLICY IF EXISTS "public_read_currency_registry" ON public.currency_registry;
CREATE POLICY "public_read_currency_registry"
ON public.currency_registry
FOR SELECT
TO public
USING (true);

-- ============================================================
-- 6. FIX cms_translations RLS POLICIES
--    Use JWT app_metadata for admin check; no auth.users query.
-- ============================================================

DROP POLICY IF EXISTS "admin_manage_cms_translations" ON public.cms_translations;
CREATE POLICY "admin_manage_cms_translations"
ON public.cms_translations
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Public read policy (approved + published) is already correct; recreate for clarity.
DROP POLICY IF EXISTS "public_read_cms_translations" ON public.cms_translations;
CREATE POLICY "public_read_cms_translations"
ON public.cms_translations
FOR SELECT
TO public
USING (is_approved = true AND is_published = true);

-- ============================================================
-- 7. ADD updated_at TRIGGERS for platform_settings and cms_translations
-- ============================================================

-- Ensure the shared update_updated_at() function exists
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

-- platform_settings trigger
DROP TRIGGER IF EXISTS update_platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- cms_translations trigger
DROP TRIGGER IF EXISTS update_cms_translations_updated_at ON public.cms_translations;
CREATE TRIGGER update_cms_translations_updated_at
  BEFORE UPDATE ON public.cms_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 8. ENFORCE SINGLETON on platform_settings
--    A CHECK constraint on a constant expression prevents any
--    second row from ever being inserted.
-- ============================================================

-- Add a singleton_lock column that must always equal true,
-- then add a UNIQUE constraint on it so only one row can exist.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS singleton_lock BOOLEAN NOT NULL DEFAULT true;

-- Ensure the column is always true (no false rows)
ALTER TABLE public.platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_singleton_lock_check;
ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_singleton_lock_check
  CHECK (singleton_lock = true);

-- Unique constraint ensures only one row with singleton_lock = true
ALTER TABLE public.platform_settings
  DROP CONSTRAINT IF EXISTS platform_settings_singleton_lock_unique;
ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_singleton_lock_unique
  UNIQUE (singleton_lock);

-- ============================================================
-- VERIFICATION NOTES (run manually to confirm)
-- ============================================================
-- 1. Normal user cannot promote themselves to admin:
--    UPDATE user_profiles SET role = 'admin' WHERE id = auth.uid();
--    → Should be rejected by the WITH CHECK clause in users_update_own_profile.
--
-- 2. Normal user cannot deactivate themselves:
--    UPDATE user_profiles SET is_active = false WHERE id = auth.uid();
--    → Should be rejected by the WITH CHECK clause.
--
-- 3. Normal user cannot change their email via profile table:
--    UPDATE user_profiles SET email = 'evil@example.com' WHERE id = auth.uid();
--    → Should be rejected by the WITH CHECK clause.
--
-- 4. New signup always receives role 'user':
--    Sign up a new user and check: SELECT role FROM user_profiles WHERE id = <new_id>;
--    → Should always return 'user'.
--
-- 5. Admin RLS policies use app_metadata only:
--    SELECT public.is_admin();  -- returns true only when JWT app_metadata.role = 'admin'
--
-- 6. Public read access still works:
--    SELECT * FROM currency_registry WHERE is_active = true;  -- no auth required
--    SELECT * FROM cms_translations WHERE is_approved = true AND is_published = true;
