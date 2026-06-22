import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { TransactionDocumentItemKind } from '@/lib/transaction-documents';

const DEFAULT_CURRENCY = 'USD';
const ITEM_NORMALIZATION_STOP_WORDS = new Set([
  'fresh',
  'full',
  'cream',
  'fullcream',
  'whole',
  'organic',
  'premium',
  'large',
  'small',
  'medium',
  'extra',
  'extraa',
  'regular',
  'original',
  'plain',
  'brand',
  'pack',
  'packet',
  'bottle',
  'box',
  'bag',
  'tin',
  'jar',
  'pcs',
  'piece',
  'pieces',
]);

type JoinedAccountRow = {
  name?: string | null;
};

type JoinedTransactionRow = {
  id: string;
  merchant?: string | null;
  description?: string | null;
  transaction_date: string;
  transaction_type: 'income' | 'expense' | 'transfer';
  currency?: string | null;
  category_id?: string | null;
  account_id?: string | null;
  amount?: number | string | null;
  account?: JoinedAccountRow | JoinedAccountRow[] | null;
};

type JoinedCategoryRow = {
  name?: string | null;
};

type ItemIdentityRow = {
  id: string;
  canonical_name: string;
  normalized_name: string;
  ai_suggested?: boolean | null;
};

type ItemIdentityAliasRow = {
  id: string;
  identity_id: string;
  alias_name: string;
  normalized_alias: string;
  source?: string | null;
};

type TransactionItemInsightQueryRow = {
  id: string;
  document_id?: string | null;
  name: string;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  category_id?: string | null;
  item_kind?: TransactionDocumentItemKind | null;
  transaction?: JoinedTransactionRow | JoinedTransactionRow[] | null;
  item_category?: JoinedCategoryRow | JoinedCategoryRow[] | null;
};

export interface TransactionItemInsightFilters {
  startDate?: string;
  endDate?: string;
  transactionType?: 'expense' | 'income';
  merchant?: string;
  itemName?: string;
  normalizedName?: string;
  categoryId?: string | null;
  accountId?: string;
  currency?: string;
  includeNonRegular?: boolean;
  limit?: number;
  supabaseClient?: SupabaseClient;
}

export interface TransactionItemInsightRow {
  id: string;
  documentId: string | null;
  itemName: string;
  canonicalItemName: string;
  normalizedBaseName: string;
  normalizedItemName: string;
  identityId: string | null;
  quantity: number | null;
  unitPrice: number | null;
  effectiveUnitPrice: number | null;
  lineTotal: number;
  categoryId: string | null;
  categoryName: string | null;
  itemKind: TransactionDocumentItemKind;
  merchant: string | null;
  transactionId: string;
  transactionDescription: string | null;
  transactionDate: string;
  transactionType: 'expense' | 'income';
  currency: string;
  accountId: string | null;
  accountName: string | null;
  parentCategoryId: string | null;
  parentTransactionAmount: number | null;
}

export interface SpendingByItemResult {
  itemName: string;
  normalizedItemName: string;
  currency: string;
  totalSpent: number;
  purchaseCount: number;
  totalQuantity: number;
  averageUnitPrice: number | null;
  lastPaidPrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  lastPurchasedAt: string | null;
  merchants: string[];
}

export interface ItemPurchaseFrequencyResult {
  itemName: string;
  normalizedItemName: string;
  currency: string;
  purchaseCount: number;
  firstPurchasedAt: string | null;
  lastPurchasedAt: string | null;
  averageIntervalDays: number | null;
  purchaseDates: string[];
}

export interface LastPaidPriceResult {
  itemName: string;
  normalizedItemName: string;
  unitPrice: number | null;
  lineTotal: number;
  quantity: number | null;
  merchant: string | null;
  transactionDate: string;
  currency: string;
}

export interface AverageUnitPriceResult {
  itemName: string;
  normalizedItemName: string;
  currency: string;
  averageUnitPrice: number | null;
  samples: number;
}

export interface SpendingByItemCategoryResult {
  categoryId: string | null;
  categoryName: string | null;
  currency: string;
  totalSpent: number;
  purchaseCount: number;
  itemCount: number;
}

export interface MerchantItemHistoryResult {
  merchant: string | null;
  currency: string;
  totalSpent: number;
  purchaseCount: number;
  lastPurchasedAt: string | null;
  lastPaidPrice: number | null;
}

export interface ItemPriceHistoryEntry {
  id: string;
  transactionId: string;
  transactionDate: string;
  merchant: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number;
  percentageChangeFromPrevious: number | null;
}

export interface ItemPriceHistoryResult {
  itemName: string;
  normalizedItemName: string;
  currency: string;
  averagePrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  entries: ItemPriceHistoryEntry[];
}

export interface RecentPriceChangeResult {
  itemName: string;
  normalizedItemName: string;
  currency: string;
  merchant: string | null;
  latestDate: string;
  latestPrice: number;
  previousPrice: number;
  averagePrice: number;
  percentageChange: number;
}

export interface MerchantInsightResult {
  merchant: string | null;
  currency: string;
  totalSpent: number;
  visitCount: number;
  averageReceiptValue: number;
  lastVisit: string | null;
  mostPurchasedItems: Array<{ itemName: string; purchaseCount: number }>;
  categoryBreakdown: Array<{ categoryName: string | null; totalSpent: number }>;
  repeatedItemPriceHistory: RecentPriceChangeResult[];
}

