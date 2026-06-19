import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms/CmsPageView';
import { isReservedCmsSlug } from '@/lib/cms-pages';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  if (isReservedCmsSlug(slug)) {
    return {};
  }
  const page = await getPublicCmsPageBySlug(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.seo_title_resolved,
    description: page.seo_description_resolved,
  };
}

export default async function PublicCmsSlugPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (isReservedCmsSlug(slug)) {
    notFound();
  }
  const page = await getPublicCmsPageBySlug(slug);

  if (page) {
    return <CmsPageView page={page} />;
  }

  const anyPage = await getAnyCmsPageBySlug(slug);
  if (anyPage) {
    notFound();
  }

  notFound();
}
