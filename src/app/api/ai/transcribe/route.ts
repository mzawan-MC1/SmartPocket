import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  applySmartEntryDateDefaults,
  buildSmartEntryDateContext,
} from '@/lib/ai-relative-dates';
import { loadAIConfig, processAIRequest } from '@/lib/ai-gateway';
import type {
  AIAssistantRequest,
  AIErrorPayload,
  AIErrorResponse,
  FinancialContext,
  ParsedFinancialInstruction,
} from '@/lib/ai-types';
import {
  applySmartEntryReviewToInstruction,
  buildInitialSmartEntryReview,
  getSmartEntryMissingFields,
} from '@/lib/smart-entry';
import { ensureUserSubscriptionSummary } from '@/lib/subscription/server';
import {
  isSupportedVoiceAudioMimeType,
  normalizeVoiceAudioMimeType,
} from '@/lib/voice-ai';
import {
  loadRuntimeVoiceTranscriptionConfig,
} from '@/lib/voice-ai-server';
import { createClientId } from '@/lib/uuid';
import { SUPPORTED_LANGUAGE_CODES } from '@/i18n/registry';

function createServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  );
}

function parsePositiveNumber(value: FormDataEntryValue | null) {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toSpeechDurationMs(durationSeconds: number) {
  return Math.max(1, Math.ceil(durationSeconds * 1000));
}

const SUPPORTED_SPOKEN_LANGUAGES = new Set<string>(['auto', 'ur', ...SUPPORTED_LANGUAGE_CODES]);
const SUPPORTED_DISPLAY_LANGUAGES = new Set<string>([...SUPPORTED_LANGUAGE_CODES]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_RELATIONSHIPS = new Set([
  'spouse',
  'child',
  'parent',
  'sibling',
  'friend',
  'relative',
  'colleague',
  'client',
  'other',
]);
const VALID_PROVIDER_NAMES = new Set(['openrouter', 'vps_ai', 'cloud_stt', 'vps_stt', 'mock', 'gemini', 'gemini_voice']);
const VALID_REQUEST_STATUSES = new Set([
  'pending',
  'parsed',
  'clarifying',
  'confirmed',
  'executed',
  'cancelled',
  'failed',
  'not_configured',
]);
const VALID_INTENTS = new Set([
  'personal_transaction',
  'managed_person_transaction',
  'transfer',
  'reimbursement',
  'settlement',
  'budget',
  'recurring_transaction',
  'personal_subscription_create',
  'personal_subscription_update',
  'personal_subscription_payment',
  'personal_subscription_cancel',
  'multiple_actions',
  'unclear',
]);
const VALID_ERROR_CATEGORIES = new Set([
  'timeout',
  'not_configured',
  'auth_error',
  'rate_limited',
  'provider_error',
  'invalid_response',
  'input_too_long',
  'empty_input',
  'unknown',
  'openrouter_not_configured',
  'voice_model_missing',
  'voice_model_audio_unsupported',
  'openrouter_auth_failed',
  'openrouter_provider_unavailable',
  'transcription_failed',
  'gemini_auth_failed',
  'gemini_rate_limited',
  'gemini_provider_unavailable',
  'gemini_request_timeout',
  'gemini_not_configured',
  'gemini_model_missing',
  'gemini_api_key_missing',
  'request_timeout',
  'provider_unavailable',
  'safety_blocked',
  'safety_violation',
  'empty_audio',
  'audio_too_large',
  'invalid_audio_payload',
  'wav_header_invalid',
  'audio_too_short',
  'unsupported_audio_type',
]);

type SpokenLanguageCode = 'auto' | 'en' | 'ur' | 'ar' | 'fr' | 'ru' | 'tr' | 'zh-CN' | 'es' | 'pt-BR';
type DisplayLanguageCode = 'en' | 'ar' | 'fr' | 'ru' | 'tr' | 'zh-CN' | 'es' | 'pt-BR';

const SPOKEN_LOOKUP: Record<string, SpokenLanguageCode> = {
  auto: 'auto', en: 'en', ur: 'ur', ar: 'ar', fr: 'fr', ru: 'ru',
  tr: 'tr', 'zh-cn': 'zh-CN', es: 'es', 'pt-br': 'pt-BR',
  'zh_cn': 'zh-CN', 'pt_br': 'pt-BR', zhc: 'zh-CN', ptb: 'pt-BR',
  zh: 'zh-CN', pt: 'pt-BR', 'zh-hans': 'zh-CN',
};
const DISPLAY_LOOKUP: Record<string, DisplayLanguageCode> = {
  en: 'en', ar: 'ar', fr: 'fr', ru: 'ru', tr: 'tr',
  'zh-cn': 'zh-CN', es: 'es', 'pt-br': 'pt-BR',
  'zh_cn': 'zh-CN', 'pt_br': 'pt-BR',
  zh: 'zh-CN', pt: 'pt-BR',
};

function normalizeSpokenLanguage(value: FormDataEntryValue | null): SpokenLanguageCode {
  if (typeof value !== 'string') {
    return 'auto';
  }
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  return SPOKEN_LOOKUP[normalized]
    ?? SPOKEN_LOOKUP[normalized.split('-')[0]]
    ?? 'auto';
}

function normalizeDisplayLanguage(value: FormDataEntryValue | null): DisplayLanguageCode {
  if (typeof value !== 'string') {
    return 'en';
  }
  const normalized = value.trim().toLowerCase().replace(/_/g, '-');
  return DISPLAY_LOOKUP[normalized]
    ?? DISPLAY_LOOKUP[normalized.split('-')[0]]
    ?? 'en';
}

function buildError(
  code: AIErrorPayload['code'],
  category: AIErrorPayload['category'],
  message: string,
  requestId: string
): AIErrorResponse {
  return {
    success: false,
    status: 'failed',
    requestId,
    error: {
      code,
      category,
      message,
      requestId,
    },
    errorMessage: message,
  };
}

function mapAccessErrorToVoiceError(
  accessError: string,
  requestId: string,
  resetDateLabel: string | null
) {
  switch (accessError) {
    case 'voice_ai_disabled':
    case 'text_ai_disabled':
    case 'plan_inactive':
    case 'subscription_expired':
    case 'trial_expired':
    case 'no_subscription':
      return buildError(
        'voice_not_in_plan',
        'subscription',
        'Voice AI is not available on your current plan.',
        requestId
      );
    case 'voice_limit_reached':
      return buildError(
        'voice_limit_reached',
        'usage_limit',
        resetDateLabel
          ? `Voice limit reached. Your allowance resets on ${resetDateLabel}.`
          : 'Voice limit reached.',
        requestId
      );
    case 'credits_exhausted':
      return buildError(
        'voice_limit_reached',
        'usage_limit',
        'Voice AI is temporarily unavailable because your AI allowance has been used.',
        requestId
      );
    default:
      return buildError(
        'transcription_failed',
        'technical',
        'Voice transcription is temporarily unavailable.',
        requestId
      );
  }
}

function formatResetDate(value: string | null | undefined) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function getStoredVoiceErrorCode(value: string | null | undefined): AIErrorPayload['code'] {
  switch (value) {
    case 'timeout':
    case 'voice_not_in_plan':
    case 'voice_limit_reached':
    case 'empty_audio':
    case 'unsupported_audio_type':
    case 'audio_too_large':
    case 'openrouter_not_configured':
    case 'voice_model_missing':
    case 'voice_model_audio_unsupported':
    case 'openrouter_auth_failed':
    case 'openrouter_provider_unavailable':
    case 'transcription_failed':
    case 'gemini_not_configured':
    case 'gemini_model_missing':
    case 'gemini_api_key_missing':
    case 'gemini_auth_failed':
    case 'gemini_provider_unavailable':
    case 'gemini_request_timeout':
      return value;
    default:
      return 'transcription_failed';
  }
}

function getStoredVoiceErrorStatus(code: AIErrorPayload['code']) {
  switch (code) {
    case 'timeout':
    case 'gemini_request_timeout':
      return 504;
    case 'voice_not_in_plan':
      return 403;
    case 'voice_limit_reached':
      return 429;
    case 'unsupported_audio_type':
      return 415;
    case 'audio_too_large':
      return 413;
    case 'openrouter_provider_unavailable':
    case 'gemini_provider_unavailable':
      return 503;
    case 'openrouter_not_configured':
    case 'voice_model_missing':
    case 'voice_model_audio_unsupported':
    case 'openrouter_auth_failed':
    case 'gemini_not_configured':
    case 'gemini_model_missing':
    case 'gemini_api_key_missing':
    case 'gemini_auth_failed':
      return 409;
    default:
      return 409;
  }
}

function shortRequestId(value: string | undefined | null) {
  if (!value) return null;
  return value.length > 8 ? `${value.slice(0, 8)}...` : value;
}

function sanitizeProviderName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return VALID_PROVIDER_NAMES.has(name) ? name : undefined;
}

function sanitizeRequestStatus(status: string | undefined): string {
  if (!status) return 'failed';
  return VALID_REQUEST_STATUSES.has(status) ? status : 'failed';
}

function sanitizeOverallIntent(intent: string | undefined): string | null {
  if (!intent) return null;
  return VALID_INTENTS.has(intent) ? intent : null;
}

function sanitizeErrorCategory(cat: string | undefined): string | null {
  if (!cat) return null;
  return VALID_ERROR_CATEGORIES.has(cat) ? cat : 'unknown';
}

function sanitizeTechnicalDetail(value: string | undefined | null) {
  if (!value) return null;
  return value
    .replace(/sk-[a-z0-9_-]+/gi, '[redacted]')
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseJsonField(value: FormDataEntryValue | null) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sanitizeContext(ctx: Record<string, unknown>): FinancialContext {
  const safe: FinancialContext = {};

  if (Array.isArray(ctx.accounts)) {
    safe.accounts = (ctx.accounts as unknown[]).flatMap((a) => {
      if (typeof a !== 'object' || !a) return [];
      const acc = a as Record<string, unknown>;
      const id = typeof acc.id === 'string' && UUID_PATTERN.test(acc.id) ? acc.id : '';
      const name = typeof acc.name === 'string' ? acc.name.trim() : '';
      const type = typeof acc.type === 'string' ? acc.type.trim() : '';
      const currency = typeof acc.currency === 'string'
        ? acc.currency.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3)
        : '';
      if (!id || !name || !type || currency.length !== 3) return [];
      return [{
        id,
        name,
        type,
        currency,
        includeInTotal: typeof acc.includeInTotal === 'boolean' ? acc.includeInTotal : undefined,
      }];
    });
  }

  if (Array.isArray(ctx.people)) {
    safe.people = (ctx.people as unknown[]).flatMap((p) => {
      if (typeof p !== 'object' || !p) return [];
      const person = p as Record<string, unknown>;
      const id = typeof person.id === 'string' && UUID_PATTERN.test(person.id) ? person.id : '';
      const fullName = typeof person.fullName === 'string' ? person.fullName.trim() : '';
      if (!id || !fullName) return [];
      return [{
        id,
        fullName,
        aliases: Array.isArray(person.aliases)
          ? person.aliases.filter((alias): alias is string => typeof alias === 'string')
          : undefined,
        relationship: typeof person.relationship === 'string' && ALLOWED_RELATIONSHIPS.has(person.relationship)
          ? person.relationship as NonNullable<NonNullable<FinancialContext['people']>[number]>['relationship']
          : undefined,
      }];
    });
  }

  if (Array.isArray(ctx.categories)) {
    safe.categories = (ctx.categories as unknown[]).flatMap((c) => {
      if (typeof c !== 'object' || !c) return [];
      const cat = c as Record<string, unknown>;
      const id = typeof cat.id === 'string' && UUID_PATTERN.test(cat.id) ? cat.id : '';
      const name = typeof cat.name === 'string' ? cat.name.trim() : '';
      const type = typeof cat.type === 'string' ? cat.type.trim() : '';
      if (!id || !name || !type) return [];
      return [{
        id,
        name,
        type,
      }];
    });
  }

  if (Array.isArray(ctx.subscriptions)) {
    safe.subscriptions = (ctx.subscriptions as unknown[]).flatMap((s) => {
      if (typeof s !== 'object' || !s) return [];
      const subscription = s as Record<string, unknown>;
      const id = typeof subscription.id === 'string' && UUID_PATTERN.test(subscription.id) ? subscription.id : '';
      const name = typeof subscription.name === 'string' ? subscription.name.trim() : '';
      if (!id || !name) return [];
      return [{
        id,
        name,
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
      }];
    });
  }

  if (typeof ctx.defaultCurrency === 'string') {
    const currency = ctx.defaultCurrency.toUpperCase().replace(/[^A-Z]/g, '').substring(0, 3);
    if (currency.length === 3) safe.defaultCurrency = currency;
  }
  if (typeof ctx.currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ctx.currentDate.trim())) {
    safe.currentDate = ctx.currentDate.trim();
  }
  if (typeof ctx.currentDateTime === 'string' && !Number.isNaN(new Date(ctx.currentDateTime).getTime())) {
    safe.currentDateTime = ctx.currentDateTime;
  }
  if (typeof ctx.timezone === 'string') {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: ctx.timezone }).format(new Date());
      safe.timezone = ctx.timezone;
    } catch {
      // Ignore invalid time zones.
    }
  }
  if (typeof ctx.locale === 'string' && ctx.locale.trim()) {
    safe.locale = ctx.locale.trim();
  }

  return safe;
}

