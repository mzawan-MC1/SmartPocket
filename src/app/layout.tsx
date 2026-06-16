import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans, Poppins, Roboto } from 'next/font/google';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { PlatformSettingsProvider } from '@/contexts/PlatformSettingsContext';
import I18nProvider from '@/components/I18nProvider';
import { buildBrandingCssVariables, getSettingsAssetUrl } from '@/lib/platform-settings';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';

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

function getMetadataBase(rawCanonicalUrl: string) {
  const fallbackOrigin = process.env.NEXT_PUBLIC_SITE_URL;

  try {
    if (rawCanonicalUrl) {
      return new URL(rawCanonicalUrl);
    }
    if (fallbackOrigin) {
      return new URL(fallbackOrigin);
    }
  } catch {}

  return undefined;
}

function toAbsoluteUrl(url: string, metadataBase?: URL) {
  if (!url) return '';

  try {
    return new URL(url, metadataBase ?? process.env.NEXT_PUBLIC_SITE_URL).toString();
  } catch {
    return url;
  }
}

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
  const { branding, seo, updatedAt } = settings;
  const metadataBase = getMetadataBase(seo.canonicalUrl);
  const faviconUrl = getSettingsAssetUrl(branding.faviconUrl, updatedAt);
  const ogImage = toAbsoluteUrl(getSettingsAssetUrl(seo.ogImage, updatedAt), metadataBase);
  const twitterImage = toAbsoluteUrl(getSettingsAssetUrl(seo.twitterImage, updatedAt), metadataBase);
  const canonical = seo.canonicalUrl || undefined;

  return {
    metadataBase,
    applicationName: branding.appName,
    title: {
      default: seo.siteTitle,
      template: seo.titleTemplate,
    },
    description: seo.siteDescription,
    keywords: seo.keywords,
    alternates: canonical
      ? {
          canonical,
        }
      : undefined,
    icons: faviconUrl
      ? {
          icon: [{ url: faviconUrl }],
          shortcut: [{ url: faviconUrl }],
          apple: [{ url: faviconUrl }],
        }
      : undefined,
    openGraph: {
      type: 'website',
      siteName: branding.appName,
      title: seo.ogTitle,
      description: seo.ogDescription,
      url: canonical,
      images: ogImage ? [{ url: ogImage, alt: `${branding.appName} preview` }] : undefined,
    },
    twitter: {
      card: seo.twitterCard,
      creator: seo.twitterHandle || undefined,
      site: seo.twitterHandle || undefined,
      title: seo.twitterTitle,
      description: seo.twitterDescription,
      images: twitterImage ? [twitterImage] : undefined,
    },
    robots: {
      index: seo.robotsIndex,
      follow: seo.robotsFollow,
      googleBot: {
        index: seo.robotsIndex,
        follow: seo.robotsFollow,
      },
    },
    manifest: '/manifest.json',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: branding.appName,
    },
    formatDetection: {
      telephone: false,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPlatformSettingsSnapshot();
  const fontVariables = [
    plusJakarta.variable,
    inter.variable,
    poppins.variable,
    roboto.variable,
  ].join(' ');
  const brandingCssVariables = buildBrandingCssVariables(settings.branding);

  return (
    <html lang="en" className={fontVariables} style={brandingCssVariables}>
      <body suppressHydrationWarning>
        <PlatformSettingsProvider value={settings}>
          <I18nProvider>
            <LanguageProvider>
              <AuthProvider>
                {children}
              </AuthProvider>
            </LanguageProvider>
          </I18nProvider>
        </PlatformSettingsProvider>
        <Toaster
          position="bottom-right"
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
