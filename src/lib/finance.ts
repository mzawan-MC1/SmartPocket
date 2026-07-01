'use client';
import { createClient } from '@/lib/supabase/client';
import { formatCurrencyText } from '@/lib/currency-formatting';
import {
  getFinancialAccountScopeType,
  getFinancialAccountOwnershipType,
  sortFinancialAccounts,
  type FinancialAccountOwnershipType,
  type FinancialAccountScopeType,
  type FinancialAccountSystemDefaultType,
  type FinancialBankAccountType,
  type SpaceAccountPermissionLike,
} from '@/lib/financial-account-utils';
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
import type {
  AccountCurrencyChangePreview,
  AccountCurrencyHistoryItem,
  ApplyAccountCurrencyChangeInput,
  ApplyAccountCurrencyChangeResult,
} from '@/lib/financial-account-currency-change';
import { getMonthContext, shiftMonthKey } from '@/lib/financial-periods';
import {
  formatBudgetPeriodLabel,
  getBudgetPeriodTypeLabel,
  getCurrentBudgetPeriod,
  isBudgetApplicableToRange,
  getNextBudgetPeriod,
  getPreviousBudgetPeriod,
  normalizeBudgetPeriodValue,
  type ResolvedBudgetPeriod,
} from '@/lib/financial-periods/budgets';
import { deleteTransactionWithDocumentCleanup } from '@/lib/transaction-document-links';
import type {
  ExchangeRateFreshness,
  ExchangeRateLookupMode,
  ExchangeRateSnapshotRecord,
} from '@/lib/exchange-rates/types';
import type { DashboardPeriodPreference } from '@/lib/financial-periods';
import { loadUserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import type { BudgetPeriod } from '@/lib/financial-periods';

type CurrencyAmountRow = { amount: number | string; currency: string | null };
type AmountRow = { amount: number | string };
type BalanceRow = { current_balance: number | string; include_in_total: boolean; currency: string };
type Translate = (key: string, options?: Record<string, unknown>) => string;
const RECURRING_FREQUENCY_LABEL_KEYS = {
  daily: 'recurring.form.frequencies.daily',
  weekly: 'recurring.form.frequencies.weekly',
  biweekly: 'recurring.form.frequencies.biweekly',
  semimonthly: 'financialPeriods.budgetPeriods.semimonthly',
  monthly: 'recurring.form.frequencies.monthly',
  quarterly: 'recurring.form.frequencies.quarterly',
  yearly: 'recurring.form.frequencies.yearly',
  custom: 'financialPeriods.budgetPeriods.custom',
} as const;
const RECURRING_FREQUENCY_LABEL_FALLBACKS = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Custom',
} as const;
type TransactionMetricRow = {
  id: string;
  account_id: string;
  category_id?: string | null;
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: number | string;
  currency?: string | null;
  space_id?: string | null;
  transaction_context?: 'personal' | 'space' | null;
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
  name: string;
  amount: number | string;
  currency: string | null;
  budget_period: BudgetPeriod | null;
  period_anchor_date: string | null;
  custom_period_days: number | null;
  period_start: string;
  period_end: string | null;
  alert_at_percent?: number | string | null;
  category?: { name: string; color: string | null; icon?: string | null } | null;
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
  logical_account_id?: string | null;
  previous_account_id?: string | null;
  replaced_by_account_id?: string | null;
  archived_at?: string | null;
  archive_reason?: string | null;
  created_by_user_id?: string | null;
  name: string;
  account_type: 'bank' | 'credit_card' | 'cash' | 'savings' | 'digital_wallet' | 'investment' | 'other';
  ownership_type: FinancialAccountOwnershipType;
  scope_type?: FinancialAccountScopeType;
  space_id?: string | null;
  system_default_type: FinancialAccountSystemDefaultType | null;
  is_system_default: boolean;
  currency: string;
  opening_balance: number;
  current_balance: number;
  color: string | null;
  icon: string | null;
  notes: string | null;
  bank_name: string | null;
  account_holder_name: string | null;
  account_number_masked: string | null;
  iban: string | null;
  swift_bic: string | null;
  branch_name: string | null;
  bank_account_type: FinancialBankAccountType | null;
  is_active: boolean;
  include_in_total: boolean;
  sort_order: number;
  space?: {
    id?: string;
    name?: string | null;
    color?: string | null;
  } | null;
  space_account_permissions?: SpaceAccountPermission[];
  shared_with_spaces?: SpaceAccountPermission[];
  created_at: string;
  updated_at: string;
}

export interface SpaceAccountPermission extends SpaceAccountPermissionLike {
  id: string;
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
  space_id?: string | null;
  created_by_user_id?: string | null;
  paid_by_user_id?: string | null;
  paid_by_person_id?: string | null;
  transaction_context?: 'personal' | 'space';
  split_method?: SpaceTransactionSplitMethod;
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
  transaction_allocations?: TransactionAllocation[];
}

export type SpaceTransactionSplitMethod = 'none' | 'equal' | 'exact' | 'percentage' | 'shares';

export interface TransactionAllocation {
  id?: string;
  transaction_id?: string;
  space_id?: string;
  member_user_id?: string | null;
  managed_person_id?: string | null;
  allocated_amount?: number | null;
  percentage?: number | null;
  shares?: number | null;
  reimbursement_required?: boolean;
}

export interface SpaceTransactionInput {
  space_id: string;
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
  paid_by_user_id?: string | null;
  paid_by_person_id?: string | null;
  split_method: SpaceTransactionSplitMethod;
  allocations: TransactionAllocation[];
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
  space_id?: string | null;
  category_id: string | null;
  name: string;
  amount: number;
  period: 'monthly' | 'weekly' | 'yearly' | 'custom';
  period_start: string;
  period_end: string | null;
  budget_period: BudgetPeriod;
  period_anchor_date: string | null;
  custom_period_days: number | null;
  alert_at_percent: number;
  currency: string;
  is_active: boolean;
  // joined
  category?: { name: string; color: string | null; icon: string | null };
  spent?: number;
}

export type BudgetTrackingStatus =
  | 'on_track'
  | 'near_limit'
  | 'over_budget'
  | 'no_spending'
  | 'conversion_unavailable';

export interface BudgetTrackingItem {
  budget: Budget;
  period: ResolvedBudgetPeriod;
  periodTypeLabel: string;
  spentMetric: HistoricalReportConvertedMetric;
  spentAmount: number | null;
  remainingAmount: number | null;
  progressPct: number | null;
  status: BudgetTrackingStatus;
  statusLabel: string;
  transactionCount: number;
  warning: string | null;
}

export interface BudgetTrackingOverview {
  items: BudgetTrackingItem[];
  referenceDate: string;
  reportingCurrency: string;
  defaultBudgetPeriod: BudgetPeriod;
}

export interface BudgetDetailSnapshot extends BudgetTrackingItem {
  previousPeriod: ResolvedBudgetPeriod;
  nextPeriod: ResolvedBudgetPeriod;
  transactions: Transaction[];
}

export interface DashboardBudgetSummary {
  totalBudgetByCurrency: Array<{ currency: string; amount: number }>;
  spentByCurrency: Array<{ currency: string; amount: number }>;
  remainingByCurrency: Array<{ currency: string; amount: number }>;
  activeBudgetCount: number;
  activeBudgetCycleLabels: string[];
  activeBudgetCyclePeriods: BudgetPeriod[];
  hasMixedCycles: boolean;
  conversionUnavailableCount: number;
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
  frequency: 'daily' | 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';
  next_due_date: string;
  last_run_date: string | null;
  is_active: boolean;
  auto_create: boolean;
  tags: string[];
  space_id?: string | null;
  created_by_user_id?: string | null;
  paid_by_user_id?: string | null;
  paid_by_person_id?: string | null;
  split_method?: SpaceTransactionSplitMethod | null;
  allocation_template?: TransactionAllocation[] | null;
  execution_permissions?: 'owner_only' | 'owner_manager' | 'owner_manager_contributor' | null;
  created_at: string;
  // joined
  account?: { name: string };
  category?: { name: string; color: string | null };
}

