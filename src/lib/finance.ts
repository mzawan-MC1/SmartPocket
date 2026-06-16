'use client';
import { createClient } from '@/lib/supabase/client';

type AmountRow = { amount: number | string };
type BalanceRow = { current_balance: number | string; include_in_total: boolean };

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FinancialAccount {
  id: string;
  user_id: string;
  name: string;
  account_type: 'bank' | 'credit_card' | 'cash' | 'savings' | 'digital_wallet' | 'investment' | 'other';
  currency: string;
  opening_balance: number;
  current_balance: number;
  color: string | null;
  icon: string | null;
  notes: string | null;
  is_active: boolean;
  include_in_total: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  category_type: 'income' | 'expense' | 'transfer';
  color: string | null;
  icon: string | null;
  is_system: boolean;
  sort_order: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: string;
  description: string;
  merchant: string | null;
  notes: string | null;
  transaction_date: string;
  tags: string[];
  is_recurring: boolean;
  recurring_id: string | null;
  transfer_pair_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  account?: { name: string; currency: string };
  category?: { name: string; color: string | null; icon: string | null };
  receipt_attachments?: ReceiptAttachment[];
}

export interface ReceiptAttachment {
  id: string;
  transaction_id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  amount: number;
  period: 'monthly' | 'weekly' | 'yearly' | 'custom';
  period_start: string;
  period_end: string | null;
  alert_at_percent: number;
  currency: string;
  is_active: boolean;
  // joined
  category?: { name: string; color: string | null; icon: string | null };
  spent?: number;
}

export interface RecurringTransaction {
  id: string;
  user_id: string;
  account_id: string;
  category_id: string | null;
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: number;
  currency: string;
  description: string;
  merchant: string | null;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  next_due_date: string;
  last_run_date: string | null;
  is_active: boolean;
  auto_create: boolean;
  tags: string[];
  created_at: string;
  // joined
  account?: { name: string };
  category?: { name: string; color: string | null };
}

export interface Transfer {
  id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  from_transaction_id: string | null;
  to_transaction_id: string | null;
  amount: number;
  currency: string;
  description: string | null;
  transfer_date: string;
  notes: string | null;
  created_at: string;
  // joined
  from_account?: { name: string };
  to_account?: { name: string };
}

