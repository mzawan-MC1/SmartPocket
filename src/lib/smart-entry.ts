import type {
  FinancialAction,
  FinancialContext,
  ParsedFinancialInstruction,
  SmartEntryAccountSelection,
  SmartEntryMissingField,
  SmartEntryPersonSelection,
  SmartEntryPurpose,
  SmartEntryPurposeOption,
  SmartEntryReview,
  SuggestedAccount,
} from '@/lib/ai-types';
import { formatCurrencyText } from '@/lib/currency-formatting';

const FALLBACK_CURRENCY = 'USD';
type ContextAccount = NonNullable<NonNullable<FinancialContext['accounts']>[number]>;
type ContextPerson = NonNullable<NonNullable<FinancialContext['people']>[number]>;

export const AMBIGUOUS_RECEIPT_PURPOSE_OPTIONS: SmartEntryPurposeOption[] = [
  {
    id: 'personal_income',
    label: 'My money / payment',
    description: 'Add it to my own account and treat it as money I received.',
  },
  {
    id: 'borrowed_money',
    label: 'Borrowed from them',
    description: 'Add it to my own account and record that I still owe them.',
  },
  {
    id: 'managed_money',
    label: 'Managing for them',
    description: 'Keep their money separate in their own tracked account.',
  },
  {
    id: 'reimbursement',
    label: 'Reimbursement / other',
    description: 'They are paying you back for something earlier, or this needs a non-managed transfer meaning.',
  },
];

function containsAny(raw: string, phrases: string[]) {
  return phrases.some((phrase) => raw.includes(phrase));
}

function hasBorrowedPurposeWording(raw: string) {
  return containsAny(raw, [
    'borrowed',
    'borrow from',
    'lent me',
    'loan from',
    'as a loan',
    'owe ',
    'repay later',
  ]);
}

function hasManagedPurposeWording(raw: string) {
  return containsAny(raw, [
    'on his behalf',
    'on her behalf',
    'on their behalf',
    'manage this money',
    'manage the money',
    'hold this money',
    'keep this money for',
    'keep it for',
    'belongs to ',
    'spend this for',
    'use this on',
    'to pay her ',
    'to pay his ',
    'to pay their ',
    'pay her bills',
    'pay his bills',
    'pay their bills',
  ]);
}

function hasIncomePurposeWording(raw: string) {
  return containsAny(raw, [
    'paid me',
    'payment from',
    'salary from',
    'commission from',
    'income from',
    'for consulting',
    'for my work',
    'for work',
    'gift',
  ]);
}

function hasReimbursementPurposeWording(raw: string) {
  return containsAny(raw, [
    'reimbursed me',
    'paid me back',
    'returned what i spent',
    'repaid me',
  ]);
}

function hasAmbiguousReceiptWording(raw: string) {
  return containsAny(raw, [
    'gave me',
    'received money from',
    'received from',
    'got money from',
    'transferred',
    'sent me',
    'sent ',
  ]);
}

function hasExplicitFullAmountSpendWording(raw: string) {
  return containsAny(raw, [
    'used all of it',
    'used the full amount',
    'spent the full amount',
    'spent the full',
    'used the whole amount',
    'used all the money',
  ]);
}

function hasImplicitSpendMention(raw: string) {
  return containsAny(raw, [
    'used it',
    'used some of it',
    'used the money',
    'used some money',
    'used it to pay',
    'used some of it for',
    'pay rent',
    'pay rent.',
    'pay rent ',
  ]);
}

function buildAmountQuestionLabel(action: FinancialAction | undefined) {
  const category = action?.categoryName || action?.description;
  if (category) {
    return `How much was used for ${category.toLowerCase()}?`;
  }
  return 'How much was used?';
}

function extractExplicitExpenseAmountFromText(raw: string, receivedAmount: number | undefined) {
  const patterns = [
    /bill\s+of\s+(?:aed\s*)?(\d+(?:\.\d+)?)/i,
    /paid\s+(?:aed\s*)?(\d+(?:\.\d+)?)\s+(?:for|on)\b/i,
    /spent\s+(?:aed\s*)?(\d+(?:\.\d+)?)\s+(?:for|on)\b/i,
    /used\s+(?:aed\s*)?(\d+(?:\.\d+)?)\s+(?:for|on)\b/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1]) {
      return parseFloat(match[1]);
    }
  }

  const allAmounts = raw.match(/\d+(?:\.\d+)?/g)?.map((value) => parseFloat(value)) || [];
  if (allAmounts.length >= 2) {
    const candidate = allAmounts[1];
    if (typeof receivedAmount === 'number' && candidate === receivedAmount && allAmounts.length === 2) {
      return undefined;
    }
    return candidate;
  }

  return undefined;
}

export function normalizeName(value: string | undefined) {
  return (value || '').trim().toLowerCase();
}

