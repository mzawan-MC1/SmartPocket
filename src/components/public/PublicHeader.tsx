'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AppLogo from '@/components/ui/AppLogo';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import TrackedAnalyticsLink from '@/components/analytics/TrackedAnalyticsLink';
import { getTranslatedPublicNavLabel } from '@/components/public/public-labels';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { shouldShowBrandTextBesideLogo } from '@/lib/platform-settings';
import { useLanguage } from '@/contexts/LanguageContext';

type FeaturedDocLink = { id: string; title: string; href: string };

function useFeaturedHeaderDocs(language: string): FeaturedDocLink[] {
  const [items, setItems] = useState<FeaturedDocLink[]>([]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/public/documentation/featured?slot=header&limit=4&lang=${encodeURIComponent(String(language || 'en'))}`,
          { cache: 'force-cache' as unknown as RequestCache }
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (Array.isArray(json?.articles)) {
          setItems(json.articles);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [language]);
  return items;
}

export default function PublicHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation(['common', 'public', 'portal']);
  const { language } = useLanguage();
  const { branding, publicUi } = usePlatformSettings();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);
  const showSingleLanguageTagline = language === 'en';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileDocsOpen, setMobileDocsOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const isHomePage = pathname === '/home' || pathname === '/';
  const searchKey = searchParams.toString();
  const featuredHeaderDocs = useFeaturedHeaderDocs(language);

  const DOCS_HREF = '/help/documentation';
  const DOCS_MENU_ID = 'hm-documentation';
  const headerMenuLinks = React.useMemo(
    () => publicUi.headerMenu.filter((l) => l.id !== DOCS_MENU_ID),
    [publicUi.headerMenu]
  );
  const docsMenuEntry = React.useMemo(
    () => publicUi.headerMenu.find((l) => l.id === DOCS_MENU_ID),
    [publicUi.headerMenu]
  );
  const docsMainLabel = docsMenuEntry?.label || t('documentation.title', { ns: 'portal', defaultValue: 'Documentation' });

  // Close mobile menu on route or query change
  useEffect(() => {
    setMobileOpen(false);
    setMobileDocsOpen(false);
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

  const [docsDropdownOpen, setDocsDropdownOpen] = useState(false);
  const dropdownWrapperRef = React.useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!docsDropdownOpen) return;
    const onDoc = (e: MouseEvent) => {
      const tgt = e.target as Node | null;
      if (dropdownWrapperRef.current && tgt && !dropdownWrapperRef.current.contains(tgt)) {
        setDocsDropdownOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDocsDropdownOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [docsDropdownOpen]);

  const headerClass = `${
    isHomePage
      ? 'border-b border-slate-200 bg-white shadow-sm'
      : 'border-b border-border bg-card/95 backdrop-blur-xl'
  } z-40 ${publicUi.stickyHeader ? 'sticky top-0' : 'relative'}`;

  const navLinkBase = (active: boolean) =>
    `px-3.5 py-2.5 rounded-xl text-sm font-600 transition-colors border ${
      active
        ? isHomePage
          ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
          : 'text-accent bg-accent/8 border-accent/15'
        : isHomePage
          ? 'border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950'
          : 'text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50'
    }`;

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
            {headerMenuLinks.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className={navLinkBase(isActive(item.href))}
              >
                {getTranslatedPublicNavLabel(item.href, item.label, t)}
              </Link>
            ))}
            {/* Documentation dropdown */}
            {docsMenuEntry ? (
              <div className="relative" ref={dropdownWrapperRef}>
                <button
                  type="button"
                  onClick={() => setDocsDropdownOpen((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      setDocsDropdownOpen(true);
                    }
                  }}
                  aria-haspopup="menu"
                  aria-expanded={docsDropdownOpen}
                  aria-controls="public-header-docs-menu"
                  className={`${navLinkBase(isActive(DOCS_HREF) || docsDropdownOpen)} inline-flex items-center gap-1.5`}
                >
                  <span>{docsMainLabel}</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${docsDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {docsDropdownOpen ? (
                  <div
                    id="public-header-docs-menu"
                    role="menu"
                    className="absolute right-0 top-[calc(100%+0.25rem)] z-50 w-[18rem] rounded-2xl border border-border bg-card p-2 shadow-card-lg"
                  >
                    <Link
                      role="menuitem"
                      href={DOCS_HREF}
                      onClick={() => setDocsDropdownOpen(false)}
                      className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-700 transition-colors ${
                        isActive(DOCS_HREF)
                          ? isHomePage
                            ? 'bg-cyan-50 text-cyan-700'
                            : 'text-accent bg-accent/8'
                          : isHomePage
                            ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                            : 'text-foreground hover:bg-muted/60'
                      }`}
                    >
                      <span>{docsMainLabel}</span>
                      <span className="text-[10px] font-700 uppercase tracking-[0.12em] opacity-60">
                        {t('documentation.badge', { ns: 'portal', defaultValue: 'Guides' })}
                      </span>
                    </Link>
                    {featuredHeaderDocs.length > 0 ? (
                      <div
                        className={`mt-1 flex flex-col gap-0.5 pt-1 ${
                          isHomePage ? 'border-t border-slate-100' : 'border-t border-border'
                        }`}
                      >
                        {featuredHeaderDocs.map((a) => (
                          <Link
                            role="menuitem"
                            key={`feat-${a.id}`}
                            href={a.href}
                            onClick={() => setDocsDropdownOpen(false)}
                            className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                              isHomePage
                                ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            <span className="line-clamp-2">{a.title}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
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
                <div className="max-h-[calc(100dvh-7.5rem)] overflow-y-auto pr-1 space-y-1">
                  {headerMenuLinks.map((item) => (
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
                      {getTranslatedPublicNavLabel(item.href, item.label, t)}
                    </Link>
                  ))}
                  {docsMenuEntry ? (
                    <div>
                      <button
                        type="button"
                        onClick={() => setMobileDocsOpen((v) => !v)}
                        aria-expanded={mobileDocsOpen}
                        aria-controls="public-mobile-docs-sub"
                        className={`flex w-full items-center justify-between gap-2 px-3.5 py-3 rounded-xl text-sm font-600 transition-colors ${
                          isActive(DOCS_HREF) || mobileDocsOpen
                            ? isHomePage
                              ? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
                              : 'text-accent bg-accent/8 border border-accent/15'
                            : isHomePage
                              ? 'border border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                              : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                        }`}
                      >
                        <span>{docsMainLabel}</span>
                        <ChevronDown
                          size={16}
                          className={`transition-transform ${mobileDocsOpen ? 'rotate-180' : ''}`}
                        />
                      </button>
                      {mobileDocsOpen ? (
                        <div
                          id="public-mobile-docs-sub"
                          className={`mt-1 mb-2 space-y-1 rounded-2xl border px-2 py-2 ${
                            isHomePage ? 'border-slate-200 bg-slate-50' : 'border-border bg-background'
                          }`}
                        >
                          <Link
                            href={DOCS_HREF}
                            onClick={() => setMobileOpen(false)}
                            className={`block rounded-xl px-3 py-2 text-sm font-700 transition-colors ${
                              isHomePage
                                ? 'text-cyan-700 hover:bg-white'
                                : 'text-accent hover:bg-card'
                            }`}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {docsMainLabel}
                              <span className="text-[10px] font-700 uppercase tracking-[0.12em] opacity-60">
                                {t('documentation.badge', { ns: 'portal', defaultValue: 'Guides' })}
                              </span>
                            </span>
                          </Link>
                          {featuredHeaderDocs.length > 0 ? (
                            <div
                              className={`mt-1 space-y-0.5 pt-1 ${
                                isHomePage ? 'border-t border-slate-200' : 'border-t border-border'
                              }`}
                            >
                              {featuredHeaderDocs.map((a) => (
                                <Link
                                  key={`feat-mobile-${a.id}`}
                                  href={a.href}
                                  onClick={() => setMobileOpen(false)}
                                  className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                                    isHomePage
                                      ? 'text-slate-600 hover:bg-white hover:text-slate-950'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-card'
                                  }`}
                                >
                                  <span className="line-clamp-2">{a.title}</span>
                                </Link>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
