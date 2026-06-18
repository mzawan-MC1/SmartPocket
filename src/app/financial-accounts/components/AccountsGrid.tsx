'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Building2, Wallet, CreditCard, Smartphone, PiggyBank, Landmark, MoreVertical, Edit2, Archive, TrendingUp, TrendingDown, Plus, Eye, Loader2,  } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import {
  getAccounts,
  createAccount,
  updateAccount,
  archiveAccount,
  getFinancialAccountsSummary,
  type AccountsSummaryMetrics,
  type FinancialAccount,
} from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import AccountDetailPanel from './AccountDetailPanel';
import CurrencySelector from '@/components/CurrencySelector';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { resolveUserDefaultCurrency } from '@/lib/currency-totals';


const ACCOUNT_TYPE_OPTIONS = [
  { value: 'bank', label: 'Bank Account' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'savings', label: 'Savings' },
  { value: 'cash', label: 'Cash' },
  { value: 'digital_wallet', label: 'Digital Wallet' },
  { value: 'investment', label: 'Investment' },
  { value: 'other', label: 'Other' },
];

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

interface AccountFormData {
  name: string;
  account_type: string;
  currency: string;
  opening_balance: string;
  notes: string;
  include_in_total: boolean;
}

type SummaryMetric =
  | { id: string; label: string; isCount: true }
  | { id: string; label: string; field: 'totalNetWorth' | 'totalAssets' | 'totalLiabilities'; isCount?: false };

