import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadAIConfig, processAIRequest } from '@/lib/ai-gateway';
import type { AIAssistantRequest, AIErrorPayload, AIErrorResponse, AIUsageSummary } from '@/lib/ai-types';
import { applySmartEntryReviewToInstruction, buildInitialSmartEntryReview, getSmartEntryMissingFields } from '@/lib/smart-entry';
import { ensureUserSubscriptionSummary } from '@/lib/subscription/server';
import type { SubscriptionSummary } from '@/lib/subscription/types';
import { createClientId } from '@/lib/uuid';

type RequestType = 'voice' | 'text';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST_CREDIT_COST: Record<RequestType, number> = {
  text: 1,
  voice: 2,
};

// Server-side Supabase client — service role for SECURITY DEFINER RPC calls
function createServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      '[AI Parse] SUPABASE_SERVICE_ROLE_KEY is not set. ' +
      'Configure it as a server-only environment variable. '+ 'Never use the anon key as a fallback for server-controlled writes.'
    );
  }
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );
}

type ServerSupabaseClient = ReturnType<typeof createServerClient>;

// Allowlisted request types — never trust caller-supplied values directly
const ALLOWED_REQUEST_TYPES = new Set(['voice', 'text']);

// Allowlisted language codes — prevent prompt injection via language field
const ALLOWED_LANGUAGES = new Set([
  'en', 'ar', 'fr', 'ru', 'ur', 'auto',
]);

function shortRequestId(value: string | undefined | null) {
  if (!value) return null;
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
}

