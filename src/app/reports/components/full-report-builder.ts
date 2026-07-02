'use client';

import { formatCurrencyText } from '@/lib/currency-formatting';
import {
  buildHistoricalReportConvertedMetricFromSnapshots,
  convertHistoricalAmountWithSnapshots,
  formatRecurringFrequencyLabel,
  type DashboardMetrics,
  type FinancialAccount,
  type RecurringTransaction,
  type ReportViewData,
  type Transaction,
  type Transfer,
} from '@/lib/finance';
import {
  getFinancialAccountOwnershipType,
  getFinancialAccountScopeType,
} from '@/lib/financial-account-utils';
import { formatReportPeriodLabel, type ReportPeriodRange } from '@/lib/financial-periods/reports';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import {
  getAnnualCostEstimate,
  getMonthlyCostEstimate,
  type PersonalSubscription,
} from '@/lib/personal-subscriptions-shared';
import type {
  ManagedPerson,
  PersonLoanReportItem,
  Reimbursement,
  Settlement,
} from '@/lib/people';
import type { ItemInsightsSnapshot } from '@/lib/transaction-item-insights';
import type { ReportTransactionRow } from './ReportTransactionTable';
import type {
  FullFinancialReportData,
  FullReportChartState,
  FullReportMetricCard,
  FullReportSummaryTable,
} from './FullFinancialReport';
import type { PrintableReportIdentity, ReportMetadataItem } from './full-report-types';

export type FullReportCurrencyMode = 'reporting' | 'both';

export interface FullReportFilters {
  categoryId: string;
  personId: string;
  transactionType: 'all' | 'income' | 'expense';
  currencyMode: FullReportCurrencyMode;
  includeArchivedAccounts: boolean;
}

export interface FullReportSupplementalData {
  dashboardMetrics: DashboardMetrics | null;
  previousReportData: ReportViewData | null;
  allAccounts: FinancialAccount[];
  people: ManagedPerson[];
  reimbursements: Reimbursement[];
  settlements: Settlement[];
  subscriptions: PersonalSubscription[];
  recurringItems: RecurringTransaction[];
  loanItems: PersonLoanReportItem[];
  transfers: Transfer[];
  itemInsightsSnapshot: ItemInsightsSnapshot | null;
}

function toDateLabel(value: string | null | undefined, locale: string) {
  if (!value) return '-';
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date);
}

function toDateTimeLabel(value: Date | string, locale: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatMoney(amount: number, currency: string) {
  return formatCurrencyText(amount, {
    currencyCode: currency,
    displayMode: 'code',
  });
}

function formatOriginalTotals(rows: Array<{ currency: string; amount: number }>) {
  return rows.map((row) => formatMoney(row.amount, row.currency)).join(' | ');
}

function formatConvertedMetric(metric: {
  reportingAmount: number | null;
  reportingCurrency: string;
  originalTotals: Array<{ currency: string; amount: number }>;
}) {
  if (metric.reportingAmount === null) {
    return formatOriginalTotals(metric.originalTotals);
  }
  return formatMoney(metric.reportingAmount, metric.reportingCurrency);
}

function buildTable(headers: string[], rows: string[][], emptyMessage: string): FullReportSummaryTable {
  return { headers, rows, emptyMessage };
}

function localizeAccountType(
  accountType: FinancialAccount['account_type'],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`reports.fullReport.accounts.types.${accountType}`, {
    defaultValue: accountType.replace(/_/g, ' '),
  });
}

function localizeSubscriptionFrequency(
  subscription: Pick<PersonalSubscription, 'billing_frequency'>,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`personalSubscriptions.frequencies.${subscription.billing_frequency}`, {
    ns: 'portal',
    defaultValue: subscription.billing_frequency.replace(/_/g, ' '),
  });
}

function localizeSubscriptionStatus(
  subscription: Pick<PersonalSubscription, 'status'>,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`personalSubscriptions.statuses.${subscription.status}`, {
    ns: 'portal',
    defaultValue: subscription.status.replace(/_/g, ' '),
  });
}

function localizeCategoryName(
  transaction: Pick<Transaction, 'category'>,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return transaction.category?.name
    ? translateSystemCategoryName(transaction.category.name, (key, options) =>
        t(key, { ...(options || {}), ns: 'common' })
      )
    : t('transactions.uncategorized');
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]) {
  return values.length > 0 ? sum(values) / values.length : 0;
}

function buildTransactionRows(args: {
  transactions: Transaction[];
  peopleById: Map<string, ManagedPerson>;
  reportingCurrency: string;
  snapshots: ReportViewData['snapshots'];
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}): ReportTransactionRow[] {
  return args.transactions.map((transaction) => {
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
    const person = transaction.paid_by_person_id
      ? args.peopleById.get(transaction.paid_by_person_id)?.full_name || null
      : null;

    let statusLabel = args.t('reports.fullReport.transactions.status.recorded', { defaultValue: 'Recorded' });
    if (transaction.is_recurring) {
      statusLabel = args.t('reports.fullReport.transactions.status.recurring', { defaultValue: 'Recurring' });
    } else if (transaction.paid_by_person_id) {
      statusLabel = args.t('reports.fullReport.transactions.status.personLinked', { defaultValue: 'Linked to person' });
    }

    return {
      id: transaction.id,
      date: toDateLabel(transaction.transaction_date, args.locale),
      description: transaction.description || args.t('reports.accountStatement.entryFallback'),
      merchant: transaction.merchant || null,
      typeLabel: args.t(`transactions.types.${transaction.transaction_type}`),
      category: localizeCategoryName(transaction, args.t),
      account: transaction.account?.name || null,
      person,
      originalAmount: signedAmount,
      originalCurrency: transaction.currency || args.reportingCurrency,
      reportingAmount: conversion.convertedAmount,
      reportingCurrency: args.reportingCurrency,
      statusLabel,
      hasNotes: Boolean(transaction.notes?.trim()),
      hasReceipt: Boolean(transaction.receipt_attachments && transaction.receipt_attachments.length > 0),
    };
  });
}

function buildAccountTransferMap(
  transfers: Transfer[],
  startDate: string,
  endDate: string
) {
  const map = new Map<string, { in: number; out: number }>();
  for (const transfer of transfers) {
    if (transfer.transfer_date < startDate || transfer.transfer_date > endDate) continue;
    const sourceAmount = Number(transfer.source_amount ?? transfer.amount ?? 0);
    const destinationAmount = Number(transfer.destination_amount ?? transfer.amount ?? 0);
    const source = map.get(transfer.from_account_id) || { in: 0, out: 0 };
    source.out += sourceAmount;
    map.set(transfer.from_account_id, source);
    const destination = map.get(transfer.to_account_id) || { in: 0, out: 0 };
    destination.in += destinationAmount;
    map.set(transfer.to_account_id, destination);
  }
  return map;
}

function buildGroupTable(
  rows: Array<{ label: string; value: number; count?: number; comparison?: number | null; helper?: string | null }>,
  currency: string,
  headers: string[],
  emptyMessage: string
) {
  return buildTable(
    headers,
    rows.map((row) => [
      row.label,
      formatMoney(row.value, currency),
      row.count !== undefined ? String(row.count) : '-',
      row.comparison === null || row.comparison === undefined ? '-' : `${row.comparison > 0 ? '+' : ''}${row.comparison.toFixed(1)}%`,
      row.helper || '-',
    ]),
    emptyMessage
  );
}

