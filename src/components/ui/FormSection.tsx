'use client';

import React from 'react';

type FormSectionVariant = 'primary' | 'secondary' | 'neutral';

interface FormSectionProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
  variant?: FormSectionVariant;
  as?: 'section' | 'div';
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
}: FormSectionProps) {
  const Component = as;
  const hasBody = children !== null && children !== undefined;

  return (
    <Component className={`form-section form-section-${variant} ${className}`.trim()}>
      {(title || description || action || icon || badge) ? (
        <div className={`form-section-header ${!hasBody ? 'form-section-header-no-divider' : ''} ${headerClassName}`.trim()}>
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
      ) : null}
      {hasBody ? <div className={`form-section-body ${bodyClassName}`.trim()}>{children}</div> : null}
    </Component>
  );
}
