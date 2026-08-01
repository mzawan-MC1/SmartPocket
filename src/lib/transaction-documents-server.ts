import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FinancialContext } from '@/lib/ai-types';
import { convertWithSnapshot } from '@/lib/exchange-rates/conversion';
import type { ExchangeRateSnapshotRecord } from '@/lib/exchange-rates/types';
import {
  getTransactionDocumentLineItemValidation,
  getTransactionDocumentLineItemTotal,
  getTransactionDocumentTotalSummary,
  isTransactionDocumentItemKind,
  sanitizeTransactionDocumentFilename,
  TRANSACTION_DOCUMENT_BUCKET,
  transactionDocumentLineItemsHaveValidTotals,
  type TransactionDocumentDuplicateMatch,
  type TransactionDocumentConversionLookupMode,
  type TransactionDocumentManualConversionInput,
  type TransactionDocumentItemKind,
  type TransactionDocumentOptionAccount,
  type TransactionDocumentOptionCategory,
  type TransactionDocumentReviewConversionInput,
  type TransactionDocumentReviewInput,
  type TransactionDocumentSaveRequest,
  type TransactionDocumentSaveResponse,
} from '@/lib/transaction-documents';
import type { ServerExecutionContext } from '@/lib/ai-execution-server';

function normalizeText(value: string | null | undefined) {
  return (value || '').trim();
}

function normalizeCurrency(value: string | null | undefined, fallbackCurrency: string) {
  const normalized = (value || '').trim().toUpperCase();
  return normalized.length === 3 ? normalized : fallbackCurrency;
}

function normalizeDate(value: unknown) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : '';
}

function normalizeAmount(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return NaN;
  }
  return Math.round(value * 100) / 100;
}

function normalizeRate(value: unknown) {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return Math.round(numeric * 1000000) / 1000000;
}

function normalizeDateOrNull(value: unknown) {
  const normalized = normalizeDate(value);
  return normalized || null;
}

function normalizeUuidOrNull(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

function normalizeDuplicateLookupText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function normalizeDuplicateLookupDate(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeDuplicateLookupAmount(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed * 100) / 100;
    }
  }

  return null;
}

function normalizeDuplicateLookupCurrency(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length === 3 ? normalized : null;
}

function hasMeaningfulDuplicateSource(args: {
  merchant?: string | null;
  description?: string | null;
}) {
  return Boolean((args.merchant || '').trim() || (args.description || '').trim());
}

function getDuplicateReasonScore(reason: TransactionDocumentDuplicateMatch['reason']) {
  switch (reason) {
    case 'file_hash':
      return 1;
    case 'receipt_number':
      return 0.95;
    case 'merchant_date_total':
      return 0.9;
    case 'date_total':
      return 0.8;
    case 'merchant_total':
      return 0.7;
    default:
      return 0.5;
  }
}

function sortDuplicateReasons(
  reasons: TransactionDocumentDuplicateMatch['reason'][]
): TransactionDocumentDuplicateMatch['reason'][] {
  return [...reasons].sort((left, right) => getDuplicateReasonScore(right) - getDuplicateReasonScore(left));
}

type DuplicateCandidateDocumentRow = {
  id: string;
  user_id: string;
  primary_transaction_id: string | null;
  merchant_name: string | null;
  document_date: string | null;
  total_amount: number | string | null;
  currency_code: string | null;
  receipt_number: string | null;
  created_at: string | null;
  sha256_hash: string | null;
};

function isDuplicateCandidateDocumentRow(value: unknown): value is DuplicateCandidateDocumentRow {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const row = value as Record<string, unknown>;
  return typeof row.id === 'string'
    && typeof row.user_id === 'string'
    && (typeof row.primary_transaction_id === 'string' || row.primary_transaction_id === null)
    && (typeof row.merchant_name === 'string' || row.merchant_name === null)
    && (typeof row.document_date === 'string' || row.document_date === null)
    && (
      typeof row.total_amount === 'number'
      || typeof row.total_amount === 'string'
      || row.total_amount === null
    )
    && (typeof row.currency_code === 'string' || row.currency_code === null)
    && (typeof row.receipt_number === 'string' || row.receipt_number === null)
    && (typeof row.created_at === 'string' || row.created_at === null)
    && (typeof row.sha256_hash === 'string' || row.sha256_hash === null);
}

function parseDuplicateCandidateDocumentRows(rows: unknown): DuplicateCandidateDocumentRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.filter(isDuplicateCandidateDocumentRow);
}

type DuplicateCandidateJobRow = {
  id: string;
  user_id: string;
  document_id: string;
  status: string | null;
  saved_transaction_ids: unknown;
};

type DuplicateCandidateTransactionRow = {
  id: string;
  user_id: string;
  account_id: string;
  amount: number | string;
  currency: string | null;
  merchant: string | null;
  description: string | null;
  transaction_date: string | null;
  created_at: string | null;
};

type DuplicateCandidateAccountRow = {
  id: string;
  currency: string | null;
};

type DuplicateAggregate = {
  document: DuplicateCandidateDocumentRow;
  transaction: DuplicateCandidateTransactionRow;
  reasons: Set<TransactionDocumentDuplicateMatch['reason']>;
  matchedAt: string | null;
};