export type FinanceScopeType = 'personal' | 'space';

export type TransferScopeType = 'personal' | 'space';
export type TransferPurpose =
  | 'normal_transfer'
  | 'member_contribution'
  | 'reimbursement_payout'
  | 'settlement';

export interface SpaceContribution {
  id: string;
  space_id: string;
  contributor_user_id?: string | null;
  contributor_managed_person_id?: string | null;
  source_account_id?: string | null;
  destination_account_id?: string | null;
  transfer_id?: string | null;
  manual_transaction_id?: string | null;
  amount: number;
  currency: string;
  contributed_at: string;
  notes?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transfer {
  id: string;
  user_id: string;
  created_by_user_id?: string | null;
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
  source_scope_type?: TransferScopeType | null;
  destination_scope_type?: TransferScopeType | null;
  source_space_id?: string | null;
  destination_space_id?: string | null;
  transfer_purpose?: TransferPurpose | null;
  reimbursement_id?: string | null;
  settlement_id?: string | null;
  created_at: string;
  // joined
  from_account?: { name: string };
  to_account?: { name: string };
}

export function getRecurringFrequencyLabelKey(frequency: RecurringTransaction['frequency'] | string) {
  return RECURRING_FREQUENCY_LABEL_KEYS[frequency as keyof typeof RECURRING_FREQUENCY_LABEL_KEYS] || null;
}

export function formatRecurringFrequencyLabel(
  frequency: RecurringTransaction['frequency'] | string,
  t?: Translate
) {
  const key = getRecurringFrequencyLabelKey(frequency);
  if (key) {
    const fallback = RECURRING_FREQUENCY_LABEL_FALLBACKS[frequency as keyof typeof RECURRING_FREQUENCY_LABEL_FALLBACKS];
    return t ? t(key, { ns: 'portal', defaultValue: fallback }) : fallback;
  }
  return t
    ? t('recurring.scheduleIncomplete', {
        ns: 'portal',
        defaultValue: 'Recurring schedule is incomplete',
      })
    : 'Recurring schedule is incomplete';
}

export function canAutoAdvanceRecurringTransaction(frequency: RecurringTransaction['frequency'] | string) {
  return frequency === 'daily' ||
    frequency === 'weekly' ||
    frequency === 'biweekly' ||
    frequency === 'monthly' ||
    frequency === 'quarterly' ||
    frequency === 'yearly';
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
  activeBudgetCycleLabels: string[];
  activeBudgetCyclePeriods: BudgetPeriod[];
  budgetConversionUnavailableCount: number;
  hasMixedBudgetCycles: boolean;
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

export interface ReportBudgetPerformanceChartRow {
  id: string;
  category: string;
  allocated: number;
  spent: number;
  color: string;
}

export interface ReportBudgetPerformanceItem extends BudgetTrackingItem {
  allocatedReportingAmount: number | null;
  spentReportingAmount: number | null;
  remainingReportingAmount: number | null;
  reportingCurrency: string;
  reportingUnavailableReason: string | null;
}

export interface ReportBudgetPerformanceData {
  items: ReportBudgetPerformanceItem[];
  chartRows: ReportBudgetPerformanceChartRow[];
  reportingCurrency: string;
  activeBudgetCycleLabels: string[];
  activeBudgetCyclePeriods: BudgetPeriod[];
  hasMixedCycles: boolean;
  unavailableReason: string | null;
  emptyReason: string | null;
}

export interface ReportViewData {
  transactions: Transaction[];
  accounts: FinancialAccount[];
  reportingCurrency: string;
  snapshots: ExchangeRateSnapshotRecord[];
  incomeTransactions: Transaction[];
  expenseTransactions: Transaction[];
  cashFlowTransactions: Transaction[];
  incomeMetric: HistoricalReportConvertedMetric;
  expensesMetric: HistoricalReportConvertedMetric;
  netMetric: HistoricalReportConvertedMetric;
  budgetPerformance: ReportBudgetPerformanceData;
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
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
): TransactionClassification {
  if (row.transaction_context === 'space' || row.space_id) {
    return 'other';
  }
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
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById) === 'loan_proceeds';
}

export function isLoanRepaymentTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById) === 'loan_repayment';
}

export function isManagedMoneyTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  const classification = classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById);
  return classification === 'managed_receipt' || classification === 'managed_expense' || classification === 'managed_return';
}

export function isPersonalIncomeTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById) === 'personal_income';
}

export function isPersonalExpenseTransaction(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById) === 'personal_expense';
}

export function shouldIncludeInPersonalCashFlow(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  if (row.transaction_context === 'space' || row.space_id) {
    return false;
  }
  const classification = classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById);
  return classification !== 'transfer' &&
    classification !== 'managed_receipt' &&
    classification !== 'managed_expense' &&
    classification !== 'managed_return';
}

export function shouldIncludeInPersonalReports(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  if (row.transaction_context === 'space' || row.space_id) {
    return false;
  }
  const classification = classifyTransaction(row, ledgerSummaryByTransactionId, accountInclusionById);
  return classification !== 'transfer' &&
    classification !== 'managed_receipt' &&
    classification !== 'managed_expense' &&
    classification !== 'managed_return';
}

export function shouldIncludeInBudgetSpending(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>
) {
  return isPersonalExpenseTransaction(row, ledgerSummaryByTransactionId, accountInclusionById);
}

export function isSpaceScopedTransaction(
  row: Pick<TransactionMetricRow, 'space_id' | 'transaction_context'>,
  spaceId?: string | null
) {
  const matchesScope = row.transaction_context === 'space' || !!row.space_id;
  if (!matchesScope) return false;
  if (!spaceId) return true;
  return row.space_id === spaceId;
}

export function shouldIncludeInSpaceReports(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  _ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  _accountInclusionById: Map<string, boolean>,
  spaceId?: string | null
) {
  return isSpaceScopedTransaction(row, spaceId) && row.transaction_type !== 'transfer';
}

export function shouldIncludeInSpaceCashFlow(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>,
  spaceId?: string | null
) {
  return shouldIncludeInSpaceReports(row, ledgerSummaryByTransactionId, accountInclusionById, spaceId);
}

export function shouldIncludeInSpaceBudgetSpending(
  row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
  _ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  _accountInclusionById: Map<string, boolean>,
  spaceId?: string | null
) {
  return isSpaceScopedTransaction(row, spaceId) && row.transaction_type === 'expense';
}

