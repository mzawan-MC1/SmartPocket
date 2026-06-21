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
  type TransactionDocumentErrorCode,
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

function isErrorWithCode(error: unknown): error is { code: string; message?: string } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string';
}

function logExtractionStage(
  level: 'info' | 'error',
  stage: string,
  meta: Record<string, unknown>
) {
  const payload = {
    scope: 'transaction-document-extract',
    stage,
    ...meta,
  };
  if (level === 'error') {
    console.error(payload);
    return;
  }
  console.info(payload);
}

function getSafeExtractErrorCode(error: unknown): TransactionDocumentErrorCode {
  if (isErrorWithCode(error) && error.code === '42P01') {
    return 'migration_missing';
  }

  const classified = classifyTransactionDocumentError(error);
  if (classified) {
    return classified;
  }

  return 'extract_failed';
}

function getSafeExtractStatusCode(errorCode: TransactionDocumentErrorCode): number {
  switch (errorCode) {
    case 'unauthorized':
      return 401;
    case 'file_required':
    case 'invalid_type':
    case 'pdf_too_many_pages':
      return 400;
    case 'file_too_large':
      return 413;
    case 'migration_missing':
    case 'storage_bucket_failure':
    case 'signed_url_failure':
      return 500;
    case 'openrouter_not_configured':
    case 'unsupported_multimodal_model':
      return 503;
    case 'provider_http_error':
    case 'invalid_ai_json_response':
    case 'pdf_extraction_unavailable':
      return 422;
    default:
      return 500;
  }
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
  const extractRequestId = crypto.randomUUID();
  let admin: ReturnType<typeof requireAdminClient> | null = null;
  let storagePath = '';
  let documentId = '';
  let jobId = '';
  let uploadedFile = false;
  let createdDocumentRow = false;
  let createdJobRow = false;

  try {
    logExtractionStage('info', 'authentication.start', {
      extractRequestId,
    });
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logExtractionStage('error', 'authentication.failed', {
        extractRequestId,
        internalError: authError?.message || 'Missing authenticated user',
      });
      return jsonWithCookies({
        success: false,
        errorCode: 'unauthorized',
      }, 401, cookieMutations);
    }
    logExtractionStage('info', 'authentication.success', {
      extractRequestId,
      userId: user.id,
    });

    const formData = await request.formData();
    const fileEntry = formData.get('file');
    if (!(fileEntry instanceof File)) {
      logExtractionStage('error', 'file.validation.failed', {
        extractRequestId,
        userId: user.id,
        reason: 'missing_file',
      });
      return jsonWithCookies({
        success: false,
        errorCode: 'file_required',
      }, 400, cookieMutations);
    }

    const language = typeof formData.get('language') === 'string'
      ? String(formData.get('language') || 'en')
      : 'en';
    const sourceSurface = normalizeSurface(formData.get('sourceSurface'));

    logExtractionStage('info', 'file.validation.start', {
      extractRequestId,
      userId: user.id,
      fileName: fileEntry.name,
      mimeType: fileEntry.type,
      size: fileEntry.size,
      sourceSurface,
    });
    let validation: Awaited<ReturnType<typeof validateTransactionDocumentFile>>;
    try {
      validation = await validateTransactionDocumentFile(fileEntry);
    } catch (error) {
      logExtractionStage('error', 'file.validation.failed', {
        extractRequestId,
        userId: user.id,
        fileName: fileEntry.name,
        mimeType: fileEntry.type,
        size: fileEntry.size,
        internalError: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
    const fileBuffer = await fileEntry.arrayBuffer();
    const fileHash = await sha256HexFromArrayBuffer(fileBuffer);
    documentId = crypto.randomUUID();
    jobId = crypto.randomUUID();
    storagePath = buildTransactionDocumentStoragePath({
      userId: user.id,
      documentId,
      fileName: fileEntry.name,
    });
    logExtractionStage('info', 'file.validation.success', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      mimeType: fileEntry.type,
      size: fileEntry.size,
      pageCount: validation.pageCount ?? null,
    });

    admin = requireAdminClient();
    const config = loadAIConfig();

    logExtractionStage('info', 'storage.upload.start', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      bucket: TRANSACTION_DOCUMENT_BUCKET,
      storagePath,
    });
    const { error: uploadError } = await admin.storage
      .from(TRANSACTION_DOCUMENT_BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: fileEntry.type,
        upsert: false,
      });

    if (uploadError) {
      logExtractionStage('error', 'storage.upload.failed', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        bucket: TRANSACTION_DOCUMENT_BUCKET,
        storagePath,
        internalError: uploadError.message,
      });
      throw Object.assign(new Error(uploadError.message), {
        code: 'storage_bucket_failure' as const,
      });
    }
    uploadedFile = true;
    logExtractionStage('info', 'storage.upload.success', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      bucket: TRANSACTION_DOCUMENT_BUCKET,
      storagePath,
    });

    const context = await loadExecutionContextServer({
      userId: user.id,
      supabase: admin,
    });
    const options = mapDocumentOptionsFromContext(context);

    logExtractionStage('info', 'ai.request.start', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      fileName: fileEntry.name,
      mimeType: fileEntry.type,
      sourceSurface,
    });
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
    if (extractionResponse.status === 'parsed' && extractionResponse.parsed) {
      logExtractionStage('info', 'ai.request.success', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        providerUsed: extractionResponse.providerUsed || null,
        fallbackUsed: extractionResponse.fallbackUsed || false,
        draftCount: extractionResponse.parsed.transactions.length,
      });
    } else {
      logExtractionStage('error', 'ai.request.failed', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        providerUsed: extractionResponse.providerUsed || null,
        errorCode: extractionResponse.errorCode || null,
        internalError: extractionResponse.errorMessage || 'Document extraction failed',
      });
    }

    if (extractionResponse.status !== 'parsed' || !extractionResponse.parsed) {
      logExtractionStage('info', 'document_job.insert.start', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        result: 'failed',
      });
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
      } else {
        logExtractionStage('error', 'document_job.insert.document_failed', {
          extractRequestId,
          userId: user.id,
          documentId,
          jobId,
          internalError: failedDocumentInsertError.message,
          databaseCode: isErrorWithCode(failedDocumentInsertError) ? failedDocumentInsertError.code : null,
        });
        throw failedDocumentInsertError;
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
      } else {
        logExtractionStage('error', 'document_job.insert.job_failed', {
          extractRequestId,
          userId: user.id,
          documentId,
          jobId,
          internalError: failedJobInsertError.message,
          databaseCode: isErrorWithCode(failedJobInsertError) ? failedJobInsertError.code : null,
        });
        throw failedJobInsertError;
      }
      logExtractionStage('info', 'document_job.insert.success', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        result: 'failed',
      });

      if (uploadedFile) {
        await removeUploadedDocument(admin, storagePath).catch(() => undefined);
        uploadedFile = false;
        logExtractionStage('info', 'storage.cleanup.success', {
          extractRequestId,
          userId: user.id,
          documentId,
          jobId,
          storagePath,
          reason: 'extraction_failed',
        });
      }

      const errorCode = extractionResponse.errorCode
        || getSafeExtractErrorCode(extractionResponse.errorMessage);
      return jsonWithCookies({
        success: false,
        errorCode,
      }, getSafeExtractStatusCode(errorCode), cookieMutations);
    }

    logExtractionStage('info', 'duplicate_lookup.start', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      draftCount: extractionResponse.parsed.transactions.length,
    });
    const primaryDraft = extractionResponse.parsed.transactions[0];
    let duplicates;
    try {
      duplicates = await findDuplicateTransactionDocuments({
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
    } catch (error) {
      logExtractionStage('error', 'duplicate_lookup.failed', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        internalError: error instanceof Error ? error.message : 'Unknown error',
        databaseCode: isErrorWithCode(error) ? error.code : null,
      });
      throw error;
    }
    logExtractionStage('info', 'duplicate_lookup.success', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      duplicateCount: duplicates.length,
    });

    logExtractionStage('info', 'document_job.insert.start', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      result: 'review_ready',
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
      logExtractionStage('error', 'document_job.insert.document_failed', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        internalError: documentInsertError.message,
        databaseCode: isErrorWithCode(documentInsertError) ? documentInsertError.code : null,
      });
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
      logExtractionStage('error', 'document_job.insert.job_failed', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        internalError: jobInsertError.message,
        databaseCode: isErrorWithCode(jobInsertError) ? jobInsertError.code : null,
      });
      throw jobInsertError;
    }
    createdJobRow = true;
    logExtractionStage('info', 'document_job.insert.success', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      result: 'review_ready',
    });

    logExtractionStage('info', 'signed_preview.start', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      storagePath,
    });
    let previewUrl = '';
    try {
      previewUrl = await createSignedTransactionDocumentPreview({
        admin,
        path: storagePath,
      });
    } catch (error) {
      logExtractionStage('error', 'signed_preview.failed', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        storagePath,
        internalError: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
    logExtractionStage('info', 'signed_preview.success', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      storagePath,
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
    const errorCode = getSafeExtractErrorCode(error);
    logExtractionStage('error', 'extract.failed', {
      extractRequestId,
      documentId: documentId || null,
      jobId: jobId || null,
      storagePath: storagePath || null,
      errorCode,
      internalError: error instanceof Error ? error.message : 'Unknown error',
      databaseCode: isErrorWithCode(error) ? error.code : null,
    });
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
      errorCode,
    }, getSafeExtractStatusCode(errorCode), cookieMutations);
  }
}
