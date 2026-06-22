import {
  DEFAULT_FINANCIAL_PERIOD_CONFIG,
  formatCalendarMonthLabel,
  formatFinancialPeriodLabel,
  getCurrentBusinessDate,
  getCurrentFinancialPeriod,
  getMonthlyPeriod,
  getNextFinancialPeriod,
  getPeriodContainingDate,
  getPreviousFinancialPeriod,
  type BudgetPeriod,
  type FinancialPeriod,
  type FinancialPeriodConfig,
} from './index';

export interface BudgetPeriodSource {
  budget_period?: BudgetPeriod | null;
  period_anchor_date?: string | null;
  custom_period_days?: number | null;
  period_start?: string | null;
  period_end?: string | null;
  period?: string | null;
}

export interface ResolvedBudgetPeriod extends FinancialPeriod {
  label: string;
  budgetPeriod: BudgetPeriod;
}

export interface BudgetPeriodValidationResult {
  isValid: boolean;
  budgetPeriod: BudgetPeriod;
  error: string | null;
}

export interface BudgetSelectedRange {
  startDate: string;
  endDate: string;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

const BUDGET_PERIOD_LABEL_KEYS: Record<BudgetPeriod, string> = {
  weekly: 'financialPeriods.budgetPeriods.weekly',
  biweekly: 'financialPeriods.budgetPeriods.biweekly',
  semimonthly: 'financialPeriods.budgetPeriods.semimonthly',
  monthly: 'financialPeriods.budgetPeriods.monthly',
  custom: 'financialPeriods.budgetPeriods.custom',
};

const BUDGET_PERIOD_LABEL_FALLBACKS: Record<BudgetPeriod, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  custom: 'Custom',
};

const BUDGET_CONFIG_ERROR_KEYS = {
  semimonthlyScheduleRequired: 'budgets.form.errors.semimonthlyScheduleRequired',
  biweeklyAnchorRequired: 'budgets.form.errors.biweeklyAnchorRequired',
  customAnchorRequired: 'budgets.form.errors.customAnchorRequired',
  customCycleLengthInvalid: 'budgets.form.errors.customCycleLengthInvalid',
} as const;

function isBudgetPeriod(value: string | null | undefined): value is BudgetPeriod {
  return value === 'weekly'
    || value === 'biweekly'
    || value === 'semimonthly'
    || value === 'monthly'
    || value === 'custom';
}

function getLegacyCompatibleBudgetPeriod(legacyPeriod: string | null | undefined): BudgetPeriod {
  if (legacyPeriod === 'weekly') return 'weekly';
  if (legacyPeriod === 'custom') return 'custom';
  return 'monthly';
}

function toUtcNoonDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatDateString(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function startOfWeek(dateString: string, weekStartsOn: FinancialPeriodConfig['weekStartsOn'], customDay: number | null) {
  const date = toUtcNoonDate(dateString);
  const currentWeekday = date.getUTCDay();
  const targetWeekday = weekStartsOn === 'sunday'
    ? 0
    : weekStartsOn === 'saturday'
      ? 6
      : weekStartsOn === 'custom'
        ? Math.min(Math.max(customDay ?? 1, 0), 6)
        : 1;
  const delta = (currentWeekday - targetWeekday + 7) % 7;
  date.setUTCDate(date.getUTCDate() - delta);
  return formatDateString(date);
}

function addDays(dateString: string, amount: number) {
  const date = toUtcNoonDate(dateString);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDateString(date);
}

function buildBudgetFinancialConfig(
  budget: BudgetPeriodSource,
  userConfig: FinancialPeriodConfig
): { config: FinancialPeriodConfig | null; budgetPeriod: BudgetPeriod; error: string | null } {
  const budgetPeriod = normalizeBudgetPeriodValue(budget);
  const baseConfig: FinancialPeriodConfig = {
    ...DEFAULT_FINANCIAL_PERIOD_CONFIG,
    ...userConfig,
    timezone: userConfig.timezone || DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone,
  };

  if (budgetPeriod === 'monthly') {
    return { config: null, budgetPeriod, error: null };
  }

  if (budgetPeriod === 'semimonthly') {
    if (baseConfig.semimonthlyDay1 === null || baseConfig.semimonthlyDay2 === null) {
      return {
        config: null,
        budgetPeriod,
        error: BUDGET_CONFIG_ERROR_KEYS.semimonthlyScheduleRequired,
      };
    }
    return {
      config: {
        ...baseConfig,
        incomeFrequency: 'semimonthly',
      },
      budgetPeriod,
      error: null,
    };
  }

  const anchorDate = budget.period_anchor_date || budget.period_start || null;

  if (budgetPeriod === 'weekly') {
    return {
      config: {
        ...baseConfig,
        incomeFrequency: 'weekly',
        payCycleAnchorDate: anchorDate,
        weeklyPayday: null,
      },
      budgetPeriod,
      error: null,
    };
  }

  if (budgetPeriod === 'biweekly') {
    if (!anchorDate) {
      return {
        config: null,
        budgetPeriod,
        error: BUDGET_CONFIG_ERROR_KEYS.biweeklyAnchorRequired,
      };
    }
    return {
      config: {
        ...baseConfig,
        incomeFrequency: 'biweekly',
        payCycleAnchorDate: anchorDate,
      },
      budgetPeriod,
      error: null,
    };
  }

  if (!anchorDate) {
    return {
      config: null,
      budgetPeriod,
      error: BUDGET_CONFIG_ERROR_KEYS.customAnchorRequired,
    };
  }

  if (!budget.custom_period_days || budget.custom_period_days < 2 || budget.custom_period_days > 90) {
    return {
      config: null,
      budgetPeriod,
      error: BUDGET_CONFIG_ERROR_KEYS.customCycleLengthInvalid,
    };
  }

  return {
    config: {
      ...baseConfig,
      incomeFrequency: 'custom',
      payCycleAnchorDate: anchorDate,
      customCycleDays: budget.custom_period_days,
    },
    budgetPeriod,
    error: null,
  };
}

export function normalizeBudgetPeriodValue(budget: BudgetPeriodSource): BudgetPeriod {
  if (isBudgetPeriod(budget.budget_period || null)) {
    return budget.budget_period as BudgetPeriod;
  }
  return getLegacyCompatibleBudgetPeriod(budget.period || null);
}

export function getBudgetPeriodTypeLabel(value: BudgetPeriod, t?: Translate) {
  if (!t) {
    return BUDGET_PERIOD_LABEL_FALLBACKS[value];
  }

  return t(BUDGET_PERIOD_LABEL_KEYS[value], {
    ns: 'portal',
    defaultValue: BUDGET_PERIOD_LABEL_FALLBACKS[value],
  });
}

export function validateBudgetPeriodConfig(
  budget: BudgetPeriodSource,
  userConfig: FinancialPeriodConfig
): BudgetPeriodValidationResult {
  const { budgetPeriod, error } = buildBudgetFinancialConfig(budget, userConfig);
  return {
    isValid: !error,
    budgetPeriod,
    error,
  };
}

export function formatBudgetPeriodLabel(period: FinancialPeriod, locale?: string) {
  return period.frequency === 'month'
    ? formatCalendarMonthLabel(period.startDate, locale)
    : formatFinancialPeriodLabel(period, locale);
}

export function getStoredBudgetPeriod(
  budget: BudgetPeriodSource,
  userConfig: FinancialPeriodConfig,
  locale?: string
): ResolvedBudgetPeriod {
  const referenceDate = budget.period_start || budget.period_anchor_date || undefined;
  const resolved = getBudgetPeriodForDate(budget, userConfig, referenceDate, locale);
  const startDate = budget.period_start || resolved.startDate;
  const endDate = budget.period_end || resolved.endDate;
  const explicitPeriod: FinancialPeriod = {
    ...resolved,
    startDate,
    endDate,
  };

  return {
    ...resolved,
    startDate,
    endDate,
    label: formatBudgetPeriodLabel(explicitPeriod, locale),
  };
}

export function isBudgetApplicableToRange(
  budget: BudgetPeriodSource,
  userConfig: FinancialPeriodConfig,
  selectedRange: BudgetSelectedRange,
  locale?: string
): ResolvedBudgetPeriod | null {
  const storedPeriod = getStoredBudgetPeriod(budget, userConfig, locale);
  return storedPeriod.startDate <= selectedRange.endDate && storedPeriod.endDate >= selectedRange.startDate
    ? storedPeriod
    : null;
}

export function getBudgetPeriodForDate(
  budget: BudgetPeriodSource,
  userConfig: FinancialPeriodConfig,
  referenceDate?: Date | string,
  locale?: string
): ResolvedBudgetPeriod {
  const { config, budgetPeriod, error } = buildBudgetFinancialConfig(budget, userConfig);
  if (error) {
    throw new Error(error);
  }

  const businessDate = getCurrentBusinessDate(userConfig.timezone, referenceDate);
  const period = budgetPeriod === 'monthly'
    ? getMonthlyPeriod(businessDate, userConfig.timezone)
    : getPeriodContainingDate(config!, businessDate);

  return {
    ...period,
    label: formatBudgetPeriodLabel(period, locale),
    budgetPeriod,
  };
}

export function getCurrentBudgetPeriod(
  budget: BudgetPeriodSource,
  userConfig: FinancialPeriodConfig,
  referenceDate?: Date | string,
  locale?: string
) {
  return getBudgetPeriodForDate(budget, userConfig, referenceDate, locale);
}

export function getPreviousBudgetPeriod(
  budget: BudgetPeriodSource,
  userConfig: FinancialPeriodConfig,
  referenceDate?: Date | string,
  locale?: string
) {
  const current = getBudgetPeriodForDate(budget, userConfig, referenceDate, locale);
  const previous = current.frequency === 'month'
    ? getMonthlyPeriod(addDays(current.startDate, -1), userConfig.timezone)
    : getPreviousFinancialPeriod(buildBudgetFinancialConfig(budget, userConfig).config!, current.startDate);

  return {
    ...previous,
    label: formatBudgetPeriodLabel(previous, locale),
    budgetPeriod: normalizeBudgetPeriodValue(budget),
  } satisfies ResolvedBudgetPeriod;
}

export function getNextBudgetPeriod(
  budget: BudgetPeriodSource,
  userConfig: FinancialPeriodConfig,
  referenceDate?: Date | string,
  locale?: string
) {
  const current = getBudgetPeriodForDate(budget, userConfig, referenceDate, locale);
  const next = current.frequency === 'month'
    ? getMonthlyPeriod(addDays(current.endDate, 1), userConfig.timezone)
    : getNextFinancialPeriod(buildBudgetFinancialConfig(budget, userConfig).config!, current.startDate);

  return {
    ...next,
    label: formatBudgetPeriodLabel(next, locale),
    budgetPeriod: normalizeBudgetPeriodValue(budget),
  } satisfies ResolvedBudgetPeriod;
}

export function getDefaultBudgetAnchorDate(
  budgetPeriod: BudgetPeriod,
  userConfig: FinancialPeriodConfig,
  referenceDate?: Date | string
) {
  const businessDate = getCurrentBusinessDate(userConfig.timezone, referenceDate);
  if (budgetPeriod === 'weekly') {
    if (userConfig.incomeFrequency === 'weekly') {
      return getCurrentFinancialPeriod(userConfig, businessDate).startDate;
    }
    return startOfWeek(businessDate, userConfig.weekStartsOn, userConfig.weekStartsOnCustomDay);
  }
  if (budgetPeriod === 'biweekly') {
    if (userConfig.incomeFrequency === 'biweekly') {
      return getCurrentFinancialPeriod(userConfig, businessDate).startDate;
    }
    return businessDate;
  }
  if (budgetPeriod === 'custom') {
    if (userConfig.incomeFrequency === 'custom' && userConfig.payCycleAnchorDate) {
      return getCurrentFinancialPeriod(userConfig, businessDate).startDate;
    }
    return businessDate;
  }
  return '';
}