function filterTransactionsByRule<T extends Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>>(
  rows: T[],
  ledgerSummaryByTransactionId: Map<string, TransactionLedgerSummary>,
  accountInclusionById: Map<string, boolean>,
  predicate: (
    row: Pick<TransactionMetricRow, 'id' | 'account_id' | 'transaction_type' | 'space_id' | 'transaction_context' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>,
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

function formatHistoricalRateDateLabel(value: string, locale = 'en-GB') {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function dedupeSortedDates(values: Iterable<string>) {
  return Array.from(new Set(Array.from(values).filter(Boolean))).sort();
}

export function buildHistoricalRateUnavailableMessage(
  missingRateDates: Iterable<string>,
  options?: {
    locale?: string;
    t?: Translate;
  }
) {
  const dates = dedupeSortedDates(missingRateDates);
  const locale = options?.locale || 'en-GB';
  const t = options?.t;
  if (dates.length === 0) {
    if (t) {
      return t('reports.historicalRateUnavailableGeneric', { ns: 'portal' });
    }
    return 'Historical conversion is unavailable for one or more records before the first stored snapshot.';
  }
  if (dates.length === 1) {
    const date = formatHistoricalRateDateLabel(dates[0], locale);
    if (t) {
      return t('reports.historicalRateUnavailableSingle', {
        ns: 'portal',
        date,
      });
    }
    return `Historical rate unavailable for ${date}`;
  }
  const start = formatHistoricalRateDateLabel(dates[0], locale);
  const end = formatHistoricalRateDateLabel(dates[dates.length - 1], locale);
  if (t) {
    return t('reports.historicalRateUnavailableMultiple', {
      ns: 'portal',
      count: dates.length,
      start,
      end,
    });
  }
  return `Historical rates unavailable for ${dates.length} dates from ${start} to ${end}`;
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

async function parseFinancialAccountResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof body?.error === 'string' && body.error.trim()
        ? body.error
        : 'Financial account request failed'
    );
  }
  return body as Record<string, unknown>;
}

export async function getAccounts(options?: {
  activeOnly?: boolean;
}): Promise<FinancialAccount[]> {
  const searchParams = new URLSearchParams();
  if (options?.activeOnly) {
    searchParams.set('activeOnly', 'true');
  }

  const response = await fetch(`/api/financial-accounts${searchParams.size > 0 ? `?${searchParams.toString()}` : ''}`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
  });
  const body = await parseFinancialAccountResponse(response);
  return sortFinancialAccounts(((body.accounts as FinancialAccount[]) || []).map((account) => ({
    ...account,
    ownership_type: getFinancialAccountOwnershipType(account),
    scope_type: getFinancialAccountScopeType(account),
  })));
}

export async function getFinancialAccountsSummary(
  accountsInput?: FinancialAccount[],
  reportingContext?: LatestReportingContext
): Promise<AccountsSummaryMetrics> {
  const accounts = accountsInput || await getAccounts();
  const supabase = createClient();
  const { defaultCurrency, latestSnapshot } = reportingContext || await getLatestReportingContext(supabase);
  const activeAccounts = accounts.filter((account) => account.is_active);
  const personalAccounts = activeAccounts.filter((account) =>
    account.include_in_total && getFinancialAccountScopeType(account) === 'personal'
  );

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
  const response = await fetch('/api/financial-accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await parseFinancialAccountResponse(response);
  return body.account as FinancialAccount;
}

export async function updateAccount(id: string, payload: Partial<FinancialAccount>): Promise<FinancialAccount> {
  const response = await fetch(`/api/financial-accounts/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body = await parseFinancialAccountResponse(response);
  return body.account as FinancialAccount;
}

export async function previewAccountCurrencyChange(
  accountId: string,
  payload: {
    mode: 'correction' | 'conversion';
    targetCurrency: string;
  }
): Promise<AccountCurrencyChangePreview> {
  const response = await fetch(`/api/financial-accounts/${accountId}/currency-change`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      intent: 'preview',
      ...payload,
    }),
  });
  const body = await parseFinancialAccountResponse(response);
  return body.preview as AccountCurrencyChangePreview;
}

export async function applyAccountCurrencyChange(
  accountId: string,
  payload: ApplyAccountCurrencyChangeInput
): Promise<ApplyAccountCurrencyChangeResult> {
  const response = await fetch(`/api/financial-accounts/${accountId}/currency-change`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      intent: 'apply',
      ...payload,
    }),
  });
  const body = await parseFinancialAccountResponse(response);
  return body.result as ApplyAccountCurrencyChangeResult;
}

export async function getAccountCurrencyHistory(accountId: string): Promise<AccountCurrencyHistoryItem[]> {
  const response = await fetch(`/api/financial-accounts/${accountId}/currency-history`, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'include',
  });
  const body = await parseFinancialAccountResponse(response);
  return (body.items as AccountCurrencyHistoryItem[]) || [];
}

export async function archiveAccount(id: string): Promise<void> {
  const response = await fetch(`/api/financial-accounts/${id}/archive`, {
    method: 'POST',
    credentials: 'include',
  });
  await parseFinancialAccountResponse(response);
}

export async function setDefaultAccount(
  id: string,
  defaultType: FinancialAccountSystemDefaultType
): Promise<void> {
  const response = await fetch(`/api/financial-accounts/${id}/set-default`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ defaultType }),
  });
  await parseFinancialAccountResponse(response);
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
  spaceId?: string;
  context?: 'personal' | 'space';
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
      receipt_attachments(*),
      transaction_allocations(*)
    `)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.accountId) query = query.eq('account_id', filters.accountId);
  if (filters?.spaceId) query = query.eq('space_id', filters.spaceId);
  if (filters?.context) {
    query = query.eq('transaction_context', filters.context);
  }
  if (filters?.type && filters.type !== 'all') query = query.eq('transaction_type', filters.type);
  if (filters?.dateFrom) query = query.gte('transaction_date', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('transaction_date', filters.dateTo);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Transaction[];
}

export async function getTransactionById(id: string): Promise<Transaction> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      account:financial_accounts(name, currency),
      category:categories(name, color, icon),
      receipt_attachments(*),
      transaction_allocations(*)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Transaction;
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

function buildSpaceTransactionRpcArgs(
  payload: SpaceTransactionInput,
  transactionId: string | null
) {
  return {
    p_transaction_id: transactionId,
    p_space_id: payload.space_id,
    p_account_id: payload.account_id,
    p_category_id: payload.category_id || null,
    p_transaction_type: payload.transaction_type,
    p_amount: payload.amount,
    p_currency: payload.currency,
    p_description: payload.description,
    p_merchant: payload.merchant || null,
    p_notes: payload.notes || null,
    p_transaction_date: payload.transaction_date,
    p_tags: payload.tags || [],
    p_is_recurring: payload.is_recurring === true,
    p_recurring_id: payload.recurring_id || null,
    p_paid_by_user_id: payload.paid_by_user_id || null,
    p_paid_by_person_id: payload.paid_by_person_id || null,
    p_split_method: payload.split_method,
    p_allocations: payload.allocations || [],
  };
}

async function upsertSpaceTransaction(
  payload: SpaceTransactionInput,
  transactionId: string | null
): Promise<Transaction> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    'rpc_upsert_space_transaction',
    buildSpaceTransactionRpcArgs(payload, transactionId)
  );
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as { transaction_id?: string | null } | null;
  if (!row?.transaction_id) {
    throw new Error('Space transaction RPC did not return a transaction id');
  }

  return getTransactionById(row.transaction_id);
}

export async function createSpaceTransaction(payload: SpaceTransactionInput): Promise<Transaction> {
  return upsertSpaceTransaction(payload, null);
}

export async function updateSpaceTransaction(id: string, payload: SpaceTransactionInput): Promise<Transaction> {
  return upsertSpaceTransaction(payload, id);
}

