const SYSTEM_CATEGORY_KEY_BY_NAME: Record<string, string> = {
  salary: 'salary',
  freelance: 'freelance',
  'investment returns': 'investmentReturns',
  'other income': 'otherIncome',
  'food & dining': 'foodDining',
  housing: 'housing',
  transport: 'transport',
  utilities: 'utilities',
  shopping: 'shopping',
  healthcare: 'healthcare',
  entertainment: 'entertainment',
  travel: 'travel',
  education: 'education',
  subscriptions: 'subscriptions',
  savings: 'savings',
  transfer: 'transfer',
};

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function translateSystemCategoryName(name: string | null | undefined, t: Translate) {
  const fallback = (name || '').trim();
  if (!fallback) return '';

  const key = SYSTEM_CATEGORY_KEY_BY_NAME[fallback.toLowerCase()];
  if (!key) return fallback;

  return t(`systemCategories.${key}`, {
    ns: 'common',
    defaultValue: fallback,
  });
}
