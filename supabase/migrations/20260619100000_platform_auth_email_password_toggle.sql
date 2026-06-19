-- Add a persisted toggle for email/password auth visibility on public auth screens.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS email_password_enabled BOOLEAN DEFAULT true;

UPDATE public.platform_settings
SET email_password_enabled = true
WHERE email_password_enabled IS NULL;
