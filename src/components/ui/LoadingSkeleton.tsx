import React from 'react';

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = '', style }: SkeletonProps) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function KPICardSkeleton() {
  return (
    <div className="metric-card space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={`trow-${i + 1}`} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return <Skeleton className="w-full rounded-2xl" style={{ height }} />;
}

export function SectionCardSkeleton({
  lines = 3,
  className = '',
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`section-card ${className}`}>
      <div className="section-card-header">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40 rounded-lg" />
          <Skeleton className="h-3 w-64 max-w-full rounded-lg" />
        </div>
      </div>
      <div className="section-card-body space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton key={`section-skeleton-line-${index + 1}`} className="h-4 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function ListItemSkeleton({
  count = 4,
  className = '',
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`divide-y divide-border ${className}`}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={`list-item-skeleton-${index + 1}`} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-10 w-10 flex-shrink-0 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-32 rounded-lg" />
            <Skeleton className="h-2.5 w-24 rounded-lg" />
          </div>
          <Skeleton className="h-4 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 6,
  className = '',
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden ${className}`}>
      <div className="data-table-head border-b border-border px-4 py-3">
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: cols }).map((_, index) => (
            <Skeleton key={`table-head-skeleton-${index + 1}`} className="h-3 w-full rounded-lg" />
          ))}
        </div>
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`table-row-skeleton-${rowIndex + 1}`}
            className="grid items-center gap-3 px-4 py-3"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: cols }).map((_, colIndex) => (
              <Skeleton key={`table-cell-skeleton-${rowIndex + 1}-${colIndex + 1}`} className="h-4 w-full rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
