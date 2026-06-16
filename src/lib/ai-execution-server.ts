import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExecutionResult,
  ExecutedAction,
  FailedAction,
  FinancialAction,
  ParsedFinancialInstruction,
} from '@/lib/ai-types';

type AccountType =
  | 'bank'
  | 'credit_card'
  | 'cash'
  | 'savings'
  | 'digital_wallet'
  | 'investment'
  | 'other';

type RelationshipType =
  | 'spouse'
  | 'child'
  | 'parent'
  | 'sibling'
  | 'friend'
  | 'relative'
  | 'colleague'
  | 'client'
  | 'other';

type PersonLedgerEntryType =
  | 'money_received'
  | 'money_returned'
  | 'expense_from_held'
  | 'expense_paid_by_user'
  | 'expense_paid_by_person'
  | 'reimbursement_due_to_user'
  | 'reimbursement_due_to_person'
  | 'reimbursement_received'
  | 'reimbursement_paid'
  | 'settlement'
  | 'adjustment';

interface ServerAccount {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  currency: string;
  opening_balance: number;
  current_balance: number;
  include_in_total: boolean;
  is_active: boolean;
}

interface ServerCategory {
  id: string;
  user_id: string | null;
  name: string;
  category_type: 'income' | 'expense' | 'transfer';
  is_system: boolean;
}

interface ServerPerson {
  id: string;
  owner_id: string;
  full_name: string;
  relationship: RelationshipType;
  preferred_currency: string;
  is_active: boolean;
  is_archived: boolean;
  money_held?: number;
  person_owes_user?: number;
  user_owes_person?: number;
  total_received?: number;
  total_returned?: number;
  total_expenses?: number;
}

interface PersonBalanceRow {
  person_id: string;
  owner_id: string;
  full_name: string;
  preferred_currency: string;
  total_received: number | string;
  total_returned: number | string;
  total_expenses: number | string;
  money_held: number | string;
  person_owes_user: number | string;
  user_owes_person: number | string;
}

export interface ServerExecutionContext {
  accounts: ServerAccount[];
  categories: ServerCategory[];
  people: ServerPerson[];
}

export interface AccountSuggestion {
  name: string;
  type: AccountType;
  currency: string;
  openingBalance: number;
  includeInTotal: boolean;
}

export interface ExecutionClarification {
  status: 'clarification_required';
  code: 'account_missing' | 'person_missing' | 'invalid_action';
  message: string;
  question?: string;
  actionIndex: number;
  field?: 'account' | 'destinationAccount' | 'person';
  suggestedAccount?: AccountSuggestion;
  existingAccounts?: Array<{ id: string; name: string; type: AccountType; currency: string }>;
  suggestedPerson?: { name: string; relationship: RelationshipType };
}

export interface ExecutionResultWithClarification extends ExecutionResult {
  clarification?: ExecutionClarification;
}

export interface ExecuteConfirmedActionsServerArgs {
  instruction: ParsedFinancialInstruction;
  userId: string;
  supabase: SupabaseClient;
  context: ServerExecutionContext;
}

class ContextLoadError extends Error {}

export class ExecutionClarificationError extends Error {
  clarification: ExecutionClarification;

  constructor(clarification: ExecutionClarification) {
    super(clarification.message);
    this.name = 'ExecutionClarificationError';
    this.clarification = clarification;
  }
}

class InvalidExecutionActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidExecutionActionError';
  }
}