async function refundAICreditsSafely(args: {
  supabase: ServerSupabaseClient;
  userId: string;
  cycleId: string;
  ledgerId: string;
  reason: string;
}) {
  try {
    const { error } = await args.supabase.rpc('refund_ai_credits', {
      p_user_id: args.userId,
      p_cycle_id: args.cycleId,
      p_ledger_id: args.ledgerId,
      p_reason: args.reason,
    });

    if (error) {
      console.error('[AI Parse] Credit refund failed', {
        code: error.code || null,
        message: error.message,
      });
    }
  } catch (error) {
    console.error('[AI Parse] Credit refund failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Authenticate — derive user from token, never from body ──────────
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Load server-side config ──────────────────────────────────────────
    const config = loadAIConfig();

    if (!config.aiEnabled) {
      return NextResponse.json({
        requestId: createClientId(),
        status: 'not_configured',
        errorMessage: 'AI is not configured yet. You can continue using manual transaction entry.',
      });
    }

    // ── 3. Parse and validate the request payload before any credit mutation ─
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const requestType = getNormalizedRequestType(body);
    if (!requestType) {
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
    }

    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    if (requestId && !UUID_PATTERN.test(requestId)) {
      return NextResponse.json({ error: 'Invalid request id' }, { status: 400 });
    }

    let existingRequest:
      | { id: string; user_id: string; status: string; confirmation_status: string | null; idempotency_key: string | null }
      | null
      = null;

    if (requestId) {
      const { data: requestRow, error: requestError } = await supabase
        .from('ai_requests')
        .select('id, user_id, status, confirmation_status, idempotency_key')
        .eq('id', requestId)
        .single();

      if (requestError || !requestRow) {
        return NextResponse.json({ error: 'Request not found' }, { status: 404 });
      }
      if (requestRow.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (!['parsed', 'clarifying'].includes(requestRow.status) || requestRow.confirmation_status !== null) {
        return NextResponse.json(
          { error: 'This Smart Entry clarification flow is no longer editable.' },
          { status: 409 }
        );
      }

      existingRequest = requestRow;
    }

    const validationError = validatePayload(body, requestType, config.maxTextLength, config.maxAudioSeconds);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // ── 4. Subscription & credit enforcement ───────────────────────────────
    if (!existingRequest) {
      const { data: accessError } = await supabase.rpc('check_ai_access', {
        p_user_id: user.id,
        p_request_type: requestType,
      });

      if (accessError) {
        const usageResult = await ensureUserSubscriptionSummary(user.id);
        const errorResponse = buildAccessErrorResponse({
          accessError: String(accessError),
          requestType,
          requestId: requestId || undefined,
          summary: usageResult.summary,
        });

        return NextResponse.json(errorResponse, { status: 429 });
      }
    }

    // Reserve credits atomically only after validation succeeds
    const rawIdempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined;
    const parsedIdempotencyKey = rawIdempotencyKey
      ? rawIdempotencyKey.replace(/[^a-zA-Z0-9\-_]/g, '').substring(0, 128) || undefined
      : undefined;
    const idempotencyKey = existingRequest?.idempotency_key || parsedIdempotencyKey;

    let creditCycleId: string | undefined;
    let creditLedgerId: string | undefined;

    if (!existingRequest) {
      const { data: reserveResult } = await supabase.rpc('reserve_ai_credits', {
        p_user_id: user.id,
        p_request_type: requestType,
        p_idempotency_key: idempotencyKey || null,
      });

      const reserveData = reserveResult as { ok: boolean; error?: string; cycle_id?: string; ledger_id?: string; credits_reserved?: number } | null;

      if (!reserveData?.ok) {
        const usageResult = await ensureUserSubscriptionSummary(user.id);
        const errorResponse = buildReserveErrorResponse({
          reserveError: reserveData?.error,
          requestType,
          requestId: requestId || undefined,
          summary: usageResult.summary,
        });

        return NextResponse.json(errorResponse, { status: errorResponse.error.category === 'technical' ? 500 : 429 });
      }

      creditCycleId = reserveData.cycle_id;
      creditLedgerId = reserveData.ledger_id;
    }

    // ── 5. Build the request with explicit text vs voice separation ────────
    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // Validate language against allowlist — prevent prompt injection via language field
    const rawLanguage = typeof body.language === 'string' ? body.language.toLowerCase().trim() : 'en';
    const language = ALLOWED_LANGUAGES.has(rawLanguage) ? rawLanguage : 'en';

    // Sanitize idempotency key (already done above, reuse)
    // Context is optional and informational only
    const rawContext = body.context as Record<string, unknown> | undefined;
    const safeContext = rawContext ? sanitizeContext(rawContext) : undefined;

    const textValue = requestType === 'text' ? (body.text as string).trim() : undefined;
    const audioValue = requestType === 'voice' ? (body.audio as Record<string, unknown>) : undefined;

    // ── 6. Build request ────────────────────────────────────────────────────
    const request: AIAssistantRequest = {
      type: requestType,
      text: textValue,
      audio: requestType === 'voice'
        ? {
            audioBase64: audioValue?.audioBase64 as string,
            mimeType: (audioValue?.mimeType as string) || 'audio/webm',
            durationSeconds: typeof audioValue?.durationSeconds === 'number' ? audioValue.durationSeconds : undefined,
            languageHint: language !== 'auto' ? language : undefined,
          }
        : undefined,
      language,
      context: safeContext,
      idempotencyKey,
      userId: user.id,
    };

    // ── 7. Process through gateway ──────────────────────────────────────────
    const startTime = Date.now();
    const response = await processAIRequest(request, config);
    const duration = Date.now() - startTime;

    const responseBody = {
      ...response,
      errorMessage: getFriendlyParseFailureMessage(requestType, response.errorCategory, response.errorMessage),
      error: getFriendlyParseFailureMessage(requestType, response.errorCategory, response.errorMessage),
    };

    if (process.env.NODE_ENV !== 'production' && responseBody.status === 'failed') {
      console.warn('[AI Parse] Gateway failure', {
        requestType: `smart-entry/${requestType}`,
        requestId: responseBody.requestId,
        providerUsed: typeof responseBody.providerUsed === 'string' ? responseBody.providerUsed : null,
        providerStatus: extractProviderStatusCode(response.errorMessage),
        errorCode: response.errorCategory || 'unknown',
        durationMs: duration,
      });
    }

    if (responseBody.parsed) {
      const review = buildInitialSmartEntryReview({
        instruction: responseBody.parsed,
        sourceText: textValue || responseBody.transcript,
        context: safeContext as AIAssistantRequest['context'],
      });
      const reviewedInstruction = applySmartEntryReviewToInstruction({
        ...responseBody.parsed,
        review,
        missingFields: [...review.missing],
        requiresClarification: false,
        clarificationQuestions: [],
      });

      responseBody.status = 'parsed';
      responseBody.parsed = {
        ...reviewedInstruction,
        review: {
          ...review,
          missing: getSmartEntryMissingFields(reviewedInstruction),
        },
        missingFields: getSmartEntryMissingFields(reviewedInstruction),
        requiresClarification: false,
        clarificationQuestions: [],
      };
    }

    const persistedRequest = await persistAIRequest({
      supabase,
      userId: user.id,
      requestType,
      requestText: textValue,
      language,
      response: responseBody,
      idempotencyKey,
      duration,
      retainTranscript: config.enableTranscriptRetention && !!response.transcript,
      existingRequestId: existingRequest?.id,
    });

    if (responseBody.parsed && (!persistedRequest?.id || !UUID_PATTERN.test(persistedRequest.id))) {
      if (!existingRequest && creditCycleId && creditLedgerId) {
        await refundAICreditsSafely({
          supabase,
          userId: user.id,
          cycleId: creditCycleId,
          ledgerId: creditLedgerId,
          reason: 'persistence_failure',
        });
      }

      console.error('[AI Parse] Parsed request persistence failed', {
        code: 'AI_REQUEST_PERSISTENCE_FAILED',
        table: 'ai_requests',
        hasUserId: !!user.id,
        requestLookup: existingRequest ? 'update' : 'insert',
        existingRequestId: shortRequestId(existingRequest?.id),
        providerRequestId: shortRequestId(responseBody.requestId),
        persistedRequestId: shortRequestId(persistedRequest?.id),
      });

      const failureRequestId = createClientId();
      return NextResponse.json(
        buildErrorResponse({
          requestId: failureRequestId,
          error: {
            code: 'AI_REQUEST_PERSISTENCE_FAILED',
            category: 'technical',
            message: 'Smart Entry is temporarily unavailable. Please try again.',
            requestId: failureRequestId,
          },
        }),
        { status: 500 }
      );
    }

    if (persistedRequest?.id && responseBody.parsed) {
      responseBody.requestId = persistedRequest.id;
      responseBody.parsed = {
        ...responseBody.parsed,
        requestId: persistedRequest.id,
      };
    }

    // ── 8. Finalise or refund credits based on outcome ──────────────────────
    if (!existingRequest && creditCycleId && creditLedgerId) {
      if (responseBody.status === 'failed') {
        // Provider/system failure → refund
        await supabase.rpc('refund_ai_credits', {
          p_user_id: user.id,
          p_cycle_id: creditCycleId,
          p_ledger_id: creditLedgerId,
          p_reason: responseBody.errorCategory || 'provider_failure',
        });

      } else {
        // Success → finalise with provider details
        const creditCost = requestType === 'voice' ? 2 : 1;
        await supabase.rpc('finalise_ai_credits', {
          p_user_id: user.id,
          p_cycle_id: creditCycleId,
          p_ledger_id: creditLedgerId,
          p_ai_request_id: persistedRequest?.id || null,
          p_input_tokens: null,
          p_output_tokens: null,
          p_total_tokens: null,
          p_speech_duration_ms: null,
          p_provider_name: sanitizeProviderName(responseBody.providerUsed) || null,
          p_model_name: responseBody.parsed?.modelUsed || null,
          p_estimated_cost: null,
          p_credit_cost: creditCost,
        });

      }
    }

    // ── 9. Usage tracking ────────────────────────────────────────────────────
    if (!existingRequest) {
      const safeProviderUsed = sanitizeProviderName(responseBody.providerUsed);
      await userSupabase.rpc('increment_ai_daily_usage', {
        p_request_type:  requestType,
        p_provider_type: safeProviderUsed?.includes('vps') ? 'vps' : 'cloud',
        p_fallback_used: responseBody.fallbackUsed || false,
        p_success:       responseBody.status !== 'failed',
        p_confirmed:     false,
        p_duration_ms:   duration,
      });
    }

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('[AI Parse] Error:', error instanceof Error ? error.message : error);
    const requestId = createClientId();
    return NextResponse.json(
      buildErrorResponse({
        requestId,
        error: {
          code: 'AI_PARSE_TECHNICAL_ERROR',
          category: 'technical',
          message: 'AI text processing is temporarily unavailable. Please try again.',
          requestId,
        },
      }),
      { status: 500 }
    );
  }
}

// ─── Sanitization helpers ─────────────────────────────────────────────────────

/** Keep only safe context fields used for review hydration and provider hints. */
function sanitizeContext(ctx: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  // Only pass through known safe context keys
  if (Array.isArray(ctx.accounts)) {
    safe.accounts = (ctx.accounts as unknown[]).map((a) => {
      if (typeof a !== 'object' || !a) return null;
      const acc = a as Record<string, unknown>;
      return {
        id: typeof acc.id === 'string' && UUID_PATTERN.test(acc.id) ? acc.id : undefined,
        name: acc.name,
        type: acc.type,
        currency: acc.currency,
        includeInTotal: typeof acc.includeInTotal === 'boolean' ? acc.includeInTotal : undefined,
      };
    }).filter(Boolean);
  }
  if (Array.isArray(ctx.people)) {
    safe.people = (ctx.people as unknown[]).map((p) => {
      if (typeof p !== 'object' || !p) return null;
      const person = p as Record<string, unknown>;
      return {
        id: typeof person.id === 'string' && UUID_PATTERN.test(person.id) ? person.id : undefined,
        fullName: person.fullName,
        aliases: Array.isArray(person.aliases)
          ? person.aliases.filter((alias): alias is string => typeof alias === 'string')
          : undefined,
        relationship: typeof person.relationship === 'string' ? person.relationship : undefined,
      };
    }).filter(Boolean);
  }
  if (Array.isArray(ctx.categories)) {
    safe.categories = (ctx.categories as unknown[]).map((c) => {
      if (typeof c !== 'object' || !c) return null;
      const cat = c as Record<string, unknown>;
      return {
        id: typeof cat.id === 'string' && UUID_PATTERN.test(cat.id) ? cat.id : undefined,
        name: cat.name,
        type: typeof cat.type === 'string' ? cat.type : undefined,
      };
    }).filter(Boolean);
  }
  if (Array.isArray(ctx.subscriptions)) {
    safe.subscriptions = (ctx.subscriptions as unknown[]).map((s) => {
      if (typeof s !== 'object' || !s) return null;
      const subscription = s as Record<string, unknown>;
      return {
        id: typeof subscription.id === 'string' && UUID_PATTERN.test(subscription.id) ? subscription.id : undefined,
        name: typeof subscription.name === 'string' ? subscription.name : undefined,
        provider: typeof subscription.provider === 'string' ? subscription.provider : undefined,
        amount: typeof subscription.amount === 'number' && Number.isFinite(subscription.amount) ? subscription.amount : undefined,
        currencyCode: typeof subscription.currencyCode === 'string'
          ? subscription.currencyCode.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3)
          : undefined,
        billingFrequency: typeof subscription.billingFrequency === 'string' ? subscription.billingFrequency : undefined,
        status: typeof subscription.status === 'string' ? subscription.status : undefined,
        nextBillingDate: typeof subscription.nextBillingDate === 'string' ? subscription.nextBillingDate : undefined,
        financialAccountId: typeof subscription.financialAccountId === 'string' && UUID_PATTERN.test(subscription.financialAccountId)
          ? subscription.financialAccountId
          : undefined,
      };
    }).filter(Boolean);
  }
  if (typeof ctx.defaultCurrency === 'string') {
    // Currency code: 3 uppercase letters only
    const currency = ctx.defaultCurrency.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3);
    if (currency.length === 3) safe.defaultCurrency = currency;
  }
  return safe;
}

