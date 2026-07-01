import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  align?: 'start' | 'center';
  compact?: boolean;
  hideDescriptionOnMobile?: boolean;
  className?: string;
  actionsClassName?: string;
}

export default function PageHeader({
  title,
  description,
  badge,
  actions,
  align = 'start',
  compact = false,
  hideDescriptionOnMobile = false,
  className = '',
  actionsClassName = '',
}: PageHeaderProps) {
  return (
    <div className={`page-header ${compact ? 'page-header-compact' : ''} ${hideDescriptionOnMobile ? 'page-header-hide-subtitle-mobile' : ''} ${align === 'center' ? 'text-center justify-center' : ''} ${className}`.trim()}>
      <div className={`page-header-main ${compact ? 'page-header-main-compact' : ''} ${align === 'center' ? 'w-full flex flex-col items-center' : ''}`}>
        <div className={`flex flex-wrap items-center ${compact ? 'gap-2' : 'gap-3'}`}>
          <h1 className="page-title">{title}</h1>
          {badge}
        </div>
        {description ? <p className="page-subtitle">{description}</p> : null}
      </div>
      {actions ? <div className={`page-header-actions ${compact ? 'page-header-actions-compact' : ''} ${actionsClassName}`}>{actions}</div> : null}
    </div>
  );
}
