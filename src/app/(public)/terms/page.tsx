import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms/CmsPageView';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicCmsPageBySlug('terms');
  if (!page) {
    return {
      title: 'Terms of Service',
      description: 'Read the terms that govern access to and use of Smart Pocket.',
    };
  }

  return {
    title: page.seo_title_resolved,
    description: page.seo_description_resolved,
  };
}

function LegacyTermsPage() {
  return (
    <div className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-700 text-foreground mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: June 15, 2026</p>
        <div className="space-y-8 text-muted-foreground">
          {[
            { title: '1. Acceptance of Terms', content: 'By accessing or using Smart Pocket, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the service.' },
            { title: '2. Use of Service', content: 'Smart Pocket is a personal finance management tool. You may use it for personal, non-commercial purposes. You are responsible for maintaining the confidentiality of your account credentials.' },
            { title: '3. User Data', content: 'You retain ownership of all financial data you enter into Smart Pocket. We process your data only to provide the service as described in our Privacy Policy.' },
            { title: '4. Prohibited Activities', content: 'You may not use Smart Pocket for any illegal purpose, to violate any laws, to transmit harmful content, or to attempt to gain unauthorized access to our systems.' },
            { title: '5. Disclaimer of Warranties', content: 'Smart Pocket is provided "as is" without warranties of any kind. We do not provide financial advice. Always consult a qualified financial advisor for financial decisions.' },
            { title: '6. Limitation of Liability', content: 'Smart Pocket shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the service.' },
            { title: '7. Changes to Terms', content: 'We may update these terms from time to time. We will notify you of significant changes via email or in-app notification.' },
            { title: '8. Contact', content: 'For questions about these terms, contact us at legal@smartpocket.app.' },
          ]?.map((section) => (
            <div key={section?.title}>
              <h2 className="text-lg font-700 text-foreground mb-2">{section?.title}</h2>
              <p className="leading-relaxed">{section?.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function TermsPage() {
  const cmsPage = await getPublicCmsPageBySlug('terms');
  if (cmsPage) {
    return <CmsPageView page={cmsPage} />;
  }

  const anyPage = await getAnyCmsPageBySlug('terms');
  if (anyPage) {
    notFound();
  }

  return <LegacyTermsPage />;
}
