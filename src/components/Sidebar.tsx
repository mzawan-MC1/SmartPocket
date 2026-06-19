'use client';
import React from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import { LayoutDashboard, ArrowLeftRight, Wallet, PieChart, BarChart3, ChevronLeft, ChevronRight, LogOut, Repeat, Tag, ArrowUpDown, Users, RotateCcw, DollarSign, Home, History, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { usePendingNavigation } from '@/lib/pending-navigation';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { shouldShowBrandTextBesideLogo } from '@/lib/platform-settings';


interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeRoute: string;
  onNavigateItem?: () => void;
  isMobileDrawer?: boolean;
}

export default function Sidebar({ collapsed, onToggle, activeRoute, onNavigateItem, isMobileDrawer = false }: SidebarProps) {
  const { isRTL } = useLanguage();
  const { t } = useTranslation('common');
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { isRouteActive, isRoutePending, handleNavigationIntent } = usePendingNavigation(activeRoute);
  const { branding } = usePlatformSettings();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);

  const navSections = [
    {
      heading: 'Finance',
      items: [
        { id: 'nav-dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, href: '/dashboard' },
        { id: 'nav-transactions', label: t('nav.transactions'), icon: ArrowLeftRight, href: '/transactions' },
        { id: 'nav-accounts', label: t('nav.accounts'), icon: Wallet, href: '/financial-accounts' },
        { id: 'nav-transfers', label: 'Transfers', icon: ArrowUpDown, href: '/transfers' },
        { id: 'nav-budgets', label: t('nav.budgets'), icon: PieChart, href: '/budgets' },
        { id: 'nav-recurring', label: 'Recurring', icon: Repeat, href: '/recurring' },
        { id: 'nav-categories', label: 'Categories', icon: Tag, href: '/categories' },
      ],
    },
    {
      heading: 'Manage',
      items: [
        { id: 'nav-reimbursements', label: 'Reimbursements', icon: RotateCcw, href: '/reimbursements' },
        { id: 'nav-settlements', label: 'Settlements', icon: DollarSign, href: '/settlements' },
        { id: 'nav-people', label: 'People', icon: Users, href: '/people' },
        { id: 'nav-spaces', label: 'Spaces', icon: Home, href: '/spaces' },
      ],
    },
    {
      heading: 'Reports',
      items: [
        { id: 'nav-reports', label: t('nav.reports'), icon: BarChart3, href: '/reports' },
        { id: 'nav-ai-history', label: 'AI History', icon: History, href: '/ai-history' },
      ],
    },
  ];

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/sign-up-login');
      toast.success('Signed out successfully');
    } catch {
      toast.error('Failed to sign out');
    }
  };

  // For RTL: toggle button appears on left side
  const ToggleIcon = isRTL
    ? (collapsed ? ChevronLeft : ChevronRight)
    : (collapsed ? ChevronRight : ChevronLeft);

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || '';
  const initials = displayName.charAt(0).toUpperCase();

  const renderNavItem = (item: { id: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; href: string }, compact = false) => {
    const Icon = item.icon;
    const active = isRouteActive(item.href);
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
          className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-sm font-600 transition-all duration-150 ${
            active
              ? 'border-accent/20 bg-accent/10 text-accent shadow-sm'
              : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted/55 hover:text-foreground'
          } ${compact ? 'px-3 py-2.5' : ''}`}
          aria-current={active ? 'page' : undefined}
          aria-busy={pending ? 'true' : undefined}
          title={collapsed ? item.label : undefined}
        >
          <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
            active ? 'bg-white/85 text-accent ring-1 ring-accent/10' : 'bg-muted/65 text-muted-foreground group-hover:bg-card group-hover:text-foreground'
          }`}>
            <Icon size={17} />
          </span>
          {!collapsed && (
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">{item.label}</span>
              {pending ? <Loader2 size={14} className="animate-spin flex-shrink-0 text-accent" /> : null}
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

  return (
    <aside
      className={`relative flex h-full min-h-screen w-full flex-col overflow-hidden bg-card sidebar-transition lg:sticky lg:top-0 lg:min-h-screen lg:h-screen ${
        isMobileDrawer ? 'w-[86vw] max-w-[320px] shadow-card-lg' : ''
      }`}
    >
      {/* Logo */}
      <div
        className="flex h-[76px] shrink-0 items-center gap-3 border-b border-border px-3"
      >
        <div className="min-w-0 flex-1">
          <div
            className={`flex h-12 items-center overflow-hidden rounded-2xl border border-border bg-muted/35 ${
              collapsed ? 'w-11 justify-center px-1' : 'max-w-[208px] px-3'
            }`}
          >
            <AppLogo
              width={collapsed ? 32 : 160}
              height={36}
              className={collapsed ? 'justify-center' : 'w-full justify-start'}
            />
          </div>
          {!collapsed && showBrandText && (
            <span className="mt-2 block truncate text-base font-bold tracking-tight text-primary">
              {branding.appName}
            </span>
          )}
        </div>
        <button
          onClick={onToggle}
          className={`btn-ghost h-9 w-9 shrink-0 p-0 ${isMobileDrawer ? 'hidden' : ''}`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ToggleIcon size={30} className="text-muted-foreground" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-4 scrollbar-thin">
        <div className="space-y-3">
          {navSections.map((section) => (
            <div key={section.heading} className="space-y-1.5">
              {!collapsed && (
                <p className="px-3 text-[10px] font-800 uppercase tracking-[0.18em] text-muted-foreground">
                  {section.heading}
                </p>
              )}
              <ul className="space-y-1">
                {section.items.map((item) => renderNavItem(item))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      {/* User Profile */}
      <div className={`shrink-0 border-t border-border p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <button
            onClick={handleSignOut}
            className="flex h-10 w-10 items-center justify-center rounded-full gradient-teal text-sm font-700 text-white transition-opacity hover:opacity-80"
            title="Sign out"
          >
            {initials}
          </button>
        ) : (
          <div className="rounded-2xl border border-border bg-secondary/45 p-3 shadow-card-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full gradient-teal text-sm font-700 text-white">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-700 text-foreground">{displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-card px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">Account</p>
                <p className="truncate text-xs text-muted-foreground">Manage profile options from the top menu.</p>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center justify-center rounded-xl border border-negative/20 bg-negative-soft px-3 py-2 text-xs font-700 text-negative transition-colors hover:bg-negative-soft/80"
                aria-label="Sign out"
                title="Sign out"
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
