'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Mic, Type, AlertTriangle, CheckCircle, Loader2, RotateCcw, MessageSquare, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import VoiceRecorder from './VoiceRecorder';
import type { ParsedFinancialInstruction, FinancialAction, FinancialContext, SuggestedAccount } from '@/lib/ai-types';
import { buildAIContext } from '@/lib/ai-execution';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { useLanguage } from '@/contexts/LanguageContext';

type AssistantStep =
  | 'entry'          // text or voice input
  | 'processing'     // waiting for AI
  | 'clarifying'     // asking follow-up questions
  | 'confirming'     // showing confirmation preview
  | 'executing'      // saving records
  | 'success'        // done
  | 'failed';        // error

interface AIAssistantModalProps {
  onClose: () => void;
  defaultMode?: 'voice' | 'text';
}

interface AccountResolutionChoice {
  actionIndex: number;
  field: 'account' | 'destinationAccount';
  mode: 'create' | 'select';
  accountId?: string;
  account?: SuggestedAccount;
}

interface UnresolvedAccountRequirement {
  actionIndex: number;
  field: 'account' | 'destinationAccount';
  accountName: string;
  suggestedAccount: SuggestedAccount;
  existingAccounts: Array<{ id: string; name: string; type: string; currency: string }>;
  noAccounts: boolean;
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
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [clarificationAnswers, setClarificationAnswers] = useState<string[]>([]);
  const [clarificationInput, setClarificationInput] = useState('');
  const [executionResult, setExecutionResult] = useState<{ success: boolean; count: number } | null>(null);
  const [isAIConfigured, setIsAIConfigured] = useState<boolean | null>(null);
  const [flowId, setFlowId] = useState(() => crypto.randomUUID());
  const [flowRequestId, setFlowRequestId] = useState<string | null>(null);
  const [contextSnapshot, setContextSnapshot] = useState<FinancialContext | null>(null);
  const [accountResolutions, setAccountResolutions] = useState<AccountResolutionChoice[]>([]);
  const [accountDraft, setAccountDraft] = useState<{
    actionIndex: number;
    field: 'account' | 'destinationAccount';
    name: string;
    type: SuggestedAccount['type'];
    currency: string;
    openingBalance: number;
    includeInTotal: boolean;
  } | null>(null);
  const [choosingExistingFor, setChoosingExistingFor] = useState<{
    actionIndex: number;
    field: 'account' | 'destinationAccount';
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

  const normalizeName = (value: string | undefined) => (value || '').trim().toLowerCase();

  const isAccountRequired = (action: FinancialAction, field: 'account' | 'destinationAccount') => {
    if (field === 'destinationAccount') {
      return action.actionType === 'transfer';
    }

    return ['income', 'expense', 'transfer', 'recurring_transaction', 'expense_paid_for_person'].includes(action.actionType);
  };

  const inferAccountType = (name: string): SuggestedAccount['type'] => {
    const normalized = normalizeName(name);
    if (normalized.includes('cash')) return 'cash';
    if (normalized.includes('credit')) return 'credit_card';
    if (normalized.includes('saving')) return 'savings';
    if (normalized.includes('wallet')) return 'digital_wallet';
    if (normalized.includes('invest')) return 'investment';
    if (normalized.includes('bank')) return 'bank';
    return 'other';
  };

  const sanitizeCurrency = (value: string | undefined) => {
    const currency = (value || 'AED').trim().toUpperCase().replace(/[^A-Z]/g, '');
    return currency.length === 3 ? currency : 'AED';
  };

  const getSuggestedAccount = (action: FinancialAction, field: 'account' | 'destinationAccount'): SuggestedAccount => {
    const name = field === 'account' ? action.accountName : action.destinationAccountName;
    const preferredName = (name || 'Cash').trim() || 'Cash';
    return {
      name: preferredName
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' '),
      type: inferAccountType(preferredName),
      currency: sanitizeCurrency(action.currency),
      openingBalance: 0,
      includeInTotal: true,
    };
  };

