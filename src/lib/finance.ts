'use client';
import { createClient } from '@/lib/supabase/client';
import { formatCurrencyText } from '@/lib/currency-formatting';
import {
  addCurrencyAmount,
  ensureZeroCurrencyTotal,
  mapCurrencyTotals,
  resolveUserDefaultCurrency,
} from '@/lib/currency-totals';
import { getExchangeRateFreshness, convertWithSnapshot } from '@/lib/exchange-rates/conversion';
import {
  getLatestExchangeRateSnapshot,
  listHistoricalExchangeRateSnapshots,
} from '@/lib/exchange-rates/service';
import { getMonthContext, shiftMonthKey } from '@/lib/financial-periods';
import type {
  ExchangeRateFreshness,
  ExchangeRateLookupMode,
  ExchangeRateSnapshotRecord,
} from '@/lib/exchange-rates/types';
import type { DashboardPeriodPreference } from '@/lib/financial-periods';

type CurrencyAmountRow = { amount: number | string; currency: string | null };
type AmountRow = { amount: number | string };
type BalanceRow = { current_balance: number | string; include_in_total: boolean; currency: string };
type TransactionMetricRow = {
  id: string;
  account_id: string;
  category_id?: string | null;
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: number | string;
  currency?: string | null;
  expense_owner?: string | null;
  paid_by?: string | null;
  paid_from?: string | null;
  use_held_balance?: boolean | null;
};
type LedgerLinkedTransactionRow = {
  transaction_id: string | null;
  entry_type: string;
  reference_type: string | null;
};
type PersonBalanceMetricRow = { full_name: string; money_held: number | string; preferred_currency: string };
type LoanLedgerRow = {
  amount: number | string;
  currency: string;
  entry_type: string;
  entry_date: string;
  reference_type: string | null;
};
type BudgetMetricRow = {
  id: string;
  category_id: string | null;
  amount: number | string;
  currency: string | null;
  period_start: string;
  period_end: string | null;
};
type BudgetReportRow = BudgetMetricRow & {
  category?: { name: string; color: string | null } | null;
};
type TransactionLedgerSummary = {
  entryTypes: Set<string>;
  referenceTypes: Set<string>;
};
type AccountInclusionRow = {
  id: string;
  include_in_total: boolean;
};
export type TransactionClassification =
  | 'personal_income'
  | 'personal_expense'
  | 'loan_proceeds'
  | 'loan_repayment'
  | 'managed_receipt'
  | 'managed_expense'
  | 'managed_return'
  | 'transfer'
  | 'other';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinancialAccount {
  id: string;
  user_id: string;
  name: string;
  account_type: 'bank' | 'credit_card' | 'cash' | 'savings' | 'digital_wallet' | 'investment' | 'other';
  currency: string;
  opening_balance: number;
  current_balance: number;
  color: string | null;
  icon: string | null;
  notes: string | null;
  is_active: boolean;
  include_in_total: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  category_type: 'income' | 'expense' | 'transfer';
  color: string | null;
  icon: string | null;
  is_system: boolean;
  sort_order: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  transaction_date: string;
  tags: string[];
  is_recurring: boolean;
  recurring_id: string | null;
  transfer_pair_id: string | null;
  expense_owner?: string | null;
  paid_by?: string | null;
  paid_from?: string | null;
  use_held_balance?: boolean;
  created_at: string;
  updated_at: string;
  // joined
  account?: { name: string; currency: string };
  category?: { name: string; color: string | null; icon: string | null };
  receipt_attachments?: ReceiptAttachment[];
}

export interface CreateTransactionInput {
  account_id: string;
  category_id?: string | null;
  transaction_type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  merchant?: string | null;
  notes?: string | null;
  transaction_date: string;
  tags?: string[];
  is_recurring?: boolean;
  recurring_id?: string | null;
  person_id?: string | null;
  expense_owner?: string | null;
  paid_by?: string | null;
  paid_from?: string | null;
  use_held_balance?: boolean;
  reimbursement_required?: boolean;
  reimbursement_status?: string | null;
}

export interface CreateTransactionsBatchFailure {
  index: number;
  account_id: string;
  message: string;
}

export interface CreateTransactionsBatchResult {
  created: Transaction[];
  failures: CreateTransactionsBatchFailure[];
}

export interface ReceiptAttachment {
  id: string;
  transaction_id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  amount: number;
  period: 'monthly' | 'weekly' | 'yearly' | 'custom';
  period_start: string;
  period_end: string | null;
  alert_at_percent: number;
  currency: string;
  is_active: boolean;
  // joined
  category?: { name: string; color: string | null; icon: string | null };
  spent?: number;
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: string;
  description: string;
  merchant: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  next_due_date: string;
  last_run_date: string | null;
  is_active: boolean;
  auto_create: boolean;
  tags: string[];
  created_at: string;
  // joined
  account?: { name: string };
  category?: { name: string; color: string | null };
}

export interface Transfer {
  id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  from_transaction_id: string | null;
  to_transaction_id: string | null;
  amount: number;
  currency: string;
  source_amount?: number | null;
  source_currency?: string | null;
  destination_amount?: number | null;
  destination_currency?: string | null;
  exchange_rate?: number | null;
  exchange_rate_provider?: string | null;
  exchange_rate_snapshot_id?: string | null;
  exchange_rate_date?: string | null;
  exchange_rate_timestamp?: string | null;
  description: string | null;
  transfer_date: string;
  notes: string | null;
  created_at: string;
  // joined
  from_account?: { name: string };
  to_account?: { name: string };
}

export interface DashboardConvertedMetric {
  originalTotals: Array<{ currency: string; amount: number }>;
  reportingCurrency: string;
  reportingAmount: number | null;
  allOriginalInReportingCurrency: boolean;
  conversionAvailable: boolean;
  rateDate: string | null;
  provider: string | null;
  providerTimestamp: string | null;
  fetchedAt: string | null;
  freshness: ExchangeRateFreshness;
  stale: boolean;
  lookupMode: ExchangeRateLookupMode;
  unavailableReason: string | null;
}

export interface DashboardMetrics {
  defaultCurrency: string;
  totalBalance: DashboardConvertedMetric;
  monthlyIncome: DashboardConvertedMetric;
  monthlyExpenses: DashboardConvertedMetric;
  netCashFlow: DashboardConvertedMetric;
  totalBudget: DashboardConvertedMetric;
  budgetSpent: DashboardConvertedMetric;
  activeBudgetCount: number;
  upcomingPayments: DashboardConvertedMetric;
  upcomingPaymentsCount: number;
  managedMoney: DashboardConvertedMetric;
  managedPeopleCount: number;
  outstandingLoanBalance: DashboardConvertedMetric;
  loanBorrowedThisMonth: DashboardConvertedMetric;
  loanRepaidThisMonth: DashboardConvertedMetric;
  budgetTrackingAvailable: boolean;
}

export interface HistoricalReportConvertedMetric {
  originalTotals: Array<{ currency: string; amount: number }>;
  reportingCurrency: string;
  reportingAmount: number | null;
  allOriginalInReportingCurrency: boolean;
  conversionAvailable: boolean;
  provider: string | null;
  freshestAppliedAt: string | null;
  earliestRateDate: string | null;
  latestRateDate: string | null;
  exactCount: number;
  previousAvailableCount: number;
  unavailableCount: number;
  missingRateDates: string[];
  freshness: ExchangeRateFreshness;
  stale: boolean;
  unavailableReason: string | null;
}

export interface AccountsSummaryMetrics {
  defaultCurrency: string;
  totalNetWorth: DashboardConvertedMetric;
  totalAssets: DashboardConvertedMetric;
  totalLiabilities: DashboardConvertedMetric;
  activeAccountsCount: number;
}

