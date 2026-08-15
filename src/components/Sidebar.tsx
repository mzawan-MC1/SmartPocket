'use client';
import React from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import AppImage from '@/components/ui/AppImage';
import AppIcon from '@/components/ui/AppIcon';
import { LayoutDashboard, ArrowLeftRight, Wallet, PieChart, BarChart3, ChevronDown, ChevronLeft, ChevronRight, LogOut, Repeat, Tag, ArrowUpDown, Users, RotateCcw, DollarSign, Home, History, Loader2, ShoppingBag, CreditCard, LifeBuoy, CircleHelp, BriefcaseBusiness, X, Lock, Calculator, Sparkles, TrendingUp, RefreshCw, Settings, Target } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { usePendingNavigation } from '@/lib/pending-navigation';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { getSettingsAssetUrl, shouldShowBrandTextBesideLogo } from '@/lib/platform-settings';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import UserAvatar from '@/components/ui/UserAvatar';
import { getSubscriptionFeatureAccess } from '@/lib/subscription/entitlements';
import type { SubscriptionFeatureAccessState } from '@/lib/subscription/entitlements';
import { useQuickActions } from '@/components/quick-actions/QuickActionsContext';


interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeRoute: string;
  onNavigateItem?: () => void;
  isMobileDrawer?: boolean;
}

type NavItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  href: string;
  restrictionBadge?: 'upgrade' | 'family';
  newBadge?: boolean;
};

