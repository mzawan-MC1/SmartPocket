import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { loadExecutionContextServer } from '@/lib/ai-execution-server';
import {
  mapDocumentOptionsFromContext,
  requireAdminClient,
  sanitizeTransactionDocumentReviewPayload,
} from '@/lib/transaction-documents-server';
import { classifyTransactionDocumentError } from '@/lib/transaction-documents';

function jsonWithCookies(
  body: Record<string, unknown>,
  status: number,
  cookieMutations: Parameters<typeof applySupabaseCookies>[1]
) {
  return applySupabaseCookies(NextResponse.json(body, { status }), cookieMutations);
}

export async function POST(request: NextRequest) {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonWithCookies({ error: 'Unauthorized' }, 401, cookieMutations);
    }

    const body = await request.json();
    const jobId = typeof body?.jobId === 'string' ? body.jobId.trim() : '';
    if (!jobId) {
      return jsonWithCookies({
        success: false,
        errorCode: 'job_required',
        errorMessage: 'A document extraction job id is required.',
      }, 400, cookieMutations);
    }

    const admin = requireAdminClient();
    const context = await loadExecutionContextServer({
      userId: user.id,
      supabase: admin,
    });
    const options = mapDocumentOptionsFromContext(context);
    const reviewedTransactions = sanitizeTransactionDocumentReviewPayload({
      rawTransactions: body?.transactions,
      accounts: options.accounts,
      categories: options.categories,
      defaultCurrency: options.defaultCurrency,
    });

    const { data: rpcData, error: rpcError } = await supabase.rpc(
      'rpc_save_transaction_document_review',
      {
        p_job_id: jobId,
        p_reviewed_transactions: reviewedTransactions,
        p_duplicate_confirmed: body?.duplicateConfirmed === true,
      }
    );

    if (rpcError) {
      throw rpcError;
    }

    const rpcRow = Array.isArray(rpcData) ? rpcData[0] : rpcData;
    return jsonWithCookies({
      success: true,
      jobId,
      documentId: rpcRow?.document_id || null,
      primaryTransactionId: rpcRow?.primary_transaction_id || null,
      transactionIds: Array.isArray(rpcRow?.transaction_ids) ? rpcRow.transaction_ids : [],
      savedCount: typeof rpcRow?.saved_count === 'number'
        ? rpcRow.saved_count
        : Array.isArray(rpcRow?.transaction_ids)
          ? rpcRow.transaction_ids.length
          : 0,
    }, 200, cookieMutations);
  } catch (error) {
    return jsonWithCookies({
      success: false,
      errorCode: classifyTransactionDocumentError(error) || 'save_failed',
      errorMessage: error instanceof Error ? error.message : 'Failed to save the reviewed document transactions.',
    }, 500, cookieMutations);
  }
}