export async function loadExecutionContextServer(args: {
  userId: string;
  supabase: SupabaseClient;
  instruction?: ParsedFinancialInstruction;
}): Promise<ServerExecutionContext> {
  const needsPersonBalances = instructionNeedsPersonBalances(args.instruction);

  const [accountsResult, categoriesResult, peopleResult, balancesResult] = await Promise.all([
    args.supabase
      .from('financial_accounts')
      .select('id, user_id, name, account_type, currency, opening_balance, current_balance, include_in_total, is_active')
      .eq('user_id', args.userId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    args.supabase
      .from('categories')
      .select('id, user_id, name, category_type, is_system')
      .or(`user_id.eq.${args.userId},user_id.is.null,is_system.eq.true`)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    args.supabase
      .from('managed_people')
      .select('id, owner_id, full_name, relationship, preferred_currency, is_active, is_archived')
      .eq('owner_id', args.userId)
      .eq('is_archived', false)
      .order('full_name', { ascending: true }),
    needsPersonBalances
      ? args.supabase
          .from('person_balances')
          .select('*')
          .eq('owner_id', args.userId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (accountsResult.error) {
    throw new ContextLoadError('Failed to load accounts');
  }
  if (categoriesResult.error) {
    throw new ContextLoadError('Failed to load categories');
  }
  if (peopleResult.error) {
    throw new ContextLoadError('Failed to load people');
  }
  if (balancesResult.error) {
    throw new ContextLoadError('Failed to load person balances');
  }

  const balanceMap = new Map(
    ((balancesResult.data || []) as PersonBalanceRow[]).map((row) => [
      row.person_id,
      {
        money_held: Number(row.money_held || 0),
        person_owes_user: Number(row.person_owes_user || 0),
        user_owes_person: Number(row.user_owes_person || 0),
        total_received: Number(row.total_received || 0),
        total_returned: Number(row.total_returned || 0),
        total_expenses: Number(row.total_expenses || 0),
      },
    ])
  );

  const people = ((peopleResult.data || []) as ServerPerson[]).map((person) => ({
    ...person,
    ...(balanceMap.get(person.id) || {}),
  }));

  return {
    accounts: (accountsResult.data || []) as ServerAccount[],
    categories: (categoriesResult.data || []) as ServerCategory[],
    people,
  };
}

export async function executeConfirmedActionsServer(
  args: ExecuteConfirmedActionsServerArgs
): Promise<ExecutionResultWithClarification> {
  const executedActions: ExecutedAction[] = [];
  const failedActions: FailedAction[] = [];

  for (let index = 0; index < args.instruction.actions.length; index += 1) {
    const action = args.instruction.actions[index];

    try {
      const result = await executeActionServer({
        action,
        index,
        userId: args.userId,
        supabase: args.supabase,
        context: args.context,
      });
      executedActions.push(result);
    } catch (error) {
      if (error instanceof ExecutionClarificationError) {
        failedActions.push({
          actionIndex: index,
          actionType: action.actionType,
          error: error.clarification.message,
        });
        return {
          success: false,
          executedActions,
          failedActions,
          partialSuccess: executedActions.length > 0,
          clarification: error.clarification,
        };
      }

      const message = getSafeExecutionErrorMessage(error);
      failedActions.push({
        actionIndex: index,
        actionType: action.actionType,
        error: message,
      });

      if (args.instruction.actions.length > 1) {
        break;
      }
    }
  }

  return {
    success: failedActions.length === 0,
    executedActions,
    failedActions,
    partialSuccess: executedActions.length > 0 && failedActions.length > 0,
  };
}

async function executeActionServer(args: {
  action: FinancialAction;
  index: number;
  userId: string;
  supabase: SupabaseClient;
  context: ServerExecutionContext;
}): Promise<ExecutedAction> {
  const { action, index, userId, supabase, context } = args;
  const today = new Date().toISOString().slice(0, 10);
  const date = !action.date || action.date === 'today' ? today : action.date;
  const currency = sanitizeCurrency(action.currency || 'AED');
  const amount = Number(action.amount ?? 0);

  if (Number.isNaN(amount) || amount < 0) {
    throw new InvalidExecutionActionError('Invalid amount');
  }

  switch (action.actionType) {
    case 'create_account': {
      const account = await createAccountServer(
        {
          name: (action.accountName || '').trim(),
          account_type: action.accountType || inferAccountType(action.accountName),
          currency,
          opening_balance: Number(action.openingBalance ?? 0),
          include_in_total: action.includeInTotal !== false,
        },
        userId,
        supabase
      );
      context.accounts.push(account);
      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: account.id,
        recordTable: 'financial_accounts',
      };
    }

    case 'income':
    case 'expense': {
      const account = requireAccountResolution({
        action,
        actionIndex: index,
        field: 'account',
        context,
      });
      const category = resolveCategory(action.categoryId, action.categoryName, context.categories);

      const transaction = await createTransactionServer(
        {
          account_id: account.id,
          category_id: category?.id || null,
          transaction_type: action.actionType,
          amount,
          currency,
          description: action.description || action.categoryName || action.actionType,
          merchant: action.merchant || null,
          notes: action.notes || null,
          transaction_date: date,
          person_id: action.personId || null,
          expense_owner: action.expenseOwner || 'user',
          paid_by: action.paidBy || 'user',
          paid_from: action.paidFrom || 'account',
          reimbursement_required: action.reimbursementRequired || false,
          reimbursement_status: action.reimbursementStatus || null,
        },
        userId,
        supabase
      );

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: transaction.id,
        recordTable: 'transactions',
      };
    }

    case 'transfer': {
      const fromAccount = requireAccountResolution({
        action,
        actionIndex: index,
        field: 'account',
        context,
      });
      const toAccount = requireAccountResolution({
        action,
        actionIndex: index,
        field: 'destinationAccount',
        context,
      });

      if (fromAccount.id === toAccount.id) {
        throw new InvalidExecutionActionError('Source and destination accounts must be different');
      }

      const transfer = await createTransferServer(
        {
          from_account_id: fromAccount.id,
          to_account_id: toAccount.id,
          amount,
          currency,
          description: action.description || 'Transfer',
          transfer_date: date,
          notes: action.notes || null,
        },
        userId,
        supabase
      );

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: transfer.id,
        recordTable: 'transfers',
      };
    }

    case 'money_received_from_person': {
      const person = await requirePersonResolution({ action, actionIndex: index, context });
      const entry = await addLedgerEntryServer(
        {
          person_id: person.id,
          entry_type: 'money_received',
          amount,
          currency,
          description: action.description || `Money received from ${person.full_name}`,
          entry_date: date,
          transaction_id: null,
          notes: action.notes || null,
        },
        userId,
        supabase
      );

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: entry.id,
        recordTable: 'person_ledger_entries',
      };
    }

    case 'money_returned_to_person': {
      const person = await requirePersonResolution({ action, actionIndex: index, context });
      const entry = await addLedgerEntryServer(
        {
          person_id: person.id,
          entry_type: 'money_returned',
          amount,
          currency,
          description: action.description || `Money returned to ${person.full_name}`,
          entry_date: date,
          transaction_id: null,
          notes: action.notes || null,
        },
        userId,
        supabase
      );

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: entry.id,
        recordTable: 'person_ledger_entries',
      };
    }

    case 'expense_from_held_balance': {
      const person = await requirePersonResolution({ action, actionIndex: index, context });
      const entry = await addLedgerEntryServer(
        {
          person_id: person.id,
          entry_type: 'expense_from_held',
          amount,
          currency,
          description: action.description || action.categoryName || 'Expense from held balance',
          entry_date: date,
          transaction_id: null,
          notes: action.notes || null,
        },
        userId,
        supabase
      );

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: entry.id,
        recordTable: 'person_ledger_entries',
      };
    }

    case 'expense_paid_for_person': {
      const person = await requirePersonResolution({ action, actionIndex: index, context });
      const account = requireAccountResolution({
        action,
        actionIndex: index,
        field: 'account',
        context,
      });
      const category = resolveCategory(action.categoryId, action.categoryName, context.categories);

      const transaction = await createTransactionServer(
        {
          account_id: account.id,
          category_id: category?.id || null,
          transaction_type: 'expense',
          amount,
          currency,
          description: action.description || `Paid for ${person.full_name}`,
          merchant: action.merchant || null,
          notes: action.notes || null,
          transaction_date: date,
          person_id: person.id,
          expense_owner: 'person',
          paid_by: 'user',
          paid_from: action.paidFrom || 'account',
          reimbursement_required: action.reimbursementRequired !== false,
          reimbursement_status: action.reimbursementRequired === false ? null : 'pending',
        },
        userId,
        supabase
      );

      let recordId = transaction.id;
      let recordTable = 'transactions';

      if (action.reimbursementRequired !== false) {
        const reimbursement = await createReimbursementServer(
          {
            person_id: person.id,
            transaction_id: transaction.id,
            amount,
            currency,
            owed_by: 'person',
            owed_to: 'user',
            description: action.description || `Paid for ${person.full_name}`,
            notes: action.notes || null,
          },
          userId,
          supabase
        );
        recordId = reimbursement.id;
        recordTable = 'reimbursements';

        await addLedgerEntryServer(
          {
            person_id: person.id,
            entry_type: 'expense_paid_by_user',
            amount,
            currency,
            description: action.description || `Paid for ${person.full_name}`,
            entry_date: date,
            transaction_id: transaction.id,
            notes: action.notes || null,
            reference_id: reimbursement.id,
            reference_type: 'reimbursement',
          },
          userId,
          supabase
        );
      }

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId,
        recordTable,
      };
    }

    case 'reimbursement_payment': {
      const person = await requirePersonResolution({ action, actionIndex: index, context });
      const reimbursement = await getPendingReimbursementForPersonServer(person.id, userId, supabase);
      if (!reimbursement) {
        throw new InvalidExecutionActionError(`No pending reimbursement found for ${person.full_name}`);
      }

      const payment = await recordReimbursementPaymentServer(
        reimbursement.id,
        {
          amount,
          payment_date: date,
          payment_method: action.accountName || 'cash',
          notes: action.notes || null,
        },
        userId,
        supabase
      );

      await addLedgerEntryServer(
        {
          person_id: person.id,
          entry_type: 'reimbursement_received',
          amount,
          currency,
          description: action.description || `Reimbursement received from ${person.full_name}`,
          entry_date: date,
          transaction_id: null,
          notes: action.notes || null,
          reference_id: reimbursement.id,
          reference_type: 'reimbursement',
        },
        userId,
        supabase
      );

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: payment.id,
        recordTable: 'reimbursement_payments',
      };
    }

    case 'settlement': {
      const person = await requirePersonResolution({ action, actionIndex: index, context });
      const account = action.accountName || action.accountId
        ? requireAccountResolution({
            action,
            actionIndex: index,
            field: 'account',
            context,
          })
        : null;

      const settlement = await createSettlementServer(
        {
          person_id: person.id,
          amount,
          currency,
          settlement_date: date,
          payment_method: action.accountName ? 'account' : 'cash',
          receiving_account_id: account?.id || null,
          description: action.description || `Settlement with ${person.full_name}`,
          notes: action.notes || null,
        },
        userId,
        supabase
      );

      await addLedgerEntryServer(
        {
          person_id: person.id,
          entry_type: 'settlement',
          amount,
          currency,
          description: action.description || `Settlement with ${person.full_name}`,
          entry_date: date,
          transaction_id: null,
          notes: action.notes || null,
          reference_id: settlement.id,
          reference_type: 'settlement',
        },
        userId,
        supabase
      );

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: settlement.id,
        recordTable: 'settlements',
      };
    }

    case 'budget': {
      const category = resolveCategory(action.categoryId, action.categoryName, context.categories);
      const budget = await createBudgetServer(
        {
          name: action.description || action.categoryName || 'Budget',
          category_id: category?.id || null,
          amount,
          currency,
          period: 'monthly',
          period_start: `${date.slice(0, 7)}-01`,
          alert_at_percent: 80,
          is_active: true,
        },
        userId,
        supabase
      );

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: budget.id,
        recordTable: 'budgets',
      };
    }

    case 'recurring_transaction': {
      const account = requireAccountResolution({
        action,
        actionIndex: index,
        field: 'account',
        context,
      });
      const category = resolveCategory(action.categoryId, action.categoryName, context.categories);
      const recurring = await createRecurringTransactionServer(
        {
          account_id: account.id,
          category_id: category?.id || null,
          transaction_type: inferRecurringTransactionType(action),
          amount,
          currency,
          description: action.description || action.categoryName || 'Recurring transaction',
          merchant: action.merchant || null,
          frequency: action.recurringFrequency || 'monthly',
          next_due_date: action.recurrenceStartDate || date,
          is_active: true,
          auto_create: false,
        },
        userId,
        supabase
      );

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: recurring.id,
        recordTable: 'recurring_transactions',
      };
    }

    case 'create_managed_person': {
      const person = await createManagedPersonServer(
        {
          full_name: (action.personName || '').trim(),
          relationship: action.relationship || 'other',
          preferred_currency: currency,
          notes: action.notes || null,
        },
        userId,
        supabase
      );
      context.people.push(person);
      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: person.id,
        recordTable: 'managed_people',
      };
    }

    default:
      throw new InvalidExecutionActionError(`Unsupported action type: ${action.actionType}`);
  }
}

