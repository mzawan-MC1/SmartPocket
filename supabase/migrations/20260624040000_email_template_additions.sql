DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'email_delivery_status'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    RAISE NOTICE 'email_delivery_status enum not found; ensure transactional email migration ran first.';
  END IF;
END
$$;

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
VALUES
  (
    'admin_trial_expiring',
    'Trial expiring (admin notification)',
    'admin',
    'admin',
    'Trial expiring: {{customer_email}} ({{days_remaining}} days)',
    'A user trial is approaching its end date.',
    'Trial expiring',
    '<p style="margin:0 0 16px;">A user trial is approaching its end date.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Trial end:</strong> {{trial_end_date}}</p><p style="margin:0;"><strong>Days remaining:</strong> {{days_remaining}}</p>',
    'A user trial is approaching its end date.\n\nEmail: {{customer_email}}\nTrial end: {{trial_end_date}}\nDays remaining: {{days_remaining}}',
    'Open admin',
    '{{admin_url}}',
    true,
    '["customer_email","customer_name","trial_end_date","days_remaining","admin_url"]'::jsonb,
    'en'
  )
ON CONFLICT (template_key, language_code) DO NOTHING;

UPDATE public.email_templates
SET enabled = false
WHERE language_code = 'en'
  AND template_key IN ('customer_password_changed', 'customer_email_changed', 'customer_social_login_connected')
  AND enabled = true;

NOTIFY pgrst, 'reload schema';
