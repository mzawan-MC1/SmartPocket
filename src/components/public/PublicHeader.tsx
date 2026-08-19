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
import { shouldShowBrandTextBesideLogo, type PlatformNavLink } from '@/lib/platform-settings';
import { useLanguage } from '@/contexts/LanguageContext';

export default function PublicHeader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useTranslation(['common', 'public', 'portal']);
  const { language } = useLanguage();
  const { branding, publicUi } = usePlatformSettings();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);
  const showSingleLanguageTagline = language === 'en';
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileParentOpen, setMobileParentOpen] = useState<Record<string, boolean>>({});
  const [currentHash, setCurrentHash] = useState('');
  const [isScrolled, setIsScrolled] = useState(false);
  const isHomePage = pathname === '/home' || pathname === '/';
  const searchKey = searchParams.toString();

  const headerMenuLinks = React.useMemo(() => publicUi.headerMenu, [publicUi.headerMenu]);

  // Close mobile menu on route or query change
  useEffect(() => {
    setMobileOpen(false);
    setMobileParentOpen({});
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

  const hasChildren = (item: PlatformNavLink) =>
    Array.isArray(item.children) && item.children.length > 0;

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownWrapperRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!openDropdown) return;
    const onDoc = (e: MouseEvent) => {
      const tgt = e.target as Node | null;
      const wrapper = dropdownWrapperRefs.current[openDropdown];
      if (wrapper && tgt && !wrapper.contains(tgt)) {
        setOpenDropdown(null);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [openDropdown]);

  const toggleDropdown = (id: string) => {
    setOpenDropdown((prev) => (prev === id ? null : id));
  };

  const toggleMobileParent = (id: string) => {
    setMobileParentOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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
            {headerMenuLinks.map((item) => {
              const withChildren = hasChildren(item);
              const dropdownId = `header-dropdown-${item.id}`;
              const isOpen = openDropdown === item.id;
              if (withChildren) {
                return (
                  <div
                    key={item.id}
                    className="relative"
                    ref={(el) => {
                      dropdownWrapperRefs.current[item.id] = el;
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleDropdown(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') setOpenDropdown(item.id);
                      }}
                      aria-haspopup="menu"
                      aria-expanded={isOpen}
                      aria-controls={dropdownId}
                      className={`${navLinkBase(isActive(item.href) || isOpen)} inline-flex items-center gap-1.5`}
                    >
                      <span>{getTranslatedPublicNavLabel(item.href, item.label, t)}</span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {isOpen ? (
                      <div
                        id={dropdownId}
                        role="menu"
                        className="absolute right-0 top-[calc(100%+0.25rem)] z-50 w-[18rem] rounded-2xl border border-border bg-card p-2 shadow-card-lg"
                      >
                        <Link
                          role="menuitem"
                          href={item.href}
                          onClick={() => setOpenDropdown(null)}
                          className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm font-700 transition-colors ${
                            isActive(item.href)
                              ? isHomePage
                                ? 'bg-cyan-50 text-cyan-700'
                                : 'text-accent bg-accent/8'
                              : isHomePage
                                ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                                : 'text-foreground hover:bg-muted/60'
                          }`}
                        >
                          <span>{getTranslatedPublicNavLabel(item.href, item.label, t)}</span>
                          <span className="text-[10px] font-700 uppercase tracking-[0.12em] opacity-60">
                            {t('documentation.badge', { ns: 'portal', defaultValue: 'Overview' })}
                          </span>
                        </Link>
                        {item.children && item.children.length > 0 ? (
                          <div
                            className={`mt-1 flex flex-col gap-0.5 pt-1 ${
                              isHomePage ? 'border-t border-slate-100' : 'border-t border-border'
                            }`}
                          >
                            {item.children.map((child) => (
                              <Link
                                role="menuitem"
                                key={child.id}
                                href={child.href}
                                onClick={() => setOpenDropdown(null)}
                                className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                                  isHomePage
                                    ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                }`}
                              >
                                <span className="line-clamp-2">
                                  {getTranslatedPublicNavLabel(child.href, child.label, t)}
                                </span>
                              </Link>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              }
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className={navLinkBase(isActive(item.href))}
                >
                  {getTranslatedPublicNavLabel(item.href, item.label, t)}
                </Link>
              );
            })}
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
                  {headerMenuLinks.map((item) => {
                    const withChildren = hasChildren(item);
                    const mobileChildOpen = Boolean(mobileParentOpen[item.id]);
                    if (withChildren) {
                      return (
                        <div key={item.id}>
                          <button
                            type="button"
                            onClick={() => toggleMobileParent(item.id)}
                            aria-expanded={mobileChildOpen}
                            aria-controls={`public-mobile-sub-${item.id}`}
                            className={`flex w-full items-center justify-between gap-2 px-3.5 py-3 rounded-xl text-sm font-600 transition-colors ${
                              isActive(item.href) || mobileChildOpen
                                ? isHomePage
                                  ? 'border border-cyan-200 bg-cyan-50 text-cyan-700'
                                  : 'text-accent bg-accent/8 border border-accent/15'
                                : isHomePage
                                  ? 'border border-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent'
                            }`}
                          >
                            <span>{getTranslatedPublicNavLabel(item.href, item.label, t)}</span>
                            <ChevronDown
                              size={16}
                              className={`transition-transform ${mobileChildOpen ? 'rotate-180' : ''}`}
                            />
                          </button>
                          {mobileChildOpen ? (
                            <div
                              id={`public-mobile-sub-${item.id}`}
                              className={`mt-1 mb-2 space-y-1 rounded-2xl border px-2 py-2 ${
                                isHomePage ? 'border-slate-200 bg-slate-50' : 'border-border bg-background'
                              }`}
                            >
                              <Link
                                href={item.href}
                                onClick={() => setMobileOpen(false)}
                                className={`block rounded-xl px-3 py-2 text-sm font-700 transition-colors ${
                                  isHomePage
                                    ? 'text-cyan-700 hover:bg-white'
                                    : 'text-accent hover:bg-card'
                                }`}
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  {getTranslatedPublicNavLabel(item.href, item.label, t)}
                                  <span className="text-[10px] font-700 uppercase tracking-[0.12em] opacity-60">
                                    {t('documentation.badge', { ns: 'portal', defaultValue: 'Overview' })}
                                  </span>
                                </span>
                              </Link>
                              {item.children && item.children.length > 0 ? (
                                <div
                                  className={`mt-1 space-y-0.5 pt-1 ${
                                    isHomePage ? 'border-t border-slate-200' : 'border-t border-border'
                                  }`}
                                >
                                  {item.children.map((child) => (
                                    <Link
                                      key={child.id}
                                      href={child.href}
                                      onClick={() => setMobileOpen(false)}
                                      className={`block rounded-xl px-3 py-2 text-sm transition-colors ${
                                        isHomePage
                                          ? 'text-slate-600 hover:bg-white hover:text-slate-950'
                                          : 'text-muted-foreground hover:text-foreground hover:bg-card'
                                      }`}
                                    >
                                      <span className="line-clamp-2">
                                        {getTranslatedPublicNavLabel(child.href, child.label, t)}
                                      </span>
                                    </Link>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    }
                    return (
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
                    );
                  })}
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

