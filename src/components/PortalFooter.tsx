'use client';

import React from 'react';
import Link from 'next/link';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';

const MCS_URL = 'https://www.mc1services.com/';

export default function PortalFooter() {
  const { branding } = usePlatformSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card/85">
      <div className="page-shell py-3">
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground lg:justify-start">
          <span>© {year} {branding.appName}. All rights reserved. Powered by</span>
          <Link
            href={MCS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-700 text-[#22c55e] hover:underline"
          >
            MCS Consultancy
          </Link>
        </p>
      </div>
    </footer>
  );
}
