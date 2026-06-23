'use client';

import React from 'react';
import Link from 'next/link';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';

export default function PortalFooter() {
  const { branding, publicUi } = usePlatformSettings();

  return (
    <footer className="shrink-0 border-t border-border/90 bg-background/98 backdrop-blur-sm">
      <div className="page-shell py-4 sm:py-4">
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-xs leading-6 text-muted-foreground lg:justify-start">
          {publicUi.footerWebsiteUrl ? (
            <Link
              href={publicUi.footerWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-700 text-foreground hover:underline"
            >
              {publicUi.footerCompanyName || branding.appName}
            </Link>
          ) : (
            <span className="font-700 text-foreground">{publicUi.footerCompanyName || branding.appName}</span>
          )}
          <span>{publicUi.footerCopyright || `© ${branding.appName}. All rights reserved.`}</span>
        </p>
      </div>
    </footer>
  );
}
