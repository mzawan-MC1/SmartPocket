import type { SupabaseClient } from '@supabase/supabase-js';
import { type PostgrestError } from '@supabase/supabase-js';
import { getCurrentBusinessDate } from '@/lib/financial-periods';
import {
  calculateNextPersonalSubscriptionBillingDate,
  getPersonalSubscriptionBillingWindow,
  isPersonalSubscriptionBillingFrequency,
  isPersonalSubscriptionPaymentMethod,
  isPersonalSubscriptionStatus,
  normalizePersonalSubscriptionRecord,
  normalizeReminderDays,
  normalizeWebsiteUrl,
  PERSONAL_SUBSCRIPTION_REMINDER_OPTIONS,
  shouldStopRemindersAfterEffectiveDate,
  supportsLinkedRecurringExpense,
  toRecurringFrequency,
  type PersonalSubscription,
  type PersonalSubscriptionBillingFrequency,
  type PersonalSubscriptionPaymentMethod,
  type PersonalSubscriptionStatus,
  type PersonalSubscriptionUpsertInput,
} from '@/lib/personal-subscriptions-shared';

const SUBSCRIPTION_SELECT = `
  *,
  account:financial_accounts(id, name, currency),
  category:categories(id, name, color),
  recurring_transaction:recurring_transactions(id, description, frequency, next_due_date, is_active)
`;

type RouteSupabaseClient = SupabaseClient;

export interface PersonalSubscriptionMutationOptions {
  createLinkedRecurringExpense?: boolean;
}

