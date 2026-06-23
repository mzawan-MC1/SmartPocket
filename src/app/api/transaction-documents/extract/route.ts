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
  getTransactionDocumentMaxSizeLabel,
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
  const errorCode = typeof body.errorCode === 'string' ? body.errorCode : undefined;
  const errorMessage = typeof body.errorMessage === 'string' ? body.errorMessage : undefined;
  const nextBody = {
    ...body,
    ...(errorCode ? { code: errorCode } : {}),
    ...(errorMessage ? { message: errorMessage } : {}),
  };
  return applySupabaseCookies(NextResponse.json(nextBody, { status }), cookieMutations);
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
    case 'empty_file':
    case 'invalid_type':
    case 'pdf_too_many_pages':
      return 400;
    case 'document_too_large':
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
    case 'receipt_feature_unavailable':
    case 'receipt_no_documents_included':
      return 403;
    case 'receipt_allowance_exhausted':
      return 429;
    case 'duplicate_request_in_progress':
      return 409;
    default:
      return 500;
  }
}

function getErrorMessage(errorCode: TransactionDocumentErrorCode): string | undefined {
  switch (errorCode) {
    case 'document_too_large':
      return `This document exceeds the ${getTransactionDocumentMaxSizeLabel()} upload limit.`;
    case 'empty_file':
      return 'This file appears to be empty or unreadable.';
    default:
      return undefined;
  }
}

async function removeUploadedDocument(
  admin: ReturnType<typeof requireAdminClient>,
  storagePath: string
) {
  if (!storagePath) return;
  await admin.storage.from(TRANSACTION_DOCUMENT_BUCKET).remove([storagePath]);
}

type ReceiptCreditReservationResult = {
  ok?: boolean;
  error?: string;
  cycle_id?: string;
  ledger_id?: string;
  credits_reserved?: number;
  duplicate?: boolean;
};

function normalizeIdempotencyKey(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') return crypto.randomUUID();
  const normalized = value.trim();
  return normalized || crypto.randomUUID();
}

function getReceiptAccessErrorCode(accessError: string): TransactionDocumentErrorCode {
  switch (accessError) {
    case 'receipt_limit_reached':
      return 'receipt_allowance_exhausted';
    case 'receipt_zero_quota':
      return 'receipt_no_documents_included';
    case 'receipt_ai_disabled':
    case 'no_subscription':
    case 'plan_inactive':
    case 'subscription_expired':
    case 'trial_expired':
      return 'receipt_feature_unavailable';
    default:
      return 'extract_failed';
  }
}

function getProviderType(providerUsed?: string | null) {
  return providerUsed?.includes('vps') ? 'vps' : 'cloud';
}

async function updateReceiptLedgerMetadata(
  admin: ReturnType<typeof requireAdminClient>,
  ledgerId: string,
  values: Record<string, unknown>
) {
  if (!ledgerId) return;
  await admin
    .from('ai_credit_ledger')
    .update(values)
    .eq('id', ledgerId);
}

async function markReceiptExtractionFailed(args: {
  admin: ReturnType<typeof requireAdminClient>;
  documentId?: string;
  jobId?: string;
  sourceSurface: TransactionDocumentSourceSurface;
  providerUsed?: string | null;
  modelUsed?: string | null;
  parsedResult?: unknown;
  duplicateMatches?: unknown[];
  rawOutput?: unknown;
  errorMessage: string;
}) {
  const {
    admin,
    documentId,
    jobId,
    sourceSurface,
    providerUsed,
    modelUsed,
    parsedResult,
    duplicateMatches,
    rawOutput,
    errorMessage,
  } = args;

  if (documentId) {
    const primaryDraft = parsedResult
      && typeof parsedResult === 'object'
      && parsedResult !== null
      && 'transactions' in parsedResult
      && Array.isArray((parsedResult as { transactions?: unknown[] }).transactions)
        ? (parsedResult as {
            transactions?: Array<{
              merchant?: string;
              date?: string;
              total?: number | null;
              tax?: number | null;
              currency?: string;
              receiptNumber?: string;
            }>;
          }).transactions?.[0]
        : undefined;

    await admin
      .from('transaction_documents')
      .update({
        status: 'failed',
        merchant_name: primaryDraft?.merchant || null,
        document_date: primaryDraft?.date || null,
        total_amount: typeof primaryDraft?.total === 'number' ? primaryDraft.total : null,
        tax_amount: typeof primaryDraft?.tax === 'number' ? primaryDraft.tax : null,
        currency_code: primaryDraft?.currency || null,
        receipt_number: primaryDraft?.receiptNumber || null,
      })
      .eq('id', documentId);
  }

  if (jobId) {
    await admin
      .from('document_extraction_jobs')
      .update({
        source_surface: sourceSurface,
        status: 'failed',
        provider_used: providerUsed || null,
        model_used: modelUsed || null,
        parsed_result: parsedResult || null,
        duplicate_matches: duplicateMatches || [],
        raw_ai_output: rawOutput || null,
        error_message: errorMessage,
      })
      .eq('id', jobId);
  }
}