export default function AccountsGrid() {
  const { data: referenceData } = useClientReferenceData();
  const platformDefaultCurrency = referenceData?.platformDefaultCurrency || '';
  const [userDefaultCurrency, setUserDefaultCurrency] = useState('');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [summary, setSummary] = useState<AccountsSummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<AccountFormData>({
    name: '', account_type: 'bank', currency: '', opening_balance: '0.00', notes: '', include_in_total: true,
  });

  const load = useCallback(() => {
    setLoading(true);
    getAccounts()
      .then(async (nextAccounts) => {
        setAccounts(nextAccounts);
        setSummary(await getFinancialAccountsSummary(nextAccounts));
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    void resolveUserDefaultCurrency(platformDefaultCurrency).then((currencyCode) => {
      if (!cancelled) {
        setUserDefaultCurrency(currencyCode);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [platformDefaultCurrency]);

  useSmartPocketDataChanged(['financial_accounts', 'transactions', 'dashboard'], 'AccountsGrid', () => {
    load();
  });

  const openAdd = () => {
    setEditingAccount(null);
    setForm({
      name: '',
      account_type: 'bank',
      currency: userDefaultCurrency || platformDefaultCurrency,
      opening_balance: '0.00',
      notes: '',
      include_in_total: true,
    });
    setShowAddModal(true);
  };

  React.useEffect(() => {
    const defaultCurrency = userDefaultCurrency || platformDefaultCurrency;
    if (!defaultCurrency) return;
    setForm((current) => {
      if (current.currency || editingAccount) {
        return current;
      }
      return { ...current, currency: defaultCurrency };
    });
  }, [editingAccount, platformDefaultCurrency, userDefaultCurrency]);

  const openEdit = (acct: FinancialAccount) => {
    setEditingAccount(acct);
    setForm({
      name: acct.name,
      account_type: acct.account_type,
      currency: acct.currency,
      opening_balance: String(acct.opening_balance),
      notes: acct.notes || '',
      include_in_total: acct.include_in_total,
    });
    setShowAddModal(true);
    setOpenMenuId(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Account name is required'); return; }
    if (!form.currency) { toast.error('Currency is required'); return; }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        account_type: form.account_type as FinancialAccount['account_type'],
        currency: form.currency,
        opening_balance: parseFloat(form.opening_balance) || 0,
        notes: form.notes || null,
        include_in_total: form.include_in_total,
      };
      if (editingAccount) {
        await updateAccount(editingAccount.id, payload);
        toast.success('Account updated');
      } else {
        await createAccount(payload);
        toast.success('Account created');
      }
      setShowAddModal(false);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save account');
    } finally {
      setIsSaving(false);
    }
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
        {summaryCards.map((item) => (
          <div key={item.id} className="card-elevated p-4">
            <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{item.label}</p>
            {item.isCount ? (
              <p className="text-xl font-700 font-tabular text-foreground">{activeAccounts.length}</p>
            ) : !summary || summary[item.field].originalTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active balances</p>
            ) : (
              <div className="space-y-2">
                {summary[item.field].reportingAmount !== null ? (
                  <FormattedCurrencyAmount
                    amount={summary[item.field].reportingAmount}
                    currencyCode={summary[item.field].reportingCurrency}
                    className={`text-sm font-700 ${
                      item.field === 'totalLiabilities'
                        ? 'text-negative'
                        : (summary[item.field].reportingAmount || 0) >= 0
                          ? 'text-foreground'
                          : 'text-negative'
                    }`}
                  />
                ) : (
                  <div className="space-y-1">
                    {summary[item.field].originalTotals.map((row) => (
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
                    <p>Reporting currency: {summary[item.field].reportingCurrency}</p>
                    {summary[item.field].originalTotals.map((row) => (
                      <FormattedCurrencyAmount
                        key={`${item.id}-details-${row.currency}`}
                        amount={row.amount}
                        currencyCode={row.currency}
                        textOnly
                        className="block text-[11px] text-muted-foreground"
                      />
                    ))}
                    {summary[item.field].provider ? <p>Provider: {summary[item.field].provider}</p> : null}
                    {summary[item.field].rateDate ? <p>Rate date: {summary[item.field].rateDate}</p> : null}
                    {summary[item.field].providerTimestamp ? <p>Provider timestamp: {summary[item.field].providerTimestamp}</p> : null}
                    {summary[item.field].fetchedAt ? <p>Fetched at: {summary[item.field].fetchedAt}</p> : null}
                    <p>Status: {summary[item.field].stale ? 'Stale' : 'Fresh'}</p>
                    {summary[item.field].unavailableReason ? <p className="text-warning">{summary[item.field].unavailableReason}</p> : null}
                  </div>
                </details>
              </div>
            )}
          </div>
        ))}
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
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Account Name *</label>
            <input
              type="text"
              className="input-base"
              placeholder="e.g. Chase Checking, Cash Wallet"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Account Type *</label>
              <select className="input-base" value={form.account_type} onChange={(e) => setForm((f) => ({ ...f, account_type: e.target.value }))}>
                {ACCOUNT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Currency *</label>
              <CurrencySelector
                value={form.currency}
                onChange={(currencyCode) => setForm((f) => ({ ...f, currency: currencyCode }))}
                showCountryCount
                placeholder="Choose currency"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Opening Balance</label>
            <p className="text-xs text-muted-foreground mb-1.5">Current balance of this account. Use negative for credit card debt.</p>
            <input
              type="number"
              step="0.01"
              className="input-base font-tabular"
              placeholder="0.00"
              value={form.opening_balance}
              onChange={(e) => setForm((f) => ({ ...f, opening_balance: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Notes</label>
            <textarea rows={2} className="input-base resize-none" placeholder="Optional notes..." value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
            <input
              id="include-in-total"
              type="checkbox"
              className="w-4 h-4 rounded border-border accent-accent cursor-pointer"
              checked={form.include_in_total}
              onChange={(e) => setForm((f) => ({ ...f, include_in_total: e.target.checked }))}
            />
            <label htmlFor="include-in-total" className="text-sm font-500 text-foreground cursor-pointer">
              Include in total balance calculation
            </label>
          </div>
          <div className="flex gap-2 justify-end pt-2 border-t border-border">
            <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary">
              {isSaving ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : editingAccount ? 'Update Account' : 'Add Account'}
            </button>
          </div>
        </div>
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
