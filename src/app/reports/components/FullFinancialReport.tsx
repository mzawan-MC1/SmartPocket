'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, BarChart3, FileText, PieChart, Target } from 'lucide-react';
import IncomeExpenseReportChart from './charts/IncomeExpenseReportChart';
import SpendingCategoryReportChart from './charts/SpendingCategoryReportChart';
import BudgetPerformanceChart from './charts/BudgetPerformanceChart';
import ReportTransactionTable, { type ReportTransactionRow } from './ReportTransactionTable';
import PrintableReportLayout from './PrintableReportLayout';
import type { PrintableReportIdentity, ReportMetadataItem } from './full-report-types';

export type FullReportMetricTone = 'positive' | 'negative' | 'neutral';

export interface FullReportMetricCard {
  label: string;
  value: string;
  helper?: string | null;
  tone?: FullReportMetricTone;
}

export interface FullReportListItem {
  label: string;
  value: string;
  helper?: string | null;
}

export interface FullReportChartState<T> {
  data: T[];
  unavailableReason: string | null;
  emptyReason: string | null;
}

export interface FullReportSummaryTable {
  headers: string[];
  rows: string[][];
  emptyMessage: string;
}

export interface FullFinancialReportData {
  title: string;
  subtitle?: string | null;
  reportingCurrency: string;
  identity: PrintableReportIdentity;
  metadata: ReportMetadataItem[];
  generatedAtLabel: string;
  largeReportWarning?: string | null;
  executiveSummary: {
    metrics: FullReportMetricCard[];
    narratives: string[];
  };
  incomeExpenses: {
    metrics: FullReportMetricCard[];
    comparisonSummary?: string | null;
    incomeVsExpenseChart: FullReportChartState<{ month: string; income: number; expenses: number; net: number }>;
    topIncomeSources: FullReportSummaryTable;
    topExpenseCategories: FullReportSummaryTable;
    highlights: FullReportListItem[];
  };
  accounts: {
    summary: FullReportMetricCard[];
    personal: FullReportSummaryTable;
    shared: FullReportSummaryTable;
    spaces: FullReportSummaryTable;
  };
  transactions: {
    summary: FullReportMetricCard[];
    rows: ReportTransactionRow[];
    summaryTable: FullReportSummaryTable;
  };
  categories: {
    spendingChart: FullReportChartState<{ id: string; category: string; amount: number; color: string }>;
    expenseTable: FullReportSummaryTable;
    incomeTable: FullReportSummaryTable;
  };
  budgets: {
    summary: FullReportMetricCard[];
    table: FullReportSummaryTable;
  };
  people: {
    summary: FullReportMetricCard[];
    table: FullReportSummaryTable;
  };
  subscriptions: {
    summary: FullReportMetricCard[];
    table: FullReportSummaryTable;
    upcomingTable: FullReportSummaryTable;
  };
  recurring: {
    table: FullReportSummaryTable;
  };
  loans: {
    summary: FullReportMetricCard[];
    table: FullReportSummaryTable;
  };
  commitments: {
    overdue: FullReportSummaryTable;
    next7Days: FullReportSummaryTable;
    next30Days: FullReportSummaryTable;
    later: FullReportSummaryTable;
  };
  itemInsights?: {
    topItemsBySpend: FullReportSummaryTable;
    topItemsByFrequency: FullReportSummaryTable;
    recentPriceChanges: FullReportSummaryTable;
    merchantInsights: FullReportSummaryTable;
    recurringSuggestions: FullReportSummaryTable;
    spendingByCategory: FullReportSummaryTable;
  } | null;
  currencySummary: {
    originals: FullReportSummaryTable;
    converted: FullReportSummaryTable;
    notes: string[];
  };
  observations: string[];
  budgetChart?: FullReportChartState<{ id: string; category: string; allocated: number; spent: number; color: string }> | null;
}