type SectionHeading = {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

export default function Sidebar({ collapsed, onToggle, activeRoute, onNavigateItem, isMobileDrawer = false }: SidebarProps) {
  const { dir } = useLanguage();
  const isRTL = dir === 'rtl';
  const { t } = useTranslation(['common', 'portal']);
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const { pathname, isRouteActive, isRoutePending, handleNavigationIntent } = usePendingNavigation(activeRoute);
  const { branding, updatedAt } = usePlatformSettings();
  const { summary, loading: subscriptionLoading } = useSubscriptionSummary();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);
  const collapsedLogoSrc = React.useMemo(() => {
    const primaryLogoUrl = branding.logoUrl.trim();
    const compactLogoUrl = branding.compactLogoUrl.trim();

    if (!compactLogoUrl || compactLogoUrl === primaryLogoUrl) {
      return undefined;
    }

    return getSettingsAssetUrl(compactLogoUrl, updatedAt);
  }, [branding.compactLogoUrl, branding.logoUrl, updatedAt]);
  const isReportsRoute = pathname === '/reports' || pathname.startsWith('/reports/');
  const [reportsExpanded, setReportsExpanded] = React.useState(isReportsRoute);
  const aiHistoryAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'ai_history');
  const managedPeopleAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'managed_people');
  const sharedSpacesAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'shared_spaces');
  const standardReportsAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'standard_reports');
  const savingsAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'savings');
  const investmentsAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'investments');
  const exchangeRatesAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'exchange_rates');
  const calculatorAccess = getSubscriptionFeatureAccess(summary, subscriptionLoading, 'calculator');
  const canUseAiHistory = aiHistoryAccess === 'allowed';
  const canUseManagedPeople = managedPeopleAccess === 'allowed';
  const canUseSharedSpaces = sharedSpacesAccess === 'allowed';
  const canUseStandardReports = standardReportsAccess === 'allowed';
  const canUseSavings = savingsAccess === 'allowed';
  const canUseInvestments = investmentsAccess === 'allowed';
  const canUseExchangeRates = exchangeRatesAccess === 'allowed';
  const canUseCalculator = calculatorAccess === 'allowed';
  const shouldShowRestrictedUi = (state: SubscriptionFeatureAccessState) => state === 'restricted';
  const getRestrictionBadgeLabel = React.useCallback((badge: 'upgrade' | 'family') => (
    badge === 'family'
      ? t('featureGate.badges.family', { ns: 'portal', defaultValue: 'Family' })
      : t('featureGate.badges.upgrade', { ns: 'portal', defaultValue: 'Upgrade' })
  ), [t]);
  const quickActions = useQuickActions();

  React.useEffect(() => {
    if (isReportsRoute) {
      setReportsExpanded(true);
    }
  }, [isReportsRoute]);

  const dashboardItem: NavItem = {
    id: 'nav-dashboard',
    label: t('sidebar.nav.dashboard', { ns: 'portal', defaultValue: 'Dashboard' }),
    icon: LayoutDashboard,
    href: '/dashboard',
  };

  const settingsItem: NavItem = {
    id: 'nav-settings',
    label: t('sidebar.nav.settings', { ns: 'portal', defaultValue: 'Settings' }),
    icon: Settings,
    href: '/settings',
  };

  const helpSupportItem: NavItem = {
    id: 'nav-help-support',
    label: t('sidebar.nav.helpSupport', { ns: 'portal', defaultValue: 'Help & Support' }),
    icon: LifeBuoy,
    href: '/help',
  };

  const navSections = [
    {
      heading: {
        label: t('sidebar.sections.money', { ns: 'portal', defaultValue: 'MONEY' }),
        icon: Wallet,
      },
      items: [
        { id: 'nav-transactions', label: t('sidebar.nav.moneyInOut', { ns: 'portal', defaultValue: 'Money In & Out' }), icon: ArrowLeftRight, href: '/transactions' },
        { id: 'nav-accounts', label: t('nav.accounts', { defaultValue: 'Accounts' }), icon: Wallet, href: '/financial-accounts' },
        { id: 'nav-transfers', label: t('sidebar.nav.transfers', { ns: 'portal', defaultValue: 'Transfers' }), icon: ArrowUpDown, href: '/transfers' },
        { id: 'nav-budgets', label: t('nav.budgets', { defaultValue: 'Budgets' }), icon: PieChart, href: '/budgets' },
        { id: 'nav-recurring', label: t('sidebar.nav.scheduledPayments', { ns: 'portal', defaultValue: 'Scheduled Payments' }), icon: Repeat, href: '/recurring' },
      ],
    },
    {
      heading: {
        label: t('sidebar.sections.manage', { ns: 'portal', defaultValue: 'MANAGE' }),
        icon: BriefcaseBusiness,
      },
      items: [
        { id: 'nav-personal-subscriptions', label: t('sidebar.nav.subscriptions', { ns: 'portal', defaultValue: 'Subscriptions' }), icon: CreditCard, href: '/personal-subscriptions' },
        { id: 'nav-settlements', label: t('sidebar.nav.billsReminders', { ns: 'portal', defaultValue: 'Bills & Reminders' }), icon: DollarSign, href: '/settlements' },
        {
          id: 'nav-people',
          label: t('sidebar.nav.beneficiaries', { ns: 'portal', defaultValue: 'Beneficiaries' }),
          icon: Users,
          href: '/people',
          restrictionBadge: shouldShowRestrictedUi(managedPeopleAccess) ? ('family' as const) : undefined,
        },
        { id: 'nav-categories', label: t('sidebar.nav.tagsCategories', { ns: 'portal', defaultValue: 'Tags & Categories' }), icon: Tag, href: '/categories' },
        { id: 'nav-reimbursements', label: t('sidebar.nav.reimbursements', { ns: 'portal', defaultValue: 'Reimbursements' }), icon: RotateCcw, href: '/reimbursements' },
        {
          id: 'nav-spaces',
          label: t('sidebar.nav.spaces', { ns: 'portal', defaultValue: 'Spaces' }),
          icon: Home,
          href: '/spaces',
          restrictionBadge: shouldShowRestrictedUi(sharedSpacesAccess) ? ('family' as const) : undefined,
        },
      ],
    },
    {
      heading: {
        label: t('sidebar.sections.investGrow', { ns: 'portal', defaultValue: 'INVEST & GROW' }),
        icon: TrendingUp,
      },
      items: [
        {
          id: 'nav-savings',
          label: t('sidebar.nav.savings', { ns: 'portal', defaultValue: 'Savings' }),
          icon: Target,
          href: '/savings',
          restrictionBadge: shouldShowRestrictedUi(savingsAccess) ? ('upgrade' as const) : undefined,
          newBadge: !shouldShowRestrictedUi(savingsAccess),
        },
        {
          id: 'nav-investments',
          label: t('sidebar.nav.investments', { ns: 'portal', defaultValue: 'Investments' }),
          icon: TrendingUp,
          href: '/investments',
          restrictionBadge: shouldShowRestrictedUi(investmentsAccess) ? ('upgrade' as const) : undefined,
          newBadge: !shouldShowRestrictedUi(investmentsAccess),
        },
      ],
    },
    {
      heading: {
        label: t('sidebar.sections.tools', { ns: 'portal', defaultValue: 'TOOLS' }),
        icon: Sparkles,
      },
      items: [
        { id: 'nav-smart-ai', label: t('sidebar.nav.smartAi', { ns: 'portal', defaultValue: 'Smart AI Assistant' }), icon: Sparkles, href: '#' },
        {
          id: 'nav-exchange-rates',
          label: t('sidebar.nav.exchangeRates', { ns: 'portal', defaultValue: 'Exchange Rates' }),
          icon: RefreshCw,
          href: '/exchange-rates',
          restrictionBadge: shouldShowRestrictedUi(exchangeRatesAccess) ? ('upgrade' as const) : undefined,
          newBadge: !shouldShowRestrictedUi(exchangeRatesAccess),
        },
        {
          id: 'nav-calculator',
          label: t('sidebar.nav.calculator', { ns: 'portal', defaultValue: 'Calculator' }),
          icon: Calculator,
          href: '/calculator',
          restrictionBadge: shouldShowRestrictedUi(calculatorAccess) ? ('upgrade' as const) : undefined,
          newBadge: !shouldShowRestrictedUi(calculatorAccess),
        },
      ],
    },
    {
      heading: {
        label: t('sidebar.sections.reports', { ns: 'portal', defaultValue: 'REPORTS' }),
        icon: BarChart3,
      },
      items: [
        {
          id: 'nav-ai-history',
          label: t('sidebar.nav.aiHistory', { ns: 'portal', defaultValue: 'AI History' }),
          icon: History,
          href: '/ai-history',
          restrictionBadge: shouldShowRestrictedUi(aiHistoryAccess) ? ('upgrade' as const) : undefined,
        },
      ],
    },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/sign-up-login');
      toast.success(t('topbar.signOutSuccess', { ns: 'portal', defaultValue: 'Signed out successfully.' }));
    } catch {
      toast.error(t('topbar.signOutError', { ns: 'portal', defaultValue: 'Failed to sign out.' }));
    }
  };

  // For RTL: toggle button appears on left side
  const ToggleIcon = isRTL
    ? (collapsed ? ChevronLeft : ChevronRight)
    : (collapsed ? ChevronRight : ChevronLeft);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || t('topbar.userFallback', { ns: 'portal', defaultValue: 'User' });
  const displayEmail = user?.email || '';

  const reportsOverviewItem: NavItem = {
    id: 'nav-reports-overview',
    label: t('reports.pageTitle', { ns: 'portal', defaultValue: 'Reports' }),
    icon: BarChart3,
    href: '/reports',
  };

  const itemInsightsItem: NavItem = {
    id: 'nav-item-insights',
    label: t('itemInsights.title', { ns: 'portal', defaultValue: 'Item Insights' }),
    icon: ShoppingBag,
    href: '/reports/item-insights',
  };

  const isExactRouteActive = (href: string) => pathname === href;

  const renderNavItem = (item: NavItem, compact = false, activeOverride?: boolean) => {
    const Icon = item.icon;
    const active = typeof activeOverride === 'boolean' ? activeOverride : isRouteActive(item.href);
    const pending = isRoutePending(item.href);
    const itemIsRestricted = Boolean(item.restrictionBadge);
    const restrictionBadgeLabel = itemIsRestricted && item.restrictionBadge
      ? getRestrictionBadgeLabel(item.restrictionBadge)
      : null;
    const tooltipLabel = restrictionBadgeLabel
      ? t('sidebar.lockedTooltip', {
          ns: 'portal',
          label: item.label,
          restriction: restrictionBadgeLabel,
          defaultValue: '{{label}} · {{restriction}}',
        })
      : item.label;
    const isSmartAiItem = item.id === 'nav-smart-ai';
    const hasNewBadge = Boolean(item.newBadge) && !itemIsRestricted;

    return (
      <li key={item.id}>
        <Link
          href={item.href}
          onClick={(event) => {
            if (isSmartAiItem) {
              event.preventDefault();
              if (quickActions) {
                quickActions.openQuickAction('smart_entry');
              } else {
                console.error('[Sidebar] Smart AI Assistant requires QuickActionsProvider.');
                toast.error(t('sidebar.errors.smartAiUnavailable', {
                  ns: 'portal',
                  defaultValue: 'Smart AI Assistant temporarily unavailable',
                }));
              }
              onNavigateItem?.();
              return;
            }
            const shouldNavigate = handleNavigationIntent(item.href, event);
            if (shouldNavigate) {
              onNavigateItem?.();
            }
          }}
          className={`group relative flex items-center gap-2.5 overflow-hidden rounded-2xl border text-sm font-600 transition-all duration-150 ${
            active
              ? 'border-cyan-200/70 bg-cyan-50 text-cyan-700 shadow-sm'
              : itemIsRestricted
                ? 'border-border/80 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/35 hover:text-foreground'
                : 'border-transparent text-muted-foreground hover:border-border/80 hover:bg-muted/45 hover:text-foreground'
          } ${
            collapsed
              ? 'mx-auto h-10 w-10 justify-center p-0'
              : isMobileDrawer
                ? 'px-3 py-2.5'
                : 'px-2.5 py-2 text-[13px]'
          } ${compact && !collapsed ? 'px-3 py-2.5' : ''}`}
          aria-current={active ? 'page' : undefined}
          aria-busy={pending ? 'true' : undefined}
          title={collapsed ? tooltipLabel : undefined}
        >
          <span className={`flex flex-shrink-0 items-center justify-center rounded-lg ${
            active ? 'bg-white text-cyan-600 ring-1 ring-cyan-100' : 'bg-muted/65 text-muted-foreground group-hover:bg-card group-hover:text-foreground'
          } ${collapsed ? 'h-9 w-9' : isMobileDrawer ? 'h-8 w-8' : 'h-7 w-7'}`}>
            <Icon size={collapsed ? 19 : isMobileDrawer ? 17 : 15} />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">{item.label}</span>
              {restrictionBadgeLabel ? (
                <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-800 uppercase tracking-[0.12em] ${
                  item.restrictionBadge === 'family'
                    ? 'border-violet-200 bg-violet-50 text-violet-700'
                    : 'border-border/80 bg-white/80 text-muted-foreground'
                }`}>
                  <Lock size={10} />
                  {restrictionBadgeLabel}
                </span>
              ) : null}
              {hasNewBadge ? (
                <span className="inline-flex flex-shrink-0 items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-800 uppercase tracking-[0.14em] text-emerald-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]">
                  {t('sidebar.badges.new', { ns: 'portal', defaultValue: 'New' })}
                </span>
              ) : null}
              {pending ? <Loader2 size={13} className="animate-spin flex-shrink-0 text-accent" /> : null}
            </span>
          )}
          {collapsed && pending ? (
            <span className="absolute end-1 top-1 h-2 w-2 rounded-full bg-accent ring-1 ring-white z-10" />
          ) : null}
          {collapsed && restrictionBadgeLabel ? (
            <span className="absolute end-0 top-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-muted-foreground ring-1 ring-border/90 z-10">
              <Lock size={9} />
            </span>
          ) : null}
          {collapsed && hasNewBadge ? (
            <span className="absolute end-0 top-0 z-10 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card shadow-[0_0_0_1px_rgba(16,185,129,0.35)]" />
          ) : null}
          {collapsed && (
            <span className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-500 text-card opacity-0 shadow-card-md transition-opacity duration-150 group-hover:opacity-100 ${isRTL ? 'right-full me-3' : 'left-full ms-3'}`}>
              {tooltipLabel}
            </span>
          )}
        </Link>
      </li>
    );
  };

  const renderSectionHeading = (heading: SectionHeading) => {
    if (collapsed) {
      return null;
    }

    if (isMobileDrawer) {
      return (
        <p className="px-3 text-[10px] font-800 uppercase tracking-[0.16em] text-muted-foreground/85">
          {heading.label}
        </p>
      );
    }

    const HeadingIcon = heading.icon;

    return (
      <div className="px-2.5 lg:mb-1.5 lg:pt-3.5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-5.5 w-5.5 items-center justify-center rounded-lg bg-cyan-50/95 text-cyan-700/85 ring-1 ring-cyan-100/90">
            <HeadingIcon size={13} />
          </span>
          <span className="text-[13.5px] font-800 uppercase tracking-[0.22em] text-cyan-900/78">
            {heading.label}
          </span>
          <span className="mt-px h-px flex-1 bg-gradient-to-r from-cyan-200/80 via-border/80 to-transparent" aria-hidden="true" />
        </div>
      </div>
    );
  };

  const renderReportsSection = () => {
    const parentActive = isRouteActive('/reports');
    const parentPending = isRoutePending('/reports');
    const ReportsIcon = BarChart3;
    const shouldShowSubmenu = !collapsed;
    const reportsRestrictionBadge = shouldShowRestrictedUi(standardReportsAccess)
      ? getRestrictionBadgeLabel('upgrade')
      : null;
    const reportsButtonIsRestricted = Boolean(reportsRestrictionBadge);

    return (
      <div key="reports-navigation" className={isMobileDrawer ? 'space-y-1.5' : 'space-y-1.5'}>
        {renderSectionHeading(navSections[4].heading)}
        <div className={isMobileDrawer ? 'space-y-1' : 'space-y-0.5'}>
          <button
            type="button"
            onClick={() => {
              if (!shouldShowSubmenu || !canUseStandardReports) {
                const shouldNavigate = handleNavigationIntent('/reports');
                if (shouldNavigate) {
                  onNavigateItem?.();
                  router.push('/reports');
                }
                return;
              }

              setReportsExpanded((current) => !current);
            }}
            className={`group relative flex w-full items-center gap-2.5 overflow-hidden rounded-2xl border text-sm font-600 transition-all duration-150 ${
              parentActive
                ? 'border-cyan-200/70 bg-cyan-50 text-cyan-700 shadow-sm'
                : reportsButtonIsRestricted
                  ? 'border-border/80 bg-muted/20 text-muted-foreground hover:border-border hover:bg-muted/35 hover:text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border/80 hover:bg-muted/45 hover:text-foreground'
            } ${
              collapsed
                ? 'mx-auto h-10 w-10 justify-center p-0'
                : isMobileDrawer
                  ? 'px-3 py-2.5'
                  : 'px-2.5 py-2 text-[13px]'
            }`}
            aria-current={parentActive ? 'page' : undefined}
            aria-busy={parentPending ? 'true' : undefined}
            aria-expanded={shouldShowSubmenu ? reportsExpanded : undefined}
            title={collapsed ? (
              reportsRestrictionBadge
                ? t('sidebar.lockedTooltip', {
                    ns: 'portal',
                    label: t('nav.reports', { defaultValue: 'Reports' }),
                    restriction: reportsRestrictionBadge,
                    defaultValue: '{{label}} · {{restriction}}',
                  })
                : t('nav.reports', { defaultValue: 'Reports' })
            ) : undefined}
          >
            <span className={`flex flex-shrink-0 items-center justify-center rounded-lg ${
              parentActive ? 'bg-white text-cyan-600 ring-1 ring-cyan-100' : 'bg-muted/65 text-muted-foreground group-hover:bg-card group-hover:text-foreground'
            } ${collapsed ? 'h-9 w-9' : isMobileDrawer ? 'h-8 w-8' : 'h-7 w-7'}`}>
              <ReportsIcon size={collapsed ? 19 : isMobileDrawer ? 17 : 15} />
            </span>
            {!collapsed && (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{t('nav.reports', { defaultValue: 'Reports' })}</span>
                {reportsRestrictionBadge ? (
                  <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-border/80 bg-white/80 px-2 py-0.5 text-[10px] font-800 uppercase tracking-[0.12em] text-muted-foreground">
                    <Lock size={10} />
                    {reportsRestrictionBadge}
                  </span>
                ) : null}
                {parentPending ? <Loader2 size={13} className="animate-spin flex-shrink-0 text-accent" /> : null}
              </span>
            )}
            {!collapsed ? (
              <ChevronDown
                size={16}
                className={`flex-shrink-0 text-muted-foreground transition-transform ${reportsExpanded ? 'rotate-180' : ''}`}
              />
            ) : null}
            {collapsed && parentPending ? (
              <span className="absolute end-1 top-1 h-2 w-2 rounded-full bg-accent ring-1 ring-white z-10" />
            ) : null}
            {collapsed && reportsRestrictionBadge ? (
              <span className="absolute end-0 top-0 inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-muted-foreground ring-1 ring-border/90 z-10">
                <Lock size={9} />
              </span>
            ) : null}
            {collapsed && (
              <span className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-500 text-card opacity-0 shadow-card-md transition-opacity duration-150 group-hover:opacity-100 ${isRTL ? 'right-full me-3' : 'left-full ms-3'}`}>
                {reportsRestrictionBadge
                  ? t('sidebar.lockedTooltip', {
                      ns: 'portal',
                      label: t('nav.reports', { defaultValue: 'Reports' }),
                      restriction: reportsRestrictionBadge,
                      defaultValue: '{{label}} · {{restriction}}',
                    })
                  : t('nav.reports', { defaultValue: 'Reports' })}
              </span>
            )}
          </button>

          {canUseStandardReports && shouldShowSubmenu && reportsExpanded ? (
            <ul className={`space-y-1 ${isRTL ? 'me-4 border-e ps-0 pe-3' : 'ms-4 border-s ps-3 pe-0'} border-border/70`}>
              {renderNavItem(reportsOverviewItem, true, isExactRouteActive('/reports'))}
              {renderNavItem(itemInsightsItem, true, pathname === '/reports/item-insights' || pathname.startsWith('/reports/item-insights/'))}
            </ul>
          ) : null}

          <ul className={isMobileDrawer ? 'space-y-1' : 'space-y-0.5'}>
            {navSections[4].items.map((item) => renderNavItem(item))}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <aside
      className={`relative flex w-full flex-col overflow-hidden bg-card sidebar-transition ${
        isMobileDrawer
          ? 'h-[100dvh] min-h-0 max-h-[100dvh] w-full border-e border-border/70 bg-card pt-[env(safe-area-inset-top)] shadow-card-lg'
          : 'h-full min-h-screen lg:sticky lg:top-0 lg:min-h-screen lg:h-screen'
      }`}
    >
      {/* Logo */}
      <div
        className={`flex shrink-0 items-center border-b border-border/70 bg-white ${
          isMobileDrawer ? 'h-[84px] gap-3 px-3.5' : collapsed ? 'h-[68px] gap-0 px-2' : 'h-[68px] gap-2.5 px-2.5'
        }`}
      >
        <div className={`min-w-0 ${collapsed ? 'flex-1 flex justify-center' : 'flex-1'}`}>
          <div
            className={`${
              collapsed
                ? isMobileDrawer
                  ? 'h-10 w-10 flex items-center justify-center rounded-xl'
                  : 'h-10 w-10 flex items-center justify-center rounded-lg'
                : isMobileDrawer
                  ? 'h-12 max-w-[218px] rounded-[20px] bg-white border border-border shadow-card-sm px-3'
                  : 'h-10 max-w-[184px] rounded-2xl border border-border bg-muted/35 px-2.5'
            }`}
          >
            {collapsed ? (
              collapsedLogoSrc ? (
                <AppImage
                  src={collapsedLogoSrc}
                  alt={`${branding.appName} mark`}
                  width={32}
                  height={32}
                  className="h-8 w-8 max-h-8 max-w-8 flex-shrink-0 object-contain"
                  priority={true}
                  unoptimized={/\.svg(?:\?|$)/i.test(collapsedLogoSrc)}
                />
              ) : (
                <AppIcon
                  name="SparklesIcon"
                  size={32}
                  className="flex-shrink-0 text-accent"
                />
              )
            ) : (
              <AppLogo
                width={isMobileDrawer ? 160 : 146}
                height={isMobileDrawer ? 36 : 32}
                alt={`${branding.appName} logo`}
                className="w-full justify-start"
              />
            )}
          </div>
          {!collapsed && showBrandText && (
            <span className={`block truncate font-bold tracking-tight text-primary ${isMobileDrawer ? 'mt-2 text-base' : 'mt-1.5 text-[13px]'}`}>
              {branding.appName}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className={`btn-ghost h-8.5 w-8.5 shrink-0 rounded-xl border border-border/80 p-0 inline-flex items-center justify-center ${isMobileDrawer ? 'bg-secondary/65' : ''}`}
          aria-label={collapsed ? t('sidebar.expand', { ns: 'portal', defaultValue: 'Expand sidebar' }) : t('sidebar.collapse', { ns: 'portal', defaultValue: 'Collapse sidebar' })}
        >
          {isMobileDrawer ? (
            <X size={18} className="text-muted-foreground" />
          ) : (
            <ToggleIcon size={18} className="text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin ${collapsed ? 'px-2 py-3 pb-[7rem] [scrollbar-gutter:stable]' : isMobileDrawer ? 'overscroll-contain px-2 py-4 pb-5' : 'px-2.5 py-4 pb-[6.5rem]'}`}>
        <div className={isMobileDrawer ? 'space-y-3' : 'space-y-3 lg:space-y-5'}>
          <ul className={isMobileDrawer ? 'space-y-1' : 'space-y-0.5'}>
            {renderNavItem(dashboardItem)}
          </ul>
          {navSections.slice(0, 4).map((section) => (
            <div key={section.heading.label} className={isMobileDrawer ? 'space-y-1.5' : 'space-y-1.5 lg:space-y-2'}>
              {renderSectionHeading(section.heading)}
              <ul className={isMobileDrawer ? 'space-y-1' : 'space-y-0.5'}>
                {section.items.map((item) => renderNavItem(item))}
              </ul>
            </div>
          ))}
          {renderReportsSection()}
          <hr className="border-border/70 mx-2" />
          <ul className={isMobileDrawer ? 'space-y-1' : 'space-y-0.5'}>
            {renderNavItem(settingsItem)}
            {renderNavItem(helpSupportItem)}
          </ul>
        </div>
      </nav>

      {/* User Profile */}
      <div className={`shrink-0 border-t border-border/70 bg-white ${isMobileDrawer ? 'p-3 pb-[calc(env(safe-area-inset-bottom)+0.875rem)]' : 'p-2'} ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <button
            onClick={handleSignOut}
            className="transition-opacity hover:opacity-80"
            title={t('sidebar.signOut', { ns: 'portal', defaultValue: 'Sign out' })}
          >
            <UserAvatar
              fullName={displayName}
              email={displayEmail}
              avatarUrl={profile?.avatar_url}
              className={isMobileDrawer ? 'h-10 w-10 max-h-10 max-w-10 text-sm' : 'h-8 w-8 max-h-8 max-w-8 text-xs'}
              textClassName={isMobileDrawer ? 'text-sm' : 'text-xs'}
              iconClassName={isMobileDrawer ? 'h-[18px] w-[18px]' : 'h-4 w-4'}
            />
          </button>
        ) : (
          <div className={`border border-border/80 bg-secondary/35 shadow-card-sm ${isMobileDrawer ? 'rounded-[18px] p-2.5' : 'rounded-2xl p-2'}`}>
            <div className={`flex items-center ${isMobileDrawer ? 'gap-2.5' : 'gap-2'}`}>
              <UserAvatar
                fullName={displayName}
                email={displayEmail}
                avatarUrl={profile?.avatar_url}
                className={isMobileDrawer ? 'h-[34px] w-[34px] max-h-[34px] max-w-[34px] text-xs' : 'h-8 w-8 max-h-8 max-w-8 text-[11px]'}
                textClassName={isMobileDrawer ? 'text-xs' : 'text-[11px]'}
                iconClassName={isMobileDrawer ? 'h-4 w-4' : 'h-3.5 w-3.5'}
              />
              <div className="min-w-0 flex-1" title={`${displayName}${displayEmail ? `\n${displayEmail}` : ''}`}>
                <p className={`truncate font-600 leading-[1.15] text-foreground ${isMobileDrawer ? 'text-[12.5px]' : 'text-[12px]'}`}>{displayName}</p>
                <p className={`truncate leading-[1.15] text-muted-foreground ${isMobileDrawer ? 'mt-0.5 text-[10.5px]' : 'mt-0.5 text-[10px]'}`}>{displayEmail}</p>
              </div>
            </div>
            <div className={`mt-2 border-t border-border/75 ${isMobileDrawer ? 'pt-2' : 'pt-1.5'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className={`min-w-0 truncate font-700 uppercase text-muted-foreground ${isMobileDrawer ? 'text-[10px] tracking-[0.14em]' : 'text-[9px] tracking-[0.16em]'}`}>{t('sidebar.accountTitle', { ns: 'portal', defaultValue: 'Account' })}</p>
              <button
                onClick={handleSignOut}
                className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-negative/18 bg-negative/5 font-600 text-negative transition-colors hover:bg-negative/10 ${isMobileDrawer ? 'min-h-9 px-2.5 py-1.5 text-[11px]' : 'min-h-8 px-2.5 py-1.5 text-[11px]'}`}
                aria-label={t('sidebar.signOut', { ns: 'portal', defaultValue: 'Sign out' })}
                title={t('sidebar.signOut', { ns: 'portal', defaultValue: 'Sign out' })}
              >
                <LogOut size={isMobileDrawer ? 13 : 12} />
                <span className="truncate">{t('sidebar.signOut', { ns: 'portal', defaultValue: 'Sign out' })}</span>
              </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
