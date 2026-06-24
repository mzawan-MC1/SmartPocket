DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'email_delivery_status'
  ) THEN
    CREATE TYPE public.email_delivery_status AS ENUM ('queued', 'sent', 'failed', 'skipped');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  preheader TEXT,
  heading TEXT,
  html_body TEXT NOT NULL,
  text_body TEXT NOT NULL,
  button_text TEXT,
  button_url_template TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  supported_variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  language_code TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_templates_recipient_type_check CHECK (recipient_type IN ('customer', 'admin', 'both'))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'email_templates_key_lang_unique'
  ) THEN
    CREATE UNIQUE INDEX email_templates_key_lang_unique
      ON public.email_templates (template_key, language_code);
  END IF;
END $$;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_admin_manage ON public.email_templates;
CREATE POLICY email_templates_admin_manage
  ON public.email_templates
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS email_templates_service_role_manage ON public.email_templates;
CREATE POLICY email_templates_service_role_manage
  ON public.email_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_email_templates_updated_at ON public.email_templates;
CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.email_notification_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton_lock BOOLEAN NOT NULL DEFAULT true,
  admin_notification_email TEXT,
  admin_cc TEXT,
  admin_bcc TEXT,
  sender_name TEXT,
  sender_email TEXT,
  reply_to_email TEXT,
  support_email TEXT,
  company_address TEXT,
  signature_name TEXT,
  signature_title TEXT,
  footer_disclaimer TEXT,
  copyright_text TEXT,
  trial_reminder_days INTEGER[] NOT NULL DEFAULT ARRAY[7,3,1],
  onboarding_reminder_days INTEGER NOT NULL DEFAULT 3,
  renewal_reminder_days INTEGER NOT NULL DEFAULT 7,
  event_enabled JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_notification_settings_singleton_lock_check CHECK (singleton_lock = true),
  CONSTRAINT email_notification_settings_singleton_lock_unique UNIQUE (singleton_lock)
);

INSERT INTO public.email_notification_settings (
  singleton_lock,
  admin_notification_email,
  sender_name,
  sender_email,
  reply_to_email,
  support_email,
  signature_name,
  signature_title,
  footer_disclaimer,
  copyright_text
)
SELECT
  true,
  'saaspersonalexp@gmail.com',
  'Smart Pocket Team',
  'no-reply@1smartpocket.com',
  'info@1smartpocket.com',
  'info@1smartpocket.com',
  'Smart Pocket Team',
  'Customer Success',
  'This email was sent by Smart Pocket regarding your account, subscription or activity on the Smart Pocket platform. If you did not request or expect this message, please contact our support team. Please do not share passwords, verification codes or sensitive financial information by email.',
  '© Smart Pocket. All rights reserved.'
WHERE NOT EXISTS (SELECT 1 FROM public.email_notification_settings);

ALTER TABLE public.email_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_notification_settings_admin_manage ON public.email_notification_settings;
CREATE POLICY email_notification_settings_admin_manage
  ON public.email_notification_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS email_notification_settings_service_role_manage ON public.email_notification_settings;
CREATE POLICY email_notification_settings_service_role_manage
  ON public.email_notification_settings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_email_notification_settings_updated_at ON public.email_notification_settings;