export interface TransactionReportingPreview {
  transactionId: string;
  originalAmount: number;
  originalCurrency: string;
  reportingAmount: number | null;
  reportingCurrency: string;
  rateDate: string | null;
  provider: string | null;
  providerTimestamp: string | null;
  fetchedAt: string | null;
  freshness: ExchangeRateFreshness;
  stale: boolean;
  unavailableReason: string | null;
}

export interface HistoricalReportContext {
  reportingCurrency: string;
  snapshots: ExchangeRateSnapshotRecord[];
}

export interface HistoricalAmountConversionResult {
  convertedAmount: number | null;
  reportingCurrency: string;
  rateDate: string | null;
  provider: string | null;
  providerTimestamp: string | null;
  fetchedAt: string | null;
  freshness: ExchangeRateFreshness;
  stale: boolean;
  lookupMode: ExchangeRateLookupMode;
  unavailableReason: string | null;
  missingRateDate: string | null;
}

export interface LatestReportingContext {
  defaultCurrency: string;
  latestSnapshot: ExchangeRateSnapshotRecord | null;
}

export interface DashboardMonthContext {
  monthKey: string;
  label: string;
  monthStart: string;
  monthEnd: string;
  isCurrentMonth: boolean;
}

export interface DashboardActivePeriod {
  mode: DashboardPeriodPreference;
  startDate: string;
  endDate: string;
  label: string;
  isCurrent: boolean;
  timezone: string;
  monthKey?: string;
}

export async function loadTransactionLedgerSummaryMap(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, TransactionLedgerSummary>> {
  const { data, error } = await supabase
    .from('person_ledger_entries')
    .select('transaction_id, entry_type, reference_type')
    .eq('is_deleted', false)
    .not('transaction_id', 'is', null);

  if (error) throw error;

  const summaryByTransactionId = new Map<string, TransactionLedgerSummary>();

  for (const row of ((data || []) as LedgerLinkedTransactionRow[])) {
    if (typeof row.transaction_id !== 'string' || row.transaction_id.length === 0) continue;
    const current = summaryByTransactionId.get(row.transaction_id) || {
      entryTypes: new Set<string>(),
      referenceTypes: new Set<string>(),
    };
    if (typeof row.entry_type === 'string' && row.entry_type.length > 0) {
      current.entryTypes.add(row.entry_type);
    }
    if (typeof row.reference_type === 'string' && row.reference_type.length > 0) {
      current.referenceTypes.add(row.reference_type);
    }
    summaryByTransactionId.set(row.transaction_id, current);
  }

  return summaryByTransactionId;
}

export async function loadAccountInclusionMap(
  supabase: ReturnType<typeof createClient>
): Promise<Map<string, boolean>> {
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('id, include_in_total');

  if (error) throw error;

  return new Map(
    ((data || []) as AccountInclusionRow[]).map((row) => [row.id, row.include_in_total])
  );
}

function hasEntryType(summary: TransactionLedgerSummary | undefined, ...entryTypes: string[]) {
  return entryTypes.some((entryType) => !!summary?.entryTypes.has(entryType));
}

function hasReferenceType(summary: TransactionLedgerSummary | undefined, ...referenceTypes: string[]) {
  return referenceTypes.some((referenceType) => !!summary?.referenceTypes.has(referenceType));
}

function isManagedAccountTransaction(
  row: Pick<TransactionMetricRow, 'account_id'>,
  accountInclusionById: Map<string, boolean>
) {
  return accountInclusionById.get(row.account_id) === false;
}

export function classifyTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
): TransactionClassification {
  const summary = ledgerSummaryByTransactionId.get(row.id);
  const isManagedAccount = isManagedAccountTransaction(row, accountInclusionById);

  if (row.transaction_type === 'transfer') return 'transfer';
  if (hasEntryType(summary, 'reimbursement_due_to_person') && hasReferenceType(summary, 'loan')) {
    return 'loan_proceeds';
  }
  if (hasEntryType(summary, 'reimbursement_paid') && hasReferenceType(summary, 'loan')) {
    return 'loan_repayment';
  }
  if (hasEntryType(summary, 'money_returned') && hasReferenceType(summary, 'managed_return')) {
    return 'managed_return';
  }
  if (
    hasEntryType(summary, 'expense_from_held') ||
    row.use_held_balance === true ||
    row.paid_from === 'held_balance'
  ) {
    return 'managed_expense';
  }
  if (
    hasEntryType(summary, 'money_received') ||
    (isManagedAccount && row.transaction_type === 'income') ||
    (row.transaction_type === 'income' && row.expense_owner === 'person' && row.paid_by === 'person')
  ) {
    return 'managed_receipt';
  }
  if (isManagedAccount && row.transaction_type === 'expense') {
    return 'managed_expense';
  }
  if (row.transaction_type === 'income') return 'personal_income';
  if (row.transaction_type === 'expense') return 'personal_expense';
  return 'other';
}

export function isLoanProceedsTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById) === 'loan_proceeds';
}

export function isLoanRepaymentTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById) === 'loan_repayment';
}

export function isManagedMoneyTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  const classification = classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById);
  return classification === 'managed_receipt' || classification === 'managed_expense' || classification === 'managed_return';
}

export function isPersonalIncomeTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById) === 'personal_income';
}

export function isPersonalExpenseTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById) === 'personal_expense';
}

export function shouldIncludeInPersonalCashFlow(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  const classification = classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById);
  return classification !== 'transfer' &&
    classification !== 'managed_receipt' &&
    classification !== 'managed_expense' &&
    classification !== 'managed_return';
}

export function shouldIncludeInPersonalReports(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  const classification = classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById);
  return classification !== 'transfer' &&
    classification !== 'managed_receipt' &&
    classification !== 'managed_expense' &&
    classification !== 'managed_return';
}

export function shouldIncludeInBudgetSpending(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return isPersonalExpenseTransaction(row, ledgerSummaryByTransactionId, accountInclusionById);
}

function filterTransactionsByRule<T extends Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>>(
  rows: T[],
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>,
  predicate: (
    row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
    ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
    accountInclusionById: Map<string, boolean>
  ) => boolean
) {
  return rows.filter((row) => predicate(row, ledgerSummaryByTransactionId, accountInclusionById));
}

function isBudgetActiveForWindow(
  budget: Pick<BudgetMetricRow, 'period_start' | 'period_end'>,
  periodStart: string,
  periodEnd: string
) {
  return budget.period_start <= periodEnd && (!budget.period_end || budget.period_end >= periodStart);
}

function sumCurrencyTotals(rows: Array<{ currency: string; amount: number }>) {
  return rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
}

function formatHistoricalRateDateLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function dedupeSortedDates(values: Iterable<string>) {
  return Array.from(new Set(Array.from(values).filter(Boolean))).sort();
}

export function buildHistoricalRateUnavailableMessage(missingRateDates: Iterable<string>) {
  const dates = dedupeSortedDates(missingRateDates);
  if (dates.length === 0) {
    return 'Historical conversion is unavailable for one or more records before the first stored snapshot.';
  }
  if (dates.length === 1) {
    return `Historical rate unavailable for ${formatHistoricalRateDateLabel(dates[0])}`;
  }
  return `Historical rates unavailable for ${dates.length} dates from ${formatHistoricalRateDateLabel(dates[0])} to ${formatHistoricalRateDateLabel(dates[dates.length - 1])}`;
}

