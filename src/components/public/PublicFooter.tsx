'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import AppLogo from '@/components/ui/AppLogo';
import { getPlatformSettings } from '@/lib/finance';

// Social icon components using SVG to avoid lucide-react version issues
function TwitterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function LinkedinIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

interface FooterLink {
  id: string;
  label: string;
  href: string;
}

interface FooterSection {
  id: string;
  title: string;
  links: FooterLink[];
}

interface FooterSettings {
  app_name: string;
  contact_email: string;
  footer_sections: FooterSection[];
  footer_tagline?: string;
  social_twitter?: string;
  social_github?: string;
  social_linkedin?: string;
}

const DEFAULT_FOOTER: FooterSection[] = [
  {
    id: 'fs-product',
    title: 'Product',
    links: [
      { id: 'fl-1', label: 'Features', href: '/features' },
      { id: 'fl-2', label: 'Pricing', href: '/pricing' },
      { id: 'fl-3', label: 'About', href: '/about' },
    ],
  },
  {
    id: 'fs-support',
    title: 'Support',
    links: [
      { id: 'fl-4', label: 'Contact', href: '/contact' },
      { id: 'fl-5', label: 'Help Center', href: '/help' },
    ],
  },
  {
    id: 'fs-legal',
    title: 'Legal',
    links: [
      { id: 'fl-6', label: 'Privacy Policy', href: '/privacy' },
      { id: 'fl-7', label: 'Terms of Service', href: '/terms' },
    ],
  },
];

export default function PublicFooter() {
  const [settings, setSettings] = useState<FooterSettings>({
    app_name: 'Smart Pocket',
    contact_email: '',
    footer_sections: DEFAULT_FOOTER,
    footer_tagline: 'Personal finance, simplified.',
  });

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          setSettings({
            app_name: data.app_name || 'Smart Pocket',
            contact_email: data.contact_email || '',
            footer_sections:
              Array.isArray(data.footer_sections) && data.footer_sections.length > 0
                ? (data.footer_sections as FooterSection[])
                : DEFAULT_FOOTER,
            footer_tagline: (data as Record<string, unknown>).footer_tagline as string || 'Personal finance, simplified.',
            social_twitter: (data as Record<string, unknown>).social_twitter as string || '',
            social_github: (data as Record<string, unknown>).social_github as string || '',
            social_linkedin: (data as Record<string, unknown>).social_linkedin as string || '',
          });
        }
      })
      .catch(() => {});
  }, []);

  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card mt-16">
      <div className="page-shell py-14">
        {/* Top grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand column */}
          <div className="sm:col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <AppLogo size={28} />
              <span className="font-800 text-sm tracking-tight text-primary">{settings.app_name}</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {settings.footer_tagline}
            </p>
            {settings.contact_email && (
              <a
                href={`mailto:${settings.contact_email}`}
                className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                <Mail size={12} />
                {settings.contact_email}
              </a>
            )}
            {/* Social links */}
            <div className="flex items-center gap-2 mt-4">
              {settings.social_twitter && (
                <a href={settings.social_twitter} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Twitter">
                  <TwitterIcon size={15} />
                </a>
              )}
              {settings.social_github && (
                <a href={settings.social_github} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="GitHub">
                  <GithubIcon size={15} />
                </a>
              )}
              {settings.social_linkedin && (
                <a href={settings.social_linkedin} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="LinkedIn">
                  <LinkedinIcon size={15} />
                </a>
              )}
            </div>
          </div>

          {/* Dynamic footer sections */}
          {settings.footer_sections.map((section) => (
            <div key={section.id}>
              <p className="text-xs font-800 uppercase tracking-[0.16em] text-foreground mb-4">{section.title}</p>
              <ul className="space-y-2.5">
                {section.links.map((link) => (
                  <li key={link.id}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            © {year} {settings.app_name}. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</Link>
            <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
