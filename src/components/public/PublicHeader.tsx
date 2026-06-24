'use client';
import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppLogo from '@/components/ui/AppLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { shouldShowBrandTextBesideLogo } from '@/lib/platform-settings';
import { useLanguage } from '@/contexts/LanguageContext';

function getTranslatedNavLabel(href: string, fallback: string, t: (key: string, options?: Record<string, unknown>) => string) {
  switch (href) {
    case '/home#about':
      return t('footer.linkAbout', { ns: 'public', defaultValue: fallback });
    case '/home#features':
      return t('footer.linkFeatures', { ns: 'public', defaultValue: fallback });
    case '/home#pricing':
      return t('footer.linkPricing', { ns: 'public', defaultValue: fallback });
    case '/contact':
      return t('footer.linkContact', { ns: 'public', defaultValue: fallback });
    case '/privacy':
      return t('footer.privacy', { ns: 'public', defaultValue: fallback });
    case '/terms':
      return t('footer.terms', { ns: 'public', defaultValue: fallback });
    case '/help':
      return t('footer.linkHelp', { ns: 'public', defaultValue: fallback });
    default:
      return fallback;
  }
}

export default function PublicHeader() {
  const pathname = usePathname();
  const { t } = useTranslation(['common', 'public']);
  const { language } = useLanguage();
  const { branding, publicUi } = usePlatformSettings();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);
  const showSingleLanguageTagline = language === 'en';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState('');
  const mobileRef = useRef<HTMLDivElement>(null);
  const isHomePage = pathname === '/home' || pathname === '/';

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

  useEffect(() => {
    const syncHash = () => {
      setCurrentHash(window.location.hash.toLowerCase());
    };

    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '/home';

    if (href.startsWith('/home#')) {
      const [, hash = ''] = href.split('#');
      return pathname === '/home' && currentHash === `#${hash.toLowerCase()}`;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const headerClass = `${isHomePage ? 'border-b border-white/10 bg-[#041229]/88 text-white' : 'border-b border-border bg-card/95'} backdrop-blur-xl z-40 ${publicUi.stickyHeader ? 'sticky top-0' : 'relative'}`;

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
                {showSingleLanguageTagline && branding.tagline ? (
                  <span className="hidden lg:block text-xs text-muted-foreground truncate">
                    {branding.tagline}
                  </span>
                ) : null}
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
                    ? isHomePage
                      ? 'border-cyan-300/25 bg-cyan-300/10 text-cyan-200'
                      : 'text-accent bg-accent/8 border-accent/15'
                    : isHomePage
                      ? 'border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                      : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {getTranslatedNavLabel(item.href, item.label, t)}
              </Link>
            ))}
          </nav>

          {/* Desktop right actions */}
          <div className="hidden md:flex items-center gap-2">
            <LanguageSwitcher variant="compact" />
            <Link
              href="/sign-up-login?mode=login"
              className={`text-sm px-3 py-2 rounded-xl transition-colors ${isHomePage ? 'text-slate-300 hover:bg-white/5 hover:text-white' : 'btn-ghost text-muted-foreground hover:text-foreground'}`}
            >
              {t('nav.signIn', { ns: 'common' })}
            </Link>
            <Link
              href="/sign-up-login?mode=signup"
              className={isHomePage ? 'inline-flex items-center rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-2 text-sm font-700 text-slate-950 shadow-[0_12px_30px_rgba(34,211,238,0.18)]' : 'btn-primary text-sm py-2 px-4'}
            >
              {t('nav.signUp', { ns: 'common' })}
            </Link>
          </div>

          {/* Mobile: language + hamburger */}
          <div className="flex md:hidden items-center gap-2">
            <LanguageSwitcher variant="compact" />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`p-2.5 rounded-xl transition-colors ${isHomePage ? 'text-slate-300 hover:bg-white/5 hover:text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              aria-label={mobileOpen ? t('header.closeMenu', { ns: 'public' }) : t('header.openMenu', { ns: 'public' })}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className={`md:hidden py-4 space-y-1 pb-4 ${isHomePage ? 'border-t border-white/10' : 'border-t border-border'}`}>
            {showBrandText && (
              <div className="px-3.5 pb-3">
                <p className={`text-sm font-700 ${isHomePage ? 'text-white' : 'text-primary'}`}>{branding.appName}</p>
                {showSingleLanguageTagline && branding.tagline ? (
                  <p className={`mt-1 text-xs ${isHomePage ? 'text-slate-400' : 'text-muted-foreground'}`}>{branding.tagline}</p>
                ) : null}
              </div>
            )}
            {publicUi.headerMenu.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`block px-3.5 py-3 rounded-xl text-sm font-600 transition-colors ${
                  isActive(item.href)
                    ? isHomePage
                      ? 'border border-cyan-300/20 bg-cyan-300/10 text-cyan-200'
                      : 'text-accent bg-accent/8 border border-accent/15'
                    : isHomePage
                      ? 'border border-transparent text-slate-300 hover:bg-white/5 hover:text-white'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                }`}
              >
                {getTranslatedNavLabel(item.href, item.label, t)}
              </Link>
            ))}
            <div className={`pt-3 flex flex-col gap-2 ${isHomePage ? 'border-t border-white/10' : 'border-t border-border'}`}>
              <Link
                href="/sign-up-login?mode=login"
                className={isHomePage ? 'inline-flex justify-center rounded-xl border border-white/15 bg-white/5 py-2.5 text-sm font-700 text-white' : 'btn-secondary text-sm py-2.5 justify-center'}
              >
                {t('nav.signIn', { ns: 'common' })}
              </Link>
              <Link
                href="/sign-up-login?mode=signup"
                className={isHomePage ? 'inline-flex justify-center rounded-xl bg-gradient-to-r from-cyan-400 to-sky-500 py-2.5 text-sm font-700 text-slate-950' : 'btn-primary text-sm py-2.5 justify-center'}
              >
                {t('header.getStartedFree', { ns: 'public' })}
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
