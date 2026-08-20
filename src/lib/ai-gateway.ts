// ─── AI Gateway ───────────────────────────────────────────────────────────────
// Server-side only. Never import this from browser components.
// All provider secrets are resolved from environment variables.

import type { AIGatewayConfig, AIAssistantRequest, AIAssistantResponse, ParseRequest, ParsedFinancialInstruction, AudioInput, TranscriptResult, LanguageProvider, SpeechProvider, ProviderHealthResult, FinancialContext } from './ai-types';
import {
  validateParsedInstruction,
  safeParseJSON,
  FINANCIAL_SYSTEM_PROMPT,
  normalizeParsedInstructionDefaults,
} from './ai-types';
import { createClientId } from './uuid';
import { getOpenRouterAudioFormat, normalizeVoiceAudioMimeType } from './voice-ai';
import {
  classifyTransactionDocumentError,
  TRANSACTION_DOCUMENT_SYSTEM_PROMPT,
  validateTransactionDocumentExtraction,
  type TransactionDocumentErrorCode,
  type TransactionDocumentExtraction,
} from './transaction-documents';
import { getGeminiClient } from './gemini-client';
import {
  getAIConfig,
  getGeminiMultimodalFallbackModel,
  getGeminiMultimodalModel,
  getGeminiTextModel,
  getGeminiVoiceModel,
  isOpenRouterEnabled,
  type GeminiModelConfig,
} from './ai-provider-config';

export interface TransactionDocumentAIRequest {
  fileName: string;
  fileMimeType: string;
  fileUrl: string;
  language?: string;
  pageCount?: number;
  sourceSurface?: string;
  context?: FinancialContext;
  requestId?: string;
}

export interface TransactionDocumentAIResponse {
  requestId: string;
  status: 'parsed' | 'failed' | 'not_configured';
  parsed?: TransactionDocumentExtraction;
  errorMessage?: string;
  errorCode?: TransactionDocumentErrorCode;
  errorCategory?: string;
  providerUsed?: string;
  primaryModel?: string | null;
  finalModel?: string | null;
  modelUsed?: string | null;
  fallbackUsed?: boolean;
  durationMs?: number;
  rawOutput?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}

type ProviderContentBlock = {
  type?: string;
  text?: string;
};

type ProviderChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | ProviderContentBlock[] | null;
    };
  }>;
};

class TransactionDocumentGatewayError extends Error {
  code: TransactionDocumentErrorCode;
  stage: string;
  providerUsed?: string;
  modelUsed?: string | null;
  providerStatus?: number | null;
  rawOutput?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;

  constructor(
    code: TransactionDocumentErrorCode,
    stage: string,
    message: string,
    details?: {
      providerUsed?: string;
      modelUsed?: string | null;
      providerStatus?: number | null;
      rawOutput?: unknown;
      inputTokens?: number | null;
      outputTokens?: number | null;
      totalTokens?: number | null;
      estimatedCostUsd?: number | null;
    }
  ) {
    super(message);
    this.name = 'TransactionDocumentGatewayError';
    this.code = code;
    this.stage = stage;
    this.providerUsed = details?.providerUsed;
    this.modelUsed = details?.modelUsed;
    this.providerStatus = details?.providerStatus ?? null;
    this.rawOutput = details?.rawOutput;
    this.inputTokens = details?.inputTokens ?? null;
    this.outputTokens = details?.outputTokens ?? null;
    this.totalTokens = details?.totalTokens ?? null;
    this.estimatedCostUsd = details?.estimatedCostUsd ?? null;
  }
}

function getTransactionDocumentMaxTokens(mimeType: string) {
  return 8192;
}

const ACTION_STRING_ENUM = [
  'income', 'expense', 'money_received_from_person', 'money_returned_to_person',
  'expense_from_held_balance', 'expense_paid_for_person', 'expense_paid_by_person',
  'reimbursement_payment', 'settlement', 'transfer', 'budget', 'recurring_transaction',
  'personal_subscription_create', 'personal_subscription_update',
  'personal_subscription_payment', 'personal_subscription_cancel',
  'create_account', 'create_managed_person', 'loan_received', 'loan_repayment',
];

const OVERALL_INTENT_ENUM = [
  'personal_transaction', 'managed_person_transaction', 'transfer', 'reimbursement',
  'settlement', 'budget', 'recurring_transaction', 'personal_subscription_create',
  'personal_subscription_update', 'personal_subscription_payment',
  'personal_subscription_cancel', 'multiple_actions', 'unclear',
];

export const VOICE_SMART_ENTRY_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  required: [
    'requestId', 'language', 'confidence', 'overallIntent',
    'actions', 'warnings', 'missingFields', 'requiresClarification',
  ],
  properties: {
    requestId: { type: 'string' },
    language: { type: 'string' },
    transcript: { type: 'string' },
    originalTranscript: { type: 'string' },
    detectedLanguage: { type: 'string' },
    translationApplied: { type: 'boolean' },
    translationFailed: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    overallIntent: { type: 'string', enum: OVERALL_INTENT_ENUM },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['actionType', 'confidence', 'warnings'],
        properties: {
          actionType: { type: 'string', enum: ACTION_STRING_ENUM },
          amount: { type: 'number' },
          currency: { type: 'string' },
          date: { type: 'string' },
          time: { type: 'string' },
          personName: { type: 'string' },
          personId: { type: 'string' },
          createPersonSuggested: { type: 'boolean' },
          relationship: {
            type: 'string',
            enum: ['spouse', 'child', 'parent', 'sibling', 'friend', 'relative', 'colleague', 'client', 'other'],
          },
          accountName: { type: 'string' },
          accountId: { type: 'string' },
          accountType: {
            type: 'string',
            enum: ['bank', 'credit_card', 'cash', 'savings', 'digital_wallet', 'investment', 'other'],
          },
          openingBalance: { type: 'number' },
          includeInTotal: { type: 'boolean' },
          destinationAccountName: { type: 'string' },
          destinationAccountId: { type: 'string' },
          categoryName: { type: 'string' },
          categoryId: { type: 'string' },
          merchant: { type: 'string' },
          description: { type: 'string' },
          notes: { type: 'string' },
          expenseOwner: { type: 'string', enum: ['user', 'person', 'shared'] },
          paidBy: { type: 'string', enum: ['user', 'person', 'third_party'] },
          paidFrom: { type: 'string', enum: ['account', 'held_balance', 'external', 'cash'] },
          reimbursementRequired: { type: 'boolean' },
          reimbursementStatus: { type: 'string' },
          recurringFrequency: {
            type: 'string',
            enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
          },
          recurrenceStartDate: { type: 'string' },
          recurrenceDayOfMonth: { type: 'integer' },
          subscriptionId: { type: 'string' },
          subscriptionName: { type: 'string' },
          provider: { type: 'string' },
          currencyCode: { type: 'string' },
          billingFrequency: {
            type: 'string',
            enum: ['weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly', 'custom'],
          },
          billingInterval: { type: 'integer' },
          startDate: { type: 'string' },
          nextBillingDate: { type: 'string' },
          trialEndDate: { type: 'string' },
          contractEndDate: { type: 'string' },
          autoRenew: { type: 'boolean' },
          reminderDaysBefore: { type: 'array', items: { type: 'integer' } },
          cancellationNoticeDays: { type: 'integer' },
          cancellationDeadline: { type: 'string' },
          cancelEffectiveDate: { type: 'string' },
          warningThresholdAmount: { type: 'number' },
          websiteUrl: { type: 'string' },
          paymentHappenedNow: { type: 'boolean' },
          createLinkedRecurringExpense: { type: 'boolean' },
          amountNeedsConfirmation: { type: 'boolean' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          warnings: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: true,
      },
    },
    warnings: { type: 'array', items: { type: 'string' } },
    missingFields: { type: 'array', items: { type: 'string' } },
    requiresClarification: { type: 'boolean' },
    clarificationQuestions: { type: 'array', items: { type: 'string' } },
    inferredPurpose: {
      type: 'string',
      enum: [
        'household', 'rent', 'mortgage', 'utilities', 'groceries', 'food_dining',
        'transportation', 'health', 'fitness', 'education', 'childcare', 'entertainment',
        'shopping', 'travel', 'personal_care', 'gifts', 'charity', 'taxes', 'insurance',
        'savings', 'investment', 'debt_repayment', 'loan_disbursement', 'salary_income',
        'freelance_income', 'investment_income', 'gift_income', 'reimbursement_income',
        'refund_income', 'sale_of_assets', 'other_income', 'business_expense', 'transfer',
        'reimbursement', 'settlement', 'budget', 'other_expense', 'other',
      ],
    },
    purposeConfidence: { type: 'number', minimum: 0, maximum: 1 },
    purposeNeedsConfirmation: { type: 'boolean' },
    receivedAmount: { type: 'number' },
    spentAmount: { type: 'number' },
    spentAmountKnown: { type: 'boolean' },
    amountNeedsConfirmation: { type: 'boolean' },
    providerUsed: { type: 'string' },
    modelUsed: { type: 'string' },
    fallbackUsed: { type: 'boolean' },
    durationMs: { type: 'integer' },
  },
  additionalProperties: true,
};

const DOCUMENT_KIND_ENUM = [
  'receipt', 'printed_receipt', 'invoice', 'handwritten_receipt',
  'handwritten_expense_list', 'informal_expense_note', 'statement',
  'note', 'mixed', 'bank_statement', 'credit_card_statement',
  'utility_bill', 'tax_document', 'payslip', 'contract',
  'other', 'unknown',
];

export const TRANSACTION_DOCUMENT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  required: ['requestId', 'language', 'documentKind', 'confidence', 'warnings', 'transactions'],
  properties: {
    requestId: { type: 'string' },
    language: { type: 'string' },
    documentKind: { type: 'string', enum: DOCUMENT_KIND_ENUM },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    warnings: { type: 'array', items: { type: 'string' } },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['transactionType', 'confidence', 'needsReview', 'lineItems'],
        properties: {
          transactionType: { type: 'string', enum: ['expense', 'income'] },
          merchant: { type: ['string', 'null'] },
          date: { type: ['string', 'null'] },
          subtotal: { type: ['number', 'null'] },
          total: { type: ['number', 'null'] },
          tax: { type: ['number', 'null'] },
          taxIncludedInTotal: { type: ['boolean', 'null'] },
          currency: { type: ['string', 'null'] },
          categorySuggestion: { type: ['string', 'null'] },
          description: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] },
          receiptNumber: { type: ['string', 'null'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          needsReview: { type: 'boolean' },
          completeness: { type: 'string', enum: ['partial', 'complete'] },
          missingFields: { type: 'array', items: { type: 'string' } },
          warnings: { type: 'array', items: { type: 'string' } },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string' },
                description: { type: ['string', 'null'] },
                quantity: { type: ['number', 'null'] },
                unitPrice: { type: ['number', 'null'] },
                total: { type: ['number', 'null'] },
                categoryId: { type: ['string', 'null'] },
                itemKind: { type: 'string', enum: ['regular', 'discount', 'tax', 'fee'] },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
              },
              additionalProperties: true,
            },
          },
        },
        additionalProperties: true,
      },
    },
    providerUsed: { type: 'string' },
    modelUsed: { type: 'string' },
  },
  additionalProperties: true,
};

function isFilesApiStateReady(state: string | null | undefined): boolean {
  if (!state) return false;
  const s = String(state).toUpperCase();
  return s === 'ACTIVE' || s === 'PROCESSING_COMPLETE' || s === 'READY';
}

function isFilesApiStateFailed(state: string | null | undefined): boolean {
  if (!state) return false;
  const s = String(state).toUpperCase();
  return s === 'FAILED' || s === 'ERROR' || s === 'STATE_UNSPECIFIED';
}

type MultimodalFallbackCategory =
  | 'rate_limited'      // 429
  | 'provider_unavailable' // 503 / UNAVAILABLE
  | 'request_timeout'   // timeout / AbortError
  | 'empty_candidate'   // empty response
  | 'invalid_response'  // invalid JSON / schema fail
  | 'safety_blocked'    // safety block (NOT retryable)
  | 'auth_failed'       // 401/403 (NOT retryable)
  | 'invalid_input'     // bad file / MIME (NOT retryable)
  | 'other';            // NOT retryable

function classifyMultimodalError(error: unknown): MultimodalFallbackCategory {
  const msg = error instanceof Error ? error.message : String(error || '');
  const msgLow = msg.toLowerCase();
  const hasHttp = msg.match(/\b(4[0-9]{2}|5[0-9]{2})\b/);
  const httpStatus = hasHttp ? parseInt(hasHttp[1], 10) : null;

  if (httpStatus === 429 || /\b(429|too many requests|rate limit|quota exceeded|RESOURCE_EXHAUSTED|resource exhausted)\b/i.test(msg)) {
    return 'rate_limited';
  }
  if (httpStatus === 503 || /\b(503|UNAVAILABLE|high demand|service unavailable|unavailable)\b/i.test(msg)) {
    return 'provider_unavailable';
  }
  if (/\b(timeout|timed out|DEADLINE_EXCEEDED|AbortError|TimeoutError|aborted|operation was aborted)\b/i.test(msg)) {
    return 'request_timeout';
  }
  if (/empty response/i.test(msg)) {
    return 'empty_candidate';
  }
  if (/invalid (json|response|structured)/i.test(msg)) {
    return 'invalid_response';
  }
  if (/safety|recitation|blocked/i.test(msg)) {
    return 'safety_blocked';
  }
  if (httpStatus === 401 || httpStatus === 409 || /\b(401|403|UNAUTHENTICATED|PERMISSION_DENIED|invalid authentication credentials|API key not valid|not_configured)\b/i.test(msg)) {
    return 'auth_failed';
  }
  if (/invalid (audio|document|file|mime|base64|payload)/i.test(msg) || /unsupported (audio|mime|type)/i.test(msg)) {
    return 'invalid_input';
  }
  return 'other';
}

function isMultimodalFallbackRetryable(category: MultimodalFallbackCategory): boolean {
  return category === 'rate_limited'
    || category === 'provider_unavailable'
    || category === 'request_timeout'
    || category === 'empty_candidate'
    || category === 'invalid_response';
}

function normalizeParsedOptionalArrays(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const obj = payload as Record<string, unknown>;
  const normalized = { ...obj };
  normalized.warnings = Array.isArray(obj.warnings) ? obj.warnings : [];
  normalized.missingFields = Array.isArray(obj.missingFields) ? obj.missingFields : [];
  normalized.clarificationQuestions = Array.isArray(obj.clarificationQuestions) ? obj.clarificationQuestions : [];
  normalized.actions = Array.isArray(obj.actions) ? obj.actions : [];
  if (Array.isArray(normalized.actions)) {
    normalized.actions = (normalized.actions as unknown[]).map((a) => {
      if (!a || typeof a !== 'object') return a;
      const act = a as Record<string, unknown>;
      return {
        ...act,
        warnings: Array.isArray(act.warnings) ? act.warnings : [],
        missingFields: Array.isArray(act.missingFields) ? act.missingFields : [],
        clarificationQuestions: Array.isArray(act.clarificationQuestions) ? act.clarificationQuestions : [],
      };
    });
  }
  return normalized;
}

function normalizeDocumentExtractionOptionalArrays(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const obj = payload as Record<string, unknown>;
  const normalized = { ...obj };
  normalized.warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((s: unknown) => typeof s === 'string')
    : [];
  if (Array.isArray(obj.transactions)) {
    normalized.transactions = obj.transactions.map((t: unknown) => {
      if (!t || typeof t !== 'object') return t;
      const tx = t as Record<string, unknown>;
      const nt = { ...tx };
      nt.missingFields = Array.isArray(tx.missingFields)
        ? tx.missingFields.filter((s: unknown) => typeof s === 'string')
        : [];
      nt.warnings = Array.isArray(tx.warnings)
        ? tx.warnings.filter((s: unknown) => typeof s === 'string')
        : [];
      nt.lineItems = Array.isArray(tx.lineItems)
        ? tx.lineItems.filter((li: unknown) => li && typeof li === 'object')
        : [];
      if (Array.isArray(nt.lineItems)) {
        nt.lineItems = (nt.lineItems as unknown[]).map((li: unknown) => {
          if (!li || typeof li !== 'object') return li;
          const item = li as Record<string, unknown>;
          const out: Record<string, unknown> = { ...item };
          if (typeof out.name !== 'string' || !out.name.trim()) {
            out.name = '';
          } else {
            out.name = String(out.name).trim();
          }
          if (typeof out.description === 'string') {
            out.description = out.description.trim() || null;
          }
          return out;
        });
      }
      if (typeof nt.merchant === 'string') nt.merchant = nt.merchant.trim() || null;
      if (typeof nt.currency === 'string') {
        const cur = nt.currency.trim().toUpperCase();
        nt.currency = cur.length === 3 ? cur : null;
      }
      if (typeof nt.categorySuggestion === 'string') nt.categorySuggestion = nt.categorySuggestion.trim() || null;
      if (typeof nt.description === 'string') nt.description = nt.description.trim() || null;
      if (typeof nt.notes === 'string') nt.notes = nt.notes.trim() || null;
      if (typeof nt.receiptNumber === 'string') nt.receiptNumber = nt.receiptNumber.trim() || null;
      if (typeof nt.date === 'string') {
        const d = nt.date.trim();
        if (!d) nt.date = null;
      }
      if (typeof nt.confidence !== 'number' || !Number.isFinite(nt.confidence)) {
        nt.confidence = 0;
      } else {
        nt.confidence = Math.max(0, Math.min(1, nt.confidence as number));
      }
      if (typeof nt.needsReview !== 'boolean') nt.needsReview = true;
      return nt;
    });
  } else {
    normalized.transactions = [];
  }
  if (typeof normalized.confidence !== 'number' || !Number.isFinite(normalized.confidence)) {
    const txs = normalized.transactions as Array<{ confidence?: number }> | undefined;
    normalized.confidence = txs && txs.length ? Math.max(...txs.map((t) => typeof t.confidence === 'number' ? t.confidence : 0)) : 0;
  } else {
    normalized.confidence = Math.max(0, Math.min(1, normalized.confidence as number));
  }
  return normalized;
}

// ─── Config Loader ────────────────────────────────────────────────────────────

function isOpenRouterAllowed(): boolean {
  return isOpenRouterEnabled();
}

