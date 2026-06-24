ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

UPDATE public.user_profiles
SET onboarding_completed_at = COALESCE(onboarding_completed_at, updated_at)
WHERE onboarding_completed_at IS NULL
  AND country IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding_completed_at
  ON public.user_profiles (onboarding_completed_at DESC);

INSERT INTO public.email_templates (
  template_key,
  name,
  category,
  recipient_type,
  subject,
  preheader,
  heading,
  html_body,
  text_body,
  button_text,
  button_url_template,
  enabled,
  supported_variables,
  language_code
)
VALUES (
  'admin_smtp_test',
  'SMTP test email',
  'system',
  'admin',
  'Smart Pocket SMTP test',
  'This is a test message to confirm SMTP delivery.',
  'SMTP test email',
  '<p style="margin:0 0 16px;">This is a test email from Smart Pocket to confirm that SMTP delivery is configured correctly.</p><p style="margin:0 0 16px;"><strong>Sent at:</strong> {{sent_at}}</p><p style="margin:0;">If you received this message, the application can connect to your SMTP provider successfully.</p>',
  'This is a test email from Smart Pocket to confirm that SMTP delivery is configured correctly.\n\nSent at: {{sent_at}}\n\nIf you received this message, the application can connect to your SMTP provider successfully.',
  null,
  null,
  true,
  '["sent_at","company_name","support_email"]'::jsonb,
  'en'
)
ON CONFLICT (template_key, language_code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
