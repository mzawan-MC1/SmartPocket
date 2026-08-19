'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail, MapPin, Phone } from 'lucide-react';
import FooterLegalLine from '@/components/footer/FooterLegalLine';
import { useTranslation } from 'react-i18next';
import {
  getTranslatedFooterSectionTitle,
  getTranslatedPublicNavLabel,
} from '@/components/public/public-labels';
import AppLogo from '@/components/ui/AppLogo';
import { trackContactClick } from '@/lib/analytics';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import {
  isDefaultPublicContactAddress,
  shouldShowBrandTextBesideLogo,
} from '@/lib/platform-settings';
import { useLanguage } from '@/contexts/LanguageContext';

function isExternalHref(href: string) {
  try {
    if (/^https?:\/\//i.test(href)) {
      return true;
    }
    const normalized = href.trim().toLowerCase();
    return normalized.startsWith('http:') || normalized.startsWith('https:') || normalized.startsWith('//');
  } catch {
    return false;
  }
}

function isInternalAnchor(href: string) {
  if (!href || typeof href !== 'string') return false;
  const clean = href.trim();
  return (
    clean.startsWith('/') ||
    clean.startsWith('#') ||
    clean.startsWith('?') ||
    clean.startsWith('.')
  );
}

// Social icon components using SVG to avoid lucide-react version issues
function TwitterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function LinkedinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