export function getSafeExecutionErrorMessage(error: unknown): string {
  if (error instanceof InvalidExecutionActionError) {
    return error.message;
  }
  if (error instanceof ContextLoadError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Execution failed';
}

export function isContextLoadError(error: unknown): boolean {
  return error instanceof ContextLoadError;
}

function instructionNeedsPersonBalances(instruction?: ParsedFinancialInstruction): boolean {
  if (!instruction) return false;
  return instruction.actions.some((action) =>
    [
      'money_received_from_person',
      'money_returned_to_person',
      'expense_from_held_balance',
      'expense_paid_for_person',
      'reimbursement_payment',
      'settlement',
      'create_managed_person',
    ].includes(action.actionType)
  );
}

function normalizeName(value: string | undefined): string {
  return (value || '').trim().toLowerCase();
}

function sanitizeCurrency(value: string): string {
  const currency = value.trim().toUpperCase().replace(/[^A-Z]/g, '');
  return currency.length === 3 ? currency : 'AED';
}

function inferAccountType(name?: string): AccountType {
  const value = normalizeName(name);
  if (value.includes('cash')) return 'cash';
  if (value.includes('credit')) return 'credit_card';
  if (value.includes('saving')) return 'savings';
  if (value.includes('wallet')) return 'digital_wallet';
  if (value.includes('invest')) return 'investment';
  if (value.includes('bank')) return 'bank';
  return 'other';
}

function resolveAccountByIdOrName(
  id: string | undefined,
  name: string | undefined,
  accounts: ServerAccount[]
): ServerAccount | null {
  if (id) {
    const byId = accounts.find((account) => account.id === id);
    if (byId) return byId;
  }

  const normalized = normalizeName(name);
  if (!normalized) return null;

  return (
    accounts.find((account) => normalizeName(account.name) === normalized) ||
    accounts.find((account) => normalizeName(account.name).includes(normalized)) ||
    accounts.find((account) => normalized.includes(normalizeName(account.name))) ||
    null
  );
}

function resolveCategory(
  id: string | undefined,
  name: string | undefined,
  categories: ServerCategory[]
): ServerCategory | null {
  if (id) {
    const byId = categories.find((category) => category.id === id);
    if (byId) return byId;
  }

  const normalized = normalizeName(name);
  if (!normalized) return null;

  return (
    categories.find((category) => normalizeName(category.name) === normalized) ||
    categories.find((category) => normalizeName(category.name).includes(normalized)) ||
    categories.find((category) => normalized.includes(normalizeName(category.name))) ||
    null
  );
}

function resolvePersonByIdOrName(
  id: string | undefined,
  name: string | undefined,
  people: ServerPerson[]
): ServerPerson | null {
  if (id) {
    const byId = people.find((person) => person.id === id);
    if (byId) return byId;
  }

  const normalized = normalizeName(name);
  if (!normalized) return null;

  return (
    people.find((person) => normalizeName(person.full_name) === normalized) ||
    people.find((person) => normalizeName(person.full_name).includes(normalized)) ||
    people.find((person) => normalized.includes(normalizeName(person.full_name))) ||
    null
  );
}

function requireAccountResolution(args: {
  action: FinancialAction;
  actionIndex: number;
  field: 'account' | 'destinationAccount';
  context: ServerExecutionContext;
}): ServerAccount {
  const accountName = args.field === 'account' ? args.action.accountName : args.action.destinationAccountName;
  const accountId = args.field === 'account' ? args.action.accountId : args.action.destinationAccountId;
  const resolved = resolveAccountByIdOrName(accountId, accountName, args.context.accounts);
  if (resolved) return resolved;

  const suggestedName = (accountName || 'Cash').trim() || 'Cash';
  const suggestedAccount: AccountSuggestion = {
    name: toTitleCase(suggestedName),
    type: inferAccountType(suggestedName),
    currency: sanitizeCurrency(args.action.currency || 'AED'),
    openingBalance: 0,
    includeInTotal: true,
  };

  const existingAccounts = args.context.accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.account_type,
    currency: account.currency,
  }));

  const noAccounts = existingAccounts.length === 0;
  const message = noAccounts
    ? `You do not have a ${suggestedAccount.name} account yet. At least one account is required before recording this transaction.`
    : `You do not have a matching ${suggestedAccount.name} account yet.`;

  throw new ExecutionClarificationError({
    status: 'clarification_required',
    code: 'account_missing',
    message,
    question: 'Would you like me to create one?',
    actionIndex: args.actionIndex,
    field: args.field,
    suggestedAccount,
    existingAccounts,
  });
}

