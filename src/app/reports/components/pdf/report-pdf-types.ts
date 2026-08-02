'use client';

import type { FullFinancialReportData, FullReportMetricTone } from '../FullFinancialReport';
import type { PrintableReportIdentity, ReportMetadataItem } from '../full-report-types';

export interface ReportPdfMetric {
  label: string;
  value: string;
  helper?: string | null;
  tone?: FullReportMetricTone;
}

export interface ReportPdfTable {
  title?: string | null;
  description?: string | null;
  headers: string[];
  rows: string[][];
  emptyMessage: string;
  compact?: boolean;
}

export interface StandardReportPdfSection {
  title: string;
  description?: string | null;
  paragraphs?: string[];
  tables: ReportPdfTable[];
}

export interface ReportPdfLabels {
  preparedFor: string;
  page: string;
  noActivity: string;
  executiveSummary: string;
  periodActivity: string;
  financialPosition: string;
  people: string;
  commitments: string;
  detailedTransactions: string;
  currencySummary: string;
  reportingTotals: string;
  originalCurrencyBreakdown: string;
  topIncomeSources: string;
  topExpenseCategories: string;
  transactionSummary: string;
  budgetPerformance: string;
  accountSummary: string;
  sharedAccounts: string;
  spaceAccounts: string;
  loans: string;
  activeSubscriptions: string;
  upcomingSubscriptionRenewals: string;
  recurringTransactions: string;
  overdueCommitments: string;
  next7Days: string;
  next30Days: string;
  laterCommitments: string;
  recurringItemSuggestions: string;
  userFallback: string;
  date: string;
  description: string;
  category: string;
  account: string;
  type: string;
  amount: string;
}

export interface ReportPdfBranding {
  appName: string;
  shortBrandName: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
}

interface BaseReportPdfSnapshot {
  title: string;
  subtitle?: string | null;
  identity: PrintableReportIdentity;
  metadata: ReportMetadataItem[];
  generatedAtLabel: string;
  reportingCurrency: string;
  periodLabel: string;
  scopeLabel: string;
  language: string;
  dir: 'ltr' | 'rtl';
  assetBaseUrl: string;
  branding: ReportPdfBranding;
  officialDirhamSymbolUrl: string;
  labels: ReportPdfLabels;
}

export interface FullFinancialReportPdfSnapshot extends BaseReportPdfSnapshot {
  kind: 'full-financial';
  data: FullFinancialReportData;
  includeTransactionDetails: boolean;
  includeUpcomingCommitments: boolean;
  includeItemInsights: boolean;
}

export interface StandardReportPdfSnapshot extends BaseReportPdfSnapshot {
  kind: 'standard';
  reportType: 'income-expense' | 'spending-category' | 'monthly-trends' | 'budget-performance' | 'account-statement';
  summary: ReportPdfMetric[];
  sections: StandardReportPdfSection[];
}

export type ReportPdfSnapshot = FullFinancialReportPdfSnapshot | StandardReportPdfSnapshot;