type TransactionDocumentDuplicateRefreshRow = {
  id: string;
  user_id: string;
  document_id: string;
  document:
    | {
        id: string;
        user_id: string;
        sha256_hash: string | null;
      }
    | Array<{
        id: string;
        user_id: string;
        sha256_hash: string | null;
      }>
    | null;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numbersMatch(left: number, right: number, tolerance = 0.02) {
  return Math.abs(left - right) <= tolerance;
}

function normalizeTransactionDocumentConversionLookupMode(
  value: unknown
): TransactionDocumentConversionLookupMode | null {
  return value === 'exact'
    || value === 'previous_available'
    || value === 'same_currency'
    || value === 'manual'
      ? value
      : null;
}

function normalizeTransactionDocumentManualConversionInput(
  value: unknown
): TransactionDocumentManualConversionInput | null {
  return value === 'exchange_rate' || value === 'converted_amount' ? value : null;
}

function sanitizeTransactionDocumentReviewConversionInput(args: {
  rawConversion: unknown;
  amount: number;
  currency: string;
  accountCurrency: string;
}) {
  if (!isObject(args.rawConversion)) {
    return null;
  }

  const source = args.rawConversion.source === 'manual' ? 'manual' : 'automatic';
  const originalAmount = normalizeAmount(args.rawConversion.originalAmount);
  const originalCurrency = normalizeCurrency(
    typeof args.rawConversion.originalCurrency === 'string' ? args.rawConversion.originalCurrency : args.currency,
    args.currency
  );
  const accountCurrency = normalizeCurrency(
    typeof args.rawConversion.accountCurrency === 'string' ? args.rawConversion.accountCurrency : args.accountCurrency,
    args.accountCurrency
  );
  const convertedAmount = normalizeAmount(args.rawConversion.convertedAmount);
  const exchangeRate = (() => {
    const value = normalizeRate(args.rawConversion.exchangeRate);
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  })();

  return {
    source,
    originalAmount: Number.isFinite(originalAmount) ? originalAmount : args.amount,
    originalCurrency,
    accountCurrency,
    convertedAmount: Number.isFinite(convertedAmount) ? convertedAmount : NaN,
    exchangeRate,
    rateDate: normalizeDateOrNull(args.rawConversion.rateDate),
    snapshotId: normalizeUuidOrNull(args.rawConversion.snapshotId),
    provider: normalizeText(typeof args.rawConversion.provider === 'string' ? args.rawConversion.provider : ''),
    rateTimestamp:
      typeof args.rawConversion.rateTimestamp === 'string' && args.rawConversion.rateTimestamp.trim()
        ? args.rawConversion.rateTimestamp.trim()
        : null,
    lookupMode: normalizeTransactionDocumentConversionLookupMode(args.rawConversion.lookupMode),
    manualInput: normalizeTransactionDocumentManualConversionInput(args.rawConversion.manualInput),
  } satisfies TransactionDocumentReviewConversionInput;
}

function mapExchangeRateSnapshotRecord(row: Record<string, unknown>): ExchangeRateSnapshotRecord {
  return {
    id: String(row.id),
    provider: String(row.provider || ''),
    base_currency: String(row.base_currency || ''),
    rate_date: String(row.rate_date || ''),
    fetched_at: String(row.fetched_at || ''),
    provider_timestamp: typeof row.provider_timestamp === 'string' ? row.provider_timestamp : null,
    rates: isObject(row.rates) ? row.rates as Record<string, number> : {},
    is_latest: Boolean(row.is_latest),
    status: String(row.status || ''),
    created_at: String(row.created_at || ''),
  };
}

async function resolveTransactionDocumentReviewConversion(args: {
  admin: SupabaseClient;
  transaction: TransactionDocumentReviewInput;
  account: TransactionDocumentOptionAccount;
}) {
  const originalAmount = normalizeAmount(args.transaction.amount);
  const originalCurrency = normalizeCurrency(args.transaction.currency, args.account.currency);
  const accountCurrency = normalizeCurrency(args.account.currency, args.account.currency);

  if (!Number.isFinite(originalAmount) || originalAmount <= 0) {
    throw new Error('Each reviewed transaction must include a valid amount.');
  }

  if (originalCurrency === accountCurrency) {
    return {
      ...args.transaction,
      conversion: null,
    } satisfies TransactionDocumentReviewInput;
  }

  const conversion = args.transaction.conversion;
  if (!conversion) {
    throw new Error('Cross-currency receipt conversion details are required before saving.');
  }

  if (
    conversion.originalCurrency !== originalCurrency
    || conversion.accountCurrency !== accountCurrency
    || !numbersMatch(conversion.originalAmount, originalAmount, 0.000001)
  ) {
    throw new Error('Cross-currency receipt conversion details are required before saving.');
  }

  if (conversion.source === 'automatic') {
    if (!conversion.snapshotId) {
      throw new Error('Automatic receipt conversion data is invalid.');
    }

    const { data: snapshotRow, error: snapshotError } = await args.admin
      .from('exchange_rate_snapshots')
      .select('*')
      .eq('id', conversion.snapshotId)
      .eq('status', 'success')
      .limit(1)
      .maybeSingle();

    if (snapshotError || !snapshotRow || !isObject(snapshotRow)) {
      throw new Error('Automatic receipt conversion data is invalid.');
    }

    const snapshot = mapExchangeRateSnapshotRecord(snapshotRow);
    const resolved = convertWithSnapshot({
      amount: originalAmount,
      fromCurrency: originalCurrency,
      toCurrency: accountCurrency,
      snapshot,
      lookupMode: conversion.lookupMode === 'previous_available' ? 'previous_available' : 'exact',
    });
    const convertedAmount = normalizeAmount(resolved.convertedAmount);

    if (!Number.isFinite(convertedAmount) || convertedAmount <= 0) {
      throw new Error('Cross-currency receipt conversion requires a valid converted amount.');
    }

    if (!numbersMatch(conversion.convertedAmount, convertedAmount)) {
      throw new Error('Automatic receipt conversion data is invalid.');
    }

    return {
      ...args.transaction,
      conversion: {
        source: 'automatic',
        originalAmount,
        originalCurrency,
        accountCurrency,
        convertedAmount,
        exchangeRate: resolved.rateUsed,
        rateDate: resolved.rateDate,
        snapshotId: snapshot.id,
        provider: resolved.provider,
        rateTimestamp: resolved.providerTimestamp || resolved.fetchedAt,
        lookupMode: resolved.lookupMode === 'previous_available' ? 'previous_available' : 'exact',
        manualInput: null,
      },
    } satisfies TransactionDocumentReviewInput;
  }

  const manualConvertedAmount = normalizeAmount(conversion.convertedAmount);
  if (!Number.isFinite(manualConvertedAmount) || manualConvertedAmount <= 0) {
    throw new Error('Cross-currency receipt conversion requires a valid converted amount.');
  }

  let manualExchangeRate = conversion.exchangeRate;
  if (!(typeof manualExchangeRate === 'number' && Number.isFinite(manualExchangeRate) && manualExchangeRate > 0)) {
    manualExchangeRate = originalAmount > 0
      ? normalizeRate(manualConvertedAmount / originalAmount)
      : null;
  }

  if (!(typeof manualExchangeRate === 'number' && Number.isFinite(manualExchangeRate) && manualExchangeRate > 0)) {
    throw new Error('Cross-currency receipt conversion requires a valid exchange rate.');
  }

  const expectedConvertedAmount = normalizeAmount(originalAmount * manualExchangeRate);
  if (!Number.isFinite(expectedConvertedAmount) || expectedConvertedAmount <= 0) {
    throw new Error('Cross-currency receipt conversion requires a valid converted amount.');
  }

  if (!numbersMatch(expectedConvertedAmount, manualConvertedAmount)) {
    throw new Error('Manual receipt conversion data is invalid.');
  }

  return {
    ...args.transaction,
    conversion: {
      source: 'manual',
      originalAmount,
      originalCurrency,
      accountCurrency,
      convertedAmount: manualConvertedAmount,
      exchangeRate: manualExchangeRate,
      rateDate: conversion.rateDate || args.transaction.transactionDate || null,
      snapshotId: null,
      provider: null,
      rateTimestamp: null,
      lookupMode: 'manual',
      manualInput: conversion.manualInput || 'converted_amount',
    },
  } satisfies TransactionDocumentReviewInput;
}

export async function resolveTransactionDocumentSaveRequestPayload(args: {
  admin: SupabaseClient;
  payload: TransactionDocumentSaveRequest;
  accounts: TransactionDocumentOptionAccount[];
}) {
  const transactions = await Promise.all(args.payload.transactions.map(async (transaction) => {
    const account = args.accounts.find((item) => item.id === transaction.accountId);
    if (!account) {
      throw new Error('Each reviewed transaction must use a valid account.');
    }

    return resolveTransactionDocumentReviewConversion({
      admin: args.admin,
      transaction,
      account,
    });
  }));

  return {
    ...args.payload,
    transactions,
  } satisfies TransactionDocumentSaveRequest;
}

export function requireAdminClient() {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for transaction document processing');
  }
  return admin;
}

