'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, PieChart, TrendingUp, FileText, Target, FileDown, Printer,
  Calendar, Filter, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import {
  buildHistoricalRateUnavailableMessage,
  convertHistoricalAmountWithSnapshots,
  getReportViewData,
  type HistoricalReportConvertedMetric,
  type ReportBudgetPerformanceChartRow,
  type ReportBudgetPerformanceItem,
  type ReportViewData,
  type Transaction,
} from '@/lib/finance';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { loadUserFinancialPeriodContext, type UserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import {
  formatReportPeriodLabel,
  getInitialReportPreset,
  getNextComparableReportPeriod,
  getPreviousComparableReportPeriod,
  resolveReportPeriodPreset,
  type ReportPeriodPreset,
  type ReportPeriodRange,
} from '@/lib/financial-periods/reports';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';
import { getBudgetPeriodTypeLabel } from '@/lib/financial-periods/budgets';
import { getFinancialAccountDisplayLabel } from '@/lib/financial-account-utils';
import { getMySpaceMemberships, type Space } from '@/lib/spaces';

const IncomeExpenseReportChart = dynamic(() => import('./charts/IncomeExpenseReportChart'), { ssr: false });
const SpendingCategoryReportChart = dynamic(() => import('./charts/SpendingCategoryReportChart'), { ssr: false });
const MonthlyTrendsChart = dynamic(() => import('./charts/MonthlyTrendsChart'), { ssr: false });
const BudgetPerformanceChart = dynamic(() => import('./charts/BudgetPerformanceChart'), { ssr: false });

type ReportType = 'income-expense' | 'spending-category' | 'monthly-trends' | 'budget-performance' | 'account-statement';
type IncomeExpenseChartRow = { month: string; income: number; expenses: number; net: number };
type SpendingCategoryChartRow = { id: string; category: string; amount: number; color: string };
type ChartState<T> = {
  data: T[];
  unavailableReason: string | null;
  emptyReason: string | null;
};
type ReportGrouping = 'day' | 'week' | 'month';

const reportTypes = [
  { id: 'income-expense' as ReportType, icon: TrendingUp },
  { id: 'spending-category' as ReportType, icon: PieChart },
  { id: 'monthly-trends' as ReportType, icon: BarChart3 },
  { id: 'budget-performance' as ReportType, icon: Target },
  { id: 'account-statement' as ReportType, icon: FileText },
];

const reportPresets: ReportPeriodPreset[] = [
  'current_pay_period',
  'previous_pay_period',
  'current_month',
  'previous_month',
  'current_quarter',
  'current_year',
  'last_30_days',
  'year_to_date',
  'custom',
];

const visibleReportPresets = reportPresets.filter((preset) => preset !== 'year_to_date');

function getPresetButtonLabel(
  preset: ReportPeriodPreset,
  context: UserFinancialPeriodContext | null,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (context?.effectiveConfig.incomeFrequency === 'irregular') {
    if (preset === 'current_pay_period') return t('reports.presets.currentPlanningPeriod');
    if (preset === 'previous_pay_period') return t('reports.presets.previousPlanningPeriod');
  }
  switch (preset) {
    case 'current_pay_period':
      return t('reports.presets.currentPayPeriod');
    case 'previous_pay_period':
      return t('reports.presets.previousPayPeriod');
    case 'current_month':
      return t('reports.presets.currentMonth');
    case 'previous_month':
      return t('reports.presets.previousMonth');
    case 'current_quarter':
      return t('reports.presets.currentQuarter');
    case 'current_year':
      return t('reports.presets.currentYear');
    case 'last_30_days':
      return t('reports.presets.last30Days');
    case 'year_to_date':
      return t('reports.presets.yearToDate');
    case 'custom':
      return t('reports.presets.custom');
    default:
      return preset;
  }
}

const CATEGORY_FALLBACK_COLORS = [
  '#7c3aed',
  '#f97316',
  '#2563eb',
  '#d97706',
  '#8b5cf6',
  '#ec4899',
  '#dc2626',
  '#94a3b8',
];

function toUtcNoonDate(dateString: string) {
  return new Date(`${dateString}T12:00:00Z`);
}

function addDays(dateString: string, amount: number) {
  const date = toUtcNoonDate(dateString);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function differenceInDays(left: string, right: string) {
  return Math.round((toUtcNoonDate(left).getTime() - toUtcNoonDate(right).getTime()) / (1000 * 60 * 60 * 24));
}

function formatDayLabel(dateString: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(toUtcNoonDate(dateString));
}

function formatMonthLabel(dateString: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(toUtcNoonDate(dateString));
}

function formatBucketLabel(grouping: ReportGrouping, bucketStart: string, bucketEnd: string, locale: string) {
  if (grouping === 'day') {
    return formatDayLabel(bucketStart, locale);
  }
  if (grouping === 'week') {
    return `${formatDayLabel(bucketStart, locale)} – ${formatDayLabel(bucketEnd, locale)}`;
  }
  return formatMonthLabel(bucketStart, locale);
}

function escapeCsvValue(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function renderOriginalCurrencyRows(
  rows: Array<{ currency: string; amount: number }>,
  positive?: boolean,
  emptyLabel?: string
) {
  if (rows.length === 0) {
    return <span className="text-sm text-muted-foreground">{emptyLabel ?? ''}</span>;
  }

  return (
    <div className="space-y-1">
      {rows.map((row) => (
        <FormattedCurrencyAmount
          key={`${row.currency}-${row.amount}`}
          amount={row.amount}
          currencyCode={row.currency}
          size="sm"
          className={`text-sm font-700 ${
            positive === true ? 'text-positive' : positive === false ? 'text-negative' : 'text-foreground'
          }`}
        />
      ))}
    </div>
  );
}

function getTransactionTypeLabel(
  transactionType: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (transactionType === 'income' || transactionType === 'expense' || transactionType === 'transfer') {
    return t(`transactions.types.${transactionType}`);
  }
  return transactionType;
}

function localizeReportMessage(
  message: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!message) return null;
  if (message.startsWith('reports.')) {
    return t(message, { ns: 'portal' });
  }
  if (message === 'No budgets apply to this report period') {
    return t('reports.noBudgetsApplyDescription');
  }
  if (message === 'Invalid financial-period configuration') {
    return t('reports.invalidFinancialPeriodConfiguration');
  }
  if (
    message === 'Exchange rates are unavailable'
    || message === 'Exchange-rate conversion failed'
    || message.startsWith('Historical conversion is unavailable')
    || message.startsWith('Historical rate unavailable')
    || message.startsWith('Historical rates unavailable')
  ) {
    return t('reports.historicalRateUnavailable');
  }
  return message;
}

function getLocalizedBudgetStatusLabel(
  item: Pick<ReportBudgetPerformanceItem, 'status' | 'warning'>,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (item.status === 'conversion_unavailable') {
    return item.warning && item.warning.startsWith('budgets.')
      ? t('budgets.configurationIncomplete')
      : t('budgets.conversionUnavailableTitle');
  }
  if (item.status === 'no_spending') return t('budgets.status.noSpending');
  if (item.status === 'over_budget') return t('budgets.status.overBudget');
  if (item.status === 'near_limit') return t('budgets.status.nearLimit');
  return t('budgets.status.onTrack');
}

function isFiniteAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function sanitizeIncomeExpenseChartRows(rows: unknown): IncomeExpenseChartRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is IncomeExpenseChartRow => {
    if (!row || typeof row !== 'object') return false;
    const candidate = row as Partial<IncomeExpenseChartRow>;
    return typeof candidate.month === 'string' &&
      candidate.month.length > 0 &&
      isFiniteAmount(candidate.income) &&
      isFiniteAmount(candidate.expenses) &&
      isFiniteAmount(candidate.net);
  });
}

