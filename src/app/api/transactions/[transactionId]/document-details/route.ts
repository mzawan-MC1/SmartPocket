import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import {
  createSignedTransactionDocumentPreview,
  requireAdminClient,
} from '@/lib/transaction-documents-server';
import {
  getTransactionDocumentTotalSummary,
  isTransactionDocumentItemKind,
} from '@/lib/transaction-documents';

function jsonWithCookies(
  body: Record<string, unknown>,
  status: number,
  cookieMutations: Parameters<typeof applySupabaseCookies>[1]
) {
  return applySupabaseCookies(NextResponse.json(body, { status }), cookieMutations);
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ transactionId: string }> }
) {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonWithCookies({ success: false }, 401, cookieMutations);
    }

    const { transactionId } = await context.params;
    const normalizedTransactionId = transactionId.trim();
    if (!normalizedTransactionId) {
      return jsonWithCookies({ success: false }, 400, cookieMutations);
    }

    const admin = requireAdminClient();
    const { data: transaction, error: transactionError } = await admin
      .from('transactions')
      .select(`
        id,
        user_id,
        amount,
        currency,
        description,
        merchant,
        notes,
        transaction_date,
        account:financial_accounts(name),
        category:categories(name)
      `)
      .eq('id', normalizedTransactionId)
      .eq('user_id', user.id)
      .single();

    if (transactionError || !transaction) {
      return jsonWithCookies({ success: false }, 404, cookieMutations);
    }

    const { data: itemRows, error: itemError } = await admin
      .from('transaction_items')
      .select(`
        id,
        document_id,
        name,
        description,
        quantity,
        unit_price,
        line_total,
        currency,
        category_id,
        item_kind,
        item_category:categories(name)
      `)
      .eq('transaction_id', normalizedTransactionId)
      .eq('user_id', user.id)
      .order('line_index', { ascending: true });

    if (itemError) {
      throw itemError;
    }

    const documentIdFromItems = (itemRows || []).find((row) => row.document_id)?.document_id;
    const documentQuery = admin
      .from('transaction_documents')
      .select('id, storage_path, file_name, mime_type, merchant_name, receipt_number, source_surface')
      .eq('user_id', user.id)
      .limit(1);

    const { data: documentRows, error: documentError } = documentIdFromItems
      ? await documentQuery.eq('id', documentIdFromItems)
      : await documentQuery.eq('primary_transaction_id', normalizedTransactionId);

    if (documentError) {
      throw documentError;
    }

    const document = documentRows?.[0];
    if (!document) {
      return jsonWithCookies({ success: false }, 404, cookieMutations);
    }

    const { data: jobRows, error: jobError } = await admin
      .from('document_extraction_jobs')
      .select('parsed_result, reviewed_result, saved_transaction_ids')
      .eq('user_id', user.id)
      .eq('document_id', document.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (jobError) {
      throw jobError;
    }

    const latestJob = jobRows?.[0];
    const savedTransactionIds = Array.isArray(latestJob?.saved_transaction_ids)
      ? latestJob.saved_transaction_ids.map((value) => String(value))
      : [];
    const reviewedTransactions = Array.isArray(latestJob?.reviewed_result)
      ? latestJob.reviewed_result
      : [];
    const parsedTransactions = Array.isArray((latestJob?.parsed_result as { transactions?: unknown[] } | null)?.transactions)
      ? ((latestJob?.parsed_result as { transactions?: unknown[] }).transactions || [])
      : [];

    const reviewedIndex = savedTransactionIds.findIndex((value) => value === normalizedTransactionId);
    const reviewedEntry = reviewedIndex >= 0 ? reviewedTransactions[reviewedIndex] : reviewedTransactions[0];
    const parsedEntry = reviewedIndex >= 0 ? parsedTransactions[reviewedIndex] : parsedTransactions[0];

    const lineItems = (itemRows || []).map((item) => ({
      id: String(item.id),
      name: String(item.name || 'Item'),
      description: item.description ? String(item.description) : null,
      quantity: typeof item.quantity === 'number' ? item.quantity : item.quantity ? Number(item.quantity) : null,
      unitPrice: typeof item.unit_price === 'number' ? item.unit_price : item.unit_price ? Number(item.unit_price) : null,
      total: typeof item.line_total === 'number' ? item.line_total : item.line_total ? Number(item.line_total) : null,
      currency: item.currency ? String(item.currency) : transaction.currency,
      categoryId: item.category_id ? String(item.category_id) : null,
      categoryName:
        typeof item.item_category === 'object' && item.item_category !== null && 'name' in item.item_category
          ? String(item.item_category.name || '')
          : null,
      itemKind: isTransactionDocumentItemKind(item.item_kind) ? item.item_kind : 'regular',
    }));

    const taxValue = typeof reviewedEntry === 'object'
      && reviewedEntry !== null
      && 'tax' in reviewedEntry
      && typeof reviewedEntry.tax === 'number'
        ? reviewedEntry.tax
        : null;

    const totals = getTransactionDocumentTotalSummary({
      amount: Number(transaction.amount || 0),
      tax: taxValue,
      lineItems: lineItems.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        itemKind: item.itemKind,
      })),
    });

    const signedUrl = await createSignedTransactionDocumentPreview({
      admin,
      path: document.storage_path,
    });

    const confidence = typeof parsedEntry === 'object'
      && parsedEntry !== null
      && 'confidence' in parsedEntry
      && typeof parsedEntry.confidence === 'number'
        ? parsedEntry.confidence
        : typeof (latestJob?.parsed_result as { confidence?: unknown } | null)?.confidence === 'number'
          ? Number((latestJob?.parsed_result as { confidence?: number }).confidence)
          : null;

    return jsonWithCookies({
      success: true,
      transaction: {
        transactionId: normalizedTransactionId,
        description: String(transaction.description || ''),
        merchant: transaction.merchant ? String(transaction.merchant) : null,
        amount: Number(transaction.amount || 0),
        currency: String(transaction.currency || 'USD'),
        transactionDate: String(transaction.transaction_date || ''),
        accountName:
          typeof transaction.account === 'object' && transaction.account !== null && 'name' in transaction.account
            ? String(transaction.account.name || '')
            : null,
        categoryName:
          typeof transaction.category === 'object' && transaction.category !== null && 'name' in transaction.category
            ? String(transaction.category.name || '')
            : null,
        notes: transaction.notes ? String(transaction.notes) : null,
      },
      document: {
        id: String(document.id),
        fileName: String(document.file_name || ''),
        mimeType: String(document.mime_type || ''),
        previewUrl: signedUrl,
        downloadUrl: signedUrl,
        merchant: document.merchant_name ? String(document.merchant_name) : null,
        description:
          typeof reviewedEntry === 'object' && reviewedEntry !== null && 'description' in reviewedEntry
            ? String(reviewedEntry.description || '')
            : String(transaction.description || ''),
        receiptNumber:
          typeof reviewedEntry === 'object' && reviewedEntry !== null && 'receiptNumber' in reviewedEntry
            ? String(reviewedEntry.receiptNumber || '')
            : document.receipt_number ? String(document.receipt_number) : null,
        confidence,
        sourceSurface: document.source_surface ? String(document.source_surface) : null,
        itemCount: lineItems.length,
        createdFromAI: true,
      },
      totals,
      lineItems,
    }, 200, cookieMutations);
  } catch (error) {
    console.error({
      scope: 'transaction-document-details',
      stage: 'load',
      internalError: error instanceof Error ? error.message : 'Unknown error',
    });
    return jsonWithCookies({
      success: false,
      errorMessage: 'Failed to load the linked receipt/document.',
    }, 500, cookieMutations);
  }
}