  const applyLocalAccountResolutions = useCallback((
    instruction: ParsedFinancialInstruction,
    resolutions: AccountResolutionChoice[]
  ): ParsedFinancialInstruction => {
    const nextInstruction: ParsedFinancialInstruction = {
      ...instruction,
      actions: instruction.actions.map((action) => ({ ...action, warnings: [...(action.warnings || [])] })),
    };

    let offset = 0;
    for (const resolution of [...resolutions].sort((a, b) => a.actionIndex - b.actionIndex)) {
      const targetIndex = resolution.actionIndex + offset;
      const targetAction = nextInstruction.actions[targetIndex];
      if (!targetAction) continue;

      if (resolution.mode === 'select' && resolution.accountId) {
        const selectedAccount = contextSnapshot?.accounts?.find((account) => account.id === resolution.accountId);
        if (!selectedAccount) continue;

        if (resolution.field === 'account') {
          targetAction.accountId = selectedAccount.id;
          targetAction.accountName = selectedAccount.name;
        } else {
          targetAction.destinationAccountId = selectedAccount.id;
          targetAction.destinationAccountName = selectedAccount.name;
        }
        continue;
      }

      if (resolution.mode === 'create' && resolution.account) {
        nextInstruction.actions.splice(targetIndex, 0, {
          actionType: 'create_account',
          accountName: resolution.account.name,
          accountType: resolution.account.type,
          currency: resolution.account.currency,
          openingBalance: resolution.account.openingBalance,
          includeInTotal: resolution.account.includeInTotal,
          confidence: 1,
          warnings: [],
          description: `Create ${resolution.account.type.replace('_', ' ')} account: ${resolution.account.name}`,
        });
        offset += 1;

        const adjustedTarget = nextInstruction.actions[targetIndex + 1];
        if (resolution.field === 'account') {
          adjustedTarget.accountId = undefined;
          adjustedTarget.accountName = resolution.account.name;
        } else {
          adjustedTarget.destinationAccountId = undefined;
          adjustedTarget.destinationAccountName = resolution.account.name;
        }
      }
    }

    return nextInstruction;
  }, [contextSnapshot]);

  const previewInstruction = parsed ? applyLocalAccountResolutions(parsed, accountResolutions) : null;

  const unresolvedAccounts: UnresolvedAccountRequirement[] = previewInstruction
    ? (() => {
        const accounts = contextSnapshot?.accounts || [];
        const availableNames = new Set(accounts.map((account) => normalizeName(account.name)));
        const unresolved: UnresolvedAccountRequirement[] = [];

        previewInstruction.actions.forEach((action, actionIndex) => {
          if (action.actionType === 'create_account' && action.accountName) {
            availableNames.add(normalizeName(action.accountName));
            return;
          }

          (['account', 'destinationAccount'] as const).forEach((field) => {
            if (!isAccountRequired(action, field)) return;
            const accountId = field === 'account' ? action.accountId : action.destinationAccountId;
            const accountName = field === 'account' ? action.accountName : action.destinationAccountName;
            if (accountId) return;
            if (accountName && availableNames.has(normalizeName(accountName))) return;

            unresolved.push({
              actionIndex,
              field,
              accountName: accountName || 'Cash',
              suggestedAccount: getSuggestedAccount(action, field),
              existingAccounts: accounts.map((account) => ({
                id: account.id as string,
                name: account.name as string,
                type: account.type as string,
                currency: account.currency as string,
              })),
              noAccounts: accounts.length === 0,
            });
          });
        });

        return unresolved;
      })()
    : [];