export interface RecurringPurchaseSuggestion {
  id: string;
  itemName: string;
  normalizedItemName: string;
  merchant: string | null;
  currency: string;
  purchaseCount: number;
  averageIntervalDays: number;
  lastPurchasedAt: string;
  nextLikelyPurchaseDate: string;
  averagePrice: number | null;
  latestPrice: number | null;
  latestPriceVsAveragePct: number | null;
  dueSoon: boolean;
  insightType: 'price_above_average' | 'due_again_soon';
}

export interface ReceiptDashboardInsight {
  id: string;
  type: 'top_repeated_item' | 'price_increase' | 'recurring_due' | 'highest_spend_item';
  itemName?: string | null;
  purchaseCount?: number | null;
  percentageChange?: number | null;
  dueDate?: string | null;
  totalSpent?: number | null;
  currency?: string | null;
  actionItemName?: string | null;
}

export interface ItemInsightsFilterOptions {
  accounts: Array<{ id: string; name: string }>;
  merchants: string[];
  categories: Array<{ id: string; name: string }>;
  items: Array<{ itemName: string; normalizedItemName: string }>;
  currencies: string[];
}

export interface ItemInsightsSnapshot {
  rows: TransactionItemInsightRow[];
  totalsByCurrency: Array<{ currency: string; total: number }>;
  topItemsBySpend: SpendingByItemResult[];
  topItemsByFrequency: ItemPurchaseFrequencyResult[];
  spendingByCategory: SpendingByItemCategoryResult[];
  merchantInsights: MerchantInsightResult[];
  recentPriceChanges: RecentPriceChangeResult[];
  recurringSuggestions: RecurringPurchaseSuggestion[];
  filterOptions: ItemInsightsFilterOptions;
  selectedItemHistory: ItemPriceHistoryResult[];
  selectedItemMerchantHistory: MerchantItemHistoryResult[];
}

export interface ItemIdentityOption {
  id: string;
  canonicalName: string;
  normalizedName: string;
}

function unwrapRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] || null;
  }
  return value || null;
}

function normalizeNumeric(value: number | string | null | undefined) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeText(value: string | null | undefined) {
  return (value || '').trim().replace(/\s+/g, ' ');
}

function normalizeToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(\d+)(ml|l|kg|g|gm|pack|pcs|pc)$/i, '$1');
}

function singularizeToken(value: string) {
  if (value.length > 4 && value.endsWith('ies')) {
    return `${value.slice(0, -3)}y`;
  }
  if (value.length > 3 && value.endsWith('s') && !value.endsWith('ss')) {
    return value.slice(0, -1);
  }
  return value;
}

