import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import type { CmsPageRecord } from '@/lib/cms-pages';

type PlatformSettingsRow = {
  id: string;
  updated_at: string | null;
  singleton_lock?: boolean | null;
  app_name?: string | null;
  logo_url?: string | null;
  favicon_url?: string | null;
  canonical_url?: string | null;
  site_title?: string | null;
  site_description?: string | null;
  og_image?: string | null;
  email_provider?: string | null;
  smtp_host?: string | null;
  smtp_user?: string | null;
  from_email?: string | null;
  google_oauth_enabled?: boolean | null;
  apple_oauth_enabled?: boolean | null;
  magic_link_enabled?: boolean | null;
  email_password_enabled?: boolean | null;
  require_email_verification?: boolean | null;
  default_language?: string | null;
  enabled_languages?: string[] | null;
  default_currency?: string | null;
  enabled_currencies?: string[] | null;
  header_menu?: Array<unknown> | null;
  footer_sections?: Array<unknown> | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_address?: string | null;
  feature_managed_people?: boolean | null;
  feature_shared_spaces?: boolean | null;
  feature_invitations?: boolean | null;
  feature_reimbursements?: boolean | null;
  feature_settlements?: boolean | null;
  payment_stripe_enabled?: boolean | null;
  payment_paypal_enabled?: boolean | null;
  hero_title?: string | null;
  hero_subtitle?: string | null;
  hero_cta_primary?: string | null;
  hero_cta_secondary?: string | null;
  sticky_header?: boolean | null;
  footer_tagline?: string | null;
};

function hasValue(value: string | null | undefined) {
  return Boolean(value && value.trim());
}

