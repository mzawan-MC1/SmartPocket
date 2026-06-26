import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import enPortal from '@/i18n/locales/en/portal.json';
import arPortal from '@/i18n/locales/ar/portal.json';
import frPortal from '@/i18n/locales/fr/portal.json';
import ruPortal from '@/i18n/locales/ru/portal.json';
import {
  getAverageUnitPrice,
  getLastPaidPrice,
  getRecentPriceChanges,
  getRecurringPurchaseSuggestions,
  getSpendingByItem,
} from '@/lib/transaction-item-insights';
import {
  requireReceiptIntelligenceAccess,
  requireTextAiAccess,
} from '@/lib/subscription/server';

type ReceiptInsightSource = {
  transactionDate: string;
  merchant: string | null;
  itemName: string;
  detail: string;
  currency?: string;
};

const receiptInsightPortals = {
  en: enPortal,
  ar: arPortal,
  fr: frPortal,
  ru: ruPortal,
} as const;

type ReceiptInsightLanguage = keyof typeof receiptInsightPortals;

function normalizeLanguage(value: string | null | undefined): ReceiptInsightLanguage {
  const base = value?.toLowerCase().split('-')[0];
  if (base === 'ar' || base === 'fr' || base === 'ru') {
    return base;
  }
  return 'en';
}

function getLocaleValue(locale: unknown, path: string) {
  if (!locale || typeof locale !== 'object') {
    return undefined;
  }

  return path
    .split('.')
    .reduce<unknown>((currentValue, segment) => {
      if (!currentValue || typeof currentValue !== 'object') {
        return undefined;
      }
      return (currentValue as Record<string, unknown>)[segment];
    }, locale);
}

function interpolate(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(values[key] ?? ''));
}

function rt(
  language: ReceiptInsightLanguage,
  path: string,
  fallback: string,
  values: Record<string, string | number> = {}
) {
  const template = getLocaleValue(receiptInsightPortals[language], path);
  return interpolate(typeof template === 'string' ? template : fallback, values);
}

function createUserClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

function getDateFilters(question: string) {
  const today = new Date();
  const toIso = (date: Date) => date.toISOString().slice(0, 10);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const previousMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const previousMonthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));

  if (question.includes('this month')) {
    return { startDate: toIso(monthStart), endDate: toIso(today) };
  }
  if (question.includes('last month')) {
    return { startDate: toIso(previousMonthStart), endDate: toIso(previousMonthEnd) };
  }
  if (question.includes('last 30 days')) {
    const startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 30));
    return { startDate: toIso(startDate), endDate: toIso(today) };
  }
  if (question.includes('this year')) {
    const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    return { startDate: toIso(yearStart), endDate: toIso(today) };
  }
  return undefined;
}

function extractItemName(question: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = question.match(pattern);
    const value = match?.[1]?.trim().replace(/[?.!,]+$/g, '');
    if (value) {
      return value;
    }
  }
  return '';
}