function sanitizeSpendingCategoryChartRows(rows: unknown): SpendingCategoryChartRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is SpendingCategoryChartRow => {
    if (!row || typeof row !== 'object') return false;
    const candidate = row as Partial<SpendingCategoryChartRow>;
    return typeof candidate.id === 'string' &&
      candidate.id.length > 0 &&
      typeof candidate.category === 'string' &&
      candidate.category.length > 0 &&
      isFiniteAmount(candidate.amount) &&
      typeof candidate.color === 'string' &&
      candidate.color.length > 0;
  });
}

function sanitizeBudgetPerformanceChartRows(rows: unknown): ReportBudgetPerformanceChartRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is ReportBudgetPerformanceChartRow => {
    if (!row || typeof row !== 'object') return false;
    const candidate = row as Partial<ReportBudgetPerformanceChartRow>;
    return typeof candidate.id === 'string' &&
      candidate.id.length > 0 &&
      typeof candidate.category === 'string' &&
      candidate.category.length > 0 &&
      isFiniteAmount(candidate.allocated) &&
      isFiniteAmount(candidate.spent) &&
      typeof candidate.color === 'string' &&
      candidate.color.length > 0;
  });
}

function determineGrouping(range: ReportPeriodRange): ReportGrouping {
  const dayCount = differenceInDays(range.endDate, range.startDate) + 1;
  if (dayCount <= 16) return 'day';
  if (dayCount <= 93) return 'week';
  return 'month';
}

function buildIncomeExpenseChartState(args: {
  incomeTransactions: Transaction[];
  expenseTransactions: Transaction[];
  reportingCurrency: string;
  snapshots: ReportViewData['snapshots'];
  range: ReportPeriodRange;
  grouping: ReportGrouping;
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}): ChartState<IncomeExpenseChartRow> {
  const rows = new Map<string, IncomeExpenseChartRow>();
  const missingRateDates = new Set<string>();

  const ensureBucket = (dateString: string) => {
    let bucketStart = dateString;
    let bucketEnd = dateString;
    if (args.grouping === 'week') {
      const offset = Math.floor(differenceInDays(dateString, args.range.startDate) / 7);
      bucketStart = addDays(args.range.startDate, offset * 7);
      bucketEnd = addDays(bucketStart, 6);
      if (bucketEnd > args.range.endDate) bucketEnd = args.range.endDate;
    } else if (args.grouping === 'month') {
      bucketStart = `${dateString.slice(0, 7)}-01`;
      bucketEnd = bucketStart;
    }
    const key = args.grouping === 'month' ? dateString.slice(0, 7) : bucketStart;
    const current = rows.get(key) || {
      month: formatBucketLabel(args.grouping, bucketStart, bucketEnd, args.locale),
      income: 0,
      expenses: 0,
      net: 0,
    };
    rows.set(key, current);
    return current;
  };

  for (const transaction of args.incomeTransactions) {
    const conversion = convertHistoricalAmountWithSnapshots({
      amount: Number(transaction.amount || 0),
      fromCurrency: transaction.currency || args.reportingCurrency,
      reportingCurrency: args.reportingCurrency,
      rateDate: transaction.transaction_date,
      snapshots: args.snapshots,
    });
    if (conversion.convertedAmount === null) {
      if (conversion.missingRateDate) missingRateDates.add(conversion.missingRateDate);
      return {
        data: [],
        unavailableReason: buildHistoricalRateUnavailableMessage(missingRateDates, {
          locale: args.locale,
          t: args.t,
        }),
        emptyReason: null,
      };
    }
    const bucket = ensureBucket(transaction.transaction_date);
    bucket.income += conversion.convertedAmount;
    bucket.net += conversion.convertedAmount;
  }

  for (const transaction of args.expenseTransactions) {
    const conversion = convertHistoricalAmountWithSnapshots({
      amount: Math.abs(Number(transaction.amount || 0)),
      fromCurrency: transaction.currency || args.reportingCurrency,
      reportingCurrency: args.reportingCurrency,
      rateDate: transaction.transaction_date,
      snapshots: args.snapshots,
    });
    if (conversion.convertedAmount === null) {
      if (conversion.missingRateDate) missingRateDates.add(conversion.missingRateDate);
      return {
        data: [],
        unavailableReason: buildHistoricalRateUnavailableMessage(missingRateDates, {
          locale: args.locale,
          t: args.t,
        }),
        emptyReason: null,
      };
    }
    const bucket = ensureBucket(transaction.transaction_date);
    bucket.expenses += conversion.convertedAmount;
    bucket.net -= conversion.convertedAmount;
  }

  const data = Array.from(rows.values());
  return {
    data,
    unavailableReason: null,
    emptyReason: data.length === 0 ? 'NO_TRANSACTIONS' : null,
  };
}

function buildSpendingCategoryChartState(args: {
  expenseTransactions: Transaction[];
  reportingCurrency: string;
  snapshots: ReportViewData['snapshots'];
  t: (key: string, options?: Record<string, unknown>) => string;
  locale: string;
}): ChartState<SpendingCategoryChartRow> {
  const totals = new Map<string, SpendingCategoryChartRow>();
  const missingRateDates = new Set<string>();

  for (const transaction of args.expenseTransactions) {
    const conversion = convertHistoricalAmountWithSnapshots({
      amount: Math.abs(Number(transaction.amount || 0)),
      fromCurrency: transaction.currency || args.reportingCurrency,
      reportingCurrency: args.reportingCurrency,
      rateDate: transaction.transaction_date,
      snapshots: args.snapshots,
    });
    if (conversion.convertedAmount === null) {
      if (conversion.missingRateDate) missingRateDates.add(conversion.missingRateDate);
      return {
        data: [],
        unavailableReason: buildHistoricalRateUnavailableMessage(missingRateDates, {
          locale: args.locale,
          t: args.t,
        }),
        emptyReason: null,
      };
    }

    const categoryName = transaction.category?.name
      ? translateSystemCategoryName(transaction.category.name, (key, options) =>
          args.t(key, { ...(options || {}), ns: 'common' })
        )
      : args.t('transactions.uncategorized');
    const current = totals.get(categoryName) || {
      id: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      category: categoryName,
      amount: 0,
      color: transaction.category?.color || CATEGORY_FALLBACK_COLORS[totals.size % CATEGORY_FALLBACK_COLORS.length],
    };
    current.amount += conversion.convertedAmount;
    totals.set(categoryName, current);
  }

  const data = Array.from(totals.values())
    .filter((row) => row.amount > 0)
    .sort((left, right) => right.amount - left.amount);

  return {
    data,
    unavailableReason: null,
    emptyReason: data.length === 0 ? 'NO_EXPENSES' : null,
  };
}

function renderConvertedMetric(metric: HistoricalReportConvertedMetric, positive?: boolean) {
  if (metric.reportingAmount === null) {
    return renderOriginalCurrencyRows(metric.originalTotals, positive);
  }

  return (
    <FormattedCurrencyAmount
      amount={metric.reportingAmount}
      currencyCode={metric.reportingCurrency}
      size="sm"
      className={`text-sm font-700 ${
        positive === true ? 'text-positive' : positive === false ? 'text-negative' : 'text-foreground'
      }`}
    />
  );
}

