import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendTransactionalEmail } from '@/lib/email/transactional';

function getBearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }
  return authorization.slice(7).trim();
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function daysBetween(now: Date, future: Date) {
  return Math.ceil((future.getTime() - now.getTime()) / 86400000);
}

function normalizeEmailFallbackName(email: string) {
  const part = (email || '').split('@')[0]?.trim();
  return part || 'there';
}

async function loadProfile(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string
) {
  const { data } = await admin
    .from('user_profiles')
    .select('email,full_name,created_at,updated_at,country')
    .eq('id', userId)
    .maybeSingle();

  const email = ((data as any)?.email as string) || '';
  const name = ((data as any)?.full_name as string) || '';
  return {
    email,
    name,
    createdAt: ((data as any)?.created_at as string | null) || null,
    updatedAt: ((data as any)?.updated_at as string | null) || null,
    country: ((data as any)?.country as string | null) || null,
  };
}

async function loadNotificationSettings(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data } = await admin
    .from('email_notification_settings')
    .select('trial_reminder_days,onboarding_reminder_days,renewal_reminder_days')
    .eq('singleton_lock', true)
    .maybeSingle();

  const trialReminderDays = ((data as any)?.trial_reminder_days as number[] | null) || [7, 3, 1];
  const onboardingReminderDays = Number((data as any)?.onboarding_reminder_days ?? 3);
  const renewalReminderDays = Number((data as any)?.renewal_reminder_days ?? 7);

  return {
    trialReminderDays: trialReminderDays.filter((d) => Number.isFinite(d)).map((d) => Math.max(0, Math.floor(d))),
    onboardingReminderDays: Number.isFinite(onboardingReminderDays) ? Math.max(0, Math.floor(onboardingReminderDays)) : 3,
    renewalReminderDays: Number.isFinite(renewalReminderDays) ? Math.max(0, Math.floor(renewalReminderDays)) : 7,
  };
}