async function requirePersonResolution(args: {
  action: FinancialAction;
  actionIndex: number;
  context: ServerExecutionContext;
}): Promise<ServerPerson> {
  const person = resolvePersonByIdOrName(args.action.personId, args.action.personName, args.context.people);
  if (person) return person;

  throw new ExecutionClarificationError({
    status: 'clarification_required',
    code: 'person_missing',
    message: `You do not have a matching managed person for ${args.action.personName || 'this entry'} yet.`,
    question: 'Would you like me to create one?',
    actionIndex: args.actionIndex,
    field: 'person',
    suggestedPerson: {
      name: (args.action.personName || 'New Person').trim() || 'New Person',
      relationship: 'other',
    },
  });
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function inferRecurringTransactionType(action: FinancialAction): 'income' | 'expense' {
  return action.expenseOwner === 'person' ? 'expense' : action.actionType === 'income' ? 'income' : 'expense';
}

async function createAccountServer(
  payload: {
    name: string;
    account_type: AccountType;
    currency: string;
    opening_balance: number;
    include_in_total: boolean;
  },
  userId: string,
  supabase: SupabaseClient
): Promise<ServerAccount> {
  if (!payload.name.trim()) {
    throw new InvalidExecutionActionError('Account name is required');
  }

  const { data, error } = await supabase
    .from('financial_accounts')
    .insert({
      user_id: userId,
      name: payload.name.trim(),
      account_type: payload.account_type,
      currency: payload.currency,
      opening_balance: payload.opening_balance,
      current_balance: payload.opening_balance,
      include_in_total: payload.include_in_total,
      is_active: true,
    })
    .select('id, user_id, name, account_type, currency, opening_balance, current_balance, include_in_total, is_active')
    .single();

  if (error || !data) {
    throw new Error('Failed to create account');
  }

  return data as ServerAccount;
}

async function recalculateAccountBalanceServer(
  accountId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<number> {
  const [accountResult, incomeResult, expenseResult, transferInResult, transferOutResult] = await Promise.all([
    supabase
      .from('financial_accounts')
      .select('opening_balance')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single(),
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('transaction_type', 'income'),
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .eq('transaction_type', 'expense'),
    supabase
      .from('transfers')
      .select('amount')
      .eq('user_id', userId)
      .eq('to_account_id', accountId),
    supabase
      .from('transfers')
      .select('amount')
      .eq('user_id', userId)
      .eq('from_account_id', accountId),
  ]);

  if (accountResult.error || !accountResult.data) {
    throw new Error('Failed to load account balance');
  }
  if (incomeResult.error || expenseResult.error || transferInResult.error || transferOutResult.error) {
    throw new Error('Failed to recalculate account balance');
  }

  const sumAmount = (rows: Array<{ amount: number | string }> | null) =>
    (rows || []).reduce((sum, row) => sum + Number(row.amount), 0);

  const newBalance =
    Number(accountResult.data.opening_balance || 0) +
    sumAmount(incomeResult.data as Array<{ amount: number | string }> | null) -
    sumAmount(expenseResult.data as Array<{ amount: number | string }> | null) +
    sumAmount(transferInResult.data as Array<{ amount: number | string }> | null) -
    sumAmount(transferOutResult.data as Array<{ amount: number | string }> | null);

  const { error: updateError } = await supabase
    .from('financial_accounts')
    .update({ current_balance: newBalance })
    .eq('id', accountId)
    .eq('user_id', userId);

  if (updateError) {
    throw new Error('Failed to update account balance');
  }

  return newBalance;
}

async function createTransactionServer(
  payload: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...payload, user_id: userId })
    .select('id, account_id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create transaction');
  }

  await recalculateAccountBalanceServer(String(data.account_id), userId, supabase);
  return data;
}

