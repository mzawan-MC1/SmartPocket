import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { requireEmailAdmin } from '@/lib/email/admin-auth';

export const runtime = 'nodejs';

type NotificationSettingsPayload = {
  admin_notification_email?: string | null;
  admin_cc?: string | null;
  admin_bcc?: string | null;
  sender_name?: string | null;
  sender_email?: string | null;
  reply_to_email?: string | null;
  signature_name?: string | null;
  signature_title?: string | null;
  footer_disclaimer?: string | null;
  trial_reminder_days?: number[];
  onboarding_reminder_days?: number;
  renewal_reminder_days?: number;
  event_enabled?: Record<string, boolean>;
};

export async function GET() {
  const auth = await requireEmailAdmin();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const { data, error } = await admin
    .from('email_notification_settings')
    .select('*')
    .eq('singleton_lock', true)
    .maybeSingle();

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load notification settings.' }, { status: 500 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ settings: data || null }, { status: 200 }),
    cookieMutations
  );
}

export async function POST(request: Request) {
  const auth = await requireEmailAdmin();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const body = (await request.json().catch(() => ({}))) as NotificationSettingsPayload;

  const { data: existing } = await admin
    .from('email_notification_settings')
    .select('*')
    .eq('singleton_lock', true)
    .maybeSingle();

  const trimOrNull = (value: unknown) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const next = String(value).trim();
    return next ? next : null;
  };

  const payload = {
    singleton_lock: true,
    admin_notification_email: body.admin_notification_email === undefined
      ? ((existing as any)?.admin_notification_email as string | null) ?? null
      : trimOrNull(body.admin_notification_email),
    admin_cc: body.admin_cc === undefined
      ? ((existing as any)?.admin_cc as string | null) ?? null
      : trimOrNull(body.admin_cc),
    admin_bcc: body.admin_bcc === undefined
      ? ((existing as any)?.admin_bcc as string | null) ?? null
      : trimOrNull(body.admin_bcc),
    sender_name: body.sender_name === undefined
      ? ((existing as any)?.sender_name as string | null) ?? null
      : trimOrNull(body.sender_name),
    sender_email: body.sender_email === undefined
      ? ((existing as any)?.sender_email as string | null) ?? null
      : trimOrNull(body.sender_email),
    reply_to_email: body.reply_to_email === undefined
      ? ((existing as any)?.reply_to_email as string | null) ?? null
      : trimOrNull(body.reply_to_email),
    signature_name: body.signature_name === undefined
      ? ((existing as any)?.signature_name as string | null) ?? null
      : trimOrNull(body.signature_name),
    signature_title: body.signature_title === undefined
      ? ((existing as any)?.signature_title as string | null) ?? null
      : trimOrNull(body.signature_title),
    footer_disclaimer: body.footer_disclaimer === undefined
      ? ((existing as any)?.footer_disclaimer as string | null) ?? null
      : trimOrNull(body.footer_disclaimer),
    trial_reminder_days: body.trial_reminder_days === undefined
      ? ((existing as any)?.trial_reminder_days as number[] | null) ?? undefined
      : Array.isArray(body.trial_reminder_days)
        ? body.trial_reminder_days.filter((d) => Number.isFinite(d)).map((d) => Math.max(0, Math.floor(d)))
        : undefined,
    onboarding_reminder_days: body.onboarding_reminder_days === undefined
      ? ((existing as any)?.onboarding_reminder_days as number | null) ?? undefined
      : typeof body.onboarding_reminder_days === 'number' && Number.isFinite(body.onboarding_reminder_days)
        ? Math.max(0, Math.floor(body.onboarding_reminder_days))
        : undefined,
    renewal_reminder_days: body.renewal_reminder_days === undefined
      ? ((existing as any)?.renewal_reminder_days as number | null) ?? undefined
      : typeof body.renewal_reminder_days === 'number' && Number.isFinite(body.renewal_reminder_days)
        ? Math.max(0, Math.floor(body.renewal_reminder_days))
        : undefined,
    event_enabled: body.event_enabled === undefined
      ? ((existing as any)?.event_enabled as Record<string, boolean> | null) ?? undefined
      : body.event_enabled && typeof body.event_enabled === 'object'
        ? body.event_enabled
        : undefined,
  };

  const { error } = await admin
    .from('email_notification_settings')
    .upsert(payload, { onConflict: 'singleton_lock' });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to save notification settings.' }, { status: 500 }),
      cookieMutations
    );
  }

  return applySupabaseCookies(
    NextResponse.json({ success: true }, { status: 200 }),
    cookieMutations
  );
}
