import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePlatformSettings, type PlatformSettingsSnapshot } from '@/lib/platform-settings';
import { sendSmtpEmailWithResult, type SmtpSendResult } from '@/lib/email/smtp';
import { buildTransactionalAppUrl, resolveTransactionalBaseUrl } from '@/lib/email/transactional-config';
import { renderTransactionalEmail } from './transactional-layout';

export type EmailRecipient = {
  email: string;
  name?: string | null;
};

export type TransactionalEmailAttachment = {
  filename: string;
  contentType: string;
  contentBase64: string;
};

export type TransactionalEmailSendResult = {
  success: boolean;
  providerMessageId: string | null;
  errorMessage: string | null;
  retryable: boolean;
  status: 'sent' | 'failed' | 'skipped';
};

type EmailTemplateRow = {
  template_key: string;
  name?: string | null;
  recipient_type: 'customer' | 'admin' | 'both' | string;
  subject: string;
  preheader: string | null;
  heading: string | null;
  html_body: string;
  text_body: string;
  button_text: string | null;
  button_url_template: string | null;
  enabled: boolean | null;
  language_code: string | null;
  supported_variables: unknown;
};

type EmailNotificationSettingsRow = {
  admin_notification_email: string | null;
  admin_cc: string | null;
  admin_bcc: string | null;
  sender_name: string | null;
  sender_email: string | null;
  reply_to_email: string | null;
  signature_name: string | null;
  signature_title: string | null;
  footer_disclaimer: string | null;
  event_enabled: Record<string, boolean> | null;
};

function normalizeEmail(value: string | null | undefined) {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

function pickFirstEmail(value: string | null | undefined) {
  if (!value) return null;
  const first = value.split(',')[0]?.trim() || '';
  return normalizeEmail(first);
}

function parseEmailList(value: string | null | undefined) {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter((item): item is string => Boolean(item));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeTemplateHtml(value: string) {
  const withoutScripts = value.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/<script\b[^>]*\/?>/gi, '');
  const withoutHandlers = withoutScripts.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  const withoutJavascriptUrls = withoutHandlers.replace(/href\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, 'href="#"');
  return withoutJavascriptUrls;
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

function classifySmtpFailure(errorMessage: string | null): Pick<TransactionalEmailSendResult, 'retryable'> {
  const msg = (errorMessage || '').toLowerCase();
  if (!msg) return { retryable: true };
  if (msg.includes('auth') || msg.includes('authentication') || msg.includes('invalid login')) {
    return { retryable: false };
  }
  if (msg.includes('smtp host') || msg.includes('smtp') || msg.includes('timeout') || msg.includes('connection')) {
    return { retryable: true };
  }
  return { retryable: true };
}

async function loadPlatformSettings(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data, error } = await admin.from('platform_settings').select('*').maybeSingle();
  if (error) throw error;
  return normalizePlatformSettings(data || {});
}

async function loadEmailSecrets(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data, error } = await admin.from('platform_email_secrets').select('smtp_password').maybeSingle();
  if (error) throw error;
  return { smtpPassword: (data as any)?.smtp_password as string | null | undefined };
}

async function loadNotificationSettings(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data, error } = await admin
    .from('email_notification_settings')
    .select('*')
    .eq('singleton_lock', true)
    .maybeSingle();
  if (error) throw error;
  return (data as EmailNotificationSettingsRow | null) ?? null;
}

async function loadTemplate(admin: NonNullable<ReturnType<typeof createAdminClient>>, templateKey: string) {
  const { data, error } = await admin
    .from('email_templates')
    .select('*')
    .eq('template_key', templateKey)
    .eq('language_code', 'en')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as EmailTemplateRow | null) ?? null;
}