export function buildTransactionDocumentStoragePath(args: {
  userId: string;
  documentId: string;
  fileName: string;
}) {
  const safeName = sanitizeTransactionDocumentFilename(args.fileName);
  return `${args.userId}/transaction-documents/${args.documentId}/${safeName}`;
}

export function mapDocumentOptionsFromContext(context: ServerExecutionContext) {
  const accounts: TransactionDocumentOptionAccount[] = context.accounts.map((account) => ({
    id: account.id,
    name: account.name,
    account_type: account.account_type,
    currency: account.currency,
    is_active: account.is_active,
    ownership_type: account.ownership_type || null,
    is_system_default: account.is_system_default || false,
    system_default_type: account.system_default_type || null,
  }));

  const categories: TransactionDocumentOptionCategory[] = context.categories
    .filter((category) => category.category_type === 'income' || category.category_type === 'expense')
    .map((category) => ({
      id: category.id,
      name: category.name,
      category_type: category.category_type,
      is_system: category.is_system,
    }));

  return {
    accounts,
    categories,
    defaultCurrency: context.defaultCurrency,
  };
}

export function mapTransactionDocumentAIContext(context: ServerExecutionContext): FinancialContext {
  return {
    categories: context.categories
      .filter((category) => category.category_type === 'income' || category.category_type === 'expense')
      .map((category) => ({
        id: category.id,
        name: category.name,
        type: category.category_type,
      })),
    defaultCurrency: context.defaultCurrency,
  };
}