  const callParseAPI = useCallback(async (
    type: 'text' | 'voice',
    text?: string,
    audio?: { audioBase64: string; mimeType: string; durationSeconds: number }
  ) => {
    setStep('processing');
    setErrorMessage('');

    try {
      const token = await getAuthToken();
      const context = await buildAIContext();
      setContextSnapshot(context);

      const body: Record<string, unknown> = {
        inputType: type,
        language,
        context,
        idempotencyKey: flowId,
      };
      if (flowRequestId) body.requestId = flowRequestId;

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

      const data = await response.json();
      if (data.status === 'not_configured') {
        setIsAIConfigured(false);
        setStep('entry');
        return;
      }

      if (data.status === 'failed' || !response.ok) {
        setErrorMessage(data.errorMessage || data.error || 'AI processing failed. Please try again.');
        setStep('failed');
        return;
      }

      if (data.transcript) setTranscript(data.transcript);

      const instruction = data.parsed as ParsedFinancialInstruction;
      setParsed(instruction);
      setFlowRequestId(instruction.requestId || data.requestId || null);
      setAccountResolutions([]);
      setAccountDraft(null);
      setChoosingExistingFor(null);

      if (instruction.requiresClarification) {
        setStep('clarifying');
      } else {
        setStep('confirming');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Network error. Please try again.');
      setStep('failed');
    }
  }, [flowId, flowRequestId, language]);

  const handleTextSubmit = useCallback(() => {
    if (!textInput.trim()) return;
    callParseAPI('text', textInput.trim());
  }, [textInput, callParseAPI]);

  const handleVoiceReady = useCallback((audioBase64: string, mimeType: string, durationSeconds: number) => {
    callParseAPI('voice', undefined, { audioBase64, mimeType, durationSeconds });
  }, [callParseAPI]);

  const handleClarificationSubmit = useCallback(() => {
    if (!clarificationInput.trim() || !parsed) return;
    const newAnswers = [...clarificationAnswers, clarificationInput.trim()];
    setClarificationAnswers(newAnswers);
    setClarificationInput('');

    // Re-submit with clarification context appended
    const enrichedText = `${textInput || transcript}\n\nClarification: ${newAnswers.join('; ')}`;
    callParseAPI('text', enrichedText);
  }, [clarificationInput, clarificationAnswers, parsed, textInput, transcript, callParseAPI]);

  const handleConfirm = useCallback(async () => {
    if (!parsed || unresolvedAccounts.length > 0) return;
    setStep('executing');
    setErrorMessage('');

    try {
      const confirmResponse = await fetch('/api/ai/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: parsed.requestId,
          accountResolutions,
        }),
      });

      const confirmResult = await confirmResponse.json().catch(() => ({}));
      if (!confirmResponse.ok) {
        throw new Error(getFriendlyConfirmErrorMessage(confirmResult.error));
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

      const result = await response.json();
      if (!response.ok || result.status === 'failed') {
        if (result?.status === 'clarification_required' || result?.code === 'account_missing') {
          setErrorMessage(result.message || 'This Smart Entry request still needs an account before it can be saved.');
          setStep('confirming');
          return;
        }
        throw new Error(getFriendlyExecutionErrorMessage(result.error));
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
      setStep('failed');
    }
  }, [accountResolutions, parsed, previewInstruction?.actions.length, router, unresolvedAccounts.length]);

  const handleReset = useCallback(() => {
    setStep('entry');
    setTextInput('');
    setTranscript('');
    setParsed(null);
    setErrorMessage('');
    setClarificationAnswers([]);
    setClarificationInput('');
    setExecutionResult(null);
    setContextSnapshot(null);
    setFlowRequestId(null);
    setFlowId(crypto.randomUUID());
    setAccountResolutions([]);
    setAccountDraft(null);
    setChoosingExistingFor(null);
  }, []);

  const upsertAccountResolution = useCallback((resolution: AccountResolutionChoice) => {
    setAccountResolutions((current) => {
      const next = current.filter(
        (item) => !(item.actionIndex === resolution.actionIndex && item.field === resolution.field)
      );
      next.push(resolution);
      return next;
    });
  }, []);

  const activeUnresolvedAccount = unresolvedAccounts[0] || null;

  const handleStartCreateAccount = useCallback((requirement: UnresolvedAccountRequirement) => {
    setChoosingExistingFor(null);
    setAccountDraft({
      actionIndex: requirement.actionIndex,
      field: requirement.field,
      name: requirement.suggestedAccount.name,
      type: requirement.suggestedAccount.type,
      currency: requirement.suggestedAccount.currency,
      openingBalance: requirement.suggestedAccount.openingBalance,
      includeInTotal: requirement.suggestedAccount.includeInTotal,
    });
  }, []);