export async function POST(request: NextRequest) {
  const requestLanguage = normalizeLanguage(
    request.headers.get('x-smart-pocket-language') ?? request.headers.get('accept-language')
  );
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({
      success: false,
      errorMessage: rt(requestLanguage, 'receiptInsights.ai.unauthorized', 'Unauthorized'),
    }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const supabase = createUserClient(token);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({
      success: false,
      errorMessage: rt(requestLanguage, 'receiptInsights.ai.unauthorized', 'Unauthorized'),
    }, { status: 401 });
  }

  const receiptAccess = await requireReceiptIntelligenceAccess(user.id, { skipUsageCheck: true });
  if (!receiptAccess.ok) {
    return NextResponse.json({
      success: false,
      error: receiptAccess.error,
      errorMessage: receiptAccess.error.message,
    }, { status: receiptAccess.error.code === 'usage_exhausted' ? 429 : 403 });
  }

  const textAccess = await requireTextAiAccess(user.id);
  if (!textAccess.ok) {
    return NextResponse.json({
      success: false,
      error: textAccess.error,
      errorMessage: textAccess.error.message,
    }, { status: textAccess.error.code === 'usage_exhausted' ? 429 : 403 });
  }

  const body = await request.json().catch(() => ({}));
  const language = normalizeLanguage(typeof body?.language === 'string' ? body.language : requestLanguage);
  const rawQuestion = typeof body?.question === 'string' ? body.question.trim() : '';
  const question = rawQuestion.toLowerCase();
  if (!rawQuestion) {
    return NextResponse.json({
      success: false,
      errorMessage: rt(language, 'receiptInsights.ai.questionRequired', 'A question is required.'),
    }, { status: 400 });
  }

  const dateFilters = getDateFilters(question);

  try {
    if (/how much.*spend on /.test(question)) {
      const itemName = extractItemName(question, [/spend on (.+?)(?: this month| last month| this year| last 30 days|$)/i]);
      const results = await getSpendingByItem({
        supabaseClient: supabase,
        transactionType: 'expense',
        itemName,
        ...dateFilters,
      });
      if (results.length === 0) {
        return NextResponse.json({
          success: true,
          title: rt(language, 'receiptInsights.title', 'Receipt Insights'),
          answer: rt(language, 'receiptInsights.ai.spendNotFound', 'I could not find saved receipt items for "{{itemName}}".', {
            itemName,
          }),
          sources: [] as ReceiptInsightSource[],
        });
      }
      const sources = results.slice(0, 3).map((item) => ({
        transactionDate: item.lastPurchasedAt || '',
        merchant: item.merchants[0] || null,
        itemName: item.itemName,
        detail: rt(language, 'receiptInsights.ai.detailAcrossPurchases', '{{amount}} {{currency}} across {{count}} purchases', {
          amount: item.totalSpent.toFixed(2),
          currency: item.currency,
          count: item.purchaseCount,
        }),
        currency: item.currency,
      }));
      return NextResponse.json({
        success: true,
        title: rt(language, 'receiptInsights.title', 'Receipt Insights'),
        answer: results
          .map((item) => rt(language, 'receiptInsights.ai.spendSummary', '{{itemName}}: {{amount}} {{currency}} across {{count}} purchases', {
            itemName: item.itemName,
            amount: item.totalSpent.toFixed(2),
            currency: item.currency,
            count: item.purchaseCount,
          }))
          .join(' | '),
        sources,
      });
    }

    if (/where did i last buy /.test(question)) {
      const itemName = extractItemName(question, [/where did i last buy (.+?)(?:\?|$)/i]);
      const latest = await getLastPaidPrice(itemName, {
        supabaseClient: supabase,
        transactionType: 'expense',
      });
      return NextResponse.json({
        success: true,
        title: rt(language, 'receiptInsights.title', 'Receipt Insights'),
        answer: latest
          ? rt(language, 'receiptInsights.ai.lastBoughtFound', 'You last bought {{itemName}} at {{merchant}} on {{date}}.', {
            itemName: latest.itemName,
            merchant: latest.merchant || rt(language, 'receiptInsights.ai.unknownMerchantWithArticle', 'an unknown merchant'),
            date: latest.transactionDate,
          })
          : rt(language, 'receiptInsights.ai.lastBoughtNotFound', 'I could not find a saved receipt purchase for "{{itemName}}".', {
            itemName,
          }),
        sources: latest ? [{
          transactionDate: latest.transactionDate,
          merchant: latest.merchant,
          itemName: latest.itemName,
          detail: `${latest.lineTotal.toFixed(2)} ${latest.currency}`,
          currency: latest.currency,
        }] : [] as ReceiptInsightSource[],
      });
    }

    if (/average price/i.test(rawQuestion)) {
      const itemName = extractItemName(question, [
        /average price i paid for (.+?)(?:\?|$)/i,
        /average price of (.+?)(?:\?|$)/i,
        /average price.*for (.+?)(?:\?|$)/i,
      ]);
      const average = await getAverageUnitPrice(itemName, {
        supabaseClient: supabase,
        transactionType: 'expense',
      });
      return NextResponse.json({
        success: true,
        title: rt(language, 'receiptInsights.title', 'Receipt Insights'),
        answer: average.averageUnitPrice !== null
          ? rt(language, 'receiptInsights.ai.averageFound', 'Your average price for {{itemName}} is {{amount}} {{currency}} across {{count}} purchases.', {
            itemName: average.itemName,
            amount: average.averageUnitPrice.toFixed(2),
            currency: average.currency,
            count: average.samples,
          })
          : rt(language, 'receiptInsights.ai.averageNotFound', 'I could not calculate an average price for "{{itemName}}".', {
            itemName,
          }),
        sources: average.averageUnitPrice !== null ? [{
          transactionDate: '',
          merchant: null,
          itemName: average.itemName,
          detail: rt(language, 'receiptInsights.ai.detailAverageFromPurchases', '{{amount}} {{currency}} average from {{count}} purchases', {
            amount: average.averageUnitPrice.toFixed(2),
            currency: average.currency,
            count: average.samples,
          }),
          currency: average.currency,
        }] : [] as ReceiptInsightSource[],
      });
    }

    if (/increased most in price|price increased most/.test(question)) {
      const changes = await getRecentPriceChanges({
        supabaseClient: supabase,
        transactionType: 'expense',
        ...dateFilters,
      });
      const topIncrease = changes.find((change) => change.percentageChange > 0) || changes[0];
      return NextResponse.json({
        success: true,
        title: rt(language, 'receiptInsights.title', 'Receipt Insights'),
        answer: topIncrease
          ? rt(language, 'receiptInsights.ai.priceIncreaseFound', '{{itemName}} changed the most recently, up {{percent}}% from {{previous}} {{currency}} to {{latest}} {{currency}}.', {
            itemName: topIncrease.itemName,
            percent: topIncrease.percentageChange.toFixed(1),
            previous: topIncrease.previousPrice.toFixed(2),
            latest: topIncrease.latestPrice.toFixed(2),
            currency: topIncrease.currency,
          })
          : rt(language, 'receiptInsights.ai.priceIncreaseNotFound', 'I could not find a recent price increase in your saved receipt items.'),
        sources: topIncrease ? [{
          transactionDate: topIncrease.latestDate,
          merchant: topIncrease.merchant,
          itemName: topIncrease.itemName,
          detail: rt(language, 'receiptInsights.ai.detailPriceChange', '{{previous}} {{currency}} -> {{latest}} {{currency}}', {
            previous: topIncrease.previousPrice.toFixed(2),
            latest: topIncrease.latestPrice.toFixed(2),
            currency: topIncrease.currency,
          }),
          currency: topIncrease.currency,
        }] : [] as ReceiptInsightSource[],
      });
    }

    if (/what items do i buy regularly|what do i buy regularly|which items do i buy regularly/.test(question)) {
      const suggestions = await getRecurringPurchaseSuggestions({
        supabaseClient: supabase,
        transactionType: 'expense',
      });
      const topSuggestions = suggestions.slice(0, 3);
      return NextResponse.json({
        success: true,
        title: rt(language, 'receiptInsights.title', 'Receipt Insights'),
        answer: topSuggestions.length > 0
          ? topSuggestions.map((suggestion) => rt(language, 'receiptInsights.ai.recurringSummary', '{{itemName}} every {{days}} days', {
            itemName: suggestion.itemName,
            days: Math.round(suggestion.averageIntervalDays),
          })).join(' | ')
          : rt(language, 'receiptInsights.ai.recurringNotFound', 'I could not find a clear recurring purchase pattern yet.'),
        sources: topSuggestions.map((suggestion) => ({
          transactionDate: suggestion.lastPurchasedAt,
          merchant: suggestion.merchant,
          itemName: suggestion.itemName,
          detail: rt(language, 'receiptInsights.ai.detailAverageInterval', 'Average interval {{days}} days; next likely {{date}}', {
            days: Math.round(suggestion.averageIntervalDays),
            date: suggestion.nextLikelyPurchaseDate,
          }),
          currency: suggestion.currency,
        })),
      });
    }

    return NextResponse.json({
      success: true,
      title: rt(language, 'receiptInsights.title', 'Receipt Insights'),
      answer: rt(language, 'receiptInsights.ai.help', 'Ask about item spending, where you last bought an item, average price paid, biggest price increase, or which items you buy regularly.'),
      sources: [] as ReceiptInsightSource[],
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      errorMessage: error instanceof Error
        ? error.message
        : rt(language, 'receiptInsights.ai.failed', 'Failed to answer the receipt insight question.'),
    }, { status: 500 });
  }
}
