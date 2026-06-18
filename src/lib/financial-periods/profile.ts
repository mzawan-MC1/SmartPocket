import {
  DEFAULT_FINANCIAL_PERIOD_CONFIG,
  normalizeFinancialPeriodConfig,
  validateFinancialPeriodConfig,
  type BudgetPeriod,
  type DashboardPeriodPreference,
  type FinancialPeriodConfig,
  type FinancialPeriodValidationResult,
  type IncomeFrequency,
  type MonthlyPaydayRule,
  type WeekStartsOn,
  type WeeklyPayday,
} from './index';

export interface FinancialPeriodProfileRow {
  income_frequency: IncomeFrequency | null;
  pay_cycle_anchor_date: string | null;
  weekly_payday: WeeklyPayday | null;
  semimonthly_day_1: number | null;
  semimonthly_day_2: number | null;
  monthly_payday_rule: MonthlyPaydayRule | null;
  monthly_payday_day: number | null;
  default_dashboard_period: DashboardPeriodPreference | null;
  default_budget_period: BudgetPeriod | null;
  week_starts_on: WeekStartsOn | null;
  week_starts_on_custom_day: number | null;
  timezone: string | null;
  custom_cycle_days: number | null;
}

export interface FinancialPeriodFormValues {
  income_frequency: IncomeFrequency;
  pay_cycle_anchor_date: string;
  weekly_payday: WeeklyPayday | '';
  semimonthly_day_1: string;
  semimonthly_day_2: string;
  monthly_payday_rule: MonthlyPaydayRule;
  monthly_payday_day: string;
  default_dashboard_period: DashboardPeriodPreference;
  default_budget_period: BudgetPeriod;
  week_starts_on: WeekStartsOn;
  week_starts_on_custom_day: string;
  timezone: string;
  custom_cycle_days: string;
}

export const FINANCIAL_PERIOD_PROFILE_SELECT = [
  'income_frequency',
  'pay_cycle_anchor_date',
  'weekly_payday',
  'semimonthly_day_1',
  'semimonthly_day_2',
  'monthly_payday_rule',
  'monthly_payday_day',
  'default_dashboard_period',
  'default_budget_period',
  'week_starts_on',
  'week_starts_on_custom_day',
  'timezone',
  'custom_cycle_days',
].join(',');

let cachedFinancialPeriodProfileConfig: FinancialPeriodConfig | null = null;

export function clearFinancialPeriodProfileCache() {
  cachedFinancialPeriodProfileConfig = null;
}

export function getBrowserTimeZone() {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
    return DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone;
}

function stringifyNumber(value: number | null | undefined) {
  return value === null || value === undefined ? '' : String(value);
}

export function toFinancialPeriodConfig(row?: Partial<FinancialPeriodProfileRow> | null): FinancialPeriodConfig {
  if (!row && cachedFinancialPeriodProfileConfig) {
    return cachedFinancialPeriodProfileConfig;
  }

  const normalized = normalizeFinancialPeriodConfig({
    incomeFrequency: row?.income_frequency,
    payCycleAnchorDate: row?.pay_cycle_anchor_date,
    weeklyPayday: row?.weekly_payday,
    semimonthlyDay1: row?.semimonthly_day_1,
    semimonthlyDay2: row?.semimonthly_day_2,
    monthlyPaydayRule: row?.monthly_payday_rule || undefined,
    monthlyPaydayDay: row?.monthly_payday_day,
    defaultDashboardPeriod: row?.default_dashboard_period || undefined,
    defaultBudgetPeriod: row?.default_budget_period || undefined,
    weekStartsOn: row?.week_starts_on || undefined,
    weekStartsOnCustomDay: row?.week_starts_on_custom_day,
    timezone: row?.timezone || undefined,
    customCycleDays: row?.custom_cycle_days,
  });

  if (!row) {
    cachedFinancialPeriodProfileConfig = normalized;
  }

  return normalized;
}

export function buildFinancialPeriodFormValues(row?: Partial<FinancialPeriodProfileRow> | null): FinancialPeriodFormValues {
  const config = toFinancialPeriodConfig(row);
  return {
    income_frequency: config.incomeFrequency,
    pay_cycle_anchor_date: config.payCycleAnchorDate || '',
    weekly_payday: config.weeklyPayday || '',
    semimonthly_day_1: stringifyNumber(config.semimonthlyDay1),
    semimonthly_day_2: stringifyNumber(config.semimonthlyDay2),
    monthly_payday_rule: config.monthlyPaydayRule,
    monthly_payday_day: stringifyNumber(config.monthlyPaydayDay),
    default_dashboard_period: config.defaultDashboardPeriod,
    default_budget_period: config.defaultBudgetPeriod,
    week_starts_on: config.weekStartsOn,
    week_starts_on_custom_day: stringifyNumber(config.weekStartsOnCustomDay),
    timezone: config.timezone || getBrowserTimeZone(),
    custom_cycle_days: stringifyNumber(config.customCycleDays),
  };
}

