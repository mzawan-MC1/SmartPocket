'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Wallet, CreditCard, Smartphone, PiggyBank, Landmark, MoreVertical, Edit2, Archive, TrendingUp, TrendingDown, Plus, Eye } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import { toast } from 'sonner';
import {
  getAccounts,
  archiveAccount,
  getFinancialAccountsSummary,
  getLatestReportingContext,
  setDefaultAccount,
  type AccountsSummaryMetrics,
  type FinancialAccount,
} from '@/lib/finance';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import AccountDetailPanel from './AccountDetailPanel';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import FinancialAccountForm from './FinancialAccountForm';
import AccountsHeader from './AccountsHeader';
import {
  getAccountsSharedWithSpaces,
  getFinancialAccountScopeType,
  getFinancialAccountOwnershipType,
  getSpaceOwnedFinancialAccounts,
  isDefaultBankAccount,
  isDefaultCashAccount,
} from '@/lib/financial-account-utils';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { KPICardSkeleton, SectionCardSkeleton } from '@/components/ui/LoadingSkeleton';

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

function getAccountTypeLabel(type: string, t: (key: string) => string) {
  switch (type) {
    case 'bank':
      return t('accounts.types.bank');
    case 'credit_card':
      return t('accounts.types.creditCard');
    case 'savings':
      return t('accounts.types.savings');
    case 'cash':
      return t('accounts.types.cash');
    case 'digital_wallet':
      return t('accounts.types.digitalWallet');
    case 'investment':
      return t('accounts.types.investment');
    default:
      return t('accounts.types.other');
  }
}

function getOwnershipLabel(account: FinancialAccount, t: (key: string, options?: Record<string, unknown>) => string) {
  if (getFinancialAccountScopeType(account) === 'space') {
    return t('accounts.spaceAccountBadge', {
      defaultValue: 'Space account',
    });
  }
  const ownershipType = getFinancialAccountOwnershipType(account);
  switch (ownershipType) {
    case 'shared':
      return t('accounts.sharedOwnershipLabel', { defaultValue: 'Shared' });
    case 'business':
      return t('accounts.businessOwnershipLabel', { defaultValue: 'Business' });
    case 'other':
      return t('accounts.otherOwnershipLabel', { defaultValue: 'Other' });
    default:
      return t('accounts.personalOwnershipLabel', { defaultValue: 'Personal' });
  }
}

function getSharedSpaceNames(account: FinancialAccount) {
  return (account.space_account_permissions || [])
    .map((permission) => permission.space?.name || '')
    .filter(Boolean);
}

function getSectionedAccounts(accounts: FinancialAccount[]) {
  const personalAccounts = accounts.filter((account) =>
    getFinancialAccountScopeType(account) === 'personal'
    && getFinancialAccountOwnershipType(account) === 'personal'
    && getSharedSpaceNames(account).length === 0
  );
  const sharedWithSpacesAccounts = getAccountsSharedWithSpaces(accounts);
  const spaceAccounts = getSpaceOwnedFinancialAccounts(accounts);

  return {
    personalSections: [
      {
        id: 'cash',
        title: 'Cash',
        accounts: personalAccounts.filter((account) => account.account_type === 'cash'),
      },
      {
        id: 'bank',
        title: 'Bank Accounts',
        accounts: personalAccounts.filter((account) => account.account_type === 'bank'),
      },
      {
        id: 'wallet',
        title: 'Wallets',
        accounts: personalAccounts.filter((account) => account.account_type === 'digital_wallet'),
      },
      {
        id: 'credit-card',
        title: 'Credit Cards',
        accounts: personalAccounts.filter((account) => account.account_type === 'credit_card'),
      },
      {
        id: 'other-personal',
        title: 'Other Personal Financial Accounts',
        accounts: personalAccounts.filter((account) =>
          account.account_type !== 'cash'
          && account.account_type !== 'bank'
          && account.account_type !== 'digital_wallet'
          && account.account_type !== 'credit_card'
        ),
      },
    ],
    sharedWithSpacesAccounts,
    spaceAccounts,
  };
}

type SummaryMetric =
  | { id: string; label: string; isCount: true }
  | { id: string; label: string; field: 'totalNetWorth' | 'totalAssets' | 'totalLiabilities'; isCount?: false };

