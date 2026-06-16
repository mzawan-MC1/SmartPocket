'use client';

import React from 'react';

export default function AdminSystemHealthPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-700 text-foreground tracking-tight">System Health</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Provider status and operational checks</p>
      </div>

      <div className="card-elevated p-5">
        <p className="text-sm font-600 text-foreground">Health checks will appear here.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Next: wire up provider tests (Supabase, OpenRouter) and the latest AI health record.
        </p>
      </div>
    </div>
  );
}