async function insertDeliveryLog(args: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  eventKey: string;
  templateKey: string;
  recipient: EmailRecipient;
  userId?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  subject: string;
  status: 'queued' | 'skipped';
  metadata?: Record<string, unknown>;
}) {
  const { admin, ...payload } = args;
  const { data, error } = await admin
    .from('email_delivery_logs')
    .insert({
      event_key: payload.eventKey,
      template_key: payload.templateKey,
      recipient_email: payload.recipient.email,
      recipient_name: payload.recipient.name || null,
      user_id: payload.userId || null,
      subscription_id: payload.subscriptionId || null,
      payment_id: payload.paymentId || null,
      subject: payload.subject,
      status: payload.status,
      metadata: payload.metadata || {},
    })
    .select('id')
    .maybeSingle();

  if (error) {
    const code = (error as any)?.code;
    if (code === '23505') {
      return { inserted: false as const, id: null };
    }
    throw error;
  }

  return { inserted: true as const, id: (data as any)?.id as string };
}

async function updateDeliveryLog(args: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  id: string;
  status: 'sent' | 'failed' | 'skipped';
  providerMessageId?: string | null;
  errorMessage?: string | null;
  retryCount?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const { admin, id, ...payload } = args;
  const updates: Record<string, unknown> = {
    status: payload.status,
    provider_message_id: payload.providerMessageId ?? null,
    error_message: payload.errorMessage ?? null,
    sent_at: payload.status === 'sent' ? new Date().toISOString() : null,
  };
  if (typeof payload.retryCount === 'number') {
    updates.retry_count = payload.retryCount;
  }
  if (payload.metadata) {
    updates.metadata = payload.metadata;
  }
  const { error } = await admin.from('email_delivery_logs').update(updates).eq('id', id);
  if (error) throw error;
}

export function buildCommonVariables(settings: PlatformSettingsSnapshot) {
  return {
    dashboard_url: buildTransactionalAppUrl('/dashboard', settings),
    billing_url: buildTransactionalAppUrl('/settings/subscription', settings),
    onboarding_url: buildTransactionalAppUrl('/onboarding', settings),
    admin_url: buildTransactionalAppUrl('/admin/users', settings),
    support_email: settings.publicUi.contactEmail || settings.email.supportEmail || '',
    company_name: settings.branding.appName,
    company_address: settings.publicUi.contactAddress || '',
  };
}

function buildPlainTextEmail(args: {
  settings: PlatformSettingsSnapshot;
  heading: string;
  bodyText: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  supportEmail: string | null;
  signatureName: string;
  signatureTitle: string;
  companyAddress: string;
  disclaimer: string | null;
  copyrightText: string;
}) {
  const siteUrl = resolveTransactionalBaseUrl(args.settings);
  const lines: Array<string> = [];
  const push = (value: string | null | undefined) => {
    const next = (value || '').trim();
    if (next) lines.push(next);
  };

  push(args.heading);
  lines.push('');
  push(args.bodyText);

  if (args.ctaLabel && args.ctaUrl) {
    lines.push('');
    push(`${args.ctaLabel}: ${args.ctaUrl}`);
  }

  lines.push('');
  if ((args.supportEmail || args.settings.publicUi.contactEmail || '').trim()) {
    push(`For help, contact ${args.supportEmail || args.settings.publicUi.contactEmail || ''}.`);
  }

  lines.push('');
  push(args.signatureName);
  push(args.signatureTitle);
  push(args.settings.branding.appName);
  push(siteUrl);

  if (args.companyAddress.trim()) {
    lines.push('');
    push(args.companyAddress);
  }

  if ((args.disclaimer || '').trim()) {
    lines.push('');
    push(args.disclaimer || '');
  }

  lines.push('');
  push(args.copyrightText);

  return lines.join('\n');
}

