'use client';
 import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
 import {
   X,
   Mic,
   Type,
   AlertTriangle,
   CheckCircle,
  FileText,
   Loader2,
   RotateCcw,
   Sparkles,
   Clock,
   Calendar,
   ArrowUpRight,
   Zap,
 } from 'lucide-react';
 import { createPortal } from 'react-dom';
 import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
 import { createClient } from '@/lib/supabase/client';
import { formatCurrencyText } from '@/lib/currency-formatting';
 import VoiceRecorder from './VoiceRecorder';
import DocumentTransactionReviewModal from '@/components/transactions/DocumentTransactionReviewModal';
 import type {
   ParsedFinancialInstruction,
   FinancialContext,
   AIErrorPayload,
   AIUsageSummary,
   SmartEntryReview,
   SuggestedAccount,
   SmartEntryPurpose,
 } from '@/lib/ai-types';
 import { buildAIContext } from '@/lib/ai-execution';
 import { dispatchSmartPocketDataChanged, type SmartPocketDataEntity } from '@/lib/data-change';
import {
  getDefaultPersonalAccount,
  getFinancialAccountDisplayLabel,
  getActivePersonalFinancialAccounts,
} from '@/lib/financial-account-utils';
import {
  getFieldErrorTextClassName,
  getFieldInputClassName,
  getFieldLabelClassName,
  getRequiredMarkerClassName,
} from '@/lib/form-field-styles';
 import { createClientId } from '@/lib/uuid';
 import { useLanguage } from '@/contexts/LanguageContext';
 import {
   applySmartEntryReviewToInstruction,
   buildInitialSmartEntryReview,
  getEligibleAccountsForPurpose,
  getManagedAccountName,
   getSmartEntryMissingFields,
  getSmartEntryReviewMissingFields,
   getSmartEntryTotals,
  hydrateSmartEntryReviewWithContext,
   inferAccountType,
  isManagedPurpose,
   sanitizeCurrency,
 } from '@/lib/smart-entry';
import {
  isPersonalSubscriptionBillingFrequency,
  PERSONAL_SUBSCRIPTION_REMINDER_OPTIONS,
} from '@/lib/personal-subscriptions-shared';
import { translateSystemCategoryName } from '@/lib/system-category-display';
import {
  classifyTransactionDocumentError,
  TRANSACTION_DOCUMENT_ACCEPT_ATTRIBUTE,
  TRANSACTION_DOCUMENT_SUPPORTED_TYPES_LABEL,
  getTransactionDocumentMaxSizeLabel,
  validateTransactionDocumentFile,
} from '@/lib/transaction-documents';
import { trackAiEntryUsed } from '@/lib/analytics';
import type { VoiceRecorderSubmission } from '@/lib/voice-ai';

 type AssistantStep =
   | 'entry'
   | 'processing'
  | 'receipt_insight'
   | 'confirming'
   | 'executing'
   | 'limit'
   | 'success'
   | 'failed';

type ReceiptInsightAnswer = {
  title: string;
  answer: string;
  sources: Array<{
    transactionDate: string;
    merchant: string | null;
    itemName: string;
    detail: string;
    currency?: string;
  }>;
};

type VoiceStatusResponse = {
  ready?: boolean;
  transcription?: {
    maxAudioSeconds?: number;
  };
  error?: AIErrorPayload;
  usage?: AIUsageSummary;
};

type SmartEntryDisplayLanguage = 'en' | 'ar' | 'fr' | 'ru';
type SmartEntrySpokenLanguage = 'auto' | SmartEntryDisplayLanguage | 'ur';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeDisplayLanguage(value: string | null | undefined): SmartEntryDisplayLanguage {
  return value === 'ar' || value === 'fr' || value === 'ru' ? value : 'en';
}

function getLanguageDirection(value: string | null | undefined): 'rtl' | 'ltr' {
  return value === 'ar' || value === 'ur' ? 'rtl' : 'ltr';
}

function normalizeSubscriptionBillingFrequencyInput(
  value: string | undefined
): NonNullable<NonNullable<SmartEntryReview['subscription']>['billingFrequency']> | undefined {
  const trimmed = (value || '').trim();
  if (!trimmed) return undefined;
  if (isPersonalSubscriptionBillingFrequency(trimmed)) {
    return trimmed;
  }

  const normalized = trimmed
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^semiannual$/, 'semi_annual')
    .replace(/^semi_annual_plan$/, 'semi_annual')
    .replace(/^annual$/, 'yearly');

  return isPersonalSubscriptionBillingFrequency(normalized) ? normalized : undefined;
}

 interface AIAssistantModalProps {
   onClose: () => void;
   defaultMode?: 'voice' | 'text';
 }

type EntryMode = 'voice' | 'text' | 'document';

function formatMoney(value: number | undefined, currency?: string, fallbackCurrency?: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return formatCurrencyText(0, {
      currencyCode: currency,
      fallbackCurrencyCode: fallbackCurrency || 'USD',
      textOnly: true,
    });
  }
  return formatCurrencyText(value, {
    currencyCode: currency,
    fallbackCurrencyCode: fallbackCurrency || 'USD',
    textOnly: true,
  });
 }

function getPrimaryAccountLabel(
  purpose: SmartEntryPurpose | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
   switch (purpose) {
    case 'personal_expense':
      return t('smartEntryModal.primaryAccountLabels.spendFrom', { ns: 'portal' });
    case 'borrowed_money':
      return t('smartEntryModal.primaryAccountLabels.addBorrowedMoneyTo', { ns: 'portal' });
    case 'managed_money':
      return t('smartEntryModal.primaryAccountLabels.trackTheirMoneyIn', { ns: 'portal' });
    case 'managed_return':
      return t('smartEntryModal.primaryAccountLabels.returnMoneyFrom', { ns: 'portal' });
    case 'loan_repayment':
      return t('smartEntryModal.primaryAccountLabels.payBackFrom', { ns: 'portal' });
    case 'transfer':
      return t('smartEntryModal.primaryAccountLabels.moveMoneyFrom', { ns: 'portal' });
    default:
      return t('smartEntryModal.primaryAccountLabels.addMoneyTo', { ns: 'portal' });
   }
 }

function getAccountTypeLabel(
  type: SuggestedAccount['type'] | string | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (type) {
    case 'cash':
      return t('accounts.types.cash', { ns: 'portal' });
    case 'bank':
      return t('accounts.types.bank', { ns: 'portal' });
    case 'credit_card':
      return t('accounts.types.creditCard', { ns: 'portal' });
    case 'savings':
      return t('accounts.types.savings', { ns: 'portal' });
    case 'digital_wallet':
      return t('accounts.types.digitalWallet', { ns: 'portal' });
    case 'investment':
      return t('accounts.types.investment', { ns: 'portal' });
    default:
      return t('accounts.types.other', { ns: 'portal' });
  }
}

function isSubscriptionReview(review: SmartEntryReview | null | undefined): review is SmartEntryReview & {
  subscription: NonNullable<SmartEntryReview['subscription']>;
} {
  return !!review?.subscription;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSmartEntrySuccessEntities(result: unknown): SmartPocketDataEntity[] {
  const entities = new Set<SmartPocketDataEntity>([
    'dashboard',
    'transactions',
    'financial_accounts',
    'ai_usage',
  ]);

  const executedActions = isObject(result) && Array.isArray(result.executedActions)
    ? result.executedActions.filter(isObject)
    : [];

  const hasSubscriptionChange = executedActions.some((action) => {
    const actionType = typeof action.actionType === 'string' ? action.actionType : '';
    const recordTable = typeof action.recordTable === 'string' ? action.recordTable : '';
    return actionType.startsWith('personal_subscription_') || recordTable === 'personal_subscriptions';
  });

  if (hasSubscriptionChange) {
    entities.add('personal_subscriptions');
    entities.add('recurring_transactions');
    entities.add('notifications');
  }

  return Array.from(entities);
}

function getSubscriptionPrimaryAccountLabel(
  intent: NonNullable<SmartEntryReview['subscription']>['intent'] | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (intent === 'personal_subscription_payment') {
    return t('smartEntryModal.subscription.chargeFrom', {
      ns: 'portal',
      defaultValue: 'Charge from',
    });
  }
  return t('smartEntryModal.subscription.paymentAccount', {
    ns: 'portal',
    defaultValue: 'Payment account',
  });
}

function getSubscriptionConfirmLabel(
  intent: NonNullable<SmartEntryReview['subscription']>['intent'] | undefined,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (intent) {
    case 'personal_subscription_payment':
      return t('smartEntryModal.subscription.confirmPayment', {
        ns: 'portal',
        defaultValue: 'Confirm Payment',
      });
    case 'personal_subscription_update':
      return t('smartEntryModal.subscription.confirmUpdate', {
        ns: 'portal',
        defaultValue: 'Confirm Subscription Update',
      });
    case 'personal_subscription_cancel':
      return t('smartEntryModal.subscription.confirmCancellation', {
        ns: 'portal',
        defaultValue: 'Confirm Cancellation Request',
      });
    default:
      return t('smartEntryModal.subscription.confirmCreate', {
        ns: 'portal',
        defaultValue: 'Confirm & Save Subscription',
      });
  }
}

function getSubscriptionFrequencyLabel(
  frequency: NonNullable<NonNullable<SmartEntryReview['subscription']>['billingFrequency']>,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`personalSubscriptions.frequencies.${frequency}`, {
    ns: 'portal',
    defaultValue: frequency.replace(/_/g, ' '),
  });
}

function getSubscriptionPaymentMethodLabel(
  method: NonNullable<Exclude<NonNullable<SmartEntryReview['subscription']>['paymentMethod'], null>>,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  return t(`personalSubscriptions.paymentMethods.${method}`, {
    ns: 'portal',
    defaultValue: method,
  });
}

function getContextAccountDisplayLabel(
  account: NonNullable<NonNullable<FinancialContext['accounts']>[number]> | null | undefined
) {
  if (!account) return '';
  return getFinancialAccountDisplayLabel(
    {
      name: account.name,
      currency: account.currency,
      is_system_default: account.isSystemDefault,
      system_default_type: account.systemDefaultType,
    },
    {
      includeCurrency: true,
      includeDefaultLabel: true,
    }
  );
}

function getMissingFieldLabel(
  field: ReturnType<typeof getSmartEntryMissingFields>[number],
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (field) {
    case 'purpose':
      return t('smartEntryModal.missingFields.purpose', { ns: 'portal' });
    case 'person':
      return t('smartEntryModal.missingFields.person', { ns: 'portal' });
    case 'account':
      return t('smartEntryModal.missingFields.account', { ns: 'portal' });
    case 'destinationAccount':
      return t('smartEntryModal.missingFields.destinationAccount', { ns: 'portal' });
    case 'amount':
      return t('smartEntryModal.missingFields.amount', { ns: 'portal' });
    case 'currency':
      return t('smartEntryModal.missingFields.currency', { ns: 'portal' });
    case 'subscription':
      return t('smartEntryModal.missingFields.subscription', {
        ns: 'portal',
        defaultValue: 'subscription',
      });
    case 'billingFrequency':
      return t('smartEntryModal.missingFields.billingFrequency', {
        ns: 'portal',
        defaultValue: 'billing frequency',
      });
    case 'cancelEffectiveDate':
      return t('smartEntryModal.missingFields.cancelEffectiveDate', {
        ns: 'portal',
        defaultValue: 'cancellation date',
      });
    case 'paymentHappenedNow':
      return t('smartEntryModal.missingFields.paymentHappenedNow', {
        ns: 'portal',
        defaultValue: 'payment confirmation',
      });
    default:
      return field;
  }
}

function getPurposeOptionText(
  optionId: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (optionId) {
    case 'personal_income':
      return {
        label: t('smartEntryModal.purposeOptions.personalIncome.label', { ns: 'portal' }),
        description: t('smartEntryModal.purposeOptions.personalIncome.description', { ns: 'portal' }),
      };
    case 'borrowed_money':
      return {
        label: t('smartEntryModal.purposeOptions.borrowedMoney.label', { ns: 'portal' }),
        description: t('smartEntryModal.purposeOptions.borrowedMoney.description', { ns: 'portal' }),
      };
    case 'managed_money':
      return {
        label: t('smartEntryModal.purposeOptions.managedMoney.label', { ns: 'portal' }),
        description: t('smartEntryModal.purposeOptions.managedMoney.description', { ns: 'portal' }),
      };
    case 'reimbursement':
      return {
        label: t('smartEntryModal.purposeOptions.reimbursement.label', { ns: 'portal' }),
        description: t('smartEntryModal.purposeOptions.reimbursement.description', { ns: 'portal' }),
      };
    default:
      return null;
  }
}

function getCompactSummaryRowsLocalized(
  instruction: ParsedFinancialInstruction,
  t: (key: string, options?: Record<string, unknown>) => string,
  fallbackCurrency?: string
) {
  return instruction.actions
    .filter((action) => action.actionType !== 'create_account' && action.actionType !== 'create_managed_person')
    .map((action) => {
      const amount = typeof action.amount === 'number'
        ? formatMoney(action.amount, action.currency, fallbackCurrency)
        : t('smartEntryModal.summary.amountNeeded', { ns: 'portal' });
      const personName = action.personName || t('smartEntryModal.summary.someone', { ns: 'portal' });
      const categoryName = action.categoryName
        ? translateSystemCategoryName(action.categoryName, (key, options) =>
            t(key, { ...(options || {}), ns: 'common' })
          )
        : '';

      switch (action.actionType) {
        case 'income':
          return t('smartEntryModal.summaryRows.income', { ns: 'portal', amount });
        case 'loan_received':
          return t('smartEntryModal.summaryRows.loanReceived', { ns: 'portal', amount, personName });
        case 'money_received_from_person':
          return t('smartEntryModal.summaryRows.receivedFromPerson', { ns: 'portal', amount, personName });
        case 'expense':
        case 'expense_from_held_balance':
          return t('smartEntryModal.summaryRows.expense', {
            ns: 'portal',
            amount,
            categoryName,
          }).trim();
        case 'loan_repayment':
          return t('smartEntryModal.summaryRows.loanRepayment', { ns: 'portal', amount, personName });
        case 'reimbursement_payment':
          return t('smartEntryModal.summaryRows.reimbursementPayment', { ns: 'portal', amount, personName });
        case 'money_returned_to_person':
          return t('smartEntryModal.summaryRows.moneyReturned', { ns: 'portal', amount, personName });
        case 'transfer':
          return t('smartEntryModal.summaryRows.transfer', {
            ns: 'portal',
            amount,
            sourceAccount: action.accountName || t('smartEntryModal.summary.oneAccount', { ns: 'portal' }),
            destinationAccount: action.destinationAccountName || t('smartEntryModal.summary.anotherAccount', { ns: 'portal' }),
          });
        default:
          return action.description || t('smartEntryModal.summaryRows.fallback', {
            ns: 'portal',
            actionType: action.actionType,
            amount,
          });
      }
    });
}