async function incrementReceiptDailyUsage(args: {
  supabase: Awaited<ReturnType<typeof createRouteHandlerSupabaseClient>>['supabase'];
  userId: string;
  providerUsed?: string | null;
  fallbackUsed?: boolean;
  success: boolean;
  durationMs?: number;
}) {
  await args.supabase.rpc('increment_ai_daily_usage', {
    p_user_id: args.userId,
    p_request_type: 'receipt_extraction',
    p_provider_type: getProviderType(args.providerUsed),
    p_fallback_used: args.fallbackUsed || false,
    p_success: args.success,
    p_confirmed: false,
    p_duration_ms: typeof args.durationMs === 'number' ? args.durationMs : 0,
  });
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
  let idempotencyKey = '';
  let creditCycleId = '';
  let creditLedgerId = '';
  let usageReserved = false;
  let dailyUsageLogged = false;
  let providerAttempted = false;
  let providerUsed: string | null = null;
  let modelUsed: string | null = null;
  let rawAiOutput: unknown = null;
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let totalTokens: number | null = null;
  let estimatedCostUsd: number | null = null;
  let parsedResult: unknown = null;
  let duplicateMatches: unknown[] = [];
  let extractDurationMs = 0;
  let fallbackUsed = false;
  let currentUserId = '';
  let currentSourceSurface: TransactionDocumentSourceSurface = 'add_transaction';
  let previewUrl = '';

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
    currentUserId = user.id;

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
    currentSourceSurface = sourceSurface;
    idempotencyKey = normalizeIdempotencyKey(formData.get('idempotencyKey'));

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

    const { data: accessError, error: accessRpcError } = await admin.rpc('check_ai_access', {
      p_user_id: user.id,
      p_request_type: 'receipt_extraction',
    });

    if (accessRpcError) {
      logExtractionStage('error', 'receipt_allowance.check.failed', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        internalError: accessRpcError.message,
      });
      throw accessRpcError;
    }

    if (typeof accessError === 'string' && accessError) {
      const accessErrorCode = getReceiptAccessErrorCode(accessError);
      if (uploadedFile) {
        await removeUploadedDocument(admin, storagePath).catch(() => undefined);
        uploadedFile = false;
      }
      return jsonWithCookies({
        success: false,
        errorCode: accessErrorCode,
        errorMessage: getErrorMessage(accessErrorCode),
      }, accessErrorCode === 'receipt_allowance_exhausted' ? 429 : 403, cookieMutations);
    }

    const { data: reserveData, error: reserveError } = await admin.rpc('reserve_ai_credits', {
      p_user_id: user.id,
      p_request_type: 'receipt_extraction',
      p_idempotency_key: idempotencyKey,
    });

    const reserveResult = (reserveData as ReceiptCreditReservationResult | null) ?? null;
    if (reserveError || !reserveResult?.ok) {
      if (uploadedFile) {
        await removeUploadedDocument(admin, storagePath).catch(() => undefined);
        uploadedFile = false;
      }
      if (reserveError) {
        throw reserveError;
      }
      const reserveErrorCode = getReceiptAccessErrorCode(reserveResult?.error || 'extract_failed');
      return jsonWithCookies({
        success: false,
        errorCode: reserveErrorCode,
        errorMessage: getErrorMessage(reserveErrorCode),
      }, getSafeExtractStatusCode(reserveErrorCode), cookieMutations);
    }

    if (reserveResult.duplicate) {
      if (uploadedFile) {
        await removeUploadedDocument(admin, storagePath).catch(() => undefined);
        uploadedFile = false;
      }
      return jsonWithCookies({
        success: false,
        errorCode: 'duplicate_request_in_progress',
      }, 409, cookieMutations);
    }

    creditCycleId = String(reserveResult.cycle_id || '');
    creditLedgerId = String(reserveResult.ledger_id || '');
    usageReserved = Boolean(creditCycleId && creditLedgerId);

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
      status: 'uploaded',
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
      status: 'processing',
      provider_used: null,
      model_used: null,
      parsed_result: null,
      duplicate_matches: [],
      raw_ai_output: null,
      error_message: null,
      idempotency_key: idempotencyKey,
      credit_ledger_id: creditLedgerId || null,
    });

    if (jobInsertError) {
      throw jobInsertError;
    }
    createdJobRow = true;

    if (usageReserved) {
      await updateReceiptLedgerMetadata(admin, creditLedgerId, {
        source_request_id: jobId,
        request_type: 'receipt_extraction',
      });
    }

    const context = await loadExecutionContextServer({
      userId: user.id,
      supabase: admin,
    });
    const options = mapDocumentOptionsFromContext(context);

    previewUrl = await createSignedTransactionDocumentPreview({
      admin,
      path: storagePath,
    });

    if (request.signal.aborted) {
      throw new Error('Client cancelled receipt extraction before provider call.');
    }

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
      fileUrl: previewUrl,
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
    providerAttempted = true;
    providerUsed = extractionResponse.providerUsed || null;
    modelUsed = extractionResponse.modelUsed || extractionResponse.parsed?.modelUsed || null;
    rawAiOutput = extractionResponse.rawOutput ?? null;
    inputTokens = extractionResponse.inputTokens ?? null;
    outputTokens = extractionResponse.outputTokens ?? null;
    totalTokens = extractionResponse.totalTokens ?? null;
    estimatedCostUsd = extractionResponse.estimatedCostUsd ?? null;
    extractDurationMs = extractionResponse.durationMs || 0;
    fallbackUsed = extractionResponse.fallbackUsed || false;
    parsedResult = extractionResponse.parsed || null;

    if (usageReserved && creditLedgerId) {
      await updateReceiptLedgerMetadata(admin, creditLedgerId, {
        source_request_id: jobId,
        request_type: 'receipt_extraction',
        provider_name: providerUsed,
        model_name: modelUsed,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCostUsd,
      });
    }

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
      await markReceiptExtractionFailed({
        admin,
        documentId,
        jobId,
        sourceSurface,
        providerUsed,
        modelUsed,
        rawOutput: rawAiOutput,
        errorMessage: extractionResponse.errorMessage || 'Document extraction failed',
      });

      if (usageReserved && creditCycleId && creditLedgerId) {
        await admin.rpc('refund_ai_credits', {
          p_user_id: user.id,
          p_cycle_id: creditCycleId,
          p_ledger_id: creditLedgerId,
          p_reason: extractionResponse.errorCode || 'provider_failure',
        });
        usageReserved = false;
      }

      await incrementReceiptDailyUsage({
        supabase,
        userId: user.id,
        providerUsed,
        fallbackUsed,
        success: false,
        durationMs: extractDurationMs,
      });
      dailyUsageLogged = true;

      const errorCode = extractionResponse.errorCode
        || getSafeExtractErrorCode(extractionResponse.errorMessage);
      return jsonWithCookies({
        success: false,
        errorCode,
        errorMessage: getErrorMessage(errorCode),
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
    duplicateMatches = duplicates;

    const { error: documentUpdateError } = await admin.from('transaction_documents').update({
      status: 'review_ready',
      merchant_name: primaryDraft?.merchant || null,
      document_date: primaryDraft?.date || null,
      total_amount: typeof primaryDraft?.total === 'number' ? primaryDraft.total : null,
      tax_amount: typeof primaryDraft?.tax === 'number' ? primaryDraft.tax : null,
      currency_code: primaryDraft?.currency || null,
      receipt_number: primaryDraft?.receiptNumber || null,
    }).eq('id', documentId);

    if (documentUpdateError) {
      logExtractionStage('error', 'document_job.insert.document_failed', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        internalError: documentUpdateError.message,
        databaseCode: isErrorWithCode(documentUpdateError) ? documentUpdateError.code : null,
      });
      throw documentUpdateError;
    }
    const { error: jobUpdateError } = await admin.from('document_extraction_jobs').update({
      source_surface: sourceSurface,
      status: 'parsed',
      provider_used: providerUsed,
      model_used: modelUsed,
      parsed_result: extractionResponse.parsed,
      duplicate_matches: duplicates,
      raw_ai_output: rawAiOutput,
      error_message: null,
    }).eq('id', jobId);

    if (jobUpdateError) {
      logExtractionStage('error', 'document_job.insert.job_failed', {
        extractRequestId,
        userId: user.id,
        documentId,
        jobId,
        internalError: jobUpdateError.message,
        databaseCode: isErrorWithCode(jobUpdateError) ? jobUpdateError.code : null,
      });
      throw jobUpdateError;
    }
    logExtractionStage('info', 'document_job.insert.success', {
      extractRequestId,
      userId: user.id,
      documentId,
      jobId,
      result: 'review_ready',
    });

    if (usageReserved && creditCycleId && creditLedgerId) {
      const { error: finaliseError } = await admin.rpc('finalise_ai_credits', {
        p_user_id: user.id,
        p_cycle_id: creditCycleId,
        p_ledger_id: creditLedgerId,
        p_ai_request_id: null,
        p_input_tokens: inputTokens,
        p_output_tokens: outputTokens,
        p_total_tokens: totalTokens,
        p_speech_duration_ms: null,
        p_provider_name: providerUsed,
        p_model_name: modelUsed,
        p_estimated_cost: estimatedCostUsd,
        p_credit_cost: 1,
      });
      if (finaliseError) {
        throw finaliseError;
      }
      usageReserved = false;
    }

    await incrementReceiptDailyUsage({
      supabase,
      userId: user.id,
      providerUsed,
      fallbackUsed,
      success: true,
      durationMs: extractDurationMs,
    });
    dailyUsageLogged = true;

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
      if (usageReserved && creditCycleId && creditLedgerId) {
        if (providerAttempted) {
          await updateReceiptLedgerMetadata(admin, creditLedgerId, {
            source_request_id: jobId || null,
            request_type: 'receipt_extraction',
            provider_name: providerUsed,
            model_name: modelUsed,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
            estimated_cost_usd: estimatedCostUsd,
          });
        }

        const { error: refundError } = await admin.rpc('refund_ai_credits', {
          p_user_id: currentUserId,
          p_cycle_id: creditCycleId,
          p_ledger_id: creditLedgerId,
          p_reason: errorCode,
        });
        if (refundError) {
          logExtractionStage('error', 'receipt_allowance.refund.failed', {
            extractRequestId,
            userId: currentUserId,
            documentId: documentId || null,
            jobId: jobId || null,
            ledgerId: creditLedgerId,
            cycleId: creditCycleId,
            internalError: refundError.message,
          });
        }
        usageReserved = false;
      }

      if (providerAttempted) {
        await markReceiptExtractionFailed({
          admin,
          documentId,
          jobId,
          sourceSurface: currentSourceSurface,
          providerUsed,
          modelUsed,
          parsedResult,
          duplicateMatches,
          rawOutput: rawAiOutput,
          errorMessage: error instanceof Error ? error.message : 'Document extraction failed',
        }).catch(() => undefined);
      } else {
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
    }

    if (providerAttempted && currentUserId && !dailyUsageLogged) {
      await incrementReceiptDailyUsage({
        supabase,
        userId: currentUserId,
        providerUsed,
        fallbackUsed,
        success: false,
        durationMs: extractDurationMs,
      }).catch(() => undefined);
    }

    return jsonWithCookies({
      success: false,
      errorCode,
      errorMessage: getErrorMessage(errorCode),
    }, getSafeExtractStatusCode(errorCode), cookieMutations);
  }
}