function groupTransactionsByKey(
  transactions: Transaction[],
  keyBuilder: (transaction: Transaction) => string,
  labelBuilder: (transaction: Transaction) => string,
  reportingCurrency: string,
  snapshots: ReportViewData['snapshots']
) {
  const grouped = new Map<string, { label: string; value: number; count: number; largest: number }>();
  for (const transaction of transactions) {
    const conversion = convertHistoricalAmountWithSnapshots({
      amount: Math.abs(Number(transaction.amount || 0)),
      fromCurrency: transaction.currency || reportingCurrency,
      reportingCurrency,
      rateDate: transaction.transaction_date,
      snapshots,
    });
    if (conversion.convertedAmount === null) continue;
    const key = keyBuilder(transaction);
    const current = grouped.get(key) || {
      label: labelBuilder(transaction),
      value: 0,
      count: 0,
      largest: 0,
    };
    current.value += conversion.convertedAmount;
    current.count += 1;
    current.largest = Math.max(current.largest, conversion.convertedAmount);
    grouped.set(key, current);
  }
  return Array.from(grouped.values()).sort((left, right) => right.value - left.value);
}

function buildCommitmentTable(
  rows: Array<{ label: string; dueDate: string; amount: string; type: string; account: string }>,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return buildTable(
    [
      t('reports.fullReport.commitments.columns.name', { defaultValue: 'Name' }),
      t('reports.fullReport.commitments.columns.due', { defaultValue: 'Due' }),
      t('reports.amount', { defaultValue: 'Amount' }),
      t('reports.fullReport.transactions.columns.type', { defaultValue: 'Type' }),
      t('reports.fullReport.transactions.columns.account', { defaultValue: 'Account' }),
    ],
    rows.map((row) => [row.label, row.dueDate, row.amount, row.type, row.account]),
    t('reports.fullReport.commitments.empty', { defaultValue: 'No items in this group.' })
  );
}