  const handleApplyCreateAccount = useCallback(() => {
    if (!accountDraft || !accountDraft.name.trim()) return;
    upsertAccountResolution({
      actionIndex: accountDraft.actionIndex,
      field: accountDraft.field,
      mode: 'create',
      account: {
        name: accountDraft.name.trim(),
        type: accountDraft.type,
        currency: sanitizeCurrency(accountDraft.currency),
        openingBalance: Number(accountDraft.openingBalance || 0),
        includeInTotal: accountDraft.includeInTotal,
      },
    });
    setAccountDraft(null);
  }, [accountDraft, upsertAccountResolution]);

  const handleStartChooseExisting = useCallback((requirement: UnresolvedAccountRequirement) => {
    setAccountDraft(null);
    setChoosingExistingFor({
      actionIndex: requirement.actionIndex,
      field: requirement.field,
    });
  }, []);

  const handleChooseExistingAccount = useCallback((accountId: string) => {
    if (!choosingExistingFor) return;
    upsertAccountResolution({
      actionIndex: choosingExistingFor.actionIndex,
      field: choosingExistingFor.field,
      mode: 'select',
      accountId,
    });
    setChoosingExistingFor(null);
  }, [choosingExistingFor, upsertAccountResolution]);

  const formatActionSummary = (action: FinancialAction): string => {
    const amount = action.amount ? `${action.currency || 'AED'} ${action.amount.toLocaleString()}` : 'Amount unknown';
    switch (action.actionType) {
      case 'create_account':            return `Create ${action.accountType?.replace('_', ' ') || 'account'} account: ${action.accountName || 'New Account'}`;
      case 'create_managed_person':     return `Create managed person: ${action.personName || 'New Person'}`;
      case 'income':                    return `Income: ${amount}`;
      case 'expense':                   return `Expense: ${amount}${action.categoryName ? ` (${action.categoryName})` : ''}`;
      case 'money_received_from_person':return `Money received from ${action.personName || 'person'}: ${amount}`;
      case 'money_returned_to_person':  return `Money returned to ${action.personName || 'person'}: ${amount}`;
      case 'expense_from_held_balance': return `Expense from ${action.personName || 'person'}'s held balance: ${amount}`;
      case 'expense_paid_for_person':   return `Paid for ${action.personName || 'person'}: ${amount}`;
      case 'reimbursement_payment':     return `Reimbursement from ${action.personName || 'person'}: ${amount}`;
      case 'settlement':                return `Settlement with ${action.personName || 'person'}: ${amount}`;
      case 'transfer':                  return `Transfer ${amount} from ${action.accountName || '?'} to ${action.destinationAccountName || '?'}`;
      case 'budget':                    return `Budget: ${amount}${action.categoryName ? ` for ${action.categoryName}` : ''}`;
      case 'recurring_transaction':     return `Recurring ${action.recurringFrequency || 'monthly'}: ${amount}`;
      default:                          return `${action.actionType}: ${amount}`;
    }
  };

  const getActionIcon = (action: FinancialAction): string => {
    switch (action.actionType) {
      case 'create_account':            return '🏦';
      case 'create_managed_person':     return '👤';
      case 'income':                    return '💰';
      case 'expense':                   return '💸';
      case 'money_received_from_person':return '📥';
      case 'money_returned_to_person':  return '📤';
      case 'expense_from_held_balance': return '🏦';
      case 'expense_paid_for_person':   return '🤝';
      case 'reimbursement_payment':     return '↩️';
      case 'settlement':                return '✅';
      case 'transfer':                  return '🔄';
      case 'budget':                    return '📊';
      case 'recurring_transaction':     return '🔁';
      default:                          return '📋';
    }
  };

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

