import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { loadAIConfig, processTransactionDocumentAIRequest } from '@/lib/ai-gateway';
import { loadExecutionContextServer } from '@/lib/ai-execution-server';
import {
  buildTransactionDocumentStoragePath,
  createSignedTransactionDocumentPreview,
  findDuplicateTransactionDocuments,
  mapDocumentOptionsFromContext,
  requireAdminClient,
} from '@/lib/transaction-documents-server';
import {
  classifyTransactionDocumentError,
  sha256HexFromArrayBuffer,
  TRANSACTION_DOCUMENT_BUCKET,
  TRANSACTION_DOCUMENT_SIGNED_URL_TTL_SECONDS,
  validateTransactionDocumentFile,
  type TransactionDocumentSourceSurface,
} from '@/lib/transaction-documents';

function jsonWithCookies(
  body: Record<string, unknown>,
  status: number,
  cookieMutations: Parameters<typeof applySupabaseCookies>[1]
) {
  return applySupabaseCookies(NextResponse.json(body, { status }), cookieMutations);
}

function toBase64(buffer: ArrayBuffer) {
  return Buffer.from(buffer).toString('base64');
}

function normalizeSurface(value: FormDataEntryValue | null): TransactionDocumentSourceSurface {
  return value === 'smart_entry' ? 'smart_entry' : 'add_transaction';
}

async function removeUploadedDocument(
  admin: ReturnType<typeof requireAdminClient>,
  storagePath: string
) {
  if (!storagePath) return;
  await admin.storage.from(TRANSACTION_DOCUMENT_BUCKET).remove([storagePath]);
}

