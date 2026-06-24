export const PERSONAL_SUBSCRIPTION_STATUSES = [
  'trial',
  'active',
  'paused',
  'cancellation_requested',
  'cancelling',
  'cancelled',
  'expired',
] as const;

export const PERSONAL_SUBSCRIPTION_BILLING_FREQUENCIES = [
  'weekly',
  'monthly',
  'quarterly',
  'semi_annual',
  'yearly',
  'custom',
] as const;

export const PERSONAL_SUBSCRIPTION_PAYMENT_METHODS = [
  'Credit Card',
  'Debit Card',
  'Bank Account',
  'PayPal',
  'Cash',
  'Apple Pay',
  'Google Pay',
  'Other',
] as const;

export const PERSONAL_SUBSCRIPTION_REMINDER_OPTIONS = [1, 3, 7, 14, 30] as const;

export const PERSONAL_SUBSCRIPTION_LIST_FILTERS = [
  'all',
  'active',
  'trial',
  'paused',
  'cancelling',
  'cancelled',
  'expired',
  'upcoming_7_days',
  'trial_ending',
  'cancellation_deadline',
] as const;

export const PERSONAL_SUBSCRIPTION_LINKED_RECURRING_SUPPORTED_FREQUENCIES = [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;

export type PersonalSubscriptionStatus = (typeof PERSONAL_SUBSCRIPTION_STATUSES)[number];
export type PersonalSubscriptionBillingFrequency = (typeof PERSONAL_SUBSCRIPTION_BILLING_FREQUENCIES)[number];
export type PersonalSubscriptionPaymentMethod = (typeof PERSONAL_SUBSCRIPTION_PAYMENT_METHODS)[number];
export type PersonalSubscriptionListFilter = (typeof PERSONAL_SUBSCRIPTION_LIST_FILTERS)[number];
export type PersonalSubscriptionWarningLevel = 'info' | 'warning' | 'urgent';
export type PersonalSubscriptionWarningType =
  | 'upcoming_payment'
  | 'trial_ending'
  | 'cancellation_deadline'
  | 'over_threshold'
  | 'expired';

export interface PersonalSubscription {
  id: string;
  user_id: string;
  name: string;
  provider: string | null;
  description: string | null;
  category_id: string | null;
  financial_account_id: string | null;
  recurring_transaction_id: string | null;
  amount: number;
  currency_code: string;
  billing_frequency: PersonalSubscriptionBillingFrequency;
  billing_interval: number;
  start_date: string | null;
  next_billing_date: string | null;
  trial_end_date: string | null;
  contract_end_date: string | null;
  auto_renew: boolean;
  payment_method: PersonalSubscriptionPaymentMethod | null;
  cancellation_notice_days: number;
  cancellation_deadline: string | null;
  reminder_days_before: number[];
  warning_threshold_amount: number | null;
  website_url: string | null;
  account_reference: string | null;
  notes: string | null;
  status: PersonalSubscriptionStatus;
  last_paid_date: string | null;
  cancel_requested_at: string | null;
  cancel_effective_date: string | null;
  cancel_confirmation_reference: string | null;
  created_at: string;
  updated_at: string;
  account?: {
    id?: string;
    name: string;
    currency?: string;
  } | null;
  category?: {
    id?: string;
    name: string;
    color: string | null;
  } | null;
  recurring_transaction?: {
    id?: string;
    description: string;
    frequency: string;
    next_due_date: string;
    is_active: boolean;
  } | null;
}

export interface PersonalSubscriptionUpsertInput {
  name?: string;
  provider?: string | null;
  description?: string | null;
  category_id?: string | null;
  financial_account_id?: string | null;
  recurring_transaction_id?: string | null;
  amount?: number;
  currency_code?: string;
  billing_frequency?: PersonalSubscriptionBillingFrequency;
  billing_interval?: number;
  start_date?: string | null;
  next_billing_date?: string | null;
  trial_end_date?: string | null;
  contract_end_date?: string | null;
  auto_renew?: boolean;
  payment_method?: PersonalSubscriptionPaymentMethod | null;
  cancellation_notice_days?: number;
  cancellation_deadline?: string | null;
  reminder_days_before?: number[];
  warning_threshold_amount?: number | null;
  website_url?: string | null;
  account_reference?: string | null;
  notes?: string | null;
  status?: PersonalSubscriptionStatus;
  last_paid_date?: string | null;
  cancel_requested_at?: string | null;
  cancel_effective_date?: string | null;
  cancel_confirmation_reference?: string | null;
}

export interface PersonalSubscriptionWarning {
  type: PersonalSubscriptionWarningType;
  level: PersonalSubscriptionWarningLevel;
  daysUntil: number | null;
}

export interface PersonalSubscriptionSummaryTotals {
  monthlyEstimate: number;
  annualEstimate: number;
  activeCount: number;
  trialCount: number;
  upcomingChargesCount: number;
  trialsEndingSoonCount: number;
  cancellationDeadlineCount: number;
}

function normalizeDate(dateString: string) {
  return new Date(`${dateString}T12:00:00Z`);
}

function addMonthsClamped(dateString: string, monthDelta: number) {
  const date = normalizeDate(dateString);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetYear = year + Math.floor((month + monthDelta) / 12);
  const targetMonth = ((month + monthDelta) % 12 + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0, 12, 0, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, daysInTargetMonth), 12, 0, 0))
    .toISOString()
    .slice(0, 10);
}