function renderConvertedMetricDetails(
  metric: HistoricalReportConvertedMetric,
  t: (key: string, options?: Record<string, unknown>) => string,
  locale: string
) {
  const shouldShowDetails =
    metric.originalTotals.length > 1 ||
    !metric.allOriginalInReportingCurrency ||
    metric.previousAvailableCount > 0 ||
    metric.unavailableCount > 0 ||
    Boolean(metric.provider);

  if (!shouldShowDetails) {
    return null;
  }

  return (
    <details className="mt-2 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2">
      <summary className="cursor-pointer text-[11px] font-600 text-muted-foreground">
        {t('reports.viewOriginalCurrencies')}
      </summary>
      <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
        <p>{t('reports.reportingCurrency', { currency: metric.reportingCurrency })}</p>
        {renderOriginalCurrencyRows(metric.originalTotals, undefined, t('reports.noData'))}
        {metric.reportingAmount !== null && !metric.allOriginalInReportingCurrency ? (
          <p>{t('reports.historicalReportingTotal', { currency: metric.reportingCurrency })}</p>
        ) : null}
        {metric.previousAvailableCount > 0 ? (
          <p>{t('reports.previousSnapshotUsage', { count: metric.previousAvailableCount })}</p>
        ) : null}
        {metric.exactCount > 0 ? <p>{t('reports.exactSnapshotUsage', { count: metric.exactCount })}</p> : null}
        {metric.earliestRateDate || metric.latestRateDate ? (
          <p>
            {t('reports.appliedRateDates', {
              start: metric.earliestRateDate || metric.latestRateDate,
              end: metric.latestRateDate && metric.latestRateDate !== metric.earliestRateDate ? ` to ${metric.latestRateDate}` : '',
            })}
          </p>
        ) : null}
        {metric.provider ? <p>{t('reports.provider', { provider: metric.provider })}</p> : null}
        {metric.freshestAppliedAt ? <p>{t('reports.latestSnapshotFetchedAt', { value: metric.freshestAppliedAt })}</p> : null}
        {metric.missingRateDates.length > 0 ? (
          <p>{buildHistoricalRateUnavailableMessage(metric.missingRateDates, { locale, t })}</p>
        ) : null}
        {metric.stale ? <p className="text-warning">{t('reports.stale')}</p> : null}
        {metric.unavailableReason ? <p className="text-warning">{localizeReportMessage(metric.unavailableReason, t)}</p> : null}
      </div>
    </details>
  );
}

function getReportTitle(
  activeReport: ReportType,
  grouping: ReportGrouping,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (activeReport !== 'monthly-trends') {
    switch (activeReport) {
      case 'income-expense':
        return t('reports.types.incomeExpense');
      case 'spending-category':
        return t('reports.types.spendingCategory');
      case 'budget-performance':
        return t('reports.types.budgetPerformance');
      case 'account-statement':
        return t('reports.types.accountStatement');
      default:
        return t('reports.titles.report');
    }
  }
  if (grouping === 'day') return t('reports.titles.dailyTrend');
  if (grouping === 'week') return t('reports.titles.weeklyTrend');
  return t('reports.titles.monthlyTrends');
}

function buildTransactionsCsv(
  data: ReportViewData,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const headers = [
    t('reports.accountStatement.columns.date'),
    t('reports.accountStatement.columns.type'),
    t('reports.accountStatement.columns.merchantSource'),
    t('reports.accountStatement.columns.description'),
    t('reports.accountStatement.columns.category'),
    t('reports.accountStatement.columns.account'),
    t('reports.accountStatement.columns.originalAmount'),
    t('reports.accountStatement.columns.originalCurrency'),
    t('reports.accountStatement.columns.reportingEquivalent'),
    t('reports.accountStatement.columns.reportingCurrency'),
    t('reports.accountStatement.columns.tags'),
    t('reports.accountStatement.columns.notes'),
  ];

  const rows = data.transactions.map((transaction) => {
    const signedOriginalAmount = transaction.transaction_type === 'expense'
      ? -Math.abs(Number(transaction.amount || 0))
      : Number(transaction.amount || 0);
    const conversion = convertHistoricalAmountWithSnapshots({
      amount: signedOriginalAmount,
      fromCurrency: transaction.currency || data.reportingCurrency,
      reportingCurrency: data.reportingCurrency,
      rateDate: transaction.transaction_date,
      snapshots: data.snapshots,
    });

    return [
      transaction.transaction_date,
      getTransactionTypeLabel(transaction.transaction_type, t),
      transaction.merchant || '',
      transaction.description || '',
      transaction.category?.name
        ? translateSystemCategoryName(transaction.category.name, (key, options) =>
            t(key, { ...(options || {}), ns: 'common' })
          )
        : '',
      transaction.account?.name || '',
      signedOriginalAmount.toFixed(2),
      transaction.currency || '',
      conversion.convertedAmount === null ? t('reports.unavailable') : conversion.convertedAmount.toFixed(2),
      data.reportingCurrency,
      (transaction.tags || []).join(', '),
      transaction.notes || '',
    ];
  });

  return [headers.join(','), ...rows.map((row) => row.map(escapeCsvValue).join(','))].join('\n');
}

function buildBudgetPerformanceCsv(
  items: ReportBudgetPerformanceItem[],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const headers = [
    t('reports.budgetPerformanceCsv.budget'),
    t('reports.budgetPerformanceCsv.category'),
    t('reports.budgetPerformanceCsv.periodLabel'),
    t('reports.budgetPerformanceCsv.periodType'),
    t('reports.budgetPerformanceCsv.budgetAmount'),
    t('reports.budgetPerformanceCsv.budgetCurrency'),
    t('reports.budgetPerformanceCsv.spent'),
    t('reports.budgetPerformanceCsv.remaining'),
    t('reports.budgetPerformanceCsv.status'),
    t('reports.budgetPerformanceCsv.progressPercent'),
    t('reports.budgetPerformanceCsv.reportingAmount'),
    t('reports.budgetPerformanceCsv.reportingSpent'),
    t('reports.budgetPerformanceCsv.reportingRemaining'),
    t('reports.budgetPerformanceCsv.reportingCurrency'),
  ];
  const rows = items.map((item) => [
    item.budget.name ||
      (item.budget.category?.name
        ? translateSystemCategoryName(item.budget.category.name, (key, options) =>
            t(key, { ...(options || {}), ns: 'common' })
          )
        : '') ||
      t('reports.budget'),
    item.budget.category?.name
      ? translateSystemCategoryName(item.budget.category.name, (key, options) =>
          t(key, { ...(options || {}), ns: 'common' })
        )
      : '',
    item.period.label || '',
    getBudgetPeriodTypeLabel(item.period.budgetPeriod, t),
    Number(item.budget.amount || 0).toFixed(2),
    item.budget.currency || '',
    item.spentAmount === null ? t('reports.unavailable') : item.spentAmount.toFixed(2),
    item.remainingAmount === null ? t('reports.unavailable') : item.remainingAmount.toFixed(2),
    getLocalizedBudgetStatusLabel(item, t),
    item.progressPct === null ? '' : item.progressPct.toFixed(1),
    item.allocatedReportingAmount === null ? t('reports.unavailable') : item.allocatedReportingAmount.toFixed(2),
    item.spentReportingAmount === null ? t('reports.unavailable') : item.spentReportingAmount.toFixed(2),
    item.remainingReportingAmount === null ? t('reports.unavailable') : item.remainingReportingAmount.toFixed(2),
    item.reportingCurrency,
  ]);
  return [headers.join(','), ...rows.map((row) => row.map(escapeCsvValue).join(','))].join('\n');
}

