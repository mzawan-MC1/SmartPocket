import { createClient } from '@/lib/supabase/client';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { formatRecurringFrequencyLabel, getBudgets, getRecurringFrequencyLabelKey } from '@/lib/finance';
import { getCurrentFinancialPeriod, getNextFinancialPeriod } from '@/lib/financial-periods';
import { loadUserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import { formatCurrencyValue } from '@/lib/currency-formatting';
import { getClientReferenceData } from '@/lib/reference-data/client';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';
import type { CurrencyReference } from '@/lib/reference-data/types';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  source_key: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

type NotificationTranslationFn = (key: string, options?: Record<string, unknown>) => string;

export interface LocalizedNotificationContent {
  resolvedType: string;
  title: string;
  message: string;
  usedFallback: boolean;
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getMetadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function getFirstMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const value = getMetadataString(metadata, key);
    if (value) return value;
  }
  return null;
}

function getFirstMetadataNumber(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[]
) {
  for (const key of keys) {
    const value = getMetadataNumber(metadata, key);
    if (value !== null) return value;
  }
  return null;
}

function getMetadataArray<T = unknown>(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  const value = metadata?.[key];
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatNotificationCurrencyAmount(args: {
  amount: number | null;
  currencyCode: string | null;
  language: string;
  currencies?: CurrencyReference[];
}) {
  if (args.amount === null) return null;
  return formatCurrencyValue(args.amount, {
    currencyCode: args.currencyCode,
    currencies: args.currencies,
    locale: args.language,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).text;
}

function formatNotificationDate(value: string | null, language: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function extractRecordedDescription(message: string) {
  const match = message.match(/^(.*?)\s+was recorded for\b/i);
  return match?.[1]?.trim() || null;
}

function extractCurrencyAndAmountFromMessage(message: string) {
  const match = message.match(/\bfor\s+([A-Z]{3})\s+(-?[0-9][0-9,]*(?:\.[0-9]+)?)/i);
  if (!match) return null;
  const amount = Number(match[2].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;
  return {
    currencyCode: match[1].toUpperCase(),
    amount,
  };
}

function getRecordedDescription(notification: AppNotification) {
  return (
    getFirstMetadataString(notification.metadata, [
      'description',
      'settlement_description',
      'loan_description',
      'reference_description',
    ])
    || extractRecordedDescription(notification.message)
  );
}

function getNotificationAmountText(args: {
  notification: AppNotification;
  language: string;
  currencies: CurrencyReference[];
}) {
  const amount = getFirstMetadataNumber(args.notification.metadata, [
    'amount',
    'loan_amount',
    'settlement_amount',
  ]);
  const currencyCode = getFirstMetadataString(args.notification.metadata, [
    'currency',
    'currency_code',
    'loan_currency',
    'settlement_currency',
  ]);

  if (amount !== null) {
    return formatNotificationCurrencyAmount({
      amount,
      currencyCode,
      language: args.language,
      currencies: args.currencies,
    });
  }

  const extracted = extractCurrencyAndAmountFromMessage(args.notification.message);
  if (!extracted) return null;

  return formatNotificationCurrencyAmount({
    amount: extracted.amount,
    currencyCode: extracted.currencyCode,
    language: args.language,
    currencies: args.currencies,
  });
}

function extractLoanRepaymentPersonName(notification: AppNotification, description: string | null) {
  const directName = getFirstMetadataString(notification.metadata, [
    'person_name',
    'counterparty_name',
    'person',
    'managed_person_name',
  ]);
  if (directName) return directName;

  const candidate = description || getRecordedDescription(notification);
  if (!candidate) return null;

  const match = candidate.match(/^loan repayment to\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function resolveLegacyNotificationType(notification: AppNotification) {
  if (
    notification.type === 'account_security'
    && (
      getMetadataString(notification.metadata, 'event') === 'login'
      || notification.source_key?.startsWith('security_login:') === true
    )
  ) {
    return 'successful_sign_in';
  }

  if (
    notification.type === 'settlement_completed'
    && (
      notification.source_key?.startsWith('loan_repayment:') === true
      || (
        typeof notification.action_url === 'string'
        && notification.action_url.startsWith('/people/')
        && getMetadataNumber(notification.metadata, 'transaction_id') !== null
      )
    )
  ) {
    return 'loan_repayment_recorded';
  }

  return notification.type;
}

function getNotificationStatusLabel(status: string | null, t: NotificationTranslationFn) {
  switch (status) {
    case 'pending':
      return t('notifications.values.status.pending');
    case 'partially_paid':
      return t('notifications.values.status.partiallyPaid');
    case 'settled':
      return t('notifications.values.status.settled');
    default:
      return status;
  }
}

export function getLocalizedNotificationContent(args: {
  notification: AppNotification;
  t: NotificationTranslationFn;
  language: string;
  currencies?: CurrencyReference[];
}): LocalizedNotificationContent {
  const { notification, t, language, currencies = [] } = args;
  const resolvedType = resolveLegacyNotificationType(notification);
  const metadata = notification.metadata || {};
  const fallback = (): LocalizedNotificationContent => ({
    resolvedType,
    title: notification.title,
    message: notification.message,
    usedFallback: true,
  });

  switch (resolvedType) {
    case 'successful_sign_in':
      return {
        resolvedType,
        title: t('notifications.types.successfulSignIn.title'),
        message: t('notifications.types.successfulSignIn.description'),
        usedFallback: false,
      };
    case 'pay_period_starts_today': {
      const periodLabel = getMetadataString(metadata, 'period_label_kind') === 'planning_period'
        ? t('notifications.values.periodKinds.planningPeriod')
        : t('notifications.values.periodKinds.payPeriod');
      return {
        resolvedType,
        title: t('notifications.types.payPeriodStartsToday.title'),
        message: t('notifications.types.payPeriodStartsToday.description', { periodLabel }),
        usedFallback: false,
      };
    }
    case 'pay_period_starts_tomorrow': {
      const periodLabel = getMetadataString(metadata, 'period_label_kind') === 'planning_period'
        ? t('notifications.values.periodKinds.planningPeriod')
        : t('notifications.values.periodKinds.payPeriod');
      return {
        resolvedType,
        title: t('notifications.types.payPeriodStartsTomorrow.title'),
        message: t('notifications.types.payPeriodStartsTomorrow.description', { periodLabel }),
        usedFallback: false,
      };
    }
    case 'bills_before_next_payday': {
      const totals = getMetadataArray<{ currency?: string; amount?: number | string }>(metadata, 'total_due_by_currency')
        .map((row) => formatNotificationCurrencyAmount({
          amount: typeof row?.amount === 'number' ? row.amount : Number(row?.amount ?? NaN),
          currencyCode: typeof row?.currency === 'string' ? row.currency : null,
          language,
          currencies,
        }))
        .filter((value): value is string => Boolean(value));
      const nextPayday = formatNotificationDate(getMetadataString(metadata, 'next_payday'), language);
      if (!nextPayday || totals.length === 0) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.billsBeforeNextPayday.title'),
        message: t('notifications.types.billsBeforeNextPayday.description', {
          totalDue: totals.join(', '),
          nextPayday,
        }),
        usedFallback: false,
      };
    }
    case 'recurring_due_soon': {
      const description = getMetadataString(metadata, 'description')
        || t('notifications.values.recurringPaymentFallback');
      const frequencyKey = getMetadataString(metadata, 'frequency_key');
      const frequency = frequencyKey
        ? t(frequencyKey, { ns: 'portal' })
        : getMetadataString(metadata, 'frequency_label');
      const dueDate = formatNotificationDate(getMetadataString(metadata, 'next_due_date'), language);
      if (!description || !frequency || !dueDate) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.recurringDueSoon.title'),
        message: t('notifications.types.recurringDueSoon.description', {
          description,
          frequency,
          dueDate,
        }),
        usedFallback: false,
      };
    }
    case 'large_payment_due_this_period': {
      const description = getMetadataString(metadata, 'description');
      const amountText = formatNotificationCurrencyAmount({
        amount: getMetadataNumber(metadata, 'amount'),
        currencyCode: getMetadataString(metadata, 'currency'),
        language,
        currencies,
      });
      const periodLabel = getMetadataString(metadata, 'period_label_kind') === 'planning_period'
        ? t('notifications.values.periodKinds.planningPeriod')
        : t('notifications.values.periodKinds.payPeriod');
      if (!description || !amountText) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.largePaymentDueThisPeriod.title'),
        message: t('notifications.types.largePaymentDueThisPeriod.description', {
          description,
          amount: amountText,
          periodLabel,
        }),
        usedFallback: false,
      };
    }
    case 'budget_exceeded': {
      const budgetName = getMetadataString(metadata, 'budget_name');
      const usedPct = getMetadataNumber(metadata, 'used_pct');
      if (!budgetName || usedPct === null) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.budgetExceeded.title'),
        message: t('notifications.types.budgetExceeded.description', {
          budgetName,
          usedPct: usedPct.toFixed(1),
        }),
        usedFallback: false,
      };
    }
    case 'budget_threshold_reached': {
      const budgetName = getMetadataString(metadata, 'budget_name');
      const usedPct = getMetadataNumber(metadata, 'used_pct');
      if (!budgetName || usedPct === null) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.budgetThresholdReached.title'),
        message: t('notifications.types.budgetThresholdReached.description', {
          budgetName,
          usedPct: usedPct.toFixed(1),
        }),
        usedFallback: false,
      };
    }
    case 'reimbursement_created': {
      const description = getMetadataString(metadata, 'description');
      const amountText = formatNotificationCurrencyAmount({
        amount: getMetadataNumber(metadata, 'amount'),
        currencyCode: getMetadataString(metadata, 'currency'),
        language,
        currencies,
      });
      if (!description || !amountText) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.reimbursementCreated.title'),
        message: t('notifications.types.reimbursementCreated.description', {
          description,
          amount: amountText,
        }),
        usedFallback: false,
      };
    }
    case 'reimbursement_updated': {
      const amountText = formatNotificationCurrencyAmount({
        amount: getMetadataNumber(metadata, 'amount'),
        currencyCode: getMetadataString(metadata, 'currency'),
        language,
        currencies,
      });
      if (!amountText) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.reimbursementUpdated.title'),
        message: t('notifications.types.reimbursementUpdated.description', {
          amount: amountText,
        }),
        usedFallback: false,
      };
    }
    case 'reimbursement_status_updated': {
      const status = getNotificationStatusLabel(getMetadataString(metadata, 'status'), t);
      if (!status) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.reimbursementStatusUpdated.title'),
        message: t('notifications.types.reimbursementStatusUpdated.description', {
          status,
        }),
        usedFallback: false,
      };
    }
    case 'settlement_completed': {
      const description = getRecordedDescription(notification);
      const amountText = getNotificationAmountText({
        notification,
        language,
        currencies,
      });
      if (!amountText) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.settlementCompleted.title'),
        message: description
          ? t('notifications.types.settlementCompleted.description', {
              description,
              amount: amountText,
            })
          : t('notifications.types.settlementCompleted.descriptionGeneric', {
              amount: amountText,
            }),
        usedFallback: false,
      };
    }
    case 'loan_repayment_recorded': {
      const description = getRecordedDescription(notification);
      const personName = extractLoanRepaymentPersonName(notification, description);
      const amountText = getNotificationAmountText({
        notification,
        language,
        currencies,
      });
      if (!amountText) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.loanRepaymentRecorded.title'),
        message: personName
          ? t('notifications.types.loanRepaymentRecorded.description', {
              personName,
              amount: amountText,
            })
          : t('notifications.types.loanRepaymentRecorded.descriptionGeneric', {
              amount: amountText,
            }),
        usedFallback: false,
      };
    }
    case 'receipt_item_due_soon': {
      const itemName = getMetadataString(metadata, 'item_name');
      const dueDate = formatNotificationDate(getMetadataString(metadata, 'next_due_date'), language);
      if (!itemName || !dueDate) return fallback();
      return {
        resolvedType,
        title: t('notifications.types.receiptItemDueSoon.title'),
        message: t('notifications.types.receiptItemDueSoon.description', {
          itemName,
          dueDate,
        }),
        usedFallback: false,
      };
    }
    case 'ai_execution_failed':
      return {
        resolvedType,
        title: t('notifications.types.aiExecutionFailed.title'),
        message: t('notifications.types.aiExecutionFailed.description'),
        usedFallback: false,
      };
    default:
      return fallback();
  }
}

