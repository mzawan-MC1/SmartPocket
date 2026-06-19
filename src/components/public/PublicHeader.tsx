'use client';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { shouldShowBrandTextBesideLogo } from '@/lib/platform-settings';

export default function PublicHeader() {
  const pathname = usePathname();
  const { branding, publicUi } = usePlatformSettings();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

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
    if (href.startsWith('/#')) return false;
    return pathname.startsWith(href);
  };

  const headerClass = `border-b border-border bg-card/95 backdrop-blur-sm z-40 ${publicUi.stickyHeader ? 'sticky top-0' : 'relative'}`;

  return (
    <header className={headerClass} ref={mobileRef}>
      <div className="page-shell">
        <div className="flex items-center justify-between gap-4 min-h-[5rem] py-3">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 flex-shrink-0 min-w-0">
            <AppLogo
              width={236}
              height={56}
              imageClassName="h-10 w-auto max-w-[172px] sm:h-11 sm:max-w-[208px] lg:h-12 lg:max-w-[236px]"
            />
            {showBrandText && (
              <div className="min-w-0">
                <span className="block font-700 text-base text-primary truncate">{branding.appName}</span>
                <span className="hidden lg:block text-xs text-muted-foreground truncate">
                  {branding.tagline}
                </span>
              </div>
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1.5">
            {publicUi.headerMenu.map((item) => (
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
              href="/sign-up-login?mode=login"
              className="btn-ghost text-sm px-3 py-2 text-muted-foreground hover:text-foreground"
            >
              Sign In
            </Link>
            <Link href="/sign-up-login?mode=signup" className="btn-primary text-sm py-2 px-4">
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
            {showBrandText && (
              <div className="px-3.5 pb-3">
                <p className="text-sm font-700 text-primary">{branding.appName}</p>
                <p className="text-xs text-muted-foreground mt-1">{branding.tagline}</p>
              </div>
            )}
            {publicUi.headerMenu.map((item) => (
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
              <Link href="/sign-up-login?mode=login" className="btn-secondary text-sm py-2.5 justify-center">
                Sign In
              </Link>
              <Link href="/sign-up-login?mode=signup" className="btn-primary text-sm py-2.5 justify-center">
                Get Started Free
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