export function normalizeReceiptItemName(value: string | null | undefined) {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');

  const tokens = normalized
    .split(' ')
    .map((token) => singularizeToken(normalizeToken(token)))
    .filter(Boolean)
    .filter((token) => !ITEM_NORMALIZATION_STOP_WORDS.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !/^\d+(ml|l|kg|g|gm)$/.test(token));

  if (tokens.length === 0) {
    return normalized;
  }
  return tokens.join(' ');
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function differenceInDays(left: string, right: string) {
  const leftDate = new Date(`${left}T12:00:00Z`);
  const rightDate = new Date(`${right}T12:00:00Z`);
  return Math.round((leftDate.getTime() - rightDate.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function sortByNewestDate<T extends { transactionDate: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
}

function resolveSupabaseClient(supabaseClient?: SupabaseClient) {
  return supabaseClient || createClient();
}

function resolveEffectiveUnitPrice(row: Pick<TransactionItemInsightRow, 'unitPrice' | 'quantity' | 'lineTotal'>) {
  if (typeof row.unitPrice === 'number' && Number.isFinite(row.unitPrice) && row.unitPrice > 0) {
    return roundMoney(row.unitPrice);
  }
  if (
    typeof row.quantity === 'number'
    && Number.isFinite(row.quantity)
    && row.quantity > 0
  ) {
    return roundMoney(row.lineTotal / row.quantity);
  }
  return null;
}

async function getItemIdentityLookup(supabaseClient?: SupabaseClient) {
  const supabase = resolveSupabaseClient(supabaseClient);
  const [{ data: identityRows, error: identityError }, { data: aliasRows, error: aliasError }] = await Promise.all([
    supabase
      .from('item_identities')
      .select('id, canonical_name, normalized_name, ai_suggested')
      .order('canonical_name', { ascending: true }),
    supabase
      .from('item_identity_aliases')
      .select('id, identity_id, alias_name, normalized_alias, source')
      .order('alias_name', { ascending: true }),
  ]);

  if (identityError) {
    throw identityError;
  }
  if (aliasError) {
    throw aliasError;
  }

  const identityMap = new Map<string, ItemIdentityOption>();
  const aliasMap = new Map<string, ItemIdentityOption>();

  for (const row of (identityRows || []) as ItemIdentityRow[]) {
    const option = {
      id: row.id,
      canonicalName: normalizeText(row.canonical_name) || normalizeText(row.normalized_name) || row.id,
      normalizedName: normalizeReceiptItemName(row.normalized_name || row.canonical_name),
    } satisfies ItemIdentityOption;
    identityMap.set(row.id, option);
    aliasMap.set(option.normalizedName, option);
  }

  for (const row of (aliasRows || []) as ItemIdentityAliasRow[]) {
    const identity = identityMap.get(row.identity_id);
    if (!identity) continue;
    aliasMap.set(normalizeReceiptItemName(row.normalized_alias || row.alias_name), identity);
  }

  return {
    identityOptions: Array.from(identityMap.values()),
    aliasMap,
  };
}

export async function getItemIdentityOptions(supabaseClient?: SupabaseClient) {
  const lookup = await getItemIdentityLookup(supabaseClient);
  return lookup.identityOptions;
}

export async function createOrUpdateItemIdentity(args: {
  canonicalName: string;
  aliases: string[];
  identityId?: string | null;
  aiSuggested?: boolean;
  supabaseClient?: SupabaseClient;
}) {
  const supabase = resolveSupabaseClient(args.supabaseClient);
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) {
    throw new Error('Not authenticated');
  }

  const canonicalName = normalizeText(args.canonicalName);
  if (!canonicalName) {
    throw new Error('Canonical item name is required.');
  }

  const normalizedName = normalizeReceiptItemName(canonicalName);
  const payload = {
    user_id: userId,
    canonical_name: canonicalName,
    normalized_name: normalizedName,
    ai_suggested: args.aiSuggested === true,
    updated_at: new Date().toISOString(),
  };

  const identityQuery = args.identityId
    ? supabase
      .from('item_identities')
      .update(payload)
      .eq('id', args.identityId)
      .eq('user_id', userId)
      .select('id, canonical_name, normalized_name')
      .single()
    : supabase
      .from('item_identities')
      .insert(payload)
      .select('id, canonical_name, normalized_name')
      .single();

  const { data: identity, error: identityError } = await identityQuery;
  if (identityError) {
    throw identityError;
  }

  const aliasPayload = [canonicalName, ...args.aliases]
    .map((aliasName) => normalizeText(aliasName))
    .filter(Boolean)
    .map((aliasName) => ({
      user_id: userId,
      identity_id: identity.id,
      alias_name: aliasName,
      normalized_alias: normalizeReceiptItemName(aliasName),
      source: args.aiSuggested === true ? 'ai_suggested' : 'manual',
      updated_at: new Date().toISOString(),
    }));

  if (aliasPayload.length > 0) {
    const { error: aliasError } = await supabase
      .from('item_identity_aliases')
      .upsert(aliasPayload, { onConflict: 'user_id,normalized_alias' });
    if (aliasError) {
      throw aliasError;
    }
  }

  return {
    id: identity.id,
    canonicalName: identity.canonical_name,
    normalizedName: identity.normalized_name,
  } satisfies ItemIdentityOption;
}

export async function mergeItemIdentity(args: {
  sourceIdentityId: string;
  targetIdentityId: string;
  supabaseClient?: SupabaseClient;
}) {
  const supabase = resolveSupabaseClient(args.supabaseClient);
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) {
    throw new Error('Not authenticated');
  }

  const { data: sourceIdentity, error: sourceError } = await supabase
    .from('item_identities')
    .select('id, canonical_name')
    .eq('id', args.sourceIdentityId)
    .eq('user_id', userId)
    .single();
  if (sourceError) {
    throw sourceError;
  }

  const { error: reassignError } = await supabase
    .from('item_identity_aliases')
    .update({
      identity_id: args.targetIdentityId,
      updated_at: new Date().toISOString(),
    })
    .eq('identity_id', args.sourceIdentityId)
    .eq('user_id', userId);
  if (reassignError) {
    throw reassignError;
  }

  await createOrUpdateItemIdentity({
    identityId: args.targetIdentityId,
    canonicalName: sourceIdentity.canonical_name,
    aliases: [sourceIdentity.canonical_name],
    supabaseClient: supabase,
  });

  const { error: deleteError } = await supabase
    .from('item_identities')
    .delete()
    .eq('id', args.sourceIdentityId)
    .eq('user_id', userId);
  if (deleteError) {
    throw deleteError;
  }
}

export async function getTransactionItemInsightRows(filters: TransactionItemInsightFilters = {}) {
  const supabase = resolveSupabaseClient(filters.supabaseClient);
  const [{ data, error }, lookup] = await Promise.all([
    supabase
      .from('transaction_items')
      .select(`
        id,
        document_id,
        name,
        quantity,
        unit_price,
        line_total,
        category_id,
        item_kind,
        transaction:transactions!inner(
          id,
          merchant,
          description,
          transaction_date,
          transaction_type,
          currency,
          category_id,
          account_id,
          amount,
          account:financial_accounts(name)
        ),
        item_category:categories(name)
      `),
    getItemIdentityLookup(supabase),
  ]);

  if (error) {
    throw error;
  }

  const includeNonRegular = filters.includeNonRegular === true;
  const normalizedMerchantFilter = normalizeText(filters.merchant).toLowerCase();
  const normalizedItemFilter = normalizeReceiptItemName(filters.itemName || filters.normalizedName || '');
  const normalizedCurrencyFilter = normalizeText(filters.currency).toUpperCase();

  const rows = ((data || []) as TransactionItemInsightQueryRow[])
    .map<TransactionItemInsightRow | null>((row) => {
      const transaction = unwrapRelation(row.transaction);
      const itemCategory = unwrapRelation(row.item_category);
      const account = unwrapRelation(transaction?.account);
      const itemName = normalizeText(row.name);
      const normalizedBaseName = normalizeReceiptItemName(itemName);
      const identity = lookup.aliasMap.get(normalizedBaseName) || null;
      const normalizedItemName = identity?.normalizedName || normalizedBaseName;
      const lineTotal = normalizeNumeric(row.line_total);
      const transactionType = transaction?.transaction_type === 'income'
        ? 'income'
        : transaction?.transaction_type === 'expense'
          ? 'expense'
          : null;

      if (!transaction || !transactionType || !itemName || !normalizedItemName || lineTotal === null || lineTotal <= 0) {
        return null;
      }

      const quantity = normalizeNumeric(row.quantity);
      const unitPrice = normalizeNumeric(row.unit_price);
      const itemKind = row.item_kind === 'discount'
        || row.item_kind === 'tax'
        || row.item_kind === 'fee'
        ? row.item_kind
        : 'regular';

      const baseRow = {
        id: row.id,
        documentId: row.document_id || null,
        itemName,
        canonicalItemName: identity?.canonicalName || itemName,
        normalizedBaseName,
        normalizedItemName,
        identityId: identity?.id || null,
        quantity,
        unitPrice,
        lineTotal,
        categoryId: row.category_id || null,
        categoryName: itemCategory?.name || null,
        itemKind,
        merchant: normalizeText(transaction.merchant) || null,
        transactionId: transaction.id,
        transactionDescription: normalizeText(transaction.description) || null,
        transactionDate: transaction.transaction_date,
        transactionType,
        currency: normalizeText(transaction.currency).toUpperCase() || DEFAULT_CURRENCY,
        accountId: transaction.account_id || null,
        accountName: normalizeText(account?.name) || null,
        parentCategoryId: transaction.category_id || null,
        parentTransactionAmount: normalizeNumeric(transaction.amount),
      } satisfies Omit<TransactionItemInsightRow, 'effectiveUnitPrice'>;

      return {
        ...baseRow,
        effectiveUnitPrice: resolveEffectiveUnitPrice({
          unitPrice,
          quantity,
          lineTotal,
        }),
      } satisfies TransactionItemInsightRow;
    })
    .filter((row): row is TransactionItemInsightRow => !!row)
    .filter((row) => includeNonRegular || row.itemKind === 'regular')
    .filter((row) => !filters.transactionType || row.transactionType === filters.transactionType)
    .filter((row) => !filters.startDate || row.transactionDate >= filters.startDate)
    .filter((row) => !filters.endDate || row.transactionDate <= filters.endDate)
    .filter((row) => !normalizedMerchantFilter || (row.merchant || '').toLowerCase().includes(normalizedMerchantFilter))
    .filter((row) => !normalizedItemFilter || row.normalizedItemName.includes(normalizedItemFilter) || normalizeReceiptItemName(row.itemName).includes(normalizedItemFilter))
    .filter((row) => !filters.categoryId || row.categoryId === filters.categoryId || row.parentCategoryId === filters.categoryId)
    .filter((row) => !filters.accountId || row.accountId === filters.accountId)
    .filter((row) => !normalizedCurrencyFilter || row.currency === normalizedCurrencyFilter);

  const sortedRows = sortByNewestDate(rows);
  if (typeof filters.limit === 'number' && filters.limit > 0) {
    return sortedRows.slice(0, filters.limit);
  }
  return sortedRows;
}

function buildCurrencyTotals(rows: TransactionItemInsightRow[]) {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.currency, roundMoney((totals.get(row.currency) || 0) + row.lineTotal));
  }
  return Array.from(totals.entries())
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function groupRowsByItemCurrency(rows: TransactionItemInsightRow[]) {
  const grouped = new Map<string, TransactionItemInsightRow[]>();
  for (const row of rows) {
    const groupKey = `${row.normalizedItemName}::${row.currency}`;
    const current = grouped.get(groupKey) || [];
    current.push(row);
    grouped.set(groupKey, current);
  }
  return grouped;
}

export async function getSpendingByItem(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    transactionType: filters.transactionType || 'expense',
  });
  const grouped = new Map<string, SpendingByItemResult>();

  for (const row of rows) {
    const groupKey = `${row.normalizedItemName}::${row.currency}`;
    const existing = grouped.get(groupKey) || {
      itemName: row.canonicalItemName || row.itemName,
      normalizedItemName: row.normalizedItemName,
      currency: row.currency,
      totalSpent: 0,
      purchaseCount: 0,
      totalQuantity: 0,
      averageUnitPrice: null,
      lastPaidPrice: null,
      lowestPrice: null,
      highestPrice: null,
      lastPurchasedAt: null,
      merchants: [],
    };
    existing.totalSpent = roundMoney(existing.totalSpent + row.lineTotal);
    existing.purchaseCount += 1;
    existing.totalQuantity += row.quantity || 0;

    if (row.effectiveUnitPrice !== null) {
      const weightedTotal = (existing.averageUnitPrice || 0) * (existing.purchaseCount - 1) + row.effectiveUnitPrice;
      existing.averageUnitPrice = roundMoney(weightedTotal / existing.purchaseCount);
      existing.lowestPrice = existing.lowestPrice === null
        ? row.effectiveUnitPrice
        : Math.min(existing.lowestPrice, row.effectiveUnitPrice);
      existing.highestPrice = existing.highestPrice === null
        ? row.effectiveUnitPrice
        : Math.max(existing.highestPrice, row.effectiveUnitPrice);
      if (existing.lastPaidPrice === null || row.transactionDate >= (existing.lastPurchasedAt || '')) {
        existing.lastPaidPrice = row.effectiveUnitPrice;
      }
    }

    if (!existing.lastPurchasedAt || row.transactionDate >= existing.lastPurchasedAt) {
      existing.lastPurchasedAt = row.transactionDate;
      existing.itemName = row.canonicalItemName || row.itemName;
      if (row.effectiveUnitPrice !== null) {
        existing.lastPaidPrice = row.effectiveUnitPrice;
      }
    }
    if (row.merchant && !existing.merchants.includes(row.merchant)) {
      existing.merchants.push(row.merchant);
    }
    grouped.set(groupKey, existing);
  }

  return Array.from(grouped.values()).sort((a, b) => b.totalSpent - a.totalSpent);
}

