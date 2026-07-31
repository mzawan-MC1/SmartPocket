import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_FINANCIAL_PERIOD_CONFIG,
  getCurrentBusinessDate,
  normalizeFinancialPeriodConfig,
  getCurrentFinancialPeriod,
  getMonthlyPeriod,
  validateFinancialPeriodConfig,
  type BudgetPeriod,
  type DashboardPeriodPreference,
  type FinancialPeriod,
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

const cachedFinancialPeriodProfileConfigByUserId = new Map<string, FinancialPeriodConfig>();
const cachedFinancialPeriodRuntimeContextByUserId = new Map<string, UserFinancialPeriodContext>();
const inFlightFinancialPeriodRuntimeContextByUserId = new Map<string, Promise<UserFinancialPeriodContext>>();
const latestFinancialPeriodLoadIdByUserId = new Map<string, number>();
let nextFinancialPeriodLoadId = 0;

export interface UserFinancialPeriodContext {
  config: FinancialPeriodConfig;
  effectiveConfig: FinancialPeriodConfig;
  timezone: string;
  defaultDashboardPeriod: DashboardPeriodPreference;
  currentBusinessDate: string;
  currentFinancialPeriod: FinancialPeriod;
  currentMonthlyPeriod: FinancialPeriod;
  hasConfigurationWarning: boolean;
  configurationWarning: string | null;
}

export interface LoadUserFinancialPeriodContextOptions {
  userId?: string | null;
}

export function clearFinancialPeriodProfileCache(userId?: string | null) {
  const normalizedUserId =
    typeof userId === 'string' && userId.trim()
      ? userId.trim()
      : null;

  if (normalizedUserId) {
    latestFinancialPeriodLoadIdByUserId.set(normalizedUserId, ++nextFinancialPeriodLoadId);
    cachedFinancialPeriodProfileConfigByUserId.delete(normalizedUserId);
    cachedFinancialPeriodRuntimeContextByUserId.delete(normalizedUserId);
    inFlightFinancialPeriodRuntimeContextByUserId.delete(normalizedUserId);
    return;
  }

  const userIds = new Set<string>([
    ...cachedFinancialPeriodProfileConfigByUserId.keys(),
    ...cachedFinancialPeriodRuntimeContextByUserId.keys(),
    ...inFlightFinancialPeriodRuntimeContextByUserId.keys(),
    ...latestFinancialPeriodLoadIdByUserId.keys(),
  ]);

  for (const activeUserId of userIds) {
    latestFinancialPeriodLoadIdByUserId.set(activeUserId, ++nextFinancialPeriodLoadId);
  }

  cachedFinancialPeriodProfileConfigByUserId.clear();
  cachedFinancialPeriodRuntimeContextByUserId.clear();
  inFlightFinancialPeriodRuntimeContextByUserId.clear();
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
  const normalized = normalizeFinancialPeriodConfig({
    incomeFrequency: row?.income_frequency || undefined,
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

function buildSafeMonthlyFallback(config: FinancialPeriodConfig): FinancialPeriodConfig {
  return normalizeFinancialPeriodConfig({
    ...config,
    incomeFrequency: 'irregular',
    defaultDashboardPeriod: 'month',
  });
}

function buildRuntimeContext(row?: Partial<FinancialPeriodProfileRow> | null): UserFinancialPeriodContext {
  const config = toFinancialPeriodConfig(row);
  const validation = validateFinancialPeriodConfig(config);
  const effectiveConfig = validation.isValid ? config : buildSafeMonthlyFallback(config);
  const timezone = effectiveConfig.timezone || DEFAULT_FINANCIAL_PERIOD_CONFIG.timezone;
  const currentBusinessDate = getCurrentBusinessDate(timezone);
  const currentFinancialPeriod = getCurrentFinancialPeriod(effectiveConfig, currentBusinessDate);
  const currentMonthlyPeriod = getMonthlyPeriod(currentBusinessDate, timezone);

  return {
    config,
    effectiveConfig,
    timezone,
    defaultDashboardPeriod: validation.isValid ? config.defaultDashboardPeriod : 'month',
    currentBusinessDate,
    currentFinancialPeriod,
    currentMonthlyPeriod,
    hasConfigurationWarning: !validation.isValid,
    configurationWarning: validation.isValid
      ? null
      : 'Your income schedule is incomplete, so Smart Pocket is using the current month. Update Income & Planning in Settings.',
  };
}

function cacheFinancialPeriodContext(userId: string, context: UserFinancialPeriodContext) {
  cachedFinancialPeriodRuntimeContextByUserId.set(userId, context);
  cachedFinancialPeriodProfileConfigByUserId.set(userId, context.config);
  return context;
}

function isFinancialPeriodAuthError(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error || '');
  const normalizedMessage = errorMessage.toLowerCase();
  const errorStatus =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status?: unknown }).status)
      : null;
  const errorCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code || '').toLowerCase()
      : '';
  const errorName =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name?: unknown }).name || '').toLowerCase()
      : '';

  return errorStatus === 401
    || errorStatus === 403
    || errorCode === 'pgrst301'
    || errorName === 'authapierror'
    || normalizedMessage.includes('jwt')
    || normalizedMessage.includes('auth session missing')
    || normalizedMessage.includes('invalid refresh token')
    || normalizedMessage.includes('refresh token not found')
    || normalizedMessage.includes('refresh_token_not_found')
    || normalizedMessage.includes('session not found');
}

