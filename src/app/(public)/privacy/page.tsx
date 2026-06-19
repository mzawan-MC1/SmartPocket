import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import CmsPageView from '@/components/cms/CmsPageView';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublicCmsPageBySlug('privacy');
  if (!page) {
    return {
      title: 'Privacy Policy',
      description: 'Learn how Smart Pocket collects, uses, and protects personal and financial information.',
    };
  }

  return {
    title: page.seo_title_resolved,
    description: page.seo_description_resolved,
  };
}

function LegacyPrivacyPage() {
  return (
    <div className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-700 text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: June 15, 2026</p>
        <div className="space-y-8 text-muted-foreground">
          {[
            { title: '1. Information We Collect', content: 'We collect information you provide directly to us, such as your name, email address, and financial data you enter into Smart Pocket. We also collect usage data to improve the service.' },
            { title: '2. How We Use Your Information', content: 'We use your information to provide, maintain, and improve Smart Pocket, to process transactions, send notifications, and respond to your requests.' },
            { title: '3. Data Security', content: 'Your financial data is protected with bank-level encryption. We use Supabase with Row Level Security (RLS) to ensure only you can access your data. All data is encrypted in transit and at rest.' },
            { title: '4. Data Sharing', content: 'We do not sell, trade, or rent your personal information to third parties. We may share anonymized, aggregated data for analytics purposes.' },
            { title: '5. Data Retention', content: 'We retain your data for as long as your account is active. You may request deletion of your account and all associated data at any time.' },
            { title: '6. Your Rights', content: 'You have the right to access, correct, or delete your personal data. Contact us at privacy@smartpocket.app to exercise these rights.' },
            { title: '7. Contact', content: 'For privacy-related questions, contact us at privacy@smartpocket.app.' },
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

export default async function PrivacyPage() {
  const cmsPage = await getPublicCmsPageBySlug('privacy');
  if (cmsPage) {
    return <CmsPageView page={cmsPage} />;
  }

  const anyPage = await getAnyCmsPageBySlug('privacy');
  if (anyPage) {
    notFound();
  }

  return <LegacyPrivacyPage />;
}
