import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { getBillingProvider } from '@/lib/billing/provider';
import { getPlatformBillingCurrencyCode } from '@/lib/subscription/billing-currency';
import type {
  AiTopUpAdminCatalogResponse,
  AiTopUpAdminOrdersResponse,
  AiTopUpCatalogResponse,
  AiTopUpCheckoutResponse,
  AiTopUpHistoryResponse,
  AiTopUpOrderSummary,
  AiTopUpProduct,
  AiTopUpQuote,
  AiTopUpQuoteResponse,
  AiTopUpQuoteLine,
  AiTopUpSelectionInput,
  BillingActionError,
  PlanCode,
  SubscriptionTopUpBalances,
  UsageBalanceSnapshot,
} from '@/lib/subscription/types';
import type {
  CreateOneTimeCheckoutInput,
  VerifiedBillingEvent,
} from '@/lib/billing/types';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

type RawTopUpProductRow = {
  id: string;
  resource_type: AiTopUpProduct['resourceType'];
  enabled: boolean | null;
  active: boolean | null;
  name: string;
  description: string | null;
  unit_quantity: number | null;
  unit_label: string | null;
  price_amount: number | null;
  currency_code: string;
  minimum_quantity: number | null;
  maximum_quantity: number | null;
  quantity_step: number | null;
  sort_order: number | null;
  bundle_components: Partial<Record<'text_credit' | 'voice_second' | 'receipt_extraction', number>> | null;
};

type RawEligibilityRow = {
  product_id: string;
  plan_code: PlanCode;
};

type RawBalanceRow = {
  resource_type: 'text_credit' | 'voice_second' | 'receipt_extraction';
  available_quantity: number | null;
  reserved_quantity: number | null;
  total_purchased_quantity: number | null;
  total_consumed_quantity: number | null;
  updated_at: string | null;
};

type RawTopUpOrderRow = {
  id: string;
  order_reference: string;
  status: AiTopUpOrderSummary['status'];
  currency_code: string;
  subtotal_amount: number;
  vat_amount: number;
  total_amount: number;
  payment_reference: string | null;
  invoice_reference: string | null;
  invoice_number: string | null;
  created_at: string;
  paid_at: string | null;
  user_id?: string;
  user_profiles?: {
    email?: string | null;
    full_name?: string | null;
  } | Array<{
    email?: string | null;
    full_name?: string | null;
  }> | null;
};

type RawTopUpOrderItemRow = {
  id: string;
  order_id: string;
  product_name: string;
  resource_type: AiTopUpProduct['resourceType'];
  quantity: number;
  granted_quantity: number;
  subtotal_amount: number;
};

type PurchaseContext = {
  planCode: PlanCode | null;
  status: string | null;
  trialEndsAt: string | null;
  planActive: boolean;
  canPurchase: boolean;
};

function buildBillingError(code: BillingActionError['code'], message: string): BillingActionError {
  return { code, message };
}

function emptyUsage(): UsageBalanceSnapshot {
  return {
    includedRemaining: 0,
    purchasedRemaining: 0,
    totalAvailable: 0,
  };
}

function emptyBalances(): SubscriptionTopUpBalances {
  return {
    textCredit: {
      resourceType: 'text_credit',
      availableQuantity: 0,
      reservedQuantity: 0,
      totalPurchasedQuantity: 0,
      totalConsumedQuantity: 0,
      updatedAt: null,
    },
    voiceSecond: {
      resourceType: 'voice_second',
      availableQuantity: 0,
      reservedQuantity: 0,
      totalPurchasedQuantity: 0,
      totalConsumedQuantity: 0,
      updatedAt: null,
    },
    receiptExtraction: {
      resourceType: 'receipt_extraction',
      availableQuantity: 0,
      reservedQuantity: 0,
      totalPurchasedQuantity: 0,
      totalConsumedQuantity: 0,
      updatedAt: null,
    },
  };
}

function buildCatalogFallback(): AiTopUpCatalogResponse {
  return {
    products: [],
    balances: emptyBalances(),
    usage: {
      textCredit: emptyUsage(),
      voiceSecond: emptyUsage(),
      receiptExtraction: emptyUsage(),
    },
    currencyCode: getPlatformBillingCurrencyCode(),
    vatBasisPoints: 500,
    canPurchaseTopUps: false,
  };
}

