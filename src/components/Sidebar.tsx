'use client';
import React from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import { LayoutDashboard, ArrowLeftRight, Wallet, PieChart, BarChart3, ChevronDown, ChevronLeft, ChevronRight, LogOut, Repeat, Tag, ArrowUpDown, Users, RotateCcw, DollarSign, Home, History, Loader2, ShoppingBag, CreditCard, LifeBuoy, CircleHelp, BriefcaseBusiness } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { usePendingNavigation } from '@/lib/pending-navigation';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { shouldShowBrandTextBesideLogo } from '@/lib/platform-settings';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import UserAvatar from '@/components/ui/UserAvatar';
import { hasSubscriptionFeature } from '@/lib/subscription/entitlements';


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
  const { branding } = usePlatformSettings();
  const { summary } = useSubscriptionSummary();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);
  const isReportsRoute = pathname === '/reports' || pathname.startsWith('/reports/');
  const [reportsExpanded, setReportsExpanded] = React.useState(isReportsRoute);
  const canUseAiHistory = hasSubscriptionFeature(summary, 'ai_history');
  const canUseManagedPeople = hasSubscriptionFeature(summary, 'managed_people');
  const canUseSharedSpaces = hasSubscriptionFeature(summary, 'shared_spaces');
  const canUseStandardReports = hasSubscriptionFeature(summary, 'standard_reports');

  React.useEffect(() => {
    if (isReportsRoute) {
      setReportsExpanded(true);
    }
  }, [isReportsRoute]);

  const navSections = [
    {
      heading: {
        label: t('sidebar.sections.finance', { ns: 'portal' }),
        icon: LayoutDashboard,
      },
      items: [
        { id: 'nav-dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, href: '/dashboard' },
        { id: 'nav-transactions', label: t('nav.transactions'), icon: ArrowLeftRight, href: '/transactions' },
        { id: 'nav-accounts', label: t('nav.accounts'), icon: Wallet, href: '/financial-accounts' },
        { id: 'nav-transfers', label: t('sidebar.nav.transfers', { ns: 'portal' }), icon: ArrowUpDown, href: '/transfers' },
        { id: 'nav-budgets', label: t('nav.budgets'), icon: PieChart, href: '/budgets' },
        { id: 'nav-recurring', label: t('sidebar.nav.recurring', { ns: 'portal' }), icon: Repeat, href: '/recurring' },
        { id: 'nav-personal-subscriptions', label: t('sidebar.nav.personalSubscriptions', { ns: 'portal' }), icon: CreditCard, href: '/personal-subscriptions' },
        { id: 'nav-categories', label: t('sidebar.nav.categories', { ns: 'portal' }), icon: Tag, href: '/categories' },
      ],
    },
    {
      heading: {
        label: t('sidebar.sections.manage', { ns: 'portal' }),
        icon: BriefcaseBusiness,
      },
      items: [
        { id: 'nav-reimbursements', label: t('sidebar.nav.reimbursements', { ns: 'portal' }), icon: RotateCcw, href: '/reimbursements' },
        { id: 'nav-settlements', label: t('sidebar.nav.settlements', { ns: 'portal' }), icon: DollarSign, href: '/settlements' },
        ...(canUseManagedPeople
          ? [{ id: 'nav-people', label: t('sidebar.nav.people', { ns: 'portal' }), icon: Users, href: '/people' }]
          : []),
        ...(canUseSharedSpaces
          ? [{ id: 'nav-spaces', label: t('sidebar.nav.spaces', { ns: 'portal' }), icon: Home, href: '/spaces' }]
          : []),
      ],
    },
    {
      heading: {
        label: t('sidebar.sections.reports', { ns: 'portal' }),
        icon: BarChart3,
      },
      items: [
        ...(canUseAiHistory
          ? [{ id: 'nav-ai-history', label: t('sidebar.nav.aiHistory', { ns: 'portal' }), icon: History, href: '/ai-history' }]
          : []),
      ],
    },
    {
      heading: {
        label: t('sidebar.sections.support', { ns: 'portal', defaultValue: 'Support' }),
        icon: LifeBuoy,
      },
      items: [
        { id: 'nav-faqs', label: t('sidebar.nav.faqs', { ns: 'portal', defaultValue: 'FAQs' }), icon: CircleHelp, href: '/faqs' },
        { id: 'nav-support', label: t('sidebar.nav.support', { ns: 'portal', defaultValue: 'Support' }), icon: LifeBuoy, href: '/support' },
      ],
    },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/sign-up-login');
      toast.success(t('topbar.signOutSuccess', { ns: 'portal' }));
    } catch {
      toast.error(t('topbar.signOutError', { ns: 'portal' }));
    }
  };

  // For RTL: toggle button appears on left side
  const ToggleIcon = isRTL
    ? (collapsed ? ChevronLeft : ChevronRight)
    : (collapsed ? ChevronRight : ChevronLeft);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || t('topbar.userFallback', { ns: 'portal' });
  const displayEmail = user?.email || '';

  const reportsOverviewItem: NavItem = {
    id: 'nav-reports-overview',
    label: t('reports.pageTitle', { ns: 'portal', defaultValue: t('nav.reports') }),
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

    return (
      <li key={item.id}>
        <Link
          href={item.href}
          onClick={(event) => {
            const shouldNavigate = handleNavigationIntent(item.href, event);
            if (shouldNavigate) {
              onNavigateItem?.();
            }
          }}
          className={`group relative flex items-center gap-2.5 overflow-hidden rounded-2xl border text-sm font-600 transition-all duration-150 ${
            active
              ? 'border-cyan-200/70 bg-cyan-50 text-cyan-700 shadow-sm'
              : 'border-transparent text-muted-foreground hover:border-border/80 hover:bg-muted/45 hover:text-foreground'
          } ${isMobileDrawer ? 'px-3 py-2.5' : 'px-2.5 py-2 text-[13px]'} ${compact ? 'px-3 py-2.5' : ''}`}
          aria-current={active ? 'page' : undefined}
          aria-busy={pending ? 'true' : undefined}
          title={collapsed ? item.label : undefined}
        >
          <span className={`flex flex-shrink-0 items-center justify-center rounded-lg ${
            active ? 'bg-white text-cyan-600 ring-1 ring-cyan-100' : 'bg-muted/65 text-muted-foreground group-hover:bg-card group-hover:text-foreground'
          } ${isMobileDrawer ? 'h-8 w-8' : 'h-7 w-7'}`}>
            <Icon size={isMobileDrawer ? 17 : 15} />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">{item.label}</span>
              {pending ? <Loader2 size={13} className="animate-spin flex-shrink-0 text-accent" /> : null}
            </span>
          )}
          {collapsed && pending ? (
            <span className="absolute end-2.5 top-2.5 h-2 w-2 rounded-full bg-accent" />
          ) : null}
          {collapsed && (
            <span className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-500 text-card opacity-0 shadow-card-md transition-opacity duration-150 group-hover:opacity-100 ${isRTL ? 'right-full me-3' : 'left-full ms-3'}`}>
              {item.label}
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
    if (!canUseStandardReports) {
      return null;
    }

    const parentActive = isRouteActive('/reports');
    const parentPending = isRoutePending('/reports');
    const ReportsIcon = BarChart3;
    const shouldShowSubmenu = !collapsed;

    return (
      <div key="reports-navigation" className={isMobileDrawer ? 'space-y-1.5' : 'space-y-1.5'}>
        {renderSectionHeading(navSections[2].heading)}
        <div className={isMobileDrawer ? 'space-y-1' : 'space-y-0.5'}>
          <button
            type="button"
            onClick={() => {
              if (!shouldShowSubmenu) {
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
                : 'border-transparent text-muted-foreground hover:border-border/80 hover:bg-muted/45 hover:text-foreground'
            } ${isMobileDrawer ? 'px-3 py-2.5' : 'px-2.5 py-2 text-[13px]'}`}
            aria-current={parentActive ? 'page' : undefined}
            aria-busy={parentPending ? 'true' : undefined}
            aria-expanded={shouldShowSubmenu ? reportsExpanded : undefined}
            title={collapsed ? t('nav.reports') : undefined}
          >
            <span className={`flex flex-shrink-0 items-center justify-center rounded-lg ${
              parentActive ? 'bg-white text-cyan-600 ring-1 ring-cyan-100' : 'bg-muted/65 text-muted-foreground group-hover:bg-card group-hover:text-foreground'
            } ${isMobileDrawer ? 'h-8 w-8' : 'h-7 w-7'}`}>
              <ReportsIcon size={isMobileDrawer ? 17 : 15} />
            </span>
            {!collapsed && (
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{t('nav.reports')}</span>
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
              <span className="absolute end-2.5 top-2.5 h-2 w-2 rounded-full bg-accent" />
            ) : null}
            {collapsed && (
              <span className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-500 text-card opacity-0 shadow-card-md transition-opacity duration-150 group-hover:opacity-100 ${isRTL ? 'right-full me-3' : 'left-full ms-3'}`}>
                {t('nav.reports')}
              </span>
            )}
          </button>

          {shouldShowSubmenu && reportsExpanded ? (
            <ul className={`space-y-1 ${isRTL ? 'me-4 border-e ps-0 pe-3' : 'ms-4 border-s ps-3 pe-0'} border-border/70`}>
              {renderNavItem(reportsOverviewItem, true, isExactRouteActive('/reports'))}
              {renderNavItem(itemInsightsItem, true, pathname === '/reports/item-insights' || pathname.startsWith('/reports/item-insights/'))}
            </ul>
          ) : null}

          <ul className={isMobileDrawer ? 'space-y-1' : 'space-y-0.5'}>
            {navSections[2].items.map((item) => renderNavItem(item))}
          </ul>
        </div>
      </div>
    );
  };

  return (
    <aside
      className={`relative flex w-full flex-col overflow-hidden bg-card sidebar-transition ${
        isMobileDrawer
          ? 'h-[100dvh] min-h-0 max-h-[100dvh] w-[86vw] max-w-[320px] pt-[env(safe-area-inset-top)] shadow-card-lg'
          : 'h-full min-h-screen lg:sticky lg:top-0 lg:min-h-screen lg:h-screen'
      }`}
    >
      {/* Logo */}
      <div
        className={`flex shrink-0 items-center border-b border-border/70 bg-white ${
          isMobileDrawer ? 'h-[76px] gap-3 px-3' : 'h-[68px] gap-2.5 px-2.5'
        }`}
      >
        <div className="min-w-0 flex-1">
          <div
            className={`flex items-center overflow-hidden border border-border bg-muted/35 ${
              isMobileDrawer
                ? collapsed
                  ? 'h-12 w-11 justify-center rounded-2xl px-1'
                  : 'h-12 max-w-[208px] rounded-2xl px-3'
                : collapsed
                  ? 'h-10 w-10 justify-center rounded-xl px-1'
                  : 'h-10 max-w-[184px] rounded-2xl px-2.5'
            }`}
          >
            <AppLogo
              width={collapsed ? 28 : isMobileDrawer ? 160 : 146}
              height={isMobileDrawer ? 36 : 32}
              className={collapsed ? 'justify-center' : 'w-full justify-start'}
            />
          </div>
          {!collapsed && showBrandText && (
            <span className={`block truncate font-bold tracking-tight text-primary ${isMobileDrawer ? 'mt-2 text-base' : 'mt-1.5 text-[13px]'}`}>
              {branding.appName}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className={`btn-ghost h-8.5 w-8.5 shrink-0 p-0 ${isMobileDrawer ? 'hidden' : ''}`}
          aria-label={collapsed ? t('sidebar.expand', { ns: 'portal' }) : t('sidebar.collapse', { ns: 'portal' })}
        >
          <ToggleIcon size={18} className="text-muted-foreground" />
        </button>
      </div>

      {/* Navigation */}
      <nav className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin ${isMobileDrawer ? 'overscroll-contain px-2 py-4 pb-5' : 'px-2.5 py-4'}`}>
        <div className={isMobileDrawer ? 'space-y-3' : 'space-y-3 lg:space-y-5'}>
          {navSections.slice(0, 2).map((section) => (
            <div key={section.heading.label} className={isMobileDrawer ? 'space-y-1.5' : 'space-y-1.5 lg:space-y-2'}>
              {renderSectionHeading(section.heading)}
              <ul className={isMobileDrawer ? 'space-y-1' : 'space-y-0.5'}>
                {section.items.map((item) => renderNavItem(item))}
              </ul>
            </div>
          ))}
          {renderReportsSection()}
          <div className={isMobileDrawer ? 'space-y-1.5' : 'space-y-1.5 lg:space-y-2'}>
            {renderSectionHeading(navSections[3].heading)}
            <ul className={isMobileDrawer ? 'space-y-1' : 'space-y-0.5'}>
              {navSections[3].items.map((item) => renderNavItem(item))}
            </ul>
          </div>
        </div>
      </nav>

      {/* User Profile */}
      <div className={`shrink-0 border-t border-border/70 bg-white ${isMobileDrawer ? 'p-3 pb-[calc(env(safe-area-inset-bottom)+0.875rem)]' : 'p-3'} ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <button
            onClick={handleSignOut}
            className="transition-opacity hover:opacity-80"
            title={t('sidebar.signOut', { ns: 'portal' })}
          >
            <UserAvatar
              fullName={displayName}
              email={displayEmail}
              avatarUrl={profile?.avatar_url}
              className={isMobileDrawer ? 'h-10 w-10 text-sm' : 'h-9 w-9 text-[13px]'}
              textClassName={isMobileDrawer ? 'text-sm' : 'text-[13px]'}
              iconClassName={isMobileDrawer ? 'h-4.5 w-4.5' : 'h-4 w-4'}
            />
          </button>
        ) : (
          <div className={`border border-border/80 bg-secondary/35 shadow-card-sm ${isMobileDrawer ? 'rounded-2xl p-3' : 'rounded-[22px] p-3'}`}>
            <div className={`flex items-center ${isMobileDrawer ? 'gap-3' : 'gap-2.5'}`}>
              <UserAvatar
                fullName={displayName}
                email={displayEmail}
                avatarUrl={profile?.avatar_url}
                className={isMobileDrawer ? 'h-10 w-10 text-sm' : 'h-8.5 w-8.5 text-[13px]'}
                textClassName={isMobileDrawer ? 'text-sm' : 'text-[13px]'}
                iconClassName={isMobileDrawer ? 'h-4.5 w-4.5' : 'h-4 w-4'}
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate font-700 text-foreground ${isMobileDrawer ? 'text-sm' : 'text-[13px]'}`}>{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
              </div>
            </div>
            <div className={`flex items-center justify-between gap-2 border border-border/80 bg-card ${isMobileDrawer ? 'mt-3 rounded-xl px-3 py-2' : 'mt-2.5 rounded-lg px-2.5 py-1.5'}`}>
              <div className="min-w-0">
                <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">{t('sidebar.accountTitle', { ns: 'portal' })}</p>
                <p className="truncate text-[11px] text-muted-foreground">{t('sidebar.accountDescription', { ns: 'portal' })}</p>
              </div>
              <button
                onClick={handleSignOut}
                className={`inline-flex items-center justify-center border border-negative/20 bg-negative-soft text-xs font-700 text-negative transition-colors hover:bg-negative-soft/80 ${isMobileDrawer ? 'rounded-xl px-3 py-2' : 'rounded-lg px-2.5 py-1.5'}`}
                aria-label={t('sidebar.signOut', { ns: 'portal' })}
                title={t('sidebar.signOut', { ns: 'portal' })}
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