CREATE TRIGGER update_email_notification_settings_updated_at
  BEFORE UPDATE ON public.email_notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key TEXT NOT NULL,
  template_key TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES public.user_subscriptions(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.billing_events(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  provider_message_id TEXT,
  status public.email_delivery_status NOT NULL DEFAULT 'queued',
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT email_delivery_logs_event_key_unique UNIQUE (event_key)
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status_created_at
  ON public.email_delivery_logs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_user_created_at
  ON public.email_delivery_logs (user_id, created_at DESC);

ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_delivery_logs_admin_read ON public.email_delivery_logs;
CREATE POLICY email_delivery_logs_admin_read
  ON public.email_delivery_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS email_delivery_logs_admin_manage ON public.email_delivery_logs;
CREATE POLICY email_delivery_logs_admin_manage
  ON public.email_delivery_logs
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS email_delivery_logs_service_role_manage ON public.email_delivery_logs;
CREATE POLICY email_delivery_logs_service_role_manage
  ON public.email_delivery_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS update_email_delivery_logs_updated_at ON public.email_delivery_logs;
CREATE TRIGGER update_email_delivery_logs_updated_at
  BEFORE UPDATE ON public.email_delivery_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

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
    'customer_welcome',
    'Welcome to Smart Pocket',
    'account',
    'customer',
    'Welcome to Smart Pocket, {{customer_name}}',
    'Your Smart Pocket account is ready.',
    'Welcome to Smart Pocket',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Welcome to Smart Pocket. Your account is ready to use.</p><p style="margin:0;">You can start from your dashboard and complete onboarding to personalize your currency, region, and planning preferences.</p>',
    'Hello {{customer_name}},\n\nWelcome to Smart Pocket. Your account is ready to use.\n\nStart from your dashboard and complete onboarding to personalize your settings.',
    'Open dashboard',
    '{{dashboard_url}}',
    true,
    '["customer_name","customer_email","dashboard_url","support_email","company_name","company_address"]'::jsonb,
    'en'
  ),
  (
    'admin_new_user_registered',
    'New user registered (admin notification)',
    'admin',
    'admin',
    'New user registered: {{customer_email}}',
    'A new Smart Pocket user account was created.',
    'New user registered',
    '<p style="margin:0 0 16px;">A new user account was created.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Name:</strong> {{customer_name}}</p><p style="margin:0 0 6px;"><strong>Method:</strong> {{registration_method}}</p><p style="margin:0;">Open the admin portal to review the account.</p>',
    'A new user account was created.\n\nEmail: {{customer_email}}\nName: {{customer_name}}\nMethod: {{registration_method}}\n\nOpen the admin portal to review the account.',
    'Open admin',
    '{{admin_url}}',
    true,
    '["customer_name","customer_email","registration_method","admin_url"]'::jsonb,
    'en'
  ),
  (
    'customer_onboarding_completed',
    'Onboarding completed',
    'onboarding',
    'customer',
    'You are ready to use Smart Pocket',
    'Your onboarding is complete.',
    'Onboarding complete',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your onboarding is complete. Your dashboard is now personalized based on your settings.</p><p style="margin:0;">You can update these preferences at any time in Settings.</p>',
    'Hello {{customer_name}},\n\nYour onboarding is complete. Your dashboard is now personalized based on your settings.\n\nYou can update these preferences at any time in Settings.',
    'Open dashboard',
    '{{dashboard_url}}',
    true,
    '["customer_name","dashboard_url","support_email"]'::jsonb,
    'en'
  ),
  (
    'admin_user_onboarding_completed',
    'User onboarding completed (admin notification)',
    'admin',
    'admin',
    'User onboarding completed: {{customer_email}}',
    'A user completed onboarding.',
    'User onboarding completed',
    '<p style="margin:0 0 16px;">A user has completed onboarding.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Name:</strong> {{customer_name}}</p><p style="margin:0;">Open the admin portal for details.</p>',
    'A user has completed onboarding.\n\nEmail: {{customer_email}}\nName: {{customer_name}}\n\nOpen the admin portal for details.',
    'Open admin',
    '{{admin_url}}',
    true,
    '["customer_name","customer_email","admin_url"]'::jsonb,
    'en'
  ),
  (
    'customer_onboarding_incomplete',
    'Onboarding reminder',
    'onboarding',
    'customer',
    'Complete your Smart Pocket setup',
    'Finish onboarding to personalize your dashboard.',
    'Complete your setup',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">A few onboarding steps are still incomplete. Completing setup helps Smart Pocket personalize your currency, region, and planning preferences.</p><p style="margin:0;">You can finish onboarding in a few minutes.</p>',
    'Hello {{customer_name}},\n\nA few onboarding steps are still incomplete. Completing setup helps Smart Pocket personalize your settings.\n\nYou can finish onboarding in a few minutes.',
    'Continue onboarding',
    '{{onboarding_url}}',
    true,
    '["customer_name","onboarding_url","support_email"]'::jsonb,
    'en'
  ),
  (
    'admin_user_onboarding_incomplete',
    'User onboarding incomplete (admin notification)',
    'admin',
    'admin',
    'User onboarding incomplete: {{customer_email}}',
    'A user has not completed onboarding yet.',
    'User onboarding incomplete',
    '<p style="margin:0 0 16px;">A user account has not completed onboarding.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Name:</strong> {{customer_name}}</p>',
    'A user account has not completed onboarding.\n\nEmail: {{customer_email}}\nName: {{customer_name}}',
    null,
    null,
    true,
    '["customer_name","customer_email"]'::jsonb,
    'en'
  ),
  (
    'customer_trial_started',
    'Trial started',
    'trial',
    'customer',
    'Your Smart Pocket trial has started',
    'Your trial is now active.',
    'Trial started',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial is now active and will run until {{trial_end_date}}.</p><p style="margin:0;">You can review your plan and billing settings at any time.</p>',
    'Hello {{customer_name}},\n\nYour trial is now active and will run until {{trial_end_date}}.\n\nYou can review your plan and billing settings at any time.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","trial_end_date","billing_url","dashboard_url"]'::jsonb,
    'en'
  ),
  (
    'admin_trial_started',
    'Trial started (admin notification)',
    'admin',
    'admin',
    'Trial started: {{customer_email}}',
    'A trial has started.',
    'Trial started',
    '<p style="margin:0 0 16px;">A user trial has started.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Trial end:</strong> {{trial_end_date}}</p>',
    'A user trial has started.\n\nEmail: {{customer_email}}\nTrial end: {{trial_end_date}}',
    null,
    null,
    true,
    '["customer_email","trial_end_date"]'::jsonb,
    'en'
  ),
  (
    'customer_trial_expiring_7_days',
    'Trial expiring (7 days)',
    'trial',
    'customer',
    'Your Smart Pocket trial ends in 7 days',
    'Review your plan before your trial ends.',
    'Trial ends soon',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial ends on {{trial_end_date}}. If you would like to continue without interruption, you can choose a plan at any time.</p><p style="margin:0;">Your dashboard and data remain available during the trial.</p>',
    'Hello {{customer_name}},\n\nYour trial ends on {{trial_end_date}}. If you would like to continue without interruption, you can choose a plan at any time.',
    'Review plans',
    '{{billing_url}}',
    true,
    '["customer_name","trial_end_date","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_trial_expiring_3_days',
    'Trial expiring (3 days)',
    'trial',
    'customer',
    'Your Smart Pocket trial ends in 3 days',
    'Choose a plan to continue your subscription.',
    'Trial ends soon',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial ends on {{trial_end_date}}. To continue using Smart Pocket without interruption, select a plan from your billing settings.</p>',
    'Hello {{customer_name}},\n\nYour trial ends on {{trial_end_date}}. To continue using Smart Pocket without interruption, select a plan from your billing settings.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","trial_end_date","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_trial_expiring_1_day',
    'Trial expiring (1 day)',
    'trial',
    'customer',
    'Your Smart Pocket trial ends tomorrow',
    'Your trial ends soon.',
    'Trial ends tomorrow',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial ends on {{trial_end_date}}. If you would like to continue, choose a plan in billing.</p>',
    'Hello {{customer_name}},\n\nYour trial ends on {{trial_end_date}}. If you would like to continue, choose a plan in billing.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","trial_end_date","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_trial_expired',
    'Trial expired',
    'trial',
    'customer',
    'Your Smart Pocket trial has ended',
    'Your trial period has ended.',
    'Trial ended',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial has ended. You can choose a plan in billing to continue.</p>',
    'Hello {{customer_name}},\n\nYour trial has ended. You can choose a plan in billing to continue.',
    'Review plans',
    '{{billing_url}}',
    true,
    '["customer_name","billing_url"]'::jsonb,
    'en'
  ),
  (
    'admin_trial_expired',
    'Trial expired (admin notification)',
    'admin',
    'admin',
    'Trial expired: {{customer_email}}',
    'A user trial has ended.',
    'Trial expired',
    '<p style="margin:0 0 16px;">A user trial has ended.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p>',
    'A user trial has ended.\n\nEmail: {{customer_email}}',
    null,
    null,
    true,
    '["customer_email"]'::jsonb,
    'en'
  ),
  (
    'customer_password_changed',
    'Password changed confirmation',
    'security',
    'customer',
    'Your Smart Pocket password was changed',
    'This is a confirmation for your security.',
    'Password changed',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">This is a confirmation that your Smart Pocket password was changed.</p><p style="margin:0;">If you did not make this change, please contact support immediately.</p>',
    'Hello {{customer_name}},\n\nThis is a confirmation that your Smart Pocket password was changed.\n\nIf you did not make this change, please contact support immediately.',
    'Contact support',
    'mailto:{{support_email}}',
    true,
    '["customer_name","support_email"]'::jsonb,
    'en'
  ),
  (
    'admin_contact_form_received',
    'Contact form received (admin notification)',
    'admin',
    'admin',
    'New contact request: {{contact_subject}}',
    'A new contact message was received.',
    'Contact form received',
    '<p style="margin:0 0 16px;">A new contact message was received.</p><p style="margin:0 0 6px;"><strong>Name:</strong> {{contact_name}}</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{contact_email}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{contact_subject}}</p><p style="margin:16px 0 0;">{{contact_message}}</p>',
    'A new contact message was received.\n\nName: {{contact_name}}\nEmail: {{contact_email}}\nSubject: {{contact_subject}}\n\n{{contact_message}}',
    null,
    null,
    true,
    '["contact_name","contact_email","contact_subject","contact_message"]'::jsonb,
    'en'
  )
ON CONFLICT (template_key, language_code) DO NOTHING;

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
    'customer_email_changed',
    'Email changed confirmation',
    'security',
    'customer',
    'Your Smart Pocket email address was changed',
    'This is a confirmation for your security.',
    'Email address changed',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">This is a confirmation that the email address on your Smart Pocket account was changed.</p><p style="margin:0;">If you did not make this change, please contact support immediately.</p>',
    'Hello {{customer_name}},\n\nThis is a confirmation that the email address on your Smart Pocket account was changed.\n\nIf you did not make this change, please contact support immediately.',
    'Contact support',
    'mailto:{{support_email}}',
    true,
    '["customer_name","support_email"]'::jsonb,
    'en'
  ),
  (
    'customer_social_login_connected',
    'Social login connected',
    'security',
    'customer',
    'A social sign-in method was connected to your account',
    'This is a security confirmation.',
    'Social sign-in connected',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">A new social sign-in method was connected to your Smart Pocket account: {{provider_name}}.</p><p style="margin:0;">If you did not expect this change, contact support.</p>',
    'Hello {{customer_name}},\n\nA new social sign-in method was connected to your Smart Pocket account: {{provider_name}}.\n\nIf you did not expect this change, contact support.',
    'Contact support',
    'mailto:{{support_email}}',
    true,
    '["customer_name","provider_name","support_email"]'::jsonb,
    'en'
  ),
  (
    'customer_trial_extended',
    'Trial extended',
    'trial',
    'customer',
    'Your Smart Pocket trial was extended',
    'Your trial end date has been updated.',
    'Trial extended',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial end date has been updated to {{trial_end_date}}.</p><p style="margin:0;">You can review billing at any time.</p>',
    'Hello {{customer_name}},\n\nYour trial end date has been updated to {{trial_end_date}}.\n\nYou can review billing at any time.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","trial_end_date","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_trial_converted',
    'Trial converted',
    'trial',
    'customer',
    'Your Smart Pocket trial was converted to {{plan_name}}',
    'Your subscription is now active.',
    'Subscription active',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial has been converted and your subscription is now active on {{plan_name}}.</p><p style="margin:0;">Thank you for choosing Smart Pocket.</p>',
    'Hello {{customer_name}},\n\nYour trial has been converted and your subscription is now active on {{plan_name}}.\n\nThank you for choosing Smart Pocket.',
    'Open dashboard',
    '{{dashboard_url}}',
    true,
    '["customer_name","plan_name","dashboard_url","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_package_purchased',
    'Package purchased',
    'billing',
    'customer',
    'Purchase confirmed: {{plan_name}}',
    'Your purchase was confirmed.',
    'Purchase confirmed',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">We confirmed your purchase of {{plan_name}} for {{amount}} {{currency}}.</p><p style="margin:0;">Reference: {{payment_reference}}</p>',
    'Hello {{customer_name}},\n\nWe confirmed your purchase of {{plan_name}} for {{amount}} {{currency}}.\nReference: {{payment_reference}}',
    'Open dashboard',
    '{{dashboard_url}}',
    true,
    '["customer_name","plan_name","amount","currency","payment_reference","dashboard_url","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_package_activated',
    'Package activated',
    'billing',
    'customer',
    '{{plan_name}} is now active',
    'Your subscription is active.',
    'Subscription active',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">{{plan_name}} is now active on your account.</p><p style="margin:0;">You can review your subscription details in billing.</p>',
    'Hello {{customer_name}},\n\n{{plan_name}} is now active on your account.\n\nYou can review your subscription details in billing.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","plan_name","billing_url","dashboard_url"]'::jsonb,
    'en'
  ),
  (
    'customer_subscription_renewed',
    'Subscription renewed',
    'billing',
    'customer',
    'Subscription renewed: {{plan_name}}',
    'Your subscription renewed successfully.',
    'Subscription renewed',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription for {{plan_name}} renewed successfully.</p><p style="margin:0;">Next renewal: {{renewal_date}}</p>',
    'Hello {{customer_name}},\n\nYour subscription for {{plan_name}} renewed successfully.\nNext renewal: {{renewal_date}}',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","plan_name","renewal_date","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_renewal_upcoming',
    'Renewal upcoming',
    'billing',
    'customer',
    'Upcoming renewal: {{plan_name}}',
    'Your subscription will renew soon.',
    'Renewal upcoming',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription for {{plan_name}} is scheduled to renew on {{renewal_date}}.</p><p style="margin:0;">You can review billing details at any time.</p>',
    'Hello {{customer_name}},\n\nYour subscription for {{plan_name}} is scheduled to renew on {{renewal_date}}.\n\nYou can review billing details at any time.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","plan_name","renewal_date","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_payment_failed',
    'Payment failed',
    'billing',
    'customer',
    'Payment failed for {{plan_name}}',
    'Action may be required to avoid interruption.',
    'Payment failed',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">We could not process a payment for {{plan_name}}.</p><p style="margin:0;">Please review your billing details to avoid service interruption.</p>',
    'Hello {{customer_name}},\n\nWe could not process a payment for {{plan_name}}.\n\nPlease review your billing details to avoid service interruption.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","plan_name","billing_url","support_email"]'::jsonb,
    'en'
  ),
  (
    'customer_subscription_cancelled',
    'Subscription cancelled',
    'billing',
    'customer',
    'Subscription cancelled',
    'Your subscription status was updated.',
    'Subscription cancelled',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription has been cancelled.</p><p style="margin:0;">You can review billing details or reactivate from your account.</p>',
    'Hello {{customer_name}},\n\nYour subscription has been cancelled.\n\nYou can review billing details or reactivate from your account.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_subscription_resumed',
    'Subscription resumed',
    'billing',
    'customer',
    'Subscription resumed',
    'Your subscription is active again.',
    'Subscription resumed',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription is active again.</p><p style="margin:0;">Thank you for continuing with Smart Pocket.</p>',
    'Hello {{customer_name}},\n\nYour subscription is active again.\n\nThank you for continuing with Smart Pocket.',
    'Open dashboard',
    '{{dashboard_url}}',
    true,
    '["customer_name","dashboard_url","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_subscription_expired',
    'Subscription expired',
    'billing',
    'customer',
    'Your subscription has expired',
    'Your subscription status was updated.',
    'Subscription expired',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription has expired.</p><p style="margin:0;">You can choose a plan in billing to continue.</p>',
    'Hello {{customer_name}},\n\nYour subscription has expired.\n\nYou can choose a plan in billing to continue.',
    'Review plans',
    '{{billing_url}}',
    true,
    '["customer_name","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_package_upgraded',
    'Package upgraded',
    'billing',
    'customer',
    'Your plan was upgraded to {{plan_name}}',
    'Your subscription was updated.',
    'Plan upgraded',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your plan was upgraded to {{plan_name}}.</p><p style="margin:0;">You can review billing details at any time.</p>',
    'Hello {{customer_name}},\n\nYour plan was upgraded to {{plan_name}}.\n\nYou can review billing details at any time.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","plan_name","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_package_downgraded',
    'Package downgraded',
    'billing',
    'customer',
    'Your plan was changed to {{plan_name}}',
    'Your subscription was updated.',
    'Plan updated',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your plan was changed to {{plan_name}}.</p><p style="margin:0;">You can review billing details at any time.</p>',
    'Hello {{customer_name}},\n\nYour plan was changed to {{plan_name}}.\n\nYou can review billing details at any time.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","plan_name","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_refund_processed',
    'Refund processed',
    'billing',
    'customer',
    'Refund processed',
    'Your refund was processed.',
    'Refund processed',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">A refund was processed for {{amount}} {{currency}}.</p><p style="margin:0;">Reference: {{payment_reference}}</p>',
    'Hello {{customer_name}},\n\nA refund was processed for {{amount}} {{currency}}.\nReference: {{payment_reference}}',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","amount","currency","payment_reference","billing_url"]'::jsonb,
    'en'
  ),
  (
    'customer_package_assigned_by_admin',
    'Package assigned by admin',
    'billing',
    'customer',
    'Your plan was updated by an administrator',
    'Your account plan was updated.',
    'Plan updated',
    '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">An administrator updated your plan to {{plan_name}}.</p><p style="margin:0;">You can review details in billing.</p>',
    'Hello {{customer_name}},\n\nAn administrator updated your plan to {{plan_name}}.\n\nYou can review details in billing.',
    'Open billing',
    '{{billing_url}}',
    true,
    '["customer_name","plan_name","billing_url"]'::jsonb,
    'en'
  ),
  (
    'admin_new_package_purchase',
    'New package purchase (admin notification)',
    'admin',
    'admin',
    'New purchase: {{customer_email}}',
    'A package purchase was recorded.',
    'New purchase',
    '<p style="margin:0 0 16px;">A purchase was recorded.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p><p style="margin:0 0 6px;"><strong>Amount:</strong> {{amount}} {{currency}}</p><p style="margin:0 0 6px;"><strong>Reference:</strong> {{payment_reference}}</p>',
    'A purchase was recorded.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}\nAmount: {{amount}} {{currency}}\nReference: {{payment_reference}}',
    'Open admin',
    '{{admin_url}}',
    true,
    '["customer_email","plan_name","amount","currency","payment_reference","admin_url"]'::jsonb,
    'en'
  ),
  (
    'admin_payment_successful',
    'Payment successful (admin notification)',
    'admin',
    'admin',
    'Payment successful: {{customer_email}}',
    'A payment was processed successfully.',
    'Payment successful',
    '<p style="margin:0 0 16px;">A payment was processed successfully.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Amount:</strong> {{amount}} {{currency}}</p><p style="margin:0 0 6px;"><strong>Reference:</strong> {{payment_reference}}</p>',
    'A payment was processed successfully.\n\nUser: {{customer_email}}\nAmount: {{amount}} {{currency}}\nReference: {{payment_reference}}',
    null,
    null,
    true,
    '["customer_email","amount","currency","payment_reference"]'::jsonb,
    'en'
  ),
  (
    'admin_payment_failed',
    'Payment failed (admin notification)',
    'admin',
    'admin',
    'Payment failed: {{customer_email}}',
    'A payment attempt failed.',
    'Payment failed',
    '<p style="margin:0 0 16px;">A payment attempt failed.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p><p style="margin:0;">Reference: {{payment_reference}}</p>',
    'A payment attempt failed.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}\nReference: {{payment_reference}}',
    null,
    null,
    true,
    '["customer_email","plan_name","payment_reference"]'::jsonb,
    'en'
  ),
  (
    'admin_subscription_cancelled',
    'Subscription cancelled (admin notification)',
    'admin',
    'admin',
    'Subscription cancelled: {{customer_email}}',
    'A subscription was cancelled.',
    'Subscription cancelled',
    '<p style="margin:0 0 16px;">A subscription was cancelled.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p>',
    'A subscription was cancelled.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}',
    null,
    null,
    true,
    '["customer_email","plan_name"]'::jsonb,
    'en'
  ),
  (
    'admin_subscription_upgraded',
    'Subscription upgraded (admin notification)',
    'admin',
    'admin',
    'Subscription upgraded: {{customer_email}}',
    'A subscription was upgraded.',
    'Subscription upgraded',
    '<p style="margin:0 0 16px;">A subscription was upgraded.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p>',
    'A subscription was upgraded.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}',
    null,
    null,
    true,
    '["customer_email","plan_name"]'::jsonb,
    'en'
  ),
  (
    'admin_subscription_downgraded',
    'Subscription downgraded (admin notification)',
    'admin',
    'admin',
    'Subscription downgraded: {{customer_email}}',
    'A subscription was downgraded.',
    'Subscription downgraded',
    '<p style="margin:0 0 16px;">A subscription was downgraded.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p>',
    'A subscription was downgraded.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}',
    null,
    null,
    true,
    '["customer_email","plan_name"]'::jsonb,
    'en'
  ),
  (
    'admin_refund_processed',
    'Refund processed (admin notification)',
    'admin',
    'admin',
    'Refund processed: {{customer_email}}',
    'A refund was processed.',
    'Refund processed',
    '<p style="margin:0 0 16px;">A refund was processed.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Amount:</strong> {{amount}} {{currency}}</p><p style="margin:0;">Reference: {{payment_reference}}</p>',
    'A refund was processed.\n\nUser: {{customer_email}}\nAmount: {{amount}} {{currency}}\nReference: {{payment_reference}}',
    null,
    null,
    true,
    '["customer_email","amount","currency","payment_reference"]'::jsonb,
    'en'
  ),
  (
    'admin_package_assigned_manually',
    'Package assigned manually (admin notification)',
    'admin',
    'admin',
    'Package assigned manually: {{customer_email}}',
    'A plan was assigned manually.',
    'Manual plan assignment',
    '<p style="margin:0 0 16px;">A plan was assigned manually.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p>',
    'A plan was assigned manually.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}',
    'Open admin',
    '{{admin_url}}',
    true,
    '["customer_email","plan_name","admin_url"]'::jsonb,
    'en'
  ),
  (
    'admin_email_delivery_failed',
    'Email delivery failed (admin notification)',
    'admin',
    'admin',
    'Email delivery failed: {{template_key}}',
    'An email failed to send.',
    'Email delivery failed',
    '<p style="margin:0 0 16px;">An email failed to send.</p><p style="margin:0 0 6px;"><strong>Template:</strong> {{template_key}}</p><p style="margin:0 0 6px;"><strong>Recipient:</strong> {{recipient_email}}</p><p style="margin:0;">Error: {{error_message}}</p>',
    'An email failed to send.\n\nTemplate: {{template_key}}\nRecipient: {{recipient_email}}\nError: {{error_message}}',
    null,
    null,
    true,
    '["template_key","recipient_email","error_message"]'::jsonb,
    'en'
  ),
  (
    'admin_payment_webhook_failed',
    'Payment webhook failed (admin notification)',
    'admin',
    'admin',
    'Payment webhook failed',
    'A billing webhook failed to process.',
    'Billing webhook failed',
    '<p style="margin:0 0 16px;">A billing webhook failed to process.</p><p style="margin:0;">Event: {{event_type}}</p>',
    'A billing webhook failed to process.\n\nEvent: {{event_type}}',
    null,
    null,
    true,
    '["event_type"]'::jsonb,
    'en'
  ),
  (
    'admin_system_provider_failure',
    'System provider failure (admin notification)',
    'admin',
    'admin',
    'System provider failure: {{provider_name}}',
    'A provider error was detected.',
    'Provider failure',
    '<p style="margin:0 0 16px;">A provider error was detected.</p><p style="margin:0 0 6px;"><strong>Provider:</strong> {{provider_name}}</p><p style="margin:0;">Error: {{error_message}}</p>',
    'A provider error was detected.\n\nProvider: {{provider_name}}\nError: {{error_message}}',
    null,
    null,
    true,
    '["provider_name","error_message"]'::jsonb,
    'en'
  )
ON CONFLICT (template_key, language_code) DO NOTHING;