export function sanitizeCurrency(
  value: string | undefined,
  options?: {
    fallbackCurrency?: string;
    allowedCurrencies?: Iterable<string> | null;
  }
) {
  const fallbackCurrency = (options?.fallbackCurrency || FALLBACK_CURRENCY).trim().toUpperCase();
  const normalized = (value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  const allowedCurrencies = options?.allowedCurrencies ? new Set(options.allowedCurrencies) : null;

  if (normalized.length === 3 && (!allowedCurrencies || allowedCurrencies.has(normalized))) {
    return normalized;
  }

  if (fallbackCurrency.length === 3 && (!allowedCurrencies || allowedCurrencies.has(fallbackCurrency))) {
    return fallbackCurrency;
  }

  return FALLBACK_CURRENCY;
}

function formatSmartEntryMoney(amount: number, currency: string | undefined, fallbackCurrency?: string) {
  return formatCurrencyText(amount, {
    currencyCode: currency,
    fallbackCurrencyCode: fallbackCurrency || FALLBACK_CURRENCY,
    textOnly: true,
  });
}

export function inferAccountType(name: string | undefined): SuggestedAccount['type'] {
  const normalized = normalizeName(name);
  if (normalized.includes('cash')) return 'cash';
  if (normalized.includes('credit')) return 'credit_card';
  if (normalized.includes('saving')) return 'savings';
  if (normalized.includes('wallet')) return 'digital_wallet';
  if (normalized.includes('invest')) return 'investment';
  if (normalized.includes('bank')) return 'bank';
  return 'other';
}

export function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function isManagedPurpose(purpose: SmartEntryPurpose | undefined) {
  return purpose === 'managed_money' || purpose === 'managed_return';
}

export function getManagedAccountName(personName: string | undefined) {
  return toTitleCase(`${personName || 'Managed'} Cash`);
}

function isManagedContextAccount(account: ContextAccount) {
  return account.includeInTotal === false;
}

function isManagedLikeAccount(account: ContextAccount, people?: FinancialContext['people'] | null) {
  if (isManagedContextAccount(account)) return true;
  const normalizedName = normalizeName(account.name);
  if (!normalizedName) return false;
  return (people || []).some((person): person is ContextPerson => {
    if (!person?.fullName) return false;
    return normalizeName(getManagedAccountName(person.fullName)) === normalizedName;
  });
}

export function isAccountEligibleForPurpose(args: {
  purpose: SmartEntryPurpose | undefined;
  account: ContextAccount;
  field: 'account' | 'destinationAccount';
  personName?: string;
  people?: FinancialContext['people'] | null;
}) {
  if (args.field === 'destinationAccount') {
    return args.account.includeInTotal === true && !isManagedLikeAccount(args.account, args.people);
  }

  if (isManagedPurpose(args.purpose)) {
    if (args.account.includeInTotal !== false) return false;
    if (!args.personName) return true;
    return normalizeName(args.account.name) === normalizeName(getManagedAccountName(args.personName));
  }

  return args.account.includeInTotal === true && !isManagedLikeAccount(args.account, args.people);
}

export function getEligibleAccountsForPurpose(args: {
  purpose: SmartEntryPurpose | undefined;
  accounts?: FinancialContext['accounts'] | null;
  field: 'account' | 'destinationAccount';
  personName?: string;
  people?: FinancialContext['people'] | null;
}) {
  return (args.accounts || []).filter((account): account is ContextAccount =>
    !!account && isAccountEligibleForPurpose({
      purpose: args.purpose,
      account,
      field: args.field,
      personName: args.personName,
      people: args.people,
    })
  );
}

export function isAccountRequired(action: FinancialAction, field: 'account' | 'destinationAccount') {
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
    'money_returned_to_person',
    'expense_from_held_balance',
    'loan_received',
    'loan_repayment',
  ].includes(action.actionType);
}

export function isPersonRequired(action: FinancialAction) {
  return [
    'money_received_from_person',
    'money_returned_to_person',
    'expense_from_held_balance',
    'expense_paid_for_person',
    'expense_paid_by_person',
    'reimbursement_payment',
    'settlement',
    'loan_received',
    'loan_repayment',
  ].includes(action.actionType);
}

function firstPersonAction(actions: FinancialAction[]) {
  return actions.find((action) => isPersonRequired(action));
}

function firstAccountAction(actions: FinancialAction[]) {
  return actions.find((action) => isAccountRequired(action, 'account'));
}

function firstDestinationAccountAction(actions: FinancialAction[]) {
  return actions.find((action) => isAccountRequired(action, 'destinationAccount'));
}

function findContextAccount(
  selection: { accountId?: string; name?: string } | undefined,
  context: FinancialContext | null | undefined
) {
  const accounts = context?.accounts || [];
  if (!selection) return null;
  if (selection.accountId) {
    const byId = accounts.find((account) => account.id === selection.accountId);
    if (byId) return byId;
  }
  const normalized = normalizeName(selection.name);
  if (!normalized) return null;
  return accounts.find((account) => normalizeName(account.name) === normalized) || null;
}