function normalizeProduct(row: RawTopUpProductRow, eligibilityRows: RawEligibilityRow[]): AiTopUpProduct {
  return {
    id: row.id,
    resourceType: row.resource_type,
    enabled: Boolean(row.enabled),
    active: Boolean(row.active),
    name: row.name,
    description: row.description ?? null,
    unitQuantity: Math.max(1, row.unit_quantity ?? 1),
    unitLabel: row.unit_label ?? null,
    priceAmount: Math.max(0, row.price_amount ?? 0),
    currencyCode: getPlatformBillingCurrencyCode(row.currency_code),
    minimumQuantity: Math.max(1, row.minimum_quantity ?? 1),
    maximumQuantity: Math.max(1, row.maximum_quantity ?? 1),
    quantityStep: Math.max(1, row.quantity_step ?? 1),
    sortOrder: row.sort_order ?? 0,
    bundleComponents: row.bundle_components ?? undefined,
    eligiblePlanCodes: eligibilityRows
      .filter((item) => item.product_id === row.id)
      .map((item) => item.plan_code),
  };
}

async function getAdminClientOrThrow(): Promise<AdminClient> {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('Supabase service role is not configured.');
  }

  return admin;
}

async function loadPricingConfig(admin: AdminClient) {
  const { data, error } = await admin
    .from('platform_settings')
    .select('vat_basis_points')
    .maybeSingle();

  if (error && error.code !== '42P01') {
    throw error;
  }

  return {
    currencyCode: getPlatformBillingCurrencyCode(),
    vatBasisPoints: typeof (data as { vat_basis_points?: number } | null)?.vat_basis_points === 'number'
      ? Math.max(0, (data as { vat_basis_points: number }).vat_basis_points)
      : 500,
  };
}

async function loadPurchaseContext(admin: AdminClient, userId: string): Promise<PurchaseContext> {
  const { data, error } = await admin
    .from('user_subscriptions')
    .select(`
      status,
      trial_ends_at,
      subscription_plans (
        plan_code,
        is_active
      )
    `)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const plan = Array.isArray((data as { subscription_plans?: unknown } | null)?.subscription_plans)
    ? ((data as { subscription_plans?: Array<{ plan_code?: PlanCode; is_active?: boolean }> }).subscription_plans?.[0] ?? null)
    : ((data as { subscription_plans?: { plan_code?: PlanCode; is_active?: boolean } | null } | null)?.subscription_plans ?? null);
  const status = (data as { status?: string | null } | null)?.status ?? null;
  const trialEndsAt = (data as { trial_ends_at?: string | null } | null)?.trial_ends_at ?? null;
  const planCode = (plan?.plan_code ?? null) as PlanCode | null;
  const planActive = Boolean(plan?.is_active);
  const trialExpired = Boolean(status === 'trialing' && trialEndsAt && new Date(trialEndsAt).getTime() < Date.now());
  const canPurchase = Boolean(
    planActive
    && !trialExpired
    && (status === 'active' || status === 'trialing')
    && (planCode === 'personal' || planCode === 'family')
  );

  return {
    planCode,
    status,
    trialEndsAt,
    planActive,
    canPurchase,
  };
}

async function loadTopUpProducts(admin: AdminClient): Promise<AiTopUpProduct[]> {
  const [{ data: productRows, error: productError }, { data: eligibilityRows, error: eligibilityError }] = await Promise.all([
    admin
      .from('ai_topup_products')
      .select(`
        id,
        resource_type,
        enabled,
        active,
        name,
        description,
        unit_quantity,
        unit_label,
        price_amount,
        currency_code,
        minimum_quantity,
        maximum_quantity,
        quantity_step,
        sort_order,
        bundle_components
      `)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    admin
      .from('ai_topup_product_plan_eligibility')
      .select('product_id, plan_code'),
  ]);

  if (productError) {
    if (productError.code === '42P01') {
      return [];
    }
    throw productError;
  }

  if (eligibilityError) {
    if (eligibilityError.code === '42P01') {
      return [];
    }
    throw eligibilityError;
  }

  return ((productRows as RawTopUpProductRow[] | null) ?? []).map((row) =>
    normalizeProduct(row, (eligibilityRows as RawEligibilityRow[] | null) ?? [])
  );
}

