import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Mail, MapPin, Phone } from 'lucide-react';
import CmsHtml from '@/components/cms/CmsHtml';
import ContactFormCard from '@/components/public/ContactFormCard';
import { getAnyCmsPageBySlug, getPublicCmsPageBySlug } from '@/lib/cms-pages-server';
import { getPlatformSettingsSnapshot } from '@/lib/platform-settings-server';

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

function ContactDetails({
  email,
  phone,
  address,
}: {
  email: string;
  phone: string;
  address: string;
}) {
  const items = [
    {
      key: 'email',
      icon: <Mail size={18} className="text-accent" />,
      label: 'Email',
      value: email || 'Add a support email in Platform Settings',
    },
    {
      key: 'phone',
      icon: <Phone size={18} className="text-accent" />,
      label: 'Phone',
      value: phone || 'Add a contact phone in Platform Settings',
    },
    {
      key: 'address',
      icon: <MapPin size={18} className="text-accent" />,
      label: 'Address',
      value: address || 'Add a public address in Platform Settings',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.key} className="card-elevated p-5">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            {item.icon}
          </div>
          <p className="text-sm font-700 text-foreground mb-1">{item.label}</p>
          <p className="text-sm text-muted-foreground whitespace-pre-line break-words">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function LegacyContactBody() {
  return (
    <CmsHtml
      html="<p>Have a question or need help? Use the form below and our team will get back to you as soon as possible.</p>"
      className="prose prose-slate max-w-none text-muted-foreground [&_a]:text-accent [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground"
    />
  );
}

export default async function ContactPage() {
  const [cmsPage, anyPage, settings] = await Promise.all([
    getPublicCmsPageBySlug('contact'),
    getAnyCmsPageBySlug('contact'),
    getPlatformSettingsSnapshot(),
  ]);

  if (!cmsPage && anyPage) {
    notFound();
  }

  const contactDetails = settings.publicUi;

  return (
    <div className="py-16 px-4">
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-700 text-foreground mb-4">
            {cmsPage?.title || 'Contact Us'}
          </h1>
          {cmsPage ? (
            <CmsHtml
              html={cmsPage.content_html_sanitized}
              className="prose prose-slate mx-auto max-w-none text-muted-foreground [&_a]:text-accent [&_h1]:text-foreground [&_h2]:text-foreground [&_h3]:text-foreground"
            />
          ) : (
            <LegacyContactBody />
          )}
        </div>

        <ContactDetails
          email={contactDetails.contactEmail}
          phone={contactDetails.contactPhoneFormatted || contactDetails.contactPhone}
          address={contactDetails.contactAddress}
        />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="card-elevated p-8">
            <h2 className="text-xl font-700 text-foreground mb-3">Send us a message</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Use the form to ask questions, request help, or share feedback. We aim to respond within 24 hours.
            </p>
            <ContactFormCard />
          </div>

          <div className="card-elevated p-8">
            <h2 className="text-xl font-700 text-foreground mb-3">Contact Details</h2>
            <p className="text-sm text-muted-foreground mb-6">
              These public details come from Platform Settings and stay visible even while the CMS introduction is edited.
            </p>
            <div className="space-y-5">
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-1">Email</p>
                <p className="text-sm text-foreground break-words">{contactDetails.contactEmail || 'Not configured'}</p>
              </div>
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-1">Phone</p>
                <p className="text-sm text-foreground">
                  {contactDetails.contactPhoneFormatted || contactDetails.contactPhone || 'Not configured'}
                </p>
              </div>
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-1">Address</p>
                <p className="text-sm text-foreground whitespace-pre-line">{contactDetails.contactAddress || 'Not configured'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
