export type IncomeFrequency =
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'irregular'
  | 'custom';

export type DashboardPeriodPreference =
  | 'pay_cycle'
  | 'month';

export type BudgetPeriod =
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'custom';

export type WeekStartsOn =
  | 'monday'
  | 'sunday'
  | 'saturday'
  | 'custom';

export type MonthlyPaydayRule =
  | 'specific_day'
  | 'last_day'
  | 'last_working_day';

export type WeeklyPayday =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

// For semimonthly schedules, 0 is the sentinel value for "last day of month".
export type SemimonthlyDay = number;

export interface FinancialPeriod {
  // Business-date boundaries are inclusive.
  startDate: string;
  endDate: string;
  frequency: IncomeFrequency | 'month';
  label?: string;
}

export interface FinancialPeriodConfig {
  incomeFrequency: IncomeFrequency;
  payCycleAnchorDate: string | null;
  weeklyPayday: WeeklyPayday | null;
  semimonthlyDay1: SemimonthlyDay | null;
  semimonthlyDay2: SemimonthlyDay | null;
  monthlyPaydayRule: MonthlyPaydayRule;
  monthlyPaydayDay: number | null;
  defaultDashboardPeriod: DashboardPeriodPreference;
  defaultBudgetPeriod: BudgetPeriod;
  weekStartsOn: WeekStartsOn;
  weekStartsOnCustomDay: number | null;
  timezone: string;
  customCycleDays: number | null;
}

export interface FinancialPeriodFieldErrors {
  incomeFrequency?: string;
  payCycleAnchorDate?: string;
  weeklyPayday?: string;
  semimonthlyDay1?: string;
  semimonthlyDay2?: string;
  monthlyPaydayRule?: string;
  monthlyPaydayDay?: string;
  defaultDashboardPeriod?: string;
  defaultBudgetPeriod?: string;
  weekStartsOn?: string;
  weekStartsOnCustomDay?: string;
  timezone?: string;
  customCycleDays?: string;
}

export interface FinancialPeriodValidationResult {
  isValid: boolean;
  errors: string[];
  fieldErrors: FinancialPeriodFieldErrors;
}

export const DEFAULT_FINANCIAL_PERIOD_CONFIG: FinancialPeriodConfig = {
  incomeFrequency: 'monthly',
  payCycleAnchorDate: null,
  weeklyPayday: null,
  semimonthlyDay1: null,
  semimonthlyDay2: null,
  monthlyPaydayRule: 'last_day',
  monthlyPaydayDay: null,
  defaultDashboardPeriod: 'month',
  defaultBudgetPeriod: 'monthly',
  weekStartsOn: 'monday',
  weekStartsOnCustomDay: null,
  timezone: 'UTC',
  customCycleDays: null,
};

export const INCOME_FREQUENCIES: IncomeFrequency[] = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'irregular',
  'custom',
];

export const BUDGET_PERIODS: BudgetPeriod[] = [
  'weekly',
  'biweekly',
  'semimonthly',
  'monthly',
  'custom',
];

export const WEEK_START_OPTIONS: WeekStartsOn[] = [
  'monday',
  'sunday',
  'saturday',
  'custom',
];

export const WEEKLY_PAYDAY_OPTIONS: WeeklyPayday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const MONTHLY_PAYDAY_RULES: MonthlyPaydayRule[] = [
  'specific_day',
  'last_day',
  'last_working_day',
];
