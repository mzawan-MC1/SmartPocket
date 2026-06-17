import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="py-16 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-700 text-foreground mb-4">About Smart Pocket</h1>
          <p className="text-lg text-muted-foreground">Built for people who want clarity over their finances</p>
        </div>
        <div className="prose max-w-none space-y-6">
          <div className="card-elevated p-8">
            <h2 className="text-xl font-700 text-foreground mb-4">Our Mission</h2>
            <p className="text-muted-foreground leading-relaxed">
              Smart Pocket was built with one goal: make personal finance management accessible, beautiful, and powerful for everyone — regardless of their financial background or language.
            </p>
          </div>
          <div className="card-elevated p-8">
            <h2 className="text-xl font-700 text-foreground mb-4">What We Offer</h2>
            <ul className="space-y-3 text-muted-foreground">
              {[
                'Multi-currency support with shared runtime formatting and official AED display support',
                'Full Arabic RTL layout and 4-language support',
                'Bank-level security with Supabase RLS',
                'Professional PDF and CSV reports',
                'Mobile-first PWA — install on any device',
                'Receipt scanning and attachment storage',
              ]?.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent mt-2 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-center">
            <Link href="/sign-up-login" className="btn-primary text-base py-3 px-8 mx-auto">
              Start for Free <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