async function loadBalances(admin: AdminClient, userId: string): Promise<SubscriptionTopUpBalances> {
  const { data, error } = await admin
    .from('ai_topup_balances')
    .select(`
      resource_type,
      available_quantity,
      reserved_quantity,
      total_purchased_quantity,
      total_consumed_quantity,
      updated_at
    `)
    .eq('user_id', userId);

  if (error) {
    if (error.code === '42P01') {
      return emptyBalances();
    }
    throw error;
  }

  const rowMap = new Map<string, RawBalanceRow>(
    ((data as RawBalanceRow[] | null) ?? []).map((row) => [row.resource_type, row] as const)
  );

  const toSummary = (resourceType: 'text_credit' | 'voice_second' | 'receipt_extraction') => {
    const row = rowMap.get(resourceType);
    return {
      resourceType,
      availableQuantity: Math.max(0, row?.available_quantity ?? 0),
      reservedQuantity: Math.max(0, row?.reserved_quantity ?? 0),
      totalPurchasedQuantity: Math.max(0, row?.total_purchased_quantity ?? 0),
      totalConsumedQuantity: Math.max(0, row?.total_consumed_quantity ?? 0),
      updatedAt: row?.updated_at ?? null,
    };
  };

  return {
    textCredit: toSummary('text_credit'),
    voiceSecond: toSummary('voice_second'),
    receiptExtraction: toSummary('receipt_extraction'),
  };
}

async function loadUsage(admin: AdminClient, userId: string, balances: SubscriptionTopUpBalances) {
  const { data, error } = await admin
    .from('user_subscriptions')
    .select(`
      status,
      subscription_plans (
        monthly_ai_credits,
        monthly_voice_seconds,
        monthly_receipt_extractions,
        receipt_intelligence_enabled
      )
    `)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const plan = Array.isArray((data as { subscription_plans?: unknown } | null)?.subscription_plans)
    ? ((data as { subscription_plans?: Array<Record<string, number | boolean | null>> }).subscription_plans?.[0] ?? null)
    : ((data as { subscription_plans?: Record<string, number | boolean | null> | null } | null)?.subscription_plans ?? null);

  const { data: usageCycle } = await admin
    .from('ai_usage_cycles')
    .select(`
      credits_allocated,
      credits_consumed,
      credits_reserved,
      voice_seconds_used,
      voice_seconds_reserved,
      receipt_extractions_allocated,
      receipt_extractions_consumed,
      receipt_extractions_reserved
    `)
    .eq('user_id', userId)
    .order('cycle_start', { ascending: false })
    .limit(1)
    .maybeSingle();

  const textIncluded = Math.max(
    0,
    Number(plan?.monthly_ai_credits ?? usageCycle?.credits_allocated ?? 0)
    - Number(usageCycle?.credits_consumed ?? 0)
    - Number(usageCycle?.credits_reserved ?? 0)
  );
  const voiceIncluded = Math.max(
    0,
    Number(plan?.monthly_voice_seconds ?? 0)
    - Number(usageCycle?.voice_seconds_used ?? 0)
    - Number(usageCycle?.voice_seconds_reserved ?? 0)
  );
  const receiptIncluded = Math.max(
    0,
    Number(usageCycle?.receipt_extractions_allocated ?? plan?.monthly_receipt_extractions ?? 0)
    - Number(usageCycle?.receipt_extractions_consumed ?? 0)
    - Number(usageCycle?.receipt_extractions_reserved ?? 0)
  );

  return {
    textCredit: {
      includedRemaining: textIncluded,
      purchasedRemaining: balances.textCredit.availableQuantity,
      totalAvailable: textIncluded + balances.textCredit.availableQuantity,
    },
    voiceSecond: {
      includedRemaining: voiceIncluded,
      purchasedRemaining: balances.voiceSecond.availableQuantity,
      totalAvailable: voiceIncluded + balances.voiceSecond.availableQuantity,
    },
    receiptExtraction: {
      includedRemaining: receiptIncluded,
      purchasedRemaining: balances.receiptExtraction.availableQuantity,
      totalAvailable: receiptIncluded + balances.receiptExtraction.availableQuantity,
    },
  };
}

function quoteLineFromProduct(product: AiTopUpProduct, quantity: number): AiTopUpQuoteLine {
  return {
    productId: product.id,
    productName: product.name,
    resourceType: product.resourceType,
    quantity,
    grantedQuantity: product.unitQuantity * quantity,
    unitPriceAmount: product.priceAmount,
    subtotalAmount: product.priceAmount * quantity,
    currencyCode: product.currencyCode,
    bundleComponents: product.bundleComponents,
  };
}