function getUnderstandingLinesLocalized(
  instruction: ParsedFinancialInstruction,
  t: (key: string, options?: Record<string, unknown>) => string,
  fallbackCurrency?: string
) {
  return instruction.actions
    .filter((action) => action.actionType !== 'create_account' && action.actionType !== 'create_managed_person')
    .map((action) => {
      const amount = typeof action.amount === 'number'
        ? formatMoney(action.amount, action.currency, fallbackCurrency)
        : t('smartEntryModal.understanding.unknownAmount', { ns: 'portal' });
      const personName = action.personName || t('smartEntryModal.understanding.someone', { ns: 'portal' });
      const categoryName = action.categoryName
        ? translateSystemCategoryName(action.categoryName, (key, options) =>
            t(key, { ...(options || {}), ns: 'common' })
          )
        : '';

      switch (action.actionType) {
        case 'income':
          return t('smartEntryModal.understanding.income', { ns: 'portal', personName, amount });
        case 'expense':
          return t('smartEntryModal.understanding.expense', { ns: 'portal', amount, categoryName }).trim();
        case 'loan_received':
          return t('smartEntryModal.understanding.loanReceived', { ns: 'portal', personName, amount });
        case 'loan_repayment':
          return t('smartEntryModal.understanding.loanRepayment', { ns: 'portal', personName, amount });
        case 'money_received_from_person':
          return t('smartEntryModal.understanding.moneyReceivedFromPerson', { ns: 'portal', personName, amount });
        case 'money_returned_to_person':
          return t('smartEntryModal.understanding.moneyReturnedToPerson', { ns: 'portal', personName, amount });
        case 'expense_from_held_balance':
          return t('smartEntryModal.understanding.expenseFromHeldBalance', { ns: 'portal', personName, amount, categoryName }).trim();
        case 'expense_paid_for_person':
          return t('smartEntryModal.understanding.expensePaidForPerson', { ns: 'portal', personName, amount, categoryName }).trim();
        case 'reimbursement_payment':
          return t('smartEntryModal.understanding.reimbursementPayment', { ns: 'portal', personName, amount });
        case 'transfer':
          return t('smartEntryModal.understanding.transfer', {
            ns: 'portal',
            amount,
            sourceAccount: action.accountName || t('smartEntryModal.understanding.oneAccount', { ns: 'portal' }),
            destinationAccount: action.destinationAccountName || t('smartEntryModal.understanding.anotherAccount', { ns: 'portal' }),
          });
        default:
          return action.description || t('smartEntryModal.understanding.fallback', {
            ns: 'portal',
            actionType: action.actionType,
            amount,
          });
      }
    });
}

function getLocalizedAmountPrompt(
  review: SmartEntryReview,
  instruction: ParsedFinancialInstruction,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  const actions = instruction.actions.filter(
    (action) => action.actionType !== 'create_account' && action.actionType !== 'create_managed_person'
  );
  const targetAction = typeof review.amountActionIndex === 'number'
    ? actions[review.amountActionIndex]
    : actions.find((action) => typeof action.amount !== 'number');
  const contextLabel = targetAction?.categoryName || targetAction?.description;

  if (!contextLabel) {
    return t('smartEntryModal.amountQuestion', { ns: 'portal' });
  }

  return t('smartEntryModal.amountQuestionWithContext', {
    ns: 'portal',
    context: translateSystemCategoryName(contextLabel, (key, options) =>
      t(key, { ...(options || {}), ns: 'common' })
    ),
  });
}

function translateSmartEntryWarning(
  warning: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (warning) {
    case 'The purpose of this money is unclear.':
      return t('smartEntryModal.warnings.purposeUnclear', { ns: 'portal' });
    case 'The expense amount is not explicit yet.':
    case 'The expense amount needs confirmation.':
      return t('smartEntryModal.warnings.expenseAmountMissing', { ns: 'portal' });
    case 'Could not determine intent from input':
      return t('smartEntryModal.warnings.intentUnknown', { ns: 'portal' });
    default:
      return warning;
  }
}

function getLocalizedDocumentValidationError(
  t: (key: string, options?: Record<string, unknown>) => string,
  error: unknown
) {
  switch (classifyTransactionDocumentError(error)) {
    case 'empty_file':
      return t('transactions.documentReview.errors.emptyFile', { ns: 'portal' });
    case 'invalid_type':
      return t('transactions.documentReview.errors.invalidType', { ns: 'portal' });
    case 'document_too_large':
      return t('transactions.documentReview.errors.fileTooLarge', { ns: 'portal' });
    case 'pdf_too_many_pages':
      return t('transactions.documentReview.errors.pdfTooManyPages', { ns: 'portal' });
    default:
      return t('transactions.documentReview.errors.invalidType', { ns: 'portal' });
  }
}

function isReceiptInsightQuestion(value: string) {
  const question = value.trim().toLowerCase();
  return (
    /how much.*spend on /.test(question)
    || /where did i last buy /.test(question)
    || /average price/.test(question)
    || /increased most in price|price increased most/.test(question)
    || /what items do i buy regularly|what do i buy regularly|which items do i buy regularly/.test(question)
  );
}