const VALID_PROVIDER_NAMES = new Set(['openrouter', 'vps_ai', 'cloud_stt', 'vps_stt', 'mock']);
function sanitizeProviderName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return VALID_PROVIDER_NAMES.has(name) ? name : undefined;
}

const VALID_REQUEST_STATUSES = new Set([
  'pending', 'parsed', 'clarifying', 'confirmed', 'executed', 'cancelled', 'failed', 'not_configured',
]);
function sanitizeRequestStatus(status: string | undefined): string {
  if (!status) return 'failed';
  return VALID_REQUEST_STATUSES.has(status) ? status : 'failed';
}

const VALID_INTENTS = new Set([
  'personal_transaction', 'managed_person_transaction', 'transfer',
  'reimbursement', 'settlement', 'budget', 'recurring_transaction',
  'personal_subscription_create', 'personal_subscription_update',
  'personal_subscription_payment', 'personal_subscription_cancel',
  'multiple_actions', 'unclear',
]);
function sanitizeOverallIntent(intent: string | undefined): string | null {
  if (!intent) return null;
  return VALID_INTENTS.has(intent) ? intent : null;
}

const VALID_ERROR_CATEGORIES = new Set([
  'timeout', 'not_configured', 'auth_error', 'rate_limited',
  'provider_error', 'invalid_response', 'input_too_long', 'empty_input', 'unknown',
]);
function sanitizeErrorCategory(cat: string | undefined): string | null {
  if (!cat) return null;
  return VALID_ERROR_CATEGORIES.has(cat) ? cat : 'unknown';
}