export function loadAIConfig(): AIGatewayConfig {
  // ═══ SINGLE SOURCE OF TRUTH: src/lib/ai-provider-config.ts::resolveAIProviderConfig() ═══
  // All variables read from getAIConfig() — no direct process.env duplication here.
  const cfg = getAIConfig();
  const primaryFromEnv = process.env.PRIMARY_LANGUAGE_PROVIDER || (
    cfg.language.primary
  );
  return {
    aiEnabled:                  cfg.runtime.enabled,
    aiMode:                     cfg.runtime.mode,
    primaryLanguageProvider:    primaryFromEnv,
    fallbackLanguageProvider:   cfg.language.fallback,
    primarySttProvider:         cfg.stt.primary,
    fallbackSttProvider:        cfg.stt.fallback,
    requestTimeoutMs:           cfg.runtime.requestTimeoutMs,
    maxRetries:                 cfg.runtime.maxRetries,
    confidenceThreshold:        cfg.runtime.confidenceThreshold,
    requireConfirmation:        process.env.AI_REQUIRE_CONFIRMATION !== 'false',
    maxAudioSeconds:            cfg.runtime.maxAudioSeconds,
    maxDailyRequestsPerUser:    cfg.runtime.maxDailyRequestsPerUser,
    maxTextLength:              cfg.runtime.maxTextLength,
    enableAutoFallback:         cfg.runtime.enableAutoFallback,
    enableAuditLogs:            process.env.AI_ENABLE_AUDIT_LOGS !== 'false',
    enableTranscriptRetention:  cfg.runtime.enableTranscriptRetention,
  };
}

// ─── Mock Provider (ONLY for explicit development/test mode) ─────────────────
// Mock is NEVER used in production. It activates only when:
//   (NODE_ENV === 'development' OR NODE_ENV === 'test') AND AI_MOCK_MODE !== 'false'
// In production with no configured provider, the gateway returns a clear error.

function isMockAllowed(): boolean {
  // AI_MOCK_MODE=false explicitly disables mock even in development
  if (process.env.AI_MOCK_MODE === 'false') return false;
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.NODE_ENV === 'test' ||
    process.env.AI_MOCK_MODE === 'true'
  );
}

class MockLanguageProvider implements LanguageProvider {
  name = 'mock';