export default function AIAssistantModal({ onClose, defaultMode = 'text' }: AIAssistantModalProps) {
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL, language: uiLanguage } = useLanguage();
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const subscriptionDefaultAppliedRef = useRef<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<AssistantStep>('entry');
  const [mode, setMode] = useState<EntryMode>(defaultMode);
  const [textInput, setTextInput] = useState('');
  const [spokenLanguage, setSpokenLanguage] = useState<SmartEntrySpokenLanguage>('auto');
  const [parsed, setParsed] = useState<ParsedFinancialInstruction | null>(null);
  const [reviewState, setReviewState] = useState<SmartEntryReview | null>(null);
  const [transcript, setTranscript] = useState('');
  const [originalTranscript, setOriginalTranscript] = useState('');
  const [originalTranscriptLanguage, setOriginalTranscriptLanguage] = useState<string | null>(null);
  const [translationNotice, setTranslationNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [apiError, setApiError] = useState<AIErrorPayload | null>(null);
  const [usageSummary, setUsageSummary] = useState<AIUsageSummary | null>(null);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; count: number } | null>(null);
  const [receiptInsightAnswer, setReceiptInsightAnswer] = useState<ReceiptInsightAnswer | null>(null);
  const [isAIConfigured, setIsAIConfigured] = useState<boolean | null>(null);
  const [voiceMaxSeconds, setVoiceMaxSeconds] = useState(120);
  const [contextSnapshot, setContextSnapshot] = useState<FinancialContext | null>(null);
  const [accountDraftTarget, setAccountDraftTarget] = useState<'account' | 'destinationAccount' | null>(null);
  const [accountDraft, setAccountDraft] = useState<{
    field: 'account' | 'destinationAccount';
    name: string;
    type: SuggestedAccount['type'];
    currency: string;
    includeInTotal: boolean;
  } | null>(null);
  const [personDraft, setPersonDraft] = useState<{
    name: string;
    relationship: NonNullable<NonNullable<SmartEntryReview['person']>['relationship']>;
    notes: string;
  } | null>(null);
  const [documentReviewFile, setDocumentReviewFile] = useState<File | null>(null);
  const displayLanguage = useMemo<SmartEntryDisplayLanguage>(
    () => normalizeDisplayLanguage(uiLanguage),
    [uiLanguage]
  );

  // Check AI configuration on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('ai_settings')
          .select('ai_enabled')
          .eq('singleton_key', 'global')
          .single();
        setIsAIConfigured(data?.ai_enabled === true);
      } catch {
        setIsAIConfigured(false);
      }
    };
    checkConfig();
  }, []);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    const focusInitialElement = () => {
      const autofocusTarget = dialogRef.current?.querySelector<HTMLElement>('[data-autofocus="true"]');
      (autofocusTarget || closeButtonRef.current)?.focus();
    };

    const timeoutId = window.setTimeout(focusInitialElement, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);

      if (focusableElements.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement as HTMLElement | null;

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      lastFocusedRef.current?.focus();
    };
  }, [mounted, onClose]);

  const getAuthToken = async (): Promise<string> => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error(t('errors.sessionExpired', { ns: 'common' }));
    return session.access_token;
  };

  const getErrorText = (value: unknown) => {
    if (typeof value === 'string') return value;
    if (isObject(value) && typeof value.message === 'string') return value.message;
    return '';
  };

  const parseUsageSummary = (value: unknown): AIUsageSummary | null => {
    if (!isObject(value)) return null;

    const asNumber = (input: unknown) => typeof input === 'number' && Number.isFinite(input) ? input : undefined;
    const asString = (input: unknown) => typeof input === 'string' ? input : undefined;

    return {
      planName: asString(value.planName),
      planCode: asString(value.planCode),
      subscriptionStatus: asString(value.subscriptionStatus),
      requestsToday: asNumber(value.requestsToday),
      dailyRequestLimit: asNumber(value.dailyRequestLimit),
      creditsAllocated: asNumber(value.creditsAllocated),
      creditsConsumed: asNumber(value.creditsConsumed),
      creditsReserved: asNumber(value.creditsReserved),
      creditsRemaining: asNumber(value.creditsRemaining),
      cycleStart: asString(value.cycleStart),
      cycleEnd: asString(value.cycleEnd),
      trialEndsAt: asString(value.trialEndsAt),
      currentPeriodEnd: asString(value.currentPeriodEnd),
      monthlyVoiceSeconds: asNumber(value.monthlyVoiceSeconds),
      voiceSecondsUsed: asNumber(value.voiceSecondsUsed),
    };
  };

  const parseErrorPayload = (value: unknown): AIErrorPayload | null => {
    if (!isObject(value) || typeof value.message !== 'string' || typeof value.code !== 'string' || typeof value.category !== 'string') {
      return null;
    }

    return {
      code: value.code,
      category: value.category as AIErrorPayload['category'],
      message: value.message,
      limitType: typeof value.limitType === 'string' ? value.limitType as AIErrorPayload['limitType'] : undefined,
      requestId: typeof value.requestId === 'string' ? value.requestId : undefined,
      retryAfterSeconds: typeof value.retryAfterSeconds === 'number' ? value.retryAfterSeconds : undefined,
      requiredCredits: typeof value.requiredCredits === 'number' ? value.requiredCredits : undefined,
      remainingCredits: typeof value.remainingCredits === 'number' ? value.remainingCredits : undefined,
    };
  };

  const handleVoiceFailure = useCallback((payload: unknown, fallbackMessage: string) => {
    const responseBody = isObject(payload) ? payload : {};
    const structuredError = parseErrorPayload(responseBody.error);
    const usage = parseUsageSummary(responseBody.usage);

    setApiError(structuredError);
    setUsageSummary(usage);
    setErrorMessage(
      structuredError?.message ||
      (typeof responseBody.errorMessage === 'string' ? responseBody.errorMessage : '') ||
      fallbackMessage
    );
    setStep('failed');
  }, []);

  const handleApiFailure = useCallback((payload: unknown, fallbackMessage: string) => {
    const responseBody = isObject(payload) ? payload : {};
    const structuredError = parseErrorPayload(responseBody.error);
    const usage = parseUsageSummary(responseBody.usage);

    setApiError(structuredError);
    setUsageSummary(usage);

    if (structuredError && (structuredError.category === 'usage_limit' || structuredError.category === 'subscription')) {
      setErrorMessage('');
      setStep('limit');
      return;
    }

    setErrorMessage(
      structuredError?.message ||
      (typeof responseBody.errorMessage === 'string' ? responseBody.errorMessage : '') ||
      getErrorText(responseBody.error) ||
      fallbackMessage
    );
    setStep('failed');
  }, []);

  const formatShortDateTime = (value: string | undefined) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString(uiLanguage || undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatRelativeHours = (seconds: number | undefined) => {
    if (typeof seconds !== 'number' || seconds <= 0) return null;
    const hours = Math.max(1, Math.ceil(seconds / 3600));
    return t('smartEntryModal.limit.availableAgainIn', {
      ns: 'portal',
      count: hours,
    });
  };

  const UsageProgressBar = ({
    label,
    used,
    total,
  }: {
    label: string;
    used: number;
    total: number;
  }) => {
    const safeUsed = Math.max(0, used);
    const safeTotal = Math.max(0, total);
    const pct = safeTotal > 0 ? Math.min(100, Math.round((safeUsed / safeTotal) * 100)) : 0;

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{label}</span>
          <span className="font-600 text-foreground">
            {t('smartEntryModal.progress.usedOf', {
              ns: 'portal',
              used: safeUsed,
              total: safeTotal,
            })}
          </span>
        </div>
        <div className="h-2 rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              pct >= 100 ? 'bg-negative' : pct >= 80 ? 'bg-warning' : 'bg-accent'
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  };

  const limitView = (() => {
    const error = apiError;
    const usage = usageSummary;
    const creditsAllocated = Math.max(0, usage?.creditsAllocated || 0);
    const creditsConsumed = Math.max(0, usage?.creditsConsumed || 0);
    const creditsReserved = Math.max(0, usage?.creditsReserved || 0);
    const creditsUsed = creditsConsumed + creditsReserved;
    const creditsRemaining = typeof error?.remainingCredits === 'number'
      ? error.remainingCredits
      : Math.max(0, usage?.creditsRemaining ?? creditsAllocated - creditsUsed);
    const requestsToday = Math.max(0, usage?.requestsToday || 0);
    const dailyLimit = Math.max(0, usage?.dailyRequestLimit || 0);

    if (!error) {
      return {
        title: t('smartEntryModal.limit.unavailableTitle', { ns: 'portal' }),
        description: t('smartEntryModal.limit.unavailableDescription', { ns: 'portal' }),
        primaryLabel: t('smartEntryModal.limit.viewPlans', { ns: 'portal' }),
      };
    }

    if (error.code === 'DAILY_REQUEST_LIMIT_REACHED' || error.limitType === 'daily_requests') {
      return {
        title: t('smartEntryModal.limit.dailyLimitTitle', { ns: 'portal' }),
        description: t('smartEntryModal.limit.dailyLimitDescription', {
          ns: 'portal',
          count: dailyLimit || requestsToday,
        }),
        primaryLabel: t('smartEntryModal.limit.viewPlan', { ns: 'portal' }),
        requestsToday,
        dailyLimit,
        creditsUsed,
        creditsAllocated,
        creditsRemaining,
        resetLabel: formatRelativeHours(error.retryAfterSeconds),
      };
    }

    if (error.code === 'MONTHLY_CREDIT_LIMIT_REACHED' || error.limitType === 'monthly_credits') {
      return {
        title: t('smartEntryModal.limit.monthlyCreditsTitle', { ns: 'portal' }),
        description: t('smartEntryModal.limit.monthlyCreditsDescription', {
          ns: 'portal',
          count: creditsAllocated || creditsUsed,
        }),
        primaryLabel: t('smartEntryModal.limit.viewPlans', { ns: 'portal' }),
        creditsUsed,
        creditsAllocated,
        creditsRemaining,
        renewalLabel: formatShortDateTime(usage?.cycleEnd),
      };
    }

    if (error.code === 'INSUFFICIENT_AI_CREDITS' || error.limitType === 'insufficient_credits') {
      return {
        title: t('smartEntryModal.limit.insufficientCreditsTitle', { ns: 'portal' }),
        description: t('smartEntryModal.limit.insufficientCreditsDescription', {
          ns: 'portal',
          required: error.requiredCredits || 0,
          remaining: creditsRemaining,
        }),
        primaryLabel: t('smartEntryModal.limit.viewPlans', { ns: 'portal' }),
        creditsUsed,
        creditsAllocated,
        creditsRemaining,
        requiredCredits: error.requiredCredits,
        renewalLabel: formatShortDateTime(usage?.cycleEnd),
      };
    }

    if (error.code === 'TRIAL_EXPIRED' || error.limitType === 'trial_expired') {
      return {
        title: t('smartEntryModal.limit.trialExpiredTitle', { ns: 'portal' }),
        description: error.message,
        primaryLabel: t('smartEntryModal.limit.viewPlans', { ns: 'portal' }),
        creditsUsed,
        creditsAllocated,
        creditsRemaining,
        renewalLabel: formatShortDateTime(usage?.trialEndsAt || usage?.cycleEnd),
      };
    }

    return {
      title: t('smartEntryModal.limit.subscriptionExpiredTitle', { ns: 'portal' }),
      description: error.message,
      primaryLabel: t('smartEntryModal.limit.viewPlans', { ns: 'portal' }),
      creditsUsed,
      creditsAllocated,
      creditsRemaining,
      renewalLabel: formatShortDateTime(usage?.currentPeriodEnd || usage?.cycleEnd),
    };
  })();

   const previewInstruction = parsed && reviewState
     ? applySmartEntryReviewToInstruction({
         ...parsed,
         review: reviewState,
       })
     : null;
  const isSubscriptionFlow = isSubscriptionReview(reviewState);
  const currentMissingFields = reviewState
    ? getSmartEntryReviewMissingFields(reviewState)
    : [];
  const missingFieldSet = useMemo(() => new Set(currentMissingFields), [currentMissingFields]);
  const unresolvedReviewFields = currentMissingFields.length > 0
    ? currentMissingFields.map((field) => getMissingFieldLabel(field, t))
    : [];
  const compactSummaryRows = previewInstruction
    ? getCompactSummaryRowsLocalized(previewInstruction, t, contextSnapshot?.defaultCurrency)
    : [];
  const understandingLines = previewInstruction
    ? getUnderstandingLinesLocalized(previewInstruction, t, contextSnapshot?.defaultCurrency)
    : [];
  const isCompactSubscriptionReview = step === 'confirming' && isSubscriptionFlow;
  const reviewSectionClass = isSubscriptionFlow
    ? 'rounded-xl border border-border bg-muted/20 p-3 sm:p-3.5 space-y-2.5'
    : 'rounded-2xl border border-border bg-muted/20 p-4 space-y-3';
  const reviewInnerCardClass = isSubscriptionFlow
    ? 'rounded-lg bg-card p-2.5'
    : 'rounded-xl bg-card p-3';
  const reviewFieldGroupClass = isSubscriptionFlow ? 'space-y-1.5' : 'space-y-2';
  const amountPromptLabel = previewInstruction && reviewState
    ? getLocalizedAmountPrompt(reviewState, previewInstruction, t)
    : t('smartEntryModal.amountFallback', { ns: 'portal' });
   const totals = previewInstruction ? getSmartEntryTotals(previewInstruction) : null;
  const accounts = contextSnapshot?.accounts || [];
   const people = contextSnapshot?.people || [];
  const adaptedAccounts = useMemo(
    () =>
      accounts.map((account) => ({
        id: account.id,
        name: account.name,
        account_type: account.type,
        currency: account.currency,
        is_active: account.isActive !== false,
        include_in_total: account.includeInTotal,
        ownership_type: account.ownershipType,
        is_system_default: account.isSystemDefault,
        system_default_type: account.systemDefaultType,
        sort_order: account.sortOrder,
        created_at: account.createdAt,
      })),
    [accounts]
  );
  const subscriptionAccounts = useMemo(() => {
    const personalAccounts = getActivePersonalFinancialAccounts(adaptedAccounts);
    const ordered = personalAccounts
      .map((account) => accounts.find((item) => item.id === account.id) || null)
      .filter((account): account is NonNullable<typeof accounts[number]> => !!account);
    const selectedSubscriptionAccountId = reviewState?.account?.accountId;

    if (selectedSubscriptionAccountId && !ordered.some((account) => account.id === selectedSubscriptionAccountId)) {
      const selected = accounts.find((account) => account.id === selectedSubscriptionAccountId);
      if (selected) {
        return [selected, ...ordered];
      }
    }

    return ordered;
  }, [accounts, adaptedAccounts, reviewState?.account?.accountId]);
  const defaultSubscriptionCashAccount = useMemo(() => {
    const account = getDefaultPersonalAccount(adaptedAccounts, 'personal_cash');
    return account ? accounts.find((item) => item.id === account.id) || null : null;
  }, [accounts, adaptedAccounts]);
  const eligiblePrimaryAccounts = getEligibleAccountsForPurpose({
    purpose: reviewState?.purpose,
    accounts,
    field: 'account',
    personName: reviewState?.person?.name,
    people,
  });
  const eligibleDestinationAccounts = getEligibleAccountsForPurpose({
    purpose: reviewState?.purpose,
    accounts,
    field: 'destinationAccount',
    personName: reviewState?.person?.name,
    people,
  });
  const primaryAccountOptions = isSubscriptionFlow ? subscriptionAccounts : eligiblePrimaryAccounts;
   const personSelectValue = reviewState?.person?.mode === 'existing'
     ? reviewState.person.personId || ''
     : reviewState?.person?.mode === 'create'
       ? '__create__'
       : '';
   const primaryAccountSelectValue = reviewState?.account?.mode === 'existing'
     ? reviewState.account.accountId || ''
     : reviewState?.account?.mode === 'create'
       ? '__create__'
       : '';
   const destinationAccountSelectValue = reviewState?.destinationAccount?.mode === 'existing'
     ? reviewState.destinationAccount.accountId || ''
     : reviewState?.destinationAccount?.mode === 'create'
       ? '__create__'
       : '';
   const selectedPerson = reviewState?.person?.personId
     ? people.find((person) => person.id === reviewState.person?.personId) || null
     : (
         people.find(
           (person) =>
             (person.fullName || '').trim().toLowerCase() === (reviewState?.person?.name || '').trim().toLowerCase()
         ) || null
       );
   const selectedAccount = reviewState?.account?.accountId
   ? accounts.find((account) => account.id === reviewState.account?.accountId) || primaryAccountOptions.find((account) => account.id === reviewState.account?.accountId) || null
     : (
        primaryAccountOptions.find(
           (account) => (account.name || '').trim().toLowerCase() === (reviewState?.account?.name || '').trim().toLowerCase()
         ) || null
       );
   const selectedDestinationAccount = reviewState?.destinationAccount?.accountId
    ? eligibleDestinationAccounts.find((account) => account.id === reviewState.destinationAccount?.accountId) || null
     : (
        eligibleDestinationAccounts.find(
           (account) =>
             (account.name || '').trim().toLowerCase() ===
             (reviewState?.destinationAccount?.name || '').trim().toLowerCase()
         ) || null
       );

  const normalizeReviewCurrency = useCallback(
    (value?: string) =>
      sanitizeCurrency(value, {
        fallbackCurrency: contextSnapshot?.defaultCurrency,
        allowedCurrencies: contextSnapshot?.currencies,
      }),
    [contextSnapshot?.currencies, contextSnapshot?.defaultCurrency]
  );

  const hasMissingField = useCallback(
    (field: ReturnType<typeof getSmartEntryReviewMissingFields>[number]) => missingFieldSet.has(field),
    [missingFieldSet]
  );

  const getFieldErrorMessage = useCallback(
    (field: ReturnType<typeof getSmartEntryReviewMissingFields>[number]) => {
      if (!hasMissingField(field)) return null;
      switch (field) {
        case 'subscription':
          return t('smartEntryModal.subscription.fieldErrors.subscription', {
            ns: 'portal',
            defaultValue: 'Enter or select the subscription.',
          });
        case 'billingFrequency':
          return t('smartEntryModal.subscription.fieldErrors.billingFrequency', {
            ns: 'portal',
            defaultValue: 'Select a billing frequency.',
          });
        case 'amount':
          return t('smartEntryModal.subscription.fieldErrors.amount', {
            ns: 'portal',
            defaultValue: 'Enter an amount.',
          });
        case 'account':
          return t('smartEntryModal.subscription.fieldErrors.account', {
            ns: 'portal',
            defaultValue: 'Select a payment account.',
          });
        case 'cancelEffectiveDate':
          return t('smartEntryModal.subscription.fieldErrors.cancelEffectiveDate', {
            ns: 'portal',
            defaultValue: 'Select a cancellation date.',
          });
        case 'person':
          return t('smartEntryModal.fieldErrors.person', {
            ns: 'portal',
            defaultValue: 'Select a person.',
          });
        case 'destinationAccount':
          return t('smartEntryModal.fieldErrors.destinationAccount', {
            ns: 'portal',
            defaultValue: 'Select a destination account.',
          });
        case 'purpose':
          return t('smartEntryModal.fieldErrors.purpose', {
            ns: 'portal',
            defaultValue: 'Confirm the purpose.',
          });
        case 'currency':
          return t('smartEntryModal.fieldErrors.currency', {
            ns: 'portal',
            defaultValue: 'Select a currency.',
          });
        default:
          return t('smartEntryModal.fieldErrors.required', {
            ns: 'portal',
            defaultValue: 'This field is required.',
          });
      }
    },
    [hasMissingField, t]
  );

   const updateReview = useCallback((updater: (current: SmartEntryReview) => SmartEntryReview) => {
     setReviewState((current) => {
       if (!current) return current;
       const next = updater(current);
       return {
         ...next,
         missing: getSmartEntryReviewMissingFields(next),
       };
     });
   }, []);

  useEffect(() => {
    if (!parsed?.requestId || !reviewState?.subscription) return;
    if (subscriptionDefaultAppliedRef.current === parsed.requestId) return;

    const hasExplicitDetectedSubscriptionAccount =
      reviewState.account?.mode === 'create'
      || !!reviewState.account?.accountId
      || !!reviewState.account?.name?.trim()
      || !!reviewState.subscription.financialAccountHint?.trim();

    subscriptionDefaultAppliedRef.current = parsed.requestId;

    if (!defaultSubscriptionCashAccount || hasExplicitDetectedSubscriptionAccount) {
      return;
    }

    updateReview((current) => {
      if (!current.subscription) return current;

      return {
        ...current,
        account: {
          required: current.subscription.accountRequired,
          mode: 'existing',
          accountId: defaultSubscriptionCashAccount.id,
          name: defaultSubscriptionCashAccount.name,
          type: defaultSubscriptionCashAccount.type as SuggestedAccount['type'],
          currency: normalizeReviewCurrency(defaultSubscriptionCashAccount.currency || current.currency),
          includeInTotal: true,
          scope: 'personal',
          managedPersonId: undefined,
          managedPersonName: undefined,
        },
      };
    });
  }, [
    defaultSubscriptionCashAccount,
    normalizeReviewCurrency,
    parsed?.requestId,
    reviewState?.account?.accountId,
    reviewState?.account?.mode,
    reviewState?.account?.name,
    reviewState?.subscription,
    reviewState?.subscription?.financialAccountHint,
    updateReview,
  ]);

  const handleReviewAmountChange = useCallback((value: string) => {
    const trimmed = value.trim();
    const parsedAmount = trimmed ? Number(trimmed) : undefined;
    updateReview((current) => ({
      ...current,
      amount: typeof parsedAmount === 'number' && Number.isFinite(parsedAmount) ? parsedAmount : undefined,
      amountNeedsConfirmation: !(typeof parsedAmount === 'number' && Number.isFinite(parsedAmount)),
    }));
  }, [updateReview]);

  const handleUseFullAmount = useCallback(() => {
    if (typeof reviewState?.amountQuickOptionValue !== 'number') return;
    updateReview((current) => ({
      ...current,
      amount: current.amountQuickOptionValue,
      amountNeedsConfirmation: false,
    }));
  }, [reviewState?.amountQuickOptionValue, updateReview]);

  const updateSubscriptionReview = useCallback((
    updater: (current: NonNullable<SmartEntryReview['subscription']>) => NonNullable<SmartEntryReview['subscription']>
  ) => {
    updateReview((current) => {
      if (!current.subscription) return current;
      const nextSubscription = updater(current.subscription);
      const normalizedBillingFrequency = normalizeSubscriptionBillingFrequencyInput(nextSubscription.billingFrequency);
      const nextCurrency = normalizeReviewCurrency(nextSubscription.currencyCode || current.currency);
      const nextAccountRequired =
        nextSubscription.intent === 'personal_subscription_payment' || nextSubscription.paymentHappenedNow === true;

      return {
        ...current,
        currency: nextCurrency,
        subscription: {
          ...nextSubscription,
          billingFrequency: normalizedBillingFrequency,
          currencyCode: nextCurrency,
          accountRequired: nextAccountRequired,
        },
        account: current.account
          ? {
              ...current.account,
              required: nextAccountRequired,
              currency: normalizeReviewCurrency(current.account.currency || nextCurrency),
              includeInTotal: true,
              scope: 'personal',
            }
          : nextAccountRequired
            ? {
                required: true,
                currency: nextCurrency,
                includeInTotal: true,
                scope: 'personal',
              }
            : current.account,
      };
    });
  }, [normalizeReviewCurrency, updateReview]);

  const handleSubscriptionSelectionChange = useCallback((value: string) => {
    updateReview((current) => {
      if (!current.subscription) return current;

      if (!value) {
        return {
          ...current,
          subscription: {
            ...current.subscription,
            subscriptionId: undefined,
          },
        };
      }

      const option = current.subscription.subscriptionOptions?.find((item) => item.subscriptionId === value);
      const matchedSubscription = contextSnapshot?.subscriptions?.find((item) => item.id === value);
      const matchedAccount = matchedSubscription?.financialAccountId
        ? subscriptionAccounts.find((account) => account.id === matchedSubscription.financialAccountId) || null
        : null;

      return {
        ...current,
        currency: normalizeReviewCurrency(option?.currencyCode || matchedSubscription?.currencyCode || current.currency),
        subscription: {
          ...current.subscription,
          subscriptionId: value,
          subscriptionName: option?.name || matchedSubscription?.name || current.subscription.subscriptionName,
          provider: option?.provider || matchedSubscription?.provider || current.subscription.provider,
          amount: typeof option?.amount === 'number' ? option.amount : current.subscription.amount,
          currencyCode: normalizeReviewCurrency(option?.currencyCode || matchedSubscription?.currencyCode || current.currency),
          billingFrequency: normalizeSubscriptionBillingFrequencyInput(current.subscription.billingFrequency)
            || normalizeSubscriptionBillingFrequencyInput(option?.billingFrequency || matchedSubscription?.billingFrequency),
        },
        account: matchedAccount
          ? {
              required: current.subscription.accountRequired,
              mode: 'existing',
              accountId: matchedAccount.id,
              name: matchedAccount.name,
              type: matchedAccount.type as SuggestedAccount['type'],
              currency: normalizeReviewCurrency(matchedAccount.currency),
              includeInTotal: true,
              scope: 'personal',
            }
          : current.account,
      };
    });
  }, [contextSnapshot?.subscriptions, normalizeReviewCurrency, subscriptionAccounts, updateReview]);

  const handleSubscriptionReminderToggle = useCallback((days: number) => {
    updateSubscriptionReview((current) => {
      const selected = new Set(current.reminderDaysBefore || []);
      if (selected.has(days)) {
        selected.delete(days);
      } else {
        selected.add(days);
      }

      return {
        ...current,
        reminderDaysBefore: Array.from(selected).sort((left, right) => left - right),
      };
    });
  }, [updateSubscriptionReview]);

  const syncManagedAccount = useCallback((
     current: SmartEntryReview,
     personName: string | undefined,
     personId: string | undefined
   ): SmartEntryReview['account'] => {
     if (!current.account?.required) return current.account;
    const suggestedName = getManagedAccountName(personName);
    const matchedAccount = getEligibleAccountsForPurpose({
      purpose: current.purpose,
      accounts,
      field: 'account',
      personName,
      people,
    }).find(
      (account) => (account.name || '').trim().toLowerCase() === suggestedName.trim().toLowerCase()
    );
     const nextSelection: NonNullable<SmartEntryReview['account']> = {
       ...current.account,
      mode: matchedAccount ? 'existing' : undefined,
      accountId: matchedAccount?.id,
      name: matchedAccount?.name || suggestedName,
      type: (matchedAccount?.type as SuggestedAccount['type']) || inferAccountType(suggestedName),
      currency: normalizeReviewCurrency(matchedAccount?.currency || current.account.currency || current.currency),
       includeInTotal: false,
       scope: 'managed' as const,
       managedPersonId: personId,
       managedPersonName: personName,
     };
     return nextSelection;
  }, [accounts, people]);

  const resetRequestState = useCallback((options?: {
    preserveInput?: boolean;
    preserveMode?: boolean;
    preserveLanguage?: boolean;
    preserveTranscriptArtifacts?: boolean;
  }) => {
    setStep('entry');
    setTextInput(options?.preserveInput ? textInput : '');
    setTranscript('');
    setOriginalTranscript(options?.preserveTranscriptArtifacts ? originalTranscript : '');
    setOriginalTranscriptLanguage(options?.preserveTranscriptArtifacts ? originalTranscriptLanguage : null);
    setTranslationNotice(options?.preserveTranscriptArtifacts ? translationNotice : '');
    setParsed(null);
    setReviewState(null);
    setErrorMessage('');
    setApiError(null);
    setUsageSummary(null);
    setExecutionResult(null);
    setReceiptInsightAnswer(null);
    setContextSnapshot(null);
    setAccountDraft(null);
    setPersonDraft(null);
    setAccountDraftTarget(null);
    if (!options?.preserveMode) {
      setMode(defaultMode);
    }
    if (!options?.preserveLanguage) {
      setSpokenLanguage('auto');
    }
  }, [defaultMode, originalTranscript, originalTranscriptLanguage, textInput, translationNotice]);

   const handlePurposeChange = useCallback((purpose: SmartEntryPurpose) => {
     updateReview((current) => {
       const next: SmartEntryReview = {
         ...current,
         purpose,
         purposeNeedsConfirmation: false,
       };

       if (!next.account?.required) return next;

       if (isManagedPurpose(purpose)) {
         next.account = syncManagedAccount(next, next.person?.name, next.person?.personId);
       } else {
        const fallbackPersonalAccount = getEligibleAccountsForPurpose({
          purpose,
          accounts,
          field: 'account',
          personName: next.person?.name,
          people,
        })[0];
        const currentMatchesPersonal = next.account.accountId
          ? getEligibleAccountsForPurpose({
              purpose,
              accounts,
              field: 'account',
              personName: next.person?.name,
              people,
            }).some((account) => account.id === next.account?.accountId)
          : false;
        const nextMode: NonNullable<SmartEntryReview['account']>['mode'] =
          currentMatchesPersonal ? 'existing' : (fallbackPersonalAccount ? 'existing' : undefined);
        const nextSelection: NonNullable<SmartEntryReview['account']> = {
           ...next.account,
          mode: nextMode,
          accountId: currentMatchesPersonal ? next.account.accountId : fallbackPersonalAccount?.id,
          name: currentMatchesPersonal ? next.account.name : fallbackPersonalAccount?.name,
          type: currentMatchesPersonal
            ? next.account.type
            : (fallbackPersonalAccount?.type as SuggestedAccount['type'] | undefined) || next.account.type,
          currency: normalizeReviewCurrency(
            (currentMatchesPersonal ? next.account.currency : fallbackPersonalAccount?.currency) || next.currency
          ),
           scope: 'personal',
           includeInTotal: true,
           managedPersonId: undefined,
           managedPersonName: undefined,
         };
        next.account = nextSelection;
       }

       return next;
     });
   }, [accounts, people, syncManagedAccount, updateReview]);

   const handleStartCreatePerson = useCallback(() => {
     setPersonDraft({
       name: (reviewState?.person?.name || '').trim(),
       relationship: reviewState?.person?.relationship || 'other',
       notes: reviewState?.person?.notes || '',
     });
   }, [reviewState]);

   const handleApplyCreatePerson = useCallback(() => {
     if (!personDraft?.name.trim()) return;

     updateReview((current) => {
       const next: SmartEntryReview = {
         ...current,
         person: {
           required: true,
           mode: 'create',
           name: personDraft.name.trim(),
           relationship: personDraft.relationship,
           notes: personDraft.notes.trim() || undefined,
         },
       };

       if (isManagedPurpose(next.purpose)) {
         next.account = syncManagedAccount(next, personDraft.name.trim(), undefined);
       }

       return next;
     });

     setPersonDraft(null);
   }, [personDraft, syncManagedAccount, updateReview]);

   const handlePersonSelectionChange = useCallback((value: string) => {
     if (value === '__create__') {
       handleStartCreatePerson();
       return;
     }

     if (!value) {
      updateReview((current) => {
        const next: SmartEntryReview = {
          ...current,
          person: {
            ...(current.person || {}),
            required: true,
            mode: undefined,
            personId: undefined,
            name: undefined,
          },
        };

        if (isManagedPurpose(next.purpose)) {
          next.account = syncManagedAccount(next, undefined, undefined);
        }

        return next;
      });
       return;
     }

     const person = people.find((item) => item.id === value);
     if (!person) return;

     updateReview((current) => {
       const next: SmartEntryReview = {
         ...current,
         person: {
           required: true,
           mode: 'existing',
           personId: person.id,
           name: person.fullName,
           relationship: person.relationship,
         },
       };

       if (isManagedPurpose(next.purpose)) {
         next.account = syncManagedAccount(next, person.fullName, person.id);
       }

       return next;
     });
     setPersonDraft(null);
   }, [handleStartCreatePerson, people, syncManagedAccount, updateReview]);

   const handleStartCreateAccount = useCallback((field: 'account' | 'destinationAccount') => {
     const selection = field === 'destinationAccount' ? reviewState?.destinationAccount : reviewState?.account;
     const personName = reviewState?.person?.name;
    const suggestedName =
      field === 'account' && isSubscriptionFlow
        ? selection?.name || ''
        :
      field === 'account' && isManagedPurpose(reviewState?.purpose)
        ? getManagedAccountName(personName)
        : selection?.name || t('accounts.types.cash', { ns: 'portal' });

     setAccountDraftTarget(field);
     setAccountDraft({
       field,
       name: suggestedName,
       type: selection?.type || inferAccountType(suggestedName),
       currency: normalizeReviewCurrency(selection?.currency || reviewState?.currency),
      includeInTotal: field === 'account'
        ? (isSubscriptionFlow ? true : !isManagedPurpose(reviewState?.purpose))
        : true,
     });
  }, [isSubscriptionFlow, normalizeReviewCurrency, reviewState, t]);

   const handleApplyCreateAccount = useCallback(() => {
     if (!accountDraft?.name.trim()) return;

     updateReview((current) => {
        const selection: NonNullable<SmartEntryReview['account']> = {
        required: current.subscription ? current.subscription.accountRequired : true,
         mode: 'create' as const,
         accountId: undefined,
         name: accountDraft.name.trim(),
         type: accountDraft.type,
         currency: normalizeReviewCurrency(accountDraft.currency),
         includeInTotal: accountDraft.field === 'account' ? accountDraft.includeInTotal : true,
        scope: accountDraft.field === 'account' && isManagedPurpose(current.purpose) && !current.subscription ? ('managed' as const) : ('personal' as const),
        managedPersonId: accountDraft.field === 'account' && isManagedPurpose(current.purpose) && !current.subscription ? current.person?.personId : undefined,
        managedPersonName: accountDraft.field === 'account' && isManagedPurpose(current.purpose) && !current.subscription ? current.person?.name : undefined,
       };

       return accountDraft.field === 'destinationAccount'
         ? { ...current, destinationAccount: selection }
         : { ...current, account: selection };
     });

     setAccountDraft(null);
     setAccountDraftTarget(null);
   }, [accountDraft, updateReview]);

   const handleAccountSelectionChange = useCallback((field: 'account' | 'destinationAccount', value: string) => {
     if (value === '__create__') {
       handleStartCreateAccount(field);
       return;
     }

     if (!value) {
       updateReview((current) =>
         field === 'destinationAccount'
           ? {
               ...current,
               destinationAccount: {
                 ...(current.destinationAccount || {}),
                 required: true,
                 mode: undefined,
                 accountId: undefined,
                name: undefined,
               },
             }
           : {
               ...current,
               account: {
                 ...(current.account || {}),
                required: current.subscription ? current.subscription.accountRequired : true,
                 mode: undefined,
                 accountId: undefined,
                name: undefined,
                managedPersonId: undefined,
                managedPersonName: undefined,
               },
             }
       );
       return;
     }

    const pool = field === 'destinationAccount' ? eligibleDestinationAccounts : primaryAccountOptions;
    const account = pool.find((item) => item.id === value);
     if (!account) return;

     updateReview((current) => {
      const selection: NonNullable<SmartEntryReview['account']> = {
         required: field === 'destinationAccount'
           ? current.destinationAccount?.required ?? true
           : current.subscription
             ? current.subscription.accountRequired
             : true,
         mode: 'existing' as const,
         accountId: account.id,
         name: account.name,
         type: account.type as SuggestedAccount['type'],
         currency: normalizeReviewCurrency(account.currency),
        includeInTotal: field === 'account'
          ? (current.subscription ? true : !isManagedPurpose(current.purpose))
          : true,
        scope: field === 'account' && isManagedPurpose(current.purpose) && !current.subscription ? ('managed' as const) : ('personal' as const),
        managedPersonId: field === 'account' && isManagedPurpose(current.purpose) && !current.subscription ? current.person?.personId : undefined,
        managedPersonName: field === 'account' && isManagedPurpose(current.purpose) && !current.subscription ? current.person?.name : undefined,
       };

       return field === 'destinationAccount'
         ? { ...current, destinationAccount: selection }
         : { ...current, account: selection };
     });

     setAccountDraft(null);
     setAccountDraftTarget(null);
  }, [eligibleDestinationAccounts, handleStartCreateAccount, normalizeReviewCurrency, primaryAccountOptions, updateReview]);

  const checkVoiceAvailability = useCallback(async () => {
    const response = await fetch('/api/ai/voice-status', {
      method: 'GET',
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({} as VoiceStatusResponse));

    if (data?.transcription?.maxAudioSeconds) {
      setVoiceMaxSeconds(data.transcription.maxAudioSeconds);
    }

    if (!response.ok || data.ready !== true) {
      handleVoiceFailure(data, t('smartEntryModal.voice.unavailable.providerUnavailableMessage', { ns: 'portal' }));
      return false;
    }

    setApiError(null);
    setErrorMessage('');
    setUsageSummary(null);
    return true;
  }, [handleVoiceFailure, t]);

  useEffect(() => {
    if (mode !== 'voice' || step !== 'entry' || isAIConfigured === false) {
      return;
    }

    let cancelled = false;
    void checkVoiceAvailability().then((ready) => {
      if (cancelled || ready) {
        return;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [checkVoiceAvailability, isAIConfigured, mode, step]);

  const callParseAPI = useCallback(async (text: string) => {
    const nextFlowId = createClientId();
    resetRequestState({
      preserveInput: false,
      preserveMode: true,
      preserveLanguage: true,
      preserveTranscriptArtifacts: true,
    });
    setStep('processing');
    setTranscript(text);
    setTranslationNotice('');
    setErrorMessage('');
    setApiError(null);
    setUsageSummary(null);

    try {
      const token = await getAuthToken();
      const context = await buildAIContext();
      setContextSnapshot(context);

      const body: Record<string, unknown> = {
        inputType: 'text',
        language: displayLanguage,
        locale: uiLanguage || displayLanguage,
        currentDate: context.currentDate,
        currentDateTime: context.currentDateTime,
        timezone: context.timezone,
        context,
        idempotencyKey: nextFlowId,
        text,
      };

      const response = await fetch('/api/ai/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));
      if (data.status === 'not_configured') {
        setIsAIConfigured(false);
        setStep('entry');
        return;
      }

      if (data.status === 'failed' || !response.ok) {
        handleApiFailure(data, t('errors.generic', { ns: 'common' }));
        return;
      }

      if (data.transcript) setTranscript(data.transcript);

      const instruction = data.parsed as ParsedFinancialInstruction;
      const responseRequestId = typeof data.requestId === 'string' ? data.requestId.trim() : '';
      const instructionRequestId = typeof instruction?.requestId === 'string' ? instruction.requestId.trim() : '';
      const effectiveRequestId = responseRequestId || instructionRequestId;

      if (
        !effectiveRequestId ||
        !UUID_PATTERN.test(effectiveRequestId) ||
        (responseRequestId && instructionRequestId && responseRequestId !== instructionRequestId)
      ) {
        handleApiFailure(
          {
            error: {
              code: 'AI_REQUEST_ID_INVALID',
              category: 'state',
              message: t('smartEntryModal.errors.noLongerAvailable', { ns: 'portal' }),
              requestId: responseRequestId || instructionRequestId || undefined,
            },
          },
          t('smartEntryModal.errors.noLongerAvailable', { ns: 'portal' })
        );
        return;
      }

      const persistedInstruction: ParsedFinancialInstruction = {
        ...instruction,
        requestId: effectiveRequestId,
      };

      setParsed(persistedInstruction);
      const baseReview =
        persistedInstruction.review ||
        buildInitialSmartEntryReview({
          instruction: persistedInstruction,
          sourceText: (text || data.transcript || '').trim(),
          context,
        });
      setReviewState(hydrateSmartEntryReviewWithContext({ review: baseReview, context }));
      setAccountDraft(null);
      setPersonDraft(null);
      setAccountDraftTarget(null);

      setStep('confirming');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errors.network', { ns: 'common' }));
      setApiError(null);
      setUsageSummary(null);
      setStep('failed');
    }
  }, [displayLanguage, handleApiFailure, resetRequestState, t, uiLanguage]);

  const callReceiptInsightAPI = useCallback(async (question: string) => {
    resetRequestState({
      preserveInput: true,
      preserveMode: true,
      preserveLanguage: true,
      preserveTranscriptArtifacts: true,
    });
    setStep('processing');
    setTranscript(question);
    setErrorMessage('');
    setApiError(null);
    setUsageSummary(null);

    try {
      const token = await getAuthToken();
      const response = await fetch('/api/ai/receipt-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-smart-pocket-language': displayLanguage,
        },
        body: JSON.stringify({ question, language: displayLanguage }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success !== true) {
        throw new Error(data?.errorMessage || t('smartEntryModal.errors.saveFailed', { ns: 'portal' }));
      }
      setReceiptInsightAnswer({
        title: typeof data.title === 'string' ? data.title : t('receiptInsights.title', { ns: 'portal', defaultValue: 'Receipt Insights' }),
        answer: typeof data.answer === 'string' ? data.answer : '',
        sources: Array.isArray(data.sources) ? data.sources : [],
      });
      setStep('receipt_insight');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t('errors.network', { ns: 'common' }));
      setStep('failed');
    }
  }, [displayLanguage, resetRequestState, t]);

  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim()) return;
    trackAiEntryUsed('text');
    if (isReceiptInsightQuestion(textInput)) {
      void callReceiptInsightAPI(textInput.trim());
      return;
    }
    void callParseAPI(textInput.trim());
  }, [textInput, callParseAPI, callReceiptInsightAPI]);

  const handleVoiceReady = useCallback(async (submission: VoiceRecorderSubmission) => {
    trackAiEntryUsed('voice');
    resetRequestState({
      preserveInput: true,
      preserveMode: true,
      preserveLanguage: true,
      preserveTranscriptArtifacts: false,
    });
    setStep('processing');
    setErrorMessage('');
    setApiError(null);
    setUsageSummary(null);

    try {
      const token = await getAuthToken();
      const formData = new FormData();
      formData.append('audio', submission.file);
      formData.append('durationSeconds', String(submission.durationSeconds));
      formData.append('spokenLanguage', spokenLanguage);
      formData.append('displayLanguage', displayLanguage);
      formData.append('idempotencyKey', createClientId());

      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.success !== true || typeof data?.transcript !== 'string') {
        handleVoiceFailure(data, t('smartEntryModal.voice.unavailable.providerUnavailableMessage', { ns: 'portal' }));
        return;
      }

      const nextTranscript = data.transcript.trim();
      if (!nextTranscript) {
        handleVoiceFailure({
          error: {
            code: 'transcription_failed',
            category: 'technical',
            message: t('smartEntryModal.voice.unavailable.providerUnavailableMessage', { ns: 'portal' }),
          },
        }, t('smartEntryModal.voice.unavailable.providerUnavailableMessage', { ns: 'portal' }));
        return;
      }

      const nextOriginalTranscript =
        typeof data.originalTranscript === 'string' && data.originalTranscript.trim()
          ? data.originalTranscript.trim()
          : nextTranscript;
      setTranscript(nextTranscript);
      setTextInput(nextTranscript);
      setOriginalTranscript(nextOriginalTranscript);
      setOriginalTranscriptLanguage(
        typeof data.detectedLanguage === 'string' && data.detectedLanguage.trim()
          ? data.detectedLanguage.trim().toLowerCase()
          : spokenLanguage
      );
      setTranslationNotice(
        data.translationFailed === true
          ? t('smartEntryModal.voice.translationFailed', { ns: 'portal' })
          : ''
      );
      setMode('text');
      setStep('entry');
      setApiError(null);
      setErrorMessage('');
      setUsageSummary(null);
      dispatchSmartPocketDataChanged({
        source: 'smart-entry-voice-transcription',
        entities: ['dashboard', 'transactions', 'financial_accounts', 'ai_usage'],
      });
      router.refresh();
    } catch (err) {
      handleVoiceFailure({
        error: {
          code: 'openrouter_provider_unavailable',
          category: 'technical',
          message: err instanceof Error ? err.message : t('errors.network', { ns: 'common' }),
        },
      }, t('smartEntryModal.voice.unavailable.providerUnavailableMessage', { ns: 'portal' }));
    }
  }, [displayLanguage, getAuthToken, handleVoiceFailure, resetRequestState, router, spokenLanguage, t]);

  const handleConfirm = useCallback(async () => {
    if (!parsed || !reviewState || unresolvedReviewFields.length > 0) return;
    setStep('executing');
    setErrorMessage('');
    setApiError(null);
    setUsageSummary(null);

    try {
      if (!parsed.requestId || !UUID_PATTERN.test(parsed.requestId)) {
        handleApiFailure(
          {
            error: {
              code: 'AI_REQUEST_ID_INVALID',
              category: 'state',
              message: t('smartEntryModal.errors.noLongerAvailable', { ns: 'portal' }),
            },
          },
          t('smartEntryModal.errors.noLongerAvailable', { ns: 'portal' })
        );
        return;
      }

      const token = await getAuthToken();
      const confirmResponse = await fetch('/api/ai/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          requestId: parsed.requestId,
          review: reviewState,
        }),
      });

      const confirmResult = await confirmResponse.json().catch(() => ({}));
      if (!confirmResponse.ok) {
        const message = getFriendlyConfirmErrorMessage(
          isObject(confirmResult) && 'error' in confirmResult ? (confirmResult as Record<string, unknown>).error : undefined
        );
        handleApiFailure(confirmResult, message);
        return;
      }

      const response = await fetch('/api/ai/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId: parsed.requestId }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.status === 'failed') {
        if (result?.status === 'clarification_required' || result?.code === 'account_missing' || result?.code === 'person_missing') {
          setErrorMessage(
            result.message || t('smartEntryModal.errors.moreDetailsRequired', { ns: 'portal' })
          );
          setStep('confirming');
          return;
        }
        handleApiFailure(result, getFriendlyExecutionErrorMessage(result.error));
        return;
      }

      setExecutionResult({
        success: !!result.success,
        count: Array.isArray(result.executedActions) ? result.executedActions.length : (previewInstruction?.actions.length || parsed.actions.length),
      });
      setStep('success');
      dispatchSmartPocketDataChanged({
        source: 'smart-entry',
        entities: getSmartEntrySuccessEntities(result),
      });
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : t('smartEntryModal.errors.saveFailed', { ns: 'portal' })
      );
      setApiError(null);
      setUsageSummary(null);
      setStep('failed');
    }
  }, [parsed, reviewState, previewInstruction?.actions.length, router, t, unresolvedReviewFields.length, handleApiFailure]);

  const handleReset = useCallback(() => {
    resetRequestState();
  }, [resetRequestState]);

  const handleOpenDocumentReview = useCallback((file: File | null | undefined) => {
    if (!file) return;
    setDocumentReviewFile(file);
  }, []);

  const getFriendlyExecutionErrorMessage = (rawError: unknown): string => {
    if (isObject(rawError) && typeof rawError.code === 'string') {
      switch (rawError.code) {
        case 'ACCOUNT_CREATE_FAILED':
          return t('smartEntryModal.errors.accountCreateFailed', { ns: 'portal' });
        case 'ACCOUNT_ID_MISSING':
          return t('smartEntryModal.errors.accountInvalid', { ns: 'portal' });
        case 'TRANSACTION_INSERT_FAILED':
          return t('smartEntryModal.errors.transactionSaveFailed', { ns: 'portal' });
        case 'INVALID_EXECUTION_PAYLOAD':
          return t('smartEntryModal.errors.invalidRequest', { ns: 'portal' });
        case 'AI_REQUEST_UPDATE_FAILED':
          return t('smartEntryModal.errors.finalizeFailed', { ns: 'portal' });
        default:
          break;
      }
    }

    const message = typeof rawError === 'string' ? rawError : '';
    if (message.includes('already processed') || message.includes('already being processed') || message.includes('confirmed state')) {
      return t('smartEntryModal.errors.alreadyProcessed', { ns: 'portal' });
    }
    if (message.includes('Request not found')) {
      return t('smartEntryModal.errors.noLongerAvailable', { ns: 'portal' });
    }
    return t('smartEntryModal.errors.saveFailed', { ns: 'portal' });
  };

  const failedStateTitle = (() => {
    switch (apiError?.code) {
      case 'openrouter_not_configured':
      case 'voice_not_in_plan':
        return t('smartEntryModal.voice.unavailable.configurationTitle', { ns: 'portal' });
      case 'voice_model_missing':
      case 'voice_model_audio_unsupported':
        return t('smartEntryModal.voice.unavailable.modelTitle', { ns: 'portal' });
      case 'microphone_permission_denied':
        return t('smartEntryModal.voice.unavailable.microphoneTitle', { ns: 'portal' });
      case 'openrouter_provider_unavailable':
      case 'openrouter_auth_failed':
      case 'transcription_failed':
        return t('smartEntryModal.voice.unavailable.providerUnavailableTitle', { ns: 'portal' });
      case 'voice_limit_reached':
        return t('smartEntryModal.voice.unavailable.limitTitle', { ns: 'portal' });
      case 'ACCOUNT_CREATE_FAILED':
        return t('smartEntryModal.failedTitles.accountCreate', { ns: 'portal' });
      case 'ACCOUNT_ID_MISSING':
        return t('smartEntryModal.failedTitles.chooseAnotherAccount', { ns: 'portal' });
      case 'TRANSACTION_INSERT_FAILED':
        return t('smartEntryModal.failedTitles.transactionSave', { ns: 'portal' });
      case 'INVALID_EXECUTION_PAYLOAD':
        return t('smartEntryModal.failedTitles.reviewRequired', { ns: 'portal' });
      default:
        return t('smartEntryModal.failedTitles.generic', { ns: 'portal' });
    }
  })();

  const failedShowsRefresh = apiError?.code !== 'openrouter_not_configured'
    && apiError?.code !== 'voice_model_missing'
    && apiError?.code !== 'voice_model_audio_unsupported'
    && apiError?.code !== 'openrouter_auth_failed'
    && apiError?.code !== 'voice_not_in_plan'
    && apiError?.code !== 'microphone_permission_denied'
    && apiError?.code !== 'voice_limit_reached';

  const getFriendlyConfirmErrorMessage = (rawError: unknown): string => {
    const message = typeof rawError === 'string' ? rawError : '';
    if (message.includes('Unauthorized')) {
      return t('errors.sessionExpired', { ns: 'common' });
    }
    if (message.includes('Forbidden')) {
      return t('smartEntryModal.errors.belongsToAnotherAccount', { ns: 'portal' });
    }
    if (message.includes('Request not found')) {
      return t('smartEntryModal.errors.noLongerAvailable', { ns: 'portal' });
    }
    if (message.includes('already being processed')) {
      return t('smartEntryModal.errors.alreadyProcessed', { ns: 'portal' });
    }
    if (message.includes('cannot be confirmed')) {
      return t('smartEntryModal.errors.notConfirmable', { ns: 'portal' });
    }
    if (message.includes('unresolved account')) {
      return t('smartEntryModal.errors.resolveAccount', { ns: 'portal' });
    }
    if (message.includes('unresolved managed people')) {
      return t('smartEntryModal.errors.resolvePerson', { ns: 'portal' });
    }
    return t('smartEntryModal.errors.confirmFailed', { ns: 'portal' });
  };

  const SPOKEN_LANGUAGES: Array<{ code: SmartEntrySpokenLanguage; label: string }> = [
    { code: 'auto', label: t('smartEntryModal.language.autoDetect', { ns: 'portal' }) },
    { code: 'en', label: t('language.en', { ns: 'common' }) },
    { code: 'ur', label: t('language.ur', { ns: 'common' }) },
    { code: 'ar', label: t('language.ar', { ns: 'common' }) },
    { code: 'fr', label: t('language.fr', { ns: 'common' }) },
    { code: 'ru', label: t('language.ru', { ns: 'common' }) },
  ];
  const visibleSpokenLanguages = SPOKEN_LANGUAGES.filter((entry) => entry.code !== 'ur');
  const advancedSpokenLanguages = SPOKEN_LANGUAGES.filter((entry) => entry.code === 'ur');
  const modeOptions: Array<{ id: EntryMode; icon: typeof Type; label: string }> = [
    { id: 'text', icon: Type, label: t('smartEntryModal.modeText', { ns: 'portal' }) },
    { id: 'voice', icon: Mic, label: t('smartEntryModal.modeVoice', { ns: 'portal' }) },
    { id: 'document', icon: FileText, label: t('smartEntryModal.modeDocument', { ns: 'portal' }) },
  ];
  const languageChipClassName = 'min-h-9 rounded-full border px-3 py-1.5 text-xs font-600 transition-colors sm:min-h-10';
  const selectedLanguageChipClassName = 'border-accent/30 bg-accent/10 text-accent';
  const unselectedLanguageChipClassName = 'border-border bg-background text-muted-foreground hover:bg-muted/70 hover:text-foreground';
  const originalTranscriptLanguageLabel = (() => {
    const value = (originalTranscriptLanguage || '').toLowerCase();
    if (value === 'ur') return t('language.ur', { ns: 'common' });
    if (value === 'ar') return t('language.ar', { ns: 'common' });
    if (value === 'fr') return t('language.fr', { ns: 'common' });
    if (value === 'ru') return t('language.ru', { ns: 'common' });
    if (value === 'en') return t('language.en', { ns: 'common' });
    return t('smartEntryModal.language.autoDetect', { ns: 'portal' });
  })();
  const translationNoticeBanner = translationNotice ? (
    <div className="rounded-xl border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-foreground">
      {translationNotice}
    </div>
  ) : null;
  const originalTranscriptDisclosure = originalTranscript ? (
    <details className="rounded-xl border border-border bg-muted/30 p-3">
      <summary className="cursor-pointer list-none text-sm font-700 text-foreground">
        {t('smartEntryModal.voice.viewOriginalTranscription', { ns: 'portal' })}
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        {t('smartEntryModal.voice.originalLanguageLabel', {
          ns: 'portal',
          language: originalTranscriptLanguageLabel,
        })}
      </p>
      <p
        className="mt-2 text-sm text-foreground"
        dir={getLanguageDirection(originalTranscriptLanguage)}
        lang={originalTranscriptLanguage || undefined}
      >
        {originalTranscript}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        {t('smartEntryModal.voice.wrongLanguageHint', { ns: 'portal' })}
      </p>
    </details>
  ) : null;

  const examplePlaceholder = t('smartEntryModal.placeholderExample', { ns: 'portal' });
  const exampleItems = [
    t('smartEntryModal.examples.expense', { ns: 'portal' }),
    t('smartEntryModal.examples.moneyReceived', { ns: 'portal' }),
    t('smartEntryModal.examples.transfer', { ns: 'portal' }),
    t('smartEntryModal.examples.subscriptionPayment', { ns: 'portal' }),
  ];

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-[calc(env(safe-area-inset-top)+0.5rem)] sm:items-center sm:p-5">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        aria-label={t('smartEntryModal.close', { ns: 'portal' })}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-entry-title"
        aria-describedby="smart-entry-description"
        className={`relative z-[1] flex flex-col overflow-hidden border border-border bg-card shadow-card-lg ${
          isCompactSubscriptionReview
            ? 'w-full max-w-3xl max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)] rounded-[20px] sm:w-[calc(100vw-24px)] sm:max-h-[85vh]'
            : 'w-full max-w-[760px] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)] rounded-[24px] sm:w-[min(calc(100vw-32px),760px)]'
        }`}
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className={`flex flex-shrink-0 items-center justify-between border-b border-border bg-card ${
          isCompactSubscriptionReview ? 'px-4 sm:px-5 py-3.5' : 'px-4 py-3.5 sm:px-6 sm:py-4'
        }`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-teal flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h2 id="smart-entry-title" className="text-lg font-800 text-foreground">
                {t('smartEntryModal.title', { ns: 'portal' })}
              </h2>
              <p id="smart-entry-description" className={`text-muted-foreground ${
                isCompactSubscriptionReview ? 'text-xs sm:text-sm' : 'text-sm'
              }`}>
                {t('smartEntryModal.description', { ns: 'portal' })}
              </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="btn-ghost p-2 rounded-lg"
            aria-label={t('actions.close', { ns: 'common' })}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-thin max-[480px]:pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">

          {/* Not configured state */}
          {isAIConfigured === false && step === 'entry' && (
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Sparkles size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-600 text-foreground mb-2">
                {t('smartEntryModal.notConfigured.title', { ns: 'portal' })}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {t('smartEntryModal.notConfigured.description', { ns: 'portal' })}
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors"
              >
                {t('smartEntryModal.notConfigured.manualAction', { ns: 'portal' })}
              </button>
            </div>
          )}

          {/* Entry step */}
          {step === 'entry' && isAIConfigured !== false && (
            <div className="space-y-4 p-4 sm:space-y-5 sm:p-6">
              <div className="grid grid-cols-3 gap-2" role="tablist" aria-label={t('smartEntryModal.title', { ns: 'portal' })}>
                {modeOptions.map((option) => {
                  const Icon = option.icon;
                  const active = mode === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setMode(option.id)}
                      className={`flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-center text-xs font-700 transition-colors sm:min-h-[78px] sm:text-sm ${
                        active
                          ? 'border-accent/30 bg-accent/10 text-accent shadow-sm'
                          : 'border-border bg-secondary/20 text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      }`}
                    >
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${
                        active ? 'bg-accent text-white' : 'bg-background text-muted-foreground'
                      }`}>
                        <Icon size={16} />
                      </span>
                      <span className="leading-tight">{option.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-border bg-secondary/20 p-3 sm:p-3.5">
                <div className="mb-2.5">
                  <p className="text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                    {t('smartEntryModal.languageLabel', { ns: 'portal' })}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('smartEntryModal.language.helper', { ns: 'portal' })}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {visibleSpokenLanguages.map((entry) => (
                    <button
                      key={entry.code}
                      type="button"
                      onClick={() => setSpokenLanguage(entry.code)}
                      dir={getLanguageDirection(entry.code)}
                      lang={entry.code === 'auto' ? undefined : entry.code}
                      aria-pressed={spokenLanguage === entry.code}
                      className={`${languageChipClassName} ${
                        spokenLanguage === entry.code ? selectedLanguageChipClassName : unselectedLanguageChipClassName
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                {mode === 'voice' && advancedSpokenLanguages.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer list-none text-[11px] font-600 text-muted-foreground">
                      {t('smartEntryModal.language.advancedRecognition', { ns: 'portal' })}
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {advancedSpokenLanguages.map((entry) => (
                        <button
                          key={entry.code}
                          type="button"
                          onClick={() => setSpokenLanguage(entry.code)}
                          dir={getLanguageDirection(entry.code)}
                          lang={entry.code}
                          aria-pressed={spokenLanguage === entry.code}
                          className={`${languageChipClassName} ${
                            spokenLanguage === entry.code ? selectedLanguageChipClassName : unselectedLanguageChipClassName
                          }`}
                        >
                          {entry.label}
                          <span className="ms-1 text-[10px] font-500 opacity-75">
                            {t('smartEntryModal.language.recognitionOnly', { ns: 'portal' })}
                          </span>
                        </button>
                      ))}
                    </div>
                  </details>
                )}
              </div>

              {mode === 'document' ? (
                <div className="rounded-2xl border border-border bg-secondary/20 p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-700 text-foreground">
                        {t('smartEntryModal.document.title', {
                          ns: 'portal',
                          defaultValue: 'Receipt / Document',
                        })}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('smartEntryModal.document.description', {
                          ns: 'portal',
                          defaultValue: 'Upload a receipt, invoice, note, or PDF for AI review.',
                        })}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('transactions.documentReview.supportedFileTypesLabel', {
                          ns: 'portal',
                          supportedTypes: TRANSACTION_DOCUMENT_SUPPORTED_TYPES_LABEL,
                          defaultValue: 'Supported file types: {{supportedTypes}}',
                        })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('transactions.documentReview.maxFileSizeLabel', {
                          ns: 'portal',
                          maxSize: getTransactionDocumentMaxSizeLabel(),
                          defaultValue: 'Maximum file size: {{maxSize}}',
                        })}
                      </p>
                    </div>
                    <div className="w-full sm:w-auto">
                      <input
                        type="file"
                        id="smart-entry-document-upload"
                        accept={TRANSACTION_DOCUMENT_ACCEPT_ATTRIBUTE}
                        className="hidden"
                        onChange={(event) => {
                          const nextFile = event.target.files?.[0];
                          void handleOpenDocumentReview(nextFile);
                          event.currentTarget.value = '';
                        }}
                      />
                      <label
                        htmlFor="smart-entry-document-upload"
                        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-card px-4 py-2.5 text-sm font-600 text-foreground shadow-sm ring-1 ring-border transition-colors hover:bg-muted sm:w-auto"
                      >
                        <FileText size={16} className="me-2" />
                        {t('smartEntryModal.document.action', {
                          ns: 'portal',
                          defaultValue: 'Review Document',
                        })}
                      </label>
                    </div>
                  </div>
                </div>
              ) : mode === 'text' ? (
                <div>
                  <label className="mb-1.5 block text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                    {t('smartEntryModal.describeLabel', { ns: 'portal' })}
                  </label>
                  <textarea
                    data-autofocus="true"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    placeholder={examplePlaceholder}
                    className="w-full min-h-[7.25rem] resize-y rounded-2xl border border-border bg-background/90 px-4 py-3.5 text-sm leading-6 text-foreground shadow-sm outline-none transition-colors placeholder:font-normal placeholder:text-muted-foreground/70 focus:border-accent/40 focus:ring-2 focus:ring-accent/10 sm:min-h-[8.25rem]"
                    dir={getLanguageDirection(displayLanguage)}
                    lang={displayLanguage}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleTextSubmit();
                    }}
                  />
                  {translationNoticeBanner ? <div className="mt-3">{translationNoticeBanner}</div> : null}
                  {originalTranscriptDisclosure ? <div className="mt-3">{originalTranscriptDisclosure}</div> : null}
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {t('smartEntryModal.submitHint', { ns: 'portal' })}
                  </p>
                  <button
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim()}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-600 text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Sparkles size={16} />
                    {t('smartEntryModal.analyzeAction', { ns: 'portal' })}
                  </button>
                </div>
              ) : (
                <VoiceRecorder
                  onTranscriptReady={handleVoiceReady}
                  onError={(code, message) => {
                    handleVoiceFailure({
                      error: {
                        code,
                        category: 'state',
                        message,
                      },
                    }, message);
                  }}
                  onCancel={() => setMode('text')}
                  onSwitchToText={() => setMode('text')}
                  maxSeconds={voiceMaxSeconds}
                  language={spokenLanguage}
                />
              )}

              {mode === 'text' && (
                <div className="rounded-2xl border border-border bg-secondary/10 p-3 sm:p-4">
                  <p className="mb-2 text-xs font-700 uppercase tracking-[0.16em] text-muted-foreground">
                    {t('smartEntryModal.examplesTitle', { ns: 'portal' })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {exampleItems.map((ex, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setTextInput(ex)}
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground sm:text-sm"
                        dir={isRTL ? 'rtl' : 'ltr'}
                      >
                        {ex}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Processing */}
          {step === 'processing' && (
            <div className="p-8 flex flex-col items-center gap-4">
              <div className="w-16 h-16 rounded-full gradient-teal flex items-center justify-center">
                <Loader2 size={28} className="text-white animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-600 text-foreground">
                  {t('smartEntryModal.processingTitle', { ns: 'portal' })}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('smartEntryModal.processingDescription', { ns: 'portal' })}
                </p>
              </div>
              {transcript && (
                <div className="w-full p-3 bg-muted/50 rounded-xl">
                  <p className="text-xs font-600 text-muted-foreground mb-1">
                    {t('smartEntryModal.transcriptLabel', { ns: 'portal' })}:
                  </p>
                  <p
                    className="text-sm text-foreground italic"
                    dir={getLanguageDirection(displayLanguage)}
                    lang={displayLanguage}
                  >
                    "{transcript}"
                  </p>
                </div>
              )}
              {translationNoticeBanner}
              {originalTranscriptDisclosure}
            </div>
          )}

          {step === 'receipt_insight' && receiptInsightAnswer && (
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <CheckCircle size={18} className="text-positive" />
                <p className="text-sm font-700 text-foreground">
                  {receiptInsightAnswer.title}
                </p>
              </div>

              {transcript ? (
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-xs font-600 text-muted-foreground">
                    {t('smartEntryModal.inputLabel', { ns: 'portal' })}:
                  </p>
                  <p className="mt-1 text-sm italic text-foreground">"{transcript}"</p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <p className="text-sm text-foreground">{receiptInsightAnswer.answer}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                  {t('receiptInsights.sourcesTitle', { ns: 'portal', defaultValue: 'Source context' })}
                </p>
                {receiptInsightAnswer.sources.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    {t('receiptInsights.noSources', { ns: 'portal', defaultValue: 'No matching receipt sources were found.' })}
                  </div>
                ) : (
                  receiptInsightAnswer.sources.map((source, index) => (
                    <div key={`${source.itemName}-${source.transactionDate}-${index}`} className="rounded-xl border border-border bg-card p-3">
                      <p className="text-sm font-700 text-foreground">{source.itemName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[source.transactionDate, source.merchant || undefined].filter(Boolean).join(' · ')}
                      </p>
                      <p className="mt-1 text-sm text-foreground">{source.detail}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
                <Link href="/reports/item-insights" className="btn-secondary">
                  <ArrowUpRight size={14} />
                  {t('receiptInsights.link', { ns: 'portal', defaultValue: 'Item Insights' })}
                </Link>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => resetRequestState({ preserveInput: true, preserveMode: true, preserveLanguage: true })}
                    className="btn-secondary"
                  >
                    <RotateCcw size={14} />
                    {t('receiptInsights.askAnother', { ns: 'portal', defaultValue: 'Ask another question' })}
                  </button>
                  <button type="button" onClick={onClose} className="btn-primary">
                    {t('actions.close', { ns: 'common' })}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Confirming */}
          {step === 'confirming' && parsed && reviewState && previewInstruction && (
            <div className={`flex min-h-full flex-col ${isSubscriptionFlow ? 'p-4 sm:p-5' : 'space-y-4 p-5'}`}>
              <div className={`flex items-center gap-2 ${isSubscriptionFlow ? 'mb-3' : 'mb-4'}`}>
                <CheckCircle size={18} className="text-positive" />
                <p className="text-sm font-600 text-foreground">
                  {t('smartEntryModal.reviewTitle', { ns: 'portal' })}
                </p>
              </div>

              {transcript && (
                <div className={`bg-muted/50 ${isSubscriptionFlow ? 'mb-3 rounded-lg p-2.5' : 'mb-4 rounded-xl p-3'}`}>
                  <p className="text-xs text-muted-foreground">
                    {t('smartEntryModal.inputLabel', { ns: 'portal' })}:
                  </p>
                  <p
                    className="text-sm text-foreground mt-0.5 italic"
                    dir={getLanguageDirection(displayLanguage)}
                    lang={displayLanguage}
                  >
                    "{transcript || textInput}"
                  </p>
                </div>
              )}
              {translationNoticeBanner ? (
                <div className={isSubscriptionFlow ? 'mb-3' : 'mb-4'}>
                  {translationNoticeBanner}
                </div>
              ) : null}
              {originalTranscriptDisclosure ? (
                <div className={isSubscriptionFlow ? 'mb-3' : 'mb-4'}>
                  {originalTranscriptDisclosure}
                </div>
              ) : null}

              {errorMessage && (
                <div className={`border border-warning/20 bg-warning-soft ${isSubscriptionFlow ? 'mb-3 rounded-lg p-2.5' : 'mb-4 rounded-xl p-3'}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-warning mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-warning">{errorMessage}</p>
                  </div>
                </div>
              )}

              {previewInstruction.warnings?.length > 0 && (
                <div className={`border border-warning/20 bg-warning-soft ${isSubscriptionFlow ? 'mb-3 rounded-lg p-2.5' : 'mb-4 rounded-xl p-3'}`}>
                  {previewInstruction.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-warning mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-warning">{translateSmartEntryWarning(w, t)}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className={isSubscriptionFlow ? 'flex-1 space-y-3' : 'space-y-4'}>
                <div className={reviewSectionClass}>
                  <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                    {t('smartEntryModal.understandingTitle', { ns: 'portal' })}
                  </p>
                  {understandingLines.map((line, index) => (
                    <p key={index} className="text-sm text-foreground">{line}</p>
                  ))}
                  {reviewState.purposeOptions && reviewState.purposeOptions.length > 0 && (
                    <div className="space-y-2 pt-0.5">
                      <p className="text-sm font-600 text-foreground">
                        {typeof reviewState.receivedAmount === 'number' && reviewState.person?.name
                          ? t('smartEntryModal.purposeQuestionWithPerson', {
                              ns: 'portal',
                              amount: formatMoney(reviewState.receivedAmount, reviewState.currency, contextSnapshot?.defaultCurrency),
                              name: reviewState.person.name,
                            })
                          : t('smartEntryModal.purposeQuestion', { ns: 'portal' })}
                      </p>
                      {reviewState.purposeOptions.map((option) => (
                        (() => {
                          const localizedOption = getPurposeOptionText(option.id, t);
                          return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handlePurposeChange(option.id)}
                          className={`w-full rounded-xl border text-left transition-colors ${
                            isSubscriptionFlow ? 'p-2.5' : 'p-3'
                          } ${
                            reviewState.purpose === option.id ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/40'
                          }`}
                        >
                          <p className="text-sm font-600 text-foreground">
                            {localizedOption?.label || option.label}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {localizedOption?.description || option.description}
                          </p>
                        </button>
                          );
                        })()
                      ))}
                    </div>
                  )}
                </div>

                {isSubscriptionFlow && reviewState.subscription && (
                  <div className={reviewSectionClass}>
                    <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                      {t('smartEntryModal.subscription.title', {
                        ns: 'portal',
                        defaultValue: 'Subscription',
                      })}
                    </p>

                    {reviewState.subscription.requiresSubscriptionSelection && (
                      <div className={reviewFieldGroupClass}>
                        <label className={getFieldLabelClassName(Boolean(getFieldErrorMessage('subscription')), 'mb-1.5 block text-xs font-600')}>
                          {t('smartEntryModal.subscription.matchingSubscription', {
                            ns: 'portal',
                            defaultValue: 'Matching subscription',
                          })}
                          <span className={getRequiredMarkerClassName()}> *</span>
                        </label>
                        <select
                          value={reviewState.subscription.subscriptionId || ''}
                          onChange={(e) => handleSubscriptionSelectionChange(e.target.value)}
                          aria-invalid={hasMissingField('subscription') ? 'true' : 'false'}
                          className={getFieldInputClassName('input-base w-full text-sm', hasMissingField('subscription'))}
                        >
                          <option value="">
                            {t('smartEntryModal.subscription.chooseMatchingSubscription', {
                              ns: 'portal',
                              defaultValue: 'Select the matching subscription',
                            })}
                          </option>
                          {(reviewState.subscription.subscriptionOptions || []).map((option) => (
                            <option key={option.subscriptionId} value={option.subscriptionId}>
                              {option.name}
                              {option.provider ? ` • ${option.provider}` : ''}
                              {typeof option.amount === 'number' && option.currencyCode ? ` • ${formatMoney(option.amount, option.currencyCode, contextSnapshot?.defaultCurrency)}` : ''}
                            </option>
                          ))}
                        </select>
                        {hasMissingField('subscription') && (
                          <p className={getFieldErrorTextClassName('mt-1 text-xs')}>
                            {getFieldErrorMessage('subscription')}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className={reviewFieldGroupClass}>
                        <label className={getFieldLabelClassName(Boolean(getFieldErrorMessage('subscription')), 'mb-1.5 block text-xs font-600')}>
                          {t('personalSubscriptions.form.fields.name', {
                            ns: 'portal',
                            defaultValue: 'Subscription name',
                          })}
                          <span className={getRequiredMarkerClassName()}> *</span>
                        </label>
                        <input
                          value={reviewState.subscription.subscriptionName || ''}
                          onChange={(e) =>
                            updateSubscriptionReview((current) => ({
                              ...current,
                              subscriptionName: e.target.value,
                            }))
                          }
                          aria-invalid={hasMissingField('subscription') ? 'true' : 'false'}
                          className={getFieldInputClassName('input-base w-full text-sm', hasMissingField('subscription'))}
                          placeholder={t('personalSubscriptions.form.fields.name', {
                            ns: 'portal',
                            defaultValue: 'Subscription name',
                          })}
                        />
                        {hasMissingField('subscription') && (
                          <p className={getFieldErrorTextClassName('mt-1 text-xs')}>
                            {getFieldErrorMessage('subscription')}
                          </p>
                        )}
                      </div>
                      <div className={reviewFieldGroupClass}>
                        <label className={getFieldLabelClassName(false, 'mb-1.5 block text-xs font-600')}>
                          {t('personalSubscriptions.form.fields.provider', {
                            ns: 'portal',
                            defaultValue: 'Provider',
                          })}
                        </label>
                        <input
                          value={reviewState.subscription.provider || ''}
                          onChange={(e) =>
                            updateSubscriptionReview((current) => ({
                              ...current,
                              provider: e.target.value,
                            }))
                          }
                          className="input-base w-full text-sm"
                          placeholder={t('personalSubscriptions.form.fields.provider', {
                            ns: 'portal',
                            defaultValue: 'Provider',
                          })}
                        />
                      </div>
                    </div>

                    {(reviewState.subscription.intent === 'personal_subscription_create'
                      || reviewState.subscription.intent === 'personal_subscription_payment'
                      || reviewState.subscription.intent === 'personal_subscription_update') && (
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className={reviewFieldGroupClass}>
                          <label className={getFieldLabelClassName(Boolean(getFieldErrorMessage('amount')), 'mb-1.5 block text-xs font-600')}>
                            {t('personalSubscriptions.form.fields.amount', {
                              ns: 'portal',
                              defaultValue: 'Amount',
                            })}
                            <span className={getRequiredMarkerClassName()}> *</span>
                          </label>
                          <input
                            type="number"
                            inputMode="decimal"
                            value={typeof reviewState.subscription.amount === 'number' ? String(reviewState.subscription.amount) : ''}
                            onChange={(e) =>
                              updateSubscriptionReview((current) => ({
                                ...current,
                                amount: e.target.value.trim() ? Number(e.target.value) : undefined,
                              }))
                            }
                            aria-invalid={hasMissingField('amount') ? 'true' : 'false'}
                            className={getFieldInputClassName('input-base w-full text-sm', hasMissingField('amount'))}
                            placeholder={t('smartEntryModal.amountPlaceholder', {
                              ns: 'portal',
                              currency: normalizeReviewCurrency(reviewState.subscription.currencyCode || reviewState.currency),
                            })}
                          />
                          {hasMissingField('amount') && (
                            <p className={getFieldErrorTextClassName('mt-1 text-xs')}>
                              {getFieldErrorMessage('amount')}
                            </p>
                          )}
                        </div>
                        <div className={reviewFieldGroupClass}>
                          <label className={getFieldLabelClassName(Boolean(getFieldErrorMessage('billingFrequency')), 'mb-1.5 block text-xs font-600')}>
                            {t('personalSubscriptions.form.fields.billingFrequency', {
                              ns: 'portal',
                              defaultValue: 'Billing frequency',
                            })}
                            <span className={getRequiredMarkerClassName()}> *</span>
                          </label>
                          <select
                            value={reviewState.subscription.billingFrequency || ''}
                            onChange={(e) =>
                              updateSubscriptionReview((current) => ({
                                ...current,
                                billingFrequency: normalizeSubscriptionBillingFrequencyInput(e.target.value),
                              }))
                            }
                            aria-invalid={hasMissingField('billingFrequency') ? 'true' : 'false'}
                            className={getFieldInputClassName('input-base w-full text-sm', hasMissingField('billingFrequency'))}
                          >
                            <option value="">
                              {t('smartEntryModal.subscription.chooseBillingFrequency', {
                                ns: 'portal',
                                defaultValue: 'Select billing frequency',
                              })}
                            </option>
                            {(['weekly', 'monthly', 'quarterly', 'semi_annual', 'yearly', 'custom'] as const).map((frequency) => (
                              <option key={frequency} value={frequency}>
                                {getSubscriptionFrequencyLabel(frequency, t)}
                              </option>
                            ))}
                          </select>
                          {hasMissingField('billingFrequency') && (
                            <p className={getFieldErrorTextClassName('mt-1 text-xs')}>
                              {getFieldErrorMessage('billingFrequency')}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {(reviewState.subscription.intent === 'personal_subscription_create'
                      || reviewState.subscription.intent === 'personal_subscription_payment'
                      || reviewState.subscription.intent === 'personal_subscription_update') && (
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        <div className={reviewFieldGroupClass}>
                          <label className="text-xs font-600 text-muted-foreground">
                            {t('personalSubscriptions.form.fields.startDate', {
                              ns: 'portal',
                              defaultValue: 'Start date',
                            })}
                          </label>
                          <input
                            type="date"
                            value={reviewState.subscription.startDate || ''}
                            onChange={(e) =>
                              updateSubscriptionReview((current) => ({
                                ...current,
                                startDate: e.target.value || undefined,
                              }))
                            }
                            className="input-base w-full text-sm"
                          />
                        </div>
                        <div className={reviewFieldGroupClass}>
                          <label className="text-xs font-600 text-muted-foreground">
                            {t('personalSubscriptions.form.fields.nextBillingDate', {
                              ns: 'portal',
                              defaultValue: 'Next billing date',
                            })}
                          </label>
                          <input
                            type="date"
                            value={reviewState.subscription.nextBillingDate || ''}
                            onChange={(e) =>
                              updateSubscriptionReview((current) => ({
                                ...current,
                                nextBillingDate: e.target.value || undefined,
                              }))
                            }
                            className="input-base w-full text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {reviewState.subscription.intent === 'personal_subscription_cancel' && (
                      <div className={reviewFieldGroupClass}>
                        <label className={getFieldLabelClassName(Boolean(getFieldErrorMessage('cancelEffectiveDate')), 'mb-1.5 block text-xs font-600')}>
                          {t('personalSubscriptions.cancellation.effectiveDate', {
                            ns: 'portal',
                            defaultValue: 'Effective cancellation date',
                          })}
                          <span className={getRequiredMarkerClassName()}> *</span>
                        </label>
                        <input
                          type="date"
                          value={reviewState.subscription.cancelEffectiveDate || ''}
                          onChange={(e) =>
                            updateSubscriptionReview((current) => ({
                              ...current,
                              cancelEffectiveDate: e.target.value || undefined,
                            }))
                          }
                          aria-invalid={hasMissingField('cancelEffectiveDate') ? 'true' : 'false'}
                          className={getFieldInputClassName('input-base w-full text-sm', hasMissingField('cancelEffectiveDate'))}
                        />
                        {hasMissingField('cancelEffectiveDate') && (
                          <p className={getFieldErrorTextClassName('mt-1 text-xs')}>
                            {getFieldErrorMessage('cancelEffectiveDate')}
                          </p>
                        )}
                      </div>
                    )}

                    {(reviewState.subscription.intent === 'personal_subscription_create'
                      || reviewState.subscription.intent === 'personal_subscription_payment'
                      || reviewState.subscription.intent === 'personal_subscription_update') && (
                      <>
                        <div className={reviewFieldGroupClass}>
                          <label className="text-xs font-600 text-muted-foreground">
                            {t('personalSubscriptions.form.fields.paymentMethod', {
                              ns: 'portal',
                              defaultValue: 'Payment method',
                            })}
                          </label>
                          <select
                            value={reviewState.subscription.paymentMethod || ''}
                            onChange={(e) =>
                              updateSubscriptionReview((current) => ({
                                ...current,
                                paymentMethod: (e.target.value || null) as NonNullable<SmartEntryReview['subscription']>['paymentMethod'],
                              }))
                            }
                            className="input-base w-full text-sm"
                          >
                            <option value="">
                              {t('personalSubscriptions.form.fields.selectPaymentMethod', {
                                ns: 'portal',
                                defaultValue: 'Select payment method',
                              })}
                            </option>
                            {(['Credit Card', 'Debit Card', 'Bank Account', 'PayPal', 'Cash', 'Apple Pay', 'Google Pay', 'Other'] as const).map((method) => (
                              <option key={method} value={method}>
                                {getSubscriptionPaymentMethodLabel(method, t)}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="grid gap-2.5 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                          <div className={`${reviewInnerCardClass} space-y-2`}>
                            <label className="flex items-center gap-2.5 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={reviewState.subscription.autoRenew !== false}
                                onChange={(e) =>
                                  updateSubscriptionReview((current) => ({
                                    ...current,
                                    autoRenew: e.target.checked,
                                  }))
                                }
                                className="h-4 w-4 rounded border-border"
                              />
                              <span>
                                {t('personalSubscriptions.form.fields.autoRenew', {
                                  ns: 'portal',
                                  defaultValue: 'Auto-renew this subscription',
                                })}
                              </span>
                            </label>

                            <label className="flex items-center gap-2.5 text-sm text-foreground">
                              <input
                                type="checkbox"
                                checked={reviewState.subscription.createLinkedRecurringExpense !== false}
                                onChange={(e) =>
                                  updateSubscriptionReview((current) => ({
                                    ...current,
                                    createLinkedRecurringExpense: e.target.checked,
                                  }))
                                }
                                className="h-4 w-4 rounded border-border"
                              />
                              <span>
                                {t('personalSubscriptions.form.fields.createLinkedRecurringExpense', {
                                  ns: 'portal',
                                  defaultValue: 'Create linked recurring expense',
                                })}
                              </span>
                            </label>

                            {reviewState.subscription.mayHavePaymentNow && reviewState.subscription.intent === 'personal_subscription_create' && (
                              <label className="flex items-center gap-2.5 text-sm text-foreground">
                                <input
                                  type="checkbox"
                                  checked={reviewState.subscription.paymentHappenedNow === true}
                                  onChange={(e) =>
                                    updateSubscriptionReview((current) => ({
                                      ...current,
                                      paymentHappenedNow: e.target.checked,
                                    }))
                                  }
                                  className="h-4 w-4 rounded border-border"
                                />
                                <span>
                                  {t('smartEntryModal.subscription.createPaymentToday', {
                                    ns: 'portal',
                                    defaultValue: 'Create payment today',
                                  })}
                                </span>
                              </label>
                            )}
                          </div>

                          <div className={reviewFieldGroupClass}>
                            <label className="text-xs font-600 text-muted-foreground">
                              {t('personalSubscriptions.form.fields.reminderDaysBefore', {
                                ns: 'portal',
                                defaultValue: 'Reminder days before charge',
                              })}
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {PERSONAL_SUBSCRIPTION_REMINDER_OPTIONS.map((days) => {
                                const selected = (reviewState.subscription?.reminderDaysBefore || []).includes(days);
                                return (
                                  <button
                                    key={days}
                                    type="button"
                                    onClick={() => handleSubscriptionReminderToggle(days)}
                                    className={`rounded-full border px-2.5 py-1 text-xs font-600 transition-colors ${
                                      selected
                                        ? 'border-accent bg-accent/10 text-accent'
                                        : 'border-border bg-card text-muted-foreground hover:border-accent/40'
                                    }`}
                                  >
                                    {t('personalSubscriptions.form.reminderOption', {
                                      ns: 'portal',
                                      count: days,
                                      defaultValue: days === 1 ? '{{count}} day' : '{{count}} days',
                                    })}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {!isSubscriptionFlow && reviewState.person?.required && (
                  <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                      {t('smartEntryModal.personTitle', { ns: 'portal' })}
                    </p>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-xs text-muted-foreground">
                        {t('smartEntryModal.personTitle', { ns: 'portal' })}
                      </p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {selectedPerson?.fullName || reviewState.person.name || t('smartEntryModal.choosePerson', { ns: 'portal' })}
                      </p>
                    </div>
                    <select
                      value={personSelectValue}
                      onChange={(e) => handlePersonSelectionChange(e.target.value)}
                      className="input-base w-full text-sm"
                    >
                      <option value="">{t('smartEntryModal.choosePerson', { ns: 'portal' })}</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.fullName}
                        </option>
                      ))}
                      <option value="__create__">
                        {t('smartEntryModal.createPersonAction', {
                          ns: 'portal',
                          name: reviewState.person.name || t('smartEntryModal.personFallbackName', { ns: 'portal' }),
                        })}
                      </option>
                    </select>
                    {personDraft && (
                      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                        <input
                          value={personDraft.name}
                          onChange={(e) => setPersonDraft((current) => current ? { ...current, name: e.target.value } : current)}
                          className="input-base w-full text-sm"
                          placeholder={t('smartEntryModal.personNamePlaceholder', { ns: 'portal' })}
                        />
                        <select
                          value={personDraft.relationship}
                          onChange={(e) =>
                            setPersonDraft((current) =>
                              current ? { ...current, relationship: e.target.value as typeof current.relationship } : current
                            )
                          }
                          className="input-base w-full text-sm"
                        >
                          <option value="other">{t('people.relationships.other', { ns: 'portal' })}</option>
                          <option value="friend">{t('people.relationships.friend', { ns: 'portal' })}</option>
                          <option value="client">{t('people.relationships.client', { ns: 'portal' })}</option>
                          <option value="relative">{t('people.relationships.relative', { ns: 'portal' })}</option>
                          <option value="colleague">{t('people.relationships.colleague', { ns: 'portal' })}</option>
                          <option value="spouse">{t('people.relationships.spouse', { ns: 'portal' })}</option>
                          <option value="child">{t('people.relationships.child', { ns: 'portal' })}</option>
                          <option value="parent">{t('people.relationships.parent', { ns: 'portal' })}</option>
                          <option value="sibling">{t('people.relationships.sibling', { ns: 'portal' })}</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={handleApplyCreatePerson}
                            disabled={!personDraft.name.trim()}
                            className="flex-1 rounded-xl bg-positive py-2.5 text-sm font-600 text-white transition-colors hover:bg-positive/90 disabled:opacity-50"
                          >
                            {t('smartEntryModal.useThisPerson', { ns: 'portal' })}
                          </button>
                          <button
                            onClick={() => setPersonDraft(null)}
                            className="rounded-xl bg-muted px-4 py-2.5 text-sm font-600 text-foreground transition-colors hover:bg-muted/80"
                          >
                            {t('actions.back', { ns: 'common' })}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(isSubscriptionFlow || (reviewState.account?.required && (!reviewState.purposeOptions?.length || !!reviewState.purpose && reviewState.purpose !== 'unclear'))) && (
                  <div className={reviewSectionClass}>
                    <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                      {isSubscriptionFlow
                        ? t('smartEntryModal.subscription.paymentAccountSection', {
                            ns: 'portal',
                            defaultValue: 'Payment account',
                          })
                        : t('smartEntryModal.accountTitle', { ns: 'portal' })}
                    </p>
                    <div className={reviewInnerCardClass}>
                      <p className="text-xs text-muted-foreground">
                        {isSubscriptionFlow
                          ? getSubscriptionPrimaryAccountLabel(reviewState.subscription?.intent, (key, options) => t(key, { ns: 'portal', ...options }))
                          : getPrimaryAccountLabel(reviewState.purpose, (key, options) => t(key, { ns: 'portal', ...options }))}
                      </p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {getContextAccountDisplayLabel(selectedAccount) || reviewState.account?.name || (
                          isSubscriptionFlow
                            ? t('smartEntryModal.subscription.paymentAccountFallback', {
                                ns: 'portal',
                                defaultValue: 'Select a payment account',
                              })
                            : t('smartEntryModal.primaryAccountFallback', { ns: 'portal' })
                        )}
                      </p>
                    </div>
                    <label className={getFieldLabelClassName(Boolean(isSubscriptionFlow && getFieldErrorMessage('account')), 'mb-1.5 block text-xs font-600')}>
                      {isSubscriptionFlow
                        ? getSubscriptionPrimaryAccountLabel(reviewState.subscription?.intent, (key, options) => t(key, { ns: 'portal', ...options }))
                        : getPrimaryAccountLabel(reviewState.purpose, (key, options) => t(key, { ns: 'portal', ...options }))}
                      {reviewState.account?.required ? <span className={getRequiredMarkerClassName()}> *</span> : null}
                    </label>
                    <select
                      value={primaryAccountSelectValue}
                      onChange={(e) => handleAccountSelectionChange('account', e.target.value)}
                      aria-invalid={hasMissingField('account') ? 'true' : 'false'}
                      className={getFieldInputClassName('input-base w-full text-sm', hasMissingField('account'))}
                    >
                      <option value="">
                        {isSubscriptionFlow
                          ? t('smartEntryModal.subscription.paymentAccountFallback', {
                              ns: 'portal',
                              defaultValue: 'Select a payment account',
                            })
                          : t('smartEntryModal.primaryAccountFallback', { ns: 'portal' })}
                      </option>
                      {primaryAccountOptions.map((account) => (
                        <option key={account.id} value={account.id}>
                          {getContextAccountDisplayLabel(account)}
                        </option>
                      ))}
                      <option value="__create__">
                        {t('smartEntryModal.createAccountAction', {
                          ns: 'portal',
                          name: reviewState.account?.name || t('smartEntryModal.accountFallbackName', { ns: 'portal' }),
                        })}
                      </option>
                    </select>
                    {hasMissingField('account') && (
                      <p className={getFieldErrorTextClassName('mt-1 text-xs')}>
                        {getFieldErrorMessage('account')}
                      </p>
                    )}
                    {accountDraft && accountDraftTarget === 'account' && (
                      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                        <input
                          value={accountDraft.name}
                          onChange={(e) => setAccountDraft((current) => current ? { ...current, name: e.target.value } : current)}
                          className="input-base w-full text-sm"
                          placeholder={t('smartEntryModal.accountNamePlaceholder', { ns: 'portal' })}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={accountDraft.type}
                            onChange={(e) =>
                              setAccountDraft((current) => current ? { ...current, type: e.target.value as SuggestedAccount['type'] } : current)
                            }
                            className="input-base w-full text-sm"
                          >
                            <option value="cash">{t('accounts.types.cash', { ns: 'portal' })}</option>
                            <option value="bank">{t('accounts.types.bank', { ns: 'portal' })}</option>
                            <option value="credit_card">{t('accounts.types.creditCard', { ns: 'portal' })}</option>
                            <option value="savings">{t('accounts.types.savings', { ns: 'portal' })}</option>
                            <option value="digital_wallet">{t('accounts.types.digitalWallet', { ns: 'portal' })}</option>
                            <option value="investment">{t('accounts.types.investment', { ns: 'portal' })}</option>
                            <option value="other">{t('accounts.types.other', { ns: 'portal' })}</option>
                          </select>
                          <input
                            value={accountDraft.currency}
                            onChange={(e) => setAccountDraft((current) => current ? { ...current, currency: e.target.value.toUpperCase() } : current)}
                            className="input-base w-full text-sm"
                            maxLength={3}
                            placeholder={t('smartEntryModal.currencyPlaceholder', { ns: 'portal' })}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleApplyCreateAccount}
                            disabled={!accountDraft.name.trim()}
                            className="flex-1 rounded-xl bg-positive py-2.5 text-sm font-600 text-white transition-colors hover:bg-positive/90 disabled:opacity-50"
                          >
                            {t('smartEntryModal.useThisAccount', { ns: 'portal' })}
                          </button>
                          <button
                            onClick={() => {
                              setAccountDraft(null);
                              setAccountDraftTarget(null);
                            }}
                            className="rounded-xl bg-muted px-4 py-2.5 text-sm font-600 text-foreground transition-colors hover:bg-muted/80"
                          >
                            {t('actions.back', { ns: 'common' })}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!isSubscriptionFlow && reviewState.amountActionIndex !== undefined && (
                  <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                      {t('smartEntryModal.amountTitle', { ns: 'portal' })}
                    </p>
                    <div className="rounded-xl bg-card p-3 space-y-2">
                      <p className="text-sm font-600 text-foreground">
                        {amountPromptLabel}
                      </p>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={typeof reviewState.amount === 'number' ? String(reviewState.amount) : ''}
                        onChange={(e) => handleReviewAmountChange(e.target.value)}
                        className="input-base w-full text-sm"
                        placeholder={t('smartEntryModal.amountPlaceholder', {
                          ns: 'portal',
                          currency: normalizeReviewCurrency(reviewState.currency),
                        })}
                      />
                      {typeof reviewState.amountQuickOptionValue === 'number' && (
                        <button
                          type="button"
                          onClick={handleUseFullAmount}
                          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-600 text-foreground transition-colors hover:border-accent/40"
                        >
                          {t('smartEntryModal.useFullAmount', {
                            ns: 'portal',
                            amount: formatMoney(reviewState.amountQuickOptionValue, reviewState.currency, contextSnapshot?.defaultCurrency),
                          })}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {!isSubscriptionFlow && reviewState.destinationAccount?.required && (
                  <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                      {t('smartEntryModal.destinationAccountTitle', { ns: 'portal' })}
                    </p>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-xs text-muted-foreground">
                        {t('smartEntryModal.moveMoneyTo', { ns: 'portal' })}
                      </p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {selectedDestinationAccount?.name || reviewState.destinationAccount.name || t('smartEntryModal.destinationAccountFallback', { ns: 'portal' })}
                      </p>
                    </div>
                    <select
                      value={destinationAccountSelectValue}
                      onChange={(e) => handleAccountSelectionChange('destinationAccount', e.target.value)}
                      className="input-base w-full text-sm"
                    >
                      <option value="">{t('smartEntryModal.destinationAccountFallback', { ns: 'portal' })}</option>
                      {eligibleDestinationAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} • {getAccountTypeLabel(account.type, t)} • {account.currency}
                        </option>
                      ))}
                      <option value="__create__">
                        {t('smartEntryModal.createAccountAction', {
                          ns: 'portal',
                          name: reviewState.destinationAccount.name || t('smartEntryModal.accountFallbackName', { ns: 'portal' }),
                        })}
                      </option>
                    </select>
                    {accountDraft && accountDraftTarget === 'destinationAccount' && (
                      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                        <input
                          value={accountDraft.name}
                          onChange={(e) => setAccountDraft((current) => current ? { ...current, name: e.target.value } : current)}
                          className="input-base w-full text-sm"
                          placeholder={t('smartEntryModal.accountNamePlaceholder', { ns: 'portal' })}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={accountDraft.type}
                            onChange={(e) =>
                              setAccountDraft((current) => current ? { ...current, type: e.target.value as SuggestedAccount['type'] } : current)
                            }
                            className="input-base w-full text-sm"
                          >
                            <option value="cash">{t('accounts.types.cash', { ns: 'portal' })}</option>
                            <option value="bank">{t('accounts.types.bank', { ns: 'portal' })}</option>
                            <option value="credit_card">{t('accounts.types.creditCard', { ns: 'portal' })}</option>
                            <option value="savings">{t('accounts.types.savings', { ns: 'portal' })}</option>
                            <option value="digital_wallet">{t('accounts.types.digitalWallet', { ns: 'portal' })}</option>
                            <option value="investment">{t('accounts.types.investment', { ns: 'portal' })}</option>
                            <option value="other">{t('accounts.types.other', { ns: 'portal' })}</option>
                          </select>
                          <input
                            value={accountDraft.currency}
                            onChange={(e) => setAccountDraft((current) => current ? { ...current, currency: e.target.value.toUpperCase() } : current)}
                            className="input-base w-full text-sm"
                            maxLength={3}
                            placeholder={t('smartEntryModal.currencyPlaceholder', { ns: 'portal' })}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleApplyCreateAccount}
                            disabled={!accountDraft.name.trim()}
                            className="flex-1 rounded-xl bg-positive py-2.5 text-sm font-600 text-white transition-colors hover:bg-positive/90 disabled:opacity-50"
                          >
                            {t('smartEntryModal.useThisAccount', { ns: 'portal' })}
                          </button>
                          <button
                            onClick={() => {
                              setAccountDraft(null);
                              setAccountDraftTarget(null);
                            }}
                            className="rounded-xl bg-muted px-4 py-2.5 text-sm font-600 text-foreground transition-colors hover:bg-muted/80"
                          >
                            {t('actions.back', { ns: 'common' })}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className={reviewSectionClass}>
                  <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">
                    {t('smartEntryModal.summaryTitle', { ns: 'portal' })}
                  </p>
                  <div className={isSubscriptionFlow ? 'space-y-1.5' : 'space-y-2'}>
                    {compactSummaryRows.map((row, index) => (
                      <p key={index} className="text-sm text-foreground">{row}</p>
                    ))}
                  </div>
                  {!isSubscriptionFlow && totals && reviewState.purpose === 'managed_money' && (
                    <p className="text-sm font-600 text-foreground">
                      {t('smartEntryModal.summary.remainingFor', {
                        ns: 'portal',
                        name: reviewState.person?.name || t('smartEntryModal.personFallbackName', { ns: 'portal' }),
                        amount: formatMoney(totals.net, reviewState.currency, contextSnapshot?.defaultCurrency),
                      })}
                    </p>
                  )}
                  {!isSubscriptionFlow && totals && reviewState.purpose === 'borrowed_money' && (
                    <div className="space-y-1 text-sm font-600 text-foreground">
                      <p>
                        {t('smartEntryModal.summary.cashRemainingAfterSpending', {
                          ns: 'portal',
                          amount: formatMoney(totals.net, reviewState.currency, contextSnapshot?.defaultCurrency),
                        })}
                      </p>
                      <p>
                        {t('smartEntryModal.summary.amountStillOwedTo', {
                          ns: 'portal',
                          name: reviewState.person?.name || t('smartEntryModal.personFallbackName', { ns: 'portal' }),
                          amount: formatMoney(totals.loanAmount, reviewState.currency, contextSnapshot?.defaultCurrency),
                        })}
                      </p>
                    </div>
                  )}
                  {!isSubscriptionFlow && totals && reviewState.purpose === 'managed_return' && (
                    <p className="text-sm font-600 text-foreground">
                      {t('smartEntryModal.summary.managedBalanceChange', {
                        ns: 'portal',
                        amount: formatMoney(totals.net, reviewState.currency, contextSnapshot?.defaultCurrency),
                      })}
                    </p>
                  )}
                </div>

                {unresolvedReviewFields.length > 0 && (
                  <div className="rounded-xl border border-warning/20 bg-warning-soft p-3">
                    <p className="text-xs font-600 text-warning">
                      {t('smartEntryModal.stillNeeded', {
                        ns: 'portal',
                        fields: unresolvedReviewFields.join(', '),
                      })}
                    </p>
                  </div>
                )}
              </div>

              <div className={`flex gap-2 ${
                isSubscriptionFlow
                  ? 'sticky bottom-0 mt-3 border-t border-border bg-card/95 pt-3 pb-1 backdrop-blur'
                  : ''
              }`}>
                <button
                  onClick={handleConfirm}
                  disabled={unresolvedReviewFields.length > 0}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-positive text-white text-sm font-700 transition-colors hover:bg-positive/90 disabled:cursor-not-allowed disabled:opacity-50 ${
                    isSubscriptionFlow ? 'px-4 py-2.5' : 'py-3'
                  }`}
                >
                  <CheckCircle size={16} />
                  {isSubscriptionFlow
                    ? getSubscriptionConfirmLabel(reviewState.subscription?.intent, (key, options) => t(key, { ns: 'portal', ...options }))
                    : t('smartEntryModal.confirmAndSave', { ns: 'portal' })}
                </button>
                <button
                  onClick={handleReset}
                  className={`rounded-xl bg-muted text-foreground text-sm font-600 transition-colors hover:bg-muted/80 ${
                    isSubscriptionFlow ? 'px-3.5 py-2.5' : 'px-4 py-3'
                  }`}
                  aria-label={t('actions.reset', { ns: 'common' })}
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              {unresolvedReviewFields.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('smartEntryModal.completeRequiredDetails', { ns: 'portal' })}
                </p>
              )}
            </div>
          )}

          {/* Executing */}
          {step === 'executing' && (
            <div className="p-8 flex flex-col items-center gap-4">
              <Loader2 size={36} className="text-accent animate-spin" />
              <p className="text-sm font-600 text-foreground">
                {t('smartEntryModal.savingRecords', { ns: 'portal' })}
              </p>
            </div>
          )}

          {/* Success */}
          {step === 'success' && executionResult && (
            <div className="p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-positive-soft flex items-center justify-center">
                <CheckCircle size={32} className="text-positive" />
              </div>
              <div>
                <p className="text-base font-700 text-foreground">
                  {t('smartEntryModal.successTitle', { ns: 'portal' })}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('smartEntryModal.recordsCreated', {
                    ns: 'portal',
                    count: executionResult.count,
                  })}
                </p>
              </div>
              <div className="flex gap-2 w-full">
                <button
                  onClick={handleReset}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                >
                  {t('smartEntryModal.addAnother', { ns: 'portal' })}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors"
                >
                  {t('actions.done', { ns: 'common' })}
                </button>
              </div>
            </div>
          )}

          {/* Known limit state */}
          {step === 'limit' && (
            <div className="p-6 space-y-5">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-warning-soft flex items-center justify-center">
                  <AlertTriangle size={28} className="text-warning" />
                </div>
                <div>
                  <p className="text-base font-700 text-foreground">{limitView.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{limitView.description}</p>
                </div>
                {usageSummary?.planName && (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-3 py-1 text-xs font-600 text-accent">
                    <Zap size={12} />
                    {usageSummary.planName}
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-2xl border border-border bg-muted/20 p-4">
                {typeof limitView.requestsToday === 'number' && typeof limitView.dailyLimit === 'number' && limitView.dailyLimit > 0 && (
                  <UsageProgressBar
                    label={t('smartEntryModal.limit.dailyRequests', { ns: 'portal' })}
                    used={limitView.requestsToday}
                    total={limitView.dailyLimit}
                  />
                )}
                {typeof limitView.creditsUsed === 'number' && typeof limitView.creditsAllocated === 'number' && limitView.creditsAllocated > 0 && (
                  <UsageProgressBar
                    label={t('smartEntryModal.limit.monthlyCredits', { ns: 'portal' })}
                    used={limitView.creditsUsed}
                    total={limitView.creditsAllocated}
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {t('smartEntryModal.limit.creditsRemaining', { ns: 'portal' })}
                    </p>
                    <p className="mt-1 text-lg font-700 text-foreground">{Math.max(0, limitView.creditsRemaining || 0)}</p>
                  </div>
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {t('smartEntryModal.limit.creditsReserved', { ns: 'portal' })}
                    </p>
                    <p className="mt-1 text-lg font-700 text-foreground">{Math.max(0, usageSummary?.creditsReserved || 0)}</p>
                  </div>
                </div>
                {typeof limitView.requiredCredits === 'number' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {t('smartEntryModal.limit.requiredCredits', { ns: 'portal' })}
                      </p>
                      <p className="mt-1 text-lg font-700 text-foreground">{limitView.requiredCredits}</p>
                    </div>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        {t('smartEntryModal.limit.renewal', { ns: 'portal' })}
                      </p>
                      <p className="mt-1 text-sm font-600 text-foreground flex items-center gap-1.5">
                        <Calendar size={12} className="text-muted-foreground" />
                        {limitView.renewalLabel || '—'}
                      </p>
                    </div>
                  </div>
                )}
                {limitView.resetLabel && (
                  <div className="flex items-center gap-2 rounded-xl bg-card p-3 text-sm text-foreground">
                    <Clock size={14} className="text-warning flex-shrink-0" />
                    <span>{limitView.resetLabel}</span>
                  </div>
                )}
                {!limitView.resetLabel && limitView.renewalLabel && (
                  <div className="flex items-center gap-2 rounded-xl bg-card p-3 text-sm text-foreground">
                    <Calendar size={14} className="text-muted-foreground flex-shrink-0" />
                    <span>
                      {t('smartEntryModal.limit.nextRenewal', {
                        ns: 'portal',
                        date: limitView.renewalLabel,
                      })}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                >
                  {t('actions.close', { ns: 'common' })}
                </button>
                <button
                  onClick={() => router.push('/settings/subscription')}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
                >
                  {limitView.primaryLabel}
                  <ArrowUpRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Failed */}
          {step === 'failed' && (
            <div className="p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-negative-soft flex items-center justify-center">
                <AlertTriangle size={28} className="text-negative" />
              </div>
              <div>
                <p className="text-base font-700 text-foreground">{failedStateTitle}</p>
                <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
                {apiError?.requestId && (
                  <p className="text-xs text-muted-foreground mt-2">
                    {t('smartEntryModal.referenceLabel', { ns: 'portal' })}: {apiError.requestId}
                  </p>
                )}
              </div>
              <div className="flex gap-2 w-full">
                {failedShowsRefresh ? (
                  <button
                    onClick={handleReset}
                    className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <RotateCcw size={16} />
                    {t('actions.refresh', { ns: 'common' })}
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setMode('text');
                      setStep('entry');
                      setApiError(null);
                      setErrorMessage('');
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
                  >
                    <Type size={16} />
                    {t('smartEntryModal.voice.actions.useText', { ns: 'portal' })}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                >
                  {t('actions.close', { ns: 'common' })}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <DocumentTransactionReviewModal
        isOpen={!!documentReviewFile}
        file={documentReviewFile}
        sourceSurface="smart_entry"
        onClose={() => setDocumentReviewFile(null)}
        onSaved={async () => {
          dispatchSmartPocketDataChanged({
            source: 'smart-entry-document-review',
            entities: ['dashboard', 'transactions', 'financial_accounts', 'ai_usage'],
          });
          router.refresh();
          onClose();
        }}
      />
    </div>,
    document.body
  );
}