function getNormalizedRequestType(body: Record<string, unknown>): RequestType | null {
  const raw = typeof body.inputType === 'string'
    ? body.inputType
    : typeof body.type === 'string'
      ? body.type
      : null;
  if (!raw || !ALLOWED_REQUEST_TYPES.has(raw)) return null;
  return raw as RequestType;
}

function validatePayload(
  body: Record<string, unknown>,
  requestType: RequestType,
  maxTextLength: number,
  maxAudioSeconds: number
): string | null {
  if (requestType === 'text') {
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return 'Please enter a transaction description.';
    }
    if (body.text.trim().length > maxTextLength) {
      return `Input too long. Maximum ${maxTextLength} characters.`;
    }
    return null;
  }

  const audio = body.audio as Record<string, unknown> | undefined;
  if (!audio?.audioBase64 || typeof audio.audioBase64 !== 'string') {
    return 'Voice audio is required for voice entry.';
  }

  const audioBytes = Buffer.byteLength(audio.audioBase64, 'base64');
  const maxBytes = maxAudioSeconds * 32000;
  if (audioBytes > maxBytes) {
    return 'Audio file too large.';
  }

  const allowedMimeTypes = new Set([
    'audio/webm', 'audio/webm;codecs=opus', 'audio/ogg',
    'audio/ogg;codecs=opus', 'audio/mp4', 'audio/mpeg',
    'audio/wav', 'audio/x-wav',
  ]);
  const mimeType = typeof audio.mimeType === 'string' ? audio.mimeType.toLowerCase() : '';
  if (mimeType && !allowedMimeTypes.has(mimeType)) {
    return 'Unsupported audio format.';
  }

  return null;
}

