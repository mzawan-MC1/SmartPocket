'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail, MapPin, Phone } from 'lucide-react';
import FooterLegalLine from '@/components/footer/FooterLegalLine';
import { useTranslation } from 'react-i18next';
import AppLogo from '@/components/ui/AppLogo';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';
import { shouldShowBrandTextBesideLogo } from '@/lib/platform-settings';
import { useLanguage } from '@/contexts/LanguageContext';

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

function getFooterSectionTitle(sectionId: string, fallback: string, t: (key: string, options?: Record<string, unknown>) => string) {
  switch (sectionId) {
    case 'fs-product':
      return t('footer.sectionProduct', { defaultValue: fallback });
    case 'fs-support':
      return t('footer.sectionSupport', { defaultValue: fallback });
    case 'fs-legal':
      return t('footer.sectionLegal', { defaultValue: fallback });
    default:
      return fallback;
  }
}

function getFooterLinkLabel(href: string, fallback: string, t: (key: string, options?: Record<string, unknown>) => string) {
  switch (href) {
    case '/home#about':
      return t('footer.linkAbout', { defaultValue: fallback });
    case '/home#features':
      return t('footer.linkFeatures', { defaultValue: fallback });
    case '/home#pricing':
      return t('footer.linkPricing', { defaultValue: fallback });
    case '/contact':
      return t('footer.linkContact', { defaultValue: fallback });
    case '/privacy':
      return t('footer.privacy', { defaultValue: fallback });
    case '/terms':
      return t('footer.terms', { defaultValue: fallback });
    case '/help':
      return t('footer.linkHelp', { defaultValue: fallback });
    default:
      return fallback;
  }
}

export default function PublicFooter() {
  const pathname = usePathname();
  const { t } = useTranslation('public');
  const { language } = useLanguage();
  const { branding, publicUi } = usePlatformSettings();
  const showBrandText = shouldShowBrandTextBesideLogo(branding.logoUrl);
  const showSingleLanguageFooterTagline = language === 'en';
  const contactEmail = publicUi.contactEmail;
  const legalSection = publicUi.footerSections.find(
    (section) => section.title.trim().toLowerCase() === 'legal'
  );
  const legalLinks = legalSection?.links ?? [];
  const topSections = publicUi.footerSections.filter((section) => section.id !== legalSection?.id);
  const isHomePage = pathname === '/home' || pathname === '/';

  return (
    <footer className={isHomePage ? 'border-t border-white/10 bg-[#041229] text-white' : 'border-t border-border bg-card/95 backdrop-blur-sm'}>
      <div className="page-shell py-8 md:py-10">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.75fr))]">
          <div className="max-w-sm">
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
                    <span className={`block mt-1 text-xs ${isHomePage ? 'text-slate-400' : 'text-muted-foreground'}`}>
                      {publicUi.footerTagline}
                    </span>
                  ) : null}
                </div>
              )}
            </Link>
            {!showBrandText && showSingleLanguageFooterTagline && publicUi.footerTagline && (
              <p className={`mt-3 text-sm leading-relaxed ${isHomePage ? 'text-slate-400' : 'text-muted-foreground'}`}>
                {publicUi.footerTagline}
              </p>
            )}
            <div className={`mt-4 space-y-2 text-sm ${isHomePage ? 'text-slate-300' : 'text-muted-foreground'}`}>
              {contactEmail && (
                <a
                  href={`mailto:${contactEmail}`}
                  className={isHomePage ? 'inline-flex items-center gap-2 text-cyan-300 hover:text-cyan-200' : 'inline-flex items-center gap-2 text-accent hover:underline'}
                >
                  <Mail size={13} />
                  {contactEmail}
                </a>
              )}
              {publicUi.contactPhone && (
                <a
                  href={`tel:${publicUi.contactPhone}`}
                  className={isHomePage ? 'flex items-center gap-2 transition-colors hover:text-white' : 'flex items-center gap-2 hover:text-foreground transition-colors'}
                >
                  <Phone size={13} />
                  {publicUi.contactPhoneFormatted || publicUi.contactPhone}
                </a>
              )}
              {publicUi.contactAddress && (
                <p className="flex items-start gap-2 leading-relaxed">
                  <MapPin size={13} className="mt-0.5 shrink-0" />
                  <span>{publicUi.contactAddress}</span>
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-4">
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

          {topSections.map((section) => (
            <div key={section.id}>
              <p className={`mb-3 text-[11px] font-800 uppercase tracking-[0.16em] ${isHomePage ? 'text-slate-200' : 'text-foreground'}`}>
                {getFooterSectionTitle(section.id, section.title, t)}
              </p>
              <ul className="space-y-2">
                {section.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.href}
                      className={isHomePage ? 'text-sm text-slate-400 transition-colors hover:text-white' : 'text-sm text-muted-foreground hover:text-foreground transition-colors'}
                    >
                      {getFooterLinkLabel(link.href, link.label, t)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className={`mt-8 flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between ${isHomePage ? 'border-t border-white/10' : 'border-t border-border'}`}>
          <FooterLegalLine />
          <div className="flex flex-wrap items-center gap-4">
            {legalLinks.map((link) => (
              <Link key={link.id} href={link.href} className={isHomePage ? 'text-sm text-slate-400 transition-colors hover:text-white' : 'text-sm text-muted-foreground hover:text-foreground transition-colors'}>
                {getFooterLinkLabel(link.href, link.label, t)}
              </Link>
            ))}
            {legalLinks.length === 0 && (
              <>
                <Link href="/privacy" className={isHomePage ? 'text-sm text-slate-400 transition-colors hover:text-white' : 'text-sm text-muted-foreground hover:text-foreground transition-colors'}>{t('footer.privacy')}</Link>
                <Link href="/terms" className={isHomePage ? 'text-sm text-slate-400 transition-colors hover:text-white' : 'text-sm text-muted-foreground hover:text-foreground transition-colors'}>{t('footer.terms')}</Link>
              </>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