export async function POST(request: NextRequest) {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  let admin: ReturnType<typeof requireAdminClient> | null = null;
  let storagePath = '';
  let documentId = '';
  let jobId = '';
  let uploadedFile = false;
  let createdDocumentRow = false;
  let createdJobRow = false;

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonWithCookies({ error: 'Unauthorized' }, 401, cookieMutations);
    }

    const formData = await request.formData();
    const fileEntry = formData.get('file');
    if (!(fileEntry instanceof File)) {
      return jsonWithCookies({
        success: false,
        errorCode: 'file_required',
        errorMessage: 'A receipt or document file is required.',
      }, 400, cookieMutations);
    }

    const language = typeof formData.get('language') === 'string'
      ? String(formData.get('language') || 'en')
      : 'en';
    const sourceSurface = normalizeSurface(formData.get('sourceSurface'));

    const validation = await validateTransactionDocumentFile(fileEntry);
    const fileBuffer = await fileEntry.arrayBuffer();
    const fileHash = await sha256HexFromArrayBuffer(fileBuffer);
    documentId = crypto.randomUUID();
    jobId = crypto.randomUUID();
    storagePath = buildTransactionDocumentStoragePath({
      userId: user.id,
      documentId,
      fileName: fileEntry.name,
    });

    admin = requireAdminClient();
    const config = loadAIConfig();

    const { error: uploadError } = await admin.storage
      .from(TRANSACTION_DOCUMENT_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: fileEntry.type,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }
    uploadedFile = true;

    const context = await loadExecutionContextServer({
      userId: user.id,
      supabase: admin,
    });
    const options = mapDocumentOptionsFromContext(context);

    const extractionResponse = await processTransactionDocumentAIRequest({
      requestId: jobId,
      fileName: fileEntry.name,
      fileMimeType: fileEntry.type,
      fileDataUrl: `data:${fileEntry.type};base64,${toBase64(fileBuffer)}`,
      language,
      pageCount: validation.pageCount,
      sourceSurface,
      context: {
        accounts: context.accounts.map((account) => ({
          id: account.id,
          name: account.name,
          type: account.account_type,
          currency: account.currency,
          includeInTotal: account.include_in_total,
        })),
        categories: context.categories
          .filter((category) => category.category_type === 'income' || category.category_type === 'expense')
          .map((category) => ({
            id: category.id,
            name: category.name,
            type: category.category_type,
          })),
        defaultCurrency: context.defaultCurrency,
      },
    }, config);

    if (extractionResponse.status !== 'parsed' || !extractionResponse.parsed) {
      const { error: failedDocumentInsertError } = await admin.from('transaction_documents').insert({
        id: documentId,
        user_id: user.id,
        storage_bucket: TRANSACTION_DOCUMENT_BUCKET,
        storage_path: storagePath,
        file_name: fileEntry.name,
        file_size: fileEntry.size,
        mime_type: fileEntry.type,
        page_count: validation.pageCount || null,
        sha256_hash: fileHash,
        source_surface: sourceSurface,
        status: 'failed',
      });
      if (!failedDocumentInsertError) {
        createdDocumentRow = true;
      }

      const { error: failedJobInsertError } = await admin.from('document_extraction_jobs').insert({
        id: jobId,
        user_id: user.id,
        document_id: documentId,
        source_surface: sourceSurface,
        status: 'failed',
        provider_used: extractionResponse.providerUsed || null,
        parsed_result: null,
        duplicate_matches: [],
        raw_ai_output: extractionResponse.rawOutput || null,
        error_message: extractionResponse.errorMessage || 'Document extraction failed',
      });
      if (!failedJobInsertError) {
        createdJobRow = true;
      }

      if (uploadedFile) {
        await removeUploadedDocument(admin, storagePath).catch(() => undefined);
        uploadedFile = false;
      }

      return jsonWithCookies({
        success: false,
        errorCode: classifyTransactionDocumentError(extractionResponse.errorMessage) || 'extract_failed',
        errorMessage: extractionResponse.errorMessage || 'Document extraction failed.',
      }, 422, cookieMutations);
    }

    const primaryDraft = extractionResponse.parsed.transactions[0];
    const duplicates = await findDuplicateTransactionDocuments({
      admin,
      userId: user.id,
      fileHash,
      extractedTransactions: extractionResponse.parsed.transactions.map((transaction) => ({
        merchant: transaction.merchant,
        date: transaction.date,
        total: transaction.total,
        currency: transaction.currency,
        receiptNumber: transaction.receiptNumber,
      })),
    });

    const { error: documentInsertError } = await admin.from('transaction_documents').insert({
      id: documentId,
      user_id: user.id,
      storage_bucket: TRANSACTION_DOCUMENT_BUCKET,
      storage_path: storagePath,
      file_name: fileEntry.name,
      file_size: fileEntry.size,
      mime_type: fileEntry.type,
      page_count: validation.pageCount || null,
      sha256_hash: fileHash,
      source_surface: sourceSurface,
      status: 'review_ready',
      merchant_name: primaryDraft?.merchant || null,
      document_date: primaryDraft?.date || null,
      total_amount: typeof primaryDraft?.total === 'number' ? primaryDraft.total : null,
      tax_amount: typeof primaryDraft?.tax === 'number' ? primaryDraft.tax : null,
      currency_code: primaryDraft?.currency || null,
      receipt_number: primaryDraft?.receiptNumber || null,
    });

    if (documentInsertError) {
      throw documentInsertError;
    }
    createdDocumentRow = true;

    const { error: jobInsertError } = await admin.from('document_extraction_jobs').insert({
      id: jobId,
      user_id: user.id,
      document_id: documentId,
      source_surface: sourceSurface,
      status: 'parsed',
      provider_used: extractionResponse.providerUsed || null,
      model_used: extractionResponse.parsed.modelUsed || null,
      parsed_result: extractionResponse.parsed,
      duplicate_matches: duplicates,
      raw_ai_output: extractionResponse.rawOutput || null,
      error_message: null,
    });

    if (jobInsertError) {
      throw jobInsertError;
    }
    createdJobRow = true;

    const previewUrl = await createSignedTransactionDocumentPreview({
      admin,
      path: storagePath,
    });

    return jsonWithCookies({
      success: true,
      jobId,
      documentId,
      previewUrl,
      previewExpiresInSeconds: TRANSACTION_DOCUMENT_SIGNED_URL_TTL_SECONDS,
      file: {
        name: fileEntry.name,
        size: fileEntry.size,
        mimeType: fileEntry.type,
        pageCount: validation.pageCount,
      },
      extraction: extractionResponse.parsed,
      duplicates,
      options,
    }, 200, cookieMutations);
  } catch (error) {
    if (admin) {
      if (createdJobRow) {
        await admin.from('document_extraction_jobs').delete().eq('id', jobId);
      }
      if (createdDocumentRow) {
        await admin.from('transaction_documents').delete().eq('id', documentId);
      }
      if (uploadedFile) {
        await removeUploadedDocument(admin, storagePath).catch(() => undefined);
      }
    }

    return jsonWithCookies({
      success: false,
      errorCode: classifyTransactionDocumentError(error) || 'extract_failed',
      errorMessage: error instanceof Error ? error.message : 'Failed to extract the uploaded document.',
    }, 500, cookieMutations);
  }
}
