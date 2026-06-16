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
      className={`relative flex flex-col h-full bg-card border-e border-border sidebar-transition overflow-hidden ${
        isMobileDrawer ? 'w-[86vw] max-w-[320px] shadow-card-lg' : ''
      }`}
      style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
    >
      {/* Logo */}
      <div
        className="flex items-center border-b border-border flex-shrink-0 px-5"
        style={{ height: 'var(--topbar-height)', padding: collapsed ? '0 14px' : '0 20px' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <AppLogo size={32} />
          {!collapsed && (
            <span className="font-bold text-base text-primary truncate tracking-tight">
              Smart Pocket
            </span>
          )}
        </div>
      </div>

      {/* Toggle Button */}
      {!isMobileDrawer && (
        <button
          onClick={onToggle}
          className={`absolute ${isRTL ? '-left-3' : '-right-3'} top-[72px] z-10 w-6 h-6 rounded-full bg-card border border-border flex items-center justify-center shadow-card hover:bg-muted transition-colors duration-150`}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ToggleIcon size={12} className="text-muted-foreground" />
        </button>
      )}

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto scrollbar-thin overflow-x-hidden">
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

        {/* Bottom Section */}
        <div className="mt-6">
          {!collapsed && (
            <p className="px-5 mb-2 text-[11px] font-700 uppercase tracking-[0.18em] text-muted-foreground">Account</p>
          )}
          <ul className="space-y-1 px-2">
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
                    className={`nav-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-500 text-muted-foreground relative group ${active ? 'nav-active font-600' : ''}`}
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
                      <span className={`absolute ${isRTL ? 'right-full me-3' : 'left-full ms-3'} px-2.5 py-1.5 bg-foreground text-card text-xs font-500 rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-card-md`}>
                        {item.label}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* User Profile */}
      <div className={`border-t border-border p-3 flex-shrink-0 ${collapsed ? 'flex justify-center' : ''}`}>
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
