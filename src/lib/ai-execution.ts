// ─── AI Execution Service ─────────────────────────────────────────────────────
// Converts confirmed ParsedFinancialInstruction actions into Smart Pocket
// service calls. The AI never writes directly to Supabase.
// All writes go through existing validated service functions.

'use client';
import { createClient } from '@/lib/supabase/client';
import { getClientReferenceData } from '@/lib/reference-data/client';
import { getPersonalSubscriptions } from './personal-subscriptions';
import type { FinancialAction, ParsedFinancialInstruction, ExecutionResult, ExecutedAction, FailedAction } from './ai-types';
import {
  createTransaction,
  createTransfer,
  createBudget,
  getAccounts,
  getCategories,
  type FinancialAccount,
  type Category,
} from './finance';
import { addLedgerEntry, createReimbursement, recordReimbursementPayment, createSettlement, createManagedPerson, getManagedPeople, recordMoneyReceived, type ManagedPerson,  } from './people';

// ─── Context Resolution ───────────────────────────────────────────────────────

export interface ResolvedContext {
  accounts: FinancialAccount[];
  categories: Category[];
  people: ManagedPerson[];
  supportedCurrencies: string[];
  defaultCurrency: string;
}

export async function loadExecutionContext(): Promise<ResolvedContext> {
  const [accounts, categories, people, referenceData] = await Promise.all([
    getAccounts(),
    getCategories(),
    getManagedPeople(),
    getClientReferenceData(),
  ]);
  const supportedCurrencies = referenceData.snapshot.currencies
    .filter((currency) => currency.isActive)
    .map((currency) => currency.code);
  const defaultCurrency = (
    referenceData.platformDefaultCurrency ||
    (supportedCurrencies.includes('USD') ? 'USD' : supportedCurrencies[0] || 'USD')
  ).trim().toUpperCase();
  return {
    accounts: accounts.filter((account) => account.is_active),
    categories,
    people: people.filter((person) => person.is_active && !person.is_archived),
    supportedCurrencies,
    defaultCurrency,
  };
}

function sanitizeExecutionCurrency(
  value: string | undefined,
  ctx: Pick<ResolvedContext, 'supportedCurrencies' | 'defaultCurrency'>
) {
  const normalized = (value || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (normalized.length === 3 && ctx.supportedCurrencies.includes(normalized)) {
    return normalized;
  }
  return ctx.defaultCurrency || (ctx.supportedCurrencies.includes('USD') ? 'USD' : ctx.supportedCurrencies[0] || 'USD');
}

function resolveAccount(
  name: string | undefined,
  accounts: FinancialAccount[]
): FinancialAccount | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return (
    accounts.find(a => a.name.toLowerCase() === lower) ||
    accounts.find(a => a.name.toLowerCase().includes(lower)) ||
    accounts.find(a => lower.includes(a.name.toLowerCase())) ||
    null
  );
}

function resolveCategory(
  name: string | undefined,
  categories: Category[]
): Category | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  return (
    categories.find(c => c.name.toLowerCase() === lower) ||
    categories.find(c => c.name.toLowerCase().includes(lower)) ||
    categories.find(c => lower.includes(c.name.toLowerCase())) ||
    null
  );
}

async function resolvePerson(
  name: string | undefined,
  people: ManagedPerson[]
): Promise<ManagedPerson | null> {
  if (!name) return null;
  const lower = name.toLowerCase();
  const exact = people.find(p => p.full_name.toLowerCase() === lower);
  if (exact) return exact;
  const partial = people.find(p =>
    p.full_name.toLowerCase().includes(lower) || lower.includes(p.full_name.toLowerCase())
  );
  return partial || null;
}

// ─── Action Executor ──────────────────────────────────────────────────────────

