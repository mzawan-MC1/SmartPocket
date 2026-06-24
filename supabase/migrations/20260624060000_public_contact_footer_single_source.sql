ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS footer_powered_by_text TEXT,
  ADD COLUMN IF NOT EXISTS footer_powered_by_url TEXT;

UPDATE public.platform_settings
SET
  app_name = COALESCE(NULLIF(app_name, ''), NULLIF(footer_company_name, ''), 'Smart Pocket'),
  contact_email = COALESCE(NULLIF(contact_email, ''), NULLIF(support_email, '')),
  footer_copyright = COALESCE(NULLIF(footer_copyright, ''), '© Smart Pocket. All rights reserved.'),
  footer_powered_by_text = COALESCE(NULLIF(footer_powered_by_text, ''), 'MCS Consultancy'),
  footer_powered_by_url = COALESCE(NULLIF(footer_powered_by_url, ''), 'https://www.mc1services.com/');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_notification_settings'
      AND column_name = 'support_email'
  ) THEN
    UPDATE public.platform_settings ps
    SET contact_email = COALESCE(NULLIF(ps.contact_email, ''), NULLIF(ens.support_email, ''))
    FROM public.email_notification_settings ens
    WHERE ens.singleton_lock = true
      AND (ps.contact_email IS NULL OR btrim(ps.contact_email) = '')
      AND ens.support_email IS NOT NULL
      AND btrim(ens.support_email) <> '';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_notification_settings'
      AND column_name = 'company_address'
  ) THEN
    UPDATE public.platform_settings ps
    SET contact_address = COALESCE(NULLIF(ps.contact_address, ''), NULLIF(ens.company_address, ''))
    FROM public.email_notification_settings ens
    WHERE ens.singleton_lock = true
      AND (ps.contact_address IS NULL OR btrim(ps.contact_address) = '')
      AND ens.company_address IS NOT NULL
      AND btrim(ens.company_address) <> '';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_notification_settings'
      AND column_name = 'copyright_text'
  ) THEN
    UPDATE public.platform_settings ps
    SET footer_copyright = COALESCE(NULLIF(ps.footer_copyright, ''), NULLIF(ens.copyright_text, ''))
    FROM public.email_notification_settings ens
    WHERE ens.singleton_lock = true
      AND (ps.footer_copyright IS NULL OR btrim(ps.footer_copyright) = '')
      AND ens.copyright_text IS NOT NULL
      AND btrim(ens.copyright_text) <> '';
  END IF;
END $$;

ALTER TABLE public.email_notification_settings
  DROP COLUMN IF EXISTS support_email,
  DROP COLUMN IF EXISTS company_address,
  DROP COLUMN IF EXISTS copyright_text;

ALTER TABLE public.platform_settings
  DROP COLUMN IF EXISTS support_email,
  DROP COLUMN IF EXISTS footer_company_name,
  DROP COLUMN IF EXISTS footer_website_url;

NOTIFY pgrst, 'reload schema';