export async function GET() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return applySupabaseCookies(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), cookieMutations);
  }

  if (user.app_metadata?.role !== 'admin') {
    return applySupabaseCookies(NextResponse.json({ error: 'Forbidden' }, { status: 403 }), cookieMutations);
  }

  const admin = createAdminClient();
  if (!admin) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
      cookieMutations
    );
  }

  const [{ data: settings, error: settingsError }, { data: pages, error: pagesError }] = await Promise.all([
    admin.from('platform_settings').select('*').single(),
    admin.from('cms_pages').select('*'),
  ]);

  if (settingsError) {
    return applySupabaseCookies(
      NextResponse.json({ error: settingsError.message || 'Failed to load platform settings.' }, { status: 500 }),
      cookieMutations
    );
  }

  if (pagesError) {
    return applySupabaseCookies(
      NextResponse.json({ error: pagesError.message || 'Failed to load CMS pages.' }, { status: 500 }),
      cookieMutations
    );
  }

  const platform = settings as PlatformSettingsRow;
  const cmsPages = (pages as CmsPageRecord[]) || [];
  const totalPages = cmsPages.length;
  const publishedPages = cmsPages.filter((page) => page.status === 'published').length;
  const draftPages = cmsPages.filter((page) => page.status === 'draft').length;
  const disabledPages = cmsPages.filter((page) => !page.is_enabled).length;
  const headerMenuCount = Array.isArray(platform.header_menu) ? platform.header_menu.length : 0;
  const footerSectionCount = Array.isArray(platform.footer_sections) ? platform.footer_sections.length : 0;
  const footerLinkCount = Array.isArray(platform.footer_sections)
    ? platform.footer_sections.reduce((count, section: any) => count + (Array.isArray(section?.links) ? section.links.length : 0), 0)
    : 0;

  const enabledAuthMethods = [
    platform.email_password_enabled !== false ? 'Email & Password' : null,
    platform.google_oauth_enabled ? 'Google' : null,
    platform.apple_oauth_enabled ? 'Apple' : null,
    platform.magic_link_enabled ? 'Magic Link' : null,
  ].filter(Boolean) as string[];

  const warnings = [
    !platform.singleton_lock ? 'Platform settings singleton lock is missing or false.' : null,
    !hasValue(platform.app_name) ? 'App name is missing.' : null,
    !hasValue(platform.logo_url) ? 'Logo asset is not configured.' : null,
    !hasValue(platform.favicon_url) ? 'Favicon asset is not configured.' : null,
    !hasValue(platform.canonical_url) ? 'Canonical URL is empty.' : null,
    !hasValue(platform.site_title) ? 'Global site title is empty.' : null,
    !hasValue(platform.site_description) ? 'Global site description is empty.' : null,
    !hasValue(platform.og_image) ? 'Open Graph image is not configured.' : null,
    platform.email_provider === 'smtp' && (!hasValue(platform.smtp_host) || !hasValue(platform.smtp_user))
      ? 'SMTP provider is selected but SMTP host/user is incomplete.'
      : null,
    !hasValue(platform.from_email) ? 'Sender email is not configured.' : null,
    enabledAuthMethods.length === 0 ? 'No public authentication methods are enabled.' : null,
    !hasValue(platform.contact_email) ? 'Public contact email is missing.' : null,
    totalPages === 0 ? 'No CMS pages exist yet.' : null,
    publishedPages === 0 ? 'No CMS pages are published.' : null,
  ].filter(Boolean) as string[];

  const response = {
    singleton: {
      healthy: Boolean(platform.id && platform.singleton_lock !== false),
      last_updated_at: platform.updated_at,
    },
    branding: {
      app_name: platform.app_name || '',
      logo_url: platform.logo_url || '',
      favicon_url: platform.favicon_url || '',
      assets_ready: hasValue(platform.logo_url) && hasValue(platform.favicon_url),
    },
    seo: {
      canonical_url: platform.canonical_url || '',
      site_title: platform.site_title || '',
      site_description: platform.site_description || '',
      og_image: platform.og_image || '',
      ready:
        hasValue(platform.canonical_url) &&
        hasValue(platform.site_title) &&
        hasValue(platform.site_description) &&
        hasValue(platform.og_image),
    },
    email: {
      provider: platform.email_provider || 'supabase',
      smtp_ready:
        platform.email_provider !== 'smtp' ||
        (hasValue(platform.smtp_host) && hasValue(platform.smtp_user) && hasValue(platform.from_email)),
      from_email: platform.from_email || '',
    },
    auth: {
      enabled_methods: enabledAuthMethods,
      require_email_verification: platform.require_email_verification !== false,
    },
    localization: {
      default_language: platform.default_language || 'en',
      enabled_languages: platform.enabled_languages || [],
      default_currency: platform.default_currency || '',
      enabled_currencies: platform.enabled_currencies || [],
    },
    cms: {
      header_menu_count: headerMenuCount,
      footer_section_count: footerSectionCount,
      footer_link_count: footerLinkCount,
      contact_ready:
        hasValue(platform.contact_email) || hasValue(platform.contact_phone) || hasValue(platform.contact_address),
      pages: {
        total: totalPages,
        published: publishedPages,
        draft: draftPages,
        disabled: disabledPages,
      },
    },
    features: {
      managed_people: platform.feature_managed_people !== false,
      shared_spaces: platform.feature_shared_spaces !== false,
      invitations: platform.feature_invitations !== false,
      reimbursements: platform.feature_reimbursements !== false,
      settlements: platform.feature_settlements !== false,
    },
    payments: {
      stripe_enabled: Boolean(platform.payment_stripe_enabled),
      paypal_enabled: Boolean(platform.payment_paypal_enabled),
    },
    homepage: {
      hero_title: platform.hero_title || '',
      hero_subtitle: platform.hero_subtitle || '',
      hero_cta_primary: platform.hero_cta_primary || '',
      hero_cta_secondary: platform.hero_cta_secondary || '',
      sticky_header: platform.sticky_header !== false,
      footer_tagline: platform.footer_tagline || '',
    },
    warnings,
  };

  return applySupabaseCookies(
    NextResponse.json(response, { status: 200 }),
    cookieMutations
  );
}
