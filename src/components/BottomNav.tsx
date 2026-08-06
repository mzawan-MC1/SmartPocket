'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, ArrowLeftRight, Plus, PieChart, MoreHorizontal, TrendingUp, TrendingDown, Repeat, Wallet, ArrowUpDown, Tag, BarChart3, Users, RotateCcw, DollarSign, Sparkles, Mic, Loader2, X, ShoppingBag, CreditCard, LifeBuoy, CircleHelp, Home, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePendingNavigation } from '@/lib/pending-navigation';
import { useQuickActions, type QuickActionId } from '@/components/quick-actions/QuickActionsContext';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import { getSubscriptionFeatureAccess } from '@/lib/subscription/entitlements';
import type { SubscriptionFeatureAccessState } from '@/lib/subscription/entitlements';
interface BottomNavProps {
  activeRoute: string;
}

export default function BottomNav({ activeRoute }: BottomNavProps) {
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { t } = useTranslation(['common', 'portal']);
  const { isRouteActive, isRoutePending, handleNavigationIntent } = usePendingNavigation(activeRoute);
  const quickActionsController = useQuickActions();
  const { summary, loading: subscriptionLoading } = useSubscriptionSummary();
  const textAiAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'text_ai');
  const voiceAiAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'voice_ai');
  const aiHistoryAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'ai_history');
  const managedPeopleAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'managed_people');
  const sharedSpacesAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'shared_spaces');
  const standardReportsAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'standard_reports');
  const canUseTextAi = textAiAccess === 'allowed';
  const canUseVoiceAi = voiceAiAccess === 'allowed';
  const canUseAiHistory = aiHistoryAccess === 'allowed';
  const canUseManagedPeople = managedPeopleAccess === 'allowed';
  const canUseSharedSpaces = sharedSpacesAccess === 'allowed';
  const canUseStandardReports = standardReportsAccess === 'allowed';
  const shouldShowRestrictedUi = (state: SubscriptionFeatureAccessState) => state === 'restricted';
  const getRestrictionBadgeLabel = (badge: 'upgrade' | 'family') => (
    badge === 'family'
      ? t('featureGate.badges.family', { ns: 'portal' })
      : t('featureGate.badges.upgrade', { ns: 'portal' })
  );

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
    ...(canUseManagedPeople
      ? [
          { id: 'qa-person', label: t('bottomNav.person', { ns: 'portal' }), icon: Users, color: 'bg-accent/10 text-accent border border-accent/20', action: 'person' as QuickActionId },
          { id: 'qa-reimb', label: t('bottomNav.reimbursement', { ns: 'portal' }), icon: RotateCcw, color: 'bg-purple-100 text-purple-700 border border-purple-200', action: 'reimbursement' as QuickActionId },
        ]
      : []),
  ];

  const quickAddTiles = [
    ...(canUseTextAi
      ? [{
          id: 'qa-smart-entry',
          label: t('bottomNav.smartEntry', { ns: 'portal' }),
          icon: Sparkles,
          color: 'border-cyan-200/80 bg-[linear-gradient(180deg,#eefbff,#f4fbff)] text-cyan-700 shadow-[0_14px_28px_-24px_rgba(6,182,212,0.42)]',
          onClick: () => quickActionsController?.openQuickAction('smart_entry'),
        }]
      : []),
    ...(canUseVoiceAi
      ? [{
          id: 'qa-voice-entry',
          label: t('bottomNav.voiceEntry', { ns: 'portal' }),
          icon: Mic,
          color: 'border-sky-200/80 bg-[linear-gradient(180deg,#eff6ff,#f8fbff)] text-sky-700 shadow-[0_14px_28px_-24px_rgba(37,99,235,0.32)]',
          onClick: () => quickActionsController?.openQuickAction('voice_entry'),
        }]
      : []),
    ...quickActions.map((action) => ({
      id: action.id,
      label: action.label,
      icon: action.icon,
      color: action.color,
      onClick: () => quickActionsController?.openQuickAction(action.action),
    })),
  ];

  const moreItems: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    href: string;
    restrictionBadge?: 'upgrade' | 'family';
  }> = [
    { id: 'more-transfers', label: t('bottomNav.transfers', { ns: 'portal' }), icon: ArrowUpDown, href: '/transfers' },
    { id: 'more-recurring', label: t('bottomNav.recurring', { ns: 'portal' }), icon: Repeat, href: '/recurring' },
    { id: 'more-personal-subscriptions', label: t('bottomNav.personalSubscriptions', { ns: 'portal' }), icon: CreditCard, href: '/personal-subscriptions' },
    { id: 'more-categories', label: t('bottomNav.categories', { ns: 'portal' }), icon: Tag, href: '/categories' },
    {
      id: 'more-reports',
      label: t('bottomNav.reports', { ns: 'portal' }),
      icon: BarChart3,
      href: '/reports',
      restrictionBadge: shouldShowRestrictedUi(standardReportsAccess) ? 'upgrade' : undefined,
    },
    ...(canUseStandardReports
      ? [{ id: 'more-item-insights', label: t('itemInsights.title', { ns: 'portal', defaultValue: 'Item Insights' }), icon: ShoppingBag, href: '/reports/item-insights' }]
      : []),
    { id: 'more-accounts', label: t('bottomNav.accounts', { ns: 'portal' }), icon: Wallet, href: '/financial-accounts' },
    {
      id: 'more-ai-history',
      label: t('bottomNav.aiHistory', { ns: 'portal' }),
      icon: Sparkles,
      href: '/ai-history',
      restrictionBadge: shouldShowRestrictedUi(aiHistoryAccess) ? 'upgrade' : undefined,
    },
    {
      id: 'more-people',
      label: t('bottomNav.people', { ns: 'portal' }),
      icon: Users,
      href: '/people',
      restrictionBadge: shouldShowRestrictedUi(managedPeopleAccess) ? 'family' : undefined,
    },
    {
      id: 'more-spaces',
      label: t('bottomNav.spaces', { ns: 'portal' }),
      icon: Home,
      href: '/spaces',
      restrictionBadge: shouldShowRestrictedUi(sharedSpacesAccess) ? 'family' : undefined,
    },
    { id: 'more-faqs', label: t('bottomNav.faqs', { ns: 'portal', defaultValue: 'FAQs' }), icon: CircleHelp, href: '/faqs' },
    { id: 'more-support', label: t('bottomNav.support', { ns: 'portal', defaultValue: 'Support' }), icon: LifeBuoy, href: '/support' },
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
          className="fixed inset-0 z-40 bg-slate-900/18 fade-in"
          onClick={() => { setQuickAddOpen(false); setMoreOpen(false); }}
        />
      )}

      {quickAddOpen && (
        <div className="fixed inset-x-0 bottom-[calc(4.35rem+env(safe-area-inset-bottom)+0.4rem)] z-50 px-3 pb-[max(env(safe-area-inset-bottom),0.35rem)] lg:hidden">
          <div className="mx-auto w-full max-w-sm slide-up overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_18px_36px_-24px_rgba(15,23,42,0.24)]">
            <div className="border-b border-slate-200/80 px-4 py-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-800 text-foreground">{t('bottomNav.quickAdd', { ns: 'portal' })}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t('aiUsage.mobileFeature.description', { ns: 'portal' })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setQuickAddOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50"
                  aria-label={t('bottomNav.closeQuickAdd', { ns: 'portal' })}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="max-h-[min(58vh,29rem)] overflow-y-auto px-3.5 py-3.5 scrollbar-thin">
              <div className="grid grid-cols-2 gap-2.5">
                {quickAddTiles.map((tile) => {
                  const TileIcon = tile.icon;
                  return (
                    <button
                      key={tile.id}
                      type="button"
                      onClick={() => {
                        tile.onClick();
                        setQuickAddOpen(false);
                      }}
                      className={`flex min-h-[88px] flex-col items-start justify-between rounded-[22px] border px-3 py-3 text-left transition-colors duration-150 active:bg-slate-50 ${tile.color}`}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/90 shadow-[0_10px_20px_-18px_rgba(15,23,42,0.35)]">
                        <TileIcon size={17} />
                      </div>
                      <span className="text-[13px] font-800 leading-4 text-current">{tile.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {moreOpen && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.25rem)] z-50 px-3 pb-1 lg:hidden">
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
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate">{item.label}</span>
                      {item.restrictionBadge ? (
                        <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-800 uppercase tracking-[0.12em] ${
                          item.restrictionBadge === 'family'
                            ? 'border-violet-200 bg-violet-50 text-violet-700'
                            : 'border-border/80 bg-white/80 text-muted-foreground'
                        }`}>
                          <Lock size={10} />
                          {getRestrictionBadgeLabel(item.restrictionBadge)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200/80 bg-white safe-area-bottom shadow-[0_-8px_24px_rgba(15,23,42,0.08)]"
        style={{ height: 'calc(4.35rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex h-full items-center justify-around px-2 pt-1.5">
          {navItems.map((item) => {
            const NavIcon = item.icon;
            if (item.isAction) {
              return (
                <button
                  key={item.id}
                  onClick={() => { setQuickAddOpen(!quickAddOpen); setMoreOpen(false); }}
                  className={`relative -top-4 flex h-[54px] w-[54px] items-center justify-center rounded-full border-[3px] border-white transition-all duration-200 active:scale-95 ${
                    quickAddOpen
                      ? 'bg-[linear-gradient(135deg,#0f3cbf,#1d4ed8)] shadow-[0_20px_42px_-20px_rgba(37,99,235,0.82)]'
                      : 'bg-[linear-gradient(135deg,#1d4ed8,#38bdf8)] shadow-[0_18px_38px_-22px_rgba(37,99,235,0.75)]'
                  }`}
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
                  className={`flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-2 py-2 transition-colors duration-150 ${moreOpen ? 'bg-[linear-gradient(180deg,rgba(37,99,235,0.12),rgba(37,99,235,0.02))] text-[#1d4ed8] shadow-[0_10px_24px_-20px_rgba(37,99,235,0.35)]' : 'text-slate-500'}`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${moreOpen ? 'bg-white shadow-sm' : 'bg-transparent'}`}>
                    <NavIcon size={18} />
                  </span>
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
                className={`flex min-w-[64px] flex-col items-center gap-1 rounded-2xl px-2 py-2 transition-colors duration-150 ${
                  active ? 'bg-[linear-gradient(180deg,rgba(37,99,235,0.12),rgba(37,99,235,0.02))] text-[#1d4ed8] shadow-[0_10px_24px_-20px_rgba(37,99,235,0.35)]' : 'text-slate-500'
                }`}
                onClick={(event) => {
                  void handleNavigationIntent(item.href, event);
                }}
                aria-current={active ? 'page' : undefined}
                aria-busy={pending ? 'true' : undefined}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${active ? 'bg-white shadow-sm' : 'bg-transparent'}`}>
                  {pending ? <Loader2 size={18} className="animate-spin" /> : <NavIcon size={18} />}
                </span>
                <span className="text-[10px] font-700 leading-none">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

    </>
  );
}