function findContextPerson(
  selection: { personId?: string; name?: string } | undefined,
  context: FinancialContext | null | undefined
) {
  const people = context?.people || [];
  if (!selection) return null;
  if (selection.personId) {
    const byId = people.find((person) => person.id === selection.personId);
    if (byId) return byId;
  }
  const normalized = normalizeName(selection.name);
  if (!normalized) return null;
  return (
    people.find((person) => normalizeName(person.fullName) === normalized) ||
    people.find((person) => (person.aliases || []).some((alias) => normalizeName(alias) === normalized)) ||
    null
  );
}

function isResolvedPersonSelection(selection: SmartEntryPersonSelection | undefined) {
  if (!selection?.required) return true;
  if (selection.mode === 'existing') return !!selection.personId;
  if (selection.mode === 'create') return !!selection.name?.trim();
  return false;
}

function isResolvedAccountSelection(selection: SmartEntryAccountSelection | undefined) {
  if (!selection?.required) return true;
  if (selection.mode === 'existing') return !!selection.accountId;
  if (selection.mode === 'create') {
    return !!selection.name?.trim() && !!sanitizeCurrency(selection.currency);
  }
  return false;
}

export function hydrateSmartEntryReviewWithContext(args: {
  review: SmartEntryReview;
  context?: FinancialContext | null;
}): SmartEntryReview {
  const { review, context } = args;
  const personName = review.person?.name;
  const eligiblePrimaryAccounts = getEligibleAccountsForPurpose({
    purpose: review.purpose,
    accounts: context?.accounts,
    field: 'account',
    personName,
    people: context?.people,
  });
  const eligibleDestinationAccounts = getEligibleAccountsForPurpose({
    purpose: review.purpose,
    accounts: context?.accounts,
    field: 'destinationAccount',
    personName,
    people: context?.people,
  });

  const matchedPerson = findContextPerson(review.person, context);
  const matchedAccount = findContextAccount(review.account, {
    ...context,
    accounts: eligiblePrimaryAccounts,
  });
  const matchedDestinationAccount = findContextAccount(review.destinationAccount, {
    ...context,
    accounts: eligibleDestinationAccounts,
  });

  return {
    ...review,
    person: matchedPerson?.id
      ? {
          ...review.person,
          required: review.person?.required,
          mode: 'existing',
          personId: matchedPerson.id,
          name: matchedPerson.fullName,
          relationship: matchedPerson.relationship || review.person?.relationship,
        }
      : review.person,
    account: matchedAccount?.id
      ? {
          ...review.account,
          required: review.account?.required,
          mode: 'existing',
          accountId: matchedAccount.id,
          name: matchedAccount.name,
          type: matchedAccount.type as SmartEntryAccountSelection['type'],
          currency: sanitizeCurrency(matchedAccount.currency || review.account?.currency || review.currency),
        }
      : review.account
        ? {
            ...review.account,
            mode: review.account.mode === 'create' ? 'create' : undefined,
            accountId: undefined,
            includeInTotal: isManagedPurpose(review.purpose) ? false : true,
            scope: isManagedPurpose(review.purpose) ? 'managed' : 'personal',
            managedPersonId: isManagedPurpose(review.purpose) ? matchedPerson?.id || review.person?.personId : undefined,
            managedPersonName: isManagedPurpose(review.purpose) ? matchedPerson?.fullName || personName : undefined,
          }
        : review.account,
    destinationAccount: matchedDestinationAccount?.id
      ? {
          ...review.destinationAccount,
          required: review.destinationAccount?.required,
          mode: 'existing',
          accountId: matchedDestinationAccount.id,
          name: matchedDestinationAccount.name,
          type: matchedDestinationAccount.type as SmartEntryAccountSelection['type'],
          currency: sanitizeCurrency(matchedDestinationAccount.currency || review.destinationAccount?.currency || review.currency),
        }
      : review.destinationAccount,
  };
}