async function processNewUsers(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const { data: users, error } = await admin
    .from('user_profiles')
    .select('id,email,full_name,created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  let sent = 0;
  let skipped = 0;

  for (const row of users || []) {
    const userId = (row as any).id as string;
    const customerEmail = (row as any).email as string;
    const customerName = ((row as any).full_name as string) || '';

    let method = 'email';
    let emailConfirmedAt: string | null = null;
    try {
      const authUser = await (admin as any).auth.admin.getUserById(userId);
      emailConfirmedAt = (authUser?.data?.user?.email_confirmed_at as string | null) || null;
      const provider = authUser?.data?.user?.app_metadata?.provider;
      const identities = authUser?.data?.user?.identities || [];
      method = (provider || identities?.[0]?.provider || 'email') as string;
    } catch {
      method = 'email';
    }

    if (!emailConfirmedAt) {
      skipped += 1;
      continue;
    }

    const [welcome, adminNotif] = await Promise.all([
      sendTransactionalEmail({
        eventKey: `customer_welcome:${userId}`,
        templateKey: 'customer_welcome',
        to: { email: customerEmail, name: customerName },
        userId,
        variables: {
          customer_name: customerName || normalizeEmailFallbackName(customerEmail),
          customer_email: customerEmail,
          registration_method: method,
        },
      }),
      sendTransactionalEmail({
        eventKey: `admin_new_user_registered:${userId}`,
        templateKey: 'admin_new_user_registered',
        to: { email: customerEmail, name: customerName },
        userId,
        variables: {
          customer_name: customerName || normalizeEmailFallbackName(customerEmail) || 'Unknown',
          customer_email: customerEmail,
          registration_method: method,
        },
      }),
    ]);

    if (welcome.status === 'sent' || adminNotif.status === 'sent') {
      sent += 1;
    } else {
      skipped += 1;
    }
  }

  return { processed: (users || []).length, sent, skipped };
}

async function processOnboarding(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { onboardingReminderDays } = await loadNotificationSettings(admin);
  const now = new Date();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const { data: candidates, error } = await admin
    .from('user_profiles')
    .select('id,email,full_name,created_at,updated_at,onboarding_completed_at')
    .gte('created_at', since)
    .order('updated_at', { ascending: false })
    .limit(600);
  if (error) throw error;

  let completedSent = 0;
  let incompleteSent = 0;

  for (const row of candidates || []) {
    const userId = (row as any).id as string;
    const customerEmail = (row as any).email as string;
    const customerName = ((row as any).full_name as string) || '';
    const onboardingCompletedAt = (row as any).onboarding_completed_at as string | null;
    const createdAtRaw = (row as any).created_at as string;
    const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;

    if (onboardingCompletedAt) {
      const [customerResult, adminResult] = await Promise.all([
        sendTransactionalEmail({
          eventKey: `customer_onboarding_completed:${userId}`,
          templateKey: 'customer_onboarding_completed',
          to: { email: customerEmail, name: customerName },
          userId,
          variables: {
            customer_name: customerName || normalizeEmailFallbackName(customerEmail),
            customer_email: customerEmail,
          },
        }),
        sendTransactionalEmail({
          eventKey: `admin_user_onboarding_completed:${userId}`,
          templateKey: 'admin_user_onboarding_completed',
          to: { email: customerEmail, name: customerName },
          userId,
          variables: {
            customer_name: customerName || normalizeEmailFallbackName(customerEmail) || 'Unknown',
            customer_email: customerEmail,
          },
        }),
      ]);

      if (customerResult.status === 'sent' || adminResult.status === 'sent') {
        completedSent += 1;
      }

      continue;
    }

    if (!createdAt) continue;
    const reminderAt = new Date(createdAt.getTime() + onboardingReminderDays * 86400000);
    if (now.getTime() < reminderAt.getTime()) continue;

    const reminderKey = `${toIsoDate(reminderAt)}:${onboardingReminderDays}`;

    const [customerResult, adminResult] = await Promise.all([
      sendTransactionalEmail({
        eventKey: `customer_onboarding_incomplete:${userId}:${reminderKey}`,
        templateKey: 'customer_onboarding_incomplete',
        to: { email: customerEmail, name: customerName },
        userId,
        variables: {
          customer_name: customerName || normalizeEmailFallbackName(customerEmail),
          customer_email: customerEmail,
        },
      }),
      sendTransactionalEmail({
        eventKey: `admin_user_onboarding_incomplete:${userId}:${reminderKey}`,
        templateKey: 'admin_user_onboarding_incomplete',
        to: { email: customerEmail, name: customerName },
        userId,
        variables: {
          customer_name: customerName || normalizeEmailFallbackName(customerEmail) || 'Unknown',
          customer_email: customerEmail,
        },
      }),
    ]);

    if (customerResult.status === 'sent' || adminResult.status === 'sent') {
      incompleteSent += 1;
    }
  }

  return { processed: (candidates || []).length, completedSent, incompleteSent, onboardingReminderDays };
}

async function processTrialExpirations(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const now = new Date();
  const { data: expiring, error } = await admin
    .from('user_subscriptions')
    .select('id,user_id,trial_ends_at')
    .eq('status', 'trialing')
    .lt('trial_ends_at', now.toISOString())
    .order('trial_ends_at', { ascending: true })
    .limit(200);

  if (error) throw error;

  const expiredRows = (expiring || []).filter((row) => Boolean((row as any).trial_ends_at));
  if (expiredRows.length === 0) {
    return { candidates: 0, expired: 0, emailsSent: 0 };
  }

  const ids = expiredRows.map((row) => (row as any).id as string);
  const { data: updated, error: updateError } = await admin
    .from('user_subscriptions')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .in('id', ids)
    .select('id,user_id,trial_ends_at');

  if (updateError) throw updateError;

  let emailsSent = 0;

  for (const row of updated || []) {
    const subscriptionId = (row as any).id as string;
    const userId = (row as any).user_id as string;

    const profile = await loadProfile(admin, userId);
    if (!profile.email) continue;

    const [customerResult, adminResult] = await Promise.all([
      sendTransactionalEmail({
        eventKey: `customer_trial_expired:${subscriptionId}`,
        templateKey: 'customer_trial_expired',
        to: { email: profile.email, name: profile.name },
        userId,
        subscriptionId,
        variables: {
          customer_name: profile.name || normalizeEmailFallbackName(profile.email),
          customer_email: profile.email,
        },
      }),
      sendTransactionalEmail({
        eventKey: `admin_trial_expired:${subscriptionId}`,
        templateKey: 'admin_trial_expired',
        to: { email: profile.email, name: profile.name },
        userId,
        subscriptionId,
        variables: {
          customer_name: profile.name || normalizeEmailFallbackName(profile.email) || 'Unknown',
          customer_email: profile.email,
        },
      }),
    ]);

    if (customerResult.status === 'sent' || adminResult.status === 'sent') {
      emailsSent += 1;
    }
  }

  return { candidates: expiredRows.length, expired: (updated || []).length, emailsSent };
}

async function processTrials(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const now = new Date();
  const settings = await loadNotificationSettings(admin);
  const daysList = settings.trialReminderDays;
  const lookaheadDays = Math.max(...daysList, 0);
  const sinceStart = new Date(Date.now() - 30 * 86400000).toISOString();
  const lookaheadIso = new Date(Date.now() + (lookaheadDays + 1) * 86400000).toISOString();

  const { data: subs, error } = await admin
    .from('user_subscriptions')
    .select('id,user_id,status,trial_started_at,trial_ends_at,subscription_plans(plan_code,plan_name)')
    .eq('status', 'trialing')
    .gte('trial_started_at', sinceStart)
    .not('trial_ends_at', 'is', null)
    .lte('trial_ends_at', lookaheadIso)
    .limit(300);

  if (error) throw error;

  let startedSent = 0;
  let reminderSent = 0;
  let adminReminderSent = 0;

  const templateKeyByDays: Record<number, string> = {
    7: 'customer_trial_expiring_7_days',
    3: 'customer_trial_expiring_3_days',
    1: 'customer_trial_expiring_1_day',
  };

  for (const row of subs || []) {
    const userId = (row as any).user_id as string;
    const subscriptionId = (row as any).id as string;
    const trialEndsAtRaw = (row as any).trial_ends_at as string;
    if (!trialEndsAtRaw) continue;
    const trialEndsAt = new Date(trialEndsAtRaw);
    const daysRemaining = daysBetween(now, trialEndsAt);
    const trialEndDate = toIsoDate(trialEndsAt);

    const profile = await loadProfile(admin, userId);
    if (!profile.email) continue;

    const started = await sendTransactionalEmail({
      eventKey: `customer_trial_started:${subscriptionId}`,
      templateKey: 'customer_trial_started',
      to: { email: profile.email, name: profile.name },
      userId,
      subscriptionId,
      variables: {
        customer_name: profile.name || normalizeEmailFallbackName(profile.email),
        customer_email: profile.email,
        trial_end_date: trialEndDate,
        trial_start_date: (row as any).trial_started_at ? toIsoDate(new Date((row as any).trial_started_at as string)) : '',
      },
    });

    const startedAdmin = await sendTransactionalEmail({
      eventKey: `admin_trial_started:${subscriptionId}`,
      templateKey: 'admin_trial_started',
      to: { email: profile.email, name: profile.name },
      userId,
      subscriptionId,
      variables: {
        customer_name: profile.name || normalizeEmailFallbackName(profile.email) || 'Unknown',
        customer_email: profile.email,
        trial_end_date: trialEndDate,
        trial_start_date: (row as any).trial_started_at ? toIsoDate(new Date((row as any).trial_started_at as string)) : '',
      },
    });

    if (started.status === 'sent' || startedAdmin.status === 'sent') {
      startedSent += 1;
    }

    if (daysList.includes(daysRemaining) && templateKeyByDays[daysRemaining]) {
      const customerTemplateKey = templateKeyByDays[daysRemaining];

      const [customerResult, adminResult] = await Promise.all([
        sendTransactionalEmail({
          eventKey: `customer_trial_expiring:${subscriptionId}:${daysRemaining}`,
          templateKey: customerTemplateKey,
          to: { email: profile.email, name: profile.name },
          userId,
          subscriptionId,
          variables: {
            customer_name: profile.name || normalizeEmailFallbackName(profile.email),
            customer_email: profile.email,
            trial_end_date: trialEndDate,
          },
        }),
        sendTransactionalEmail({
          eventKey: `admin_trial_expiring:${subscriptionId}:${daysRemaining}`,
          templateKey: 'admin_trial_expiring',
          to: { email: profile.email, name: profile.name },
          userId,
          subscriptionId,
          variables: {
            customer_name: profile.name || normalizeEmailFallbackName(profile.email) || 'Unknown',
            customer_email: profile.email,
            trial_end_date: trialEndDate,
            days_remaining: String(daysRemaining),
          },
        }),
      ]);

      if (customerResult.status === 'sent') {
        reminderSent += 1;
      }
      if (adminResult.status === 'sent') {
        adminReminderSent += 1;
      }
    }
  }

  return {
    processed: (subs || []).length,
    startedSent,
    reminderSent,
    adminReminderSent,
    trialReminderDays: daysList,
  };
}

async function processRenewals(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { renewalReminderDays } = await loadNotificationSettings(admin);
  const now = new Date();
  const lookaheadIso = new Date(Date.now() + (renewalReminderDays + 1) * 86400000).toISOString();

  const { data: subs, error } = await admin
    .from('user_subscriptions')
    .select('id,user_id,status,current_period_end,subscription_plans(plan_name)')
    .in('status', ['active', 'past_due'])
    .not('current_period_end', 'is', null)
    .lte('current_period_end', lookaheadIso)
    .limit(300);

  if (error) throw error;

  let remindersSent = 0;

  for (const row of subs || []) {
    const subscriptionId = (row as any).id as string;
    const userId = (row as any).user_id as string;
    const currentPeriodEndRaw = (row as any).current_period_end as string | null;
    if (!currentPeriodEndRaw) continue;

    const endDate = new Date(currentPeriodEndRaw);
    const daysRemaining = daysBetween(now, endDate);
    if (daysRemaining !== renewalReminderDays) continue;

    const profile = await loadProfile(admin, userId);
    if (!profile.email) continue;

    const planName = ((row as any)?.subscription_plans as any)?.plan_name as string | undefined;

    const result = await sendTransactionalEmail({
      eventKey: `customer_renewal_upcoming:${subscriptionId}:${toIsoDate(endDate)}`,
      templateKey: 'customer_renewal_upcoming',
      to: { email: profile.email, name: profile.name },
      userId,
      subscriptionId,
      variables: {
        customer_name: profile.name || normalizeEmailFallbackName(profile.email),
        customer_email: profile.email,
        plan_name: planName || '',
        renewal_date: toIsoDate(endDate),
      },
    });

    if (result.status === 'sent') {
      remindersSent += 1;
    }
  }

  return { processed: (subs || []).length, remindersSent, renewalReminderDays };
}

async function processManualPlanAssignments(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: rows, error } = await admin
    .from('billing_admin_override_logs')
    .select('id,target_user_id,action_type,plan_id,created_at')
    .eq('action_type', 'change_user_plan')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  let sent = 0;

  for (const row of rows || []) {
    const logId = (row as any).id as string;
    const userId = (row as any).target_user_id as string;
    const planId = (row as any).plan_id as string | null;

    const profile = await loadProfile(admin, userId);
    if (!profile.email) continue;

    let planName = '';
    if (planId) {
      const { data: planRow } = await admin
        .from('subscription_plans')
        .select('plan_name')
        .eq('id', planId)
        .maybeSingle();
      planName = ((planRow as any)?.plan_name as string) || '';
    }

    const [customerResult, adminResult] = await Promise.all([
      sendTransactionalEmail({
        eventKey: `customer_package_assigned_by_admin:${logId}`,
        templateKey: 'customer_package_assigned_by_admin',
        to: { email: profile.email, name: profile.name },
        userId,
        variables: {
          customer_name: profile.name || normalizeEmailFallbackName(profile.email),
          customer_email: profile.email,
          plan_name: planName,
        },
      }),
      sendTransactionalEmail({
        eventKey: `admin_package_assigned_manually:${logId}`,
        templateKey: 'admin_package_assigned_manually',
        to: { email: profile.email, name: profile.name },
        userId,
        variables: {
          customer_name: profile.name || normalizeEmailFallbackName(profile.email) || 'Unknown',
          customer_email: profile.email,
          plan_name: planName,
        },
      }),
    ]);

    if (customerResult.status === 'sent' || adminResult.status === 'sent') {
      sent += 1;
    }
  }

  return { processed: (rows || []).length, sent };
}

