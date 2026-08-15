'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import Tabs from '@/components/ui/Tabs';
import type { TabItem } from '@/components/ui/Tabs';
import {
  Target,
  PiggyBank,
  Landmark,
  ArrowLeftRight,
  Calculator as CalculatorIcon,
  Percent,
  DollarSign,
  CalendarDays,
  ArrowRightLeft,
  Globe,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { getLatestExchangeRateSnapshot } from '@/lib/exchange-rates/service';
import {
  convertWithSnapshot,
  getExchangeRateFreshness,
  ensureValidSnapshotRates,
} from '@/lib/exchange-rates/conversion';
import type {
  ExchangeRateSnapshotRecord,
  ExchangeRateFreshness,
  ExchangeRateConversionResult,
} from '@/lib/exchange-rates/types';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';
import { toast } from 'sonner';

type CalculatorTabId = 'savings' | 'budget' | 'loan' | 'currency';

const TAB_ITEMS: ReadonlyArray<TabItem<CalculatorTabId>> = [
  { id: 'savings', label: 'Savings goal', icon: Target },
  { id: 'budget', label: 'Budget', icon: PiggyBank },
  { id: 'loan', label: 'Loan', icon: Landmark },
  { id: 'currency', label: 'Currency', icon: ArrowLeftRight },
] as const;

function formatTimestamp(iso: string | null | undefined, locale: string) {
  if (!iso) return null;
  try {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

function freshnessBadge(freshness: ExchangeRateFreshness) {
  switch (freshness) {
    case 'fresh':
      return {
        tone: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
        Icon: CheckCircle2,
      };
    case 'stale':
      return {
        tone: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
        Icon: Clock,
      };
    case 'unavailable':
    default:
      return {
        tone: 'bg-rose-500/10 text-rose-700 border-rose-500/20',
        Icon: AlertTriangle,
      };
  }
}

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() + Math.max(0, Math.ceil(months)));
  return d;
}

function parseNumber(input: string | number | undefined | null): number {
  if (input === undefined || input === null || input === '') return 0;
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0;
  const cleaned = String(input).replace(/[^0-9.\-]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function SavingsGoalCalculator({
  defaultCurrencyCode,
  t,
  locale,
}: {
  defaultCurrencyCode: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
  locale: string;
}) {
  const [targetAmount, setTargetAmount] = useState('10000');
  const [currentSaved, setCurrentSaved] = useState('2500');
  const [monthlyContribution, setMonthlyContribution] = useState('300');

  const target = parseNumber(targetAmount);
  const saved = parseNumber(currentSaved);
  const monthly = parseNumber(monthlyContribution);

  const remaining = Math.max(0, target - saved);
  const monthsNeeded = useMemo(() => {
    if (target <= 0 || saved >= target) return 0;
    if (monthly <= 0) return Infinity;
    return Math.ceil(remaining / monthly);
  }, [target, saved, monthly, remaining]);

  const targetDate = useMemo(() => {
    if (!Number.isFinite(monthsNeeded) || monthsNeeded <= 0) return null;
    return addMonths(new Date(), monthsNeeded);
  }, [monthsNeeded]);

  const progressPct = target > 0 ? Math.min(100, (saved / target) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
            <Target size={12} className="text-accent" />
            {t('calculator.savings.targetAmount', { defaultValue: 'Target amount' })}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={targetAmount}
            onChange={(e) => setTargetAmount(e.target.value)}
            placeholder="10000"
            className="input-base w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
            <PiggyBank size={12} className="text-accent" />
            {t('calculator.savings.currentSaved', { defaultValue: 'Current saved' })}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={currentSaved}
            onChange={(e) => setCurrentSaved(e.target.value)}
            placeholder="2500"
            className="input-base w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
            <CalendarDays size={12} className="text-accent" />
            {t('calculator.savings.monthlyContribution', { defaultValue: 'Monthly contribution' })}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={monthlyContribution}
            onChange={(e) => setMonthlyContribution(e.target.value)}
            placeholder="300"
            className="input-base w-full"
          />
        </div>
      </div>

      {target > 0 ? (
        <div className="rounded-[22px] border border-border bg-gradient-to-br from-accent/5 via-card to-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-accent">
                {t('calculator.savings.progress', { defaultValue: 'Progress' })}
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <FormattedCurrencyAmount
                  amount={saved}
                  currencyCode={defaultCurrencyCode}
                  className="text-xl font-800 text-foreground"
                />
                <span className="text-sm font-600 text-muted-foreground">
                  /{' '}
                  <FormattedCurrencyAmount
                    amount={target}
                    currencyCode={defaultCurrencyCode}
                    textOnly
                  />
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card px-3 py-1.5 text-xs font-700 text-foreground">
              {progressPct.toFixed(0)}%
            </div>
          </div>
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-[linear-gradient(90deg,#06a6d8_0%,#1294ff_100%)]"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('calculator.savings.remaining', { defaultValue: 'Remaining' })}
              </p>
              <FormattedCurrencyAmount
                amount={remaining}
                currencyCode={defaultCurrencyCode}
                className="mt-1 block text-[15px] font-800 text-foreground"
              />
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('calculator.savings.monthsNeeded', { defaultValue: 'Months needed' })}
              </p>
              <p className="mt-1 text-[15px] font-800 text-foreground">
                {!Number.isFinite(monthsNeeded) || monthsNeeded === 0
                  ? saved >= target
                    ? t('calculator.savings.complete', { defaultValue: 'Complete' })
                    : '—'
                  : `${monthsNeeded} ${t('calculator.savings.months', { defaultValue: 'mo' })}`}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-3.5">
              <div className="flex items-center gap-1.5 text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                <CalendarDays size={12} className="text-accent" />
                {t('calculator.savings.targetDate', { defaultValue: 'Target date' })}
              </div>
              <p className="mt-1 text-[15px] font-800 text-foreground">
                {targetDate
                  ? new Intl.DateTimeFormat(locale, {
                      year: 'numeric',
                      month: 'short',
                    }).format(targetDate)
                  : '—'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Target}
          variant="compact"
          tone="secondary"
          title={t('calculator.savings.enterTarget', {
            defaultValue: 'Enter a target amount',
          })}
          description={t('calculator.savings.enterTargetHint', {
            defaultValue: 'Fill in your goal and monthly contribution to estimate how long it will take.',
          })}
        />
      )}
    </div>
  );
}

function BudgetCalculator({
  defaultCurrencyCode,
  t,
}: {
  defaultCurrencyCode: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const [monthlyIncome, setMonthlyIncome] = useState('5000');
  const [expenses, setExpenses] = useState('3200');
  const [savingsTarget, setSavingsTarget] = useState('800');

  const income = parseNumber(monthlyIncome);
  const exp = parseNumber(expenses);
  const targetSave = parseNumber(savingsTarget);

  const allocated = exp + targetSave;
  const remaining = income - allocated;
  const remainingIsPositive = remaining >= 0;
  const usagePct = income > 0 ? Math.min(100, (allocated / income) * 100) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
            <DollarSign size={12} className="text-emerald-600" />
            {t('calculator.budget.income', { defaultValue: 'Monthly income' })}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={monthlyIncome}
            onChange={(e) => setMonthlyIncome(e.target.value)}
            placeholder="5000"
            className="input-base w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
            <Landmark size={12} className="text-rose-600" />
            {t('calculator.budget.expenses', { defaultValue: 'Monthly expenses' })}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={expenses}
            onChange={(e) => setExpenses(e.target.value)}
            placeholder="3200"
            className="input-base w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
            <PiggyBank size={12} className="text-accent" />
            {t('calculator.budget.savingsTarget', { defaultValue: 'Savings target' })}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={savingsTarget}
            onChange={(e) => setSavingsTarget(e.target.value)}
            placeholder="800"
            className="input-base w-full"
          />
        </div>
      </div>

      {income > 0 ? (
        <div className="rounded-[22px] border border-border bg-gradient-to-br from-emerald-500/5 via-card to-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-emerald-600">
                {t('calculator.budget.breakdown', { defaultValue: 'Monthly breakdown' })}
              </p>
              <FormattedCurrencyAmount
                amount={income}
                currencyCode={defaultCurrencyCode}
                className="mt-1 block text-xl font-800 text-foreground"
              />
            </div>
            <div
              className={`rounded-2xl border px-3 py-1.5 text-xs font-700 ${
                remainingIsPositive
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700'
                  : 'border-rose-500/20 bg-rose-500/10 text-rose-700'
              }`}
            >
              {remainingIsPositive
                ? `+${t('calculator.budget.surplus', { defaultValue: 'Surplus' })}`
                : `−${t('calculator.budget.deficit', { defaultValue: 'Deficit' })}`}
            </div>
          </div>

          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/50">
            <div
              className={`absolute left-0 top-0 h-full rounded-full transition-all ${
                usagePct >= 100
                  ? 'bg-rose-500'
                  : usagePct >= 85
                  ? 'bg-amber-500'
                  : 'bg-[linear-gradient(90deg,#10b981_0%,#06a6d8_100%)]'
              }`}
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-600 text-muted-foreground">
            <span>{t('calculator.budget.allocated', { defaultValue: 'Allocated' })}</span>
            <span>{usagePct.toFixed(0)}%</span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('calculator.budget.expenses', { defaultValue: 'Expenses' })}
              </p>
              <FormattedCurrencyAmount
                amount={exp}
                currencyCode={defaultCurrencyCode}
                className="mt-1 block text-[15px] font-800 text-foreground"
              />
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('calculator.budget.savingsTarget', { defaultValue: 'Savings' })}
              </p>
              <FormattedCurrencyAmount
                amount={targetSave}
                currencyCode={defaultCurrencyCode}
                className="mt-1 block text-[15px] font-800 text-foreground"
              />
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('calculator.budget.allocated', { defaultValue: 'Allocated' })}
              </p>
              <FormattedCurrencyAmount
                amount={allocated}
                currencyCode={defaultCurrencyCode}
                className="mt-1 block text-[15px] font-800 text-foreground"
              />
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('calculator.budget.remaining', { defaultValue: 'Remaining' })}
              </p>
              <FormattedCurrencyAmount
                amount={Math.abs(remaining)}
                currencyCode={defaultCurrencyCode}
                className={`mt-1 block text-[15px] font-800 ${
                  remainingIsPositive ? 'text-emerald-600' : 'text-rose-600'
                }`}
              />
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={PiggyBank}
          variant="compact"
          tone="secondary"
          title={t('calculator.budget.enterIncome', { defaultValue: 'Enter monthly income' })}
          description={t('calculator.budget.enterIncomeHint', {
            defaultValue: 'Add income, expenses, and a savings target to see what is left over.',
          })}
        />
      )}
    </div>
  );
}

