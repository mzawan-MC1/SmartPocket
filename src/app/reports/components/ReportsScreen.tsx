'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, PieChart, TrendingUp, FileText, Target, FileDown, Printer, Calendar, Filter, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import {
  buildHistoricalRateUnavailableMessage,
  buildHistoricalReportConvertedMetricFromSnapshots,
  convertHistoricalAmountWithSnapshots,
  generateCSV,
  getAccounts,
  getHistoricalReportContext,
  getReportBudgets,
  getReportData,
  loadAccountInclusionMap,
  isPersonalExpenseTransaction,
  isPersonalIncomeTransaction,
  loadTransactionLedgerSummaryMap,
  shouldIncludeInPersonalCashFlow,
  type FinancialAccount,
  type HistoricalReportConvertedMetric,
  type Transaction,
} from '@/lib/finance';
import EmptyState from '@/components/ui/EmptyState';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';


const IncomeExpenseReportChart = dynamic(() => import('./charts/IncomeExpenseReportChart'), { ssr: false });
const SpendingCategoryReportChart = dynamic(() => import('./charts/SpendingCategoryReportChart'), { ssr: false });
const MonthlyTrendsChart = dynamic(() => import('./charts/MonthlyTrendsChart'), { ssr: false });
const BudgetPerformanceChart = dynamic(() => import('./charts/BudgetPerformanceChart'), { ssr: false });

type ReportType = 'income-expense' | 'spending-category' | 'monthly-trends' | 'budget-performance' | 'account-statement';
type IncomeExpenseChartRow = { month: string; income: number; expenses: number; net: number };
type SpendingCategoryChartRow = { id: string; category: string; amount: number; color: string };
type BudgetPerformanceChartRow = { id: string; category: string; allocated: number; spent: number; color: string };
type ChartState<T> = {
  data: T[];
  unavailableReason: string | null;
  emptyReason: string | null;
};

const reportTypes = [
  { id: 'income-expense' as ReportType, label: 'Income vs Expenses', icon: TrendingUp, description: 'Compare monthly inflows and outflows' },
  { id: 'spending-category' as ReportType, label: 'Spending by Category', icon: PieChart, description: 'Where your money is going' },
  { id: 'monthly-trends' as ReportType, label: 'Monthly Trends', icon: BarChart3, description: 'Spending patterns over time' },
  { id: 'budget-performance' as ReportType, label: 'Budget Performance', icon: Target, description: 'How well you stuck to your budgets' },
  { id: 'account-statement' as ReportType, label: 'Account Statement', icon: FileText, description: 'Full transaction history by account' },
];

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

function getMonthKey(value: string) {
  return value.slice(0, 7);
}

