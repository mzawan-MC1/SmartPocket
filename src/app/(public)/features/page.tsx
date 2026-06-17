import React from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart3, Wallet, PieChart, Shield, Globe, Smartphone, TrendingUp, FileText, RefreshCw, Bell, Lock, Download, CheckCircle2, Monitor, Languages, CreditCard, Tag, Receipt } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


const ALL_FEATURES = [
  {
    category: 'Accounts & Transactions',
    items: [
      { icon: Wallet, title: 'Multi-Account Management', desc: 'Bank, credit card, cash, savings, digital wallets — all in one place.' },
      { icon: CreditCard, title: 'Transaction Tracking', desc: 'Log income, expenses, and transfers with full detail and receipt attachments.' },
      { icon: RefreshCw, title: 'Recurring Transactions', desc: 'Automate subscriptions, rent, salary, and any repeating transaction.' },
      { icon: Receipt, title: 'Receipt Attachments', desc: 'Attach photos or PDFs of receipts to any transaction for record-keeping.' },
    ],
  },
  {
    category: 'Budgets & Planning',
    items: [
      { icon: PieChart, title: 'Category Budgets', desc: 'Set monthly budgets per category and track spending in real time.' },
      { icon: Bell, title: 'Overspend Alerts', desc: 'Get notified before you exceed your budget limit.' },
      { icon: Tag, title: 'Custom Categories', desc: 'Create your own income and expense categories with custom colors and icons.' },
      { icon: TrendingUp, title: 'Net Flow Tracking', desc: 'See your monthly income minus expenses at a glance.' },
    ],
  },
  {
    category: 'Reports & Exports',
    items: [
      { icon: BarChart3, title: 'Visual Charts', desc: 'Income vs expense trends, spending by category, budget performance.' },
      { icon: FileText, title: 'PDF Statements', desc: 'Print-ready financial statements for any date range.' },
      { icon: Download, title: 'CSV Exports', desc: 'Export raw data for spreadsheet analysis or accounting software.' },
      { icon: Monitor, title: 'Dashboard Overview', desc: 'All key metrics on one screen — balance, income, expenses, upcoming bills.' },
    ],
  },
  {
    category: 'Security & Access',
    items: [
      { icon: Lock, title: 'Row-Level Security', desc: 'Database-enforced isolation — your data is invisible to all other users.' },
      { icon: Shield, title: 'Encrypted Storage', desc: 'All data encrypted in transit (TLS 1.3) and at rest.' },
      { icon: CheckCircle2, title: 'Google & Apple Sign-In', desc: 'Sign in with your existing Google or Apple account — no new password needed.' },
      { icon: Shield, title: 'No Data Selling', desc: 'We do not sell, share, or monetize your financial data. Ever.' },
    ],
  },
  {
    category: 'Multilingual & Global',
    items: [
      { icon: Languages, title: '4-Language Support', desc: 'English, Arabic (RTL), French, and Russian — switch instantly.' },
      { icon: Globe, title: 'Full RTL Layout', desc: 'Arabic interface is fully right-to-left, not just translated.' },
      { icon: CreditCard, title: '153 Active Currencies', desc: 'Track accounts in globally supported currencies with official Smart Pocket currency rendering.' },
      { icon: Smartphone, title: 'PWA — Install Anywhere', desc: 'Install on iOS, Android, or desktop from any browser. Works offline.' },
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="py-16 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-800 text-foreground mb-4 tracking-tight">
            Everything you need to manage money
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Smart Pocket is a complete personal finance toolkit — built for clarity, security, and global use.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
            <Link href="/sign-up-login" className="btn-primary text-base py-3 px-8 gap-2">
              Get Started Free <ArrowRight size={18} />
            </Link>
            <Link href="/pricing" className="btn-secondary text-base py-3 px-8">
              View Pricing
            </Link>
          </div>
        </div>

        {/* Feature categories */}
        <div className="space-y-16">
          {ALL_FEATURES?.map((cat) => (
            <div key={cat?.category}>
              <h2 className="text-xl font-700 text-foreground mb-6 pb-3 border-b border-border">
                {cat?.category}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {cat?.items?.map((item) => {
                  const Icon = item?.icon;
                  return (
                    <div key={item?.title} className="flex gap-4 p-5 rounded-2xl border border-border hover:border-accent/30 hover:bg-accent/3 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                        <Icon size={18} className="text-accent" />
                      </div>
                      <div>
                        <h3 className="text-sm font-700 text-foreground mb-1">{item?.title}</h3>
                        <p className="text-xs text-muted-foreground leading-relaxed">{item?.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center card-elevated p-10">
          <h2 className="text-2xl font-700 text-foreground mb-3">Ready to get started?</h2>
          <p className="text-muted-foreground mb-6">Free plan available. No credit card required.</p>
          <Link href="/sign-up-login" className="btn-primary text-base py-3 px-8 mx-auto gap-2">
            Create Free Account <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}
