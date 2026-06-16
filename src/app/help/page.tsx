'use client';
import React from 'react';
import AppLayout from '@/components/AppLayout';
import { MessageCircle, Book, Mail, ChevronRight } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';
import PageHeader from '@/components/ui/PageHeader';
import SectionCard from '@/components/ui/SectionCard';
import StatusBadge from '@/components/ui/StatusBadge';



const FAQ = [
  { q: 'How do I add a transaction?', a: 'Go to Transactions page and click "Add Transaction", or use the + button in the bottom navigation.' },
  { q: 'How do I set up a budget?', a: 'Navigate to Budgets and click "Add Budget". Select a category, set an amount, and choose your alert threshold.' },
  { q: 'Can I import bank transactions?', a: 'CSV import is planned for Phase 2. Currently, transactions must be entered manually.' },
  { q: 'How do I change my currency?', a: 'Go to Settings → Preferences and select your default currency from the dropdown.' },
  { q: 'Is my data secure?', a: 'Yes. All data is encrypted and protected with Supabase Row Level Security. Only you can access your financial data.' },
  { q: 'How do I switch to Arabic (RTL)?', a: 'Click the language switcher in the top bar and select العربية. The layout will switch to right-to-left automatically.' },
];

export default function HelpPage() {
  return (
    <AppLayout activeRoute="/help">
      <div className="page-section page-shell-readable">
        <PageHeader
          title="Help & Support"
          description="Find quick guidance, support channels, and answers to the most common Smart Pocket questions."
          badge={<StatusBadge status="info" label="Support" />}
        />

        {/* Quick Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: Book, title: 'Documentation', desc: 'Guides and tutorials', href: '/help' },
            { icon: MessageCircle, title: 'Community', desc: 'Ask the community', href: '/help' },
            { icon: Mail, title: 'Email Support', desc: 'support@smartpocket.app', href: 'mailto:support@smartpocket.app' },
          ]?.map((item) => {
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
        <SectionCard title="Frequently Asked Questions" description="Helpful answers for onboarding, data entry, security, and reporting.">
          <div className="divide-y divide-border">
            {FAQ?.map((item) => (
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
