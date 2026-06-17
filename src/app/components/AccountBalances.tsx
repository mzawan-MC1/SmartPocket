'use client';
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Building2, Wallet, CreditCard, Smartphone, PiggyBank, ArrowRight, Landmark } from 'lucide-react';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/AppIcon';
import SectionCard from '@/components/ui/SectionCard';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';


function getAccountIcon(type: string) {
  switch (type) {
    case 'bank': return Building2;
    case 'credit_card': return CreditCard;
    case 'savings': return PiggyBank;
    case 'cash': return Wallet;
    case 'digital_wallet': return Smartphone;
    case 'investment': return Landmark;
    default: return Wallet;
  }
}

function getAccountColorClass(type: string, balance: number) {
  if (balance < 0) return 'bg-negative-soft text-negative';
  switch (type) {
    case 'bank': return 'bg-primary/10 text-primary';
    case 'credit_card': return 'bg-negative-soft text-negative';
    case 'savings': return 'bg-positive-soft text-positive';
    case 'cash': return 'bg-warning-soft text-warning';
    case 'digital_wallet': return 'bg-info-soft text-info';
    default: return 'bg-muted text-muted-foreground';
  }
}

export default function AccountBalances() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getAccounts();
      setAccounts(all.filter((a) => a.is_active));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useSmartPocketDataChanged(['financial_accounts', 'transactions', 'dashboard'], 'AccountBalances', async () => {
    await load();
  });

  return (
    <SectionCard
      title="Accounts"
      description="Live balances for your active bank accounts, cards, wallets, and savings."
      action={
        <Link href="/financial-accounts" className="text-sm font-700 text-accent hover:text-teal-600 flex items-center gap-1 transition-colors">
          Manage <ArrowRight size={13} />
        </Link>
      }
      bodyClassName="p-0"
    >

      {loading ? (
        <div className="divide-y divide-border">
          {[...Array(3)].map((_, i) => (
            <div key={`skel-acct-${i}`} className="flex items-center gap-3 px-5 py-3 animate-pulse">
              <div className="w-8 h-8 rounded-lg bg-muted flex-shrink-0" />
              <div className="flex-1">
                <div className="h-3 bg-muted rounded w-28 mb-1.5" />
                <div className="h-2.5 bg-muted rounded w-16" />
              </div>
              <div className="h-4 bg-muted rounded w-20" />
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="px-5 py-8">
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            description="Add a financial account to track your balances."
          />
        </div>
      ) : (
        <div className="divide-y divide-border">
          {accounts.map((acct) => {
            const Icon = getAccountIcon(acct.account_type);
            const colorClass = getAccountColorClass(acct.account_type, acct.current_balance);
            const lastActivity = new Date(acct.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return (
              <div key={acct.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors cursor-pointer">
                <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={15} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-600 text-foreground truncate">{acct.name}</p>
                  <p className="text-[11px] text-muted-foreground capitalize">{acct.account_type.replace('_', ' ')}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <FormattedCurrencyAmount
                    amount={Number(acct.current_balance)}
                    currencyCode={acct.currency}
                    className={`text-sm font-700 font-tabular ${acct.current_balance < 0 ? 'text-negative' : 'text-foreground'}`}
                    showCode
                  />
                  <p className="text-[11px] text-muted-foreground">{lastActivity}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