export async function getItemPurchaseFrequency(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows(filters);
  const grouped = new Map<string, ItemPurchaseFrequencyResult>();

  for (const row of rows) {
    const groupKey = `${row.normalizedItemName}::${row.currency}`;
    const existing = grouped.get(groupKey) || {
      itemName: row.canonicalItemName || row.itemName,
      normalizedItemName: row.normalizedItemName,
      currency: row.currency,
      purchaseCount: 0,
      firstPurchasedAt: null,
      lastPurchasedAt: null,
      averageIntervalDays: null,
      purchaseDates: [],
    };
    existing.purchaseCount += 1;
    existing.firstPurchasedAt = !existing.firstPurchasedAt || row.transactionDate < existing.firstPurchasedAt
      ? row.transactionDate
      : existing.firstPurchasedAt;
    existing.lastPurchasedAt = !existing.lastPurchasedAt || row.transactionDate > existing.lastPurchasedAt
      ? row.transactionDate
      : existing.lastPurchasedAt;
    if (!existing.purchaseDates.includes(row.transactionDate)) {
      existing.purchaseDates.push(row.transactionDate);
    }
    grouped.set(groupKey, existing);
  }

  for (const item of grouped.values()) {
    const sortedDates = [...item.purchaseDates].sort();
    const intervals = sortedDates.slice(1).map((date, index) => differenceInDays(date, sortedDates[index]));
    if (intervals.length > 0) {
      item.averageIntervalDays = roundMoney(intervals.reduce((sum, value) => sum + value, 0) / intervals.length);
    }
  }

  return Array.from(grouped.values()).sort((a, b) => b.purchaseCount - a.purchaseCount);
}

