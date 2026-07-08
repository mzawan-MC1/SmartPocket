'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, PieChart, TrendingUp, FileText, Target, FileDown, Printer,
  Calendar, Filter, Loader2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import {
  buildHistoricalRateUnavailableMessage,
  buildHistoricalReportConvertedMetricFromSnapshots,
  getAccounts,
  getCategories,
  getDashboardMetrics,
  getRecurringTransactions,
  getTransfers,
  convertHistoricalAmountWithSnapshots,
  getReportViewData,
  type Category,
  type HistoricalReportConvertedMetric,
  type FinancialAccount,
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
import { buildCsvRow, downloadCsvFile, escapeCsvValue } from '@/lib/reports-export';
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
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getManagedPeople, getPersonLoanReportItems, getReimbursements, getSettlements, getSpaceSettlements, type ManagedPerson, type PersonLoanReportItem, type Reimbursement, type Settlement } from '@/lib/people';
import { getPersonalSubscriptions } from '@/lib/personal-subscriptions';
import type { PersonalSubscription } from '@/lib/personal-subscriptions-shared';
import { getItemInsightsSnapshot, type ItemInsightsSnapshot } from '@/lib/transaction-item-insights';
import FullFinancialReport, { type FullFinancialReportData, type FullReportChartState, type FullReportSummaryTable } from './FullFinancialReport';
import { buildFullFinancialReportData, type FullReportFilters, type FullReportSupplementalData } from './full-report-builder';
import type { PrintableReportIdentity, ReportMetadataItem } from './full-report-types';

const IncomeExpenseReportChart = dynamic(() => import('./charts/IncomeExpenseReportChart'), { ssr: false });
const SpendingCategoryReportChart = dynamic(() => import('./charts/SpendingCategoryReportChart'), { ssr: false });
const MonthlyTrendsChart = dynamic(() => import('./charts/MonthlyTrendsChart'), { ssr: false });
const BudgetPerformanceChart = dynamic(() => import('./charts/BudgetPerformanceChart'), { ssr: false });

type ReportType =
  | 'full-financial'
  | 'income-expense'
  | 'spending-category'
  | 'monthly-trends'
  | 'budget-performance'
  | 'account-statement';
type IncomeExpenseChartRow = { month: string; income: number; expenses: number; net: number };
type SpendingCategoryChartRow = { id: string; category: string; amount: number; color: string };
type ChartState<T> = {
  data: T[];
  unavailableReason: string | null;
  emptyReason: string | null;
};
type DashboardReportMode = 'month' | 'pay_cycle';
type ReportGrouping = 'day' | 'week' | 'month';