export interface DashboardMetrics {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  netCashFlow: number;
  totalBudget: number;
  budgetSpent: number;
  upcomingPaymentsTotal: number;
  upcomingPaymentsCount: number;
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

export async function getAccounts(): Promise<FinancialAccount[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('financial_accounts')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createAccount(payload: Partial<FinancialAccount>): Promise<FinancialAccount> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('financial_accounts')
    .insert({ ...payload, user_id: user.id, current_balance: payload.opening_balance ?? 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateAccount(id: string, payload: Partial<FinancialAccount>): Promise<FinancialAccount> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('financial_accounts')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function archiveAccount(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from('financial_accounts')
    .update({ is_active: false })
    .eq('id', id);
  if (error) throw error;
}

export async function recalculateAccountBalance(accountId: string): Promise<number> {
  const supabase = createClient();
  // Get opening balance
  const { data: acct, error: acctErr } = await supabase
    .from('financial_accounts')
    .select('opening_balance')
    .eq('id', accountId)
    .single();
  if (acctErr) throw acctErr;

  // Sum income transactions
  const { data: income } = await supabase
    .from('transactions')
    .select('amount')
    .eq('account_id', accountId)
    .eq('transaction_type', 'income');

  // Sum expense transactions
  const { data: expenses } = await supabase
    .from('transactions')
    .select('amount')
    .eq('account_id', accountId)
    .eq('transaction_type', 'expense');

  // Sum transfers in
  const { data: transfersIn } = await supabase
    .from('transfers')
    .select('amount')
    .eq('to_account_id', accountId);

  // Sum transfers out
  const { data: transfersOut } = await supabase
    .from('transfers')
    .select('amount')
    .eq('from_account_id', accountId);

  const incomeTotal = ((income || []) as AmountRow[]).reduce((s: number, t) => s + Number(t.amount), 0);
  const expenseTotal = ((expenses || []) as AmountRow[]).reduce((s: number, t) => s + Number(t.amount), 0);
  const transferInTotal = ((transfersIn || []) as AmountRow[]).reduce((s: number, t) => s + Number(t.amount), 0);
  const transferOutTotal = ((transfersOut || []) as AmountRow[]).reduce((s: number, t) => s + Number(t.amount), 0);

  const newBalance = Number(acct.opening_balance) + incomeTotal - expenseTotal + transferInTotal - transferOutTotal;

  await supabase
    .from('financial_accounts')
    .update({ current_balance: newBalance })
    .eq('id', accountId);

  return newBalance;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function getCategories(type?: 'income' | 'expense' | 'transfer'): Promise<Category[]> {
  const supabase = createClient();
  let query = supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (type) query = query.eq('category_type', type);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function getTransactions(filters?: {
  accountId?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
}): Promise<Transaction[]> {
  const supabase = createClient();
  let query = supabase
    .from('transactions')
    .select(`
      *,
      account:financial_accounts(name, currency),
      category:categories(name, color, icon),
      receipt_attachments(*)
    `)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (filters?.accountId) query = query.eq('account_id', filters.accountId);
  if (filters?.type && filters.type !== 'all') query = query.eq('transaction_type', filters.type);
  if (filters?.dateFrom) query = query.gte('transaction_date', filters.dateFrom);
  if (filters?.dateTo) query = query.lte('transaction_date', filters.dateTo);
  if (filters?.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Transaction[];
}

export async function createTransaction(payload: {
  account_id: string;
  category_id?: string | null;
  transaction_type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
  merchant?: string;
  notes?: string;
  transaction_date: string;
  tags?: string[];
  is_recurring?: boolean;
  recurring_id?: string | null;
}): Promise<Transaction> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('transactions')
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();
  if (error) throw error;

  // Recalculate account balance
  await recalculateAccountBalance(payload.account_id);

  return data;
}

export async function updateTransaction(id: string, payload: Partial<Transaction>): Promise<Transaction> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  if (payload.account_id) await recalculateAccountBalance(payload.account_id);
  return data;
}

export async function deleteTransaction(id: string, accountId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('transactions').delete().eq('id', id);
  if (error) throw error;
  await recalculateAccountBalance(accountId);
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export async function getTransfers(): Promise<Transfer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('transfers')
    .select(`
      *,
      from_account:financial_accounts!transfers_from_account_id_fkey(name),
      to_account:financial_accounts!transfers_to_account_id_fkey(name)
    `)
    .order('transfer_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Transfer[];
}

export async function createTransfer(payload: {
  from_account_id: string;
  to_account_id: string;
  amount: number;
  currency: string;
  description?: string;
  transfer_date: string;
  notes?: string;
}): Promise<Transfer> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (payload.from_account_id === payload.to_account_id) {
    throw new Error('Source and destination accounts must be different');
  }

  // Create outgoing transaction
  const { data: fromTxn, error: fromErr } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: payload.from_account_id,
      transaction_type: 'transfer',
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description || 'Transfer out',
      transaction_date: payload.transfer_date,
    })
    .select()
    .single();
  if (fromErr) throw fromErr;

  // Create incoming transaction
  const { data: toTxn, error: toErr } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: payload.to_account_id,
      transaction_type: 'transfer',
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description || 'Transfer in',
      transaction_date: payload.transfer_date,
      transfer_pair_id: fromTxn.id,
    })
    .select()
    .single();
  if (toErr) throw toErr;

  // Update pair link on from transaction
  await supabase
    .from('transactions')
    .update({ transfer_pair_id: toTxn.id })
    .eq('id', fromTxn.id);

  // Create transfer record
  const { data: transfer, error: transferErr } = await supabase
    .from('transfers')
    .insert({
      user_id: user.id,
      from_account_id: payload.from_account_id,
      to_account_id: payload.to_account_id,
      from_transaction_id: fromTxn.id,
      to_transaction_id: toTxn.id,
      amount: payload.amount,
      currency: payload.currency,
      description: payload.description || '',
      transfer_date: payload.transfer_date,
      notes: payload.notes || null,
    })
    .select()
    .single();
  if (transferErr) throw transferErr;

  // Recalculate both account balances
  await recalculateAccountBalance(payload.from_account_id);
  await recalculateAccountBalance(payload.to_account_id);

  return transfer;
}

// ─── Budgets ──────────────────────────────────────────────────────────────────

export async function getBudgets(periodStart?: string): Promise<Budget[]> {
  const supabase = createClient();
  const start = periodStart || new Date().toISOString().slice(0, 7) + '-01';
  const { data, error } = await supabase
    .from('budgets')
    .select(`*, category:categories(name, color, icon)`)
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const budgets = (data || []) as Budget[];

  // Calculate spent for each budget
  const end = new Date(new Date(start).getFullYear(), new Date(start).getMonth() + 1, 0)
    .toISOString().slice(0, 10);

  for (const budget of budgets) {
    let spentQuery = supabase
      .from('transactions')
      .select('amount')
      .eq('transaction_type', 'expense')
      .gte('transaction_date', start)
      .lte('transaction_date', end);

    if (budget.category_id) {
      spentQuery = spentQuery.eq('category_id', budget.category_id);
    }

    const { data: txns } = await spentQuery;
    budget.spent = ((txns || []) as AmountRow[]).reduce((s: number, t) => s + Number(t.amount), 0);
  }

  return budgets;
}

export async function createBudget(payload: Partial<Budget>): Promise<Budget> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('budgets')
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteBudget(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from('budgets').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

// ─── Recurring Transactions ───────────────────────────────────────────────────

export async function getRecurringTransactions(): Promise<RecurringTransaction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('recurring_transactions')
    .select(`*, account:financial_accounts(name), category:categories(name, color)`)
    .order('next_due_date', { ascending: true });
  if (error) throw error;
  return (data || []) as RecurringTransaction[];
}

export async function createRecurringTransaction(payload: Partial<RecurringTransaction>): Promise<RecurringTransaction> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({ ...payload, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateRecurringTransaction(id: string, payload: Partial<RecurringTransaction>): Promise<RecurringTransaction> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('recurring_transactions')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function markRecurringAsPaid(recurring: RecurringTransaction): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create a real transaction
  const { error: txnErr } = await supabase
    .from('transactions')
    .insert({
      user_id: user.id,
      account_id: recurring.account_id,
      category_id: recurring.category_id,
      transaction_type: recurring.transaction_type,
      amount: recurring.amount,
      currency: recurring.currency,
      description: recurring.description,
      merchant: recurring.merchant,
      transaction_date: new Date().toISOString().slice(0, 10),
      is_recurring: true,
      recurring_id: recurring.id,
    });
  if (txnErr) throw txnErr;

  // Calculate next due date
  const nextDate = calculateNextDueDate(recurring.next_due_date, recurring.frequency);

  // Update recurring record
  const { error: updateErr } = await supabase
    .from('recurring_transactions')
    .update({
      last_run_date: new Date().toISOString().slice(0, 10),
      next_due_date: nextDate,
    })
    .eq('id', recurring.id);
  if (updateErr) throw updateErr;

  // Recalculate account balance
  await recalculateAccountBalance(recurring.account_id);
}

function calculateNextDueDate(currentDate: string, frequency: string): string {
  const date = new Date(currentDate);
  switch (frequency) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'biweekly': date.setDate(date.getDate() + 14); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'quarterly': date.setMonth(date.getMonth() + 3); break;
    case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
    default: date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = createClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  // Total balance from active accounts that include_in_total
  const { data: accounts } = await supabase
    .from('financial_accounts')
    .select('current_balance, include_in_total')
    .eq('is_active', true);

  const totalBalance = ((accounts || []) as BalanceRow[])
    .filter((a) => a.include_in_total)
    .reduce((s: number, a) => s + Number(a.current_balance), 0);

  // Monthly income
  const { data: incomeData } = await supabase
    .from('transactions')
    .select('amount')
    .eq('transaction_type', 'income')
    .gte('transaction_date', monthStart)
    .lte('transaction_date', monthEnd);

  const monthlyIncome = ((incomeData || []) as AmountRow[]).reduce((s: number, t) => s + Number(t.amount), 0);

  // Monthly expenses
  const { data: expenseData } = await supabase
    .from('transactions')
    .select('amount')
    .eq('transaction_type', 'expense')
    .gte('transaction_date', monthStart)
    .lte('transaction_date', monthEnd);

  const monthlyExpenses = ((expenseData || []) as AmountRow[]).reduce((s: number, t) => s + Number(t.amount), 0);

  // Budget totals
  const { data: budgets } = await supabase
    .from('budgets')
    .select('amount')
    .eq('is_active', true);

  const totalBudget = ((budgets || []) as AmountRow[]).reduce((s: number, b) => s + Number(b.amount), 0);

  // Upcoming recurring
  const { data: upcoming } = await supabase
    .from('recurring_transactions')
    .select('amount')
    .eq('is_active', true)
    .eq('transaction_type', 'expense')
    .gte('next_due_date', today)
    .lte('next_due_date', next7Days);

  const upcomingPaymentsTotal = ((upcoming || []) as AmountRow[]).reduce((s: number, r) => s + Number(r.amount), 0);

  return {
    totalBalance,
    monthlyIncome,
    monthlyExpenses,
    netCashFlow: monthlyIncome - monthlyExpenses,
    totalBudget,
    budgetSpent: monthlyExpenses,
    upcomingPaymentsTotal,
    upcomingPaymentsCount: (upcoming || []).length,
  };
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getReportData(dateFrom: string, dateTo: string, accountId?: string) {
  const supabase = createClient();

  let query = supabase
    .from('transactions')
    .select(`
      *,
      account:financial_accounts(name, currency),
      category:categories(name, color)
    `)
    .gte('transaction_date', dateFrom)
    .lte('transaction_date', dateTo)
    .order('transaction_date', { ascending: false });

  if (accountId && accountId !== 'all') {
    query = query.eq('account_id', accountId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Transaction[];
}

export function generateCSV(transactions: Transaction[]): string {
  const headers = ['Date', 'Description', 'Merchant', 'Category', 'Account', 'Type', 'Amount', 'Currency', 'Tags', 'Notes'];
  const rows = transactions.map((t) => [
    t.transaction_date,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    `"${(t.merchant || '').replace(/"/g, '""')}"`,
    `"${(t.category?.name || '').replace(/"/g, '""')}"`,
    `"${(t.account?.name || '').replace(/"/g, '""')}"`,
    t.transaction_type,
    t.transaction_type === 'expense' ? `-${t.amount}` : `${t.amount}`,
    t.currency,
    `"${(t.tags || []).join(', ')}"`,
    `"${(t.notes || '').replace(/"/g, '""')}"`,
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

// ─── Receipt Upload ───────────────────────────────────────────────────────────

export async function uploadReceipt(
  transactionId: string,
  file: File,
  userId: string
): Promise<ReceiptAttachment> {
  const supabase = createClient();
  const ext = file.name.split('.').pop();
  const path = `${userId}/${transactionId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('receipts')
    .upload(path, file, { upsert: true });
  if (uploadErr) throw uploadErr;

  const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(path);

  const { data, error } = await supabase
    .from('receipt_attachments')
    .insert({
      transaction_id: transactionId,
      user_id: userId,
      file_name: file.name,
      file_url: urlData.publicUrl,
      file_size: file.size,
      mime_type: file.type,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteReceipt(attachmentId: string, filePath: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from('receipts').remove([filePath]);
  const { error } = await supabase.from('receipt_attachments').delete().eq('id', attachmentId);
  if (error) throw error;
}

// ─── Platform Settings ────────────────────────────────────────────────────────

export async function getPlatformSettings() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function savePlatformSettings(settings: Record<string, unknown>) {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from('platform_settings')
    .select('id')
    .single();

  if (existing) {
    const { error } = await supabase
      .from('platform_settings')
      .update(settings)
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('platform_settings')
      .insert({ ...settings, singleton_lock: true });
    if (error) throw error;
  }
}
