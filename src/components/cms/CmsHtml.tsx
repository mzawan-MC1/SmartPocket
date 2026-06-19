import React from 'react';
import { sanitizeRichTextHtml } from '@/lib/cms-pages';

export default function CmsHtml({
  html,
  className = '',
}: {
  html: string;
  className?: string;
}) {
  const safeHtml = sanitizeRichTextHtml(html);

  if (!safeHtml) {
    return null;
  }

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: safeHtml }}
    />
  );
}
