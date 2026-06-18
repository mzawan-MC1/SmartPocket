import {
  DEFAULT_FINANCIAL_PERIOD_CONFIG,
  type FinancialPeriod,
  type FinancialPeriodConfig,
  type FinancialPeriodValidationResult,
  type MonthlyPaydayRule,
  type SemimonthlyDay,
  type WeeklyPayday,
} from './types';

export * from './types';

const CUSTOM_CYCLE_MIN_DAYS = 2;
const CUSTOM_CYCLE_MAX_DAYS = 90;

const WEEKDAY_TO_INDEX: Record<WeeklyPayday, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function isValidDateString(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeDateString(value: string | null | undefined): string | null {
  return isValidDateString(value) ? value : null;
}

function parseInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

function normalizeWeeklyPayday(value: unknown): WeeklyPayday | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized in WEEKDAY_TO_INDEX ? normalized as WeeklyPayday : null;
}

function normalizeTimezone(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const normalized = value.trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date());
    return normalized;
  } catch {
    return null;
  }
}

function getSafeTimezone(value: unknown) {
  return normalizeTimezone(value) || DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone;
}

function getPartsFromDate(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: getSafeTimezone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value || 0);
  const month = Number(parts.find((part) => part.type === 'month')?.value || 0);
  const day = Number(parts.find((part) => part.type === 'day')?.value || 0);
  return { year, month, day };
}

function toBusinessDateString(input: Date | string | undefined, timeZone: string): string {
  if (typeof input === 'string' && isValidDateString(input)) {
    return input;
  }

  const date = input instanceof Date ? input : new Date();
  const { year, month, day } = getPartsFromDate(date, getSafeTimezone(timeZone));
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function parseDateParts(dateString: string) {
  const [yearText, monthText, dayText] = dateString.split('-');
  return {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
  };
}

function toUtcNoonDate(dateString: string) {
  const { year, month, day } = parseDateParts(dateString);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, amount: number) {
  const date = toUtcNoonDate(dateString);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDate(date);
}

function differenceInDays(left: string, right: string) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toUtcNoonDate(left).getTime() - toUtcNoonDate(right).getTime()) / msPerDay);
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0, 12, 0, 0)).getUTCDate();
}

function normalizeYearMonth(year: number, month: number) {
  const normalized = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
  return {
    year: normalized.getUTCFullYear(),
    month: normalized.getUTCMonth() + 1,
  };
}

function addMonths(year: number, month: number, amount: number) {
  return normalizeYearMonth(year, month + amount);
}

function lastWorkingDayOfMonth(year: number, month: number) {
  const lastDay = daysInMonth(year, month);
  const date = new Date(Date.UTC(year, month - 1, lastDay, 12, 0, 0));
  const weekday = date.getUTCDay();
  if (weekday === 6) return lastDay - 1;
  if (weekday === 0) return lastDay - 2;
  return lastDay;
}