export function findSuggestedCategoryId(args: {
  categories: TransactionDocumentOptionCategory[];
  suggestion?: string | null;
  transactionType: 'income' | 'expense';
}) {
  const suggestion = normalizeText(args.suggestion);
  if (!suggestion) return null;

  const normalizedSuggestion = suggestion.toLowerCase();
  const exact = args.categories.find(
    (category) =>
      category.category_type === args.transactionType &&
      normalizeText(category.name).toLowerCase() === normalizedSuggestion
  );
  if (exact) return exact.id;

  const partial = args.categories.find(
    (category) =>
      category.category_type === args.transactionType &&
      normalizeText(category.name).toLowerCase().includes(normalizedSuggestion)
  );
  return partial?.id || null;
}

export async function createSignedTransactionDocumentPreview(args: {
  admin: SupabaseClient;
  path: string;
}) {
  const { data, error } = await args.admin.storage
    .from(TRANSACTION_DOCUMENT_BUCKET)
    .createSignedUrl(args.path, 60 * 30);
  if (error || !data?.signedUrl) {
    const previewError = error || new Error('Failed to create signed preview URL');
    Object.assign(previewError, { code: 'signed_url_failure' as const });
    throw previewError;
  }
  return data.signedUrl;
}

export async function findDuplicateTransactionDocuments(args: {
  admin: SupabaseClient;
  userId: string;
  fileHash: string;
  currentDocumentId?: string | null;
  mode?: 'full' | 'final_recheck';
  extractedTransactions: Array<{
    merchant?: string | null;
    date?: string | null;
    total?: number | null;
    currency?: string | null;
    receiptNumber?: string | null;
  }>;
}): Promise<TransactionDocumentDuplicateMatch[]> {
  const currentDocumentId = (args.currentDocumentId || '').trim();
  const mode = args.mode || 'full';
  const candidateDocuments = new Map<string, DuplicateCandidateDocumentRow>();
  const uploadReceiptNumbers = new Set<string>();
  const uploadMerchantDateTotalKeys = new Set<string>();
  const uploadDateTotalKeys = new Set<string>();

  const addDocuments = (rows: DuplicateCandidateDocumentRow[] | null | undefined) => {
    for (const row of rows || []) {
      if (!row?.id || row.user_id !== args.userId || row.id === currentDocumentId) {
        continue;
      }
      candidateDocuments.set(row.id, row);
    }
  };

  const candidateDocumentSelect = [
    'id',
    'user_id',
    'primary_transaction_id',
    'merchant_name',
    'document_date',
    'total_amount',
    'currency_code',
    'receipt_number',
    'created_at',
    'sha256_hash',
  ].join(', ');

  const createCandidateDocumentQuery = () => args.admin
    .from('transaction_documents')
    .select(candidateDocumentSelect)
    .eq('user_id', args.userId);

  for (const candidate of args.extractedTransactions) {
    const merchant = normalizeText(candidate.merchant);
    const date = normalizeDate(candidate.date);
    const receiptNumber = normalizeText(candidate.receiptNumber);
    const total = typeof candidate.total === 'number' && Number.isFinite(candidate.total)
      ? Math.round(candidate.total * 100) / 100
      : null;

    if (receiptNumber) {
      uploadReceiptNumbers.add(normalizeDuplicateLookupText(receiptNumber));
    }

    if (merchant && date && total !== null) {
      uploadMerchantDateTotalKeys.add(
        `${normalizeDuplicateLookupText(merchant)}|${date}|${total.toFixed(2)}`
      );
    }

    if (date && total !== null && (merchant || receiptNumber)) {
      uploadDateTotalKeys.add(`${date}|${total.toFixed(2)}`);
    }
  }

  const exactReceiptNumbers = Array.from(
    new Set(
      args.extractedTransactions
        .map((transaction) => normalizeText(transaction.receiptNumber))
        .filter((value): value is string => Boolean(value))
    )
  );
  const merchantDateTotalQueries = Array.from(uploadMerchantDateTotalKeys).map((key) => {
    const [merchant = '', date = '', total = ''] = key.split('|');
    return createCandidateDocumentQuery()
      .eq('merchant_name', merchant)
      .eq('document_date', date)
      .eq('total_amount', Number(total))
      .limit(25);
  });
  const dateTotalQueries = Array.from(uploadDateTotalKeys).map((key) => {
    const [date = '', total = ''] = key.split('|');
    return createCandidateDocumentQuery()
      .eq('document_date', date)
      .eq('total_amount', Number(total))
      .limit(25);
  });
  const candidateQueries = [
    args.fileHash
      ? createCandidateDocumentQuery()
          .eq('sha256_hash', args.fileHash)
          .limit(25)
      : null,
    exactReceiptNumbers.length > 0
      ? createCandidateDocumentQuery()
          .in('receipt_number', exactReceiptNumbers)
          .limit(50)
      : null,
    ...merchantDateTotalQueries,
    ...dateTotalQueries,
  ].filter((query): query is ReturnType<typeof createCandidateDocumentQuery> => Boolean(query));

  if (candidateQueries.length > 0) {
    const candidateResults = await Promise.all(candidateQueries);
    for (const result of candidateResults) {
      if (result.error) {
        throw result.error;
      }
      addDocuments(parseDuplicateCandidateDocumentRows(result.data));
    }
  }

  const documentIds = Array.from(candidateDocuments.keys());
  if (documentIds.length === 0) {
    return [];
  }

  if (mode === 'final_recheck') {
    const lightweightMatches: Array<TransactionDocumentDuplicateMatch | null> = Array.from(candidateDocuments.values())
      .map((document) => {
        const reasons = new Set<TransactionDocumentDuplicateMatch['reason']>();
        const merchant = normalizeText(document.merchant_name) || null;
        const date = normalizeDate(document.document_date) || null;
        const amount = normalizeDuplicateLookupAmount(document.total_amount);
        const normalizedMerchant = normalizeDuplicateLookupText(merchant);
        const normalizedDate = normalizeDuplicateLookupDate(date);
        const normalizedAmount = typeof amount === 'number' ? amount.toFixed(2) : '';
        const normalizedReceiptNumber = normalizeDuplicateLookupText(document.receipt_number);

        if (document.sha256_hash && document.sha256_hash === args.fileHash) {
          reasons.add('file_hash');
        }
        if (normalizedReceiptNumber && uploadReceiptNumbers.has(normalizedReceiptNumber)) {
          reasons.add('receipt_number');
        }
        if (
          normalizedMerchant
          && normalizedDate
          && normalizedAmount
          && uploadMerchantDateTotalKeys.has(`${normalizedMerchant}|${normalizedDate}|${normalizedAmount}`)
        ) {
          reasons.add('merchant_date_total');
        }
        if (
          normalizedDate
          && normalizedAmount
          && uploadDateTotalKeys.has(`${normalizedDate}|${normalizedAmount}`)
        ) {
          reasons.add('date_total');
        }

        if (reasons.size === 0) {
          return null;
        }

        const sortedReasons = sortDuplicateReasons(Array.from(reasons));
        const primaryReason = sortedReasons[0];
        return {
          documentId: document.id,
          transactionId: document.primary_transaction_id || null,
          reason: primaryReason,
          reasons: sortedReasons,
          score: getDuplicateReasonScore(primaryReason),
          merchant,
          description: null,
          date,
          total: amount,
          currency: normalizeDuplicateLookupCurrency(document.currency_code),
          receiptNumber: normalizeText(document.receipt_number) || null,
          matchedAt: document.created_at,
        } satisfies TransactionDocumentDuplicateMatch;
      })
    return lightweightMatches
      .filter((match): match is TransactionDocumentDuplicateMatch => match !== null)
      .sort((left, right) => {
        const scoreDifference = (right.score || 0) - (left.score || 0);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }
        return (right.matchedAt || '').localeCompare(left.matchedAt || '');
      });
  }

  const { data: jobData, error: jobError } = await args.admin
    .from('document_extraction_jobs')
    .select('id, user_id, document_id, status, saved_transaction_ids')
    .eq('user_id', args.userId)
    .in('document_id', documentIds);

  if (jobError) {
    throw jobError;
  }

  const jobsByDocumentId = new Map<string, DuplicateCandidateJobRow[]>();
  const candidateTransactionIds = new Set<string>();

  for (const job of ((jobData || []) as DuplicateCandidateJobRow[])) {
    if (!documentIds.includes(job.document_id) || job.user_id !== args.userId) {
      continue;
    }

    const current = jobsByDocumentId.get(job.document_id) || [];
    current.push(job);
    jobsByDocumentId.set(job.document_id, current);

    if (job.status === 'saved' && Array.isArray(job.saved_transaction_ids)) {
      for (const transactionId of job.saved_transaction_ids) {
        if (typeof transactionId === 'string' && transactionId.trim()) {
          candidateTransactionIds.add(transactionId.trim());
        }
      }
    }
  }

  for (const document of candidateDocuments.values()) {
    if (document.primary_transaction_id) {
      candidateTransactionIds.add(document.primary_transaction_id);
    }
  }

  const transactionIds = Array.from(candidateTransactionIds);
  if (transactionIds.length === 0) {
    return [];
  }

  const { data: transactionData, error: transactionError } = await args.admin
    .from('transactions')
    .select('id, user_id, account_id, amount, currency, merchant, description, transaction_date, created_at')
    .eq('user_id', args.userId)
    .in('id', transactionIds);

  if (transactionError) {
    throw transactionError;
  }

  const activeTransactions = new Map<string, DuplicateCandidateTransactionRow>();
  const accountIds = new Set<string>();

  for (const transaction of ((transactionData || []) as DuplicateCandidateTransactionRow[])) {
    if (!transaction?.id || transaction.user_id !== args.userId) {
      continue;
    }
    activeTransactions.set(transaction.id, transaction);
    accountIds.add(transaction.account_id);
  }

  if (activeTransactions.size === 0) {
    return [];
  }

  const { data: accountData, error: accountError } = accountIds.size > 0
    ? await args.admin
        .from('financial_accounts')
        .select('id, currency')
        .eq('user_id', args.userId)
        .in('id', Array.from(accountIds))
    : { data: [], error: null };

  if (accountError) {
    throw accountError;
  }

  const accountsById = new Map<string, DuplicateCandidateAccountRow>(
    ((accountData || []) as DuplicateCandidateAccountRow[]).map((account) => [account.id, account])
  );

  const aggregates = new Map<string, DuplicateAggregate>();

  for (const document of candidateDocuments.values()) {
    const linkedTransactionIds = new Set<string>();

    if (document.primary_transaction_id) {
      linkedTransactionIds.add(document.primary_transaction_id);
    }

    for (const job of jobsByDocumentId.get(document.id) || []) {
      if (job.status !== 'saved' || !Array.isArray(job.saved_transaction_ids)) {
        continue;
      }

      for (const transactionId of job.saved_transaction_ids) {
        if (typeof transactionId === 'string' && transactionId.trim()) {
          linkedTransactionIds.add(transactionId.trim());
        }
      }
    }

    for (const linkedTransactionId of linkedTransactionIds) {
      const transaction = activeTransactions.get(linkedTransactionId);
      if (!transaction) {
        continue;
      }

      const merchant = normalizeText(transaction.merchant) || normalizeText(document.merchant_name) || null;
      const description = normalizeText(transaction.description) || null;
      const date = normalizeDate(transaction.transaction_date) || normalizeDate(document.document_date) || null;
      const amount = normalizeDuplicateLookupAmount(transaction.amount)
        ?? normalizeDuplicateLookupAmount(document.total_amount);
      const receiptNumber = normalizeText(document.receipt_number) || null;
      if (!(typeof amount === 'number' && Number.isFinite(amount) && amount > 0)) {
        continue;
      }

      if (!hasMeaningfulDuplicateSource({ merchant, description })) {
        continue;
      }

      if (!date && !receiptNumber) {
        continue;
      }

      const candidateReasons = new Set<TransactionDocumentDuplicateMatch['reason']>();
      const normalizedMerchant = normalizeDuplicateLookupText(merchant);
      const normalizedDate = normalizeDuplicateLookupDate(date);
      const normalizedAmount = amount.toFixed(2);
      const normalizedReceiptNumber = normalizeDuplicateLookupText(receiptNumber);

      if (document.sha256_hash && document.sha256_hash === args.fileHash) {
        candidateReasons.add('file_hash');
      }

      if (normalizedReceiptNumber && uploadReceiptNumbers.has(normalizedReceiptNumber)) {
        candidateReasons.add('receipt_number');
      }

      if (
        normalizedMerchant
        && normalizedDate
        && uploadMerchantDateTotalKeys.has(`${normalizedMerchant}|${normalizedDate}|${normalizedAmount}`)
      ) {
        candidateReasons.add('merchant_date_total');
      }

      if (
        normalizedDate
        && uploadDateTotalKeys.has(`${normalizedDate}|${normalizedAmount}`)
      ) {
        candidateReasons.add('date_total');
      }

      if (candidateReasons.size === 0) {
        continue;
      }

      const existing = aggregates.get(transaction.id);
      if (existing) {
        for (const reason of candidateReasons) {
          existing.reasons.add(reason);
        }
        continue;
      }

      aggregates.set(transaction.id, {
        document,
        transaction,
        reasons: candidateReasons,
        matchedAt: transaction.created_at || document.created_at,
      });
    }
  }

  return Array.from(aggregates.values())
    .map((entry) => {
      const reasons = sortDuplicateReasons(Array.from(entry.reasons));
      const transactionAmount = normalizeDuplicateLookupAmount(entry.transaction.amount);
      const documentAmount = normalizeDuplicateLookupAmount(entry.document.total_amount);
      const currency = normalizeDuplicateLookupCurrency(entry.transaction.currency)
        || normalizeDuplicateLookupCurrency(accountsById.get(entry.transaction.account_id)?.currency)
        || normalizeDuplicateLookupCurrency(entry.document.currency_code);
      const merchant = normalizeText(entry.transaction.merchant)
        || normalizeText(entry.document.merchant_name)
        || null;
      const description = normalizeText(entry.transaction.description) || null;
      const date = normalizeDate(entry.transaction.transaction_date)
        || normalizeDate(entry.document.document_date)
        || null;
      const receiptNumber = normalizeText(entry.document.receipt_number) || null;
      const primaryReason = reasons[0];

      return {
        documentId: entry.document.id,
        transactionId: entry.transaction.id,
        reason: primaryReason,
        reasons,
        score: getDuplicateReasonScore(primaryReason),
        merchant,
        description,
        date,
        total: transactionAmount ?? documentAmount,
        currency,
        receiptNumber,
        matchedAt: entry.matchedAt,
      } satisfies TransactionDocumentDuplicateMatch;
    })
    .sort((left, right) => {
      const scoreDifference = (right.score || 0) - (left.score || 0);
      if (scoreDifference !== 0) {
        return scoreDifference;
      }
      return (right.matchedAt || '').localeCompare(left.matchedAt || '');
    });
}

