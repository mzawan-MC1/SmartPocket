'use client';

import React from 'react';
import FooterLegalLine from '@/components/footer/FooterLegalLine';

export default function PortalFooter() {
  return (
    <footer className="shrink-0 border-t border-border/90 bg-background/98 backdrop-blur-sm">
      <div className="page-shell py-4 sm:py-4">
        <FooterLegalLine className="justify-center text-xs lg:justify-start" />
      </div>
    </footer>
  );
}
