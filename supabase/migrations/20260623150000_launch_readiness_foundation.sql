-- ============================================================
-- Smart Pocket — Launch Readiness Foundation
-- Migration: 20260623150000_launch_readiness_foundation.sql
-- Safe, additive, and idempotent.
-- ============================================================

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS short_brand_name TEXT,
  ADD COLUMN IF NOT EXISTS compact_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS apple_touch_icon_url TEXT,
  ADD COLUMN IF NOT EXISTS pwa_icon_192_url TEXT,
  ADD COLUMN IF NOT EXISTS pwa_icon_512_url TEXT,
  ADD COLUMN IF NOT EXISTS social_image_url TEXT,
  ADD COLUMN IF NOT EXISTS email_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS organization_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS og_title TEXT,
  ADD COLUMN IF NOT EXISTS og_description TEXT,
  ADD COLUMN IF NOT EXISTS twitter_title TEXT,
  ADD COLUMN IF NOT EXISTS twitter_description TEXT,
  ADD COLUMN IF NOT EXISTS twitter_image TEXT,
  ADD COLUMN IF NOT EXISTS robots_follow BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS google_site_verification TEXT,
  ADD COLUMN IF NOT EXISTS bing_site_verification TEXT,
  ADD COLUMN IF NOT EXISTS google_tag_manager_id TEXT,
  ADD COLUMN IF NOT EXISTS organization_name TEXT,
  ADD COLUMN IF NOT EXISTS organization_legal_name TEXT,
  ADD COLUMN IF NOT EXISTS organization_description TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_email TEXT,
  ADD COLUMN IF NOT EXISTS support_email TEXT,
  ADD COLUMN IF NOT EXISTS footer_company_name TEXT,
  ADD COLUMN IF NOT EXISTS footer_website_url TEXT,
  ADD COLUMN IF NOT EXISTS footer_copyright TEXT,
  ADD COLUMN IF NOT EXISTS test_recipient_email TEXT;

ALTER TABLE public.cms_pages
  ADD COLUMN IF NOT EXISTS seo_image_url TEXT;