export interface PersonalSubscriptionCancellationInput {
  request_date?: string | null;
  effective_cancellation_date?: string | null;
  confirmation_reference?: string | null;
  notes?: string | null;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableText(value: unknown) {
  const normalized = normalizeString(value);
  return normalized ? normalized : null;
}

function normalizeOptionalDate(value: unknown) {
  const normalized = normalizeString(value);
  return normalized ? normalized : null;
}

function normalizeOptionalUuid(value: unknown) {
  const normalized = normalizeString(value);
  return normalized ? normalized : null;
}

function normalizeOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function normalizeCurrencyCode(value: unknown) {
  const normalized = normalizeString(value).toUpperCase();
  return normalized || null;
}

function isValidIsoDate(value: string | null | undefined) {
  if (!value) {
    return true;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidUrlOrEmpty(value: string | null | undefined) {
  if (!value) return true;
  return normalizeWebsiteUrl(value) !== null;
}

function buildNotesValue(existingNotes: string | null, appendedNotes: string | null) {
  const existing = normalizeNullableText(existingNotes);
  const next = normalizeNullableText(appendedNotes);
  if (!existing) return next;
  if (!next) return existing;
  return `${existing}\n\n${next}`;
}

async function recalculateFinancialAccountBalanceServer(
  supabase: RouteSupabaseClient,
  accountId: string
) {
  const { data: account, error: accountError } = await supabase
    .from('financial_accounts')
    .select('opening_balance')
    .eq('id', accountId)
    .single();

  if (accountError) {
    throw accountError;
  }

  const [{ data: incomeRows }, { data: expenseRows }, { data: transfersInRows }, { data: transfersOutRows }] =
    await Promise.all([
      supabase.from('transactions').select('amount').eq('account_id', accountId).eq('transaction_type', 'income'),
      supabase.from('transactions').select('amount').eq('account_id', accountId).eq('transaction_type', 'expense'),
      supabase.from('transfers').select('amount, destination_amount').eq('to_account_id', accountId),
      supabase.from('transfers').select('amount, source_amount').eq('from_account_id', accountId),
    ]);

  const incomeTotal = (incomeRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const expenseTotal = (expenseRows || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const transferInTotal = (transfersInRows || []).reduce(
    (sum, row) => sum + Number(row.destination_amount ?? row.amount ?? 0),
    0
  );
  const transferOutTotal = (transfersOutRows || []).reduce(
    (sum, row) => sum + Number(row.source_amount ?? row.amount ?? 0),
    0
  );

  const nextBalance = Number(account.opening_balance || 0) + incomeTotal - expenseTotal + transferInTotal - transferOutTotal;

  const { error: updateError } = await supabase
    .from('financial_accounts')
    .update({ current_balance: nextBalance })
    .eq('id', accountId);

  if (updateError) {
    throw updateError;
  }

  return nextBalance;
}

async function maybeCreateLinkedRecurringTransaction(args: {
  supabase: RouteSupabaseClient;
  userId: string;
  subscription: PersonalSubscription;
}) {
  const { supabase, userId, subscription } = args;
  const recurringFrequency = toRecurringFrequency(subscription.billing_frequency);

  if (!recurringFrequency || !subscription.financial_account_id) {
    return null;
  }

  const { data, error } = await supabase
    .from('recurring_transactions')
    .insert({
      user_id: userId,
      account_id: subscription.financial_account_id,
      category_id: subscription.category_id,
      transaction_type: 'expense',
      amount: subscription.amount,
      currency: subscription.currency_code,
      description: subscription.name,
      merchant: subscription.provider,
      frequency: recurringFrequency,
      next_due_date: subscription.next_billing_date || subscription.start_date || new Date().toISOString().slice(0, 10),
      is_active: subscription.status !== 'paused' && subscription.status !== 'cancelled' && subscription.status !== 'expired',
      auto_create: false,
      tags: ['personal_subscription', `personal_subscription:${subscription.id}`],
    })
    .select('id')
    .single();

  if (error) {
    throw error;
  }

  return data?.id || null;
}

async function syncLinkedRecurringTransaction(args: {
  supabase: RouteSupabaseClient;
  subscription: PersonalSubscription;
}) {
  const { supabase, subscription } = args;
  if (!subscription.recurring_transaction_id) {
    return;
  }

  const recurringFrequency = toRecurringFrequency(subscription.billing_frequency);
  if (!recurringFrequency) {
    return;
  }

  const { error } = await supabase
    .from('recurring_transactions')
    .update({
      account_id: subscription.financial_account_id,
      category_id: subscription.category_id,
      amount: subscription.amount,
      currency: subscription.currency_code,
      description: subscription.name,
      merchant: subscription.provider,
      frequency: recurringFrequency,
      next_due_date: subscription.next_billing_date,
      is_active: subscription.status !== 'paused' && subscription.status !== 'cancelled' && subscription.status !== 'expired',
    })
    .eq('id', subscription.recurring_transaction_id)
    .eq('user_id', subscription.user_id);

  if (error) {
    throw error;
  }
}

async function fetchSubscriptionOrThrow(
  supabase: RouteSupabaseClient,
  userId: string,
  subscriptionId: string
) {
  const { data, error } = await supabase
    .from('personal_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .single();

  if (error) {
    throw error;
  }

  return normalizePersonalSubscriptionRecord(data as PersonalSubscription);
}

export function sanitizePersonalSubscriptionPayload(
  body: Record<string, unknown>,
  options?: { partial?: boolean }
) {
  const partial = options?.partial === true;
  const payload: PersonalSubscriptionUpsertInput = {};

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'name')) {
    payload.name = normalizeString(body.name);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'provider')) {
    payload.provider = normalizeNullableText(body.provider);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'description')) {
    payload.description = normalizeNullableText(body.description);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'category_id')) {
    payload.category_id = normalizeOptionalUuid(body.category_id);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'financial_account_id')) {
    payload.financial_account_id = normalizeOptionalUuid(body.financial_account_id);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'recurring_transaction_id')) {
    payload.recurring_transaction_id = normalizeOptionalUuid(body.recurring_transaction_id);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'amount')) {
    const amount = normalizeOptionalNumber(body.amount);
    payload.amount = amount === null ? undefined : amount;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'currency_code')) {
    payload.currency_code = normalizeCurrencyCode(body.currency_code) || undefined;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'billing_frequency')) {
    payload.billing_frequency = isPersonalSubscriptionBillingFrequency(body.billing_frequency as string)
      ? body.billing_frequency as PersonalSubscriptionBillingFrequency
      : undefined;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'billing_interval')) {
    const billingInterval = normalizeOptionalNumber(body.billing_interval);
    payload.billing_interval = billingInterval === null ? undefined : Math.trunc(billingInterval);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'start_date')) {
    payload.start_date = normalizeOptionalDate(body.start_date);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'next_billing_date')) {
    payload.next_billing_date = normalizeOptionalDate(body.next_billing_date);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'trial_end_date')) {
    payload.trial_end_date = normalizeOptionalDate(body.trial_end_date);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'contract_end_date')) {
    payload.contract_end_date = normalizeOptionalDate(body.contract_end_date);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'auto_renew')) {
    payload.auto_renew = normalizeBoolean(body.auto_renew, true);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'payment_method')) {
    payload.payment_method = isPersonalSubscriptionPaymentMethod(body.payment_method as string)
      ? body.payment_method as PersonalSubscriptionPaymentMethod
      : normalizeNullableText(body.payment_method) as PersonalSubscriptionPaymentMethod | null;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'cancellation_notice_days')) {
    const noticeDays = normalizeOptionalNumber(body.cancellation_notice_days);
    payload.cancellation_notice_days = noticeDays === null ? undefined : Math.trunc(noticeDays);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'cancellation_deadline')) {
    payload.cancellation_deadline = normalizeOptionalDate(body.cancellation_deadline);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'reminder_days_before')) {
    const reminderDays = Array.isArray(body.reminder_days_before)
      ? body.reminder_days_before.map((value) => Number(value)).filter((value) => Number.isInteger(value))
      : [];
    payload.reminder_days_before = normalizeReminderDays(reminderDays);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'warning_threshold_amount')) {
    payload.warning_threshold_amount = normalizeOptionalNumber(body.warning_threshold_amount);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'website_url')) {
    payload.website_url = normalizeNullableText(body.website_url);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'account_reference')) {
    payload.account_reference = normalizeNullableText(body.account_reference);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'notes')) {
    payload.notes = normalizeNullableText(body.notes);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'status')) {
    payload.status = isPersonalSubscriptionStatus(body.status as string)
      ? body.status as PersonalSubscriptionStatus
      : undefined;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'last_paid_date')) {
    payload.last_paid_date = normalizeOptionalDate(body.last_paid_date);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'cancel_requested_at')) {
    payload.cancel_requested_at = normalizeNullableText(body.cancel_requested_at);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'cancel_effective_date')) {
    payload.cancel_effective_date = normalizeOptionalDate(body.cancel_effective_date);
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'cancel_confirmation_reference')) {
    payload.cancel_confirmation_reference = normalizeNullableText(body.cancel_confirmation_reference);
  }

  return {
    payload,
    createLinkedRecurringExpense:
      Object.prototype.hasOwnProperty.call(body, 'create_linked_recurring_expense')
        ? Boolean(body.create_linked_recurring_expense)
        : true,
  };
}

