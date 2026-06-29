import React from 'react';
import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Inter, Plus_Jakarta_Sans, Poppins, Roboto } from 'next/font/google';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { PlatformSettingsProvider } from '@/contexts/PlatformSettingsContext';
import I18nProvider from '@/components/I18nProvider';
import { resolveInitialI18nState } from '@/i18n/server';
import { buildBrandingCssVariables } from '@/lib/platform-settings';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';
import { buildDefaultStructuredData, buildRootMetadata } from '@/lib/site-metadata';
import StructuredDataScripts from '@/components/seo/StructuredDataScripts';
import AnalyticsScripts from '@/components/analytics/AnalyticsScripts';
import MarketingEventBridge from '@/components/analytics/MarketingEventBridge';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-poppins',
  display: 'swap',
});

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-roboto',
  display: 'swap',
});

export async function generateViewport(): Promise<Viewport> {
  const settings = await getPlatformSettingsSnapshot();

  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: settings.branding.primaryColor,
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getPlatformSettingsSnapshot();
  return buildRootMetadata(settings);
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPlatformSettingsSnapshot();
  const requestHeaders = await headers();
  const pathname = requestHeaders.get('x-sp-pathname') || '/';
  const initialI18nState = await resolveInitialI18nState(settings);
  const structuredData = await buildDefaultStructuredData(settings);
  const shouldLoadAnalytics = !pathname.startsWith('/admin');
  const fontVariables = [
    plusJakarta.variable,
    inter.variable,
    poppins.variable,
    roboto.variable,
  ].join(' ');
  const brandingCssVariables = buildBrandingCssVariables(settings.branding);

  return (
    <html
      lang={initialI18nState.language}
      dir={initialI18nState.dir}
      className={fontVariables}
      style={brandingCssVariables}
    >
      <body suppressHydrationWarning>
        <StructuredDataScripts entries={structuredData} />
        {shouldLoadAnalytics ? (
          <>
            <AnalyticsScripts
              googleAnalyticsId={settings.analytics.googleAnalyticsId}
              googleTagManagerId={settings.analytics.googleTagManagerId}
            />
            <MarketingEventBridge />
          </>
        ) : null}
        <PlatformSettingsProvider value={settings}>
          <AuthProvider>
            <LanguageProvider initialLanguage={initialI18nState.language}>
              <I18nProvider>
                {children}
              </I18nProvider>
            </LanguageProvider>
          </AuthProvider>
        </PlatformSettingsProvider>
        <Toaster
          position="bottom-right"
          expand
          closeButton
          visibleToasts={4}
          duration={3200}
          offset={16}
          toastOptions={{
            style: {
              fontFamily: 'var(--font-sans)',
              fontSize: '0.875rem',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 24px rgba(15,52,96,0.12)',
            },
          }}
        />
      </body>
    </html>
  );
}
