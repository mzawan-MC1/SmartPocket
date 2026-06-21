import { createClient } from '@/lib/supabase/client';
import type { TransactionDocumentItemKind } from '@/lib/transaction-documents';

type JoinedTransactionRow = {
  id: string;
  merchant?: string | null;
  transaction_date: string;
  transaction_type: 'income' | 'expense' | 'transfer';
  currency?: string | null;
  category_id?: string | null;
};

type JoinedCategoryRow = {
  name?: string | null;
};

type TransactionItemInsightQueryRow = {
  id: string;
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
  categoryId?: string | null;
  includeNonRegular?: boolean;
  limit?: number;
}

export interface TransactionItemInsightRow {
  id: string;
  itemName: string;
  normalizedItemName: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number;
  categoryId: string | null;
  categoryName: string | null;
  itemKind: TransactionDocumentItemKind;
  merchant: string | null;
  transactionDate: string;
  transactionType: 'expense' | 'income';
  currency: string;
  parentCategoryId: string | null;
}

export interface SpendingByItemResult {
  itemName: string;
  normalizedItemName: string;
  totalSpent: number;
  purchaseCount: number;
  totalQuantity: number;
  averageUnitPrice: number | null;
  lastPaidPrice: number | null;
  lastPurchasedAt: string | null;
  merchants: string[];
}

export interface ItemPurchaseFrequencyResult {
  itemName: string;
  normalizedItemName: string;
  purchaseCount: number;
  firstPurchasedAt: string | null;
  lastPurchasedAt: string | null;
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
  averageUnitPrice: number | null;
  samples: number;
}

export interface SpendingByItemCategoryResult {
  categoryId: string | null;
  categoryName: string;
  totalSpent: number;
  purchaseCount: number;
  itemCount: number;
}