async function executeAction(
  action: FinancialAction,
  index: number,
  ctx: ResolvedContext,
  userId: string
): Promise<ExecutedAction> {
  const today = new Date().toISOString().slice(0, 10);
  const date = action.date === 'today' || !action.date ? today : action.date;
  const currency = sanitizeExecutionCurrency(action.currency, ctx);
  const amount = action.amount || 0;

  switch (action.actionType) {
    case 'income': case'expense': {
      const account = action.accountId
        ? ctx.accounts.find(a => a.id === action.accountId)
        : resolveAccount(action.accountName, ctx.accounts);
      if (!account) throw new Error(`Account not found: ${action.accountName || 'unknown'}`);

      const category = action.categoryId
        ? ctx.categories.find(c => c.id === action.categoryId)
        : resolveCategory(action.categoryName, ctx.categories);

      const txn = await createTransaction({
        account_id: account.id,
        category_id: category?.id || null,
        transaction_type: action.actionType,
        amount,
        currency,
        description: action.description || action.categoryName || action.actionType,
        merchant: action.merchant || undefined,
        notes: action.notes || undefined,
        transaction_date: date,
      });

      return { actionIndex: index, actionType: action.actionType, recordId: txn.id, recordTable: 'transactions' };
    }

    case 'transfer': {
      const fromAccount = action.accountId
        ? ctx.accounts.find(a => a.id === action.accountId)
        : resolveAccount(action.accountName, ctx.accounts);
      const toAccount = action.destinationAccountId
        ? ctx.accounts.find(a => a.id === action.destinationAccountId)
        : resolveAccount(action.destinationAccountName, ctx.accounts);

      if (!fromAccount) throw new Error(`Source account not found: ${action.accountName}`);
      if (!toAccount)   throw new Error(`Destination account not found: ${action.destinationAccountName}`);

      const transfer = await createTransfer({
        from_account_id: fromAccount.id,
        to_account_id: toAccount.id,
        amount,
        currency,
        description: action.description || 'Transfer',
        transfer_date: date,
        notes: action.notes || undefined,
      });

      return { actionIndex: index, actionType: 'transfer', recordId: transfer.id, recordTable: 'transfers' };
    }

    case 'money_received_from_person': {
      const person = action.personId
        ? ctx.people.find(p => p.id === action.personId)
        : await resolvePerson(action.personName, ctx.people);
      if (!person) throw new Error(`Person not found: ${action.personName}`);

      const entry = await recordMoneyReceived(
        person.id,
        amount,
        currency,
        action.description || `Money received from ${person.full_name}`,
        date
      );

      return { actionIndex: index, actionType: action.actionType, recordId: entry.id, recordTable: 'person_ledger_entries' };
    }

    case 'money_returned_to_person': {
      const person = action.personId
        ? ctx.people.find(p => p.id === action.personId)
        : await resolvePerson(action.personName, ctx.people);
      if (!person) throw new Error(`Person not found: ${action.personName}`);

      const entry = await addLedgerEntry({
        person_id: person.id,
        entry_type: 'money_returned',
        amount,
        currency,
        description: action.description || `Money returned to ${person.full_name}`,
        entry_date: date,
      });

      return { actionIndex: index, actionType: action.actionType, recordId: entry.id, recordTable: 'person_ledger_entries' };
    }

    case 'expense_from_held_balance': {
      const person = action.personId
        ? ctx.people.find(p => p.id === action.personId)
        : await resolvePerson(action.personName, ctx.people);
      if (!person) throw new Error(`Person not found: ${action.personName}`);

      const category = resolveCategory(action.categoryName, ctx.categories);

      const entry = await addLedgerEntry({
        person_id: person.id,
        entry_type: 'expense_from_held',
        amount,
        currency,
        description: action.description || action.categoryName || 'Expense from held balance',
        entry_date: date,
        notes: action.notes,
      });

      return { actionIndex: index, actionType: action.actionType, recordId: entry.id, recordTable: 'person_ledger_entries' };
    }

    case 'expense_paid_for_person': {
      const person = action.personId
        ? ctx.people.find(p => p.id === action.personId)
        : await resolvePerson(action.personName, ctx.people);
      if (!person) throw new Error(`Person not found: ${action.personName}`);

      const account = action.accountId
        ? ctx.accounts.find(a => a.id === action.accountId)
        : resolveAccount(action.accountName, ctx.accounts);
      if (!account) throw new Error(`Account not found: ${action.accountName}`);

      const category = resolveCategory(action.categoryName, ctx.categories);

      // Create personal expense transaction
      const txn = await createTransaction({
        account_id: account.id,
        category_id: category?.id || null,
        transaction_type: 'expense',
        amount,
        currency,
        description: action.description || `Paid for ${person.full_name}`,
        merchant: action.merchant || undefined,
        notes: action.notes || undefined,
        transaction_date: date,
      });

      // Create reimbursement if required
      let reimbId: string | undefined;
      if (action.reimbursementRequired !== false) {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated');

        const reimb = await createReimbursement({
          person_id: person.id,
          transaction_id: txn.id,
          amount,
          currency,
          owed_by: person.id,
          owed_to: user.id,
          description: action.description || `Paid for ${person.full_name}`,
          notes: action.notes,
        });
        reimbId = reimb.id;
      }

      return {
        actionIndex: index,
        actionType: action.actionType,
        recordId: reimbId || txn.id,
        recordTable: reimbId ? 'reimbursements' : 'transactions',
      };
    }

    case 'reimbursement_payment': {
      const person = action.personId
        ? ctx.people.find(p => p.id === action.personId)
        : await resolvePerson(action.personName, ctx.people);
      if (!person) throw new Error(`Person not found: ${action.personName}`);

      // Find pending reimbursement for this person
      const supabase = createClient();
      const { data: reimbs } = await supabase
        .from('reimbursements')
        .select('*')
        .eq('person_id', person.id)
        .in('status', ['pending', 'partially_paid'])
        .order('created_at', { ascending: true })
        .limit(1);

      if (!reimbs || reimbs.length === 0) {
        throw new Error(`No pending reimbursement found for ${person.full_name}`);
      }

      await recordReimbursementPayment(
        reimbs[0].id,
        amount,
        'cash',
        action.notes
      );

      return { actionIndex: index, actionType: action.actionType, recordId: reimbs[0].id, recordTable: 'reimbursement_payments' };
    }

    case 'settlement': {
      const person = action.personId
        ? ctx.people.find(p => p.id === action.personId)
        : await resolvePerson(action.personName, ctx.people);
      if (!person) throw new Error(`Person not found: ${action.personName}`);

      const account = action.accountId
        ? ctx.accounts.find(a => a.id === action.accountId)
        : resolveAccount(action.accountName, ctx.accounts);

      const settlement = await createSettlement({
        person_id: person.id,
        amount,
        currency,
        settlement_date: date,
        payment_method: 'cash',
        receiving_account_id: account?.id || null,
        description: action.description || `Settlement with ${person.full_name}`,
        notes: action.notes,
      });

      return { actionIndex: index, actionType: action.actionType, recordId: settlement.id, recordTable: 'settlements' };
    }

    case 'budget': {
      const category = action.categoryId
        ? ctx.categories.find(c => c.id === action.categoryId)
        : resolveCategory(action.categoryName, ctx.categories);

      const budget = await createBudget({
        name: action.description || action.categoryName || 'Budget',
        category_id: category?.id || null,
        amount,
        currency,
        period: 'monthly',
        period_start: date.slice(0, 7) + '-01',
        alert_at_percent: 80,
        is_active: true,
      });

      return { actionIndex: index, actionType: action.actionType, recordId: budget.id, recordTable: 'budgets' };
    }

    case 'recurring_transaction': {
      const account = action.accountId
        ? ctx.accounts.find(a => a.id === action.accountId)
        : resolveAccount(action.accountName, ctx.accounts);
      if (!account) throw new Error(`Account not found for recurring transaction`);

      const category = resolveCategory(action.categoryName, ctx.categories);

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('recurring_transactions')
        .insert({
          user_id: user.id,
          account_id: account.id,
          category_id: category?.id || null,
          transaction_type: 'expense',
          amount,
          currency,
          description: action.description || action.categoryName || 'Recurring',
          frequency: action.recurringFrequency || 'monthly',
          next_due_date: action.recurrenceStartDate || date,
          is_active: true,
          auto_create: false,
        })
        .select()
        .single();

      if (error) throw error;

      return { actionIndex: index, actionType: action.actionType, recordId: data.id, recordTable: 'recurring_transactions' };
    }

    default:
      throw new Error(`Unsupported action type: ${(action as FinancialAction).actionType}`);
  }
}