function SectionCard({
  title,
  description,
  children,
  className = '',
}: {
  title: string;
  description?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`report-section rounded-[28px] border border-border bg-card p-5 shadow-sm sm:p-6 ${className}`.trim()}>
      <div className="mb-4">
        <h2 className="text-xl font-800 text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MetricGrid({ items }: { items: FullReportMetricCard[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`} className="rounded-2xl border border-border/80 bg-muted/15 p-4">
          <p className="text-[11px] font-700 uppercase tracking-wider text-muted-foreground">
            {item.label}
          </p>
          <p
            className={`mt-2 text-lg font-800 ${
              item.tone === 'positive'
                ? 'text-positive'
                : item.tone === 'negative'
                  ? 'text-negative'
                  : 'text-foreground'
            }`}
          >
            {item.value}
          </p>
          {item.helper ? (
            <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function SummaryTable({
  table,
  compact = false,
}: {
  table: FullReportSummaryTable;
  compact?: boolean;
}) {
  if (table.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/15 p-4 text-sm text-muted-foreground">
        {table.emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-border report-print-section">
      <table className={`report-print-table min-w-full ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead className="bg-muted/30">
          <tr className="border-b border-border">
            {table.headers.map((header) => (
              <th
                key={header}
                className="px-3 py-2 text-left text-[11px] font-700 uppercase tracking-wider text-muted-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={`${row.join('-')}-${index}`} className="border-b border-border/80 align-top last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={`${cell}-${cellIndex}`} className="px-3 py-2.5 text-foreground">
                  {cell || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartStateBlock<T>({
  title,
  state,
  emptyIcon,
  children,
}: {
  title: string;
  state: FullReportChartState<T>;
  emptyIcon: React.ReactNode;
  children: React.ReactNode;
}) {
  if (state.unavailableReason) {
    return (
      <div className="rounded-2xl border border-border bg-muted/10 p-4 text-sm text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 text-foreground">
          <AlertCircle size={16} />
          <span className="font-700">{title}</span>
        </div>
        {state.unavailableReason}
      </div>
    );
  }

  if (state.emptyReason || state.data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/15 p-6 text-center text-sm text-muted-foreground">
        <div className="mb-2 flex justify-center text-muted-foreground">{emptyIcon}</div>
        <p>{state.emptyReason || title}</p>
      </div>
    );
  }

  return <>{children}</>;
}

export default function FullFinancialReport({
  data,
  includeCharts,
  includeTransactionDetails,
  includeItemInsights,
  includeUpcomingCommitments,
}: {
  data: FullFinancialReportData;
  includeCharts: boolean;
  includeTransactionDetails: boolean;
  includeItemInsights: boolean;
  includeUpcomingCommitments: boolean;
}) {
  const { t } = useTranslation('portal');

  return (
    <PrintableReportLayout
      title={data.title}
      subtitle={data.subtitle}
      identity={data.identity}
      metadata={data.metadata}
      generatedAtLabel={data.generatedAtLabel}
    >
      {data.largeReportWarning ? (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {data.largeReportWarning}
        </div>
      ) : null}

      <SectionCard title={t('reports.fullReport.sections.executiveSummary', { defaultValue: 'Executive Summary' })}>
        <MetricGrid items={data.executiveSummary.metrics} />
        {data.executiveSummary.narratives.length > 0 ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {data.executiveSummary.narratives.map((item) => (
              <div key={item} className="rounded-2xl border border-border/80 bg-muted/15 px-4 py-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard
        title={t('reports.fullReport.sections.incomeExpenses', { defaultValue: 'Income and Expenses' })}
        className="report-major-section"
      >
        <MetricGrid items={data.incomeExpenses.metrics} />
        {data.incomeExpenses.comparisonSummary ? (
          <p className="mt-4 text-sm text-muted-foreground">{data.incomeExpenses.comparisonSummary}</p>
        ) : null}

        {includeCharts ? (
          <div className="mt-5 report-chart-shell">
            <ChartStateBlock
              title={t('reports.types.incomeExpense', { defaultValue: 'Income vs Expenses' })}
              state={data.incomeExpenses.incomeVsExpenseChart}
              emptyIcon={<BarChart3 size={18} />}
            >
              <div className="report-chart h-[18rem] rounded-2xl border border-border bg-card p-3">
                <IncomeExpenseReportChart
                  data={data.incomeExpenses.incomeVsExpenseChart.data}
                  currencyCode={data.reportingCurrency}
                />
              </div>
            </ChartStateBlock>
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.incomeExpenses.topIncomeSources', { defaultValue: 'Top income sources' })}
            </h3>
            <SummaryTable table={data.incomeExpenses.topIncomeSources} compact />
          </div>
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.incomeExpenses.topExpenseCategories', { defaultValue: 'Top expense categories' })}
            </h3>
            <SummaryTable table={data.incomeExpenses.topExpenseCategories} compact />
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {data.incomeExpenses.highlights.map((item) => (
            <div key={`${item.label}-${item.value}`} className="rounded-2xl border border-border/80 bg-muted/15 p-4">
              <p className="text-[11px] font-700 uppercase tracking-wider text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-sm font-700 text-foreground">{item.value}</p>
              {item.helper ? <p className="mt-1 text-xs text-muted-foreground">{item.helper}</p> : null}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title={t('reports.fullReport.sections.accounts', { defaultValue: 'Financial Accounts' })}
        className="report-major-section"
      >
        <MetricGrid items={data.accounts.summary} />
        <div className="mt-5 space-y-5">
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.accounts.personal', { defaultValue: 'Personal accounts' })}
            </h3>
            <SummaryTable table={data.accounts.personal} />
          </div>
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.accounts.shared', { defaultValue: 'Shared accounts' })}
            </h3>
            <SummaryTable table={data.accounts.shared} />
          </div>
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.accounts.spaces', { defaultValue: 'Space accounts' })}
            </h3>
            <SummaryTable table={data.accounts.spaces} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('reports.fullReport.sections.transactions', { defaultValue: 'Transaction Details' })}>
        <MetricGrid items={data.transactions.summary} />
        <div className="mt-5">
          <h3 className="mb-3 text-base font-700 text-foreground">
            {t('reports.fullReport.transactions.summaryTitle', { defaultValue: 'Transaction summary' })}
          </h3>
          <SummaryTable table={data.transactions.summaryTable} compact />
        </div>
        {includeTransactionDetails ? (
          <div className="mt-5">
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.transactions.detailTitle', { defaultValue: 'Complete transaction table' })}
            </h3>
            <ReportTransactionTable rows={data.transactions.rows} />
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-border bg-muted/15 p-4 text-sm text-muted-foreground">
            {t('reports.fullReport.transactions.summaryOnly', { defaultValue: 'Transaction detail export is turned off for this report preview.' })}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t('reports.fullReport.sections.categoryAnalysis', { defaultValue: 'Category Analysis' })}
        className="report-major-section"
      >
        {includeCharts ? (
          <div className="report-chart-shell mb-5">
            <ChartStateBlock
              title={t('reports.types.spendingCategory', { defaultValue: 'Spending by Category' })}
              state={data.categories.spendingChart}
              emptyIcon={<PieChart size={18} />}
            >
              <div className="report-chart h-[18rem] rounded-2xl border border-border bg-card p-3">
                <SpendingCategoryReportChart
                  data={data.categories.spendingChart.data}
                  currencyCode={data.reportingCurrency}
                />
              </div>
            </ChartStateBlock>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.categoryAnalysis.spending', { defaultValue: 'Spending by category' })}
            </h3>
            <SummaryTable table={data.categories.expenseTable} compact />
          </div>
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.categoryAnalysis.income', { defaultValue: 'Income by category' })}
            </h3>
            <SummaryTable table={data.categories.incomeTable} compact />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('reports.fullReport.sections.budgets', { defaultValue: 'Budget Performance' })}>
        <MetricGrid items={data.budgets.summary} />
        {includeCharts && data.budgetChart ? (
          <div className="mt-5 report-chart-shell">
            <ChartStateBlock
              title={t('reports.types.budgetPerformance', { defaultValue: 'Budget Performance' })}
              state={data.budgetChart}
              emptyIcon={<Target size={18} />}
            >
              <div className="report-chart h-[18rem] rounded-2xl border border-border bg-card p-3">
                <BudgetPerformanceChart
                  data={data.budgetChart.data}
                  currencyCode={data.reportingCurrency}
                />
              </div>
            </ChartStateBlock>
          </div>
        ) : null}
        <div className="mt-5">
          <SummaryTable table={data.budgets.table} />
        </div>
      </SectionCard>

      <SectionCard title={t('reports.fullReport.sections.people', { defaultValue: 'People, Reimbursements and Settlements' })}>
        <MetricGrid items={data.people.summary} />
        <div className="mt-5">
          <SummaryTable table={data.people.table} />
        </div>
      </SectionCard>

      <SectionCard title={t('reports.fullReport.sections.subscriptions', { defaultValue: 'Personal Subscriptions' })}>
        <MetricGrid items={data.subscriptions.summary} />
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.subscriptions.active', { defaultValue: 'Subscriptions' })}
            </h3>
            <SummaryTable table={data.subscriptions.table} compact />
          </div>
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.subscriptions.upcoming', { defaultValue: 'Upcoming renewals' })}
            </h3>
            <SummaryTable table={data.subscriptions.upcomingTable} compact />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('reports.fullReport.sections.recurring', { defaultValue: 'Recurring Transactions' })}>
        <SummaryTable table={data.recurring.table} />
      </SectionCard>

      <SectionCard title={t('reports.fullReport.sections.loans', { defaultValue: 'Loans and Repayments' })}>
        <MetricGrid items={data.loans.summary} />
        <div className="mt-5">
          <SummaryTable table={data.loans.table} />
        </div>
      </SectionCard>

      {includeUpcomingCommitments ? (
        <SectionCard title={t('reports.fullReport.sections.commitments', { defaultValue: 'Upcoming Financial Commitments' })}>
          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.commitments.overdue', { defaultValue: 'Overdue' })}
              </h3>
              <SummaryTable table={data.commitments.overdue} compact />
            </div>
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.commitments.next7Days', { defaultValue: 'Next 7 days' })}
              </h3>
              <SummaryTable table={data.commitments.next7Days} compact />
            </div>
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.commitments.next30Days', { defaultValue: 'Next 30 days' })}
              </h3>
              <SummaryTable table={data.commitments.next30Days} compact />
            </div>
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.commitments.later', { defaultValue: 'Later' })}
              </h3>
              <SummaryTable table={data.commitments.later} compact />
            </div>
          </div>
        </SectionCard>
      ) : null}

      {includeItemInsights && data.itemInsights ? (
        <SectionCard title={t('reports.fullReport.sections.itemInsights', { defaultValue: 'Item Insights' })}>
          <div className="grid gap-5 xl:grid-cols-2">
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.itemInsights.topItemsBySpend', { defaultValue: 'Top purchased items' })}
              </h3>
              <SummaryTable table={data.itemInsights.topItemsBySpend} compact />
            </div>
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.itemInsights.topItemsByFrequency', { defaultValue: 'Frequently purchased items' })}
              </h3>
              <SummaryTable table={data.itemInsights.topItemsByFrequency} compact />
            </div>
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.itemInsights.priceChanges', { defaultValue: 'Price changes' })}
              </h3>
              <SummaryTable table={data.itemInsights.recentPriceChanges} compact />
            </div>
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.itemInsights.merchantComparison', { defaultValue: 'Merchant comparison' })}
              </h3>
              <SummaryTable table={data.itemInsights.merchantInsights} compact />
            </div>
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.itemInsights.recurringSuggestions', { defaultValue: 'Recurring item suggestions' })}
              </h3>
              <SummaryTable table={data.itemInsights.recurringSuggestions} compact />
            </div>
            <div>
              <h3 className="mb-3 text-base font-700 text-foreground">
                {t('reports.fullReport.itemInsights.itemCategories', { defaultValue: 'Top spending by item category' })}
              </h3>
              <SummaryTable table={data.itemInsights.spendingByCategory} compact />
            </div>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard title={t('reports.fullReport.sections.currency', { defaultValue: 'Currency Summary' })}>
        <div className="grid gap-5 xl:grid-cols-2">
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.currency.originalTotals', { defaultValue: 'Original totals by currency' })}
            </h3>
            <SummaryTable table={data.currencySummary.originals} compact />
          </div>
          <div>
            <h3 className="mb-3 text-base font-700 text-foreground">
              {t('reports.fullReport.currency.reportingTotals', { defaultValue: 'Reporting-currency totals' })}
            </h3>
            <SummaryTable table={data.currencySummary.converted} compact />
          </div>
        </div>
        {data.currencySummary.notes.length > 0 ? (
          <div className="mt-5 space-y-2">
            {data.currencySummary.notes.map((note) => (
              <p key={note} className="text-sm text-muted-foreground">{note}</p>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title={t('reports.fullReport.sections.observations', { defaultValue: 'Key Observations' })}>
        {data.observations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/15 p-4 text-sm text-muted-foreground">
            {t('reports.fullReport.observations.empty', { defaultValue: 'No additional observations are available for the selected report filters.' })}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {data.observations.map((item) => (
              <div key={item} className="rounded-2xl border border-border/80 bg-muted/15 px-4 py-3 text-sm text-foreground">
                {item}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </PrintableReportLayout>
  );
}
