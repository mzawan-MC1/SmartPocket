'use client';
import React from 'react';
import Link from 'next/link';
import AppLogo from '@/components/ui/AppLogo';
import { LayoutDashboard, ArrowLeftRight, Wallet, PieChart, BarChart3, ChevronLeft, ChevronRight, Settings, HelpCircle, LogOut, Repeat, Tag, ArrowUpDown, Users, RotateCcw, DollarSign, Home, History, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
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

  const navItems = [
    { id: 'nav-dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, href: '/dashboard' },
    { id: 'nav-transactions', label: t('nav.transactions'), icon: ArrowLeftRight, href: '/transactions' },
    { id: 'nav-accounts', label: t('nav.accounts'), icon: Wallet, href: '/financial-accounts' },
    { id: 'nav-transfers', label: 'Transfers', icon: ArrowUpDown, href: '/transfers' },
    { id: 'nav-budgets', label: t('nav.budgets'), icon: PieChart, href: '/budgets' },
    { id: 'nav-recurring', label: 'Recurring', icon: Repeat, href: '/recurring' },
    { id: 'nav-categories', label: 'Categories', icon: Tag, href: '/categories' },
    { id: 'nav-reports', label: t('nav.reports'), icon: BarChart3, href: '/reports' },
    { id: 'nav-people', label: 'People', icon: Users, href: '/people' },
    { id: 'nav-spaces', label: 'Spaces', icon: Home, href: '/spaces' },
    { id: 'nav-reimbursements', label: 'Reimbursements', icon: RotateCcw, href: '/reimbursements' },
    { id: 'nav-settlements', label: 'Settlements', icon: DollarSign, href: '/settlements' },
    { id: 'nav-ai-history', label: 'AI History', icon: History, href: '/ai-history' },
  ];

  const bottomItems = [
    { id: 'nav-settings', label: t('nav.settings'), icon: Settings, href: '/settings' },
    { id: 'nav-help', label: t('nav.help'), icon: HelpCircle, href: '/help' },
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
            className={`flex h-12 items-center overflow-hidden rounded-xl border border-border bg-muted/30 ${
              collapsed ? 'w-11 justify-center px-1' : 'max-w-[192px] px-3'
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
          <ToggleIcon size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4 scrollbar-thin">
        {!collapsed && (
          <p className="px-5 mb-2 text-[11px] font-700 uppercase tracking-[0.18em] text-muted-foreground">Finance</p>
        )}

        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
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
                  className={`nav-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-500 relative group ${
                    active ? 'nav-active font-600' : 'text-muted-foreground'
                  }`}
                  aria-current={active ? 'page' : undefined}
                  aria-busy={pending ? 'true' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!collapsed && (
                    <span className="truncate flex-1">{item.label}</span>
                  )}
                  {!collapsed && pending && (
                    <Loader2 size={14} className="animate-spin flex-shrink-0 text-accent" />
                  )}
                  {collapsed && pending && (
                    <span className="absolute top-2.5 end-2.5 w-2 h-2 rounded-full bg-accent" />
                  )}
                  {collapsed && (
                    <span className={`absolute ${isRTL ? 'right-full me-3' : 'left-full ms-3'} px-2.5 py-1.5 bg-foreground text-card text-xs font-500 rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-card-md`}>
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

      </nav>

      <div className="shrink-0 border-t border-border px-2 py-3">
        {!collapsed && (
          <p className="mb-2 px-3 text-[11px] font-700 uppercase tracking-[0.18em] text-muted-foreground">Account</p>
        )}
        <ul className="space-y-1">
          {bottomItems.map((item) => {
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
                  className={`nav-item relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-500 text-muted-foreground group ${active ? 'nav-active font-600' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  aria-busy={pending ? 'true' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                  {!collapsed && pending && (
                    <Loader2 size={14} className="animate-spin flex-shrink-0 text-accent" />
                  )}
                  {collapsed && pending && (
                    <span className="absolute top-2.5 end-2.5 w-2 h-2 rounded-full bg-accent" />
                  )}
                  {collapsed && (
                    <span className={`absolute ${isRTL ? 'right-full me-3' : 'left-full ms-3'} whitespace-nowrap rounded-md bg-foreground px-2.5 py-1.5 text-xs font-500 text-card opacity-0 shadow-card-md transition-opacity duration-150 pointer-events-none group-hover:opacity-100 z-50`}>
                      {item.label}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* User Profile */}
      <div className={`shrink-0 border-t border-border p-3 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <button
            onClick={handleSignOut}
            className="w-9 h-9 rounded-full gradient-teal flex items-center justify-center text-white text-sm font-700 flex-shrink-0 hover:opacity-80 transition-opacity"
            title="Sign out"
          >
            {initials}
          </button>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 p-2.5 hover:bg-secondary transition-colors cursor-pointer group">
            <div className="w-9 h-9 rounded-full gradient-teal flex items-center justify-center text-white text-sm font-700 flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-600 text-foreground truncate">{displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} className="text-muted-foreground hover:text-negative transition-colors" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