const reportTypes = [
  { id: 'full-financial' as ReportType, icon: FileText },
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

function formatSafeUtcDisplayDate(value: string | null | undefined, locale: string) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
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
      case 'full-financial':
        return t('reports.types.fullFinancial', { defaultValue: 'Full Financial Report' });
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

function getReportTypeLabel(
  reportType: ReportType,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (reportType) {
    case 'full-financial':
      return t('reports.types.fullFinancial', { defaultValue: 'Full Financial Report' });
    case 'income-expense':
      return t('reports.types.incomeExpense');
    case 'spending-category':
      return t('reports.types.spendingCategory');
    case 'monthly-trends':
      return t('reports.types.trends');
    case 'budget-performance':
      return t('reports.types.budgetPerformance');
    case 'account-statement':
      return t('reports.types.accountStatement');
    default:
      return t('reports.titles.report');
  }
}

function getReportTypeDescription(
  reportType: ReportType,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (reportType) {
    case 'full-financial':
      return t('reports.descriptions.fullFinancial', {
        defaultValue: 'Create one organized financial document with summary, accounts, budgets, commitments, item insights, and transaction details.',
      });
    case 'income-expense':
      return t('reports.descriptions.incomeExpense');
    case 'spending-category':
      return t('reports.descriptions.spendingCategory');
    case 'monthly-trends':
      return t('reports.descriptions.trends');
    case 'budget-performance':
      return t('reports.descriptions.budgetPerformance');
    case 'account-statement':
      return t('reports.descriptions.accountStatement');
    default:
      return '';
  }
}

function getDashboardModeFromPreset(preset: ReportPeriodPreset): DashboardReportMode {
  return preset === 'current_pay_period' || preset === 'previous_pay_period' ? 'pay_cycle' : 'month';
}

function buildTableCsv(table: FullReportSummaryTable) {
  return [
    buildCsvRow(table.headers),
    ...table.rows.map((row) => buildCsvRow(row)),
  ].join('\n');
}

function buildFullReportSummaryCsv(
  report: FullFinancialReportData,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const rows: string[] = [];
  rows.push(buildCsvRow(['Section', 'Label', 'Value', 'Notes']));
  for (const item of report.metadata) {
    rows.push(buildCsvRow(['Metadata', item.label, item.value, '']));
  }
  for (const item of report.executiveSummary.metrics) {
    rows.push(buildCsvRow([t('reports.fullReport.sections.executiveSummary', { defaultValue: 'Executive Summary' }), item.label, item.value, item.helper || '']));
  }
  for (const item of report.incomeExpenses.metrics) {
    rows.push(buildCsvRow([t('reports.fullReport.sections.incomeExpenses', { defaultValue: 'Income and Expenses' }), item.label, item.value, item.helper || '']));
  }
  for (const item of report.accounts.summary) {
    rows.push(buildCsvRow([t('reports.fullReport.sections.accounts', { defaultValue: 'Financial Accounts' }), item.label, item.value, item.helper || '']));
  }
  for (const item of report.budgets.summary) {
    rows.push(buildCsvRow([t('reports.fullReport.sections.budgets', { defaultValue: 'Budget Performance' }), item.label, item.value, item.helper || '']));
  }
  for (const item of report.people.summary) {
    rows.push(buildCsvRow([t('reports.fullReport.sections.people', { defaultValue: 'People, Reimbursements and Settlements' }), item.label, item.value, item.helper || '']));
  }
  for (const item of report.subscriptions.summary) {
    rows.push(buildCsvRow([t('reports.fullReport.sections.subscriptions', { defaultValue: 'Personal Subscriptions' }), item.label, item.value, item.helper || '']));
  }
  for (const item of report.loans.summary) {
    rows.push(buildCsvRow([t('reports.fullReport.sections.loans', { defaultValue: 'Loans and Repayments' }), item.label, item.value, item.helper || '']));
  }
  for (const observation of report.observations) {
    rows.push(buildCsvRow([t('reports.fullReport.sections.observations', { defaultValue: 'Key Observations' }), t('reports.observations', { defaultValue: 'Observation' }), observation, '']));
  }
  return rows.join('\n');
}

export default function ReportsScreen() {
  const { t } = useTranslation(['portal', 'common']);
  const { dir, language } = useLanguage();
  const { user, profile } = useAuth();
  const locale = getIntlLocale(language);
  const isArabic = language === 'ar';
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
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedPersonId, setSelectedPersonId] = useState('all');
  const [selectedTransactionType, setSelectedTransactionType] = useState<'all' | 'income' | 'expense'>('all');
  const [currencyMode, setCurrencyMode] = useState<'reporting' | 'both'>('both');
  const [includeTransactionDetails, setIncludeTransactionDetails] = useState(true);
  const [includeCharts, setIncludeCharts] = useState(true);
  const [includeItemInsights, setIncludeItemInsights] = useState(true);
  const [includeUpcomingCommitments, setIncludeUpcomingCommitments] = useState(true);
  const [includeArchivedAccounts, setIncludeArchivedAccounts] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [mobileFiltersExpanded, setMobileFiltersExpanded] = useState(false);
  const [reportData, setReportData] = useState<ReportViewData | null>(null);
  const [allAccounts, setAllAccounts] = useState<FinancialAccount[]>([]);
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
  const [availablePeople, setAvailablePeople] = useState<ManagedPerson[]>([]);
  const [profileCountry, setProfileCountry] = useState<string | null>(null);
  const [fullReportData, setFullReportData] = useState<FullFinancialReportData | null>(null);
  const [fullReportLoading, setFullReportLoading] = useState(false);
  const [fullReportError, setFullReportError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInFlight, setActionInFlight] = useState<'csv' | 'print' | null>(null);
  const latestReportRequestRef = useRef(0);
  const latestFullReportRequestRef = useRef(0);

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

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getAccounts(),
      getCategories(),
      getManagedPeople(),
    ])
      .then(([accounts, categories, people]) => {
        if (cancelled) return;
        setAllAccounts(accounts);
        setAvailableCategories(categories);
        setAvailablePeople(people);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : t('reports.loadError'));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setProfileCountry(null);
      return;
    }
    const supabase = createClient();
    void supabase
      .from('user_profiles')
      .select('country')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }: { data: { country: string | null } | null; error: Error | null }) => {
        if (cancelled) return;
        if (error) {
          setProfileCountry(null);
          return;
        }
        setProfileCountry(data?.country || null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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

  const fullReportFilters = useMemo<FullReportFilters>(() => ({
    categoryId: selectedCategoryId,
    personId: selectedPersonId,
    transactionType: selectedTransactionType,
    currencyMode,
    includeArchivedAccounts,
  }), [currencyMode, includeArchivedAccounts, selectedCategoryId, selectedPersonId, selectedTransactionType]);

  useEffect(() => {
    if (activeReport !== 'full-financial' || !activeRange || !reportData || !generatedAtLabel) {
      setFullReportData(null);
      setFullReportError(null);
      setFullReportLoading(false);
      return;
    }

    const requestId = latestFullReportRequestRef.current + 1;
    latestFullReportRequestRef.current = requestId;
    setFullReportLoading(true);
    setFullReportError(null);

    const selectedCategoryLabel = selectedCategoryId === 'all'
      ? t('reports.controls.allCategories', { defaultValue: 'All categories' })
      : availableCategories.find((category) => category.id === selectedCategoryId)?.name
        || t('reports.controls.allCategories', { defaultValue: 'All categories' });
    const selectedPersonLabel = selectedPersonId === 'all'
      ? t('reports.controls.allPeople', { defaultValue: 'All people' })
      : availablePeople.find((person) => person.id === selectedPersonId)?.full_name
        || t('reports.controls.allPeople', { defaultValue: 'All people' });
    const selectedAccountLabel = selectedAccount === 'all'
      ? t('reports.allAccounts')
      : getFinancialAccountDisplayLabel(
          (allAccounts.find((account) => account.id === selectedAccount) || reportData.accounts.find((account) => account.id === selectedAccount) || {
            name: selectedAccount,
            currency: '',
            is_system_default: false,
            system_default_type: null,
          }) as FinancialAccount,
          { includeCurrency: true, includeDefaultLabel: true }
        );
    const selectedScopeLabel = scopeType === 'space'
      ? spaces.find((space) => space.id === selectedSpaceId)?.name || t('reports.spaceScope', { defaultValue: 'Space' })
      : t('reports.personalScope', { defaultValue: 'Personal' });
    const transactionTypeLabel = selectedTransactionType === 'all'
      ? t('reports.controls.allTransactionTypes', { defaultValue: 'All transaction types' })
      : t(`transactions.types.${selectedTransactionType}`);
    const currencyModeLabel = currencyMode === 'both'
      ? t('reports.controls.currencyModeBoth', { defaultValue: 'Reporting and original values' })
      : t('reports.controls.currencyModeReporting', { defaultValue: 'Reporting values first' });
    const includeDetailsLabel = includeTransactionDetails
      ? t('reports.controls.includeTransactionDetails', { defaultValue: 'Complete transaction details' })
      : t('reports.controls.summaryOnlyTransactions', { defaultValue: 'Transaction summary only' });

    const metadata: ReportMetadataItem[] = [
      { label: t('reports.fullReport.metadata.reportType', { defaultValue: 'Report type' }), value: getReportTypeLabel(activeReport, t) },
      { label: t('reports.fullReport.metadata.scope', { defaultValue: 'Scope' }), value: selectedScopeLabel },
      { label: t('reports.fullReport.metadata.period', { defaultValue: 'Selected period' }), value: formatReportPeriodLabel(activeRange) },
      { label: t('reports.fullReport.metadata.reportingCurrency', { defaultValue: 'Reporting currency' }), value: reportData.reportingCurrency },
      { label: t('reports.fullReport.metadata.currencyMode', { defaultValue: 'Currency mode' }), value: currencyModeLabel },
      {
        label: t('reports.fullReport.metadata.filters', { defaultValue: 'Selected filters' }),
        value: [selectedAccountLabel, selectedCategoryLabel, selectedPersonLabel, transactionTypeLabel].join(' | '),
      },
      { label: t('reports.fullReport.metadata.transactions', { defaultValue: 'Transaction details' }), value: includeDetailsLabel },
      { label: t('reports.generated'), value: generatedAtLabel },
    ];

    const previousRange = periodContext && activePreset !== 'custom'
      ? getPreviousComparableReportPeriod({
          preset: activePreset,
          config: periodContext.effectiveConfig,
          locale,
          startDate: activeRange.startDate,
          endDate: activeRange.endDate,
        })
      : null;

    void Promise.all([
      scopeType === 'personal'
        ? getDashboardMetrics({
            startDate: activeRange.startDate,
            endDate: activeRange.endDate,
            mode: getDashboardModeFromPreset(activePreset),
          })
        : Promise.resolve(null),
      previousRange
        ? getReportViewData({
            startDate: previousRange.startDate,
            endDate: previousRange.endDate,
            accountId: selectedAccount,
            scopeType,
            spaceId: scopeType === 'space' ? selectedSpaceId || null : null,
            locale,
          })
        : Promise.resolve(null),
      scopeType === 'space'
        ? getReimbursements({ spaceId: selectedSpaceId || undefined })
        : getReimbursements().then((rows) => rows.filter((row) => !row.space_id)),
      scopeType === 'space'
        ? (selectedSpaceId ? getSpaceSettlements(selectedSpaceId, { includeReversed: true }) : Promise.resolve([]))
        : getSettlements(undefined, { includeReversed: true }).then((rows) => rows.filter((row) => !row.space_id)),
      scopeType === 'personal' ? getPersonalSubscriptions() : Promise.resolve([] as PersonalSubscription[]),
      getRecurringTransactions().then((rows) => rows.filter((row) =>
        scopeType === 'space' ? row.space_id === selectedSpaceId : !row.space_id
      )),
      scopeType === 'personal' ? getPersonLoanReportItems() : Promise.resolve([] as PersonLoanReportItem[]),
      getTransfers({
        scopeType,
        spaceId: scopeType === 'space' ? selectedSpaceId || undefined : undefined,
      }),
      includeItemInsights && selectedTransactionType !== 'income'
        ? getItemInsightsSnapshot({
            startDate: activeRange.startDate,
            endDate: activeRange.endDate,
            accountId: selectedAccount !== 'all' ? selectedAccount : undefined,
            categoryId: selectedCategoryId !== 'all' ? selectedCategoryId : null,
            scopeType,
            spaceId: scopeType === 'space' ? selectedSpaceId || null : null,
          })
        : Promise.resolve(null),
    ])
      .then(([
        dashboardMetrics,
        previousReportData,
        reimbursements,
        settlements,
        subscriptions,
        recurringItems,
        loanItems,
        transfers,
        itemInsightsSnapshot,
      ]) => {
        if (latestFullReportRequestRef.current !== requestId) return;

        const identity: PrintableReportIdentity = {
          fullName: profile?.full_name || user?.user_metadata?.full_name || user?.email || null,
          email: user?.email || null,
          country: profileCountry,
          avatarUrl: profile?.avatar_url || user?.user_metadata?.avatar_url || null,
        };

        const fullData = buildFullFinancialReportData({
          title: t('reports.types.fullFinancial', { defaultValue: 'Full Financial Report' }),
          identity,
          generatedAtLabel,
          metadata,
          reportData,
          activeRange,
          scopeType,
          locale,
          todayIso: periodContext?.currentBusinessDate || new Date().toISOString().slice(0, 10),
          t,
          filters: fullReportFilters,
          supplemental: {
            dashboardMetrics,
            previousReportData,
            allAccounts,
            people: availablePeople,
            reimbursements,
            settlements,
            subscriptions,
            recurringItems,
            loanItems,
            transfers,
            itemInsightsSnapshot,
          } satisfies FullReportSupplementalData,
          includeCharts,
          includeTransactionDetails,
          incomeExpenseChartState: {
            data: incomeExpenseChartState.data,
            unavailableReason: incomeExpenseChartState.unavailableReason,
            emptyReason: incomeExpenseChartState.emptyReason === 'NO_TRANSACTIONS'
              ? t('reports.noTransactionsInPeriod')
              : incomeExpenseChartState.emptyReason,
          } satisfies FullReportChartState<IncomeExpenseChartRow>,
          spendingCategoryChartState: {
            data: spendingCategoryChartState.data,
            unavailableReason: spendingCategoryChartState.unavailableReason,
            emptyReason: spendingCategoryChartState.emptyReason === 'NO_EXPENSES'
              ? t('reports.noExpensesInPeriod')
              : spendingCategoryChartState.emptyReason,
          } satisfies FullReportChartState<SpendingCategoryChartRow>,
        });
        setFullReportData(fullData);
      })
      .catch((error) => {
        if (latestFullReportRequestRef.current !== requestId) return;
        const message = error instanceof Error ? error.message : t('reports.loadError');
        setFullReportError(message);
      })
      .finally(() => {
        if (latestFullReportRequestRef.current === requestId) {
          setFullReportLoading(false);
        }
      });
  }, [
    activePreset,
    activeRange,
    activeReport,
    allAccounts,
    availableCategories,
    availablePeople,
    currencyMode,
    fullReportFilters,
    generatedAtLabel,
    includeCharts,
    includeItemInsights,
    includeTransactionDetails,
    incomeExpenseChartState.data,
    incomeExpenseChartState.emptyReason,
    incomeExpenseChartState.unavailableReason,
    locale,
    periodContext,
    profile?.avatar_url,
    profile?.full_name,
    profileCountry,
    reportData,
    scopeType,
    selectedAccount,
    selectedCategoryId,
    selectedPersonId,
    selectedSpaceId,
    selectedTransactionType,
    spaces,
    spendingCategoryChartState.data,
    spendingCategoryChartState.emptyReason,
    spendingCategoryChartState.unavailableReason,
    t,
    user?.email,
    user?.user_metadata?.avatar_url,
    user?.user_metadata?.full_name,
  ]);

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
    'full-financial': [
      {
        id: 'rpt-ff-scope',
        label: t('reports.controls.scopeLabel', { defaultValue: 'Scope' }),
        value: scopeType === 'space'
          ? spaces.find((space) => space.id === selectedSpaceId)?.name || t('reports.spaceScope', { defaultValue: 'Space' })
          : t('reports.personalScope', { defaultValue: 'Personal' }),
        sub: activeRange?.label,
      },
      {
        id: 'rpt-ff-currency',
        label: t('reports.reportingCurrencyLabel'),
        value: reportData?.reportingCurrency || t('reports.loading'),
        sub: currencyMode === 'both'
          ? t('reports.controls.currencyModeBoth', { defaultValue: 'Reporting and original values' })
          : t('reports.controls.currencyModeReporting', { defaultValue: 'Reporting values first' }),
      },
      {
        id: 'rpt-ff-transactions',
        label: t('reports.summary.totalTransactions'),
        value: String(reportData?.transactions.length || 0),
        sub: includeTransactionDetails
          ? t('reports.controls.includeTransactionDetails', { defaultValue: 'Complete transaction details' })
          : t('reports.controls.summaryOnlyTransactions', { defaultValue: 'Transaction summary only' }),
      },
      {
        id: 'rpt-ff-status',
        label: t('reports.controls.previewStatus', { defaultValue: 'Preview status' }),
        value: fullReportLoading ? t('reports.loading') : fullReportError ? t('reports.unavailable') : t('reports.controls.ready', { defaultValue: 'Ready' }),
        sub: fullReportError || generatedAtLabel || t('reports.loading'),
      },
    ],
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

  const selectedAccountLabel = selectedAccount === 'all'
    ? t('reports.allAccounts')
    : getFinancialAccountDisplayLabel(
        (allAccounts.find((account) => account.id === selectedAccount) || reportData?.accounts.find((account) => account.id === selectedAccount) || {
          name: selectedAccount,
          currency: '',
          is_system_default: false,
          system_default_type: null,
        }) as FinancialAccount,
        { includeCurrency: true, includeDefaultLabel: true }
      );
  const selectedCategoryLabel = selectedCategoryId === 'all'
    ? t('reports.controls.allCategories', { defaultValue: 'All categories' })
    : availableCategories.find((category) => category.id === selectedCategoryId)?.name
      || t('reports.controls.allCategories', { defaultValue: 'All categories' });
  const selectedPersonLabel = selectedPersonId === 'all'
    ? t('reports.controls.allPeople', { defaultValue: 'All people' })
    : availablePeople.find((person) => person.id === selectedPersonId)?.full_name
      || t('reports.controls.allPeople', { defaultValue: 'All people' });
  const selectedScopeLabel = scopeType === 'space'
    ? spaces.find((space) => space.id === selectedSpaceId)?.name || t('reports.spaceScope', { defaultValue: 'Space' })
    : t('reports.personalScope', { defaultValue: 'Personal' });
  const selectedTransactionTypeLabel = selectedTransactionType === 'all'
    ? t('reports.controls.allTransactionTypes', { defaultValue: 'All transaction types' })
    : t(`transactions.types.${selectedTransactionType}`);
  const selectedFilterSummary = [
    selectedScopeLabel,
    selectedAccountLabel,
    selectedCategoryLabel,
    selectedPersonLabel,
    selectedTransactionTypeLabel,
  ].join(' | ');
  const activeMobileFilterSummaries = useMemo(() => {
    const summaries = [
      activeRange?.label || null,
      selectedScopeLabel,
      selectedAccountLabel,
      scopeType === 'space' ? spaces.find((space) => space.id === selectedSpaceId)?.name || null : null,
      selectedCategoryId !== 'all' ? selectedCategoryLabel : null,
      selectedPersonId !== 'all' ? selectedPersonLabel : null,
      selectedTransactionType !== 'all' ? selectedTransactionTypeLabel : null,
      activeReport === 'full-financial'
        ? (currencyMode === 'both'
          ? t('reports.controls.currencyModeBoth', { defaultValue: 'Reporting and original values' })
          : t('reports.controls.currencyModeReporting', { defaultValue: 'Reporting values first' }))
        : null,
    ].filter((value): value is string => Boolean(value));

    return Array.from(new Set(summaries));
  }, [
    activeRange?.label,
    activeReport,
    currencyMode,
    scopeType,
    selectedAccountLabel,
    selectedCategoryId,
    selectedCategoryLabel,
    selectedPersonId,
    selectedPersonLabel,
    selectedSpaceId,
    selectedScopeLabel,
    selectedTransactionType,
    selectedTransactionTypeLabel,
    spaces,
    t,
  ]);
  const activeMobileFilterCount = useMemo(() => {
    let count = 0;
    if (activePreset !== 'current_month') count += 1;
    if (scopeType !== 'personal') count += 1;
    if (selectedAccount !== 'all') count += 1;
    if (selectedCategoryId !== 'all') count += 1;
    if (selectedPersonId !== 'all') count += 1;
    if (selectedTransactionType !== 'all') count += 1;
    if (currencyMode !== 'both') count += 1;
    if (includeArchivedAccounts) count += 1;
    if (!includeTransactionDetails) count += 1;
    if (!includeCharts) count += 1;
    if (!includeItemInsights) count += 1;
    if (!includeUpcomingCommitments) count += 1;
    return count;
  }, [
    activePreset,
    currencyMode,
    includeArchivedAccounts,
    includeCharts,
    includeItemInsights,
    includeTransactionDetails,
    includeUpcomingCommitments,
    scopeType,
    selectedAccount,
    selectedCategoryId,
    selectedPersonId,
    selectedTransactionType,
  ]);

  const handleDownloadCSV = useCallback(() => {
    if (actionInFlight) return;
    setActionInFlight('csv');
    try {
      if (!reportData || !activeRange) {
        toast.error(t('reports.noDataToExport'));
        return;
      }
      if (activeReport === 'full-financial') {
        if (!fullReportData) {
          toast.error(fullReportError || t('reports.noDataToExport'));
          return;
        }
        const baseName = `smart-pocket-full-financial-${activeRange.startDate}-to-${activeRange.endDate}`;
        const accountHeaders = ['Group', ...fullReportData.accounts.personal.headers];
        const accountRows = [
          ...fullReportData.accounts.personal.rows.map((row) => ['Personal', ...row]),
          ...fullReportData.accounts.shared.rows.map((row) => ['Shared', ...row]),
          ...fullReportData.accounts.spaces.rows.map((row) => ['Space', ...row]),
        ];
        downloadCsvFile(`${baseName}-summary.csv`, buildFullReportSummaryCsv(fullReportData, t));
        downloadCsvFile(`${baseName}-transactions.csv`, buildTransactionsCsv(reportData, t));
        downloadCsvFile(`${baseName}-accounts.csv`, [buildCsvRow(accountHeaders), ...accountRows.map((row) => buildCsvRow(row))].join('\n'));
        downloadCsvFile(`${baseName}-categories.csv`, buildTableCsv(fullReportData.categories.expenseTable));
        downloadCsvFile(`${baseName}-budgets.csv`, buildTableCsv(fullReportData.budgets.table));
        downloadCsvFile(`${baseName}-people.csv`, buildTableCsv(fullReportData.people.table));
        downloadCsvFile(`${baseName}-subscriptions.csv`, buildTableCsv(fullReportData.subscriptions.table));
        downloadCsvFile(`${baseName}-recurring.csv`, buildTableCsv(fullReportData.recurring.table));
        toast.success(t('reports.fullReport.csvPackageExported', { defaultValue: 'Exported the full report CSV package.' }));
        return;
      }
      if (activeReport === 'budget-performance') {
        if (reportData.budgetPerformance.items.length === 0) {
          toast.error(t('reports.noBudgetsApply'));
          return;
        }
        downloadCsvFile(
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
      downloadCsvFile(
        buildCsvFilename(activeReport, activeRange),
        buildTransactionsCsv(reportData, t)
      );
      toast.success(t('reports.csvExportedTransactions', { count: reportData.transactions.length }));
    } finally {
      setActionInFlight(null);
    }
  }, [actionInFlight, activeRange, activeReport, fullReportData, fullReportError, reportData, t]);

  const handlePrint = useCallback(() => {
    if (actionInFlight) return;
    setActionInFlight('print');
    try {
      window.print();
    } finally {
      setActionInFlight(null);
    }
  }, [actionInFlight]);

  const handlePreviewReport = useCallback(() => {
    setGeneratedAtLabel(new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date()));
    void loadReportData();
  }, [loadReportData, locale]);

  const handleResetReportOptions = useCallback(() => {
    if (!periodContext) return;
    setActivePreset('current_month');
    setPeriodCursor(periodContext.currentBusinessDate);
    setCustomDateFrom(periodContext.currentMonthlyPeriod.startDate);
    setCustomDateTo(periodContext.currentBusinessDate);
    setScopeType('personal');
    setSelectedSpaceId(spaces[0]?.id || '');
    setSelectedAccount('all');
    setSelectedCategoryId('all');
    setSelectedPersonId('all');
    setSelectedTransactionType('all');
    setCurrencyMode('both');
    setIncludeTransactionDetails(true);
    setIncludeCharts(true);
    setIncludeItemInsights(true);
    setIncludeUpcomingCommitments(true);
    setIncludeArchivedAccounts(false);
    setShowMoreOptions(false);
  }, [periodContext, spaces]);

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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-nowrap print:hidden">
            <Link href="/reports/item-insights" className="btn-secondary inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl px-3 text-sm sm:h-9 sm:w-auto">
              <BarChart3 size={15} />
              {t('itemInsights.title')}
            </Link>
          </div>
        }
      />

      {activeReport !== 'full-financial' ? (
        <div className="hidden print:block rounded-xl border border-border p-4">
          <p className="text-lg font-700 text-foreground">{activeTitle}</p>
          <p className="text-sm text-muted-foreground">{t('reports.range')}: {activeRange ? formatReportPeriodLabel(activeRange) : t('reports.loading')}</p>
          <p className="text-sm text-muted-foreground">
            {t('reports.accountFilter')}: {selectedAccountLabel}
          </p>
          <p className="text-sm text-muted-foreground">{t('reports.reportingCurrencyLabel')}: {reportData?.reportingCurrency || t('reports.loading')}</p>
          <p className="text-sm text-muted-foreground">{t('reports.generated')}: {generatedAtLabel || t('reports.loading')}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="card-elevated p-3 xl:col-span-1 print:hidden sm:p-3.5">
          <p className={`mb-3 px-1 font-600 text-muted-foreground ${isArabic ? 'text-xs tracking-normal' : 'text-[11px] uppercase tracking-wider'}`}>{t('reports.reportType')}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
            {reportTypes.map((rt) => {
              const Icon = rt.icon;
              const label = getReportTypeLabel(rt.id, t);
              const description = getReportTypeDescription(rt.id, t);
              return (
                <button
                  key={rt.id}
                  onClick={() => setActiveReport(rt.id)}
                  aria-pressed={activeReport === rt.id}
                  className={`w-full rounded-2xl border p-3 text-left transition-all duration-150 ${
                    activeReport === rt.id ? 'border-accent bg-accent/8 shadow-sm' : 'border-border bg-card hover:border-accent/40 hover:bg-muted/40'
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${activeReport === rt.id ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className={`text-sm font-700 leading-snug ${activeReport === rt.id ? 'text-accent' : 'text-foreground'} ${isArabic ? 'text-[14px] leading-6' : ''}`}>
                        {label}
                      </p>
                      <p className="mt-1 hidden text-[11px] leading-tight text-muted-foreground xl:block">{description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4 xl:col-span-3">
          <div className="card-elevated p-3 print:hidden sm:p-4">
            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-muted/12 p-3 sm:hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-700 uppercase tracking-[0.08em] text-muted-foreground">
                      {getReportTypeLabel(activeReport, t)}
                    </p>
                    <p className={`mt-1 truncate font-700 text-foreground ${isArabic ? 'text-[15px] leading-6' : 'text-sm'}`}>
                      {activeRange?.label || t('reports.loadingPeriod')}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {activeRange?.comparisonLabel
                        ? t('reports.comparedWith', { value: activeRange.comparisonLabel })
                        : activePreset === 'custom'
                          ? t('reports.customRange')
                          : t('reports.sharedBoundaries')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {activeMobileFilterCount > 0 ? (
                      <button
                        type="button"
                        onClick={handleResetReportOptions}
                        disabled={loading || fullReportLoading}
                        className="btn-ghost h-10 rounded-xl px-3 text-sm disabled:opacity-60"
                      >
                        {t('reports.controls.reset', { defaultValue: 'Reset' })}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setMobileFiltersExpanded((current) => !current)}
                      className={`btn-secondary inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm ${mobileFiltersExpanded ? 'border-accent text-accent' : ''}`}
                    >
                      <Filter size={15} />
                      {t('actions.filter', { ns: 'common' })}
                      {activeMobileFilterCount > 0 ? (
                        <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-700 text-accent-foreground">
                          {activeMobileFilterCount}
                        </span>
                      ) : null}
                      {mobileFiltersExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>
                {activeMobileFilterSummaries.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeMobileFilterSummaries.slice(0, 5).map((summary) => (
                      <span
                        key={`report-filter-summary-${summary}`}
                        className="inline-flex max-w-full items-center rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-700 text-muted-foreground shadow-card-sm"
                      >
                        <span className="truncate">{summary}</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className={`${mobileFiltersExpanded ? 'block' : 'hidden'} sm:block`}>
                <div className="space-y-3">
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-thin sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                    {visibleReportPresets.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handlePresetChange(preset)}
                        aria-pressed={activePreset === preset}
                        className={`inline-flex h-9 flex-none items-center justify-center whitespace-nowrap rounded-xl border px-3 text-sm font-600 leading-none transition-all ${
                          activePreset === preset
                            ? 'border-accent bg-accent/10 text-accent'
                            : 'border-border text-muted-foreground hover:border-accent/40 hover:bg-muted/40 hover:text-foreground'
                        }`}
                      >
                        {getPresetButtonLabel(preset, periodContext, t)}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 xl:grid-cols-4">
                    <div className="min-w-0">
                      <span className={`mb-1 block font-600 text-muted-foreground ${isArabic ? 'text-xs' : 'text-[11px]'}`}>{t('reports.from')}</span>
                      <label className="sr-only" htmlFor="report-date-from">{t('reports.reportStartDate')}</label>
                      <input
                        id="report-date-from"
                        type="date"
                        value={activePreset === 'custom' ? customDateFrom : activeRange?.startDate || ''}
                        onChange={(event) => {
                          setActivePreset('custom');
                          setCustomDateFrom(event.target.value);
                        }}
                        className="input-base h-10 min-w-0 w-full rounded-xl px-3 text-sm"
                      />
                    </div>

                    <div className="min-w-0">
                      <span className={`mb-1 block font-600 text-muted-foreground ${isArabic ? 'text-xs' : 'text-[11px]'}`}>{t('reports.to')}</span>
                      <label className="sr-only" htmlFor="report-date-to">{t('reports.reportEndDate')}</label>
                      <input
                        id="report-date-to"
                        type="date"
                        value={activePreset === 'custom' ? customDateTo : activeRange?.endDate || ''}
                        onChange={(event) => {
                          setActivePreset('custom');
                          setCustomDateTo(event.target.value);
                        }}
                        className="input-base h-10 min-w-0 w-full rounded-xl px-3 text-sm"
                      />
                    </div>

                    <div className="min-w-0">
                      <span className={`mb-1 block font-600 text-muted-foreground ${isArabic ? 'text-xs' : 'text-[11px]'}`}>{t('reports.scopeLabel', { defaultValue: 'Scope' })}</span>
                      <select
                        value={scopeType}
                        onChange={(event) => setScopeType(event.target.value as 'personal' | 'space')}
                        className="input-base h-10 min-w-0 w-full rounded-xl px-3 text-sm"
                      >
                        <option value="personal">{t('reports.personalScope', { defaultValue: 'Personal' })}</option>
                        <option value="space" disabled={spaces.length === 0}>
                          {t('reports.spaceScope', { defaultValue: 'Space' })}
                        </option>
                      </select>
                    </div>

                    <div className="min-w-0">
                      <span className={`mb-1 block font-600 text-muted-foreground ${isArabic ? 'text-xs' : 'text-[11px]'}`}>{t('reports.account')}</span>
                      <label className="sr-only" htmlFor="report-account-filter">{t('reports.filterByAccount')}</label>
                      <select
                        id="report-account-filter"
                        value={selectedAccount}
                        onChange={(event) => setSelectedAccount(event.target.value)}
                        className="input-base h-10 min-w-0 w-full rounded-xl px-3 text-sm"
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

                    {scopeType === 'space' ? (
                      <div className="min-w-0 min-[390px]:col-span-2 xl:col-span-4">
                        <span className={`mb-1 block font-600 text-muted-foreground ${isArabic ? 'text-xs' : 'text-[11px]'}`}>{t('spaces.title', { ns: 'portal', defaultValue: 'Spaces' })}</span>
                        <select
                          value={selectedSpaceId}
                          onChange={(event) => setSelectedSpaceId(event.target.value)}
                          className="input-base h-10 min-w-0 w-full rounded-xl px-3 text-sm"
                        >
                          {spaces.map((space) => (
                            <option key={space.id} value={space.id}>
                              {space.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={goToPreviousRange}
                      disabled={activePreset === 'custom' || periodLoading}
                      className="btn-secondary h-10 rounded-xl px-2 text-sm disabled:opacity-50"
                      aria-label={`${t('reports.previous')} ${previousRangeLabel}`}
                    >
                      <PreviousIcon size={14} />
                      <span className="truncate">{t('reports.previous')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => periodContext && setPeriodCursor(periodContext.currentBusinessDate)}
                      disabled={periodLoading}
                      className="btn-secondary h-10 rounded-xl px-2 text-sm disabled:opacity-50"
                    >
                      {t('reports.current')}
                    </button>
                    <button
                      type="button"
                      onClick={goToNextRange}
                      disabled={activePreset === 'custom' || !activeRange?.canNavigateForward || periodLoading}
                      className="btn-secondary h-10 rounded-xl px-2 text-sm disabled:opacity-50"
                      aria-label={`${t('reports.next')} ${previousRangeLabel}`}
                    >
                      <span className="truncate">{t('reports.next')}</span>
                      <NextIcon size={14} />
                    </button>
                  </div>

                  <div className="hidden sm:flex sm:flex-wrap sm:gap-2">
                    {activeMobileFilterSummaries.map((summary) => (
                      <span
                        key={`report-filter-summary-desktop-${summary}`}
                        className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1.5 text-xs font-700 text-muted-foreground shadow-card-sm"
                      >
                        {summary}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {activeReport === 'full-financial' ? (
                <div className="grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <span className={`mb-1 block font-600 text-muted-foreground ${isArabic ? 'text-xs' : 'text-[11px]'}`}>{t('reports.controls.category', { defaultValue: 'Category' })}</span>
                    <select
                      value={selectedCategoryId}
                      onChange={(event) => setSelectedCategoryId(event.target.value)}
                      className="input-base h-10 w-full rounded-xl px-3 text-sm"
                    >
                      <option value="all">{t('reports.controls.allCategories', { defaultValue: 'All categories' })}</option>
                      {availableCategories.map((category) => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className={`mb-1 block font-600 text-muted-foreground ${isArabic ? 'text-xs' : 'text-[11px]'}`}>{t('reports.controls.person', { defaultValue: 'Person' })}</span>
                    <select
                      value={selectedPersonId}
                      onChange={(event) => setSelectedPersonId(event.target.value)}
                      className="input-base h-10 w-full rounded-xl px-3 text-sm"
                    >
                      <option value="all">{t('reports.controls.allPeople', { defaultValue: 'All people' })}</option>
                      {availablePeople.map((person) => (
                        <option key={person.id} value={person.id}>{person.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className={`mb-1 block font-600 text-muted-foreground ${isArabic ? 'text-xs' : 'text-[11px]'}`}>{t('reports.controls.transactionType', { defaultValue: 'Transaction type' })}</span>
                    <select
                      value={selectedTransactionType}
                      onChange={(event) => setSelectedTransactionType(event.target.value as 'all' | 'income' | 'expense')}
                      className="input-base h-10 w-full rounded-xl px-3 text-sm"
                    >
                      <option value="all">{t('reports.controls.allTransactionTypes', { defaultValue: 'All transaction types' })}</option>
                      <option value="income">{t('transactions.types.income')}</option>
                      <option value="expense">{t('transactions.types.expense')}</option>
                    </select>
                  </div>
                  <div>
                    <span className={`mb-1 block font-600 text-muted-foreground ${isArabic ? 'text-xs' : 'text-[11px]'}`}>{t('reports.controls.currencyMode', { defaultValue: 'Currency mode' })}</span>
                    <select
                      value={currencyMode}
                      onChange={(event) => setCurrencyMode(event.target.value as 'reporting' | 'both')}
                      className="input-base h-10 w-full rounded-xl px-3 text-sm"
                    >
                      <option value="both">{t('reports.controls.currencyModeBoth', { defaultValue: 'Reporting and original values' })}</option>
                      <option value="reporting">{t('reports.controls.currencyModeReporting', { defaultValue: 'Reporting values first' })}</option>
                    </select>
                  </div>
                </div>
              ) : null}

              {activeReport === 'full-financial' ? (
                <div className="rounded-2xl border border-border/80 bg-muted/15 p-3 sm:p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-700 text-foreground">{t('reports.controls.fullReportPanelTitle', { defaultValue: 'Full Financial Report' })}</p>
                      <p className={`text-muted-foreground ${isArabic ? 'text-[12px] leading-5' : 'text-xs'}`}>
                        {t('reports.controls.fullReportPanelDescription', {
                          defaultValue: 'Preview one organized report using the selected period, scope, and filters without changing underlying calculations.',
                        })}
                      </p>
                    </div>
                    <button type="button" onClick={() => setShowMoreOptions((current) => !current)} className="text-xs font-600 text-accent">
                      {showMoreOptions
                        ? t('reports.controls.hideMoreOptions', { defaultValue: 'Hide more report options' })
                        : t('reports.controls.moreOptions', { defaultValue: 'More report options' })}
                    </button>
                  </div>

                  {showMoreOptions ? (
                    <div className="mt-3 grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 xl:grid-cols-3">
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" checked={includeTransactionDetails} onChange={(event) => setIncludeTransactionDetails(event.target.checked)} />
                        {t('reports.controls.includeTransactionDetails', { defaultValue: 'Include transaction details' })}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" checked={includeCharts} onChange={(event) => setIncludeCharts(event.target.checked)} />
                        {t('reports.controls.includeCharts', { defaultValue: 'Include charts' })}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" checked={includeItemInsights} onChange={(event) => setIncludeItemInsights(event.target.checked)} />
                        {t('reports.controls.includeItemInsights', { defaultValue: 'Include item insights' })}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" checked={includeUpcomingCommitments} onChange={(event) => setIncludeUpcomingCommitments(event.target.checked)} />
                        {t('reports.controls.includeUpcomingCommitments', { defaultValue: 'Include upcoming commitments' })}
                      </label>
                      <label className="flex items-center gap-2 text-sm text-foreground">
                        <input type="checkbox" checked={includeArchivedAccounts} onChange={(event) => setIncludeArchivedAccounts(event.target.checked)} />
                        {t('reports.controls.includeArchivedAccounts', { defaultValue: 'Include archived or versioned accounts when relevant' })}
                      </label>
                    </div>
                  ) : null}

                  <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <button onClick={handlePreviewReport} disabled={loading || fullReportLoading} className="btn-primary inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm disabled:opacity-60 md:col-span-2 lg:col-span-1">
                      {(loading || fullReportLoading) ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                      {t('reports.controls.preview', { defaultValue: 'Preview report' })}
                    </button>
                    <button onClick={handlePrint} disabled={actionInFlight !== null || fullReportLoading} className="btn-secondary inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm disabled:opacity-60">
                      {actionInFlight === 'print' ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                      {t('reports.print')}
                    </button>
                    <button onClick={handleDownloadCSV} disabled={actionInFlight !== null || fullReportLoading} className="btn-secondary inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-sm disabled:opacity-60">
                      {actionInFlight === 'csv' ? <Loader2 size={15} className="animate-spin" /> : <FileDown size={15} />}
                      {t('reports.controls.exportCsvPackage', { defaultValue: 'Export CSV package' })}
                    </button>
                    <button onClick={handleResetReportOptions} disabled={loading || fullReportLoading} className="btn-secondary inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm disabled:opacity-60 md:col-span-2">
                      {t('reports.controls.reset', { defaultValue: 'Reset' })}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 md:grid-cols-4 print:hidden">
            {summaryByType[activeReport].map((item) => (
              <div key={item.id} className="card-elevated p-3.5 sm:p-4">
                <p className={`mb-1.5 font-600 text-muted-foreground ${isArabic ? 'text-xs tracking-normal' : 'text-[11px] uppercase tracking-wider'}`}>{item.label}</p>
                <div className={`text-lg font-700 font-tabular ${item.positive === true ? 'text-positive' : item.positive === false ? 'text-negative' : 'text-foreground'}`}>
                  {(loading || periodLoading || (activeReport === 'full-financial' && fullReportLoading)) ? (
                    <span className="inline-block h-5 w-20 animate-pulse rounded bg-muted" />
                  ) : item.convertedMetric ? (
                    renderConvertedMetric(item.convertedMetric, item.positive)
                  ) : (
                    item.value
                  )}
                </div>
                {item.sub ? <p className={`mt-0.5 text-muted-foreground ${isArabic ? 'text-[12px] leading-5' : 'text-[11px]'}`}>{item.sub}</p> : null}
                {!loading && item.convertedMetric ? renderConvertedMetricDetails(item.convertedMetric, t, locale) : null}
              </div>
            ))}
          </div>

          <div className="card-elevated p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-2 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between max-[480px]:mb-3">
              <div className="min-w-0">
                <h2 className="text-base font-700 text-foreground">{activeTitle}</h2>
                <p className={`mt-0.5 text-muted-foreground ${isArabic ? 'text-[12px] leading-5' : 'text-xs'}`}>
                  {activeRange?.label || t('reports.loadingRange')}
                  {activeRange?.comparisonLabel ? ` · ${t('reports.comparedWith', { value: activeRange.comparisonLabel })}` : ''}
                </p>
                {activeReport === 'monthly-trends' ? (
                  <p className={`mt-1 text-muted-foreground ${isArabic ? 'text-[12px] leading-5' : 'text-[11px]'}`}>
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
              {(loading || periodLoading || (activeReport === 'full-financial' && fullReportLoading)) ? <Loader2 size={16} className="animate-spin text-accent" /> : null}
            </div>

            {loading || periodLoading ? (
              <div className="flex h-[300px] items-center justify-center">
                <div className="text-center">
                  <Loader2 size={24} className="mx-auto mb-2 animate-spin text-accent" />
                  <p className="text-sm text-muted-foreground">{t('reports.loadingData')}</p>
                </div>
              </div>
            ) : activeReport === 'full-financial' ? (
              fullReportLoading ? (
                <div className="flex h-[300px] items-center justify-center">
                  <div className="text-center">
                    <Loader2 size={24} className="mx-auto mb-2 animate-spin text-accent" />
                    <p className="text-sm text-muted-foreground">{t('reports.loadingData')}</p>
                  </div>
                </div>
              ) : fullReportError ? (
                <div className="flex min-h-[300px] items-center justify-center">
                  <EmptyState
                    icon={FileText}
                    title={t('reports.types.fullFinancial', { defaultValue: 'Full Financial Report' })}
                    description={fullReportError}
                  />
                </div>
              ) : fullReportData ? (
                <FullFinancialReport
                  data={fullReportData}
                  includeCharts={includeCharts}
                  includeTransactionDetails={includeTransactionDetails}
                  includeItemInsights={includeItemInsights}
                  includeUpcomingCommitments={includeUpcomingCommitments}
                />
              ) : (
                <div className="flex min-h-[300px] items-center justify-center">
                  <EmptyState
                    icon={FileText}
                    title={t('reports.types.fullFinancial', { defaultValue: 'Full Financial Report' })}
                    description={t('reports.controls.previewPrompt', { defaultValue: 'Choose your filters and preview the report to build the full financial document.' })}
                  />
                </div>
              )
            ) : activeReport === 'account-statement' ? (
              <AccountStatementTable
                transactions={reportData?.transactions || []}
                reportingCurrency={reportData?.reportingCurrency || ''}
                snapshots={reportData?.snapshots || []}
                t={t}
                locale={locale}
                isArabic={isArabic}
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
                  <div className="h-[260px] sm:h-[300px]">
                    <BudgetPerformanceChart
                      data={sanitizeBudgetPerformanceChartRows(reportData?.budgetPerformance.chartRows || [])}
                      currencyCode={reportData?.budgetPerformance.reportingCurrency || ''}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {(reportData?.budgetPerformance.items || []).map((item) => (
                      <div key={item.budget.id} className="rounded-2xl border border-border p-3.5 sm:p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-700 text-foreground">
                              {item.budget.category?.name
                                ? translateSystemCategoryName(item.budget.category.name, (key, options) =>
                                    t(key, { ...(options || {}), ns: 'common' })
                                  )
                                : item.budget.name || t('reports.budget')}
                            </p>
                            <p className={`text-muted-foreground ${isArabic ? 'text-[12px] leading-5' : 'text-xs'}`}>{getBudgetPeriodTypeLabel(item.period.budgetPeriod, t)} · {item.period.label}</p>
                          </div>
                          <StatusBadge
                            status={item.status === 'over_budget' ? 'error' : item.status === 'near_limit' ? 'warning' : item.status === 'conversion_unavailable' ? 'pending' : 'info'}
                            label={getLocalizedBudgetStatusLabel(item, t)}
                          />
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 min-[390px]:grid-cols-2 text-sm">
                          <div>
                            <p className={`text-muted-foreground ${isArabic ? 'text-xs tracking-normal' : 'text-[11px] uppercase tracking-wider'}`}>{t('reports.budget')}</p>
                            <FormattedCurrencyAmount amount={Number(item.budget.amount || 0)} currencyCode={item.budget.currency} className="font-700 text-foreground" showCode />
                          </div>
                          <div>
                            <p className={`text-muted-foreground ${isArabic ? 'text-xs tracking-normal' : 'text-[11px] uppercase tracking-wider'}`}>{t('reports.spent')}</p>
                            {item.spentAmount === null ? (
                              <p className="font-700 text-warning">{t('reports.unavailable')}</p>
                            ) : (
                              <FormattedCurrencyAmount amount={item.spentAmount} currencyCode={item.budget.currency} className="font-700 text-foreground" showCode />
                            )}
                          </div>
                          <div>
                            <p className={`text-muted-foreground ${isArabic ? 'text-xs tracking-normal' : 'text-[11px] uppercase tracking-wider'}`}>{t('reports.remaining')}</p>
                            {item.remainingAmount === null ? (
                              <p className="font-700 text-warning">{t('reports.unavailable')}</p>
                            ) : (
                              <FormattedCurrencyAmount amount={item.remainingAmount} currencyCode={item.budget.currency} className="font-700 text-foreground" showCode />
                            )}
                          </div>
                          <div>
                            <p className={`text-muted-foreground ${isArabic ? 'text-xs tracking-normal' : 'text-[11px] uppercase tracking-wider'}`}>{t('reports.progress')}</p>
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
              <div className="h-[260px] sm:h-[300px]">
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

          {activeReport !== 'full-financial' ? (
            <div className="card-elevated p-3.5 print:hidden sm:p-4">
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
                      className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-150 ${
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
          ) : null}
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
  locale: string;
  isArabic: boolean;
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
          const formattedDate = formatSafeUtcDisplayDate(transaction.transaction_date, args.locale);
          const conversion = convertHistoricalAmountWithSnapshots({
            amount: signedAmount,
            fromCurrency: transaction.currency || args.reportingCurrency,
            reportingCurrency: args.reportingCurrency,
            rateDate: transaction.transaction_date,
            snapshots: args.snapshots,
          });

          return (
            <div key={`mobile-${transaction.id}`} className="rounded-[24px] border border-border bg-card p-3.5 shadow-card-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border bg-muted/20 px-2.5 py-1 text-[11px] font-700 text-muted-foreground">
                      {getTransactionTypeLabel(transaction.transaction_type, args.t)}
                    </span>
                    <span className="text-[11px] font-600 text-muted-foreground">{formattedDate}</span>
                  </div>
                  <p className={`mt-2 text-foreground ${args.isArabic ? 'text-[15px] leading-6 font-700' : 'text-sm font-700'}`}>
                    {transaction.merchant || transaction.description || args.t('reports.accountStatement.entryFallback')}
                  </p>
                  {transaction.description && transaction.description !== transaction.merchant ? (
                    <p className={`mt-1 text-muted-foreground ${args.isArabic ? 'text-[12px] leading-5' : 'text-xs'}`}>
                      {transaction.description}
                    </p>
                  ) : null}
                </div>
                <FormattedCurrencyAmount
                  amount={signedAmount}
                  currencyCode={transaction.currency}
                  className={`text-sm font-700 ${signedAmount >= 0 ? 'text-positive' : 'text-foreground'}`}
                  showCode
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 min-[390px]:grid-cols-2 text-xs">
                <div>
                  <p className={`text-muted-foreground ${args.isArabic ? 'text-[11px] tracking-normal' : 'text-[10px] uppercase tracking-wider'}`}>{args.t('reports.accountStatement.columns.category')}</p>
                  <p className={`text-foreground ${args.isArabic ? 'text-[13px] leading-5' : ''}`}>
                    {transaction.category?.name
                      ? translateSystemCategoryName(transaction.category.name, (key, options) =>
                          args.t(key, { ...(options || {}), ns: 'common' })
                        )
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className={`text-muted-foreground ${args.isArabic ? 'text-[11px] tracking-normal' : 'text-[10px] uppercase tracking-wider'}`}>{args.t('reports.accountStatement.columns.account')}</p>
                  <p className={`text-foreground ${args.isArabic ? 'text-[13px] leading-5' : ''}`}>{transaction.account?.name || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className={`text-muted-foreground ${args.isArabic ? 'text-[11px] tracking-normal' : 'text-[10px] uppercase tracking-wider'}`}>{args.t('reports.accountStatement.columns.reportingEquivalent')}</p>
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
