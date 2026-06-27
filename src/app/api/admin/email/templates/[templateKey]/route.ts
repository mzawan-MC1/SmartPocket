import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { requireEmailAdmin } from '@/lib/email/admin-auth';
import { normalizePlatformSettings } from '@/lib/platform-settings';
import { renderTransactionalEmail } from '@/lib/email/transactional-layout';
import { buildCommonVariables, sendTransactionalEmail } from '@/lib/email/transactional';
import { buildTransactionalAppUrl } from '@/lib/email/transactional-config';
import { PLATFORM_BILLING_CURRENCY_CODE } from '@/lib/subscription/billing-currency';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

type TemplateUpdatePayload = {
  name?: string;
  category?: string;
  recipient_type?: 'customer' | 'admin' | 'both';
  subject?: string;
  preheader?: string;
  heading?: string;
  html_body?: string;
  text_body?: string;
  button_text?: string;
  button_url_template?: string;
  enabled?: boolean;
  supported_variables?: unknown;
};

type TemplateActionPayload =
  | { action: 'send_test'; recipient: string }
  | { action: 'reset_default' };

type DefaultTemplateShape = {
  name: string;
  category: string;
  recipient_type: 'customer' | 'admin' | 'both';
  subject: string;
  preheader: string | null;
  heading: string | null;
  html_body: string;
  text_body: string;
  button_text: string | null;
  button_url_template: string | null;
  enabled: boolean;
  supported_variables: string[];
};

