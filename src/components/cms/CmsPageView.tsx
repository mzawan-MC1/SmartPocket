import React from 'react';
import type { PublicCmsPage } from '@/lib/cms-pages-server';
import CmsHtml from '@/components/cms/CmsHtml';

export default function CmsPageView({
  page,
  lead,
  afterContent,
}: {
  page: PublicCmsPage;
  lead?: string | null;
  afterContent?: React.ReactNode;
}) {
  return (
    <div className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-700 text-foreground mb-3">{page.title}</h1>
          {lead ? <p className="text-lg text-muted-foreground">{lead}</p> : null}
        </div>
        <CmsHtml
          html={page.content_html_sanitized}
          className="prose prose-slate max-w-none space-y-4 text-muted-foreground [&_a]:text-accent [&_a]:underline-offset-2 [&_blockquote]:border-l-4 [&_blockquote]:border-accent/40 [&_blockquote]:pl-4 [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_h4]:text-foreground [&_li]:my-1"
        />
        {afterContent ? <div className="mt-10">{afterContent}</div> : null}
      </div>
    </div>
  );
}
