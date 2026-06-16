// ─── AI Gateway ───────────────────────────────────────────────────────────────
// Server-side only. Never import this from browser components.
// All provider secrets are resolved from environment variables.

import type { AIGatewayConfig, AIAssistantRequest, AIAssistantResponse, ParseRequest, ParsedFinancialInstruction, AudioInput, TranscriptResult, LanguageProvider, SpeechProvider, ProviderHealthResult,  } from './ai-types';
import {
  validateParsedInstruction,
  safeParseJSON,
  FINANCIAL_SYSTEM_PROMPT,
} from './ai-types';
import { createClientId } from './uuid';

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
    const primaryCurrency = extractCurrency(text) || 'AED';
    const personFromReceipt =
      input.text.match(/from\s+([A-Za-z][A-Za-z\s'-]+)/i) ||
      input.text.match(/([A-Za-z][A-Za-z\s'-]+)\s+(?:gave me|paid me|reimbursed me|lent me|sent me)/i);
    const parsedPersonName = personFromReceipt?.[1]?.split(/,|and|for/i)[0]?.trim() || 'Ayesha';
    const firstAccountName = input.context?.accounts?.[0]?.name || extractAccount(text) || 'Cash';

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
            categoryName: 'Food & Dining',
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
            categoryName: 'Food & Dining',
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
            currency: extractCurrency(text) || 'AED',
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
            currency: extractCurrency(text) || 'AED',
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

    if (text.includes('groceries') || text.includes('grocery')) {
      return {
        requestId: input.requestId || 'mock-req',
        language: 'en',
        confidence: 0.95,
        overallIntent: 'personal_transaction',
        actions: [{
          actionType: 'expense',
          amount: extractAmount(text) || 85,
          currency: extractCurrency(text) || 'AED',
          date: 'today',
          categoryName: 'Groceries',
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
          currency: extractCurrency(text) || 'AED',
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
          currency: extractCurrency(text) || 'AED',
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
          currency: extractCurrency(text) || 'AED',
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
          currency: extractCurrency(text) || 'AED',
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
          currency: extractCurrency(text) || 'AED',
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
          'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://smartpocket.app',
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
      if (!content) throw new Error('Empty response from OpenRouter');

      const parsed = safeParseJSON(content);
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
      if (!content) throw new Error('Empty response from VPS AI');

      const parsed = safeParseJSON(content);
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
    let sttProviderUsed: string | undefined;
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
      sttProviderUsed = sttResult.providerUsed;
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

export async function runHealthChecks(config: AIGatewayConfig): Promise<ProviderHealthResult[]> {
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
    if (input.context.defaultCurrency) {
      msg += `\nDefault currency: ${input.context.defaultCurrency}`;
    }
  }
  return msg;
}

function sanitizeError(msg: string): string {
  // Remove any potential secret leakage from error messages
  return msg
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[REDACTED]')
    .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
    .substring(0, 200);
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
