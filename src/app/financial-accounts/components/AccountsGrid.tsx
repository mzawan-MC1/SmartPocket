'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Wallet, CreditCard, Smartphone, PiggyBank, Landmark, MoreVertical, Edit2, Archive, TrendingUp, TrendingDown, Plus, Eye, Loader2,  } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import {
  getAccounts,
  archiveAccount,
  getFinancialAccountsSummary,
  getLatestReportingContext,
  type AccountsSummaryMetrics,
  type FinancialAccount,
} from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import AccountDetailPanel from './AccountDetailPanel';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import FinancialAccountForm from './FinancialAccountForm';

const GRADIENT_MAP: Record<string, string> = {
  bank: 'from-primary to-navy-600',
  credit_card: 'from-negative to-red-700',
  savings: 'from-positive to-teal-600',
  cash: 'from-warning to-amber-600',
  digital_wallet: 'from-info to-blue-600',
  investment: 'from-purple-600 to-purple-800',
  other: 'from-muted-foreground to-slate-600',
};

function getIcon(type: string) {
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

type SummaryMetric =
  | { id: string; label: string; isCount: true }
  | { id: string; label: string; field: 'totalNetWorth' | 'totalAssets' | 'totalLiabilities'; isCount?: false };

export default function AccountsGrid() {
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [summary, setSummary] = useState<AccountsSummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      getAccounts(),
      getLatestReportingContext(),
    ])
      .then(async ([nextAccounts, reportingContext]) => {
        setAccounts(nextAccounts);
        setSummary(await getFinancialAccountsSummary(nextAccounts, reportingContext));
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useSmartPocketDataChanged(['financial_accounts', 'transactions', 'dashboard'], 'AccountsGrid', () => {
    load();
  });

  const openAdd = () => {
    setEditingAccount(null);
    setShowAddModal(true);
  };

  const openEdit = (acct: FinancialAccount) => {
    setEditingAccount(acct);
    setShowAddModal(true);
    setOpenMenuId(null);
  };

  const handleArchive = async (id: string) => {
    try {
      await archiveAccount(id);
      toast.success('Account archived');
      setShowArchiveConfirm(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to archive');
    }
  };

  const activeAccounts = accounts.filter((a) => a.is_active);
  const archivedAccounts = accounts.filter((a) => !a.is_active);
  const summaryCards = [
    { id: 'sum-total', label: 'Total Net Worth', field: 'totalNetWorth' as const },
    { id: 'sum-assets', label: 'Total Assets', field: 'totalAssets' as const },
    { id: 'sum-liabilities', label: 'Total Liabilities', field: 'totalLiabilities' as const },
    { id: 'sum-count', label: 'Active Accounts', isCount: true },
  ] satisfies SummaryMetric[];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={`skel-sum-${i}`} className="card-elevated p-4 animate-pulse">
              <div className="h-2.5 bg-muted rounded w-20 mb-2" />
              <div className="h-6 bg-muted rounded w-28" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={`skel-acct-${i}`} className="card-elevated overflow-hidden animate-pulse">
              <div className="h-28 bg-muted" />
              <div className="p-4">
                <div className="h-3 bg-muted rounded w-24 mb-2" />
                <div className="h-3 bg-muted rounded w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((item) => {
          const metric = item.isCount ? null : summary?.[item.field] ?? null;

          return (
          <div key={item.id} className="card-elevated p-4">
            <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{item.label}</p>
            {item.isCount ? (
              <p className="text-xl font-700 font-tabular text-foreground">{activeAccounts.length}</p>
            ) : !metric || metric.originalTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active balances</p>
            ) : (
              <div className="space-y-2">
                {metric.reportingAmount !== null ? (
                  <FormattedCurrencyAmount
                    amount={metric.reportingAmount}
                    currencyCode={metric.reportingCurrency}
                    className={`text-sm font-700 ${
                      item.field === 'totalLiabilities'
                        ? 'text-negative'
                        : (metric.reportingAmount || 0) >= 0
                          ? 'text-foreground'
                          : 'text-negative'
                    }`}
                  />
                ) : (
                  <div className="space-y-1">
                    {metric.originalTotals.map((row) => (
                      <FormattedCurrencyAmount
                        key={`${item.id}-${row.currency}`}
                        amount={row.amount}
                        currencyCode={row.currency}
                        className={`text-sm font-700 ${
                          item.field === 'totalLiabilities'
                            ? 'text-negative'
                            : row.amount >= 0
                              ? 'text-foreground'
                              : 'text-negative'
                        }`}
                      />
                    ))}
                  </div>
                )}
                <details className="rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2">
                  <summary className="cursor-pointer text-[11px] font-600 text-muted-foreground">
                    View original currencies
                  </summary>
                  <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
                    <p>Reporting currency: {metric.reportingCurrency}</p>
                    {metric.originalTotals.map((row) => (
                      <FormattedCurrencyAmount
                        key={`${item.id}-details-${row.currency}`}
                        amount={row.amount}
                        currencyCode={row.currency}
                        textOnly
                        className="block text-[11px] text-muted-foreground"
                      />
                    ))}
                    {metric.provider ? <p>Provider: {metric.provider}</p> : null}
                    {metric.rateDate ? <p>Rate date: {metric.rateDate}</p> : null}
                    {metric.providerTimestamp ? <p>Provider timestamp: {metric.providerTimestamp}</p> : null}
                    {metric.fetchedAt ? <p>Fetched at: {metric.fetchedAt}</p> : null}
                    <p>Status: {metric.stale ? 'Stale' : 'Fresh'}</p>
                    {metric.unavailableReason ? <p className="text-warning">{metric.unavailableReason}</p> : null}
                  </div>
                </details>
              </div>
            )}
          </div>
        )})}
      </div>

      {/* Active Accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-700 text-foreground">Active Accounts</h2>
          <button onClick={openAdd} className="btn-primary text-sm">
            <Plus size={14} /> Add Account
          </button>
        </div>

        {activeAccounts.length === 0 ? (
          <div className="card-elevated p-12">
            <EmptyState
              icon={Wallet}
              title="No accounts yet"
              description="Create your first financial account to start tracking your money."
              action={{ label: 'Add Account', onClick: openAdd }}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {activeAccounts.map((acct) => {
              const Icon = getIcon(acct.account_type);
              const gradient = GRADIENT_MAP[acct.account_type] || GRADIENT_MAP.other;
              return (
                <div
                  key={acct.id}
                  className="card-elevated overflow-hidden hover:shadow-card-md transition-shadow duration-200 cursor-pointer"
                  onClick={() => setSelectedAccount(acct)}
                >
                  <div className={`bg-gradient-to-r ${gradient} p-5 relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white opacity-5 translate-x-8 -translate-y-8" />
                    <div className="flex items-start justify-between relative">
                      <div>
                        <p className="text-white/70 text-xs font-500 uppercase tracking-wider">
                          {acct.account_type.replace('_', ' ')}
                        </p>
                        <p className="text-white font-700 text-base mt-0.5 truncate max-w-[180px]">{acct.name}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                          <Icon size={16} className="text-white" />
                        </div>
                        <button
                          className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center hover:bg-white/30 transition-colors"
                          onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === acct.id ? null : acct.id); }}
                          aria-label="Account options"
                        >
                          <MoreVertical size={15} className="text-white" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 relative">
                      <p className="text-white/70 text-[11px] font-500">Current Balance</p>
                      <p className={`text-2xl font-800 font-tabular mt-0.5 ${acct.current_balance < 0 ? 'text-red-200' : 'text-white'}`}>
                        <FormattedCurrencyAmount
                          amount={acct.current_balance}
                          currencyCode={acct.currency}
                          className={acct.current_balance < 0 ? 'text-red-200' : 'text-white'}
                        />
                      </p>
                    </div>
                    {openMenuId === acct.id && (
                      <div
                        className="absolute top-12 right-4 z-10 bg-card border border-border rounded-xl shadow-card-lg py-1 min-w-[160px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors" onClick={() => openEdit(acct)}>
                          <Edit2 size={14} className="text-muted-foreground" /> Edit Account
                        </button>
                        <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors" onClick={() => { setSelectedAccount(acct); setOpenMenuId(null); }}>
                          <Eye size={14} className="text-muted-foreground" /> View Transactions
                        </button>
                        <hr className="my-1 border-border" />
                        <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-warning hover:bg-warning-soft transition-colors" onClick={() => { setShowArchiveConfirm(acct.id); setOpenMenuId(null); }}>
                          <Archive size={14} /> Archive Account
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Opening Balance</p>
                      <FormattedCurrencyAmount
                        amount={acct.opening_balance}
                        currencyCode={acct.currency}
                        className="text-sm font-600 text-foreground"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {acct.current_balance >= acct.opening_balance
                        ? <TrendingUp size={14} className="text-positive" />
                        : <TrendingDown size={14} className="text-negative" />
                      }
                      <span className={`text-xs font-600 font-tabular ${acct.current_balance >= acct.opening_balance ? 'text-positive' : 'text-negative'}`}>
                        <FormattedCurrencyAmount
                          amount={acct.current_balance - acct.opening_balance}
                          currencyCode={acct.currency}
                          className={acct.current_balance >= acct.opening_balance ? 'text-positive' : 'text-negative'}
                        />
                      </span>
                    </div>
                    <Badge variant={acct.include_in_total ? 'active' : 'default'}>
                      {acct.include_in_total ? 'In Total' : 'Excluded'}
                    </Badge>
                  </div>
                </div>
              );
            })}

            {/* Add Account Card */}
            <button
              onClick={openAdd}
              className="card-elevated border-dashed border-2 border-border hover:border-accent hover:bg-accent/5 transition-all duration-200 flex flex-col items-center justify-center gap-2 p-8 min-h-[180px] group"
            >
              <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-accent/10 flex items-center justify-center transition-colors">
                <Plus size={20} className="text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <p className="text-sm font-600 text-muted-foreground group-hover:text-accent transition-colors">Add Account</p>
            </button>
          </div>
        )}
      </div>

      {/* Archived Accounts */}
      {archivedAccounts.length > 0 && (
        <div>
          <h2 className="text-base font-700 text-muted-foreground mb-3">Archived Accounts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {archivedAccounts.map((acct) => {
              const Icon = getIcon(acct.account_type);
              return (
                <div key={acct.id} className="card-elevated overflow-hidden opacity-60">
                  <div className="bg-gradient-to-r from-muted-foreground to-slate-600 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white/70 text-xs font-500 uppercase tracking-wider">{acct.account_type.replace('_', ' ')}</p>
                        <p className="text-white font-700 text-base mt-0.5">{acct.name}</p>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                        <Icon size={16} className="text-white" />
                      </div>
                    </div>
                    <p className={`text-xl font-800 font-tabular mt-3 ${acct.current_balance < 0 ? 'text-red-200' : 'text-white'}`}>
                      <FormattedCurrencyAmount
                        amount={acct.current_balance}
                        currencyCode={acct.currency}
                        className={acct.current_balance < 0 ? 'text-red-200' : 'text-white'}
                      />
                    </p>
                  </div>
                  <div className="p-3 flex items-center justify-between">
                    <Badge variant="default">Archived</Badge>
                    <span className="text-xs text-muted-foreground">{acct.currency}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editingAccount ? 'Edit Account' : 'Add Account'}
        size="md"
      >
        <FinancialAccountForm
          account={editingAccount}
          onSuccess={() => setShowAddModal(false)}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>

      {/* Archive Confirm */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={() => setShowArchiveConfirm(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-card-lg p-6 max-w-sm w-full">
            <h3 className="text-base font-700 text-foreground mb-2">Archive Account?</h3>
            <p className="text-sm text-muted-foreground mb-4">This account will be hidden from active views. Your transaction history will be preserved.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowArchiveConfirm(null)} className="btn-secondary">Cancel</button>
              <button onClick={() => handleArchive(showArchiveConfirm)} className="btn-primary bg-warning hover:bg-warning/90">Archive</button>
            </div>
          </div>
        </div>
      )}

      {/* Account Detail Panel */}
      {selectedAccount && (
        <AccountDetailPanel
          account={selectedAccount}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </div>
  );
}