async function validateSelection(admin: AdminClient, userId: string, lines: AiTopUpSelectionInput[]) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      ok: false as const,
      error: buildBillingError('invalid_topup_selection', 'Select at least one top-up product.'),
    };
  }

  const [products, purchaseContext] = await Promise.all([
    loadTopUpProducts(admin),
    loadPurchaseContext(admin, userId),
  ]);

  if (!purchaseContext.canPurchase) {
    return {
      ok: false as const,
      error: buildBillingError('topup_not_allowed', 'Top-up purchases are not available for the current subscription.'),
    };
  }

  const productMap = new Map(products.map((product) => [product.id, product] as const));
  const quantityByProductId = new Map<string, number>();
  for (const line of lines) {
    if (!line?.productId) {
      return {
        ok: false as const,
        error: buildBillingError('invalid_topup_selection', 'One or more top-up products are unavailable.'),
      };
    }
    quantityByProductId.set(line.productId, (quantityByProductId.get(line.productId) ?? 0) + line.quantity);
  }
  const normalizedLines: AiTopUpQuoteLine[] = [];
  let currencyCode = '';

  for (const [productId, quantity] of quantityByProductId) {
    const product = productMap.get(productId);
    if (!product || !product.active || !product.enabled) {
      return {
        ok: false as const,
        error: buildBillingError('invalid_topup_selection', 'One or more top-up products are unavailable.'),
      };
    }

    if (!purchaseContext.planCode || !product.eligiblePlanCodes.includes(purchaseContext.planCode)) {
      return {
        ok: false as const,
        error: buildBillingError('topup_not_allowed', 'One or more top-up products are not available for this plan.'),
      };
    }

    if (!Number.isInteger(quantity) || quantity < product.minimumQuantity || quantity > product.maximumQuantity) {
      return {
        ok: false as const,
        error: buildBillingError('invalid_topup_selection', 'Selected quantity is outside the allowed range.'),
      };
    }

    if ((quantity - product.minimumQuantity) % product.quantityStep !== 0) {
      return {
        ok: false as const,
        error: buildBillingError('invalid_topup_selection', 'Selected quantity does not match the required step.'),
      };
    }

    if (!currencyCode) {
      currencyCode = product.currencyCode;
    } else if (currencyCode !== product.currencyCode) {
      return {
        ok: false as const,
        error: buildBillingError('invalid_topup_selection', 'All top-up products in one order must use the same currency.'),
      };
    }

    normalizedLines.push(quoteLineFromProduct(product, quantity));
  }

  return {
    ok: true as const,
    purchaseContext,
    lines: normalizedLines,
    products,
  };
}

export async function getAuthenticatedAiTopUpCatalog(userId: string): Promise<AiTopUpCatalogResponse> {
  const admin = await getAdminClientOrThrow();

  try {
    const [pricing, products, balances, purchaseContext] = await Promise.all([
      loadPricingConfig(admin),
      loadTopUpProducts(admin),
      loadBalances(admin, userId),
      loadPurchaseContext(admin, userId),
    ]);
    const usage = await loadUsage(admin, userId, balances);

    return {
      products: products.filter((product) =>
        product.active
        && product.enabled
        && Boolean(purchaseContext.planCode && product.eligiblePlanCodes.includes(purchaseContext.planCode))
      ),
      balances,
      usage,
      currencyCode: pricing.currencyCode,
      vatBasisPoints: pricing.vatBasisPoints,
      canPurchaseTopUps: purchaseContext.canPurchase,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as { code?: string }).code === '42P01') {
      return buildCatalogFallback();
    }

    throw error;
  }
}

export async function quoteAuthenticatedAiTopUpSelection(
  userId: string,
  lines: AiTopUpSelectionInput[]
): Promise<AiTopUpQuoteResponse> {
  const admin = await getAdminClientOrThrow();
  const pricing = await loadPricingConfig(admin);
  const validation = await validateSelection(admin, userId, lines);

  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
    };
  }

  const subtotalAmount = validation.lines.reduce((sum, line) => sum + line.subtotalAmount, 0);
  const vatAmount = Math.round((subtotalAmount * pricing.vatBasisPoints) / 10000);

  return {
    ok: true,
    quote: {
      currencyCode: validation.lines[0]?.currencyCode || pricing.currencyCode,
      subtotalAmount,
      vatAmount,
      totalAmount: subtotalAmount + vatAmount,
      lines: validation.lines,
    },
  };
}