export function inferSmartEntryPurpose(args: {
  instruction: ParsedFinancialInstruction;
  sourceText?: string;
}): {
  purpose?: SmartEntryPurpose;
  purposeConfidence?: number;
  purposeNeedsConfirmation?: boolean;
  purposeOptions?: SmartEntryPurposeOption[];
} {
  const raw = (args.sourceText || '').toLowerCase();
  const actions = args.instruction.actions;
  const hasReceiptFromPerson = actions.some((action) => action.actionType === 'money_received_from_person');
  const hasHeldExpense = actions.some((action) => action.actionType === 'expense_from_held_balance');
  const hasExpense = actions.some((action) => action.actionType === 'expense' || action.actionType === 'expense_from_held_balance');
  const ambiguousReceipt = hasReceiptFromPerson && hasAmbiguousReceiptWording(raw) && !hasBorrowedPurposeWording(raw) && !hasManagedPurposeWording(raw) && !hasIncomePurposeWording(raw) && !hasReimbursementPurposeWording(raw);

  if (actions.some((action) => action.actionType === 'transfer')) {
    return { purpose: 'transfer', purposeConfidence: 0.98 };
  }
  if (hasBorrowedPurposeWording(raw)) {
    return { purpose: 'borrowed_money', purposeConfidence: 0.98 };
  }
  if (raw.includes('paid back') || raw.includes('pay back') || raw.includes('repaid') || raw.includes('toward the loan')) {
    return { purpose: 'loan_repayment', purposeConfidence: 0.98 };
  }
  if (raw.includes('returned') && (raw.includes('remaining money') || raw.includes('unused money') || raw.includes('his money') || raw.includes('her money'))) {
    return { purpose: 'managed_return', purposeConfidence: 0.97 };
  }
  if (hasReimbursementPurposeWording(raw) || actions.some((action) => action.actionType === 'expense_paid_for_person' || action.actionType === 'reimbursement_payment')) {
    return { purpose: 'reimbursement', purposeConfidence: 0.96 };
  }
  if (hasManagedPurposeWording(raw) || (hasHeldExpense && !ambiguousReceipt)) {
    return { purpose: 'managed_money', purposeConfidence: 0.97 };
  }
  if (actions.some((action) => action.actionType === 'loan_received')) {
    return { purpose: 'borrowed_money', purposeConfidence: 0.97 };
  }
  if (actions.some((action) => action.actionType === 'loan_repayment')) {
    return { purpose: 'loan_repayment', purposeConfidence: 0.97 };
  }
  if (hasIncomePurposeWording(raw) || actions.some((action) => action.actionType === 'income')) {
    return { purpose: 'personal_income', purposeConfidence: 0.96 };
  }
  if (actions.some((action) => action.actionType === 'expense') && actions.length === 1) {
    return { purpose: 'personal_expense', purposeConfidence: 0.97 };
  }
  if (ambiguousReceipt && (hasExpense || actions.length === 1)) {
    return {
      purpose: 'unclear',
      purposeConfidence: 0.35,
      purposeNeedsConfirmation: true,
      purposeOptions: AMBIGUOUS_RECEIPT_PURPOSE_OPTIONS,
    };
  }
  if (actions.some((action) => action.actionType === 'money_received_from_person')) {
    return { purpose: 'managed_money', purposeConfidence: 0.7 };
  }
  if (actions.some((action) => action.actionType === 'money_returned_to_person')) {
    return { purpose: 'managed_return', purposeConfidence: 0.9 };
  }

  return {};
}

export function deriveUnderstandingLines(instruction: ParsedFinancialInstruction) {
  return instruction.actions.map((action) => {
    const amount = typeof action.amount === 'number'
      ? formatSmartEntryMoney(action.amount, action.currency, instruction.review?.currency)
      : 'an unknown amount';

    switch (action.actionType) {
      case 'income':
        return `${action.personName || 'Someone'} paid you ${amount}.`;
      case 'expense':
        return `You spent ${amount}${action.categoryName ? ` on ${action.categoryName}` : ''}.`;
      case 'loan_received':
        return `You borrowed ${amount} from ${action.personName || 'someone'}.`;
      case 'loan_repayment':
        return `You paid back ${amount} to ${action.personName || 'someone'}.`;
      case 'money_received_from_person':
        return `${action.personName || 'Someone'} gave you ${amount}.`;
      case 'money_returned_to_person':
        return `You returned ${amount} to ${action.personName || 'someone'}.`;
      case 'expense_from_held_balance':
        return `You spent ${amount}${action.categoryName ? ` on ${action.categoryName}` : ''} for ${action.personName || 'someone'}.`;
      case 'expense_paid_for_person':
        return `You paid ${amount}${action.categoryName ? ` for ${action.categoryName}` : ''} for ${action.personName || 'someone'}.`;
      case 'reimbursement_payment':
        return `${action.personName || 'Someone'} paid you back ${amount}.`;
      case 'transfer':
        return `You moved ${amount} from ${action.accountName || 'one account'} to ${action.destinationAccountName || 'another account'}.`;
      default:
        return action.description || `${action.actionType} ${amount}`;
    }
  });
}