export async function deleteSpaceTransaction(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc('rpc_delete_space_transaction', {
    p_transaction_id: id,
  });
  if (error) throw error;
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
    .select('account_id, transaction_context')
    .eq('id', id)
    .single();
  if (existingError) throw existingError;

  if (existing.transaction_context === 'space') {
    throw new Error('Use the Space transaction service to update Space-linked transactions');
  }

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
  const { data: existing, error: existingError } = await supabase
    .from('transactions')
    .select('transaction_context')
    .eq('id', id)
    .single();
  if (existingError) throw existingError;

  if (existing.transaction_context === 'space') {
    await deleteSpaceTransaction(id);
    return;
  }

  await deleteTransactionWithDocumentCleanup({
    supabase,
    transactionId: id,
  });
  await recalculateAccountBalance(accountId);
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export async function getTransfers(filters?: {
  spaceId?: string;
  purpose?: TransferPurpose | 'all';
  scopeType?: FinanceScopeType | 'all';
  limit?: number;
}): Promise<Transfer[]> {
  const supabase = createClient();
  let query = supabase
    .from('transfers')
    .select(`
      *,
      from_account:financial_accounts!transfers_from_account_id_fkey(name),
      to_account:financial_accounts!transfers_to_account_id_fkey(name)
    `)
    .order('transfer_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.spaceId) {
    query = query.or(`source_space_id.eq.${filters.spaceId},destination_space_id.eq.${filters.spaceId}`);
  }
  if (filters?.purpose && filters.purpose !== 'all') {
    query = query.eq('transfer_purpose', filters.purpose);
  }
  if (filters?.scopeType === 'personal') {
    query = query.is('source_space_id', null).is('destination_space_id', null);
  } else if (filters?.scopeType === 'space') {
    query = query.or('source_space_id.not.is.null,destination_space_id.not.is.null');
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Transfer[];
}

async function getTransferById(id: string): Promise<Transfer> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('transfers')
    .select(`
      *,
      from_account:financial_accounts!transfers_from_account_id_fkey(name),
      to_account:financial_accounts!transfers_to_account_id_fkey(name)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Transfer;
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
  transfer_purpose?: TransferPurpose;
  recipient_user_id?: string | null;
  reimbursement_id?: string | null;
  settlement_id?: string | null;
}): Promise<Transfer> {
  const supabase = createClient();
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

  const { data, error } = await supabase.rpc('rpc_create_scoped_transfer', {
    p_from_account_id: payload.from_account_id,
    p_to_account_id: payload.to_account_id,
    p_amount: payload.amount,
    p_currency: payload.currency,
    p_source_amount: sourceAmount,
    p_source_currency: sourceCurrency,
    p_destination_amount: destinationAmount,
    p_destination_currency: destinationCurrency,
    p_exchange_rate: payload.exchange_rate ?? null,
    p_exchange_rate_provider: payload.exchange_rate_provider ?? null,
    p_exchange_rate_snapshot_id: payload.exchange_rate_snapshot_id ?? null,
    p_exchange_rate_date: payload.exchange_rate_date ?? null,
    p_exchange_rate_timestamp: payload.exchange_rate_timestamp ?? null,
    p_description: payload.description || null,
    p_transfer_date: payload.transfer_date,
    p_notes: payload.notes || null,
    p_transfer_purpose: payload.transfer_purpose || 'normal_transfer',
    p_recipient_user_id: payload.recipient_user_id || null,
    p_reimbursement_id: payload.reimbursement_id || null,
    p_settlement_id: payload.settlement_id || null,
  });
  if (error) {
    throw error;
  }

  const row = (Array.isArray(data) ? data[0] : data) as { transfer_id?: string | null } | null;
  if (!row?.transfer_id) {
    throw new Error('Scoped transfer RPC did not return a transfer id');
  }

  return getTransferById(row.transfer_id);
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

type BudgetExpenseRow = TransactionMetricRow & {
  transaction_date: string;
  description?: string;
  merchant?: string | null;
  notes?: string | null;
  tags?: string[];
  category?: { name: string; color: string | null; icon?: string | null } | null;
  account?: { name: string; currency: string } | null;
};

function normalizeBudgetRecord(row: Budget): Budget {
  return {
    ...row,
    space_id: row.space_id || null,
    budget_period: normalizeBudgetPeriodValue(row),
    period_anchor_date: row.period_anchor_date || null,
    custom_period_days: row.custom_period_days ?? null,
  };
}

function getBudgetTrackingStatus(
  budgetAmount: number,
  spentAmount: number | null,
  warning: string | null
): { status: BudgetTrackingStatus; statusLabel: string; progressPct: number | null; remainingAmount: number | null } {
  if (warning || spentAmount === null) {
    const isConfigurationIssue = warning ? /settings|require|incomplete/i.test(warning) : false;
    return {
      status: 'conversion_unavailable',
      statusLabel: isConfigurationIssue ? 'budgets.configurationIncomplete' : 'budgets.conversionUnavailableTitle',
      progressPct: null,
      remainingAmount: null,
    };
  }

  const remainingAmount = budgetAmount - spentAmount;
  const progressPct = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
  if (spentAmount === 0) {
    return { status: 'no_spending', statusLabel: 'budgets.status.noSpending', progressPct, remainingAmount };
  }
  if (progressPct > 100) {
    return { status: 'over_budget', statusLabel: 'budgets.status.overBudget', progressPct, remainingAmount };
  }
  if (progressPct >= 80) {
    return { status: 'near_limit', statusLabel: 'budgets.status.nearLimit', progressPct, remainingAmount };
  }
  return { status: 'on_track', statusLabel: 'budgets.status.onTrack', progressPct, remainingAmount };
}

function getBudgetTransactionsForPeriod(
  budget: Budget,
  period: ResolvedBudgetPeriod,
  expenses: BudgetExpenseRow[]
) {
  return expenses.filter((transaction) => {
    if (transaction.transaction_date < period.startDate || transaction.transaction_date > period.endDate) {
      return false;
    }
    if (!budget.category_id) return true;
    return transaction.category_id === budget.category_id;
  });
}

function getIntersectedBudgetWindow(
  period: ResolvedBudgetPeriod,
  selectedRange: { startDate: string; endDate: string }
): ResolvedBudgetPeriod | null {
  const startDate = period.startDate > selectedRange.startDate ? period.startDate : selectedRange.startDate;
  const endDate = period.endDate < selectedRange.endDate ? period.endDate : selectedRange.endDate;
  if (startDate > endDate) {
    return null;
  }
  return {
    ...period,
    startDate,
    endDate,
    label: formatBudgetPeriodLabel({
      ...period,
      startDate,
      endDate,
    }),
  };
}

function buildEmptyReportBudgetPerformanceData(reportingCurrency: string): ReportBudgetPerformanceData {
  return {
    items: [],
    chartRows: [],
    reportingCurrency,
    activeBudgetCycleLabels: [],
    activeBudgetCyclePeriods: [],
    hasMixedCycles: false,
    unavailableReason: null,
    emptyReason: 'reports.noBudgetsApplyDescription',
  };
}

const REPORT_CATEGORY_FALLBACK_COLORS = [
  '#7c3aed',
  '#f97316',
  '#2563eb',
  '#d97706',
  '#8b5cf6',
  '#ec4899',
  '#dc2626',
  '#94a3b8',
];

async function buildReportBudgetPerformanceData(args: {
  startDate: string;
  endDate: string;
  expenseTransactions: Transaction[];
  reportingCurrency: string;
  snapshots: ExchangeRateSnapshotRecord[];
  scopeType?: FinanceScopeType;
  spaceId?: string | null;
  locale?: string;
}): Promise<ReportBudgetPerformanceData> {
  type ApplicableReportBudgetEntry = {
    budget: Budget;
    period: ResolvedBudgetPeriod | null;
    spendingWindow: ResolvedBudgetPeriod | null;
    warning: string | null;
  };

  const [periodContext, budgets] = await Promise.all([
    loadUserFinancialPeriodContext(),
    loadActiveBudgetRecords({
      scopeType: args.scopeType,
      spaceId: args.spaceId,
    }),
  ]);

  const selectedRange = {
    startDate: args.startDate,
    endDate: args.endDate,
  };

  const applicableBudgetEntries = budgets.map<ApplicableReportBudgetEntry | null>((budget) => {
    try {
      const storedPeriod = isBudgetApplicableToRange(
        budget,
        periodContext.effectiveConfig,
        selectedRange,
        args.locale
      );
      if (!storedPeriod) {
        return null;
      }
      return {
        budget,
        period: storedPeriod,
        spendingWindow: getIntersectedBudgetWindow(storedPeriod, selectedRange),
        warning: null,
      };
    } catch (error) {
      return {
        budget,
        period: null,
        spendingWindow: null,
        warning: error instanceof Error ? error.message : 'reports.invalidFinancialPeriodConfiguration',
      };
    }
  });
  const applicableEntries = applicableBudgetEntries.filter((entry): entry is ApplicableReportBudgetEntry => entry !== null);

  if (applicableEntries.length === 0) {
    return buildEmptyReportBudgetPerformanceData(args.reportingCurrency);
  }

  const items: ReportBudgetPerformanceItem[] = [];
  const chartRows: ReportBudgetPerformanceChartRow[] = [];
  const unavailableReasons = new Set<string>();

  for (const entry of applicableEntries) {
    const period = entry.period || {
      startDate: args.startDate,
      endDate: args.endDate,
      frequency: 'month',
      label: 'Unavailable',
      budgetPeriod: entry.budget.budget_period,
    } satisfies ResolvedBudgetPeriod;
    const budgetTransactions = entry.spendingWindow
      ? getBudgetTransactionsForPeriod(entry.budget, entry.spendingWindow, args.expenseTransactions as BudgetExpenseRow[])
      : [];
    const trackingItem = buildBudgetTrackingItem({
      budget: entry.budget,
      period,
      transactions: budgetTransactions as BudgetExpenseRow[],
      snapshots: args.snapshots,
    });
    const allocatedConversion = convertHistoricalAmountWithSnapshots({
      amount: Number(entry.budget.amount || 0),
      fromCurrency: entry.budget.currency || args.reportingCurrency,
      reportingCurrency: args.reportingCurrency,
      rateDate: period.startDate,
      snapshots: args.snapshots,
    });
    const spentReportingMetric = buildHistoricalReportConvertedMetricFromSnapshots({
      transactions: budgetTransactions as Transaction[],
      getSignedAmount: (transaction) => Number(transaction.amount || 0),
      reportingCurrency: args.reportingCurrency,
      snapshots: args.snapshots,
    });
    const spentReportingAmount = spentReportingMetric.reportingAmount;
    const allocatedReportingAmount = allocatedConversion.convertedAmount;
    const reportingUnavailableReason = allocatedReportingAmount === null
      ? allocatedConversion.unavailableReason || buildHistoricalRateUnavailableMessage(
        allocatedConversion.missingRateDate ? [allocatedConversion.missingRateDate] : []
      )
      : spentReportingAmount === null
        ? spentReportingMetric.unavailableReason
        : entry.warning;
    if (reportingUnavailableReason) {
      unavailableReasons.add(reportingUnavailableReason);
    }
    const remainingReportingAmount =
      allocatedReportingAmount !== null && spentReportingAmount !== null
        ? allocatedReportingAmount - spentReportingAmount
        : null;

    items.push({
      ...trackingItem,
      allocatedReportingAmount,
      spentReportingAmount,
      remainingReportingAmount,
      reportingCurrency: args.reportingCurrency,
      reportingUnavailableReason,
    });

    if (allocatedReportingAmount !== null && spentReportingAmount !== null) {
      chartRows.push({
        id: entry.budget.id,
        category: entry.budget.category?.name || entry.budget.name || 'Budget',
        allocated: allocatedReportingAmount,
        spent: spentReportingAmount,
        color: entry.budget.category?.color || REPORT_CATEGORY_FALLBACK_COLORS[chartRows.length % REPORT_CATEGORY_FALLBACK_COLORS.length],
      });
    }
  }

  const activeBudgetCyclePeriods = Array.from(new Set(items.map((item) => item.period.budgetPeriod)));
  const activeBudgetCycleLabels = Array.from(new Set(items.map((item) => item.periodTypeLabel)));

  return {
    items,
    chartRows,
    reportingCurrency: args.reportingCurrency,
    activeBudgetCycleLabels,
    activeBudgetCyclePeriods,
    hasMixedCycles: activeBudgetCyclePeriods.length > 1,
    unavailableReason: unavailableReasons.size > 0 ? Array.from(unavailableReasons)[0] : null,
    emptyReason: items.length === 0 ? 'reports.noBudgetsApplyDescription' : null,
  };
}

function buildBudgetTrackingItem(args: {
  budget: Budget;
  period: ResolvedBudgetPeriod;
  transactions: BudgetExpenseRow[];
  snapshots: ExchangeRateSnapshotRecord[];
}): BudgetTrackingItem {
  const spentMetric = buildHistoricalReportConvertedMetricFromSnapshots({
    transactions: args.transactions as Transaction[],
    getSignedAmount: (transaction) => Number(transaction.amount || 0),
    reportingCurrency: args.budget.currency,
    snapshots: args.snapshots,
  });
  const warning = spentMetric.conversionAvailable ? null : spentMetric.unavailableReason;
  const status = getBudgetTrackingStatus(Number(args.budget.amount || 0), spentMetric.reportingAmount, warning);

  return {
    budget: args.budget,
    period: args.period,
    periodTypeLabel: getBudgetPeriodTypeLabel(args.period.budgetPeriod),
    spentMetric,
    spentAmount: spentMetric.reportingAmount,
    remainingAmount: status.remainingAmount,
    progressPct: status.progressPct,
    status: status.status,
    statusLabel: status.statusLabel,
    transactionCount: args.transactions.length,
    warning,
  };
}

async function loadActiveBudgetRecords(args?: {
  scopeType?: FinanceScopeType;
  spaceId?: string | null;
}) {
  const supabase = createClient();
  let query = supabase
    .from('budgets')
    .select('*, category:categories(name, color, icon)')
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (args?.scopeType === 'space') {
    if (!args.spaceId) {
      return [] as Budget[];
    }
    query = query.eq('space_id', args.spaceId);
  } else {
    query = query.is('space_id', null);
  }

  const { data, error } = await query;

  if (error) throw error;
  return ((data || []) as Budget[]).map(normalizeBudgetRecord);
}

export async function getBudgetTrackingOverview(args?: {
  referenceDate?: string;
  periodFilter?: BudgetPeriod | 'all';
  scopeType?: FinanceScopeType;
  spaceId?: string | null;
  locale?: string;
}): Promise<BudgetTrackingOverview> {
  const supabase = createClient();
  const [periodContext, budgets] = await Promise.all([
    loadUserFinancialPeriodContext(),
    loadActiveBudgetRecords({
      scopeType: args?.scopeType,
      spaceId: args?.spaceId,
    }),
  ]);
  const referenceDate = args?.referenceDate || periodContext.currentBusinessDate;
  const filteredBudgets = (args?.periodFilter && args.periodFilter !== 'all')
    ? budgets.filter((budget) => budget.budget_period === args.periodFilter)
    : budgets;

  if (filteredBudgets.length === 0) {
    return {
      items: [],
      referenceDate,
      reportingCurrency: await resolveUserDefaultCurrency(),
      defaultBudgetPeriod: periodContext.effectiveConfig.defaultBudgetPeriod,
    };
  }

  const resolved = filteredBudgets.map((budget) => {
    try {
      return {
        budget,
        period: getCurrentBudgetPeriod(budget, periodContext.effectiveConfig, referenceDate, args?.locale),
        warning: null,
      };
    } catch (error) {
      return {
        budget,
        period: null,
        warning: error instanceof Error ? error.message : 'Budget period configuration is incomplete.',
      };
    }
  });

  const validPeriods = resolved.filter((entry): entry is { budget: Budget; period: ResolvedBudgetPeriod; warning: null } => !!entry.period);
  const earliestStart = validPeriods.map((entry) => entry.period.startDate).sort()[0];
  const latestEnd = validPeriods.map((entry) => entry.period.endDate).sort().at(-1);
  const [ledgerSummaryByTransactionId, accountInclusionById, expenseTransactionsResult, reportingContext] = await Promise.all([
    loadTransactionLedgerSummaryMap(supabase),
    loadAccountInclusionMap(supabase),
    earliestStart && latestEnd
      ? (() => {
          let query = supabase
            .from('transactions')
            .select('id, account_id, category_id, amount, currency, transaction_type, transaction_date, space_id, transaction_context, expense_owner, paid_by, paid_from, use_held_balance')
            .eq('transaction_type', 'expense')
            .gte('transaction_date', earliestStart)
            .lte('transaction_date', latestEnd);

          if (args?.scopeType === 'space' && args.spaceId) {
            query = query.eq('space_id', args.spaceId).eq('transaction_context', 'space');
          }

          return query;
        })()
      : Promise.resolve({ data: [], error: null }),
    getHistoricalReportContext(validPeriods.flatMap((entry) => [{ transaction_date: entry.period.endDate }])).catch(async () => ({
      reportingCurrency: await resolveUserDefaultCurrency(),
      snapshots: [],
    })),
  ]);

  if (expenseTransactionsResult.error) throw expenseTransactionsResult.error;

  const eligibleExpenses = filterTransactionsByRule(
    (expenseTransactionsResult.data || []) as BudgetExpenseRow[],
    ledgerSummaryByTransactionId,
    accountInclusionById,
    (row, ledgerMap, accountMap) => (
      args?.scopeType === 'space'
        ? shouldIncludeInSpaceBudgetSpending(row, ledgerMap, accountMap, args.spaceId)
        : shouldIncludeInBudgetSpending(row, ledgerMap, accountMap)
    )
  ) as BudgetExpenseRow[];

  const items = resolved.map((entry) => {
    if (!entry.period) {
      return {
        budget: entry.budget,
        period: {
          startDate: referenceDate,
          endDate: referenceDate,
          frequency: 'month',
          label: 'Unavailable',
          budgetPeriod: entry.budget.budget_period,
        } satisfies ResolvedBudgetPeriod,
        periodTypeLabel: getBudgetPeriodTypeLabel(entry.budget.budget_period),
        spentMetric: {
          originalTotals: [{ currency: entry.budget.currency, amount: 0 }],
          reportingCurrency: entry.budget.currency,
          reportingAmount: null,
          allOriginalInReportingCurrency: false,
          conversionAvailable: false,
          provider: null,
          freshestAppliedAt: null,
          earliestRateDate: null,
          latestRateDate: null,
          exactCount: 0,
          previousAvailableCount: 0,
          unavailableCount: 0,
          missingRateDates: [],
          freshness: 'unavailable',
          stale: true,
          unavailableReason: entry.warning,
        },
        spentAmount: null,
        remainingAmount: null,
        progressPct: null,
        status: 'conversion_unavailable' as const,
        statusLabel: 'budgets.configurationIncomplete',
        transactionCount: 0,
        warning: entry.warning,
      } satisfies BudgetTrackingItem;
    }

    return buildBudgetTrackingItem({
      budget: entry.budget,
      period: entry.period,
      transactions: getBudgetTransactionsForPeriod(entry.budget, entry.period, eligibleExpenses),
      snapshots: reportingContext.snapshots,
    });
  });

  return {
    items,
    referenceDate,
    reportingCurrency: reportingContext.reportingCurrency,
    defaultBudgetPeriod: periodContext.effectiveConfig.defaultBudgetPeriod,
  };
}

export async function getBudgetDetailSnapshot(args: {
  budgetId: string;
  referenceDate?: string;
  locale?: string;
}): Promise<BudgetDetailSnapshot> {
  const supabase = createClient();
  const [periodContext, budgetResult] = await Promise.all([
    loadUserFinancialPeriodContext(),
    supabase
      .from('budgets')
      .select('*, category:categories(name, color, icon)')
      .eq('id', args.budgetId)
      .single(),
  ]);

  if (budgetResult.error) throw budgetResult.error;
  const budget = normalizeBudgetRecord(budgetResult.data as Budget);
  const referenceDate = args.referenceDate || periodContext.currentBusinessDate;
  const period = getCurrentBudgetPeriod(budget, periodContext.effectiveConfig, referenceDate, args.locale);
  const previousPeriod = getPreviousBudgetPeriod(budget, periodContext.effectiveConfig, referenceDate, args.locale);
  const nextPeriod = getNextBudgetPeriod(budget, periodContext.effectiveConfig, referenceDate, args.locale);
  const budgetScopeType: FinanceScopeType = budget.space_id ? 'space' : 'personal';

  const [ledgerSummaryByTransactionId, accountInclusionById, transactionsResult, reportingContext] = await Promise.all([
    loadTransactionLedgerSummaryMap(supabase),
    loadAccountInclusionMap(supabase),
    (() => {
      let query = supabase
        .from('transactions')
        .select('*, account:financial_accounts(name, currency), category:categories(name, color, icon)')
        .eq('transaction_type', 'expense')
        .gte('transaction_date', period.startDate)
        .lte('transaction_date', period.endDate);

      if (budgetScopeType === 'space' && budget.space_id) {
        query = query.eq('space_id', budget.space_id).eq('transaction_context', 'space');
      } else {
        query = query.is('space_id', null);
      }

      return query.order('transaction_date', { ascending: false });
    })(),
    getHistoricalReportContext([{ transaction_date: period.endDate }], budget.currency),
  ]);

  if (transactionsResult.error) throw transactionsResult.error;
  const eligibleExpenses = filterTransactionsByRule(
    (transactionsResult.data || []) as BudgetExpenseRow[],
    ledgerSummaryByTransactionId,
    accountInclusionById,
    (row, ledgerMap, accountMap) => (
      budgetScopeType === 'space'
        ? shouldIncludeInSpaceBudgetSpending(row, ledgerMap, accountMap, budget.space_id)
        : shouldIncludeInBudgetSpending(row, ledgerMap, accountMap)
    )
  ) as BudgetExpenseRow[];

  const transactions = getBudgetTransactionsForPeriod(budget, period, eligibleExpenses);
  const item = buildBudgetTrackingItem({
    budget,
    period,
    transactions,
    snapshots: reportingContext.snapshots,
  });

  return {
    ...item,
    previousPeriod,
    nextPeriod,
    transactions: transactions as Transaction[],
  };
}

export async function getDashboardBudgetSummary(args: {
  startDate: string;
  endDate: string;
  mode: DashboardPeriodPreference;
  scopeType?: FinanceScopeType;
  spaceId?: string | null;
  locale?: string;
}): Promise<DashboardBudgetSummary> {
  type ApplicableDashboardBudget = {
    budget: Budget;
    period: ResolvedBudgetPeriod | null;
    spendingWindow: ResolvedBudgetPeriod | null;
    warning: string | null;
  };

  const supabase = createClient();
  const [periodContext, budgets] = await Promise.all([
    loadUserFinancialPeriodContext(),
    loadActiveBudgetRecords({
      scopeType: args.scopeType,
      spaceId: args.spaceId,
    }),
  ]);

  const selectedRange = {
    startDate: args.startDate,
    endDate: args.endDate,
  };

  const applicableBudgetEntries = budgets.map<ApplicableDashboardBudget | null>((budget) => {
    try {
      const storedPeriod = isBudgetApplicableToRange(
        budget,
        periodContext.effectiveConfig,
        selectedRange,
        args.locale
      );
      if (!storedPeriod) {
        return null;
      }
      return {
        budget,
        period: storedPeriod,
        spendingWindow: getIntersectedBudgetWindow(storedPeriod, selectedRange),
        warning: null,
      };
    } catch (error) {
      return {
        budget,
        period: null,
        spendingWindow: null,
        warning: error instanceof Error ? error.message : 'budgets.form.incompletePeriodConfig',
      };
    }
  });
  const applicableBudgets = applicableBudgetEntries.filter((entry): entry is ApplicableDashboardBudget => entry !== null);

  const visibleBudgets = args.mode === 'month'
    ? (() => {
        const monthlyBudgets = applicableBudgets.filter((entry) => entry.budget.budget_period === 'monthly');
        return monthlyBudgets.length > 0 ? monthlyBudgets : applicableBudgets;
      })()
    : applicableBudgets;

  if (visibleBudgets.length === 0) {
    return {
      totalBudgetByCurrency: [],
      spentByCurrency: [],
      remainingByCurrency: [],
      activeBudgetCount: 0,
      activeBudgetCycleLabels: [],
      activeBudgetCyclePeriods: [],
      hasMixedCycles: false,
      conversionUnavailableCount: 0,
    };
  }

  const [ledgerSummaryByTransactionId, accountInclusionById, expenseTransactionsResult, reportingContext] = await Promise.all([
    loadTransactionLedgerSummaryMap(supabase),
    loadAccountInclusionMap(supabase),
    (() => {
      let query = supabase
        .from('transactions')
        .select('id, account_id, category_id, amount, currency, transaction_type, transaction_date, space_id, transaction_context, expense_owner, paid_by, paid_from, use_held_balance')
        .eq('transaction_type', 'expense')
        .gte('transaction_date', selectedRange.startDate)
        .lte('transaction_date', selectedRange.endDate);

      if (args.scopeType === 'space' && args.spaceId) {
        query = query.eq('space_id', args.spaceId).eq('transaction_context', 'space');
      }

      return query;
    })(),
    getHistoricalReportContext([{ transaction_date: selectedRange.endDate }]).catch(async () => ({
      reportingCurrency: await resolveUserDefaultCurrency(),
      snapshots: [],
    })),
  ]);

  if (expenseTransactionsResult.error) throw expenseTransactionsResult.error;

  const eligibleExpenses = filterTransactionsByRule(
    (expenseTransactionsResult.data || []) as BudgetExpenseRow[],
    ledgerSummaryByTransactionId,
    accountInclusionById,
    (row, ledgerMap, accountMap) => (
      args.scopeType === 'space'
        ? shouldIncludeInSpaceBudgetSpending(row, ledgerMap, accountMap, args.spaceId)
        : shouldIncludeInBudgetSpending(row, ledgerMap, accountMap)
    )
  ) as BudgetExpenseRow[];

  const totalBudgetByCurrency = new Map<string, number>();
  const spentByCurrency = new Map<string, number>();
  const remainingByCurrency = new Map<string, number>();

  const summaryItems = visibleBudgets.map((entry) => {
    if (!entry.period || !entry.spendingWindow) {
      return {
        budget: entry.budget,
        periodTypeLabel: getBudgetPeriodTypeLabel(entry.budget.budget_period),
        spentAmount: null,
        remainingAmount: null,
        warning: entry.warning || 'budgets.form.incompletePeriodConfig',
      };
    }

    const item = buildBudgetTrackingItem({
      budget: entry.budget,
      period: entry.period,
      transactions: getBudgetTransactionsForPeriod(entry.budget, entry.spendingWindow, eligibleExpenses),
      snapshots: reportingContext.snapshots,
    });
    return item;
  });

  for (const item of summaryItems) {
    addCurrencyAmount(totalBudgetByCurrency, item.budget.currency, Number(item.budget.amount || 0), reportingContext.reportingCurrency);
    if (item.spentAmount !== null) {
      addCurrencyAmount(spentByCurrency, item.budget.currency, item.spentAmount, reportingContext.reportingCurrency);
    }
    if (item.remainingAmount !== null) {
      addCurrencyAmount(remainingByCurrency, item.budget.currency, item.remainingAmount, reportingContext.reportingCurrency);
    }
  }

  const cyclePeriods = Array.from(new Set(visibleBudgets.map((item) => item.budget.budget_period)));
  const cycleLabels = Array.from(new Set(summaryItems.map((item) => item.periodTypeLabel)));

  return {
    totalBudgetByCurrency: mapCurrencyTotals(totalBudgetByCurrency),
    spentByCurrency: mapCurrencyTotals(spentByCurrency),
    remainingByCurrency: mapCurrencyTotals(remainingByCurrency),
    activeBudgetCount: summaryItems.length,
    activeBudgetCycleLabels: cycleLabels,
    activeBudgetCyclePeriods: cyclePeriods,
    hasMixedCycles: cyclePeriods.length > 1,
    conversionUnavailableCount: summaryItems.filter((item) => item.remainingAmount === null).length,
  };
}

export async function getBudgets(
  periodStart?: string,
  options?: {
    scopeType?: FinanceScopeType;
    spaceId?: string | null;
  }
): Promise<Budget[]> {
  const overview = await getBudgetTrackingOverview({
    referenceDate: periodStart,
    scopeType: options?.scopeType,
    spaceId: options?.spaceId,
  });
  return overview.items.map((item) => ({
    ...item.budget,
    period_start: item.period.startDate,
    period_end: item.period.endDate,
    spent: item.spentAmount ?? 0,
  }));
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

export async function updateBudget(id: string, payload: Partial<Budget>): Promise<Budget> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('budgets')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return normalizeBudgetRecord(data as Budget);
}

export async function deleteBudget(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('budgets').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// ─── Recurring Transactions ───────────────────────────────────────────────────

export async function getRecurringTransactions(filters?: {
  activeOnly?: boolean;
  transactionType?: RecurringTransaction['transaction_type'];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<RecurringTransaction[]> {
  const supabase = createClient();
  let query = supabase
    .from('recurring_transactions')
    .select(`*, account:financial_accounts(name), category:categories(name, color)`)
    .order('next_due_date', { ascending: true });

  if (filters?.activeOnly) {
    query = query.eq('is_active', true);
  }
  if (filters?.transactionType) {
    query = query.eq('transaction_type', filters.transactionType);
  }
  if (filters?.dateFrom) {
    query = query.gte('next_due_date', filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte('next_due_date', filters.dateTo);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as RecurringTransaction[];
}

export async function getSpaceContributions(spaceId: string): Promise<SpaceContribution[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('space_contributions')
    .select('*')
    .eq('space_id', spaceId)
    .order('contributed_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as SpaceContribution[];
}

export async function createRecurringTransaction(payload: Partial<RecurringTransaction>): Promise<RecurringTransaction> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({
      ...payload,
      user_id: user.id,
      created_by_user_id: payload.created_by_user_id || user.id,
      allocation_template: payload.allocation_template || [],
    })
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
  const { currentBusinessDate } = await loadUserFinancialPeriodContext();

  if (recurring.space_id) {
    const { data, error } = await supabase.rpc('rpc_execute_space_recurring_transaction', {
      p_recurring_id: recurring.id,
    });
    if (error) throw error;

    const row = (Array.isArray(data) ? data[0] : data) as {
      transaction_id?: string | null;
      next_due_date?: string | null;
    } | null;
    if (!row?.transaction_id) {
      throw new Error('Space recurring execution RPC did not return a transaction id');
    }

    await recalculateAccountBalance(recurring.account_id);
    return;
  }

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
      transaction_date: currentBusinessDate,
      is_recurring: true,
      recurring_id: recurring.id,
    });
  if (txnErr) throw txnErr;

  // Calculate next due date
  const nextDate = calculateNextDueDate(recurring.next_due_date, recurring.frequency);
  if (!nextDate) {
    throw new Error('Unable to calculate next payment date for this recurring schedule.');
  }

  // Update recurring record
  const { error: updateErr } = await supabase
    .from('recurring_transactions')
    .update({
      last_run_date: currentBusinessDate,
      next_due_date: nextDate,
    })
    .eq('id', recurring.id);
  if (updateErr) throw updateErr;

  // Recalculate account balance
  await recalculateAccountBalance(recurring.account_id);
}

function calculateNextDueDate(currentDate: string, frequency: string): string | null {
  const date = new Date(`${currentDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const buildClampedDate = (nextYear: number, nextMonth: number, requestedDay: number) => {
    const daysInTargetMonth = new Date(Date.UTC(nextYear, nextMonth + 1, 0, 12, 0, 0)).getUTCDate();
    return new Date(Date.UTC(nextYear, nextMonth, Math.min(requestedDay, daysInTargetMonth), 12, 0, 0));
  };

  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + 1);
      break;
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + 7);
      break;
    case 'biweekly':
      date.setUTCDate(date.getUTCDate() + 14);
      break;
    case 'monthly': {
      const next = buildClampedDate(year, month + 1, day);
      return next.toISOString().slice(0, 10);
    }
    case 'quarterly': {
      const next = buildClampedDate(year, month + 3, day);
      return next.toISOString().slice(0, 10);
    }
    case 'yearly': {
      const next = buildClampedDate(year + 1, month, day);
      return next.toISOString().slice(0, 10);
    }
    case 'semimonthly':
    case 'custom':
      return null;
    default:
      return null;
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
  const [
    ledgerSummaryByTransactionId,
    accountInclusionById,
    accountsResult,
    incomeResult,
    expenseResult,
    dashboardBudgetSummary,
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
    getDashboardBudgetSummary({
      startDate: periodStart,
      endDate: periodEnd,
      mode: args.mode,
    }),
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
      originalTotals: dashboardBudgetSummary.totalBudgetByCurrency,
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    budgetSpent: buildDashboardConvertedMetric({
      originalTotals: dashboardBudgetSummary.spentByCurrency,
      reportingCurrency: defaultCurrency,
      latestSnapshot,
    }),
    activeBudgetCount: dashboardBudgetSummary.activeBudgetCount,
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
    budgetTrackingAvailable: true,
    activeBudgetCycleLabels: dashboardBudgetSummary.activeBudgetCycleLabels,
    activeBudgetCyclePeriods: dashboardBudgetSummary.activeBudgetCyclePeriods,
    budgetConversionUnavailableCount: dashboardBudgetSummary.conversionUnavailableCount,
    hasMixedBudgetCycles: dashboardBudgetSummary.hasMixedCycles,
  };
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getReportDataWithContext(
  dateFrom: string,
  dateTo: string,
  accountId?: string,
  options?: {
    scopeType?: FinanceScopeType;
    spaceId?: string | null;
  }
) {
  const supabase = createClient();
  const scopeType = options?.scopeType || 'personal';
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
  if (scopeType === 'space') {
    if (!options?.spaceId) {
      return {
        transactions: [] as Transaction[],
        ledgerSummaryByTransactionId: new Map<string, TransactionLedgerSummary>(),
        accountInclusionById: new Map<string, boolean>(),
      };
    }
    query = query.eq('space_id', options.spaceId).eq('transaction_context', 'space');
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
    (row, ledgerMap, accountMap) => (
      scopeType === 'space'
        ? shouldIncludeInSpaceReports(row, ledgerMap, accountMap, options?.spaceId)
        : shouldIncludeInPersonalReports(row, ledgerMap, accountMap)
    )
  );

  return {
    transactions,
    ledgerSummaryByTransactionId,
    accountInclusionById,
  };
}

export async function getReportData(
  dateFrom: string,
  dateTo: string,
  accountId?: string,
  options?: {
    scopeType?: FinanceScopeType;
    spaceId?: string | null;
  }
) {
  return (await getReportDataWithContext(dateFrom, dateTo, accountId, options)).transactions;
}

export async function getReportViewData(args: {
  startDate: string;
  endDate: string;
  accountId?: string;
  scopeType?: FinanceScopeType;
  spaceId?: string | null;
  locale?: string;
}): Promise<ReportViewData> {
  const scopeType = args.scopeType || 'personal';
  const [reportData, accounts] = await Promise.all([
    getReportDataWithContext(args.startDate, args.endDate, args.accountId, {
      scopeType,
      spaceId: args.spaceId,
    }),
    getAccounts(),
  ]);
  const transactions = reportData.transactions;
  const incomeTransactions = transactions.filter((transaction) =>
    scopeType === 'space'
      ? isSpaceScopedTransaction(transaction, args.spaceId) && transaction.transaction_type === 'income'
      : isPersonalIncomeTransaction(transaction, reportData.ledgerSummaryByTransactionId, reportData.accountInclusionById)
  );
  const expenseTransactions = transactions.filter((transaction) =>
    scopeType === 'space'
      ? isSpaceScopedTransaction(transaction, args.spaceId) && transaction.transaction_type === 'expense'
      : isPersonalExpenseTransaction(transaction, reportData.ledgerSummaryByTransactionId, reportData.accountInclusionById)
  );
  const cashFlowTransactions = transactions.filter((transaction) =>
    scopeType === 'space'
      ? shouldIncludeInSpaceCashFlow(transaction, reportData.ledgerSummaryByTransactionId, reportData.accountInclusionById, args.spaceId)
      : shouldIncludeInPersonalCashFlow(transaction, reportData.ledgerSummaryByTransactionId, reportData.accountInclusionById)
  );
  const reportContext = await getHistoricalReportContext(transactions);
  const [incomeMetric, expensesMetric, netMetric, budgetPerformance] = await Promise.all([
    Promise.resolve(buildHistoricalReportConvertedMetricFromSnapshots({
      transactions: incomeTransactions,
      getSignedAmount: (transaction) => Number(transaction.amount || 0),
      reportingCurrency: reportContext.reportingCurrency,
      snapshots: reportContext.snapshots,
    })),
    Promise.resolve(buildHistoricalReportConvertedMetricFromSnapshots({
      transactions: expenseTransactions,
      getSignedAmount: (transaction) => Number(transaction.amount || 0),
      reportingCurrency: reportContext.reportingCurrency,
      snapshots: reportContext.snapshots,
    })),
    Promise.resolve(buildHistoricalReportConvertedMetricFromSnapshots({
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
    })),
    buildReportBudgetPerformanceData({
      startDate: args.startDate,
      endDate: args.endDate,
      expenseTransactions,
      reportingCurrency: reportContext.reportingCurrency,
      snapshots: reportContext.snapshots,
      scopeType,
      spaceId: args.spaceId,
      locale: args.locale,
    }),
  ]);

  return {
    transactions,
    accounts: accounts.filter((account) =>
      account.is_active
      && (
        scopeType === 'space'
          ? getFinancialAccountScopeType(account) === 'space' && account.space_id === args.spaceId
          : getFinancialAccountScopeType(account) === 'personal'
      )
    ),
    reportingCurrency: reportContext.reportingCurrency,
    snapshots: reportContext.snapshots,
    incomeTransactions,
    expenseTransactions,
    cashFlowTransactions,
    incomeMetric,
    expensesMetric,
    netMetric,
    budgetPerformance,
  };
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

  const { data, error } = await supabase
    .from('receipt_attachments')
    .insert({
      transaction_id: transactionId,
      user_id: userId,
      file_name: file.name,
      // Store the private storage path instead of a public URL.
      file_url: path,
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
