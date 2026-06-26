import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  executeConfirmedActionsServer,
  getExecutionErrorCategory,
  getExecutionErrorCode,
  getSafeExecutionLogContext,
  getSafeExecutionErrorMessage,
  isContextLoadError,
  loadExecutionContextServer,
} from '@/lib/ai-execution-server';
import type { ParsedFinancialInstruction } from '@/lib/ai-types';
import { requireTextAiAccess } from '@/lib/subscription/server';

// ─── Server-side Supabase clients ─────────────────────────────────────────────

/**
 * Service-role client — used for all server-controlled writes.
 * This client runs as "service_role" (superuser-equivalent in Supabase).
 * The SECURITY INVOKER triggers will see current_user = 'service_role'
 * and allow all field updates through.
 * The server-only RPCs (rpc_ai_mark_request_*) are also called via this
 * client; they are SECURITY DEFINER and restricted from authenticated users.
 */
function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      '[AI Execute] SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'The service-role key must be configured as a server-only environment variable. '+ 'Never use the anon key as a fallback for server-controlled writes.'
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );
}

/** User-scoped client — used only for auth verification */
function createUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

async function createAiFailureNotification(args: {
  serviceClient: ReturnType<typeof createServiceClient>;
  userId: string;
  requestId: string;
  message: string;
}) {
  const { serviceClient, userId, requestId, message } = args;

  const { data: preferences } = await serviceClient
    .from('notification_preferences')
    .select('in_app_enabled, ai_execution_failure_notifications')
    .eq('user_id', userId)
    .maybeSingle();

  if (preferences && (!preferences.in_app_enabled || !preferences.ai_execution_failure_notifications)) {
    return;
  }

  const sourceKey = `ai_execute_failure:${requestId}`;
  const { data: existing } = await serviceClient
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('source_key', sourceKey)
    .maybeSingle();

  if (existing) {
    return;
  }

  await serviceClient
    .from('notifications')
    .insert({
      user_id: userId,
      type: 'ai_execution_failed',
      title: 'Smart Entry could not save records',
      message,
      action_url: '/ai-history',
      metadata: {
        request_id: requestId,
      },
      source_key: sourceKey,
    });
}

function jsonExecutionError(args: {
  code: string;
  message: string;
  requestId?: string;
  httpStatus: number;
  category?: 'technical' | 'validation' | 'auth' | 'state' | 'configuration';
}) {
  return NextResponse.json(
    {
      success: false,
      status: 'failed',
      requestId: args.requestId,
      error: {
        code: args.code,
        category: args.category || 'technical',
        message: args.message,
        requestId: args.requestId,
      },
      errorMessage: args.message,
    },
    { status: args.httpStatus }
  );
}