function getAccessErrorMessage(accessError: unknown): string {
  const errorMessages: Record<string, string> = {
    no_subscription: 'No active subscription. Please sign up for a plan.',
    plan_inactive: 'Your plan is currently inactive.',
    subscription_expired: 'Your subscription has expired. Please upgrade to continue.',
    trial_expired: 'Your free trial has ended. Upgrade to continue using AI features.',
    text_ai_disabled: 'Text AI is not available on your current plan.',
    voice_ai_disabled: 'Voice AI is not available on your current plan.',
    daily_limit_reached: 'You have reached today’s AI request limit.',
    credits_exhausted: 'You have reached your AI credit limit for this period.',
    voice_limit_reached: 'You have reached your AI credit limit for this period.',
  };
  return errorMessages[String(accessError)] || 'AI access is temporarily unavailable.';
}

function summarizeUsage(summary: SubscriptionSummary | null | undefined): AIUsageSummary | undefined {
  if (!summary) return undefined;

  const creditsAllocated = Number(summary.creditsAllocated || 0);
  const creditsConsumed = Number(summary.creditsConsumed || 0);
  const creditsReserved = Number(summary.creditsReserved || 0);

  return {
    planName: summary.planName,
    planCode: summary.planCode,
    subscriptionStatus: summary.status,
    requestsToday: Number(summary.requestsToday || 0),
    dailyRequestLimit: Number(summary.dailyAiRequestLimit || 0),
    creditsAllocated,
    creditsConsumed,
    creditsReserved,
    creditsRemaining: Math.max(0, creditsAllocated - creditsConsumed - creditsReserved),
    cycleStart: summary.cycleStart ?? undefined,
    cycleEnd: summary.cycleEnd ?? undefined,
    trialEndsAt: summary.trialEndsAt ?? undefined,
    currentPeriodEnd: summary.currentPeriodEnd ?? undefined,
    monthlyVoiceSeconds: Number(summary.monthlyVoiceSeconds || 0),
    voiceSecondsUsed: Number(summary.voiceSecondsUsed || 0),
    monthlyReceiptExtractions: Number(summary.monthlyReceiptExtractions || 0),
    receiptIntelligenceEnabled: Boolean(summary.receiptIntelligenceEnabled),
    receiptExtractionsIncluded: Number(summary.receiptExtractionsIncluded || 0),
    receiptExtractionsUsed: Number(summary.receiptExtractionsUsed || 0),
    receiptExtractionsReserved: Number(summary.receiptExtractionsReserved || 0),
    receiptExtractionsRemaining: Number(summary.receiptExtractionsRemaining || 0),
  };
}