export async function getLastPaidPrice(itemName: string, filters: Omit<TransactionItemInsightFilters, 'itemName' | 'limit'> = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    itemName,
    transactionType: filters.transactionType || 'expense',
    limit: 1,
  });
  const latestRow = rows[0];
  if (!latestRow) {
    return null;
  }

  return {
    itemName: latestRow.canonicalItemName || latestRow.itemName,
    normalizedItemName: latestRow.normalizedItemName,
    unitPrice: latestRow.effectiveUnitPrice,
    lineTotal: latestRow.lineTotal,
    quantity: latestRow.quantity,
    merchant: latestRow.merchant,
    transactionDate: latestRow.transactionDate,
    currency: latestRow.currency,
  } satisfies LastPaidPriceResult;
}

export async function getAverageUnitPrice(itemName: string, filters: Omit<TransactionItemInsightFilters, 'itemName' | 'limit'> = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    itemName,
    transactionType: filters.transactionType || 'expense',
  });
  const priceRows = rows.filter((row) => row.effectiveUnitPrice !== null);
  if (priceRows.length === 0) {
    return {
      itemName: normalizeText(itemName),
      normalizedItemName: normalizeReceiptItemName(itemName),
      currency: normalizeText(filters.currency).toUpperCase() || DEFAULT_CURRENCY,
      averageUnitPrice: null,
      samples: 0,
    } satisfies AverageUnitPriceResult;
  }

  const averageUnitPrice = roundMoney(
    priceRows.reduce((sum, row) => sum + (row.effectiveUnitPrice || 0), 0) / priceRows.length
  );

  return {
    itemName: priceRows[0].canonicalItemName || priceRows[0].itemName,
    normalizedItemName: priceRows[0].normalizedItemName,
    currency: priceRows[0].currency,
    averageUnitPrice,
    samples: priceRows.length,
  } satisfies AverageUnitPriceResult;
}

export async function getSpendingByItemCategory(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    transactionType: filters.transactionType || 'expense',
  });
  const grouped = new Map<string, SpendingByItemCategoryResult>();

  for (const row of rows) {
    const categoryId = row.categoryId || row.parentCategoryId || null;
    const categoryName = row.categoryName || null;
    const groupKey = `${row.currency}::${categoryId || '__uncategorized__'}`;
    const existing = grouped.get(groupKey) || {
      categoryId,
      categoryName,
      currency: row.currency,
      totalSpent: 0,
      purchaseCount: 0,
      itemCount: 0,
    };
    existing.totalSpent = roundMoney(existing.totalSpent + row.lineTotal);
    existing.purchaseCount += 1;
    existing.itemCount += 1;
    grouped.set(groupKey, existing);
  }

  return Array.from(grouped.values()).sort((a, b) => b.totalSpent - a.totalSpent);
}

