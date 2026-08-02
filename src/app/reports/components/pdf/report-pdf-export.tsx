'use client';

import React from 'react';
import { pdf } from '@react-pdf/renderer';
import ReportPdfDocument from './ReportPdfDocument';
import type { ReportPdfSnapshot } from './report-pdf-types';

export async function generateReportPdfBlob(snapshot: ReportPdfSnapshot) {
  return pdf(<ReportPdfDocument snapshot={snapshot} />).toBlob();
}