export default function AccountsGrid() {
  const { t } = useTranslation('portal');
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [summary, setSummary] = useState<AccountsSummaryMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinancialAccount | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<FinancialAccount | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

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
      .catch((e) => toast.error(e.message || t('accounts.loadFailed')))
      .finally(() => setLoading(false));
  }, [t]);

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
      setArchivingId(id);
      await archiveAccount(id);
      toast.success(t('accounts.archived'));
      setShowArchiveConfirm(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('accounts.archiveFailed'));
    } finally {
      setArchivingId(null);
    }
  };

  const handleSetDefault = async (
    id: string,
    defaultType: 'personal_cash' | 'personal_bank'
  ) => {
    try {
      await setDefaultAccount(id, defaultType);
      toast.success(
        defaultType === 'personal_cash'
          ? t('accounts.defaultCashAssigned', { defaultValue: 'Default Cash updated.' })
          : t('accounts.defaultBankAssigned', { defaultValue: 'Default Bank updated.' })
      );
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('accounts.updateDefaultFailed', { defaultValue: 'Failed to update the default account.' }));
    }
  };

  const activeAccounts = accounts.filter((a) => a.is_active);
  const archivedAccounts = accounts.filter((a) => !a.is_active);
  const { personalSections, sharedWithSpacesAccounts, spaceAccounts } = getSectionedAccounts(activeAccounts);
  const personalAccounts = personalSections.flatMap((section) => section.accounts);
  const summaryCards = [
    { id: 'sum-total', label: t('accounts.summary.totalNetWorth'), field: 'totalNetWorth' as const },
    { id: 'sum-assets', label: t('accounts.summary.totalAssets'), field: 'totalAssets' as const },
    { id: 'sum-liabilities', label: t('accounts.summary.totalLiabilities'), field: 'totalLiabilities' as const },
    { id: 'sum-count', label: t('accounts.summary.activeAccounts'), isCount: true },
  ] satisfies SummaryMetric[];

  const renderAccountCards = (sectionAccounts: FinancialAccount[], gridClassName = 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3') => (
    <div className={gridClassName}>
      {sectionAccounts.map((acct) => {
        const Icon = getIcon(acct.account_type);
        const gradient = GRADIENT_MAP[acct.account_type] || GRADIENT_MAP.other;
        const canSetDefaultCash = acct.account_type === 'cash' && getFinancialAccountOwnershipType(acct) === 'personal' && !isDefaultCashAccount(acct);
        const canSetDefaultBank = acct.account_type === 'bank' && getFinancialAccountOwnershipType(acct) === 'personal' && !isDefaultBankAccount(acct);

        return (
          <div
            key={acct.id}
            className="card-elevated overflow-hidden hover:shadow-card-md transition-shadow duration-200 cursor-pointer"
            onClick={() => setSelectedAccount(acct)}
          >
            <div className={`relative overflow-hidden bg-gradient-to-r ${gradient} p-5 max-[480px]:p-4`}>
              <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white opacity-5 translate-x-8 -translate-y-8" />
              <div className="flex items-start justify-between relative">
                <div>
                  <p className="text-white/70 text-xs font-500 uppercase tracking-wider">
                    {getAccountTypeLabel(acct.account_type, t)}
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
                    aria-label={t('accounts.accountOptions')}
                  >
                    <MoreVertical size={15} className="text-white" />
                  </button>
                </div>
              </div>
              <div className="relative mt-3 flex flex-wrap gap-2">
                <Badge variant="default" className="bg-white/15 text-white border-white/20">
                  {getOwnershipLabel(acct, t)}
                </Badge>
                {getFinancialAccountScopeType(acct) === 'space' && acct.space?.name ? (
                  <Badge variant="default" className="bg-white/15 text-white border-white/20">
                    {acct.space.name}
                  </Badge>
                ) : null}
                {isDefaultCashAccount(acct) ? (
                  <Badge variant="warning" className="bg-white text-warning border-white">
                    {t('accounts.defaultCashBadge', { defaultValue: 'Default Cash' })}
                  </Badge>
                ) : null}
                {isDefaultBankAccount(acct) ? (
                  <Badge variant="warning" className="bg-white text-warning border-white">
                    {t('accounts.defaultBankBadge', { defaultValue: 'Default Bank' })}
                  </Badge>
                ) : null}
              </div>
              <div className="relative mt-4 max-[480px]:mt-3">
                <p className="text-white/70 text-[11px] font-500">{t('accounts.currentBalance')}</p>
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
                  className="absolute top-12 right-4 z-10 bg-card border border-border rounded-xl shadow-card-lg py-1 min-w-[190px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors" onClick={() => openEdit(acct)}>
                    <Edit2 size={14} className="text-muted-foreground" /> {t('accounts.editAccount')}
                  </button>
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors" onClick={() => { setSelectedAccount(acct); setOpenMenuId(null); }}>
                    <Eye size={14} className="text-muted-foreground" /> {t('accounts.viewTransactions')}
                  </button>
                  {canSetDefaultCash ? (
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      onClick={() => {
                        setOpenMenuId(null);
                        void handleSetDefault(acct.id, 'personal_cash');
                      }}
                    >
                      <Wallet size={14} className="text-muted-foreground" /> {t('accounts.setAsDefaultCash', { defaultValue: 'Set as Default Cash' })}
                    </button>
                  ) : null}
                  {canSetDefaultBank ? (
                    <button
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      onClick={() => {
                        setOpenMenuId(null);
                        void handleSetDefault(acct.id, 'personal_bank');
                      }}
                    >
                      <Building2 size={14} className="text-muted-foreground" /> {t('accounts.setAsDefaultBank', { defaultValue: 'Set as Default Bank' })}
                    </button>
                  ) : null}
                  <hr className="my-1 border-border" />
                  <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-warning hover:bg-warning-soft transition-colors" onClick={() => { setShowArchiveConfirm(acct.id); setOpenMenuId(null); }}>
                    <Archive size={14} /> {t('accounts.archiveAccount')}
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between p-4 max-[480px]:flex-wrap max-[480px]:gap-2 max-[480px]:p-3">
              <div>
                <p className="text-xs text-muted-foreground">{t('accounts.openingBalance')}</p>
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
                {acct.include_in_total ? t('accounts.inTotal') : t('accounts.excluded')}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <KPICardSkeleton key={`skel-sum-${i}`} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <SectionCardSkeleton key={`skel-acct-${i}`} lines={3} className="h-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-[480px]:space-y-4">
      <AccountsHeader onAddAccount={openAdd} />

      {/* Summary Bar */}
      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:grid-cols-4">
        {summaryCards.map((item) => {
          const metric = item.isCount ? null : summary?.[item.field] ?? null;

          return (
          <div key={item.id} className="card-elevated p-4 max-[480px]:p-3">
            <p className="text-[11px] font-600 uppercase tracking-wider text-muted-foreground mb-1.5">{item.label}</p>
            {item.isCount ? (
              <p className="text-xl font-700 font-tabular text-foreground">{activeAccounts.length}</p>
            ) : !metric || metric.originalTotals.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('accounts.summary.noActiveBalances')}</p>
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
                    {t('accounts.summary.viewOriginalCurrencies')}
                  </summary>
                  <div className="mt-2 space-y-1.5 text-[11px] text-muted-foreground">
                    <p>{t('accounts.summary.reportingCurrency', { value: metric.reportingCurrency })}</p>
                    {metric.originalTotals.map((row) => (
                      <FormattedCurrencyAmount
                        key={`${item.id}-details-${row.currency}`}
                        amount={row.amount}
                        currencyCode={row.currency}
                        textOnly
                        className="block text-[11px] text-muted-foreground"
                      />
                    ))}
                    {metric.provider ? <p>{t('accounts.summary.provider', { value: metric.provider })}</p> : null}
                    {metric.rateDate ? <p>{t('accounts.summary.rateDate', { value: metric.rateDate })}</p> : null}
                    {metric.providerTimestamp ? <p>{t('accounts.summary.providerTimestamp', { value: metric.providerTimestamp })}</p> : null}
                    {metric.fetchedAt ? <p>{t('accounts.summary.fetchedAt', { value: metric.fetchedAt })}</p> : null}
                    <p>{t('accounts.summary.status', { value: metric.stale ? t('accounts.summary.stale') : t('accounts.summary.fresh') })}</p>
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
        <div className="mb-3 flex items-center justify-between gap-3 max-[480px]:mb-2">
          <h2 className="text-base font-700 text-foreground">{t('accounts.activeAccounts')}</h2>
          <button onClick={openAdd} className="btn-primary text-sm max-[480px]:hidden">
            <Plus size={14} /> {t('accounts.addAccount')}
          </button>
        </div>

        {activeAccounts.length === 0 ? (
          <div className="card-elevated p-12">
            <EmptyState
              icon={Wallet}
              title={t('accounts.emptyTitle')}
              description={t('accounts.emptyDescription')}
              action={{ label: t('accounts.addAccount'), onClick: openAdd }}
            />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-700 text-foreground">
                  {t('accounts.personalAccountsSection', { defaultValue: 'Personal Accounts' })}
                </h3>
              </div>
              {personalAccounts.length > 0 ? (
                renderAccountCards(personalAccounts, 'grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3')
              ) : null}
            </div>

            {sharedWithSpacesAccounts.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-700 text-foreground">
                    {t('accounts.sharedWithSpacesSection', { defaultValue: 'Shared With Spaces' })}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('accounts.sharedWithSpacesHelper', {
                      defaultValue: 'These personal accounts stay private by default and can fund Space-linked transactions where you enabled sharing.',
                    })}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {sharedWithSpacesAccounts.map((acct) => {
                    const sharedSpaceNames = getSharedSpaceNames(acct);
                    return (
                      <div key={acct.id} className="rounded-2xl border border-border bg-card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-700 text-foreground">{acct.name}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {sharedSpaceNames.join(', ')}
                            </p>
                          </div>
                          <Badge variant="default">
                            {t('accounts.sharedOwnershipLabel', { defaultValue: 'Shared' })}
                          </Badge>
                        </div>
                        <div className="mt-3 space-y-2">
                          <FormattedCurrencyAmount
                            amount={acct.current_balance}
                            currencyCode={acct.currency}
                            className="text-base font-700 text-foreground"
                          />
                          <p className="text-xs text-muted-foreground">
                            {t('accounts.sharedWithSpacesPrivacyHint', {
                              defaultValue: 'Balance and full history stay private unless you grant extra visibility.',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {spaceAccounts.length > 0 ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-700 text-foreground">
                    {t('accounts.spaceAccountsSection', { defaultValue: 'Space Accounts' })}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('accounts.spaceAccountsHelper', {
                      defaultValue: 'Shared space-owned balances live in the same finance engine and remain outside personal totals.',
                    })}
                  </p>
                </div>
                {renderAccountCards(spaceAccounts)}
              </div>
            ) : null}

            <button
              onClick={openAdd}
              className="group flex min-h-[180px] w-full flex-col items-center justify-center gap-2 border-2 border-dashed border-border p-8 transition-all duration-200 hover:border-accent hover:bg-accent/5 card-elevated max-[480px]:min-h-[140px] max-[480px]:p-5"
            >
              <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-accent/10 flex items-center justify-center transition-colors">
                <Plus size={20} className="text-muted-foreground group-hover:text-accent transition-colors" />
              </div>
              <p className="text-sm font-600 text-muted-foreground group-hover:text-accent transition-colors">{t('accounts.addAccount')}</p>
            </button>
          </div>
        )}
      </div>

      {/* Archived Accounts */}
      {archivedAccounts.length > 0 && (
        <div>
          <h2 className="text-base font-700 text-muted-foreground mb-3">{t('accounts.archivedAccounts')}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {archivedAccounts.map((acct) => {
              const Icon = getIcon(acct.account_type);
              return (
                <div key={acct.id} className="card-elevated overflow-hidden opacity-60">
                  <div className="bg-gradient-to-r from-muted-foreground to-slate-600 p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-white/70 text-xs font-500 uppercase tracking-wider">{getAccountTypeLabel(acct.account_type, t)}</p>
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
                    <Badge variant="default">{t('accounts.archived')}</Badge>
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
        title={editingAccount ? t('accounts.editAccount') : t('accounts.addAccount')}
        size="md"
      >
        <FinancialAccountForm
          account={editingAccount}
          onSuccess={() => setShowAddModal(false)}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>

      <ConfirmationModal
        open={!!showArchiveConfirm}
        onClose={() => setShowArchiveConfirm(null)}
        title={t('accounts.archiveConfirmTitle')}
        description={t('accounts.archiveConfirmDescription')}
        cancelLabel={t('accounts.cancel')}
        confirmLabel={t('accounts.archive')}
        pending={showArchiveConfirm !== null && archivingId === showArchiveConfirm}
        onConfirm={() => {
          if (showArchiveConfirm) {
            void handleArchive(showArchiveConfirm);
          }
        }}
      />

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