          {/* Clarifying */}
          {step === 'clarifying' && parsed && (
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare size={18} className="text-warning" />
                <p className="text-sm font-600 text-foreground">A few questions</p>
              </div>

              {transcript && (
                <div className="p-3 bg-muted/50 rounded-xl mb-4">
                  <p className="text-xs text-muted-foreground">You said:</p>
                  <p className="text-sm text-foreground mt-0.5">"{transcript || textInput}"</p>
                </div>
              )}

              <div className="space-y-3 mb-4">
                {parsed.clarificationQuestions?.map((q, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-warning mt-0.5">•</span>
                    <p className="text-sm text-foreground">{q}</p>
                  </div>
                ))}
                {parsed.missingFields?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Missing: {parsed.missingFields.join(', ')}
                  </p>
                )}
              </div>

              <textarea
                value={clarificationInput}
                onChange={e => setClarificationInput(e.target.value)}
                placeholder="Type your answer..."
                className="input-base w-full h-20 resize-none text-sm mb-3"
                dir={language === 'ar' ? 'rtl' : 'ltr'}
              />

              <div className="flex gap-2">
                <button
                  onClick={handleClarificationSubmit}
                  disabled={!clarificationInput.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  Continue
                </button>
                <button
                  onClick={() => setStep('confirming')}
                  className="px-4 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
          )}

