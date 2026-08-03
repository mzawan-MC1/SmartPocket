import { normalizePublicNavHref } from '@/lib/platform-settings';

type Translate = (key: string, options?: Record<string, unknown>) => string;

const NAV_LABEL_KEYS: Record<string, string> = {
  '/home#about': 'footer.linkAbout',
  '/home#features': 'footer.linkFeatures',
  '/home#pricing': 'footer.linkPricing',
  '/contact': 'footer.linkContact',
  '/faqs': 'footer.linkFaqs',
  '/privacy': 'footer.privacy',
  '/terms': 'footer.terms',
  '/help': 'footer.linkHelp',
  '/desktop-app': 'footer.linkDesktopApp',
  '/blog': 'footer.linkBlog',
  '/security': 'footer.linkSecurity',
};

export function getTranslatedPublicNavLabel(
  href: string,
  fallback: string,
  t: Translate
) {
  const key = NAV_LABEL_KEYS[normalizePublicNavHref(href)];
  return key ? t(key, { ns: 'public', defaultValue: fallback }) : fallback;
}

export function getTranslatedFooterSectionTitle(
  sectionId: string,
  fallback: string,
  t: Translate
) {
  if (sectionId === 'fs-company') {
    return t('footer.sectionCompany', { ns: 'public', defaultValue: fallback });
  }

  if (sectionId === 'fs-product') {
    return t('footer.sectionProduct', { ns: 'public', defaultValue: fallback });
  }

  if (sectionId === 'fs-support') {
    return t('footer.sectionSupport', { ns: 'public', defaultValue: fallback });
  }

  if (sectionId === 'fs-legal') {
    return t('footer.sectionLegal', { ns: 'public', defaultValue: fallback });
  }

  return fallback;
}