export function validatePersonalSubscriptionInput(
  payload: PersonalSubscriptionUpsertInput,
  options?: { partial?: boolean }
) {
  const partial = options?.partial === true;

  if (!partial || payload.name !== undefined) {
    if (!payload.name) {
      return 'Subscription name is required';
    }
  }

  if (!partial || payload.amount !== undefined) {
    if (payload.amount === undefined || payload.amount === null || !Number.isFinite(payload.amount) || payload.amount < 0) {
      return 'Amount must be 0 or greater';
    }
  }

  if (!partial || payload.currency_code !== undefined) {
    if (!payload.currency_code || !/^[A-Z]{3}$/.test(payload.currency_code)) {
      return 'Currency must be a valid 3-letter code';
    }
  }

  if (!partial || payload.billing_frequency !== undefined) {
    if (!payload.billing_frequency) {
      return 'Billing frequency is required';
    }
  }

  if (payload.billing_interval !== undefined && (!Number.isInteger(payload.billing_interval) || payload.billing_interval < 1)) {
    return 'Billing interval must be at least 1';
  }

  if (payload.status !== undefined && !isPersonalSubscriptionStatus(payload.status)) {
    return 'Status is invalid';
  }

  if (payload.payment_method !== undefined && payload.payment_method !== null && !isPersonalSubscriptionPaymentMethod(payload.payment_method)) {
    return 'Payment method is invalid';
  }

  if (payload.cancellation_notice_days !== undefined && payload.cancellation_notice_days < 0) {
    return 'Cancellation notice days cannot be negative';
  }

  if (payload.warning_threshold_amount !== undefined && payload.warning_threshold_amount !== null && payload.warning_threshold_amount < 0) {
    return 'Warning threshold amount cannot be negative';
  }

  if (payload.reminder_days_before !== undefined) {
    const allowed = new Set<number>(PERSONAL_SUBSCRIPTION_REMINDER_OPTIONS);
    if (payload.reminder_days_before.some((value) => !allowed.has(value))) {
      return 'Reminder days must use supported values only';
    }
  }

  const dateFields: Array<[string, string | null | undefined]> = [
    ['Start date', payload.start_date],
    ['Next billing date', payload.next_billing_date],
    ['Trial end date', payload.trial_end_date],
    ['Contract end date', payload.contract_end_date],
    ['Cancellation deadline', payload.cancellation_deadline],
    ['Last paid date', payload.last_paid_date],
    ['Cancel effective date', payload.cancel_effective_date],
  ];

  for (const [label, value] of dateFields) {
    if (!isValidIsoDate(value)) {
      return `${label} must use YYYY-MM-DD format`;
    }
  }

  if (payload.website_url !== undefined && !isValidUrlOrEmpty(payload.website_url)) {
    return 'Website URL must be a valid http or https URL';
  }

  if (
    payload.cancel_requested_at &&
    Number.isNaN(new Date(payload.cancel_requested_at).getTime())
  ) {
    return 'Cancellation request timestamp is invalid';
  }

  if (
    payload.cancel_effective_date &&
    payload.cancel_requested_at &&
    payload.cancel_effective_date < payload.cancel_requested_at.slice(0, 10)
  ) {
    return 'Effective cancellation date cannot be before the request date';
  }

  return null;
}