export async function getMerchantItemHistory(itemName: string, filters: Omit<TransactionItemInsightFilters, 'itemName'> = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    itemName,
    transactionType: filters.transactionType || 'expense',
  });
  const grouped = new Map<string, MerchantItemHistoryResult>();

  for (const row of rows) {
    const merchant = row.merchant || null;
    const groupKey = `${merchant}::${row.currency}`;
    const existing = grouped.get(groupKey) || {
      merchant,
      currency: row.currency,
      totalSpent: 0,
      purchaseCount: 0,
      lastPurchasedAt: null,
      lastPaidPrice: null,
    };
    existing.totalSpent = roundMoney(existing.totalSpent + row.lineTotal);
    existing.purchaseCount += 1;
    if (!existing.lastPurchasedAt || row.transactionDate >= existing.lastPurchasedAt) {
      existing.lastPurchasedAt = row.transactionDate;
      existing.lastPaidPrice = row.effectiveUnitPrice;
    }
    grouped.set(groupKey, existing);
  }

  return Array.from(grouped.values()).sort((a, b) => b.totalSpent - a.totalSpent);
}

export async function getItemPriceHistory(itemName: string, filters: Omit<TransactionItemInsightFilters, 'itemName'> = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    itemName,
    transactionType: filters.transactionType || 'expense',
  });
  const grouped = groupRowsByItemCurrency(rows);
  const results: ItemPriceHistoryResult[] = [];

  for (const groupRows of grouped.values()) {
    const sortedRows = [...groupRows]
      .filter((row) => row.effectiveUnitPrice !== null)
      .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    if (sortedRows.length === 0) continue;

    const prices = sortedRows.map((row) => row.effectiveUnitPrice || 0);
    const entries = sortedRows.map((row, index) => {
      const previousPrice = index > 0 ? sortedRows[index - 1].effectiveUnitPrice : null;
      const latestPrice = row.effectiveUnitPrice || 0;
      return {
        id: row.id,
        transactionId: row.transactionId,
        transactionDate: row.transactionDate,
        merchant: row.merchant,
        quantity: row.quantity,
        unitPrice: row.effectiveUnitPrice,
        lineTotal: row.lineTotal,
        percentageChangeFromPrevious: previousPrice && previousPrice > 0
          ? roundMoney(((latestPrice - previousPrice) / previousPrice) * 100)
          : null,
      } satisfies ItemPriceHistoryEntry;
    }).reverse();

    results.push({
      itemName: sortedRows[0].canonicalItemName || sortedRows[0].itemName,
      normalizedItemName: sortedRows[0].normalizedItemName,
      currency: sortedRows[0].currency,
      averagePrice: roundMoney(prices.reduce((sum, value) => sum + value, 0) / prices.length),
      lowestPrice: roundMoney(Math.min(...prices)),
      highestPrice: roundMoney(Math.max(...prices)),
      entries,
    });
  }

  return results.sort((a, b) => a.currency.localeCompare(b.currency));
}

export async function getRecentPriceChanges(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    transactionType: filters.transactionType || 'expense',
  });
  const grouped = groupRowsByItemCurrency(rows);
  const results: RecentPriceChangeResult[] = [];

  for (const groupRows of grouped.values()) {
    const sortedRows = [...groupRows]
      .filter((row) => row.effectiveUnitPrice !== null)
      .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    if (sortedRows.length < 2) continue;

    const latest = sortedRows[sortedRows.length - 1];
    const previous = sortedRows[sortedRows.length - 2];
    const latestPrice = latest.effectiveUnitPrice || 0;
    const previousPrice = previous.effectiveUnitPrice || 0;
    if (previousPrice <= 0) continue;

    const groupPrices = sortedRows.map((row) => row.effectiveUnitPrice || 0);
    results.push({
      itemName: latest.canonicalItemName || latest.itemName,
      normalizedItemName: latest.normalizedItemName,
      currency: latest.currency,
      merchant: latest.merchant,
      latestDate: latest.transactionDate,
      latestPrice,
      previousPrice,
      averagePrice: roundMoney(groupPrices.reduce((sum, value) => sum + value, 0) / groupPrices.length),
      percentageChange: roundMoney(((latestPrice - previousPrice) / previousPrice) * 100),
    });
  }

  return results.sort((a, b) => Math.abs(b.percentageChange) - Math.abs(a.percentageChange));
}

