import { NextResponse } from 'next/server';
import { getFeaturedPublicDocumentationArticles } from '@/lib/documentation-server';
import type { SupportedLanguage } from '@/i18n/resources';
import { SUPPORTED_LANGUAGE_CODES } from '@/i18n/registry';
import { normalizeDocumentationLanguage } from '@/lib/documentation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawSlot = (url.searchParams.get('slot') || 'footer').toLowerCase();
    const slot = rawSlot === 'header' ? 'header' : 'footer';
    const rawLimit = Number(url.searchParams.get('limit') || '4');
    const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(8, Math.trunc(rawLimit))) : 4;
    const acceptLang =
      (request.headers.get('accept-language') || 'en').split(',')[0]?.split('-')[0]?.toLowerCase() || 'en';

    const mappedLang = (() => {
      const candidates = [acceptLang, 'en'] as SupportedLanguage[];
      for (const c of candidates) {
        const match = SUPPORTED_LANGUAGE_CODES.find((l) => l.toLowerCase() === c.toLowerCase());
        if (match) return match as SupportedLanguage;
      }
      return 'en' as SupportedLanguage;
    })();

    const lang = normalizeDocumentationLanguage(mappedLang);
    const result = await getFeaturedPublicDocumentationArticles(slot, lang as SupportedLanguage, limit);
    return NextResponse.json(
      {
        slot,
        language: lang,
        articles: result.articles.map((a) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          summary: a.summary,
          category: a.category,
          localeCode: a.localeCode,
          href: `/help/documentation/${a.slug}`,
        })),
      },
      { status: 200, headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || 'unknown');
    return NextResponse.json(
      { slot: 'footer', language: 'en', articles: [], error: 'failed', detail: msg.slice(0, 120) },
      { status: 500 }
    );
  }
}
