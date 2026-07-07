export const SEO_LANDING_PAGE_SLUGS = [
  'ai-receipt-scanner',
  'ai-voice-expense-tracker',
  'family-budget-app',
  'shared-expenses',
  'multi-currency-expense-tracker',
  'expense-tracker-uae',
] as const;

export type SeoLandingPageSlug = (typeof SEO_LANDING_PAGE_SLUGS)[number];

type SeoLandingPageKey =
  | 'aiReceiptScanner'
  | 'aiVoiceExpenseTracker'
  | 'familyBudgetApp'
  | 'sharedExpenses'
  | 'multiCurrencyExpenseTracker'
  | 'expenseTrackerUae';

type SeoLandingPageIcon =
  | 'fileText'
  | 'mic'
  | 'wallet'
  | 'users'
  | 'globe'
  | 'mapPin';

export type SeoLandingPageContent = {
  linkLabel: string;
  seoTitle: string;
  seoDescription: string;
  ogTitle: string;
  ogDescription: string;
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
  };
  benefits: Array<{
    title: string;
    description: string;
  }>;
  howItWorks: Array<{
    title: string;
    description: string;
  }>;
  useCases: Array<{
    title: string;
    description: string;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
};

export type SeoLandingPageSharedContent = {
  primaryCta: string;
  secondaryCta: string;
  benefitsTitle: string;
  benefitsIntro: string;
  howItWorksTitle: string;
  howItWorksIntro: string;
  useCasesTitle: string;
  useCasesIntro: string;
  faqTitle: string;
  faqIntro: string;
  relatedTitle: string;
  relatedIntro: string;
  homepageLinkLabel: string;
  faqLinkLabel: string;
  contactLinkLabel: string;
  reviewNote: string;
  allowanceNote: string;
};

export type SeoLandingPageDefinition = {
  slug: SeoLandingPageSlug;
  key: SeoLandingPageKey;
  icon: SeoLandingPageIcon;
  accentClassName: string;
  keywords: string[];
  relatedSlugs: SeoLandingPageSlug[];
};

export const SEO_LANDING_PAGE_DEFINITIONS: Record<SeoLandingPageSlug, SeoLandingPageDefinition> = {
  'ai-receipt-scanner': {
    slug: 'ai-receipt-scanner',
    key: 'aiReceiptScanner',
    icon: 'fileText',
    accentClassName: 'from-cyan-500 via-sky-500 to-blue-600',
    keywords: ['ai receipt scanner', 'receipt scanner expense tracker', 'receipt to transaction app'],
    relatedSlugs: ['ai-voice-expense-tracker', 'shared-expenses', 'expense-tracker-uae'],
  },
  'ai-voice-expense-tracker': {
    slug: 'ai-voice-expense-tracker',
    key: 'aiVoiceExpenseTracker',
    icon: 'mic',
    accentClassName: 'from-violet-500 via-fuchsia-500 to-cyan-500',
    keywords: ['voice expense tracker', 'ai voice expense tracker', 'speak expenses'],
    relatedSlugs: ['ai-receipt-scanner', 'family-budget-app', 'shared-expenses'],
  },
  'family-budget-app': {
    slug: 'family-budget-app',
    key: 'familyBudgetApp',
    icon: 'wallet',
    accentClassName: 'from-emerald-500 via-cyan-500 to-sky-500',
    keywords: ['family budget app', 'household budget app', 'family expense tracker'],
    relatedSlugs: ['shared-expenses', 'multi-currency-expense-tracker', 'expense-tracker-uae'],
  },
  'shared-expenses': {
    slug: 'shared-expenses',
    key: 'sharedExpenses',
    icon: 'users',
    accentClassName: 'from-rose-500 via-orange-500 to-amber-500',
    keywords: ['shared expense tracker', 'split expenses app', 'reimbursement tracker'],
    relatedSlugs: ['family-budget-app', 'ai-receipt-scanner', 'multi-currency-expense-tracker'],
  },
  'multi-currency-expense-tracker': {
    slug: 'multi-currency-expense-tracker',
    key: 'multiCurrencyExpenseTracker',
    icon: 'globe',
    accentClassName: 'from-sky-500 via-cyan-500 to-emerald-500',
    keywords: ['multi currency expense tracker', 'budget app for expats', 'expense tracker for expats'],
    relatedSlugs: ['expense-tracker-uae', 'family-budget-app', 'shared-expenses'],
  },
  'expense-tracker-uae': {
    slug: 'expense-tracker-uae',
    key: 'expenseTrackerUae',
    icon: 'mapPin',
    accentClassName: 'from-teal-500 via-cyan-500 to-indigo-500',
    keywords: ['expense tracker UAE', 'personal finance app UAE', 'AED expense tracker', 'budget app UAE'],
    relatedSlugs: ['multi-currency-expense-tracker', 'ai-receipt-scanner', 'family-budget-app'],
  },
};

export function isSeoLandingPageSlug(value: string): value is SeoLandingPageSlug {
  return SEO_LANDING_PAGE_SLUGS.includes(value as SeoLandingPageSlug);
}

export function getSeoLandingPageDefinition(slug: string): SeoLandingPageDefinition | null {
  return isSeoLandingPageSlug(slug) ? SEO_LANDING_PAGE_DEFINITIONS[slug] : null;
}

export function getSeoLandingPageContent(
  publicText: Record<string, unknown>,
  slug: SeoLandingPageSlug
): {
  shared: SeoLandingPageSharedContent;
  page: SeoLandingPageContent;
} | null {
  const landingPages = publicText.landingPages;
  if (!landingPages || typeof landingPages !== 'object') {
    return null;
  }

  const definition = SEO_LANDING_PAGE_DEFINITIONS[slug];
  const shared = (landingPages as Record<string, unknown>).shared;
  const page = (landingPages as Record<string, unknown>)[definition.key];

  if (!shared || typeof shared !== 'object' || !page || typeof page !== 'object') {
    return null;
  }

  return {
    shared: shared as SeoLandingPageSharedContent,
    page: page as SeoLandingPageContent,
  };
}
