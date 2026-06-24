import { revalidateTag } from 'next/cache';
import { NextResponse } from 'next/server';
import { PLATFORM_SETTINGS_CACHE_TAG } from '@/lib/platform-settings-server';
import { createAdminClient } from '@/lib/supabase/admin';
import { applySupabaseCookies, createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

type CmsSettingsPayload = {
  header_menu?: unknown[];
  footer_sections?: unknown[];
  footer_copyright?: string;
  footer_powered_by_text?: string;
  footer_powered_by_url?: string;
  contact_email?: string;
  contact_phone?: string;
  contact_phone_country_code?: string;
  contact_address?: string;
  payment_stripe_enabled?: boolean;
  payment_paypal_enabled?: boolean;
};

async function requireAdmin() {
  const { supabase, cookieMutations } = await createRouteHandlerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
        cookieMutations
      ),
    };
  }

  if (user.app_metadata?.role !== 'admin') {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        cookieMutations
      ),
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false as const,
      response: applySupabaseCookies(
        NextResponse.json({ error: 'Supabase service role is not configured.' }, { status: 500 }),
        cookieMutations
      ),
    };
  }

  return { ok: true as const, admin, cookieMutations };
}

function trim(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return auth.response;
  }

  const { admin, cookieMutations } = auth;

  try {
    const body = (await request.json()) as CmsSettingsPayload;
    const payload = {
      header_menu: Array.isArray(body.header_menu) ? body.header_menu : [],
      footer_sections: Array.isArray(body.footer_sections) ? body.footer_sections : [],
      footer_copyright: trim(body.footer_copyright),
      footer_powered_by_text: trim(body.footer_powered_by_text),
      footer_powered_by_url: trim(body.footer_powered_by_url),
      contact_email: trim(body.contact_email),
      contact_phone: trim(body.contact_phone),
      contact_phone_country_code: trim(body.contact_phone_country_code).toUpperCase(),
      contact_address: trim(body.contact_address),
      payment_stripe_enabled: Boolean(body.payment_stripe_enabled),
      payment_paypal_enabled: Boolean(body.payment_paypal_enabled),
    };

    const existing = await admin
      .from('platform_settings')
      .select('id')
      .maybeSingle();

    if (existing.error) {
      throw existing.error;
    }

    if (existing.data?.id) {
      const { error } = await admin
        .from('platform_settings')
        .update(payload)
        .eq('id', existing.data.id);

      if (error) throw error;
    } else {
      const { error } = await admin
        .from('platform_settings')
        .insert({ ...payload, singleton_lock: true });

      if (error) throw error;
    }

    revalidateTag(PLATFORM_SETTINGS_CACHE_TAG);

    return applySupabaseCookies(
      NextResponse.json({ success: true }, { status: 200 }),
      cookieMutations
    );
  } catch {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to save CMS settings.' }, { status: 500 }),
      cookieMutations
    );
  }
}
