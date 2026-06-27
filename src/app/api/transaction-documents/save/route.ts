import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { loadExecutionContextServer } from '@/lib/ai-execution-server';
import {
  refreshTransactionDocumentDuplicateMatches,
  loadSavedTransactionDocumentReviewResult,
  mapDocumentOptionsFromContext,
  requireAdminClient,
  sanitizeTransactionDocumentSaveRequestPayload,
} from '@/lib/transaction-documents-server';
import {
  classifyTransactionDocumentError,
  type TransactionDocumentErrorCode,
} from '@/lib/transaction-documents';

function jsonWithCookies<T>(
  body: T,
  status: number,
  cookieMutations: Parameters<typeof applySupabaseCookies>[1]
) {
  return applySupabaseCookies(NextResponse.json(body, { status }), cookieMutations);
}

function buildSaveReferenceId(saveRequestId: string) {
  return `RS-${saveRequestId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

function logSaveStage(
  level: 'info' | 'error',
  stage: string,
  meta: Record<string, unknown>
) {
  const payload = {
    scope: 'transaction-document-save',
    stage,
    ...meta,
  };

  if (level === 'error') {
    console.error(payload);
    return;
  }

  console.info(payload);
}

function getErrorDatabaseCode(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string'
      ? error.code
      : null;
}

function getErrorName(error: unknown) {
  return error instanceof Error
    ? error.name
    : typeof error === 'object'
      && error !== null
      && 'name' in error
      && typeof error.name === 'string'
        ? error.name
        : 'UnknownError';
}

function getSaveFailureStage(error: unknown, fallbackStage: string) {
  const detail = typeof error === 'object'
    && error !== null
    && 'details' in error
    && typeof error.details === 'string'
      ? error.details.trim()
      : '';

  if (detail.startsWith('save.')) {
    return detail;
  }

  return fallbackStage;
}

function getSafeSaveStatusCode(errorCode: TransactionDocumentErrorCode): number {
  switch (errorCode) {
    case 'unauthorized':
      return 401;
    case 'job_not_found':
      return 404;
    case 'already_saved':
    case 'database_conflict':
      return 409;
    case 'job_required':
    case 'review_required':
    case 'invalid_review_payload':
    case 'duplicate_confirmation_required':
      return 400;
    case 'invalid_amount':
    case 'invalid_line_item':
    case 'invalid_account':
    case 'invalid_date':
    case 'currency_mismatch':
    case 'invalid_category':
      return 422;
    case 'database_unavailable':
      return 503;
    case 'save_failed':
    default:
      return 500;
  }
}

function getSafeSaveErrorMessage(errorCode: TransactionDocumentErrorCode, rawMessage: string) {
  switch (errorCode) {
    case 'unauthorized':
      return 'Unauthorized';
    case 'job_required':
      return 'A document extraction job id is required.';
    case 'review_required':
      return 'At least one reviewed transaction is required.';
    case 'invalid_review_payload':
      return rawMessage || 'The reviewed document data is invalid.';
    case 'duplicate_confirmation_required':
      return 'Confirm the duplicate warning before saving.';
    case 'invalid_amount':
      return rawMessage || 'One or more reviewed amounts are invalid.';
    case 'invalid_line_item':
      return rawMessage || 'One or more reviewed line items are invalid.';
    case 'invalid_account':
      return rawMessage || 'The selected account is invalid.';
    case 'invalid_date':
      return rawMessage || 'Each reviewed transaction must include a valid date.';
    case 'currency_mismatch':
      return rawMessage || 'Reviewed transaction currency must match the selected account currency.';
    case 'invalid_category':
      return rawMessage || 'The selected category is invalid for this transaction.';
    case 'already_saved':
      return 'This document review has already been saved.';
    case 'job_not_found':
      return 'The reviewed document could not be found.';
    case 'database_conflict':
      return 'This document could not be saved because of a data conflict. Please refresh and try again.';
    case 'database_unavailable':
      return 'Receipt saving is temporarily unavailable. Please try again shortly.';
    case 'save_failed':
    default:
      return 'Failed to save the reviewed document transactions.';
  }
}

export async function POST(request: NextRequest) {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const saveRequestId = crypto.randomUUID();
  const referenceId = buildSaveReferenceId(saveRequestId);
  let currentStage = 'save.request.received';
  let userId: string | null = null;
  let jobId = '';
  let documentId: string | null = null;
  let draftCount = 0;
  let lineItemCount = 0;

  logSaveStage('info', currentStage, {
    saveRequestId,
    referenceId,
    method: request.method,
  });

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      logSaveStage('error', 'save.authentication.failed', {
        saveRequestId,
        referenceId,
        errorName: getErrorName(authError),
        databaseCode: getErrorDatabaseCode(authError),
      });
      return jsonWithCookies({ error: 'Unauthorized' }, 401, cookieMutations);
    }
    userId = user.id;
    currentStage = 'save.authentication.success';
    logSaveStage('info', currentStage, {
      saveRequestId,
      referenceId,
      userId,
    });

    const body = await request.json();
    const admin = requireAdminClient();
    const context = await loadExecutionContextServer({
      userId: user.id,
      supabase: admin,
    });
    const options = mapDocumentOptionsFromContext(context);
    currentStage = 'save.payload.validation.start';
    logSaveStage('info', currentStage, {
      saveRequestId,
      referenceId,
      userId,
    });

    const reviewedPayload = sanitizeTransactionDocumentSaveRequestPayload({
      rawPayload: body,
      accounts: options.accounts,
      categories: options.categories,
      defaultCurrency: options.defaultCurrency,
    });
    jobId = reviewedPayload.jobId;
    draftCount = reviewedPayload.transactions.length;
    lineItemCount = reviewedPayload.transactions.reduce(
      (sum, transaction) => sum + transaction.lineItems.length,
      0
    );

    currentStage = 'save.payload.validation.success';
    logSaveStage('info', currentStage, {
      saveRequestId,
      referenceId,
      userId,
      jobId,
      draftCount,
      lineItemCount,
    });

    const existingSavedResult = await loadSavedTransactionDocumentReviewResult({
      admin,
      userId: user.id,
      jobId,
    });
    if (existingSavedResult) {
      logSaveStage('info', 'save.commit.success', {
        saveRequestId,
        referenceId,
        userId,
        jobId,
        documentId: existingSavedResult.documentId,
        savedCount: existingSavedResult.savedCount,
        idempotent: true,
      });
      return jsonWithCookies(existingSavedResult, 200, cookieMutations);
    }

    currentStage = 'save.duplicate_lookup.refresh';
    logSaveStage('info', currentStage, {
      saveRequestId,
      referenceId,
      userId,
      jobId,
      draftCount,
    });

    const refreshedDuplicateState = await refreshTransactionDocumentDuplicateMatches({
      admin,
      userId: user.id,
      jobId,
      extractedTransactions: reviewedPayload.transactions.map((transaction) => ({
        merchant: transaction.merchant,
        date: transaction.transactionDate,
        total: transaction.amount,
        currency: transaction.currency,
        receiptNumber: transaction.receiptNumber,
      })),
    });

    if (refreshedDuplicateState?.documentId) {
      documentId = refreshedDuplicateState.documentId;
    }

    logSaveStage('info', 'save.duplicate_lookup.refreshed', {
      saveRequestId,
      referenceId,
      userId,
      jobId,
      documentId,
      duplicateCount: refreshedDuplicateState?.duplicates.length ?? 0,
    });

    if ((refreshedDuplicateState?.duplicates.length ?? 0) > 0 && reviewedPayload.duplicateConfirmed !== true) {
      return jsonWithCookies({
        success: false,
        errorCode: 'duplicate_confirmation_required',
        errorMessage: getSafeSaveErrorMessage('duplicate_confirmation_required', ''),
        referenceId,
        duplicates: refreshedDuplicateState?.duplicates ?? [],
      }, getSafeSaveStatusCode('duplicate_confirmation_required'), cookieMutations);
    }

    currentStage = 'save.transaction.begin';
    logSaveStage('info', currentStage, {
      saveRequestId,
      referenceId,
      userId,
      jobId,
      draftCount,
      lineItemCount,
    });

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'rpc_save_transaction_document_review',
      {
        p_job_id: jobId,
        p_reviewed_transactions: reviewedPayload.transactions,
        p_duplicate_confirmed: reviewedPayload.duplicateConfirmed === true,
      }
    );

    if (rpcError) {
      throw rpcError;
    }

    const savedResult = await loadSavedTransactionDocumentReviewResult({
      admin,
      userId: user.id,
      jobId,
    });
    const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    documentId = savedResult?.documentId
      || (typeof rpcRow?.document_id === 'string' ? rpcRow.document_id : null);
    currentStage = 'save.commit.success';
    logSaveStage('info', currentStage, {
      saveRequestId,
      referenceId,
      userId,
      jobId,
      documentId,
      draftCount,
      lineItemCount,
      savedCount: savedResult?.savedCount
        ?? (typeof rpcRow?.saved_count === 'number' ? rpcRow.saved_count : 0),
    });

    return jsonWithCookies({
      success: true,
      jobId,
      documentId: savedResult?.documentId || rpcRow?.document_id || null,
      primaryTransactionId: savedResult?.primaryTransactionId || rpcRow?.primary_transaction_id || null,
      transactionIds: savedResult?.transactionIds || (Array.isArray(rpcRow?.transaction_ids) ? rpcRow.transaction_ids : []),
      savedCount: savedResult?.savedCount
        ?? (typeof rpcRow?.saved_count === 'number'
          ? rpcRow.saved_count
          : Array.isArray(rpcRow?.transaction_ids)
            ? rpcRow.transaction_ids.length
            : 0),
    }, 200, cookieMutations);
  } catch (error) {
    const errorCode = classifyTransactionDocumentError(error) || 'save_failed';
    const safeMessage = getSafeSaveErrorMessage(
      errorCode,
      error instanceof Error ? error.message : ''
    );
    const databaseCode = getErrorDatabaseCode(error);
    const failingStage = getSaveFailureStage(error, currentStage);

    if (errorCode === 'already_saved' && userId && jobId) {
      try {
        const admin = requireAdminClient();
        const existingSavedResult = await loadSavedTransactionDocumentReviewResult({
          admin,
          userId,
          jobId,
        });
        if (existingSavedResult) {
          logSaveStage('info', 'save.commit.success', {
            saveRequestId,
            referenceId,
            userId,
            jobId,
            documentId: existingSavedResult.documentId,
            savedCount: existingSavedResult.savedCount,
            idempotent: true,
          });
          return jsonWithCookies(existingSavedResult, 200, cookieMutations);
        }
      } catch {
        // Fall through to the structured error response below.
      }
    }

    logSaveStage('error', 'save.failed', {
      saveRequestId,
      referenceId,
      userId,
      jobId,
      documentId,
      draftCount,
      lineItemCount,
      databaseCode,
      errorName: getErrorName(error),
      errorCode,
      safeInternalError: error instanceof Error ? error.message : String(error || ''),
      failingStage,
    });

    return jsonWithCookies({
      success: false,
      errorCode,
      errorMessage: safeMessage,
      referenceId,
    }, getSafeSaveStatusCode(errorCode), cookieMutations);
  }
}