function buildCsvFilename(activeReport: ReportType, range: ReportPeriodRange) {
  return `smart-pocket-${activeReport}-${range.startDate}-to-${range.endDate}.csv`;
}

export default function ReportsScreen() {
  const { t } = useTranslation('portal');
  const { dir, language } = useLanguage();
  const locale = getIntlLocale(language);
  const [generatedAtLabel, setGeneratedAtLabel] = useState<string | null>(null);
  const [periodContext, setPeriodContext] = useState<UserFinancialPeriodContext | null>(null);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<ReportPeriodPreset>('current_month');
  const [periodCursor, setPeriodCursor] = useState<string | null>(null);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [activeReport, setActiveReport] = useState<ReportType>('income-expense');
  const [scopeType, setScopeType] = useState<'personal' | 'space'>('personal');
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [reportData, setReportData] = useState<ReportViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<'csv' | 'print' | null>(null);
  const latestReportRequestRef = useRef(0);

  useEffect(() => {
    setGeneratedAtLabel(new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date()));
  }, [locale]);

  const loadPeriodContext = useCallback(async () => {
    setPeriodLoading(true);
    try {
      const nextContext = await loadUserFinancialPeriodContext();
      setPeriodContext(nextContext);
      setActivePreset((current) => current || getInitialReportPreset(nextContext.effectiveConfig));
      setPeriodCursor((current) => current || nextContext.currentBusinessDate);
      setCustomDateFrom((current) => current || nextContext.currentMonthlyPeriod.startDate);
      setCustomDateTo((current) => current || nextContext.currentBusinessDate);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('reports.periodSettingsError'));
    } finally {
      setPeriodLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPeriodContext();
  }, [loadPeriodContext]);

  useEffect(() => {
    let cancelled = false;
    void getMySpaceMemberships()
      .then((memberships) => {
        if (cancelled) return;
        const nextSpaces = memberships.map((membership) => membership.space);
        setSpaces(nextSpaces);
        setSelectedSpaceId((current) => current || nextSpaces[0]?.id || '');
      })
      .catch(() => {
        if (!cancelled) {
          setSpaces([]);
          setSelectedSpaceId('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useSmartPocketDataChanged(['profile'], 'ReportsScreenPeriodContext', async () => {
    await loadPeriodContext();
  });

  useEffect(() => {
    if (scopeType === 'space' && spaces.length === 0) {
      setScopeType('personal');
    }
  }, [scopeType, spaces]);

  useEffect(() => {
    setSelectedAccount('all');
  }, [scopeType, selectedSpaceId]);

  const activeRange = useMemo<ReportPeriodRange | null>(() => {
    if (!periodContext) return null;
    return resolveReportPeriodPreset({
      preset: activePreset,
      config: periodContext.effectiveConfig,
      locale,
      referenceDate: periodCursor || periodContext.currentBusinessDate,
      customRange: activePreset === 'custom'
        ? {
          startDate: customDateFrom || periodContext.currentMonthlyPeriod.startDate,
          endDate: customDateTo || periodContext.currentBusinessDate,
        }
        : undefined,
    });
  }, [activePreset, customDateFrom, customDateTo, locale, periodContext, periodCursor]);

  const loadReportData = useCallback(async () => {
    if (!activeRange) return;
    const requestId = latestReportRequestRef.current + 1;
    latestReportRequestRef.current = requestId;
    setLoading(true);
    try {
      const data = await getReportViewData({
        startDate: activeRange.startDate,
        endDate: activeRange.endDate,
        accountId: selectedAccount,
        scopeType,
        spaceId: scopeType === 'space' ? selectedSpaceId || null : null,
        locale,
      });
      if (latestReportRequestRef.current === requestId) {
        setReportData(data);
      }
    } catch (error) {
      if (latestReportRequestRef.current === requestId) {
        toast.error(error instanceof Error ? error.message : t('reports.loadError'));
      }
    } finally {
      if (latestReportRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [activeRange, locale, scopeType, selectedAccount, selectedSpaceId, t]);

  useEffect(() => {
    void loadReportData();
  }, [loadReportData]);

  useSmartPocketDataChanged(['transactions', 'financial_accounts', 'budgets', 'profile', 'spaces'], 'ReportsScreen', async () => {
    await loadReportData();
  });

  const grouping = useMemo(() => activeRange ? determineGrouping(activeRange) : 'month', [activeRange]);
  const incomeExpenseChartState = useMemo(() => {
    if (!reportData || !activeRange) {
      return { data: [], unavailableReason: null, emptyReason: null } satisfies ChartState<IncomeExpenseChartRow>;
    }
    return buildIncomeExpenseChartState({
      incomeTransactions: reportData.incomeTransactions,
      expenseTransactions: reportData.expenseTransactions,
      reportingCurrency: reportData.reportingCurrency,
      snapshots: reportData.snapshots,
      range: activeRange,
      grouping,
      locale,
      t,
    });
  }, [activeRange, grouping, locale, reportData]);

  const spendingCategoryChartState = useMemo(() => {
    if (!reportData) {
      return { data: [], unavailableReason: null, emptyReason: null } satisfies ChartState<SpendingCategoryChartRow>;
    }
    return buildSpendingCategoryChartState({
      expenseTransactions: reportData.expenseTransactions,
      reportingCurrency: reportData.reportingCurrency,
      snapshots: reportData.snapshots,
      t,
      locale,
    });
  }, [locale, reportData, t]);

  const previousRangeLabel = activeRange?.navigationLabel
    ? t(activeRange.navigationLabel, { ns: 'portal' })
    : t('reports.period');
  const PreviousIcon = dir === 'rtl' ? ChevronRight : ChevronLeft;
  const NextIcon = dir === 'rtl' ? ChevronLeft : ChevronRight;

  const activeTitle = getReportTitle(activeReport, grouping, t);
  const incomeMetric = reportData?.incomeMetric || null;
  const expensesMetric = reportData?.expensesMetric || null;
  const netMetric = reportData?.netMetric || null;
  const canCalculateSavingsRate =
    incomeMetric &&
    expensesMetric &&
    incomeMetric.reportingAmount !== null &&
    expensesMetric.reportingAmount !== null &&
    Number(incomeMetric.reportingAmount) > 0;
  const savingsRate = canCalculateSavingsRate
    ? ((Number(incomeMetric?.reportingAmount || 0) - Number(expensesMetric?.reportingAmount || 0)) / Number(incomeMetric?.reportingAmount || 0)) * 100
    : 0;
  const savingsRateValue = !incomeMetric || !expensesMetric
    ? loading
      ? t('reports.loadingMetrics')
      : t('reports.metricsUnavailable')
    : incomeMetric.reportingAmount === null || expensesMetric.reportingAmount === null
      ? localizeReportMessage(incomeMetric.unavailableReason, t)
        || localizeReportMessage(expensesMetric.unavailableReason, t)
        || t('reports.historicalRateUnavailable')
      : Number(incomeMetric.reportingAmount) <= 0
        ? t('reports.noIncomeSelectedPeriod')
        : `${savingsRate.toFixed(1)}%`;

  const summaryByType: Record<ReportType, Array<{
    id: string;
    label: string;
    value?: string;
    convertedMetric?: HistoricalReportConvertedMetric | null;
    sub?: string;
    positive?: boolean;
  }>> = {
    'income-expense': [
      { id: 'rpt-ie-income', label: t('reports.summary.totalIncome'), convertedMetric: incomeMetric, sub: activeRange?.label, positive: true },
      { id: 'rpt-ie-expenses', label: t('reports.summary.totalExpenses'), convertedMetric: expensesMetric, sub: activeRange?.comparisonLabel ? t('reports.comparedWith', { value: activeRange.comparisonLabel }) : undefined, positive: false },
      { id: 'rpt-ie-net', label: t('reports.summary.netSavings'), convertedMetric: netMetric, sub: canCalculateSavingsRate ? t('reports.summary.savingsRateValue', { value: savingsRate.toFixed(1) }) : t('reports.summary.savingsRateUnavailable') },
      { id: 'rpt-ie-txns', label: t('reports.summary.transactions'), value: String(reportData?.transactions.length || 0), sub: t('reports.summary.includedRecords') },
    ],
    'spending-category': [
      { id: 'rpt-sc-total', label: t('reports.summary.totalSpent'), convertedMetric: expensesMetric, sub: activeRange?.label, positive: false },
      { id: 'rpt-sc-txns', label: t('reports.summary.expenseTransactions'), value: String(reportData?.expenseTransactions.length || 0), sub: t('reports.summary.includedRecords') },
      { id: 'rpt-sc-income', label: t('reports.summary.totalIncome'), convertedMetric: incomeMetric, positive: true },
      { id: 'rpt-sc-net', label: t('reports.summary.netSavings'), convertedMetric: netMetric },
    ],
    'monthly-trends': [
      { id: 'rpt-mt-income', label: t('reports.summary.periodIncome'), convertedMetric: incomeMetric, positive: true },
      { id: 'rpt-mt-expenses', label: t('reports.summary.periodExpenses'), convertedMetric: expensesMetric, positive: false },
      { id: 'rpt-mt-net', label: t('reports.summary.netSavings'), convertedMetric: netMetric },
      { id: 'rpt-mt-buckets', label: grouping === 'day' ? t('reports.summary.dailyBuckets') : grouping === 'week' ? t('reports.summary.weeklyBuckets') : t('reports.summary.monthlyBuckets'), value: String(incomeExpenseChartState.data.length) },
    ],
    'budget-performance': [
      { id: 'rpt-bp-budgets', label: t('reports.summary.applicableBudgets'), value: String(reportData?.budgetPerformance.items.length || 0), sub: activeRange?.label },
      { id: 'rpt-bp-income', label: t('reports.summary.totalIncome'), convertedMetric: incomeMetric, positive: true },
      { id: 'rpt-bp-expenses', label: t('reports.summary.totalExpenses'), convertedMetric: expensesMetric, positive: false },
      { id: 'rpt-bp-rate', label: t('reports.summary.savingsRate'), value: savingsRateValue },
    ],
    'account-statement': [
      { id: 'rpt-as-txns', label: t('reports.summary.totalTransactions'), value: String(reportData?.transactions.length || 0), sub: activeRange?.label },
      { id: 'rpt-as-credits', label: t('reports.summary.totalCredits'), convertedMetric: incomeMetric, positive: true },
      { id: 'rpt-as-debits', label: t('reports.summary.totalDebits'), convertedMetric: expensesMetric, positive: false },
      { id: 'rpt-as-net', label: t('reports.summary.net'), convertedMetric: netMetric },
    ],
  };

  const handleDownloadCSV = useCallback(() => {
    if (actionInFlight) return;
    setActionInFlight('csv');
    try {
    if (!reportData || !activeRange) {
      toast.error(t('reports.noDataToExport'));
      return;
    }
    if (activeReport === 'budget-performance') {
      if (reportData.budgetPerformance.items.length === 0) {
        toast.error(t('reports.noBudgetsApply'));
        return;
      }
      downloadCsv(
        buildCsvFilename(activeReport, activeRange),
        buildBudgetPerformanceCsv(reportData.budgetPerformance.items, t)
      );
      toast.success(t('reports.csvExportedBudgets', { count: reportData.budgetPerformance.items.length }));
      return;
    }
    if (reportData.transactions.length === 0) {
      toast.error(t('reports.noDataToExport'));
      return;
    }
    downloadCsv(
      buildCsvFilename(activeReport, activeRange),
      buildTransactionsCsv(reportData, t)
    );
    toast.success(t('reports.csvExportedTransactions', { count: reportData.transactions.length }));
    } finally {
      setActionInFlight(null);
    }
  }, [actionInFlight, activeRange, activeReport, reportData, t]);

  const handlePrint = useCallback(() => {
    if (actionInFlight) return;
    setActionInFlight('print');
    try {
      window.print();
    } finally {
      setActionInFlight(null);
    }
  }, [actionInFlight]);

  const handlePresetChange = useCallback((preset: ReportPeriodPreset) => {
    if (!periodContext) return;
    setActivePreset(preset);
    setPeriodCursor(periodContext.currentBusinessDate);
    if (preset === 'custom') {
      setCustomDateFrom((current) => current || periodContext.currentMonthlyPeriod.startDate);
      setCustomDateTo((current) => current || periodContext.currentBusinessDate);
    }
  }, [periodContext]);

  const goToPreviousRange = useCallback(() => {
    if (!periodContext || !activeRange || activePreset === 'custom') return;
    const previous = getPreviousComparableReportPeriod({
      preset: activePreset,
      config: periodContext.effectiveConfig,
      locale,
      startDate: activeRange.startDate,
      endDate: activeRange.endDate,
    });
    if (previous) {
      setPeriodCursor(previous.startDate);
    }
  }, [activePreset, activeRange, locale, periodContext]);

  const goToNextRange = useCallback(() => {
    if (!periodContext || !activeRange || activePreset === 'custom') return;
    const next = getNextComparableReportPeriod({
      preset: activePreset,
      config: periodContext.effectiveConfig,
      locale,
      startDate: activeRange.startDate,
      endDate: activeRange.endDate,
    });
    if (next && next.endDate <= periodContext.currentBusinessDate) {
      setPeriodCursor(next.startDate);
    }
  }, [activePreset, activeRange, locale, periodContext]);

  const activeChartState = activeReport === 'income-expense' || activeReport === 'monthly-trends'
    ? incomeExpenseChartState
    : activeReport === 'spending-category'
      ? spendingCategoryChartState
      : null;

  return (
    <div className="page-section">
      <PageHeader
        title={t('reports.pageTitle')}
        description={t('reports.pageDescription')}
        badge={<StatusBadge status="info" label={t('reports.pageBadge')} />}
        compact
        hideDescriptionOnMobile
        actionsClassName="w-full sm:w-auto !min-w-0"
        actions={
          <div className="flex flex-wrap gap-2 sm:flex-nowrap print:hidden">
            <Link href="/reports/item-insights" className="btn-secondary h-9 px-3 text-sm gap-1.5">
              <BarChart3 size={15} />
              {t('itemInsights.title')}
            </Link>
            <button onClick={handlePrint} disabled={actionInFlight !== null} className="btn-secondary h-9 px-3 text-sm gap-1.5 disabled:opacity-60">
              {actionInFlight === 'print' ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
              <span className="hidden sm:inline">{t('reports.print')}</span>
            </button>
            <button onClick={handleDownloadCSV} disabled={actionInFlight !== null} className="btn-secondary h-9 px-3 text-sm gap-1.5 disabled:opacity-60">
              {actionInFlight === 'csv' ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
              {t('reports.csv')}
            </button>
          </div>
        }
      />

      <div className="hidden print:block rounded-xl border border-border p-4">
        <p className="text-lg font-700 text-foreground">{activeTitle}</p>
        <p className="text-sm text-muted-foreground">{t('reports.range')}: {activeRange ? formatReportPeriodLabel(activeRange) : t('reports.loading')}</p>
        <p className="text-sm text-muted-foreground">
          {t('reports.accountFilter')}: {selectedAccount === 'all'
            ? t('reports.allAccounts')
            : getFinancialAccountDisplayLabel(
                (reportData?.accounts || []).find((account) => account.id === selectedAccount) || {
                  name: selectedAccount,
                  currency: '',
                  is_system_default: false,
                  system_default_type: null,
                },
                { includeDefaultLabel: true }
              )}
        </p>
        <p className="text-sm text-muted-foreground">{t('reports.reportingCurrencyLabel')}: {reportData?.reportingCurrency || t('reports.loading')}</p>
        <p className="text-sm text-muted-foreground">{t('reports.generated')}: {generatedAtLabel || t('reports.loading')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="space-y-2 xl:col-span-1 print:hidden">
          <p className="mb-2 px-1 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{t('reports.reportType')}</p>
          {reportTypes.map((rt) => {
            const Icon = rt.icon;
            const label =
              rt.id === 'income-expense'
                ? t('reports.types.incomeExpense')
                : rt.id === 'spending-category'
                  ? t('reports.types.spendingCategory')
                  : rt.id === 'monthly-trends'
                    ? t('reports.types.trends')
                    : rt.id === 'budget-performance'
                      ? t('reports.types.budgetPerformance')
                      : t('reports.types.accountStatement');
            const description =
              rt.id === 'income-expense'
                ? t('reports.descriptions.incomeExpense')
                : rt.id === 'spending-category'
                  ? t('reports.descriptions.spendingCategory')
                  : rt.id === 'monthly-trends'
                    ? t('reports.descriptions.trends')
                    : rt.id === 'budget-performance'
                      ? t('reports.descriptions.budgetPerformance')
                      : t('reports.descriptions.accountStatement');
            return (
              <button
                key={rt.id}
                onClick={() => setActiveReport(rt.id)}
                aria-pressed={activeReport === rt.id}
                className={`w-full rounded-xl border p-3 text-left transition-all duration-150 max-[480px]:p-2.5 ${
                  activeReport === rt.id ? 'border-accent bg-accent/8 shadow-sm' : 'border-border bg-card hover:border-accent/40 hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeReport === rt.id ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-600 ${activeReport === rt.id ? 'text-accent' : 'text-foreground'}`}>{label}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground max-[480px]:hidden">{description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-4 xl:col-span-3">
          <div className="card-elevated p-3 print:hidden max-[480px]:p-2.5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5 lg:flex-nowrap lg:gap-1 lg:overflow-hidden">
                {visibleReportPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handlePresetChange(preset)}
                    aria-pressed={activePreset === preset}
                    className={`inline-flex h-7 flex-none items-center justify-center whitespace-nowrap rounded-full border px-2 text-[11px] font-600 leading-none transition-all lg:px-1.5 xl:px-2 ${
                      activePreset === preset
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted-foreground hover:border-accent/40 hover:bg-muted/40 hover:text-foreground'
                    }`}
                  >
                    {getPresetButtonLabel(preset, periodContext, t)}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-2 lg:flex-nowrap lg:gap-2">
                <div className="flex min-w-0 items-center gap-1.5 lg:w-[198px] lg:flex-none">
                  <Calendar size={14} className="hidden text-muted-foreground sm:block" />
                  <div className="min-w-0 flex-1">
                    <span className="mb-1 block text-[11px] font-600 text-muted-foreground">{t('reports.from')}</span>
                    <label className="sr-only" htmlFor="report-date-from">{t('reports.reportStartDate')}</label>
                    <input
                      id="report-date-from"
                      type="date"
                      value={activePreset === 'custom' ? customDateFrom : activeRange?.startDate || ''}
                      onChange={(event) => {
                        setActivePreset('custom');
                        setCustomDateFrom(event.target.value);
                      }}
                      className="input-base h-9 min-w-0 w-full px-3 text-sm"
                    />
                  </div>
                </div>

                <div className="flex min-w-0 items-center gap-1.5 lg:w-[198px] lg:flex-none">
                  <div className="min-w-0 flex-1">
                    <span className="mb-1 block text-[11px] font-600 text-muted-foreground">{t('reports.to')}</span>
                    <label className="sr-only" htmlFor="report-date-to">{t('reports.reportEndDate')}</label>
                    <input
                      id="report-date-to"
                      type="date"
                      value={activePreset === 'custom' ? customDateTo : activeRange?.endDate || ''}
                      onChange={(event) => {
                        setActivePreset('custom');
                        setCustomDateTo(event.target.value);
                      }}
                      className="input-base h-9 min-w-0 w-full px-3 text-sm"
                    />
                  </div>
                </div>

                <div className="flex min-w-0 items-center gap-1.5 lg:w-[210px] lg:flex-none">
                  <Filter size={13} className="hidden text-muted-foreground sm:block" />
                  <div className="min-w-0 flex-1">
                    <span className="mb-1 block text-[11px] font-600 text-muted-foreground">{t('reports.scopeLabel', { defaultValue: 'Scope' })}</span>
                    <select
                      value={scopeType}
                      onChange={(event) => setScopeType(event.target.value as 'personal' | 'space')}
                      className="input-base h-9 min-w-[140px] max-w-full w-full px-3 text-sm"
                    >
                      <option value="personal">{t('reports.personalScope', { defaultValue: 'Personal' })}</option>
                      <option value="space" disabled={spaces.length === 0}>
                        {t('reports.spaceScope', { defaultValue: 'Space' })}
                      </option>
                    </select>
                  </div>
                </div>

                {scopeType === 'space' ? (
                  <div className="flex min-w-0 items-center gap-1.5 lg:w-[210px] lg:flex-none">
                    <div className="min-w-0 flex-1">
                      <span className="mb-1 block text-[11px] font-600 text-muted-foreground">{t('spaces.title', { ns: 'portal', defaultValue: 'Spaces' })}</span>
                      <select
                        value={selectedSpaceId}
                        onChange={(event) => setSelectedSpaceId(event.target.value)}
                        className="input-base h-9 min-w-[180px] max-w-full w-full px-3 text-sm lg:max-w-[210px]"
                      >
                        {spaces.map((space) => (
                          <option key={space.id} value={space.id}>
                            {space.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}

                <div className="flex min-w-0 items-center gap-1.5 lg:w-[210px] lg:flex-none">
                  <Filter size={13} className="hidden text-muted-foreground sm:block" />
                  <div className="min-w-0 flex-1">
                    <span className="mb-1 block text-[11px] font-600 text-muted-foreground">{t('reports.account')}</span>
                    <label className="sr-only" htmlFor="report-account-filter">{t('reports.filterByAccount')}</label>
                    <select
                      id="report-account-filter"
                      value={selectedAccount}
                      onChange={(event) => setSelectedAccount(event.target.value)}
                      className="input-base h-9 min-w-[180px] max-w-full w-full px-3 text-sm lg:max-w-[210px]"
                    >
                      <option value="all">{t('reports.allAccounts')}</option>
                      {(reportData?.accounts || []).map((account) => (
                        <option key={account.id} value={account.id}>
                          {getFinancialAccountDisplayLabel(account, {
                            includeCurrency: true,
                            includeDefaultLabel: true,
                          })}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={`inline-flex overflow-hidden rounded-xl border border-border bg-card lg:ms-auto ${dir === 'rtl' ? 'flex-row-reverse' : ''}`}>
                  <button
                    type="button"
                    onClick={goToPreviousRange}
                    disabled={activePreset === 'custom' || periodLoading}
                    className="flex h-9 items-center gap-1.5 whitespace-nowrap px-3 text-sm font-600 text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`${t('reports.previous')} ${previousRangeLabel}`}
                  >
                    <PreviousIcon size={14} />
                    {t('reports.previous')}
                  </button>
                  <button
                    type="button"
                    onClick={() => periodContext && setPeriodCursor(periodContext.currentBusinessDate)}
                    disabled={periodLoading}
                    className="flex h-9 items-center gap-1.5 whitespace-nowrap border-s border-border px-3 text-sm font-600 text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {t('reports.current')}
                  </button>
                  <button
                    type="button"
                    onClick={goToNextRange}
                    disabled={activePreset === 'custom' || !activeRange?.canNavigateForward || periodLoading}
                    className="flex h-9 items-center gap-1.5 whitespace-nowrap border-s border-border px-3 text-sm font-600 text-foreground transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`${t('reports.next')} ${previousRangeLabel}`}
                  >
                    {t('reports.next')}
                    <NextIcon size={14} />
                  </button>
                </div>
              </div>

              <p className="min-w-0 truncate text-xs text-muted-foreground">
                <span className="font-600 text-foreground">{activeRange?.label || t('reports.loadingPeriod')}</span>
                {' · '}
                {scopeType === 'space'
                  ? (
                    <>
                      {spaces.find((space) => space.id === selectedSpaceId)?.name || t('reports.spaceScope', { defaultValue: 'Space' })}
                      {' · '}
                    </>
                  )
                  : null}
                {activeRange?.comparisonLabel
                  ? t('reports.comparedWith', { value: activeRange.comparisonLabel })
                  : activePreset === 'custom'
                    ? t('reports.customRange')
                    : t('reports.sharedBoundaries')}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-4">
            {summaryByType[activeReport].map((item) => (
              <div key={item.id} className="card-elevated p-4 max-[480px]:p-3">
                <p className="mb-1.5 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{item.label}</p>
                <div className={`text-lg font-700 font-tabular ${item.positive === true ? 'text-positive' : item.positive === false ? 'text-negative' : 'text-foreground'}`}>
                  {loading || periodLoading ? (
                    <span className="inline-block h-5 w-20 animate-pulse rounded bg-muted" />
                  ) : item.convertedMetric ? (
                    renderConvertedMetric(item.convertedMetric, item.positive)
                  ) : (
                    item.value
                  )}
                </div>
                {item.sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{item.sub}</p> : null}
                {!loading && item.convertedMetric ? renderConvertedMetricDetails(item.convertedMetric, t, locale) : null}
              </div>
            ))}
          </div>

          <div className="card-elevated p-5 max-[480px]:p-3">
            <div className="mb-4 flex items-center justify-between gap-3 max-[480px]:mb-3">
              <div>
                <h2 className="text-base font-700 text-foreground">{activeTitle}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {activeRange?.label || t('reports.loadingRange')}
                  {activeRange?.comparisonLabel ? ` · ${t('reports.comparedWith', { value: activeRange.comparisonLabel })}` : ''}
                </p>
                {activeReport === 'monthly-trends' ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {t('reports.groupedBy', {
                      value:
                        grouping === 'day'
                          ? t('reports.grouping.day')
                          : grouping === 'week'
                            ? t('reports.grouping.week')
                            : t('reports.grouping.month'),
                    })}
                  </p>
                ) : null}
              </div>
              {(loading || periodLoading) ? <Loader2 size={16} className="animate-spin text-accent" /> : null}
            </div>

            {loading || periodLoading ? (
              <div className="flex h-[300px] items-center justify-center">
                <div className="text-center">
                  <Loader2 size={24} className="mx-auto mb-2 animate-spin text-accent" />
                  <p className="text-sm text-muted-foreground">{t('reports.loadingData')}</p>
                </div>
              </div>
            ) : activeReport === 'account-statement' ? (
              <AccountStatementTable
                transactions={reportData?.transactions || []}
                reportingCurrency={reportData?.reportingCurrency || ''}
                snapshots={reportData?.snapshots || []}
                t={t}
              />
            ) : activeReport === 'budget-performance' ? (
              reportData?.budgetPerformance.unavailableReason ? (
                <div className="flex min-h-[300px] items-center justify-center">
                  <EmptyState icon={Target} title={t('reports.historicalRateUnavailable')} description={localizeReportMessage(reportData.budgetPerformance.unavailableReason, t) || reportData.budgetPerformance.unavailableReason} />
                </div>
              ) : reportData?.budgetPerformance.emptyReason ? (
                <div className="flex min-h-[300px] items-center justify-center">
                  <EmptyState icon={Target} title={t('reports.noBudgetsApply')} description={localizeReportMessage(reportData.budgetPerformance.emptyReason, t) || reportData.budgetPerformance.emptyReason} />
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="h-[300px]">
                    <BudgetPerformanceChart
                      data={sanitizeBudgetPerformanceChartRows(reportData?.budgetPerformance.chartRows || [])}
                      currencyCode={reportData?.budgetPerformance.reportingCurrency || ''}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {(reportData?.budgetPerformance.items || []).map((item) => (
                      <div key={item.budget.id} className="rounded-xl border border-border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-700 text-foreground">
                              {item.budget.category?.name
                                ? translateSystemCategoryName(item.budget.category.name, (key, options) =>
                                    t(key, { ...(options || {}), ns: 'common' })
                                  )
                                : item.budget.name || t('reports.budget')}
                            </p>
                            <p className="text-xs text-muted-foreground">{getBudgetPeriodTypeLabel(item.period.budgetPeriod, t)} · {item.period.label}</p>
                          </div>
                          <StatusBadge
                            status={item.status === 'over_budget' ? 'error' : item.status === 'near_limit' ? 'warning' : item.status === 'conversion_unavailable' ? 'pending' : 'info'}
                            label={getLocalizedBudgetStatusLabel(item, t)}
                          />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('reports.budget')}</p>
                            <FormattedCurrencyAmount amount={Number(item.budget.amount || 0)} currencyCode={item.budget.currency} className="font-700 text-foreground" showCode />
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('reports.spent')}</p>
                            {item.spentAmount === null ? (
                              <p className="font-700 text-warning">{t('reports.unavailable')}</p>
                            ) : (
                              <FormattedCurrencyAmount amount={item.spentAmount} currencyCode={item.budget.currency} className="font-700 text-foreground" showCode />
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('reports.remaining')}</p>
                            {item.remainingAmount === null ? (
                              <p className="font-700 text-warning">{t('reports.unavailable')}</p>
                            ) : (
                              <FormattedCurrencyAmount amount={item.remainingAmount} currencyCode={item.budget.currency} className="font-700 text-foreground" showCode />
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{t('reports.progress')}</p>
                            <p className="font-700 text-foreground">{item.progressPct === null ? t('reports.unavailable') : `${item.progressPct.toFixed(1)}%`}</p>
                          </div>
                        </div>
                        {item.reportingUnavailableReason ? (
                          <p className="mt-3 text-xs text-warning">{localizeReportMessage(item.reportingUnavailableReason, t) || item.reportingUnavailableReason}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : activeChartState?.unavailableReason ? (
              <div className="flex h-[300px] items-center justify-center">
                <EmptyState icon={BarChart3} title={t('reports.historicalRateUnavailable')} description={activeChartState.unavailableReason} />
              </div>
            ) : activeChartState?.emptyReason ? (
              <div className="flex h-[300px] items-center justify-center">
                <EmptyState
                  icon={activeReport === 'spending-category' ? PieChart : BarChart3}
                  title={t('reports.noTransactionsInPeriod')}
                  description={
                    activeChartState.emptyReason === 'NO_EXPENSES'
                      ? t('reports.noExpensesInPeriod')
                      : t('reports.noTransactionsInPeriod')
                  }
                />
              </div>
            ) : (
              <div className="h-[300px]">
                {activeReport === 'income-expense' ? (
                  <IncomeExpenseReportChart
                    data={sanitizeIncomeExpenseChartRows(incomeExpenseChartState.data)}
                    currencyCode={reportData?.reportingCurrency || ''}
                  />
                ) : activeReport === 'spending-category' ? (
                  <SpendingCategoryReportChart
                    data={sanitizeSpendingCategoryChartRows(spendingCategoryChartState.data)}
                    currencyCode={reportData?.reportingCurrency || ''}
                  />
                ) : (
                  <MonthlyTrendsChart
                    data={sanitizeIncomeExpenseChartRows(incomeExpenseChartState.data).map((row) => ({
                      month: row.month,
                      income: row.income,
                      expenses: row.expenses,
                      savings: row.net,
                    }))}
                    currencyCode={reportData?.reportingCurrency || ''}
                  />
                )}
              </div>
            )}
          </div>

          <div className="card-elevated p-4 print:hidden max-[480px]:p-3">
            <p className="mb-3 text-sm font-700 text-foreground">{t('reports.downloadOptions')}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                {
                  id: 'dl-csv',
                  icon: FileDown,
                  label: t('reports.downloads.csvExport'),
                  desc: activeReport === 'budget-performance'
                    ? t('reports.downloads.applicableBudgetsInRange', { count: reportData?.budgetPerformance.items.length || 0 })
                    : t('reports.downloads.transactionsInRange', { count: reportData?.transactions.length || 0 }),
                  action: handleDownloadCSV,
                  primary: true,
                },
                {
                  id: 'dl-print',
                  icon: Printer,
                  label: t('reports.downloads.printPdf'),
                  desc: t('reports.downloads.printPdfDescription'),
                  action: handlePrint,
                  primary: false,
                },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    onClick={option.action}
                    disabled={actionInFlight !== null}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 ${
                      option.primary ? 'border-accent/40 bg-accent/8 hover:bg-accent/15' : 'border-border hover:border-accent/30 hover:bg-muted/40'
                    } disabled:opacity-60`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${option.primary ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {actionInFlight === (option.id === 'dl-csv' ? 'csv' : 'print')
                        ? <Loader2 size={16} className="animate-spin" />
                        : <Icon size={16} />}
                    </div>
                    <div>
                      <p className="text-sm font-600 text-foreground">{option.label}</p>
                      <p className="text-[11px] text-muted-foreground">{option.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountStatementTable(args: {
  transactions: Transaction[];
  reportingCurrency: string;
  snapshots: ReportViewData['snapshots'];
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (args.transactions.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <EmptyState
          icon={FileText}
          title={args.t('reports.noTransactionsInPeriod')}
          description={args.t('reports.accountStatement.emptyDescription')}
        />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3 sm:hidden">
        {args.transactions.map((transaction) => {
          const signedAmount = transaction.transaction_type === 'expense'
            ? -Math.abs(Number(transaction.amount || 0))
            : Number(transaction.amount || 0);
          const conversion = convertHistoricalAmountWithSnapshots({
            amount: signedAmount,
            fromCurrency: transaction.currency || args.reportingCurrency,
            reportingCurrency: args.reportingCurrency,
            rateDate: transaction.transaction_date,
            snapshots: args.snapshots,
          });

          return (
            <div key={`mobile-${transaction.id}`} className="rounded-2xl border border-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-700 text-foreground">{transaction.merchant || transaction.description || args.t('reports.accountStatement.entryFallback')}</p>
                  <p className="text-xs text-muted-foreground">{transaction.transaction_date} · {getTransactionTypeLabel(transaction.transaction_type, args.t)}</p>
                </div>
                <FormattedCurrencyAmount
                  amount={signedAmount}
                  currencyCode={transaction.currency}
                  className={`text-sm font-700 ${signedAmount >= 0 ? 'text-positive' : 'text-foreground'}`}
                  showCode
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.category')}</p>
                  <p className="text-foreground">
                    {transaction.category?.name
                      ? translateSystemCategoryName(transaction.category.name, (key, options) =>
                          args.t(key, { ...(options || {}), ns: 'common' })
                        )
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.account')}</p>
                  <p className="text-foreground">{transaction.account?.name || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.description')}</p>
                  <p className="text-foreground">{transaction.description || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.reportingEquivalent')}</p>
                  {conversion.convertedAmount === null ? (
                    <span className="text-warning">{args.t('reports.unavailable')}</span>
                  ) : (
                    <FormattedCurrencyAmount
                      amount={conversion.convertedAmount}
                      currencyCode={args.reportingCurrency}
                      className="font-600 text-muted-foreground"
                      showCode
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto scrollbar-thin sm:block">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.date')}</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.type')}</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.merchantSource')}</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.description')}</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.category')}</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.account')}</th>
            <th className="px-3 py-2 text-right text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.originalAmount')}</th>
            <th className="px-3 py-2 text-right text-[11px] font-600 uppercase tracking-wider text-muted-foreground">{args.t('reports.accountStatement.columns.reportingEquivalent')}</th>
          </tr>
        </thead>
        <tbody>
          {args.transactions.map((transaction) => {
            const signedAmount = transaction.transaction_type === 'expense'
              ? -Math.abs(Number(transaction.amount || 0))
              : Number(transaction.amount || 0);
            const conversion = convertHistoricalAmountWithSnapshots({
              amount: signedAmount,
              fromCurrency: transaction.currency || args.reportingCurrency,
              reportingCurrency: args.reportingCurrency,
              rateDate: transaction.transaction_date,
              snapshots: args.snapshots,
            });

            return (
              <tr key={transaction.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2.5 font-tabular text-muted-foreground">{transaction.transaction_date}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{getTransactionTypeLabel(transaction.transaction_type, args.t)}</td>
                <td className="px-3 py-2.5 text-foreground">{transaction.merchant || '—'}</td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-foreground">{transaction.description || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {transaction.category?.name
                    ? translateSystemCategoryName(transaction.category.name, (key, options) =>
                        args.t(key, { ...(options || {}), ns: 'common' })
                      )
                    : '—'}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{transaction.account?.name || '—'}</td>
                <td className="px-3 py-2.5 text-right">
                  <FormattedCurrencyAmount
                    amount={signedAmount}
                    currencyCode={transaction.currency}
                    className={`font-700 ${signedAmount >= 0 ? 'text-positive' : 'text-foreground'}`}
                    showCode
                  />
                </td>
                <td className="px-3 py-2.5 text-right text-muted-foreground">
                  {conversion.convertedAmount === null ? (
                    <span className="text-warning">{args.t('reports.unavailable')}</span>
                  ) : (
                    <FormattedCurrencyAmount
                      amount={conversion.convertedAmount}
                      currencyCode={args.reportingCurrency}
                      className="font-600 text-muted-foreground"
                      showCode
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}
