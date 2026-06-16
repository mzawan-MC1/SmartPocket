'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, ArrowLeftRight, Plus, PieChart, MoreHorizontal, TrendingUp, TrendingDown, Repeat, Wallet, ArrowUpDown, Tag, BarChart3, Users, RotateCcw, DollarSign, Sparkles, Mic, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePendingNavigation } from '@/lib/pending-navigation';



interface BottomNavProps {
  activeRoute: string;
}

export default function BottomNav({ activeRoute }: BottomNavProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState<'text' | 'voice'>('text');
  const { t } = useTranslation(['common', 'dashboard']);
  const { isRouteActive, isRoutePending, handleNavigationIntent } = usePendingNavigation(activeRoute);

  const navItems = [
    { id: 'bottom-dashboard', label: t('nav.dashboard', { ns: 'common' }), icon: LayoutDashboard, href: '/dashboard' },
    { id: 'bottom-transactions', label: t('nav.transactions', { ns: 'common' }), icon: ArrowLeftRight, href: '/transactions' },
    { id: 'bottom-add', label: t('actions.add', { ns: 'common' }), icon: Plus, href: '#', isAction: true },
    { id: 'bottom-budgets', label: t('nav.budgets', { ns: 'common' }), icon: PieChart, href: '/budgets' },
    { id: 'bottom-more', label: 'More', icon: MoreHorizontal, href: '#', isMore: true },
  ];

  const quickActions = [
    { id: 'qa-expense', label: 'Expense', icon: TrendingDown, color: 'bg-negative-soft text-negative border border-negative/20', href: '/transactions' },
    { id: 'qa-income', label: 'Income', icon: TrendingUp, color: 'bg-positive-soft text-positive border border-positive/20', href: '/transactions' },
    { id: 'qa-transfer', label: 'Transfer', icon: ArrowUpDown, color: 'bg-info-soft text-info border border-info/20', href: '/transfers' },
    { id: 'qa-account', label: 'Account', icon: Wallet, color: 'bg-warning-soft text-warning border border-warning/20', href: '/financial-accounts' },
    { id: 'qa-person', label: 'Person', icon: Users, color: 'bg-accent/10 text-accent border border-accent/20', href: '/people/new' },
    { id: 'qa-reimb', label: 'Reimbursement', icon: RotateCcw, color: 'bg-purple-100 text-purple-700 border border-purple-200', href: '/reimbursements' },
  ];

  const moreItems = [
    { id: 'more-transfers', label: 'Transfers', icon: ArrowUpDown, href: '/transfers' },
    { id: 'more-recurring', label: 'Recurring', icon: Repeat, href: '/recurring' },
    { id: 'more-categories', label: 'Categories', icon: Tag, href: '/categories' },
    { id: 'more-reports', label: 'Reports', icon: BarChart3, href: '/reports' },
    { id: 'more-accounts', label: 'Accounts', icon: Wallet, href: '/financial-accounts' },
    { id: 'more-people', label: 'People', icon: Users, href: '/people' },
    { id: 'more-reimbursements', label: 'Reimbursements', icon: RotateCcw, href: '/reimbursements' },
    { id: 'more-settlements', label: 'Settlements', icon: DollarSign, href: '/settlements' },
  ];

  return (
    <>
      {(quickAddOpen || moreOpen) && (
        <div
          className="fixed inset-0 bg-foreground/20 backdrop-blur-sm z-40 fade-in"
          onClick={() => { setQuickAddOpen(false); setMoreOpen(false); }}
        />
      )}

      {quickAddOpen && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 slide-up">
          <div className="card-elevated-md p-4 min-w-[280px] max-w-[92vw]">
            <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3 text-center">Quick Add</p>
            {/* AI entry buttons */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                onClick={() => { setAiMode('text'); setAiOpen(true); setQuickAddOpen(false); }}
                className="flex flex-col items-center gap-2 p-3 rounded-xl text-sm font-600 bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-all duration-150"
              >
                <Sparkles size={20} />
                <span className="text-xs">Smart Entry</span>
              </button>
              <button
                onClick={() => { setAiMode('voice'); setAiOpen(true); setQuickAddOpen(false); }}
                className="flex flex-col items-center gap-2 p-3 rounded-xl text-sm font-600 bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-all duration-150"
              >
                <Mic size={20} />
                <span className="text-xs">Voice Entry</span>
              </button>
            </div>
            <div className="border-t border-border pt-3">
              <div className="grid grid-cols-2 gap-2">
                {quickActions.map((action) => {
                  const ActionIcon = action.icon;
                  const pending = isRoutePending(action.href);
                  return (
                    <Link
                      key={action.id}
                      href={action.href}
                      className={`flex flex-col items-center gap-2 p-3 rounded-xl text-sm font-600 transition-all duration-150 hover:scale-105 active:scale-95 ${action.color}`}
                      onClick={(event) => {
                        const shouldNavigate = handleNavigationIntent(action.href, event);
                        if (shouldNavigate) {
                          setQuickAddOpen(false);
                        }
                      }}
                      aria-busy={pending ? 'true' : undefined}
                    >
                      {pending ? <Loader2 size={20} className="animate-spin" /> : <ActionIcon size={20} />}
                      <span className="text-xs">{action.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {moreOpen && (
        <div className="fixed bottom-24 right-4 z-50 slide-up">
          <div className="card-elevated-md p-3 min-w-[200px] max-w-[88vw]">
            <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-2 px-2">More</p>
            {moreItems.map((item) => {
              const ItemIcon = item.icon;
              const active = isRouteActive(item.href);
              const pending = isRoutePending(item.href);
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-500 transition-colors ${
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
                  {item.label}
                </Link>
              );
            })}
            <div className="border-t border-border mt-2 pt-2">
              <Link
                href="/ai-history"
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-500 transition-colors ${
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
                AI History
              </Link>
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 bg-card/98 backdrop-blur border-t border-border z-30 safe-area-bottom shadow-[0_-6px_24px_rgba(15,52,96,0.08)]"
        style={{ height: 'var(--bottom-nav-height)' }}
      >
        <div className="flex items-center justify-around h-full px-2 pt-1">
          {navItems.map((item) => {
            const NavIcon = item.icon;
            if (item.isAction) {
              return (
                <button
                  key={item.id}
                  onClick={() => { setQuickAddOpen(!quickAddOpen); setMoreOpen(false); }}
                  className="relative -top-5 h-[3.75rem] w-[3.75rem] rounded-full gradient-teal flex items-center justify-center shadow-teal-glow transition-all duration-200 active:scale-95 border-4 border-background"
                  aria-label="Quick add"
                >
                  <Plus size={24} className="text-white transition-transform duration-200" style={{ transform: quickAddOpen ? 'rotate(45deg)' : 'rotate(0deg)' }} />
                </button>
              );
            }
            if (item.isMore) {
              return (
                <button
                  key={item.id}
                  onClick={() => { setMoreOpen(!moreOpen); setQuickAddOpen(false); }}
                  className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors duration-150 min-w-[56px] ${moreOpen ? 'text-accent bg-accent/8' : 'text-muted-foreground'}`}
                >
                  <NavIcon size={20} />
                  <span className="text-[10px] font-600">{item.label}</span>
                </button>
              );
            }
            const active = isRouteActive(item.href);
            const pending = isRoutePending(item.href);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors duration-150 min-w-[56px] ${
                  active ? 'text-accent bg-accent/8' : 'text-muted-foreground'
                }`}
                onClick={(event) => {
                  void handleNavigationIntent(item.href, event);
                }}
                aria-current={active ? 'page' : undefined}
                aria-busy={pending ? 'true' : undefined}
              >
                {pending ? <Loader2 size={20} className="animate-spin" /> : <NavIcon size={20} />}
                <span className="text-[11px] font-700">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* AI Assistant Modal */}
      {aiOpen && (
        <React.Suspense fallback={null}>
          <AIAssistantModalLazy
            onClose={() => setAiOpen(false)}
            defaultMode={aiMode}
          />
        </React.Suspense>
      )}
    </>
  );
}

const AIAssistantModalLazy = React.lazy(() => import('@/components/ai/AIAssistantModal'));