async function retryFailedEmails(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const { data: failed, error } = await admin
    .from('email_delivery_logs')
    .select('id,event_key,template_key,recipient_email,recipient_name,user_id,subscription_id,payment_id,retry_count,metadata,created_at')
    .eq('status', 'failed')
    .lt('retry_count', 3)
    .order('created_at', { ascending: true })
    .limit(50);
  if (error) throw error;

  let retried = 0;
  for (const row of failed || []) {
    const retryCount = Number((row as any).retry_count ?? 0);
    const nextRetry = retryCount + 1;
    const originalEventKey = (row as any).event_key as string;
    const eventKey = `${originalEventKey}:retry:${nextRetry}`;
    const variables = ((row as any).metadata as any)?.variables || {};

    const result = await sendTransactionalEmail({
      eventKey,
      templateKey: (row as any).template_key as string,
      to: { email: (row as any).recipient_email as string, name: (row as any).recipient_name as string | null },
      userId: (row as any).user_id as string | null,
      subscriptionId: (row as any).subscription_id as string | null,
      paymentId: (row as any).payment_id as string | null,
      variables,
    });

    await admin
      .from('email_delivery_logs')
      .update({ retry_count: nextRetry })
      .eq('id', (row as any).id);

    if (result.status === 'sent') {
      retried += 1;
    }

    if (result.status === 'failed' && nextRetry >= 3) {
      await sendTransactionalEmail({
        eventKey: `admin_email_delivery_failed:${(row as any).id}:${nextRetry}`,
        templateKey: 'admin_email_delivery_failed',
        to: { email: (row as any).recipient_email as string, name: (row as any).recipient_name as string | null },
        userId: (row as any).user_id as string | null,
        subscriptionId: (row as any).subscription_id as string | null,
        paymentId: (row as any).payment_id as string | null,
        variables: {
          template_key: (row as any).template_key as string,
          recipient_email: (row as any).recipient_email as string,
          error_message: result.errorMessage || (variables as any)?.error_message || '',
        },
      });
    }
  }

  return { attempted: (failed || []).length, retried };
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.EMAIL_JOB_SECRET;
  const suppliedSecret = getBearerToken(request) || request.headers.get('x-job-secret') || '';

  if (!expectedSecret || suppliedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Service role is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const action = (body as any)?.action as string | undefined;

  try {
    if (action === 'new_users') {
      return NextResponse.json({ success: true, action, result: await processNewUsers(admin) });
    }
    if (action === 'onboarding') {
      return NextResponse.json({ success: true, action, result: await processOnboarding(admin) });
    }
    if (action === 'trials') {
      const expirations = await processTrialExpirations(admin);
      const reminders = await processTrials(admin);
      return NextResponse.json({ success: true, action, result: { expirations, reminders } });
    }
    if (action === 'renewals') {
      return NextResponse.json({ success: true, action, result: await processRenewals(admin) });
    }
    if (action === 'manual_assignments') {
      return NextResponse.json({ success: true, action, result: await processManualPlanAssignments(admin) });
    }
    if (action === 'retry_failed') {
      return NextResponse.json({ success: true, action, result: await retryFailedEmails(admin) });
    }

    const [newUsers, onboarding, trials, renewals, manualAssignments, retries] = await Promise.all([
      processNewUsers(admin),
      processOnboarding(admin),
      (async () => {
        const expirations = await processTrialExpirations(admin);
        const reminders = await processTrials(admin);
        return { expirations, reminders };
      })(),
      processRenewals(admin),
      processManualPlanAssignments(admin),
      retryFailedEmails(admin),
    ]);

    return NextResponse.json({
      success: true,
      action: 'all',
      result: { newUsers, onboarding, trials, renewals, manualAssignments, retries },
    });
  } catch (error: any) {
    console.error('[internal/email/run] failed', {
      message: error?.message ? String(error.message) : 'email_job_failed',
    });
    return NextResponse.json({ success: false, error: 'Email job failed' }, { status: 500 });
  }
}