const DEFAULT_TEMPLATES: Record<string, DefaultTemplateShape> = {
  customer_welcome: {
    name: 'Welcome to Smart Pocket',
    category: 'account',
    recipient_type: 'customer',
    subject: 'Welcome to Smart Pocket, {{customer_name}}',
    preheader: 'Your Smart Pocket account is ready.',
    heading: 'Welcome to Smart Pocket',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Welcome to Smart Pocket. Your account is ready to use.</p><p style="margin:0;">You can start from your dashboard and complete onboarding to personalize your currency, region, and planning preferences.</p>',
    text_body: 'Hello {{customer_name}},\n\nWelcome to Smart Pocket. Your account is ready to use.\n\nStart from your dashboard and complete onboarding to personalize your settings.',
    button_text: 'Open dashboard',
    button_url_template: '{{dashboard_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'customer_email', 'dashboard_url', 'support_email', 'company_name', 'company_address'],
  },
  admin_new_user_registered: {
    name: 'New user registered (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'New user registered: {{customer_email}}',
    preheader: 'A new Smart Pocket user account was created.',
    heading: 'New user registered',
    html_body: '<p style="margin:0 0 16px;">A new user account was created.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Name:</strong> {{customer_name}}</p><p style="margin:0 0 6px;"><strong>Method:</strong> {{registration_method}}</p><p style="margin:0;">Open the admin portal to review the account.</p>',
    text_body: 'A new user account was created.\n\nEmail: {{customer_email}}\nName: {{customer_name}}\nMethod: {{registration_method}}\n\nOpen the admin portal to review the account.',
    button_text: 'Open admin',
    button_url_template: '{{admin_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'customer_email', 'registration_method', 'admin_url'],
  },
  customer_onboarding_completed: {
    name: 'Onboarding completed',
    category: 'onboarding',
    recipient_type: 'customer',
    subject: 'You are ready to use Smart Pocket',
    preheader: 'Your onboarding is complete.',
    heading: 'Onboarding complete',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your onboarding is complete. Your dashboard is now personalized based on your settings.</p><p style="margin:0;">You can update these preferences at any time in Settings.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour onboarding is complete. Your dashboard is now personalized based on your settings.\n\nYou can update these preferences at any time in Settings.',
    button_text: 'Open dashboard',
    button_url_template: '{{dashboard_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'dashboard_url', 'support_email'],
  },
  admin_user_onboarding_completed: {
    name: 'User onboarding completed (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'User onboarding completed: {{customer_email}}',
    preheader: 'A user completed onboarding.',
    heading: 'User onboarding completed',
    html_body: '<p style="margin:0 0 16px;">A user has completed onboarding.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Name:</strong> {{customer_name}}</p><p style="margin:0;">Open the admin portal for details.</p>',
    text_body: 'A user has completed onboarding.\n\nEmail: {{customer_email}}\nName: {{customer_name}}\n\nOpen the admin portal for details.',
    button_text: 'Open admin',
    button_url_template: '{{admin_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'customer_email', 'admin_url'],
  },
  customer_onboarding_incomplete: {
    name: 'Onboarding reminder',
    category: 'onboarding',
    recipient_type: 'customer',
    subject: 'Complete your Smart Pocket setup',
    preheader: 'Finish onboarding to personalize your dashboard.',
    heading: 'Complete your setup',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">A few onboarding steps are still incomplete. Completing setup helps Smart Pocket personalize your currency, region, and planning preferences.</p><p style="margin:0;">You can finish onboarding in a few minutes.</p>',
    text_body: 'Hello {{customer_name}},\n\nA few onboarding steps are still incomplete. Completing setup helps Smart Pocket personalize your settings.\n\nYou can finish onboarding in a few minutes.',
    button_text: 'Continue onboarding',
    button_url_template: '{{onboarding_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'onboarding_url', 'support_email'],
  },
  admin_user_onboarding_incomplete: {
    name: 'User onboarding incomplete (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'User onboarding incomplete: {{customer_email}}',
    preheader: 'A user has not completed onboarding yet.',
    heading: 'User onboarding incomplete',
    html_body: '<p style="margin:0 0 16px;">A user account has not completed onboarding.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Name:</strong> {{customer_name}}</p>',
    text_body: 'A user account has not completed onboarding.\n\nEmail: {{customer_email}}\nName: {{customer_name}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['customer_name', 'customer_email'],
  },
  customer_trial_started: {
    name: 'Trial started',
    category: 'trial',
    recipient_type: 'customer',
    subject: 'Your Smart Pocket trial has started',
    preheader: 'Your trial is now active.',
    heading: 'Trial started',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial is now active and will run until {{trial_end_date}}.</p><p style="margin:0;">You can review your plan and billing settings at any time.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour trial is now active and will run until {{trial_end_date}}.\n\nYou can review your plan and billing settings at any time.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'trial_end_date', 'billing_url', 'dashboard_url', 'trial_start_date'],
  },
  admin_trial_started: {
    name: 'Trial started (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Trial started: {{customer_email}}',
    preheader: 'A trial has started.',
    heading: 'Trial started',
    html_body: '<p style="margin:0 0 16px;">A user trial has started.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Trial end:</strong> {{trial_end_date}}</p>',
    text_body: 'A user trial has started.\n\nEmail: {{customer_email}}\nTrial end: {{trial_end_date}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['customer_email', 'trial_end_date', 'trial_start_date'],
  },
  admin_trial_expiring: {
    name: 'Trial expiring (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Trial expiring: {{customer_email}} ({{days_remaining}} days)',
    preheader: 'A user trial is approaching its end date.',
    heading: 'Trial expiring',
    html_body: '<p style="margin:0 0 16px;">A user trial is approaching its end date.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Trial end:</strong> {{trial_end_date}}</p><p style="margin:0;"><strong>Days remaining:</strong> {{days_remaining}}</p>',
    text_body: 'A user trial is approaching its end date.\n\nEmail: {{customer_email}}\nTrial end: {{trial_end_date}}\nDays remaining: {{days_remaining}}',
    button_text: 'Open admin',
    button_url_template: '{{admin_url}}',
    enabled: true,
    supported_variables: ['customer_email', 'customer_name', 'trial_end_date', 'days_remaining', 'admin_url'],
  },
  customer_trial_expiring_7_days: {
    name: 'Trial expiring (7 days)',
    category: 'trial',
    recipient_type: 'customer',
    subject: 'Your Smart Pocket trial ends in 7 days',
    preheader: 'Review your plan before your trial ends.',
    heading: 'Trial ends soon',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial ends on {{trial_end_date}}. If you would like to continue without interruption, you can choose a plan at any time.</p><p style="margin:0;">Your dashboard and data remain available during the trial.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour trial ends on {{trial_end_date}}. If you would like to continue without interruption, you can choose a plan at any time.',
    button_text: 'Review plans',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'trial_end_date', 'billing_url'],
  },
  customer_trial_expiring_3_days: {
    name: 'Trial expiring (3 days)',
    category: 'trial',
    recipient_type: 'customer',
    subject: 'Your Smart Pocket trial ends in 3 days',
    preheader: 'Choose a plan to continue your subscription.',
    heading: 'Trial ends soon',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial ends on {{trial_end_date}}. To continue using Smart Pocket without interruption, select a plan from your billing settings.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour trial ends on {{trial_end_date}}. To continue using Smart Pocket without interruption, select a plan from your billing settings.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'trial_end_date', 'billing_url'],
  },
  customer_trial_expiring_1_day: {
    name: 'Trial expiring (1 day)',
    category: 'trial',
    recipient_type: 'customer',
    subject: 'Your Smart Pocket trial ends tomorrow',
    preheader: 'Your trial ends soon.',
    heading: 'Trial ends tomorrow',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial ends on {{trial_end_date}}. If you would like to continue, choose a plan in billing.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour trial ends on {{trial_end_date}}. If you would like to continue, choose a plan in billing.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'trial_end_date', 'billing_url'],
  },
  customer_trial_expired: {
    name: 'Trial expired',
    category: 'trial',
    recipient_type: 'customer',
    subject: 'Your Smart Pocket trial has ended',
    preheader: 'Your trial period has ended.',
    heading: 'Trial ended',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial has ended. You can choose a plan in billing to continue.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour trial has ended. You can choose a plan in billing to continue.',
    button_text: 'Review plans',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'billing_url'],
  },
  admin_trial_expired: {
    name: 'Trial expired (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Trial expired: {{customer_email}}',
    preheader: 'A user trial has ended.',
    heading: 'Trial expired',
    html_body: '<p style="margin:0 0 16px;">A user trial has ended.</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{customer_email}}</p>',
    text_body: 'A user trial has ended.\n\nEmail: {{customer_email}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['customer_email'],
  },
  customer_password_changed: {
    name: 'Password changed confirmation',
    category: 'security',
    recipient_type: 'customer',
    subject: 'Your Smart Pocket password was changed',
    preheader: 'This is a confirmation for your security.',
    heading: 'Password changed',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">This is a confirmation that your Smart Pocket password was changed.</p><p style="margin:0;">If you did not make this change, please contact support immediately.</p>',
    text_body: 'Hello {{customer_name}},\n\nThis is a confirmation that your Smart Pocket password was changed.\n\nIf you did not make this change, please contact support immediately.',
    button_text: 'Contact support',
    button_url_template: 'mailto:{{support_email}}',
    enabled: false,
    supported_variables: ['customer_name', 'support_email'],
  },
  admin_contact_form_received: {
    name: 'Contact form received (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'New contact request: {{contact_subject}}',
    preheader: 'A new contact message was received.',
    heading: 'Contact form received',
    html_body: '<p style="margin:0 0 16px;">A new contact message was received.</p><p style="margin:0 0 6px;"><strong>Name:</strong> {{contact_name}}</p><p style="margin:0 0 6px;"><strong>Email:</strong> {{contact_email}}</p><p style="margin:0 0 6px;"><strong>Subject:</strong> {{contact_subject}}</p><p style="margin:16px 0 0;">{{contact_message}}</p>',
    text_body: 'A new contact message was received.\n\nName: {{contact_name}}\nEmail: {{contact_email}}\nSubject: {{contact_subject}}\n\n{{contact_message}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['contact_name', 'contact_email', 'contact_subject', 'contact_message'],
  },
  customer_email_changed: {
    name: 'Email changed confirmation',
    category: 'security',
    recipient_type: 'customer',
    subject: 'Your Smart Pocket email address was changed',
    preheader: 'This is a confirmation for your security.',
    heading: 'Email address changed',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">This is a confirmation that the email address on your Smart Pocket account was changed.</p><p style="margin:0;">If you did not make this change, please contact support immediately.</p>',
    text_body: 'Hello {{customer_name}},\n\nThis is a confirmation that the email address on your Smart Pocket account was changed.\n\nIf you did not make this change, please contact support immediately.',
    button_text: 'Contact support',
    button_url_template: 'mailto:{{support_email}}',
    enabled: false,
    supported_variables: ['customer_name', 'support_email'],
  },
  customer_social_login_connected: {
    name: 'Social login connected',
    category: 'security',
    recipient_type: 'customer',
    subject: 'A social sign-in method was connected to your account',
    preheader: 'This is a security confirmation.',
    heading: 'Social sign-in connected',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">A new social sign-in method was connected to your Smart Pocket account: {{provider_name}}.</p><p style="margin:0;">If you did not expect this change, contact support.</p>',
    text_body: 'Hello {{customer_name}},\n\nA new social sign-in method was connected to your Smart Pocket account: {{provider_name}}.\n\nIf you did not expect this change, contact support.',
    button_text: 'Contact support',
    button_url_template: 'mailto:{{support_email}}',
    enabled: false,
    supported_variables: ['customer_name', 'provider_name', 'support_email'],
  },
  customer_trial_extended: {
    name: 'Trial extended',
    category: 'trial',
    recipient_type: 'customer',
    subject: 'Your Smart Pocket trial was extended',
    preheader: 'Your trial end date has been updated.',
    heading: 'Trial extended',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial end date has been updated to {{trial_end_date}}.</p><p style="margin:0;">You can review billing at any time.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour trial end date has been updated to {{trial_end_date}}.\n\nYou can review billing at any time.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'trial_end_date', 'billing_url'],
  },
  customer_trial_converted: {
    name: 'Trial converted',
    category: 'trial',
    recipient_type: 'customer',
    subject: 'Your Smart Pocket trial was converted to {{plan_name}}',
    preheader: 'Your subscription is now active.',
    heading: 'Subscription active',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your trial has been converted and your subscription is now active on {{plan_name}}.</p><p style="margin:0;">Thank you for choosing Smart Pocket.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour trial has been converted and your subscription is now active on {{plan_name}}.\n\nThank you for choosing Smart Pocket.',
    button_text: 'Open dashboard',
    button_url_template: '{{dashboard_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'plan_name', 'dashboard_url', 'billing_url'],
  },
  customer_package_purchased: {
    name: 'Package purchased',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Purchase confirmed: {{plan_name}}',
    preheader: 'Your purchase was confirmed.',
    heading: 'Purchase confirmed',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">We confirmed your purchase of {{plan_name}} for {{amount}} {{currency}}.</p><p style="margin:0;">Reference: {{payment_reference}}</p>',
    text_body: 'Hello {{customer_name}},\n\nWe confirmed your purchase of {{plan_name}} for {{amount}} {{currency}}.\nReference: {{payment_reference}}',
    button_text: 'Open dashboard',
    button_url_template: '{{dashboard_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'plan_name', 'amount', 'currency', 'payment_reference', 'dashboard_url', 'billing_url'],
  },
  customer_package_activated: {
    name: 'Package activated',
    category: 'billing',
    recipient_type: 'customer',
    subject: '{{plan_name}} is now active',
    preheader: 'Your subscription is active.',
    heading: 'Subscription active',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">{{plan_name}} is now active on your account.</p><p style="margin:0;">You can review your subscription details in billing.</p>',
    text_body: 'Hello {{customer_name}},\n\n{{plan_name}} is now active on your account.\n\nYou can review your subscription details in billing.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'plan_name', 'billing_url', 'dashboard_url'],
  },
  customer_subscription_renewed: {
    name: 'Subscription renewed',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Subscription renewed: {{plan_name}}',
    preheader: 'Your subscription renewed successfully.',
    heading: 'Subscription renewed',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription for {{plan_name}} renewed successfully.</p><p style="margin:0;">Next renewal: {{renewal_date}}</p>',
    text_body: 'Hello {{customer_name}},\n\nYour subscription for {{plan_name}} renewed successfully.\nNext renewal: {{renewal_date}}',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'plan_name', 'renewal_date', 'billing_url'],
  },
  customer_renewal_upcoming: {
    name: 'Renewal upcoming',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Upcoming renewal: {{plan_name}}',
    preheader: 'Your subscription will renew soon.',
    heading: 'Renewal upcoming',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription for {{plan_name}} is scheduled to renew on {{renewal_date}}.</p><p style="margin:0;">You can review billing details at any time.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour subscription for {{plan_name}} is scheduled to renew on {{renewal_date}}.\n\nYou can review billing details at any time.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'plan_name', 'renewal_date', 'billing_url'],
  },
  customer_payment_failed: {
    name: 'Payment failed',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Payment failed for {{plan_name}}',
    preheader: 'Action may be required to avoid interruption.',
    heading: 'Payment failed',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">We could not process a payment for {{plan_name}}.</p><p style="margin:0;">Please review your billing details to avoid service interruption.</p>',
    text_body: 'Hello {{customer_name}},\n\nWe could not process a payment for {{plan_name}}.\n\nPlease review your billing details to avoid service interruption.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'plan_name', 'billing_url', 'support_email'],
  },
  customer_subscription_cancelled: {
    name: 'Subscription cancelled',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Subscription cancelled',
    preheader: 'Your subscription status was updated.',
    heading: 'Subscription cancelled',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription has been cancelled.</p><p style="margin:0;">You can review billing details or reactivate from your account.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour subscription has been cancelled.\n\nYou can review billing details or reactivate from your account.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'billing_url'],
  },
  customer_subscription_resumed: {
    name: 'Subscription resumed',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Subscription resumed',
    preheader: 'Your subscription is active again.',
    heading: 'Subscription resumed',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription is active again.</p><p style="margin:0;">Thank you for continuing with Smart Pocket.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour subscription is active again.\n\nThank you for continuing with Smart Pocket.',
    button_text: 'Open dashboard',
    button_url_template: '{{dashboard_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'dashboard_url', 'billing_url'],
  },
  customer_subscription_expired: {
    name: 'Subscription expired',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Your subscription has expired',
    preheader: 'Your subscription status was updated.',
    heading: 'Subscription expired',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your subscription has expired.</p><p style="margin:0;">You can choose a plan in billing to continue.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour subscription has expired.\n\nYou can choose a plan in billing to continue.',
    button_text: 'Review plans',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'billing_url'],
  },
  customer_package_upgraded: {
    name: 'Package upgraded',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Your plan was upgraded to {{plan_name}}',
    preheader: 'Your subscription was updated.',
    heading: 'Plan upgraded',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your plan was upgraded to {{plan_name}}.</p><p style="margin:0;">You can review billing details at any time.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour plan was upgraded to {{plan_name}}.\n\nYou can review billing details at any time.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'plan_name', 'billing_url'],
  },
  customer_package_downgraded: {
    name: 'Package downgraded',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Your plan was changed to {{plan_name}}',
    preheader: 'Your subscription was updated.',
    heading: 'Plan updated',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">Your plan was changed to {{plan_name}}.</p><p style="margin:0;">You can review billing details at any time.</p>',
    text_body: 'Hello {{customer_name}},\n\nYour plan was changed to {{plan_name}}.\n\nYou can review billing details at any time.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'plan_name', 'billing_url'],
  },
  customer_refund_processed: {
    name: 'Refund processed',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Refund processed',
    preheader: 'Your refund was processed.',
    heading: 'Refund processed',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">A refund was processed for {{amount}} {{currency}}.</p><p style="margin:0;">Reference: {{payment_reference}}</p>',
    text_body: 'Hello {{customer_name}},\n\nA refund was processed for {{amount}} {{currency}}.\nReference: {{payment_reference}}',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'amount', 'currency', 'payment_reference', 'billing_url'],
  },
  customer_package_assigned_by_admin: {
    name: 'Package assigned by admin',
    category: 'billing',
    recipient_type: 'customer',
    subject: 'Your plan was updated by an administrator',
    preheader: 'Your account plan was updated.',
    heading: 'Plan updated',
    html_body: '<p style="margin:0 0 16px;">Hello {{customer_name}},</p><p style="margin:0 0 16px;">An administrator updated your plan to {{plan_name}}.</p><p style="margin:0;">You can review details in billing.</p>',
    text_body: 'Hello {{customer_name}},\n\nAn administrator updated your plan to {{plan_name}}.\n\nYou can review details in billing.',
    button_text: 'Open billing',
    button_url_template: '{{billing_url}}',
    enabled: true,
    supported_variables: ['customer_name', 'plan_name', 'billing_url'],
  },
  admin_new_package_purchase: {
    name: 'New package purchase (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'New purchase: {{customer_email}}',
    preheader: 'A package purchase was recorded.',
    heading: 'New purchase',
    html_body: '<p style="margin:0 0 16px;">A purchase was recorded.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p><p style="margin:0 0 6px;"><strong>Amount:</strong> {{amount}} {{currency}}</p><p style="margin:0 0 6px;"><strong>Reference:</strong> {{payment_reference}}</p>',
    text_body: 'A purchase was recorded.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}\nAmount: {{amount}} {{currency}}\nReference: {{payment_reference}}',
    button_text: 'Open admin',
    button_url_template: '{{admin_url}}',
    enabled: true,
    supported_variables: ['customer_email', 'plan_name', 'amount', 'currency', 'payment_reference', 'admin_url'],
  },
  admin_payment_successful: {
    name: 'Payment successful (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Payment successful: {{customer_email}}',
    preheader: 'A payment was processed successfully.',
    heading: 'Payment successful',
    html_body: '<p style="margin:0 0 16px;">A payment was processed successfully.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Amount:</strong> {{amount}} {{currency}}</p><p style="margin:0 0 6px;"><strong>Reference:</strong> {{payment_reference}}</p>',
    text_body: 'A payment was processed successfully.\n\nUser: {{customer_email}}\nAmount: {{amount}} {{currency}}\nReference: {{payment_reference}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['customer_email', 'amount', 'currency', 'payment_reference'],
  },
  admin_payment_failed: {
    name: 'Payment failed (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Payment failed: {{customer_email}}',
    preheader: 'A payment attempt failed.',
    heading: 'Payment failed',
    html_body: '<p style="margin:0 0 16px;">A payment attempt failed.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p><p style="margin:0;">Reference: {{payment_reference}}</p>',
    text_body: 'A payment attempt failed.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}\nReference: {{payment_reference}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['customer_email', 'plan_name', 'payment_reference'],
  },
  admin_subscription_cancelled: {
    name: 'Subscription cancelled (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Subscription cancelled: {{customer_email}}',
    preheader: 'A subscription was cancelled.',
    heading: 'Subscription cancelled',
    html_body: '<p style="margin:0 0 16px;">A subscription was cancelled.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p>',
    text_body: 'A subscription was cancelled.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['customer_email', 'plan_name'],
  },
  admin_subscription_upgraded: {
    name: 'Subscription upgraded (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Subscription upgraded: {{customer_email}}',
    preheader: 'A subscription was upgraded.',
    heading: 'Subscription upgraded',
    html_body: '<p style="margin:0 0 16px;">A subscription was upgraded.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p>',
    text_body: 'A subscription was upgraded.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['customer_email', 'plan_name'],
  },
  admin_subscription_downgraded: {
    name: 'Subscription downgraded (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Subscription downgraded: {{customer_email}}',
    preheader: 'A subscription was downgraded.',
    heading: 'Subscription downgraded',
    html_body: '<p style="margin:0 0 16px;">A subscription was downgraded.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p>',
    text_body: 'A subscription was downgraded.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['customer_email', 'plan_name'],
  },
  admin_refund_processed: {
    name: 'Refund processed (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Refund processed: {{customer_email}}',
    preheader: 'A refund was processed.',
    heading: 'Refund processed',
    html_body: '<p style="margin:0 0 16px;">A refund was processed.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Amount:</strong> {{amount}} {{currency}}</p><p style="margin:0;">Reference: {{payment_reference}}</p>',
    text_body: 'A refund was processed.\n\nUser: {{customer_email}}\nAmount: {{amount}} {{currency}}\nReference: {{payment_reference}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['customer_email', 'amount', 'currency', 'payment_reference'],
  },
  admin_package_assigned_manually: {
    name: 'Package assigned manually (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Package assigned manually: {{customer_email}}',
    preheader: 'A plan was assigned manually.',
    heading: 'Manual plan assignment',
    html_body: '<p style="margin:0 0 16px;">A plan was assigned manually.</p><p style="margin:0 0 6px;"><strong>User:</strong> {{customer_email}}</p><p style="margin:0 0 6px;"><strong>Plan:</strong> {{plan_name}}</p>',
    text_body: 'A plan was assigned manually.\n\nUser: {{customer_email}}\nPlan: {{plan_name}}',
    button_text: 'Open admin',
    button_url_template: '{{admin_url}}',
    enabled: true,
    supported_variables: ['customer_email', 'plan_name', 'admin_url'],
  },
  admin_email_delivery_failed: {
    name: 'Email delivery failed (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Email delivery failed: {{template_key}}',
    preheader: 'An email failed to send.',
    heading: 'Email delivery failed',
    html_body: '<p style="margin:0 0 16px;">An email failed to send.</p><p style="margin:0 0 6px;"><strong>Template:</strong> {{template_key}}</p><p style="margin:0 0 6px;"><strong>Recipient:</strong> {{recipient_email}}</p><p style="margin:0;">Error: {{error_message}}</p>',
    text_body: 'An email failed to send.\n\nTemplate: {{template_key}}\nRecipient: {{recipient_email}}\nError: {{error_message}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['template_key', 'recipient_email', 'error_message'],
  },
  admin_payment_webhook_failed: {
    name: 'Payment webhook failed (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'Payment webhook failed',
    preheader: 'A billing webhook failed to process.',
    heading: 'Billing webhook failed',
    html_body: '<p style="margin:0 0 16px;">A billing webhook failed to process.</p><p style="margin:0;">Event: {{event_type}}</p>',
    text_body: 'A billing webhook failed to process.\n\nEvent: {{event_type}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['event_type'],
  },
  admin_system_provider_failure: {
    name: 'System provider failure (admin notification)',
    category: 'admin',
    recipient_type: 'admin',
    subject: 'System provider failure: {{provider_name}}',
    preheader: 'A provider error was detected.',
    heading: 'Provider failure',
    html_body: '<p style="margin:0 0 16px;">A provider error was detected.</p><p style="margin:0 0 6px;"><strong>Provider:</strong> {{provider_name}}</p><p style="margin:0;">Error: {{error_message}}</p>',
    text_body: 'A provider error was detected.\n\nProvider: {{provider_name}}\nError: {{error_message}}',
    button_text: null,
    button_url_template: null,
    enabled: true,
    supported_variables: ['provider_name', 'error_message'],
  },
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTokens(value: string, vars: Record<string, string>) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (!(key in vars)) return '';
    return vars[key] ?? '';
  });
}

