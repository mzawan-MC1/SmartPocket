import {
  formatCalendarMonthLabel,
  formatFinancialPeriodLabel,
  getCurrentFinancialPeriod,
  getCurrentBusinessDate,
  getMonthContext,
  getNextFinancialPeriod,
  getPeriodContainingDate,
  getPreviousFinancialPeriod,
  type FinancialPeriodConfig,
} from './index';

export type ReportPeriodPreset =
  | 'current_pay_period'
  | 'previous_pay_period'
  | 'current_month'
  | 'previous_month'
  | 'current_quarter'
  | 'current_year'
  | 'last_30_days'
  | 'year_to_date'
  | 'custom';

export interface ReportPeriodRange {
  preset: ReportPeriodPreset;
  startDate: string;
  endDate: string;
  label: string;
  presetLabelKey: string;
  presetLabel: string;
  comparisonLabel: string | null;
  navigationLabel: string | null;
  isCustom: boolean;
  canNavigateForward: boolean;
}

interface PlainReportPeriodRange {
  preset: ReportPeriodPreset;
  startDate: string;
  endDate: string;
  label: string;
  presetLabelKey: string;
  presetLabel: string;
  navigationLabel: string | null;
  isCustom: boolean;
}

interface ResolveReportPeriodPresetArgs {
  preset: ReportPeriodPreset;
  config: FinancialPeriodConfig;
  locale?: string;
  referenceDate?: string;
  customRange?: {
    startDate: string;
    endDate: string;
  };
}