export function buildInitialSmartEntryReview(args: {
  instruction: ParsedFinancialInstruction;
  sourceText?: string;
  context?: FinancialContext | null;
}): SmartEntryReview {
  const { purpose, purposeOptions, purposeConfidence, purposeNeedsConfirmation } = inferSmartEntryPurpose(args);
  const actions = args.instruction.actions;
  const primaryPersonAction = firstPersonAction(actions);
  const primaryAccountAction = firstAccountAction(actions);
  const destinationAccountAction = firstDestinationAccountAction(actions);
  const receiptAction = actions.find((action) => action.actionType === 'money_received_from_person' || action.actionType === 'loan_received' || action.actionType === 'income');
  const firstMissingAmountActionIndex = actions.findIndex((action) =>
    action.actionType !== 'create_account' &&
    action.actionType !== 'create_managed_person' &&
    typeof action.amount !== 'number'
  );
  const missingAmountAction = firstMissingAmountActionIndex >= 0 ? actions[firstMissingAmountActionIndex] : undefined;
  const sourceText = (args.sourceText || '').toLowerCase();
  const receivedAmount = typeof receiptAction?.amount === 'number' ? receiptAction.amount : undefined;
  const explicitExpenseAmount = typeof missingAmountAction?.amount !== 'number'
    ? extractExplicitExpenseAmountFromText(sourceText, receivedAmount)
    : undefined;
  const shouldUseFullReceivedAmount = !!receivedAmount && typeof missingAmountAction?.amount !== 'number' && hasExplicitFullAmountSpendWording(sourceText);
  const hasResolvedExpenseAmount = typeof explicitExpenseAmount === 'number' || shouldUseFullReceivedAmount;
  const shouldAskExpenseAmount =
    !!receivedAmount &&
    typeof missingAmountAction?.amount !== 'number' &&
    typeof explicitExpenseAmount !== 'number' &&
    (hasImplicitSpendMention(sourceText) || missingAmountAction?.amountNeedsConfirmation === true) &&
    !shouldUseFullReceivedAmount;
  const inferredCurrency = sanitizeCurrency(
    actions.find((action) => typeof action.currency === 'string')?.currency || args.context?.defaultCurrency,
    {
      fallbackCurrency: args.context?.defaultCurrency,
      allowedCurrencies: args.context?.currencies,
    }
  );

  const review: SmartEntryReview = {
    understanding: deriveUnderstandingLines(args.instruction),
    missing: [],
    purpose,
    purposeConfidence,
    purposeNeedsConfirmation,
    purposeOptions,
    amount: shouldUseFullReceivedAmount
      ? receivedAmount
      : typeof explicitExpenseAmount === 'number'
        ? explicitExpenseAmount
      : actions.length === 1 && typeof actions[0]?.amount === 'number'
        ? actions[0].amount
        : undefined,
    receivedAmount,
    amountActionIndex: shouldAskExpenseAmount ? firstMissingAmountActionIndex : undefined,
    amountLabel: shouldAskExpenseAmount || shouldUseFullReceivedAmount ? buildAmountQuestionLabel(missingAmountAction) : undefined,
    amountQuickOptionValue: shouldAskExpenseAmount ? receivedAmount : undefined,
    amountNeedsConfirmation: shouldAskExpenseAmount,
    currency: inferredCurrency,
  };

  if (purposeNeedsConfirmation) {
    const personName = primaryPersonAction?.personName || receiptAction?.personName || 'someone';
    const amountText = typeof receivedAmount === 'number'
      ? formatSmartEntryMoney(receivedAmount, inferredCurrency, args.context?.defaultCurrency)
      : 'an amount';
    const spendLabel = missingAmountAction?.categoryName || missingAmountAction?.description || 'A payment';
    review.understanding = [
      `${personName} gave you ${amountText}.`,
      `${spendLabel} was mentioned.`,
      'Financial purpose needs confirmation.',
      ...(shouldAskExpenseAmount ? [`${buildAmountQuestionLabel(missingAmountAction).replace('?', '')} needs confirmation.`] : []),
    ];
  }

  if (primaryPersonAction) {
    const matchedPerson = findContextPerson(
      {
        personId: primaryPersonAction.personId,
        name: primaryPersonAction.personName,
      },
      args.context
    );

    review.person = matchedPerson?.id
      ? {
          required: true,
          mode: 'existing',
          personId: matchedPerson.id,
          name: matchedPerson.fullName,
          relationship: matchedPerson.relationship,
        }
      : {
          required: true,
          name: primaryPersonAction.personName,
          relationship: primaryPersonAction.relationship,
        };
  }

  if (primaryAccountAction) {
    if (purposeNeedsConfirmation && !purpose) {
      review.account = {
        required: true,
        currency: inferredCurrency,
      };
    } else {
    const isManaged = isManagedPurpose(purpose);
    const managedPersonName = review.person?.name || primaryPersonAction?.personName;
    const eligibleAccounts = getEligibleAccountsForPurpose({
      purpose,
      accounts: args.context?.accounts,
      field: 'account',
      personName: managedPersonName,
      people: args.context?.people,
    });
    const matchedAccount = findContextAccount(
      {
        accountId: primaryAccountAction.accountId,
        name: primaryAccountAction.accountName,
      },
      {
        ...args.context,
        accounts: eligibleAccounts,
      }
    );
    const fallbackAccount = !primaryAccountAction.accountName && !primaryAccountAction.accountId
      ? eligibleAccounts[0]
      : null;
    const suggestedName = isManaged && managedPersonName
      ? getManagedAccountName(managedPersonName)
      : primaryAccountAction.accountName || fallbackAccount?.name || 'Cash';

    review.account = matchedAccount?.id
      ? {
          required: true,
          mode: 'existing',
          accountId: matchedAccount.id,
          name: matchedAccount.name,
          type: matchedAccount.type as SmartEntryAccountSelection['type'],
          currency: sanitizeCurrency(matchedAccount.currency),
          includeInTotal: !isManaged,
          scope: isManaged ? 'managed' : 'personal',
          managedPersonName: isManaged ? managedPersonName : undefined,
        }
      : fallbackAccount?.id
        ? {
            required: true,
            mode: 'existing',
            accountId: fallbackAccount.id,
            name: fallbackAccount.name,
            type: fallbackAccount.type as SmartEntryAccountSelection['type'],
            currency: sanitizeCurrency(fallbackAccount.currency),
            includeInTotal: !isManaged,
            scope: isManaged ? 'managed' : 'personal',
            managedPersonName: isManaged ? managedPersonName : undefined,
          }
      : {
          required: true,
          mode: undefined,
          name: toTitleCase(suggestedName),
          type: inferAccountType(suggestedName),
          currency: inferredCurrency,
          includeInTotal: !isManaged,
          scope: isManaged ? 'managed' : 'personal',
          managedPersonName: isManaged ? managedPersonName : undefined,
        };
    }
  }

  if (destinationAccountAction) {
    const eligibleAccounts = getEligibleAccountsForPurpose({
      purpose,
      accounts: args.context?.accounts,
      field: 'destinationAccount',
      personName: review.person?.name,
      people: args.context?.people,
    });
    const matchedAccount = findContextAccount(
      {
        accountId: destinationAccountAction.destinationAccountId,
        name: destinationAccountAction.destinationAccountName,
      },
      {
        ...args.context,
        accounts: eligibleAccounts,
      }
    );
    const suggestedName = destinationAccountAction.destinationAccountName || 'Cash';

    review.destinationAccount = matchedAccount?.id
      ? {
          required: true,
          mode: 'existing',
          accountId: matchedAccount.id,
          name: matchedAccount.name,
          type: matchedAccount.type as SmartEntryAccountSelection['type'],
          currency: sanitizeCurrency(matchedAccount.currency),
          includeInTotal: true,
          scope: 'personal',
        }
      : {
          required: true,
          name: toTitleCase(suggestedName),
          type: inferAccountType(suggestedName),
          currency: inferredCurrency,
          includeInTotal: true,
          scope: 'personal',
        };
  }

  if ((!review.purpose || review.purpose === 'unclear' || review.purposeNeedsConfirmation) && purposeOptions?.length) {
    review.missing.push('purpose');
  }
  const hasOtherMissingAmounts = actions.some((action, index) =>
    typeof action.amount !== 'number' &&
    action.actionType !== 'create_account' &&
    action.actionType !== 'create_managed_person' &&
    index !== review.amountActionIndex &&
    !(hasResolvedExpenseAmount && index === firstMissingAmountActionIndex)
  );
  if (shouldAskExpenseAmount || hasOtherMissingAmounts) {
    review.missing.push('amount');
  }
  if (actions.some((action) => !action.currency && !args.context?.defaultCurrency)) {
    review.missing.push('currency');
  }
  if (review.person?.required && !review.person.personId && !review.person.name) {
    review.missing.push('person');
  }
  if (review.account?.required && !review.account.accountId && !review.account.name) {
    review.missing.push('account');
  }
  if (review.destinationAccount?.required && !review.destinationAccount.accountId && !review.destinationAccount.name) {
    review.missing.push('destinationAccount');
  }

  return review;
}

