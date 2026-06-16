'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { X, Mic, Type, AlertTriangle, CheckCircle, Loader2, RotateCcw, MessageSquare, Sparkles } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import VoiceRecorder from './VoiceRecorder';
import type { ParsedFinancialInstruction, FinancialAction, FinancialContext, SuggestedAccount, PersonResolution } from '@/lib/ai-types';
import { buildAIContext } from '@/lib/ai-execution';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { createClientId } from '@/lib/uuid';
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

interface PersonResolutionRequirement {
  actionIndex: number;
  actionIndexes: number[];
  personName: string;
  existingPeople: Array<{
    id: string;
    fullName: string;
    relationship?: string;
    moneyHeld?: number;
  }>;
  noPeople: boolean;
  isResolved: boolean;
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
  const [flowId, setFlowId] = useState(() => createClientId());
  const [flowRequestId, setFlowRequestId] = useState<string | null>(null);
  const [contextSnapshot, setContextSnapshot] = useState<FinancialContext | null>(null);
  const [accountResolutions, setAccountResolutions] = useState<AccountResolutionChoice[]>([]);
  const [personResolutions, setPersonResolutions] = useState<PersonResolution[]>([]);
  const [personNameEdits, setPersonNameEdits] = useState<Record<number, string>>({});
  const [accountDraft, setAccountDraft] = useState<{
    actionIndex: number;
    field: 'account' | 'destinationAccount';
    name: string;
    type: SuggestedAccount['type'];
    currency: string;
    openingBalance: number;
    includeInTotal: boolean;
  } | null>(null);
  const [personDraft, setPersonDraft] = useState<{
    actionIndex: number;
    actionIndexes: number[];
    name: string;
    relationship: NonNullable<PersonResolution['relationship']>;
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

  const normalizeName = (value: string | undefined) => (value || '').trim().toLowerCase();

  const isAccountRequired = (action: FinancialAction, field: 'account' | 'destinationAccount') => {
    if (field === 'destinationAccount') {
      return action.actionType === 'transfer';
    }

    return [
      'income',
      'expense',
      'transfer',
      'recurring_transaction',
      'expense_paid_for_person',
      'money_received_from_person',
      'expense_from_held_balance',
    ].includes(action.actionType);
  };

  const isPersonRequired = (action: FinancialAction) => {
    return [
      'money_received_from_person',
      'money_returned_to_person',
      'expense_from_held_balance',
      'expense_paid_for_person',
      'expense_paid_by_person',
      'reimbursement_payment',
      'settlement',
    ].includes(action.actionType);
  };

  const resolvePersonOption = (
    personId: string | undefined,
    personName: string | undefined,
    people: NonNullable<FinancialContext['people']>
  ) => {
    const normalized = normalizeName(personName);
    return people.find((person) => {
      if (personId && person.id === personId) return true;
      if (!normalized) return false;
      if (normalizeName(person.fullName) === normalized) return true;
      return (person.aliases || []).some((alias) => normalizeName(alias) === normalized);
    }) || null;
  };

  const findAccountOption = (
    action: FinancialAction,
    field: 'account' | 'destinationAccount'
  ) => {
    const accounts = contextSnapshot?.accounts || [];
    const accountId = field === 'account' ? action.accountId : action.destinationAccountId;
    const accountName = field === 'account' ? action.accountName : action.destinationAccountName;
    if (accountId) {
      const byId = accounts.find((account) => account.id === accountId);
      if (byId) return byId;
    }
    const normalized = normalizeName(accountName);
    if (!normalized) return null;
    return accounts.find((account) => normalizeName(account.name) === normalized) || null;
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

  const formatHeldBalance = (value: number | undefined, currency = 'AED') => {
    const amount = Number(value || 0);
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const applyLocalPersonResolutions = useCallback((
    instruction: ParsedFinancialInstruction,
    resolutions: PersonResolution[]
  ): ParsedFinancialInstruction => {
    const nextInstruction: ParsedFinancialInstruction = {
      ...instruction,
      actions: instruction.actions.map((action) => ({ ...action, warnings: [...(action.warnings || [])] })),
    };

    for (const resolution of resolutions) {
      const targetIndexes = Array.from(new Set([resolution.actionIndex, ...(resolution.actionIndexes || [])]));
      for (const targetIndex of targetIndexes) {
        const targetAction = nextInstruction.actions[targetIndex];
        if (!targetAction || !isPersonRequired(targetAction)) continue;

        if (resolution.mode === 'existing' && resolution.personId) {
          const selectedPerson = resolvePersonOption(
            resolution.personId,
            resolution.personName,
            contextSnapshot?.people || []
          );
          if (!selectedPerson) continue;
          targetAction.personId = selectedPerson.id;
          targetAction.personName = selectedPerson.fullName;
          continue;
        }

        targetAction.personId = undefined;
        targetAction.personName = resolution.personName;
        if (resolution.relationship) {
          targetAction.relationship = resolution.relationship;
        }
        if (resolution.notes) {
          targetAction.notes = resolution.notes;
        }
      }
    }

    return nextInstruction;
  }, [contextSnapshot, isPersonRequired, resolvePersonOption]);

  const applyLocalAccountResolutions = useCallback((
    instruction: ParsedFinancialInstruction,
    resolutions: AccountResolutionChoice[]
  ): ParsedFinancialInstruction => {
    const nextInstruction: ParsedFinancialInstruction = {
      ...instruction,
      actions: instruction.actions.map((action) => ({ ...action, warnings: [...(action.warnings || [])] })),
    };

    for (const resolution of [...resolutions].sort((a, b) => a.actionIndex - b.actionIndex)) {
      const targetAction = nextInstruction.actions[resolution.actionIndex];
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
        if (resolution.field === 'account') {
          targetAction.accountId = undefined;
          targetAction.accountName = resolution.account.name;
        } else {
          targetAction.destinationAccountId = undefined;
          targetAction.destinationAccountName = resolution.account.name;
        }
      }
    }

    return nextInstruction;
  }, [contextSnapshot]);

  const personAdjustedInstruction = parsed ? applyLocalPersonResolutions(parsed, personResolutions) : null;
  const previewInstruction = personAdjustedInstruction
    ? applyLocalAccountResolutions(personAdjustedInstruction, accountResolutions)
    : null;

  const personRequirements: PersonResolutionRequirement[] = personAdjustedInstruction
    ? (() => {
        const people = contextSnapshot?.people || [];
        const grouped = new Map<string, PersonResolutionRequirement>();

        personAdjustedInstruction.actions.forEach((action, actionIndex) => {
          if (!isPersonRequired(action)) return;
          const createResolution = personResolutions.find(
            (resolution) =>
              resolution.mode === 'create' &&
              [resolution.actionIndex, ...(resolution.actionIndexes || [])].includes(actionIndex)
          );
          const resolvedPerson = resolvePersonOption(action.personId, action.personName, people);
          const personName = createResolution?.personName || resolvedPerson?.fullName || action.personName || 'New Person';
          const personKey = resolvedPerson?.id
            ? `id:${resolvedPerson.id}`
            : `name:${normalizeName(personName || `person-${actionIndex}`)}`;
          const existing = grouped.get(personKey);
          if (existing) {
            existing.actionIndexes.push(actionIndex);
            existing.isResolved = existing.isResolved || !!resolvedPerson || !!createResolution;
            return;
          }

          grouped.set(personKey, {
            actionIndex,
            actionIndexes: [actionIndex],
            personName,
            existingPeople: people.map((person) => ({
              id: person.id as string,
              fullName: person.fullName as string,
              relationship: typeof person.relationship === 'string' ? person.relationship : undefined,
              moneyHeld: typeof person.moneyHeld === 'number' ? person.moneyHeld : undefined,
            })),
            noPeople: people.length === 0,
            isResolved: !!resolvedPerson || !!createResolution,
          });
        });

        return Array.from(grouped.values());
      })()
    : [];

  const unresolvedPersonCount = personRequirements.filter((item) => !item.isResolved).length;

  const unresolvedAccounts: UnresolvedAccountRequirement[] = previewInstruction
    ? (() => {
        const accounts = contextSnapshot?.accounts || [];
        const availableNames = new Set(accounts.map((account) => normalizeName(account.name)));
        accountResolutions.forEach((resolution) => {
          if (resolution.mode === 'create' && resolution.account?.name) {
            availableNames.add(normalizeName(resolution.account.name));
          }
        });
        const unresolved: UnresolvedAccountRequirement[] = [];

        previewInstruction.actions.forEach((action, actionIndex) => {
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
      setPersonResolutions([]);
      setPersonNameEdits({});
      setAccountDraft(null);
      setPersonDraft(null);

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
    if (!parsed || unresolvedAccounts.length > 0 || unresolvedPersonCount > 0) return;
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
          personResolutions,
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
        if (result?.status === 'clarification_required' || result?.code === 'account_missing' || result?.code === 'person_missing') {
          setErrorMessage(result.message || 'This Smart Entry request still needs more details before it can be saved.');
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
  }, [accountResolutions, parsed, personResolutions, previewInstruction?.actions.length, router, unresolvedAccounts.length, unresolvedPersonCount]);

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
    setFlowId(createClientId());
    setAccountResolutions([]);
    setPersonResolutions([]);
    setPersonNameEdits({});
    setAccountDraft(null);
    setPersonDraft(null);
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

  const upsertPersonResolution = useCallback((resolution: PersonResolution) => {
    setPersonResolutions((current) => {
      const next = current.filter((item) => item.actionIndex !== resolution.actionIndex);
      next.push(resolution);
      return next;
    });
  }, []);

  const handleStartCreateAccount = useCallback((requirement: UnresolvedAccountRequirement) => {
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

  const handleStartCreatePerson = useCallback((requirement: PersonResolutionRequirement) => {
    setPersonDraft({
      actionIndex: requirement.actionIndex,
      actionIndexes: requirement.actionIndexes,
      name: (personNameEdits[requirement.actionIndex] || requirement.personName).trim() || requirement.personName,
      relationship: 'other',
      notes: '',
    });
  }, [personNameEdits]);

  const handleApplyCreatePerson = useCallback(() => {
    if (!personDraft || !personDraft.name.trim()) return;
    upsertPersonResolution({
      actionIndex: personDraft.actionIndex,
      actionIndexes: personDraft.actionIndexes,
      mode: 'create',
      personName: personDraft.name.trim(),
      relationship: personDraft.relationship,
      notes: personDraft.notes.trim() || undefined,
    });
    setPersonNameEdits((current) => {
      const next = { ...current };
      delete next[personDraft.actionIndex];
      return next;
    });
    setPersonDraft(null);
  }, [personDraft, upsertPersonResolution]);

  const handleAccountSelectionChange = useCallback((
    actionIndex: number,
    field: 'account' | 'destinationAccount',
    value: string
  ) => {
    if (value === '__create__') {
      const action = previewInstruction?.actions[actionIndex];
      if (!action) return;
      handleStartCreateAccount({
        actionIndex,
        field,
        accountName: field === 'account' ? (action.accountName || 'Cash') : (action.destinationAccountName || 'Cash'),
        suggestedAccount: getSuggestedAccount(action, field),
        existingAccounts: (contextSnapshot?.accounts || []).map((account) => ({
          id: account.id as string,
          name: account.name as string,
          type: account.type as string,
          currency: account.currency as string,
        })),
        noAccounts: (contextSnapshot?.accounts || []).length === 0,
      });
      return;
    }

    if (!value) {
      setAccountResolutions((current) => current.filter(
        (item) => !(item.actionIndex === actionIndex && item.field === field)
      ));
      return;
    }

    upsertAccountResolution({
      actionIndex,
      field,
      mode: 'select',
      accountId: value,
    });
  }, [contextSnapshot, getSuggestedAccount, handleStartCreateAccount, previewInstruction, upsertAccountResolution]);

  const handlePersonSelectionChange = useCallback((
    requirement: PersonResolutionRequirement,
    value: string
  ) => {
    if (value === '__create__') {
      handleStartCreatePerson(requirement);
      return;
    }

    if (!value) {
      setPersonResolutions((current) => current.filter((item) => item.actionIndex !== requirement.actionIndex));
      return;
    }

    const selectedPerson = (contextSnapshot?.people || []).find((person) => person.id === value);
    if (!selectedPerson) return;

    upsertPersonResolution({
      actionIndex: requirement.actionIndex,
      actionIndexes: requirement.actionIndexes,
      mode: 'existing',
      personId: selectedPerson.id as string,
      personName: selectedPerson.fullName as string,
      relationship: typeof selectedPerson.relationship === 'string'
        ? selectedPerson.relationship as PersonResolution['relationship']
        : undefined,
    });
    setPersonDraft(null);
  }, [contextSnapshot, handleStartCreatePerson, upsertPersonResolution]);

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
                  const personRequirement = personRequirements.find((item) => item.actionIndexes.includes(i));
                  const resolvedPerson = resolvePersonOption(action.personId, action.personName, contextSnapshot?.people || []);
                  const personCreateResolution = personRequirement
                    ? personResolutions.find(
                        (resolution) =>
                          resolution.mode === 'create' &&
                          resolution.actionIndex === personRequirement.actionIndex
                      )
                    : null;
                  const selectedAccount = findAccountOption(action, 'account');
                  const selectedDestinationAccount = findAccountOption(action, 'destinationAccount');

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
                          {action.categoryName && (
                            <p className="mt-2 text-xs text-muted-foreground">Category: {action.categoryName}</p>
                          )}
                          {isPersonRequired(action) && (
                            <div className="mt-2 space-y-2">
                              <p className={`text-xs ${personRequirement && !personRequirement.isResolved ? 'text-warning font-600' : 'text-muted-foreground'}`}>
                                Managed person: {resolvedPerson?.fullName || action.personName || 'Missing'}
                              </p>
                              {resolvedPerson && (
                                <p className="text-xs text-muted-foreground">
                                  {resolvedPerson.relationship ? `${resolvedPerson.relationship} · ` : ''}
                                  Held balance: {formatHeldBalance(
                                    typeof resolvedPerson.moneyHeld === 'number' ? resolvedPerson.moneyHeld : 0,
                                    action.currency || 'AED'
                                  )}
                                </p>
                              )}
                              {personRequirement && (
                                <div className={`rounded-xl bg-card p-3 space-y-2 ${
                                  personRequirement.isResolved ? 'border border-border' : 'border border-warning/20'
                                }`}>
                                  {!resolvedPerson && !personCreateResolution && (
                                    <div className="space-y-1">
                                      <p className="text-xs text-muted-foreground">Detected name</p>
                                      <input
                                        value={personNameEdits[personRequirement.actionIndex] ?? personRequirement.personName}
                                        onChange={(e) => setPersonNameEdits((current) => ({
                                          ...current,
                                          [personRequirement.actionIndex]: e.target.value,
                                        }))}
                                        className="input-base w-full text-sm"
                                        placeholder="Managed person name"
                                      />
                                    </div>
                                  )}
                                  <select
                                    value={resolvedPerson?.id || (personCreateResolution ? '__create__' : '')}
                                    onChange={(e) => handlePersonSelectionChange(personRequirement, e.target.value)}
                                    className="input-base w-full text-sm"
                                  >
                                    <option value="">Select managed person</option>
                                    {personRequirement.existingPeople.map((person) => (
                                      <option key={person.id} value={person.id}>
                                        {person.fullName}
                                        {person.relationship ? ` • ${person.relationship}` : ''}
                                        {typeof person.moneyHeld === 'number' ? ` • Held ${formatHeldBalance(person.moneyHeld, action.currency || 'AED')}` : ''}
                                      </option>
                                    ))}
                                    <option value="__create__">Create new managed person</option>
                                  </select>
                                  {!personRequirement.isResolved && (
                                    <p className="text-xs text-warning">
                                      {personRequirement.noPeople
                                        ? 'No managed people exist yet. Create one before saving.'
                                        : `${personNameEdits[personRequirement.actionIndex] || personRequirement.personName} still needs to be matched or created.`}
                                    </p>
                                  )}
                                  {personDraft && personDraft.actionIndex === personRequirement.actionIndex && (
                                    <div className="space-y-2">
                                      <input
                                        value={personDraft.name}
                                        onChange={(e) => setPersonDraft((current) => current ? { ...current, name: e.target.value } : current)}
                                        className="input-base w-full text-sm"
                                        placeholder="Managed person name"
                                      />
                                      <select
                                        value={personDraft.relationship}
                                        onChange={(e) => setPersonDraft((current) => current ? { ...current, relationship: e.target.value as NonNullable<PersonResolution['relationship']> } : current)}
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
                                      <textarea
                                        value={personDraft.notes}
                                        onChange={(e) => setPersonDraft((current) => current ? { ...current, notes: e.target.value } : current)}
                                        className="input-base w-full text-sm h-20 resize-none"
                                        placeholder="Notes (optional)"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          onClick={handleApplyCreatePerson}
                                          disabled={!personDraft.name.trim()}
                                          className="flex-1 py-2.5 rounded-xl bg-positive text-white text-sm font-600 hover:bg-positive/90 disabled:opacity-50 transition-colors"
                                        >
                                          Use This Person
                                        </button>
                                        <button
                                          onClick={() => setPersonDraft(null)}
                                          className="px-4 py-2.5 rounded-xl bg-muted text-foreground text-sm font-600 hover:bg-muted/80 transition-colors"
                                        >
                                          Back
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {isAccountRequired(action, 'account') && (
                            <div className="mt-2 space-y-2">
                              <p className={`text-xs ${accountRequirement ? 'text-warning font-600' : 'text-muted-foreground'}`}>
                                {action.actionType === 'transfer' ? 'From account' : 'Account'}: {selectedAccount?.name || action.accountName || 'Not specified'}
                              </p>
                              <select
                                value={selectedAccount?.id || ''}
                                onChange={(e) => handleAccountSelectionChange(i, 'account', e.target.value)}
                                className="input-base w-full text-sm"
                              >
                                <option value="">Select account</option>
                                {(contextSnapshot?.accounts || []).map((account) => (
                                  <option key={account.id as string} value={account.id as string}>
                                    {account.name} • {account.type} • {account.currency}
                                  </option>
                                ))}
                                <option value="__create__">Create new account</option>
                              </select>
                              {accountRequirement && (
                                <p className="text-xs text-warning">{accountRequirement.accountName} account not found.</p>
                              )}
                              {accountDraft && accountDraft.actionIndex === i && accountDraft.field === 'account' && (
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
                            </div>
                          )}
                          {isAccountRequired(action, 'destinationAccount') && (
                            <div className="mt-2 space-y-2">
                              <p className={`text-xs ${destinationRequirement ? 'text-warning font-600' : 'text-muted-foreground'}`}>
                                To account: {selectedDestinationAccount?.name || action.destinationAccountName || 'Not specified'}
                              </p>
                              <select
                                value={selectedDestinationAccount?.id || ''}
                                onChange={(e) => handleAccountSelectionChange(i, 'destinationAccount', e.target.value)}
                                className="input-base w-full text-sm"
                              >
                                <option value="">Select destination account</option>
                                {(contextSnapshot?.accounts || []).map((account) => (
                                  <option key={account.id as string} value={account.id as string}>
                                    {account.name} • {account.type} • {account.currency}
                                  </option>
                                ))}
                                <option value="__create__">Create new account</option>
                              </select>
                              {destinationRequirement && (
                                <p className="text-xs text-warning">{destinationRequirement.accountName} account not found.</p>
                              )}
                              {accountDraft && accountDraft.actionIndex === i && accountDraft.field === 'destinationAccount' && (
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

              <div className="flex gap-2">
                <button
                  onClick={handleConfirm}
                  disabled={unresolvedAccounts.length > 0 || unresolvedPersonCount > 0}
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