async function loadFinancialPeriodContextFromProfile(args: {
  userId: string;
}): Promise<UserFinancialPeriodContext> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('user_profiles')
    .select(FINANCIAL_PERIOD_PROFILE_SELECT)
    .eq('id', args.userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return buildRuntimeContext((data || null) as Partial<FinancialPeriodProfileRow> | null);
}

export async function loadUserFinancialPeriodContext(
  options: LoadUserFinancialPeriodContextOptions = {}
): Promise<UserFinancialPeriodContext> {
  const userIdFromOptions =
    typeof options.userId === 'string' && options.userId.trim()
      ? options.userId.trim()
      : null;
  const supabase = createClient();
  let sessionData: Awaited<ReturnType<typeof supabase.auth.getSession>> | null = null;

  if (!userIdFromOptions) {
    sessionData = await supabase.auth.getSession();
  }

  const userId = userIdFromOptions || sessionData?.data.session?.user?.id || null;

  if (!userId) {
    return buildRuntimeContext(null);
  }

  const cachedContext = cachedFinancialPeriodRuntimeContextByUserId.get(userId);
  if (cachedContext) {
    return cachedContext;
  }

  const inFlightContext = inFlightFinancialPeriodRuntimeContextByUserId.get(userId);
  if (inFlightContext) {
    return inFlightContext;
  }

  const loadId = ++nextFinancialPeriodLoadId;
  latestFinancialPeriodLoadIdByUserId.set(userId, loadId);

  const baseLoadPromise = (async () => {
    try {
      const nextContext = await loadFinancialPeriodContextFromProfile({ userId });
      if (latestFinancialPeriodLoadIdByUserId.get(userId) === loadId) {
        return cacheFinancialPeriodContext(userId, nextContext);
      }
      return nextContext;
    } catch (error) {
      if (isFinancialPeriodAuthError(error)) {
        throw error;
      }

      const fallbackContext = buildRuntimeContext(null);
      if (latestFinancialPeriodLoadIdByUserId.get(userId) === loadId) {
        return cacheFinancialPeriodContext(userId, fallbackContext);
      }
      return fallbackContext;
    }
  })();

  const loadPromise = baseLoadPromise.finally(() => {
    if (inFlightFinancialPeriodRuntimeContextByUserId.get(userId) === loadPromise) {
      inFlightFinancialPeriodRuntimeContextByUserId.delete(userId);
    }
  });

  inFlightFinancialPeriodRuntimeContextByUserId.set(userId, loadPromise);
  return loadPromise;
}
