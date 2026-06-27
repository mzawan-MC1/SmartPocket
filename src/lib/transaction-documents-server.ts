import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  getTransactionDocumentLineItemValidation,
  getTransactionDocumentLineItemTotal,
  getTransactionDocumentTotalSummary,
  isTransactionDocumentItemKind,
  sanitizeTransactionDocumentFilename,
  TRANSACTION_DOCUMENT_BUCKET,
  transactionDocumentLineItemsHaveValidTotals,
  type TransactionDocumentDuplicateMatch,
  type TransactionDocumentItemKind,
  type TransactionDocumentOptionAccount,
  type TransactionDocumentOptionCategory,
  type TransactionDocumentReviewInput,
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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  extractedTransactions: Array<{
    merchant?: string | null;
    date?: string | null;
    total?: number | null;
    currency?: string | null;
    receiptNumber?: string | null;
  }>;
}): Promise<TransactionDocumentDuplicateMatch[]> {
  const matches: TransactionDocumentDuplicateMatch[] = [];
  const seenKeys = new Set<string>();

  const pushMatch = (match: TransactionDocumentDuplicateMatch) => {
    const key = `${match.documentId}:${match.reason}:${match.transactionId || ''}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    matches.push(match);
  };

  const { data: hashMatches, error: hashError } = await args.admin
    .from('transaction_documents')
    .select('id, primary_transaction_id, merchant_name, document_date, total_amount, currency_code, receipt_number, created_at, primary_transaction:transactions(description)')
    .eq('user_id', args.userId)
    .eq('sha256_hash', args.fileHash)
    .limit(5);

  if (hashError) {
    throw hashError;
  }

  for (const row of hashMatches || []) {
    pushMatch({
      documentId: row.id,
      transactionId: row.primary_transaction_id,
      reason: 'file_hash',
      merchant: row.merchant_name,
      description: typeof row.primary_transaction === 'object' && row.primary_transaction !== null && 'description' in row.primary_transaction
        ? String(row.primary_transaction.description || '')
        : null,
      date: row.document_date,
      total: typeof row.total_amount === 'number' ? row.total_amount : Number(row.total_amount || 0),
      currency: row.currency_code,
      receiptNumber: row.receipt_number,
      matchedAt: row.created_at,
    });
  }

  for (const candidate of args.extractedTransactions) {
    const merchant = normalizeText(candidate.merchant);
    const date = normalizeText(candidate.date);
    const receiptNumber = normalizeText(candidate.receiptNumber);
    const total = typeof candidate.total === 'number' ? candidate.total : null;

    if (receiptNumber) {
      const { data, error } = await args.admin
        .from('transaction_documents')
        .select('id, primary_transaction_id, merchant_name, document_date, total_amount, currency_code, receipt_number, created_at, primary_transaction:transactions(description)')
        .eq('user_id', args.userId)
        .eq('receipt_number', receiptNumber)
        .limit(5);
      if (error) throw error;
      for (const row of data || []) {
        pushMatch({
          documentId: row.id,
          transactionId: row.primary_transaction_id,
          reason: 'receipt_number',
          merchant: row.merchant_name,
          description: typeof row.primary_transaction === 'object' && row.primary_transaction !== null && 'description' in row.primary_transaction
            ? String(row.primary_transaction.description || '')
            : null,
          date: row.document_date,
          total: typeof row.total_amount === 'number' ? row.total_amount : Number(row.total_amount || 0),
          currency: row.currency_code,
          receiptNumber: row.receipt_number,
          matchedAt: row.created_at,
        });
      }
    }

    if (merchant && date && typeof total === 'number') {
      const { data, error } = await args.admin
        .from('transaction_documents')
        .select('id, primary_transaction_id, merchant_name, document_date, total_amount, currency_code, receipt_number, created_at, primary_transaction:transactions(description)')
        .eq('user_id', args.userId)
        .eq('merchant_name', merchant)
        .eq('document_date', date)
        .eq('total_amount', total)
        .limit(5);
      if (error) throw error;
      for (const row of data || []) {
        pushMatch({
          documentId: row.id,
          transactionId: row.primary_transaction_id,
          reason: 'merchant_date_total',
          merchant: row.merchant_name,
          description: typeof row.primary_transaction === 'object' && row.primary_transaction !== null && 'description' in row.primary_transaction
            ? String(row.primary_transaction.description || '')
            : null,
          date: row.document_date,
          total: typeof row.total_amount === 'number' ? row.total_amount : Number(row.total_amount || 0),
          currency: row.currency_code,
          receiptNumber: row.receipt_number,
          matchedAt: row.created_at,
        });
      }
    }
  }

  return matches;
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
    if (currency !== account.currency) {
      throw new Error(`Reviewed transaction currency must match the selected account currency (${account.currency}).`);
    }

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
    };

    return sanitized;
  });
}
