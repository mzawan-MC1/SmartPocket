// ─── AI Gateway ───────────────────────────────────────────────────────────────
// Server-side only. Never import this from browser components.
// All provider secrets are resolved from environment variables.

import type { AIGatewayConfig, AIAssistantRequest, AIAssistantResponse, ParseRequest, ParsedFinancialInstruction, AudioInput, TranscriptResult, LanguageProvider, SpeechProvider, ProviderHealthResult, FinancialContext } from './ai-types';
import {
  validateParsedInstruction,
  safeParseJSON,
  FINANCIAL_SYSTEM_PROMPT,
} from './ai-types';
import { createClientId } from './uuid';
import {
  classifyTransactionDocumentError,
  TRANSACTION_DOCUMENT_SYSTEM_PROMPT,
  validateTransactionDocumentExtraction,
  type TransactionDocumentErrorCode,
  type TransactionDocumentExtraction,
} from './transaction-documents';

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

function getTransactionDocumentTimeoutMs() {
  const parsed = Number.parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '22000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 22000;
}

function getTransactionDocumentMaxTokens(mimeType: string) {
  return mimeType === 'application/pdf' ? 2200 : 1400;
}

function shouldFallbackTransactionDocumentRequest(
  error: unknown,
  primaryProvider: string,
  fallbackProvider: string,
  enableFallback: boolean
) {
  if (!enableFallback || primaryProvider === fallbackProvider) {
    return false;
  }

  if (!(error instanceof TransactionDocumentGatewayError)) {
    return false;
  }

  return error.code === 'openrouter_not_configured' || error.code === 'unsupported_multimodal_model';
}

// ─── Config Loader ────────────────────────────────────────────────────────────