export default function PublicFooter() {
  const pathname = usePathname();
  const { t } = useTranslation('public');
  const { language } = useLanguage();
  const { branding, publicUi } = usePlatformSettings();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);
  const showSingleLanguageFooterTagline = language === 'en';
  const contactEmail = publicUi.contactEmail;
  const footerSections = publicUi.footerSections ?? [];
  const isHomePage = pathname === '/home' || pathname === '/';
  const isAuthPage = pathname === '/sign-up-login';
  const contactSectionClasses = `mt-4 space-y-2 text-sm ${isHomePage ? 'text-slate-300' : 'text-muted-foreground'} ${isAuthPage ? 'hidden sm:block' : ''}`;
  const linkClasses = isHomePage
    ? 'text-sm leading-relaxed break-words text-slate-400 transition-colors hover:text-white'
    : 'text-sm leading-relaxed break-words text-muted-foreground hover:text-foreground transition-colors';

  const [featuredFooterDocs, setFeaturedFooterDocs] = React.useState<Array<{ id: string; title: string; href: string }>>([]);
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/public/documentation/featured?slot=footer&limit=4&lang=${encodeURIComponent(String(language || 'en'))}`,
          { cache: 'force-cache' as unknown as RequestCache }
        );
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (Array.isArray(json?.articles)) {
          setFeaturedFooterDocs(json.articles);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [language]);

  return (
    <footer
      className={isHomePage ? 'border-t border-white/10 bg-[#041229] text-white' : 'border-t border-border bg-card/95 backdrop-blur-sm'}
      suppressHydrationWarning
    >
      <div className={`page-shell ${isAuthPage ? 'py-5 sm:py-8' : 'py-8 md:py-10'}`}>
        <div className={`grid ${isAuthPage ? 'gap-5 sm:gap-8 md:gap-10 lg:gap-12' : 'gap-8 md:gap-10 lg:gap-12'} md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))]`}>
          <div className="max-w-none">
            <Link href="/" className="inline-flex items-center gap-3">
              <AppLogo
                width={224}
                height={56}
                imageClassName="h-11 w-auto max-w-[168px] sm:h-12 sm:max-w-[200px] lg:h-14 lg:max-w-[224px]"
              />
              {showBrandText && (
                <div className="min-w-0">
                  <span className={`block font-800 text-sm tracking-tight ${isHomePage ? 'text-white' : 'text-primary'}`}>
                    {publicUi.footerCompanyName || branding.appName}
                  </span>
                  {showSingleLanguageFooterTagline && publicUi.footerTagline ? (
                    <span className={`block mt-1 text-xs break-words ${isHomePage ? 'text-slate-400' : 'text-muted-foreground'}`}>
                      {publicUi.footerTagline}
                    </span>
                  ) : null}
                </div>
              )}
            </Link>
            {!showBrandText && showSingleLanguageFooterTagline && publicUi.footerTagline && (
              <p className={`mt-3 text-sm leading-relaxed break-words ${isHomePage ? 'text-slate-400' : 'text-muted-foreground'}`}>
                {publicUi.footerTagline}
              </p>
            )}
            <div className={contactSectionClasses}>
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  onClick={() => trackContactClick({ source: 'public_footer_email' })}
                  className={isHomePage ? 'inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200 break-words' : 'inline-flex items-center gap-2 text-accent hover:underline break-words'}
                >
                  <Mail size={13} />
                  <span className="min-w-0 break-words">{contactEmail}</span>
                </a>
              )}
              {publicUi.contactPhone && (
                <a
                  href={`tel:${publicUi.contactPhone}`}
                  onClick={() => trackContactClick({ source: 'public_footer_phone' })}
                  className={isHomePage ? 'flex items-center gap-2 transition-colors hover:text-white break-words' : 'flex items-center gap-2 hover:text-foreground transition-colors break-words'}
                >
                  <Phone size={13} />
                  <span className="min-w-0 break-words">
                    {publicUi.contactPhoneFormatted || publicUi.contactPhone}
                  </span>
                </a>
              )}
              {publicUi.contactAddress && (
                <p className="flex items-start gap-2 leading-relaxed break-words">
                  <MapPin size={13} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 break-words">
                    {isDefaultPublicContactAddress(publicUi.contactAddress)
                      ? t('footer.contactAddress', { defaultValue: publicUi.contactAddress })
                      : publicUi.contactAddress}
                  </span>
                </p>
              )}
            </div>
            <div className={`mt-4 flex flex-wrap items-center gap-2 ${isAuthPage ? 'hidden sm:flex' : ''}`}>
              {publicUi.socialTwitter && (
                <a href={publicUi.socialTwitter} target="_blank" rel="noopener noreferrer" className={isHomePage ? 'p-2 rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white' : 'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'} aria-label={t('footer.social.twitter')}>
                  <TwitterIcon size={15} />
                </a>
              )}
              {publicUi.socialGithub && (
                <a href={publicUi.socialGithub} target="_blank" rel="noopener noreferrer" className={isHomePage ? 'p-2 rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white' : 'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'} aria-label={t('footer.social.github')}>
                  <GithubIcon size={15} />
                </a>
              )}
              {publicUi.socialLinkedin && (
                <a href={publicUi.socialLinkedin} target="_blank" rel="noopener noreferrer" className={isHomePage ? 'p-2 rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white' : 'p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors'} aria-label={t('footer.social.linkedin')}>
                  <LinkedinIcon size={15} />
                </a>
              )}
            </div>
          </div>

          <div className={`hidden lg:contents`}>
            {footerSections.map((section) => (
              <div key={section.id} className={`min-w-0 ${isAuthPage ? 'hidden sm:block' : ''}`}>
                <p className={`mb-3 text-[11px] font-800 uppercase tracking-[0.16em] break-words ${isHomePage ? 'text-slate-200' : 'text-foreground'}`}>
                  {getTranslatedFooterSectionTitle(section.id, section.title, t)}
                </p>
                <ul className="space-y-2.5 sm:space-y-2">
                  {section.links.map((link) => {
                    const normalizedHref = (link.href || '').trim();
                    const label = getTranslatedPublicNavLabel(link.href, link.label, t);
                    const isContactClick = normalizedHref === '/contact';
                    const external = isExternalHref(normalizedHref);
                    const internal = !external && isInternalAnchor(normalizedHref);

                    if (external) {
                      return (
                        <li key={link.id}>
                          <a
                            href={normalizedHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={isContactClick ? () => trackContactClick({ source: 'public_footer_nav' }) : undefined}
                            className={linkClasses}
                          >
                            {label}
                          </a>
                        </li>
                      );
                    }

                    if (internal) {
                      return (
                        <li key={link.id}>
                          <Link
                            href={normalizedHref}
                            onClick={isContactClick ? () => trackContactClick({ source: 'public_footer_nav' }) : undefined}
                            className={linkClasses}
                          >
                            {label}
                          </Link>
                        </li>
                      );
                    }

                    return (
                      <li key={link.id}>
                        <a
                          href={normalizedHref || '#'}
                          onClick={isContactClick ? () => trackContactClick({ source: 'public_footer_nav' }) : undefined}
                          className={linkClasses}
                        >
                          {label}
                        </a>
                      </li>
                    );
                  })}
                  {section.id === 'footer-section-learn' &&
                    featuredFooterDocs.map((f, idx) => (
                      <li key={`feat-${idx}-${f.id}`}>
                        <Link href={f.href} className={linkClasses}>
                          {f.title}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>

          <div className={`lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-10 ${isAuthPage ? 'hidden sm:grid' : ''}`}>
            {footerSections.map((section) => (
              <div key={section.id} className="min-w-0">
                <p className={`mb-3 text-[11px] font-800 uppercase tracking-[0.16em] break-words ${isHomePage ? 'text-slate-200' : 'text-foreground'}`}>
                  {getTranslatedFooterSectionTitle(section.id, section.title, t)}
                </p>
                <ul className="space-y-2.5 sm:space-y-2">
                  {section.links.map((link) => {
                    const normalizedHref = (link.href || '').trim();
                    const label = getTranslatedPublicNavLabel(link.href, link.label, t);
                    const isContactClick = normalizedHref === '/contact';
                    const external = isExternalHref(normalizedHref);
                    const internal = !external && isInternalAnchor(normalizedHref);

                    if (external) {
                      return (
                        <li key={link.id}>
                          <a
                            href={normalizedHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={isContactClick ? () => trackContactClick({ source: 'public_footer_nav' }) : undefined}
                            className={linkClasses}
                          >
                            {label}
                          </a>
                        </li>
                      );
                    }

                    if (internal) {
                      return (
                        <li key={link.id}>
                          <Link
                            href={normalizedHref}
                            onClick={isContactClick ? () => trackContactClick({ source: 'public_footer_nav' }) : undefined}
                            className={linkClasses}
                          >
                            {label}
                          </Link>
                        </li>
                      );
                    }

                    return (
                      <li key={link.id}>
                        <a
                          href={normalizedHref || '#'}
                          onClick={isContactClick ? () => trackContactClick({ source: 'public_footer_nav' }) : undefined}
                          className={linkClasses}
                        >
                          {label}
                        </a>
                      </li>
                    );
                  })}
                  {section.id === 'footer-section-learn' &&
                    featuredFooterDocs.map((f, idx) => (
                      <li key={`feat-sm-${idx}-${f.id}`}>
                        <Link href={f.href} className={linkClasses}>
                          {f.title}
                        </Link>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className={`mt-8 flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between ${isHomePage ? 'border-t border-white/10' : 'border-t border-border'}`}>
          <FooterLegalLine />
        </div>
      </div>
    </footer>
  );
}