function buildOrderReference(userId: string) {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `TU-${datePart}-${userId.slice(0, 8).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function appendOrderContextToUrl(rawUrl: string, orderId: string) {
  const url = new URL(rawUrl);
  url.searchParams.set('source', 'topup');
  url.searchParams.set('orderId', orderId);
  return url.toString();
}

async function createOrderRecord(admin: AdminClient, input: {
  userId: string;
  quote: AiTopUpQuote;
  providerName: string;
  vatBasisPoints: number;
}) {
  const orderReference = buildOrderReference(input.userId);
  const { data, error } = await admin
    .from('ai_topup_orders')
    .insert({
      user_id: input.userId,
      order_reference: orderReference,
      status: 'pending_payment',
      provider: input.providerName,
      currency_code: input.quote.currencyCode,
      subtotal_amount: input.quote.subtotalAmount,
      vat_amount: input.quote.vatAmount,
      total_amount: input.quote.totalAmount,
      vat_basis_points: input.vatBasisPoints,
    })
    .select('id, order_reference')
    .single();

  if (error) {
    throw error;
  }

  return {
    id: data.id as string,
    orderReference: data.order_reference as string,
  };
}

async function insertOrderItems(admin: AdminClient, orderId: string, quote: AiTopUpQuote) {
  const { error } = await admin
    .from('ai_topup_order_items')
    .insert(
      quote.lines.map((line) => ({
        order_id: orderId,
        product_id: line.productId,
        product_name: line.productName,
        resource_type: line.resourceType,
        quantity: line.quantity,
        unit_quantity: line.grantedQuantity / line.quantity,
        granted_quantity: line.grantedQuantity,
        unit_price_amount: line.unitPriceAmount,
        subtotal_amount: line.subtotalAmount,
        currency_code: line.currencyCode,
        bundle_components: line.bundleComponents ?? null,
      }))
    );

  if (error) {
    throw error;
  }
}

export async function createAiTopUpCheckoutForUser(input: {
  userId: string;
  email: string | null;
  lines: AiTopUpSelectionInput[];
  successUrl: string;
  cancelUrl: string;
}): Promise<AiTopUpCheckoutResponse> {
  const admin = await getAdminClientOrThrow();
  const pricing = await loadPricingConfig(admin);
  const quoteResult = await quoteAuthenticatedAiTopUpSelection(input.userId, input.lines);

  if (!quoteResult.ok || !quoteResult.quote) {
    return {
      ok: false,
      error: quoteResult.error,
    };
  }

  const provider = getBillingProvider();
  const order = await createOrderRecord(admin, {
    userId: input.userId,
    quote: quoteResult.quote,
    providerName: provider.name,
    vatBasisPoints: pricing.vatBasisPoints,
  });
  await insertOrderItems(admin, order.id, quoteResult.quote);

  if (!provider.configured || !provider.createOneTimeCheckoutSession) {
    await admin
      .from('ai_topup_orders')
      .update({
        status: 'failed',
        failure_reason: 'billing_provider_unavailable',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return {
      ok: false,
      orderId: order.id,
      error: buildBillingError('billing_provider_unavailable', 'Billing provider is not configured for one-time checkout.'),
    };
  }

  try {
    const successUrl = appendOrderContextToUrl(input.successUrl, order.id);
    const cancelUrl = appendOrderContextToUrl(input.cancelUrl, order.id);
    const sessionInput: CreateOneTimeCheckoutInput = {
      userId: input.userId,
      email: input.email,
      orderId: order.id,
      orderReference: order.orderReference,
      currencyCode: quoteResult.quote.currencyCode,
      subtotalAmount: quoteResult.quote.subtotalAmount,
      vatAmount: quoteResult.quote.vatAmount,
      totalAmount: quoteResult.quote.totalAmount,
      successUrl,
      cancelUrl,
      metadata: {
        purchase_type: 'ai_topup',
        topup_order_id: order.id,
        topup_order_reference: order.orderReference,
      },
    };
    const result = await provider.createOneTimeCheckoutSession(sessionInput);

    await admin
      .from('ai_topup_orders')
      .update({
        provider_checkout_session_id: result.providerSessionId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return {
      ok: true,
      orderId: order.id,
      sessionId: result.providerSessionId,
      checkoutUrl: result.checkoutUrl,
    };
  } catch {
    await admin
      .from('ai_topup_orders')
      .update({
        status: 'failed',
        failure_reason: 'checkout_creation_failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order.id);

    return {
      ok: false,
      orderId: order.id,
      error: buildBillingError('checkout_creation_failed', 'One-time checkout could not be created.'),
    };
  }
}

function normalizeOrders(
  orders: RawTopUpOrderRow[],
  items: RawTopUpOrderItemRow[]
): AiTopUpOrderSummary[] {
  return orders.map((order) => ({
    id: order.id,
    orderReference: order.order_reference,
    status: order.status,
    currencyCode: getPlatformBillingCurrencyCode(order.currency_code),
    subtotalAmount: order.subtotal_amount,
    vatAmount: order.vat_amount,
    totalAmount: order.total_amount,
    paymentReference: order.payment_reference,
    invoiceReference: order.invoice_reference,
    invoiceNumber: order.invoice_number,
    createdAt: order.created_at,
    paidAt: order.paid_at,
    userId: order.user_id ?? null,
    userEmail: Array.isArray(order.user_profiles)
      ? (order.user_profiles[0]?.email ?? null)
      : (order.user_profiles?.email ?? null),
    userFullName: Array.isArray(order.user_profiles)
      ? (order.user_profiles[0]?.full_name ?? null)
      : (order.user_profiles?.full_name ?? null),
    items: items
      .filter((item) => item.order_id === order.id)
      .map((item) => ({
        id: item.id,
        productName: item.product_name,
        resourceType: item.resource_type,
        quantity: item.quantity,
        grantedQuantity: item.granted_quantity,
        subtotalAmount: item.subtotal_amount,
      })),
  }));
}

export async function getAuthenticatedAiTopUpHistory(userId: string): Promise<AiTopUpHistoryResponse> {
  const admin = await getAdminClientOrThrow();

  const { data: orderRows, error: orderError } = await admin
    .from('ai_topup_orders')
    .select(`
      id,
      order_reference,
      status,
      currency_code,
      subtotal_amount,
      vat_amount,
      total_amount,
      payment_reference,
      invoice_reference,
      invoice_number,
      created_at,
      paid_at
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (orderError) {
    if (orderError.code === '42P01') {
      return { orders: [] };
    }
    throw orderError;
  }

  const orderIds = ((orderRows as RawTopUpOrderRow[] | null) ?? []).map((order) => order.id);
  if (orderIds.length === 0) {
    return { orders: [] };
  }

  const { data: itemRows, error: itemError } = await admin
    .from('ai_topup_order_items')
    .select(`
      id,
      order_id,
      product_name,
      resource_type,
      quantity,
      granted_quantity,
      subtotal_amount
    `)
    .in('order_id', orderIds);

  if (itemError) {
    if (itemError.code === '42P01') {
      return { orders: [] };
    }
    throw itemError;
  }

  return {
    orders: normalizeOrders(
      (orderRows as RawTopUpOrderRow[] | null) ?? [],
      (itemRows as RawTopUpOrderItemRow[] | null) ?? []
    ),
  };
}