export function loadAIConfig(): AIGatewayConfig {
  return {
    aiEnabled:                  process.env.AI_ENABLED === 'true',
    aiMode:                     (process.env.AI_MODE as AIGatewayConfig['aiMode']) || 'cloud_only',
    primaryLanguageProvider:    process.env.PRIMARY_LANGUAGE_PROVIDER || 'openrouter',
    fallbackLanguageProvider:   process.env.FALLBACK_LANGUAGE_PROVIDER || 'vps_ai',
    primarySttProvider:         process.env.PRIMARY_STT_PROVIDER || 'cloud_stt',
    fallbackSttProvider:        process.env.FALLBACK_STT_PROVIDER || 'vps_stt',
    requestTimeoutMs:           parseInt(process.env.AI_REQUEST_TIMEOUT_MS || '20000', 10),
    maxRetries:                 parseInt(process.env.AI_MAX_RETRIES || '1', 10),
    confidenceThreshold:        parseFloat(process.env.AI_CONFIDENCE_THRESHOLD || '0.80'),
    requireConfirmation:        process.env.AI_REQUIRE_CONFIRMATION !== 'false',
    maxAudioSeconds:            parseInt(process.env.AI_MAX_AUDIO_SECONDS || '120', 10),
    maxDailyRequestsPerUser:    parseInt(process.env.AI_MAX_DAILY_REQUESTS_PER_USER || '100', 10),
    maxTextLength:              parseInt(process.env.AI_MAX_TEXT_LENGTH || '2000', 10),
    enableAutoFallback:         process.env.AI_ENABLE_AUTO_FALLBACK === 'true',
    enableAuditLogs:            process.env.AI_ENABLE_AUDIT_LOGS !== 'false',
    enableTranscriptRetention:  process.env.AI_ENABLE_TRANSCRIPT_RETENTION === 'true',
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

  async parseFinancialInstruction(input: ParseRequest): Promise<ParsedFinancialInstruction> {
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

// ─── Provider Factory ─────────────────────────────────────────────────────────

export function createLanguageProvider(name: string, timeoutMs: number): LanguageProvider {
  switch (name) {
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
    return {
      requestId: createClientId(),
      status: 'failed',
      errorMessage: sanitizeError(msg),
      errorCategory: categorizeError(msg),
      durationMs: Date.now() - startTime,
    };
  }
}

export async function processTransactionDocumentAIRequest(
  request: TransactionDocumentAIRequest,
  config: AIGatewayConfig
): Promise<TransactionDocumentAIResponse> {
  const startTime = Date.now();
  const timings = {
    providerMs: 0,
    validationMs: 0,
    totalMs: 0,
  };

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
    const [primaryLang, fallbackLang] = getProviderOrder(config);
    let result;
    let fallbackUsed = false;
    try {
      const providerStartedAt = Date.now();
      result = await parseTransactionDocumentWithProvider(primaryLang, { ...request, requestId });
      timings.providerMs = Date.now() - providerStartedAt;
    } catch (primaryError) {
      if (!shouldFallbackTransactionDocumentRequest(primaryError, primaryLang, fallbackLang, config.enableAutoFallback)) {
        throw primaryError;
      }
      const providerStartedAt = Date.now();
      result = await parseTransactionDocumentWithProvider(fallbackLang, { ...request, requestId });
      timings.providerMs = Date.now() - providerStartedAt;
      fallbackUsed = true;
    }

    logTransactionDocumentGateway('info', 'document-ai.parse_response.start', {
      requestId,
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed || null,
      fallbackUsed,
    });
    let validated;
    try {
      const validationStartedAt = Date.now();
      validated = validateTransactionDocumentExtraction(result.parsed);
      timings.validationMs = Date.now() - validationStartedAt;
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
      fallbackUsed,
      durationMs: Date.now() - startTime,
    });
    timings.totalMs = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') {
      logTransactionDocumentGateway('info', 'document-ai.timing', {
        requestId,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed || null,
        timings,
      });
    }
    return {
      requestId: validated.requestId,
      status: 'parsed',
      parsed: {
        ...validated,
        providerUsed: result.providerUsed,
        modelUsed: result.modelUsed,
      },
      providerUsed: result.providerUsed,
      modelUsed: result.modelUsed || null,
      fallbackUsed,
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
    timings.totalMs = Date.now() - startTime;
    if (process.env.NODE_ENV !== 'production') {
      logTransactionDocumentGateway('info', 'document-ai.timing', {
        requestId,
        error: true,
        timings,
      });
    }
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
  switch (config.aiMode) {
    case 'cloud_only':    return [config.primaryLanguageProvider, config.primaryLanguageProvider];
    case 'vps_only':      return [config.fallbackLanguageProvider, config.fallbackLanguageProvider];
    case 'vps_primary':   return [config.fallbackLanguageProvider, config.primaryLanguageProvider];
    case 'cloud_primary':
    default:              return [config.primaryLanguageProvider, config.fallbackLanguageProvider];
  }
}

async function parseTransactionDocumentWithProvider(
  providerName: string,
  input: TransactionDocumentAIRequest
): Promise<{
  parsed: unknown;
  providerUsed: string;
  modelUsed?: string;
  rawOutput?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}> {
  switch (providerName) {
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
  rawOutput?: unknown;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCostUsd?: number | null;
}> {
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
  const timeoutMs = getTransactionDocumentTimeoutMs();
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
  const timeoutMs = getTransactionDocumentTimeoutMs();
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
  let message = `Extract draft transactions from this document.\nrequestId: ${input.requestId || createClientId()}`;
  message += `\nLanguage hint: ${input.language || 'en'}`;
  message += `\nSource surface: ${input.sourceSurface || 'unknown'}`;
  message += `\nFile name: ${input.fileName}`;
  message += `\nMIME type: ${input.fileMimeType}`;
  if (typeof input.pageCount === 'number') {
    message += `\nPDF page count: ${input.pageCount}`;
  }
  if (input.context?.defaultCurrency) {
    message += `\nDefault currency: ${input.context.defaultCurrency}`;
  }
  if (input.context?.categories?.length) {
    message += `\nAvailable categories: ${input.context.categories.map((category) => category.name).join(', ')}`;
  }
  return message;
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
    /timed out/i.test(message)
    || /timeout/i.test(message)
    || /abort/i.test(message)
  ) {
    return 'provider_timeout';
  }
  if (
    /fetch failed/i.test(message)
    || /network/i.test(message)
    || /temporarily unavailable/i.test(message)
  ) {
    return 'provider_unavailable';
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
  if (text.includes('aed') || text.includes('dirham')) return 'AED';
  if (text.includes('usd') || text.includes('dollar'))  return 'USD';
  if (text.includes('eur') || text.includes('euro'))    return 'EUR';
  return null;
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