export async function sendTransactionalEmail(input: {
  eventKey: string;
  templateKey: string;
  to: EmailRecipient;
  userId?: string | null;
  subscriptionId?: string | null;
  paymentId?: string | null;
  variables?: Record<string, string | number | null | undefined>;
  attachments?: TransactionalEmailAttachment[];
  isTest?: boolean;
  overrideTo?: EmailRecipient;
}) : Promise<TransactionalEmailSendResult> {
  const admin = createAdminClient();
  if (!admin) {
    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'service_role_missing',
      retryable: false,
      status: 'skipped',
    };
  }

  const recipientEmail = normalizeEmail(input.to.email);
  if (!recipientEmail) {
    const rawEmail = (input.to.email || '').trim();
    try {
      await insertDeliveryLog({
        admin,
        eventKey: input.eventKey,
        templateKey: input.templateKey,
        recipient: { email: rawEmail || 'invalid', name: input.to.name || null },
        userId: input.userId ?? null,
        subscriptionId: input.subscriptionId ?? null,
        paymentId: input.paymentId ?? null,
        subject: input.templateKey,
        status: 'skipped',
        metadata: { reason: 'invalid_recipient_email' },
      });
    } catch {
      // ignore
    }

    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'invalid_recipient_email',
      retryable: false,
      status: 'skipped',
    };
  }

  const [settings, secrets, notificationSettings, template] = await Promise.all([
    loadPlatformSettings(admin),
    loadEmailSecrets(admin),
    loadNotificationSettings(admin),
    loadTemplate(admin, input.templateKey),
  ]);

  const templateEnabled = Boolean(template?.enabled);
  const overrideEnabled = notificationSettings?.event_enabled?.[input.templateKey];
  const effectiveEnabled = typeof overrideEnabled === 'boolean' ? overrideEnabled : templateEnabled;

  const senderName = (notificationSettings?.sender_name || settings.email.fromName || settings.branding.appName).trim();
  const senderEmail = normalizeEmail(notificationSettings?.sender_email || settings.email.fromEmail) || null;
  const replyTo = pickFirstEmail(notificationSettings?.reply_to_email || settings.email.replyToEmail) || undefined;

  const adminTo = pickFirstEmail(notificationSettings?.admin_notification_email) || 'saaspersonalexp@gmail.com';
  const adminCc = parseEmailList(notificationSettings?.admin_cc);
  const adminBcc = parseEmailList(notificationSettings?.admin_bcc);

  if (!template || !effectiveEnabled) {
    const log = await insertDeliveryLog({
      admin,
      eventKey: input.eventKey,
      templateKey: input.templateKey,
      recipient: { email: recipientEmail, name: input.to.name || null },
      userId: input.userId ?? null,
      subscriptionId: input.subscriptionId ?? null,
      paymentId: input.paymentId ?? null,
      subject: template?.subject || input.templateKey,
      status: 'skipped',
      metadata: { reason: template ? 'disabled' : 'template_missing' },
    });

    return {
      success: Boolean(log.inserted),
      providerMessageId: null,
      errorMessage: template ? 'event_disabled' : 'template_missing',
      retryable: false,
      status: 'skipped',
    };
  }

  const isAdminRecipient = template.recipient_type === 'admin';
  const variables: Record<string, string> = {};
  const rawVars = input.variables || {};
  Object.entries(rawVars).forEach(([key, value]) => {
    variables[key] = value === null || value === undefined ? '' : String(value);
  });

  const common = buildCommonVariables(settings);
  Object.entries(common).forEach(([key, value]) => {
    if (!(key in variables)) {
      variables[key] = value;
    }
  });

  if (!('dashboard_url' in variables)) {
    variables.dashboard_url = common.dashboard_url;
  }

  const toSend: EmailRecipient = input.isTest
    ? {
        email: normalizeEmail(input.overrideTo?.email || input.to.email) || recipientEmail,
        name: input.overrideTo?.name || input.to.name || null,
      }
    : isAdminRecipient
      ? { email: adminTo, name: 'Admin' }
      : { email: recipientEmail, name: input.to.name || null };

  const subject = renderTokens(template.subject, variables);
  const preheader = renderTokens(template.preheader || '', variables);
  const heading = renderTokens(template.heading || '', variables) || template.name || template.template_key;
  const innerHtml = sanitizeTemplateHtml(renderTokensEscaped(template.html_body, variables));
  const innerText = renderTokens(template.text_body, variables);
  const ctaLabel = template.button_text ? renderTokens(template.button_text, variables) : null;
  const ctaUrl = template.button_url_template ? renderTokens(template.button_url_template, variables) : null;

  const supportEmail = settings.publicUi.contactEmail || settings.email.supportEmail || '';
  const signatureName = notificationSettings?.signature_name || 'Smart Pocket Team';
  const signatureTitle = notificationSettings?.signature_title || 'Customer Success';
  const companyAddress = settings.publicUi.contactAddress || '';
  const copyrightText =
    settings.publicUi.footerCopyright
    || `© ${settings.branding.appName}. All rights reserved.`;
  const disclaimer = notificationSettings?.footer_disclaimer || null;

  const html = renderTransactionalEmail({
    settings,
    notificationSettings: {
      supportEmail,
      companyAddress,
      signatureName,
      signatureTitle,
      disclaimer,
      copyrightText,
    },
    previewText: preheader || subject,
    heading,
    bodyHtml: innerHtml,
    ctaLabel: ctaLabel || undefined,
    ctaUrl: ctaUrl || undefined,
  });

  const text = buildPlainTextEmail({
    settings,
    heading,
    bodyText: innerText,
    ctaLabel,
    ctaUrl,
    supportEmail,
    signatureName,
    signatureTitle,
    companyAddress,
    disclaimer,
    copyrightText,
  });

  const log = await insertDeliveryLog({
    admin,
    eventKey: input.eventKey,
    templateKey: input.templateKey,
    recipient: toSend,
    userId: input.userId ?? null,
    subscriptionId: input.subscriptionId ?? null,
    paymentId: input.paymentId ?? null,
    subject,
    status: 'queued',
    metadata: {
      template_language: template.language_code || 'en',
      recipient_type: template.recipient_type,
      variables,
      is_test: Boolean(input.isTest),
    },
  });

  if (!log.inserted || !log.id) {
    return {
      success: true,
      providerMessageId: null,
      errorMessage: null,
      retryable: false,
      status: 'skipped',
    };
  }

  if (settings.email.provider !== 'smtp') {
    await updateDeliveryLog({
      admin,
      id: log.id,
      status: 'skipped',
      errorMessage: 'email_provider_not_smtp',
    });

    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'email_provider_not_smtp',
      retryable: false,
      status: 'skipped',
    };
  }

  if (!settings.email.smtpHost || !settings.email.smtpPort || !settings.email.smtpUser || !secrets.smtpPassword || !senderEmail) {
    await updateDeliveryLog({
      admin,
      id: log.id,
      status: 'failed',
      errorMessage: 'smtp_not_configured',
    });

    return {
      success: false,
      providerMessageId: null,
      errorMessage: 'smtp_not_configured',
      retryable: false,
      status: 'failed',
    };
  }

  let smtpResult: SmtpSendResult | null = null;

  try {
    smtpResult = await sendSmtpEmailWithResult({
      host: settings.email.smtpHost,
      port: Number(settings.email.smtpPort),
      username: settings.email.smtpUser,
      password: secrets.smtpPassword,
      from: `${senderName} <${senderEmail}>`,
      to: toSend.email,
      cc: input.isTest ? undefined : isAdminRecipient ? adminCc : undefined,
      bcc: input.isTest ? undefined : isAdminRecipient ? adminBcc : undefined,
      replyTo,
      subject,
      html,
      text,
      attachments: input.attachments,
    });

    await updateDeliveryLog({
      admin,
      id: log.id,
      status: 'sent',
      providerMessageId: smtpResult.messageId,
      errorMessage: null,
    });

    return {
      success: true,
      providerMessageId: smtpResult.messageId,
      errorMessage: null,
      retryable: false,
      status: 'sent',
    };
  } catch (error: any) {
    const errorMessage = error?.message ? String(error.message) : 'smtp_send_failed';
    const { retryable } = classifySmtpFailure(errorMessage);

    await updateDeliveryLog({
      admin,
      id: log.id,
      status: 'failed',
      providerMessageId: smtpResult?.messageId || null,
      errorMessage,
    });

    return {
      success: false,
      providerMessageId: smtpResult?.messageId || null,
      errorMessage,
      retryable,
      status: 'failed',
    };
  }
}

export async function queuePasswordChangedEmail(args: {
  userId: string;
  customerEmail: string;
  customerName: string;
}) {
  return sendTransactionalEmail({
    eventKey: `customer_password_changed:${args.userId}`,
    templateKey: 'customer_password_changed',
    to: { email: args.customerEmail, name: args.customerName },
    userId: args.userId,
    variables: {
      customer_name: args.customerName,
      customer_email: args.customerEmail,
    },
  });
}
