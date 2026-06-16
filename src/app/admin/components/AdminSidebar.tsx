'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, CreditCard, FileText, Globe, HeartPulse, Layout, Languages, Mail, Settings2, Shield, Sparkles, ToggleLeft, Users, Activity, ClipboardList, Loader2 } from 'lucide-react';
import { usePendingNavigation } from '@/lib/pending-navigation';
import AppLogo from '@/components/ui/AppLogo';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';

interface AdminSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeRoute: string;
}

type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

const ADMIN_GROUPS: Array<{ id: string; label: string; items: AdminNavItem[] }> = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ id: 'overview', label: 'Overview', href: '/admin', icon: BarChart3 }],
  },
  {
    id: 'users',
    label: 'Users & Subscriptions',
    items: [
      { id: 'users', label: 'Users', href: '/admin/users', icon: Users },
      { id: 'plans', label: 'Plans & Subscriptions', href: '/admin/subscriptions', icon: CreditCard },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    items: [
      { id: 'ai-mgmt', label: 'AI Management', href: '/admin/ai-settings', icon: Sparkles },
      { id: 'ai-usage', label: 'AI Usage & Costs', href: '/admin/ai-usage', icon: ClipboardList },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { id: 'cms', label: 'CMS & Navigation', href: '/admin/cms', icon: Layout },
      { id: 'translations', label: 'Translations', href: '/admin/translations', icon: Languages },
      { id: 'branding', label: 'Branding', href: '/admin/branding', icon: Settings2 },
      { id: 'seo', label: 'SEO', href: '/admin/seo', icon: FileText },
      { id: 'reports', label: 'PDF & Reports', href: '/admin/reports', icon: FileText },
    ],
  },
  {
    id: 'platform',
    label: 'Platform Configuration',
    items: [
      { id: 'auth', label: 'Authentication', href: '/admin/auth-settings', icon: Shield },
      { id: 'email', label: 'Email & SMTP', href: '/admin/email', icon: Mail },
      { id: 'localization', label: 'Currency & Languages', href: '/admin/localization', icon: Globe },
      { id: 'features', label: 'Feature Controls', href: '/admin/features', icon: ToggleLeft },
      { id: 'platform', label: 'Platform Settings', href: '/admin/platform', icon: Settings2 },
    ],
  },
  {
    id: 'monitoring',
    label: 'Monitoring',
    items: [
      { id: 'activity', label: 'Activity Logs', href: '/admin/activity', icon: Activity },
      { id: 'health', label: 'System Health', href: '/admin/system-health', icon: HeartPulse },
    ],
  },
];

export default function AdminSidebar({ collapsed, onToggle, activeRoute }: AdminSidebarProps) {
  const { isRouteActive, isRoutePending, handleNavigationIntent } = usePendingNavigation(activeRoute);
  const { branding } = usePlatformSettings();

  return (
    <aside
      className="relative flex flex-col h-full bg-card border-e border-border sidebar-transition overflow-hidden"
      style={{ width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
    >
      <div
        className="flex items-center justify-between border-b border-border flex-shrink-0"
        style={{ height: 'var(--topbar-height)', padding: collapsed ? '0 14px' : '0 20px' }}
      >
        {!collapsed && (
          <div className="flex items-center gap-3 min-w-0">
            <AppLogo width={112} height={28} />
            <span className="font-800 text-sm tracking-[0.12em] uppercase text-foreground truncate">
              {branding.appName} Admin
            </span>
          </div>
        )}
        <button onClick={onToggle} className="btn-ghost p-2" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <ArrowLeft size={16} className={collapsed ? 'rotate-180' : ''} />
        </button>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto scrollbar-thin overflow-x-hidden">
        <ul className="space-y-1 px-2">
          <li>
            <Link
              href="/dashboard"
              onClick={(event) => {
                void handleNavigationIntent('/dashboard', event);
              }}
              className="nav-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-600 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-busy={isRoutePending('/dashboard') ? 'true' : undefined}
              title={collapsed ? 'Back to My Account' : undefined}
            >
              {isRoutePending('/dashboard')
                ? <Loader2 size={18} className="flex-shrink-0 animate-spin text-accent" />
                : <ArrowLeft size={18} className="flex-shrink-0" />
              }
              {!collapsed && <span className="truncate flex-1">Back to My Account</span>}
            </Link>
          </li>
          <div className="my-2 border-t border-border" />
          {ADMIN_GROUPS.map((group) => (
            <React.Fragment key={group.id}>
              {!collapsed && (
                <li className="px-3 pt-4 pb-1 text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground">
                  {group.label}
                </li>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isRouteActive(item.href);
                const pending = isRoutePending(item.href);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      prefetch
                      onClick={(event) => {
                        void handleNavigationIntent(item.href, event);
                      }}
                      className={`nav-item flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-500 relative group ${
                        active ? 'nav-active font-600' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      }`}
                      aria-current={active ? 'page' : undefined}
                      aria-busy={pending ? 'true' : undefined}
                      title={collapsed ? item.label : undefined}
                    >
                      {pending
                        ? <Loader2 size={18} className="flex-shrink-0 animate-spin text-accent" />
                        : <Icon size={18} className="flex-shrink-0" />
                      }
                      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                      {collapsed && pending && (
                        <span className="absolute top-2.5 end-2.5 w-2 h-2 rounded-full bg-accent" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </React.Fragment>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