function formatMonthKey(monthKey: string) {
  const parsed = new Date(`${monthKey}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return monthKey;
  }
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function buildIncomeExpenseChartState(args: {
  incomeTransactions: Transaction[];
  expenseTransactions: Transaction[];
  reportingCurrency: string;
  snapshots: Awaited<ReturnType<typeof getHistoricalReportContext>>['snapshots'];
}): ChartState<IncomeExpenseChartRow> {
  const rows = new Map<string, IncomeExpenseChartRow>();
  const missingRateDates = new Set<string>();

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
    const monthKey = getMonthKey(transaction.transaction_date);
    const current = rows.get(monthKey) || { month: formatMonthKey(monthKey), income: 0, expenses: 0, net: 0 };
    current.income += conversion.convertedAmount;
    current.net += conversion.convertedAmount;
    rows.set(monthKey, current);
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
    const monthKey = getMonthKey(transaction.transaction_date);
    const current = rows.get(monthKey) || { month: formatMonthKey(monthKey), income: 0, expenses: 0, net: 0 };
    current.expenses += conversion.convertedAmount;
    current.net -= conversion.convertedAmount;
    rows.set(monthKey, current);
  }

  const data = Array.from(rows.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, row]) => row);

  return {
    data,
    unavailableReason: null,
    emptyReason: data.length === 0 ? 'No transactions in this period' : null,
  };
}

function buildSpendingCategoryChartState(args: {
  expenseTransactions: Transaction[];
  reportingCurrency: string;
  snapshots: Awaited<ReturnType<typeof getHistoricalReportContext>>['snapshots'];
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

function buildBudgetPerformanceChartState(args: {
  budgets: Awaited<ReturnType<typeof getReportBudgets>>;
  expenseTransactions: Transaction[];
  reportingCurrency: string;
  snapshots: Awaited<ReturnType<typeof getHistoricalReportContext>>['snapshots'];
}): ChartState<BudgetPerformanceChartRow> {
  if (args.budgets.length === 0) {
    return {
      data: [],
      unavailableReason: null,
      emptyReason: 'No budgets exist for this period',
    };
  }

  const missingRateDates = new Set<string>();
  const data: BudgetPerformanceChartRow[] = [];

  for (const budget of args.budgets) {
    const allocatedConversion = convertHistoricalAmountWithSnapshots({
      amount: Number(budget.amount || 0),
      fromCurrency: budget.currency || args.reportingCurrency,
      reportingCurrency: args.reportingCurrency,
      rateDate: budget.period_start,
      snapshots: args.snapshots,
    });
    if (allocatedConversion.convertedAmount === null) {
      if (allocatedConversion.missingRateDate) missingRateDates.add(allocatedConversion.missingRateDate);
      return {
        data: [],
        unavailableReason: buildHistoricalRateUnavailableMessage(missingRateDates),
        emptyReason: null,
      };
    }

    let spent = 0;
    for (const transaction of args.expenseTransactions.filter((item) => !budget.category_id || item.category_id === budget.category_id)) {
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
      spent += conversion.convertedAmount;
    }

    data.push({
      id: budget.id,
      category: budget.category?.name || 'Uncategorized',
      allocated: allocatedConversion.convertedAmount,
      spent,
      color: budget.category?.color || CATEGORY_FALLBACK_COLORS[data.length % CATEGORY_FALLBACK_COLORS.length],
    });
  }

  return {
    data,
    unavailableReason: null,
    emptyReason: data.length === 0 ? 'No budgets exist for this period' : null,
  };
}

export default function ReportsScreen() {
  const [activeReport, setActiveReport] = useState<ReportType>('income-expense');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [ledgerSummaryByTransactionId, setLedgerSummaryByTransactionId] = useState<Map<string, { entryTypes: Set<string>; referenceTypes: Set<string> }>>(new Map());
  const [accountInclusionById, setAccountInclusionById] = useState<Map<string, boolean>>(new Map());
  const [historicalMetrics, setHistoricalMetrics] = useState<{
    income: HistoricalReportConvertedMetric;
    expenses: HistoricalReportConvertedMetric;
    net: HistoricalReportConvertedMetric;
  } | null>(null);
  const [reportingCurrency, setReportingCurrency] = useState('');
  const [chartState, setChartState] = useState<{
    incomeExpense: ChartState<IncomeExpenseChartRow>;
    spendingCategory: ChartState<SpendingCategoryChartRow>;
    monthlyTrends: ChartState<IncomeExpenseChartRow>;
    budgetPerformance: ChartState<BudgetPerformanceChartRow>;
  }>({
    incomeExpense: { data: [], unavailableReason: null, emptyReason: null },
    spendingCategory: { data: [], unavailableReason: null, emptyReason: null },
    monthlyTrends: { data: [], unavailableReason: null, emptyReason: null },
    budgetPerformance: { data: [], unavailableReason: null, emptyReason: null },
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const supabase = createClient();
    Promise.all([
      getReportData(dateFrom, dateTo, selectedAccount),
      getAccounts(),
      loadTransactionLedgerSummaryMap(supabase),
      loadAccountInclusionMap(supabase),
      getReportBudgets(dateFrom, dateTo),
    ])
      .then(async ([txns, accts, ledgerSummary, accountInclusion, budgets]) => {
        const incomeTransactions = txns.filter((t) =>
          isPersonalIncomeTransaction(t, ledgerSummary, accountInclusion)
        );
        const expenseTransactions = txns.filter((t) =>
          isPersonalExpenseTransaction(t, ledgerSummary, accountInclusion)
        );
        const cashFlowTransactions = txns.filter((transaction) =>
          shouldIncludeInPersonalCashFlow(transaction, ledgerSummary, accountInclusion)
        );
        const reportContext = await getHistoricalReportContext(txns);
        const incomeMetric = buildHistoricalReportConvertedMetricFromSnapshots({
          transactions: incomeTransactions,
          getSignedAmount: (transaction) => Number(transaction.amount || 0),
          reportingCurrency: reportContext.reportingCurrency,
          snapshots: reportContext.snapshots,
        });
        const expensesMetric = buildHistoricalReportConvertedMetricFromSnapshots({
          transactions: expenseTransactions,
          getSignedAmount: (transaction) => Number(transaction.amount || 0),
          reportingCurrency: reportContext.reportingCurrency,
          snapshots: reportContext.snapshots,
        });
        const netMetric = buildHistoricalReportConvertedMetricFromSnapshots({
          transactions: cashFlowTransactions,
          getSignedAmount: (transaction) => {
            const amount = Number(transaction.amount || 0);
            return transaction.transaction_type === 'income'
              ? amount
              : transaction.transaction_type === 'expense'
                ? -amount
                : 0;
          },
          reportingCurrency: reportContext.reportingCurrency,
          snapshots: reportContext.snapshots,
        });

        setTransactions(txns);
        setAccounts(accts.filter((a) => a.is_active));
        setLedgerSummaryByTransactionId(ledgerSummary);
        setAccountInclusionById(accountInclusion);
        setReportingCurrency(reportContext.reportingCurrency);
        setHistoricalMetrics({
          income: incomeMetric,
          expenses: expensesMetric,
          net: netMetric,
        });
        const incomeExpenseChart = buildIncomeExpenseChartState({
          incomeTransactions,
          expenseTransactions,
          reportingCurrency: reportContext.reportingCurrency,
          snapshots: reportContext.snapshots,
        });
        setChartState({
          incomeExpense: incomeExpenseChart,
          spendingCategory: buildSpendingCategoryChartState({
            expenseTransactions,
            reportingCurrency: reportContext.reportingCurrency,
            snapshots: reportContext.snapshots,
          }),
          monthlyTrends: incomeExpenseChart,
          budgetPerformance: buildBudgetPerformanceChartState({
            budgets,
            expenseTransactions,
            reportingCurrency: reportContext.reportingCurrency,
            snapshots: reportContext.snapshots,
          }),
        });
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, selectedAccount]);

  useEffect(() => { load(); }, [load]);

  const incomeTransactions = transactions.filter((t) =>
    isPersonalIncomeTransaction(t, ledgerSummaryByTransactionId, accountInclusionById)
  );
  const expenseTransactions = transactions.filter((t) =>
    isPersonalExpenseTransaction(t, ledgerSummaryByTransactionId, accountInclusionById)
  );
  const cashFlowTransactions = transactions.filter((transaction) =>
    shouldIncludeInPersonalCashFlow(transaction, ledgerSummaryByTransactionId, accountInclusionById)
  );
  const canCalculateSavingsRate =
    historicalMetrics?.income.reportingAmount !== null &&
    historicalMetrics?.expenses.reportingAmount !== null &&
    Number(historicalMetrics?.income.reportingAmount) > 0;
  const savingsRate = canCalculateSavingsRate
    ? ((Number(historicalMetrics?.income.reportingAmount || 0) - Number(historicalMetrics?.expenses.reportingAmount || 0)) / Number(historicalMetrics?.income.reportingAmount || 0)) * 100
    : 0;
  const savingsRateValue = historicalMetrics?.income.reportingAmount === null || historicalMetrics?.expenses.reportingAmount === null
    ? historicalMetrics?.income.unavailableReason || historicalMetrics?.expenses.unavailableReason || 'Savings rate unavailable until historical rates exist'
    : Number(historicalMetrics.income.reportingAmount) <= 0
      ? 'No income in selected period'
      : `${savingsRate.toFixed(1)}%`;
  const activeChartState =
    activeReport === 'income-expense'
      ? chartState.incomeExpense
      : activeReport === 'spending-category'
        ? chartState.spendingCategory
        : activeReport === 'monthly-trends'
          ? chartState.monthlyTrends
          : activeReport === 'budget-performance'
            ? chartState.budgetPerformance
            : null;

  const summaryByType: Record<ReportType, Array<{
    id: string;
    label: string;
    value?: string;
    convertedMetric?: HistoricalReportConvertedMetric | null;
    sub?: string;
    positive?: boolean;
  }>> = {
    'income-expense': [
      { id: 'rpt-ie-income', label: 'Total Income', convertedMetric: historicalMetrics?.income || null, sub: `${dateFrom} – ${dateTo}`, positive: true },
      { id: 'rpt-ie-expenses', label: 'Total Expenses', convertedMetric: historicalMetrics?.expenses || null, sub: `${dateFrom} – ${dateTo}`, positive: false },
      { id: 'rpt-ie-net', label: 'Net Savings', convertedMetric: historicalMetrics?.net || null, sub: canCalculateSavingsRate ? `${savingsRate.toFixed(1)}% savings rate` : 'Savings rate unavailable until all required historical rates exist' },
      { id: 'rpt-ie-txns', label: 'Transactions', value: String(transactions.length), sub: 'Total records' },
    ],
    'spending-category': [
      { id: 'rpt-sc-total', label: 'Total Spent', convertedMetric: historicalMetrics?.expenses || null, sub: 'All categories' },
      { id: 'rpt-sc-txns', label: 'Expense Transactions', value: String(transactions.filter((t) => isPersonalExpenseTransaction(t, ledgerSummaryByTransactionId, accountInclusionById)).length), sub: 'Records' },
      { id: 'rpt-sc-income', label: 'Total Income', convertedMetric: historicalMetrics?.income || null, positive: true },
      { id: 'rpt-sc-net', label: 'Net', convertedMetric: historicalMetrics?.net || null },
    ],
    'monthly-trends': [
      { id: 'rpt-mt-income', label: 'Period Income', convertedMetric: historicalMetrics?.income || null, positive: true },
      { id: 'rpt-mt-expenses', label: 'Period Expenses', convertedMetric: historicalMetrics?.expenses || null, positive: false },
      { id: 'rpt-mt-net', label: 'Net', convertedMetric: historicalMetrics?.net || null },
      { id: 'rpt-mt-txns', label: 'Transactions', value: String(transactions.length) },
    ],
    'budget-performance': [
      { id: 'rpt-bp-income', label: 'Total Income', convertedMetric: historicalMetrics?.income || null, positive: true },
      { id: 'rpt-bp-expenses', label: 'Total Expenses', convertedMetric: historicalMetrics?.expenses || null, positive: false },
      { id: 'rpt-bp-net', label: 'Net Savings', convertedMetric: historicalMetrics?.net || null },
      { id: 'rpt-bp-rate', label: 'Savings Rate', value: savingsRateValue, positive: canCalculateSavingsRate ? savingsRate >= 20 : undefined },
    ],
    'account-statement': [
      { id: 'rpt-as-txns', label: 'Total Transactions', value: String(transactions.length), sub: `${dateFrom} – ${dateTo}` },
      { id: 'rpt-as-credits', label: 'Total Credits', convertedMetric: historicalMetrics?.income || null, sub: 'Inflows', positive: true },
      { id: 'rpt-as-debits', label: 'Total Debits', convertedMetric: historicalMetrics?.expenses || null, sub: 'Outflows', positive: false },
      { id: 'rpt-as-net', label: 'Net', convertedMetric: historicalMetrics?.net || null },
    ],
  };

  const summary = summaryByType[activeReport];

  const renderConvertedMetric = (metric: HistoricalReportConvertedMetric, positive?: boolean) => {
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
  };

  const renderConvertedMetricDetails = (metric: HistoricalReportConvertedMetric) => {
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
  };

  const handleDownloadCSV = () => {
    if (transactions.length === 0) { toast.error('No data to export'); return; }
    const csv = generateCSV(transactions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smart-pocket-report-${dateFrom}-${dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`CSV exported — ${transactions.length} transactions`);
  };

  const handlePrint = () => window.print();

  const setPreset = (preset: string) => {
    const now = new Date();
    if (preset === 'this-month') {
      setDateFrom(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else if (preset === 'last-month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(first.toISOString().slice(0, 10));
      setDateTo(last.toISOString().slice(0, 10));
    } else if (preset === 'last-30') {
      setDateFrom(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    } else if (preset === 'ytd') {
      setDateFrom(new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10));
      setDateTo(now.toISOString().slice(0, 10));
    }
  };

  return (
    <div className="page-section">
      <PageHeader
        title="Reports"
        description="Analyze financial patterns, compare periods, and export statements."
        badge={<StatusBadge status="info" label="Analytics" />}
        actions={
          <>
            <button onClick={handlePrint} className="btn-secondary">
              <Printer size={14} />
              <span className="hidden sm:inline">Print / Save as PDF</span>
            </button>
            <button onClick={handleDownloadCSV} className="btn-secondary">
              <FileDown size={14} /> CSV
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Left: Report Type Selector */}
        <div className="xl:col-span-1 space-y-2">
          <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground px-1 mb-3">Report Type</p>
          {reportTypes.map((rt) => {
            const Icon = rt.icon;
            return (
              <button
                key={`report-type-${rt.id}`}
                onClick={() => setActiveReport(rt.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all duration-150 text-left ${
                  activeReport === rt.id ? 'border-accent bg-accent/8 shadow-sm' : 'border-border bg-card hover:border-accent/40 hover:bg-muted/40'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${activeReport === rt.id ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                  <Icon size={15} />
                </div>
                <div className="min-w-0">
                  <p className={`text-sm font-600 truncate ${activeReport === rt.id ? 'text-accent' : 'text-foreground'}`}>{rt.label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{rt.description}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Report Content */}
        <div className="xl:col-span-3 space-y-4">
          {/* Filters Bar */}
          <div className="card-elevated p-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex items-center gap-2 flex-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-muted-foreground flex-shrink-0" />
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input-base h-8 text-sm w-auto" aria-label="Start date" />
                  <span className="text-muted-foreground text-sm">to</span>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input-base h-8 text-sm w-auto" aria-label="End date" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Filter size={13} className="text-muted-foreground" />
                  <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} className="input-base h-8 text-sm" aria-label="Filter by account">
                    <option value="all">All Accounts</option>
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  { label: 'This Month', key: 'this-month' },
                  { label: 'Last Month', key: 'last-month' },
                  { label: 'Last 30 Days', key: 'last-30' },
                  { label: 'YTD', key: 'ytd' },
                ].map((preset) => (
                  <button key={preset.key} className="px-2.5 py-1 rounded-lg text-[11px] font-600 border border-border hover:border-accent hover:text-accent transition-all text-muted-foreground" onClick={() => setPreset(preset.key)}>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {summary.map((item) => (
              <div key={item.id} className="card-elevated p-4">
                <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{item.label}</p>
                <div className={`text-lg font-700 font-tabular ${item.positive === true ? 'text-positive' : item.positive === false ? 'text-negative' : 'text-foreground'}`}>
                  {loading ? (
                    <span className="animate-pulse bg-muted rounded w-20 h-5 inline-block" />
                  ) : item.convertedMetric ? (
                    renderConvertedMetric(item.convertedMetric, item.positive)
                  ) : (
                    item.value
                  )}
                </div>
                {item.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{item.sub}</p>}
                {!loading && item.convertedMetric ? renderConvertedMetricDetails(item.convertedMetric) : null}
              </div>
            ))}
          </div>

          {/* Chart Area */}
          <div className="card-elevated p-5">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-700 text-foreground">{reportTypes.find((r) => r.id === activeReport)?.label}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{dateFrom} — {dateTo}</p>
              </div>
              {loading && <Loader2 size={16} className="animate-spin text-accent" />}
            </div>

            {loading ? (
              <div className="h-[300px] flex items-center justify-center">
                <div className="text-center">
                  <Loader2 size={24} className="animate-spin text-accent mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading report data...</p>
                </div>
              </div>
            ) : transactions.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center">
                <EmptyState icon={BarChart3} title="No data for this period" description="Adjust the date range or add transactions to see reports." />
              </div>
            ) : (
              <div className="h-[300px]">
                {activeReport !== 'account-statement' && activeChartState?.unavailableReason ? (
                  <div className="h-full flex items-center justify-center">
                    <EmptyState
                      icon={BarChart3}
                      title="Conversion required"
                      description={activeChartState.unavailableReason}
                    />
                  </div>
                ) : activeReport !== 'account-statement' && activeChartState?.emptyReason ? (
                  <div className="h-full flex items-center justify-center">
                    <EmptyState
                      icon={activeReport === 'budget-performance' ? Target : BarChart3}
                      title="No chart data"
                      description={activeChartState.emptyReason}
                    />
                  </div>
                ) : activeReport === 'income-expense' ? (
                  <IncomeExpenseReportChart data={chartState.incomeExpense.data} currencyCode={reportingCurrency} />
                ) : activeReport === 'spending-category' ? (
                  <SpendingCategoryReportChart data={chartState.spendingCategory.data} currencyCode={reportingCurrency} />
                ) : activeReport === 'monthly-trends' ? (
                  <MonthlyTrendsChart
                    data={chartState.monthlyTrends.data.map((row) => ({
                      month: row.month,
                      income: row.income,
                      expenses: row.expenses,
                      savings: row.net,
                    }))}
                    currencyCode={reportingCurrency}
                  />
                ) : activeReport === 'budget-performance' ? (
                  <BudgetPerformanceChart data={chartState.budgetPerformance.data} currencyCode={reportingCurrency} />
                ) : null}
                {activeReport === 'account-statement' && <AccountStatementTable transactions={transactions} />}
              </div>
            )}
          </div>

          {/* Download Actions */}
          <div className="card-elevated p-4">
            <p className="text-sm font-700 text-foreground mb-3">Download Options</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: 'dl-csv', icon: FileDown, label: 'CSV Export', desc: `${transactions.length} transactions — raw data for spreadsheets`, action: handleDownloadCSV, primary: true },
                { id: 'dl-print', icon: Printer, label: 'Print / Save as PDF', desc: 'Use browser print dialog to save as PDF', action: handlePrint, primary: false },
              ].map((opt) => {
                const Icon = opt.icon;
                return (
                  <button key={opt.id} onClick={opt.action} className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 text-left ${opt.primary ? 'border-accent/40 bg-accent/8 hover:bg-accent/15' : 'border-border hover:border-accent/30 hover:bg-muted/40'}`}>
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${opt.primary ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'}`}>
                      <Icon size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-600 text-foreground">{opt.label}</p>
                      <p className="text-[11px] text-muted-foreground">{opt.desc}</p>
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

function AccountStatementTable({ transactions }: { transactions: Transaction[] }) {
  if (transactions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <EmptyState icon={FileText} title="No transactions" description="No transactions in this period." />
      </div>
    );
  }
  return (
    <div className="overflow-auto h-full scrollbar-thin">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Date</th>
            <th className="text-left py-2 px-3 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Description</th>
            <th className="text-left py-2 px-3 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Category</th>
            <th className="text-right py-2 px-3 text-[11px] font-600 uppercase tracking-wider text-muted-foreground">Amount</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => (
            <tr key={txn.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
              <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap font-tabular">{txn.transaction_date}</td>
              <td className="py-2.5 px-3 text-foreground truncate max-w-[200px]">{txn.merchant || txn.description}</td>
              <td className="py-2.5 px-3 text-muted-foreground">{txn.category?.name || '—'}</td>
              <td className={`py-2.5 px-3 text-right font-700 font-tabular whitespace-nowrap ${txn.transaction_type === 'income' ? 'text-positive' : 'text-foreground'}`}>
                <FormattedCurrencyAmount
                  amount={txn.transaction_type === 'income' ? txn.amount : -Math.abs(txn.amount)}
                  currencyCode={txn.currency}
                  className={txn.transaction_type === 'income' ? 'text-positive' : 'text-foreground'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
