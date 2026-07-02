'use client';

import React from 'react';
import type { ReportMetadataItem } from './full-report-types';

export default function ReportMetadataSummary({
  items,
}: {
  items: ReportMetadataItem[];
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={`${item.label}-${item.value}`}
          className="rounded-2xl border border-border/80 bg-card/80 px-3 py-2.5"
        >
          <p className="text-[11px] font-700 uppercase tracking-wider text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 text-sm font-600 text-foreground">
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