export interface NotificationPreferences {
  user_id?: string;
  in_app_enabled: boolean;
  recurring_due_reminders: boolean;
  budget_alerts: boolean;
  reimbursement_updates: boolean;
  account_security_notifications: boolean;
  ai_execution_failure_notifications: boolean;
  significant_item_price_increase_alerts: boolean;
  recurring_purchase_due_alerts: boolean;
  duplicate_receipt_warning_alerts: boolean;
  unusual_receipt_total_alerts: boolean;
  high_item_or_category_spend_alerts: boolean;
  updated_at?: string;
}

export type NotificationPreferenceKey =
  | 'in_app_enabled'
  | 'recurring_due_reminders'
  | 'budget_alerts'
  | 'reimbursement_updates'
  | 'account_security_notifications'
  | 'ai_execution_failure_notifications'
  | 'significant_item_price_increase_alerts'
  | 'recurring_purchase_due_alerts'
  | 'duplicate_receipt_warning_alerts'
  | 'unusual_receipt_total_alerts'
  | 'high_item_or_category_spend_alerts';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  in_app_enabled: true,
  recurring_due_reminders: true,
  budget_alerts: true,
  reimbursement_updates: true,
  account_security_notifications: true,
  ai_execution_failure_notifications: true,
  significant_item_price_increase_alerts: true,
  recurring_purchase_due_alerts: true,
  duplicate_receipt_warning_alerts: true,
  unusual_receipt_total_alerts: false,
  high_item_or_category_spend_alerts: false,
};

