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
  '/ai-receipt-scanner': 'footer.linkAiReceiptScanner',
  '/ai-voice-expense-tracker': 'footer.linkAiVoiceExpenseTracker',
};

const CANONICAL_SECTION_META: Array<{
  canonicalId: string;
  titleKey: string;
  idMatchers: string[];
  titleMatchSlugs: string[];
}> = [
  {
    canonicalId: 'footer-section-product',
    titleKey: 'footer.sectionProduct',
    idMatchers: ['fs-product', 'footer-section-product', 'product'],
    titleMatchSlugs: ['product'],
  },
  {
    canonicalId: 'footer-section-learn',
    titleKey: 'footer.sectionLearn',
    idMatchers: ['fs-learn', 'footer-section-learn', 'learn'],
    titleMatchSlugs: ['learn', 'resources', 'guides'],
  },
  {
    canonicalId: 'footer-section-company',
    titleKey: 'footer.sectionCompany',
    idMatchers: ['fs-company', 'footer-section-company', 'company'],
    titleMatchSlugs: ['company', 'about-us', 'about'],
  },
  {
    canonicalId: 'footer-section-legal',
    titleKey: 'footer.sectionLegalTrust',
    idMatchers: ['fs-legal', 'footer-section-legal', 'legal', 'legal-trust'],
    titleMatchSlugs: [
      'legal',
      'legal-trust',
      'trust-legal',
      'legal-and-trust',
      'privacy-terms',
    ],
  },
  {
    canonicalId: 'footer-section-support',
    titleKey: 'footer.sectionSupport',
    idMatchers: ['fs-support', 'footer-section-support', 'support'],
    titleMatchSlugs: ['support', 'help', 'help-center'],
  },
];

function slugifyForMatch(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function normalizeSectionIdForMatch(sectionId: string) {
  return slugifyForMatch(
    String(sectionId || '')
      .replace(/^fs-/, '')
      .replace(/^footer-section-/, '')
  );
}

function resolveCanonicalSectionMeta(sectionId: string, sectionTitle: string) {
  const idNorm = normalizeSectionIdForMatch(sectionId);
  const byId = CANONICAL_SECTION_META.find((row) =>
    row.idMatchers.some((pattern) => normalizeSectionIdForMatch(pattern) === idNorm)
  );
  if (byId) return byId;

  const titleNorm = slugifyForMatch(sectionTitle);
  if (!titleNorm) return null;
  return (
    CANONICAL_SECTION_META.find((row) =>
      row.titleMatchSlugs.some(
        (pattern) =>
          titleNorm === pattern ||
          titleNorm.startsWith(`${pattern}-`) ||
          titleNorm.endsWith(`-${pattern}`)
      )
    ) ?? null
  );
}

export function getTranslatedPublicNavLabel(
  href: string,
  fallback: string,
  t: Translate
) {
  const key = NAV_LABEL_KEYS[normalizePublicNavHref(href || '')];
  return key ? t(key, { ns: 'public', defaultValue: fallback }) : fallback;
}

export function getTranslatedFooterSectionTitle(
  sectionId: string,
  fallback: string,
  t: Translate
) {
  const canonical = resolveCanonicalSectionMeta(sectionId, fallback || '');
  if (canonical) {
    return t(canonical.titleKey, { ns: 'public', defaultValue: fallback });
  }
  return fallback;
}

export function isCanonicalCompanySection(sectionId: string, sectionTitle: string) {
  const canonical = resolveCanonicalSectionMeta(sectionId, sectionTitle || '');
  return canonical?.canonicalId === 'footer-section-company';
}

export function isCanonicalProductSection(sectionId: string, sectionTitle: string) {
  const canonical = resolveCanonicalSectionMeta(sectionId, sectionTitle || '');
  return canonical?.canonicalId === 'footer-section-product';
}