function resolveMonthlyPayday(year: number, month: number, rule: MonthlyPaydayRule, specificDay: number | null) {
  if (rule === 'last_day') {
    return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  }
  if (rule === 'last_working_day') {
    return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(lastWorkingDayOfMonth(year, month)).padStart(2, '0')}`;
  }
  const day = Math.min(Math.max(specificDay || 1, 1), daysInMonth(year, month));
  return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function resolveSemimonthlyDay(year: number, month: number, day: SemimonthlyDay) {
  if (day === 0) {
    return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  }
  const resolvedDay = Math.min(Math.max(day, 1), daysInMonth(year, month));
  return `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(resolvedDay).padStart(2, '0')}`;
}

function compareSemimonthlyDayValues(left: number, right: number) {
  const normalizedLeft = left === 0 ? 32 : left;
  const normalizedRight = right === 0 ? 32 : right;
  return normalizedLeft - normalizedRight;
}

function buildPeriod(startDate: string, endDate: string, frequency: FinancialPeriod['frequency']): FinancialPeriod {
  return {
    startDate,
    endDate,
    frequency,
  };
}

function getAnchoredPeriod(referenceDate: string, anchorDate: string, cycleDays: number, frequency: FinancialPeriod['frequency']) {
  const diff = differenceInDays(referenceDate, anchorDate);
  const offset = Math.floor(diff / cycleDays);
  const startDate = addDays(anchorDate, offset * cycleDays);
  return buildPeriod(startDate, addDays(startDate, cycleDays - 1), frequency);
}

function getWeeklyPeriod(config: FinancialPeriodConfig, referenceDate: string) {
  const anchorDate = config.payCycleAnchorDate
    ? config.payCycleAnchorDate
    : config.weeklyPayday
      ? addDays(referenceDate, -((toUtcNoonDate(referenceDate).getUTCDay() - WEEKDAY_TO_INDEX[config.weeklyPayday] + 7) % 7))
      : referenceDate;
  return getAnchoredPeriod(referenceDate, anchorDate, 7, 'weekly');
}

function getBiweeklyPeriod(config: FinancialPeriodConfig, referenceDate: string) {
  return getAnchoredPeriod(referenceDate, config.payCycleAnchorDate || referenceDate, 14, 'biweekly');
}

function getCustomPeriod(config: FinancialPeriodConfig, referenceDate: string) {
  return getAnchoredPeriod(referenceDate, config.payCycleAnchorDate || referenceDate, config.customCycleDays || CUSTOM_CYCLE_MIN_DAYS, 'custom');
}

function getSemimonthlyPaydaysAround(referenceDate: string, config: FinancialPeriodConfig) {
  const { year, month } = parseDateParts(referenceDate);
  const months = [addMonths(year, month, -1), { year, month }, addMonths(year, month, 1)];
  const paydays = months.flatMap(({ year: monthYear, month: monthNumber }) => {
    return [config.semimonthlyDay1, config.semimonthlyDay2]
      .filter((value): value is number => value !== null)
      .map((value) => resolveSemimonthlyDay(monthYear, monthNumber, value));
  });

  return Array.from(new Set(paydays)).sort();
}

function getSemimonthlyPeriod(config: FinancialPeriodConfig, referenceDate: string) {
  const paydays = getSemimonthlyPaydaysAround(referenceDate, config);
  const previousPaydays = paydays.filter((payday) => payday <= referenceDate);
  const nextPaydays = paydays.filter((payday) => payday > referenceDate);
  const startDate = previousPaydays.at(-1) || paydays[0] || referenceDate;
  const nextPayday = nextPaydays[0];
  return buildPeriod(startDate, nextPayday ? addDays(nextPayday, -1) : addDays(startDate, 13), 'semimonthly');
}

function getMonthlyCyclePeriod(config: FinancialPeriodConfig, referenceDate: string) {
  const { year, month } = parseDateParts(referenceDate);
  const previousMonth = addMonths(year, month, -1);
  const nextMonth = addMonths(year, month, 1);
  const previousPayday = resolveMonthlyPayday(previousMonth.year, previousMonth.month, config.monthlyPaydayRule, config.monthlyPaydayDay);
  const currentPayday = resolveMonthlyPayday(year, month, config.monthlyPaydayRule, config.monthlyPaydayDay);
  const nextPayday = resolveMonthlyPayday(nextMonth.year, nextMonth.month, config.monthlyPaydayRule, config.monthlyPaydayDay);

  if (referenceDate < currentPayday) {
    return buildPeriod(previousPayday, addDays(currentPayday, -1), 'monthly');
  }
  return buildPeriod(currentPayday, addDays(nextPayday, -1), 'monthly');
}

export function getMonthlyPeriod(referenceDate?: Date | string, timezone = DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone): FinancialPeriod {
  const businessDate = toBusinessDateString(referenceDate, getSafeTimezone(timezone));
  const { year, month } = parseDateParts(businessDate);
  const startDate = `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const endDate = `${year.toString().padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
  return buildPeriod(startDate, endDate, 'month');
}

export function normalizeFinancialPeriodConfig(input?: Partial<FinancialPeriodConfig> | null): FinancialPeriodConfig {
  const base = {
    ...DEFAULT_FINANCIAL_PERIOD_CONFIG,
    ...(input || {}),
  };

  const normalizedTimezone = typeof base.timezone === 'string' && base.timezone.trim().length > 0
    ? base.timezone.trim()
    : DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone;
  const normalizedFrequency = base.incomeFrequency || DEFAULT_FINANCIAL_PERIOD_CONFIG.incomeFrequency;
  const normalizedConfig: FinancialPeriodConfig = {
    incomeFrequency: normalizedFrequency,
    payCycleAnchorDate: normalizeDateString(base.payCycleAnchorDate),
    weeklyPayday: normalizeWeeklyPayday(base.weeklyPayday),
    semimonthlyDay1: parseInteger(base.semimonthlyDay1),
    semimonthlyDay2: parseInteger(base.semimonthlyDay2),
    monthlyPaydayRule: base.monthlyPaydayRule || DEFAULT_FINANCIAL_PERIOD_CONFIG.monthlyPaydayRule,
    monthlyPaydayDay: parseInteger(base.monthlyPaydayDay),
    defaultDashboardPeriod: base.defaultDashboardPeriod || DEFAULT_FINANCIAL_PERIOD_CONFIG.defaultDashboardPeriod,
    defaultBudgetPeriod: base.defaultBudgetPeriod || DEFAULT_FINANCIAL_PERIOD_CONFIG.defaultBudgetPeriod,
    weekStartsOn: base.weekStartsOn || DEFAULT_FINANCIAL_PERIOD_CONFIG.weekStartsOn,
    weekStartsOnCustomDay: parseInteger(base.weekStartsOnCustomDay),
    timezone: normalizedTimezone,
    customCycleDays: parseInteger(base.customCycleDays),
  };

  if (normalizedConfig.incomeFrequency === 'irregular') {
    normalizedConfig.defaultDashboardPeriod = 'month';
  }

  if (normalizedConfig.incomeFrequency !== 'weekly') {
    normalizedConfig.weeklyPayday = null;
  }
  if (normalizedConfig.incomeFrequency !== 'semimonthly') {
    normalizedConfig.semimonthlyDay1 = null;
    normalizedConfig.semimonthlyDay2 = null;
  }
  if (normalizedConfig.incomeFrequency !== 'monthly') {
    normalizedConfig.monthlyPaydayRule = DEFAULT_FINANCIAL_PERIOD_CONFIG.monthlyPaydayRule;
    normalizedConfig.monthlyPaydayDay = null;
  }
  if (normalizedConfig.incomeFrequency !== 'custom') {
    normalizedConfig.customCycleDays = null;
  }
  if (normalizedConfig.incomeFrequency !== 'weekly' && normalizedConfig.incomeFrequency !== 'biweekly' && normalizedConfig.incomeFrequency !== 'custom') {
    normalizedConfig.payCycleAnchorDate = null;
  }
  if (normalizedConfig.weekStartsOn !== 'custom') {
    normalizedConfig.weekStartsOnCustomDay = null;
  }

  return normalizedConfig;
}

export function validateFinancialPeriodConfig(input?: Partial<FinancialPeriodConfig> | null): FinancialPeriodValidationResult {
  const config = normalizeFinancialPeriodConfig(input);
  const errors: string[] = [];
  const fieldErrors: FinancialPeriodValidationResult['fieldErrors'] = {};

  if (!normalizeTimezone(config.timezone)) {
    fieldErrors.timezone = 'Enter a valid IANA timezone such as Europe/London or Asia/Dubai.';
    errors.push(fieldErrors.timezone);
  }

  if (config.weekStartsOn === 'custom') {
    if (config.weekStartsOnCustomDay === null || config.weekStartsOnCustomDay < 0 || config.weekStartsOnCustomDay > 6) {
      fieldErrors.weekStartsOnCustomDay = 'Custom week start must be a day index from 0 to 6.';
      errors.push(fieldErrors.weekStartsOnCustomDay);
    }
  }

  if (config.incomeFrequency === 'weekly') {
    if (!config.payCycleAnchorDate && !config.weeklyPayday) {
      fieldErrors.payCycleAnchorDate = 'Weekly schedules need a recent or upcoming payday anchor date.';
      errors.push(fieldErrors.payCycleAnchorDate);
    }
  }

  if (config.incomeFrequency === 'biweekly' && !config.payCycleAnchorDate) {
    fieldErrors.payCycleAnchorDate = 'Every 2 weeks schedules need one recent or upcoming payday anchor date.';
    errors.push(fieldErrors.payCycleAnchorDate);
  }

  if (config.incomeFrequency === 'custom') {
    if (!config.payCycleAnchorDate) {
      fieldErrors.payCycleAnchorDate = 'Custom schedules need an anchor date.';
      errors.push(fieldErrors.payCycleAnchorDate);
    }
    if (
      config.customCycleDays === null ||
      config.customCycleDays < CUSTOM_CYCLE_MIN_DAYS ||
      config.customCycleDays > CUSTOM_CYCLE_MAX_DAYS
    ) {
      fieldErrors.customCycleDays = `Custom schedules must repeat every ${CUSTOM_CYCLE_MIN_DAYS}-${CUSTOM_CYCLE_MAX_DAYS} days.`;
      errors.push(fieldErrors.customCycleDays);
    }
  }

  if (config.incomeFrequency === 'semimonthly') {
    if (config.semimonthlyDay1 === null) {
      fieldErrors.semimonthlyDay1 = 'Choose the first semimonthly payday.';
      errors.push(fieldErrors.semimonthlyDay1);
    }
    if (config.semimonthlyDay2 === null) {
      fieldErrors.semimonthlyDay2 = 'Choose the second semimonthly payday.';
      errors.push(fieldErrors.semimonthlyDay2);
    }
    if (config.semimonthlyDay1 !== null && (config.semimonthlyDay1 < 0 || config.semimonthlyDay1 > 31)) {
      fieldErrors.semimonthlyDay1 = 'Semimonthly day 1 must be 1-31 or Last day of the month.';
      errors.push(fieldErrors.semimonthlyDay1);
    }
    if (config.semimonthlyDay2 !== null && (config.semimonthlyDay2 < 0 || config.semimonthlyDay2 > 31)) {
      fieldErrors.semimonthlyDay2 = 'Semimonthly day 2 must be 1-31 or Last day of the month.';
      errors.push(fieldErrors.semimonthlyDay2);
    }
    if (
      config.semimonthlyDay1 !== null &&
      config.semimonthlyDay2 !== null &&
      config.semimonthlyDay1 === config.semimonthlyDay2
    ) {
      fieldErrors.semimonthlyDay2 = 'Twice-a-month schedules need two different payday positions.';
      errors.push(fieldErrors.semimonthlyDay2);
    }
    if (
      config.semimonthlyDay1 !== null &&
      config.semimonthlyDay2 !== null &&
      compareSemimonthlyDayValues(config.semimonthlyDay1, config.semimonthlyDay2) >= 0
    ) {
      fieldErrors.semimonthlyDay2 = 'The second semimonthly payday must be later in the month than the first.';
      errors.push(fieldErrors.semimonthlyDay2);
    }
  }

  if (config.incomeFrequency === 'monthly') {
    if (!config.monthlyPaydayRule) {
      fieldErrors.monthlyPaydayRule = 'Choose how monthly payday should be calculated.';
      errors.push(fieldErrors.monthlyPaydayRule);
    }
    if (config.monthlyPaydayRule === 'specific_day') {
      if (config.monthlyPaydayDay === null || config.monthlyPaydayDay < 1 || config.monthlyPaydayDay > 31) {
        fieldErrors.monthlyPaydayDay = 'Specific monthly payday must be a day from 1 to 31.';
        errors.push(fieldErrors.monthlyPaydayDay);
      }
    }
  }

  if (config.incomeFrequency === 'irregular' && config.defaultDashboardPeriod !== 'month') {
    fieldErrors.defaultDashboardPeriod = 'Irregular income uses current month as the dashboard default.';
    errors.push(fieldErrors.defaultDashboardPeriod);
  }

  return {
    isValid: errors.length === 0,
    errors,
    fieldErrors,
  };
}

export function getPeriodContainingDate(configInput: Partial<FinancialPeriodConfig> | null | undefined, date?: Date | string): FinancialPeriod {
  const config = normalizeFinancialPeriodConfig(configInput);
  const referenceDate = toBusinessDateString(date, config.timezone);

  switch (config.incomeFrequency) {
    case 'weekly':
      return getWeeklyPeriod(config, referenceDate);
    case 'biweekly':
      return getBiweeklyPeriod(config, referenceDate);
    case 'semimonthly':
      return getSemimonthlyPeriod(config, referenceDate);
    case 'monthly':
      return getMonthlyCyclePeriod(config, referenceDate);
    case 'custom':
      return getCustomPeriod(config, referenceDate);
    case 'irregular':
    default:
      return getMonthlyPeriod(referenceDate, config.timezone);
  }
}

export function getCurrentFinancialPeriod(config: Partial<FinancialPeriodConfig> | null | undefined, referenceDate?: Date | string) {
  return getPeriodContainingDate(config, referenceDate);
}

export function getPreviousFinancialPeriod(config: Partial<FinancialPeriodConfig> | null | undefined, referenceDate?: Date | string) {
  const current = getPeriodContainingDate(config, referenceDate);
  return getPeriodContainingDate(config, addDays(current.startDate, -1));
}

export function getNextFinancialPeriod(config: Partial<FinancialPeriodConfig> | null | undefined, referenceDate?: Date | string) {
  const current = getPeriodContainingDate(config, referenceDate);
  return getPeriodContainingDate(config, addDays(current.endDate, 1));
}

export function formatFinancialPeriodLabel(period: FinancialPeriod, locale = 'en-US') {
  const start = toUtcNoonDate(period.startDate);
  const end = toUtcNoonDate(period.endDate);
  const sharedYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sharedMonth = sharedYear && start.getUTCMonth() === end.getUTCMonth();
  const startLabel = new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(sharedYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(start);
  const endLabel = new Intl.DateTimeFormat(locale, {
    month: sharedMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(end);
  return `${startLabel} - ${endLabel}`;
}