function toSubscriptionDbPayload(payload: PersonalSubscriptionUpsertInput) {
  return {
    ...payload,
    reminder_days_before: payload.reminder_days_before || [1, 3, 7],
    website_url: payload.website_url ? normalizeWebsiteUrl(payload.website_url) : null,
  };
}

function normalizePostgrestMaybeError(error: PostgrestError | null, fallback: string) {
  return error?.message || fallback;
}

export async function listPersonalSubscriptions(
  supabase: RouteSupabaseClient,
  userId: string
) {
  const { data, error } = await supabase
    .from('personal_subscriptions')
    .select(SUBSCRIPTION_SELECT)
    .eq('user_id', userId)
    .order('next_billing_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((record) => normalizePersonalSubscriptionRecord(record as PersonalSubscription));
}

export async function getPersonalSubscription(
  supabase: RouteSupabaseClient,
  userId: string,
  subscriptionId: string
) {
  return fetchSubscriptionOrThrow(supabase, userId, subscriptionId);
}

export async function createPersonalSubscription(args: {
  supabase: RouteSupabaseClient;
  userId: string;
  payload: PersonalSubscriptionUpsertInput;
  options?: PersonalSubscriptionMutationOptions;
}) {
  const { supabase, userId, payload, options } = args;
  const dbPayload = toSubscriptionDbPayload(payload);

  const { data, error } = await supabase
    .from('personal_subscriptions')
    .insert({
      user_id: userId,
      ...dbPayload,
    })
    .select(SUBSCRIPTION_SELECT)
    .single();

  if (error) {
    throw new Error(normalizePostgrestMaybeError(error, 'Failed to create subscription'));
  }

  let subscription = normalizePersonalSubscriptionRecord(data as PersonalSubscription);

  if (
    options?.createLinkedRecurringExpense !== false &&
    !subscription.recurring_transaction_id &&
    supportsLinkedRecurringExpense(subscription.billing_frequency) &&
    subscription.financial_account_id
  ) {
    const recurringId = await maybeCreateLinkedRecurringTransaction({
      supabase,
      userId,
      subscription,
    });

    if (recurringId) {
      const { data: updated, error: updateError } = await supabase
        .from('personal_subscriptions')
        .update({ recurring_transaction_id: recurringId })
        .eq('id', subscription.id)
        .eq('user_id', userId)
        .select(SUBSCRIPTION_SELECT)
        .single();

      if (updateError) {
        throw new Error(normalizePostgrestMaybeError(updateError, 'Failed to connect recurring transaction'));
      }

      subscription = normalizePersonalSubscriptionRecord(updated as PersonalSubscription);
    }
  }

  return subscription;
}

export async function updatePersonalSubscription(args: {
  supabase: RouteSupabaseClient;
  userId: string;
  subscriptionId: string;
  payload: PersonalSubscriptionUpsertInput;
  options?: PersonalSubscriptionMutationOptions;
}) {
  const { supabase, userId, subscriptionId, payload, options } = args;
  const existing = await fetchSubscriptionOrThrow(supabase, userId, subscriptionId);

  const { data, error } = await supabase
    .from('personal_subscriptions')
    .update(toSubscriptionDbPayload(payload))
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .select(SUBSCRIPTION_SELECT)
    .single();

  if (error) {
    throw new Error(normalizePostgrestMaybeError(error, 'Failed to update subscription'));
  }

  let subscription = normalizePersonalSubscriptionRecord(data as PersonalSubscription);

  if (
    options?.createLinkedRecurringExpense !== false &&
    !subscription.recurring_transaction_id &&
    supportsLinkedRecurringExpense(subscription.billing_frequency) &&
    subscription.financial_account_id
  ) {
    const recurringId = await maybeCreateLinkedRecurringTransaction({
      supabase,
      userId,
      subscription,
    });

    if (recurringId) {
      const { data: updated, error: updateError } = await supabase
        .from('personal_subscriptions')
        .update({ recurring_transaction_id: recurringId })
        .eq('id', subscriptionId)
        .eq('user_id', userId)
        .select(SUBSCRIPTION_SELECT)
        .single();

      if (updateError) {
        throw new Error(normalizePostgrestMaybeError(updateError, 'Failed to connect recurring transaction'));
      }

      subscription = normalizePersonalSubscriptionRecord(updated as PersonalSubscription);
    }
  }

  if (subscription.recurring_transaction_id && supportsLinkedRecurringExpense(subscription.billing_frequency)) {
    await syncLinkedRecurringTransaction({
      supabase,
      subscription,
    });
  }

  if (existing.financial_account_id && existing.financial_account_id !== subscription.financial_account_id) {
    await recalculateFinancialAccountBalanceServer(supabase, existing.financial_account_id);
  }

  return subscription;
}

export async function deletePersonalSubscription(args: {
  supabase: RouteSupabaseClient;
  userId: string;
  subscriptionId: string;
}) {
  const { supabase, userId, subscriptionId } = args;
  const { error } = await supabase
    .from('personal_subscriptions')
    .delete()
    .eq('id', subscriptionId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(normalizePostgrestMaybeError(error, 'Failed to delete subscription'));
  }
}

export async function markPersonalSubscriptionPaid(args: {
  supabase: RouteSupabaseClient;
  userId: string;
  subscriptionId: string;
}) {
  const { supabase, userId, subscriptionId } = args;
  const subscription = await fetchSubscriptionOrThrow(supabase, userId, subscriptionId);

  if (!subscription.financial_account_id) {
    throw new Error('Select a financial account before marking this subscription as paid');
  }

  if (subscription.status === 'cancelled' || subscription.status === 'expired') {
    throw new Error('Cancelled or expired subscriptions cannot be marked as paid');
  }

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('timezone')
    .eq('id', userId)
    .maybeSingle();

  const currentBusinessDate = getCurrentBusinessDate(profile?.timezone || 'UTC');
  const billingWindow = getPersonalSubscriptionBillingWindow(subscription);
  const tag = `personal_subscription:${subscription.id}`;

  let duplicateQuery = supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('account_id', subscription.financial_account_id)
    .eq('transaction_type', 'expense')
    .contains('tags', [tag])
    .limit(1);

  if (billingWindow?.periodStart) {
    duplicateQuery = duplicateQuery.gte('transaction_date', billingWindow.periodStart);
  }

  if (billingWindow?.periodEndExclusive) {
    duplicateQuery = duplicateQuery.lt('transaction_date', billingWindow.periodEndExclusive);
  }

  const { data: duplicates, error: duplicateError } = await duplicateQuery;
  if (duplicateError) {
    throw duplicateError;
  }

  if ((duplicates || []).length > 0) {
    throw new Error('This subscription is already marked as paid for the current billing period');
  }

  const { error: transactionError } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      account_id: subscription.financial_account_id,
      category_id: subscription.category_id,
      transaction_type: 'expense',
      amount: subscription.amount,
      currency: subscription.currency_code,
      description: subscription.name,
      merchant: subscription.provider,
      notes: subscription.notes,
      transaction_date: currentBusinessDate,
      tags: ['personal_subscription', tag],
      is_recurring: Boolean(subscription.recurring_transaction_id),
      recurring_id: subscription.recurring_transaction_id,
    });

  if (transactionError) {
    throw transactionError;
  }

  const nextBillingDate = subscription.next_billing_date
    ? calculateNextPersonalSubscriptionBillingDate(
      subscription.next_billing_date,
      subscription.billing_frequency,
      subscription.billing_interval
    )
    : null;

  const { data, error } = await supabase
    .from('personal_subscriptions')
    .update({
      last_paid_date: currentBusinessDate,
      next_billing_date: nextBillingDate,
      status: subscription.status === 'trial' ? 'active' : subscription.status,
    })
    .eq('id', subscription.id)
    .eq('user_id', userId)
    .select(SUBSCRIPTION_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const updated = normalizePersonalSubscriptionRecord(data as PersonalSubscription);

  if (updated.recurring_transaction_id && updated.next_billing_date && supportsLinkedRecurringExpense(updated.billing_frequency)) {
    const { error: recurringError } = await supabase
      .from('recurring_transactions')
      .update({
        last_run_date: currentBusinessDate,
        next_due_date: updated.next_billing_date,
        is_active: updated.status !== 'paused' && updated.status !== 'cancelled' && updated.status !== 'expired',
      })
      .eq('id', updated.recurring_transaction_id)
      .eq('user_id', userId);

    if (recurringError) {
      throw recurringError;
    }
  }

  await recalculateFinancialAccountBalanceServer(supabase, subscription.financial_account_id);
  return updated;
}

