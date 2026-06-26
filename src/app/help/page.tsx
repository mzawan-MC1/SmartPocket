'use client';
import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { MessageCircle, Book, Mail, CircleHelp, ArrowUpRight } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';
import { usePlatformSettings } from '@/contexts/PlatformSettingsContext';

export default function HelpPage() {
  const { t } = useTranslation('portal');
  const { publicUi } = usePlatformSettings();
  const supportEmail = publicUi.contactEmail;
  const quickLinks = [
    { icon: Book, title: t('help.quickLinks.documentation.title'), desc: t('help.quickLinks.documentation.description'), href: '/faqs' },
    { icon: MessageCircle, title: t('help.quickLinks.community.title'), desc: t('help.quickLinks.community.description'), href: '/support' },
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
            const isMailLink = item.href.startsWith('mailto:');

            const content = (
              <>
                <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Icon size={18} className="text-accent" />
                </div>
                <div>
                  <p className="text-sm font-700 text-foreground group-hover:text-accent transition-colors">{item?.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item?.desc}</p>
                </div>
              </>
            );

            return isMailLink ? (
              <a key={item?.title} href={item?.href} className="card-elevated p-4 flex items-start gap-3 hover:shadow-card-md transition-shadow group">
                {content}
              </a>
            ) : (
              <Link key={item?.title} href={item?.href} className="card-elevated p-4 flex items-start gap-3 hover:shadow-card-md transition-shadow group">
                {content}
              </Link>
            );
          })}
        </div>

        <SectionCard title={t('help.faqTitle')} description={t('help.faqDescription')}>
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/10 text-accent">
                  <CircleHelp size={20} />
                </div>
                <h3 className="mt-4 text-lg font-700 text-foreground">
                  {t('help.faqCtaTitle')}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t('help.faqCtaDescription')}
                </p>
              </div>
              <Link href="/faqs" className="btn-primary inline-flex min-h-11 items-center justify-center gap-2">
                <ArrowUpRight size={16} />
                {t('help.openFaqs')}
              </Link>
            </div>
          </div>
        </SectionCard>
      </div>
    </AppLayout>
  );
}
