'use client';

import React from 'react';

export default function AdminAIUsageCostsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-700 text-foreground tracking-tight">AI Usage & Costs</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Usage, credits, and estimated provider costs</p>
      </div>

      <div className="card-elevated p-5">
        <p className="text-sm font-600 text-foreground">This page is ready for aggregated AI usage.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Next: connect to AI usage tables/RPC and show month totals, credits consumed, cost estimates, and failed requests.
        </p>
      </div>
    </div>
  );
}

