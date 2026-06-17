import { createClient } from '@/lib/supabase/client';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { getBudgets } from '@/lib/finance';

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

export interface NotificationPreferences {
  user_id?: string;
  in_app_enabled: boolean;
  recurring_due_reminders: boolean;
  budget_alerts: boolean;
  reimbursement_updates: boolean;
  account_security_notifications: boolean;
  ai_execution_failure_notifications: boolean;
  updated_at?: string;
}

export type NotificationPreferenceKey =
  | 'in_app_enabled'
  | 'recurring_due_reminders'
  | 'budget_alerts'
  | 'reimbursement_updates'
  | 'account_security_notifications'
  | 'ai_execution_failure_notifications';

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  in_app_enabled: true,
  recurring_due_reminders: true,
  budget_alerts: true,
  reimbursement_updates: true,
  account_security_notifications: true,
  ai_execution_failure_notifications: true,
};

function getCurrentMonthStart() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
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
    .select('user_id, in_app_enabled, recurring_due_reminders, budget_alerts, reimbursement_updates, account_security_notifications, ai_execution_failure_notifications, updated_at')
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
    .select('user_id, in_app_enabled, recurring_due_reminders, budget_alerts, reimbursement_updates, account_security_notifications, ai_execution_failure_notifications, updated_at')
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
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('user_id, in_app_enabled, recurring_due_reminders, budget_alerts, reimbursement_updates, account_security_notifications, ai_execution_failure_notifications, updated_at')
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

  const { supabase, userId } = await requireUserId();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const dueSoonIso = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  if (preferences.recurring_due_reminders) {
    const { data: recurringDueSoon, error: recurringError } = await supabase
      .from('recurring_transactions')
      .select('id, description, amount, currency, next_due_date')
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
        message: `${recurring.description || 'A recurring payment'} is due on ${recurring.next_due_date}.`,
        actionUrl: '/recurring',
        metadata: {
          recurring_id: recurring.id,
          amount: recurring.amount,
          currency: recurring.currency,
          next_due_date: recurring.next_due_date,
        },
        sourceKey: `recurring_due:${recurring.id}:${recurring.next_due_date}`,
      });
    }
  }

  if (preferences.budget_alerts) {
    const budgets = await getBudgets(getCurrentMonthStart());

    for (const budget of budgets) {
      const amount = Number(budget.amount || 0);
      if (amount <= 0) continue;

      const spent = Number(budget.spent || 0);
      const usedPct = (spent / amount) * 100;
      const threshold = Number(budget.alert_at_percent || 80);
      if (usedPct < threshold) continue;

      await createNotificationOnce({
        type: 'budget_threshold_reached',
        title: 'Budget alert',
        message: `${budget.category?.name || budget.name} has reached ${usedPct.toFixed(1)}% of its budget.`,
        actionUrl: '/budgets',
        metadata: {
          budget_id: budget.id,
          period_start: budget.period_start,
          threshold,
          used_pct: usedPct,
          currency: budget.currency,
        },
        sourceKey: `budget_alert:${budget.id}:${budget.period_start}:${threshold}`,
      });
    }
  }

  dispatchSmartPocketDataChanged({
    source: `notifications:sync:${userId}`,
    entities: ['notifications'],
  });
}