function renderTokensEscaped(value: string, vars: Record<string, string>) {
  return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key: string) => {
    if (!(key in vars)) return '';
    return escapeHtml(vars[key] ?? '');
  });
}

function sanitizeTemplateHtml(value: string) {
  const withoutScripts = value.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/?>/gi, '');
  const withoutHandlers = withoutScripts.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  const withoutJavascriptUrls = withoutHandlers.replace(/href\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, 'href="#"');
  return withoutJavascriptUrls;
}

function buildSampleVars(
  templateKey: string,
  settings: ReturnType<typeof normalizePlatformSettings>
) {
  const now = new Date();
  const trialEnd = new Date(Date.now() + 7 * 86400000);
  const renewal = new Date(Date.now() + 30 * 86400000);
  const commonVars = buildCommonVariables(settings);
  const vars: Record<string, string> = {
    customer_name: 'Alex Morgan',
    customer_email: 'alex@example.com',
    plan_name: 'Personal',
    amount: '99',
    currency: PLATFORM_BILLING_CURRENCY_CODE,
    trial_start_date: now.toISOString().slice(0, 10),
    trial_end_date: trialEnd.toISOString().slice(0, 10),
    subscription_start_date: now.toISOString().slice(0, 10),
    subscription_end_date: renewal.toISOString().slice(0, 10),
    renewal_date: renewal.toISOString().slice(0, 10),
    invoice_number: 'INV-10001',
    payment_reference: templateKey.includes('webhook') ? 'evt_123' : 'pay_123',
    dashboard_url: commonVars.dashboard_url,
    billing_url: commonVars.billing_url,
    onboarding_url: commonVars.onboarding_url,
    admin_url: commonVars.admin_url,
    support_email: commonVars.support_email,
    company_name: commonVars.company_name,
    company_address: commonVars.company_address,
    website_url: buildTransactionalAppUrl('/', settings),
    provider_name: 'Google',
    registration_method: 'google',
    contact_name: 'Jordan Lee',
    contact_email: 'jordan@example.com',
    contact_subject: 'Question about Smart Pocket',
    contact_message: 'Hello Smart Pocket team,\n\nI have a question about my account.\n\nThank you.',
    template_key: templateKey,
    recipient_email: 'alex@example.com',
    error_message: 'SMTP timeout',
    event_type: 'example_event',
    days_remaining: '3',
  };

  return vars;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ templateKey: string }> }
) {
  const auth = await requireEmailAdmin();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const { templateKey } = await params;
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode');

  const { data, error } = await admin
    .from('email_templates')
    .select('*')
    .eq('template_key', templateKey)
    .eq('language_code', 'en')
    .maybeSingle();

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load template.' }, { status: 500 }),
      cookieMutations
    );
  }

  if (mode === 'preview' && data) {
    const [{ data: settingsRow }, { data: notifRow }] = await Promise.all([
      admin.from('platform_settings').select('*').maybeSingle(),
      admin.from('email_notification_settings').select('*').eq('singleton_lock', true).maybeSingle(),
    ]);

    const settings = normalizePlatformSettings(settingsRow || {});
    const vars = buildSampleVars(templateKey, settings);

    const subject = renderTokens(((data as any).subject as string) || templateKey, vars);
    const preheader = renderTokens(((data as any).preheader as string) || '', vars);
    const heading = renderTokens(((data as any).heading as string) || '', vars) || ((data as any).name as string) || templateKey;
    const innerHtml = sanitizeTemplateHtml(renderTokensEscaped(((data as any).html_body as string) || '', vars));
    const innerText = renderTokens(((data as any).text_body as string) || '', vars);
    const ctaLabel = (data as any).button_text ? renderTokens((data as any).button_text as string, vars) : null;
    const ctaUrl = (data as any).button_url_template ? renderTokens((data as any).button_url_template as string, vars) : null;

    const html = renderTransactionalEmail({
      settings,
      notificationSettings: {
        supportEmail: vars.support_email,
        companyAddress: settings.publicUi.contactAddress || '',
        signatureName: (notifRow as any)?.signature_name || 'Smart Pocket Team',
        signatureTitle: (notifRow as any)?.signature_title || 'Customer Success',
        disclaimer: (notifRow as any)?.footer_disclaimer || null,
        copyrightText: settings.publicUi.footerCopyright || null,
      },
      previewText: preheader || subject,
      heading,
      bodyHtml: innerHtml,
      ctaLabel: ctaLabel || undefined,
      ctaUrl: ctaUrl || undefined,
    });

    return applySupabaseCookies(
      NextResponse.json(
        {
          preview: {
            subject,
            html,
            text: innerText,
            variables: vars,
          },
        },
        { status: 200 }
      ),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ template: data || null }, { status: 200 }),
    cookieMutations
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ templateKey: string }> }
) {
  const auth = await requireEmailAdmin();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const { templateKey } = await params;
  const body = (await request.json().catch(() => ({}))) as TemplateUpdatePayload;

  const updates: Record<string, unknown> = {};
  const copyString = (key: keyof TemplateUpdatePayload, column: string) => {
    const value = body[key];
    if (typeof value === 'string') {
      updates[column] = value;
    }
  };

  copyString('name', 'name');
  copyString('category', 'category');
  copyString('recipient_type', 'recipient_type');
  copyString('subject', 'subject');
  copyString('preheader', 'preheader');
  copyString('heading', 'heading');
  copyString('html_body', 'html_body');
  copyString('text_body', 'text_body');
  copyString('button_text', 'button_text');
  copyString('button_url_template', 'button_url_template');

  if (typeof body.enabled === 'boolean') {
    updates.enabled = body.enabled;
  }

  if (body.supported_variables !== undefined) {
    updates.supported_variables = body.supported_variables;
  }

  const { error } = await admin
    .from('email_templates')
    .update(updates)
    .eq('template_key', templateKey)
    .eq('language_code', 'en');

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to save template.' }, { status: 500 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ success: true }, { status: 200 }),
    cookieMutations
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ templateKey: string }> }
) {
  const auth = await requireEmailAdmin();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const { templateKey } = await params;
  const body = (await request.json().catch(() => ({}))) as Partial<TemplateActionPayload>;

  if ((body as any)?.action === 'send_test') {
    const recipient = String((body as any)?.recipient || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Invalid recipient email.' }, { status: 400 }),
        cookieMutations
      );
    }

    const { data: settingsRow } = await admin.from('platform_settings').select('*').maybeSingle();
    const settings = normalizePlatformSettings(settingsRow || {});
    const vars = buildSampleVars(templateKey, settings);
    const result = await sendTransactionalEmail({
      eventKey: `template_test:${templateKey}:${crypto.randomUUID()}`,
      templateKey,
      to: { email: recipient, name: 'Test recipient' },
      isTest: true,
      overrideTo: { email: recipient, name: 'Test recipient' },
      variables: vars,
    });

    return applySupabaseCookies(
      NextResponse.json({ success: true, result }, { status: 200 }),
      cookieMutations
    );
  }

  if ((body as any)?.action === 'reset_default') {
    const defaults = DEFAULT_TEMPLATES[templateKey];
    if (!defaults) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'No default is available for this template key.' }, { status: 400 }),
        cookieMutations
      );
    }

    const { error } = await admin
      .from('email_templates')
      .update({
        name: defaults.name,
        category: defaults.category,
        recipient_type: defaults.recipient_type,
        subject: defaults.subject,
        preheader: defaults.preheader,
        heading: defaults.heading,
        html_body: defaults.html_body,
        text_body: defaults.text_body,
        button_text: defaults.button_text,
        button_url_template: defaults.button_url_template,
        enabled: defaults.enabled,
        supported_variables: defaults.supported_variables,
      })
      .eq('template_key', templateKey)
      .eq('language_code', 'en');

    if (error) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Failed to reset template.' }, { status: 500 }),
        cookieMutations
      );
    }

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ error: 'Invalid action.' }, { status: 400 }),
    cookieMutations
  );
}