async function createTransferServer(
  payload: {
    from_account_id: string;
    to_account_id: string;
    amount: number;
    currency: string;
    description: string;
    transfer_date: string;
    notes: string | null;
  },
  userId: string,
  supabase: SupabaseClient
) {
  const { data: fromTransaction, error: fromError } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: payload.from_account_id,
      transaction_type: 'transfer',
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description || 'Transfer out',
      transaction_date: payload.transfer_date,
      notes: payload.notes,
    })
    .select('id')
    .single();

  if (fromError || !fromTransaction) {
    throw new Error('Failed to create transfer source transaction');
  }

  const { data: toTransaction, error: toError } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: payload.to_account_id,
      transaction_type: 'transfer',
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description || 'Transfer in',
      transaction_date: payload.transfer_date,
      notes: payload.notes,
      transfer_pair_id: fromTransaction.id,
    })
    .select('id')
    .single();

  if (toError || !toTransaction) {
    throw new Error('Failed to create transfer destination transaction');
  }

  await supabase
    .from('transactions')
    .update({ transfer_pair_id: toTransaction.id })
    .eq('id', fromTransaction.id)
    .eq('user_id', userId);

  const { data: transfer, error: transferError } = await supabase
    .from('transfers')
    .insert({
      user_id: userId,
      from_account_id: payload.from_account_id,
      to_account_id: payload.to_account_id,
      from_transaction_id: fromTransaction.id,
      to_transaction_id: toTransaction.id,
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description,
      transfer_date: payload.transfer_date,
      notes: payload.notes,
    })
    .select('id')
    .single();

  if (transferError || !transfer) {
    throw new Error('Failed to create transfer');
  }

  await Promise.all([
    recalculateAccountBalanceServer(payload.from_account_id, userId, supabase),
    recalculateAccountBalanceServer(payload.to_account_id, userId, supabase),
  ]);

  return transfer;
}