export function withFrequencyDefaults(
  current: FinancialPeriodFormValues,
  incomeFrequency: IncomeFrequency
): FinancialPeriodFormValues {
  const next: FinancialPeriodFormValues = {
    ...current,
    income_frequency: incomeFrequency,
  };

  if (incomeFrequency !== 'weekly') {
    next.weekly_payday = '';
  }
  if (incomeFrequency !== 'weekly' && incomeFrequency !== 'biweekly' && incomeFrequency !== 'custom') {
    next.pay_cycle_anchor_date = '';
  }
  if (incomeFrequency !== 'semimonthly') {
    next.semimonthly_day_1 = '';
    next.semimonthly_day_2 = '';
  }
  if (incomeFrequency !== 'monthly') {
    next.monthly_payday_rule = DEFAULT_FINANCIAL_PERIOD_CONFIG.monthlyPaydayRule;
    next.monthly_payday_day = '';
  }
  if (incomeFrequency !== 'custom') {
    next.custom_cycle_days = '';
  }
  if (incomeFrequency === 'irregular') {
    next.default_dashboard_period = 'month';
    next.default_budget_period = 'monthly';
  }

  return next;
}

export function getBudgetPeriodOptionsForFrequency(incomeFrequency: IncomeFrequency): BudgetPeriod[] {
  switch (incomeFrequency) {
    case 'weekly':
      return ['weekly', 'biweekly', 'monthly', 'semimonthly', 'custom'];
    case 'biweekly':
      return ['biweekly', 'weekly', 'monthly', 'semimonthly', 'custom'];
    case 'semimonthly':
      return ['semimonthly', 'monthly', 'weekly', 'biweekly', 'custom'];
    case 'custom':
      return ['custom', 'monthly', 'weekly', 'biweekly', 'semimonthly'];
    case 'irregular':
      return ['monthly', 'weekly', 'biweekly', 'semimonthly', 'custom'];
    case 'monthly':
    default:
      return ['monthly', 'semimonthly', 'weekly', 'biweekly', 'custom'];
  }
}

function parseOptionalInteger(value: string) {
  if (!value.trim()) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function buildFinancialPeriodConfigFromForm(values: FinancialPeriodFormValues): FinancialPeriodConfig {
  return normalizeFinancialPeriodConfig({
    incomeFrequency: values.income_frequency,
    payCycleAnchorDate: values.pay_cycle_anchor_date || null,
    weeklyPayday: values.weekly_payday || null,
    semimonthlyDay1: parseOptionalInteger(values.semimonthly_day_1),
    semimonthlyDay2: parseOptionalInteger(values.semimonthly_day_2),
    monthlyPaydayRule: values.monthly_payday_rule,
    monthlyPaydayDay: parseOptionalInteger(values.monthly_payday_day),
    defaultDashboardPeriod: values.default_dashboard_period,
    defaultBudgetPeriod: values.default_budget_period,
    weekStartsOn: values.week_starts_on,
    weekStartsOnCustomDay: parseOptionalInteger(values.week_starts_on_custom_day),
    timezone: values.timezone || DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone,
    customCycleDays: parseOptionalInteger(values.custom_cycle_days),
  });
}

export function validateFinancialPeriodForm(values: FinancialPeriodFormValues): FinancialPeriodValidationResult {
  return validateFinancialPeriodConfig(buildFinancialPeriodConfigFromForm(values));
}

export function buildFinancialPeriodProfileUpdate(values: FinancialPeriodFormValues): FinancialPeriodProfileRow {
  const config = buildFinancialPeriodConfigFromForm(values);
  return {
    income_frequency: config.incomeFrequency,
    pay_cycle_anchor_date: config.payCycleAnchorDate,
    weekly_payday: config.weeklyPayday,
    semimonthly_day_1: config.semimonthlyDay1,
    semimonthly_day_2: config.semimonthlyDay2,
    monthly_payday_rule: config.monthlyPaydayRule,
    monthly_payday_day: config.monthlyPaydayDay,
    default_dashboard_period: config.defaultDashboardPeriod,
    default_budget_period: config.defaultBudgetPeriod,
    week_starts_on: config.weekStartsOn,
    week_starts_on_custom_day: config.weekStartsOnCustomDay,
    timezone: config.timezone,
    custom_cycle_days: config.customCycleDays,
  };
}