function applyPurposeTransform(action: FinancialAction, purpose: SmartEntryPurpose | undefined): FinancialAction {
  if (!purpose || purpose === 'unclear') {
    if (action.actionType === 'expense_from_held_balance') {
      return {
        ...action,
        actionType: 'expense',
        expenseOwner: 'user',
        paidBy: 'user',
        paidFrom: 'account',
      };
    }
    return { ...action };
  }

  if (purpose === 'personal_income' && action.actionType === 'money_received_from_person') {
    return {
      ...action,
      actionType: 'income',
      personId: undefined,
      personName: undefined,
      expenseOwner: 'user',
      paidBy: 'third_party',
      paidFrom: 'external',
    };
  }

  if ((purpose === 'personal_income' || purpose === 'reimbursement') && action.actionType === 'expense_from_held_balance') {
    return {
      ...action,
      actionType: 'expense',
      expenseOwner: 'user',
      paidBy: 'user',
      paidFrom: 'account',
    };
  }

  if (purpose === 'borrowed_money') {
    if (action.actionType === 'money_received_from_person') {
      return {
        ...action,
        actionType: 'loan_received',
        expenseOwner: 'user',
        paidBy: 'person',
        paidFrom: 'external',
      };
    }
    if (action.actionType === 'expense_from_held_balance') {
      return {
        ...action,
        actionType: 'expense',
        expenseOwner: 'user',
        paidBy: 'user',
        paidFrom: 'account',
      };
    }
  }

  if (purpose === 'managed_money' && action.actionType === 'expense') {
    return {
      ...action,
      actionType: 'expense_from_held_balance',
      paidBy: 'person',
      paidFrom: 'held_balance',
      expenseOwner: 'person',
    };
  }

  if (purpose === 'reimbursement' && action.actionType === 'money_received_from_person') {
    return {
      ...action,
      actionType: 'reimbursement_payment',
      paidBy: 'person',
      paidFrom: 'external',
    };
  }

  if (purpose === 'loan_repayment' && action.actionType === 'money_returned_to_person') {
    return {
      ...action,
      actionType: 'loan_repayment',
      paidBy: 'person',
      paidFrom: 'account',
      expenseOwner: 'user',
    };
  }

  return { ...action };
}