function addDays(dateString: string, amount: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

async function formatCurrencyTotal(currency: string, amount: number) {
  const referenceData = await getClientReferenceData();
  const resolvedCurrency = getCurrencyByCode(referenceData.snapshot.currencies, currency);
  return formatCurrencyValue(amount, {
    currency: resolvedCurrency,
    currencies: referenceData.snapshot.currencies,
    currencyCode: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).text;
}

async function formatGroupedCurrencyTotals(rows: Array<{ currency: string; amount: number }>) {
  const parts = await Promise.all(rows.map((row) => formatCurrencyTotal(row.currency, row.amount)));
  return parts.join(', ');
}

function sumRecurringDueByCurrency(rows: Array<{ currency: string | null; amount: number | null }>) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = typeof row.currency === 'string' && row.currency.trim().length > 0 ? row.currency : 'USD';
    totals.set(currency, (totals.get(currency) || 0) + Math.abs(Number(row.amount || 0)));
  }
  return Array.from(totals.entries()).map(([currency, amount]) => ({ currency, amount }));
}

async function requireUserId() {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) {
    throw new Error('Not authenticated');
  }
  return { supabase, userId };
}

function normalizePreferences(
  row?: Partial<NotificationPreferences> | null
): NotificationPreferences {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...row,
  };
}

