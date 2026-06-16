'use client';

import React from 'react';

export default function AdminPlatformSettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-700 text-foreground tracking-tight">Platform Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Global configuration and system defaults</p>
      </div>

      <div className="card-elevated p-5">
        <p className="text-sm font-600 text-foreground">This section is ready for platform-wide settings.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Next: connect this page to the existing platform settings storage used by other admin screens.
        </p>
      </div>
    </div>
  );
}

