import { createClient } from '@/lib/supabase/client';
import type { TransactionDocumentItemKind, TransactionDocumentTotalSummary } from '@/lib/transaction-documents';

export interface TransactionDocumentItemDetail {
  id: string;
  name: string;
  description?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  total?: number | null;
  currency?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  itemKind: TransactionDocumentItemKind;
}

export interface TransactionDocumentTransactionDetail {
  transactionId: string;
  description: string;
  merchant?: string | null;
  amount: number;
  currency: string;
  transactionDate: string;
  accountName?: string | null;
  categoryName?: string | null;
  notes?: string | null;
}

export interface TransactionDocumentDetailsResponse {
  success: true;
  transaction: TransactionDocumentTransactionDetail;
  documentState: 'available' | 'missing' | 'processing' | 'unavailable';
  documentMessage?: string | null;
  document: {
    id: string;
    fileName: string;
    mimeType: string;
    previewUrl: string;
    downloadUrl: string;
    merchant?: string | null;
    description?: string | null;
    receiptNumber?: string | null;
    confidence?: number | null;
    sourceSurface?: string | null;
    itemCount: number;
    createdFromAI: boolean;
  } | null;
  totals: TransactionDocumentTotalSummary | null;
  lineItems: TransactionDocumentItemDetail[];
}

export interface TransactionListDocumentSummary {
  transactionId: string;
  itemCount: number;
  documentId?: string | null;
  createdFromAI: boolean;
}

export async function getTransactionDocumentDetails(transactionId: string) {
  const response = await fetch(`/api/transactions/${transactionId}/document-details`, {
    method: 'GET',
    credentials: 'include',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) {
    throw new Error(typeof payload?.errorMessage === 'string'
      ? payload.errorMessage
      : 'Failed to load the linked receipt/document.');
  }
  return payload as TransactionDocumentDetailsResponse;
}

export async function getTransactionDocumentListSummaries(transactionIds: string[]) {
  if (transactionIds.length === 0) {
    return {} as Record<string, TransactionListDocumentSummary>;
  }

  const supabase = createClient();
  const [{ data: itemRows, error: itemError }, { data: documentRows, error: documentError }] = await Promise.all([
    supabase
      .from('transaction_items')
      .select('transaction_id, document_id')
      .in('transaction_id', transactionIds),
    supabase
      .from('transaction_documents')
      .select('id, primary_transaction_id')
      .in('primary_transaction_id', transactionIds),
  ]);

  if (itemError) {
    throw itemError;
  }
  if (documentError) {
    throw documentError;
  }

  const summaryMap: Record<string, TransactionListDocumentSummary> = {};
  for (const transactionId of transactionIds) {
    summaryMap[transactionId] = {
      transactionId,
      itemCount: 0,
      documentId: null,
      createdFromAI: false,
    };
  }

  for (const row of documentRows || []) {
    const transactionId = String(row.primary_transaction_id);
    summaryMap[transactionId] ||= {
      transactionId,
      itemCount: 0,
      documentId: null,
      createdFromAI: false,
    };
    summaryMap[transactionId].documentId = String(row.id);
    summaryMap[transactionId].createdFromAI = true;
  }

  for (const row of itemRows || []) {
    const transactionId = String(row.transaction_id);
    summaryMap[transactionId] ||= {
      transactionId,
      itemCount: 0,
      documentId: null,
      createdFromAI: false,
    };
    summaryMap[transactionId].itemCount += 1;
    summaryMap[transactionId].documentId = row.document_id ? String(row.document_id) : summaryMap[transactionId].documentId;
    summaryMap[transactionId].createdFromAI = true;
  }

  return summaryMap;
}