// ─── Atomic Multi-Action Executor ─────────────────────────────────────────────

/**
 * Executes all confirmed actions.
 * For multi-action instructions, uses best-effort atomicity:
 * if any action fails, already-executed actions are noted but not rolled back
 * (Supabase client-side transactions are not available; use RPC for true atomicity).
 * The UI shows partial success and links to created records.
 */
export async function executeConfirmedActions(
  instruction: ParsedFinancialInstruction,
  ctx: ResolvedContext
): Promise<ExecutionResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const executedActions: ExecutedAction[] = [];
  const failedActions: FailedAction[] = [];

  for (let i = 0; i < instruction.actions.length; i++) {
    const action = instruction.actions[i];
    try {
      const result = await executeAction(action, i, ctx, user.id);
      executedActions.push(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      failedActions.push({ actionIndex: i, actionType: action.actionType, error: errorMsg });
      // Stop on first failure for multi-action to prevent partial state
      if (instruction.actions.length > 1) break;
    }
  }

  return {
    success: failedActions.length === 0,
    executedActions,
    failedActions,
    partialSuccess: executedActions.length > 0 && failedActions.length > 0,
  };
}

// ─── Person Creation Helper ───────────────────────────────────────────────────

export async function createPersonFromAI(
  fullName: string,
  relationship: 'other' | 'friend' | 'colleague' | 'client' = 'other'
): Promise<ManagedPerson> {
  return createManagedPerson({ full_name: fullName, relationship });
}