// ─── POST /api/ai/execute ─────────────────────────────────────────────────────
//
// Security contract:
//   • NEVER trust parsed actions from the browser
//   • NEVER trust execution status from the browser
//   • NEVER trust provider audit fields from the browser
//   • Server MUST re-read the confirmed pending request from Supabase
//   • Server MUST execute only validated actions belonging to the authenticated user
//   • All server-controlled writes go through SECURITY DEFINER RPCs via the
//     service-role client — never direct UPDATE from the authenticated role
//
export async function POST(req: NextRequest) {
  try {
    // ── 1. Authenticate — derive user from token, never from body ─────────
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonExecutionError({
        code: 'UNAUTHORIZED',
        message: 'Your session expired. Please sign in again.',
        httpStatus: 401,
        category: 'auth',
      });
    }

    const token = authHeader.slice(7);
    const userClient = createUserClient(token);
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return jsonExecutionError({
        code: 'UNAUTHORIZED',
        message: 'Your session expired. Please sign in again.',
        httpStatus: 401,
        category: 'auth',
      });
    }

    // ── 2. Parse body — only accept requestId from browser ────────────────
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonExecutionError({
        code: 'INVALID_EXECUTION_PAYLOAD',
        message: 'This Smart Entry request is invalid. Please review it and try again.',
        httpStatus: 400,
        category: 'validation',
      });
    }

    // Only accept the request ID from the browser — nothing else is trusted
    const rawRequestId = body.requestId;
    if (typeof rawRequestId !== 'string' || !rawRequestId.trim()) {
      return jsonExecutionError({
        code: 'INVALID_EXECUTION_PAYLOAD',
        message: 'This Smart Entry request is invalid. Please review it and try again.',
        httpStatus: 400,
        category: 'validation',
      });
    }

    // Sanitize: UUID format only (prevent injection)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(rawRequestId)) {
      return jsonExecutionError({
        code: 'INVALID_EXECUTION_PAYLOAD',
        message: 'This Smart Entry request is invalid. Please review it and try again.',
        httpStatus: 400,
        category: 'validation',
      });
    }

    const requestId = rawRequestId;

    // ── 3. Re-read the confirmed request from Supabase — never trust browser ─
    //
    // Use the service client to read the full row so we get the server-stored
    // parsed_result, not anything the browser claims.  We then verify ownership.
    const serviceClient = createServiceClient();

    const { data: aiRequest, error: fetchError } = await serviceClient
      .from('ai_requests')
      .select('id, user_id, status, parsed_result, request_type, confirmation_status')
      .eq('id', requestId)
      .single();

    if (fetchError || !aiRequest) {
      return jsonExecutionError({
        code: 'REQUEST_NOT_FOUND',
        message: 'This Smart Entry request is no longer available. Please try again.',
        requestId,
        httpStatus: 404,
        category: 'state',
      });
    }

    // ── 4. Ownership check — request must belong to the authenticated user ─
    if (aiRequest.user_id !== user.id) {
      return jsonExecutionError({
        code: 'FORBIDDEN',
        message: 'This Smart Entry request belongs to another account.',
        requestId,
        httpStatus: 403,
        category: 'auth',
      });
    }

    // ── 5. State check — only execute confirmed requests ──────────────────
    const isConfirmedState =
      aiRequest.status === 'confirmed' && aiRequest.confirmation_status === 'confirmed';
    const isAlreadyProcessing =
      aiRequest.status === 'executing' ||
      aiRequest.status === 'executed' ||
      aiRequest.status === 'partially_executed';

    if (isAlreadyProcessing) {
      return jsonExecutionError({
        code: 'REQUEST_ALREADY_PROCESSED',
        message: 'This Smart Entry request is already being processed. Your records were not duplicated.',
        requestId,
        httpStatus: 409,
        category: 'state',
      });
    }

    if (!isConfirmedState) {
      return jsonExecutionError({
        code: 'REQUEST_NOT_CONFIRMED',
        message: 'This Smart Entry request is not ready to save yet.',
        requestId,
        httpStatus: 409,
        category: 'state',
      });
    }

    const access = await requireTextAiAccess(user.id, { skipUsageCheck: true });
    if (!access.ok) {
      return NextResponse.json(
        {
          success: false,
          status: 'failed',
          requestId,
          error: access.error,
          errorMessage: access.error.message,
        },
        { status: access.error.code === 'usage_exhausted' ? 429 : 403 }
      );
    }

    // ── 6. Validate server-stored parsed_result ───────────────────────────
    const parsedResult = aiRequest.parsed_result as ParsedFinancialInstruction | null;

    if (!parsedResult || !Array.isArray(parsedResult.actions) || parsedResult.actions.length === 0) {
      return jsonExecutionError({
        code: 'INVALID_EXECUTION_PAYLOAD',
        message: 'This Smart Entry request is invalid. Please review it and try again.',
        requestId,
        httpStatus: 422,
        category: 'validation',
      });
    }

    // ── 7. Re-read pending actions from Supabase — never trust browser ────
    //
    // Fetch the pending actions that were stored server-side when the request
    // was parsed.  We execute only these validated actions.
    const { data: pendingActions, error: pendingError } = await serviceClient
      .from('ai_pending_actions')
      .select('id, action_index, action_type, action_data, status')
      .eq('request_id', requestId)
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('action_index', { ascending: true });

    if (pendingError) {
      console.error('[AI Execute] Failed to fetch pending actions', {
        requestId,
        userId: user.id,
        code: 'PENDING_ACTIONS_LOAD_FAILED',
        message: pendingError.message,
      });
      return jsonExecutionError({
        code: 'PENDING_ACTIONS_LOAD_FAILED',
        message: 'The confirmed Smart Entry actions could not be loaded. Please try again.',
        requestId,
        httpStatus: 500,
      });
    }

    // ── 8. Atomically claim execution to prevent duplicate writes ──────────
    const { data: claimedRows, error: claimError } = await serviceClient
      .from('ai_requests')
      .update({ status: 'executing' })
      .eq('id', requestId)
      .eq('user_id', user.id)
      .eq('status', 'confirmed')
      .eq('confirmation_status', 'confirmed')
      .select('id, status');

    if (claimError) {
      console.error('[AI Execute] Failed to claim request for execution', {
        requestId,
        userId: user.id,
        code: 'AI_REQUEST_UPDATE_FAILED',
        message: claimError.message,
      });
      return jsonExecutionError({
        code: 'AI_REQUEST_UPDATE_FAILED',
        message: 'Smart Entry could not start saving your records. Please try again.',
        requestId,
        httpStatus: 500,
      });
    }

    if ((claimedRows ?? []).length === 0) {
      return jsonExecutionError({
        code: 'REQUEST_ALREADY_PROCESSED',
        message: 'This Smart Entry request is already being processed. Your records were not duplicated.',
        requestId,
        httpStatus: 409,
        category: 'state',
      });
    }

    // ── 9. Load execution context (accounts, categories, people) ─────────
    let ctx;
    try {
      ctx = await loadExecutionContextServer({
        instruction: parsedResult,
        userId: user.id,
        supabase: serviceClient,
      });
    } catch (ctxError) {
      await createAiFailureNotification({
        serviceClient,
        userId: user.id,
        requestId,
        message: 'Smart Entry could not load the required data. Please try again.',
      }).catch(() => undefined);
      console.error('[AI Execute] Failed to load execution context', {
        requestId,
        userId: user.id,
        code: isContextLoadError(ctxError) ? 'EXECUTION_CONTEXT_LOAD_FAILED' : 'EXECUTION_FAILED',
        message: getSafeExecutionErrorMessage(ctxError),
      });
      await serviceClient.rpc('rpc_ai_mark_request_failed', {
        p_request_id:     requestId,
        p_user_id:        user.id,
        p_error_category: isContextLoadError(ctxError) ? 'context_query_failed' : 'execution_error',
        p_error_message:  'Failed to load execution context',
      });
      return jsonExecutionError({
        code: 'EXECUTION_CONTEXT_LOAD_FAILED',
        message: 'The data needed to save this Smart Entry request could not be loaded. Please try again.',
        requestId,
        httpStatus: 500,
      });
    }

    // ── 10. Execute using server-read parsed_result — never browser data ──
    const startTime = Date.now();
    let executionResult;
    try {
      executionResult = await executeConfirmedActionsServer({
        requestId,
        instruction: parsedResult,
        userId: user.id,
        supabase: serviceClient,
        context: ctx,
      });
    } catch (execError) {
      const errMsg = getSafeExecutionErrorMessage(execError);
      const errorCode = getExecutionErrorCode(execError);
      const errorCategory = getExecutionErrorCategory(execError);
      await createAiFailureNotification({
        serviceClient,
        userId: user.id,
        requestId,
        message: errMsg,
      }).catch(() => undefined);
      console.error('[AI Execute] Execution failed', {
        requestId,
        userId: user.id,
        code: errorCode,
        category: errorCategory,
        message: errMsg,
        context: getSafeExecutionLogContext(execError),
      });
      await serviceClient.rpc('rpc_ai_mark_request_failed', {
        p_request_id:     requestId,
        p_user_id:        user.id,
        p_error_category: 'execution_error',
        p_error_message:  errMsg,
      });
      return jsonExecutionError({
        code: errorCode,
        message: errMsg,
        requestId,
        httpStatus: errorCategory === 'validation' ? 422 : errorCategory === 'state' ? 409 : 500,
        category: errorCategory,
      });
    }

    const duration = Date.now() - startTime;

    if (executionResult.clarification) {
      await serviceClient
        .from('ai_pending_actions')
        .update({ error_message: executionResult.clarification.message })
        .eq('request_id', requestId)
        .eq('user_id', user.id)
        .eq('action_index', executionResult.clarification.actionIndex);

      const { error: restoreError } = await serviceClient
        .from('ai_requests')
        .update({
          status: 'confirmed',
          confirmation_status: 'confirmed',
          error_category: executionResult.clarification.code,
          error_message: executionResult.clarification.message,
        })
        .eq('id', requestId)
        .eq('user_id', user.id)
        .eq('status', 'executing');

      if (restoreError) {
        console.error('[AI Execute] Failed to restore request after clarification:', restoreError.message);
      }

      return NextResponse.json(executionResult.clarification, { status: 422 });
    }

    // ── 11. Update pending action statuses via trusted server RPCs ────────
    //
    // rpc_ai_mark_pending_action_executed / rpc_ai_mark_pending_action_failed
    // are SECURITY DEFINER and restricted from authenticated users.
    if (pendingActions && pendingActions.length > 0) {
      for (const pa of pendingActions) {
        const executed = executionResult.executedActions.find(
          (ea) => ea.actionIndex === pa.action_index
        );
        const failed = executionResult.failedActions.find(
          (fa) => fa.actionIndex === pa.action_index
        );

        if (executed) {
          const { error: markExecErr } = await serviceClient.rpc('rpc_ai_mark_pending_action_executed', {
            p_action_id:   pa.id,
            p_user_id:     user.id,
            p_executed_at: new Date().toISOString(),
          });
          if (markExecErr) {
            console.error('[AI Execute] Failed to mark action executed:', markExecErr.message);
          }
        } else if (failed) {
          const { error: markFailErr } = await serviceClient.rpc('rpc_ai_mark_pending_action_failed', {
            p_action_id:     pa.id,
            p_user_id:       user.id,
            p_error_message: failed.error,
          });
          if (markFailErr) {
            console.error('[AI Execute] Failed to mark action failed:', markFailErr.message);
          }
        }
      }
    }

    // ── 12. Mark request with final execution result via trusted server RPC ─
    //
    // rpc_ai_mark_request_executed is SECURITY DEFINER and restricted from
    // authenticated users.  It validates the status value internally.
    const finalStatus = executionResult.success
      ? 'executed'
      : executionResult.partialSuccess
        ? 'partially_executed' :'failed';
    const primaryFailure = executionResult.failedActions[0]?.error || null;
    const failureCategory = primaryFailure
      ? getExecutionFailureCategory(primaryFailure)
      : null;

    const executedRecordIds = executionResult.executedActions.map((ea) => ({
      actionIndex: ea.actionIndex,
      actionType:  ea.actionType,
      recordId:    ea.recordId,
      recordTable: ea.recordTable,
    }));

    const { error: markDoneErr } = await serviceClient.rpc('rpc_ai_mark_request_executed', {
      p_request_id:          requestId,
      p_user_id:             user.id,
      p_status:              finalStatus,
      p_executed_record_ids: executedRecordIds.length > 0 ? executedRecordIds : null,
      p_error_category:      failureCategory,
      p_error_message:       primaryFailure,
      p_total_duration_ms:   duration,
    });

    if (markDoneErr) {
      console.error('[AI Execute] Failed to mark request executed', {
        requestId,
        userId: user.id,
        code: 'AI_REQUEST_UPDATE_FAILED',
        message: markDoneErr.message,
        finalStatus,
      });
    }

    // ── 13. Return result ─────────────────────────────────────────────────
    const responseBody = {
      success:         executionResult.success,
      partialSuccess:  executionResult.partialSuccess,
      executedActions: executionResult.executedActions,
      failedActions:   executionResult.failedActions,
      requestId,
      status:          finalStatus,
    };

    if (!executionResult.success && !executionResult.partialSuccess) {
      const httpStatus = failureCategory === 'invalid_action' ? 422 : 500;
      return NextResponse.json({
        ...responseBody,
        error: {
          code: failureCategory === 'invalid_action' ? 'INVALID_EXECUTION_PAYLOAD' : 'TRANSACTION_INSERT_FAILED',
          category: failureCategory === 'invalid_action' ? 'validation' : 'technical',
          message: primaryFailure || 'The transaction could not be saved. No records were created.',
          requestId,
        },
        errorMessage: primaryFailure || 'The transaction could not be saved. No records were created.',
      }, { status: httpStatus });
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('[AI Execute] Unexpected error', {
      code: 'EXECUTION_FAILED',
      message: error instanceof Error ? error.message : String(error),
    });
    return jsonExecutionError({
      code: 'EXECUTION_FAILED',
      message: 'Something went wrong while saving this Smart Entry request.',
      httpStatus: 500,
    });
  }
}

function getExecutionFailureCategory(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('unsupported action') || normalized.includes('invalid')) {
    return 'invalid_action';
  }
  return 'execution_error';
}