function findHistoricalSnapshotForDate(
  snapshots: ExchangeRateSnapshotRecord[],
  rateDate: string
): { snapshot: ExchangeRateSnapshotRecord | null; lookupMode: ExchangeRateLookupMode } {
  let low = 0;
  let high = snapshots.length - 1;
  let matchedIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const snapshot = snapshots[mid];
    if (snapshot.rate_date <= rateDate) {
      matchedIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (matchedIndex === -1) {
    return {
      snapshot: null,
      lookupMode: 'unavailable',
    };
  }

  const matchedSnapshot = snapshots[matchedIndex];

  return {
    snapshot: matchedSnapshot,
    lookupMode: matchedSnapshot.rate_date === rateDate ? 'exact' : 'previous_available',
  };
}

export async function getHistoricalReportContext(
  transactions: Array<Pick<Transaction, 'transaction_date'>>,
  reportingCurrency?: string
): Promise<HistoricalReportContext> {
  const resolvedReportingCurrency = reportingCurrency || await resolveUserDefaultCurrency();
  const latestTransactionDate = transactions.reduce((latest, transaction) => {
    return transaction.transaction_date > latest ? transaction.transaction_date : latest;
  }, '');

  return {
    reportingCurrency: resolvedReportingCurrency,
    snapshots: latestTransactionDate
      ? await listHistoricalExchangeRateSnapshots(createClient(), latestTransactionDate)
      : [],
  };
}

export async function getLatestReportingContext(
  supabaseInput?: ReturnType<typeof createClient>
): Promise<LatestReportingContext> {
  const supabase = supabaseInput || createClient();
  const [defaultCurrency, latestSnapshot] = await Promise.all([
    resolveUserDefaultCurrency(),
    getLatestExchangeRateSnapshot(supabase).catch(() => null),
  ]);

  return {
    defaultCurrency,
    latestSnapshot,
  };
}

export function convertHistoricalAmountWithSnapshots(args: {
  amount: number;
  fromCurrency: string;
  reportingCurrency: string;
  rateDate: string;
  snapshots: ExchangeRateSnapshotRecord[];
}): HistoricalAmountConversionResult {
  const numericAmount = Number(args.amount || 0);
  if (!Number.isFinite(numericAmount)) {
    return {
      convertedAmount: null,
      reportingCurrency: args.reportingCurrency,
      rateDate: null,
      provider: null,
      providerTimestamp: null,
      fetchedAt: null,
      freshness: 'unavailable',
      stale: true,
      lookupMode: 'unavailable',
      unavailableReason: 'Amount must be a finite number',
      missingRateDate: args.rateDate,
    };
  }

  if ((args.fromCurrency || '').trim().toUpperCase() === (args.reportingCurrency || '').trim().toUpperCase()) {
    return {
      convertedAmount: numericAmount,
      reportingCurrency: args.reportingCurrency,
      rateDate: null,
      provider: null,
      providerTimestamp: null,
      fetchedAt: null,
      freshness: 'fresh',
      stale: false,
      lookupMode: 'same_currency',
      unavailableReason: null,
      missingRateDate: null,
    };
  }

  const { snapshot, lookupMode } = findHistoricalSnapshotForDate(args.snapshots, args.rateDate);
  if (!snapshot) {
    return {
      convertedAmount: null,
      reportingCurrency: args.reportingCurrency,
      rateDate: null,
      provider: null,
      providerTimestamp: null,
      fetchedAt: null,
      freshness: 'unavailable',
      stale: true,
      lookupMode: 'unavailable',
      unavailableReason: buildHistoricalRateUnavailableMessage([args.rateDate]),
      missingRateDate: args.rateDate,
    };
  }

  try {
    const conversion = convertWithSnapshot({
      amount: numericAmount,
      fromCurrency: args.fromCurrency,
      toCurrency: args.reportingCurrency,
      snapshot,
      lookupMode,
    });

    return {
      convertedAmount: conversion.convertedAmount,
      reportingCurrency: conversion.reportingCurrency,
      rateDate: conversion.rateDate,
      provider: conversion.provider,
      providerTimestamp: conversion.providerTimestamp,
      fetchedAt: conversion.fetchedAt,
      freshness: conversion.freshness,
      stale: conversion.stale,
      lookupMode: conversion.lookupMode,
      unavailableReason: null,
      missingRateDate: null,
    };
  } catch (error) {
    return {
      convertedAmount: null,
      reportingCurrency: args.reportingCurrency,
      rateDate: snapshot.rate_date,
      provider: snapshot.provider,
      providerTimestamp: snapshot.provider_timestamp,
      fetchedAt: snapshot.fetched_at,
      freshness: getExchangeRateFreshness(snapshot),
      stale: true,
      lookupMode: 'unavailable',
      unavailableReason: error instanceof Error ? error.message : 'Historical conversion failed',
      missingRateDate: args.rateDate,
    };
  }
}

function buildHistoricalOriginalTotals(
  transactions: Transaction[],
  getSignedAmount: (transaction: Transaction) => number,
  reportingCurrency: string
) {
  const grouped = new Map<string, number>();

  for (const transaction of transactions) {
    addCurrencyAmount(
      grouped,
      transaction.currency || reportingCurrency,
      getSignedAmount(transaction),
      reportingCurrency
    );
  }

  return ensureZeroCurrencyTotal(mapCurrencyTotals(grouped), reportingCurrency);
}

export function buildHistoricalReportConvertedMetricFromSnapshots(args: {
  transactions: Transaction[];
  getSignedAmount: (transaction: Transaction) => number;
  reportingCurrency: string;
  snapshots: ExchangeRateSnapshotRecord[];
}) {
  const originalTotals = buildHistoricalOriginalTotals(
    args.transactions,
    args.getSignedAmount,
    args.reportingCurrency
  );
  const allOriginalInReportingCurrency = originalTotals.every(
    (row) => row.currency === args.reportingCurrency
  );

  if (allOriginalInReportingCurrency) {
    return {
      originalTotals,
      reportingCurrency: args.reportingCurrency,
      reportingAmount: sumCurrencyTotals(originalTotals),
      allOriginalInReportingCurrency: true,
      conversionAvailable: true,
      provider: null,
      freshestAppliedAt: null,
      earliestRateDate: null,
      latestRateDate: null,
      exactCount: 0,
      previousAvailableCount: 0,
      unavailableCount: 0,
      missingRateDates: [],
      freshness: 'fresh' as const,
      stale: false,
      unavailableReason: null,
    } satisfies HistoricalReportConvertedMetric;
  }

  if (args.snapshots.length === 0) {
    const missingRateDates = dedupeSortedDates(
      args.transactions
        .filter((transaction) => (transaction.currency || '').trim().toUpperCase() !== args.reportingCurrency.trim().toUpperCase())
        .map((transaction) => transaction.transaction_date)
    );
    return {
      originalTotals,
      reportingCurrency: args.reportingCurrency,
      reportingAmount: null,
      allOriginalInReportingCurrency: false,
      conversionAvailable: false,
      provider: null,
      freshestAppliedAt: null,
      earliestRateDate: null,
      latestRateDate: null,
      exactCount: 0,
      previousAvailableCount: 0,
      unavailableCount: missingRateDates.length,
      missingRateDates,
      freshness: 'unavailable' as const,
      stale: true,
      unavailableReason: buildHistoricalRateUnavailableMessage(missingRateDates),
    } satisfies HistoricalReportConvertedMetric;
  }

  let reportingAmount = 0;
  let exactCount = 0;
  let previousAvailableCount = 0;
  let unavailableCount = 0;
  let provider: string | null = null;
  let freshestAppliedAt: string | null = null;
  let earliestRateDate: string | null = null;
  let latestRateDate: string | null = null;
  let stale = false;
  const missingRateDates = new Set<string>();

  for (const transaction of args.transactions) {
    const signedAmount = args.getSignedAmount(transaction);
    const conversion = convertHistoricalAmountWithSnapshots({
      amount: signedAmount,
      fromCurrency: transaction.currency || args.reportingCurrency,
      reportingCurrency: args.reportingCurrency,
      rateDate: transaction.transaction_date,
      snapshots: args.snapshots,
    });

    if (conversion.convertedAmount === null) {
      unavailableCount += 1;
      if (conversion.missingRateDate) {
        missingRateDates.add(conversion.missingRateDate);
      }
      continue;
    }

    reportingAmount += conversion.convertedAmount;
    if (conversion.lookupMode === 'exact') {
      exactCount += 1;
    } else if (conversion.lookupMode === 'previous_available') {
      previousAvailableCount += 1;
    }

    if (conversion.provider) {
      provider = provider && provider !== conversion.provider ? 'multiple' : conversion.provider;
    }
    freshestAppliedAt = [freshestAppliedAt, conversion.providerTimestamp || conversion.fetchedAt]
      .filter(Boolean)
      .sort()
      .at(-1) || freshestAppliedAt;
    earliestRateDate = [earliestRateDate, conversion.rateDate].filter(Boolean).sort()[0] || earliestRateDate;
    latestRateDate = [latestRateDate, conversion.rateDate].filter(Boolean).sort().at(-1) || latestRateDate;
    stale = stale || conversion.stale;
  }

  const missingDates = dedupeSortedDates(missingRateDates);
  if (unavailableCount > 0) {
    return {
      originalTotals,
      reportingCurrency: args.reportingCurrency,
      reportingAmount: null,
      allOriginalInReportingCurrency: false,
      conversionAvailable: false,
      provider,
      freshestAppliedAt,
      earliestRateDate,
      latestRateDate,
      exactCount,
      previousAvailableCount,
      unavailableCount,
      missingRateDates: missingDates,
      freshness: stale ? 'stale' : 'fresh',
      stale: true,
      unavailableReason: buildHistoricalRateUnavailableMessage(missingDates),
    } satisfies HistoricalReportConvertedMetric;
  }

  return {
    originalTotals,
    reportingCurrency: args.reportingCurrency,
    reportingAmount,
    allOriginalInReportingCurrency: false,
    conversionAvailable: true,
    provider,
    freshestAppliedAt,
    earliestRateDate,
    latestRateDate,
    exactCount,
    previousAvailableCount,
    unavailableCount: 0,
    missingRateDates: [],
    freshness: stale ? 'stale' : 'fresh',
    stale,
    unavailableReason: null,
  } satisfies HistoricalReportConvertedMetric;
}

function buildDashboardConvertedMetric(args: {
  originalTotals: Array<{ currency: string; amount: number }>;
  reportingCurrency: string;
  latestSnapshot: Awaited<ReturnType<typeof getLatestExchangeRateSnapshot>> | null;
}): DashboardConvertedMetric {
  const originalTotals = ensureZeroCurrencyTotal(args.originalTotals, args.reportingCurrency);
  const allOriginalInReportingCurrency = originalTotals.every(
    (row) => row.currency === args.reportingCurrency
  );

  if (allOriginalInReportingCurrency) {
    return {
      originalTotals,
      reportingCurrency: args.reportingCurrency,
      reportingAmount: sumCurrencyTotals(originalTotals),
      allOriginalInReportingCurrency: true,
      conversionAvailable: true,
      rateDate: null,
      provider: null,
      providerTimestamp: null,
      fetchedAt: null,
      freshness: 'fresh',
      stale: false,
      lookupMode: 'same_currency',
      unavailableReason: null,
    };
  }

  if (!args.latestSnapshot) {
    return {
      originalTotals,
      reportingCurrency: args.reportingCurrency,
      reportingAmount: null,
      allOriginalInReportingCurrency: false,
      conversionAvailable: false,
      rateDate: null,
      provider: null,
      providerTimestamp: null,
      fetchedAt: null,
      freshness: 'unavailable',
      stale: true,
      lookupMode: 'unavailable',
      unavailableReason: 'Exchange rates are unavailable',
    };
  }

  const latestSnapshot = args.latestSnapshot;

  try {
    const convertedAmount = originalTotals.reduce((sum, row) => {
      return sum + convertWithSnapshot({
        amount: row.amount,
        fromCurrency: row.currency,
        toCurrency: args.reportingCurrency,
        snapshot: latestSnapshot,
        lookupMode: 'latest',
      }).convertedAmount;
    }, 0);

    const freshness = getExchangeRateFreshness(latestSnapshot);
    return {
      originalTotals,
      reportingCurrency: args.reportingCurrency,
      reportingAmount: convertedAmount,
      allOriginalInReportingCurrency: false,
      conversionAvailable: true,
      rateDate: latestSnapshot.rate_date,
      provider: latestSnapshot.provider,
      providerTimestamp: latestSnapshot.provider_timestamp,
      fetchedAt: latestSnapshot.fetched_at,
      freshness,
      stale: freshness !== 'fresh',
      lookupMode: 'latest',
      unavailableReason: null,
    };
  } catch (error) {
    return {
      originalTotals,
      reportingCurrency: args.reportingCurrency,
      reportingAmount: null,
      allOriginalInReportingCurrency: false,
      conversionAvailable: false,
      rateDate: latestSnapshot.rate_date,
      provider: latestSnapshot.provider,
      providerTimestamp: latestSnapshot.provider_timestamp,
      fetchedAt: latestSnapshot.fetched_at,
      freshness: getExchangeRateFreshness(latestSnapshot),
      stale: true,
      lookupMode: 'unavailable',
      unavailableReason: error instanceof Error ? error.message : 'Exchange-rate conversion failed',
    };
  }
}

async function getManagedMoneyMetrics(
  supabase: ReturnType<typeof createClient>,
  defaultCurrency: string
) {
  const { data, error } = await supabase
    .from('person_balances')
    .select('full_name, money_held, preferred_currency');

  if (error) throw error;

  const balances = (data || []) as PersonBalanceMetricRow[];
  const managedMoneyByCurrency = new Map<string, number>();
  for (const row of balances) {
    addCurrencyAmount(
      managedMoneyByCurrency,
      row.preferred_currency,
      Math.max(0, Number(row.money_held || 0)),
      defaultCurrency
    );
  }
  return {
    managedMoneyByCurrency: ensureZeroCurrencyTotal(
      mapCurrencyTotals(managedMoneyByCurrency),
      defaultCurrency
    ),
    managedPeopleCount: balances.filter((row) => Number(row.money_held || 0) > 0).length,
  };
}

async function getLoanMetrics(
  supabase: ReturnType<typeof createClient>,
  monthStart: string,
  monthEnd: string,
  defaultCurrency: string
) {
  const { data, error } = await supabase
    .from('person_ledger_entries')
    .select('amount, currency, entry_type, entry_date, reference_type')
    .eq('is_deleted', false)
    .eq('reference_type', 'loan');

  if (error) throw error;

  const rows = (data || []) as LoanLedgerRow[];

  const outstandingLoanBalanceByCurrency = new Map<string, number>();
  const loanBorrowedThisMonthByCurrency = new Map<string, number>();
  const loanRepaidThisMonthByCurrency = new Map<string, number>();

  for (const row of rows) {
    const amount = Number(row.amount || 0);
    if (row.entry_type === 'reimbursement_due_to_person') {
      addCurrencyAmount(outstandingLoanBalanceByCurrency, row.currency, amount, defaultCurrency);
      if (row.entry_date >= monthStart && row.entry_date <= monthEnd) {
        addCurrencyAmount(loanBorrowedThisMonthByCurrency, row.currency, amount, defaultCurrency);
      }
    }
    if (row.entry_type === 'reimbursement_paid') {
      addCurrencyAmount(outstandingLoanBalanceByCurrency, row.currency, -amount, defaultCurrency);
      if (row.entry_date >= monthStart && row.entry_date <= monthEnd) {
        addCurrencyAmount(loanRepaidThisMonthByCurrency, row.currency, amount, defaultCurrency);
      }
    }
  }

  return {
    outstandingLoanBalanceByCurrency: ensureZeroCurrencyTotal(
      mapCurrencyTotals(outstandingLoanBalanceByCurrency)
        .map((row) => ({ ...row, amount: Math.max(0, row.amount) }))
        .filter((row) => row.amount > 0),
      defaultCurrency
    ),
    loanBorrowedThisMonthByCurrency: ensureZeroCurrencyTotal(
      mapCurrencyTotals(loanBorrowedThisMonthByCurrency),
      defaultCurrency
    ),
    loanRepaidThisMonthByCurrency: ensureZeroCurrencyTotal(
      mapCurrencyTotals(loanRepaidThisMonthByCurrency),
      defaultCurrency
    ),
  };
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function getAccounts(): Promise<FinancialAccount[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getFinancialAccountsSummary(
  accountsInput?: FinancialAccount[],
  reportingContext?: LatestReportingContext
): Promise<AccountsSummaryMetrics> {
  const accounts = accountsInput || await getAccounts();
  const supabase = createClient();
  const { defaultCurrency, latestSnapshot } = reportingContext || await getLatestReportingContext(supabase);
  const activeAccounts = accounts.filter((account) => account.is_active);
  const personalAccounts = activeAccounts.filter((account) => account.include_in_total);

  const netByCurrency = new Map<string, number>();
  const assetsByCurrency = new Map<string, number>();
  const liabilitiesByCurrency = new Map<string, number>();

  for (const account of personalAccounts) {
    const currentBalance = Number(account.current_balance || 0);
    addCurrencyAmount(netByCurrency, account.currency, currentBalance, defaultCurrency);
    if (currentBalance >= 0) {
      addCurrencyAmount(assetsByCurrency, account.currency, currentBalance, defaultCurrency);
    } else {
      addCurrencyAmount(liabilitiesByCurrency, account.currency, Math.abs(currentBalance), defaultCurrency);
    }
  }

  return {
    defaultCurrency,
    totalNetWorth: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(netByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    totalAssets: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(assetsByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    totalLiabilities: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(liabilitiesByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    activeAccountsCount: activeAccounts.length,
  };
}

export async function createAccount(payload: Partial<FinancialAccount>): Promise<FinancialAccount> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('financial_accounts')
    .insert({ ...payload, user_id: user.id, current_balance: payload.opening_balance ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAccount(id: string, payload: Partial<FinancialAccount>): Promise<FinancialAccount> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('financial_accounts')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveAccount(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('financial_accounts')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function recalculateAccountBalance(accountId: string): Promise<number> {
  const supabase = createClient();
  // Get opening balance
  const { data: acct, error: acctErr } = await supabase
    .from('financial_accounts')
    .select('opening_balance')
    .eq('id', accountId)
    .single();
  if (acctErr) throw acctErr;

  // Sum income transactions
  const { data: income } = await supabase
    .from('transactions')
    .select('amount')
    .eq('account_id', accountId)
    .eq('transaction_type', 'income');

  // Sum expense transactions
  const { data: expenses } = await supabase
    .from('transactions')
    .select('amount')
    .eq('account_id', accountId)
    .eq('transaction_type', 'expense');

  // Sum transfers in
  const { data: transfersIn } = await supabase
    .from('transfers')
    .select('amount, destination_amount')
    .eq('to_account_id', accountId);

  // Sum transfers out
  const { data: transfersOut } = await supabase
    .from('transfers')
    .select('amount, source_amount')
    .eq('from_account_id', accountId);

  const incomeTotal = ((income || []) as AmountRow[]).reduce((s: number, t) => s + Number(t.amount), 0);
  const expenseTotal = ((expenses || []) as AmountRow[]).reduce((s: number, t) => s + Number(t.amount), 0);
  const transferInTotal = ((transfersIn || []) as Array<{ amount: number | string; destination_amount?: number | string | null }>)
    .reduce((sum, row) => sum + Number(row.destination_amount ?? row.amount ?? 0), 0);
  const transferOutTotal = ((transfersOut || []) as Array<{ amount: number | string; source_amount?: number | string | null }>)
    .reduce((sum, row) => sum + Number(row.source_amount ?? row.amount ?? 0), 0);

  const newBalance = Number(acct.opening_balance) + incomeTotal - expenseTotal + transferInTotal - transferOutTotal;

  await supabase
    .from('financial_accounts')
    .update({ current_balance: newBalance })
    .eq('id', accountId);

  return newBalance;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(type?: 'income' | 'expense' | 'transfer'): Promise<Category[]> {
  const supabase = createClient();
  let query = supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (type) query = query.eq('category_type', type);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(filters?: {
  accountId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
}): Promise<Transaction[]> {
  const supabase = createClient();
  let query = supabase
    .from('transactions')
    .select(`
      *,
      account:financial_accounts(name, currency),
      category:categories(name, color, icon),
      receipt_attachments(*)
    `)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.accountId) query = query.eq('account_id', filters.accountId);
  if (filters?.type && filters.type !== 'all') query = query.eq('transaction_type', filters.type);
  if (filters?.dateFrom) query = query.gte('transaction_date', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('transaction_date', filters.dateTo);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Transaction[];
}

export async function getLatestTransactionReportingPreviews(
  transactions: Transaction[],
  reportingContext?: LatestReportingContext
) {
  const supabase = createClient();
  const { defaultCurrency: reportingCurrency, latestSnapshot } = reportingContext || await getLatestReportingContext(supabase);
  const previews: Record<string, TransactionReportingPreview> = {};

  for (const transaction of transactions) {
    const originalAmount = transaction.transaction_type === 'income'
      ? Number(transaction.amount || 0)
      : transaction.transaction_type === 'expense'
        ? -Math.abs(Number(transaction.amount || 0))
        : Number(transaction.amount || 0);

    const originalCurrency = transaction.currency || reportingCurrency;
    if (originalCurrency === reportingCurrency) {
      previews[transaction.id] = {
        transactionId: transaction.id,
        originalAmount,
        originalCurrency,
        reportingAmount: originalAmount,
        reportingCurrency,
        rateDate: null,
        provider: null,
        providerTimestamp: null,
        fetchedAt: null,
        freshness: 'fresh',
        stale: false,
        unavailableReason: null,
      };
      continue;
    }

    if (!latestSnapshot) {
      previews[transaction.id] = {
        transactionId: transaction.id,
        originalAmount,
        originalCurrency,
        reportingAmount: null,
        reportingCurrency,
        rateDate: null,
        provider: null,
        providerTimestamp: null,
        fetchedAt: null,
        freshness: 'unavailable',
        stale: true,
        unavailableReason: 'Exchange rates are unavailable',
      };
      continue;
    }

    try {
      const conversion = convertWithSnapshot({
        amount: originalAmount,
        fromCurrency: originalCurrency,
        toCurrency: reportingCurrency,
        snapshot: latestSnapshot,
        lookupMode: 'latest',
      });
      previews[transaction.id] = {
        transactionId: transaction.id,
        originalAmount,
        originalCurrency,
        reportingAmount: conversion.convertedAmount,
        reportingCurrency,
        rateDate: conversion.rateDate,
        provider: conversion.provider,
        providerTimestamp: conversion.providerTimestamp,
        fetchedAt: conversion.fetchedAt,
        freshness: conversion.freshness,
        stale: conversion.stale,
        unavailableReason: null,
      };
    } catch (error) {
      previews[transaction.id] = {
        transactionId: transaction.id,
        originalAmount,
        originalCurrency,
        reportingAmount: null,
        reportingCurrency,
        rateDate: latestSnapshot.rate_date,
        provider: latestSnapshot.provider,
        providerTimestamp: latestSnapshot.provider_timestamp,
        fetchedAt: latestSnapshot.fetched_at,
        freshness: getExchangeRateFreshness(latestSnapshot),
        stale: true,
        unavailableReason: error instanceof Error ? error.message : 'Exchange-rate conversion failed',
      };
    }
  }

  return {
    reportingCurrency,
    previews,
    snapshot: latestSnapshot,
  };
}

async function insertTransactionRecord(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  payload: CreateTransactionInput
): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data as Transaction;
}

export async function createTransactionsBatch(
  payloads: CreateTransactionInput[],
  options?: {
    onProgress?: (args: { completed: number; total: number }) => void;
  }
): Promise<CreateTransactionsBatchResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const created: Transaction[] = [];
  const failures: CreateTransactionsBatchFailure[] = [];
  const affectedAccountIds = new Set<string>();
  const total = payloads.length;

  for (let index = 0; index < payloads.length; index += 1) {
    const payload = payloads[index];
    try {
      const transaction = await insertTransactionRecord(supabase, user.id, payload);
      created.push(transaction);
      affectedAccountIds.add(payload.account_id);
    } catch (error) {
      failures.push({
        index,
        account_id: payload.account_id,
        message: error instanceof Error ? error.message : 'Failed to create transaction',
      });
    } finally {
      options?.onProgress?.({ completed: index + 1, total });
    }
  }

  await Promise.all(Array.from(affectedAccountIds).map((accountId) => recalculateAccountBalance(accountId)));

  return { created, failures };
}

export async function createTransaction(payload: CreateTransactionInput): Promise<Transaction> {
  const result = await createTransactionsBatch([payload]);
  if (result.failures.length > 0 || result.created.length === 0) {
    throw new Error(result.failures[0]?.message || 'Failed to create transaction');
  }
  return result.created[0];
}

export async function updateTransaction(id: string, payload: Partial<Transaction>): Promise<Transaction> {
  const supabase = createClient();
  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select('account_id')
    .eq('id', id)
    .single();
  if (existingError) throw existingError;

  const { data, error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  const affectedAccountIds = new Set<string>([
    existing.account_id,
    payload.account_id || existing.account_id,
  ]);
  await Promise.all(Array.from(affectedAccountIds).map((accountId) => recalculateAccountBalance(accountId)));
  return data;
}

export async function deleteTransaction(id: string, accountId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
  await recalculateAccountBalance(accountId);
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export async function getTransfers(): Promise<Transfer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('transfers')
    .select(`
      *,
      from_account:financial_accounts!transfers_from_account_id_fkey(name),
      to_account:financial_accounts!transfers_to_account_id_fkey(name)
    `)
    .order('transfer_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Transfer[];
}

export async function createTransfer(payload: {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  currency: string;
  source_amount?: number;
  source_currency?: string;
  destination_amount?: number;
  destination_currency?: string;
  exchange_rate?: number | null;
  exchange_rate_provider?: string | null;
  exchange_rate_snapshot_id?: string | null;
  exchange_rate_date?: string | null;
  exchange_rate_timestamp?: string | null;
  description?: string;
  transfer_date: string;
  notes?: string;
}): Promise<Transfer> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (payload.from_account_id === payload.to_account_id) {
    throw new Error('Source and destination accounts must be different');
  }

  const sourceAmount = Number(payload.source_amount ?? payload.amount);
  const sourceCurrency = payload.source_currency || payload.currency;
  const destinationAmount = Number(payload.destination_amount ?? payload.amount);
  const destinationCurrency = payload.destination_currency || payload.currency;

  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    throw new Error('Source transfer amount must be greater than 0');
  }
  if (!Number.isFinite(destinationAmount) || destinationAmount <= 0) {
    throw new Error('Destination transfer amount must be greater than 0');
  }

  let fromTxnId: string | null = null;
  let toTxnId: string | null = null;

  try {
    const { data: fromTxn, error: fromErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        account_id: payload.from_account_id,
        transaction_type: 'transfer',
        amount: sourceAmount,
        currency: sourceCurrency,
        description: payload.description || 'Transfer out',
        transaction_date: payload.transfer_date,
      })
      .select()
      .single();
    if (fromErr) throw fromErr;
    fromTxnId = fromTxn.id;

    const { data: toTxn, error: toErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user.id,
        account_id: payload.to_account_id,
        transaction_type: 'transfer',
        amount: destinationAmount,
        currency: destinationCurrency,
        description: payload.description || 'Transfer in',
        transaction_date: payload.transfer_date,
        transfer_pair_id: fromTxn.id,
      })
      .select()
      .single();
    if (toErr) throw toErr;
    toTxnId = toTxn.id;

    await supabase
      .from('transactions')
      .update({ transfer_pair_id: toTxn.id })
      .eq('id', fromTxn.id);

    const { data: transfer, error: transferErr } = await supabase
      .from('transfers')
      .insert({
        user_id: user.id,
        from_account_id: payload.from_account_id,
        to_account_id: payload.to_account_id,
        from_transaction_id: fromTxn.id,
        to_transaction_id: toTxn.id,
        amount: sourceAmount,
        currency: sourceCurrency,
        source_amount: sourceAmount,
        source_currency: sourceCurrency,
        destination_amount: destinationAmount,
        destination_currency: destinationCurrency,
        exchange_rate: payload.exchange_rate ?? null,
        exchange_rate_provider: payload.exchange_rate_provider ?? null,
        exchange_rate_snapshot_id: payload.exchange_rate_snapshot_id ?? null,
        exchange_rate_date: payload.exchange_rate_date ?? null,
        exchange_rate_timestamp: payload.exchange_rate_timestamp ?? null,
        description: payload.description || '',
        transfer_date: payload.transfer_date,
        notes: payload.notes || null,
      })
      .select()
      .single();
    if (transferErr) throw transferErr;

    await recalculateAccountBalance(payload.from_account_id);
    await recalculateAccountBalance(payload.to_account_id);

    return transfer;
  } catch (error) {
    if (toTxnId) {
      await supabase.from('transactions').delete().eq('id', toTxnId);
    }
    if (fromTxnId) {
      await supabase.from('transactions').delete().eq('id', fromTxnId);
    }
    throw error;
  }
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function getBudgets(periodStart?: string): Promise<Budget[]> {
  const supabase = createClient();
  const start = periodStart || new Date().toISOString().slice(0, 7) + '-01';
  const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0)
    .toISOString().slice(0, 10);
  const [ledgerSummaryByTransactionId, accountInclusionById, budgetsResult, expenseTransactionsResult] = await Promise.all([
    loadTransactionLedgerSummaryMap(supabase),
    loadAccountInclusionMap(supabase),
    supabase
      .from('budgets')
      .select(`*, category:categories(name, color, icon)`)
      .eq('is_active', true)
      .lte('period_start', end)
      .order('created_at', { ascending: true }),
    supabase
      .from('transactions')
      .select('id, account_id, category_id, amount, transaction_type, expense_owner, paid_by, paid_from, use_held_balance')
      .eq('transaction_type', 'expense')
      .gte('transaction_date', start)
      .lte('transaction_date', end),
  ]);

  if (budgetsResult.error) throw budgetsResult.error;
  if (expenseTransactionsResult.error) throw expenseTransactionsResult.error;

  const budgets = ((budgetsResult.data || []) as Budget[]).filter((budget) => isBudgetActiveForWindow(budget, start, end));
  const eligibleExpenses = filterTransactionsByRule(
    (expenseTransactionsResult.data || []) as TransactionMetricRow[],
    ledgerSummaryByTransactionId,
    accountInclusionById,
    shouldIncludeInBudgetSpending
  );
  const totalEligibleExpenseSpent = eligibleExpenses.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const eligibleExpenseSpentByCategory = new Map<string, number>();

  for (const transaction of eligibleExpenses) {
    if (!transaction.category_id) continue;
    eligibleExpenseSpentByCategory.set(
      transaction.category_id,
      (eligibleExpenseSpentByCategory.get(transaction.category_id) || 0) + Number(transaction.amount || 0)
    );
  }

  for (const budget of budgets) {
    budget.spent = budget.category_id
      ? eligibleExpenseSpentByCategory.get(budget.category_id) || 0
      : totalEligibleExpenseSpent;
  }

  return budgets;
}

export function getCurrentDashboardMonthKey(nowInput?: Date) {
  return getMonthContext(undefined, 'UTC', nowInput).monthKey;
}

export function getDashboardMonthContext(selectedMonth?: string, nowInput?: Date, timezone = 'UTC'): DashboardMonthContext {
  const context = getMonthContext(selectedMonth, timezone, nowInput);
  return {
    monthKey: context.monthKey,
    label: context.label,
    monthStart: context.startDate,
    monthEnd: context.endDate,
    isCurrentMonth: context.isCurrentMonth,
  };
}

export function shiftDashboardMonth(monthKey: string, offset: number) {
  return shiftMonthKey(monthKey, offset);
}

export async function createBudget(payload: Partial<Budget>): Promise<Budget> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('budgets')
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBudget(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('budgets').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// ─── Recurring Transactions ───────────────────────────────────────────────────

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('recurring_transactions')
    .select(`*, account:financial_accounts(name), category:categories(name, color)`)
    .order('next_due_date', { ascending: true });
  if (error) throw error;
  return (data || []) as RecurringTransaction[];
}

export async function createRecurringTransaction(payload: Partial<RecurringTransaction>): Promise<RecurringTransaction> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRecurringTransaction(id: string, payload: Partial<RecurringTransaction>): Promise<RecurringTransaction> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('recurring_transactions')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markRecurringAsPaid(recurring: RecurringTransaction): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create a real transaction
  const { error: txnErr } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: recurring.account_id,
      category_id: recurring.category_id,
      transaction_type: recurring.transaction_type,
      amount: recurring.amount,
      currency: recurring.currency,
      description: recurring.description,
      merchant: recurring.merchant,
      transaction_date: new Date().toISOString().slice(0, 10),
      is_recurring: true,
      recurring_id: recurring.id,
    });
  if (txnErr) throw txnErr;

  // Calculate next due date
  const nextDate = calculateNextDueDate(recurring.next_due_date, recurring.frequency);

  // Update recurring record
  const { error: updateErr } = await supabase
    .from('recurring_transactions')
    .update({
      last_run_date: new Date().toISOString().slice(0, 10),
      next_due_date: nextDate,
    })
    .eq('id', recurring.id);
  if (updateErr) throw updateErr;

  // Recalculate account balance
  await recalculateAccountBalance(recurring.account_id);
}

function calculateNextDueDate(currentDate: string, frequency: string): string {
  const date = new Date(currentDate);
  switch (frequency) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'biweekly': date.setDate(date.getDate() + 14); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'quarterly': date.setMonth(date.getMonth() + 3); break;
    case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
    default: date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardMetrics(args?: {
  startDate: string;
  endDate: string;
  mode: DashboardPeriodPreference;
}): Promise<DashboardMetrics> {
  const supabase = createClient();
  const { defaultCurrency, latestSnapshot } = await getLatestReportingContext(supabase);
  if (!args?.startDate || !args?.endDate) {
    throw new Error('Dashboard metrics require explicit period boundaries.');
  }
  const periodStart = args.startDate;
  const periodEnd = args.endDate;
  const includeBudgetTracking = args.mode === 'month';
  const [
    ledgerSummaryByTransactionId,
    accountInclusionById,
    accountsResult,
    incomeResult,
    expenseResult,
    budgetsResult,
    upcomingResult,
    managedMetrics,
    loanMetrics,
  ] = await Promise.all([
    loadTransactionLedgerSummaryMap(supabase),
    loadAccountInclusionMap(supabase),
    supabase
      .from('financial_accounts')
      .select('current_balance, include_in_total, currency')
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('id, account_id, transaction_type, amount, currency, expense_owner, paid_by, paid_from, use_held_balance')
      .eq('transaction_type', 'income')
      .gte('transaction_date', periodStart)
      .lte('transaction_date', periodEnd),
    supabase
      .from('transactions')
      .select('id, account_id, category_id, transaction_type, amount, currency, expense_owner, paid_by, paid_from, use_held_balance')
      .eq('transaction_type', 'expense')
      .gte('transaction_date', periodStart)
      .lte('transaction_date', periodEnd),
    includeBudgetTracking
      ? supabase
        .from('budgets')
        .select('id, category_id, amount, currency, period_start, period_end')
        .eq('is_active', true)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from('recurring_transactions')
      .select('amount, currency')
      .eq('is_active', true)
      .eq('transaction_type', 'expense')
      .gte('next_due_date', periodStart)
      .lte('next_due_date', periodEnd),
    getManagedMoneyMetrics(supabase, defaultCurrency),
    getLoanMetrics(supabase, periodStart, periodEnd, defaultCurrency),
  ]);

  if (accountsResult.error) throw accountsResult.error;
  if (incomeResult.error) throw incomeResult.error;
  if (expenseResult.error) throw expenseResult.error;
  if (budgetsResult.error) throw budgetsResult.error;
  if (upcomingResult.error) throw upcomingResult.error;

  const totalBalanceByCurrency = new Map<string, number>();
  for (const account of ((accountsResult.data || []) as BalanceRow[]).filter((row) => row.include_in_total)) {
    addCurrencyAmount(totalBalanceByCurrency, account.currency, Number(account.current_balance || 0), defaultCurrency);
  }

  const monthlyIncomeByCurrency = new Map<string, number>();
  for (const transaction of filterTransactionsByRule(
    (incomeResult.data || []) as TransactionMetricRow[],
    ledgerSummaryByTransactionId,
    accountInclusionById,
    isPersonalIncomeTransaction
  )) {
    addCurrencyAmount(monthlyIncomeByCurrency, transaction.currency, Number(transaction.amount || 0), defaultCurrency);
  }

  const monthlyExpensesByCurrency = new Map<string, number>();
  const eligibleMonthlyExpenses = filterTransactionsByRule(
    (expenseResult.data || []) as TransactionMetricRow[],
    ledgerSummaryByTransactionId,
    accountInclusionById,
    isPersonalExpenseTransaction
  );
  for (const transaction of eligibleMonthlyExpenses) {
    addCurrencyAmount(monthlyExpensesByCurrency, transaction.currency, Number(transaction.amount || 0), defaultCurrency);
  }

  const cashFlowTransactions = [
    ...((incomeResult.data || []) as TransactionMetricRow[]),
    ...((expenseResult.data || []) as TransactionMetricRow[]),
  ];
  const netCashFlowByCurrency = new Map<string, number>();
  for (const transaction of cashFlowTransactions) {
    if (!shouldIncludeInPersonalCashFlow(transaction, ledgerSummaryByTransactionId, accountInclusionById)) {
      continue;
    }
    const amount = Number(transaction.amount || 0);
    addCurrencyAmount(
      netCashFlowByCurrency,
      transaction.currency,
      transaction.transaction_type === 'income' ? amount : -amount,
      defaultCurrency
    );
  }

  const totalBudgetByCurrency = new Map<string, number>();
  const budgetSpentByCurrency = new Map<string, number>();
  const activeBudgetsForPeriod = ((budgetsResult.data || []) as BudgetMetricRow[])
    .filter((budget) => isBudgetActiveForWindow(budget, periodStart, periodEnd));
  const eligibleMonthlyExpensesByCategory = new Map<string, TransactionMetricRow[]>();

  for (const transaction of eligibleMonthlyExpenses) {
    if (!transaction.category_id) continue;
    const existing = eligibleMonthlyExpensesByCategory.get(transaction.category_id) || [];
    existing.push(transaction);
    eligibleMonthlyExpensesByCategory.set(transaction.category_id, existing);
  }

  for (const budget of activeBudgetsForPeriod) {
    addCurrencyAmount(totalBudgetByCurrency, budget.currency, Number(budget.amount || 0), defaultCurrency);
    const matchingExpenses = budget.category_id
      ? eligibleMonthlyExpensesByCategory.get(budget.category_id) || []
      : eligibleMonthlyExpenses;
    for (const transaction of matchingExpenses) {
      addCurrencyAmount(
        budgetSpentByCurrency,
        transaction.currency,
        Number(transaction.amount || 0),
        defaultCurrency
      );
    }
  }

  const upcomingPaymentsByCurrency = new Map<string, number>();
  for (const recurring of ((upcomingResult.data || []) as CurrencyAmountRow[])) {
    addCurrencyAmount(upcomingPaymentsByCurrency, recurring.currency, Number(recurring.amount || 0), defaultCurrency);
  }

  return {
    defaultCurrency,
    totalBalance: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(totalBalanceByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    monthlyIncome: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(monthlyIncomeByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    monthlyExpenses: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(monthlyExpensesByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    netCashFlow: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(netCashFlowByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    totalBudget: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(totalBudgetByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    budgetSpent: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(budgetSpentByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    activeBudgetCount: activeBudgetsForPeriod.length,
    upcomingPayments: buildDashboardConvertedMetric({
      originalTotals: mapCurrencyTotals(upcomingPaymentsByCurrency),
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    upcomingPaymentsCount: (upcomingResult.data || []).length,
    managedMoney: buildDashboardConvertedMetric({
      originalTotals: managedMetrics.managedMoneyByCurrency,
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    managedPeopleCount: managedMetrics.managedPeopleCount,
    outstandingLoanBalance: buildDashboardConvertedMetric({
      originalTotals: loanMetrics.outstandingLoanBalanceByCurrency,
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    loanBorrowedThisMonth: buildDashboardConvertedMetric({
      originalTotals: loanMetrics.loanBorrowedThisMonthByCurrency,
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    loanRepaidThisMonth: buildDashboardConvertedMetric({
      originalTotals: loanMetrics.loanRepaidThisMonthByCurrency,
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    budgetTrackingAvailable: includeBudgetTracking,
  };
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getReportDataWithContext(dateFrom: string, dateTo: string, accountId?: string) {
  const supabase = createClient();
  let query = supabase
    .from('transactions')
    .select(`
      *,
      account:financial_accounts(name, currency),
      category:categories(name, color)
    `)
    .gte('transaction_date', dateFrom)
    .lte('transaction_date', dateTo)
    .order('transaction_date', { ascending: false });

  if (accountId && accountId !== 'all') {
    query = query.eq('account_id', accountId);
  }

  const [ledgerSummaryByTransactionId, accountInclusionById, queryResult] = await Promise.all([
    loadTransactionLedgerSummaryMap(supabase),
    loadAccountInclusionMap(supabase),
    query,
  ]);

  if (queryResult.error) throw queryResult.error;
  const transactions = filterTransactionsByRule(
    (queryResult.data || []) as Transaction[],
    ledgerSummaryByTransactionId,
    accountInclusionById,
    shouldIncludeInPersonalReports
  );

  return {
    transactions,
    ledgerSummaryByTransactionId,
    accountInclusionById,
  };
}

export async function getReportData(dateFrom: string, dateTo: string, accountId?: string) {
  return (await getReportDataWithContext(dateFrom, dateTo, accountId)).transactions;
}

export async function buildHistoricalReportConvertedMetric(args: {
  transactions: Transaction[];
  getSignedAmount: (transaction: Transaction) => number;
  reportingCurrency?: string;
}) {
  const context = await getHistoricalReportContext(args.transactions, args.reportingCurrency);
  return buildHistoricalReportConvertedMetricFromSnapshots({
    transactions: args.transactions,
    getSignedAmount: args.getSignedAmount,
    reportingCurrency: context.reportingCurrency,
    snapshots: context.snapshots,
  });
}

export function generateCSV(transactions: Transaction[]): string {
  const headers = ['Date', 'Description', 'Merchant', 'Category', 'Account', 'Type', 'Amount Value', 'Currency Code', 'Formatted Amount', 'Tags', 'Notes'];
  const rows = transactions.map((t) => [
    t.transaction_date,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    `"${(t.merchant || '').replace(/"/g, '""')}"`,
    `"${(t.category?.name || '').replace(/"/g, '""')}"`,
    `"${(t.account?.name || '').replace(/"/g, '""')}"`,
    t.transaction_type,
    t.transaction_type === 'expense' ? `-${t.amount}` : `${t.amount}`,
    t.currency,
    `"${formatCurrencyText(
      t.transaction_type === 'expense' ? -Number(t.amount) : Number(t.amount),
      { currencyCode: t.currency }
    ).replace(/"/g, '""')}"`,
    `"${(t.tags || []).join(', ')}"`,
    `"${(t.notes || '').replace(/"/g, '""')}"`,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export async function getReportBudgets(dateFrom: string, dateTo: string): Promise<BudgetReportRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('budgets')
    .select('id, category_id, amount, currency, period_start, period_end, category:categories(name, color)')
    .eq('is_active', true)
    .lte('period_start', dateTo)
    .order('period_start', { ascending: true });

  if (error) throw error;

  return ((data || []) as BudgetReportRow[]).filter((budget) =>
    isBudgetActiveForWindow(budget, dateFrom, dateTo)
  );
}

// ─── Receipt Upload ───────────────────────────────────────────────────────────

export async function uploadReceipt(
  transactionId: string,
  file: File,
  userId: string
): Promise<ReceiptAttachment> {
  const supabase = createClient();
  const ext = file.name.split('.').pop();
  const path = `${userId}/${transactionId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('receipts')
    .upload(path, file, { upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);

  const { data, error } = await supabase
    .from('receipt_attachments')
    .insert({
      transaction_id: transactionId,
      user_id: userId,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_size: file.size,
      mime_type: file.type,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReceipt(attachmentId: string, filePath: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from('receipts').remove([filePath]);
  const { error } = await supabase.from('receipt_attachments').delete().eq('id', attachmentId);
  if (error) throw error;
}

// ─── Platform Settings ────────────────────────────────────────────────────────

export async function getPlatformSettings() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function savePlatformSettings(settings: Record<string, unknown>) {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from('platform_settings')
    .select('id')
    .single();

  if (existing) {
    const { error } = await supabase
      .from('platform_settings')
      .update(settings)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('platform_settings')
      .insert({ ...settings, singleton_lock: true });
    if (error) throw error;
  }
}
