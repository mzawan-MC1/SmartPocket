'use client';

import React from 'react';
import Link from 'next/link';

export default function AdminLocalizationPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-700 text-foreground tracking-tight">Currency & Languages</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configure localization defaults and supported options</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/admin/currency" className="card-elevated p-5 hover:shadow-card-md transition-all">
          <p className="text-sm font-700 text-foreground">Currency</p>
          <p className="text-xs text-muted-foreground mt-1">Default currency, enabled currencies, symbols</p>
        </Link>
        <Link href="/admin/language" className="card-elevated p-5 hover:shadow-card-md transition-all">
          <p className="text-sm font-700 text-foreground">Languages</p>
          <p className="text-xs text-muted-foreground mt-1">Supported languages, RTL, date/number formats</p>
        </Link>
      </div>
    </div>
  );
}