export function applySmartEntryReviewToInstruction(
  instruction: ParsedFinancialInstruction
): ParsedFinancialInstruction {
  const review = instruction.review;
  if (!review) return instruction;

  const baseActions = instruction.actions.filter(
    (action) => action.actionType !== 'create_account' && action.actionType !== 'create_managed_person'
  );

  const transformedActions = baseActions.map((originalAction) => {
    let action = applyPurposeTransform(originalAction, review.purpose);

    const shouldApplyReviewAmount = typeof review.amount === 'number' &&
      typeof action.amount !== 'number' &&
      (typeof review.amountActionIndex === 'number' ? baseActions.indexOf(originalAction) === review.amountActionIndex : true);

    if (shouldApplyReviewAmount) {
      action = { ...action, amount: review.amount };
    }
    if (review.currency && !action.currency) {
      action = { ...action, currency: sanitizeCurrency(review.currency) };
    }

    if (review.person && isPersonRequired(action)) {
      action = {
        ...action,
        personId: review.person.mode === 'existing' ? review.person.personId : undefined,
        personName: review.person.name,
        relationship: review.person.relationship || action.relationship,
        notes: review.person.notes || action.notes,
      };
    }

    if (review.account && isAccountRequired(action, 'account')) {
      action = {
        ...action,
        accountId: review.account.mode === 'existing' ? review.account.accountId : undefined,
        accountName: review.account.name,
        accountType: review.account.type || action.accountType,
        includeInTotal: review.account.includeInTotal ?? action.includeInTotal,
        accountScope: review.account.scope || action.accountScope,
        managedPersonId: review.account.managedPersonId || action.managedPersonId,
        currency: sanitizeCurrency(review.account.currency || action.currency || review.currency),
      };
    }

    if (review.destinationAccount && isAccountRequired(action, 'destinationAccount')) {
      action = {
        ...action,
        destinationAccountId: review.destinationAccount.mode === 'existing' ? review.destinationAccount.accountId : undefined,
        destinationAccountName: review.destinationAccount.name,
        currency: sanitizeCurrency(review.destinationAccount.currency || action.currency || review.currency),
      };
    }

    return action;
  });

  const syntheticActions: FinancialAction[] = [];

  if (review.person?.required && review.person.mode === 'create' && review.person.name?.trim()) {
    syntheticActions.push({
      actionType: 'create_managed_person',
      personName: review.person.name.trim(),
      relationship: review.person.relationship || 'other',
      notes: review.person.notes,
      currency: sanitizeCurrency(review.currency),
      confidence: 1,
      warnings: [],
      description: `Create person: ${review.person.name.trim()}`,
    });
  }

  if (review.account?.required && review.account.mode === 'create' && review.account.name?.trim()) {
    const includeInTotal = isManagedPurpose(review.purpose) ? false : review.account.includeInTotal !== false;
    syntheticActions.push({
      actionType: 'create_account',
      accountName: review.account.name.trim(),
      accountType: review.account.type || inferAccountType(review.account.name),
      currency: sanitizeCurrency(review.account.currency || review.currency),
      openingBalance: 0,
      includeInTotal: includeInTotal,
      accountScope: review.account.scope,
      managedPersonId: review.account.managedPersonId,
      personName: review.account.managedPersonName,
      confidence: 1,
      warnings: [],
      description: `Create account: ${review.account.name.trim()}`,
    });
  }

  if (
    review.destinationAccount?.required &&
    review.destinationAccount.mode === 'create' &&
    review.destinationAccount.name?.trim()
  ) {
    syntheticActions.push({
      actionType: 'create_account',
      accountName: review.destinationAccount.name.trim(),
      accountType: review.destinationAccount.type || inferAccountType(review.destinationAccount.name),
      currency: sanitizeCurrency(review.destinationAccount.currency || review.currency),
      openingBalance: 0,
      includeInTotal: review.destinationAccount.includeInTotal !== false,
      accountScope: review.destinationAccount.scope,
      confidence: 1,
      warnings: [],
      description: `Create account: ${review.destinationAccount.name.trim()}`,
    });
  }

  const nextInstruction: ParsedFinancialInstruction = {
    ...instruction,
    actions: [...syntheticActions, ...transformedActions],
    missingFields: [...review.missing],
    requiresClarification: false,
    clarificationQuestions: [],
  };

  return nextInstruction;
}

