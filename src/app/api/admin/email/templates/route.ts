import { NextResponse } from 'next/server';
import { applySupabaseCookies } from '@/lib/supabase/server';
import { requireEmailAdmin } from '@/lib/email/admin-auth';
import { SUPPORTED_LANGUAGE_CODES, type SupportedLanguage } from '@/i18n/registry';

export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireEmailAdmin();
  if (!auth.ok) return auth.response;

  const { admin, cookieMutations } = auth;
  const { data, error } = await admin
    .from('email_templates')
    .select('template_key,name,category,recipient_type,subject,enabled,language_code,updated_at')
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return applySupabaseCookies(
      NextResponse.json({ error: 'Failed to load templates.' }, { status: 500 }),
      cookieMutations
    );
  }

  const rows = (data || []) as Array<{
    template_key: string;
    name: string;
    category: string;
    recipient_type: string;
    subject: string;
    enabled: boolean;
    language_code: string;
    updated_at: string | null;
  }>;

  const templatesByKey = new Map<
    string,
    {
      template_key: string;
      name: string;
      category: string;
      recipient_type: string;
      subject: string;
      enabled: boolean;
      language_code: SupportedLanguage;
      updated_at: string | null;
      language_coverage: Record<SupportedLanguage, boolean>;
      language_updated_at: Partial<Record<SupportedLanguage, string | null>>;
    }
  >();

  for (const row of rows) {
    const safeLang = (SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(row.language_code)
      ? (row.language_code as SupportedLanguage)
      : 'en';
    if (!templatesByKey.has(row.template_key)) {
      const coverage = Object.fromEntries(
        SUPPORTED_LANGUAGE_CODES.map((c) => [c, false])
      ) as Record<SupportedLanguage, boolean>;
      const language_updated_at = {} as Partial<Record<SupportedLanguage, string | null>>;
      templatesByKey.set(row.template_key, {
        template_key: row.template_key,
        name: row.name,
        category: row.category,
        recipient_type: row.recipient_type,
        subject: row.subject,
        enabled: row.enabled,
        language_code: safeLang,
        updated_at: row.updated_at,
        language_coverage: coverage,
        language_updated_at,
      });
    }
    const entry = templatesByKey.get(row.template_key)!;
    entry.language_coverage[safeLang] = true;
    entry.language_updated_at[safeLang] = row.updated_at;
    if (safeLang === 'en') {
      entry.name = row.name;
      entry.category = row.category;
      entry.recipient_type = row.recipient_type;
      entry.subject = row.subject;
      entry.enabled = row.enabled;
      entry.language_code = 'en';
      entry.updated_at = row.updated_at;
    }
  }

  const templates = Array.from(templatesByKey.values());

  return applySupabaseCookies(
    NextResponse.json({
      templates,
      registered_languages: SUPPORTED_LANGUAGE_CODES,
    }, { status: 200 }),
    cookieMutations
  );
}