function buildErrorResponse(args: {
  requestId?: string;
  error: AIErrorPayload;
  usage?: AIUsageSummary;
}): AIErrorResponse {
  return {
    success: false,
    status: 'failed',
    requestId: args.requestId,
    error: args.error,
    errorMessage: args.error.message,
    usage: args.usage,
  };
}

function secondsUntilNextUtcDay() {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 1000));
}

function buildAccessErrorResponse(args: {
  accessError: string;
  requestType: RequestType;
  requestId?: string;
  summary?: SubscriptionSummary | null;
}): AIErrorResponse {
  const usage = summarizeUsage(args.summary);
  const requiredCredits = REQUEST_CREDIT_COST[args.requestType];
  const remainingCredits = usage?.creditsRemaining;

  switch (args.accessError) {
    case 'daily_limit_reached':
      return buildErrorResponse({
        requestId: args.requestId,
        usage,
        error: {
          code: 'DAILY_REQUEST_LIMIT_REACHED',
          category: 'usage_limit',
          message: getAccessErrorMessage(args.accessError),
          limitType: 'daily_requests',
          requestId: args.requestId,
          retryAfterSeconds: secondsUntilNextUtcDay(),
        },
      });
    case 'credits_exhausted':
    case 'voice_limit_reached':
      return buildCreditLimitErrorResponse({
        requestId: args.requestId,
        usage,
        requiredCredits,
        fallbackMessage: getAccessErrorMessage(args.accessError),
      });
    case 'trial_expired':
      return buildErrorResponse({
        requestId: args.requestId,
        usage,
        error: {
          code: 'TRIAL_EXPIRED',
          category: 'subscription',
          message: getAccessErrorMessage(args.accessError),
          limitType: 'trial_expired',
          requestId: args.requestId,
          remainingCredits,
        },
      });
    case 'subscription_expired':
    case 'no_subscription':
    case 'plan_inactive':
      return buildErrorResponse({
        requestId: args.requestId,
        usage,
        error: {
          code: 'SUBSCRIPTION_EXPIRED',
          category: 'subscription',
          message: getAccessErrorMessage(args.accessError),
          limitType: 'subscription_expired',
          requestId: args.requestId,
          remainingCredits,
        },
      });
    case 'text_ai_disabled':
    case 'voice_ai_disabled':
      return buildErrorResponse({
        requestId: args.requestId,
        usage,
        error: {
          code: 'PLAN_FEATURE_UNAVAILABLE',
          category: 'subscription',
          message: getAccessErrorMessage(args.accessError),
          limitType: 'feature_unavailable',
          requestId: args.requestId,
          remainingCredits,
        },
      });
    default:
      return buildErrorResponse({
        requestId: args.requestId,
        usage,
        error: {
          code: 'AI_ACCESS_UNAVAILABLE',
          category: 'technical',
          message: getAccessErrorMessage(args.accessError),
          requestId: args.requestId,
        },
      });
  }
}

