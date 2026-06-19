import 'server-only';

import { cache } from 'react';
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { normalizePlatformSettings, type PlatformSettingsSnapshot } from '@/lib/platform-settings';
import { listPublicCmsPages } from '@/lib/cms-pages-server';
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

  try {
    const anonData = await readPlatformSettingsWithAnonClient();
    if (anonData) {
      const normalized = normalizePlatformSettings(anonData);
      const pages = await listPublicCmsPages();
      return mergePublicCmsNavigation(normalized, pages);
    }
  } catch {}

  try {
    const adminData = await readPlatformSettingsWithAdminClient();
    if (adminData) {
      const normalized = normalizePlatformSettings(adminData);
      const pages = await listPublicCmsPages();
      return mergePublicCmsNavigation(normalized, pages);
    }
  } catch {}

  const normalized = normalizePlatformSettings(null);
  const pages = await listPublicCmsPages();
  return mergePublicCmsNavigation(normalized, pages);
});

function mergePublicCmsNavigation(
  settings: PlatformSettingsSnapshot,
  pages: Awaited<ReturnType<typeof listPublicCmsPages>>
) {
  if (!pages.length) {
    return settings;
  }

  const existingHeaderHrefs = new Set(settings.publicUi.headerMenu.map((item) => item.href));
  const headerPages = pages
    .filter((page) => page.show_in_header)
    .filter((page) => !existingHeaderHrefs.has(`/${page.slug}`))
    .map((page) => ({
      id: `cms-header-${page.id}`,
      label: page.navigation_label_resolved,
      href: `/${page.slug}`,
    }));

  const existingFooterHrefs = new Set(
    settings.publicUi.footerSections.flatMap((section) => section.links.map((link) => link.href))
  );
  const footerLinks = pages
    .filter((page) => page.show_in_footer)
    .filter((page) => !existingFooterHrefs.has(`/${page.slug}`))
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
