'use client';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { getPlatformSettings } from '@/lib/finance';

interface MenuItem {
  id: string;
  label: string;
  href: string;
}

interface HeaderSettings {
  app_name: string;
  header_menu: MenuItem[];
  sticky_header?: boolean;
}

const DEFAULT_MENU: MenuItem[] = [
  { id: 'hm-about', label: 'About', href: '/about' },
  { id: 'hm-features', label: 'Features', href: '/features' },
  { id: 'hm-pricing', label: 'Pricing', href: '/pricing' },
  { id: 'hm-contact', label: 'Contact', href: '/contact' },
];

export default function PublicHeader() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<HeaderSettings>({
    app_name: 'Smart Pocket',
    header_menu: DEFAULT_MENU,
    sticky_header: true,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setSettings({
            app_name: data.app_name || 'Smart Pocket',
            header_menu:
              Array.isArray(data.header_menu) && data.header_menu.length > 0
                ? (data.header_menu as MenuItem[])
                : DEFAULT_MENU,
            sticky_header: data.sticky_header !== false,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Close mobile menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mobileRef.current && !mobileRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    if (mobileOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mobileOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const headerClass = `border-b border-border bg-card/95 backdrop-blur-sm z-40 ${settings.sticky_header ? 'sticky top-0' : 'relative'}`;

  return (
    <header className={headerClass} ref={mobileRef}>
      <div className="page-shell">
        <div className="flex items-center justify-between h-[4.5rem]">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
            <AppLogo size={32} />
            <span className="font-700 text-base text-primary">{settings.app_name}</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1.5">
            {settings.header_menu.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`px-3.5 py-2.5 rounded-xl text-sm font-600 transition-colors border ${
                  isActive(item.href)
                    ? 'text-accent bg-accent/8 border-accent/15'
                    : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Desktop right actions */}
          <div className="hidden md:flex items-center gap-2">
            <LanguageSwitcher variant="compact" />
            <Link
              href="/sign-up-login"
              className="btn-ghost text-sm px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              Sign In
            </Link>
            <Link href="/sign-up-login" className="btn-primary text-sm py-2 px-4">
              Get Started
            </Link>
          </div>

          {/* Mobile: language + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <LanguageSwitcher variant="compact" />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="p-2.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border py-4 space-y-1 pb-4">
            {settings.header_menu.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`block px-3.5 py-3 rounded-xl text-sm font-600 transition-colors ${
                  isActive(item.href)
                    ? 'text-accent bg-accent/8 border border-accent/15'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                }`}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-border flex flex-col gap-2">
              <Link href="/sign-up-login" className="btn-secondary text-sm py-2.5 justify-center">
                Sign In
              </Link>
              <Link href="/sign-up-login" className="btn-primary text-sm py-2.5 justify-center">
                Get Started Free
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
