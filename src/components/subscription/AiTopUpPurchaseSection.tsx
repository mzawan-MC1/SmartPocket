'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Minus, Plus, ShoppingCart, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import SectionCard from '@/components/ui/SectionCard';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatCurrencyText } from '@/lib/currency-formatting';
import { getIntlLocale } from '@/lib/locale';
import { useClientReferenceData } from '@/lib/reference-data/client';
import {
  createAiTopUpCheckout,
  fetchAiTopUpCatalog,
  fetchAiTopUpHistory,
  quoteAiTopUpSelection,
} from '@/lib/subscription/client';
import type {
  AiTopUpCatalogResponse,
  AiTopUpOrderSummary,
  AiTopUpProduct,
  AiTopUpQuoteResponse,
  AiTopUpSelectionInput,
  SubscriptionSummary,
} from '@/lib/subscription/types';

type QuantityMap = Record<string, number>;

function formatOrderDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function getResourceLabel(
  t: (key: string, options?: Record<string, unknown>) => string,
  resourceType: AiTopUpProduct['resourceType']
) {
  return t(`subscriptionTopUps.resources.${resourceType}`, { ns: 'portal' });
}

export default function AiTopUpPurchaseSection({
  summary,
}: {
  summary: SubscriptionSummary | null;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const { data: referenceData } = useClientReferenceData();
  const currencies = referenceData?.snapshot?.currencies ?? [];
  const [catalog, setCatalog] = React.useState<AiTopUpCatalogResponse | null>(null);
  const [history, setHistory] = React.useState<AiTopUpOrderSummary[]>([]);
  const [quantities, setQuantities] = React.useState<QuantityMap>({});
  const [quote, setQuote] = React.useState<AiTopUpQuoteResponse>({ ok: false });
  const [loading, setLoading] = React.useState(true);
  const [quoteLoading, setQuoteLoading] = React.useState(false);
  const [checkoutBusy, setCheckoutBusy] = React.useState(false);

  const products = catalog?.products ?? [];

  const selectedLines = React.useMemo<AiTopUpSelectionInput[]>(() => {
    return Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([productId, quantity]) => ({
        productId,
        quantity,
      }));
  }, [quantities]);

  const formatMoney = React.useCallback((amount: number, currencyCode?: string) => {
    return formatCurrencyText(amount, {
      currencyCode: currencyCode || catalog?.currencyCode || 'AED',
      currencies,
      locale,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }, [catalog?.currencyCode, currencies, locale]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [catalogPayload, historyPayload] = await Promise.all([
        fetchAiTopUpCatalog(),
        fetchAiTopUpHistory(),
      ]);
      setCatalog(catalogPayload);
      setHistory(historyPayload?.orders ?? []);
    } catch {
      toast.error(t('subscriptionTopUps.loadFailed', { ns: 'portal' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!catalog || selectedLines.length === 0) {
      setQuote({ ok: false });
      setQuoteLoading(false);
      return;
    }

    let cancelled = false;
    setQuoteLoading(true);

    const timer = window.setTimeout(() => {
      void quoteAiTopUpSelection(selectedLines)
        .then((payload) => {
          if (!cancelled) {
            setQuote(payload);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setQuote({
              ok: false,
              error: {
                code: 'invalid_topup_selection',
                message: t('subscriptionTopUps.errors.invalid_topup_selection', { ns: 'portal' }),
              },
            });
          }
        })
        .finally(() => {
          if (!cancelled) {
            setQuoteLoading(false);
          }
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [catalog, selectedLines, t]);

  const updateQuantity = React.useCallback((product: AiTopUpProduct, direction: 'increment' | 'decrement') => {
    setQuantities((current) => {
      const existing = current[product.id] ?? 0;
      if (direction === 'increment') {
        const next = existing <= 0
          ? product.minimumQuantity
          : Math.min(product.maximumQuantity, existing + product.quantityStep);
        return { ...current, [product.id]: next };
      }

      if (existing <= product.minimumQuantity) {
        const nextState = { ...current };
        delete nextState[product.id];
        return nextState;
      }

      return {
        ...current,
        [product.id]: Math.max(product.minimumQuantity, existing - product.quantityStep),
      };
    });
  }, []);

  const handleCheckout = async () => {
    if (selectedLines.length === 0) {
      toast.error(t('subscriptionTopUps.errors.invalid_topup_selection', { ns: 'portal' }));
      return;
    }

    setCheckoutBusy(true);
    try {
      const response = await createAiTopUpCheckout(selectedLines);
      if (!response.ok || !response.checkoutUrl) {
        const code = response.error?.code || 'checkout_creation_failed';
        toast.error(
          t(`subscriptionTopUps.errors.${code}`, {
            ns: 'portal',
            defaultValue: response.error?.message || t('subscriptionTopUps.errors.checkout_creation_failed', { ns: 'portal' }),
          })
        );
        return;
      }

      window.location.href = response.checkoutUrl;
    } catch {
      toast.error(t('subscriptionTopUps.errors.checkout_creation_failed', { ns: 'portal' }));
    } finally {
      setCheckoutBusy(false);
    }
  };

  const usageCards = [
    {
      key: 'text_credit',
      label: getResourceLabel(t, 'text_credit'),
      usage: catalog?.usage.textCredit,
    },
    {
      key: 'voice_second',
      label: getResourceLabel(t, 'voice_second'),
      usage: catalog?.usage.voiceSecond,
    },
    {
      key: 'receipt_extraction',
      label: getResourceLabel(t, 'receipt_extraction'),
      usage: catalog?.usage.receiptExtraction,
    },
  ];

  return (
    <div className="space-y-4">
      <SectionCard
        title={t('subscriptionTopUps.title', { ns: 'portal' })}
        description={t('subscriptionTopUps.description', { ns: 'portal' })}
        className="overflow-hidden"
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            {t('status.loading', { ns: 'common' })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {usageCards.map((card) => (
                <div key={card.key} className="rounded-2xl border border-border/70 bg-card px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-accent" />
                    <p className="text-sm font-800 text-foreground">{card.label}</p>
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('subscriptionTopUps.includedRemaining', { ns: 'portal' })}</dt>
                      <dd dir="ltr" className="font-800 text-foreground">{card.usage?.includedRemaining ?? 0}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('subscriptionTopUps.purchasedRemaining', { ns: 'portal' })}</dt>
                      <dd dir="ltr" className="font-800 text-foreground">{card.usage?.purchasedRemaining ?? 0}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('subscriptionTopUps.totalAvailable', { ns: 'portal' })}</dt>
                      <dd dir="ltr" className="font-800 text-accent">{card.usage?.totalAvailable ?? 0}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            {!catalog?.canPurchaseTopUps ? (
              <div className="rounded-2xl border border-warning/30 bg-warning-soft/20 px-4 py-3 text-sm text-foreground">
                {t('subscriptionTopUps.purchaseNotAvailable', {
                  ns: 'portal',
                  defaultValue: summary?.planCode === 'free_trial'
                    ? t('subscriptionTopUps.purchaseDisabledForTrial', { ns: 'portal' })
                    : t('subscriptionTopUps.purchaseDisabledForInactive', { ns: 'portal' }),
                })}
              </div>
            ) : null}

            {products.length === 0 ? (
              <div className="rounded-2xl border border-border/70 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                {t('subscriptionTopUps.noProducts', { ns: 'portal' })}
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {products.map((product) => {
                  const selectedQuantity = quantities[product.id] ?? 0;
                  const grantedLabel = product.resourceType === 'voice_second'
                    ? t('subscriptionTopUps.voiceGrantedLabel', {
                        ns: 'portal',
                        seconds: product.unitQuantity,
                        minutes: Math.ceil(product.unitQuantity / 60),
                      })
                    : t('subscriptionTopUps.productGrantedLabel', {
                        ns: 'portal',
                        quantity: product.unitQuantity,
                        unit: product.unitLabel || getResourceLabel(t, product.resourceType),
                      });

                  return (
                    <div key={product.id} className="rounded-2xl border border-border/70 bg-card px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-800 text-foreground">{product.name}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {product.description || getResourceLabel(t, product.resourceType)}
                          </p>
                        </div>
                        <div dir="ltr" className="text-end text-sm font-800 text-foreground">
                          {formatMoney(product.priceAmount, product.currencyCode)}
                        </div>
                      </div>

                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        <div className="rounded-xl bg-secondary/35 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">
                            {t('subscriptionTopUps.each', { ns: 'portal' })}
                          </p>
                          <p className="mt-1 font-700 text-foreground">{grantedLabel}</p>
                        </div>
                        <div className="rounded-xl bg-secondary/35 px-3 py-2">
                          <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">
                            {t('subscriptionTopUps.quantityRules', { ns: 'portal' })}
                          </p>
                          <p className="mt-1 font-700 text-foreground">
                            {t('subscriptionTopUps.quantityRulesValue', {
                              ns: 'portal',
                              min: product.minimumQuantity,
                              max: product.maximumQuantity,
                              step: product.quantityStep,
                            })}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3">
                        <div className="inline-flex items-center rounded-full border border-border bg-secondary/35 p-1">
                          <button
                            type="button"
                            onClick={() => updateQuantity(product, 'decrement')}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-card"
                            aria-label={t('subscriptionTopUps.decrease', { ns: 'portal' })}
                          >
                            <Minus size={14} />
                          </button>
                          <span dir="ltr" className="min-w-[3rem] px-2 text-center text-sm font-800 text-foreground">
                            {selectedQuantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(product, 'increment')}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-card"
                            aria-label={t('subscriptionTopUps.increase', { ns: 'portal' })}
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        <div dir="ltr" className="text-sm font-800 text-accent">
                          {selectedQuantity > 0
                            ? formatMoney(product.priceAmount * selectedQuantity, product.currencyCode)
                            : t('subscriptionTopUps.notSelected', { ns: 'portal' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rounded-3xl border border-border/70 bg-card px-4 py-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-800 text-foreground">{t('subscriptionTopUps.summaryTitle', { ns: 'portal' })}</p>
                  <div className="mt-3 space-y-2 text-sm">
                    {selectedLines.length === 0 ? (
                      <p className="text-muted-foreground">{t('subscriptionTopUps.noSelection', { ns: 'portal' })}</p>
                    ) : quote.ok && quote.quote ? (
                      quote.quote.lines.map((line) => (
                        <div key={line.productId} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/35 px-3 py-2">
                          <span className="min-w-0 truncate text-foreground">
                            {line.productName} x {line.quantity}
                          </span>
                          <span dir="ltr" className="shrink-0 font-800 text-foreground">
                            {formatMoney(line.subtotalAmount, line.currencyCode)}
                          </span>
                        </div>
                      ))
                    ) : quote.error ? (
                      <p className="text-warning">
                        {t(`subscriptionTopUps.errors.${quote.error.code}`, {
                          ns: 'portal',
                          defaultValue: quote.error.message,
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="w-full rounded-2xl border border-border/70 bg-secondary/20 p-4 lg:w-[20rem]">
                  <dl className="space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('subscriptionTopUps.subtotal', { ns: 'portal' })}</dt>
                      <dd dir="ltr" className="font-800 text-foreground">
                        {quote.ok && quote.quote ? formatMoney(quote.quote.subtotalAmount, quote.quote.currencyCode) : formatMoney(0)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('subscriptionTopUps.vat', { ns: 'portal' })}</dt>
                      <dd dir="ltr" className="font-800 text-foreground">
                        {quote.ok && quote.quote ? formatMoney(quote.quote.vatAmount, quote.quote.currencyCode) : formatMoney(0)}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                      <dt className="text-foreground">{t('subscriptionTopUps.total', { ns: 'portal' })}</dt>
                      <dd dir="ltr" className="font-900 text-accent">
                        {quote.ok && quote.quote ? formatMoney(quote.quote.totalAmount, quote.quote.currencyCode) : formatMoney(0)}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-3 text-xs text-muted-foreground">
                    {t('subscriptionTopUps.serverPricingNotice', { ns: 'portal' })}
                  </p>

                  <button
                    type="button"
                    onClick={() => void handleCheckout()}
                    disabled={
                      checkoutBusy
                      || quoteLoading
                      || selectedLines.length === 0
                      || !catalog?.canPurchaseTopUps
                      || !quote.ok
                    }
                    className="btn-primary mt-4 w-full justify-center"
                  >
                    {checkoutBusy || quoteLoading ? <Loader2 size={15} className="animate-spin" /> : <ShoppingCart size={15} />}
                    {t('subscriptionTopUps.checkoutAction', { ns: 'portal' })}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title={t('subscriptionTopUps.historyTitle', { ns: 'portal' })}
        description={t('subscriptionTopUps.historyDescription', { ns: 'portal' })}
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            {t('status.loading', { ns: 'common' })}
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('subscriptionTopUps.historyEmpty', { ns: 'portal' })}</p>
        ) : (
          <div className="space-y-3">
            {history.map((order) => (
              <div key={order.id} className="rounded-2xl border border-border/70 bg-card px-4 py-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-800 text-foreground">{order.orderReference}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span>{formatOrderDate(order.createdAt, locale)}</span>
                      <span>{t(`subscriptionTopUps.statuses.${order.status}`, { ns: 'portal' })}</span>
                      {order.paymentReference ? <span>{order.paymentReference}</span> : null}
                    </div>
                  </div>
                  <div dir="ltr" className="text-sm font-900 text-foreground">
                    {formatMoney(order.totalAmount, order.currencyCode)}
                  </div>
                </div>

                <div className="mt-3 grid gap-2">
                  {order.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/35 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-foreground">
                        {item.productName} x {item.quantity}
                      </span>
                      <span dir="ltr" className="shrink-0 font-800 text-muted-foreground">
                        {item.grantedQuantity} {getResourceLabel(t, item.resourceType)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
