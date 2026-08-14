'use client';
import React, { useEffect, useMemo, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import {
  PiggyBank,
  Plus,
  Shield,
  Plane,
  Home,
  GraduationCap,
  Car,
  Target,
  CalendarDays,
  CalendarPlus2,
  Wallet,
  Sparkles,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { createClient } from '@/lib/supabase/client';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { toast } from 'sonner';

interface SavingsGoalCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
  targetAmount: number;
  currentSaved: number;
  targetDate: string;
  monthlySuggestion: number;
}

const EXAMPLE_GOAL_CATEGORIES: Array<Omit<SavingsGoalCategory, 'monthlySuggestion'>> = [
  {
    id: 'emergency',
    name: 'Emergency fund',
    description: 'Cover 3–6 months of essential expenses.',
    icon: Shield,
    accent: '#0ea5e9',
    targetAmount: 0,
    currentSaved: 0,
    targetDate: '',
  },
  {
    id: 'travel',
    name: 'Travel',
    description: 'Flights, hotels, and experiences.',
    icon: Plane,
    accent: '#10b981',
    targetAmount: 0,
    currentSaved: 0,
    targetDate: '',
  },
  {
    id: 'rent-bills',
    name: 'Rent or bills',
    description: 'Upcoming rent, utilities, and regular bills.',
    icon: Home,
    accent: '#f59e0b',
    targetAmount: 0,
    currentSaved: 0,
    targetDate: '',
  },
  {
    id: 'education',
    name: 'Education',
    description: 'Courses, books, or tuition fees.',
    icon: GraduationCap,
    accent: '#8b5cf6',
    targetAmount: 0,
    currentSaved: 0,
    targetDate: '',
  },
  {
    id: 'car-home',
    name: 'Car or home',
    description: 'Down payment for a vehicle or property.',
    icon: Car,
    accent: '#ef4444',
    targetAmount: 0,
    currentSaved: 0,
    targetDate: '',
  },
  {
    id: 'custom',
    name: 'Other goals',
    description: 'Weddings, gifts, personal projects, and more.',
    icon: Target,
    accent: '#6366f1',
    targetAmount: 0,
    currentSaved: 0,
    targetDate: '',
  },
];

function buildExampleGoals(defaultCurrencyCode: string, accounts: FinancialAccount[]): SavingsGoalCategory[] {
  const savingsAccounts = accounts.filter((account) => String(account.account_type || '').toLowerCase() === 'savings');
  const totalSavingsBalance = savingsAccounts.reduce(
    (sum, account) => sum + Number(account.current_balance ?? account.opening_balance ?? 0),
    0
  );

  return EXAMPLE_GOAL_CATEGORIES.map((category) => {
    const approximateCurrent =
      totalSavingsBalance > 0 && category.id === 'emergency'
        ? Math.round(totalSavingsBalance * 0.4)
        : totalSavingsBalance > 0 && category.id === 'rent-bills'
          ? Math.round(totalSavingsBalance * 0.25)
          : totalSavingsBalance > 0 && category.id === 'custom'
            ? Math.round(totalSavingsBalance * 0.35)
            : 0;

    return {
      ...category,
      currentSaved: approximateCurrent,
      monthlySuggestion: 0,
    };
  });
}

export default function SavingsPage() {
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    createClient();
    setLoadingAccounts(true);
    void getAccounts({ activeOnly: true })
      .then((next) => {
        if (!cancelled) setAccounts(next);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const defaultCurrencyCode = useMemo(() => {
    const first = accounts[0];
    return (first?.currency || 'USD').toUpperCase();
  }, [accounts]);

  const savingsAccounts = accounts.filter(
    (account) => String(account.account_type || '').toLowerCase() === 'savings'
  );

  const totalSaved = savingsAccounts.reduce(
    (sum, account) => sum + Number(account.current_balance ?? account.opening_balance ?? 0),
    0
  );

  const goals = useMemo(
    () => buildExampleGoals(defaultCurrencyCode, accounts),
    [defaultCurrencyCode, accounts]
  );

  const activeGoals = goals.filter((goal) => goal.currentSaved > 0).length;
  const monthlyTarget = goals.reduce((sum, goal) => sum + goal.monthlySuggestion, 0);
  const nextTargetDate = goals
    .map((goal) => goal.targetDate)
    .filter(Boolean)
    .sort()[0] || '';

  return (
    <AppLayout activeRoute="/savings" hideMobileFooter>
      <div className="page-section max-[480px]:gap-2.5">
        <PageHeader
          title={t('savings.title', { defaultValue: 'Savings' })}
          description={t('savings.description', {
            defaultValue:
              'Track money you are setting aside for goals, emergencies, and future plans.',
          })}
          badge={
            <StatusBadge
              status="info"
              label={t('savings.badge', { defaultValue: 'Goals & Planning' })}
            />
          }
          compact
          className="rounded-[24px] border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] px-3.5 py-3 shadow-card-sm max-[480px]:px-3.5 max-[480px]:py-3"
          actionsClassName="w-full sm:w-auto"
          actions={
            <div className="flex w-full sm:w-auto">
              <button
                onClick={() => {
                  toast.info(
                    t('savings.newGoalComingSoon', {
                      defaultValue:
                        'New savings goal creation is coming soon. Savings accounts from Accounts are used as the source of truth.',
                    })
                  );
                }}
                className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-[18px] bg-[linear-gradient(135deg,#06a6d8_0%,#1294ff_100%)] px-3.5 py-2.5 text-[14px] font-700 text-white shadow-[0_12px_24px_rgba(18,148,255,0.18)] transition-transform duration-150 hover:-translate-y-[1px] hover:brightness-105 sm:w-auto"
              >
                <Plus size={16} />{' '}
                {t('savings.newGoalButton', { defaultValue: 'New savings goal' })}
              </button>
            </div>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          {[
            {
              id: 'sv-total-saved',
              label: t('savings.totalSaved', { defaultValue: 'Total saved' }),
              amount: totalSaved,
              icon: Wallet,
              color: 'text-foreground',
              iconTone: 'bg-sky-500/10 text-sky-600',
            },
            {
              id: 'sv-active-goals',
              label: t('savings.activeGoals', { defaultValue: 'Active goals' }),
              value: `${activeGoals} / ${goals.length}`,
              icon: Target,
              color: 'text-foreground',
              iconTone: 'bg-emerald-500/10 text-emerald-600',
            },
            {
              id: 'sv-monthly-target',
              label: t('savings.monthlyTarget', { defaultValue: 'Monthly target' }),
              amount: monthlyTarget,
              icon: CalendarDays,
              color: monthlyTarget > 0 ? 'text-positive' : 'text-muted-foreground',
              iconTone: 'bg-violet-500/10 text-violet-600',
            },
            {
              id: 'sv-next-date',
              label: t('savings.nextTargetDate', { defaultValue: 'Next target date' }),
              value: nextTargetDate || '—',
              icon: CalendarPlus2,
              color: nextTargetDate ? 'text-foreground' : 'text-muted-foreground',
              iconTone: 'bg-amber-500/10 text-amber-600',
            },
          ].map((item) => (
            <div
              key={item.id}
              className="card-elevated rounded-[18px] border border-border/80 bg-card px-2.5 py-2.5 shadow-card-sm max-[480px]:px-2.5"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[10px] font-700 uppercase tracking-[0.08em] text-muted-foreground">
                  {item.label}
                </p>
                <div
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-[10px] ${item.iconTone}`}
                >
                  <item.icon size={14} />
                </div>
              </div>
              {loadingAccounts ? (
                <div className="h-5 w-24 animate-pulse rounded bg-muted" />
              ) : 'amount' in item ? (
                <FormattedCurrencyAmount
                  amount={item.amount ?? 0}
                  currencyCode={defaultCurrencyCode}
                  className={`text-[15px] font-800 font-tabular ${item.color}`}
                  showCode
                />
              ) : (
                <p className={`text-[15px] font-800 font-tabular ${item.color}`}>{item.value}</p>
              )}
            </div>
          ))}
        </div>

        {/* Savings accounts summary (real data source) */}
        {savingsAccounts.length > 0 ? (
          <div className="card-elevated rounded-[20px] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,1)_0%,rgba(248,250,252,0.98)_100%)] p-3 shadow-card-sm max-[480px]:p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-[14px] font-800 text-foreground">
                  {t('savings.savingsAccounts.title', {
                    defaultValue: 'Existing savings accounts',
                  })}
                </h2>
                <p className="text-[11.5px] text-muted-foreground">
                  {t('savings.savingsAccounts.subtitle', {
                    defaultValue:
                      'Balances are sourced from your existing accounts. Savings goals will be able to draw from these in a future release.',
                  })}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10.5px] font-700 text-emerald-700">
                <Sparkles size={12} /> {t('savings.savingsAccounts.tag', { defaultValue: 'Real data' })}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {savingsAccounts.map((account) => (
                <div
                  key={account.id}
                  className="rounded-[16px] border border-border/80 bg-muted/20 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-700 text-foreground">
                        {account.name ||
                          t('savings.savingsAccounts.untitled', { defaultValue: 'Savings account' })}
                      </p>
                      <p className="text-[10.5px] text-muted-foreground">{account.account_number_masked || account.id.slice(0, 8)}</p>
                    </div>
                    <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-pink-500/10 text-pink-600">
                      <PiggyBank size={14} />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <FormattedCurrencyAmount
                      amount={Number(account.current_balance ?? account.opening_balance ?? 0)}
                      currencyCode={account.currency || defaultCurrencyCode}
                      className="text-[14px] font-800 font-tabular text-foreground"
                      showCode
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Goal Sections */}
        <div className="space-y-2.5 max-[480px]:space-y-2.5 sm:space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-700 text-foreground">
                {t('savings.goals.title', { defaultValue: 'Savings goals' })}
              </h2>
              <p className="text-[11.5px] text-muted-foreground">
                {t('savings.goals.subtitle', {
                  defaultValue:
                    'Common savings categories. Goals are illustrative MVP placeholders until the dedicated savings module is live.',
                })}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-card px-2.5 py-1 text-[10.5px] font-700 text-muted-foreground">
              <Target size={11} /> {t('savings.goals.count', { count: goals.length, defaultValue: '{{count}} categories' })}
            </span>
          </div>

          {loadingAccounts ? (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={`skel-sg-${i}`}
                  className="card-elevated rounded-[20px] border border-border/80 p-3"
                >
                  <div className="h-5 w-40 animate-pulse rounded bg-muted mb-3" />
                  <div className="h-3 w-full animate-pulse rounded bg-muted mb-2" />
                  <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : goals.length === 0 ? (
            <div className="card-elevated rounded-[22px] border border-border/80 p-4 max-[480px]:p-3">
              <EmptyState
                icon={Target}
                title={t('savings.goals.empty.title', { defaultValue: 'No savings categories yet' })}
                description={t('savings.goals.empty.description', {
                  defaultValue:
                    'Create your first savings goal to start tracking progress.',
                })}
                variant="compact"
                tone="neutral"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3">
              {goals.map((goal) => {
                const Icon = goal.icon;
                const pct =
                  goal.targetAmount > 0
                    ? Math.min(100, (goal.currentSaved / goal.targetAmount) * 100)
                    : 0;
                const onTrack =
                  goal.targetAmount > 0 && goal.currentSaved >= goal.targetAmount;
                return (
                  <div
                    key={goal.id}
                    className="card-elevated rounded-[20px] border border-border/80 p-3 transition-shadow duration-200 hover:shadow-card-md max-[480px]:p-3"
                  >
                    <div className="mb-2.5 flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                          style={{ backgroundColor: `${goal.accent}18`, color: goal.accent }}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-800 text-foreground">
                            {goal.name}
                          </p>
                          <p className="truncate text-[10.5px] text-muted-foreground">
                            {goal.description}
                          </p>
                        </div>
                      </div>
                      {goal.currentSaved > 0 ? (
                        <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-700 text-emerald-700">
                          {t('savings.goals.hasActivity', { defaultValue: 'Active' })}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full border border-border/80 bg-card px-2 py-0.5 text-[10px] font-700 text-muted-foreground">
                          {t('savings.goals.notStarted', { defaultValue: 'Not started' })}
                        </span>
                      )}
                    </div>

                    <div className="mb-2.5">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="text-[10.5px] text-muted-foreground">
                          {t('savings.goals.progressLabel', { defaultValue: 'Saved / Target' })}
                        </p>
                        <span className="text-[11px] font-700 font-tabular text-muted-foreground">
                          {goal.targetAmount > 0 ? `${pct.toFixed(0)}%` : '—'}
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            onTrack ? 'budget-bar-green' : 'budget-bar-blue'
                          }`}
                          style={{
                            width: `${goal.targetAmount > 0 ? pct : 0}%`,
                            backgroundColor:
                              goal.targetAmount === 0 ? goal.accent : undefined,
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-muted/15 px-2.5 py-2">
                        <p className="text-[10px] text-muted-foreground">
                          {t('savings.goals.currentSaved', { defaultValue: 'Saved' })}
                        </p>
                        <FormattedCurrencyAmount
                          amount={goal.currentSaved}
                          currencyCode={defaultCurrencyCode}
                          className="text-[13px] font-800 font-tabular text-foreground"
                          showCode
                        />
                      </div>
                      <div className="rounded-xl bg-muted/15 px-2.5 py-2 text-right">
                        <p className="text-[10px] text-muted-foreground">
                          {t('savings.goals.target', { defaultValue: 'Target' })}
                        </p>
                        {goal.targetAmount > 0 ? (
                          <FormattedCurrencyAmount
                            amount={goal.targetAmount}
                            currencyCode={defaultCurrencyCode}
                            className="text-[13px] font-800 font-tabular text-foreground"
                            showCode
                          />
                        ) : (
                          <p className="text-[13px] font-700 text-muted-foreground">
                            {t('savings.goals.targetTBD', { defaultValue: 'TBD' })}
                          </p>
                        )}
                      </div>
                    </div>

                    {goal.targetDate || goal.monthlySuggestion > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        {goal.targetDate ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays size={11} /> {goal.targetDate}
                          </span>
                        ) : null}
                        {goal.monthlySuggestion > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <Sparkles size={11} />{' '}
                            ~
                            <span className="font-700 text-foreground">
                              <FormattedCurrencyAmount
                                amount={goal.monthlySuggestion}
                                currencyCode={defaultCurrencyCode}
                                textOnly
                                compact
                              />
                            </span>{' '}
                            {t('savings.goals.perMonth', { defaultValue: '/mo' })}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