export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  const { supabase, userId } = await requireUserId();

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('user_id, in_app_enabled, recurring_due_reminders, budget_alerts, reimbursement_updates, account_security_notifications, ai_execution_failure_notifications, significant_item_price_increase_alerts, recurring_purchase_due_alerts, duplicate_receipt_warning_alerts, unusual_receipt_total_alerts, high_item_or_category_spend_alerts, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return normalizePreferences(data);
  }

  const insertPayload = {
    user_id: userId,
    ...DEFAULT_NOTIFICATION_PREFERENCES,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('notification_preferences')
    .upsert(insertPayload, { onConflict: 'user_id' })
    .select('user_id, in_app_enabled, recurring_due_reminders, budget_alerts, reimbursement_updates, account_security_notifications, ai_execution_failure_notifications, significant_item_price_increase_alerts, recurring_purchase_due_alerts, duplicate_receipt_warning_alerts, unusual_receipt_total_alerts, high_item_or_category_spend_alerts, updated_at')
    .single();

  if (insertError) {
    throw insertError;
  }

  return normalizePreferences(inserted);
}

export async function saveNotificationPreferences(
  preferences: NotificationPreferences
): Promise<NotificationPreferences> {
  const { supabase, userId } = await requireUserId();

  const payload = {
    user_id: userId,
    in_app_enabled: preferences.in_app_enabled,
    recurring_due_reminders: preferences.recurring_due_reminders,
    budget_alerts: preferences.budget_alerts,
    reimbursement_updates: preferences.reimbursement_updates,
    account_security_notifications: preferences.account_security_notifications,
    ai_execution_failure_notifications: preferences.ai_execution_failure_notifications,
    significant_item_price_increase_alerts: preferences.significant_item_price_increase_alerts,
    recurring_purchase_due_alerts: preferences.recurring_purchase_due_alerts,
    duplicate_receipt_warning_alerts: preferences.duplicate_receipt_warning_alerts,
    unusual_receipt_total_alerts: preferences.unusual_receipt_total_alerts,
    high_item_or_category_spend_alerts: preferences.high_item_or_category_spend_alerts,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, in_app_enabled, recurring_due_reminders, budget_alerts, reimbursement_updates, account_security_notifications, ai_execution_failure_notifications, significant_item_price_increase_alerts, recurring_purchase_due_alerts, duplicate_receipt_warning_alerts, unusual_receipt_total_alerts, high_item_or_category_spend_alerts, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return normalizePreferences(data);
}

export async function listNotifications(limit = 12): Promise<AppNotification[]> {
  const { supabase, userId } = await requireUserId();

  const { data, error } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, message, action_url, metadata, source_key, is_read, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []) as AppNotification[];
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { supabase, userId } = await requireUserId();

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    throw error;
  }

  return count || 0;
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { supabase, userId } = await requireUserId();

  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('id', notificationId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }

  dispatchSmartPocketDataChanged({
    source: 'notifications:mark-read',
    entities: ['notifications'],
  });
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { supabase, userId } = await requireUserId();

  const { error } = await supabase
    .from('notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('is_read', false);

  if (error) {
    throw error;
  }

  dispatchSmartPocketDataChanged({
    source: 'notifications:mark-all-read',
    entities: ['notifications'],
  });
}

