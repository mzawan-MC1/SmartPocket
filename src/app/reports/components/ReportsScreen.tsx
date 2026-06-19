'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  formatReportPeriodLabel,
  getInitialReportPreset,
  getNextComparableReportPeriod,
  getPreviousComparableReportPeriod,
  resolveReportPeriodPreset,
  type ReportPeriodPreset,
  type ReportPeriodRange,
} from '@/lib/financial-periods/reports';

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
  { id: 'income-expense' as ReportType, label: 'Income vs Expenses', icon: TrendingUp, description: 'Compare income and expenses for the active report range.' },
  { id: 'spending-category' as ReportType, label: 'Spending by Category', icon: PieChart, description: 'Review category spending for the active range.' },
  { id: 'monthly-trends' as ReportType, label: 'Trends', icon: BarChart3, description: 'See daily, weekly, or monthly trend buckets based on the selected range.' },
  { id: 'budget-performance' as ReportType, label: 'Budget Performance', icon: Target, description: 'Track only budgets that apply to the active report range.' },
  { id: 'account-statement' as ReportType, label: 'Account Statement', icon: FileText, description: 'Keep original transaction dates, currencies, and amounts as the primary statement values.' },
];

const reportPresets: Array<{ key: ReportPeriodPreset; label: string }> = [
  { key: 'current_pay_period', label: 'Current pay period' },
  { key: 'previous_pay_period', label: 'Previous pay period' },
  { key: 'current_month', label: 'Current month' },
  { key: 'previous_month', label: 'Previous month' },
  { key: 'current_quarter', label: 'Current quarter' },
  { key: 'current_year', label: 'Current year' },
  { key: 'last_30_days', label: 'Last 30 days' },
  { key: 'year_to_date', label: 'Year to date' },
  { key: 'custom', label: 'Custom range' },
];

function getPresetButtonLabel(preset: ReportPeriodPreset, context: UserFinancialPeriodContext | null) {
  if (context?.effectiveConfig.incomeFrequency === 'irregular') {
    if (preset === 'current_pay_period') return 'Current planning period';
    if (preset === 'previous_pay_period') return 'Previous planning period';
  }
  return reportPresets.find((item) => item.key === preset)?.label || preset;
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

function getReportsLocale() {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en-US';
}

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
  positive?: boolean
) {
  if (rows.length === 0) {
    return <span className="text-sm text-muted-foreground">No data</span>;
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
        unavailableReason: buildHistoricalRateUnavailableMessage(missingRateDates),
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
        unavailableReason: buildHistoricalRateUnavailableMessage(missingRateDates),
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
    emptyReason: data.length === 0 ? 'No transactions in this period' : null,
  };
}

function buildSpendingCategoryChartState(args: {
  expenseTransactions: Transaction[];
  reportingCurrency: string;
  snapshots: ReportViewData['snapshots'];
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
        unavailableReason: buildHistoricalRateUnavailableMessage(missingRateDates),
        emptyReason: null,
      };
    }

    const categoryName = transaction.category?.name || 'Uncategorized';
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
    emptyReason: data.length === 0 ? 'No expense transactions in this period' : null,
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

function renderConvertedMetricDetails(metric: HistoricalReportConvertedMetric) {
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
        View original currencies
      </summary>
      <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
        <p>Reporting currency: {metric.reportingCurrency}</p>
        {renderOriginalCurrencyRows(metric.originalTotals)}
        {metric.reportingAmount !== null && !metric.allOriginalInReportingCurrency ? (
          <p>Historical reporting total in {metric.reportingCurrency}.</p>
        ) : null}
        {metric.previousAvailableCount > 0 ? (
          <p>{metric.previousAvailableCount} record(s) use the nearest previous available snapshot.</p>
        ) : null}
        {metric.exactCount > 0 ? <p>{metric.exactCount} record(s) use an exact transaction-date snapshot.</p> : null}
        {metric.earliestRateDate || metric.latestRateDate ? (
          <p>
            Applied rate dates: {metric.earliestRateDate || metric.latestRateDate}
            {metric.latestRateDate && metric.latestRateDate !== metric.earliestRateDate ? ` to ${metric.latestRateDate}` : ''}
          </p>
        ) : null}
        {metric.provider ? <p>Provider: {metric.provider}</p> : null}
        {metric.freshestAppliedAt ? <p>Latest snapshot fetched at: {metric.freshestAppliedAt}</p> : null}
        {metric.missingRateDates.length > 0 ? <p>{buildHistoricalRateUnavailableMessage(metric.missingRateDates)}</p> : null}
        {metric.stale ? <p className="text-warning">One or more applied snapshots are stale.</p> : null}
        {metric.unavailableReason ? <p className="text-warning">{metric.unavailableReason}</p> : null}
      </div>
    </details>
  );
}