export async function getAdminAiTopUpCatalog(): Promise<AiTopUpAdminCatalogResponse> {
  const admin = await getAdminClientOrThrow();
  return {
    products: await loadTopUpProducts(admin),
  };
}

export async function saveAdminAiTopUpProduct(input: Partial<AiTopUpProduct>) {
  const admin = await getAdminClientOrThrow();
  const now = new Date().toISOString();
  const productPayload = {
    resource_type: input.resourceType,
    enabled: Boolean(input.enabled),
    active: Boolean(input.active),
    name: input.name?.trim() || 'Unnamed top-up',
    description: input.description ?? null,
    unit_quantity: Math.max(1, input.unitQuantity ?? 1),
    unit_label: input.unitLabel ?? null,
    price_amount: Math.max(0, input.priceAmount ?? 0),
    currency_code: getPlatformBillingCurrencyCode(input.currencyCode),
    minimum_quantity: Math.max(1, input.minimumQuantity ?? 1),
    maximum_quantity: Math.max(1, input.maximumQuantity ?? 1),
    quantity_step: Math.max(1, input.quantityStep ?? 1),
    sort_order: input.sortOrder ?? 0,
    bundle_components: input.bundleComponents ?? null,
    updated_at: now,
  };

  const query = input.id
    ? admin
      .from('ai_topup_products')
      .update(productPayload)
      .eq('id', input.id)
    : admin
      .from('ai_topup_products')
      .insert(productPayload);

  const { data, error } = await query.select('*').single();
  if (error) {
    throw error;
  }

  const productId = data.id as string;
  await admin
    .from('ai_topup_product_plan_eligibility')
    .delete()
    .eq('product_id', productId);

  const eligibilityRows = (input.eligiblePlanCodes ?? []).map((planCode) => ({
    product_id: productId,
    plan_code: planCode,
  }));

  if (eligibilityRows.length > 0) {
    const { error: eligibilityError } = await admin
      .from('ai_topup_product_plan_eligibility')
      .insert(eligibilityRows);

    if (eligibilityError) {
      throw eligibilityError;
    }
  }

  const products = await loadTopUpProducts(admin);
  const product = products.find((item) => item.id === productId);
  if (!product) {
    throw new Error('Saved top-up product could not be reloaded.');
  }

  return product;
}

