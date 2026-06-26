'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatCurrencyText } from '@/lib/currency-formatting';
import { getIntlLocale } from '@/lib/locale';
import { useClientReferenceData } from '@/lib/reference-data/client';
import {
  createAdminAiTopUpAdjustment,
  fetchAdminAiTopUpCatalog,
  fetchAdminAiTopUpOrders,
  saveAdminAiTopUpProduct,
} from '@/lib/subscription/client';
import type { AiTopUpOrderSummary, AiTopUpProduct, PlanCode } from '@/lib/subscription/types';

type AdminMode = 'products' | 'orders';

type EditableProduct = Partial<AiTopUpProduct> & {
  eligiblePlanCodes: PlanCode[];
};

const ELIGIBLE_PLANS: PlanCode[] = ['personal', 'family'];

function createEmptyProduct(): EditableProduct {
  return {
    resourceType: 'text_credit',
    enabled: true,
    active: false,
    name: '',
    description: '',
    unitQuantity: 100,
    unitLabel: 'credits',
    priceAmount: 5,
    currencyCode: 'AED',
    minimumQuantity: 1,
    maximumQuantity: 20,
    quantityStep: 1,
    sortOrder: 100,
    eligiblePlanCodes: ['personal', 'family'],
  };
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

export default function AiTopUpAdminPanel({
  mode,
}: {
  mode: AdminMode;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const { data: referenceData } = useClientReferenceData();
  const currencies = referenceData?.snapshot?.currencies ?? [];
  const [products, setProducts] = React.useState<AiTopUpProduct[]>([]);
  const [orders, setOrders] = React.useState<AiTopUpOrderSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [editor, setEditor] = React.useState<EditableProduct | null>(null);
  const [adjustmentUserId, setAdjustmentUserId] = React.useState('');
  const [adjustmentResource, setAdjustmentResource] = React.useState<'text_credit' | 'voice_second' | 'receipt_extraction'>('text_credit');
  const [adjustmentDelta, setAdjustmentDelta] = React.useState(0);
  const [adjustmentReason, setAdjustmentReason] = React.useState('');
  const [adjusting, setAdjusting] = React.useState(false);

  const formatMoney = React.useCallback((amount: number, currencyCode: string) => {
    return formatCurrencyText(amount, {
      currencyCode,
      currencies,
      locale,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  }, [currencies, locale]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (mode === 'products') {
        const payload = await fetchAdminAiTopUpCatalog();
        setProducts(payload.products);
      } else {
        const payload = await fetchAdminAiTopUpOrders();
        setOrders(payload.orders);
      }
    } catch {
      toast.error(t('subscriptionTopUps.admin.loadFailed', { ns: 'portal' }));
    } finally {
      setLoading(false);
    }
  }, [mode, t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleEdit = (product: AiTopUpProduct) => {
    setEditor({
      ...product,
      description: product.description ?? '',
      unitLabel: product.unitLabel ?? '',
      eligiblePlanCodes: product.eligiblePlanCodes,
    });
  };

  const handleSave = async () => {
    if (!editor) {
      return;
    }

    setSaving(true);
    try {
      const response = await saveAdminAiTopUpProduct({
        id: editor.id,
        resourceType: editor.resourceType || 'text_credit',
        enabled: Boolean(editor.enabled),
        active: Boolean(editor.active),
        name: editor.name?.trim() || '',
        description: editor.description?.trim() || null,
        unitQuantity: Math.max(1, Number(editor.unitQuantity || 1)),
        unitLabel: editor.unitLabel?.trim() || null,
        priceAmount: Math.max(0, Number(editor.priceAmount || 0)),
        currencyCode: (editor.currencyCode || 'AED').trim().toUpperCase(),
        minimumQuantity: Math.max(1, Number(editor.minimumQuantity || 1)),
        maximumQuantity: Math.max(1, Number(editor.maximumQuantity || 1)),
        quantityStep: Math.max(1, Number(editor.quantityStep || 1)),
        sortOrder: Number(editor.sortOrder || 0),
        eligiblePlanCodes: editor.eligiblePlanCodes,
      });
      setProducts((current) => {
        const next = current.filter((product) => product.id !== response.product.id);
        next.push(response.product);
        return next.sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
      });
      setEditor(null);
      toast.success(t('subscriptionTopUps.admin.saveSuccess', { ns: 'portal' }));
    } catch {
      toast.error(t('subscriptionTopUps.admin.saveFailed', { ns: 'portal' }));
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustment = async () => {
    if (!adjustmentUserId.trim() || !adjustmentReason.trim() || !Number.isInteger(adjustmentDelta) || adjustmentDelta === 0) {
      toast.error(t('subscriptionTopUps.admin.adjustmentValidation', { ns: 'portal' }));
      return;
    }

    setAdjusting(true);
    try {
      const response = await createAdminAiTopUpAdjustment({
        userId: adjustmentUserId.trim(),
        resourceType: adjustmentResource,
        quantityDelta: adjustmentDelta,
        reason: adjustmentReason.trim(),
      });
      if (!response.ok) {
        toast.error(response.error?.message || t('subscriptionTopUps.admin.adjustmentFailed', { ns: 'portal' }));
        return;
      }

      toast.success(t('subscriptionTopUps.admin.adjustmentSuccess', { ns: 'portal' }));
      setAdjustmentUserId('');
      setAdjustmentDelta(0);
      setAdjustmentReason('');
    } catch {
      toast.error(t('subscriptionTopUps.admin.adjustmentFailed', { ns: 'portal' }));
    } finally {
      setAdjusting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (mode === 'orders') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-800 text-foreground">{t('subscriptionTopUps.admin.ordersTitle', { ns: 'portal' })}</h3>
            <p className="text-sm text-muted-foreground">{t('subscriptionTopUps.admin.ordersDescription', { ns: 'portal' })}</p>
          </div>
          <button onClick={() => void load()} className="btn-secondary text-xs">
            <RefreshCw size={12} />
            {t('actions.refresh', { ns: 'common' })}
          </button>
        </div>

        <div className="space-y-3">
          {orders.length === 0 ? (
            <div className="rounded-2xl border border-border/70 bg-card px-4 py-4 text-sm text-muted-foreground">
              {t('subscriptionTopUps.admin.ordersEmpty', { ns: 'portal' })}
            </div>
          ) : (
            orders.map((order) => (
              <div key={order.id} className="rounded-2xl border border-border/70 bg-card px-4 py-4">
                <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
                  <div className="min-w-0">
                    <p className="text-sm font-800 text-foreground">{order.orderReference}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {order.userFullName || t('topbar.userFallback', { ns: 'portal' })}
                      {order.userEmail ? ` · ${order.userEmail}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDate(order.createdAt, locale)}
                      {order.paymentReference ? ` · ${order.paymentReference}` : ''}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="font-700 text-foreground">{t(`subscriptionTopUps.statuses.${order.status}`, { ns: 'portal' })}</p>
                    <p dir="ltr" className="mt-1 font-800 text-accent">
                      {formatMoney(order.totalAmount, order.currencyCode)}
                    </p>
                    {order.paidAt ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('subscriptionTopUps.admin.paidAt', { ns: 'portal', date: formatDate(order.paidAt, locale) })}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {order.items.map((item) => (
                      <div key={item.id} className="rounded-xl bg-secondary/35 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-foreground">{item.productName}</span>
                          <span dir="ltr" className="font-800 text-muted-foreground">
                            {item.quantity} x {item.grantedQuantity}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-800 text-foreground">{t('subscriptionTopUps.admin.productsTitle', { ns: 'portal' })}</h3>
          <p className="text-sm text-muted-foreground">{t('subscriptionTopUps.admin.productsDescription', { ns: 'portal' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditor(createEmptyProduct())} className="btn-primary text-xs">
            <Plus size={12} />
            {t('subscriptionTopUps.admin.newProduct', { ns: 'portal' })}
          </button>
          <button onClick={() => void load()} className="btn-secondary text-xs">
            <RefreshCw size={12} />
            {t('actions.refresh', { ns: 'common' })}
          </button>
        </div>
      </div>

      {editor ? (
        <div className="rounded-3xl border border-accent/25 bg-card px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.resourceType', { ns: 'portal' })}</label>
              <select
                className="input-base text-sm"
                value={editor.resourceType || 'text_credit'}
                onChange={(event) => setEditor((current) => current ? { ...current, resourceType: event.target.value as AiTopUpProduct['resourceType'] } : current)}
              >
                <option value="text_credit">{t('subscriptionTopUps.resources.text_credit', { ns: 'portal' })}</option>
                <option value="voice_second">{t('subscriptionTopUps.resources.voice_second', { ns: 'portal' })}</option>
                <option value="receipt_extraction">{t('subscriptionTopUps.resources.receipt_extraction', { ns: 'portal' })}</option>
                <option value="bundle">{t('subscriptionTopUps.resources.bundle', { ns: 'portal' })}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.name', { ns: 'portal' })}</label>
              <input
                className="input-base text-sm"
                value={editor.name || ''}
                onChange={(event) => setEditor((current) => current ? { ...current, name: event.target.value } : current)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.unitQuantity', { ns: 'portal' })}</label>
              <input
                type="number"
                min="1"
                className="input-base text-sm"
                value={editor.unitQuantity || 1}
                onChange={(event) => setEditor((current) => current ? { ...current, unitQuantity: Number(event.target.value) || 1 } : current)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.unitLabel', { ns: 'portal' })}</label>
              <input
                className="input-base text-sm"
                value={editor.unitLabel || ''}
                onChange={(event) => setEditor((current) => current ? { ...current, unitLabel: event.target.value } : current)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.priceAmount', { ns: 'portal' })}</label>
              <input
                type="number"
                min="0"
                className="input-base text-sm"
                value={editor.priceAmount || 0}
                onChange={(event) => setEditor((current) => current ? { ...current, priceAmount: Number(event.target.value) || 0 } : current)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.currencyCode', { ns: 'portal' })}</label>
              <input
                className="input-base text-sm"
                value={editor.currencyCode || 'AED'}
                onChange={(event) => setEditor((current) => current ? { ...current, currencyCode: event.target.value.toUpperCase() } : current)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.minimumQuantity', { ns: 'portal' })}</label>
              <input
                type="number"
                min="1"
                className="input-base text-sm"
                value={editor.minimumQuantity || 1}
                onChange={(event) => setEditor((current) => current ? { ...current, minimumQuantity: Number(event.target.value) || 1 } : current)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.maximumQuantity', { ns: 'portal' })}</label>
              <input
                type="number"
                min="1"
                className="input-base text-sm"
                value={editor.maximumQuantity || 1}
                onChange={(event) => setEditor((current) => current ? { ...current, maximumQuantity: Number(event.target.value) || 1 } : current)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.quantityStep', { ns: 'portal' })}</label>
              <input
                type="number"
                min="1"
                className="input-base text-sm"
                value={editor.quantityStep || 1}
                onChange={(event) => setEditor((current) => current ? { ...current, quantityStep: Number(event.target.value) || 1 } : current)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.sortOrder', { ns: 'portal' })}</label>
              <input
                type="number"
                className="input-base text-sm"
                value={editor.sortOrder || 0}
                onChange={(event) => setEditor((current) => current ? { ...current, sortOrder: Number(event.target.value) || 0 } : current)}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.description', { ns: 'portal' })}</label>
            <textarea
              className="input-base min-h-[88px] resize-y text-sm"
              value={editor.description || ''}
              onChange={(event) => setEditor((current) => current ? { ...current, description: event.target.value } : current)}
            />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['enabled', t('subscriptionTopUps.admin.fields.enabled', { ns: 'portal' })],
              ['active', t('subscriptionTopUps.admin.fields.active', { ns: 'portal' })],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center justify-between rounded-xl bg-secondary/35 px-3 py-2 text-sm text-foreground">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(editor[key as keyof EditableProduct])}
                  onChange={(event) => setEditor((current) => current ? { ...current, [key]: event.target.checked } : current)}
                />
              </label>
            ))}
          </div>

          <div className="mt-3">
            <p className="text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.fields.eligiblePlans', { ns: 'portal' })}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ELIGIBLE_PLANS.map((planCode) => {
                const checked = editor.eligiblePlanCodes.includes(planCode);
                return (
                  <label key={planCode} className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        setEditor((current) => {
                          if (!current) {
                            return current;
                          }

                          const nextPlans = event.target.checked
                            ? Array.from(new Set([...current.eligiblePlanCodes, planCode]))
                            : current.eligiblePlanCodes.filter((item) => item !== planCode);
                          return { ...current, eligiblePlanCodes: nextPlans };
                        });
                      }}
                    />
                    {t(`subscriptionTopUps.admin.planCodes.${planCode}`, { ns: 'portal' })}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void handleSave()} disabled={saving} className="btn-primary text-sm">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('actions.save', { ns: 'common' })}
            </button>
            <button onClick={() => setEditor(null)} className="btn-secondary text-sm">
              {t('actions.cancel', { ns: 'common' })}
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-3">
          {products.map((product) => (
            <div key={product.id} className="rounded-2xl border border-border/70 bg-card px-4 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-800 text-foreground">{product.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{product.description}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-700 ${product.active ? 'bg-positive-soft text-positive' : 'bg-secondary text-muted-foreground'}`}>
                    {product.active ? t('subscriptionTopUps.admin.activeBadge', { ns: 'portal' }) : t('subscriptionTopUps.admin.inactiveBadge', { ns: 'portal' })}
                  </span>
                  <button onClick={() => handleEdit(product)} className="btn-secondary text-xs">
                    {t('subscriptionTopUps.admin.editProduct', { ns: 'portal' })}
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm">
                <div className="rounded-xl bg-secondary/35 px-3 py-2">
                  <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">{t('subscriptionTopUps.admin.fields.priceAmount', { ns: 'portal' })}</p>
                  <p dir="ltr" className="mt-1 font-800 text-foreground">{formatMoney(product.priceAmount, product.currencyCode)}</p>
                </div>
                <div className="rounded-xl bg-secondary/35 px-3 py-2">
                  <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">{t('subscriptionTopUps.admin.fields.unitQuantity', { ns: 'portal' })}</p>
                  <p className="mt-1 font-800 text-foreground">{product.unitQuantity} {product.unitLabel || product.resourceType}</p>
                </div>
                <div className="rounded-xl bg-secondary/35 px-3 py-2">
                  <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">{t('subscriptionTopUps.admin.fields.quantityStep', { ns: 'portal' })}</p>
                  <p className="mt-1 font-800 text-foreground">{product.minimumQuantity} / {product.maximumQuantity} / {product.quantityStep}</p>
                </div>
                <div className="rounded-xl bg-secondary/35 px-3 py-2">
                  <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-muted-foreground">{t('subscriptionTopUps.admin.fields.eligiblePlans', { ns: 'portal' })}</p>
                  <p className="mt-1 font-800 text-foreground">
                    {product.eligiblePlanCodes.map((planCode) => t(`subscriptionTopUps.admin.planCodes.${planCode}`, { ns: 'portal' })).join(', ') || '—'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card px-4 py-4">
          <p className="text-sm font-800 text-foreground">{t('subscriptionTopUps.admin.adjustmentsTitle', { ns: 'portal' })}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('subscriptionTopUps.admin.adjustmentsDescription', { ns: 'portal' })}</p>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.adjustmentUserId', { ns: 'portal' })}</label>
              <input className="input-base text-sm" value={adjustmentUserId} onChange={(event) => setAdjustmentUserId(event.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.adjustmentResource', { ns: 'portal' })}</label>
              <select className="input-base text-sm" value={adjustmentResource} onChange={(event) => setAdjustmentResource(event.target.value as typeof adjustmentResource)}>
                <option value="text_credit">{t('subscriptionTopUps.resources.text_credit', { ns: 'portal' })}</option>
                <option value="voice_second">{t('subscriptionTopUps.resources.voice_second', { ns: 'portal' })}</option>
                <option value="receipt_extraction">{t('subscriptionTopUps.resources.receipt_extraction', { ns: 'portal' })}</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.adjustmentDelta', { ns: 'portal' })}</label>
              <input
                type="number"
                className="input-base text-sm"
                value={adjustmentDelta}
                onChange={(event) => setAdjustmentDelta(Number(event.target.value) || 0)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-700 text-foreground">{t('subscriptionTopUps.admin.adjustmentReason', { ns: 'portal' })}</label>
              <textarea
                className="input-base min-h-[96px] resize-y text-sm"
                value={adjustmentReason}
                onChange={(event) => setAdjustmentReason(event.target.value)}
              />
            </div>
            <button onClick={() => void handleAdjustment()} disabled={adjusting} className="btn-primary w-full justify-center text-sm">
              {adjusting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {t('subscriptionTopUps.admin.applyAdjustment', { ns: 'portal' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