export async function requestPersonalSubscriptionCancellation(args: {
  supabase: RouteSupabaseClient;
  userId: string;
  subscriptionId: string;
  input: PersonalSubscriptionCancellationInput;
}) {
  const { supabase, userId, subscriptionId, input } = args;
  const existing = await fetchSubscriptionOrThrow(supabase, userId, subscriptionId);
  const requestDate = input.request_date || new Date().toISOString().slice(0, 10);
  const effectiveDate = input.effective_cancellation_date || existing.cancel_effective_date || existing.next_billing_date || requestDate;
  const nextStatus: PersonalSubscriptionStatus =
    effectiveDate <= requestDate ? 'cancelling' : 'cancellation_requested';

  const { data, error } = await supabase
    .from('personal_subscriptions')
    .update({
      status: nextStatus,
      cancel_requested_at: `${requestDate}T12:00:00.000Z`,
      cancel_effective_date: effectiveDate,
      cancel_confirmation_reference: normalizeNullableText(input.confirmation_reference),
      notes: buildNotesValue(existing.notes, input.notes || null),
      auto_renew: false,
    })
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .select(SUBSCRIPTION_SELECT)
    .single();

  if (error) {
    throw new Error(normalizePostgrestMaybeError(error, 'Failed to request cancellation'));
  }

  return normalizePersonalSubscriptionRecord(data as PersonalSubscription);
}

