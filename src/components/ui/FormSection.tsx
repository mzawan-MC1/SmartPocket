'use client';

import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';

type FormSectionVariant = 'primary' | 'secondary' | 'neutral';

interface FormSectionProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  variant?: FormSectionVariant;
  as?: 'section' | 'div';
  collapsible?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  headerButtonLabel?: string;
}

export default function FormSection({
  title,
  description,
  icon,
  badge,
  action,
  children,
  className = '',
  headerClassName = '',
  bodyClassName = '',
  variant = 'neutral',
  as = 'section',
  collapsible = false,
  expanded = true,
  onExpandedChange,
  headerButtonLabel,
}: FormSectionProps) {
  const Component = as;
  const contentId = useId();
  const hasChildren = children !== null && children !== undefined;
  const renderBody = hasChildren && (!collapsible || expanded);
  const hasHeader = title || description || action || icon || badge;
  const headerClasses = `form-section-header ${!renderBody ? 'form-section-header-no-divider' : ''} ${headerClassName}`.trim();

  return (
    <Component className={`form-section form-section-${variant} ${className}`.trim()}>
      {hasHeader ? (
        collapsible ? (
          <button
            type="button"
            className={`${headerClasses} form-section-header-button`.trim()}
            aria-expanded={expanded}
            aria-controls={contentId}
            aria-label={headerButtonLabel}
            onClick={() => onExpandedChange?.(!expanded)}
          >
            <div className="form-section-header-main">
              {(title || icon || badge) ? (
                <div className="form-section-title-row">
                  {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
                  {title ? <span className="form-section-title">{title}</span> : null}
                  {badge ? <span className="shrink-0">{badge}</span> : null}
                </div>
              ) : null}
              {description ? <p className="form-section-description">{description}</p> : null}
            </div>
            <span className="form-section-chevron" aria-hidden="true">
              <ChevronDown size={18} className={expanded ? 'rotate-180' : ''} />
            </span>
          </button>
        ) : (
          <div className={headerClasses}>
            <div className="form-section-header-main">
              {(title || icon || badge) ? (
                <div className="form-section-title-row">
                  {icon ? <span className="shrink-0 text-muted-foreground">{icon}</span> : null}
                  {title ? <h3 className="form-section-title">{title}</h3> : null}
                  {badge ? <span className="shrink-0">{badge}</span> : null}
                </div>
              ) : null}
              {description ? <p className="form-section-description">{description}</p> : null}
            </div>
            {action ? <div className="form-section-action">{action}</div> : null}
          </div>
        )
      ) : null}
      {collapsible ? (
        <div
          id={contentId}
          hidden={!renderBody}
          className={renderBody ? `form-section-body ${bodyClassName}`.trim() : 'hidden'}
        >
          {renderBody ? children : null}
        </div>
      ) : hasChildren ? (
        <div id={contentId} className={`form-section-body ${bodyClassName}`.trim()}>{children}</div>
      ) : null}
    </Component>
  );
}
