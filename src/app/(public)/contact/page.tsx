import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms/CmsPageView';
import ContactFormCard from '@/components/public/ContactFormCard';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicCmsPageBySlug('contact');
  if (!page) {
    return {
      title: 'Contact Us',
      description: 'Contact Smart Pocket for support, privacy, or general inquiries.',
    };
  }

  return {
    title: page.seo_title_resolved,
    description: page.seo_description_resolved,
  };
}

function LegacyContactPage() {
  return (
    <div className="py-16 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-700 text-foreground mb-4">Contact Us</h1>
          <p className="text-lg text-muted-foreground">Have a question or need help? We are here for you.</p>
        </div>
        <ContactFormCard />
      </div>
    </div>
  );
}

export default async function ContactPage() {
  const cmsPage = await getPublicCmsPageBySlug('contact');
  if (cmsPage) {
    return (
      <CmsPageView
        page={cmsPage}
        afterContent={<ContactFormCard />}
      />
    );
  }

  const anyPage = await getAnyCmsPageBySlug('contact');
  if (anyPage) {
    notFound();
  }

  return <LegacyContactPage />;
}