export async function markPersonalSubscriptionCancelled(args: {
  supabase: RouteSupabaseClient;
  userId: string;
  subscriptionId: string;
  effectiveDate?: string | null;
}) {
  const { supabase, userId, subscriptionId, effectiveDate } = args;
  const existing = await fetchSubscriptionOrThrow(supabase, userId, subscriptionId);
  const cancellationDate = effectiveDate || existing.cancel_effective_date || new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('personal_subscriptions')
    .update({
      status: 'cancelled',
      auto_renew: false,
      cancel_effective_date: cancellationDate,
    })
    .eq('id', subscriptionId)
    .eq('user_id', userId)
    .select(SUBSCRIPTION_SELECT)
    .single();

  if (error) {
    throw new Error(normalizePostgrestMaybeError(error, 'Failed to mark subscription as cancelled'));
  }

  const updated = normalizePersonalSubscriptionRecord(data as PersonalSubscription);

  if (updated.recurring_transaction_id) {
    const { error: recurringError } = await supabase
      .from('recurring_transactions')
      .update({ is_active: false })
      .eq('id', updated.recurring_transaction_id)
      .eq('user_id', userId);

    if (recurringError) {
      throw recurringError;
    }
  }

  return updated;
}

export async function preparePersonalSubscriptionNotifications(args: {
  supabase: RouteSupabaseClient;
  userId: string;
  todayIso: string;
}) {
  const { supabase, userId, todayIso } = args;
  const subscriptions = await listPersonalSubscriptions(supabase, userId);
  return subscriptions.filter((subscription) =>
    subscription.status !== 'cancelled'
    && subscription.status !== 'expired'
    && !shouldStopRemindersAfterEffectiveDate(subscription, todayIso)
  );
}