function LoanCalculator({
  defaultCurrencyCode,
  t,
}: {
  defaultCurrencyCode: string;
  t: (key: string, options?: { defaultValue?: string }) => string;
}) {
  const [loanAmount, setLoanAmount] = useState('25000');
  const [interestRate, setInterestRate] = useState('6.5');
  const [months, setMonths] = useState('60');

  const P = parseNumber(loanAmount);
  const annualPct = parseNumber(interestRate);
  const n = Math.max(0, Math.floor(parseNumber(months)));
  const r = annualPct / 100 / 12;

  const monthlyPayment = useMemo(() => {
    if (P <= 0 || n <= 0) return 0;
    if (r === 0) return P / n;
    const factor = Math.pow(1 + r, n);
    return (P * r * factor) / (factor - 1);
  }, [P, n, r]);

  const totalRepaid = monthlyPayment * n;
  const totalInterest = totalRepaid - P;
  const interestPct = P > 0 ? (totalInterest / P) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
            <DollarSign size={12} className="text-violet-600" />
            {t('calculator.loan.amount', { defaultValue: 'Loan amount' })}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={loanAmount}
            onChange={(e) => setLoanAmount(e.target.value)}
            placeholder="25000"
            className="input-base w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
            <Percent size={12} className="text-violet-600" />
            {t('calculator.loan.rate', { defaultValue: 'Annual interest (%)' })}
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            placeholder="6.5"
            className="input-base w-full"
          />
        </div>
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
            <CalendarDays size={12} className="text-violet-600" />
            {t('calculator.loan.term', { defaultValue: 'Term (months)' })}
          </label>
          <input
            type="number"
            min={0}
            step="1"
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            placeholder="60"
            className="input-base w-full"
          />
        </div>
      </div>

      {P > 0 && n > 0 ? (
        <div className="rounded-[22px] border border-border bg-gradient-to-br from-violet-500/5 via-card to-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[11px] font-700 uppercase tracking-[0.12em] text-violet-600">
                {t('calculator.loan.estPayment', { defaultValue: 'Estimated payment' })}
              </p>
              <FormattedCurrencyAmount
                amount={monthlyPayment}
                currencyCode={defaultCurrencyCode}
                className="mt-1 block text-2xl font-800 tracking-tight text-foreground"
              />
              <p className="mt-1 text-xs font-600 text-muted-foreground">
                {t('calculator.loan.perMonth', { defaultValue: 'per month' })} · {n}{' '}
                {t('calculator.loan.months', { defaultValue: 'months' })}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('calculator.loan.principal', { defaultValue: 'Principal' })}
              </p>
              <FormattedCurrencyAmount
                amount={P}
                currencyCode={defaultCurrencyCode}
                className="mt-1 block text-[15px] font-800 text-foreground"
              />
            </div>
            <div className="rounded-2xl border border-border bg-card p-3 sm:p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('calculator.loan.totalInterest', { defaultValue: 'Total interest' })}
                <span className="ml-1.5 rounded-full bg-muted/60 px-1.5 py-0.5 text-[10px] font-700">
                  {interestPct.toFixed(1)}%
                </span>
              </p>
              <FormattedCurrencyAmount
                amount={totalInterest}
                currencyCode={defaultCurrencyCode}
                className="mt-1 block text-[15px] font-800 text-amber-600"
              />
            </div>
            <div className="col-span-2 rounded-2xl border border-border bg-card p-3 sm:col-span-1 sm:p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-[0.04em] text-muted-foreground">
                {t('calculator.loan.totalRepaid', { defaultValue: 'Total repaid' })}
              </p>
              <FormattedCurrencyAmount
                amount={totalRepaid}
                currencyCode={defaultCurrencyCode}
                className="mt-1 block text-[15px] font-800 text-foreground"
              />
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={Landmark}
          variant="compact"
          tone="secondary"
          title={t('calculator.loan.enterLoan', { defaultValue: 'Enter loan details' })}
          description={t('calculator.loan.enterLoanHint', {
            defaultValue: 'Add the amount, rate, and term to estimate the monthly payment.',
          })}
        />
      )}
    </div>
  );
}