export async function getAdminAiTopUpOrders(): Promise<AiTopUpAdminOrdersResponse> {
  const admin = await getAdminClientOrThrow();
  const [{ data: orderRows, error: orderError }, { data: itemRows, error: itemError }] = await Promise.all([
    admin
      .from('ai_topup_orders')
      .select(`
        id,
        user_id,
        order_reference,
        status,
        currency_code,
        subtotal_amount,
        vat_amount,
        total_amount,
        payment_reference,
        invoice_reference,
        invoice_number,
        created_at,
        paid_at,
        user_profiles (
          email,
          full_name
        )
      `)
      .order('created_at', { ascending: false }),
    admin
      .from('ai_topup_order_items')
      .select(`
        id,
        order_id,
        product_name,
        resource_type,
        quantity,
        granted_quantity,
        subtotal_amount
      `),
  ]);

  if (orderError) {
    if (orderError.code === '42P01') {
      return { orders: [] };
    }
    throw orderError;
  }

  if (itemError) {
    if (itemError.code === '42P01') {
      return { orders: [] };
    }
    throw itemError;
  }

  return {
    orders: normalizeOrders(
      (orderRows as RawTopUpOrderRow[] | null) ?? [],
      (itemRows as RawTopUpOrderItemRow[] | null) ?? []
    ),
  };
}

export async function createAdminAiTopUpAdjustment(input: {
  adminUserId: string;
  userId: string;
  resourceType: 'text_credit' | 'voice_second' | 'receipt_extraction';
  quantityDelta: number;
  reason: string;
}) {
  const admin = await getAdminClientOrThrow();
  const { error } = await admin.rpc('admin_adjust_ai_topup_balance', {
    p_admin_user_id: input.adminUserId,
    p_user_id: input.userId,
    p_resource_type: input.resourceType,
    p_quantity_delta: input.quantityDelta,
    p_reason: input.reason,
  });

  if (error) {
    return {
      ok: false,
      error: {
        code: 'adjustment_failed' as const,
        message: error.message || 'Top-up balance adjustment failed.',
      },
    };
  }

  return { ok: true };
}

export async function processVerifiedTopUpBillingEvent(event: VerifiedBillingEvent) {
  if (!event.topUpOrder) {
    return { ok: true as const, handled: false as const };
  }

  const admin = await getAdminClientOrThrow();
  const eventType = event.eventType.toLowerCase();

  if (eventType.includes('refund') || eventType.includes('chargeback') || eventType.includes('reversal')) {
    const { error } = await admin.rpc('reverse_ai_topup_order_payment', {
      p_order_id: event.topUpOrder.orderId,
      p_provider_event_id: event.eventId,
      p_payment_reference: event.topUpOrder.paymentReference,
      p_reason: event.eventType,
    });

    if (error) {
      return {
        ok: false as const,
        handled: true as const,
        error: buildBillingError('duplicate_payment_fulfillment', error.message || 'Top-up payment reversal failed.'),
      };
    }

    return { ok: true as const, handled: true as const };
  }

  const { error } = await admin.rpc('fulfill_ai_topup_order_payment', {
    p_order_id: event.topUpOrder.orderId,
    p_provider: event.provider,
    p_provider_event_id: event.eventId,
    p_payment_reference: event.topUpOrder.paymentReference,
  });

  if (error) {
    return {
      ok: false as const,
      handled: true as const,
      error: buildBillingError('duplicate_payment_fulfillment', error.message || 'Top-up payment fulfillment failed.'),
    };
  }

  return { ok: true as const, handled: true as const };
}
