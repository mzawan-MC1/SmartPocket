import 'server-only';

import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { normalizePlatformSettings, normalizePublicNavHref, type PlatformSettingsSnapshot } from '@/lib/platform-settings';
import { listPublicCmsPages } from '@/lib/cms-pages-server';
import { isMarketingHomeSlug } from '@/lib/cms-pages';
import {
  buildNormalizedPhoneParts,
  formatNormalizedPhoneForDisplay,
  getPlatformContactPhoneCountryCode,
} from '@/lib/phone';
import { getReferenceDataSnapshot } from '@/lib/reference-data/store';
import { createAdminClient } from '@/lib/supabase/admin';

async function readPlatformSettingsWithAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

async function readPlatformSettingsWithAdminClient() {
  const supabase = createAdminClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw error;
  }

  return data;
}

export const getPlatformSettingsSnapshot = cache(async (): Promise<PlatformSettingsSnapshot> => {
  noStore();
  const referenceData = await getReferenceDataSnapshot();

  try {
    const anonData = await readPlatformSettingsWithAnonClient();
    if (anonData) {
      const normalized = normalizePlatformSettings(anonData);
      const pages = await listPublicCmsPages();
      return enrichPlatformContactPhone(mergePublicCmsNavigation(normalized, pages), referenceData);
    }
  } catch {}

  try {
    const adminData = await readPlatformSettingsWithAdminClient();
    if (adminData) {
      const normalized = normalizePlatformSettings(adminData);
      const pages = await listPublicCmsPages();
      return enrichPlatformContactPhone(mergePublicCmsNavigation(normalized, pages), referenceData);
    }
  } catch {}

  const normalized = normalizePlatformSettings(null);
  const pages = await listPublicCmsPages();
  return enrichPlatformContactPhone(mergePublicCmsNavigation(normalized, pages), referenceData);
});

function mergePublicCmsNavigation(
  settings: PlatformSettingsSnapshot,
  pages: Awaited<ReturnType<typeof listPublicCmsPages>>
) {
  if (!pages.length) {
    return settings;
  }

  const existingHeaderHrefs = new Set(
    settings.publicUi.headerMenu.map((item) => normalizePublicNavHref(item.href))
  );
  const headerPages = pages
    .filter((page) => !isMarketingHomeSlug(page.slug))
    .filter((page) => page.show_in_header)
    .filter((page) => !existingHeaderHrefs.has(normalizePublicNavHref(`/${page.slug}`)))
    .map((page) => ({
      id: `cms-header-${page.id}`,
      label: page.navigation_label_resolved,
      href: `/${page.slug}`,
    }));

  const existingFooterHrefs = new Set(
    settings.publicUi.footerSections.flatMap((section) =>
      section.links.map((link) => normalizePublicNavHref(link.href))
    )
  );
  const footerLinks = pages
    .filter((page) => !isMarketingHomeSlug(page.slug))
    .filter((page) => page.show_in_footer)
    .filter((page) => !existingFooterHrefs.has(normalizePublicNavHref(`/${page.slug}`)))
    .map((page) => ({
      id: `cms-footer-${page.id}`,
      label: page.navigation_label_resolved,
      href: `/${page.slug}`,
    }));

  const footerSections =
    footerLinks.length > 0
      ? [
          ...settings.publicUi.footerSections,
          {
            id: 'cms-pages',
            title: 'Pages',
            links: footerLinks,
          },
        ]
      : settings.publicUi.footerSections;

  return {
    ...settings,
    publicUi: {
      ...settings.publicUi,
      headerMenu: [...settings.publicUi.headerMenu, ...headerPages],
      footerSections,
    },
  };
}

function enrichPlatformContactPhone(
  settings: PlatformSettingsSnapshot,
  referenceData: Awaited<ReturnType<typeof getReferenceDataSnapshot>>
) {
  const contactPhoneCountryCode = getPlatformContactPhoneCountryCode({
    explicitCountryCode: settings.publicUi.contactPhoneCountryCode,
    phoneValue: settings.publicUi.contactPhone,
    countries: referenceData.countries,
  });
  const contactPhoneFormatted = formatNormalizedPhoneForDisplay({
    value: settings.publicUi.contactPhone,
    countryCode: contactPhoneCountryCode,
    countries: referenceData.countries,
  });
  const normalizedContactPhone = buildNormalizedPhoneParts({
    value: settings.publicUi.contactPhone,
    countryCode: contactPhoneCountryCode,
    countries: referenceData.countries,
  });

  return {
    ...settings,
    publicUi: {
      ...settings.publicUi,
      contactPhone: normalizedContactPhone.e164 || settings.publicUi.contactPhone,
      contactPhoneCountryCode,
      contactPhoneFormatted:
        contactPhoneFormatted ||
        normalizedContactPhone.display ||
        normalizedContactPhone.e164 ||
        settings.publicUi.contactPhone,
    },
  };
}
