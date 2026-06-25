'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartNoAxesCombined } from 'lucide-react';
import {
  isPersonalExpenseTransaction,
  convertHistoricalAmountWithSnapshots,
  getHistoricalReportContext,
  isPersonalIncomeTransaction,
  loadAccountInclusionMap,
  loadTransactionLedgerSummaryMap,
  type DashboardActivePeriod,
  type Transaction,
} from '@/lib/finance';
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { getMonthContext, shiftMonthKey } from '@/lib/financial-periods';
import { formatCurrencyValue, getRichCurrencyToken } from '@/lib/currency-formatting';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';

interface ChartPoint {
  label: string;
  income: number;
  expenses: number;
  cashFlow: number;
}

type TransactionAmountRow = Pick<Transaction, 'id' | 'account_id' | 'transaction_type' | 'amount' | 'currency' | 'transaction_date' | 'expense_owner' | 'paid_by' | 'paid_from' | 'use_held_balance'>;

function CurrencyAxisTick({
  x = 0,
  y = 0,
  payload,
  currencyCode,
}: {
  x?: number;
  y?: number;
  payload?: { value?: number };
  currencyCode: string;
}) {
  const { data } = useClientReferenceData();
  const currencies = data?.snapshot.currencies ?? [];
  const currency = useMemo(
    () => getCurrencyByCode(currencies, currencyCode),
    [currencies, currencyCode]
  );
  const formatted = formatCurrencyValue(Number(payload?.value || 0), {
    currency,
    currencies,
    currencyCode,
    compact: true,
  });
  const isAssetCurrency =
    currency?.symbolType === 'asset' &&
    typeof currency.symbolAssetPath === 'string' &&
    currency.symbolAssetPath.trim().length > 0;

  return (
    <g transform={`translate(${x},${y})`}>
      {isAssetCurrency ? (
        <>
          <image
            href={currency.symbolAssetPath!}
            x={-64}
            y={-6}
            width={12}
            height={12}
            preserveAspectRatio="xMidYMid meet"
          />
          <text
            x={-8}
            y={4}
            textAnchor="end"
            fill="var(--muted-foreground)"
            fontSize={11}
            fontWeight={500}
            direction="ltr"
            unicodeBidi="plaintext"
          >
            {`${formatted.sign}${formatted.numberText}`}
          </text>
        </>
      ) : (
        <text
          x={0}
          y={4}
          textAnchor="end"
          fill="var(--muted-foreground)"
          fontSize={11}
          fontWeight={500}
          direction="ltr"
          unicodeBidi="plaintext"
        >
          {formatted.usesCodeToken ? formatted.text : `${formatted.sign}${getRichCurrencyToken(currency || {
            code: formatted.code,
            symbol: formatted.token,
            narrowSymbol: null,
            fallbackSymbol: formatted.token,
            symbolType: 'fallback',
          } as const)} ${formatted.numberText}`}
        </text>
      )}
    </g>
  );
}

function CustomTooltip({ active, payload, label, currencyCode }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card-elevated-md p-3 min-w-[140px]">
      <p className="text-xs font-600 text-muted-foreground mb-2">{label}</p>
      {payload.map((entry: any) => (
        <div key={`tt-${entry.name}`} className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: entry.color }} />
            <span className="text-xs text-muted-foreground capitalize">{entry.name}</span>
          </div>
          <FormattedCurrencyAmount
            amount={Number(entry.value || 0)}
            currencyCode={currencyCode}
            compact
            size="sm"
            className="text-xs font-700 font-tabular text-foreground"
          />
        </div>
      ))}
    </div>
  );
}

