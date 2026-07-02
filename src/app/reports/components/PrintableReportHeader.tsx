'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import AppLogo from '@/components/ui/AppLogo';
import UserAvatar from '@/components/ui/UserAvatar';
import ReportMetadataSummary from './ReportMetadataSummary';
import type { PrintableReportIdentity, ReportMetadataItem } from './full-report-types';

export default function PrintableReportHeader({
  title,
  subtitle,
  identity,
  metadata,
}: {
  title: string;
  subtitle?: string | null;
  identity: PrintableReportIdentity;
  metadata: ReportMetadataItem[];
}) {
  const { t } = useTranslation('portal');

  return (
    <header className="report-header rounded-[28px] border border-border bg-card px-5 py-5 sm:px-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <AppLogo size={44} className="shrink-0" imageClassName="rounded-2xl" />
            <div className="min-w-0">
              <p className="text-xs font-700 uppercase tracking-[0.24em] text-muted-foreground">
                Smart Pocket
              </p>
              <h1 className="mt-1 text-2xl font-800 text-foreground">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {subtitle}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-muted/15 p-4 lg:w-[20rem]">
          <p className="text-[11px] font-700 uppercase tracking-wider text-muted-foreground">
            {t('reports.fullReport.header.preparedFor', { defaultValue: 'Prepared for' })}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <UserAvatar
              fullName={identity.fullName}
              email={identity.email}
              avatarUrl={identity.avatarUrl}
              className="h-12 w-12"
              textClassName="text-sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-700 text-foreground">
                {identity.fullName || t('reports.fullReport.header.userFallback', { defaultValue: 'Smart Pocket user' })}
              </p>
              {identity.email ? (
                <p className="truncate text-xs text-muted-foreground">{identity.email}</p>
              ) : null}
              {identity.country ? (
                <p className="truncate text-xs text-muted-foreground">{identity.country}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <ReportMetadataSummary items={metadata} />
      </div>
    </header>
  );
}