export async function getMerchantInsights(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    transactionType: filters.transactionType || 'expense',
  });
  const grouped = new Map<string, {
    merchant: string | null;
    currency: string;
    totalSpent: number;
    transactionIds: Set<string>;
    receiptTotals: number[];
    lastVisit: string | null;
    itemCounts: Map<string, number>;
    categoryNames: Map<string, string | null>;
    categoryTotals: Map<string, number>;
    priceHistoryRows: TransactionItemInsightRow[];
  }>();

  for (const row of rows) {
    const merchant = row.merchant || null;
    const groupKey = `${merchant}::${row.currency}`;
    const categoryKey = row.categoryId || row.parentCategoryId || '__uncategorized__';
    const existing = grouped.get(groupKey) || {
      merchant,
      currency: row.currency,
      totalSpent: 0,
      transactionIds: new Set<string>(),
      receiptTotals: [],
      lastVisit: null,
      itemCounts: new Map<string, number>(),
      categoryNames: new Map<string, string | null>(),
      categoryTotals: new Map<string, number>(),
      priceHistoryRows: [],
    };
    existing.totalSpent = roundMoney(existing.totalSpent + row.lineTotal);
    existing.priceHistoryRows.push(row);
    existing.itemCounts.set(row.normalizedItemName, (existing.itemCounts.get(row.normalizedItemName) || 0) + 1);
    existing.categoryNames.set(categoryKey, row.categoryName || null);
    existing.categoryTotals.set(categoryKey, roundMoney((existing.categoryTotals.get(categoryKey) || 0) + row.lineTotal));
    if (!existing.transactionIds.has(row.transactionId)) {
      existing.transactionIds.add(row.transactionId);
      existing.receiptTotals.push(Math.abs(row.parentTransactionAmount || 0));
    }
    if (!existing.lastVisit || row.transactionDate > existing.lastVisit) {
      existing.lastVisit = row.transactionDate;
    }
    grouped.set(groupKey, existing);
  }

  const results: MerchantInsightResult[] = [];
  for (const group of grouped.values()) {
    const repeatedItemPriceHistory = (await getRecentPriceChanges({
      ...filters,
      merchant: group.merchant || undefined,
      currency: group.currency,
      transactionType: 'expense',
    })).slice(0, 3);

    results.push({
      merchant: group.merchant,
      currency: group.currency,
      totalSpent: roundMoney(group.totalSpent),
      visitCount: group.transactionIds.size,
      averageReceiptValue: group.receiptTotals.length > 0
        ? roundMoney(group.receiptTotals.reduce((sum, value) => sum + value, 0) / group.receiptTotals.length)
        : 0,
      lastVisit: group.lastVisit,
      mostPurchasedItems: Array.from(group.itemCounts.entries())
        .map(([normalizedItemName, purchaseCount]) => ({
          itemName: group.priceHistoryRows.find((row) => row.normalizedItemName === normalizedItemName)?.canonicalItemName
            || group.priceHistoryRows.find((row) => row.normalizedItemName === normalizedItemName)?.itemName
            || normalizedItemName,
          purchaseCount,
        }))
        .sort((a, b) => b.purchaseCount - a.purchaseCount)
        .slice(0, 5),
      categoryBreakdown: Array.from(group.categoryTotals.entries())
        .map(([categoryKey, totalSpent]) => ({
          categoryName: group.categoryNames.get(categoryKey) || null,
          totalSpent,
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent),
      repeatedItemPriceHistory,
    });
  }

  return results.sort((a, b) => b.totalSpent - a.totalSpent);
}

export async function getRecurringPurchaseSuggestions(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    transactionType: filters.transactionType || 'expense',
  });
  const grouped = new Map<string, TransactionItemInsightRow[]>();
  for (const row of rows) {
    const groupKey = `${row.normalizedItemName}::${row.merchant || ''}::${row.currency}`;
    const current = grouped.get(groupKey) || [];
    current.push(row);
    grouped.set(groupKey, current);
  }

  const suggestions: RecurringPurchaseSuggestion[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const groupRows of grouped.values()) {
    const sortedRows = [...groupRows]
      .filter((row) => row.effectiveUnitPrice !== null)
      .sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
    if (sortedRows.length < 2) continue;

    const dates = Array.from(new Set(sortedRows.map((row) => row.transactionDate))).sort();
    if (dates.length < 2) continue;

    const intervals = dates.slice(1).map((date, index) => differenceInDays(date, dates[index]));
    const averageIntervalDays = roundMoney(intervals.reduce((sum, value) => sum + value, 0) / intervals.length);
    if (!Number.isFinite(averageIntervalDays) || averageIntervalDays < 5 || averageIntervalDays > 45) continue;

    const latestRow = sortedRows[sortedRows.length - 1];
    const latestPrice = latestRow.effectiveUnitPrice;
    const averagePrice = roundMoney(sortedRows.reduce((sum, row) => sum + (row.effectiveUnitPrice || 0), 0) / sortedRows.length);
    const latestPriceVsAveragePct = latestPrice && averagePrice > 0
      ? roundMoney(((latestPrice - averagePrice) / averagePrice) * 100)
      : null;
    const nextLikelyPurchaseDate = addDays(latestRow.transactionDate, Math.round(averageIntervalDays));
    const dueSoon = differenceInDays(nextLikelyPurchaseDate, today) <= 7;

    suggestions.push({
      id: `${latestRow.normalizedItemName}:${latestRow.merchant || 'merchant'}:${latestRow.currency}`,
      itemName: latestRow.canonicalItemName || latestRow.itemName,
      normalizedItemName: latestRow.normalizedItemName,
      merchant: latestRow.merchant,
      currency: latestRow.currency,
      purchaseCount: dates.length,
      averageIntervalDays,
      lastPurchasedAt: latestRow.transactionDate,
      nextLikelyPurchaseDate,
      averagePrice,
      latestPrice,
      latestPriceVsAveragePct,
      dueSoon,
      insightType: latestPriceVsAveragePct !== null && latestPriceVsAveragePct >= 10
        ? 'price_above_average'
        : 'due_again_soon',
    });
  }

  return suggestions
    .sort((a, b) => {
      if (a.dueSoon !== b.dueSoon) return a.dueSoon ? -1 : 1;
      return b.purchaseCount - a.purchaseCount;
    });
}