export function getDaysUntilDate(targetDate: string, todayIso: string) {
  const today = normalizeDate(todayIso);
  const target = normalizeDate(targetDate);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function isPersonalSubscriptionStatus(value: string | null | undefined): value is PersonalSubscriptionStatus {
  return PERSONAL_SUBSCRIPTION_STATUSES.includes(value as PersonalSubscriptionStatus);
}

export function isPersonalSubscriptionBillingFrequency(
  value: string | null | undefined
): value is PersonalSubscriptionBillingFrequency {
  return PERSONAL_SUBSCRIPTION_BILLING_FREQUENCIES.includes(value as PersonalSubscriptionBillingFrequency);
}

export function isPersonalSubscriptionPaymentMethod(
  value: string | null | undefined
): value is PersonalSubscriptionPaymentMethod {
  return PERSONAL_SUBSCRIPTION_PAYMENT_METHODS.includes(value as PersonalSubscriptionPaymentMethod);
}

export function supportsLinkedRecurringExpense(
  frequency: PersonalSubscriptionBillingFrequency
): frequency is (typeof PERSONAL_SUBSCRIPTION_LINKED_RECURRING_SUPPORTED_FREQUENCIES)[number] {
  return PERSONAL_SUBSCRIPTION_LINKED_RECURRING_SUPPORTED_FREQUENCIES.includes(
    frequency as (typeof PERSONAL_SUBSCRIPTION_LINKED_RECURRING_SUPPORTED_FREQUENCIES)[number]
  );
}

export function toRecurringFrequency(
  frequency: PersonalSubscriptionBillingFrequency
): 'weekly' | 'monthly' | 'quarterly' | 'yearly' | null {
  if (!supportsLinkedRecurringExpense(frequency)) {
    return null;
  }
  return frequency;
}

export function normalizeReminderDays(days: number[] | null | undefined) {
  const allowed = new Set<number>(PERSONAL_SUBSCRIPTION_REMINDER_OPTIONS);
  return Array.from(new Set((days || []).filter((value) => allowed.has(value)))).sort((left, right) => left - right);
}

export function calculateNextPersonalSubscriptionBillingDate(
  currentDate: string,
  frequency: PersonalSubscriptionBillingFrequency,
  interval = 1
) {
  const safeInterval = Math.max(1, Number(interval || 1));
  const date = normalizeDate(currentDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  switch (frequency) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + (7 * safeInterval));
      return date.toISOString().slice(0, 10);
    case 'monthly':
      return addMonthsClamped(currentDate, safeInterval);
    case 'quarterly':
      return addMonthsClamped(currentDate, 3 * safeInterval);
    case 'semi_annual':
      return addMonthsClamped(currentDate, 6 * safeInterval);
    case 'yearly':
      return addMonthsClamped(currentDate, 12 * safeInterval);
    case 'custom':
      return addMonthsClamped(currentDate, safeInterval);
    default:
      return null;
  }
}