export async function refreshTransactionDocumentDuplicateMatches(args: {
  admin: SupabaseClient;
  userId: string;
  jobId: string;
  extractedTransactions: Array<{
    merchant?: string | null;
    date?: string | null;
    total?: number | null;
    currency?: string | null;
    receiptNumber?: string | null;
  }>;
}) {
  const { data, error } = await args.admin
    .from('document_extraction_jobs')
    .select(`
      id,
      user_id,
      document_id,
      document:transaction_documents!inner(
        id,
        user_id,
        sha256_hash
      )
    `)
    .eq('id', args.jobId)
    .eq('user_id', args.userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = (data || null) as TransactionDocumentDuplicateRefreshRow | null;
  const documentRecord = Array.isArray(row?.document)
    ? row.document[0]
    : row?.document;

  if (!row || row.user_id !== args.userId || !documentRecord || documentRecord.user_id !== args.userId) {
    return null;
  }

  const duplicates = await findDuplicateTransactionDocuments({
    admin: args.admin,
    userId: args.userId,
    fileHash: documentRecord.sha256_hash || '',
    currentDocumentId: row.document_id,
    mode: 'final_recheck',
    extractedTransactions: args.extractedTransactions,
  });

  const { error: updateError } = await args.admin
    .from('document_extraction_jobs')
    .update({
      duplicate_matches: duplicates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('user_id', args.userId);

  if (updateError) {
    throw updateError;
  }

  return {
    documentId: row.document_id,
    duplicates,
  };
}

export function sanitizeTransactionDocumentReviewPayload(args: {
  rawTransactions: unknown;
  accounts: TransactionDocumentOptionAccount[];
  categories: TransactionDocumentOptionCategory[];
  defaultCurrency: string;
}) {
  if (!Array.isArray(args.rawTransactions) || args.rawTransactions.length === 0) {
    throw new Error('At least one reviewed transaction is required.');
  }

  return args.rawTransactions.map((rawItem) => {
    if (!isObject(rawItem)) {
      throw new Error('Invalid reviewed transaction payload.');
    }

    const transactionType = rawItem.transactionType === 'income' ? 'income' : 'expense';
    const amount = normalizeAmount(rawItem.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Each reviewed transaction must include a valid amount.');
    }

    const accountId = normalizeText(typeof rawItem.accountId === 'string' ? rawItem.accountId : '');
    const account = args.accounts.find((item) => item.id === accountId);
    if (!account) {
      throw new Error('Each reviewed transaction must use a valid account.');
    }

    const transactionDate = normalizeDate(rawItem.transactionDate);
    if (!transactionDate) {
      throw new Error('Each reviewed transaction must include a valid date.');
    }

    const currency = normalizeCurrency(
      typeof rawItem.currency === 'string' ? rawItem.currency : account.currency,
      account.currency || args.defaultCurrency
    );
    const categoryId = normalizeText(
      typeof rawItem.categoryId === 'string' ? rawItem.categoryId : ''
    );
    const category = categoryId
      ? args.categories.find((item) => item.id === categoryId)
      : null;
    if (category && category.category_type !== transactionType) {
      throw new Error('Selected category does not match the reviewed transaction type.');
    }

    const description = normalizeText(typeof rawItem.description === 'string' ? rawItem.description : '')
      || normalizeText(typeof rawItem.merchant === 'string' ? rawItem.merchant : '')
      || 'Document transaction';

    const lineItems = Array.isArray(rawItem.lineItems)
      ? rawItem.lineItems
          .filter(isObject)
          .map((lineItem) => {
            const itemCategoryId = normalizeText(
              typeof lineItem.categoryId === 'string' ? lineItem.categoryId : ''
            );
            const itemCategory = itemCategoryId
              ? args.categories.find((item) => item.id === itemCategoryId)
              : null;
            if (itemCategory && itemCategory.category_type !== transactionType) {
              throw new Error('Selected category does not match the reviewed transaction type.');
            }

            const sanitizedItemKind: TransactionDocumentItemKind = isTransactionDocumentItemKind(lineItem.itemKind)
              ? lineItem.itemKind
              : 'regular';

            const quantity = (() => {
              const value = normalizeAmount(lineItem.quantity);
              return Number.isFinite(value) ? value : null;
            })();
            const unitPrice = (() => {
              const value = normalizeAmount(lineItem.unitPrice);
              return Number.isFinite(value) ? value : null;
            })();
            const providedTotal = (() => {
              const value = normalizeAmount(lineItem.total);
              return Number.isFinite(value) ? value : null;
            })();
            const computedTotal = getTransactionDocumentLineItemTotal({
              quantity,
              unitPrice,
              total: providedTotal,
            });
            const lineItemValidation = getTransactionDocumentLineItemValidation({
              name: typeof lineItem.name === 'string' ? lineItem.name : '',
              quantity,
              unitPrice,
              total: providedTotal,
            });
            if (!lineItemValidation.hasName) {
              throw new Error('Each reviewed line item must have a name.');
            }
            if (!lineItemValidation.hasValidTotal) {
              throw new Error('Each reviewed line item must have a valid total.');
            }

            return {
              name: normalizeText(typeof lineItem.name === 'string' ? lineItem.name : '') || '',
              description: normalizeText(typeof lineItem.description === 'string' ? lineItem.description : ''),
              quantity,
              unitPrice,
              total: computedTotal,
              categoryId: itemCategory?.id || null,
              itemKind: sanitizedItemKind,
            };
          })
      : [];

    if (!transactionDocumentLineItemsHaveValidTotals(lineItems)) {
      throw new Error('Reviewed line item total differs from quantity x unit price by more than the allowed tolerance.');
    }

    const totalSummary = getTransactionDocumentTotalSummary({
      amount,
      tax: (() => {
        const value = normalizeAmount(rawItem.tax);
        return Number.isFinite(value) ? value : null;
      })(),
      lineItems,
    });
    const totalsConfirmed = rawItem.totalsConfirmed === true;
    if (totalSummary.requiresConfirmation && !totalsConfirmed) {
      throw new Error('Confirm the receipt total mismatch before saving.');
    }

    const sanitized: TransactionDocumentReviewInput = {
      transactionType,
      merchant: normalizeText(typeof rawItem.merchant === 'string' ? rawItem.merchant : ''),
      transactionDate,
      amount,
      tax: (() => {
        const value = normalizeAmount(rawItem.tax);
        return Number.isFinite(value) ? value : null;
      })(),
      currency,
      accountId: account.id,
      categoryId: category?.id || null,
      categorySuggestion: normalizeText(
        typeof rawItem.categorySuggestion === 'string' ? rawItem.categorySuggestion : ''
      ),
      description,
      notes: normalizeText(typeof rawItem.notes === 'string' ? rawItem.notes : ''),
      receiptNumber: normalizeText(typeof rawItem.receiptNumber === 'string' ? rawItem.receiptNumber : ''),
      lineItems,
      totalsConfirmed,
      conversion: sanitizeTransactionDocumentReviewConversionInput({
        rawConversion: rawItem.conversion,
        amount,
        currency,
        accountCurrency: account.currency,
      }),
    };

    return sanitized;
  });
}

export function sanitizeTransactionDocumentSaveRequestPayload(args: {
  rawPayload: unknown;
  accounts: TransactionDocumentOptionAccount[];
  categories: TransactionDocumentOptionCategory[];
  defaultCurrency: string;
}): TransactionDocumentSaveRequest {
  if (!isObject(args.rawPayload)) {
    throw new Error('Invalid reviewed transaction payload.');
  }

  const jobId = normalizeText(
    typeof args.rawPayload.jobId === 'string' ? args.rawPayload.jobId : ''
  );
  if (!jobId) {
    throw new Error('A document extraction job id is required.');
  }

  return {
    jobId,
    duplicateConfirmed: args.rawPayload.duplicateConfirmed === true,
    transactions: sanitizeTransactionDocumentReviewPayload({
      rawTransactions: args.rawPayload.transactions,
      accounts: args.accounts,
      categories: args.categories,
      defaultCurrency: args.defaultCurrency,
    }),
  };
}

function normalizeSavedTransactionIds(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

export async function loadSavedTransactionDocumentReviewResult(args: {
  admin: SupabaseClient;
  userId: string;
  jobId: string;
}): Promise<TransactionDocumentSaveResponse | null> {
  const { data, error } = await args.admin
    .from('document_extraction_jobs')
    .select(`
      id,
      status,
      saved_transaction_ids,
      document_id,
      document:transaction_documents!inner(
        id,
        user_id,
        status,
        primary_transaction_id,
        linked_transaction_count
      )
    `)
    .eq('id', args.jobId)
    .eq('user_id', args.userId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const documentRecord = Array.isArray(data?.document)
    ? data.document[0]
    : data?.document;
  if (!data || !documentRecord || documentRecord.user_id !== args.userId) {
    return null;
  }

  const transactionIds = normalizeSavedTransactionIds(data.saved_transaction_ids);
  const { data: activeTransactionRows, error: activeTransactionError } = transactionIds.length > 0
    ? await args.admin
        .from('transactions')
        .select('id')
        .eq('user_id', args.userId)
        .in('id', transactionIds)
    : { data: [], error: null };

  if (activeTransactionError) {
    throw activeTransactionError;
  }

  const activeTransactionIds = new Set(
    ((activeTransactionRows || []) as Array<{ id: string }>).map((transaction) => transaction.id)
  );
  const filteredTransactionIds = transactionIds.filter((transactionId) => activeTransactionIds.has(transactionId));
  const isSaved = data.status === 'saved' || documentRecord.status === 'saved';
  if (!isSaved || filteredTransactionIds.length === 0) {
    return null;
  }

  return {
    success: true,
    jobId: data.id,
    documentId: documentRecord.id,
    primaryTransactionId: typeof documentRecord.primary_transaction_id === 'string'
      && activeTransactionIds.has(documentRecord.primary_transaction_id)
      ? documentRecord.primary_transaction_id
      : null,
    transactionIds: filteredTransactionIds,
    savedCount: typeof documentRecord.linked_transaction_count === 'number'
      ? documentRecord.linked_transaction_count
      : filteredTransactionIds.length,
  };
}
