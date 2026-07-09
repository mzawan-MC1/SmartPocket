'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppLogo from '@/components/ui/AppLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import TrackedAnalyticsLink from '@/components/analytics/TrackedAnalyticsLink';
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
    case '/faqs':
      return t('footer.linkFaqs', { ns: 'public', defaultValue: fallback });
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
  const searchParams = useSearchParams();
  const { t } = useTranslation(['common', 'public']);
  const { language } = useLanguage();
  const { branding, publicUi } = usePlatformSettings();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);
  const showSingleLanguageTagline = language === 'en';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const isHomePage = pathname === '/home' || pathname === '/';
  const searchKey = searchParams.toString();

  // Close mobile menu on route or query change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchKey]);

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  useEffect(() => {
    const syncHash = () => {
      setCurrentHash(window.location.hash.toLowerCase());
    };

    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [pathname]);

  useEffect(() => {
    if (!isHomePage) {
      setIsScrolled(false);
      return;
    }

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 16);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHomePage]);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/' || pathname === '/home';

    if (href.startsWith('/home#')) {
      const [, hash = ''] = href.split('#');
      return pathname === '/home' && currentHash === `#${hash.toLowerCase()}`;
    }

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const headerClass = `${
    isHomePage
      ? 'border-b border-slate-200 bg-white shadow-sm'
      : 'border-b border-border bg-card/95 backdrop-blur-xl'
  } z-40 ${publicUi.stickyHeader ? 'sticky top-0' : 'relative'}`;

  return (
    <header className={headerClass} suppressHydrationWarning>
      <div className="page-shell">
        <div className="flex min-h-[5rem] items-center justify-between gap-3 py-3 max-[480px]:gap-2">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 flex-shrink-0 min-w-0">
            <AppLogo
              width={236}
              height={56}
              imageClassName="h-10 w-auto max-w-[156px] sm:h-11 sm:max-w-[188px] lg:h-12 lg:max-w-[212px] xl:max-w-[236px]"
            />
            {showBrandText && (
              <div className="min-w-0">
                <span className={`block truncate text-base font-700 ${isHomePage ? 'text-primary' : 'text-primary'}`}>{branding.appName}</span>
                {showSingleLanguageTagline && branding.tagline ? (
                  <span className={`hidden truncate text-xs lg:block ${isHomePage ? 'text-slate-500' : 'text-muted-foreground'}`}>
                    {branding.tagline}
                  </span>
                ) : null}
              </div>
            )}
          </Link>

          {/* Desktop nav */}
          <nav className="hidden xl:flex items-center gap-1.5">
            {publicUi.headerMenu.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={`px-3.5 py-2.5 rounded-xl text-sm font-600 transition-colors border ${
                  isActive(item.href)
                    ? isHomePage
                      ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                      : 'text-accent bg-accent/8 border-accent/15'
                    : isHomePage
                      ? 'border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                      : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
                }`}
              >
                {getTranslatedNavLabel(item.href, item.label, t)}
              </Link>
            ))}
          </nav>

          {/* Desktop right actions */}
          <div className="hidden xl:flex items-center gap-2">
            <LanguageSwitcher
              variant="compact"
              theme={isHomePage ? 'light' : 'default'}
            />
            <Link
              href="/sign-up-login?mode=login"
              className={`text-sm px-3 py-2 rounded-xl transition-colors ${isHomePage ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950' : 'btn-ghost text-muted-foreground hover:text-foreground'}`}
            >
              {t('nav.signIn', { ns: 'common' })}
            </Link>
            <TrackedAnalyticsLink
              href="/sign-up-login?mode=signup"
              eventName="sp_signup_click"
              eventParams={{ source: 'public_header_desktop' }}
              className={isHomePage ? 'inline-flex items-center rounded-xl bg-cyan-500 px-4 py-2 text-sm font-700 text-white shadow-sm transition-colors hover:bg-cyan-600' : 'btn-primary text-sm py-2 px-4'}
            >
              {t('nav.signUp', { ns: 'common' })}
            </TrackedAnalyticsLink>
          </div>

          {/* Mobile: language + hamburger */}
          <div className="flex xl:hidden items-center gap-2">
            <LanguageSwitcher
              variant="compact"
              theme={isHomePage ? 'light' : 'default'}
            />
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className={`p-2.5 rounded-xl transition-colors ${isHomePage ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              aria-label={mobileOpen ? t('header.closeMenu', { ns: 'public' }) : t('header.openMenu', { ns: 'public' })}
              aria-expanded={mobileOpen}
              aria-controls="public-mobile-menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <>
            <button
              type="button"
              aria-label={t('header.closeMenu', { ns: 'public' })}
              className="fixed inset-0 top-20 z-40 bg-slate-950/35 backdrop-blur-[1px] xl:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <div
              id="public-mobile-menu"
              className="fixed inset-x-4 top-[5.5rem] z-50 xl:hidden"
            >
              <div className={`space-y-1 rounded-3xl border p-4 shadow-card-lg ${isHomePage ? 'border-slate-200 bg-white' : 'border-border bg-card'}`}>
                {showBrandText && (
                  <div className="px-1 pb-3">
                    <p className="text-sm font-700 text-primary">{branding.appName}</p>
                    {showSingleLanguageTagline && branding.tagline ? (
                      <p className={`mt-1 text-xs ${isHomePage ? 'text-slate-500' : 'text-muted-foreground'}`}>{branding.tagline}</p>
                    ) : null}
                  </div>
                )}
                <div className="max-h-[calc(100dvh-7.5rem)] overflow-y-auto pr-1">
                  {publicUi.headerMenu.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`block px-3.5 py-3 rounded-xl text-sm font-600 transition-colors ${
                        isActive(item.href)
                          ? isHomePage
                            ? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
                            : 'text-accent bg-accent/8 border border-accent/15'
                          : isHomePage
                            ? 'border border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                      }`}
                    >
                      {getTranslatedNavLabel(item.href, item.label, t)}
                    </Link>
                  ))}
                  <div className={`mt-3 flex flex-col gap-2 pt-3 ${isHomePage ? 'border-t border-slate-200' : 'border-t border-border'}`}>
                    <Link
                      href="/sign-up-login?mode=login"
                      onClick={() => setMobileOpen(false)}
                      className={isHomePage ? 'inline-flex justify-center rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-700 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950' : 'btn-secondary text-sm py-2.5 justify-center'}
                    >
                      {t('nav.signIn', { ns: 'common' })}
                    </Link>
                    <TrackedAnalyticsLink
                      href="/sign-up-login?mode=signup"
                      eventName="sp_signup_click"
                      eventParams={{ source: 'public_header_mobile' }}
                      onClick={() => setMobileOpen(false)}
                      className={isHomePage ? 'inline-flex justify-center rounded-xl bg-cyan-500 py-2.5 text-sm font-700 text-white transition-colors hover:bg-cyan-600' : 'btn-primary text-sm py-2.5 justify-center'}
                    >
                      {t('nav.signUp', { ns: 'common' })}
                    </TrackedAnalyticsLink>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