function getReportTitle(activeReport: ReportType, grouping: ReportGrouping) {
  if (activeReport !== 'monthly-trends') {
    return reportTypes.find((item) => item.id === activeReport)?.label || 'Report';
  }
  if (grouping === 'day') return 'Daily Trend';
  if (grouping === 'week') return 'Weekly Trend';
  return 'Monthly Trends';
}

function buildTransactionsCsv(data: ReportViewData) {
  const headers = [
    'Date',
    'Type',
    'Merchant/Source',
    'Description',
    'Category',
    'Account',
    'Original Amount',
    'Original Currency',
    'Reporting Equivalent',
    'Reporting Currency',
    'Tags',
    'Notes',
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
      transaction.transaction_type,
      transaction.merchant || '',
      transaction.description || '',
      transaction.category?.name || '',
      transaction.account?.name || '',
      signedOriginalAmount.toFixed(2),
      transaction.currency || '',
      conversion.convertedAmount === null ? 'Unavailable' : conversion.convertedAmount.toFixed(2),
      data.reportingCurrency,
      (transaction.tags || []).join(', '),
      transaction.notes || '',
    ];
  });

  return [headers.join(','), ...rows.map((row) => row.map(escapeCsvValue).join(','))].join('\n');
}

function buildBudgetPerformanceCsv(items: ReportBudgetPerformanceItem[]) {
  const headers = [
    'Budget',
    'Category',
    'Period Label',
    'Period Type',
    'Budget Amount',
    'Budget Currency',
    'Spent',
    'Remaining',
    'Status',
    'Progress Percent',
    'Reporting Amount',
    'Reporting Spent',
    'Reporting Remaining',
    'Reporting Currency',
  ];
  const rows = items.map((item) => [
    item.budget.name || item.budget.category?.name || 'Budget',
    item.budget.category?.name || '',
    item.period.label || '',
    item.periodTypeLabel,
    Number(item.budget.amount || 0).toFixed(2),
    item.budget.currency || '',
    item.spentAmount === null ? 'Unavailable' : item.spentAmount.toFixed(2),
    item.remainingAmount === null ? 'Unavailable' : item.remainingAmount.toFixed(2),
    item.statusLabel,
    item.progressPct === null ? '' : item.progressPct.toFixed(1),
    item.allocatedReportingAmount === null ? 'Unavailable' : item.allocatedReportingAmount.toFixed(2),
    item.spentReportingAmount === null ? 'Unavailable' : item.spentReportingAmount.toFixed(2),
    item.remainingReportingAmount === null ? 'Unavailable' : item.remainingReportingAmount.toFixed(2),
    item.reportingCurrency,
  ]);
  return [headers.join(','), ...rows.map((row) => row.map(escapeCsvValue).join(','))].join('\n');
}

function buildCsvFilename(activeReport: ReportType, range: ReportPeriodRange) {
  return `smart-pocket-${activeReport}-${range.startDate}-to-${range.endDate}.csv`;
}

