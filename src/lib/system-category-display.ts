const SYSTEM_CATEGORY_KEY_BY_NAME: Record<string, string> = {
  salary: 'salary',
  freelance: 'freelance',
  'freelance income': 'freelance',
  investment: 'investments',
  investments: 'investments',
  'investment returns': 'investmentReturns',
  'other income': 'otherIncome',
  'business income': 'businessIncome',
  'rental income': 'rentalIncome',
  'gifts received': 'giftsReceived',
  'food & dining': 'diningOut',
  'food and dining': 'diningOut',
  'dining out': 'diningOut',
  dining: 'diningOut',
  'dining & restaurants': 'diningOut',
  housing: 'housing',
  'housing & rent': 'housingRent',
  grocery: 'groceriesHousehold',
  groceries: 'groceriesHousehold',
  'groceries & household': 'groceriesHousehold',
  'groceries and household': 'groceriesHousehold',
  transport: 'transport',
  utilities: 'utilities',
  shopping: 'shopping',
  healthcare: 'healthcare',
  'personal care': 'personalCare',
  entertainment: 'entertainment',
  travel: 'travel',
  education: 'education',
  subscriptions: 'subscriptions',
  insurance: 'insurance',
  savings: 'savings',
  'other expense': 'otherExpense',
  'other expenses': 'otherExpense',
  other: 'other',
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
