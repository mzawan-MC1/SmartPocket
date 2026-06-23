import 'server-only';

import type { PlatformSettingsSnapshot } from '@/lib/platform-settings';
import { buildAbsoluteAssetUrl, getCanonicalOrigin } from '@/lib/site-metadata';

type EmailShellArgs = {
  settings: PlatformSettingsSnapshot;
  previewText: string;
  heading: string;
  intro: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderBrandedEmailShell({
  settings,
  previewText,
  heading,
  intro,
  bodyHtml,
  ctaLabel,
  ctaUrl,
  footerNote,
}: EmailShellArgs) {
  const logoUrl = buildAbsoluteAssetUrl(settings.email.emailLogoUrl, settings);
  const primaryColor = settings.branding.primaryColor;
  const accentColor = settings.branding.accentColor;
  const appName = settings.branding.appName;
  const supportEmail = settings.email.supportEmail || 'info@1smartpocket.com';
  const siteUrl = getCanonicalOrigin(settings);
  const footerCopyright = settings.email.footerCopyright || `© ${appName}. All rights reserved.`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;color:#102033;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(previewText)}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #d9e2ef;">
            <tr>
              <td style="padding:32px 32px 20px;background:${escapeHtml(primaryColor)};">
                ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(appName)} logo" style="max-width:180px;height:auto;display:block;" />` : `<div style="font-size:24px;font-weight:700;color:#ffffff;">${escapeHtml(appName)}</div>`}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#102033;">${escapeHtml(heading)}</h1>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#445266;">${escapeHtml(intro)}</p>
                <div style="font-size:16px;line-height:1.7;color:#223248;">${bodyHtml}</div>
                ${ctaLabel && ctaUrl ? `<div style="margin:28px 0 20px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:${escapeHtml(accentColor)};color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(ctaLabel)}</a></div><p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5b6b82;">If the button does not work, copy and paste this link into your browser:<br /><a href="${escapeHtml(ctaUrl)}" style="color:${escapeHtml(primaryColor)};word-break:break-all;">${escapeHtml(ctaUrl)}</a></p>` : ''}
                <div style="margin-top:24px;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#5b6b82;">
                  Security note: If you did not request this action, you can safely ignore this email. For help, contact <a href="mailto:${escapeHtml(supportEmail)}" style="color:${escapeHtml(primaryColor)};">${escapeHtml(supportEmail)}</a>.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.7;color:#5b6b82;">
                <div style="margin-bottom:8px;">${footerNote ? escapeHtml(footerNote) : `You are receiving this email from ${escapeHtml(appName)}.`}</div>
                <div style="margin-bottom:8px;"><a href="${escapeHtml(siteUrl)}" style="color:${escapeHtml(primaryColor)};">${escapeHtml(siteUrl)}</a></div>
                <div>${escapeHtml(footerCopyright)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildTestEmailTemplate(settings: PlatformSettingsSnapshot) {
  const subject = `${settings.branding.appName} email configuration test`;
  const html = renderBrandedEmailShell({
    settings,
    previewText: `Your ${settings.branding.appName} email configuration is ready.`,
    heading: 'Email configuration confirmed',
    intro: `This test message confirms that ${settings.branding.appName} can deliver branded emails with the current production settings.`,
    bodyHtml: `
      <p style="margin:0 0 16px;">The email provider, sender identity, reply-to address, support email, and branding assets are now connected.</p>
      <p style="margin:0;">Next recommended steps: confirm DNS records, test inbox placement, and copy the finalized Supabase Auth templates from the internal documentation into the Supabase Dashboard.</p>
    `,
    ctaLabel: 'Open Smart Pocket',
    ctaUrl: getCanonicalOrigin(settings),
    footerNote: 'This is an internal production-readiness test message.',
  });

  return { subject, html };
}