function addDays(dateString: string, amount: number) {
  const date = toUtcNoonDate(dateString);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function toUtcNoonDate(dateString: string) {
  return new Date(`${dateString}T12:00:00Z`);
}

function formatQuarterLabel(startDate: string) {
  const date = toUtcNoonDate(startDate);
  const quarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return `Q${quarter} ${date.getUTCFullYear()}`;
}

function formatYearLabel(startDate: string) {
  return toUtcNoonDate(startDate).getUTCFullYear().toString();
}

function getQuarterRange(referenceDate: string) {
  const date = toUtcNoonDate(referenceDate);
  const year = date.getUTCFullYear();
  const startMonth = Math.floor(date.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1, 12, 0, 0));
  const end = new Date(Date.UTC(year, startMonth + 3, 0, 12, 0, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function getYearRange(referenceDate: string) {
  const year = toUtcNoonDate(referenceDate).getUTCFullYear();
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

function shiftMonthKey(monthKey: string, amount: number) {
  const [yearText, monthText] = monthKey.split('-');
  const shifted = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + amount, 1, 12, 0, 0));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shiftQuarter(referenceDate: string, amount: number) {
  const date = toUtcNoonDate(referenceDate);
  date.setUTCMonth(date.getUTCMonth() + amount * 3);
  return date.toISOString().slice(0, 10);
}

function shiftYear(referenceDate: string, amount: number) {
  const date = toUtcNoonDate(referenceDate);
  date.setUTCFullYear(date.getUTCFullYear() + amount);
  return date.toISOString().slice(0, 10);
}

function getReportPresetLabelKey(preset: ReportPeriodPreset, config: FinancialPeriodConfig) {
  const isPlanningFallback = config.incomeFrequency === 'irregular';
  if (preset === 'current_pay_period') {
    return isPlanningFallback
      ? 'reports.presets.currentPlanningPeriod'
      : 'reports.presets.currentPayPeriod';
  }
  if (preset === 'previous_pay_period') {
    return isPlanningFallback
      ? 'reports.presets.previousPlanningPeriod'
      : 'reports.presets.previousPayPeriod';
  }
  switch (preset) {
    case 'current_month':
      return 'reports.presets.currentMonth';
    case 'previous_month':
      return 'reports.presets.previousMonth';
    case 'current_quarter':
      return 'reports.presets.currentQuarter';
    case 'current_year':
      return 'reports.presets.currentYear';
    case 'last_30_days':
      return 'reports.presets.last30Days';
    case 'year_to_date':
      return 'reports.presets.yearToDate';
    case 'custom':
    default:
      return 'reports.presets.custom';
  }
}

function buildPlanningPresetLabel(preset: ReportPeriodPreset, config: FinancialPeriodConfig) {
  switch (getReportPresetLabelKey(preset, config)) {
    case 'reports.presets.currentPlanningPeriod':
      return 'Current planning period';
    case 'reports.presets.currentPayPeriod':
      return 'Current pay period';
    case 'reports.presets.previousPlanningPeriod':
      return 'Previous planning period';
    case 'reports.presets.previousPayPeriod':
      return 'Previous pay period';
    case 'reports.presets.currentMonth':
      return 'Current month';
    case 'reports.presets.previousMonth':
      return 'Previous month';
    case 'reports.presets.currentQuarter':
      return 'Current quarter';
    case 'reports.presets.currentYear':
      return 'Current year';
    case 'reports.presets.last30Days':
      return 'Last 30 days';
    case 'reports.presets.yearToDate':
      return 'Year to date';
    case 'reports.presets.custom':
    default:
      return 'Custom range';
  }
}

function buildRangeLabel(
  preset: ReportPeriodPreset,
  startDate: string,
  endDate: string,
  locale: string | undefined
) {
  if (preset === 'current_month' || preset === 'previous_month') {
    return formatCalendarMonthLabel(startDate, locale);
  }
  if (preset === 'current_quarter') {
    return formatQuarterLabel(startDate);
  }
  if (preset === 'current_year') {
    return formatYearLabel(startDate);
  }
  return formatFinancialPeriodLabel({
    startDate,
    endDate,
    frequency: 'month',
  }, locale);
}

function resolvePlainReportPeriod(args: ResolveReportPeriodPresetArgs): PlainReportPeriodRange {
  const locale = args.locale;
  const referenceDate = args.referenceDate || getCurrentBusinessDate(args.config.timezone);
  const presetLabelKey = getReportPresetLabelKey(args.preset, args.config);
  const presetLabel = buildPlanningPresetLabel(args.preset, args.config);

  if (args.preset === 'custom') {
    const rawStartDate = args.customRange?.startDate || referenceDate;
    const rawEndDate = args.customRange?.endDate || referenceDate;
    const startDate = rawStartDate <= rawEndDate ? rawStartDate : rawEndDate;
    const endDate = rawStartDate <= rawEndDate ? rawEndDate : rawStartDate;
    return {
      preset: 'custom',
      startDate,
      endDate,
      label: buildRangeLabel('custom', startDate, endDate, locale),
      presetLabelKey,
      presetLabel,
      navigationLabel: null,
      isCustom: true,
    };
  }

  let startDate = referenceDate;
  let endDate = referenceDate;
  let navigationLabel: string | null = null;

  switch (args.preset) {
    case 'current_pay_period': {
      const period = getCurrentFinancialPeriod(args.config, referenceDate);
      startDate = period.startDate;
      endDate = period.endDate;
      navigationLabel = args.config.incomeFrequency === 'irregular'
        ? 'reports.navigation.planningPeriod'
        : 'reports.navigation.payPeriod';
      break;
    }
    case 'previous_pay_period': {
      const period = getPreviousFinancialPeriod(args.config, referenceDate);
      startDate = period.startDate;
      endDate = period.endDate;
      navigationLabel = args.config.incomeFrequency === 'irregular'
        ? 'reports.navigation.planningPeriod'
        : 'reports.navigation.payPeriod';
      break;
    }
    case 'current_month': {
      const month = getMonthContext(referenceDate.slice(0, 7), args.config.timezone);
      startDate = month.startDate;
      endDate = month.endDate;
      navigationLabel = 'reports.navigation.month';
      break;
    }
    case 'previous_month': {
      const month = getMonthContext(shiftMonthKey(referenceDate.slice(0, 7), -1), args.config.timezone);
      startDate = month.startDate;
      endDate = month.endDate;
      navigationLabel = 'reports.navigation.month';
      break;
    }
    case 'current_quarter': {
      const quarter = getQuarterRange(referenceDate);
      startDate = quarter.startDate;
      endDate = quarter.endDate;
      navigationLabel = 'reports.navigation.quarter';
      break;
    }
    case 'current_year': {
      const year = getYearRange(referenceDate);
      startDate = year.startDate;
      endDate = year.endDate;
      navigationLabel = 'reports.navigation.year';
      break;
    }
    case 'last_30_days': {
      endDate = referenceDate;
      startDate = addDays(referenceDate, -29);
      break;
    }
    case 'year_to_date': {
      startDate = `${referenceDate.slice(0, 4)}-01-01`;
      endDate = referenceDate;
      break;
    }
  }

  return {
    preset: args.preset,
    startDate,
    endDate,
    label: buildRangeLabel(args.preset, startDate, endDate, locale),
    presetLabelKey,
    presetLabel,
    navigationLabel,
    isCustom: false,
  };
}

function resolveReportPeriodPresetInternal(
  args: ResolveReportPeriodPresetArgs,
  includeComparison: boolean
): ReportPeriodRange {
  const plainRange = resolvePlainReportPeriod(args);
  const previous = includeComparison
    ? getPreviousComparableReportPeriod({
      preset: plainRange.preset,
      config: args.config,
      locale: args.locale,
      startDate: plainRange.startDate,
      endDate: plainRange.endDate,
    })
    : null;
  const currentEquivalent = plainRange.isCustom
    ? plainRange
    : resolvePlainReportPeriod({
      preset: plainRange.preset,
      config: args.config,
      locale: args.locale,
      referenceDate: getCurrentBusinessDate(args.config.timezone),
    });

  return {
    ...plainRange,
    comparisonLabel: previous ? previous.label : null,
    canNavigateForward: plainRange.endDate < currentEquivalent.endDate,
  };
}

export function resolveReportPeriodPreset(args: ResolveReportPeriodPresetArgs): ReportPeriodRange {
  return resolveReportPeriodPresetInternal(args, true);
}

export function getPreviousComparableReportPeriod(args: {
  preset: ReportPeriodPreset;
  config: FinancialPeriodConfig;
  locale?: string;
  startDate: string;
  endDate: string;
}): ReportPeriodRange | null {
  switch (args.preset) {
    case 'current_pay_period':
    case 'previous_pay_period': {
      const previous = getPreviousFinancialPeriod(args.config, args.startDate);
      return {
        ...resolvePlainReportPeriod({
        preset: args.preset,
        config: args.config,
        locale: args.locale,
        referenceDate: previous.startDate,
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    }
    case 'current_month':
    case 'previous_month':
      return {
        ...resolvePlainReportPeriod({
        preset: args.preset,
        config: args.config,
        locale: args.locale,
        referenceDate: shiftMonthKey(args.startDate.slice(0, 7), -1),
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    case 'current_quarter':
      return {
        ...resolvePlainReportPeriod({
        preset: args.preset,
        config: args.config,
        locale: args.locale,
        referenceDate: shiftQuarter(args.startDate, -1),
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    case 'current_year':
      return {
        ...resolvePlainReportPeriod({
        preset: args.preset,
        config: args.config,
        locale: args.locale,
        referenceDate: shiftYear(args.startDate, -1),
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    case 'last_30_days': {
      const endDate = addDays(args.startDate, -1);
      return {
        ...resolvePlainReportPeriod({
        preset: 'custom',
        config: args.config,
        locale: args.locale,
        customRange: {
          startDate: addDays(endDate, -29),
          endDate,
        },
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    }
    case 'year_to_date': {
      const previousYearStart = `${String(Number(args.startDate.slice(0, 4)) - 1)}-01-01`;
      const previousYearEnd = `${String(Number(args.startDate.slice(0, 4)) - 1)}-${args.endDate.slice(5)}`;
      return {
        ...resolvePlainReportPeriod({
        preset: 'custom',
        config: args.config,
        locale: args.locale,
        customRange: {
          startDate: previousYearStart,
          endDate: previousYearEnd,
        },
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    }
    case 'custom':
    default:
      return null;
  }
}

export function getNextComparableReportPeriod(args: {
  preset: ReportPeriodPreset;
  config: FinancialPeriodConfig;
  locale?: string;
  startDate: string;
  endDate: string;
}): ReportPeriodRange | null {
  switch (args.preset) {
    case 'current_pay_period':
    case 'previous_pay_period': {
      const next = getNextFinancialPeriod(args.config, args.startDate);
      return {
        ...resolvePlainReportPeriod({
        preset: args.preset,
        config: args.config,
        locale: args.locale,
        referenceDate: next.startDate,
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    }
    case 'current_month':
    case 'previous_month':
      return {
        ...resolvePlainReportPeriod({
        preset: args.preset,
        config: args.config,
        locale: args.locale,
        referenceDate: shiftMonthKey(args.startDate.slice(0, 7), 1),
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    case 'current_quarter':
      return {
        ...resolvePlainReportPeriod({
        preset: args.preset,
        config: args.config,
        locale: args.locale,
        referenceDate: shiftQuarter(args.startDate, 1),
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    case 'current_year':
      return {
        ...resolvePlainReportPeriod({
        preset: args.preset,
        config: args.config,
        locale: args.locale,
        referenceDate: shiftYear(args.startDate, 1),
        }),
        comparisonLabel: null,
        canNavigateForward: false,
      };
    case 'last_30_days':
    case 'year_to_date':
    case 'custom':
    default:
      return null;
  }
}

export function formatReportPeriodLabel(period: ReportPeriodRange) {
  return period.label;
}

export function getInitialReportPreset(config: FinancialPeriodConfig): ReportPeriodPreset {
  return config.defaultDashboardPeriod === 'pay_cycle' ? 'current_pay_period' : 'current_month';
}

export function getReportPeriodFromDate(
  preset: ReportPeriodPreset,
  config: FinancialPeriodConfig,
  referenceDate: string,
  locale?: string
) {
  if (preset === 'custom') {
    return resolveReportPeriodPreset({
      preset,
      config,
      locale,
      customRange: {
        startDate: referenceDate,
        endDate: referenceDate,
      },
    });
  }
  if (preset === 'current_pay_period' || preset === 'previous_pay_period') {
    const period = getPeriodContainingDate(config, referenceDate);
    return resolveReportPeriodPreset({
      preset,
      config,
      locale,
      referenceDate: period.startDate,
    });
  }
  return resolveReportPeriodPreset({
    preset,
    config,
    locale,
    referenceDate,
  });
}
