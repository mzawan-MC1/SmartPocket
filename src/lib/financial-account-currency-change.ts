export type AccountCurrencyChangeMode = 'correction' | 'conversion';
export type ReportingCurrencyWizardAccountAction = 'keep' | 'correction' | 'conversion';

export type AccountCurrencyChangeConflictType =
  | 'shared_space_account'
  | 'shared_space_transactions'
  | 'independent_currency_transactions'
  | 'recurring_transactions'
  | 'linked_transfers'
  | 'cross_currency_transfers'
  | 'personal_subscriptions'
  | 'reimbursements'
  | 'reimbursement_payments'
  | 'settlements'
  | 'space_contributions'
  | 'active_recurring'
  | 'active_subscriptions';

export interface AccountCurrencyChangeConflictItem {
  type: AccountCurrencyChangeConflictType;
  count: number;
  message: string;
}

export interface AccountCurrencyChangePreview {
  accountId: string;
  logicalAccountId: string;
  accountName: string;
  currentCurrency: string;
  targetCurrency: string;
  currentBalance: number;
  isEmptyAccount: boolean;
  directUpdateAllowed: boolean;
  requiresReplacementAccount: boolean;
  affectedRecordCount: number;
  mixedCurrencyConflict: boolean;
  mixedCurrencyMessage: string | null;
  automationConflict: boolean;
  automationConflictMessage: string | null;
  conflicts: AccountCurrencyChangeConflictItem[];
  exchangeRate: number | null;
  convertedBalance: number | null;
  snapshotId: string | null;
  rateDate: string | null;
  rateTimestamp: string | null;
  rateProvider: string | null;
  roundingAdjustment: number | null;
  roundingMinorUnits: number | null;
  previewToken: string | null;
  previewGeneratedAt: string | null;
  previewExpiresAt: string | null;
}

export interface ApplyAccountCurrencyChangeInput {
  mode: AccountCurrencyChangeMode;
  targetCurrency: string;
  reason: string;
  confirmationChecked?: boolean;
  snapshotId?: string | null;
  previewToken?: string | null;
}

export interface ApplyAccountCurrencyChangeResult {
  logicalAccountId: string;
  oldAccountId: string;
  newAccountId: string | null;
  actionType: 'currency_correction' | 'currency_conversion';
  previousCurrency: string;
  newCurrency: string;
  previousBalance: number;
  resultingBalance: number;
  affectedRecordCount: number;
  directUpdate: boolean;
  auditId: string;
}

export interface AccountCurrencyHistoryItem {
  id: string;
  actionType: 'currency_correction' | 'currency_conversion';
  previousCurrency: string;
  newCurrency: string;
  previousBalance: number;
  resultingBalance: number;
  exchangeRate: number | null;
  rateProvider: string | null;
  rateTimestamp: string | null;
  confirmedAt: string | null;
  createdAt: string;
  currentStatus: 'current' | 'archived';
}

export function normalizeCurrencyCode(value: string | null | undefined) {
  const normalized = (value || '').trim().toUpperCase();
  return normalized.length === 3 ? normalized : '';
}

export function roundAmountForMinorUnits(amount: number, minorUnits: number) {
  const nextMinorUnits = Number.isFinite(minorUnits) ? Math.max(0, Math.min(4, minorUnits)) : 2;
  const factor = 10 ** nextMinorUnits;
  return Math.round(amount * factor) / factor;
}

export interface ReportingCurrencyWizardSelectionInput {
  accountId: string;
  action: ReportingCurrencyWizardAccountAction;
  confirmationChecked?: boolean;
}

export interface ReportingCurrencyWizardAccountOptionState {
  eligible: boolean;
  blockedReason: string | null;
  conflicts: AccountCurrencyChangeConflictItem[];
}

export interface ReportingCurrencyWizardConversionState extends ReportingCurrencyWizardAccountOptionState {
  directUpdateAllowed: boolean;
  requiresReplacementAccount: boolean;
  exchangeRate: number | null;
  convertedBalance: number | null;
  snapshotId: string | null;
  rateDate: string | null;
  rateTimestamp: string | null;
  rateProvider: string | null;
  roundingAdjustment: number | null;
  roundingMinorUnits: number | null;
  previewToken: string | null;
  previewGeneratedAt: string | null;
  previewExpiresAt: string | null;
}

export interface ReportingCurrencyWizardCorrectionState extends ReportingCurrencyWizardAccountOptionState {
  correctedBalance: number;
  confirmationChecked: boolean;
}

export interface ReportingCurrencyWizardAccountReview {
  accountId: string;
  logicalAccountId: string;
  accountName: string;
  accountType: string;
  currentCurrency: string;
  targetCurrency: string;
  currentBalance: number;
  alreadyMatchesTargetCurrency: boolean;
  statusMessage: string | null;
  selectedAction: ReportingCurrencyWizardAccountAction;
  selectionError: string | null;
  keepMessage: string;
  conversion: ReportingCurrencyWizardConversionState;
  correction: ReportingCurrencyWizardCorrectionState;
}

export interface ReportingCurrencyWizardPreview {
  currentReportingCurrency: string;
  newReportingCurrency: string;
  reviewGeneratedAt: string;
  reviewExpiresAt: string;
  batchPreviewToken: string;
  accounts: ReportingCurrencyWizardAccountReview[];
}

export interface ReportingCurrencyWizardAccountResult {
  accountId: string;
  logicalAccountId: string;
  accountName: string;
  action: ReportingCurrencyWizardAccountAction;
  previousCurrency: string;
  resultingCurrency: string;
  previousBalance: number;
  resultingBalance: number;
  archivedPreviousVersion: boolean;
  directUpdate: boolean;
  auditId: string | null;
  newAccountId: string | null;
}

export interface ReportingCurrencyWizardApplyResult {
  previousReportingCurrency: string;
  newReportingCurrency: string;
  convertedAccountsCount: number;
  keptAccountsCount: number;
  correctedAccountsCount: number;
  archivedAccountsCount: number;
  blockedAccountsCount: number;
  changedAccounts: ReportingCurrencyWizardAccountResult[];
}