function buildReserveErrorResponse(args: {
  reserveError?: string;
  requestType: RequestType;
  requestId?: string;
  summary?: SubscriptionSummary | null;
}): AIErrorResponse {
  const usage = summarizeUsage(args.summary);
  const requiredCredits = REQUEST_CREDIT_COST[args.requestType];

  if (args.reserveError === 'credits_exhausted') {
    return buildCreditLimitErrorResponse({
      requestId: args.requestId,
      usage,
      requiredCredits,
      fallbackMessage: 'Unable to reserve AI credits right now.',
    });
  }

  return buildErrorResponse({
    requestId: args.requestId,
    usage,
    error: {
      code: 'AI_CREDIT_RESERVATION_FAILED',
      category: 'technical',
      message: 'Unable to reserve AI credits right now. Please try again.',
      requestId: args.requestId,
    },
  });
}

function buildCreditLimitErrorResponse(args: {
  requestId?: string;
  usage?: AIUsageSummary;
  requiredCredits: number;
  fallbackMessage: string;
}): AIErrorResponse {
  const remainingCredits = typeof args.usage?.creditsRemaining === 'number' ? args.usage.creditsRemaining : 0;
  const creditsAllocated = typeof args.usage?.creditsAllocated === 'number' ? args.usage.creditsAllocated : 0;
  const creditsConsumed = typeof args.usage?.creditsConsumed === 'number' ? args.usage.creditsConsumed : 0;
  const creditsReserved = typeof args.usage?.creditsReserved === 'number' ? args.usage.creditsReserved : 0;
  const creditsUsed = creditsConsumed + creditsReserved;
  const exhausted = creditsAllocated > 0 && creditsUsed >= creditsAllocated;

  return buildErrorResponse({
    requestId: args.requestId,
    usage: args.usage,
    error: exhausted
      ? {
          code: 'MONTHLY_CREDIT_LIMIT_REACHED',
          category: 'usage_limit',
          message: 'You have used all available AI credits for this billing period.',
          limitType: 'monthly_credits',
          requestId: args.requestId,
          requiredCredits: args.requiredCredits,
          remainingCredits,
        }
      : {
          code: 'INSUFFICIENT_AI_CREDITS',
          category: 'usage_limit',
          message: args.fallbackMessage || 'You do not have enough AI credits for this action.',
          limitType: 'insufficient_credits',
          requestId: args.requestId,
          requiredCredits: args.requiredCredits,
          remainingCredits,
        },
  });
}

function getFriendlyParseFailureMessage(
  requestType: RequestType,
  errorCategory: string | undefined,
  rawErrorMessage: string | undefined
): string | undefined {
  if (!rawErrorMessage) return undefined;
  if (requestType === 'voice' && (errorCategory === 'not_configured' || /stt/i.test(rawErrorMessage))) {
    return 'Voice transcription is not configured yet. You can still use text entry.';
  }
  if (errorCategory === 'rate_limited') {
    return 'The AI provider did not respond. Your credits were not charged.';
  }
  if (requestType === 'text') {
    return 'AI text processing is temporarily unavailable. Please try again.';
  }
  return 'The AI provider did not respond. Your credits were not charged.';
}

