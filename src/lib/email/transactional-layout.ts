import 'server-only';

import type { PlatformSettingsSnapshot } from '@/lib/platform-settings';
import { buildAbsoluteAssetUrl } from '@/lib/site-metadata';
import { resolveTransactionalBaseUrl } from '@/lib/email/transactional-config';

type TransactionalLayoutInput = {
  settings: PlatformSettingsSnapshot;
  notificationSettings: {
    supportEmail: string | null | undefined;
    companyAddress: string;
    signatureName: string;
    signatureTitle: string;
    disclaimer: string | null;
    copyrightText: string | null;
  };
  previewText: string;
  heading: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderTransactionalEmail(input: TransactionalLayoutInput) {
  const logoUrl = buildAbsoluteAssetUrl(input.settings.email.emailLogoUrl, input.settings);
  const primaryColor = input.settings.branding.primaryColor;
  const accentColor = input.settings.branding.accentColor;
  const appName = input.settings.branding.appName;
  const premiumHeaderBackground = 'linear-gradient(135deg, #F3F4F6 0%, #D1D5DB 100%)';
  const supportEmail =
    input.notificationSettings.supportEmail
    || input.settings.publicUi.contactEmail
    || input.settings.email.supportEmail
    || '';
  const siteUrl = resolveTransactionalBaseUrl(input.settings);
  const companyAddress = (input.notificationSettings.companyAddress || '').trim();
  const signatureName = input.notificationSettings.signatureName;
  const signatureTitle = input.notificationSettings.signatureTitle;
  const disclaimer = input.notificationSettings.disclaimer;
  const copyrightText =
    input.notificationSettings.copyrightText
    || input.settings.publicUi.footerCopyright
    || `© ${appName}. All rights reserved.`;

  const signatureHtml = `
    <div style="margin-top:24px;font-size:14px;line-height:1.6;color:#445266;">
      <div style="font-weight:700;color:#102033;">${escapeHtml(signatureName)}</div>
      <div>${escapeHtml(signatureTitle)}</div>
      <div>${escapeHtml(appName)}</div>
      <div><a href="${escapeHtml(siteUrl)}" style="color:${escapeHtml(primaryColor)};text-decoration:none;">${escapeHtml(siteUrl)}</a></div>
    </div>
  `;

  const companyHtml = companyAddress
    ? `<div style="margin-top:14px;font-size:12px;line-height:1.5;color:#5b6b82;">${escapeHtml(companyAddress)}</div>`
    : '';

  const disclaimerHtml = disclaimer
    ? `<div style="margin-top:14px;font-size:12px;line-height:1.6;color:#5b6b82;">${escapeHtml(disclaimer)}</div>`
    : '';

  const ctaBlock = input.ctaLabel && input.ctaUrl
    ? `<div style="margin:28px 0 20px;">
        <a href="${escapeHtml(input.ctaUrl)}" style="display:inline-block;padding:14px 24px;border-radius:12px;background:${escapeHtml(accentColor)};color:#ffffff;text-decoration:none;font-weight:700;">
          ${escapeHtml(input.ctaLabel)}
        </a>
      </div>
      <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#5b6b82;">
        If the button does not work, copy and paste this link into your browser:<br />
        <a href="${escapeHtml(input.ctaUrl)}" style="color:${escapeHtml(primaryColor)};word-break:break-all;">${escapeHtml(input.ctaUrl)}</a>
      </p>`
    : '';

  const supportBlock = supportEmail
    ? `<div style="margin-top:22px;padding:16px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#5b6b82;">
                  For help, contact <a href="mailto:${escapeHtml(supportEmail)}" style="color:${escapeHtml(primaryColor)};">${escapeHtml(supportEmail)}</a>.
                </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(input.heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f4f7fb;color:#102033;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
      ${escapeHtml(input.previewText)}
    </span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fb;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #d9e2ef;">
            <tr>
              <td style="padding:20px 24px;background:#E5E7EB;background-image:${escapeHtml(premiumHeaderBackground)};">
                ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(appName)} logo" style="max-width:190px;max-height:54px;height:auto;width:auto;display:block;" />` : `<div style="font-size:24px;font-weight:700;color:#111827;">${escapeHtml(appName)}</div>`}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#102033;">${escapeHtml(input.heading)}</h1>
                <div style="font-size:16px;line-height:1.7;color:#223248;">${input.bodyHtml}</div>
                ${ctaBlock}
                ${supportBlock}
                ${signatureHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#5b6b82;">
                ${companyHtml}
                ${disclaimerHtml}
                <div style="margin-top:14px;"><a href="${escapeHtml(siteUrl)}" style="color:${escapeHtml(primaryColor)};">${escapeHtml(siteUrl)}</a></div>
                <div style="margin-top:6px;">${escapeHtml(copyrightText)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