async function refundAICreditsSafely(args: {
  supabase: ReturnType<typeof createServerClient>;
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
      console.error('[voice/transcribe] Credit refund failed', {
        code: error.code || null,
        message: error.message,
      });
    }
  } catch (error) {
    console.error('[voice/transcribe] Credit refund failed', {
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function persistVoiceRequest(args: {
  supabase: ReturnType<typeof createServerClient>;
  userId: string;
  idempotencyKey: string;
  spokenLanguage: string;
  response: {
    status: string;
    parsed?: ParsedFinancialInstruction;
    transcript?: string;
    originalTranscript?: string;
    detectedLanguage?: string;
    providerUsed?: string;
    modelUsed?: string;
    fallbackUsed?: boolean;
    errorCategory?: string;
    errorMessage?: string;
    durationMs?: number;
  };
  retainTranscript: boolean;
  durationMs: number;
  speechDurationMs: number;
  existingRequestId?: string;
}) {
  const transcriptToStore = args.response.originalTranscript || args.response.transcript;
  const safeProviderUsed = sanitizeProviderName(args.response.providerUsed);
  const safeStatus = sanitizeRequestStatus(args.response.status);
  const safeIntent = sanitizeOverallIntent(args.response.parsed?.overallIntent);

  const insertPayload = {
    user_id: args.userId,
    request_type: 'voice',
    status: safeStatus,
    overall_intent: safeIntent,
    raw_text: null,
    transcript: args.retainTranscript ? transcriptToStore || null : null,
    transcript_retained: !!args.retainTranscript,
    input_language: args.spokenLanguage,
    detected_language: args.response.detectedLanguage || args.response.parsed?.detectedLanguage || args.response.parsed?.language || null,
    stt_provider_used: safeProviderUsed || null,
    language_provider_used: safeProviderUsed as 'openrouter' | 'vps_ai' | 'cloud_stt' | 'vps_stt' | 'mock' | null,
    fallback_used: args.response.fallbackUsed || false,
    provider_model: args.response.modelUsed || args.response.parsed?.modelUsed || null,
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
    idempotency_key: args.idempotencyKey,
    stt_duration_ms: args.speechDurationMs,
    total_duration_ms: args.durationMs,
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
      console.error('[voice/transcribe] Failed to update ai_requests row', {
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
      console.error('[voice/transcribe] Failed to insert ai_requests row', {
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
      action_type: typeof action.actionType === 'string' ? action.actionType : 'unknown',
      action_data: action,
      status: 'pending',
    }));

    const { data: pendingRows, error: pendingActionsError } = await args.supabase
      .from('ai_pending_actions')
      .insert(rows)
      .select('id, action_index');

    if (pendingActionsError) {
      console.error('[voice/transcribe] Failed to insert ai_pending_actions rows', {
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

function getVoiceFailureStatus(errorCode: string | undefined) {
  switch (errorCode) {
    case 'timeout':
    case 'gemini_request_timeout':
    case 'request_timeout':
      return 504;
    case 'openrouter_auth_failed':
    case 'openrouter_not_configured':
    case 'voice_model_missing':
    case 'voice_model_audio_unsupported':
    case 'gemini_not_configured':
    case 'gemini_model_missing':
    case 'gemini_api_key_missing':
    case 'gemini_auth_failed':
    case 'not_configured':
    case 'auth_failed':
      return 409;
    case 'openrouter_provider_unavailable':
    case 'gemini_provider_unavailable':
    case 'provider_unavailable':
      return 503;
    case 'gemini_rate_limited':
    case 'rate_limited':
      return 429;
    case 'invalid_response':
    case 'transcription_failed':
    case 'safety_blocked':
    case 'safety_violation':
      return 422;
    case 'empty_audio':
    case 'audio_too_large':
    case 'invalid_audio_payload':
    case 'wav_header_invalid':
    case 'audio_too_short':
      return 400;
    case 'unsupported_audio_type':
      return 415;
    default:
      return 503;
  }
}

function validateWavRiffHeader(buffer: ArrayBuffer): { ok: boolean; reason?: string } {
  try {
    if (!buffer || buffer.byteLength < 44) {
      return { ok: false, reason: 'WAV payload too small' };
    }
    const view = new DataView(buffer);
    const chunkId =
      String.fromCharCode(view.getUint8(0)) +
      String.fromCharCode(view.getUint8(1)) +
      String.fromCharCode(view.getUint8(2)) +
      String.fromCharCode(view.getUint8(3));
    const riffType =
      String.fromCharCode(view.getUint8(8)) +
      String.fromCharCode(view.getUint8(9)) +
      String.fromCharCode(view.getUint8(10)) +
      String.fromCharCode(view.getUint8(11));
    if (chunkId !== 'RIFF' || riffType !== 'WAVE') {
      return { ok: false, reason: 'Invalid WAV RIFF header' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'WAV header check failed' };
  }
}

function mapVoiceProcessingFailure(args: {
  errorCategory?: string;
  errorMessage?: string;
}) {
  const detail = sanitizeTechnicalDetail(args.errorMessage);
  const normalized = `${args.errorCategory || ''} ${detail || ''}`.toLowerCase();

  if (
    args.errorCategory === 'timeout'
    || args.errorCategory === 'request_timeout'
    || args.errorCategory === 'gemini_request_timeout'
    || /timeout|timed out|aborterror|aborted|deadline exceeded|timedout/.test(normalized)
  ) {
    return {
      code: 'gemini_request_timeout',
      category: 'technical' as const,
      message: 'Voice transcription timed out. Please try again.',
      refundReason: 'gemini_request_timeout',
      logDetail: detail,
    };
  }

  if (
    args.errorCategory === 'gemini_rate_limited'
    || args.errorCategory === 'rate_limited'
    || /rate.?limit|429|too many requests|resource exhausted|quota exceeded/.test(normalized)
  ) {
    return {
      code: 'gemini_rate_limited',
      category: 'technical' as const,
      message: 'Voice transcription is rate limited. Please try again shortly.',
      refundReason: 'gemini_rate_limited',
      logDetail: detail,
    };
  }

  if (
    args.errorCategory === 'auth_error'
    || args.errorCategory === 'gemini_auth_failed'
    || args.errorCategory === 'auth_failed'
    || /gemini.*(401|403|auth|api.?key)|api.?key.*missing|permission.?denied.*gemini|invalid.*credentials/.test(normalized)
  ) {
    return {
      code: 'gemini_auth_failed',
      category: 'technical' as const,
      message: 'Voice transcription is temporarily unavailable.',
      refundReason: 'gemini_auth_failed',
      logDetail: detail,
    };
  }

  if (
    /model_not_found|no endpoints found that support input audio|unsupported.*audio|does not support voice|does not support audio|input audio/.test(normalized)
  ) {
    return {
      code: 'voice_model_audio_unsupported',
      category: 'configuration' as const,
      message: 'The selected AI model does not support voice transcription. Use text entry for now.',
      refundReason: 'voice_model_audio_unsupported',
      logDetail: detail,
    };
  }

  if (args.errorCategory === 'not_configured') {
    return {
      code: 'gemini_not_configured',
      category: 'configuration' as const,
      message: 'The AI service has not been configured by the administrator. Use text entry for now.',
      refundReason: 'gemini_not_configured',
      logDetail: detail,
    };
  }

  if (args.errorCategory === 'invalid_response' || /invalid.*json|could not parse.*json|schema.*mismatch|action missing warnings|warnings array/.test(normalized)) {
    return {
      code: 'invalid_response',
      category: 'validation' as const,
      message: 'We could not understand that voice request. Please review the transcript or try again.',
      refundReason: 'invalid_response',
      logDetail: detail,
    };
  }

  if (
    args.errorCategory === 'provider_unavailable'
    || args.errorCategory === 'gemini_provider_unavailable'
    || /503|unavailable|service unavailable|overloaded|provider.*down|internal server error|500|connection.*reset|network.*error.*gemini/.test(normalized)
  ) {
    return {
      code: 'gemini_provider_unavailable',
      category: 'technical' as const,
      message: 'Voice transcription is temporarily unavailable.',
      refundReason: 'gemini_provider_unavailable',
      logDetail: detail,
    };
  }

  return {
    code: 'gemini_provider_unavailable',
    category: 'technical' as const,
    message: 'Voice transcription is temporarily unavailable.',
    refundReason: 'gemini_provider_unavailable',
    logDetail: detail,
  };
}

function logVoiceProcessingFailure(args: {
  requestId: string;
  code: string;
  providerUsed?: string;
  modelUsed?: string;
  durationMs?: number;
  rawCategory?: string;
  rawMessage?: string;
}) {
  console.error('[voice/transcribe] Voice processing failed', {
    requestId: shortRequestId(args.requestId),
    code: args.code,
    providerUsed: sanitizeProviderName(args.providerUsed),
    modelUsed: args.modelUsed || null,
    durationMs: typeof args.durationMs === 'number' ? args.durationMs : null,
    rawCategory: args.rawCategory || null,
    detail: sanitizeTechnicalDetail(args.rawMessage),
  });
}

function buildVoiceFailureResponse(args: {
  requestId: string;
  code: string;
  category: AIErrorPayload['category'];
  message: string;
  transcript?: string;
  originalTranscript?: string;
  detectedLanguage?: string;
  providerUsed?: string;
  modelUsed?: string;
  durationMs?: number;
  providerCallCount?: number;
}) {
  return {
    ...buildError(
      args.code,
      args.category,
      args.message,
      args.requestId
    ),
    transcript: args.transcript,
    originalTranscript: args.originalTranscript,
    detectedLanguage: args.detectedLanguage,
    providerUsed: args.providerUsed,
    modelUsed: args.modelUsed,
    durationMs: args.durationMs,
    providerCallCount: args.providerCallCount,
  };
}

export async function POST(req: NextRequest) {
  const requestId = createClientId();

  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(buildError('transcription_failed', 'auth', 'Unauthorized.', requestId), { status: 401 });
    }

    const token = authHeader.slice(7);
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json(buildError('transcription_failed', 'auth', 'Unauthorized.', requestId), { status: 401 });
    }

    const formData = await req.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(buildError('transcription_failed', 'validation', 'Invalid transcription request.', requestId), { status: 400 });
    }

    const fileEntry = formData.get('audio');
    const durationSeconds = parsePositiveNumber(formData.get('durationSeconds'));
    const idempotencyKeyRaw = typeof formData.get('idempotencyKey') === 'string'
      ? String(formData.get('idempotencyKey')).trim()
      : createClientId();
    const idempotencyKey = idempotencyKeyRaw.replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 128) || createClientId();
    const spokenLanguage = normalizeSpokenLanguage(formData.get('spokenLanguage') ?? formData.get('language'));
    const displayLanguage = normalizeDisplayLanguage(formData.get('displayLanguage'));

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(buildError('empty_audio', 'validation', 'Please record audio before transcribing.', requestId), { status: 400 });
    }

    if (fileEntry.size <= 0) {
      return NextResponse.json(buildError('empty_audio', 'validation', 'Please record audio before transcribing.', requestId), { status: 400 });
    }

    const mimeType = normalizeVoiceAudioMimeType(fileEntry.type);
    if (!isSupportedVoiceAudioMimeType(mimeType)) {
      return NextResponse.json(buildError('unsupported_audio_type', 'validation', 'This audio format is not supported for voice entry.', requestId), { status: 415 });
    }

    if (mimeType === 'audio/wav' || mimeType === 'audio/x-wav') {
      try {
        const sampleBytes = await fileEntry.slice(0, Math.min(fileEntry.size, 512)).arrayBuffer();
        const wavCheck = validateWavRiffHeader(sampleBytes);
        if (!wavCheck.ok) {
          return NextResponse.json(
            buildError('invalid_audio_payload', 'validation', 'Invalid WAV audio file: ' + (wavCheck.reason || 'RIFF header missing.'), requestId),
            { status: 400 },
          );
        }
      } catch {
        return NextResponse.json(
          buildError('invalid_audio_payload', 'validation', 'Could not read the WAV audio file.', requestId),
          { status: 400 },
        );
      }
    }

    const rawContext = parseJsonField(formData.get('context'));
    const safeContext = isObject(rawContext) ? sanitizeContext(rawContext) : undefined;
    const dateContext = buildSmartEntryDateContext({
      timezone: typeof formData.get('timezone') === 'string' ? String(formData.get('timezone')) : safeContext?.timezone,
      locale: typeof formData.get('locale') === 'string' ? String(formData.get('locale')) : safeContext?.locale || displayLanguage,
      currentDate: typeof formData.get('currentDate') === 'string' ? String(formData.get('currentDate')) : safeContext?.currentDate,
      currentDateTime: typeof formData.get('currentDateTime') === 'string' ? String(formData.get('currentDateTime')) : safeContext?.currentDateTime,
    });
    const nextContext: FinancialContext | undefined = safeContext
      ? {
          ...safeContext,
          currentDate: dateContext.currentDate,
          currentDateTime: dateContext.currentDateTime,
          timezone: dateContext.timezone,
          locale: dateContext.locale || displayLanguage,
        }
      : {
          currentDate: dateContext.currentDate,
          currentDateTime: dateContext.currentDateTime,
          timezone: dateContext.timezone,
          locale: dateContext.locale || displayLanguage,
        };

    const [{ summary, errorMessage }, existingRequest] = await Promise.all([
      ensureUserSubscriptionSummary(user.id),
      supabase
        .from('ai_requests')
        .select('id, transcript, transcript_retained, status, error_category, error_message, parsed_result, detected_language, language_provider_used, stt_provider_used, provider_model')
        .eq('user_id', user.id)
        .eq('request_type', 'voice')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle(),
    ]);

    if (existingRequest.data?.status === 'parsed') {
      const storedInstruction = isObject(existingRequest.data.parsed_result)
        ? existingRequest.data.parsed_result as unknown as ParsedFinancialInstruction
        : null;
      const storedTranscript = storedInstruction?.transcript || existingRequest.data.transcript || '';
      const storedOriginalTranscript = storedInstruction?.originalTranscript || existingRequest.data.transcript || storedTranscript;

      if (storedInstruction && storedTranscript) {
        return NextResponse.json({
          success: true,
          status: 'parsed',
          requestId: existingRequest.data.id,
          parsed: {
            ...storedInstruction,
            requestId: existingRequest.data.id,
          },
          transcript: storedTranscript,
          originalTranscript: storedOriginalTranscript,
          detectedLanguage: storedInstruction.detectedLanguage || existingRequest.data.detected_language || storedInstruction.language,
          translationApplied: storedInstruction.translationApplied === true || storedTranscript !== storedOriginalTranscript,
          translationFailed: storedInstruction.translationFailed === true,
          providerUsed: existingRequest.data.language_provider_used || existingRequest.data.stt_provider_used || 'openrouter',
          modelUsed: existingRequest.data.provider_model || null,
          duplicate: true,
          providerCallCount: 1,
        });
      }

      return NextResponse.json(
        buildError(
          'transcription_failed',
          'state',
          'This voice request has already been processed. Record again if you still need a transcript.',
          requestId
        ),
        { status: 409 }
      );
    }

    if (existingRequest.data?.status === 'failed') {
      const storedCode = getStoredVoiceErrorCode(existingRequest.data.error_category);
      const storedInstruction = isObject(existingRequest.data.parsed_result)
        ? existingRequest.data.parsed_result as unknown as ParsedFinancialInstruction
        : null;
      return NextResponse.json(
        {
          ...buildError(
            storedCode,
            storedCode === 'voice_not_in_plan'
              ? 'subscription'
              : storedCode === 'voice_limit_reached'
                ? 'usage_limit'
                : storedCode === 'empty_audio' || storedCode === 'unsupported_audio_type' || storedCode === 'audio_too_large'
                  ? 'validation'
                  : storedCode === 'openrouter_not_configured'
                    || storedCode === 'voice_model_missing'
                    || storedCode === 'voice_model_audio_unsupported'
                    || storedCode === 'openrouter_auth_failed'
                    || storedCode === 'gemini_not_configured'
                    || storedCode === 'gemini_model_missing'
                    || storedCode === 'gemini_api_key_missing'
                    || storedCode === 'gemini_auth_failed'
                    ? 'configuration'
                    : 'technical',
            existingRequest.data.error_message || 'Voice transcription is temporarily unavailable.',
            requestId
          ),
          transcript: storedInstruction?.transcript || existingRequest.data.transcript || undefined,
          originalTranscript: storedInstruction?.originalTranscript || existingRequest.data.transcript || undefined,
          detectedLanguage: storedInstruction?.detectedLanguage || existingRequest.data.detected_language || undefined,
          modelUsed: existingRequest.data.provider_model || undefined,
        },
        { status: getStoredVoiceErrorStatus(storedCode) }
      );
    }

    if (errorMessage) {
      return NextResponse.json(
        buildError(
          'openrouter_provider_unavailable',
          'technical',
          'Voice transcription is temporarily unavailable.',
          requestId
        ),
        { status: 503 }
      );
    }

    const resetDateLabel = formatResetDate(summary.cycleEnd);
    const { data: accessError } = await supabase.rpc('check_ai_access', {
      p_user_id: user.id,
      p_request_type: 'voice',
    });

    if (accessError) {
      return NextResponse.json(
        mapAccessErrorToVoiceError(String(accessError), requestId, resetDateLabel),
        { status: String(accessError) === 'voice_limit_reached' ? 429 : 403 }
      );
    }

    const runtimeConfig = await loadRuntimeVoiceTranscriptionConfig();
    if (fileEntry.size > runtimeConfig.maxAudioBytes) {
      return NextResponse.json(buildError('audio_too_large', 'validation', 'This recording is too large to transcribe.', requestId), { status: 413 });
    }

    if (!durationSeconds || durationSeconds <= 0) {
      return NextResponse.json(buildError('empty_audio', 'validation', 'Please record audio before transcribing.', requestId), { status: 400 });
    }

    if (durationSeconds > runtimeConfig.maxAudioSeconds) {
      return NextResponse.json(buildError('audio_too_large', 'validation', 'This recording is longer than the allowed voice limit.', requestId), { status: 413 });
    }

    const voiceLimitSeconds = Number(summary.monthlyVoiceSeconds || 0);
    const voiceSecondsUsed = Number(summary.voiceSecondsUsed || 0);
    const roundedDurationSeconds = Math.ceil(durationSeconds);
    if (
      voiceLimitSeconds > 0
      && voiceSecondsUsed < voiceLimitSeconds
      && (voiceSecondsUsed + roundedDurationSeconds) > voiceLimitSeconds
    ) {
      return NextResponse.json(
        buildError(
          'voice_limit_reached',
          'usage_limit',
          resetDateLabel
            ? `Voice limit reached. Your allowance resets on ${resetDateLabel}.`
            : 'Voice limit reached.',
          requestId
        ),
        { status: 429 }
      );
    }

    if (!runtimeConfig.ready) {
      const code = runtimeConfig.code;
      const isMissingOrNotConfigured =
        code.includes('missing') || code.includes('not_configured');
      const isModelOrAudioIssue =
        code.includes('_model_') || code.includes('_audio_');
      const isUnavailableOrAuth =
        code.includes('_provider_unavailable') || code.includes('_auth_failed');

      const voiceErrorCode = code;
      const category = isUnavailableOrAuth ? 'technical' : 'configuration';
      const message = isMissingOrNotConfigured
        ? 'The AI service has not been configured by the administrator. Use text entry for now.'
        : isModelOrAudioIssue
          ? 'The selected AI model does not support voice transcription. Use text entry for now.'
          : 'Voice transcription is temporarily unavailable.';
      const httpStatus = isUnavailableOrAuth ? 503 : 409;

      return NextResponse.json(
        buildError(
          voiceErrorCode as any,
          category,
          message,
          requestId
        ),
        { status: httpStatus }
      );
    }

    if (!runtimeConfig.model) {
      const code = runtimeConfig.code;
      const isMissingOrNotConfigured =
        code.includes('missing') || code.includes('not_configured');
      const isModelOrAudioIssue =
        code.includes('_model_') || code.includes('_audio_');
      const isUnavailableOrAuth =
        code.includes('_provider_unavailable') || code.includes('_auth_failed');

      const voiceErrorCode = code;
      const category = isUnavailableOrAuth ? 'technical' : 'configuration';
      const message = isMissingOrNotConfigured
        ? 'The AI service has not been configured by the administrator. Use text entry for now.'
        : isModelOrAudioIssue
          ? 'The selected AI model does not support voice transcription. Use text entry for now.'
          : 'Voice transcription is temporarily unavailable.';
      const httpStatus = isUnavailableOrAuth ? 503 : 409;

      return NextResponse.json(
        buildError(
          voiceErrorCode as any,
          category,
          message,
          requestId
        ),
        { status: httpStatus }
      );
    }

    const { data: reserveResult } = await supabase.rpc('reserve_ai_credits', {
      p_user_id: user.id,
      p_request_type: 'voice',
      p_idempotency_key: idempotencyKey,
      p_expected_voice_seconds: roundedDurationSeconds,
    });

    const reserveData = reserveResult as {
      ok?: boolean;
      error?: string;
      cycle_id?: string;
      ledger_id?: string;
    } | null;

    if (!reserveData?.ok || !reserveData.cycle_id || !reserveData.ledger_id) {
      return NextResponse.json(
        mapAccessErrorToVoiceError(String(reserveData?.error || 'voice_limit_reached'), requestId, resetDateLabel),
        { status: 429 }
      );
    }

    const userSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    try {
      const audioBuffer = Buffer.from(await fileEntry.arrayBuffer());
      const request: AIAssistantRequest = {
        type: 'voice',
        audio: {
          audioBase64: audioBuffer.toString('base64'),
          mimeType,
          durationSeconds,
          languageHint: spokenLanguage !== 'auto' ? spokenLanguage : undefined,
        },
        language: displayLanguage,
        spokenLanguage,
        displayLanguage,
        voiceModel: runtimeConfig.model,
        locale: dateContext.locale || displayLanguage,
        currentDate: dateContext.currentDate,
        currentDateTime: dateContext.currentDateTime,
        timezone: dateContext.timezone,
        context: nextContext,
        idempotencyKey,
        userId: user.id,
      };

      const gatewayResponse = await processAIRequest(request, loadAIConfig());
      const speechDurationMs = toSpeechDurationMs(durationSeconds);

      if (gatewayResponse.status !== 'parsed' || !gatewayResponse.parsed) {
        const mappedFailure = mapVoiceProcessingFailure({
          errorCategory: gatewayResponse.errorCategory,
          errorMessage: gatewayResponse.errorMessage,
        });
        logVoiceProcessingFailure({
          requestId,
          code: mappedFailure.code,
          providerUsed: gatewayResponse.providerUsed,
          modelUsed: gatewayResponse.modelUsed,
          durationMs: gatewayResponse.durationMs || speechDurationMs,
          rawCategory: gatewayResponse.errorCategory,
          rawMessage: gatewayResponse.errorMessage,
        });

        await refundAICreditsSafely({
          supabase,
          userId: user.id,
          cycleId: reserveData.cycle_id,
          ledgerId: reserveData.ledger_id,
          reason: mappedFailure.refundReason,
        });

        await persistVoiceRequest({
          supabase,
          userId: user.id,
          idempotencyKey,
          spokenLanguage,
          response: {
            status: 'failed',
            transcript: gatewayResponse.transcript,
            originalTranscript: gatewayResponse.originalTranscript,
            detectedLanguage: gatewayResponse.detectedLanguage,
            providerUsed: gatewayResponse.providerUsed,
            modelUsed: gatewayResponse.modelUsed,
            fallbackUsed: false,
            errorCategory: mappedFailure.code,
            errorMessage: mappedFailure.message,
            durationMs: gatewayResponse.durationMs || speechDurationMs,
          },
          retainTranscript: runtimeConfig.enableTranscriptRetention && !!(gatewayResponse.originalTranscript || gatewayResponse.transcript),
          durationMs: gatewayResponse.durationMs || speechDurationMs,
          speechDurationMs,
          existingRequestId: existingRequest.data?.id || undefined,
        });

        const failureBody = buildVoiceFailureResponse({
          requestId,
          code: mappedFailure.code,
          category: mappedFailure.category,
          message: mappedFailure.message,
          transcript: gatewayResponse.transcript,
          originalTranscript: gatewayResponse.originalTranscript,
          detectedLanguage: gatewayResponse.detectedLanguage,
          providerUsed: gatewayResponse.providerUsed,
          modelUsed: gatewayResponse.modelUsed,
          durationMs: gatewayResponse.durationMs,
          providerCallCount: gatewayResponse.providerCallCount,
        });

        return NextResponse.json(failureBody, {
          status: getVoiceFailureStatus(mappedFailure.code),
        });
      }

      const transcript = gatewayResponse.transcript || gatewayResponse.parsed.transcript || gatewayResponse.originalTranscript || '';
      const originalTranscript = gatewayResponse.originalTranscript || gatewayResponse.parsed.originalTranscript || transcript;
      const detectedLanguage = gatewayResponse.detectedLanguage || gatewayResponse.parsed.detectedLanguage || gatewayResponse.parsed.language;
      const normalizedInstruction = applySmartEntryDateDefaults({
        instruction: {
          ...gatewayResponse.parsed,
          transcript,
          originalTranscript,
          detectedLanguage,
          translationApplied:
            gatewayResponse.parsed.translationApplied === true
            || (Boolean(transcript) && Boolean(originalTranscript) && transcript !== originalTranscript),
          translationFailed: gatewayResponse.parsed.translationFailed === true,
        },
        sourceText: transcript || originalTranscript,
        currentDate: dateContext.currentDate,
      });
      const review = buildInitialSmartEntryReview({
        instruction: normalizedInstruction,
        sourceText: transcript || originalTranscript,
        context: nextContext,
      });
      const reviewedInstruction = applySmartEntryReviewToInstruction({
        ...normalizedInstruction,
        review,
        missingFields: [...review.missing],
        requiresClarification: false,
        clarificationQuestions: [],
      });

      const responseBody = {
        success: true,
        status: 'parsed' as const,
        requestId: gatewayResponse.requestId,
        parsed: {
          ...reviewedInstruction,
          requestId: gatewayResponse.requestId,
          transcript,
          originalTranscript,
          detectedLanguage,
          translationApplied:
            gatewayResponse.parsed.translationApplied === true
            || (Boolean(transcript) && Boolean(originalTranscript) && transcript !== originalTranscript),
          translationFailed: gatewayResponse.parsed.translationFailed === true,
          review: {
            ...review,
            missing: getSmartEntryMissingFields(reviewedInstruction),
          },
          missingFields: getSmartEntryMissingFields(reviewedInstruction),
          requiresClarification: false,
          clarificationQuestions: [],
        },
        transcript,
        originalTranscript,
        spokenLanguage,
        detectedLanguage,
        displayLanguage,
        translationApplied:
          gatewayResponse.parsed.translationApplied === true
          || (Boolean(transcript) && Boolean(originalTranscript) && transcript !== originalTranscript),
        translationFailed: gatewayResponse.parsed.translationFailed === true,
        providerUsed: gatewayResponse.providerUsed || runtimeConfig.gateway,
        modelUsed: gatewayResponse.modelUsed || runtimeConfig.model,
        durationSeconds,
        durationMs: gatewayResponse.durationMs,
        providerCallCount: gatewayResponse.providerCallCount || 1,
      };

      const persistedRequest = await persistVoiceRequest({
        supabase,
        userId: user.id,
        idempotencyKey,
        spokenLanguage,
        response: {
          status: responseBody.status,
          parsed: responseBody.parsed,
          transcript: responseBody.transcript,
          originalTranscript: responseBody.originalTranscript,
          detectedLanguage: responseBody.detectedLanguage,
          providerUsed: responseBody.providerUsed,
          modelUsed: responseBody.modelUsed,
          fallbackUsed: false,
          durationMs: responseBody.durationMs || speechDurationMs,
        },
        retainTranscript: runtimeConfig.enableTranscriptRetention && !!responseBody.originalTranscript,
        durationMs: responseBody.durationMs || speechDurationMs,
        speechDurationMs,
        existingRequestId: existingRequest.data?.id || undefined,
      });

      if (!persistedRequest?.id || !UUID_PATTERN.test(persistedRequest.id)) {
        await refundAICreditsSafely({
          supabase,
          userId: user.id,
          cycleId: reserveData.cycle_id,
          ledgerId: reserveData.ledger_id,
          reason: 'persistence_failure',
        });

        console.error('[voice/transcribe] Parsed request persistence failed', {
          code: 'AI_REQUEST_PERSISTENCE_FAILED',
          table: 'ai_requests',
          hasUserId: !!user.id,
          requestLookup: existingRequest.data ? 'update' : 'insert',
          existingRequestId: shortRequestId(existingRequest.data?.id),
          providerRequestId: shortRequestId(responseBody.requestId),
          persistedRequestId: shortRequestId(persistedRequest?.id),
        });

        const failureRequestId = createClientId();
        return NextResponse.json(
          buildError(
            'transcription_failed',
            'technical',
            'Smart Entry is temporarily unavailable. Please try again.',
            failureRequestId
          ),
          { status: 500 }
        );
      }

      responseBody.requestId = persistedRequest.id;
      responseBody.parsed.requestId = persistedRequest.id;

      const { data: finalised, error: finaliseError } = await supabase.rpc('finalise_ai_credits', {
        p_user_id: user.id,
        p_cycle_id: reserveData.cycle_id,
        p_ledger_id: reserveData.ledger_id,
        p_ai_request_id: persistedRequest.id,
        p_input_tokens: null,
        p_output_tokens: null,
        p_total_tokens: null,
        p_speech_duration_ms: speechDurationMs,
        p_provider_name: runtimeConfig.gateway,
        p_model_name: responseBody.modelUsed || runtimeConfig.model,
        p_estimated_cost: null,
        p_credit_cost: 2,
      });

      if (finaliseError || finalised !== true) {
        console.error('[voice/transcribe] finalise_ai_credits failed', {
          requestId,
          aiRequestId: persistedRequest.id,
          cycleId: reserveData.cycle_id,
          ledgerId: reserveData.ledger_id,
          durationMs: speechDurationMs,
          finalised,
          error: finaliseError?.message || null,
        });

        await refundAICreditsSafely({
          supabase,
          userId: user.id,
          cycleId: reserveData.cycle_id,
          ledgerId: reserveData.ledger_id,
          reason: 'voice_metering_finalisation_failed',
        });

        return NextResponse.json(
          buildError(
            'transcription_failed',
            'technical',
            'Voice transcription is temporarily unavailable.',
            requestId
          ),
          { status: 503 }
        );
      }

      if (!existingRequest.data) {
        const providerName = sanitizeProviderName(responseBody.providerUsed);
        await userSupabase.rpc('increment_ai_daily_usage', {
          p_request_type: 'voice',
          p_provider_type: providerName?.includes('vps') ? 'vps' : 'cloud',
          p_fallback_used: false,
          p_success: true,
          p_confirmed: false,
          p_duration_ms: responseBody.durationMs || speechDurationMs,
        });
      }

      return NextResponse.json(responseBody);
    } catch (error) {
      const mappedFailure = mapVoiceProcessingFailure({
        errorMessage: error instanceof Error ? error.message : undefined,
      });
      logVoiceProcessingFailure({
        requestId,
        code: mappedFailure.code,
        providerUsed: runtimeConfig.gateway,
        modelUsed: runtimeConfig.model,
        rawMessage: error instanceof Error ? error.message : undefined,
      });

      await refundAICreditsSafely({
        supabase,
        userId: user.id,
        cycleId: reserveData.cycle_id,
        ledgerId: reserveData.ledger_id,
        reason: mappedFailure.refundReason,
      });

      return NextResponse.json(
        buildError(
          mappedFailure.code,
          mappedFailure.category,
          mappedFailure.message,
          requestId
        ),
        { status: getVoiceFailureStatus(mappedFailure.code) }
      );
    }
  } catch (error) {
    return NextResponse.json(
      buildError(
        'transcription_failed',
        'technical',
        'Voice transcription is temporarily unavailable.',
        requestId
      ),
      { status: 500 }
    );
  }
}