export function calculatePreviousPersonalSubscriptionBillingDate(
  currentDate: string,
  frequency: PersonalSubscriptionBillingFrequency,
  interval = 1
) {
  const safeInterval = Math.max(1, Number(interval || 1));
  const date = normalizeDate(currentDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  switch (frequency) {
    case 'weekly':
      date.setUTCDate(date.getUTCDate() - (7 * safeInterval));
      return date.toISOString().slice(0, 10);
    case 'monthly':
      return addMonthsClamped(currentDate, -safeInterval);
    case 'quarterly':
      return addMonthsClamped(currentDate, -(3 * safeInterval));
    case 'semi_annual':
      return addMonthsClamped(currentDate, -(6 * safeInterval));
    case 'yearly':
      return addMonthsClamped(currentDate, -(12 * safeInterval));
    case 'custom':
      return addMonthsClamped(currentDate, -safeInterval);
    default:
      return null;
  }
}

export function getPersonalSubscriptionBillingWindow(subscription: Pick<
  PersonalSubscription,
  'next_billing_date' | 'billing_frequency' | 'billing_interval'
>) {
  if (!subscription.next_billing_date) {
    return null;
  }

  const periodStart = calculatePreviousPersonalSubscriptionBillingDate(
    subscription.next_billing_date,
    subscription.billing_frequency,
    subscription.billing_interval
  ) || subscription.next_billing_date;
  const periodEndExclusive = calculateNextPersonalSubscriptionBillingDate(
    subscription.next_billing_date,
    subscription.billing_frequency,
    subscription.billing_interval
  );

  return {
    periodStart,
    periodEndExclusive,
  };
}

export function shouldStopRemindersAfterEffectiveDate(subscription: Pick<
  PersonalSubscription,
  'cancel_effective_date' | 'status'
>, dateIso: string) {
  if (subscription.status === 'cancelled' || subscription.status === 'expired') {
    return true;
  }

  if (!subscription.cancel_effective_date) {
    return false;
  }

  return dateIso > subscription.cancel_effective_date;
}

export function isPersonalSubscriptionActiveSummaryStatus(status: PersonalSubscriptionStatus) {
  return status === 'active' || status === 'cancellation_requested' || status === 'cancelling';
}

export function isPersonalSubscriptionUpcomingChargeStatus(status: PersonalSubscriptionStatus) {
  return status === 'trial' || isPersonalSubscriptionActiveSummaryStatus(status);
}

export function canRequestPersonalSubscriptionCancellation(status: PersonalSubscriptionStatus) {
  return status === 'trial' || status === 'active' || status === 'paused';
}

export function canMarkPersonalSubscriptionCancelled(status: PersonalSubscriptionStatus) {
  return status === 'cancellation_requested' || status === 'cancelling';
}

export function canPauseOrResumePersonalSubscription(status: PersonalSubscriptionStatus) {
  return status !== 'cancelled' && status !== 'expired';
}

export function getPersonalSubscriptionUpcomingChargeInfo(subscription: Pick<
  PersonalSubscription,
  'next_billing_date' | 'cancel_effective_date' | 'status'
>, todayIso: string) {
  if (!isPersonalSubscriptionUpcomingChargeStatus(subscription.status)) {
    return null;
  }

  if (!subscription.next_billing_date) {
    return null;
  }

  if (shouldStopRemindersAfterEffectiveDate(subscription, subscription.next_billing_date)) {
    return null;
  }

  const daysUntil = getDaysUntilDate(subscription.next_billing_date, todayIso);
  if (daysUntil < 0 || daysUntil > 7) {
    return null;
  }

  return {
    nextBillingDate: subscription.next_billing_date,
    daysUntil,
  };
}

export function getUpcomingPersonalSubscriptionCharges<T extends Pick<
  PersonalSubscription,
  'next_billing_date' | 'cancel_effective_date' | 'status'
>>(
  subscriptions: T[],
  todayIso: string
) {
  return subscriptions
    .filter((subscription) => getPersonalSubscriptionUpcomingChargeInfo(subscription, todayIso) !== null)
    .sort((left, right) => {
      const leftInfo = getPersonalSubscriptionUpcomingChargeInfo(left, todayIso);
      const rightInfo = getPersonalSubscriptionUpcomingChargeInfo(right, todayIso);
      if (!leftInfo || !rightInfo) {
        return 0;
      }
      if (leftInfo.daysUntil !== rightInfo.daysUntil) {
        return leftInfo.daysUntil - rightInfo.daysUntil;
      }
      return leftInfo.nextBillingDate.localeCompare(rightInfo.nextBillingDate);
    });
}

export function getMonthlyCostEstimate(subscription: Pick<
  PersonalSubscription,
  'amount' | 'billing_frequency' | 'billing_interval'
>) {
  const amount = Math.abs(Number(subscription.amount || 0));
  const interval = Math.max(1, Number(subscription.billing_interval || 1));

  switch (subscription.billing_frequency) {
    case 'weekly':
      return (amount * 52) / 12 / interval;
    case 'monthly':
      return amount / interval;
    case 'quarterly':
      return (amount * 4) / 12 / interval;
    case 'semi_annual':
      return (amount * 2) / 12 / interval;
    case 'yearly':
      return amount / 12 / interval;
    case 'custom':
      return amount / interval;
    default:
      return amount;
  }
}

export function getAnnualCostEstimate(subscription: Pick<
  PersonalSubscription,
  'amount' | 'billing_frequency' | 'billing_interval'
>) {
  const amount = Math.abs(Number(subscription.amount || 0));
  const interval = Math.max(1, Number(subscription.billing_interval || 1));

  switch (subscription.billing_frequency) {
    case 'weekly':
      return (amount * 52) / interval;
    case 'monthly':
      return (amount * 12) / interval;
    case 'quarterly':
      return (amount * 4) / interval;
    case 'semi_annual':
      return (amount * 2) / interval;
    case 'yearly':
      return amount / interval;
    case 'custom':
      return (amount * 12) / interval;
    default:
      return amount;
  }
}

export function getPersonalSubscriptionWarnings(
  subscription: Pick<
    PersonalSubscription,
    | 'amount'
    | 'warning_threshold_amount'
    | 'next_billing_date'
    | 'trial_end_date'
    | 'cancellation_deadline'
    | 'contract_end_date'
    | 'cancel_effective_date'
    | 'status'
  >,
  todayIso: string
) {
  const warnings: PersonalSubscriptionWarning[] = [];

  const upcomingCharge = getPersonalSubscriptionUpcomingChargeInfo(subscription, todayIso);
  if (upcomingCharge) {
    warnings.push({
      type: 'upcoming_payment',
      level: upcomingCharge.daysUntil <= 1 ? 'urgent' : upcomingCharge.daysUntil <= 3 ? 'warning' : 'info',
      daysUntil: upcomingCharge.daysUntil,
    });
  }

  if (subscription.trial_end_date) {
    const daysUntil = getDaysUntilDate(subscription.trial_end_date, todayIso);
    if (daysUntil >= 0 && daysUntil <= 7) {
      warnings.push({
        type: 'trial_ending',
        level: daysUntil <= 1 ? 'urgent' : 'warning',
        daysUntil,
      });
    }
  }

  if (
    subscription.cancellation_deadline &&
    !shouldStopRemindersAfterEffectiveDate(subscription, subscription.cancellation_deadline)
  ) {
    const daysUntil = getDaysUntilDate(subscription.cancellation_deadline, todayIso);
    if (daysUntil >= 0 && daysUntil <= 14) {
      warnings.push({
        type: 'cancellation_deadline',
        level: daysUntil <= 3 ? 'urgent' : 'warning',
        daysUntil,
      });
    }
  }

  if (
    subscription.warning_threshold_amount !== null &&
    subscription.warning_threshold_amount !== undefined &&
    Number(subscription.amount || 0) > Number(subscription.warning_threshold_amount || 0)
  ) {
    warnings.push({
      type: 'over_threshold',
      level: 'warning',
      daysUntil: null,
    });
  }

  if (subscription.contract_end_date) {
    const daysUntil = getDaysUntilDate(subscription.contract_end_date, todayIso);
    if (daysUntil < 0) {
      warnings.push({
        type: 'expired',
        level: 'urgent',
        daysUntil,
      });
    }
  }

  return warnings;
}

export function getHighestPriorityPersonalSubscriptionWarning(
  subscription: Pick<
    PersonalSubscription,
    | 'amount'
    | 'warning_threshold_amount'
    | 'next_billing_date'
    | 'trial_end_date'
    | 'cancellation_deadline'
    | 'contract_end_date'
    | 'cancel_effective_date'
    | 'status'
  >,
  todayIso: string
) {
  const levelWeight: Record<PersonalSubscriptionWarningLevel, number> = {
    info: 1,
    warning: 2,
    urgent: 3,
  };

  return getPersonalSubscriptionWarnings(subscription, todayIso)
    .sort((left, right) => {
      const weightDelta = levelWeight[right.level] - levelWeight[left.level];
      if (weightDelta !== 0) {
        return weightDelta;
      }

      const leftDays = left.daysUntil ?? Number.MAX_SAFE_INTEGER;
      const rightDays = right.daysUntil ?? Number.MAX_SAFE_INTEGER;
      return leftDays - rightDays;
    })[0] || null;
}

export function getPersonalSubscriptionsSummaryTotals(
  subscriptions: PersonalSubscription[],
  todayIso: string
): PersonalSubscriptionSummaryTotals {
  const spendingSubscriptions = subscriptions.filter((subscription) =>
    subscription.status === 'trial'
    || isPersonalSubscriptionActiveSummaryStatus(subscription.status)
  );

  return {
    monthlyEstimate: spendingSubscriptions.reduce(
      (sum, subscription) => sum + getMonthlyCostEstimate(subscription),
      0
    ),
    annualEstimate: spendingSubscriptions.reduce(
      (sum, subscription) => sum + getAnnualCostEstimate(subscription),
      0
    ),
    activeCount: subscriptions.filter((subscription) => isPersonalSubscriptionActiveSummaryStatus(subscription.status)).length,
    trialCount: subscriptions.filter((subscription) => subscription.status === 'trial').length,
    upcomingChargesCount: getUpcomingPersonalSubscriptionCharges(subscriptions, todayIso).length,
    trialsEndingSoonCount: subscriptions.filter((subscription) =>
      getPersonalSubscriptionWarnings(subscription, todayIso).some((warning) => warning.type === 'trial_ending')
    ).length,
    cancellationDeadlineCount: subscriptions.filter((subscription) =>
      getPersonalSubscriptionWarnings(subscription, todayIso).some((warning) => warning.type === 'cancellation_deadline')
    ).length,
  };
}

export function normalizePersonalSubscriptionRecord(record: PersonalSubscription): PersonalSubscription {
  return {
    ...record,
    amount: Number(record.amount || 0),
    billing_interval: Math.max(1, Number(record.billing_interval || 1)),
    cancellation_notice_days: Math.max(0, Number(record.cancellation_notice_days || 0)),
    warning_threshold_amount:
      record.warning_threshold_amount === null || record.warning_threshold_amount === undefined
        ? null
        : Number(record.warning_threshold_amount),
    reminder_days_before: normalizeReminderDays(record.reminder_days_before),
  };
}

export function normalizeWebsiteUrl(value: string | null | undefined) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
