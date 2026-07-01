'use client';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Menu, X, Settings, LogOut, Shield, Sparkles, CircleHelp, ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Link from 'next/link';
import SearchField from '@/components/ui/SearchField';
import NotificationBell from '@/components/NotificationBell';
import { useQuickActions } from '@/components/quick-actions/QuickActionsContext';
import { fetchSubscriptionPlans } from '@/lib/subscription/client';
import type { PlanCode, PublicSubscriptionPlan, SubscriptionSummary } from '@/lib/subscription/types';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import UserAvatar from '@/components/ui/UserAvatar';

interface TopbarProps {
  onToggleSidebar: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
  const { t } = useTranslation(['portal', 'common']);
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [activePlans, setActivePlans] = useState<PublicSubscriptionPlan[]>([]);
  const { user, profile, signOut } = useAuth();
  const { summary: subscriptionSummary } = useSubscriptionSummary();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const quickActions = useQuickActions();
  const aiButtonLabel = t('topbar.smartEntry', { ns: 'portal' });
  const aiMobileLabel = t('topbar.smartEntryShort', { ns: 'portal', defaultValue: 'AI' });

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || t('topbar.userFallback', { ns: 'portal' });
  const isAdmin = user?.app_metadata?.role === 'admin';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setActivePlans([]);
      return;
    }

    fetchSubscriptionPlans()
      .then((plansPayload) => {
        if (cancelled) return;
        setActivePlans(plansPayload.plans.filter((plan) => plan.isActive));
      })
      .catch(() => {
        if (cancelled) return;
        setActivePlans([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const showUpgradePackage = useMemo(() => {
    if (!subscriptionSummary?.planCode) {
      return false;
    }

    const paidPlans = activePlans.filter((plan) => plan.planCode !== 'free_trial');
    if (paidPlans.length === 0) {
      return false;
    }

    const planRankByCode = new Map<PlanCode, number>();
    for (const plan of paidPlans) {
      const existingRank = planRankByCode.get(plan.planCode);
      if (typeof existingRank !== 'number' || plan.displayOrder > existingRank) {
        planRankByCode.set(plan.planCode, plan.displayOrder);
      }
    }

    const currentRank = subscriptionSummary.planCode
      ? subscriptionSummary.planCode === 'free_trial'
        ? Number.NEGATIVE_INFINITY
        : (planRankByCode.get(subscriptionSummary.planCode) ?? Number.NEGATIVE_INFINITY)
      : Number.NEGATIVE_INFINITY;

    return paidPlans.some((plan) => (planRankByCode.get(plan.planCode) ?? Number.NEGATIVE_INFINITY) > currentRank);
  }, [activePlans, subscriptionSummary]);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/sign-up-login');
      toast.success(t('topbar.signOutSuccess', { ns: 'portal' }));
    } catch {
      toast.error(t('topbar.signOutError', { ns: 'portal' }));
    }
  };

  return (
    <header
      className="sticky top-0 z-20 shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90"
    >
      <div className="page-shell flex min-h-[72px] w-full flex-wrap items-center gap-3 py-3 max-[480px]:min-h-[60px] max-[480px]:gap-1.5 max-[480px]:py-2 sm:gap-4 sm:py-3.5">
        {/* Mobile menu toggle */}
        <button
          onClick={onToggleSidebar}
          className="btn-ghost h-10 w-10 p-0 max-[480px]:flex max-[480px]:h-10 max-[480px]:w-10 max-[480px]:items-center max-[480px]:justify-center max-[480px]:rounded-xl max-[480px]:border max-[480px]:border-border/80 max-[480px]:bg-secondary/55 lg:hidden"
          aria-label={t('topbar.toggleMenu', { ns: 'portal' })}
        >
          <Menu size={20} className="max-[480px]:text-foreground" />
        </button>

        {/* Search */}
        <div className={`order-last basis-full transition-all duration-200 max-[480px]:pt-1 sm:order-none sm:basis-auto sm:flex-1 sm:pe-2 ${searchOpen ? 'flex' : 'hidden sm:flex'}`}>
          <SearchField
            placeholder={t('topbar.searchPlaceholder', { ns: 'portal' })}
            wrapperClassName="max-w-none sm:max-w-[28rem] lg:max-w-[34rem] xl:max-w-[40rem]"
            inputClassName="border-border/90 bg-secondary/60 max-[480px]:h-9"
          />
        </div>

        {/* Mobile search toggle */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="btn-ghost h-10 w-10 p-0 max-[480px]:flex max-[480px]:h-10 max-[480px]:w-10 max-[480px]:items-center max-[480px]:justify-center max-[480px]:rounded-xl max-[480px]:border max-[480px]:border-border/80 max-[480px]:bg-secondary/55 sm:hidden"
          aria-label={t('topbar.search', { ns: 'portal' })}
        >
          {searchOpen ? <X size={19} className="text-foreground" /> : <Search size={19} className="text-foreground" />}
        </button>

        <div className="ms-auto flex min-w-0 shrink-0 items-center gap-2 max-[480px]:gap-1.5 sm:gap-2.5">
          {/* AI Smart Entry button */}
          <button
            onClick={() => quickActions?.openQuickAction('smart_entry')}
            className="hidden h-10 min-w-[172px] items-center justify-center gap-2 rounded-full border border-purple-200/90 bg-[linear-gradient(180deg,rgba(139,92,246,0.16),rgba(139,92,246,0.08))] px-4 text-sm font-700 text-ai shadow-[0_18px_36px_-28px_rgba(139,92,246,0.95)] transition-all duration-150 hover:-translate-y-0.5 hover:border-purple-300 hover:bg-purple-100/90 hover:shadow-[0_22px_42px_-28px_rgba(139,92,246,0.95)] sm:inline-flex"
            aria-label={aiButtonLabel}
            title={t('topbar.smartEntryTitle', { ns: 'portal' })}
          >
            <Sparkles size={15} />
            <span>{aiButtonLabel}</span>
          </button>

          {/* Mobile AI button */}
          <button
            onClick={() => quickActions?.openQuickAction('smart_entry')}
            className="hidden h-10 items-center justify-center gap-1 rounded-full border border-accent/20 bg-accent/12 px-3 text-[12px] font-700 text-accent shadow-[0_14px_28px_-24px_rgba(20,184,166,0.9)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-accent/16 max-[480px]:inline-flex sm:hidden"
            aria-label={aiButtonLabel}
          >
            <Sparkles size={15} className="text-accent" />
            <span>{aiMobileLabel}</span>
          </button>

          {/* Language Switcher */}
          <LanguageSwitcher variant="compact" />

          <NotificationBell />

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex h-10 items-center gap-2 rounded-xl border border-transparent bg-transparent px-2.5 max-[480px]:h-10 max-[480px]:gap-1 max-[480px]:rounded-xl max-[480px]:px-1.5 hover:border-border hover:bg-secondary/50"
              aria-label={t('topbar.userMenu', { ns: 'portal' })}
              aria-expanded={userMenuOpen}
            >
              <UserAvatar
                fullName={displayName}
                email={user?.email}
                avatarUrl={profile?.avatar_url}
                className="h-7 w-7 text-xs max-[480px]:h-7 max-[480px]:w-7"
                textClassName="text-xs"
                iconClassName="h-3.5 w-3.5"
              />
              <span className="hidden max-w-[120px] truncate text-sm font-600 text-foreground lg:block">{displayName}</span>
              <ChevronDown size={14} className={`hidden text-muted-foreground transition-transform duration-150 lg:block ${userMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {userMenuOpen && (
              <div className="absolute end-0 top-full z-50 mt-2 w-52 max-w-[calc(100vw-1rem)] scale-in rounded-xl border border-border bg-card py-1 shadow-card-lg">
                <div className="flex items-center gap-2.5 border-b border-border px-3 py-2">
                  <UserAvatar
                    fullName={displayName}
                    email={user?.email}
                    avatarUrl={profile?.avatar_url}
                    className="h-9 w-9 text-sm"
                    textClassName="text-sm"
                    iconClassName="h-4 w-4"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-600 text-foreground">{displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                </div>
                {showUpgradePackage ? (
                  <Link
                    href="/settings/subscription"
                    className="mx-2 my-1 flex items-center gap-2.5 rounded-lg bg-accent/10 px-3 py-2 text-sm font-600 text-accent transition-colors hover:bg-accent/15"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <ArrowUpRight size={14} className="shrink-0" />
                    {t('topbar.upgradePackage', { ns: 'portal' })}
                  </Link>
                ) : null}
                <Link
                  href="/settings"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <Settings size={14} className="text-muted-foreground" />
                  {t('topbar.settings', { ns: 'portal' })}
                </Link>
                <Link
                  href="/faqs"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <CircleHelp size={14} className="text-muted-foreground" />
                  {t('topbar.faqs', { ns: 'portal' })}
                </Link>
                {subscriptionSummary?.entitlements?.aiHistory ? (
                  <Link
                    href="/ai-history"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Sparkles size={14} className="text-muted-foreground" />
                    {t('topbar.aiHistory', { ns: 'portal' })}
                  </Link>
                ) : null}
                {isAdmin && (
                  <Link
                    href="/admin"
                    className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                    onClick={() => setUserMenuOpen(false)}
                  >
                    <Shield size={14} className="text-muted-foreground" />
                    {t('topbar.adminPortal', { ns: 'portal' })}
                  </Link>
                )}
                <hr className="my-1 border-border" />
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-negative transition-colors hover:bg-negative-soft"
                >
                  <LogOut size={14} />
                  {t('topbar.signOut', { ns: 'portal' })}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