export default function IncomeExpenseChart({
  activePeriod,
}: {
  activePeriod: DashboardActivePeriod;
}) {
  const { t } = useTranslation('portal');
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportingCurrency, setReportingCurrency] = useState('USD');

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const supabase = createClient();
      const rangeStart = activePeriod.mode === 'month'
        ? getMonthContext(shiftMonthKey(activePeriod.monthKey || '', -5), activePeriod.timezone).startDate
        : activePeriod.startDate;
      const rangeEnd = activePeriod.endDate;

      const [{ data: txns }, ledgerSummaryByTransactionId, accountInclusionById] = await Promise.all([
        supabase
          .from('transactions')
          .select('id, account_id, transaction_type, amount, currency, transaction_date, expense_owner, paid_by, paid_from, use_held_balance')
          .gte('transaction_date', rangeStart)
          .lte('transaction_date', rangeEnd)
          .in('transaction_type', ['income', 'expense']),
        loadTransactionLedgerSummaryMap(supabase),
        loadAccountInclusionMap(supabase),
      ]);

      const transactions = (txns || []) as TransactionAmountRow[];
      const historyContext = await getHistoricalReportContext(
        transactions.map((transaction) => ({ transaction_date: transaction.transaction_date }))
      );
      setReportingCurrency(historyContext.reportingCurrency);
      const bucketMap = new Map<string, ChartPoint>();
      const missingRateDates = new Set<string>();

      if (activePeriod.mode === 'month') {
        for (let i = 5; i >= 0; i -= 1) {
          const period = getMonthContext(shiftMonthKey(activePeriod.monthKey || '', -i), activePeriod.timezone);
          bucketMap.set(period.monthKey, {
            label: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(`${period.startDate}T12:00:00Z`)),
            income: 0,
            expenses: 0,
            cashFlow: 0,
          });
        }
      } else {
        const start = new Date(`${activePeriod.startDate}T12:00:00Z`);
        const end = new Date(`${activePeriod.endDate}T12:00:00Z`);
        const dayCount = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const useWeeklyBuckets = dayCount > 31;

        for (let index = 0; index < dayCount; index += useWeeklyBuckets ? 7 : 1) {
          const bucketStart = new Date(start);
          bucketStart.setUTCDate(start.getUTCDate() + index);
          const bucketEnd = new Date(bucketStart);
          bucketEnd.setUTCDate(bucketStart.getUTCDate() + (useWeeklyBuckets ? 6 : 0));
          if (bucketEnd > end) bucketEnd.setTime(end.getTime());
          const bucketStartKey = bucketStart.toISOString().slice(0, 10);
          const bucketEndKey = bucketEnd.toISOString().slice(0, 10);
          bucketMap.set(bucketStartKey, {
            label: useWeeklyBuckets
              ? `${new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(bucketStart)} - ${new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(bucketEnd)}`
              : new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(bucketStart),
            income: 0,
            expenses: 0,
            cashFlow: 0,
          });
        }
      }

      const resolveBucketKey = (transactionDate: string) => {
        if (activePeriod.mode === 'month') {
          return transactionDate.slice(0, 7);
        }
        const keys = Array.from(bucketMap.keys()).sort();
        return keys.find((key, index) => {
          const startKey = key;
          const endKey = index + 1 < keys.length
            ? new Date(new Date(`${keys[index + 1]}T12:00:00Z`).getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
            : activePeriod.endDate;
          return transactionDate >= startKey && transactionDate <= endKey;
        }) || null;
      };

      for (const txn of transactions) {
        const bucketKey = resolveBucketKey(txn.transaction_date);
        const bucket = bucketKey ? bucketMap.get(bucketKey) : null;
        if (!bucket) continue;
        const conversion = convertHistoricalAmountWithSnapshots({
          amount: Number(txn.amount || 0),
          fromCurrency: txn.currency || historyContext.reportingCurrency,
          reportingCurrency: historyContext.reportingCurrency,
          rateDate: txn.transaction_date,
          snapshots: historyContext.snapshots,
        });

        const numericAmount = conversion.convertedAmount;
        if (numericAmount === null) {
          if (conversion.missingRateDate) missingRateDates.add(conversion.missingRateDate);
          continue;
        }

        if (isPersonalIncomeTransaction(txn, ledgerSummaryByTransactionId, accountInclusionById)) {
          bucket.income += numericAmount;
        }
        if (isPersonalExpenseTransaction(txn, ledgerSummaryByTransactionId, accountInclusionById)) {
          bucket.expenses += numericAmount;
        }
      }

      if (missingRateDates.size > 0) {
        setErrorMessage('Some historical exchange rates are unavailable for this period, so the chart cannot be shown accurately yet.');
      }

      const normalizedPoints = Array.from(bucketMap.values()).map((point) => ({
        ...point,
        cashFlow: point.income - point.expenses,
      }));

      setData(normalizedPoints);
    } catch (error) {
      console.error('IncomeExpenseChart error:', error);
      setErrorMessage('The chart period could not be calculated.');
    } finally {
      setLoading(false);
    }
  }, [activePeriod.endDate, activePeriod.mode, activePeriod.monthKey, activePeriod.startDate, activePeriod.timezone]);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['dashboard', 'transactions'], 'IncomeExpenseChart', async () => {
    await load();
  });

  if (loading) {
    return (
      <div className="flex h-[280px] items-center justify-center max-[480px]:h-[240px]">
        <div className="h-6 w-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    );
  }

  if (data.every((d) => d.income === 0 && d.expenses === 0)) {
    return (
      <div className="flex min-h-[176px] items-start justify-center px-4 pb-4 pt-2 max-[480px]:min-h-[160px]">
        <div className="flex max-w-[18rem] flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),rgba(255,255,255,0.98)_68%)] shadow-[0_18px_36px_-28px_rgba(16,185,129,0.8)]">
            <ChartNoAxesCombined size={24} className="text-accent" />
          </div>
          <p className="text-sm font-700 text-foreground">
            {errorMessage || 'No transaction data in this period'}
          </p>
          <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
            {activePeriod.mode === 'month'
              ? 'Add income and expense transactions to see monthly trends.'
              : 'Add income and expense transactions to see pay-period trends.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[280px] max-[480px]:h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--positive)" stopOpacity={0.2} />
            <stop offset="95%" stopColor="var(--positive)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--negative)" stopOpacity={0.15} />
            <stop offset="95%" stopColor="var(--negative)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: 'var(--muted-foreground)', fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          width={72}
          axisLine={false}
          tickLine={false}
          tick={<CurrencyAxisTick currencyCode={reportingCurrency} />}
        />
        <Tooltip content={<CustomTooltip currencyCode={reportingCurrency} />} />
        <Area
          type="monotone"
          dataKey="income"
          name={t('dashboardCharts.legend.income')}
          stroke="var(--positive)"
          strokeWidth={2}
          fill="url(#incomeGrad)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Area
          type="monotone"
          dataKey="expenses"
          name={t('dashboardCharts.legend.expenses')}
          stroke="var(--negative)"
          strokeWidth={2}
          fill="url(#expenseGrad)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Line
          type="monotone"
          dataKey="cashFlow"
          name={t('dashboardCharts.legend.cashFlow')}
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '11px', fontWeight: 500, paddingTop: '8px' }}
        />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