function CurrencyConverterTab({
  t,
  locale,
}: {
  t: (key: string, options?: { defaultValue?: string }) => string;
  locale: string;
}) {
  const [amount, setAmount] = useState('1');
  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('EUR');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [snapshot, setSnapshot] = useState<ExchangeRateSnapshotRecord | null>(null);
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const { data: refData } = useClientReferenceData();
  const currencies = refData?.snapshot.currencies ?? [];

  const loadSnapshot = useCallback(() => {
    let cancelled = false;
    setLoadingSnapshot(true);
    setSnapshotError(null);
    const supabase = createClient();
    void getLatestExchangeRateSnapshot(supabase)
      .then((next) => {
        if (cancelled) return;
        setSnapshot(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setSnapshotError(err?.message ?? t('exchangeRates.fetchError.generic', { defaultValue: 'Rates could not be loaded.' }));
        setSnapshot(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingSnapshot(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    void getAccounts({ activeOnly: true })
      .then((next) => {
        if (!cancelled) {
          setAccounts(next);
          if (next.length > 0 && next[0].currency) {
            const c = next[0].currency;
            setFromCurrency((prev) => (prev === 'USD' ? c : prev));
          }
        }
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    const cleanup = loadSnapshot();
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [loadSnapshot]);

  const availableCurrencyCodes = useMemo(() => {
    if (!snapshot) return [];
    try {
      return Array.from(new Set([snapshot.base_currency, ...Object.keys(ensureValidSnapshotRates(snapshot))]));
    } catch {
      return snapshot.base_currency ? [snapshot.base_currency] : [];
    }
  }, [snapshot]);

  const numericAmount = parseNumber(amount);

  const conversion = useMemo<{
    ok: boolean;
    value?: ExchangeRateConversionResult;
    error?: string;
  } | null>(() => {
    if (!snapshot) return null;
    try {
      const result = convertWithSnapshot({
        amount: numericAmount,
        fromCurrency,
        toCurrency,
        snapshot,
      });
      return { ok: true, value: result };
    } catch (e) {
      return {
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : t('exchangeRates.converter.error', { defaultValue: 'Unable to convert.' }),
      };
    }
  }, [snapshot, numericAmount, fromCurrency, toCurrency, t]);

  const freshness: ExchangeRateFreshness = snapshot ? getExchangeRateFreshness(snapshot) : 'unavailable';
  const { tone, Icon: FreshnessIcon } = freshnessBadge(freshness);

  const swap = useCallback(() => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  }, [fromCurrency, toCurrency]);

  if (loadingSnapshot && !snapshot) {
    return (
      <div className="space-y-5">
        <div className="h-20 w-full animate-pulse rounded-[22px] bg-muted/40" />
        <div className="h-64 w-full animate-pulse rounded-[22px] bg-muted/40" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <EmptyState
        icon={Globe}
        variant="default"
        tone="secondary"
        title={t('exchangeRates.empty.title', { defaultValue: 'Exchange rates unavailable' })}
        description={
          snapshotError ??
          t('exchangeRates.empty.description', {
            defaultValue: 'Rates could not be loaded right now.',
          })
        }
        action={{
          label: t('exchangeRates.actions.refresh', { defaultValue: 'Refresh rates' }),
          onClick: () => void loadSnapshot(),
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 px-3.5 py-2.5 sm:px-4 sm:py-3">
        <div className="flex flex-wrap items-center gap-2.5 text-xs font-600">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${tone}`}>
            <FreshnessIcon size={13} />
            {freshness === 'fresh'
              ? t('exchangeRates.freshness.fresh', { defaultValue: 'Rates up to date' })
              : freshness === 'stale'
              ? t('exchangeRates.freshness.stale', { defaultValue: 'Rates may be older' })
              : t('exchangeRates.freshness.unavailable', { defaultValue: 'Rates unavailable' })}
          </span>
          {formatTimestamp(snapshot.fetched_at ?? snapshot.created_at, locale) && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Clock size={12} />
              {formatTimestamp(snapshot.fetched_at ?? snapshot.created_at, locale)}
            </span>
          )}
          {snapshot.provider && (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <Globe size={12} />
              <span className="capitalize">{snapshot.provider}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void loadSnapshot()}
          className="btn-secondary inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
        >
          <RefreshCw size={13} />
          {t('exchangeRates.actions.refresh', { defaultValue: 'Refresh rates' })}
        </button>
      </div>

      <div className="rounded-[22px] border border-border bg-card p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-[1.2fr_1fr_auto_1fr_1.2fr] md:items-end md:gap-4">
          <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
            <label className="flex items-center gap-1.5 text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
              <DollarSign size={12} className="text-accent" />
              {t('exchangeRates.converter.amount', { defaultValue: 'Amount' })}
            </label>
            <input
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input-base w-full"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
              {t('exchangeRates.converter.from', { defaultValue: 'From' })}
            </label>
            <select
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value)}
              className="input-base w-full"
            >
              {availableCurrencyCodes.length === 0 ? (
                <option value={fromCurrency}>{fromCurrency}</option>
              ) : (
                availableCurrencyCodes.map((code) => {
                  const c = getCurrencyByCode(currencies, code);
                  return (
                    <option key={code} value={code}>
                      {code}
                      {c?.name ? ` · ${c.name}` : ''}
                    </option>
                  );
                })
              )}
            </select>
          </div>
          <div className="hidden md:block">
            <button
              type="button"
              onClick={swap}
              aria-label={t('exchangeRates.converter.swap', { defaultValue: 'Swap currencies' })}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-muted/30 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
            >
              <ArrowRightLeft size={17} />
            </button>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
              {t('exchangeRates.converter.to', { defaultValue: 'To' })}
            </label>
            <select
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value)}
              className="input-base w-full"
            >
              {availableCurrencyCodes.length === 0 ? (
                <option value={toCurrency}>{toCurrency}</option>
              ) : (
                availableCurrencyCodes.map((code) => {
                  const c = getCurrencyByCode(currencies, code);
                  return (
                    <option key={code} value={code}>
                      {code}
                      {c?.name ? ` · ${c.name}` : ''}
                    </option>
                  );
                })
              )}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2 md:col-span-1">
            <label className="block text-xs font-600 uppercase tracking-[0.04em] text-muted-foreground">
              {t('exchangeRates.converter.result', { defaultValue: 'Result' })}
            </label>
            <div className="input-base flex flex-col justify-center overflow-hidden">
              {conversion && conversion.ok && conversion.value ? (
                <FormattedCurrencyAmount
                  amount={conversion.value.convertedAmount}
                  currencyCode={toCurrency}
                  className="text-[15px] font-800 text-foreground"
                />
              ) : (
                <span className="text-sm font-600 text-muted-foreground">—</span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={swap}
          className="btn-secondary mt-3 inline-flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs md:hidden"
        >
          <ArrowRightLeft size={13} />
          {t('exchangeRates.converter.swap', { defaultValue: 'Swap currencies' })}
        </button>

        {conversion && conversion.ok && conversion.value && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 pt-4 text-xs">
            <span className="inline-flex items-center gap-1.5 font-600 text-muted-foreground">
              1 {fromCurrency} ={' '}
              <span className="font-700 text-foreground">
                {conversion.value.rateUsed?.toFixed?.(6) ?? '—'}
              </span>{' '}
              {toCurrency}
            </span>
            {conversion.value.stale && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-700 text-amber-700">
                <Clock size={11} />
                {t('exchangeRates.converter.stale', {
                  defaultValue: 'Using a slightly older rate.',
                })}
              </span>
            )}
            {conversion.value.providerTimestamp &&
              formatTimestamp(conversion.value.providerTimestamp, locale) && (
                <span className="inline-flex items-center gap-1.5 font-600 text-muted-foreground">
                  {t('exchangeRates.converter.asOf', { defaultValue: 'As of' })}{' '}
                  {formatTimestamp(conversion.value.providerTimestamp, locale)}
                </span>
              )}
          </div>
        )}

        {conversion && !conversion.ok && (
          <div className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs font-600 text-rose-700">
            {conversion.error ??
              t('exchangeRates.converter.error', { defaultValue: 'Unable to convert.' })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const { t, i18n } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const locale = i18n.language ?? 'en';
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [activeTab, setActiveTab] = useState<CalculatorTabId>('savings');

  useEffect(() => {
    let cancelled = false;
    void getAccounts({ activeOnly: true })
      .then((next) => {
        if (!cancelled) setAccounts(next);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultCurrencyCode = useMemo(() => {
    if (accounts.length > 0 && accounts[0].currency) return accounts[0].currency;
    return 'USD';
  }, [accounts]);

  return (
    <AppLayout activeRoute="/calculator">
      <SubscriptionFeatureGate feature="calculator">
        <div className="page-section page-shell-readable max-w-[1100px]">
        <PageHeader
          title={t('calculator.title', { defaultValue: 'Calculator' })}
          description={t('calculator.description', {
            defaultValue:
              'Quick financial calculators for savings goals, budgets, loans, and currencies.',
          })}
          badge={
            <StatusBadge
              status="info"
              label={t('calculator.badge', { defaultValue: 'Quick tools' })}
            />
          }
          compact
        />

        <div className="mt-4 overflow-hidden rounded-[24px] border border-border bg-card card-elevated">
          <div className="border-b border-border/70 px-3 pt-3 sm:px-5 sm:pt-4">
            <Tabs<CalculatorTabId>
              items={TAB_ITEMS}
              activeId={activeTab}
              onChange={setActiveTab}
            />
          </div>
          <div className="p-4 sm:p-6">
            {activeTab === 'savings' && (
              <SavingsGoalCalculator
                defaultCurrencyCode={defaultCurrencyCode}
                t={t}
                locale={locale}
              />
            )}
            {activeTab === 'budget' && (
              <BudgetCalculator defaultCurrencyCode={defaultCurrencyCode} t={t} />
            )}
            {activeTab === 'loan' && (
              <LoanCalculator defaultCurrencyCode={defaultCurrencyCode} t={t} />
            )}
            {activeTab === 'currency' && <CurrencyConverterTab t={t} locale={locale} />}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-600 text-muted-foreground">
          <CalculatorIcon size={12} className="text-accent/80" />
          {t('calculator.disclaimer', {
            defaultValue:
              'Estimates only — results are for quick reference and do not constitute financial advice.',
          })}
        </div>
        </div>
      </SubscriptionFeatureGate>
    </AppLayout>
  );
}
