import React from 'react';

interface SectionCardProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export default function SectionCard({
  title,
  description,
  action,
  children,
  className = '',
  bodyClassName = '',
}: SectionCardProps) {
  return (
    <section className={`section-card ${className}`}>
      {(title || description || action) && (
        <div className="section-card-header">
          <div>
            {title ? <h2 className="section-title">{title}</h2> : null}
            {description ? <p className="section-description">{description}</p> : null}
          </div>
          {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
        </div>
      )}
      <div className={`section-card-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}
