'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BadgeCheck,
  CreditCard,
  FileText,
  Globe,
  Languages,
  LayoutDashboard,
  Loader2,
  Mail,
  Palette,
  Search,
  Shield,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';

type PlatformOverview = {
  singleton: {
    healthy: boolean;
    last_updated_at: string | null;
  };
  branding: {
    app_name: string;
    logo_url: string;
    favicon_url: string;
    assets_ready: boolean;
  };
  seo: {
    canonical_url: string;
    site_title: string;
    site_description: string;
    og_image: string;
    ready: boolean;
  };
  email: {
    provider: string;
    smtp_ready: boolean;
    from_email: string;
  };
  auth: {
    enabled_methods: string[];
    require_email_verification: boolean;
  };
  localization: {
    default_language: string;
    enabled_languages: string[];
    default_currency: string;
    enabled_currencies: string[];
  };
  cms: {
    header_menu_count: number;
    footer_section_count: number;
    footer_link_count: number;
    contact_ready: boolean;
    pages: {
      total: number;
      published: number;
      draft: number;
      disabled: number;
    };
  };
  features: {
    managed_people: boolean;
    shared_spaces: boolean;
    invitations: boolean;
    reimbursements: boolean;
    settlements: boolean;
  };
  payments: {
    stripe_enabled: boolean;
    paypal_enabled: boolean;
  };
  homepage: {
    hero_title: string;
    hero_subtitle: string;
    hero_cta_primary: string;
    hero_cta_secondary: string;
    sticky_header: boolean;
    footer_tagline: string;
  };
  warnings: string[];
};

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-700 ${ok ? 'bg-positive-soft text-positive' : 'bg-warning/10 text-warning'}`}>
      {label}
    </span>
  );
}

function OverviewCard({
  icon,
  title,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card-elevated p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
            {icon}
          </div>
          <h2 className="text-base font-700 text-foreground">{title}</h2>
        </div>
        {badge}
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export default function AdminPlatformSettingsPage() {
  const [data, setData] = useState<PlatformOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const res = await fetch('/api/admin/platform/overview');
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error || 'Failed to load platform overview.');
        }

        if (active) {
          setData(json as PlatformOverview);
        }
      } catch (error: any) {
        toast.error(error?.message || 'Failed to load platform overview.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-700 text-foreground tracking-tight">Platform Overview & Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Read-only overview of global platform readiness.</p>
        </div>
        <div className="card-elevated p-5">
          <p className="text-sm font-600 text-foreground">Platform overview is unavailable.</p>
          <p className="text-xs text-muted-foreground mt-1">Try again or inspect the related admin API route.</p>
        </div>
      </div>
    );
  }

  const shortcutLinks = [
    { href: '/admin/branding', label: 'Branding', icon: <Palette size={16} /> },
    { href: '/admin/seo', label: 'SEO', icon: <Search size={16} /> },
    { href: '/admin/auth-settings', label: 'Authentication', icon: <Shield size={16} /> },
    { href: '/admin/email', label: 'Email & SMTP', icon: <Mail size={16} /> },
    { href: '/admin/cms', label: 'CMS & Navigation', icon: <LayoutDashboard size={16} /> },
    { href: '/admin/cms?tab=pages', label: 'CMS Pages', icon: <FileText size={16} /> },
    { href: '/admin/currency', label: 'Currency', icon: <CreditCard size={16} /> },
    { href: '/admin/languages', label: 'Languages', icon: <Languages size={16} /> },
    { href: '/admin/features', label: 'Feature Controls', icon: <BadgeCheck size={16} /> },
    { href: '/admin/reports', label: 'PDF & Reports', icon: <FileText size={16} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-700 text-foreground tracking-tight">Platform Overview & Health</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Read-only visibility into global configuration without duplicating the specialized admin forms.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <OverviewCard
          icon={<LayoutDashboard size={18} />}
          title="Platform Singleton"
          badge={<StatusBadge ok={data.singleton.healthy} label={data.singleton.healthy ? 'Healthy' : 'Needs attention'} />}
        >
          <p>Last updated: {data.singleton.last_updated_at ? new Date(data.singleton.last_updated_at).toLocaleString() : 'Unknown'}</p>
          <p>Singleton health reflects the `platform_settings` row and singleton lock status.</p>
        </OverviewCard>

        <OverviewCard
          icon={<Palette size={18} />}
          title="Branding"
          badge={<StatusBadge ok={data.branding.assets_ready} label={data.branding.assets_ready ? 'Assets ready' : 'Assets missing'} />}
        >
          <p>App name: {data.branding.app_name || 'Not set'}</p>
          <p>Logo: {data.branding.logo_url ? 'Configured' : 'Missing'}</p>
          <p>Favicon: {data.branding.favicon_url ? 'Configured' : 'Missing'}</p>
        </OverviewCard>

        <OverviewCard
          icon={<Search size={18} />}
          title="SEO Readiness"
          badge={<StatusBadge ok={data.seo.ready} label={data.seo.ready ? 'Ready' : 'Incomplete'} />}
        >
          <p>Canonical URL: {data.seo.canonical_url || 'Missing'}</p>
          <p>Site title: {data.seo.site_title || 'Missing'}</p>
          <p>Site description: {data.seo.site_description || 'Missing'}</p>
          <p>Open Graph image: {data.seo.og_image ? 'Configured' : 'Missing'}</p>
        </OverviewCard>

        <OverviewCard
          icon={<Mail size={18} />}
          title="Email & SMTP"
          badge={<StatusBadge ok={data.email.smtp_ready} label={data.email.smtp_ready ? 'Ready' : 'Incomplete'} />}
        >
          <p>Provider: {data.email.provider}</p>
          <p>Sender email: {data.email.from_email || 'Missing'}</p>
          <p>SMTP readiness checks host/user/from-email when SMTP is selected.</p>
        </OverviewCard>

        <OverviewCard
          icon={<Shield size={18} />}
          title="Authentication"
          badge={<StatusBadge ok={data.auth.enabled_methods.length > 0} label={data.auth.enabled_methods.length > 0 ? 'Enabled' : 'None enabled'} />}
        >
          <p>Methods: {data.auth.enabled_methods.join(', ') || 'None enabled'}</p>
          <p>Email verification: {data.auth.require_email_verification ? 'Required' : 'Optional'}</p>
        </OverviewCard>

        <OverviewCard
          icon={<Globe size={18} />}
          title="Localization"
          badge={<StatusBadge ok={data.localization.enabled_languages.length > 0 && data.localization.enabled_currencies.length > 0} label="Defaults loaded" />}
        >
          <p>Default language: {data.localization.default_language}</p>
          <p>Enabled languages: {data.localization.enabled_languages.join(', ') || 'None'}</p>
          <p>Default currency: {data.localization.default_currency || 'Missing'}</p>
          <p>Enabled currencies: {data.localization.enabled_currencies.join(', ') || 'None'}</p>
        </OverviewCard>

        <OverviewCard
          icon={<FileText size={18} />}
          title="CMS & Navigation"
          badge={<StatusBadge ok={data.cms.header_menu_count > 0 || data.cms.footer_link_count > 0} label="Navigation ready" />}
        >
          <p>Header links: {data.cms.header_menu_count}</p>
          <p>Footer sections: {data.cms.footer_section_count}</p>
          <p>Footer links: {data.cms.footer_link_count}</p>
          <p>Contact details: {data.cms.contact_ready ? 'Configured' : 'Missing'}</p>
        </OverviewCard>

        <OverviewCard
          icon={<FileText size={18} />}
          title="CMS Pages"
          badge={<StatusBadge ok={data.cms.pages.total > 0} label={`${data.cms.pages.total} total`} />}
        >
          <p>Published: {data.cms.pages.published}</p>
          <p>Draft: {data.cms.pages.draft}</p>
          <p>Disabled: {data.cms.pages.disabled}</p>
        </OverviewCard>

        <OverviewCard
          icon={<BadgeCheck size={18} />}
          title="Feature Controls"
          badge={<StatusBadge ok={true} label="Summary" />}
        >
          <p>Managed People: {data.features.managed_people ? 'On' : 'Off'}</p>
          <p>Shared Spaces: {data.features.shared_spaces ? 'On' : 'Off'}</p>
          <p>Invitations: {data.features.invitations ? 'On' : 'Off'}</p>
          <p>Reimbursements: {data.features.reimbursements ? 'On' : 'Off'}</p>
          <p>Settlements: {data.features.settlements ? 'On' : 'Off'}</p>
        </OverviewCard>

        <OverviewCard
          icon={<CreditCard size={18} />}
          title="Payments"
          badge={<StatusBadge ok={data.payments.stripe_enabled || data.payments.paypal_enabled} label="Flags" />}
        >
          <p>Stripe: {data.payments.stripe_enabled ? 'Enabled' : 'Disabled'}</p>
          <p>PayPal: {data.payments.paypal_enabled ? 'Enabled' : 'Disabled'}</p>
        </OverviewCard>

        <OverviewCard
          icon={<Globe size={18} />}
          title="Homepage"
          badge={<StatusBadge ok={Boolean(data.homepage.hero_title)} label={data.homepage.hero_title ? 'Configured' : 'Needs content'} />}
        >
          <p>Hero title: {data.homepage.hero_title || 'Missing'}</p>
          <p>Primary CTA: {data.homepage.hero_cta_primary || 'Missing'}</p>
          <p>Secondary CTA: {data.homepage.hero_cta_secondary || 'Missing'}</p>
          <p>Sticky header: {data.homepage.sticky_header ? 'On' : 'Off'}</p>
          <p>Footer tagline: {data.homepage.footer_tagline || 'Missing'}</p>
        </OverviewCard>
      </div>

      <div className="card-elevated p-5">
        <div className="mb-4 flex items-center gap-2">
          <TriangleAlert size={18} className="text-warning" />
          <h2 className="text-base font-700 text-foreground">Missing Configuration Warnings</h2>
        </div>
        {data.warnings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No warnings detected.</p>
        ) : (
          <div className="space-y-2">
            {data.warnings.map((warning) => (
              <div key={warning} className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
                {warning}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-elevated p-5">
        <h2 className="text-base font-700 text-foreground mb-4">Shortcuts</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {shortcutLinks.map((shortcut) => (
            <Link key={shortcut.href} href={shortcut.href} className="rounded-2xl border border-border px-4 py-4 text-sm text-foreground transition-colors hover:border-accent/40 hover:bg-accent/5">
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
                {shortcut.icon}
              </div>
              <p className="font-700">{shortcut.label}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