UPDATE public.platform_settings
SET
  short_brand_name = COALESCE(NULLIF(short_brand_name, ''), NULLIF(app_name, '')),
  compact_logo_url = COALESCE(NULLIF(compact_logo_url, ''), NULLIF(favicon_url, '')),
  apple_touch_icon_url = COALESCE(NULLIF(apple_touch_icon_url, ''), NULLIF(favicon_url, '')),
  pwa_icon_192_url = COALESCE(NULLIF(pwa_icon_192_url, ''), NULLIF(favicon_url, '')),
  pwa_icon_512_url = COALESCE(NULLIF(pwa_icon_512_url, ''), NULLIF(favicon_url, '')),
  social_image_url = CASE
    WHEN social_image_url IS NULL OR btrim(social_image_url) = ''
      THEN '/assets/images/smart-pocket-social-card.png'
    WHEN lower(btrim(social_image_url)) IN (
      '/assets/images/app_logo.png',
      '/assets/images/smart-pocket-social-card.svg',
      '/assets/images/smart-pocket-mark.svg',
      '/assets/images/smart-pocket-icon.svg',
      '/favicon.ico'
    )
      THEN '/assets/images/smart-pocket-social-card.png'
    WHEN social_image_url = logo_url
      OR social_image_url = compact_logo_url
      OR social_image_url = favicon_url
      OR social_image_url = apple_touch_icon_url
      OR social_image_url = pwa_icon_192_url
      OR social_image_url = pwa_icon_512_url
      THEN '/assets/images/smart-pocket-social-card.png'
    ELSE social_image_url
  END,
  email_logo_url = COALESCE(NULLIF(email_logo_url, ''), NULLIF(logo_url, '')),
  organization_logo_url = COALESCE(NULLIF(organization_logo_url, ''), NULLIF(logo_url, '')),
  og_title = COALESCE(NULLIF(og_title, ''), NULLIF(site_title, '')),
  og_description = COALESCE(NULLIF(og_description, ''), NULLIF(site_description, '')),
  twitter_title = COALESCE(NULLIF(twitter_title, ''), NULLIF(og_title, ''), NULLIF(site_title, '')),
  twitter_description = COALESCE(NULLIF(twitter_description, ''), NULLIF(og_description, ''), NULLIF(site_description, '')),
  twitter_image = CASE
    WHEN twitter_image IS NULL OR btrim(twitter_image) = ''
      THEN '/assets/images/smart-pocket-social-card.png'
    WHEN lower(btrim(twitter_image)) IN (
      '/assets/images/app_logo.png',
      '/assets/images/smart-pocket-social-card.svg',
      '/assets/images/smart-pocket-mark.svg',
      '/assets/images/smart-pocket-icon.svg',
      '/favicon.ico'
    )
      THEN '/assets/images/smart-pocket-social-card.png'
    WHEN twitter_image = logo_url
      OR twitter_image = compact_logo_url
      OR twitter_image = favicon_url
      OR twitter_image = apple_touch_icon_url
      OR twitter_image = pwa_icon_192_url
      OR twitter_image = pwa_icon_512_url
      THEN '/assets/images/smart-pocket-social-card.png'
    ELSE twitter_image
  END,
  canonical_url = CASE
    WHEN canonical_url IS NULL OR btrim(canonical_url) = '' OR canonical_url = 'https://smartpocke9976.builtwithrocket.new'
      THEN 'https://1smartpocket.com'
    ELSE canonical_url
  END,
  from_email = CASE
    WHEN from_email IS NULL OR btrim(from_email) = '' OR from_email = 'noreply@smartpocket.app'
      THEN 'no-reply@1smartpocket.com'
    ELSE from_email
  END,
  from_name = COALESCE(NULLIF(from_name, ''), 'Smart Pocket'),
  reply_to_email = COALESCE(NULLIF(reply_to_email, ''), 'info@1smartpocket.com'),
  support_email = COALESCE(NULLIF(support_email, ''), NULLIF(contact_email, ''), 'info@1smartpocket.com'),
  footer_company_name = COALESCE(NULLIF(footer_company_name, ''), NULLIF(app_name, ''), 'Smart Pocket'),
  footer_website_url = COALESCE(NULLIF(footer_website_url, ''), 'https://1smartpocket.com'),
  footer_copyright = COALESCE(NULLIF(footer_copyright, ''), '© Smart Pocket. All rights reserved.'),
  organization_name = COALESCE(NULLIF(organization_name, ''), NULLIF(app_name, ''), 'Smart Pocket'),
  organization_description = COALESCE(NULLIF(organization_description, ''), NULLIF(site_description, '')),
  robots_follow = COALESCE(robots_follow, true);

CREATE TABLE IF NOT EXISTS public.platform_email_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_lock BOOLEAN NOT NULL DEFAULT true,
  smtp_password TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT platform_email_secrets_singleton_lock_check CHECK (singleton_lock = true),
  CONSTRAINT platform_email_secrets_singleton_lock_unique UNIQUE (singleton_lock)
);

INSERT INTO public.platform_email_secrets (singleton_lock)
SELECT true
WHERE NOT EXISTS (SELECT 1 FROM public.platform_email_secrets);

ALTER TABLE public.platform_email_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_email_secrets FROM PUBLIC;
REVOKE ALL ON TABLE public.platform_email_secrets FROM anon;
REVOKE ALL ON TABLE public.platform_email_secrets FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.platform_email_secrets TO service_role;

DROP POLICY IF EXISTS "admin_manage_platform_email_secrets" ON public.platform_email_secrets;
DROP POLICY IF EXISTS "service_role_manage_platform_email_secrets" ON public.platform_email_secrets;
CREATE POLICY "service_role_manage_platform_email_secrets"
ON public.platform_email_secrets
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS update_platform_email_secrets_updated_at ON public.platform_email_secrets;
CREATE TRIGGER update_platform_email_secrets_updated_at
  BEFORE UPDATE ON public.platform_email_secrets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT contact_submissions_status_check CHECK (status IN ('new', 'reviewed', 'resolved'))
);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_manage_contact_submissions" ON public.contact_submissions;
CREATE POLICY "admin_manage_contact_submissions"
ON public.contact_submissions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS update_contact_submissions_updated_at ON public.contact_submissions;
CREATE TRIGGER update_contact_submissions_updated_at
  BEFORE UPDATE ON public.contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