          {/* Confirming */}
          {step === 'confirming' && parsed && previewInstruction && (
            <div className="p-5">
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

              {/* Warnings */}
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

              {/* Actions list */}
              <div className="space-y-3 mb-4">
                {previewInstruction.actions.map((action, i) => {
                  const accountRequirement = unresolvedAccounts.find(
                    (item) => item.actionIndex === i && item.field === 'account'
                  );
                  const destinationRequirement = unresolvedAccounts.find(
                    (item) => item.actionIndex === i && item.field === 'destinationAccount'
                  );

                  return (
                  <div key={i} className="p-3 bg-muted/30 border border-border rounded-xl">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <span className="text-lg flex-shrink-0">{getActionIcon(action)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-600 text-foreground">{formatActionSummary(action)}</p>
                          {action.date && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {action.date === 'today' ? 'Today' : action.date}
                            </p>
                          )}
                          {action.warnings?.length > 0 && (
                            <div className="mt-1">
                              {action.warnings.map((w, wi) => (
                                <p key={wi} className="text-xs text-warning">⚠ {w}</p>
                              ))}
                            </div>
                          )}
                          {(action.actionType === 'expense' || action.actionType === 'income') && (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs text-muted-foreground">Category: {action.categoryName || 'Uncategorised'}</p>
                              <p className={`text-xs ${accountRequirement ? 'text-warning font-600' : 'text-muted-foreground'}`}>
                                Account: {accountRequirement ? 'Missing' : (action.accountName || 'Not specified')}
                              </p>
                              {accountRequirement && (
                                <p className="text-xs text-warning">Cash account not found</p>
                              )}
                            </div>
                          )}
                          {action.actionType === 'transfer' && (
                            <div className="mt-2 space-y-1">
                              <p className={`text-xs ${accountRequirement ? 'text-warning font-600' : 'text-muted-foreground'}`}>
                                From: {accountRequirement ? 'Missing' : (action.accountName || 'Not specified')}
                              </p>
                              <p className={`text-xs ${destinationRequirement ? 'text-warning font-600' : 'text-muted-foreground'}`}>
                                To: {destinationRequirement ? 'Missing' : (action.destinationAccountName || 'Not specified')}
                              </p>
                            </div>
                          )}
                          {(action.actionType === 'recurring_transaction' || action.actionType === 'expense_paid_for_person') && (
                            <div className="mt-2 space-y-1">
                              {action.categoryName && (
                                <p className="text-xs text-muted-foreground">Category: {action.categoryName}</p>
                              )}
                              <p className={`text-xs ${accountRequirement ? 'text-warning font-600' : 'text-muted-foreground'}`}>
                                Account: {accountRequirement ? 'Missing' : (action.accountName || 'Not specified')}
                              </p>
                            </div>
                          )}
                          <div className="mt-1">
                            <span className={`text-xs px-1.5 py-0.5 rounded-md ${
                              action.confidence >= 0.8
                                ? 'bg-positive-soft text-positive'
                                : action.confidence >= 0.6
                                ? 'bg-warning-soft text-warning' :'bg-negative-soft text-negative'
                            }`}>
                              {Math.round(action.confidence * 100)}% confident
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )})}
              </div>

              {activeUnresolvedAccount && (
                <div className="rounded-2xl border border-warning/20 bg-warning-soft p-4 mb-4">
                  <p className="text-sm font-700 text-foreground">
                    You don&apos;t have a {activeUnresolvedAccount.suggestedAccount.name} account yet.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeUnresolvedAccount.noAccounts
                      ? 'At least one account is needed before recording personal income, expenses, transfers, or recurring transactions.'
                      : 'Resolve this account before confirming the Smart Entry request.'}
                  </p>
                  <p className="text-xs text-warning mt-2">Warning: {activeUnresolvedAccount.accountName} account not found.</p>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => handleStartCreateAccount(activeUnresolvedAccount)}
                      className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-600 hover:bg-accent/90 transition-colors"
                    >
                      Create {activeUnresolvedAccount.suggestedAccount.name} Account
                    </button>
                    <button
                      onClick={() => handleStartChooseExisting(activeUnresolvedAccount)}
                      className="flex-1 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors disabled:opacity-50"
                      disabled={activeUnresolvedAccount.existingAccounts.length === 0}
                    >
                      Select Account
                    </button>
                    <button
                      onClick={onClose}
                      className="px-4 py-2.5 rounded-xl bg-card text-foreground text-sm font-600 border border-border hover:bg-muted/40 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>

                  {accountDraft && accountDraft.actionIndex === activeUnresolvedAccount.actionIndex && accountDraft.field === activeUnresolvedAccount.field && (
                    <div className="mt-3 space-y-3">
                      <input
                        value={accountDraft.name}
                        onChange={(e) => setAccountDraft((current) => current ? { ...current, name: e.target.value } : current)}
                        className="input-base w-full text-sm"
                        placeholder="Account name"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={accountDraft.type}
                          onChange={(e) => setAccountDraft((current) => current ? { ...current, type: e.target.value as SuggestedAccount['type'] } : current)}
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
                          className="flex-1 py-2.5 rounded-xl bg-positive text-white text-sm font-600 hover:bg-positive/90 disabled:opacity-50 transition-colors"
                        >
                          Use This Account
                        </button>
                        <button
                          onClick={() => setAccountDraft(null)}
                          className="px-4 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                        >
                          Back
                        </button>
                      </div>
                    </div>
                  )}

                  {choosingExistingFor && choosingExistingFor.actionIndex === activeUnresolvedAccount.actionIndex && choosingExistingFor.field === activeUnresolvedAccount.field && (
                    <div className="mt-3 space-y-2">
                      {activeUnresolvedAccount.existingAccounts.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No existing accounts are available yet.</p>
                      ) : (
                        activeUnresolvedAccount.existingAccounts.map((account) => (
                          <button
                            key={account.id}
                            onClick={() => handleChooseExistingAccount(account.id)}
                            className="w-full text-left p-3 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors"
                          >
                            <p className="text-sm font-600 text-foreground">{account.name}</p>
                            <p className="text-xs text-muted-foreground">{account.type.replace('_', ' ')} · {account.currency}</p>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={unresolvedAccounts.length > 0}
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

          {/* Failed */}
          {step === 'failed' && (
            <div className="p-6 flex flex-col items-center gap-4 text-center">
              <div className="w-14 h-14 rounded-full bg-negative-soft flex items-center justify-center">
                <AlertTriangle size={28} className="text-negative" />
              </div>
              <div>
                <p className="text-base font-700 text-foreground">Something went wrong</p>
                <p className="text-sm text-muted-foreground mt-1">{errorMessage}</p>
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