  async parseFinancialInstruction(input: ParseRequest): Promise<ParsedFinancialInstruction> {
    // Deterministic mock responses for acceptance testing
    const text = input.text.toLowerCase();
    const defaultCurrency = input.context?.defaultCurrency || 'USD';
    const primaryCurrency = extractCurrency(text) || defaultCurrency;
    const personFromReceipt =
      input.text.match(/from\s+([A-Za-z][A-Za-z\s'-]+)/i) ||
      input.text.match(/([A-Za-z][A-Za-z\s'-]+)\s+(?:gave me|paid me|reimbursed me|lent me|sent me)/i);
    const parsedPersonName = personFromReceipt?.[1]?.split(/,|and|for/i)[0]?.trim() || 'Ayesha';
    const firstAccountName = input.context?.accounts?.[0]?.name || extractAccount(text) || 'Cash';
    const matchedSubscription = findMatchingContextSubscription(input.text, input.context);
    const subscriptionName = matchedSubscription?.name || extractSubscriptionName(input.text, input.context) || 'Subscription';
    const billingFrequency = extractSubscriptionFrequency(text);
    const hintedPaymentAccount = extractAccount(text) || undefined;

    if (hasSubscriptionCancelWording(text)) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.92,
        overallIntent: 'personal_subscription_cancel',
        actions: [{
          actionType: 'personal_subscription_cancel',
          subscriptionId: matchedSubscription?.id,
          subscriptionName,
          provider: matchedSubscription?.provider || subscriptionName,
          cancelEffectiveDate: text.includes('end of this month') ? endOfCurrentMonthIso() : undefined,
          confidence: matchedSubscription ? 0.95 : 0.84,
          warnings: matchedSubscription ? [] : ['Please confirm the matching subscription.'],
        }],
        warnings: matchedSubscription ? [] : ['Please confirm the matching subscription.'],
        missingFields: matchedSubscription ? [] : ['subscription'],
        requiresClarification: !matchedSubscription,
        clarificationQuestions: matchedSubscription ? [] : ['Which subscription should be cancelled?'],
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (hasSubscriptionUpdateWording(text)) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.91,
        overallIntent: 'personal_subscription_update',
        actions: [{
          actionType: 'personal_subscription_update',
          subscriptionId: matchedSubscription?.id,
          subscriptionName,
          provider: matchedSubscription?.provider || subscriptionName,
          amount: extractAmount(text) || matchedSubscription?.amount,
          currency: primaryCurrency,
          currencyCode: primaryCurrency,
          billingFrequency: billingFrequency || matchedSubscription?.billingFrequency as ParsedFinancialInstruction['actions'][number]['billingFrequency'],
          confidence: matchedSubscription ? 0.94 : 0.84,
          warnings: matchedSubscription ? [] : ['Please confirm the matching subscription.'],
        }],
        warnings: matchedSubscription ? [] : ['Please confirm the matching subscription.'],
        missingFields: matchedSubscription ? [] : ['subscription'],
        requiresClarification: !matchedSubscription,
        clarificationQuestions: matchedSubscription ? [] : ['Which subscription should be updated?'],
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (hasSubscriptionPaymentWording(text) && (matchedSubscription || billingFrequency || hasStrongSubscriptionLanguage(text))) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: matchedSubscription ? 0.94 : 0.86,
        overallIntent: 'personal_subscription_payment',
        actions: [{
          actionType: 'personal_subscription_payment',
          subscriptionId: matchedSubscription?.id,
          subscriptionName,
          provider: matchedSubscription?.provider || subscriptionName,
          amount: extractAmount(text) || matchedSubscription?.amount || 39,
          currency: primaryCurrency,
          currencyCode: primaryCurrency,
          date: 'today',
          accountName: hintedPaymentAccount,
          financialAccountHint: hintedPaymentAccount,
          billingFrequency: billingFrequency || matchedSubscription?.billingFrequency as ParsedFinancialInstruction['actions'][number]['billingFrequency'],
          paymentHappenedNow: true,
          createLinkedRecurringExpense: true,
          confidence: matchedSubscription ? 0.95 : 0.84,
          warnings: [],
        }],
        warnings: [],
        missingFields: billingFrequency || matchedSubscription ? [] : ['billingFrequency'],
        requiresClarification: !billingFrequency && !matchedSubscription,
        clarificationQuestions: billingFrequency || matchedSubscription ? [] : ['What billing frequency should be used for this subscription?'],
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (hasStrongSubscriptionLanguage(text) && !hasOrdinaryRecurringNonSubscriptionWording(text)) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.93,
        overallIntent: 'personal_subscription_create',
        actions: [{
          actionType: 'personal_subscription_create',
          subscriptionName,
          provider: subscriptionName,
          amount: extractAmount(text) || 39,
          currency: primaryCurrency,
          currencyCode: primaryCurrency,
          date: 'today',
          startDate: text.includes('today') ? 'today' : undefined,
          billingFrequency: billingFrequency || 'monthly',
          accountName: hintedPaymentAccount,
          financialAccountHint: hintedPaymentAccount,
          paymentHappenedNow: false,
          createLinkedRecurringExpense: true,
          confidence: 0.93,
          warnings: [],
        }],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (
      (text.includes('received money from') || text.includes('received') || text.includes('got money from') || text.includes('sent me')) &&
      (text.includes('used it') || text.includes('used some of it') || text.includes('used the money') || text.includes('pay '))
    ) {
      const receivedAmount = extractAmount(text) || 2000;
      const explicitExpenseAmount = extractExplicitExpenseAmount(text, receivedAmount);
      const fullAmountExplicit =
        text.includes('used all of it') ||
        text.includes('used the full amount') ||
        text.includes('spent the full amount');
      const expenseAmount = explicitExpenseAmount ?? (fullAmountExplicit ? receivedAmount : undefined);
      const expenseCategory = inferExpenseCategory(text);

      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.58,
        overallIntent: 'unclear',
        actions: [
          {
            actionType: 'money_received_from_person',
            amount: receivedAmount,
            currency: primaryCurrency,
            date: 'today',
            personName: parsedPersonName,
            confidence: 0.7,
            warnings: ['The purpose of this money is unclear.'],
          },
          {
            actionType: 'expense',
            amount: expenseAmount,
            amountNeedsConfirmation: typeof expenseAmount !== 'number',
            currency: primaryCurrency,
            date: 'today',
            categoryName: expenseCategory,
            accountName: firstAccountName,
            paidFrom: 'account',
            confidence: 0.61,
            warnings: typeof expenseAmount === 'number' ? [] : ['The expense amount is not explicit yet.'],
          },
        ],
        warnings: [
          'The purpose of this money is unclear.',
          ...(typeof expenseAmount === 'number' ? [] : ['The expense amount needs confirmation.']),
        ],
        missingFields: typeof expenseAmount === 'number' ? ['purpose'] : ['purpose', 'amount'],
        requiresClarification: true,
        clarificationQuestions: typeof expenseAmount === 'number'
          ? ['How should this money be treated?']
          : ['How should this money be treated?', 'How much was used?'],
        inferredPurpose: 'unclear',
        purposeConfidence: 0.35,
        purposeNeedsConfirmation: true,
        receivedAmount,
        spentAmount: expenseAmount,
        spentAmountKnown: typeof expenseAmount === 'number',
        amountNeedsConfirmation: typeof expenseAmount !== 'number',
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (
      text.includes('paid me') &&
      (text.includes('consulting') || text.includes('for work')) &&
      text.includes('rent')
    ) {
      const amounts = input.text.match(/\d+(?:[.,]\d+)?/g) || [];
      const incomeAmount = Number(amounts[0] || 2000);
      const rentAmount = Number(amounts[1] || 800);
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.95,
        overallIntent: 'multiple_actions',
        actions: [
          {
            actionType: 'income',
            amount: incomeAmount,
            currency: primaryCurrency,
            date: 'today',
            personName: parsedPersonName,
            accountName: firstAccountName,
            confidence: 0.95,
            warnings: [],
          },
          {
            actionType: 'expense',
            amount: rentAmount,
            currency: primaryCurrency,
            date: 'today',
            categoryName: 'Housing & Rent',
            accountName: firstAccountName,
            paidFrom: 'account',
            confidence: 0.94,
            warnings: [],
          },
        ],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (
      (text.includes('borrowed') || text.includes('lent me') || text.includes('loan from') || text.includes('as a loan')) &&
      (text.includes('paid') || text.includes('spent')) &&
      text.includes('rent')
    ) {
      const amounts = input.text.match(/\d+(?:[.,]\d+)?/g) || [];
      const borrowedAmount = Number(amounts[0] || 2000);
      const rentAmount = Number(amounts[1] || (text.includes('all of it') ? borrowedAmount : 800));
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.95,
        overallIntent: 'multiple_actions',
        actions: [
          {
            actionType: 'loan_received',
            amount: borrowedAmount,
            currency: primaryCurrency,
            date: 'today',
            personName: parsedPersonName,
            accountName: firstAccountName,
            paidFrom: 'external',
            confidence: 0.95,
            warnings: [],
          },
          {
            actionType: 'expense',
            amount: rentAmount,
            currency: primaryCurrency,
            date: 'today',
            categoryName: 'Housing & Rent',
            accountName: firstAccountName,
            paidFrom: 'account',
            confidence: 0.93,
            warnings: [],
          },
        ],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (
      text.includes('gave me') &&
      (text.includes('to pay her rent') || text.includes('to pay his rent') || text.includes('to pay their rent') || text.includes('on her behalf'))
    ) {
      const receivedAmount = extractAmount(text) || 2000;
      const managedAccountName = `${parsedPersonName} Cash`;
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.95,
        overallIntent: 'managed_person_transaction',
        actions: [
          {
            actionType: 'money_received_from_person',
            amount: receivedAmount,
            currency: primaryCurrency,
            date: 'today',
            personName: parsedPersonName,
            accountName: managedAccountName,
            paidFrom: 'external',
            confidence: 0.95,
            warnings: [],
          },
          {
            actionType: 'expense_from_held_balance',
            amount: receivedAmount,
            currency: primaryCurrency,
            date: 'today',
            personName: parsedPersonName,
            categoryName: 'Housing & Rent',
            accountName: managedAccountName,
            paidFrom: 'held_balance',
            confidence: 0.93,
            warnings: [],
          },
        ],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (text.includes('reimbursed me') && text.includes('hotel')) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.94,
        overallIntent: 'reimbursement',
        actions: [{
          actionType: 'reimbursement_payment',
          amount: extractAmount(text) || 500,
          currency: primaryCurrency,
          date: 'today',
          personName: parsedPersonName,
          confidence: 0.94,
          warnings: [],
        }],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (
      (text.includes('borrowed') || text.includes('lent me') || text.includes('loan from')) &&
      text.includes('spent')
    ) {
      const personName = parsedPersonName || 'Sarmad';
      const accountName = firstAccountName;

      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.94,
        overallIntent: 'multiple_actions',
        actions: [
          {
            actionType: 'loan_received',
            amount: 3000,
            currency: primaryCurrency,
            date: 'today',
            personName,
            accountName,
            paidFrom: 'external',
            confidence: 0.95,
            warnings: [],
          },
          {
            actionType: 'expense',
            amount: 45,
            currency: primaryCurrency,
            date: 'today',
            categoryName: 'Transport',
            accountName,
            paidFrom: 'account',
            confidence: 0.92,
            warnings: [],
          },
          {
            actionType: 'expense',
            amount: 30,
            currency: primaryCurrency,
            date: 'today',
            categoryName: 'Dining Out',
            accountName,
            paidFrom: 'account',
            confidence: 0.92,
            warnings: [],
          },
        ],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (
      text.includes('received') &&
      text.includes('from') &&
      text.includes('spent') &&
      (text.includes('transport') || text.includes('food'))
    ) {
      const personName = parsedPersonName || 'Sarmad';
      const accountName = firstAccountName;

      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.93,
        overallIntent: 'managed_person_transaction',
        actions: [
          {
            actionType: 'money_received_from_person',
            amount: 3000,
            currency: primaryCurrency,
            date: 'today',
            personName,
            accountName,
            paidFrom: 'external',
            confidence: 0.95,
            warnings: [],
          },
          {
            actionType: 'expense_from_held_balance',
            amount: 45,
            currency: primaryCurrency,
            date: 'today',
            personName,
            categoryName: 'Transport',
            accountName,
            paidFrom: 'held_balance',
            confidence: 0.92,
            warnings: [],
          },
          {
            actionType: 'expense_from_held_balance',
            amount: 30,
            currency: primaryCurrency,
            date: 'today',
            personName,
            categoryName: 'Dining Out',
            accountName,
            paidFrom: 'held_balance',
            confidence: 0.92,
            warnings: [],
          },
        ],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (
      (text.includes('gave me') || text.includes('received')) &&
      text.includes('own cash')
    ) {
      const personMatch =
        input.text.match(/from\s+([A-Za-z][A-Za-z\s'-]+)/i) ||
        input.text.match(/([A-Za-z][A-Za-z\s'-]+)\s+gave me/i);
      const personName = personMatch?.[1]?.split(/,|\./i)[0]?.trim() || 'Sarmad';
      const accountName = input.context?.accounts?.[0]?.name || extractAccount(text) || 'Cash';

      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.9,
        overallIntent: 'multiple_actions',
        actions: [
          {
            actionType: 'money_received_from_person',
            amount: 3000,
            currency: extractCurrency(text) || defaultCurrency,
            date: 'today',
            personName,
            accountName,
            paidFrom: 'external',
            confidence: 0.93,
            warnings: [],
          },
          {
            actionType: 'expense',
            amount: 30,
            currency: extractCurrency(text) || defaultCurrency,
            date: 'today',
            categoryName: 'Other',
            accountName,
            paidFrom: 'account',
            confidence: 0.88,
            warnings: [],
          },
        ],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    const groceryKeywords = [
      'groceries',
      'grocery',
      'supermarket',
      'carrefour',
      'vegetables',
      'vegetable',
      'fruit',
      'meat',
      'milk',
      'bakery',
      'cake',
      'cakes',
      'cleaning',
      'detergent',
      'tissues',
      'toiletries',
      'household',
    ];
    const diningKeywords = [
      'restaurant',
      'restaurants',
      'cafe',
      'cafes',
      'coffee',
      'starbucks',
      'takeaway',
      'takeout',
      'delivery',
      'talabat',
      'lunch',
      'dinner',
    ];

    if (groceryKeywords.some((keyword) => text.includes(keyword))) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.95,
        overallIntent: 'personal_transaction',
        actions: [{
          actionType: 'expense',
          amount: extractAmount(text) || 85,
          currency: extractCurrency(text) || defaultCurrency,
          date: 'today',
          categoryName: 'Groceries & Household',
          accountName: extractAccount(text) || 'Cash',
          paidFrom: 'account',
          confidence: 0.95,
          warnings: [],
        }],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (diningKeywords.some((keyword) => text.includes(keyword))) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.95,
        overallIntent: 'personal_transaction',
        actions: [{
          actionType: 'expense',
          amount: extractAmount(text) || 30,
          currency: extractCurrency(text) || defaultCurrency,
          date: 'today',
          categoryName: 'Dining Out',
          accountName: extractAccount(text) || 'Cash',
          paidFrom: 'account',
          confidence: 0.95,
          warnings: [],
        }],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (text.includes('transfer')) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.92,
        overallIntent: 'transfer',
        actions: [{
          actionType: 'transfer',
          amount: extractAmount(text) || 1000,
          currency: extractCurrency(text) || defaultCurrency,
          date: 'today',
          accountName: extractFromAccount(text) || 'Bank',
          destinationAccountName: extractToAccount(text) || 'Cash',
          confidence: 0.92,
          warnings: [],
        }],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (text.includes('paid sarmad') && (text.includes('back') || text.includes('loan'))) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.91,
        overallIntent: 'multiple_actions',
        actions: [{
          actionType: 'loan_repayment',
          amount: extractAmount(text) || 500,
          currency: extractCurrency(text) || defaultCurrency,
          date: 'today',
          personName: 'Sarmad',
          accountName: extractAccount(text) || 'Cash',
          confidence: 0.91,
          warnings: [],
        }],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (text.includes('returned') && text.includes('remaining money')) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.9,
        overallIntent: 'managed_person_transaction',
        actions: [{
          actionType: 'money_returned_to_person',
          amount: extractAmount(text) || 500,
          currency: extractCurrency(text) || defaultCurrency,
          date: 'today',
          personName: 'Sarmad',
          confidence: 0.9,
          warnings: [],
        }],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (text.includes('gave me')) {
      const personMatch = input.text.match(/([A-Za-z][A-Za-z\s'-]+)\s+gave me/i);
      const personName = personMatch?.[1]?.trim() || 'Sarmad';
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.72,
        overallIntent: 'unclear',
        actions: [{
          actionType: 'money_received_from_person',
          amount: extractAmount(text) || 3000,
          currency: extractCurrency(text) || defaultCurrency,
          date: 'today',
          personName,
          confidence: 0.72,
          warnings: [],
        }],
        warnings: ['The purpose of this money is unclear.'],
        missingFields: ['purpose'],
        requiresClarification: true,
        clarificationQuestions: ['How should this money be treated?'],
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    if (text.includes('rent') && (text.includes('monthly') || text.includes('every month'))) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.90,
        overallIntent: 'recurring_transaction',
        actions: [{
          actionType: 'recurring_transaction',
          amount: extractAmount(text) || 4500,
          currency: extractCurrency(text) || defaultCurrency,
          categoryName: 'Housing & Rent',
          description: 'Monthly rent',
          recurringFrequency: 'monthly',
          recurrenceDayOfMonth: extractDayOfMonth(text) || 1,
          confidence: 0.90,
          warnings: [],
        }],
        warnings: [],
        missingFields: [],
        requiresClarification: false,
        providerUsed: 'mock',
        fallbackUsed: false,
      };
    }

    // Ambiguous — request clarification
    return {
      requestId: input.requestId || 'mock-req',
      language: 'en',
      confidence: 0.45,
      overallIntent: 'unclear',
      actions: [],
      warnings: ['Could not determine intent from input'],
      missingFields: ['amount', 'account', 'category'],
      requiresClarification: true,
      clarificationQuestions: [
        'What currency was this in?',
        'Which account did you pay from?',
        'What category does this belong to?',
      ],
      providerUsed: 'mock',
      fallbackUsed: false,
    };
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    return {
      provider: 'mock',
      status: 'healthy',
      responseTimeMs: 1,
      modelUsed: 'mock-v1',
      checkedAt: new Date().toISOString(),
    };
  }
}

class MockSpeechProvider implements SpeechProvider {
  name = 'mock';

  async transcribe(_input: AudioInput): Promise<TranscriptResult> {
    return {
      transcript: '[Mock transcript — configure a real speech provider to enable voice input]',
      detectedLanguage: 'en',
      confidence: 1.0,
      durationMs: 50,
      providerUsed: 'mock',
      modelUsed: 'mock-stt-v1',
      fallbackUsed: false,
    };
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    return {
      provider: 'mock',
      status: 'healthy',
      responseTimeMs: 1,
      checkedAt: new Date().toISOString(),
    };
  }
}

// ─── OpenRouter Language Provider ────────────────────────────────────────────

class OpenRouterLanguageProvider implements LanguageProvider {
  name = 'openrouter';
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(timeoutMs = 20000) {
    this.apiKey  = process.env.OPENROUTER_API_KEY || '';
    this.baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
    this.model   = process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini';
    this.timeoutMs = timeoutMs;
  }

  private ensureAllowed(context: string): void {
    if (!isOpenRouterAllowed()) {
      throw new Error(`OpenRouter provider is disabled. Set OPENROUTER_ENABLED=true to enable fallback. (${context})`);
    }
  }

  async parseFinancialInstruction(input: ParseRequest): Promise<ParsedFinancialInstruction> {
    this.ensureAllowed('parseFinancialInstruction');
    if (!this.apiKey) throw new Error('OpenRouter not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const userMessage = buildUserMessage(input);
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://1smartpocket.com',
          'X-Title': 'Smart Pocket AI',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: FINANCIAL_SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.1,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new Error(`OpenRouter error ${response.status}: ${sanitizeError(errText)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const normalizedContent = stripTranscriptFormatting(extractOpenRouterTextContent(content));
      if (!normalizedContent) throw new Error('Empty response from OpenRouter');

      const parsed = safeParseJSON(normalizedContent);
      if (!parsed) throw new Error('Invalid JSON from OpenRouter');

      const validated = validateParsedInstruction(parsed);
      return {
        ...validated,
        providerUsed: 'openrouter',
        modelUsed: this.model,
        fallbackUsed: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    if (!isOpenRouterAllowed()) {
      return { provider: 'openrouter', status: 'disabled', checkedAt: new Date().toISOString() };
    }
    if (!this.apiKey) {
      return { provider: 'openrouter', status: 'not_configured', checkedAt: new Date().toISOString() };
    }
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      return {
        provider: 'openrouter',
        status: response.ok ? 'healthy' : 'degraded',
        responseTimeMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        provider: 'openrouter',
        status: 'offline',
        responseTimeMs: Date.now() - start,
        errorCategory: 'connection_failed',
        checkedAt: new Date().toISOString(),
      };
    }
  }
}

export interface OpenRouterAudioTranscriptionRequest {
  audioBuffer: Buffer;
  mimeType: string;
  format: string;
  model: string;
  prompt: string;
  language?: string;
  timeoutMs?: number;
}

export interface OpenRouterAudioTranscriptionResponse {
  transcript: string;
  modelUsed: string;
  rawOutput: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}

export interface OpenRouterTextRewriteRequest {
  model: string;
  prompt: string;
  timeoutMs?: number;
}

export interface OpenRouterTextRewriteResponse {
  text: string;
  modelUsed: string;
  rawOutput: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}

export function getOpenRouterBaseUrl() {
  return process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
}

export function getOpenRouterHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) {
    throw new Error('OpenRouter not configured');
  }

  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://1smartpocket.com',
    'X-Title': 'Smart Pocket AI',
  };
}

function getDisplayLanguageName(language: string) {
  switch ((language || '').trim().toLowerCase()) {
    case 'ar':
      return 'Arabic';
    case 'fr':
      return 'French';
    case 'ru':
      return 'Russian';
    case 'ur':
      return 'Urdu';
    case 'tr':
      return 'Turkish';
    case 'zh-cn':
    case 'zh':
      return 'Simplified Chinese';
    case 'es':
      return 'Spanish';
    case 'pt-br':
    case 'pt':
      return 'Brazilian Portuguese';
    case 'en':
    default:
      return 'English';
  }
}

function buildVoiceSinglePassSystemPrompt(displayLanguage: string) {
  return `${FINANCIAL_SYSTEM_PROMPT}

For voice inputs, include these additional top-level JSON fields:
- "transcript": the transcript to show in the UI. If the spoken language differs from ${getDisplayLanguageName(displayLanguage)}, translate it into ${getDisplayLanguageName(displayLanguage)} while preserving transaction meaning, names, amounts, currencies, dates, merchants, and account names exactly. If translation is not needed, return the exact transcription.
- "originalTranscript": the exact spoken-language transcription in the original script.
- "detectedLanguage": the detected spoken language as a BCP-47 language code.
- "translationApplied": true only if "transcript" is translated from "originalTranscript".
- "translationFailed": false when you can provide a usable transcript.

If the transaction is ambiguous, still return the full JSON schema with missingFields and requiresClarification instead of refusing.`;
}

function buildVoiceSinglePassUserMessage(input: AIAssistantRequest) {
  const displayLanguage = input.displayLanguage || input.language || 'en';
  const spokenLanguage = input.spokenLanguage || input.audio?.languageHint || 'auto';
  let msg = 'Analyze this spoken financial instruction in a single pass and return only valid JSON.';
  msg += `\nrequestId: ${input.idempotencyKey || createClientId()}`;
  msg += `\nDisplay language: ${displayLanguage}`;
  msg += `\nSpoken language hint: ${spokenLanguage}`;
  if (input.locale) msg += `\nLocale: ${input.locale}`;
  if (input.currentDate) msg += `\nCurrent date: ${input.currentDate}`;
  if (input.currentDateTime) msg += `\nCurrent date-time: ${input.currentDateTime}`;
  if (input.timezone) msg += `\nTimezone: ${input.timezone}`;
  if (input.context) {
    if (input.context.accounts?.length) {
      msg += `\n\nAvailable accounts: ${input.context.accounts.map((a) => `${a.name} (${a.type}, ${a.currency})`).join(', ')}`;
    }
    if (input.context.people?.length) {
      msg += `\nKnown people: ${input.context.people.map((p) => {
        const aliases = p.aliases?.length ? ` [aliases: ${p.aliases.join(', ')}]` : '';
        return `${p.fullName}${aliases}`;
      }).join(', ')}`;
    }
    if (input.context.categories?.length) {
      msg += `\nAvailable categories: ${input.context.categories.map((c) => c.name).join(', ')}`;
    }
    if (input.context.subscriptions?.length) {
      msg += `\nKnown subscriptions: ${input.context.subscriptions
        .map((subscription) => {
          const parts = [subscription.name];
          if (subscription.provider) parts.push(`provider: ${subscription.provider}`);
          if (subscription.amount && subscription.currencyCode) parts.push(`amount: ${subscription.amount} ${subscription.currencyCode}`);
          if (subscription.billingFrequency) parts.push(`frequency: ${subscription.billingFrequency}`);
          if (subscription.status) parts.push(`status: ${subscription.status}`);
          return parts.join(' | ');
        })
        .join(', ')}`;
    }
    if (input.context.defaultCurrency) {
      msg += `\nDefault currency: ${input.context.defaultCurrency}`;
    }
  }
  return msg;
}

function extractVoiceStructuredFields(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return {
      transcript: undefined,
      originalTranscript: undefined,
      detectedLanguage: undefined,
      translationApplied: false,
      translationFailed: false,
    };
  }

  const record = payload as Record<string, unknown>;
  const transcript = typeof record.transcript === 'string' ? record.transcript.trim() : undefined;
  const originalTranscript = typeof record.originalTranscript === 'string' ? record.originalTranscript.trim() : undefined;
  const detectedLanguage = typeof record.detectedLanguage === 'string' ? record.detectedLanguage.trim().toLowerCase() : undefined;
  const translationApplied = record.translationApplied === true;
  const translationFailed = record.translationFailed === true;

  return {
    transcript,
    originalTranscript,
    detectedLanguage,
    translationApplied,
    translationFailed,
  };
}

async function processSinglePassVoiceRequest(
  request: AIAssistantRequest,
  config: AIGatewayConfig,
  startTime: number
): Promise<AIAssistantResponse> {
  if (!request.audio) {
    return {
      requestId: createClientId(),
      status: 'failed',
      errorMessage: 'Voice audio is required for voice entry.',
      errorCategory: 'empty_input',
      durationMs: Date.now() - startTime,
    };
  }

  if (!isOpenRouterAllowed()) {
    return {
      requestId: createClientId(),
      status: 'failed',
      errorMessage: 'AI provider unavailable. Please try again or use manual entry.',
      errorCategory: 'provider_unavailable',
      providerUsed: 'gemini',
      fallbackUsed: false,
      durationMs: Date.now() - startTime,
      providerCallCount: 0,
    };
  }

  const apiKey = process.env.OPENROUTER_API_KEY || '';
  const model = request.voiceModel || process.env.VOICE_MODEL || process.env.OPENROUTER_MODEL || '';
  const format = getOpenRouterAudioFormat(normalizeVoiceAudioMimeType(request.audio.mimeType));
  if (!apiKey || !model || !format) {
    return {
      requestId: createClientId(),
      status: 'not_configured',
      errorMessage: 'AI is not configured yet. You can continue using manual transaction entry.',
      errorCategory: 'not_configured',
      durationMs: Date.now() - startTime,
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const displayLanguage = request.displayLanguage || request.language || 'en';

  try {
    const response = await fetch(`${getOpenRouterBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: getOpenRouterHeaders(),
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: buildVoiceSinglePassSystemPrompt(displayLanguage),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: buildVoiceSinglePassUserMessage(request),
              },
              {
                type: 'input_audio',
                input_audio: {
                  data: request.audio.audioBase64,
                  format,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenRouter error ${response.status}: ${sanitizeError(errText)}`);
    }

    const rawOutput = await response.json();
    const content = rawOutput?.choices?.[0]?.message?.content;
    const normalizedContent = stripTranscriptFormatting(extractOpenRouterTextContent(content));
    if (!normalizedContent) {
      throw new Error('Empty response from OpenRouter');
    }

    const parsedPayload = safeParseJSON(normalizedContent);
    if (!parsedPayload) {
      throw new Error('Invalid JSON from OpenRouter');
    }

    const voiceFields = extractVoiceStructuredFields(parsedPayload);
    try {
      const validated = validateParsedInstruction(parsedPayload);
      const transcript = voiceFields.transcript || validated.transcript || voiceFields.originalTranscript;
      const originalTranscript = voiceFields.originalTranscript || transcript;

      return {
        requestId: validated.requestId,
        status: 'parsed',
        parsed: {
          ...validated,
          transcript,
          originalTranscript,
          detectedLanguage: voiceFields.detectedLanguage || validated.language,
          translationApplied: voiceFields.translationApplied || (Boolean(transcript) && Boolean(originalTranscript) && transcript !== originalTranscript),
          translationFailed: voiceFields.translationFailed,
          providerUsed: 'openrouter',
          modelUsed: model,
          fallbackUsed: false,
        },
        transcript,
        originalTranscript,
        detectedLanguage: voiceFields.detectedLanguage || validated.language,
        providerUsed: 'openrouter',
        modelUsed: model,
        fallbackUsed: false,
        durationMs: Date.now() - startTime,
        providerCallCount: 1,
      };
    } catch (validationError) {
      return {
        requestId: createClientId(),
        status: 'failed',
        transcript: voiceFields.transcript || voiceFields.originalTranscript,
        originalTranscript: voiceFields.originalTranscript || voiceFields.transcript,
        detectedLanguage: voiceFields.detectedLanguage,
        errorMessage: sanitizeError(validationError instanceof Error ? validationError.message : 'Invalid structured voice response'),
        errorCategory: 'invalid_response',
        providerUsed: 'openrouter',
        modelUsed: model,
        fallbackUsed: false,
        durationMs: Date.now() - startTime,
        providerCallCount: 1,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}

function extractOpenRouterTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }

      if (!part || typeof part !== 'object') {
        return '';
      }

      const record = part as Record<string, unknown>;
      if (typeof record.text === 'string') {
        return record.text;
      }

      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function stripTranscriptFormatting(value: string) {
  return value
    .replace(/^```[\w-]*\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

export async function transcribeAudioWithOpenRouter(
  input: OpenRouterAudioTranscriptionRequest
): Promise<OpenRouterAudioTranscriptionResponse> {
  if (!isOpenRouterAllowed()) {
    throw new Error('OpenRouter provider is disabled. Set OPENROUTER_ENABLED=true to enable fallback. (transcribeAudioWithOpenRouter)');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs || 20000);

  try {
    const response = await fetch(`${getOpenRouterBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: getOpenRouterHeaders(),
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: input.prompt + (input.language && input.language !== 'auto' ? `\nLanguage hint: ${input.language}` : ''),
              },
              {
                type: 'input_audio',
                input_audio: {
                  data: input.audioBuffer.toString('base64'),
                  format: input.format,
                },
              },
            ],
          },
        ],
        temperature: 0,
        max_tokens: 1200,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenRouter error ${response.status}: ${sanitizeError(errText)}`);
    }

    const rawOutput = await response.json();
    const usageDetails = extractProviderUsageDetails(rawOutput);
    const content = rawOutput?.choices?.[0]?.message?.content;
    const transcript = stripTranscriptFormatting(extractOpenRouterTextContent(content));

    if (!transcript) {
      throw new Error('Empty transcription response from OpenRouter');
    }

    return {
      transcript,
      modelUsed: input.model,
      rawOutput,
      ...usageDetails,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function rewriteTextWithOpenRouter(
  input: OpenRouterTextRewriteRequest
): Promise<OpenRouterTextRewriteResponse> {
  if (!isOpenRouterAllowed()) {
    throw new Error('OpenRouter provider is disabled. Set OPENROUTER_ENABLED=true to enable fallback. (rewriteTextWithOpenRouter)');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs || 20000);

  try {
    const response = await fetch(`${getOpenRouterBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: getOpenRouterHeaders(),
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: 'user',
            content: input.prompt,
          },
        ],
        temperature: 0,
        max_tokens: 1200,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`OpenRouter error ${response.status}: ${sanitizeError(errText)}`);
    }

    const rawOutput = await response.json();
    const usageDetails = extractProviderUsageDetails(rawOutput);
    const content = rawOutput?.choices?.[0]?.message?.content;
    const text = stripTranscriptFormatting(extractOpenRouterTextContent(content));

    if (!text) {
      throw new Error('Empty text rewrite response from OpenRouter');
    }

    return {
      text,
      modelUsed: input.model,
      rawOutput,
      ...usageDetails,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── VPS Language Provider (OpenAI-compatible) ───────────────────────────────

class VPSLanguageProvider implements LanguageProvider {
  name = 'vps_ai';
  private baseUrl: string;
  private model: string;
  private authToken: string;
  private timeoutMs: number;

  constructor(timeoutMs = 20000) {
    this.baseUrl   = process.env.LOCAL_AI_BASE_URL || '';
    this.model     = process.env.LOCAL_AI_MODEL || 'llama3';
    this.authToken = process.env.LOCAL_AI_AUTH_TOKEN || '';
    this.timeoutMs = timeoutMs;
  }

  async parseFinancialInstruction(input: ParseRequest): Promise<ParsedFinancialInstruction> {
    if (!this.baseUrl) throw new Error('VPS AI not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: FINANCIAL_SYSTEM_PROMPT },
            { role: 'user', content: buildUserMessage(input) },
          ],
          temperature: 0.1,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`VPS AI error ${response.status}`);

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      const normalizedContent = stripTranscriptFormatting(extractOpenRouterTextContent(content));
      if (!normalizedContent) throw new Error('Empty response from VPS AI');

      const parsed = safeParseJSON(normalizedContent);
      if (!parsed) throw new Error('Invalid JSON from VPS AI');

      const validated = validateParsedInstruction(parsed);
      return {
        ...validated,
        providerUsed: 'vps_ai',
        modelUsed: this.model,
        fallbackUsed: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    if (!this.baseUrl) {
      return { provider: 'vps_ai', status: 'not_configured', checkedAt: new Date().toISOString() };
    }
    const start = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
      const response = await fetch(`${this.baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return {
        provider: 'vps_ai',
        status: response.ok ? 'healthy' : 'degraded',
        responseTimeMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        provider: 'vps_ai',
        status: 'offline',
        responseTimeMs: Date.now() - start,
        errorCategory: 'connection_failed',
        checkedAt: new Date().toISOString(),
      };
    }
  }
}

// ─── Cloud STT Provider ───────────────────────────────────────────────────────

class CloudSTTProvider implements SpeechProvider {
  name = 'cloud_stt';
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private timeoutMs: number;

  constructor(timeoutMs = 20000) {
    this.apiKey  = process.env.CLOUD_STT_API_KEY || '';
    this.baseUrl = process.env.CLOUD_STT_BASE_URL || '';
    this.model   = process.env.CLOUD_STT_MODEL || 'whisper-1';
    this.timeoutMs = timeoutMs;
  }

  async transcribe(input: AudioInput): Promise<TranscriptResult> {
    if (!this.apiKey || !this.baseUrl) throw new Error('Cloud STT not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const audioBuffer = Buffer.from(input.audioBase64, 'base64');
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: input.mimeType });
      formData.append('file', blob, 'audio.webm');
      formData.append('model', this.model);
      if (input.languageHint) formData.append('language', input.languageHint);

      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.apiKey}` },
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`Cloud STT error ${response.status}`);

      const data = await response.json();
      return {
        transcript: data.text || '',
        detectedLanguage: data.language,
        confidence: 0.9,
        providerUsed: 'cloud_stt',
        modelUsed: this.model,
        fallbackUsed: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    if (!this.apiKey || !this.baseUrl) {
      return { provider: 'cloud_stt', status: 'not_configured', checkedAt: new Date().toISOString() };
    }
    return { provider: 'cloud_stt', status: 'healthy', checkedAt: new Date().toISOString() };
  }
}

// ─── VPS STT Provider ─────────────────────────────────────────────────────────

class VPSSTTProvider implements SpeechProvider {
  name = 'vps_stt';
  private baseUrl: string;
  private model: string;
  private authToken: string;
  private timeoutMs: number;

  constructor(timeoutMs = 20000) {
    this.baseUrl   = process.env.LOCAL_STT_BASE_URL || '';
    this.model     = process.env.LOCAL_STT_MODEL || 'whisper';
    this.authToken = process.env.LOCAL_STT_AUTH_TOKEN || '';
    this.timeoutMs = timeoutMs;
  }

  async transcribe(input: AudioInput): Promise<TranscriptResult> {
    if (!this.baseUrl) throw new Error('VPS STT not configured');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const audioBuffer = Buffer.from(input.audioBase64, 'base64');
      const formData = new FormData();
      const blob = new Blob([audioBuffer], { type: input.mimeType });
      formData.append('file', blob, 'audio.webm');
      formData.append('model', this.model);
      if (input.languageHint) formData.append('language', input.languageHint);

      const headers: Record<string, string> = {};
      if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

      const response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers,
        body: formData,
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`VPS STT error ${response.status}`);

      const data = await response.json();
      return {
        transcript: data.text || '',
        detectedLanguage: data.language,
        confidence: 0.85,
        providerUsed: 'vps_stt',
        modelUsed: this.model,
        fallbackUsed: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    if (!this.baseUrl) {
      return { provider: 'vps_stt', status: 'not_configured', checkedAt: new Date().toISOString() };
    }
    const start = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
      const response = await fetch(`${this.baseUrl}/health`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      return {
        provider: 'vps_stt',
        status: response.ok ? 'healthy' : 'degraded',
        responseTimeMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
      };
    } catch {
      return {
        provider: 'vps_stt',
        status: 'offline',
        responseTimeMs: Date.now() - start,
        errorCategory: 'connection_failed',
        checkedAt: new Date().toISOString(),
      };
    }
  }
}

// ─── Gemini Language Provider (direct Google GenAI) ──────────────────────────
// Only TEXT parsing. No voice, no receipts/PDFs/images. Those stay in OpenRouter.
// Falls back to OpenRouter transparently via withFallback when:
//   - GEMINI_API_KEY missing (constructor throws)
//   - generateContent call fails (throws)
//   - response is empty or invalid JSON (throws)
//   - schema validation via validateParsedInstruction fails (throws)

export function extractGeminiCandidateText(result: unknown): string {
  const r = result as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
      finishMessage?: string;
      safetyRatings?: Array<{ category: string; probability: string }>;
      tokenCount?: number;
    }>;
    promptFeedback?: { blockReason?: string; safetyRatings?: unknown[] };
    usageMetadata?: unknown;
  };
  const candidate = r?.candidates?.[0];
  const blocked = r?.promptFeedback?.blockReason;
  if (blocked) {
    throw new Error(
      `Gemini response blocked by safety: ${String(blocked)}` +
        (candidate?.finishMessage ? ` (${String(candidate.finishMessage)})` : ''),
    );
  }
  if (candidate?.finishReason && !['STOP', 'MAX_TOKENS', ''].includes(String(candidate.finishReason))) {
    if (String(candidate.finishReason).toUpperCase() === 'SAFETY') {
      throw new Error('Gemini response blocked by safety finish reason');
    }
    if (String(candidate.finishReason).toUpperCase() === 'RECITATION') {
      throw new Error('Gemini response blocked by recitation policy');
    }
  }
  return candidate?.content?.parts
    ?.map((p) => (typeof p?.text === 'string' ? p.text : ''))
    .join('') ?? '';
}

class GeminiLanguageProvider implements LanguageProvider {
  name = 'gemini';
  private timeoutMs: number;

  constructor(timeoutMs = 20000) {
    this.timeoutMs = timeoutMs;
  }

  private getTextModelName(): string {
    return getGeminiTextModel();
  }
  private getMultimodalModelName(): string {
    return getGeminiMultimodalModel();
  }
  private getMultimodalFallbackModelName(): string {
    return getGeminiMultimodalFallbackModel();
  }

  private extractCandidateText(result: unknown): string {
    return extractGeminiCandidateText(result);
  }

  private getFinishReason(result: unknown): string | null {
    const r = result as { candidates?: Array<{ finishReason?: string }> };
    return r?.candidates?.[0]?.finishReason || null;
  }

  private getSafetyBlockReason(result: unknown): string | null {
    const r = result as { promptFeedback?: { blockReason?: string } };
    return r?.promptFeedback?.blockReason || null;
  }

  async parseFinancialInstruction(input: ParseRequest): Promise<ParsedFinancialInstruction> {
    const handle = getGeminiClient();
    const client = handle.requireClient('smart-entry-text-parse');
    const model = this.getTextModelName();

    const userMessage = buildUserMessage(input);
    const systemInstruction = FINANCIAL_SYSTEM_PROMPT;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const result = await client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [{ text: userMessage }],
          },
        ],
        config: {
          systemInstruction: {
            role: 'system',
            parts: [{ text: systemInstruction }],
          },
          temperature: 0.1,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
          responseJsonSchema: VOICE_SMART_ENTRY_RESPONSE_JSON_SCHEMA,
          candidateCount: 1,
          abortSignal: controller.signal,
        },
      });

      const finishReason = this.getFinishReason(result);
      const safetyBlock = this.getSafetyBlockReason(result);
      if (safetyBlock) {
        throw new Error(`Gemini text parse blocked by safety (prompt): ${String(safetyBlock)}`);
      }
      if (finishReason && ['SAFETY', 'RECITATION'].includes(String(finishReason).toUpperCase())) {
        throw new Error(`Gemini text parse blocked by finish reason: ${String(finishReason)}`);
      }

      let candidateText = '';
      try {
        candidateText = this.extractCandidateText(result);
      } catch (extractErr) {
        throw new Error(extractErr instanceof Error ? extractErr.message : 'Gemini response extract failed');
      }
      const content = stripTranscriptFormatting(candidateText.trim());
      if (!content) {
        const extra = finishReason ? ` (finishReason=${String(finishReason)})` : '';
        throw new Error('Empty response from Gemini text parse' + extra);
      }

      const parsed = safeParseJSON(content);
      if (!parsed) {
        const snippet = content.slice(0, 200).replace(/\s+/g, ' ').trim();
        throw new Error(`Invalid JSON from Gemini text parse: ${snippet || '(empty)'}`);
      }

      const fallbackReqId = input.requestId || createClientId();
      const defaultCurrency = input.context?.defaultCurrency;
      const normalized = normalizeParsedInstructionDefaults(parsed, fallbackReqId, input.language || input.locale || 'en', defaultCurrency || undefined);
      const validated = validateParsedInstruction(normalized);
      return {
        ...validated,
        providerUsed: 'gemini',
        modelUsed: model,
        fallbackUsed: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async parseVoiceSinglePass(
    params: { request: AIAssistantRequest; config: AIGatewayConfig; startTime: number } | AIAssistantRequest,
  ): ReturnType<typeof processSinglePassVoiceRequest> {
    const request = 'request' in params ? params.request : (params as AIAssistantRequest);
    const config = 'config' in params ? params.config : (params as any).config;
    const startTimeParam = 'startTime' in params ? params.startTime : (params as any).startTime;
    const handle = getGeminiClient();
    const client = handle.requireClient('smart-entry-voice-parse');
    const primaryModel = this.getMultimodalModelName();
    const fallbackModel = this.getMultimodalFallbackModelName();
    const audio = request.audio;

    if (!audio) {
      return {
        requestId: createClientId(),
        status: 'failed',
        errorMessage: 'Voice audio is required for voice entry.',
        errorCategory: 'invalid_input',
        durationMs: 0,
        providerUsed: 'gemini',
        modelUsed: primaryModel,
        fallbackUsed: false,
        providerCallCount: 0,
      };
    }

    const displayLanguage = request.displayLanguage || request.language || 'en';
    const startTime = Number(startTimeParam) || Date.now();
    const base64Payload = String(audio.audioBase64 || '').trim();

    if (!base64Payload) {
      return {
        requestId: createClientId(),
        status: 'failed',
        errorMessage: 'Voice audio payload is empty.',
        errorCategory: 'invalid_input',
        durationMs: Date.now() - startTime,
        providerUsed: 'gemini',
        modelUsed: primaryModel,
        fallbackUsed: false,
        providerCallCount: 0,
      };
    }

    const b64Valid = /^[A-Za-z0-9+/=]+$/.test(base64Payload.replace(/\s+/g, ''));
    if (!b64Valid) {
      return {
        requestId: createClientId(),
        status: 'failed',
        errorMessage: 'Voice audio payload is not valid base64.',
        errorCategory: 'invalid_input',
        durationMs: Date.now() - startTime,
        providerUsed: 'gemini',
        modelUsed: primaryModel,
        fallbackUsed: false,
        providerCallCount: 0,
      };
    }

    const rawBuf = Buffer.from(base64Payload, 'base64');
    const normalizedMime = normalizeVoiceAudioMimeType(audio.mimeType || '');
    const VALID_INLINE_AUDIO_MIMES = new Set(['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/aac', 'audio/ogg']);
    const VALID_FILES_API_AUDIO_MIMES = new Set(['audio/mp4', 'audio/m4a', 'audio/x-m4a']);
    let effectiveMime: string;
    let useFilesApi = false;

    if (normalizedMime === 'audio/wav' || normalizedMime === 'audio/x-wav') {
      effectiveMime = 'audio/wav';
    } else if (normalizedMime === 'audio/mpeg' || normalizedMime === 'audio/mp3') {
      effectiveMime = 'audio/mpeg';
    } else if (normalizedMime === 'audio/flac') {
      effectiveMime = 'audio/flac';
    } else if (normalizedMime === 'audio/aac') {
      effectiveMime = 'audio/aac';
    } else if (normalizedMime === 'audio/ogg' || normalizedMime === 'audio/ogg;codecs=opus') {
      effectiveMime = 'audio/ogg';
    } else if (normalizedMime.startsWith('audio/mp4') || normalizedMime === 'audio/m4a' || normalizedMime === 'audio/x-m4a') {
      effectiveMime = 'audio/mp4';
      useFilesApi = true;
    } else {
      return {
        requestId: createClientId(),
        status: 'failed',
        errorMessage: `Unsupported audio mime type: ${audio.mimeType || 'unknown'}`,
        errorCategory: 'invalid_input',
        durationMs: Date.now() - startTime,
        providerUsed: 'gemini',
        modelUsed: primaryModel,
        fallbackUsed: false,
        providerCallCount: 0,
      };
    }

    if (!useFilesApi && rawBuf.length < 44) {
      return {
        requestId: createClientId(),
        status: 'failed',
        errorMessage: 'Voice audio payload is too small or empty after decoding.',
        errorCategory: 'invalid_input',
        durationMs: Date.now() - startTime,
        providerUsed: 'gemini',
        modelUsed: primaryModel,
        fallbackUsed: false,
        providerCallCount: 0,
      };
    }
    if (useFilesApi && rawBuf.length < 512) {
      return {
        requestId: createClientId(),
        status: 'failed',
        errorMessage: 'Voice audio payload is too small or empty after decoding.',
        errorCategory: 'invalid_input',
        durationMs: Date.now() - startTime,
        providerUsed: 'gemini',
        modelUsed: primaryModel,
        fallbackUsed: false,
        providerCallCount: 0,
      };
    }

    const cfg = getAIConfig();
    const requestTimeoutMs = cfg.runtime.voiceRequestTimeoutMs;

    type AttemptResult = {
      success: boolean;
      response?: Awaited<ReturnType<typeof processSinglePassVoiceRequest>>;
      errorCategory?: MultimodalFallbackCategory;
      errorMessage?: string;
      finalModel: string;
    };

    const runAttempt = async (attemptModel: string): Promise<AttemptResult> => {
      let voiceFileUri: string | null = null;
      const tryDeleteVoiceFile = async () => {
        if (!voiceFileUri) return;
        try {
          const anyClient = client as any;
          if (anyClient && typeof anyClient.files === 'object' && anyClient.files && typeof anyClient.files.delete === 'function') {
            await anyClient.files.delete(voiceFileUri, { abortSignal: AbortSignal.timeout(4000) });
          }
        } catch (_vd) { /* swallow */ }
        voiceFileUri = null;
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
      try {
        const parts: any[] = [{ text: buildVoiceSinglePassUserMessage(request) }];
        if (useFilesApi) {
          const ab = new ArrayBuffer(rawBuf.length);
          const view = new Uint8Array(ab);
          for (let i = 0; i < rawBuf.length; i++) view[i] = rawBuf[i];
          const audioBytes = view as Uint8Array<ArrayBuffer>;
          const uploaded: any = await client.files.upload({
            file: new Blob([audioBytes], { type: effectiveMime }),
            config: {
              mimeType: effectiveMime,
              abortSignal: controller.signal,
            },
          });
          if (!uploaded?.uri) throw new Error('Gemini voice file upload returned no URI');
          voiceFileUri = String(uploaded.uri);
          const uploadPollMaxMs = Math.min(requestTimeoutMs - 6000, 12000);
          const uploadPollDeadline = Date.now() + Math.max(2000, uploadPollMaxMs);
          let lastState: string | null = null;
          while (Date.now() < uploadPollDeadline && !controller.signal.aborted) {
            try {
              const getFn = (client as any)?.files?.get;
              if (typeof getFn === 'function') {
                const got = await getFn(voiceFileUri, { abortSignal: AbortSignal.timeout(2500) });
                const st = got && (got.state || got.status || got.processingState);
                lastState = st ? String(st).toUpperCase() : null;
                if (isFilesApiStateReady(lastState)) break;
                if (isFilesApiStateFailed(lastState)) throw new Error(`Voice audio processing failed (state=${lastState})`);
              } else break;
            } catch (_vp) {
              if (String(_vp instanceof Error ? _vp.message : String(_vp)).includes('processing failed')) throw _vp;
            }
            await new Promise<void>((r) => setTimeout(r, 400));
          }
          if (!isFilesApiStateReady(lastState) && !isFilesApiStateFailed(lastState)) {
            throw new Error(`Voice audio processing timed out during upload polling (last state=${lastState || 'unknown'})`);
          }
          if (isFilesApiStateFailed(lastState)) {
            throw new Error(`Voice audio processing failed (state=${lastState})`);
          }
          parts.push({ fileData: { mimeType: effectiveMime, fileUri: voiceFileUri } });
        } else {
          parts.push({
            inlineData: {
              mimeType: effectiveMime,
              data: base64Payload,
            },
          });
        }

        const result = await client.models.generateContent({
          model: attemptModel,
          contents: [
            {
              role: 'user',
              parts,
            },
          ],
          config: {
            systemInstruction: {
              role: 'system',
              parts: [{ text: buildVoiceSinglePassSystemPrompt(displayLanguage) }],
            },
            temperature: 0,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json',
            responseJsonSchema: VOICE_SMART_ENTRY_RESPONSE_JSON_SCHEMA,
            candidateCount: 1,
            abortSignal: controller.signal,
          },
        });

        const voiceFinishReason = this.getFinishReason(result);
        const voiceSafetyBlock = this.getSafetyBlockReason(result);
        if (voiceSafetyBlock) {
          throw new Error(`Gemini voice parse blocked by safety (prompt): ${String(voiceSafetyBlock)}`);
        }
        if (voiceFinishReason && ['SAFETY', 'RECITATION'].includes(String(voiceFinishReason).toUpperCase())) {
          throw new Error(`Gemini voice parse blocked by finish reason: ${String(voiceFinishReason)}`);
        }

        let rawText = '';
        try {
          rawText = this.extractCandidateText(result);
        } catch (extractErr) {
          throw new Error(extractErr instanceof Error ? extractErr.message : 'Gemini voice response extract failed');
        }
        const normalizedText = stripTranscriptFormatting(rawText.trim());
        if (!normalizedText) {
          const extra = voiceFinishReason ? ` (finishReason=${String(voiceFinishReason)})` : '';
          throw new Error('Empty response from Gemini voice parse' + extra);
        }

        if (process.env.DEBUG_GEMINI_RAW === '1') {
          logTransactionDocumentGateway('info', 'gemini.voice_raw', {
            requestId: request.idempotencyKey || request.userId || null,
            rawHead: normalizedText.slice(0, 1200),
            model: attemptModel,
          });
        }

        const parsedPayload = safeParseJSON(normalizedText);
        if (!parsedPayload) {
          const snippet = normalizedText.slice(0, 200).replace(/\s+/g, ' ').trim();
          throw new Error(`Invalid JSON from Gemini voice parse: ${snippet || '(empty)'}`);
        }

        const arrayNormalizedPayload = normalizeParsedOptionalArrays(parsedPayload);
        const voiceFields = extractVoiceStructuredFields(arrayNormalizedPayload);
        const fallbackReqId = request.idempotencyKey || createClientId();
        const defaultCurrency = request.context?.defaultCurrency;
        const normalizedParsed = normalizeParsedInstructionDefaults(
          arrayNormalizedPayload,
          fallbackReqId,
          displayLanguage || request.language || request.locale || 'en',
          defaultCurrency || undefined,
        );

        try {
          const validated = validateParsedInstruction(normalizedParsed);
          const transcript = voiceFields.transcript || (validated as any).transcript || voiceFields.originalTranscript;
          const originalTranscript = voiceFields.originalTranscript || transcript;
          return {
            success: true,
            finalModel: attemptModel,
            response: {
              requestId: validated.requestId,
              status: 'parsed',
              parsed: {
                ...validated,
                transcript,
                originalTranscript,
                detectedLanguage: voiceFields.detectedLanguage || validated.language,
                translationApplied: voiceFields.translationApplied || (Boolean(transcript) && Boolean(originalTranscript) && transcript !== originalTranscript),
                translationFailed: voiceFields.translationFailed,
                providerUsed: 'gemini',
                modelUsed: attemptModel,
                fallbackUsed: false,
              },
              transcript,
              originalTranscript,
              detectedLanguage: voiceFields.detectedLanguage || validated.language,
              providerUsed: 'gemini',
              modelUsed: attemptModel,
              fallbackUsed: false,
              durationMs: Date.now() - startTime,
              providerCallCount: 1,
            },
          };
        } catch (validationError) {
          const errCat = classifyMultimodalError(validationError);
          return {
            success: false,
            finalModel: attemptModel,
            errorCategory: 'invalid_response',
            errorMessage: sanitizeError(validationError instanceof Error ? validationError.message : 'Invalid structured voice response'),
            response: {
              requestId: createClientId(),
              status: 'failed',
              transcript: voiceFields.transcript || voiceFields.originalTranscript,
              originalTranscript: voiceFields.originalTranscript || voiceFields.transcript,
              detectedLanguage: voiceFields.detectedLanguage,
              errorMessage: sanitizeError(validationError instanceof Error ? validationError.message : 'Invalid structured voice response'),
              errorCategory: 'invalid_response',
              providerUsed: 'gemini',
              modelUsed: attemptModel,
              fallbackUsed: false,
              durationMs: Date.now() - startTime,
              providerCallCount: 1,
            },
          };
        }
      } catch (err) {
        const cat = classifyMultimodalError(err);
        return {
          success: false,
          finalModel: attemptModel,
          errorCategory: cat,
          errorMessage: err instanceof Error ? err.message : String(err || 'Unknown voice error'),
        };
      } finally {
        clearTimeout(timer);
        void tryDeleteVoiceFile();
      }
    };

    let providerCallCount = 0;
    let finalModel = primaryModel;
    let fallbackUsed = false;

    const primaryAttempt = await runAttempt(primaryModel);
    providerCallCount++;

    if (primaryAttempt.success && primaryAttempt.response) {
      return {
        ...primaryAttempt.response,
        primaryModel,
        finalModel: primaryModel,
        modelUsed: primaryModel,
        fallbackUsed: false,
        parsed: primaryAttempt.response.parsed ? { ...primaryAttempt.response.parsed, primaryModel, finalModel: primaryModel, modelUsed: primaryModel, fallbackUsed: false } : primaryAttempt.response.parsed,
        providerCallCount,
      };
    }

    const shouldFallback = !primaryAttempt.success && isMultimodalFallbackRetryable(primaryAttempt.errorCategory || 'other');
    if (shouldFallback) {
      const fallbackAttempt = await runAttempt(fallbackModel);
      providerCallCount++;
      finalModel = fallbackModel;
      fallbackUsed = true;

      if (fallbackAttempt.success && fallbackAttempt.response) {
        return {
          ...fallbackAttempt.response,
          primaryModel,
          finalModel: fallbackModel,
          modelUsed: fallbackModel,
          fallbackUsed: true,
          parsed: fallbackAttempt.response.parsed ? { ...fallbackAttempt.response.parsed, primaryModel, finalModel: fallbackModel, modelUsed: fallbackModel, fallbackUsed: true } : fallbackAttempt.response.parsed,
          providerCallCount,
        };
      }

      const lastCategory = fallbackAttempt.errorCategory || primaryAttempt.errorCategory || 'other';
      const lastMessage = fallbackAttempt.errorMessage || primaryAttempt.errorMessage || 'Gemini voice parse failed after fallback exhausted.';
      let errorCategory: string = lastCategory === 'request_timeout' ? 'gemini_request_timeout'
        : lastCategory === 'rate_limited' ? 'gemini_rate_limited'
        : lastCategory === 'provider_unavailable' ? 'gemini_provider_unavailable'
        : lastCategory === 'auth_failed' ? 'gemini_auth_failed'
        : lastCategory === 'safety_blocked' ? 'safety_blocked'
        : lastCategory === 'invalid_input' ? 'invalid_input'
        : lastCategory === 'invalid_response' ? 'invalid_response'
        : 'gemini_provider_unavailable';
      return {
        requestId: createClientId(),
        status: 'failed',
        errorMessage: sanitizeError(lastMessage),
        errorCategory,
        providerUsed: 'gemini',
        primaryModel,
        finalModel: fallbackModel,
        modelUsed: fallbackModel,
        fallbackUsed: true,
        durationMs: Date.now() - startTime,
        providerCallCount,
      };
    }

    const lastCategory = primaryAttempt.errorCategory || 'other';
    const lastMessage = primaryAttempt.errorMessage || 'Gemini voice parse failed.';
    let errorCategory: string = lastCategory === 'request_timeout' ? 'gemini_request_timeout'
      : lastCategory === 'rate_limited' ? 'gemini_rate_limited'
      : lastCategory === 'provider_unavailable' ? 'gemini_provider_unavailable'
      : lastCategory === 'auth_failed' ? 'gemini_auth_failed'
      : lastCategory === 'safety_blocked' ? 'safety_blocked'
      : lastCategory === 'invalid_input' ? 'invalid_input'
      : lastCategory === 'invalid_response' ? 'invalid_response'
      : 'gemini_provider_unavailable';
    return {
      requestId: createClientId(),
      status: 'failed',
      errorMessage: sanitizeError(lastMessage),
      errorCategory,
      providerUsed: 'gemini',
      primaryModel,
      finalModel: primaryModel,
      modelUsed: primaryModel,
      fallbackUsed: false,
      durationMs: Date.now() - startTime,
      providerCallCount,
    };
  }

  async parseTransactionDocument(
    input: TransactionDocumentAIRequest,
  ): Promise<{
    parsed: unknown;
    providerUsed: string;
    modelUsed?: string;
    primaryModel?: string;
    finalModel?: string;
    fallbackUsed?: boolean;
    rawOutput?: unknown;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    estimatedCostUsd?: number | null;
  }> {
    const handle = getGeminiClient();
    const client = handle.requireClient('smart-entry-document-parse');
    const primaryModel = this.getMultimodalModelName();
    const fallbackModel = this.getMultimodalFallbackModelName();

    const cfg = getAIConfig();
    const timeoutMs = cfg.runtime.documentRequestTimeoutMs;

    type DocAttemptResult = {
      success: boolean;
      parsed?: unknown;
      rawOutput?: unknown;
      errorCategory?: MultimodalFallbackCategory;
      errorCode?: TransactionDocumentErrorCode;
      errorMessage?: string;
      stage?: string;
      finalModel: string;
    };

    const normalizeResolvedUrl = async (startModel: string): Promise<{ url: string; mime: string }> => {
      const normalizedMime = (input.fileMimeType || '').trim().toLowerCase();
      let resolvedFileUrl: string = input.fileUrl || '';
      if (resolvedFileUrl && /^https?:\/\//i.test(resolvedFileUrl)) {
        logTransactionDocumentGateway('info', 'gemini.remote_fetch.start', {
          requestId: input.requestId || null,
          fileMimeType: normalizedMime,
        });
        try {
          const remoteResp = await fetch(resolvedFileUrl, {
            signal: AbortSignal.timeout(Math.min(timeoutMs - 8000, 25000)),
          });
          if (!remoteResp.ok) {
            throw new Error(`Remote download HTTP ${remoteResp.status}`);
          }
          const remoteAb = await remoteResp.arrayBuffer();
          const remoteBuf = Buffer.from(remoteAb);
          if (!remoteBuf || remoteBuf.length < 16) {
            throw new Error(`Remote download returned empty payload (${remoteBuf?.length || 0} B)`);
          }
          const mimeFromResp = remoteResp.headers.get('content-type') || normalizedMime;
          const resolvedMime = mimeFromResp && /^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*/i.test(mimeFromResp.split(';')[0].trim())
            ? mimeFromResp.split(';')[0].trim()
            : normalizedMime;
          const b64 = remoteBuf.toString('base64');
          resolvedFileUrl = `data:${resolvedMime};base64,${b64}`;
          logTransactionDocumentGateway('info', 'gemini.remote_fetch.success', {
            requestId: input.requestId || null,
            fileMimeType: resolvedMime,
            bytes: remoteBuf.length,
          });
          return { url: resolvedFileUrl, mime: resolvedMime };
        } catch (remoteErr) {
          throw new TransactionDocumentGatewayError(
            'invalid_document', 'gemini.remote_fetch',
            `Failed to download document from remote URL: ${remoteErr instanceof Error ? remoteErr.message : String(remoteErr)}`,
            { providerUsed: 'gemini', modelUsed: startModel },
          );
        }
      }
      return { url: resolvedFileUrl, mime: normalizedMime };
    };

    const runDocAttempt = async (attemptModel: string): Promise<DocAttemptResult> => {
      let uploadedFileUri: string | null = null;
      let uploadedFileName: string | null = null;
      const tryDeleteUpload = async () => {
        if (!uploadedFileUri) return;
        try {
          const anyClient = client as any;
          if (anyClient && typeof anyClient.files === 'object' && anyClient.files && typeof anyClient.files.delete === 'function') {
            await anyClient.files.delete(uploadedFileUri, { abortSignal: AbortSignal.timeout(4000) });
            logTransactionDocumentGateway('info', 'gemini.file.delete', {
              requestId: input.requestId || null,
              fileUri: uploadedFileUri,
            });
          }
        } catch (_delErr) {
          /* swallow - cleanup is best-effort */
        }
        uploadedFileUri = null;
        uploadedFileName = null;
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      logTransactionDocumentGateway('info', 'gemini.request.start', {
        requestId: input.requestId || null,
        model: attemptModel,
        fileMimeType: input.fileMimeType,
        pageCount: input.pageCount ?? null,
        timeoutMs,
      });
      try {
        const { url: resolvedFileUrl, mime: startMime } = await normalizeResolvedUrl(attemptModel);
        const normalizedMime = startMime || (input.fileMimeType || '').trim().toLowerCase();
        let filePart: any;
        if (normalizedMime === 'application/pdf') {
          const pdfBuf = dataUrlToBuffer(resolvedFileUrl);
          if (!pdfBuf || pdfBuf.length < 16) {
            throw new TransactionDocumentGatewayError(
              'invalid_document', 'gemini.upload', 'Empty or invalid PDF document payload',
              { providerUsed: 'gemini', modelUsed: attemptModel },
            );
          }
          const pdfHeader = pdfBuf.slice(0, 8).toString('latin1');
          if (!pdfHeader.startsWith('%PDF-')) {
            throw new TransactionDocumentGatewayError(
              'invalid_document', 'gemini.upload', 'File is not a valid PDF (missing %PDF- header)',
              { providerUsed: 'gemini', modelUsed: attemptModel },
            );
          }
          const ab = new ArrayBuffer(pdfBuf.length);
          const view = new Uint8Array(ab);
          for (let i = 0; i < pdfBuf.length; i++) view[i] = pdfBuf[i];
          const pdfBytes = view as Uint8Array<ArrayBuffer>;
          uploadedFileName = `doc_${input.requestId || createClientId()}.pdf`;
          const uploaded: any = await client.files.upload({
            file: new Blob([pdfBytes], { type: 'application/pdf' }),
            config: {
              mimeType: 'application/pdf',
              displayName: uploadedFileName,
              abortSignal: controller.signal,
            },
          });
          if (!uploaded?.uri) throw new TransactionDocumentGatewayError(
            'provider_unavailable', 'gemini.upload', 'Gemini file upload returned no URI',
            { providerUsed: 'gemini', modelUsed: attemptModel },
          );
          uploadedFileUri = String(uploaded.uri);
          const maxPollMs = Math.min(timeoutMs - 10000, 25000);
          const pollingDeadlineMs = Date.now() + Math.max(3000, maxPollMs);
          const pollingStart = Date.now();
          let finalState: string | null = null;
          let lastPolled: any = null;
          let pollCount = 0;
          while (Date.now() < pollingDeadlineMs && !controller.signal.aborted) {
            pollCount++;
            try {
              const getFn = (client as any)?.files?.get;
              if (typeof getFn === 'function') {
                lastPolled = await getFn(uploadedFileUri, { abortSignal: AbortSignal.timeout(2500) });
                const state = lastPolled && (lastPolled.state || lastPolled.status || lastPolled.processingState);
                finalState = state ? String(state).toUpperCase() : null;
                if (isFilesApiStateReady(finalState)) break;
                if (isFilesApiStateFailed(finalState)) break;
              } else {
                finalState = 'ACTIVE';
                break;
              }
            } catch (_pollErr) {
              /* ignore transient poll errors */
            }
            await new Promise<void>((r) => setTimeout(r, 500));
          }
          if (isFilesApiStateFailed(finalState)) {
            throw new TransactionDocumentGatewayError(
              'provider_unavailable', 'gemini.upload',
              `Gemini file processing failed (state=${finalState})`,
              { providerUsed: 'gemini', modelUsed: attemptModel },
            );
          }
          if (!isFilesApiStateReady(finalState)) {
            throw new TransactionDocumentGatewayError(
              'provider_unavailable', 'gemini.upload',
              `Gemini file processing not ready after polling (last state=${finalState || 'unknown'})`,
              { providerUsed: 'gemini', modelUsed: attemptModel },
            );
          }
          filePart = {
            fileData: {
              mimeType: 'application/pdf',
              fileUri: uploadedFileUri,
            },
          };
          logTransactionDocumentGateway('info', 'gemini.file.uploaded', {
            requestId: input.requestId || null,
            fileUri: uploadedFileUri,
            state: finalState || 'unknown',
            pollingMs: Date.now() - pollingStart,
            pollCount,
          });
        } else {
          const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif']);
          const { data, mimeType } = dataUrlToInline(resolvedFileUrl, normalizedMime || 'application/octet-stream');
          const actualMime = (mimeType || normalizedMime || '').trim().toLowerCase();
          if (!IMAGE_MIMES.has(actualMime)) {
            throw new TransactionDocumentGatewayError(
              'invalid_document', 'gemini.inline',
              `Unsupported image MIME type: ${actualMime || '(empty)'}. Supported: image/png, image/jpeg, image/webp, image/heic`,
              { providerUsed: 'gemini', modelUsed: attemptModel },
            );
          }
          if (!data || !/^[A-Za-z0-9+/=]+$/.test(String(data).replace(/\s+/g, ''))) {
            throw new TransactionDocumentGatewayError(
              'invalid_document', 'gemini.inline',
              'Image payload is missing or not valid base64',
              { providerUsed: 'gemini', modelUsed: attemptModel },
            );
          }
          const stripped = String(data).replace(/\s+/g, '');
          if (stripped.length < 32 || stripped.length % 4 !== 0) {
            throw new TransactionDocumentGatewayError(
              'invalid_document', 'gemini.inline',
              `Image payload has invalid base64 length=${stripped.length}`,
              { providerUsed: 'gemini', modelUsed: attemptModel },
            );
          }
          filePart = { inlineData: { mimeType: actualMime, data: stripped } };
        }

        const userText = buildTransactionDocumentUserMessage(input);
        const result = await client.models.generateContent({
          model: attemptModel,
          contents: [
            {
              role: 'user',
              parts: [
                { text: userText },
                filePart,
              ],
            },
          ],
          config: {
            systemInstruction: {
              role: 'system',
              parts: [{ text: TRANSACTION_DOCUMENT_SYSTEM_PROMPT }],
            },
            temperature: 0,
            maxOutputTokens: getTransactionDocumentMaxTokens(normalizedMime || input.fileMimeType),
            responseMimeType: 'application/json',
            responseJsonSchema: TRANSACTION_DOCUMENT_RESPONSE_JSON_SCHEMA,
            candidateCount: 1,
            abortSignal: controller.signal,
          },
        });
        const docFinish = this.getFinishReason(result);
        const docSafety = this.getSafetyBlockReason(result);
        if (docSafety) {
          throw new TransactionDocumentGatewayError(
            'safety_blocked', 'gemini.parse',
            `Gemini document parse blocked by safety: ${String(docSafety)}`,
            { providerUsed: 'gemini', modelUsed: attemptModel },
          );
        }
        if (docFinish && ['SAFETY', 'RECITATION'].includes(String(docFinish).toUpperCase())) {
          throw new TransactionDocumentGatewayError(
            'safety_blocked', 'gemini.parse',
            `Gemini document parse blocked by finish reason: ${String(docFinish)}`,
            { providerUsed: 'gemini', modelUsed: attemptModel },
          );
        }
        let raw = '';
        try {
          raw = this.extractCandidateText(result);
        } catch (extractErr) {
          throw new TransactionDocumentGatewayError(
            'invalid_ai_json_response', 'gemini.parse',
            extractErr instanceof Error ? extractErr.message : 'Gemini candidate extract failed',
            { providerUsed: 'gemini', modelUsed: attemptModel, rawOutput: result },
          );
        }
        if (!raw) {
          const extra = docFinish ? ` (finishReason=${String(docFinish)})` : '';
          throw new TransactionDocumentGatewayError(
            'invalid_ai_json_response', 'gemini.parse',
            'Empty response from Gemini document parse' + extra,
            { providerUsed: 'gemini', modelUsed: attemptModel, rawOutput: result },
          );
        }
        if (process.env.DEBUG_GEMINI_RAW === '1') {
          logTransactionDocumentGateway('info', 'gemini.doc_raw', {
            requestId: input.requestId || null,
            mime: input.fileMimeType || null,
            rawHead: raw.slice(0, 1600),
            finishReason: docFinish || null,
            model: attemptModel,
          });
        }
        const prepared = extractTransactionDocumentContentText(raw);
        const parsed = safeParseJSON(prepared);
        if (!parsed) {
          const snippet = prepared.slice(0, 200).replace(/\s+/g, ' ').trim();
          throw new TransactionDocumentGatewayError(
            'invalid_ai_json_response', 'gemini.parse',
            `Invalid JSON from Gemini document parse: ${snippet || '(empty)'}`,
            { providerUsed: 'gemini', modelUsed: attemptModel, rawOutput: raw },
          );
        }
        try {
          const safeNormalized = normalizeDocumentExtractionOptionalArrays(parsed);
          validateTransactionDocumentExtraction(safeNormalized);
        } catch (_ve) {
          throw new TransactionDocumentGatewayError(
            'invalid_ai_json_response', 'gemini.parse',
            _ve instanceof Error ? _ve.message : 'Invalid structured document response',
            { providerUsed: 'gemini', modelUsed: attemptModel, rawOutput: parsed },
          );
        }
        logTransactionDocumentGateway('info', 'gemini.parse.success', {
          requestId: input.requestId || null,
          model: attemptModel,
        });
        return {
          success: true,
          finalModel: attemptModel,
          parsed,
          rawOutput: result,
        };
      } catch (error) {
        const cat = classifyMultimodalError(error);
        if (error instanceof TransactionDocumentGatewayError) {
          return {
            success: false,
            finalModel: attemptModel,
            errorCategory: cat,
            errorCode: error.code,
            errorMessage: error.message,
            stage: error.stage,
          };
        }
        const errorMessage = error instanceof Error ? error.message : String(error || '');
        return {
          success: false,
          finalModel: attemptModel,
          errorCategory: cat,
          errorMessage,
          stage: 'gemini.request',
        };
      } finally {
        clearTimeout(timer);
        void tryDeleteUpload();
      }
    };

    let finalModel = primaryModel;
    let fallbackUsed = false;

    const primaryRes = await runDocAttempt(primaryModel);
    if (primaryRes.success) {
      return {
        parsed: primaryRes.parsed,
        providerUsed: 'gemini',
        modelUsed: primaryModel,
        primaryModel,
        finalModel: primaryModel,
        fallbackUsed: false,
        rawOutput: primaryRes.rawOutput,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        estimatedCostUsd: null,
      };
    }

    const shouldFallback = !primaryRes.success && isMultimodalFallbackRetryable(primaryRes.errorCategory || 'other');
    if (shouldFallback) {
      finalModel = fallbackModel;
      fallbackUsed = true;
      const fallbackRes = await runDocAttempt(fallbackModel);
      if (fallbackRes.success) {
        return {
          parsed: fallbackRes.parsed,
          providerUsed: 'gemini',
          modelUsed: fallbackModel,
          primaryModel,
          finalModel: fallbackModel,
          fallbackUsed: true,
          rawOutput: fallbackRes.rawOutput,
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedCostUsd: null,
        };
      }

      const lastCat = fallbackRes.errorCategory || primaryRes.errorCategory || 'other';
      const lastErr = fallbackRes;
      logTransactionDocumentGateway('error', 'gemini.request.failed.fallback_exhausted', {
        requestId: input.requestId || null,
        primaryModel,
        finalModel: fallbackModel,
        fallbackUsed: true,
        code: lastErr.errorCode || (
          lastCat === 'auth_failed' ? 'gemini_auth_failed'
          : lastCat === 'request_timeout' ? 'gemini_request_timeout'
          : lastCat === 'rate_limited' ? 'gemini_rate_limited'
          : lastCat === 'provider_unavailable' ? 'gemini_provider_unavailable'
          : lastCat === 'invalid_input' ? 'invalid_document'
          : lastCat === 'invalid_response' ? 'invalid_ai_json_response'
          : 'gemini_provider_unavailable'
        ),
        providerError: sanitizeError(lastErr.errorMessage || 'Unknown document error after fallback exhausted.') || null,
      });
      const isTimeout = lastCat === 'request_timeout';
      const isAuth = lastCat === 'auth_failed';
      const code: TransactionDocumentErrorCode = lastErr.errorCode || (
        isAuth ? 'gemini_auth_failed'
        : isTimeout ? 'gemini_request_timeout'
        : lastCat === 'rate_limited' ? 'gemini_rate_limited'
        : lastCat === 'provider_unavailable' ? 'gemini_provider_unavailable'
        : lastCat === 'invalid_response' ? 'invalid_ai_json_response'
        : lastCat === 'safety_blocked' ? 'safety_blocked'
        : 'invalid_document'
      );
      throw new TransactionDocumentGatewayError(
        code,
        lastErr.stage || 'gemini.request',
        isTimeout ? 'Gemini document request timed out after primary + fallback attempts.' : `Gemini document request failed (fallback exhausted): ${sanitizeError(lastErr.errorMessage || '')}`,
        { providerUsed: 'gemini', modelUsed: fallbackModel },
      );
    }

    logTransactionDocumentGateway('error', 'gemini.request.failed', {
      requestId: input.requestId || null,
      model: primaryModel,
      primaryModel,
      finalModel: primaryModel,
      fallbackUsed: false,
      code: primaryRes.errorCode || (
        primaryRes.errorCategory === 'auth_failed' ? 'gemini_auth_failed'
        : primaryRes.errorCategory === 'request_timeout' ? 'gemini_request_timeout'
        : primaryRes.errorCategory === 'rate_limited' ? 'gemini_rate_limited'
        : primaryRes.errorCategory === 'provider_unavailable' ? 'gemini_provider_unavailable'
        : primaryRes.errorCategory === 'invalid_response' ? 'invalid_ai_json_response'
        : 'gemini_provider_unavailable'
      ),
      providerError: sanitizeError(primaryRes.errorMessage || 'Unknown document error.') || null,
    });
    if (primaryRes.errorCode) {
      throw new TransactionDocumentGatewayError(
        primaryRes.errorCode,
        primaryRes.stage || 'gemini.request',
        primaryRes.errorMessage || 'Document parse failed.',
        { providerUsed: 'gemini', modelUsed: primaryModel },
      );
    }
    const isTimeout = primaryRes.errorCategory === 'request_timeout';
    const isAuth = primaryRes.errorCategory === 'auth_failed';
    const code: TransactionDocumentErrorCode =
      isAuth ? 'gemini_auth_failed'
      : isTimeout ? 'gemini_request_timeout'
      : primaryRes.errorCategory === 'rate_limited' ? 'gemini_rate_limited'
      : primaryRes.errorCategory === 'provider_unavailable' ? 'gemini_provider_unavailable'
      : primaryRes.errorCategory === 'safety_blocked' ? 'safety_blocked'
      : primaryRes.errorCategory === 'invalid_response' ? 'invalid_ai_json_response'
      : 'invalid_document';
    throw new TransactionDocumentGatewayError(
      code,
      primaryRes.stage || 'gemini.request',
      isTimeout ? 'Gemini document request timed out' : `Gemini document request failed: ${sanitizeError(primaryRes.errorMessage || '')}`,
      { providerUsed: 'gemini', modelUsed: primaryModel },
    );
  }

  async healthCheck(): Promise<ProviderHealthResult> {
    const handle = getGeminiClient();
    if (!handle.configured || !handle.apiKeyPresent) {
      return { provider: 'gemini', status: 'not_configured', checkedAt: new Date().toISOString(), errorCategory: 'gemini_not_configured' };
    }
    const start = Date.now();
    try {
      const client = handle.requireClient('health-check');
      const model = handle.getModels().fast;
      const timeout = AbortSignal.timeout(Math.min(this.timeoutMs, 8000));
      await client.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        config: { temperature: 0, maxOutputTokens: 1, candidateCount: 1, abortSignal: timeout },
      });
      return {
        provider: 'gemini',
        status: 'healthy',
        responseTimeMs: Date.now() - start,
        modelUsed: model,
        checkedAt: new Date().toISOString(),
      };
    } catch (err) {
      const errAny = err as any;
      const msg = errAny && errAny.message ? String(errAny.message) : String(err || '');
      let httpStatus: number | null = null;
      const m = msg.match(/\b(4[0-9]{2}|5[0-9]{2})\b/);
      if (m) httpStatus = parseInt(m[1], 10);
      let errorCategory: string = 'gemini_provider_unavailable';
      let status: ProviderHealthResult['status'] = 'offline';
      if (/\b(401|403|UNAUTHENTICATED|PERMISSION_DENIED|invalid authentication credentials|API key not valid)\b/i.test(msg)) {
        errorCategory = 'gemini_auth_failed';
      } else if (/\b(429|too many requests|rate limit|quota exceeded|RESOURCE_EXHAUSTED|resource exhausted)\b/i.test(msg) || httpStatus === 429) {
        errorCategory = 'gemini_rate_limited';
      } else if (/\b(503|UNAVAILABLE|high demand|service unavailable|unavailable)\b/i.test(msg) || httpStatus === 503) {
        errorCategory = 'gemini_provider_unavailable';
      } else if (/\b(timeout|timed out|DEADLINE_EXCEEDED|AbortError|TimeoutError|aborted|operation was aborted)\b/i.test(msg)) {
        errorCategory = 'gemini_request_timeout';
      }
      const safeLines = msg.split(/\r?\n/).slice(0, 3).map(l => l.slice(0, 200));
      const sanitized = safeLines.join(' | ').replace(/(Bearer|Authorization|api[_-]?key|google[_-]?api[_-]?key)[^,;\n]*/gi, '[REDACTED]');
      try {
        const safe = {
          scope: 'text.health.diagnostic',
          provider: 'gemini',
          status,
          errorCategory,
          httpStatus: httpStatus ?? null,
          responseTimeMs: Date.now() - start,
          model: handle.getModels().fast,
          sanitized,
        };
        if (process.env.NODE_ENV !== 'production') console.info('[text.health.diagnostic]', safe);
        else console.info('[text.health.diagnostic]', JSON.stringify(safe));
      } catch { /* logging never throws */ }
      return {
        provider: 'gemini',
        status,
        responseTimeMs: Date.now() - start,
        errorCategory,
        checkedAt: new Date().toISOString(),
      };
    }
  }
}

// ─── Provider Factory ─────────────────────────────────────────────────────────

export function createLanguageProvider(name: string, timeoutMs: number): LanguageProvider {
  switch (name) {
    case 'gemini':     return new GeminiLanguageProvider(timeoutMs);
    case 'openrouter': return new OpenRouterLanguageProvider(timeoutMs);
    case 'vps_ai':     return new VPSLanguageProvider(timeoutMs);
    case 'mock':
      if (isMockAllowed()) return new MockLanguageProvider();
      throw new Error('Mock provider is not available in production mode');
    default:
      if (isMockAllowed()) return new MockLanguageProvider();
      throw new Error(`Unknown language provider: ${name}. AI is not configured.`);
  }
}

export function createSpeechProvider(name: string, timeoutMs: number): SpeechProvider {
  switch (name) {
    case 'cloud_stt': return new CloudSTTProvider(timeoutMs);
    case 'vps_stt':   return new VPSSTTProvider(timeoutMs);
    case 'mock':
      if (isMockAllowed()) return new MockSpeechProvider();
      throw new Error('Mock provider is not available in production mode');
    default:
      if (isMockAllowed()) return new MockSpeechProvider();
      throw new Error(`Unknown speech provider: ${name}. AI is not configured.`);
  }
}

// ─── Fallback Orchestrator ────────────────────────────────────────────────────

async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
  enableFallback: boolean
): Promise<{ result: T; fallbackUsed: boolean }> {
  try {
    const result = await primary();
    return { result, fallbackUsed: false };
  } catch (primaryError) {
    if (!enableFallback) throw primaryError;
    try {
      const result = await fallback();
      return { result, fallbackUsed: true };
    } catch (fallbackError) {
      // Both failed — throw primary error (more informative)
      throw primaryError;
    }
  }
}

// ─── Main AI Gateway ──────────────────────────────────────────────────────────

export async function processAIRequest(
  request: AIAssistantRequest,
  config: AIGatewayConfig
): Promise<AIAssistantResponse> {
  const startTime = Date.now();

  if (!config.aiEnabled) {
    return {
      requestId: createClientId(),
      status: 'not_configured',
      errorMessage: 'AI is not configured yet. You can continue using manual transaction entry.',
      errorCategory: 'not_configured',
    };
  }

  // Input sanitisation
  if (request.type === 'text' && request.text) {
    if (request.text.length > config.maxTextLength) {
      return {
        requestId: createClientId(),
        status: 'failed',
        errorMessage: `Input too long. Maximum ${config.maxTextLength} characters.`,
        errorCategory: 'input_too_long',
      };
    }
  }

  try {
    if (request.type === 'voice' && request.audio) {
      const [primaryLang, fallbackLang] = getProviderOrder(config);
      const primaryProvider = createLanguageProvider(primaryLang, config.requestTimeoutMs) as any;
      const fallbackProvider = createLanguageProvider(fallbackLang, config.requestTimeoutMs) as any;
      try {
        if (typeof primaryProvider.parseVoiceSinglePass === 'function') {
          const r: AIAssistantResponse = await primaryProvider.parseVoiceSinglePass({
            request,
            config,
            startTime,
            ...request,
          });
          return r;
        }
      } catch (e) {
        if (!config.enableAutoFallback || primaryLang === fallbackLang) throw e;
      }
      if (typeof fallbackProvider.parseVoiceSinglePass === 'function') {
        const r: AIAssistantResponse = await fallbackProvider.parseVoiceSinglePass({
          request,
          config,
          startTime,
          ...request,
        });
        return { ...r, fallbackUsed: true };
      }
      return await processSinglePassVoiceRequest(request, config, startTime);
    }

    let transcript: string | undefined;
    let sttFallbackUsed = false;

    // Step 1: Transcribe audio if voice request
    if (request.type === 'voice' && request.audio) {
      let primarySTT: SpeechProvider;
      let fallbackSTT: SpeechProvider;

      try {
        primarySTT = createSpeechProvider(config.primarySttProvider, config.requestTimeoutMs);
      } catch {
        return {
          requestId: createClientId(),
          status: 'not_configured',
          errorMessage: 'AI is not configured yet. You can continue using manual transaction entry.',
          errorCategory: 'not_configured',
          durationMs: Date.now() - startTime,
        };
      }

      try {
        fallbackSTT = createSpeechProvider(config.fallbackSttProvider, config.requestTimeoutMs);
      } catch {
        // Fallback provider not configured — use primary only
        fallbackSTT = primarySTT;
      }

      const { result: sttResult, fallbackUsed } = await withFallback(
        () => primarySTT.transcribe(request.audio!),
        () => fallbackSTT.transcribe(request.audio!),
        config.enableAutoFallback
      );

      transcript = sttResult.transcript;
      sttFallbackUsed = fallbackUsed;
    }

    const textToProcess = request.type === 'voice' ? transcript : request.text;
    if (!textToProcess?.trim()) {
      return {
        requestId: createClientId(),
        status: 'failed',
        errorMessage: 'No text to process.',
        errorCategory: 'empty_input',
      };
    }

    // Step 2: Parse financial instruction
    const parseRequest: ParseRequest = {
      text: textToProcess,
      language: request.language || 'en',
      locale: request.locale || request.context?.locale,
      currentDate: request.currentDate || request.context?.currentDate,
      currentDateTime: request.currentDateTime || request.context?.currentDateTime,
      timezone: request.timezone || request.context?.timezone,
      context: request.context,
      requestId: createClientId(),
    };

    const [primaryLang, fallbackLang] = getProviderOrder(config);

    let primaryProvider: LanguageProvider;
    let fallbackProvider: LanguageProvider;

    try {
      primaryProvider = createLanguageProvider(primaryLang, config.requestTimeoutMs);
    } catch {
      return {
        requestId: createClientId(),
        status: 'not_configured',
        errorMessage: 'AI is not configured yet. You can continue using manual transaction entry.',
        errorCategory: 'not_configured',
        durationMs: Date.now() - startTime,
      };
    }

    try {
      fallbackProvider = createLanguageProvider(fallbackLang, config.requestTimeoutMs);
    } catch {
      // Fallback not configured — use primary only (will fail if primary also fails)
      fallbackProvider = primaryProvider;
    }

    const { result: parsed, fallbackUsed: langFallbackUsed } = await withFallback(
      () => primaryProvider.parseFinancialInstruction(parseRequest),
      () => fallbackProvider.parseFinancialInstruction(parseRequest),
      config.enableAutoFallback
    );

    const fallbackUsed = sttFallbackUsed || langFallbackUsed;

    return {
      requestId: parsed.requestId,
      status: 'parsed',
      parsed: {
        ...parsed,
        transcript,
        fallbackUsed,
      },
      transcript,
      providerUsed: parsed.providerUsed,
      fallbackUsed,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    let msg = error instanceof Error ? error.message : 'Unknown error';
    const msgLow = msg.toLowerCase();
    const isAuth = /\b(401|403|unauthenticated|permission_denied|invalid authentication credentials|api key not valid)\b/i.test(msg);
    const isTimeout = /\b(timeout|timed out|abort|deadline_exceeded|aborterror|timeouterror)\b/i.test(msg);
    const isGemini =
      /gemini|google|genai|generativelanguage\.googleapis\.com|@google\/genai/i.test(msg)
      || (() => {
          try {
            const order = getProviderOrder(config);
            return Array.isArray(order) && order[0] === 'gemini';
          } catch (_) { return false; }
        })();
    const errorCode: string | undefined = isAuth
      ? 'gemini_auth_failed'
      : isTimeout
        ? 'gemini_request_timeout'
        : isGemini
          ? 'gemini_provider_unavailable'
          : undefined;
    return {
      requestId: createClientId(),
      status: 'failed',
      errorMessage: sanitizeError(msg),
      errorCategory: categorizeError(msg) || (isAuth ? 'auth_error' : isTimeout ? 'timeout' : 'technical'),
      errorCode: errorCode as any,
      providerUsed: isGemini ? 'gemini' : undefined,
      modelUsed: isGemini ? (request.type === 'voice' ? getGeminiVoiceModel() : getGeminiTextModel()) : undefined,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function processTransactionDocumentAIRequest(
  request: TransactionDocumentAIRequest,
  config: AIGatewayConfig
): Promise<TransactionDocumentAIResponse> {
  const startTime = Date.now();

  if (!config.aiEnabled) {
    return {
      requestId: createClientId(),
      status: 'not_configured',
      errorMessage: 'AI is not configured yet. You can continue using manual transaction entry.',
      errorCategory: 'not_configured',
    };
  }

  const normalizedMimeType = request.fileMimeType.trim().toLowerCase();
  const requestId = request.requestId || createClientId();

  try {
    logTransactionDocumentGateway('info', 'document-ai.start', {
      requestId,
      sourceSurface: request.sourceSurface || 'unknown',
      fileName: request.fileName,
      fileMimeType: normalizedMimeType,
      pageCount: request.pageCount ?? null,
    });
    const [primaryLangRaw, fallbackLang] = getProviderOrder(config);
    const primaryLang = primaryLangRaw;
    let parseResult: {
      parsed: unknown;
      providerUsed: string;
      modelUsed?: string;
      primaryModel?: string | null;
      finalModel?: string | null;
      fallbackUsed?: boolean;
      rawOutput?: unknown;
      inputTokens?: number | null;
      outputTokens?: number | null;
      totalTokens?: number | null;
      estimatedCostUsd?: number | null;
    };
    let providerFallbackUsed = false;
    try {
      parseResult = await parseTransactionDocumentWithProvider(primaryLang, { ...request, requestId });
    } catch (primaryError) {
      if (!config.enableAutoFallback || primaryLang === fallbackLang) throw primaryError;
      parseResult = await parseTransactionDocumentWithProvider(fallbackLang, { ...request, requestId });
      providerFallbackUsed = true;
    }
    const result = parseResult;
    const modelFallbackUsed = Boolean(result.fallbackUsed);
    const anyFallbackUsed = providerFallbackUsed || modelFallbackUsed;

    logTransactionDocumentGateway('info', 'document-ai.parse_response.start', {
      requestId,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed || null,
      primaryModel: result.primaryModel ?? null,
      finalModel: result.finalModel ?? null,
      modelFallbackUsed,
      providerFallbackUsed,
      fallbackUsed: anyFallbackUsed,
    });
    let validated;
    try {
      const safeNormalized = normalizeDocumentExtractionOptionalArrays(result.parsed);
      validated = validateTransactionDocumentExtraction(safeNormalized);
    } catch (error) {
      throw new TransactionDocumentGatewayError(
        classifyTransactionDocumentError(error) || 'invalid_extraction_response',
        'document-ai.parse_response',
        error instanceof Error ? error.message : 'Document extraction response could not be validated.',
        {
          providerUsed: result.providerUsed,
          modelUsed: result.modelUsed || null,
          rawOutput: result.rawOutput,
          inputTokens: result.inputTokens ?? null,
          outputTokens: result.outputTokens ?? null,
          totalTokens: result.totalTokens ?? null,
          estimatedCostUsd: result.estimatedCostUsd ?? null,
        }
      );
    }
    logTransactionDocumentGateway('info', 'document-ai.parse_response.success', {
      requestId,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed || null,
      draftCount: validated.transactions.length,
      primaryModel: result.primaryModel ?? null,
      finalModel: result.finalModel ?? null,
      fallbackUsed: anyFallbackUsed,
      durationMs: Date.now() - startTime,
    });
    return {
      requestId: validated.requestId,
      status: 'parsed',
      parsed: {
        ...validated,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
      },
      providerUsed: result.providerUsed,
      primaryModel: result.primaryModel ?? null,
      finalModel: result.finalModel ?? null,
      modelUsed: result.finalModel ?? result.modelUsed ?? null,
      fallbackUsed: anyFallbackUsed,
      durationMs: Date.now() - startTime,
      rawOutput: result.rawOutput,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      totalTokens: result.totalTokens ?? null,
      estimatedCostUsd: result.estimatedCostUsd ?? null,
    };
  } catch (error) {
    const code = getTransactionDocumentGatewayErrorCode(error, normalizedMimeType);
    const message = getTransactionDocumentGatewaySafeMessage(code, normalizedMimeType);
    const providerErrorDetails = error instanceof TransactionDocumentGatewayError
      ? {
          providerUsed: error.providerUsed,
          modelUsed: error.modelUsed,
          rawOutput: error.rawOutput,
          inputTokens: error.inputTokens ?? null,
          outputTokens: error.outputTokens ?? null,
          totalTokens: error.totalTokens ?? null,
          estimatedCostUsd: error.estimatedCostUsd ?? null,
        }
      : null;
    logTransactionDocumentGateway('error', 'document-ai.failed', {
      requestId,
      code,
      durationMs: Date.now() - startTime,
      internalError: error instanceof Error ? sanitizeError(error.message) : 'Unknown error',
    });
    return {
      requestId,
      status: 'failed',
      errorMessage: message,
      errorCode: code,
      errorCategory: categorizeError(
        error instanceof Error ? error.message : String(error || '')
      ),
      durationMs: Date.now() - startTime,
      providerUsed: providerErrorDetails?.providerUsed || undefined,
      modelUsed: providerErrorDetails?.modelUsed || null,
      fallbackUsed: false,
      rawOutput: providerErrorDetails?.rawOutput,
      inputTokens: providerErrorDetails?.inputTokens ?? null,
      outputTokens: providerErrorDetails?.outputTokens ?? null,
      totalTokens: providerErrorDetails?.totalTokens ?? null,
      estimatedCostUsd: providerErrorDetails?.estimatedCostUsd ?? null,
    };
  }
}

export async function runHealthChecks(_config: AIGatewayConfig): Promise<ProviderHealthResult[]> {
  const providers = [
    createLanguageProvider('openrouter', 5000),
    createLanguageProvider('vps_ai', 5000),
    createSpeechProvider('cloud_stt', 5000),
    createSpeechProvider('vps_stt', 5000),
  ];

  return Promise.all(providers.map(p => p.healthCheck()));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getProviderOrder(config: AIGatewayConfig): [string, string] {
  const [basePrimary, baseFallback] = (() => {
    switch (config.aiMode) {
      case 'cloud_only':    return [config.primaryLanguageProvider, config.primaryLanguageProvider] as [string, string];
      case 'vps_only':      return [config.fallbackLanguageProvider, config.fallbackLanguageProvider] as [string, string];
      case 'vps_primary':   return [config.fallbackLanguageProvider, config.primaryLanguageProvider] as [string, string];
      case 'cloud_primary':
      default:              return [config.primaryLanguageProvider, config.fallbackLanguageProvider] as [string, string];
    }
  })();

  // Only upgrade fallback to OpenRouter if:
  //   (a) primary is gemini,
  //   (b) fallback is not already openrouter / gemini,
  //   (c) OPENROUTER_ENABLED === 'true' explicitly (strict opt-in),
  //   (d) OPENROUTER_API_KEY is actually set.
  // Otherwise fall back to whatever the user configured (usually vps_ai).
  // This satisfies the requirement: no silent fallback to OpenRouter when disabled.
  if (basePrimary === 'gemini' && baseFallback !== 'openrouter' && baseFallback !== 'gemini') {
    const aiCfg = getAIConfig();
    const openrouterApiKey = aiCfg.openrouter.apiKey;
    const openrouterEnabled = isOpenRouterEnabled();
    if (openrouterEnabled && openrouterApiKey && openrouterApiKey.length > 0) {
      return [basePrimary, 'openrouter'];
    }
  }
  return [basePrimary, baseFallback];
}

async function parseTransactionDocumentWithProvider(
  providerName: string,
  input: TransactionDocumentAIRequest
): Promise<{
  parsed: unknown;
  providerUsed: string;
  modelUsed?: string;
  primaryModel?: string | null;
  finalModel?: string | null;
  fallbackUsed?: boolean;
  rawOutput?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}> {
  switch (providerName) {
    case 'gemini': {
      const provider = new GeminiLanguageProvider(getAIConfig().runtime.documentRequestTimeoutMs);
      return provider.parseTransactionDocument(input);
    }
    case 'openrouter':
      return parseTransactionDocumentWithOpenRouter(input);
    case 'vps_ai':
      return parseTransactionDocumentWithVps(input);
    case 'mock':
      if (isMockAllowed()) {
        return {
          parsed: buildMockDocumentExtraction(input),
          providerUsed: 'mock',
          modelUsed: 'mock-v1',
          primaryModel: 'mock-v1',
          finalModel: 'mock-v1',
          fallbackUsed: false,
          rawOutput: buildMockDocumentExtraction(input),
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedCostUsd: null,
        };
      }
      throw new Error('Mock provider is not available in production mode');
    default:
      if (isMockAllowed()) {
        return {
          parsed: buildMockDocumentExtraction(input),
          providerUsed: 'mock',
          modelUsed: 'mock-v1',
          primaryModel: 'mock-v1',
          finalModel: 'mock-v1',
          fallbackUsed: false,
          rawOutput: buildMockDocumentExtraction(input),
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
          estimatedCostUsd: null,
        };
      }
      throw new Error(`Unknown language provider: ${providerName}. AI is not configured.`);
  }
}

async function parseTransactionDocumentWithOpenRouter(
  input: TransactionDocumentAIRequest
): Promise<{
  parsed: unknown;
  providerUsed: string;
  modelUsed?: string;
  primaryModel?: string | null;
  finalModel?: string | null;
  fallbackUsed?: boolean;
  rawOutput?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}> {
  if (!isOpenRouterAllowed()) {
    throw new TransactionDocumentGatewayError(
      'openrouter_not_configured',
      'openrouter.request',
      'OpenRouter provider is disabled. Set OPENROUTER_ENABLED=true to enable fallback.',
      { providerUsed: 'openrouter' }
    );
  }
  const apiKey = process.env.OPENROUTER_API_KEY || '';
  if (!apiKey) {
    throw new TransactionDocumentGatewayError(
      'openrouter_not_configured',
      'openrouter.request',
      'OpenRouter not configured'
    );
  }

  const baseUrl = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-4.1-mini';
  const timeoutMs = getAIConfig().runtime.documentRequestTimeoutMs;
  logTransactionDocumentGateway('info', 'openrouter.request.start', {
    requestId: input.requestId || null,
    model,
    fileMimeType: input.fileMimeType,
    pageCount: input.pageCount ?? null,
    timeoutMs,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://1smartpocket.com',
        'X-Title': 'Smart Pocket AI',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: TRANSACTION_DOCUMENT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildTransactionDocumentUserContent(input),
          },
        ],
        plugins:
          input.fileMimeType === 'application/pdf'
            ? [
                {
                  id: 'file-parser',
                  pdf: {
                    engine: 'mistral-ocr',
                  },
                },
              ]
            : undefined,
        temperature: 0,
        max_tokens: getTransactionDocumentMaxTokens(input.fileMimeType),
        response_format: { type: 'json_object' },
      }),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error || '');
    const isTimeout = errorMessage.toLowerCase().includes('abort') || errorMessage.toLowerCase().includes('timeout');
    throw new TransactionDocumentGatewayError(
      isTimeout ? 'provider_timeout' : 'provider_unavailable',
      'openrouter.request',
      isTimeout ? 'OpenRouter request timed out' : `OpenRouter request failed: ${sanitizeError(errorMessage)}`,
      {
        providerUsed: 'openrouter',
        modelUsed: model,
      }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const sanitizedError = sanitizeError(errText);
    const code = response.status === 429
      ? 'provider_rate_limited'
      : response.status >= 500
        ? 'provider_unavailable'
        : isUnsupportedMultimodalMessage(sanitizedError)
          ? 'unsupported_multimodal_model'
          : 'provider_http_error';
    logTransactionDocumentGateway('error', 'openrouter.request.failed', {
      requestId: input.requestId || null,
      model,
      status: response.status,
      code,
      providerError: sanitizedError || null,
    });
    throw new TransactionDocumentGatewayError(
      code,
      'openrouter.request',
      `OpenRouter error ${response.status}: ${sanitizedError}`,
      {
        providerUsed: 'openrouter',
        modelUsed: model,
        providerStatus: response.status,
      }
    );
  }
  let rawOutput: unknown;
  try {
    rawOutput = await response.json();
  } catch (error) {
    throw new TransactionDocumentGatewayError(
      'invalid_extraction_response',
      'openrouter.response',
      `OpenRouter returned a non-JSON response: ${sanitizeError(error instanceof Error ? error.message : String(error || 'Unknown error'))}`,
      {
        providerUsed: 'openrouter',
        modelUsed: model,
        providerStatus: response.status,
      }
    );
  }
  const usageDetails = extractProviderUsageDetails(rawOutput);
  logTransactionDocumentGateway('info', 'openrouter.request.success', {
    requestId: input.requestId || null,
    model,
  });
  const content = getProviderChatCompletionContent(rawOutput);
  const parsed = safeParseJSON(extractTransactionDocumentContentText(content));
  if (!parsed) {
    logTransactionDocumentGateway('error', 'openrouter.parse.failed', {
      requestId: input.requestId || null,
      model,
      code: 'invalid_ai_json_response',
    });
    throw new TransactionDocumentGatewayError(
      'invalid_ai_json_response',
      'openrouter.parse',
      'Invalid JSON from OpenRouter',
      {
        providerUsed: 'openrouter',
        modelUsed: model,
        rawOutput,
        ...usageDetails,
      }
    );
  }

  logTransactionDocumentGateway('info', 'openrouter.parse.success', {
    requestId: input.requestId || null,
    model,
  });
  return {
    parsed,
    providerUsed: 'openrouter',
    modelUsed: model,
    rawOutput,
    ...usageDetails,
  };
}

async function parseTransactionDocumentWithVps(
  input: TransactionDocumentAIRequest
): Promise<{
  parsed: unknown;
  providerUsed: string;
  modelUsed?: string;
  primaryModel?: string | null;
  finalModel?: string | null;
  fallbackUsed?: boolean;
  rawOutput?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}> {
  const baseUrl = process.env.LOCAL_AI_BASE_URL || '';
  if (!baseUrl) throw new Error('VPS AI not configured');

  const model = process.env.LOCAL_AI_MODEL || 'llama3';
  const authToken = process.env.LOCAL_AI_AUTH_TOKEN || '';
  const timeoutMs = getAIConfig().runtime.documentRequestTimeoutMs;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  logTransactionDocumentGateway('info', 'vps_ai.request.start', {
    requestId: input.requestId || null,
    model,
    fileMimeType: input.fileMimeType,
    pageCount: input.pageCount ?? null,
    timeoutMs,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: TRANSACTION_DOCUMENT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: buildTransactionDocumentUserContent(input),
          },
        ],
        temperature: 0,
        max_tokens: getTransactionDocumentMaxTokens(input.fileMimeType),
        response_format: { type: 'json_object' },
      }),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error || '');
    const isTimeout = errorMessage.toLowerCase().includes('abort') || errorMessage.toLowerCase().includes('timeout');
    throw new TransactionDocumentGatewayError(
      isTimeout ? 'provider_timeout' : 'provider_unavailable',
      'vps_ai.request',
      isTimeout ? 'VPS AI request timed out' : `VPS AI request failed: ${sanitizeError(errorMessage)}`,
      {
        providerUsed: 'vps_ai',
        modelUsed: model,
      }
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const sanitizedError = sanitizeError(errText);
    const code = response.status === 429
      ? 'provider_rate_limited'
      : response.status >= 500
        ? 'provider_unavailable'
        : isUnsupportedMultimodalMessage(sanitizedError)
          ? 'unsupported_multimodal_model'
          : 'provider_http_error';
    logTransactionDocumentGateway('error', 'vps_ai.request.failed', {
      requestId: input.requestId || null,
      model,
      status: response.status,
      code,
      providerError: sanitizedError || null,
    });
    throw new TransactionDocumentGatewayError(
      code,
      'vps_ai.request',
      `VPS AI error ${response.status}: ${sanitizedError}`,
      {
        providerUsed: 'vps_ai',
        modelUsed: model,
        providerStatus: response.status,
      }
    );
  }

  let rawOutput: unknown;
  try {
    rawOutput = await response.json();
  } catch (error) {
    throw new TransactionDocumentGatewayError(
      'invalid_extraction_response',
      'vps_ai.response',
      `VPS AI returned a non-JSON response: ${sanitizeError(error instanceof Error ? error.message : String(error || 'Unknown error'))}`,
      {
        providerUsed: 'vps_ai',
        modelUsed: model,
        providerStatus: response.status,
      }
    );
  }
  const usageDetails = extractProviderUsageDetails(rawOutput);
  logTransactionDocumentGateway('info', 'vps_ai.request.success', {
    requestId: input.requestId || null,
    model,
  });
  const content = getProviderChatCompletionContent(rawOutput);
  const parsed = safeParseJSON(extractTransactionDocumentContentText(content));
  if (!parsed) {
    logTransactionDocumentGateway('error', 'vps_ai.parse.failed', {
      requestId: input.requestId || null,
      model,
      code: 'invalid_ai_json_response',
    });
    throw new TransactionDocumentGatewayError(
      'invalid_ai_json_response',
      'vps_ai.parse',
      'Invalid JSON from VPS AI',
      {
        providerUsed: 'vps_ai',
        modelUsed: model,
        rawOutput,
        ...usageDetails,
      }
    );
  }

  logTransactionDocumentGateway('info', 'vps_ai.parse.success', {
    requestId: input.requestId || null,
    model,
  });
  return {
    parsed,
    providerUsed: 'vps_ai',
    modelUsed: model,
    rawOutput,
    ...usageDetails,
  };
}

function buildUserMessage(input: ParseRequest): string {
  let msg = `Parse this financial instruction:\n"${input.text}"`;
  if (input.requestId) msg += `\n\nrequestId: ${input.requestId}`;
  if (input.language)  msg += `\nLanguage hint: ${input.language}`;
  if (input.locale) msg += `\nLocale: ${input.locale}`;
  if (input.currentDate) msg += `\nCurrent date: ${input.currentDate}`;
  if (input.currentDateTime) msg += `\nCurrent date-time: ${input.currentDateTime}`;
  if (input.timezone) msg += `\nTimezone: ${input.timezone}`;
  if (input.context) {
    if (input.context.accounts?.length) {
      msg += `\n\nAvailable accounts: ${input.context.accounts.map(a => `${a.name} (${a.type}, ${a.currency})`).join(', ')}`;
    }
    if (input.context.people?.length) {
      msg += `\nKnown people: ${input.context.people.map((p) => {
        const aliases = p.aliases?.length ? ` [aliases: ${p.aliases.join(', ')}]` : '';
        return `${p.fullName}${aliases}`;
      }).join(', ')}`;
    }
    if (input.context.categories?.length) {
      msg += `\nAvailable categories: ${input.context.categories.map(c => c.name).join(', ')}`;
    }
    if (input.context.subscriptions?.length) {
      msg += `\nKnown subscriptions: ${input.context.subscriptions
        .map((subscription) => {
          const parts = [subscription.name];
          if (subscription.provider) parts.push(`provider: ${subscription.provider}`);
          if (subscription.amount && subscription.currencyCode) parts.push(`amount: ${subscription.amount} ${subscription.currencyCode}`);
          if (subscription.billingFrequency) parts.push(`frequency: ${subscription.billingFrequency}`);
          if (subscription.status) parts.push(`status: ${subscription.status}`);
          return parts.join(' | ');
        })
        .join(', ')}`;
    }
    if (input.context.defaultCurrency) {
      msg += `\nDefault currency: ${input.context.defaultCurrency}`;
    }
  }
  return msg;
}

function buildTransactionDocumentUserContent(input: TransactionDocumentAIRequest) {
  const parts: Array<Record<string, unknown>> = [
    {
      type: 'text',
      text: buildTransactionDocumentUserMessage(input),
    },
  ];

  if (input.fileMimeType === 'application/pdf') {
    parts.push({
      type: 'file',
      file: {
        filename: input.fileName,
        file_data: input.fileUrl,
      },
    });
  } else {
    parts.push({
      type: 'image_url',
      image_url: {
        url: input.fileUrl,
      },
    });
  }

  return parts;
}

function buildTransactionDocumentUserMessage(input: TransactionDocumentAIRequest) {
  const context: Record<string, unknown> = {
    requestId: input.requestId || createClientId(),
  };

  const normalizedLanguage = input.language?.trim();
  if (normalizedLanguage) {
    context.languageHint = normalizedLanguage;
  }
  if (typeof input.pageCount === 'number') {
    context.pageCount = input.pageCount;
  }
  if (input.context?.defaultCurrency) {
    context.defaultCurrency = input.context.defaultCurrency.trim().toUpperCase();
  }
  if (input.context?.categories?.length) {
    const expenseCategories: string[] = [];
    const incomeCategories: string[] = [];

    for (const category of input.context.categories) {
      const normalizedName = category.name?.trim();
      if (!normalizedName) continue;

      if (category.type === 'expense') {
        expenseCategories.push(normalizedName);
      } else if (category.type === 'income') {
        incomeCategories.push(normalizedName);
      }
    }

    if (expenseCategories.length) {
      context.expenseCategories = expenseCategories;
    }
    if (incomeCategories.length) {
      context.incomeCategories = incomeCategories;
    }
  }
  const contextJson = JSON.stringify(context, null, 0);
  return `Extract structured transaction data from the attached document (receipt/invoice/bill/expense note) and return ONLY the extraction JSON matching the required system schema.

The following context object contains helpful hints (requestId to echo back, language hint, default currency for ambiguous amounts, allowed category labels) — use them as guidance only, do NOT copy this context object verbatim into your output, do NOT include fields like "languageHint" or "pageCount" or "expenseCategories" at the top level of your response. Instead, return ONLY the extraction result with fields: requestId (echo), language (detected BCP-47 code of document contents or default languageHint), documentKind, confidence, warnings[], transactions[], missingFields[] (if any), requiresClarification.

CONTEXT HINTS (do not echo back as a template):
${contextJson}

EXTRACTION RESULT:`;
}

function buildMockDocumentExtraction(input: TransactionDocumentAIRequest): TransactionDocumentExtraction {
  const defaultCurrency = input.context?.defaultCurrency || 'USD';
  return {
    requestId: input.requestId || createClientId(),
    language: input.language || 'en',
    documentKind: input.fileMimeType === 'application/pdf' ? 'note' : 'receipt',
    confidence: 0.72,
    warnings: ['Mock document extraction result. Configure a real AI provider for production extraction.'],
    transactions: [
      {
        transactionType: 'expense',
        merchant: 'Sample Merchant',
        date: new Date().toISOString().slice(0, 10),
        total: 42.5,
        tax: 2.02,
        currency: defaultCurrency,
        categorySuggestion: 'Groceries',
        description: 'Document draft transaction',
        notes: input.fileMimeType === 'application/pdf'
          ? 'Detected from uploaded PDF.'
          : 'Detected from uploaded image.',
        receiptNumber: 'MOCK-001',
        confidence: 0.72,
        needsReview: true,
        lineItems: [
          {
            name: 'Sample item',
            quantity: 1,
            unitPrice: 42.5,
            total: 42.5,
            confidence: 0.61,
          },
        ],
      },
    ],
  };
}

function asOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractProviderUsageDetails(rawOutput: unknown) {
  if (!rawOutput || typeof rawOutput !== 'object') {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      estimatedCostUsd: null,
    };
  }

  const root = rawOutput as Record<string, unknown>;
  const usage = root.usage && typeof root.usage === 'object'
    ? root.usage as Record<string, unknown>
    : null;

  const inputTokens = asOptionalNumber(
    usage?.prompt_tokens
    ?? usage?.input_tokens
    ?? root.prompt_tokens
    ?? root.input_tokens
  );
  const outputTokens = asOptionalNumber(
    usage?.completion_tokens
    ?? usage?.output_tokens
    ?? root.completion_tokens
    ?? root.output_tokens
  );
  const totalTokens = asOptionalNumber(
    usage?.total_tokens
    ?? root.total_tokens
    ?? (
      (typeof inputTokens === 'number' ? inputTokens : 0)
      + (typeof outputTokens === 'number' ? outputTokens : 0)
    )
  );
  const estimatedCostUsd = asOptionalNumber(
    usage?.cost
    ?? usage?.estimated_cost
    ?? usage?.estimated_cost_usd
    ?? root.cost
    ?? root.estimated_cost
    ?? root.estimated_cost_usd
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens: typeof totalTokens === 'number' && totalTokens > 0 ? totalTokens : null,
    estimatedCostUsd,
  };
}

function extractTransactionDocumentContentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (!part || typeof part !== 'object') return '';
        const record = part as Record<string, unknown>;
        if (typeof record.text === 'string') return record.text;
        if (typeof record.content === 'string') return record.content;
        return '';
      })
      .filter(Boolean);
    return textParts.join('\n');
  }
  if (content && typeof content === 'object') {
    const record = content as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text;
  }
  return JSON.stringify(content ?? '');
}

function getProviderChatCompletionContent(rawOutput: unknown): string | ProviderContentBlock[] | null | undefined {
  const providerResponse = rawOutput as ProviderChatCompletionResponse;
  return providerResponse.choices?.[0]?.message?.content;
}

function sanitizeError(msg: string): string {
  // Remove any potential secret leakage from error messages
  return msg
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[REDACTED]')
    .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
    .substring(0, 200);
}

function isUnsupportedMultimodalMessage(message: string): boolean {
  return (
    /multimodal/i.test(message)
    || /vision/i.test(message)
    || /image input/i.test(message)
    || /file input/i.test(message)
    || /file-parser/i.test(message)
    || /does not support .*pdf/i.test(message)
    || /does not support .*image/i.test(message)
  );
}

function getTransactionDocumentGatewayErrorCode(
  error: unknown,
  normalizedMimeType: string
): TransactionDocumentErrorCode {
  if (error instanceof TransactionDocumentGatewayError) {
    return error.code;
  }

  const message = error instanceof Error ? error.message : String(error || '');
  if (normalizedMimeType === 'application/pdf' && /file|pdf|plugin/i.test(message)) {
    return 'pdf_extraction_unavailable';
  }
  if (/OpenRouter not configured/i.test(message)) {
    return 'openrouter_not_configured';
  }
  // Gemini-specific auth / timeout / network classification
  if (/\b(401|403|UNAUTHENTICATED|PERMISSION_DENIED|invalid authentication credentials|API key not valid)\b/i.test(message)) {
    return 'gemini_auth_failed';
  }
  if (/\b(timeout|timed out|abort|DEADLINE_EXCEEDED|AbortError|TimeoutError)\b/i.test(message)) {
    return 'gemini_request_timeout';
  }
  if (
    /Invalid JSON from OpenRouter/i.test(message)
    || /Invalid JSON from VPS AI/i.test(message)
    || /Document extraction response is not an object/i.test(message)
    || /Document extraction is missing/i.test(message)
  ) {
    return 'invalid_ai_json_response';
  }
  if (
    /OpenRouter error \d+/i.test(message)
    || /VPS AI error \d+/i.test(message)
  ) {
    return isUnsupportedMultimodalMessage(message)
      ? 'unsupported_multimodal_model'
      : /429/i.test(message)
        ? 'provider_rate_limited'
        : /50\d/i.test(message)
          ? 'provider_unavailable'
          : 'provider_http_error';
  }
  if (
    /fetch failed/i.test(message)
    || /network/i.test(message)
    || /temporarily unavailable/i.test(message)
  ) {
    return 'gemini_provider_unavailable';
  }
  return 'extract_failed';
}

function getTransactionDocumentGatewaySafeMessage(
  code: TransactionDocumentErrorCode,
  normalizedMimeType: string
): string {
  switch (code) {
    case 'openrouter_not_configured':
      return 'Document extraction is not configured yet.';
    case 'gemini_auth_failed':
      return 'Receipt extraction is temporarily unavailable due to an AI authentication error. Please contact your administrator.';
    case 'gemini_request_timeout':
      return 'Receipt extraction is taking longer than expected. Please try again.';
    case 'gemini_provider_unavailable':
      return 'Receipt extraction is temporarily unavailable. Please try again.';
    case 'unsupported_multimodal_model':
      return normalizedMimeType === 'application/pdf'
        ? 'Document extraction is temporarily unavailable for this PDF. Please review the file and try again.'
        : 'Document extraction is temporarily unavailable for this image. Please try again.';
    case 'provider_http_error':
      return 'Document extraction is temporarily unavailable. Please try again.';
    case 'provider_timeout':
      return 'Receipt extraction is taking longer than expected. Please try again.';
    case 'provider_rate_limited':
      return 'Receipt extraction is temporarily rate limited. Please try again shortly.';
    case 'provider_unavailable':
      return 'Receipt extraction is temporarily unavailable. Please try again.';
    case 'invalid_ai_json_response':
      return 'The receipt was processed, but the extracted data could not be validated.';
    case 'invalid_extraction_response':
      return 'The receipt was processed, but the extracted data could not be validated.';
    case 'unreadable_document':
      return 'We could not read enough information from this document. Try a clearer photo.';
    case 'pdf_extraction_unavailable':
      return 'Document extraction is temporarily unavailable for this PDF. Please review the file and try again.';
    default:
      return 'Failed to extract the uploaded document.';
  }
}

function logTransactionDocumentGateway(
  level: 'info' | 'error',
  stage: string,
  meta: Record<string, unknown>
) {
  const payload = {
    scope: 'transaction-document-ai',
    stage,
    ...meta,
  };
  if (level === 'error') {
    console.error(payload);
    return;
  }
  console.info(payload);
}

function categorizeError(msg: string): string {
  if (msg.includes('timeout') || msg.includes('abort')) return 'timeout';
  if (msg.includes('not configured'))                    return 'not_configured';
  if (msg.includes('401') || msg.includes('403'))        return 'auth_error';
  if (msg.includes('429'))                               return 'rate_limited';
  if (msg.includes('500') || msg.includes('502'))        return 'provider_error';
  if (msg.includes('JSON') || msg.includes('parse'))     return 'invalid_response';
  return 'unknown';
}

// ─── Text extraction helpers for mock provider ────────────────────────────────

function extractAmount(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

function extractExplicitExpenseAmount(text: string, receivedAmount?: number | null): number | null {
  const patterns = [
    /bill\s+of\s+(?:aed\s*)?(\d+(?:\.\d+)?)/i,
    /paid\s+(?:aed\s*)?(\d+(?:\.\d+)?)\s+(?:for|on)\b/i,
    /spent\s+(?:aed\s*)?(\d+(?:\.\d+)?)\s+(?:for|on)\b/i,
    /used\s+(?:aed\s*)?(\d+(?:\.\d+)?)\s+(?:for|on)\b/i,
    /pay\s+.+?\s+of\s+(?:aed\s*)?(\d+(?:\.\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return parseFloat(match[1]);
    }
  }

  const allAmounts = text.match(/\d+(?:\.\d+)?/g)?.map((value) => parseFloat(value)) || [];
  if (allAmounts.length >= 2) {
    const candidate = allAmounts[1];
    if (typeof receivedAmount === 'number' && candidate === receivedAmount && allAmounts.length === 2) {
      return null;
    }
    return candidate;
  }

  return null;
}

function inferExpenseCategory(text: string): string {
  if (text.includes('sewa') || text.includes('utility') || text.includes('utilities') || text.includes('bill')) {
    return 'Utilities';
  }
  if (text.includes('rent')) {
    return 'Housing & Rent';
  }
  return 'Expense';
}

function extractCurrency(text: string): string | null {
  const lower = text.toLowerCase();
  if (lower.includes('aed') || lower.includes('dirham')) return 'AED';
  if (lower.includes('usd') || lower.includes('dollar'))  return 'USD';
  if (lower.includes('eur') || lower.includes('euro'))    return 'EUR';
  if (lower.includes('gbp') || lower.includes('pound'))   return 'GBP';
  return null;
}

function dataUrlToInline(dataUrl: string, fallbackMimeType: string): { mimeType: string; data: string } {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return { mimeType: fallbackMimeType, data: dataUrl || '' };
  }
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(0, comma);
  const body = comma === -1 ? '' : dataUrl.slice(comma + 1);
  const mimeMatch = header.match(/^data:([^;]+)/);
  const mimeType = mimeMatch ? mimeMatch[1] : fallbackMimeType;
  const isBase64 = /;\s*base64\s*$/i.test(header);
  if (isBase64) {
    return { mimeType, data: body };
  }
  const decoded = decodeURIComponent(body);
  const buf = Buffer.from(decoded, 'utf-8');
  return { mimeType, data: buf.toString('base64') };
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return Buffer.from(typeof dataUrl === 'string' ? dataUrl : '', 'utf-8');
  }
  const { data } = dataUrlToInline(dataUrl, 'application/octet-stream');
  if (!data) return Buffer.alloc(0);
  return Buffer.from(data, 'base64');
}

function extractAccount(text: string): string | null {
  if (text.includes('cash'))   return 'Cash';
  if (text.includes('bank'))   return 'Bank';
  if (text.includes('card') || text.includes('credit')) return 'Credit Card';
  return null;
}

function extractFromAccount(text: string): string | null {
  const m = text.match(/from\s+(\w+)/i);
  return m ? m[1] : null;
}

function extractToAccount(text: string): string | null {
  const m = text.match(/to\s+(\w+)/i);
  return m ? m[1] : null;
}

function extractDayOfMonth(text: string): number | null {
  const m = text.match(/(\d+)(?:st|nd|rd|th)?\s+(?:of\s+(?:every|each)\s+month|day)/i)
    || text.match(/first/i);
  if (m && m[1]) return parseInt(m[1], 10);
  if (/first/i.test(text)) return 1;
  return null;
}

function normalizeLookupValue(value: string | undefined | null) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasStrongSubscriptionLanguage(text: string) {
  return [
    'subscription',
    'subscribed',
    'monthly plan',
    'annual plan',
    'membership',
    'renews monthly',
    'renews yearly',
    'free trial',
    'trial ends',
    'auto-renew',
    'netflix',
    'chatgpt plus',
    'amazon prime',
    'google one',
    'icloud',
    'gym membership',
    'hosting plan',
    'domain renewal',
    'software licence',
    'software license',
    'joined a gym',
    'started ',
  ].some((phrase) => text.includes(phrase));
}

function hasOrdinaryRecurringNonSubscriptionWording(text: string) {
  return [
    'salary',
    'rent',
    'loan instalment',
    'loan installment',
    'school fee',
    'family allowance',
    'savings transfer',
  ].some((phrase) => text.includes(phrase));
}

function hasSubscriptionPaymentWording(text: string) {
  return text.includes('paid') || text.includes('charged me') || text.includes('charge me');
}

function hasSubscriptionUpdateWording(text: string) {
  return [
    'increased to',
    'increased from',
    'is now',
    'now aed',
    'now usd',
    'now eur',
    'price changed',
  ].some((phrase) => text.includes(phrase));
}

function hasSubscriptionCancelWording(text: string) {
  return text.includes('cancel ');
}

function extractSubscriptionFrequency(text: string): ParsedFinancialInstruction['actions'][number]['billingFrequency'] | undefined {
  if (text.includes('weekly')) return 'weekly';
  if (text.includes('monthly') || text.includes('per month') || text.includes('renews monthly')) return 'monthly';
  if (text.includes('quarterly')) return 'quarterly';
  if (text.includes('yearly') || text.includes('annual') || text.includes('per year') || text.includes('renews yearly')) return 'yearly';
  return undefined;
}

function extractSubscriptionName(rawText: string, context?: FinancialContext) {
  const normalizedText = normalizeLookupValue(rawText);
  const knownNames = [
    'netflix',
    'amazon prime',
    'chatgpt plus',
    'google one',
    'icloud',
    'canva',
    'gym membership',
  ];

  for (const subscription of context?.subscriptions || []) {
    const normalizedName = normalizeLookupValue(subscription.name);
    if (normalizedName && normalizedText.includes(normalizedName)) {
      return subscription.name;
    }
    const normalizedProvider = normalizeLookupValue(subscription.provider);
    if (normalizedProvider && normalizedText.includes(normalizedProvider)) {
      return subscription.name;
    }
  }

  for (const knownName of knownNames) {
    if (normalizedText.includes(knownName)) {
      return knownName
        .split(' ')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
  }

  const match = rawText.match(/(?:for|paid|cancel|started|joined)\s+([A-Za-z0-9][A-Za-z0-9+\s'-]{1,50})/i);
  return match?.[1]?.trim();
}

function findMatchingContextSubscription(rawText: string, context?: FinancialContext) {
  const normalizedText = normalizeLookupValue(rawText);
  return (context?.subscriptions || []).find((subscription) => {
    const normalizedName = normalizeLookupValue(subscription.name);
    const normalizedProvider = normalizeLookupValue(subscription.provider);
    return (normalizedName && normalizedText.includes(normalizedName))
      || (normalizedProvider && normalizedText.includes(normalizedProvider));
  });
}

function endOfCurrentMonthIso() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12, 0, 0))
    .toISOString()
    .slice(0, 10);
}
