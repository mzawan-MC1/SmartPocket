 'use client';
 import React, { useState, useCallback, useEffect, useRef } from 'react';
 import {
   X,
   Mic,
   Type,
   AlertTriangle,
   CheckCircle,
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
 import { createClient } from '@/lib/supabase/client';
import { formatCurrencyText } from '@/lib/currency-formatting';
 import VoiceRecorder from './VoiceRecorder';
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
 import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
 import { createClientId } from '@/lib/uuid';
 import { useLanguage } from '@/contexts/LanguageContext';
 import {
   applySmartEntryReviewToInstruction,
   buildInitialSmartEntryReview,
  getEligibleAccountsForPurpose,
   getCompactSummaryRows,
  getManagedAccountName,
   getSmartEntryMissingFields,
   getSmartEntryTotals,
  hydrateSmartEntryReviewWithContext,
   inferAccountType,
  isManagedPurpose,
   sanitizeCurrency,
 } from '@/lib/smart-entry';

 type AssistantStep =
   | 'entry'
   | 'processing'
   | 'confirming'
   | 'executing'
   | 'limit'
   | 'success'
   | 'failed';

 interface AIAssistantModalProps {
   onClose: () => void;
   defaultMode?: 'voice' | 'text';
 }

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

 function getPrimaryAccountLabel(purpose: SmartEntryPurpose | undefined) {
   switch (purpose) {
    case 'personal_expense':
      return 'Spend from';
     case 'borrowed_money':
       return 'Add borrowed money to';
     case 'managed_money':
       return 'Track their money in';
     case 'managed_return':
       return 'Return money from';
     case 'loan_repayment':
       return 'Pay back from';
     case 'transfer':
       return 'Move money from';
     default:
       return 'Add money to';
   }
 }

 export default function AIAssistantModal({ onClose, defaultMode = 'text' }: AIAssistantModalProps) {
   const { isRTL } = useLanguage();
   const router = useRouter();
   const dialogRef = useRef<HTMLDivElement>(null);
   const closeButtonRef = useRef<HTMLButtonElement>(null);
   const lastFocusedRef = useRef<HTMLElement | null>(null);
   const [mounted, setMounted] = useState(false);
   const [step, setStep] = useState<AssistantStep>('entry');
   const [mode, setMode] = useState<'voice' | 'text'>(defaultMode);
   const [textInput, setTextInput] = useState('');
   const [language, setLanguage] = useState('en');
   const [parsed, setParsed] = useState<ParsedFinancialInstruction | null>(null);
   const [reviewState, setReviewState] = useState<SmartEntryReview | null>(null);
   const [transcript, setTranscript] = useState('');
   const [errorMessage, setErrorMessage] = useState('');
   const [apiError, setApiError] = useState<AIErrorPayload | null>(null);
   const [usageSummary, setUsageSummary] = useState<AIUsageSummary | null>(null);
   const [executionResult, setExecutionResult] = useState<{ success: boolean; count: number } | null>(null);
   const [isAIConfigured, setIsAIConfigured] = useState<boolean | null>(null);
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
    if (!session?.access_token) throw new Error('Not authenticated');
    return session.access_token;
  };

  const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

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
    return date.toLocaleString(undefined, {
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
    return `Available again in ${hours} hour${hours === 1 ? '' : 's'}`;
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
          <span className="font-600 text-foreground">{safeUsed} of {safeTotal}</span>
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
        title: 'AI unavailable',
        description: 'AI access is temporarily unavailable.',
        primaryLabel: 'View Plans',
      };
    }

    if (error.code === 'DAILY_REQUEST_LIMIT_REACHED' || error.limitType === 'daily_requests') {
      return {
        title: 'Daily AI Request Limit Reached',
        description: `You have used all ${dailyLimit || requestsToday} AI requests available today.`,
        primaryLabel: 'View Plan',
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
        title: 'Monthly AI Credits Used',
        description: `You have used all ${creditsAllocated || creditsUsed} AI credits for this billing period.`,
        primaryLabel: 'View Plans',
        creditsUsed,
        creditsAllocated,
        creditsRemaining,
        renewalLabel: formatShortDateTime(usage?.cycleEnd),
      };
    }

    if (error.code === 'INSUFFICIENT_AI_CREDITS' || error.limitType === 'insufficient_credits') {
      return {
        title: 'Not Enough AI Credits',
        description: `This action requires ${error.requiredCredits || 0} credits, but you have ${creditsRemaining} remaining.`,
        primaryLabel: 'View Plans',
        creditsUsed,
        creditsAllocated,
        creditsRemaining,
        requiredCredits: error.requiredCredits,
        renewalLabel: formatShortDateTime(usage?.cycleEnd),
      };
    }

    if (error.code === 'TRIAL_EXPIRED' || error.limitType === 'trial_expired') {
      return {
        title: 'Trial Expired',
        description: error.message,
        primaryLabel: 'View Plans',
        creditsUsed,
        creditsAllocated,
        creditsRemaining,
        renewalLabel: formatShortDateTime(usage?.trialEndsAt || usage?.cycleEnd),
      };
    }

    return {
      title: 'Subscription Expired',
      description: error.message,
      primaryLabel: 'View Plans',
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
   const unresolvedReviewFields = previewInstruction ? getSmartEntryMissingFields(previewInstruction) : [];
   const compactSummaryRows = previewInstruction ? getCompactSummaryRows(previewInstruction) : [];
   const totals = previewInstruction ? getSmartEntryTotals(previewInstruction) : null;
   const accounts = contextSnapshot?.accounts || [];
   const people = contextSnapshot?.people || [];
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
    ? eligiblePrimaryAccounts.find((account) => account.id === reviewState.account?.accountId) || null
     : (
        eligiblePrimaryAccounts.find(
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

   const updateReview = useCallback((updater: (current: SmartEntryReview) => SmartEntryReview) => {
     setReviewState((current) => {
       if (!current || !parsed) return current;
       const next = updater(current);
       const reviewedInstruction = applySmartEntryReviewToInstruction({
         ...parsed,
         review: next,
       });
       return {
         ...next,
         missing: getSmartEntryMissingFields(reviewedInstruction),
       };
     });
   }, [parsed]);

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

  const resetRequestState = useCallback((options?: { preserveInput?: boolean; preserveMode?: boolean; preserveLanguage?: boolean }) => {
    setStep('entry');
    setTextInput(options?.preserveInput ? textInput : '');
    setTranscript('');
    setParsed(null);
    setReviewState(null);
    setErrorMessage('');
    setApiError(null);
    setUsageSummary(null);
    setExecutionResult(null);
    setContextSnapshot(null);
    setAccountDraft(null);
    setPersonDraft(null);
    setAccountDraftTarget(null);
    if (!options?.preserveMode) {
      setMode(defaultMode);
    }
    if (!options?.preserveLanguage) {
      setLanguage('en');
    }
  }, [defaultMode, textInput]);

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
       field === 'account' && isManagedPurpose(reviewState?.purpose)
        ? getManagedAccountName(personName)
         : selection?.name || 'Cash';

     setAccountDraftTarget(field);
     setAccountDraft({
       field,
       name: suggestedName,
       type: selection?.type || inferAccountType(suggestedName),
       currency: normalizeReviewCurrency(selection?.currency || reviewState?.currency),
       includeInTotal: field === 'account' ? !isManagedPurpose(reviewState?.purpose) : true,
     });
  }, [reviewState]);

   const handleApplyCreateAccount = useCallback(() => {
     if (!accountDraft?.name.trim()) return;

     updateReview((current) => {
        const selection: NonNullable<SmartEntryReview['account']> = {
         required: true,
         mode: 'create' as const,
         accountId: undefined,
         name: accountDraft.name.trim(),
         type: accountDraft.type,
         currency: normalizeReviewCurrency(accountDraft.currency),
         includeInTotal: accountDraft.field === 'account' ? accountDraft.includeInTotal : true,
         scope: accountDraft.field === 'account' && isManagedPurpose(current.purpose) ? ('managed' as const) : ('personal' as const),
         managedPersonId: accountDraft.field === 'account' && isManagedPurpose(current.purpose) ? current.person?.personId : undefined,
         managedPersonName: accountDraft.field === 'account' && isManagedPurpose(current.purpose) ? current.person?.name : undefined,
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
                 required: true,
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

    const pool = field === 'destinationAccount' ? eligibleDestinationAccounts : eligiblePrimaryAccounts;
    const account = pool.find((item) => item.id === value);
     if (!account) return;

     updateReview((current) => {
      const selection: NonNullable<SmartEntryReview['account']> = {
         required: true,
         mode: 'existing' as const,
         accountId: account.id,
         name: account.name,
         type: account.type as SuggestedAccount['type'],
         currency: normalizeReviewCurrency(account.currency),
         includeInTotal: field === 'account' ? !isManagedPurpose(current.purpose) : true,
         scope: field === 'account' && isManagedPurpose(current.purpose) ? ('managed' as const) : ('personal' as const),
         managedPersonId: field === 'account' && isManagedPurpose(current.purpose) ? current.person?.personId : undefined,
         managedPersonName: field === 'account' && isManagedPurpose(current.purpose) ? current.person?.name : undefined,
       };

       return field === 'destinationAccount'
         ? { ...current, destinationAccount: selection }
         : { ...current, account: selection };
     });

     setAccountDraft(null);
     setAccountDraftTarget(null);
  }, [eligibleDestinationAccounts, eligiblePrimaryAccounts, handleStartCreateAccount, normalizeReviewCurrency, updateReview]);

  const callParseAPI = useCallback(async (
    type: 'text' | 'voice',
    text?: string,
    audio?: { audioBase64: string; mimeType: string; durationSeconds: number }
  ) => {
    const nextFlowId = createClientId();
    resetRequestState({
      preserveInput: false,
      preserveMode: true,
      preserveLanguage: true,
    });
    setStep('processing');
    if (type === 'text' && text) {
      setTranscript(text);
    }
    setErrorMessage('');
    setApiError(null);
    setUsageSummary(null);

    try {
      const token = await getAuthToken();
      const context = await buildAIContext();
      setContextSnapshot(context);

      const body: Record<string, unknown> = {
        inputType: type,
        language,
        context,
        idempotencyKey: nextFlowId,
      };

      if (type === 'text') body.text = text;
      if (type === 'voice') body.audio = audio;

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
        handleApiFailure(data, 'AI processing failed. Please try again.');
        return;
      }

      if (data.transcript) setTranscript(data.transcript);

      const instruction = data.parsed as ParsedFinancialInstruction;
      setParsed(instruction);
      const baseReview =
        instruction.review ||
        buildInitialSmartEntryReview({
          instruction,
          sourceText: (text || transcript || '').trim(),
          context,
        });
      setReviewState(hydrateSmartEntryReviewWithContext({ review: baseReview, context }));
      setAccountDraft(null);
      setPersonDraft(null);
      setAccountDraftTarget(null);

      setStep('confirming');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error. Please try again.');
      setApiError(null);
      setUsageSummary(null);
      setStep('failed');
    }
  }, [language, handleApiFailure, resetRequestState]);

  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim()) return;
    callParseAPI('text', textInput.trim());
  }, [textInput, callParseAPI]);

  const handleVoiceReady = useCallback((audioBase64: string, mimeType: string, durationSeconds: number) => {
    callParseAPI('voice', undefined, { audioBase64, mimeType, durationSeconds });
  }, [callParseAPI]);

  const handleConfirm = useCallback(async () => {
    if (!parsed || !reviewState || unresolvedReviewFields.length > 0) return;
    setStep('executing');
    setErrorMessage('');
    setApiError(null);
    setUsageSummary(null);

    try {
      const confirmResponse = await fetch('/api/ai/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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

      const token = await getAuthToken();
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
          setErrorMessage(result.message || 'This Smart Entry request still needs more details before it can be saved.');
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
        entities: ['dashboard', 'transactions', 'financial_accounts', 'ai_usage'],
      });
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save records.');
      setApiError(null);
      setUsageSummary(null);
      setStep('failed');
    }
  }, [parsed, reviewState, previewInstruction?.actions.length, router, unresolvedReviewFields.length, handleApiFailure]);

  const handleReset = useCallback(() => {
    resetRequestState();
  }, [resetRequestState]);

  const getFriendlyExecutionErrorMessage = (rawError: unknown): string => {
    const message = typeof rawError === 'string' ? rawError : '';
    if (message.includes('already processed') || message.includes('already being processed') || message.includes('confirmed state')) {
      return 'This Smart Entry request was already processed. Your transaction was not duplicated.';
    }
    if (message.includes('Request not found')) {
      return 'This Smart Entry request is no longer available. Please try again.';
    }
    return 'Failed to save records. Please try again.';
  };

  const getFriendlyConfirmErrorMessage = (rawError: unknown): string => {
    const message = typeof rawError === 'string' ? rawError : '';
    if (message.includes('Unauthorized')) {
      return 'Your session expired. Please sign in again.';
    }
    if (message.includes('Forbidden')) {
      return 'This Smart Entry request belongs to another account.';
    }
    if (message.includes('Request not found')) {
      return 'This Smart Entry request is no longer available. Please try again.';
    }
    if (message.includes('already being processed')) {
      return 'This Smart Entry request is already being processed. Your transaction was not duplicated.';
    }
    if (message.includes('cannot be confirmed')) {
      return 'This Smart Entry request is no longer in a confirmable state.';
    }
    if (message.includes('unresolved account')) {
      return 'Please resolve the missing account before confirming.';
    }
    if (message.includes('unresolved managed people')) {
      return 'Please resolve the managed person before confirming.';
    }
    return 'Unable to confirm this Smart Entry request.';
  };

  const LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'ar', label: 'العربية' },
    { code: 'fr', label: 'Français' },
    { code: 'ru', label: 'Русский' },
  ];

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        aria-label="Close Smart Entry"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="smart-entry-title"
        aria-describedby="smart-entry-description"
        className="relative z-[1] flex w-[calc(100vw-32px)] max-w-[640px] max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-card-lg"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-border flex-shrink-0 bg-card">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-teal flex items-center justify-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <h2 id="smart-entry-title" className="text-lg font-800 text-foreground">Smart Entry</h2>
              <p id="smart-entry-description" className="text-sm text-muted-foreground">AI-powered transaction entry with review before save.</p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            className="btn-ghost p-2 rounded-lg"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">

          {/* Not configured state */}
          {isAIConfigured === false && step === 'entry' && (
            <div className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Sparkles size={24} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-600 text-foreground mb-2">AI not configured yet</p>
              <p className="text-sm text-muted-foreground mb-4">
                You can continue using manual transaction entry. An administrator can configure AI providers in Admin → AI Settings.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors"
              >
                Use Manual Entry
              </button>
            </div>
          )}

          {/* Entry step */}
          {step === 'entry' && isAIConfigured !== false && (
            <div className="p-5 sm:p-6">
              {/* Mode toggle */}
              <div className="flex gap-2 mb-5">
                <button
                  onClick={() => setMode('text')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-600 transition-colors ${
                    mode === 'text' ? 'bg-accent text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <Type size={16} />
                  Type
                </button>
                <button
                  onClick={() => setMode('voice')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-600 transition-colors ${
                    mode === 'voice' ? 'bg-accent text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <Mic size={16} />
                  Voice
                </button>
              </div>

              {/* Language selector */}
              <div className="mb-4">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Language
                </label>
                <div className="flex gap-2 flex-wrap">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      onClick={() => setLanguage(l.code)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-600 transition-colors ${
                        language === l.code
                          ? 'bg-accent/10 text-accent border border-accent/30' :'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'text' ? (
                <div>
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    Describe your transaction
                  </label>
                  <textarea
                    data-autofocus="true"
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    placeholder={
                      language === 'ar' ?'مثال: أنفقت 85 درهم على البقالة اليوم من حساب النقد' :'e.g. "I spent AED 85 on groceries today from cash" or "Ahmed gave me AED 2,300"'
                    }
                    className="input-base w-full min-h-[8.5rem] resize-y text-sm"
                    dir={language === 'ar' ? 'rtl' : 'ltr'}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleTextSubmit();
                    }}
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Press Ctrl+Enter to submit
                  </p>
                  <button
                    onClick={handleTextSubmit}
                    disabled={!textInput.trim()}
                    className="mt-3 w-full py-3 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    <Sparkles size={16} />
                    Analyse with AI
                  </button>
                </div>
              ) : (
                <VoiceRecorder
                  onTranscriptReady={handleVoiceReady}
                  onCancel={() => setMode('text')}
                  onSwitchToText={() => setMode('text')}
                  language={language}
                />
              )}

              {/* Examples */}
              {mode === 'text' && (
                <div className="mt-5 rounded-2xl border border-border bg-secondary/40 p-4">
                  <p className="text-sm font-700 text-foreground mb-2">Examples</p>
                  <div className="space-y-1.5">
                    {[
                      'Spent AED 85 on groceries from cash',
                      'Ahmed gave me AED 2,300 today',
                      'Transfer AED 1,000 from bank to cash',
                      'I paid AED 600 for Ahmed\'s subscription from my credit card',
                    ].map((ex, i) => (
                      <button
                        key={i}
                        onClick={() => setTextInput(ex)}
                        className="block w-full text-left text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
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
                <p className="text-sm font-600 text-foreground">Analysing your input...</p>
                <p className="text-xs text-muted-foreground mt-1">Understanding financial context</p>
              </div>
              {transcript && (
                <div className="w-full p-3 bg-muted/50 rounded-xl">
                  <p className="text-xs font-600 text-muted-foreground mb-1">Transcript:</p>
                  <p className="text-sm text-foreground italic">"{transcript}"</p>
                </div>
              )}
            </div>
          )}

          {/* Confirming */}
          {step === 'confirming' && parsed && reviewState && previewInstruction && (
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle size={18} className="text-positive" />
                <p className="text-sm font-600 text-foreground">Review before saving</p>
              </div>

              {transcript && (
                <div className="p-3 bg-muted/50 rounded-xl mb-4">
                  <p className="text-xs text-muted-foreground">Input:</p>
                  <p className="text-sm text-foreground mt-0.5 italic">"{transcript || textInput}"</p>
                </div>
              )}

              {errorMessage && (
                <div className="p-3 bg-warning-soft border border-warning/20 rounded-xl mb-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={14} className="text-warning mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-warning">{errorMessage}</p>
                  </div>
                </div>
              )}

              {previewInstruction.warnings?.length > 0 && (
                <div className="p-3 bg-warning-soft border border-warning/20 rounded-xl mb-4">
                  {previewInstruction.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertTriangle size={14} className="text-warning mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-warning">{w}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                  <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">Understanding</p>
                  {reviewState.understanding.map((line, index) => (
                    <p key={index} className="text-sm text-foreground">{line}</p>
                  ))}
                  {reviewState.purposeOptions && reviewState.purposeOptions.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-sm font-600 text-foreground">
                        {typeof reviewState.receivedAmount === 'number' && reviewState.person?.name
                          ? `How should the ${formatMoney(reviewState.receivedAmount, reviewState.currency, contextSnapshot?.defaultCurrency)} from ${reviewState.person.name} be treated?`
                          : 'How should this money be treated?'}
                      </p>
                      {reviewState.purposeOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => handlePurposeChange(option.id)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            reviewState.purpose === option.id ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/40'
                          }`}
                        >
                          <p className="text-sm font-600 text-foreground">{option.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {reviewState.person?.required && (
                  <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">Person</p>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-xs text-muted-foreground">Person</p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {selectedPerson?.fullName || reviewState.person.name || 'Choose a person'}
                      </p>
                    </div>
                    <select
                      value={personSelectValue}
                      onChange={(e) => handlePersonSelectionChange(e.target.value)}
                      className="input-base w-full text-sm"
                    >
                      <option value="">Choose person</option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.fullName}
                        </option>
                      ))}
                      <option value="__create__">Create {reviewState.person.name || 'person'}</option>
                    </select>
                    {personDraft && (
                      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                        <input
                          value={personDraft.name}
                          onChange={(e) => setPersonDraft((current) => current ? { ...current, name: e.target.value } : current)}
                          className="input-base w-full text-sm"
                          placeholder="Person name"
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
                          <option value="other">Other</option>
                          <option value="friend">Friend</option>
                          <option value="client">Client</option>
                          <option value="relative">Relative</option>
                          <option value="colleague">Colleague</option>
                          <option value="spouse">Spouse</option>
                          <option value="child">Child</option>
                          <option value="parent">Parent</option>
                          <option value="sibling">Sibling</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={handleApplyCreatePerson}
                            disabled={!personDraft.name.trim()}
                            className="flex-1 rounded-xl bg-positive py-2.5 text-sm font-600 text-white transition-colors hover:bg-positive/90 disabled:opacity-50"
                          >
                            Use This Person
                          </button>
                          <button
                            onClick={() => setPersonDraft(null)}
                            className="rounded-xl bg-muted px-4 py-2.5 text-sm font-600 text-foreground transition-colors hover:bg-muted/80"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {reviewState.account?.required && (!reviewState.purposeOptions?.length || !!reviewState.purpose && reviewState.purpose !== 'unclear') && (
                  <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">Account</p>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-xs text-muted-foreground">{getPrimaryAccountLabel(reviewState.purpose)}</p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {selectedAccount?.name || reviewState.account.name || 'Choose an account'}
                      </p>
                    </div>
                    <select
                      value={primaryAccountSelectValue}
                      onChange={(e) => handleAccountSelectionChange('account', e.target.value)}
                      className="input-base w-full text-sm"
                    >
                      <option value="">Choose account</option>
                      {eligiblePrimaryAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} • {account.type} • {account.currency}
                        </option>
                      ))}
                      <option value="__create__">Create {reviewState.account.name || 'account'}</option>
                    </select>
                    {accountDraft && accountDraftTarget === 'account' && (
                      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                        <input
                          value={accountDraft.name}
                          onChange={(e) => setAccountDraft((current) => current ? { ...current, name: e.target.value } : current)}
                          className="input-base w-full text-sm"
                          placeholder="Account name"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={accountDraft.type}
                            onChange={(e) =>
                              setAccountDraft((current) => current ? { ...current, type: e.target.value as SuggestedAccount['type'] } : current)
                            }
                            className="input-base w-full text-sm"
                          >
                            <option value="cash">Cash</option>
                            <option value="bank">Bank</option>
                            <option value="credit_card">Credit Card</option>
                            <option value="savings">Savings</option>
                            <option value="digital_wallet">Digital Wallet</option>
                            <option value="investment">Investment</option>
                            <option value="other">Other</option>
                          </select>
                          <input
                            value={accountDraft.currency}
                            onChange={(e) => setAccountDraft((current) => current ? { ...current, currency: e.target.value.toUpperCase() } : current)}
                            className="input-base w-full text-sm"
                            maxLength={3}
                            placeholder="Currency"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleApplyCreateAccount}
                            disabled={!accountDraft.name.trim()}
                            className="flex-1 rounded-xl bg-positive py-2.5 text-sm font-600 text-white transition-colors hover:bg-positive/90 disabled:opacity-50"
                          >
                            Use This Account
                          </button>
                          <button
                            onClick={() => {
                              setAccountDraft(null);
                              setAccountDraftTarget(null);
                            }}
                            className="rounded-xl bg-muted px-4 py-2.5 text-sm font-600 text-foreground transition-colors hover:bg-muted/80"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {reviewState.amountActionIndex !== undefined && (
                  <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">Amount</p>
                    <div className="rounded-xl bg-card p-3 space-y-2">
                      <p className="text-sm font-600 text-foreground">
                        {reviewState.amountLabel || 'How much was used?'}
                      </p>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={typeof reviewState.amount === 'number' ? String(reviewState.amount) : ''}
                        onChange={(e) => handleReviewAmountChange(e.target.value)}
                        className="input-base w-full text-sm"
                        placeholder={`Enter amount in ${normalizeReviewCurrency(reviewState.currency)}`}
                      />
                      {typeof reviewState.amountQuickOptionValue === 'number' && (
                        <button
                          type="button"
                          onClick={handleUseFullAmount}
                          className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-600 text-foreground transition-colors hover:border-accent/40"
                        >
                          Use full {formatMoney(reviewState.amountQuickOptionValue, reviewState.currency, contextSnapshot?.defaultCurrency)}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {reviewState.destinationAccount?.required && (
                  <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                    <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">Destination Account</p>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-xs text-muted-foreground">Move money to</p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {selectedDestinationAccount?.name || reviewState.destinationAccount.name || 'Choose a destination account'}
                      </p>
                    </div>
                    <select
                      value={destinationAccountSelectValue}
                      onChange={(e) => handleAccountSelectionChange('destinationAccount', e.target.value)}
                      className="input-base w-full text-sm"
                    >
                      <option value="">Choose destination account</option>
                      {eligibleDestinationAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} • {account.type} • {account.currency}
                        </option>
                      ))}
                      <option value="__create__">Create {reviewState.destinationAccount.name || 'account'}</option>
                    </select>
                    {accountDraft && accountDraftTarget === 'destinationAccount' && (
                      <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                        <input
                          value={accountDraft.name}
                          onChange={(e) => setAccountDraft((current) => current ? { ...current, name: e.target.value } : current)}
                          className="input-base w-full text-sm"
                          placeholder="Account name"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={accountDraft.type}
                            onChange={(e) =>
                              setAccountDraft((current) => current ? { ...current, type: e.target.value as SuggestedAccount['type'] } : current)
                            }
                            className="input-base w-full text-sm"
                          >
                            <option value="cash">Cash</option>
                            <option value="bank">Bank</option>
                            <option value="credit_card">Credit Card</option>
                            <option value="savings">Savings</option>
                            <option value="digital_wallet">Digital Wallet</option>
                            <option value="investment">Investment</option>
                            <option value="other">Other</option>
                          </select>
                          <input
                            value={accountDraft.currency}
                            onChange={(e) => setAccountDraft((current) => current ? { ...current, currency: e.target.value.toUpperCase() } : current)}
                            className="input-base w-full text-sm"
                            maxLength={3}
                            placeholder="Currency"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleApplyCreateAccount}
                            disabled={!accountDraft.name.trim()}
                            className="flex-1 rounded-xl bg-positive py-2.5 text-sm font-600 text-white transition-colors hover:bg-positive/90 disabled:opacity-50"
                          >
                            Use This Account
                          </button>
                          <button
                            onClick={() => {
                              setAccountDraft(null);
                              setAccountDraftTarget(null);
                            }}
                            className="rounded-xl bg-muted px-4 py-2.5 text-sm font-600 text-foreground transition-colors hover:bg-muted/80"
                          >
                            Back
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-3">
                  <p className="text-xs font-700 uppercase tracking-wider text-muted-foreground">Summary</p>
                  <div className="space-y-2">
                    {compactSummaryRows.map((row, index) => (
                      <p key={index} className="text-sm text-foreground">{row}</p>
                    ))}
                  </div>
                  {totals && reviewState.purpose === 'managed_money' && (
                    <p className="text-sm font-600 text-foreground">
                      Remaining for {reviewState.person?.name || 'them'}: {formatMoney(totals.net, reviewState.currency, contextSnapshot?.defaultCurrency)}
                    </p>
                  )}
                  {totals && reviewState.purpose === 'borrowed_money' && (
                    <div className="space-y-1 text-sm font-600 text-foreground">
                      <p>Cash remaining after spending: {formatMoney(totals.net, reviewState.currency, contextSnapshot?.defaultCurrency)}</p>
                      <p>Amount still owed to {reviewState.person?.name || 'them'}: {formatMoney(totals.loanAmount, reviewState.currency, contextSnapshot?.defaultCurrency)}</p>
                    </div>
                  )}
                  {totals && reviewState.purpose === 'managed_return' && (
                    <p className="text-sm font-600 text-foreground">
                      Managed balance change: {formatMoney(totals.net, reviewState.currency, contextSnapshot?.defaultCurrency)}
                    </p>
                  )}
                </div>

                {unresolvedReviewFields.length > 0 && (
                  <div className="rounded-xl border border-warning/20 bg-warning-soft p-3">
                    <p className="text-xs font-600 text-warning">Still needed: {unresolvedReviewFields.join(', ')}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={unresolvedReviewFields.length > 0}
                  className="flex-1 py-3 rounded-xl bg-positive text-white text-sm font-700 hover:bg-positive/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <CheckCircle size={16} />
                  Confirm & Save
                </button>
                <button
                  onClick={handleReset}
                  className="px-4 py-3 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              {unresolvedReviewFields.length > 0 && (
                <p className="text-xs text-muted-foreground">Please complete the required details above.</p>
              )}
            </div>
          )}

          {/* Executing */}
          {step === 'executing' && (
            <div className="p-8 flex flex-col items-center gap-4">
              <Loader2 size={36} className="text-accent animate-spin" />
              <p className="text-sm font-600 text-foreground">Saving your records...</p>
            </div>
          )}

          {/* Success */}
          {step === 'success' && executionResult && (
            <div className="p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-positive-soft flex items-center justify-center">
                <CheckCircle size={32} className="text-positive" />
              </div>
              <div>
                <p className="text-base font-700 text-foreground">Saved successfully!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {executionResult.count} record{executionResult.count !== 1 ? 's' : ''} created
                </p>
              </div>
              <div className="flex gap-2 w-full">
                <button
                  onClick={handleReset}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                >
                  Add Another
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors"
                >
                  Done
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
                    label="Daily requests"
                    used={limitView.requestsToday}
                    total={limitView.dailyLimit}
                  />
                )}
                {typeof limitView.creditsUsed === 'number' && typeof limitView.creditsAllocated === 'number' && limitView.creditsAllocated > 0 && (
                  <UsageProgressBar
                    label="Monthly AI credits"
                    used={limitView.creditsUsed}
                    total={limitView.creditsAllocated}
                  />
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Credits remaining</p>
                    <p className="mt-1 text-lg font-700 text-foreground">{Math.max(0, limitView.creditsRemaining || 0)}</p>
                  </div>
                  <div className="rounded-xl bg-card p-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Credits reserved</p>
                    <p className="mt-1 text-lg font-700 text-foreground">{Math.max(0, usageSummary?.creditsReserved || 0)}</p>
                  </div>
                </div>
                {typeof limitView.requiredCredits === 'number' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Required credits</p>
                      <p className="mt-1 text-lg font-700 text-foreground">{limitView.requiredCredits}</p>
                    </div>
                    <div className="rounded-xl bg-card p-3">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Renewal</p>
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
                    <span>Next renewal {limitView.renewalLabel}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => router.push('/pricing')}
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
                <p className="text-base font-700 text-foreground">Something went wrong</p>
                <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
                {apiError?.requestId && (
                  <p className="text-xs text-muted-foreground mt-2">Reference: {apiError.requestId}</p>
                )}
              </div>
              <div className="flex gap-2 w-full">
                <button
                  onClick={handleReset}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw size={16} />
                  Try Again
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