export interface MerchantItemHistoryResult {
  merchant: string;
  totalSpent: number;
  purchaseCount: number;
  lastPurchasedAt: string | null;
  lastPaidPrice: number | null;
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

function normalizeItemName(value: string | null | undefined) {
  return (value || '').trim().replace(/\s+/g, ' ');
}

function normalizeItemKey(value: string | null | undefined) {
  return normalizeItemName(value).toLowerCase();
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function sortByNewestDate<T extends { transactionDate: string }>(rows: T[]) {
  return [...rows].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
}

export async function getTransactionItemInsightRows(filters: TransactionItemInsightFilters = {}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('transaction_items')
    .select(`
      id,
      name,
      quantity,
      unit_price,
      line_total,
      category_id,
      item_kind,
      transaction:transactions!inner(
        id,
        merchant,
        transaction_date,
        transaction_type,
        currency,
        category_id
      ),
      item_category:categories(name)
    `);

  if (error) {
    throw error;
  }

  const includeNonRegular = filters.includeNonRegular === true;
  const normalizedMerchantFilter = (filters.merchant || '').trim().toLowerCase();
  const normalizedItemFilter = normalizeItemKey(filters.itemName);

  const rows = ((data || []) as TransactionItemInsightQueryRow[])
    .map<TransactionItemInsightRow | null>((row) => {
      const transaction = unwrapRelation(row.transaction);
      const itemCategory = unwrapRelation(row.item_category);
      const itemName = normalizeItemName(row.name);
      const normalizedItemName = normalizeItemKey(itemName);
      const lineTotal = normalizeNumeric(row.line_total);
      const transactionType = transaction?.transaction_type === 'income' ? 'income' : transaction?.transaction_type === 'expense' ? 'expense' : null;

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

      return {
        id: row.id,
        itemName,
        normalizedItemName,
        quantity,
        unitPrice,
        lineTotal,
        categoryId: row.category_id || null,
        categoryName: itemCategory?.name || null,
        itemKind,
        merchant: transaction.merchant || null,
        transactionDate: transaction.transaction_date,
        transactionType,
        currency: transaction.currency || 'USD',
        parentCategoryId: transaction.category_id || null,
      };
    })
    .filter((row): row is TransactionItemInsightRow => !!row)
    .filter((row) => includeNonRegular || row.itemKind === 'regular')
    .filter((row) => !filters.transactionType || row.transactionType === filters.transactionType)
    .filter((row) => !filters.startDate || row.transactionDate >= filters.startDate)
    .filter((row) => !filters.endDate || row.transactionDate <= filters.endDate)
    .filter((row) => !normalizedMerchantFilter || (row.merchant || '').toLowerCase().includes(normalizedMerchantFilter))
    .filter((row) => !normalizedItemFilter || row.normalizedItemName.includes(normalizedItemFilter))
    .filter((row) => !filters.categoryId || row.categoryId === filters.categoryId || row.parentCategoryId === filters.categoryId);

  const sortedRows = sortByNewestDate(rows);
  if (typeof filters.limit === 'number' && filters.limit > 0) {
    return sortedRows.slice(0, filters.limit);
  }
  return sortedRows;
}

export async function getSpendingByItem(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows({
    ...filters,
    transactionType: filters.transactionType || 'expense',
  });
  const grouped = new Map<string, SpendingByItemResult>();

  for (const row of rows) {
    const existing = grouped.get(row.normalizedItemName) || {
      itemName: row.itemName,
      normalizedItemName: row.normalizedItemName,
      totalSpent: 0,
      purchaseCount: 0,
      totalQuantity: 0,
      averageUnitPrice: null,
      lastPaidPrice: null,
      lastPurchasedAt: null,
      merchants: [],
    };
    existing.totalSpent = roundMoney(existing.totalSpent + row.lineTotal);
    existing.purchaseCount += 1;
    existing.totalQuantity += row.quantity || 0;
    if (row.unitPrice !== null) {
      const weightedTotal = (existing.averageUnitPrice || 0) * (existing.purchaseCount - 1) + row.unitPrice;
      existing.averageUnitPrice = roundMoney(weightedTotal / existing.purchaseCount);
      if (existing.lastPaidPrice === null || row.transactionDate >= (existing.lastPurchasedAt || '')) {
        existing.lastPaidPrice = row.unitPrice;
      }
    }
    if (!existing.lastPurchasedAt || row.transactionDate >= existing.lastPurchasedAt) {
      existing.lastPurchasedAt = row.transactionDate;
      if (row.unitPrice !== null) {
        existing.lastPaidPrice = row.unitPrice;
      }
    }
    if (row.merchant && !existing.merchants.includes(row.merchant)) {
      existing.merchants.push(row.merchant);
    }
    grouped.set(row.normalizedItemName, existing);
  }

  return Array.from(grouped.values()).sort((a, b) => b.totalSpent - a.totalSpent);
}

export async function getItemPurchaseFrequency(filters: TransactionItemInsightFilters = {}) {
  const rows = await getTransactionItemInsightRows(filters);
  const grouped = new Map<string, ItemPurchaseFrequencyResult>();

  for (const row of rows) {
    const existing = grouped.get(row.normalizedItemName) || {
      itemName: row.itemName,
      normalizedItemName: row.normalizedItemName,
      purchaseCount: 0,
      firstPurchasedAt: null,
      lastPurchasedAt: null,
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
    grouped.set(row.normalizedItemName, existing);
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
    itemName: latestRow.itemName,
    normalizedItemName: latestRow.normalizedItemName,
    unitPrice: latestRow.unitPrice,
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
  const unitPriceRows = rows.filter((row) => row.unitPrice !== null);
  if (unitPriceRows.length === 0) {
    return {
      itemName: normalizeItemName(itemName),
      normalizedItemName: normalizeItemKey(itemName),
      averageUnitPrice: null,
      samples: 0,
    } satisfies AverageUnitPriceResult;
  }

  const averageUnitPrice = roundMoney(
    unitPriceRows.reduce((sum, row) => sum + (row.unitPrice || 0), 0) / unitPriceRows.length
  );

  return {
    itemName: unitPriceRows[0].itemName,
    normalizedItemName: unitPriceRows[0].normalizedItemName,
    averageUnitPrice,
    samples: unitPriceRows.length,
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
    const categoryName = row.categoryName || 'Uncategorized item';
    const groupKey = categoryId || categoryName.toLowerCase();
    const existing = grouped.get(groupKey) || {
      categoryId,
      categoryName,
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
    const merchant = row.merchant || 'Unknown merchant';
    const existing = grouped.get(merchant) || {
      merchant,
      totalSpent: 0,
      purchaseCount: 0,
      lastPurchasedAt: null,
      lastPaidPrice: null,
    };
    existing.totalSpent = roundMoney(existing.totalSpent + row.lineTotal);
    existing.purchaseCount += 1;
    if (!existing.lastPurchasedAt || row.transactionDate >= existing.lastPurchasedAt) {
      existing.lastPurchasedAt = row.transactionDate;
      existing.lastPaidPrice = row.unitPrice;
    }
    grouped.set(merchant, existing);
  }

  return Array.from(grouped.values()).sort((a, b) => b.totalSpent - a.totalSpent);
}