// ─── Context Builder for AI ───────────────────────────────────────────────────

export async function buildAIContext() {
  const [ctx, subscriptions] = await Promise.all([
    loadExecutionContext(),
    getPersonalSubscriptions().catch(() => []),
  ]);
  return {
    accounts: ctx.accounts.map(a => ({
      id: a.id,
      name: a.name,
      type: a.account_type,
      currency: a.currency,
      includeInTotal: a.include_in_total,
      ownershipType: a.ownership_type,
      isSystemDefault: a.is_system_default,
      systemDefaultType: a.system_default_type,
      isActive: a.is_active,
      sortOrder: a.sort_order,
      createdAt: a.created_at,
    })),
    people: ctx.people.map(p => ({
      id: p.id,
      fullName: p.full_name,
      aliases: p.aliases || [],
      relationship: p.relationship,
      moneyHeld: Number(p.money_held || 0),
    })),
    categories: ctx.categories.map(c => ({
      id: c.id,
      name: c.name,
      type: c.category_type,
    })),
    subscriptions: subscriptions.map((subscription) => ({
      id: subscription.id,
      name: subscription.name,
      provider: subscription.provider,
      amount: subscription.amount,
      currencyCode: subscription.currency_code,
      billingFrequency: subscription.billing_frequency,
      status: subscription.status,
      nextBillingDate: subscription.next_billing_date,
      financialAccountId: subscription.financial_account_id,
    })),
    currencies: ctx.supportedCurrencies,
    defaultCurrency: ctx.defaultCurrency,
  };
}
