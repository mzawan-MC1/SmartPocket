import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  align?: 'start' | 'center';
  className?: string;
  actionsClassName?: string;
}

export default function PageHeader({
  title,
  description,
  badge,
  actions,
  align = 'start',
  className = '',
  actionsClassName = '',
}: PageHeaderProps) {
  return (
    <div className={`page-header ${align === 'center' ? 'text-center justify-center' : ''} ${className}`}>
      <div className={`page-header-main ${align === 'center' ? 'w-full flex flex-col items-center' : ''}`}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {description ? <p className="page-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className={`page-header-actions ${actionsClassName}`}>{actions}</div> : null}
    </div>
  );
}
