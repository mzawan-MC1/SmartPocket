'use client';

export interface PrintableReportIdentity {
  fullName: string | null;
  email: string | null;
  country: string | null;
  avatarUrl: string | null;
}

export interface ReportMetadataItem {
  label: string;
  value: string;
}