interface NotificationCreateInput {
  type: string;
  title: string;
  message: string;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
  sourceKey?: string | null;
}

export async function createNotificationOnce(input: NotificationCreateInput): Promise<void> {
  const { supabase, userId } = await requireUserId();

  if (input.sourceKey) {
    const { data: existing, error: existingError } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('source_key', input.sourceKey)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing) {
      return;
    }
  }

  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: input.type,
      title: input.title,
      message: input.message,
      action_url: input.actionUrl || null,
      metadata: input.metadata || null,
      source_key: input.sourceKey || null,
    });

  if (error) {
    throw error;
  }

  dispatchSmartPocketDataChanged({
    source: `notifications:create:${input.type}`,
    entities: ['notifications'],
  });
}

export async function createNotificationIfEnabled(
  preferenceKey: NotificationPreferenceKey,
  input: NotificationCreateInput
): Promise<void> {
  const preferences = await getNotificationPreferences();
  if (!preferences.in_app_enabled || !preferences[preferenceKey]) {
    return;
  }

  await createNotificationOnce(input);
}

export async function syncInAppNotificationSignals(): Promise<void> {
  const preferences = await getNotificationPreferences();
  if (!preferences.in_app_enabled) {
    return;
  }

  const { supabase } = await requireUserId();
  const periodContext = await loadUserFinancialPeriodContext();
  const todayIso = periodContext.currentBusinessDate;
  const tomorrowIso = addDays(todayIso, 1);
  const dueSoonIso = addDays(todayIso, 3);
  const currentFinancialPeriod = getCurrentFinancialPeriod(periodContext.effectiveConfig, todayIso);
  const nextFinancialPeriod = getNextFinancialPeriod(periodContext.effectiveConfig, todayIso);

  if (preferences.recurring_due_reminders) {
    if (nextFinancialPeriod.startDate === todayIso) {
      await createNotificationOnce({
        type: 'pay_period_starts_today',
        title: 'Pay period starts today',
        message: `Your ${periodContext.effectiveConfig.incomeFrequency === 'irregular' ? 'planning period' : 'pay period'} starts today.`,
        actionUrl: '/dashboard',
        metadata: {
          period_start: nextFinancialPeriod.startDate,
          period_end: nextFinancialPeriod.endDate,
          period_label_kind: periodContext.effectiveConfig.incomeFrequency === 'irregular' ? 'planning_period' : 'pay_period',
        },
        sourceKey: `pay_period_today:${nextFinancialPeriod.startDate}`,
      });
    } else if (nextFinancialPeriod.startDate === tomorrowIso) {
      await createNotificationOnce({
        type: 'pay_period_starts_tomorrow',
        title: 'Pay period starts tomorrow',
        message: `Your ${periodContext.effectiveConfig.incomeFrequency === 'irregular' ? 'planning period' : 'pay period'} starts tomorrow.`,
        actionUrl: '/dashboard',
        metadata: {
          period_start: nextFinancialPeriod.startDate,
          period_end: nextFinancialPeriod.endDate,
          period_label_kind: periodContext.effectiveConfig.incomeFrequency === 'irregular' ? 'planning_period' : 'pay_period',
        },
        sourceKey: `pay_period_tomorrow:${nextFinancialPeriod.startDate}`,
      });
    }

    const billsBeforePaydayEnd = addDays(nextFinancialPeriod.startDate, -1);
    if (billsBeforePaydayEnd >= todayIso) {
      const { data: billsBeforePayday, error: billsBeforePaydayError } = await supabase
        .from('recurring_transactions')
        .select('id, description, amount, currency, next_due_date, frequency')
        .eq('is_active', true)
        .eq('transaction_type', 'expense')
        .gte('next_due_date', todayIso)
        .lte('next_due_date', billsBeforePaydayEnd)
        .order('next_due_date', { ascending: true });

      if (billsBeforePaydayError) {
        throw billsBeforePaydayError;
      }

      const dueBills = billsBeforePayday || [];
      if (dueBills.length > 0) {
        const dueTotals = sumRecurringDueByCurrency(dueBills);
        const dueTotalsText = await formatGroupedCurrencyTotals(dueTotals);
        await createNotificationOnce({
          type: 'bills_before_next_payday',
          title: 'Bills due before next payday',
          message: `${dueTotalsText} in bills is due before your next payday on ${nextFinancialPeriod.startDate}.`,
          actionUrl: '/recurring',
          metadata: {
            next_payday: nextFinancialPeriod.startDate,
            total_due_by_currency: dueTotals,
            recurring_count: dueBills.length,
          },
          sourceKey: `bills_before_payday:${nextFinancialPeriod.startDate}`,
        });
      }
    }

    const { data: recurringDueSoon, error: recurringError } = await supabase
      .from('recurring_transactions')
      .select('id, description, amount, currency, next_due_date, frequency')
      .eq('is_active', true)
      .eq('transaction_type', 'expense')
      .gte('next_due_date', todayIso)
      .lte('next_due_date', dueSoonIso)
      .order('next_due_date', { ascending: true })
      .limit(12);

    if (recurringError) {
      throw recurringError;
    }

    for (const recurring of recurringDueSoon || []) {
      await createNotificationOnce({
        type: 'recurring_due_soon',
        title: 'Recurring payment due soon',
        message: `${recurring.description || 'A recurring payment'} (${formatRecurringFrequencyLabel(recurring.frequency || '')}) is due on ${recurring.next_due_date}.`,
        actionUrl: '/recurring',
        metadata: {
          recurring_id: recurring.id,
          description: recurring.description || null,
          amount: recurring.amount,
          currency: recurring.currency,
          frequency_key: getRecurringFrequencyLabelKey(recurring.frequency || ''),
          frequency_label: formatRecurringFrequencyLabel(recurring.frequency || ''),
          next_due_date: recurring.next_due_date,
        },
        sourceKey: `recurring_due:${recurring.id}:${recurring.next_due_date}`,
      });

      if (
        recurring.next_due_date >= currentFinancialPeriod.startDate &&
        recurring.next_due_date <= currentFinancialPeriod.endDate &&
        Math.abs(Number(recurring.amount || 0)) >= 500
      ) {
        const largePaymentText = await formatCurrencyTotal(
          recurring.currency || 'USD',
          Math.abs(Number(recurring.amount || 0))
        );
        await createNotificationOnce({
          type: 'large_payment_due_this_period',
          title: 'Large payment due this pay period',
          message: `${recurring.description || 'A recurring payment'} of ${largePaymentText} is due this ${periodContext.effectiveConfig.incomeFrequency === 'irregular' ? 'planning period' : 'pay period'}.`,
          actionUrl: '/recurring',
          metadata: {
            recurring_id: recurring.id,
            description: recurring.description || null,
            amount: recurring.amount,
            currency: recurring.currency,
            next_due_date: recurring.next_due_date,
            period_label_kind: periodContext.effectiveConfig.incomeFrequency === 'irregular' ? 'planning_period' : 'pay_period',
          },
          sourceKey: `large_due:${recurring.id}:${currentFinancialPeriod.startDate}:${currentFinancialPeriod.endDate}`,
        });
      }
    }
  }

  if (preferences.budget_alerts) {
    const budgets = await getBudgets(todayIso);

    for (const budget of budgets) {
      const amount = Number(budget.amount || 0);
      if (amount <= 0) continue;

      const spent = Number(budget.spent || 0);
      const usedPct = (spent / amount) * 100;
      const threshold = Number(budget.alert_at_percent || 80);
      if (usedPct >= 100) {
        await createNotificationOnce({
          type: 'budget_exceeded',
          title: 'Budget exceeded',
          message: `${budget.category?.name || budget.name} is over budget at ${usedPct.toFixed(1)}% for the active budget period.`,
          actionUrl: '/budgets',
          metadata: {
            budget_id: budget.id,
            budget_name: budget.category?.name || budget.name,
            period_start: budget.period_start,
            used_pct: usedPct,
            currency: budget.currency,
          },
          sourceKey: `budget_exceeded:${budget.id}:${budget.period_start}`,
        });
        continue;
      }
      if (usedPct < threshold) continue;

      await createNotificationOnce({
        type: 'budget_threshold_reached',
        title: 'Budget near limit',
        message: `${budget.category?.name || budget.name} has reached ${usedPct.toFixed(1)}% of its budget for the active budget period.`,
        actionUrl: '/budgets',
        metadata: {
          budget_id: budget.id,
          budget_name: budget.category?.name || budget.name,
          period_start: budget.period_start,
          threshold,
          used_pct: usedPct,
          currency: budget.currency,
        },
        sourceKey: `budget_alert:${budget.id}:${budget.period_start}:${threshold}`,
      });
    }
  }

}