async function createBudgetServer(
  payload: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('budgets')
    .insert({ ...payload, user_id: userId, created_by: userId })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create budget');
  }

  return data;
}

async function createRecurringTransactionServer(
  payload: Record<string, unknown>,
  userId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({ ...payload, user_id: userId })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create recurring transaction');
  }

  return data;
}

async function createManagedPersonServer(
  payload: {
    full_name: string;
    relationship: RelationshipType;
    preferred_currency: string;
    notes: string | null;
  },
  userId: string,
  supabase: SupabaseClient
): Promise<ServerPerson> {
  if (!payload.full_name.trim()) {
    throw new InvalidExecutionActionError('Person name is required');
  }

  const { data, error } = await supabase
    .from('managed_people')
    .insert({
      owner_id: userId,
      full_name: payload.full_name.trim(),
      relationship: payload.relationship,
      preferred_currency: payload.preferred_currency,
      notes: payload.notes,
      is_active: true,
      is_archived: false,
    })
    .select('id, owner_id, full_name, relationship, preferred_currency, is_active, is_archived')
    .single();

  if (error || !data) {
    throw new Error('Failed to create managed person');
  }

  return data as ServerPerson;
}

async function addLedgerEntryServer(
  payload: {
    person_id: string;
    entry_type: PersonLedgerEntryType;
    amount: number;
    currency: string;
    description: string;
    transaction_id?: string | null;
    reference_id?: string | null;
    reference_type?: string | null;
    notes?: string | null;
    entry_date: string;
  },
  userId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('person_ledger_entries')
    .insert({
      ...payload,
      owner_id: userId,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create person ledger entry');
  }

  return data;
}

async function createReimbursementServer(
  payload: {
    person_id: string;
    transaction_id?: string | null;
    amount: number;
    currency: string;
    owed_by: 'person' | 'user';
    owed_to: 'person' | 'user';
    description: string;
    notes: string | null;
  },
  userId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('reimbursements')
    .insert({
      ...payload,
      owner_id: userId,
      created_by: userId,
      status: 'pending',
      amount_paid: 0,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create reimbursement');
  }

  return data;
}

async function getPendingReimbursementForPersonServer(
  personId: string,
  userId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('reimbursements')
    .select('id, amount, amount_paid, currency')
    .eq('owner_id', userId)
    .eq('person_id', personId)
    .in('status', ['pending', 'partially_paid'])
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error('Failed to load reimbursement');
  }

  return data;
}

async function recordReimbursementPaymentServer(
  reimbursementId: string,
  payload: {
    amount: number;
    payment_date: string;
    payment_method: string;
    notes: string | null;
  },
  userId: string,
  supabase: SupabaseClient
) {
  const { data: reimbursement, error: reimbursementError } = await supabase
    .from('reimbursements')
    .select('id, amount, amount_paid, currency')
    .eq('id', reimbursementId)
    .eq('owner_id', userId)
    .single();

  if (reimbursementError || !reimbursement) {
    throw new Error('Failed to load reimbursement');
  }

  const { data: payment, error: paymentError } = await supabase
    .from('reimbursement_payments')
    .insert({
      reimbursement_id: reimbursementId,
      owner_id: userId,
      created_by: userId,
      amount: payload.amount,
      currency: reimbursement.currency,
      payment_date: payload.payment_date,
      payment_method: payload.payment_method,
      notes: payload.notes,
    })
    .select('id')
    .single();

  if (paymentError || !payment) {
    throw new Error('Failed to record reimbursement payment');
  }

  const newAmountPaid = Number(reimbursement.amount_paid || 0) + payload.amount;
  const newStatus = newAmountPaid >= Number(reimbursement.amount) ? 'settled' : 'partially_paid';

  const { error: updateError } = await supabase
    .from('reimbursements')
    .update({
      amount_paid: newAmountPaid,
      status: newStatus,
    })
    .eq('id', reimbursementId)
    .eq('owner_id', userId);

  if (updateError) {
    throw new Error('Failed to update reimbursement status');
  }

  return payment;
}

async function createSettlementServer(
  payload: {
    person_id: string;
    amount: number;
    currency: string;
    settlement_date: string;
    payment_method: string;
    receiving_account_id: string | null;
    description: string;
    notes: string | null;
  },
  userId: string,
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from('settlements')
    .insert({
      ...payload,
      owner_id: userId,
      created_by: userId,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create settlement');
  }

  return data;
}
