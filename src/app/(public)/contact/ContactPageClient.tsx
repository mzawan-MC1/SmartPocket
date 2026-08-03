'use client';

import { Mail, MapPin, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ContactFormCard from '@/components/public/ContactFormCard';
import { useLanguage } from '@/contexts/LanguageContext';

type ContactPageClientProps = {
  email: string;
  phone: string;
  address: string;
};

export default function ContactPageClient({
  email,
  phone,
  address,
}: ContactPageClientProps) {
  const { t } = useTranslation('public');
  const { dir } = useLanguage();

  const items = [
    {
      key: 'email',
      icon: <Mail size={18} className="text-accent" />,
      label: t('contact.detailsEmail'),
      value: email || t('contact.missingEmail'),
    },
    {
      key: 'phone',
      icon: <Phone size={18} className="text-accent" />,
      label: t('contact.detailsPhone'),
      value: phone || t('contact.missingPhone'),
    },
    {
      key: 'address',
      icon: <MapPin size={18} className="text-accent" />,
      label: t('contact.detailsAddress'),
      value: address || t('contact.missingAddress'),
    },
  ];

  const configuredValueFallback = t('contact.notConfigured');

  return (
    <div className="py-16 px-4" dir={dir}>
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-4xl font-700 text-foreground mb-4">
            {t('contact.titleFallback')}
          </h1>
          <p className="text-muted-foreground leading-7">
            {t('contact.introFallback')}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.key} className="card-elevated p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
                {item.icon}
              </div>
              <p className="text-sm font-700 text-foreground mb-1">{item.label}</p>
              <p className="text-sm text-muted-foreground whitespace-pre-line break-words">
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="card-elevated p-8">
            <h2 className="text-xl font-700 text-foreground mb-3">
              {t('contact.formTitle')}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t('contact.formDescription')}
            </p>
            <ContactFormCard />
          </div>

          <div className="card-elevated p-8">
            <h2 className="text-xl font-700 text-foreground mb-3">
              {t('contact.detailsPanelTitle')}
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t('contact.detailsPanelDescription')}
            </p>
            <div className="space-y-5">
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-1">
                  {t('contact.detailsEmail')}
                </p>
                <p className="text-sm text-foreground break-words">
                  {email || configuredValueFallback}
                </p>
              </div>
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-1">
                  {t('contact.detailsPhone')}
                </p>
                <p className="text-sm text-foreground">
                  {phone || configuredValueFallback}
                </p>
              </div>
              <div>
                <p className="text-xs font-700 uppercase tracking-widest text-muted-foreground mb-1">
                  {t('contact.detailsAddress')}
                </p>
                <p className="text-sm text-foreground whitespace-pre-line">
                  {address || configuredValueFallback}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