function extractProviderStatusCode(rawErrorMessage: string | undefined): number | null {
  if (!rawErrorMessage) return null;

  const match = rawErrorMessage.match(/\berror\s+(\d{3})\b/i);
  if (!match) return null;

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

async function persistAIRequest(args: {
  supabase: ReturnType<typeof createServerClient>;
  userId: string;
  requestType: RequestType;
  requestText: string | undefined;
  language: string;
  response: {
    status: string;
    parsed?: AIAssistantRequest['context'] & { actions?: unknown[]; requestId?: string; overallIntent?: string; language?: string; confidence?: number; warnings?: unknown; missingFields?: unknown; requiresClarification?: boolean; modelUsed?: string; clarificationQuestions?: string[] };
    transcript?: string;
    providerUsed?: string;
    fallbackUsed?: boolean;
    errorCategory?: string;
    errorMessage?: string;
  };
  idempotencyKey?: string;
  duration: number;
  retainTranscript: boolean;
  existingRequestId?: string;
}) {
  const safeProviderUsed = sanitizeProviderName(args.response.providerUsed);
  const safeStatus = sanitizeRequestStatus(args.response.status);
  const safeIntent = sanitizeOverallIntent(args.response.parsed?.overallIntent);

  const insertPayload = {
    user_id: args.userId,
    request_type: args.requestType,
    status: safeStatus,
    overall_intent: safeIntent,
    raw_text: args.requestType === 'text' ? args.requestText || null : null,
    transcript: args.retainTranscript ? args.response.transcript || null : null,
    transcript_retained: !!args.retainTranscript,
    input_language: args.language,
    detected_language: args.response.parsed?.language || null,
    language_provider_used: safeProviderUsed as any || null,
    fallback_used: args.response.fallbackUsed || false,
    provider_model: args.response.parsed?.modelUsed || null,
    parsed_result: args.response.parsed || null,
    pending_actions: args.response.parsed?.actions || null,
    clarification_context: args.response.parsed?.clarificationQuestions || null,
    confidence: typeof args.response.parsed?.confidence === 'number'
      ? Math.min(1, Math.max(0, args.response.parsed.confidence))
      : null,
    warnings: args.response.parsed?.warnings || null,
    missing_fields: args.response.parsed?.missingFields || null,
    requires_clarification: args.response.parsed?.requiresClarification || false,
    error_category: sanitizeErrorCategory(args.response.errorCategory),
    error_message: args.response.errorMessage || null,
    idempotency_key: args.idempotencyKey || null,
    total_duration_ms: args.duration,
  };

  let requestRow: { id: string } | null = null;
  if (args.existingRequestId) {
    const { data: updatedRow, error: updateError } = await args.supabase
      .from('ai_requests')
      .update(insertPayload)
      .eq('id', args.existingRequestId)
      .eq('user_id', args.userId)
      .select('id')
      .single();

    if (updateError || !updatedRow?.id) {
      console.error('[AI Parse] Failed to update ai_requests row', {
        code: 'AI_REQUEST_PERSISTENCE_FAILED',
        table: 'ai_requests',
        operation: 'update',
        hasUserId: !!args.userId,
        existingRequestId: shortRequestId(args.existingRequestId),
        message: updateError?.message || 'Missing updated request id',
      });
      return null;
    }

    requestRow = updatedRow;

    await args.supabase
      .from('ai_pending_actions')
      .delete()
      .eq('request_id', args.existingRequestId)
      .eq('user_id', args.userId);
  } else {
    const { data: insertedRow, error: insertError } = await args.supabase
      .from('ai_requests')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError || !insertedRow?.id) {
      console.error('[AI Parse] Failed to insert ai_requests row', {
        code: 'AI_REQUEST_PERSISTENCE_FAILED',
        table: 'ai_requests',
        operation: 'insert',
        hasUserId: !!args.userId,
        message: insertError?.message || 'Missing inserted request id',
      });
      return null;
    }

    requestRow = insertedRow;
  }

  const actions = Array.isArray(args.response.parsed?.actions) ? args.response.parsed.actions : [];
  if (actions.length > 0) {
    const rows = actions.map((action, index) => ({
      user_id: args.userId,
      request_id: requestRow.id,
      action_index: index,
      action_type: typeof (action as { actionType?: unknown }).actionType === 'string'
        ? (action as { actionType: string }).actionType
        : 'unknown',
      action_data: action,
      status: 'pending',
    }));

    const { data: pendingRows, error: pendingActionsError } = await args.supabase
      .from('ai_pending_actions')
      .insert(rows)
      .select('id, action_index');

    if (pendingActionsError) {
      console.error('[AI Parse] Failed to insert ai_pending_actions rows', {
        code: 'AI_PENDING_ACTIONS_PERSISTENCE_FAILED',
        table: 'ai_pending_actions',
        operation: 'insert',
        hasUserId: !!args.userId,
        requestId: shortRequestId(requestRow.id),
        message: pendingActionsError.message,
      });
    }

    if (pendingRows && pendingRows.length > 0 && args.response.parsed) {
      (args.response as Record<string, unknown>).pendingActionIds = pendingRows;
    }
  }

  return requestRow;
}