export async function getReceiptDashboardInsights(filters: TransactionItemInsightFilters = {}) {
  const [topSpendItems, frequencyItems, recentPriceChanges, recurringSuggestions] = await Promise.all([
    getSpendingByItem({ ...filters, transactionType: 'expense' }),
    getItemPurchaseFrequency({ ...filters, transactionType: 'expense' }),
    getRecentPriceChanges({ ...filters, transactionType: 'expense' }),
    getRecurringPurchaseSuggestions({ ...filters, transactionType: 'expense' }),
  ]);

  const insights: ReceiptDashboardInsight[] = [];

  if (frequencyItems[0]) {
    insights.push({
      id: `top-repeat:${frequencyItems[0].normalizedItemName}:${frequencyItems[0].currency}`,
      type: 'top_repeated_item',
      itemName: frequencyItems[0].itemName,
      purchaseCount: frequencyItems[0].purchaseCount,
      currency: frequencyItems[0].currency,
      actionItemName: frequencyItems[0].itemName,
    });
  }

  const meaningfulIncrease = recentPriceChanges.find((item) => item.percentageChange >= 8);
  if (meaningfulIncrease) {
    insights.push({
      id: `price-increase:${meaningfulIncrease.normalizedItemName}:${meaningfulIncrease.currency}`,
      type: 'price_increase',
      itemName: meaningfulIncrease.itemName,
      percentageChange: meaningfulIncrease.percentageChange,
      currency: meaningfulIncrease.currency,
      actionItemName: meaningfulIncrease.itemName,
    });
  }

  const recurringDue = recurringSuggestions.find((item) => item.dueSoon);
  if (recurringDue) {
    insights.push({
      id: `recurring-due:${recurringDue.id}`,
      type: 'recurring_due',
      itemName: recurringDue.itemName,
      dueDate: recurringDue.nextLikelyPurchaseDate,
      currency: recurringDue.currency,
      actionItemName: recurringDue.itemName,
    });
  }

  if (topSpendItems[0]) {
    insights.push({
      id: `highest-spend:${topSpendItems[0].normalizedItemName}:${topSpendItems[0].currency}`,
      type: 'highest_spend_item',
      itemName: topSpendItems[0].itemName,
      totalSpent: topSpendItems[0].totalSpent,
      currency: topSpendItems[0].currency,
      actionItemName: topSpendItems[0].itemName,
    });
  }

  return insights.slice(0, 3);
}

export async function getItemInsightsFilterOptions(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    includeNonRegular: true,
  });

  const accounts = new Map<string, string>();
  const merchants = new Set<string>();
  const categories = new Map<string, string>();
  const items = new Map<string, { itemName: string; normalizedItemName: string }>();
  const currencies = new Set<string>();

  for (const row of rows) {
    if (row.accountId && row.accountName) {
      accounts.set(row.accountId, row.accountName);
    }
    if (row.merchant) {
      merchants.add(row.merchant);
    }
    if (row.categoryId && row.categoryName) {
      categories.set(row.categoryId, row.categoryName);
    }
    items.set(`${row.normalizedItemName}:${row.currency}`, {
      itemName: row.canonicalItemName || row.itemName,
      normalizedItemName: row.normalizedItemName,
    });
    currencies.add(row.currency);
  }

  return {
    accounts: Array.from(accounts.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    merchants: Array.from(merchants).sort((a, b) => a.localeCompare(b)),
    categories: Array.from(categories.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    items: Array.from(items.values())
      .sort((a, b) => a.itemName.localeCompare(b.itemName)),
    currencies: Array.from(currencies).sort((a, b) => a.localeCompare(b)),
  } satisfies ItemInsightsFilterOptions;
}

export async function getItemInsightsSnapshot(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    transactionType: filters.transactionType || 'expense',
  });

  const [topItemsBySpend, topItemsByFrequency, spendingByCategory, merchantInsights, recentPriceChanges, recurringSuggestions, selectedItemHistory, selectedItemMerchantHistory, filterOptions] = await Promise.all([
    getSpendingByItem({ ...filters, transactionType: filters.transactionType || 'expense' }),
    getItemPurchaseFrequency({ ...filters, transactionType: filters.transactionType || 'expense' }),
    getSpendingByItemCategory({ ...filters, transactionType: filters.transactionType || 'expense' }),
    getMerchantInsights({ ...filters, transactionType: filters.transactionType || 'expense' }),
    getRecentPriceChanges({ ...filters, transactionType: filters.transactionType || 'expense' }),
    getRecurringPurchaseSuggestions({ ...filters, transactionType: filters.transactionType || 'expense' }),
    filters.itemName
      ? getItemPriceHistory(filters.itemName, { ...filters, transactionType: filters.transactionType || 'expense' })
      : Promise.resolve([]),
    filters.itemName
      ? getMerchantItemHistory(filters.itemName, { ...filters, transactionType: filters.transactionType || 'expense' })
      : Promise.resolve([]),
    getItemInsightsFilterOptions({ ...filters, transactionType: filters.transactionType || 'expense' }),
  ]);

  return {
    rows,
    totalsByCurrency: buildCurrencyTotals(rows),
    topItemsBySpend,
    topItemsByFrequency,
    spendingByCategory,
    merchantInsights,
    recentPriceChanges,
    recurringSuggestions,
    filterOptions,
    selectedItemHistory,
    selectedItemMerchantHistory,
  } satisfies ItemInsightsSnapshot;
}
