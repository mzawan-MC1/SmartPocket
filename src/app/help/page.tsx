'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { MessageCircle, Book, Mail, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';

export default function HelpPage() {
  const { t } = useTranslation('portal');
  const { email, publicUi } = usePlatformSettings();
  const supportEmail = email.supportEmail || publicUi.contactEmail || 'info@1smartpocket.com';
  const faq = [1, 2, 3, 4, 5, 6].map((index) => ({
    q: t(`help.faq.${index}.question`),
    a: t(`help.faq.${index}.answer`),
  }));
  const quickLinks = [
    { icon: Book, title: t('help.quickLinks.documentation.title'), desc: t('help.quickLinks.documentation.description'), href: '/help' },
    { icon: MessageCircle, title: t('help.quickLinks.community.title'), desc: t('help.quickLinks.community.description'), href: '/help' },
    { icon: Mail, title: t('help.quickLinks.email.title'), desc: supportEmail, href: `mailto:${supportEmail}` },
  ];

  return (
    <AppLayout activeRoute="/help">
      <div className="page-section page-shell-readable">
        <PageHeader
          title={t('help.title')}
          description={t('help.description')}
          badge={<StatusBadge status="info" label={t('help.badge')} />}
        />

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickLinks.map((item) => {
            const Icon = item?.icon;
            return (
              <a key={item?.title} href={item?.href} className="card-elevated p-4 flex items-start gap-3 hover:shadow-card-md transition-shadow group">
                <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-accent" />
                </div>
                <div>
                  <p className="text-sm font-700 text-foreground group-hover:text-accent transition-colors">{item?.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item?.desc}</p>
                </div>
              </a>
            );
          })}
        </div>

        {/* FAQ */}
        <SectionCard title={t('help.faqTitle')} description={t('help.faqDescription')}>
          <div className="divide-y divide-border">
            {faq.map((item) => (
              <details key={item?.q} className="group">
                <summary className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors list-none">
                  <span className="text-sm font-600 text-foreground">{item?.q}</span>
                  <ChevronRight size={16} className="text-muted-foreground transition-transform group-open:rotate-90 flex-shrink-0" />
                </summary>
                <div className="px-4 pb-4">
                  <p className="text-sm text-muted-foreground leading-relaxed">{item?.a}</p>
                </div>
              </details>
            ))}
          </div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