export default function ReportsScreen() {
  const [locale, setLocale] = useState('en-US');
  const [generatedAtLabel, setGeneratedAtLabel] = useState<string | null>(null);
  const [periodContext, setPeriodContext] = useState<UserFinancialPeriodContext | null>(null);
  const [periodLoading, setPeriodLoading] = useState(true);
  const [activePreset, setActivePreset] = useState<ReportPeriodPreset>('current_month');
  const [periodCursor, setPeriodCursor] = useState<string | null>(null);
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [activeReport, setActiveReport] = useState<ReportType>('income-expense');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [reportData, setReportData] = useState<ReportViewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const browserLocale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
    setLocale(browserLocale);
    setGeneratedAtLabel(new Intl.DateTimeFormat(browserLocale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date()));
  }, []);

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
      toast.error(error instanceof Error ? error.message : 'Failed to load report period settings.');
    } finally {
      setPeriodLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPeriodContext();
  }, [loadPeriodContext]);

  useSmartPocketDataChanged(['profile'], 'ReportsScreenPeriodContext', async () => {
    await loadPeriodContext();
  });

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
    setLoading(true);
    try {
      const data = await getReportViewData({
        startDate: activeRange.startDate,
        endDate: activeRange.endDate,
        accountId: selectedAccount,
        locale,
      });
      setReportData(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load report data');
    } finally {
      setLoading(false);
    }
  }, [activeRange, locale, selectedAccount]);

  useEffect(() => {
    void loadReportData();
  }, [loadReportData]);

  useSmartPocketDataChanged(['transactions', 'financial_accounts', 'budgets', 'profile'], 'ReportsScreen', async () => {
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
    });
  }, [reportData]);

  const activeTitle = getReportTitle(activeReport, grouping);
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
      ? 'Loading report metrics'
      : 'Report metrics unavailable'
    : incomeMetric.reportingAmount === null || expensesMetric.reportingAmount === null
      ? incomeMetric.unavailableReason || expensesMetric.unavailableReason || 'Historical exchange rate unavailable'
      : Number(incomeMetric.reportingAmount) <= 0
        ? 'No income in selected period'
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
      { id: 'rpt-ie-income', label: 'Total Income', convertedMetric: incomeMetric, sub: activeRange?.label, positive: true },
      { id: 'rpt-ie-expenses', label: 'Total Expenses', convertedMetric: expensesMetric, sub: activeRange?.comparisonLabel ? `Compared with ${activeRange.comparisonLabel}` : undefined, positive: false },
      { id: 'rpt-ie-net', label: 'Net Savings', convertedMetric: netMetric, sub: canCalculateSavingsRate ? `${savingsRate.toFixed(1)}% savings rate` : 'Savings rate unavailable until historical rates exist' },
      { id: 'rpt-ie-txns', label: 'Transactions', value: String(reportData?.transactions.length || 0), sub: 'Included records' },
    ],
    'spending-category': [
      { id: 'rpt-sc-total', label: 'Total Spent', convertedMetric: expensesMetric, sub: activeRange?.label, positive: false },
      { id: 'rpt-sc-txns', label: 'Expense Transactions', value: String(reportData?.expenseTransactions.length || 0), sub: 'Included records' },
      { id: 'rpt-sc-income', label: 'Total Income', convertedMetric: incomeMetric, positive: true },
      { id: 'rpt-sc-net', label: 'Net Savings', convertedMetric: netMetric },
    ],
    'monthly-trends': [
      { id: 'rpt-mt-income', label: 'Period Income', convertedMetric: incomeMetric, positive: true },
      { id: 'rpt-mt-expenses', label: 'Period Expenses', convertedMetric: expensesMetric, positive: false },
      { id: 'rpt-mt-net', label: 'Net Savings', convertedMetric: netMetric },
      { id: 'rpt-mt-buckets', label: grouping === 'day' ? 'Daily Buckets' : grouping === 'week' ? 'Weekly Buckets' : 'Monthly Buckets', value: String(incomeExpenseChartState.data.length) },
    ],
    'budget-performance': [
      { id: 'rpt-bp-budgets', label: 'Applicable Budgets', value: String(reportData?.budgetPerformance.items.length || 0), sub: activeRange?.label },
      { id: 'rpt-bp-income', label: 'Total Income', convertedMetric: incomeMetric, positive: true },
      { id: 'rpt-bp-expenses', label: 'Total Expenses', convertedMetric: expensesMetric, positive: false },
      { id: 'rpt-bp-rate', label: 'Savings Rate', value: savingsRateValue },
    ],
    'account-statement': [
      { id: 'rpt-as-txns', label: 'Total Transactions', value: String(reportData?.transactions.length || 0), sub: activeRange?.label },
      { id: 'rpt-as-credits', label: 'Total Credits', convertedMetric: incomeMetric, positive: true },
      { id: 'rpt-as-debits', label: 'Total Debits', convertedMetric: expensesMetric, positive: false },
      { id: 'rpt-as-net', label: 'Net', convertedMetric: netMetric },
    ],
  };

  const handleDownloadCSV = useCallback(() => {
    if (!reportData || !activeRange) {
      toast.error('No data to export');
      return;
    }
    if (activeReport === 'budget-performance') {
      if (reportData.budgetPerformance.items.length === 0) {
        toast.error('No budgets apply to this report period');
        return;
      }
      downloadCsv(
        buildCsvFilename(activeReport, activeRange),
        buildBudgetPerformanceCsv(reportData.budgetPerformance.items)
      );
      toast.success(`CSV exported — ${reportData.budgetPerformance.items.length} budget rows`);
      return;
    }
    if (reportData.transactions.length === 0) {
      toast.error('No data to export');
      return;
    }
    downloadCsv(
      buildCsvFilename(activeReport, activeRange),
      buildTransactionsCsv(reportData)
    );
    toast.success(`CSV exported — ${reportData.transactions.length} transactions`);
  }, [activeRange, activeReport, reportData]);

  const handlePrint = useCallback(() => window.print(), []);

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
        title="Reports"
        description="Analyze financial patterns across pay periods, months, quarters, years, and custom ranges without changing stored transactions or budgets."
        badge={<StatusBadge status="info" label="Analytics" />}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <button onClick={handlePrint} className="btn-secondary">
              <Printer size={14} />
              <span className="hidden sm:inline">Print / Save as PDF</span>
            </button>
            <button onClick={handleDownloadCSV} className="btn-secondary">
              <FileDown size={14} />
              CSV
            </button>
          </div>
        }
      />

      <div className="hidden print:block rounded-xl border border-border p-4">
        <p className="text-lg font-700 text-foreground">{activeTitle}</p>
        <p className="text-sm text-muted-foreground">Range: {activeRange ? formatReportPeriodLabel(activeRange) : 'Loading'}</p>
        <p className="text-sm text-muted-foreground">Account filter: {selectedAccount === 'all' ? 'All Accounts' : selectedAccount}</p>
        <p className="text-sm text-muted-foreground">Reporting currency: {reportData?.reportingCurrency || 'Loading'}</p>
        <p className="text-sm text-muted-foreground">Generated: {generatedAtLabel || 'Loading'}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <div className="space-y-2 xl:col-span-1 print:hidden">
          <p className="mb-3 px-1 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Report Type</p>
          {reportTypes.map((rt) => {
            const Icon = rt.icon;
            return (
              <button
                key={rt.id}
                onClick={() => setActiveReport(rt.id)}
                aria-pressed={activeReport === rt.id}
                className={`w-full rounded-xl border p-3 text-left transition-all duration-150 ${
                  activeReport === rt.id ? 'border-accent bg-accent/8 shadow-sm' : 'border-border bg-card hover:border-accent/40 hover:bg-muted/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${activeReport === rt.id ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                    <Icon size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className={`truncate text-sm font-600 ${activeReport === rt.id ? 'text-accent' : 'text-foreground'}`}>{rt.label}</p>
                    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{rt.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-4 xl:col-span-3">
          <div className="card-elevated p-3 print:hidden">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {reportPresets.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => handlePresetChange(preset.key)}
                    aria-pressed={activePreset === preset.key}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-600 leading-none transition-all ${
                      activePreset === preset.key ? 'border-accent bg-accent/8 text-accent' : 'border-border text-muted-foreground hover:border-accent hover:text-accent'
                    }`}
                  >
                    {getPresetButtonLabel(preset.key, periodContext)}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Calendar size={14} className="text-muted-foreground" />
                  <label className="sr-only" htmlFor="report-date-from">Report start date</label>
                  <input
                    id="report-date-from"
                    type="date"
                    value={activePreset === 'custom' ? customDateFrom : activeRange?.startDate || ''}
                    onChange={(event) => {
                      setActivePreset('custom');
                      setCustomDateFrom(event.target.value);
                    }}
                    className="input-base h-8 w-[148px] max-w-full text-sm"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <label className="sr-only" htmlFor="report-date-to">Report end date</label>
                  <input
                    id="report-date-to"
                    type="date"
                    value={activePreset === 'custom' ? customDateTo : activeRange?.endDate || ''}
                    onChange={(event) => {
                      setActivePreset('custom');
                      setCustomDateTo(event.target.value);
                    }}
                    className="input-base h-8 w-[148px] max-w-full text-sm"
                  />
                  <div className="flex items-center gap-1.5 max-sm:w-full">
                    <Filter size={13} className="text-muted-foreground" />
                    <label className="sr-only" htmlFor="report-account-filter">Filter by account</label>
                    <select
                      id="report-account-filter"
                      value={selectedAccount}
                      onChange={(event) => setSelectedAccount(event.target.value)}
                      className="input-base h-8 min-w-[150px] max-w-full text-sm"
                    >
                      <option value="all">All Accounts</option>
                      {(reportData?.accounts || []).map((account) => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
                  <button
                    type="button"
                    onClick={goToPreviousRange}
                    disabled={activePreset === 'custom' || periodLoading}
                    className="btn-secondary h-8 px-2.5 text-sm"
                    aria-label={`Previous ${activeRange?.navigationLabel || 'period'}`}
                  >
                    <ChevronLeft size={14} />
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => periodContext && setPeriodCursor(periodContext.currentBusinessDate)}
                    disabled={periodLoading}
                    className="btn-secondary h-8 px-2.5 text-sm"
                  >
                    Current
                  </button>
                  <button
                    type="button"
                    onClick={goToNextRange}
                    disabled={activePreset === 'custom' || !activeRange?.canNavigateForward || periodLoading}
                    className="btn-secondary h-8 px-2.5 text-sm"
                    aria-label={`Next ${activeRange?.navigationLabel || 'period'}`}
                  >
                    Next
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>

              <div className="min-h-[20px] px-0.5">
                <p className="truncate text-xs text-muted-foreground">
                  <span className="font-600 text-foreground">{activeRange?.label || 'Loading period...'}</span>
                  {' · '}
                  {activeRange?.comparisonLabel
                    ? `Compared with ${activeRange.comparisonLabel}`
                    : activePreset === 'custom'
                      ? 'Custom report range'
                      : 'Shared financial-period boundaries'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {summaryByType[activeReport].map((item) => (
              <div key={item.id} className="card-elevated p-4">
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
                {!loading && item.convertedMetric ? renderConvertedMetricDetails(item.convertedMetric) : null}
              </div>
            ))}
          </div>

          <div className="card-elevated p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-700 text-foreground">{activeTitle}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {activeRange?.label || 'Loading range'}
                  {activeRange?.comparisonLabel ? ` · Compared with ${activeRange.comparisonLabel}` : ''}
                </p>
                {activeReport === 'monthly-trends' ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Grouped by {grouping === 'day' ? 'day' : grouping === 'week' ? 'week' : 'month'} for this range.
                  </p>
                ) : null}
              </div>
              {(loading || periodLoading) ? <Loader2 size={16} className="animate-spin text-accent" /> : null}
            </div>

            {loading || periodLoading ? (
              <div className="flex h-[300px] items-center justify-center">
                <div className="text-center">
                  <Loader2 size={24} className="mx-auto mb-2 animate-spin text-accent" />
                  <p className="text-sm text-muted-foreground">Loading report data...</p>
                </div>
              </div>
            ) : activeReport === 'account-statement' ? (
              <AccountStatementTable
                transactions={reportData?.transactions || []}
                reportingCurrency={reportData?.reportingCurrency || ''}
                snapshots={reportData?.snapshots || []}
              />
            ) : activeReport === 'budget-performance' ? (
              reportData?.budgetPerformance.unavailableReason ? (
                <div className="flex min-h-[300px] items-center justify-center">
                  <EmptyState icon={Target} title="Historical exchange rate unavailable" description={reportData.budgetPerformance.unavailableReason} />
                </div>
              ) : reportData?.budgetPerformance.emptyReason ? (
                <div className="flex min-h-[300px] items-center justify-center">
                  <EmptyState icon={Target} title="No budgets apply to this report period" description={reportData.budgetPerformance.emptyReason} />
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
                            <p className="text-sm font-700 text-foreground">{item.budget.category?.name || item.budget.name || 'Budget'}</p>
                            <p className="text-xs text-muted-foreground">{item.periodTypeLabel} · {item.period.label}</p>
                          </div>
                          <StatusBadge
                            status={item.status === 'over_budget' ? 'error' : item.status === 'near_limit' ? 'warning' : item.status === 'conversion_unavailable' ? 'pending' : 'info'}
                            label={item.statusLabel}
                          />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Budget</p>
                            <FormattedCurrencyAmount amount={Number(item.budget.amount || 0)} currencyCode={item.budget.currency} className="font-700 text-foreground" showCode />
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Spent</p>
                            {item.spentAmount === null ? (
                              <p className="font-700 text-warning">Unavailable</p>
                            ) : (
                              <FormattedCurrencyAmount amount={item.spentAmount} currencyCode={item.budget.currency} className="font-700 text-foreground" showCode />
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Remaining</p>
                            {item.remainingAmount === null ? (
                              <p className="font-700 text-warning">Unavailable</p>
                            ) : (
                              <FormattedCurrencyAmount amount={item.remainingAmount} currencyCode={item.budget.currency} className="font-700 text-foreground" showCode />
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Progress</p>
                            <p className="font-700 text-foreground">{item.progressPct === null ? 'Unavailable' : `${item.progressPct.toFixed(1)}%`}</p>
                          </div>
                        </div>
                        {item.reportingUnavailableReason ? (
                          <p className="mt-3 text-xs text-warning">{item.reportingUnavailableReason}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )
            ) : activeChartState?.unavailableReason ? (
              <div className="flex h-[300px] items-center justify-center">
                <EmptyState icon={BarChart3} title="Historical exchange rate unavailable" description={activeChartState.unavailableReason} />
              </div>
            ) : activeChartState?.emptyReason ? (
              <div className="flex h-[300px] items-center justify-center">
                <EmptyState
                  icon={activeReport === 'spending-category' ? PieChart : BarChart3}
                  title="No transactions in this period"
                  description={activeChartState.emptyReason}
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

          <div className="card-elevated p-4 print:hidden">
            <p className="mb-3 text-sm font-700 text-foreground">Download Options</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                {
                  id: 'dl-csv',
                  icon: FileDown,
                  label: 'CSV Export',
                  desc: activeReport === 'budget-performance'
                    ? `${reportData?.budgetPerformance.items.length || 0} applicable budgets in the active range`
                    : `${reportData?.transactions.length || 0} transactions in the active range`,
                  action: handleDownloadCSV,
                  primary: true,
                },
                {
                  id: 'dl-print',
                  icon: Printer,
                  label: 'Print / Save as PDF',
                  desc: 'Use the browser print dialog to save the visible report as PDF.',
                  action: handlePrint,
                  primary: false,
                },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.id}
                    onClick={option.action}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all duration-150 ${
                      option.primary ? 'border-accent/40 bg-accent/8 hover:bg-accent/15' : 'border-border hover:border-accent/30 hover:bg-muted/40'
                    }`}
                  >
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${option.primary ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                      <Icon size={16} />
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
}) {
  if (args.transactions.length === 0) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <EmptyState icon={FileText} title="No transactions in this period" description="Adjust the report range or account filter to see statement activity." />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Date</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Type</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Merchant/Source</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Description</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Category</th>
            <th className="px-3 py-2 text-left text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Account</th>
            <th className="px-3 py-2 text-right text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Original Amount</th>
            <th className="px-3 py-2 text-right text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Reporting Equivalent</th>
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
                <td className="px-3 py-2.5 text-muted-foreground">{transaction.transaction_type}</td>
                <td className="px-3 py-2.5 text-foreground">{transaction.merchant || '—'}</td>
                <td className="max-w-[220px] truncate px-3 py-2.5 text-foreground">{transaction.description || '—'}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{transaction.category?.name || '—'}</td>
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
                    <span className="text-warning">Unavailable</span>
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
  );
}