function differenceInPercent(current: number, previous: number) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function buildFullFinancialReportData(args: {
  title: string;
  identity: PrintableReportIdentity;
  generatedAtLabel: string;
  metadata: ReportMetadataItem[];
  reportData: ReportViewData;
  activeRange: ReportPeriodRange;
  scopeType: 'personal' | 'space';
  locale: string;
  todayIso: string;
  t: (key: string, options?: Record<string, unknown>) => string;
  filters: FullReportFilters;
  supplemental: FullReportSupplementalData;
  includeCharts: boolean;
  includeTransactionDetails: boolean;
  incomeExpenseChartState: FullReportChartState<{ month: string; income: number; expenses: number; net: number }>;
  spendingCategoryChartState: FullReportChartState<{ id: string; category: string; amount: number; color: string }>;
}) {
  const peopleById = new Map(args.supplemental.people.map((person) => [person.id, person] as const));
  const filteredTransactions = args.reportData.transactions.filter((transaction) => {
    if (args.filters.categoryId !== 'all' && transaction.category_id !== args.filters.categoryId) return false;
    if (args.filters.personId !== 'all' && transaction.paid_by_person_id !== args.filters.personId) return false;
    if (args.filters.transactionType !== 'all' && transaction.transaction_type !== args.filters.transactionType) return false;
    return true;
  });

  const incomeTransactions = filteredTransactions.filter((transaction) => transaction.transaction_type === 'income');
  const expenseTransactions = filteredTransactions.filter((transaction) => transaction.transaction_type === 'expense');
  const cashFlowTransactions = filteredTransactions.filter((transaction) =>
    transaction.transaction_type === 'income' || transaction.transaction_type === 'expense'
  );

  const incomeMetric = buildHistoricalReportConvertedMetricFromSnapshots({
    transactions: incomeTransactions,
    getSignedAmount: (transaction) => Number(transaction.amount || 0),
    reportingCurrency: args.reportData.reportingCurrency,
    snapshots: args.reportData.snapshots,
  });
  const expensesMetric = buildHistoricalReportConvertedMetricFromSnapshots({
    transactions: expenseTransactions,
    getSignedAmount: (transaction) => Number(transaction.amount || 0),
    reportingCurrency: args.reportData.reportingCurrency,
    snapshots: args.reportData.snapshots,
  });
  const netMetric = buildHistoricalReportConvertedMetricFromSnapshots({
    transactions: cashFlowTransactions,
    getSignedAmount: (transaction) => transaction.transaction_type === 'expense'
      ? -Math.abs(Number(transaction.amount || 0))
      : Number(transaction.amount || 0),
    reportingCurrency: args.reportData.reportingCurrency,
    snapshots: args.reportData.snapshots,
  });

  const previousIncomeMetric = args.supplemental.previousReportData
    ? buildHistoricalReportConvertedMetricFromSnapshots({
        transactions: args.supplemental.previousReportData.incomeTransactions,
        getSignedAmount: (transaction) => Number(transaction.amount || 0),
        reportingCurrency: args.supplemental.previousReportData.reportingCurrency,
        snapshots: args.supplemental.previousReportData.snapshots,
      })
    : null;
  const previousExpensesMetric = args.supplemental.previousReportData
    ? buildHistoricalReportConvertedMetricFromSnapshots({
        transactions: args.supplemental.previousReportData.expenseTransactions,
        getSignedAmount: (transaction) => Number(transaction.amount || 0),
        reportingCurrency: args.supplemental.previousReportData.reportingCurrency,
        snapshots: args.supplemental.previousReportData.snapshots,
      })
    : null;

  const incomeSources = groupTransactionsByKey(
    incomeTransactions,
    (transaction) => (transaction.merchant || transaction.description || transaction.account?.name || args.t('reports.accountStatement.entryFallback')).toLowerCase(),
    (transaction) => transaction.merchant || transaction.description || transaction.account?.name || args.t('reports.accountStatement.entryFallback'),
    args.reportData.reportingCurrency,
    args.reportData.snapshots
  ).slice(0, 8);

  const expenseCategories = groupTransactionsByKey(
    expenseTransactions,
    (transaction) => localizeCategoryName(transaction, args.t).toLowerCase(),
    (transaction) => localizeCategoryName(transaction, args.t),
    args.reportData.reportingCurrency,
    args.reportData.snapshots
  ).slice(0, 8);

  const previousExpenseCategories = groupTransactionsByKey(
    args.supplemental.previousReportData?.expenseTransactions || [],
    (transaction) => localizeCategoryName(transaction, args.t).toLowerCase(),
    (transaction) => localizeCategoryName(transaction, args.t),
    args.reportData.reportingCurrency,
    args.supplemental.previousReportData?.snapshots || []
  );
  const previousExpenseCategoryMap = new Map(previousExpenseCategories.map((row) => [row.label, row.value] as const));

  const accountTransferMap = buildAccountTransferMap(
    args.supplemental.transfers,
    args.activeRange.startDate,
    args.activeRange.endDate
  );
  const visibleAccounts = args.supplemental.allAccounts.filter((account) => {
    if (!args.filters.includeArchivedAccounts && !account.is_active) return false;
    return true;
  });
  const accountIdsInRange = new Set(filteredTransactions.map((transaction) => transaction.account_id));
  const accountsInScope = visibleAccounts.filter((account) => accountIdsInRange.has(account.id) || args.filters.includeArchivedAccounts);

  const buildAccountRows = (accounts: FinancialAccount[]) => buildTable(
    [
      args.t('reports.fullReport.accounts.columns.name', { defaultValue: 'Account' }),
      args.t('reports.fullReport.accounts.columns.type', { defaultValue: 'Type' }),
      args.t('reports.fullReport.accounts.columns.scope', { defaultValue: 'Scope' }),
      args.t('reports.fullReport.accounts.columns.currency', { defaultValue: 'Currency' }),
      args.t('reports.fullReport.accounts.columns.opening', { defaultValue: 'Opening balance' }),
      args.t('reports.fullReport.accounts.columns.inflow', { defaultValue: 'Inflow' }),
      args.t('reports.fullReport.accounts.columns.outflow', { defaultValue: 'Outflow' }),
      args.t('reports.fullReport.accounts.columns.transfersIn', { defaultValue: 'Transfers in' }),
      args.t('reports.fullReport.accounts.columns.transfersOut', { defaultValue: 'Transfers out' }),
      args.t('reports.fullReport.accounts.columns.current', { defaultValue: 'Closing / current' }),
      args.t('reports.fullReport.accounts.columns.reportingEquivalent', { defaultValue: 'Reporting equivalent' }),
      args.t('reports.fullReport.accounts.columns.personalTotal', { defaultValue: 'Included in personal total' }),
      args.t('reports.fullReport.accounts.columns.status', { defaultValue: 'Status' }),
    ],
    accounts.map((account) => {
      const accountTransactions = filteredTransactions.filter((transaction) => transaction.account_id === account.id);
      const inflow = sum(accountTransactions.filter((transaction) => transaction.transaction_type === 'income').map((transaction) => Number(transaction.amount || 0)));
      const outflow = sum(accountTransactions.filter((transaction) => transaction.transaction_type === 'expense').map((transaction) => Number(transaction.amount || 0)));
      const transfers = accountTransferMap.get(account.id) || { in: 0, out: 0 };
      const conversion = convertHistoricalAmountWithSnapshots({
        amount: Number(account.current_balance || 0),
        fromCurrency: account.currency,
        reportingCurrency: args.reportData.reportingCurrency,
        rateDate: args.activeRange.endDate,
        snapshots: args.reportData.snapshots,
      });
      const ownership = getFinancialAccountOwnershipType(account);
      const scope = getFinancialAccountScopeType(account);
      const status = [
        account.is_active ? args.t('reports.fullReport.shared.active', { defaultValue: 'Active' }) : args.t('reports.fullReport.shared.archived', { defaultValue: 'Archived' }),
        account.logical_account_id && account.replaced_by_account_id
          ? args.t('reports.fullReport.shared.versioned', { defaultValue: 'Versioned' })
          : null,
      ].filter(Boolean).join(' | ');

      return [
        account.name,
        localizeAccountType(account.account_type, args.t),
        scope === 'space'
          ? `${args.t('reports.spaceScope', { defaultValue: 'Space' })}${account.space?.name ? ` - ${account.space.name}` : ''}`
          : ownership === 'shared'
            ? args.t('reports.fullReport.accounts.shared', { defaultValue: 'Shared' })
            : args.t('reports.personalScope', { defaultValue: 'Personal' }),
        account.currency,
        formatMoney(Number(account.opening_balance || 0), account.currency),
        formatMoney(inflow, account.currency),
        formatMoney(outflow, account.currency),
        formatMoney(transfers.in, account.currency),
        formatMoney(transfers.out, account.currency),
        formatMoney(Number(account.current_balance || 0), account.currency),
        conversion.convertedAmount === null ? args.t('reports.unavailable') : formatMoney(conversion.convertedAmount, args.reportData.reportingCurrency),
        account.include_in_total ? args.t('reports.fullReport.shared.yes', { defaultValue: 'Yes' }) : args.t('reports.fullReport.shared.no', { defaultValue: 'No' }),
        status || '-',
      ];
    }),
    args.t('reports.fullReport.accounts.empty', { defaultValue: 'No accounts match the selected report filters.' })
  );

  const personalAccounts = accountsInScope.filter((account) =>
    getFinancialAccountScopeType(account) === 'personal' && getFinancialAccountOwnershipType(account) !== 'shared'
  );
  const sharedAccounts = accountsInScope.filter((account) =>
    getFinancialAccountScopeType(account) === 'personal' && getFinancialAccountOwnershipType(account) === 'shared'
  );
  const spaceAccounts = accountsInScope.filter((account) => getFinancialAccountScopeType(account) === 'space');

  const sumAccountBalancesInReportingCurrency = (accounts: FinancialAccount[], includeOnlyTotals = false) =>
    accounts.reduce((total, account) => {
      if (includeOnlyTotals && !account.include_in_total) {
        return total;
      }
      const conversion = convertHistoricalAmountWithSnapshots({
        amount: Number(account.current_balance || 0),
        fromCurrency: account.currency,
        reportingCurrency: args.reportData.reportingCurrency,
        rateDate: args.activeRange.endDate,
        snapshots: args.reportData.snapshots,
      });
      return total + (conversion.convertedAmount || 0);
    }, 0);

  const personalAccountReportingTotal = sumAccountBalancesInReportingCurrency(personalAccounts, true);
  const spaceAccountReportingTotal = sumAccountBalancesInReportingCurrency(spaceAccounts);
  const activeScopeBalanceLabel = args.scopeType === 'space'
    ? args.t('reports.fullReport.executive.spaceBalance', { defaultValue: 'Space balance' })
    : args.t('reports.fullReport.executive.personalBalance', { defaultValue: 'Personal balance' });
  const activeScopeBalanceValue = args.scopeType === 'space'
    ? (spaceAccounts.length > 0 ? formatMoney(spaceAccountReportingTotal, args.reportData.reportingCurrency) : '-')
    : args.supplemental.dashboardMetrics
      ? formatConvertedMetric(args.supplemental.dashboardMetrics.totalBalance)
      : (personalAccounts.length > 0 ? formatMoney(personalAccountReportingTotal, args.reportData.reportingCurrency) : '-');

  const transactionRows = buildTransactionRows({
    transactions: filteredTransactions,
    peopleById,
    reportingCurrency: args.reportData.reportingCurrency,
    snapshots: args.reportData.snapshots,
    locale: args.locale,
    t: args.t,
  });

  const signedTransactionAmounts = filteredTransactions.map((transaction) =>
    transaction.transaction_type === 'expense'
      ? -Math.abs(Number(transaction.amount || 0))
      : Number(transaction.amount || 0)
  );
  const averageTransactionAmount = average(signedTransactionAmounts.map((value) => Math.abs(value)));
  const largestIncome = incomeTransactions[0]
    ? incomeTransactions
        .map((transaction) => ({
          transaction,
          converted: convertHistoricalAmountWithSnapshots({
            amount: Number(transaction.amount || 0),
            fromCurrency: transaction.currency || args.reportData.reportingCurrency,
            reportingCurrency: args.reportData.reportingCurrency,
            rateDate: transaction.transaction_date,
            snapshots: args.reportData.snapshots,
          }).convertedAmount || 0,
        }))
        .sort((left, right) => right.converted - left.converted)[0]
    : null;
  const largestExpense = expenseTransactions[0]
    ? expenseTransactions
        .map((transaction) => ({
          transaction,
          converted: convertHistoricalAmountWithSnapshots({
            amount: Number(transaction.amount || 0),
            fromCurrency: transaction.currency || args.reportData.reportingCurrency,
            reportingCurrency: args.reportData.reportingCurrency,
            rateDate: transaction.transaction_date,
            snapshots: args.reportData.snapshots,
          }).convertedAmount || 0,
        }))
        .sort((left, right) => right.converted - left.converted)[0]
    : null;

  const budgetItems = args.reportData.budgetPerformance.items.filter((item) =>
    args.filters.categoryId === 'all' || item.budget.category_id === args.filters.categoryId
  );

  const peopleRows = args.supplemental.people
    .filter((person) => args.filters.personId === 'all' || person.id === args.filters.personId)
    .map((person) => {
      const personReimbursements = args.supplemental.reimbursements.filter((item) => item.person_id === person.id);
      const personSettlements = args.supplemental.settlements.filter((item) => item.person_id === person.id);
      const loanItems = args.supplemental.loanItems.filter((item) => item.person_id === person.id);
      const lastActivityDate = [
        ...personReimbursements.map((item) => item.due_date || item.created_at || ''),
        ...personSettlements.map((item) => item.settlement_date || ''),
        ...loanItems.map((item) => item.latest_activity_date || ''),
      ].filter(Boolean).sort().at(-1) || null;

      return [
        person.full_name,
        formatMoney(Number(person.total_expenses || 0), person.preferred_currency),
        formatMoney(Number(person.total_received || 0), person.preferred_currency),
        formatMoney(Math.max(0, Number(person.person_owes_user || 0)), person.preferred_currency),
        formatMoney(Math.max(0, Number(person.user_owes_person || 0)), person.preferred_currency),
        String(personReimbursements.length),
        String(personSettlements.length),
        toDateLabel(lastActivityDate, args.locale),
        [formatMoney(Math.max(0, Number(person.money_held || 0)), person.preferred_currency)].join(' | '),
      ];
    });

  const subscriptions = args.supplemental.subscriptions;
  const subscriptionMonthlyTotalsByCurrency = new Map<string, number>();
  const subscriptionYearlyTotalsByCurrency = new Map<string, number>();
  for (const subscription of subscriptions) {
    const currency = subscription.currency_code;
    subscriptionMonthlyTotalsByCurrency.set(
      currency,
      (subscriptionMonthlyTotalsByCurrency.get(currency) || 0) + getMonthlyCostEstimate(subscription)
    );
    subscriptionYearlyTotalsByCurrency.set(
      currency,
      (subscriptionYearlyTotalsByCurrency.get(currency) || 0) + getAnnualCostEstimate(subscription)
    );
  }
  const subscriptionMonthlyTotals = Array.from(subscriptionMonthlyTotalsByCurrency.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .filter((row) => Math.abs(row.amount) > 0);
  const subscriptionYearlyTotals = Array.from(subscriptionYearlyTotalsByCurrency.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .filter((row) => Math.abs(row.amount) > 0);
  const upcomingSubscriptionRows = subscriptions
    .filter((subscription) => subscription.next_billing_date)
    .sort((left, right) => (left.next_billing_date || '').localeCompare(right.next_billing_date || ''))
    .slice(0, 8)
    .map((subscription) => [
      subscription.name,
      formatMoney(Number(subscription.amount || 0), subscription.currency_code),
      toDateLabel(subscription.next_billing_date, args.locale),
      subscription.auto_renew
        ? args.t('reports.fullReport.shared.yes', { defaultValue: 'Yes' })
        : args.t('reports.fullReport.shared.no', { defaultValue: 'No' }),
    ]);

  const recurringRows = args.supplemental.recurringItems
    .filter((item) => args.filters.transactionType === 'all' || item.transaction_type === args.filters.transactionType)
    .map((item) => {
      const isOverdue = item.next_due_date < args.todayIso;
      return [
        item.description,
        args.t(`transactions.types.${item.transaction_type}`),
        formatMoney(Number(item.amount || 0), item.currency),
        item.currency,
        formatRecurringFrequencyLabel(item.frequency, args.t),
        item.account?.name || '-',
        item.category?.name || '-',
        toDateLabel(item.next_due_date, args.locale),
        item.is_active
          ? args.t('reports.fullReport.shared.active', { defaultValue: 'Active' })
          : args.t('reports.fullReport.shared.inactive', { defaultValue: 'Inactive' }),
        isOverdue
          ? args.t('reports.fullReport.shared.overdue', { defaultValue: 'Overdue' })
          : args.t('reports.fullReport.shared.scheduled', { defaultValue: 'Scheduled' }),
      ];
    });

  const loanRows = args.supplemental.loanItems
    .filter((item) => args.filters.personId === 'all' || item.person_id === args.filters.personId)
    .map((item) => [
      item.person_name,
      formatMoney(item.original_loan_amount, item.currency),
      formatMoney(item.outstanding_balance, item.currency),
      formatMoney(item.amount_repaid, item.currency),
      String(item.repayment_count),
      item.last_repayment_date ? toDateLabel(item.last_repayment_date, args.locale) : '-',
      item.currency,
      item.status === 'outstanding'
        ? args.t('reports.fullReport.shared.outstanding', { defaultValue: 'Outstanding' })
        : args.t('reports.fullReport.shared.repaid', { defaultValue: 'Repaid' }),
    ]);

  const commitments = (() => {
    const rows: Array<{ bucket: 'overdue' | 'next7' | 'next30' | 'later'; label: string; dueDate: string; amount: string; type: string; account: string }> = [];
    for (const subscription of subscriptions) {
      if (!subscription.next_billing_date) continue;
      const dayDiff = Math.round((new Date(`${subscription.next_billing_date}T12:00:00Z`).getTime() - new Date(`${args.todayIso}T12:00:00Z`).getTime()) / 86400000);
      rows.push({
        bucket: dayDiff < 0 ? 'overdue' : dayDiff <= 7 ? 'next7' : dayDiff <= 30 ? 'next30' : 'later',
        label: subscription.name,
        dueDate: toDateLabel(subscription.next_billing_date, args.locale),
        amount: formatMoney(subscription.amount, subscription.currency_code),
        type: args.t('reports.fullReport.commitments.subscription', { defaultValue: 'Subscription' }),
        account: subscription.account?.name || '-',
      });
    }
    for (const item of args.supplemental.recurringItems) {
      const dayDiff = Math.round((new Date(`${item.next_due_date}T12:00:00Z`).getTime() - new Date(`${args.todayIso}T12:00:00Z`).getTime()) / 86400000);
      rows.push({
        bucket: dayDiff < 0 ? 'overdue' : dayDiff <= 7 ? 'next7' : dayDiff <= 30 ? 'next30' : 'later',
        label: item.description,
        dueDate: toDateLabel(item.next_due_date, args.locale),
        amount: formatMoney(Number(item.amount || 0), item.currency),
        type: args.t('reports.fullReport.commitments.recurring', { defaultValue: 'Recurring' }),
        account: item.account?.name || '-',
      });
    }
    for (const reimbursement of args.supplemental.reimbursements.filter((item) =>
      item.status === 'pending' || item.status === 'partially_paid'
    )) {
      if (!reimbursement.due_date) continue;
      const outstanding = Math.max(0, Number(reimbursement.amount || 0) - Number(reimbursement.amount_paid || 0));
      const dayDiff = Math.round((new Date(`${reimbursement.due_date}T12:00:00Z`).getTime() - new Date(`${args.todayIso}T12:00:00Z`).getTime()) / 86400000);
      rows.push({
        bucket: dayDiff < 0 ? 'overdue' : dayDiff <= 7 ? 'next7' : dayDiff <= 30 ? 'next30' : 'later',
        label: reimbursement.description,
        dueDate: toDateLabel(reimbursement.due_date, args.locale),
        amount: formatMoney(outstanding, reimbursement.currency),
        type: args.t('reports.fullReport.commitments.reimbursement', { defaultValue: 'Reimbursement' }),
        account: '-',
      });
    }

    return {
      overdue: rows.filter((row) => row.bucket === 'overdue'),
      next7: rows.filter((row) => row.bucket === 'next7'),
      next30: rows.filter((row) => row.bucket === 'next30'),
      later: rows.filter((row) => row.bucket === 'later'),
    };
  })();

  const topExpenseCategory = expenseCategories[0];
  const executiveNarratives: string[] = [];
  if (netMetric.reportingAmount !== null && incomeMetric.reportingAmount !== null && expensesMetric.reportingAmount !== null) {
    if (netMetric.reportingAmount < 0) {
      executiveNarratives.push(
        args.t('reports.fullReport.executive.spentMore', {
          defaultValue: 'You spent {{amount}} more than you earned in this period.',
          amount: formatMoney(Math.abs(netMetric.reportingAmount), netMetric.reportingCurrency),
        })
      );
    } else {
      executiveNarratives.push(
        args.t('reports.fullReport.executive.savedAmount', {
          defaultValue: 'You kept {{amount}} after income and expenses in this period.',
          amount: formatMoney(netMetric.reportingAmount, netMetric.reportingCurrency),
        })
      );
    }
  }
  if (topExpenseCategory) {
    executiveNarratives.push(
      args.t('reports.fullReport.executive.topCategory', {
        defaultValue: 'Your largest spending category was {{category}}.',
        category: topExpenseCategory.label,
      })
    );
  }
  if (commitments.next7.length > 0) {
    executiveNarratives.push(
      args.t('reports.fullReport.executive.upcomingDue', {
        defaultValue: '{{count}} payments are due within the next 7 days.',
        count: commitments.next7.length,
      })
    );
  }

  const busiestDay = expenseTransactions
    .reduce((map, transaction) => {
      map.set(transaction.transaction_date, (map.get(transaction.transaction_date) || 0) + 1);
      return map;
    }, new Map<string, number>());
  const busiestDayEntry = Array.from(busiestDay.entries()).sort((left, right) => right[1] - left[1])[0];

  const convertedSummaryRows = [
    [args.t('reports.summary.totalIncome'), formatConvertedMetric(incomeMetric)],
    [args.t('reports.summary.totalExpenses'), formatConvertedMetric(expensesMetric)],
    [args.t('reports.summary.net'), formatConvertedMetric(netMetric)],
  ];

  const originalSummaryRows = [
    [args.t('reports.summary.totalIncome'), formatOriginalTotals(incomeMetric.originalTotals)],
    [args.t('reports.summary.totalExpenses'), formatOriginalTotals(expensesMetric.originalTotals)],
    [args.t('reports.summary.net'), formatOriginalTotals(netMetric.originalTotals)],
  ];

  return {
    title: args.title,
    subtitle: formatReportPeriodLabel(args.activeRange),
    identity: args.identity,
    metadata: args.metadata,
    generatedAtLabel: args.generatedAtLabel,
    largeReportWarning: filteredTransactions.length > 500
      ? args.t('reports.fullReport.largeReportWarning', {
          defaultValue: 'This report contains a large number of transactions and may take longer to generate.',
        })
      : null,
    executiveSummary: {
      metrics: [
        { label: activeScopeBalanceLabel, value: activeScopeBalanceValue, tone: 'neutral' },
        { label: args.t('reports.summary.totalIncome'), value: formatConvertedMetric(incomeMetric), tone: 'positive' },
        { label: args.t('reports.summary.totalExpenses'), value: formatConvertedMetric(expensesMetric), tone: 'negative' },
        { label: args.t('reports.summary.net'), value: formatConvertedMetric(netMetric), tone: netMetric.reportingAmount !== null && netMetric.reportingAmount < 0 ? 'negative' : 'positive' },
        { label: args.t('reports.fullReport.executive.budgetRemaining', { defaultValue: 'Budget remaining' }), value: budgetItems.length > 0 ? formatMoney(sum(budgetItems.map((item) => Number(item.remainingReportingAmount || 0))), args.reportData.reportingCurrency) : '-', tone: 'neutral' },
        { label: args.t('reports.fullReport.executive.receivables', { defaultValue: 'Outstanding receivables' }), value: formatOriginalTotals(args.supplemental.people.map((person) => ({ currency: person.preferred_currency, amount: Math.max(0, Number(person.person_owes_user || 0)) }))), tone: 'positive' },
        { label: args.t('reports.fullReport.executive.payables', { defaultValue: 'Outstanding payables' }), value: formatOriginalTotals(args.supplemental.people.map((person) => ({ currency: person.preferred_currency, amount: Math.max(0, Number(person.user_owes_person || 0)) }))), tone: 'negative' },
        { label: args.t('reports.fullReport.executive.loans', { defaultValue: 'Outstanding loans' }), value: args.supplemental.dashboardMetrics ? formatConvertedMetric(args.supplemental.dashboardMetrics.outstandingLoanBalance) : '-', tone: 'neutral' },
        { label: args.t('reports.fullReport.executive.loanRepayments', { defaultValue: 'Loan repayments' }), value: args.supplemental.dashboardMetrics ? formatConvertedMetric(args.supplemental.dashboardMetrics.loanRepaidThisMonth) : '-', tone: 'neutral' },
        { label: args.t('reports.fullReport.executive.upcomingPayments', { defaultValue: 'Upcoming payments' }), value: String(commitments.next7.length + commitments.next30.length), helper: args.t('reports.fullReport.executive.commitmentsHelper', { defaultValue: 'Due within the next 30 days' }) },
        { label: args.t('reports.fullReport.executive.activeSubscriptions', { defaultValue: 'Active subscriptions' }), value: String(subscriptions.filter((subscription) => subscription.status === 'active' || subscription.status === 'trial').length) },
        { label: args.t('reports.reportingCurrencyLabel'), value: args.reportData.reportingCurrency, helper: formatReportPeriodLabel(args.activeRange) },
      ],
      narratives: executiveNarratives,
    },
    incomeExpenses: {
      metrics: [
        { label: args.t('reports.summary.totalIncome'), value: formatConvertedMetric(incomeMetric), tone: 'positive' },
        { label: args.t('reports.summary.totalExpenses'), value: formatConvertedMetric(expensesMetric), tone: 'negative' },
        { label: args.t('reports.summary.net'), value: formatConvertedMetric(netMetric), tone: netMetric.reportingAmount !== null && netMetric.reportingAmount < 0 ? 'negative' : 'positive' },
        { label: args.t('reports.summary.totalTransactions'), value: String(filteredTransactions.length) },
      ],
      comparisonSummary: previousIncomeMetric && previousExpensesMetric
        ? args.t('reports.fullReport.incomeExpenses.comparisonSummary', {
            defaultValue: 'Income changed {{incomeChange}} and expenses changed {{expenseChange}} compared with the previous comparable period.',
            incomeChange: previousIncomeMetric.reportingAmount !== null && incomeMetric.reportingAmount !== null && differenceInPercent(incomeMetric.reportingAmount, previousIncomeMetric.reportingAmount) !== null
              ? `${differenceInPercent(incomeMetric.reportingAmount, previousIncomeMetric.reportingAmount)!.toFixed(1)}%`
              : args.t('reports.unavailable'),
            expenseChange: previousExpensesMetric.reportingAmount !== null && expensesMetric.reportingAmount !== null && differenceInPercent(expensesMetric.reportingAmount, previousExpensesMetric.reportingAmount) !== null
              ? `${differenceInPercent(expensesMetric.reportingAmount, previousExpensesMetric.reportingAmount)!.toFixed(1)}%`
              : args.t('reports.unavailable'),
          })
        : null,
      incomeVsExpenseChart: args.incomeExpenseChartState,
      topIncomeSources: buildTable(
        [args.t('reports.fullReport.incomeExpenses.source', { defaultValue: 'Source' }), args.t('reports.amount', { defaultValue: 'Amount' }), args.t('reports.summary.transactions'), args.t('reports.fullReport.incomeExpenses.change', { defaultValue: 'Change' }), args.t('reports.fullReport.incomeExpenses.helper', { defaultValue: 'Largest' })],
        incomeSources.map((row) => [row.label, formatMoney(row.value, args.reportData.reportingCurrency), String(row.count), '-', formatMoney(row.largest, args.reportData.reportingCurrency)]),
        args.t('reports.fullReport.incomeExpenses.noIncomeSources', { defaultValue: 'No income sources match the selected report filters.' })
      ),
      topExpenseCategories: buildGroupTable(
        expenseCategories.map((row) => ({
          label: row.label,
          value: row.value,
          count: row.count,
          comparison: differenceInPercent(row.value, previousExpenseCategoryMap.get(row.label) || 0),
          helper: formatMoney(row.largest, args.reportData.reportingCurrency),
        })),
        args.reportData.reportingCurrency,
        [args.t('reports.fullReport.categoryAnalysis.category', { defaultValue: 'Category' }), args.t('reports.amount', { defaultValue: 'Amount' }), args.t('reports.summary.transactions'), args.t('reports.fullReport.incomeExpenses.change', { defaultValue: 'Change' }), args.t('reports.fullReport.incomeExpenses.helper', { defaultValue: 'Largest' })],
        args.t('reports.fullReport.incomeExpenses.noExpenseCategories', { defaultValue: 'No expense categories match the selected report filters.' })
      ),
      highlights: [
        { label: args.t('reports.fullReport.incomeExpenses.largestIncome', { defaultValue: 'Largest income transaction' }), value: largestIncome ? `${largestIncome.transaction.description || largestIncome.transaction.merchant || args.t('reports.accountStatement.entryFallback')} - ${formatMoney(largestIncome.converted, args.reportData.reportingCurrency)}` : '-', helper: largestIncome ? toDateLabel(largestIncome.transaction.transaction_date, args.locale) : null },
        { label: args.t('reports.fullReport.incomeExpenses.largestExpense', { defaultValue: 'Largest expense transaction' }), value: largestExpense ? `${largestExpense.transaction.description || largestExpense.transaction.merchant || args.t('reports.accountStatement.entryFallback')} - ${formatMoney(largestExpense.converted, args.reportData.reportingCurrency)}` : '-', helper: largestExpense ? toDateLabel(largestExpense.transaction.transaction_date, args.locale) : null },
        { label: args.t('reports.fullReport.incomeExpenses.averageTransaction', { defaultValue: 'Average transaction amount' }), value: formatMoney(averageTransactionAmount, args.reportData.reportingCurrency), helper: args.t('reports.fullReport.incomeExpenses.absoluteAverage', { defaultValue: 'Uses absolute transaction amounts' }) },
        { label: args.t('reports.summary.transactions'), value: String(filteredTransactions.length), helper: args.t('reports.summary.includedRecords') },
      ],
    },
    accounts: {
      summary: [
        { label: args.t('reports.fullReport.accounts.personal', { defaultValue: 'Personal accounts' }), value: String(personalAccounts.length) },
        { label: args.t('reports.fullReport.accounts.shared', { defaultValue: 'Shared accounts' }), value: String(sharedAccounts.length) },
        { label: args.t('reports.fullReport.accounts.spaces', { defaultValue: 'Space accounts' }), value: String(spaceAccounts.length) },
        { label: args.t('reports.fullReport.accounts.personalTotalLabel', { defaultValue: 'Personal total' }), value: personalAccounts.length > 0 ? formatMoney(personalAccountReportingTotal, args.reportData.reportingCurrency) : '-' },
      ],
      personal: buildAccountRows(personalAccounts),
      shared: buildAccountRows(sharedAccounts),
      spaces: buildAccountRows(spaceAccounts),
    },
    transactions: {
      summary: [
        { label: args.t('reports.summary.totalTransactions'), value: String(filteredTransactions.length) },
        { label: args.t('reports.summary.totalCredits'), value: formatConvertedMetric(incomeMetric), tone: 'positive' },
        { label: args.t('reports.summary.totalDebits'), value: formatConvertedMetric(expensesMetric), tone: 'negative' },
        { label: args.t('reports.fullReport.transactions.averageAmount', { defaultValue: 'Average amount' }), value: formatMoney(averageTransactionAmount, args.reportData.reportingCurrency) },
      ],
      rows: transactionRows,
      summaryTable: buildTable(
        [args.t('reports.fullReport.transactions.columns.date', { defaultValue: 'Date' }), args.t('reports.fullReport.transactions.columns.description', { defaultValue: 'Description' }), args.t('reports.fullReport.transactions.columns.account', { defaultValue: 'Account' }), args.t('reports.fullReport.transactions.columns.reportingAmount', { defaultValue: 'Reporting amount' })],
        transactionRows.slice(0, 24).map((row) => [
          row.date,
          row.description,
          row.account || '-',
          row.reportingAmount === null ? args.t('reports.unavailable') : formatMoney(row.reportingAmount, row.reportingCurrency),
        ]),
        args.t('reports.fullReport.transactions.empty', { defaultValue: 'No transactions match the selected report filters.' })
      ),
    },
    categories: {
      spendingChart: args.spendingCategoryChartState,
      expenseTable: buildTable(
        [args.t('reports.fullReport.categoryAnalysis.category', { defaultValue: 'Category' }), args.t('reports.amount', { defaultValue: 'Amount' }), args.t('reports.summary.transactions'), args.t('reports.fullReport.categoryAnalysis.average', { defaultValue: 'Average' }), args.t('reports.fullReport.categoryAnalysis.largest', { defaultValue: 'Largest' })],
        expenseCategories.map((row) => [row.label, formatMoney(row.value, args.reportData.reportingCurrency), String(row.count), formatMoney(row.value / Math.max(1, row.count), args.reportData.reportingCurrency), formatMoney(row.largest, args.reportData.reportingCurrency)]),
        args.t('reports.fullReport.categoryAnalysis.empty', { defaultValue: 'No spending categories match the selected report filters.' })
      ),
      incomeTable: buildTable(
        [args.t('reports.fullReport.categoryAnalysis.category', { defaultValue: 'Category' }), args.t('reports.amount', { defaultValue: 'Amount' }), args.t('reports.summary.transactions'), args.t('reports.fullReport.categoryAnalysis.average', { defaultValue: 'Average' }), args.t('reports.fullReport.categoryAnalysis.largest', { defaultValue: 'Largest' })],
        incomeSources.map((row) => [row.label, formatMoney(row.value, args.reportData.reportingCurrency), String(row.count), formatMoney(row.value / Math.max(1, row.count), args.reportData.reportingCurrency), formatMoney(row.largest, args.reportData.reportingCurrency)]),
        args.t('reports.fullReport.categoryAnalysis.emptyIncome', { defaultValue: 'No income categories match the selected report filters.' })
      ),
    },
    budgets: {
      summary: [
        { label: args.t('reports.summary.applicableBudgets'), value: String(budgetItems.length) },
        { label: args.t('reports.fullReport.budgets.onTrack', { defaultValue: 'On track' }), value: String(budgetItems.filter((item) => item.status === 'on_track' || item.status === 'no_spending').length), tone: 'positive' },
        { label: args.t('reports.fullReport.budgets.nearLimit', { defaultValue: 'Near limit' }), value: String(budgetItems.filter((item) => item.status === 'near_limit').length), tone: 'negative' },
        { label: args.t('reports.fullReport.budgets.exceeded', { defaultValue: 'Exceeded' }), value: String(budgetItems.filter((item) => item.status === 'over_budget').length), tone: 'negative' },
      ],
      table: buildTable(
        [args.t('reports.budgetPerformanceCsv.budget'), args.t('reports.budgetPerformanceCsv.category'), args.t('reports.budgetPerformanceCsv.periodType'), args.t('reports.budgetPerformanceCsv.budgetAmount'), args.t('reports.budgetPerformanceCsv.spent'), args.t('reports.budgetPerformanceCsv.remaining'), args.t('reports.budgetPerformanceCsv.progressPercent'), args.t('reports.budgetPerformanceCsv.status'), args.t('reports.budgetPerformanceCsv.reportingCurrency')],
        budgetItems.map((item) => [
          item.budget.name || item.budget.category?.name || args.t('reports.budget'),
          item.budget.category?.name || '-',
          item.periodTypeLabel,
          formatMoney(Number(item.budget.amount || 0), item.budget.currency),
          item.spentAmount === null ? args.t('reports.unavailable') : formatMoney(item.spentAmount, item.budget.currency),
          item.remainingAmount === null ? args.t('reports.unavailable') : formatMoney(item.remainingAmount, item.budget.currency),
          item.progressPct === null ? '-' : `${item.progressPct.toFixed(1)}%`,
          item.statusLabel.startsWith('budgets.') ? args.t(item.statusLabel, { ns: 'portal' }) : item.statusLabel,
          item.reportingCurrency,
        ]),
        args.t('reports.noBudgetsApplyDescription')
      ),
    },
    people: {
      summary: [
        { label: args.t('reports.fullReport.people.peopleCount', { defaultValue: 'People covered' }), value: String(peopleRows.length) },
        { label: args.t('reports.fullReport.executive.receivables', { defaultValue: 'Outstanding receivables' }), value: formatOriginalTotals(args.supplemental.people.map((person) => ({ currency: person.preferred_currency, amount: Math.max(0, Number(person.person_owes_user || 0)) }))), tone: 'positive' },
        { label: args.t('reports.fullReport.executive.payables', { defaultValue: 'Outstanding payables' }), value: formatOriginalTotals(args.supplemental.people.map((person) => ({ currency: person.preferred_currency, amount: Math.max(0, Number(person.user_owes_person || 0)) }))), tone: 'negative' },
        { label: args.t('reports.fullReport.people.pendingReimbursements', { defaultValue: 'Open reimbursements' }), value: String(args.supplemental.reimbursements.filter((item) => item.status === 'pending' || item.status === 'partially_paid').length) },
      ],
      table: buildTable(
        [args.t('people.personName', { ns: 'portal', defaultValue: 'Person' }), args.t('reports.fullReport.people.paidOnBehalf', { defaultValue: 'Paid on their behalf' }), args.t('reports.fullReport.people.receivedFromThem', { defaultValue: 'Received from them' }), args.t('reports.fullReport.executive.receivables', { defaultValue: 'Outstanding receivable' }), args.t('reports.fullReport.executive.payables', { defaultValue: 'Outstanding payable' }), args.t('reports.fullReport.people.reimbursements', { defaultValue: 'Reimbursements' }), args.t('reports.fullReport.people.settlements', { defaultValue: 'Settlements' }), args.t('reports.fullReport.people.lastActivity', { defaultValue: 'Last activity' }), args.t('reports.fullReport.people.currencies', { defaultValue: 'Currency totals' })],
        peopleRows,
        args.t('reports.fullReport.people.empty', { defaultValue: 'No people data matches the selected report filters.' })
      ),
    },
    subscriptions: {
      summary: [
        { label: args.t('reports.fullReport.executive.activeSubscriptions', { defaultValue: 'Active subscriptions' }), value: String(subscriptions.filter((subscription) => subscription.status === 'active' || subscription.status === 'trial').length) },
        { label: args.t('reports.fullReport.subscriptions.monthlyEquivalent', { defaultValue: 'Monthly equivalent' }), value: subscriptionMonthlyTotals.length > 0 ? formatOriginalTotals(subscriptionMonthlyTotals) : '-' },
        { label: args.t('reports.fullReport.subscriptions.yearlyEquivalent', { defaultValue: 'Yearly equivalent' }), value: subscriptionYearlyTotals.length > 0 ? formatOriginalTotals(subscriptionYearlyTotals) : '-' },
        { label: args.t('reports.fullReport.subscriptions.upcoming', { defaultValue: 'Upcoming renewals' }), value: String(upcomingSubscriptionRows.length) },
      ],
      table: buildTable(
        [args.t('reports.fullReport.subscriptions.name', { defaultValue: 'Subscription' }), args.t('reports.amount', { defaultValue: 'Amount' }), args.t('reports.fullReport.subscriptions.currency', { defaultValue: 'Currency' }), args.t('reports.fullReport.subscriptions.frequency', { defaultValue: 'Billing frequency' }), args.t('reports.fullReport.subscriptions.monthlyEquivalent', { defaultValue: 'Monthly equivalent' }), args.t('reports.fullReport.subscriptions.yearlyEquivalent', { defaultValue: 'Yearly equivalent' }), args.t('reports.fullReport.subscriptions.account', { defaultValue: 'Payment account' }), args.t('reports.fullReport.subscriptions.nextBilling', { defaultValue: 'Next billing date' }), args.t('reports.fullReport.subscriptions.autoRenew', { defaultValue: 'Auto-renew' }), args.t('reports.fullReport.subscriptions.state', { defaultValue: 'State' })],
        subscriptions.map((subscription) => [
          subscription.name,
          formatMoney(subscription.amount, subscription.currency_code),
          subscription.currency_code,
          localizeSubscriptionFrequency(subscription, args.t),
          formatMoney(getMonthlyCostEstimate(subscription), subscription.currency_code),
          formatMoney(getAnnualCostEstimate(subscription), subscription.currency_code),
          subscription.account?.name || '-',
          toDateLabel(subscription.next_billing_date, args.locale),
          subscription.auto_renew ? args.t('reports.fullReport.shared.yes', { defaultValue: 'Yes' }) : args.t('reports.fullReport.shared.no', { defaultValue: 'No' }),
          localizeSubscriptionStatus(subscription, args.t),
        ]),
        args.t('reports.fullReport.subscriptions.empty', { defaultValue: 'No subscriptions are available for this report.' })
      ),
      upcomingTable: buildTable(
        [args.t('reports.fullReport.subscriptions.name', { defaultValue: 'Subscription' }), args.t('reports.amount', { defaultValue: 'Amount' }), args.t('reports.fullReport.subscriptions.nextBilling', { defaultValue: 'Next billing date' }), args.t('reports.fullReport.subscriptions.autoRenew', { defaultValue: 'Auto-renew' })],
        upcomingSubscriptionRows,
        args.t('reports.fullReport.subscriptions.noUpcoming', { defaultValue: 'No upcoming subscription renewals were found.' })
      ),
    },
    recurring: {
      table: buildTable(
        [args.t('reports.fullReport.recurring.name', { defaultValue: 'Name' }), args.t('reports.fullReport.transactions.columns.type', { defaultValue: 'Type' }), args.t('reports.amount', { defaultValue: 'Amount' }), args.t('reports.fullReport.subscriptions.currency', { defaultValue: 'Currency' }), args.t('reports.fullReport.subscriptions.frequency', { defaultValue: 'Frequency' }), args.t('reports.fullReport.transactions.columns.account', { defaultValue: 'Account' }), args.t('reports.fullReport.transactions.columns.category', { defaultValue: 'Category' }), args.t('reports.fullReport.recurring.nextDue', { defaultValue: 'Next due date' }), args.t('reports.fullReport.recurring.status', { defaultValue: 'Status' }), args.t('reports.fullReport.shared.overdue', { defaultValue: 'Paid / overdue' })],
        recurringRows,
        args.t('reports.fullReport.recurring.empty', { defaultValue: 'No recurring transactions are active for this report.' })
      ),
    },
    loans: {
      summary: [
        { label: args.t('reports.fullReport.executive.loans', { defaultValue: 'Outstanding loans' }), value: args.supplemental.dashboardMetrics ? formatConvertedMetric(args.supplemental.dashboardMetrics.outstandingLoanBalance) : '-' },
        { label: args.t('reports.fullReport.executive.loanRepayments', { defaultValue: 'Loan repayments' }), value: args.supplemental.dashboardMetrics ? formatConvertedMetric(args.supplemental.dashboardMetrics.loanRepaidThisMonth) : '-' },
        { label: args.t('reports.fullReport.loans.openLoans', { defaultValue: 'Open loans' }), value: String(args.supplemental.loanItems.filter((item) => item.status === 'outstanding').length) },
        { label: args.t('reports.fullReport.loans.repaidLoans', { defaultValue: 'Repaid loans' }), value: String(args.supplemental.loanItems.filter((item) => item.status === 'repaid').length) },
      ],
      table: buildTable(
        [args.t('reports.fullReport.loans.person', { defaultValue: 'Lender / person' }), args.t('reports.fullReport.loans.originalAmount', { defaultValue: 'Original loan amount' }), args.t('reports.fullReport.loans.outstandingBalance', { defaultValue: 'Outstanding balance' }), args.t('reports.fullReport.loans.repaid', { defaultValue: 'Amount repaid' }), args.t('reports.fullReport.loans.repaymentCount', { defaultValue: 'Repayments' }), args.t('reports.fullReport.loans.nextExpected', { defaultValue: 'Next expected repayment' }), args.t('reports.fullReport.subscriptions.currency', { defaultValue: 'Currency' }), args.t('reports.fullReport.recurring.status', { defaultValue: 'Status' })],
        loanRows,
        args.t('reports.fullReport.loans.empty', { defaultValue: 'No loan records match the selected report filters.' })
      ),
    },
    commitments: {
      overdue: buildCommitmentTable(commitments.overdue, args.t),
      next7Days: buildCommitmentTable(commitments.next7, args.t),
      next30Days: buildCommitmentTable(commitments.next30, args.t),
      later: buildCommitmentTable(commitments.later, args.t),
    },
    itemInsights: args.supplemental.itemInsightsSnapshot ? {
      topItemsBySpend: buildTable(
        [
          args.t('reports.fullReport.itemInsights.columns.item', { defaultValue: 'Item' }),
          args.t('reports.fullReport.subscriptions.currency', { defaultValue: 'Currency' }),
          args.t('reports.fullReport.itemInsights.columns.total', { defaultValue: 'Total' }),
          args.t('reports.fullReport.itemInsights.columns.count', { defaultValue: 'Count' }),
        ],
        args.supplemental.itemInsightsSnapshot.topItemsBySpend.slice(0, 6).map((row) => [row.itemName, row.currency, formatMoney(row.totalSpent, row.currency), String(row.purchaseCount)]),
        args.t('reports.itemInsights.emptyStateTitle', { defaultValue: 'No item insights found.' })
      ),
      topItemsByFrequency: buildTable(
        [
          args.t('reports.fullReport.itemInsights.columns.item', { defaultValue: 'Item' }),
          args.t('reports.fullReport.subscriptions.currency', { defaultValue: 'Currency' }),
          args.t('reports.fullReport.itemInsights.columns.purchases', { defaultValue: 'Purchases' }),
          args.t('reports.fullReport.categoryAnalysis.average', { defaultValue: 'Average' }),
        ],
        args.supplemental.itemInsightsSnapshot.topItemsByFrequency.slice(0, 6).map((row) => [
          row.itemName,
          row.currency,
          String(row.purchaseCount),
          row.averageIntervalDays === null
            ? '-'
            : args.t('reports.fullReport.itemInsights.daysLabel', {
                defaultValue: '{{count}} days',
                count: row.averageIntervalDays.toFixed(1),
              }),
        ]),
        args.t('reports.itemInsights.emptyStateTitle', { defaultValue: 'No item insights found.' })
      ),
      recentPriceChanges: buildTable(
        [
          args.t('reports.fullReport.itemInsights.columns.item', { defaultValue: 'Item' }),
          args.t('reports.fullReport.subscriptions.currency', { defaultValue: 'Currency' }),
          args.t('reports.fullReport.incomeExpenses.change', { defaultValue: 'Change' }),
          args.t('reports.fullReport.itemInsights.columns.lastPrice', { defaultValue: 'Last price' }),
        ],
        args.supplemental.itemInsightsSnapshot.recentPriceChanges.slice(0, 6).map((row) => [row.itemName, row.currency, `${row.percentageChange.toFixed(1)}%`, row.latestPrice === null ? '-' : formatMoney(row.latestPrice, row.currency)]),
        args.t('reports.itemInsights.emptyStateTitle', { defaultValue: 'No item insights found.' })
      ),
      merchantInsights: buildTable(
        [
          args.t('reports.fullReport.itemInsights.columns.merchant', { defaultValue: 'Merchant' }),
          args.t('reports.fullReport.itemInsights.columns.topItem', { defaultValue: 'Top item' }),
          args.t('reports.fullReport.subscriptions.currency', { defaultValue: 'Currency' }),
          args.t('reports.fullReport.categoryAnalysis.average', { defaultValue: 'Average' }),
        ],
        args.supplemental.itemInsightsSnapshot.merchantInsights.slice(0, 6).map((row) => [
          row.merchant || '-',
          row.mostPurchasedItems[0]?.itemName || '-',
          row.currency,
          formatMoney(row.averageReceiptValue, row.currency),
        ]),
        args.t('reports.itemInsights.emptyStateTitle', { defaultValue: 'No item insights found.' })
      ),
      recurringSuggestions: buildTable(
        [
          args.t('reports.fullReport.itemInsights.columns.item', { defaultValue: 'Item' }),
          args.t('reports.fullReport.subscriptions.currency', { defaultValue: 'Currency' }),
          args.t('reports.fullReport.itemInsights.columns.frequency', { defaultValue: 'Frequency' }),
          args.t('reports.fullReport.itemInsights.columns.lastBought', { defaultValue: 'Last bought' }),
        ],
        args.supplemental.itemInsightsSnapshot.recurringSuggestions.slice(0, 6).map((row) => [
          row.itemName,
          row.currency,
          args.t('reports.fullReport.itemInsights.daysLabel', {
            defaultValue: '{{count}} days',
            count: row.averageIntervalDays.toFixed(1),
          }),
          toDateLabel(row.lastPurchasedAt, args.locale),
        ]),
        args.t('reports.itemInsights.emptyStateTitle', { defaultValue: 'No item insights found.' })
      ),
      spendingByCategory: buildTable(
        [
          args.t('reports.fullReport.categoryAnalysis.category', { defaultValue: 'Category' }),
          args.t('reports.fullReport.subscriptions.currency', { defaultValue: 'Currency' }),
          args.t('reports.fullReport.itemInsights.columns.total', { defaultValue: 'Total' }),
        ],
        args.supplemental.itemInsightsSnapshot.spendingByCategory.slice(0, 6).map((row) => [row.categoryName || args.t('transactions.uncategorized'), row.currency, formatMoney(row.totalSpent, row.currency)]),
        args.t('reports.itemInsights.emptyStateTitle', { defaultValue: 'No item insights found.' })
      ),
    } : null,
    currencySummary: {
      originals: buildTable(
        [
          args.t('reports.fullReport.currency.columns.metric', { defaultValue: 'Metric' }),
          args.t('reports.fullReport.currency.columns.originalTotals', { defaultValue: 'Original totals' }),
        ],
        originalSummaryRows,
        args.t('reports.noData')
      ),
      converted: buildTable(
        [
          args.t('reports.fullReport.currency.columns.metric', { defaultValue: 'Metric' }),
          args.t('reports.fullReport.currency.columns.reportingTotal', { defaultValue: 'Reporting total' }),
        ],
        convertedSummaryRows,
        args.t('reports.noData')
      ),
      notes: [
        args.t('reports.fullReport.currency.noteConvertedView', {
          defaultValue: 'Reporting values are converted views based on stored exchange-rate snapshots for the selected period.',
        }),
        args.t('reports.fullReport.currency.noteOriginalTotals', {
          defaultValue: 'Original AED, USD, CAD, GBP and other currencies remain separated so mixed-currency totals are not misleading.',
        }),
      ],
    },
    observations: [
      topExpenseCategory
        ? args.t('reports.fullReport.observations.highestCategory', {
            defaultValue: 'Highest spending category: {{category}}.',
            category: topExpenseCategory.label,
          })
        : null,
      largestExpense
        ? args.t('reports.fullReport.observations.highestExpense', {
            defaultValue: 'Largest expense: {{description}}.',
            description: largestExpense.transaction.description || largestExpense.transaction.merchant || args.t('reports.accountStatement.entryFallback'),
          })
        : null,
      subscriptions[0]
        ? args.t('reports.fullReport.observations.expensiveSubscription', {
            defaultValue: 'Most expensive subscription: {{name}}.',
            name: [...subscriptions].sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))[0]?.name || subscriptions[0].name,
          })
        : null,
      budgetItems[0]
        ? args.t('reports.fullReport.observations.budgetAtRisk', {
            defaultValue: 'Budget closest to its limit: {{name}}.',
            name: [...budgetItems].sort((left, right) => Number(right.progressPct || 0) - Number(left.progressPct || 0))[0]?.budget.name || budgetItems[0].budget.name || args.t('reports.budget'),
          })
        : null,
      busiestDayEntry
        ? args.t('reports.fullReport.observations.busiestDay', {
            defaultValue: 'Busiest spending day: {{date}}.',
            date: toDateLabel(busiestDayEntry[0], args.locale),
          })
        : null,
    ].filter((item): item is string => Boolean(item)),
    budgetChart: {
      data: args.reportData.budgetPerformance.chartRows,
      unavailableReason: args.reportData.budgetPerformance.unavailableReason,
      emptyReason: args.reportData.budgetPerformance.emptyReason,
    },
    reportingCurrency: args.reportData.reportingCurrency,
  } satisfies FullFinancialReportData & { reportingCurrency: string };
}
