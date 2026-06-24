'use client';

import React from 'react';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';

type FooterLegalLineProps = {
  className?: string;
};

function joinClasses(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

export default function FooterLegalLine({ className }: FooterLegalLineProps) {
  const { branding, publicUi } = usePlatformSettings();
  const copyrightText = publicUi.footerCopyright || `© ${branding.appName}. All rights reserved.`;
  const poweredByText = publicUi.footerPoweredByText.trim();
  const poweredByUrl = publicUi.footerPoweredByUrl.trim();

  return (
    <p className={joinClasses('flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-6 text-muted-foreground', className)}>
      <span>{copyrightText}</span>
      {poweredByText ? <span>Powered by</span> : null}
      {poweredByText ? (
        poweredByUrl ? (
          <a
            href={poweredByUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-700 text-positive hover:underline"
          >
            {poweredByText}
          </a>
        ) : (
          <span className="font-700 text-positive">{poweredByText}</span>
        )
      ) : null}
    </p>
  );
}