export function getSmartEntryMissingFields(instruction: ParsedFinancialInstruction): SmartEntryMissingField[] {
  const review = instruction.review;
  if (!review) return [];
  const nextMissing = new Set<SmartEntryMissingField>(review.missing);

  if (!review.purpose && review.purposeOptions?.length) nextMissing.add('purpose');
  if (review.purpose === 'unclear') nextMissing.add('purpose');
  if (review.purposeNeedsConfirmation) nextMissing.add('purpose');
  if (!isResolvedPersonSelection(review.person)) nextMissing.add('person');
  if (!isResolvedAccountSelection(review.account)) nextMissing.add('account');
  if (!isResolvedAccountSelection(review.destinationAccount)) nextMissing.add('destinationAccount');
  if (nextMissing.has('amount') && typeof review.amount === 'number') nextMissing.delete('amount');
  if (nextMissing.has('currency') && review.currency) nextMissing.delete('currency');
  if (nextMissing.has('purpose') && review.purpose && review.purpose !== 'unclear' && !review.purposeNeedsConfirmation) nextMissing.delete('purpose');
  if (nextMissing.has('person') && isResolvedPersonSelection(review.person)) nextMissing.delete('person');
  if (nextMissing.has('account') && isResolvedAccountSelection(review.account)) nextMissing.delete('account');
  if (nextMissing.has('destinationAccount') && isResolvedAccountSelection(review.destinationAccount)) {
    nextMissing.delete('destinationAccount');
  }

  return Array.from(nextMissing);
}

export function getCompactSummaryRows(instruction: ParsedFinancialInstruction) {
  return instruction.actions
    .filter((action) => action.actionType !== 'create_account' && action.actionType !== 'create_managed_person')
    .map((action) => {
      const amount = typeof action.amount === 'number'
        ? formatSmartEntryMoney(action.amount, action.currency, instruction.review?.currency)
        : 'Amount needed';

      switch (action.actionType) {
        case 'income':
          return `+ ${amount} received`;
        case 'loan_received':
          return `+ ${amount} borrowed from ${action.personName || 'someone'}`;
        case 'money_received_from_person':
          return `+ ${amount} received from ${action.personName || 'someone'}`;
        case 'expense':
          return `- ${amount}${action.categoryName ? ` ${action.categoryName}` : ''}`;
        case 'expense_from_held_balance':
          return `- ${amount}${action.categoryName ? ` ${action.categoryName}` : ''}`;
        case 'loan_repayment':
          return `- ${amount} paid back to ${action.personName || 'someone'}`;
        case 'reimbursement_payment':
          return `+ ${amount} reimbursed by ${action.personName || 'someone'}`;
        case 'money_returned_to_person':
          return `- ${amount} returned to ${action.personName || 'someone'}`;
        case 'transfer':
          return `${amount} moved from ${action.accountName || 'one account'} to ${action.destinationAccountName || 'another account'}`;
        default:
          return action.description || `${action.actionType} ${amount}`;
      }
    });
}

export function getSmartEntryTotals(instruction: ParsedFinancialInstruction) {
  const purpose = instruction.review?.purpose;
  const totalReceived = instruction.actions.reduce((sum, action) => {
    if (['income', 'loan_received', 'money_received_from_person'].includes(action.actionType) && typeof action.amount === 'number') {
      return sum + action.amount;
    }
    return sum;
  }, 0);
  const totalSpent = instruction.actions.reduce((sum, action) => {
    if (['expense', 'expense_from_held_balance', 'loan_repayment', 'money_returned_to_person'].includes(action.actionType) && typeof action.amount === 'number') {
      return sum + action.amount;
    }
    return sum;
  }, 0);
  const net = totalReceived - totalSpent;
  const loanAmount = instruction.actions.reduce((sum, action) => {
    if (action.actionType === 'loan_received' && typeof action.amount === 'number') return sum + action.amount;
    if (action.actionType === 'loan_repayment' && typeof action.amount === 'number') return sum - action.amount;
    return sum;
  }, 0);

  return {
    purpose,
    totalReceived,
    totalSpent,
    net,
    loanAmount,
  };
}
