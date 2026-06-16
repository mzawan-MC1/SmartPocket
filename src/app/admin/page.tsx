'use client';
import React, { useEffect, useState } from 'react';
import { Settings, Palette, Globe, Mail, Shield, CreditCard, FileText, Search, Users, Activity, ChevronRight, Layout, Languages, ToggleLeft, BarChart3, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';

type OverviewResponse = {
  configured: boolean;
  version: string | null;
  totals: {
    total_users: number | null;
    new_users_month: number | null;
    transactions: number | null;
    managed_people: number | null;
    spaces: number | null;
    reimbursements: number | null;
  };
  subscriptions: {
    trialing: number | null;
    active: number | null;
    expired: number | null;
    total_credits_consumed: number | null;
    estimated_cost_usd: number | null;
  };
  ai: {
    requests_month: number | null;
    failed_requests_month: number | null;
  };
  recent_users: Array<{ id: string; email: string | null; full_name: string | null; created_at: string | null }>;
  provider_health: Array<{ provider: string; status: string; last_checked_at: string | null; last_error_category: string | null; response_time_ms: number | null }>;
};


const ADMIN_SECTIONS = [
  {
    id: 'branding',
    title: 'Branding & Appearance',
    description: 'Logo, colors, fonts, and theme settings',
    icon: Palette,
    href: '/admin/branding',
    color: 'bg-accent/10 text-accent',
  },
  {
    id: 'currency',
    title: 'Currency Settings',
    description: 'Default currency, enabled currencies, AED symbol',
    icon: CreditCard,
    href: '/admin/currency',
    color: 'bg-positive-soft text-positive',
  },
  {
    id: 'language',
    title: 'Language & Localization',
    description: 'Supported languages, RTL, date/number formats',
    icon: Globe,
    href: '/admin/language',
    color: 'bg-info-soft text-info',
  },
  {
    id: 'cms',
    title: 'CMS & Navigation',
    description: 'Header menu, footer links, contact info, payment settings',
    icon: Layout,
    href: '/admin/cms',
    color: 'bg-warning-soft text-warning',
  },
  {
    id: 'translations',
    title: 'CMS Translations',
    description: 'Manage content in English, Arabic, French, and Russian',
    icon: Languages,
    href: '/admin/translations',
    color: 'bg-accent/10 text-accent',
  },
  {
    id: 'email',
    title: 'Email & SMTP',
    description: 'Email provider, templates, notification settings',
    icon: Mail,
    href: '/admin/email',
    color: 'bg-warning-soft text-warning',
  },
  {
    id: 'auth',
    title: 'Authentication',
    description: 'OAuth providers, password policy, session settings',
    icon: Shield,
    href: '/admin/auth-settings',
    color: 'bg-negative-soft text-negative',
  },
  {
    id: 'reports',
    title: 'PDF & Report Settings',
    description: 'Report templates, logo placement, footer text',
    icon: FileText,
    href: '/admin/reports',
    color: 'bg-secondary text-muted-foreground',
  },
  {
    id: 'seo',
    title: 'SEO Settings',
    description: 'Meta tags, Open Graph, sitemap, robots.txt',
    icon: Search,
    href: '/admin/seo',
    color: 'bg-accent/10 text-accent',
  },
  {
    id: 'users',
    title: 'User Management',
    description: 'View users, roles, activity, and account status',
    icon: Users,
    href: '/admin/users',
    color: 'bg-positive-soft text-positive',
  },
  {
    id: 'activity',
    title: 'Activity Log',
    description: 'System events, user actions, and audit trail',
    icon: Activity,
    href: '/admin/activity',
    color: 'bg-info-soft text-info',
  },
  {
    id: 'people-stats',
    title: 'People & Space Statistics',
    description: 'Aggregate counts for managed people, spaces, and invitations',
    icon: BarChart3,
    href: '/admin/people-stats',
    color: 'bg-positive-soft text-positive',
  },
  {
    id: 'phase2-features',
    title: 'Phase 2 Feature Toggles',
    description: 'Enable/disable Managed People, Spaces, Reimbursements, Settlements',
    icon: ToggleLeft,
    href: '/admin/features',
    color: 'bg-purple-100 text-purple-700',
  },
  {
    id: 'ai',
    title: 'AI Assistant Settings',
    description: 'Configure AI providers, voice entry, usage limits, and audit logs',
    icon: Sparkles,
    href: '/admin/ai-settings',
    color: 'bg-accent/10 text-accent',
  },
  {
    id: 'subscriptions',
    title: 'Plans & Subscriptions',
    description: 'Manage subscription plans, user access, AI credits, and promotional grants',
    icon: CreditCard,
    href: '/admin/subscriptions',
    color: 'bg-positive-soft text-positive',
  },
];

export default function AdminPage() {
  const { t } = useTranslation('admin');
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/overview', { cache: 'no-store' });
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await res.json() : null;
        if (!res.ok) throw new Error(data?.error || 'Failed to load admin overview');
        if (!cancelled) setOverview(data as OverviewResponse);
      } catch (e: any) {
        toast.error(e?.message || 'Failed to load admin overview');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
      <div className="page-section">
        <PageHeader
          title="Admin Portal"
          description="Manage platform settings, subscriptions, content, localization, and operational health from one console."
          badge={<StatusBadge status={overview?.configured ? 'ready' : 'warning'} label={overview?.configured ? 'Ready' : 'Action required'} />}
        />

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Users', value: loading ? '…' : overview?.totals.total_users ?? '—', sub: 'Registered accounts' },
            { label: 'App Version', value: loading ? '…' : overview?.version ?? '—', sub: overview?.configured ? 'From server metadata' : 'Set server secret for full admin stats' },
            { label: 'Managed People', value: loading ? '…' : overview?.totals.managed_people ?? '—', sub: 'Across all users' },
            { label: 'Reimbursements', value: loading ? '…' : overview?.totals.reimbursements ?? '—', sub: 'Not deleted' },
          ]?.map((stat) => (
            <div key={stat?.label} className="metric-card">
              <p className="text-[11px] font-700 uppercase tracking-[0.16em] text-muted-foreground mb-1">{stat?.label}</p>
              <p className="text-2xl font-800 text-foreground">{stat?.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat?.sub}</p>
            </div>
          ))}
        </div>

        {!overview?.configured && (
          <div className="card-elevated p-4 border-l-4 border-warning">
            <p className="text-sm font-700 text-foreground">Admin aggregates are not fully configured</p>
            <p className="text-xs text-muted-foreground mt-1">
              Set the server-only Supabase service role key to enable cross-user counts, subscription stats, and provider health.
            </p>
          </div>
        )}

        {/* Admin Sections Grid */}
        <SectionCard title="Settings & Management" description="Jump to major administrative areas across users, AI, platform configuration, content, and monitoring.">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ADMIN_SECTIONS?.map((section) => {
              const Icon = section?.icon;
              return (
                <Link
                  key={section?.id}
                  href={section?.href}
                  className="card-elevated p-5 hover:shadow-card-md transition-all duration-200 group flex items-start gap-4"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${section?.color}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-700 text-foreground group-hover:text-accent transition-colors">{section?.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{section?.description}</p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground group-hover:text-accent transition-colors flex-shrink-0 mt-1" />
                </Link>
              );
            })}
          </div>
        </SectionCard>

        {/* Quick Actions */}
        <SectionCard title="Quick Actions" description="Common operational tasks and shortcuts for platform administration.">
          <div className="flex flex-wrap gap-3">
            <button onClick={() => toast?.info('Clearing cache...')} className="btn-secondary text-sm">
              Clear Cache
            </button>
            <button onClick={() => toast?.info('Exporting user data...')} className="btn-secondary text-sm">
              Export User Data
            </button>
            <Link href="/admin/users" className="btn-secondary text-sm">
              View All Users
            </Link>
            <Link href="/admin/activity" className="btn-secondary text-sm">
              View Activity Log
            </Link>
          </div>
        </SectionCard>
      </div>
  );
}
