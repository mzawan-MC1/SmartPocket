'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, ArrowLeftRight, Plus, PieChart, MoreHorizontal, TrendingUp, TrendingDown, Repeat, Wallet, ArrowUpDown, Tag, BarChart3, Users, RotateCcw, DollarSign, Sparkles, Mic, Loader2, X, ShoppingBag, CreditCard, LifeBuoy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePendingNavigation } from '@/lib/pending-navigation';
import { useQuickActions, type QuickActionId } from '@/components/quick-actions/QuickActionsContext';
interface BottomNavProps {
  activeRoute: string;
}

export default function BottomNav({ activeRoute }: BottomNavProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { t } = useTranslation(['common', 'portal']);
  const { isRouteActive, isRoutePending, handleNavigationIntent } = usePendingNavigation(activeRoute);
  const quickActionsController = useQuickActions();

  const navItems = [
    { id: 'bottom-dashboard', label: t('nav.dashboard', { ns: 'common' }), icon: LayoutDashboard, href: '/dashboard' },
    { id: 'bottom-transactions', label: t('nav.transactions', { ns: 'common' }), icon: ArrowLeftRight, href: '/transactions' },
    { id: 'bottom-add', label: t('actions.add', { ns: 'common' }), icon: Plus, href: '#', isAction: true },
    { id: 'bottom-budgets', label: t('nav.budgets', { ns: 'common' }), icon: PieChart, href: '/budgets' },
    { id: 'bottom-more', label: t('bottomNav.more', { ns: 'portal' }), icon: MoreHorizontal, href: '#', isMore: true },
  ];

  const quickActions = [
    { id: 'qa-expense', label: t('bottomNav.expense', { ns: 'portal' }), icon: TrendingDown, color: 'bg-negative-soft text-negative border border-negative/20', action: 'expense' as QuickActionId },
    { id: 'qa-income', label: t('bottomNav.income', { ns: 'portal' }), icon: TrendingUp, color: 'bg-positive-soft text-positive border border-positive/20', action: 'income' as QuickActionId },
    { id: 'qa-transfer', label: t('bottomNav.transfer', { ns: 'portal' }), icon: ArrowUpDown, color: 'bg-info-soft text-info border border-info/20', action: 'transfer' as QuickActionId },
    { id: 'qa-account', label: t('bottomNav.account', { ns: 'portal' }), icon: Wallet, color: 'bg-warning-soft text-warning border border-warning/20', action: 'account' as QuickActionId },
    { id: 'qa-person', label: t('bottomNav.person', { ns: 'portal' }), icon: Users, color: 'bg-accent/10 text-accent border border-accent/20', action: 'person' as QuickActionId },
    { id: 'qa-reimb', label: t('bottomNav.reimbursement', { ns: 'portal' }), icon: RotateCcw, color: 'bg-purple-100 text-purple-700 border border-purple-200', action: 'reimbursement' as QuickActionId },
  ];

  const moreItems = [
    { id: 'more-transfers', label: t('bottomNav.transfers', { ns: 'portal' }), icon: ArrowUpDown, href: '/transfers' },
    { id: 'more-recurring', label: t('bottomNav.recurring', { ns: 'portal' }), icon: Repeat, href: '/recurring' },
    { id: 'more-personal-subscriptions', label: t('bottomNav.personalSubscriptions', { ns: 'portal' }), icon: CreditCard, href: '/personal-subscriptions' },
    { id: 'more-categories', label: t('bottomNav.categories', { ns: 'portal' }), icon: Tag, href: '/categories' },
    { id: 'more-reports', label: t('bottomNav.reports', { ns: 'portal' }), icon: BarChart3, href: '/reports' },
    { id: 'more-item-insights', label: t('itemInsights.title', { ns: 'portal', defaultValue: 'Item Insights' }), icon: ShoppingBag, href: '/reports/item-insights' },
    { id: 'more-accounts', label: t('bottomNav.accounts', { ns: 'portal' }), icon: Wallet, href: '/financial-accounts' },
    { id: 'more-support', label: t('bottomNav.support', { ns: 'portal', defaultValue: 'Support' }), icon: LifeBuoy, href: '/support' },
    { id: 'more-people', label: t('bottomNav.people', { ns: 'portal' }), icon: Users, href: '/people' },
    { id: 'more-reimbursements', label: t('bottomNav.reimbursements', { ns: 'portal' }), icon: RotateCcw, href: '/reimbursements' },
    { id: 'more-settlements', label: t('bottomNav.settlements', { ns: 'portal' }), icon: DollarSign, href: '/settlements' },
  ];

  useEffect(() => {
    setQuickAddOpen(false);
    setMoreOpen(false);
  }, [activeRoute]);

  return (
    <>
      {(quickAddOpen || moreOpen) && (
        <div
          className="fixed inset-0 z-40 bg-foreground/20 fade-in"
          onClick={() => { setQuickAddOpen(false); setMoreOpen(false); }}
        />
      )}

      {quickAddOpen && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.25rem)] z-50 px-3 pb-1 sm:hidden">
          <div className="mx-auto w-full max-w-sm card-elevated-md slide-up overflow-hidden rounded-[22px]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-700 text-foreground">{t('bottomNav.quickAdd', { ns: 'portal' })}</p>
              <button
                type="button"
                onClick={() => setQuickAddOpen(false)}
                className="btn-ghost h-8 w-8 rounded-full p-0"
                aria-label={t('bottomNav.closeQuickAdd', { ns: 'portal' })}
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[min(60vh,28rem)] space-y-3 overflow-y-auto px-4 py-4 scrollbar-thin">
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    quickActionsController?.openQuickAction('smart_entry');
                    setQuickAddOpen(false);
                  }}
                  className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-accent/10 px-3 py-3 text-sm font-600 text-accent transition-colors duration-150 hover:bg-accent/20"
                >
                  <Sparkles size={20} />
                  <span className="text-xs font-700">{t('bottomNav.smartEntry', { ns: 'portal' })}</span>
                </button>
                <button
                  onClick={() => {
                    quickActionsController?.openQuickAction('voice_entry');
                    setQuickAddOpen(false);
                  }}
                  className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl border border-accent/20 bg-accent/10 px-3 py-3 text-sm font-600 text-accent transition-colors duration-150 hover:bg-accent/20"
                >
                  <Mic size={20} />
                  <span className="text-xs font-700">{t('bottomNav.voiceEntry', { ns: 'portal' })}</span>
                </button>
              </div>
              <div className="border-t border-border pt-3">
                <div className="grid grid-cols-2 gap-2.5">
                  {quickActions.map((action) => {
                    const ActionIcon = action.icon;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        className={`flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl px-3 py-3 text-center text-sm font-600 transition-transform duration-150 active:scale-95 ${action.color}`}
                        onClick={() => {
                          quickActionsController?.openQuickAction(action.action);
                          setQuickAddOpen(false);
                        }}
                      >
                        <ActionIcon size={20} />
                        <span className="text-xs font-700 leading-4">{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {moreOpen && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.25rem)] z-50 px-3 pb-1 sm:hidden">
          <div className="mx-auto w-full max-w-sm card-elevated-md slide-up overflow-hidden rounded-[22px]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-700 text-foreground">{t('bottomNav.more', { ns: 'portal' })}</p>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="btn-ghost h-8 w-8 rounded-full p-0"
                aria-label={t('bottomNav.closeMore', { ns: 'portal' })}
              >
                <X size={16} />
              </button>
            </div>
            <div className="max-h-[min(56vh,24rem)] overflow-y-auto px-2 py-2 scrollbar-thin">
              {moreItems.map((item) => {
                const ItemIcon = item.icon;
                const active = isRouteActive(item.href);
                const pending = isRoutePending(item.href);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-500 transition-colors ${
                      active ? 'bg-accent/8 text-accent' : 'text-foreground hover:bg-muted'
                    }`}
                    onClick={(event) => {
                      const shouldNavigate = handleNavigationIntent(item.href, event);
                      if (shouldNavigate) {
                        setMoreOpen(false);
                      }
                    }}
                    aria-current={active ? 'page' : undefined}
                    aria-busy={pending ? 'true' : undefined}
                  >
                    {pending ? <Loader2 size={16} className="animate-spin text-accent" /> : <ItemIcon size={16} className={active ? 'text-accent' : 'text-muted-foreground'} />}
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
              <div className="mt-2 border-t border-border pt-2">
                <Link
                  href="/ai-history"
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-500 transition-colors ${
                    isRouteActive('/ai-history') ? 'bg-accent/8 text-accent' : 'text-foreground hover:bg-muted'
                  }`}
                  onClick={(event) => {
                    const shouldNavigate = handleNavigationIntent('/ai-history', event);
                    if (shouldNavigate) {
                      setMoreOpen(false);
                    }
                  }}
                  aria-current={isRouteActive('/ai-history') ? 'page' : undefined}
                  aria-busy={isRoutePending('/ai-history') ? 'true' : undefined}
                >
                  {isRoutePending('/ai-history')
                    ? <Loader2 size={16} className="animate-spin text-accent" />
                    : <Sparkles size={16} className="text-accent" />
                  }
                  {t('bottomNav.aiHistory', { ns: 'portal' })}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/98 backdrop-blur safe-area-bottom shadow-[0_-6px_24px_rgba(15,52,96,0.08)]"
        style={{ height: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex h-full items-center justify-around px-1.5 pt-1">
          {navItems.map((item) => {
            const NavIcon = item.icon;
            if (item.isAction) {
              return (
                <button
                  key={item.id}
                  onClick={() => { setQuickAddOpen(!quickAddOpen); setMoreOpen(false); }}
                  className="relative -top-3.5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-background gradient-teal shadow-teal-glow transition-all duration-200 active:scale-95"
                  aria-label={t('bottomNav.quickAdd', { ns: 'portal' })}
                >
                  <Plus size={22} className="text-white transition-transform duration-200" style={{ transform: quickAddOpen ? 'rotate(45deg)' : 'rotate(0deg)' }} />
                </button>
              );
            }
            if (item.isMore) {
              return (
                <button
                  key={item.id}
                  onClick={() => { setMoreOpen(!moreOpen); setQuickAddOpen(false); }}
                  className={`flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors duration-150 ${moreOpen ? 'bg-accent/8 text-accent' : 'text-muted-foreground'}`}
                >
                  <NavIcon size={19} />
                  <span className="text-[10px] font-700 leading-none">{item.label}</span>
                </button>
              );
            }
            const active = isRouteActive(item.href);
            const pending = isRoutePending(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors duration-150 ${
                  active ? 'bg-accent/8 text-accent' : 'text-muted-foreground'
                }`}
                onClick={(event) => {
                  void handleNavigationIntent(item.href, event);
                }}
                aria-current={active ? 'page' : undefined}
                aria-busy={pending ? 'true' : undefined}
              >
                {pending ? <Loader2 size={19} className="animate-spin" /> : <NavIcon size={19} />}
                <span className="text-[10px] font-700 leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

    </>
  );
}
