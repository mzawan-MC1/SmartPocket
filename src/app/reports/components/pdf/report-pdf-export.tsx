'use client';

import React from 'react';
import { pdf } from '@react-pdf/renderer';
import ReportPdfDocument from './ReportPdfDocument';
import type { ReportPdfSnapshot } from './report-pdf-types';

async function canLoadBrowserImage(url: string) {
  if (!url || typeof window === 'undefined') {
    return false;
  }

  return await new Promise<boolean>((resolve) => {
    const image = new window.Image();
    const timer = window.setTimeout(() => {
      image.onload = null;
      image.onerror = null;
      resolve(false);
    }, 3000);

    image.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    image.src = url;
  });
}

export async function generateReportPdfBlob(snapshot: ReportPdfSnapshot) {
  const logoUrl = snapshot.branding.logoUrl && await canLoadBrowserImage(snapshot.branding.logoUrl)
    ? snapshot.branding.logoUrl
    : '';
  const preparedSnapshot = logoUrl === snapshot.branding.logoUrl
    ? snapshot
    : {
        ...snapshot,
        branding: {
          ...snapshot.branding,
          logoUrl,
        },
      };

  return pdf(<ReportPdfDocument snapshot={preparedSnapshot} />).toBlob();
}
