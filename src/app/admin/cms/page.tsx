'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Layout, Loader2, Plus, Trash2, GripVertical, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';
import { normalizePublicNavHref } from '@/lib/platform-settings';
import InternationalPhoneInput, { type InternationalPhoneValue } from '@/components/phone/InternationalPhoneInput';
import { buildNormalizedPhoneParts, getPlatformContactPhoneCountryCode } from '@/lib/phone';
import { useClientReferenceData } from '@/lib/reference-data/client';
import CmsPagesTab from '@/app/admin/cms/components/CmsPagesTab';

interface MenuItem {
  id: string;
  label: string;
  href: string;
}

interface FooterSection {
  id: string;
  title: string;
  links: { id: string; label: string; href: string }[];
}

type CmsAdminTab = 'header' | 'footer' | 'contact' | 'payment' | 'pages';

export default function AdminCmsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const requestedTab = searchParams.get('tab');
  const activeTab: CmsAdminTab =
    requestedTab === 'footer' ||
    requestedTab === 'contact' ||
    requestedTab === 'payment' ||
    requestedTab === 'pages'
      ? requestedTab
      : 'header';

  const [headerMenu, setHeaderMenu] = useState<MenuItem[]>([
    { id: 'hm-1', label: 'About', href: '/home#about' },
    { id: 'hm-2', label: 'Features', href: '/home#features' },
    { id: 'hm-3', label: 'Pricing', href: '/home#pricing' },
    { id: 'hm-4', label: 'Contact', href: '/contact' },
  ]);

  const [footerSections, setFooterSections] = useState<FooterSection[]>([
    {
      id: 'fs-1',
      title: 'Product',
      links: [
        { id: 'fl-1', label: 'Features', href: '/home#features' },
        { id: 'fl-2', label: 'Pricing', href: '/home#pricing' },
        { id: 'fl-3', label: 'About', href: '/home#about' },
      ],
    },
    {
      id: 'fs-2',
      title: 'Company',
      links: [
        { id: 'fl-4', label: 'Contact', href: '/contact' },
        { id: 'fl-5', label: 'Help Center', href: '/help' },
      ],
    },
    {
      id: 'fs-3',
      title: 'Legal',
      links: [
        { id: 'fl-6', label: 'Privacy Policy', href: '/privacy' },
        { id: 'fl-7', label: 'Terms of Service', href: '/terms' },
      ],
    },
  ]);

  const [contact, setContact] = useState({
    contact_email: '',
    contact_phone: '',
    contact_phone_country_code: '',
    contact_address: '',
  });
  const [contactPhoneCountryCode, setContactPhoneCountryCode] = useState('');
  const { data: referenceData, loading: referenceDataLoading } = useClientReferenceData(true);
  const countries = referenceData?.snapshot.countries ?? [];

  const [payment, setPayment] = useState({
    payment_stripe_enabled: false,
    payment_paypal_enabled: false,
  });

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          if (data.header_menu && Array.isArray(data.header_menu) && data.header_menu.length > 0) {
            setHeaderMenu(
              (data.header_menu as MenuItem[]).map((item) => ({
                ...item,
                href: normalizePublicNavHref(item.href),
              }))
            );
          }
          if (data.footer_sections && Array.isArray(data.footer_sections) && data.footer_sections.length > 0) {
            setFooterSections(
              (data.footer_sections as FooterSection[]).map((section) => ({
                ...section,
                links: section.links.map((link) => ({
                  ...link,
                  href: normalizePublicNavHref(link.href),
                })),
              }))
            );
          }
          setContact({
            contact_email: data.contact_email || '',
            contact_phone: data.contact_phone || '',
            contact_phone_country_code: getPlatformContactPhoneCountryCode({
              explicitCountryCode: data.contact_phone_country_code,
              phoneValue: data.contact_phone,
              countries,
            }),
            contact_address: data.contact_address || '',
          });
          setContactPhoneCountryCode(
            getPlatformContactPhoneCountryCode({
              explicitCountryCode: data.contact_phone_country_code,
              phoneValue: data.contact_phone,
              countries,
            })
          );
          setPayment({
            payment_stripe_enabled: data.payment_stripe_enabled ?? false,
            payment_paypal_enabled: data.payment_paypal_enabled ?? false,
          });
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    const resolvedPhoneCountryCode = getPlatformContactPhoneCountryCode({
      explicitCountryCode: contactPhoneCountryCode || contact.contact_phone_country_code,
      phoneValue: contact.contact_phone,
      countries,
    });

    if (!resolvedPhoneCountryCode || resolvedPhoneCountryCode === contactPhoneCountryCode) {
      return;
    }

    setContactPhoneCountryCode(resolvedPhoneCountryCode);
    setContact((current) => ({
      ...current,
      contact_phone_country_code: resolvedPhoneCountryCode,
    }));
  }, [contact.contact_phone, contact.contact_phone_country_code, contactPhoneCountryCode, countries]);

  const tabs = useMemo(
    () => [
      { id: 'header' as const, label: 'Header Menu' },
      { id: 'footer' as const, label: 'Footer Sections' },
      { id: 'contact' as const, label: 'Contact Details' },
      { id: 'payment' as const, label: 'Payment Settings' },
      { id: 'pages' as const, label: 'Pages' },
    ],
    []
  );

  const setActiveTab = (tab: CmsAdminTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`/admin/cms?${params.toString()}`, { scroll: false });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if ((contactPhoneCountryCode || contact.contact_phone_country_code) && countries.length === 0) {
        throw new Error('Country reference data is still loading. Please try again in a moment.');
      }

      const normalizedPhone = buildNormalizedPhoneParts({
        value: contact.contact_phone,
        countryCode: contactPhoneCountryCode || contact.contact_phone_country_code,
        countries,
      });
      const resolvedPhoneCountryCode = getPlatformContactPhoneCountryCode({
        explicitCountryCode: contactPhoneCountryCode || contact.contact_phone_country_code,
        phoneValue: contact.contact_phone,
        countries,
      });

      await savePlatformSettings({
        header_menu: headerMenu.map((item) => ({
          ...item,
          href: normalizePublicNavHref(item.href),
        })),
        footer_sections: footerSections.map((section) => ({
          ...section,
          links: section.links.map((link) => ({
            ...link,
            href: normalizePublicNavHref(link.href),
          })),
        })),
        contact_email: contact.contact_email,
        contact_phone: normalizedPhone.e164 || normalizedPhone.display || '',
        contact_phone_country_code: resolvedPhoneCountryCode,
        contact_address: contact.contact_address,
        ...payment,
      });
      setContact((current) => ({
        ...current,
        contact_phone: normalizedPhone.e164 || normalizedPhone.display || '',
        contact_phone_country_code: resolvedPhoneCountryCode,
      }));
      setContactPhoneCountryCode(resolvedPhoneCountryCode);
      setSaved(true);
      toast.success('CMS & navigation settings saved.');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setIsSaving(false);
    }
  };

  const addHeaderItem = () => {
    setHeaderMenu((m) => [...m, { id: `hm-${Date.now()}`, label: 'New Link', href: '/' }]);
  };

  const removeHeaderItem = (id: string) => {
    setHeaderMenu((m) => m.filter((i) => i.id !== id));
  };

  const updateHeaderItem = (id: string, field: keyof MenuItem, value: string) => {
    setHeaderMenu((m) => m.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  };

  const addFooterLink = (sectionId: string) => {
    setFooterSections((s) =>
      s.map((sec) =>
        sec.id === sectionId
          ? { ...sec, links: [...sec.links, { id: `fl-${Date.now()}`, label: 'New Link', href: '/' }] }
          : sec
      )
    );
  };

  const removeFooterLink = (sectionId: string, linkId: string) => {
    setFooterSections((s) =>
      s.map((sec) =>
        sec.id === sectionId ? { ...sec, links: sec.links.filter((l) => l.id !== linkId) } : sec
      )
    );
  };

  const updateFooterLink = (sectionId: string, linkId: string, field: string, value: string) => {
    setFooterSections((s) =>
      s.map((sec) =>
        sec.id === sectionId
          ? { ...sec, links: sec.links.map((l) => (l.id === linkId ? { ...l, [field]: value } : l)) }
          : sec
      )
    );
  };

  const updateFooterSectionTitle = (sectionId: string, title: string) => {
    setFooterSections((s) => s.map((sec) => (sec.id === sectionId ? { ...sec, title } : sec)));
  };

  const addFooterSection = () => {
    setFooterSections((s) => [...s, { id: `fs-${Date.now()}`, title: 'New Section', links: [] }]);
  };

  const removeFooterSection = (id: string) => {
    setFooterSections((s) => s.filter((sec) => sec.id !== id));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-700 text-foreground">CMS & Navigation</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage public navigation, contact details, payment flags, and database-backed CMS pages.
          </p>
        </div>
        {activeTab === 'pages' ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            <FileText size={16} className="text-accent" />
            Page content saves inside the Pages tab using secure admin APIs.
          </div>
        ) : (
          <button onClick={handleSave} disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Layout size={15} />}
            {saved ? 'Saved' : 'Save Settings'}
          </button>
        )}
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-2 rounded-lg text-xs font-600 whitespace-nowrap transition-all ${
              activeTab === tab.id ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'header' ? (
        <div className="card-elevated p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-600 text-foreground">Header Navigation Links</h2>
            <button onClick={addHeaderItem} className="btn-secondary text-xs py-1.5">
              <Plus size={13} /> Add Link
            </button>
          </div>
          <div className="space-y-3">
            {headerMenu.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                <GripVertical size={14} className="text-muted-foreground flex-shrink-0" />
                <input
                  type="text"
                  className="input-base flex-1 text-sm"
                  placeholder="Label"
                  value={item.label}
                  onChange={(e) => updateHeaderItem(item.id, 'label', e.target.value)}
                />
                <input
                  type="text"
                  className="input-base flex-1 text-sm font-mono"
                  placeholder="/path"
                  value={item.href}
                  onChange={(e) => updateHeaderItem(item.id, 'href', e.target.value)}
                />
                <button onClick={() => removeHeaderItem(item.id)} className="text-negative hover:opacity-70 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === 'footer' ? (
        <div className="space-y-4">
          {footerSections.map((section) => (
            <div key={section.id} className="card-elevated p-5 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  className="input-base flex-1 font-600"
                  placeholder="Section title"
                  value={section.title}
                  onChange={(e) => updateFooterSectionTitle(section.id, e.target.value)}
                />
                <button onClick={() => removeFooterSection(section.id)} className="text-negative hover:opacity-70 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="space-y-2 ps-2">
                {section.links.map((link) => (
                  <div key={link.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      className="input-base flex-1 text-sm"
                      placeholder="Label"
                      value={link.label}
                      onChange={(e) => updateFooterLink(section.id, link.id, 'label', e.target.value)}
                    />
                    <input
                      type="text"
                      className="input-base flex-1 text-sm font-mono"
                      placeholder="/path"
                      value={link.href}
                      onChange={(e) => updateFooterLink(section.id, link.id, 'href', e.target.value)}
                    />
                    <button onClick={() => removeFooterLink(section.id, link.id)} className="text-negative hover:opacity-70 flex-shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button onClick={() => addFooterLink(section.id)} className="text-xs text-accent hover:underline flex items-center gap-1 mt-1">
                  <Plus size={12} /> Add link
                </button>
              </div>
            </div>
          ))}
          <button onClick={addFooterSection} className="btn-secondary w-full text-sm">
            <Plus size={14} /> Add Footer Section
          </button>
        </div>
      ) : null}

      {activeTab === 'contact' ? (
        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Contact Information</h2>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Support Email</label>
            <input
              type="email"
              className="input-base"
              placeholder="info@1smartpocket.com"
              value={contact.contact_email}
              onChange={(e) => setContact((c) => ({ ...c, contact_email: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Phone Number</label>
            <InternationalPhoneInput
              value={contact.contact_phone}
              countryCode={contactPhoneCountryCode}
              countries={countries}
              countriesLoading={referenceDataLoading}
              onChange={(phone: InternationalPhoneValue) => {
                setContactPhoneCountryCode(phone.countryCode || '');
                setContact((current) => ({
                  ...current,
                  contact_phone: phone.e164 || phone.display || '',
                  contact_phone_country_code: phone.countryCode || '',
                }));
              }}
              placeholder="+1 555 000 0000"
              helperText="Stores the selected country separately and saves the public phone as a normalized international number."
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Office Address</label>
            <textarea
              rows={3}
              className="input-base resize-none"
              placeholder="123 Finance Street, Dubai, UAE"
              value={contact.contact_address}
              onChange={(e) => setContact((c) => ({ ...c, contact_address: e.target.value }))}
            />
          </div>
        </div>
      ) : null}

      {activeTab === 'payment' ? (
        <div className="card-elevated p-5 space-y-4">
          <h2 className="text-base font-600 text-foreground">Payment Provider Toggles</h2>
          <p className="text-xs text-muted-foreground">
            These flags indicate which payment providers are configured. Actual credentials remain in environment variables.
          </p>
          {[
            { key: 'payment_stripe_enabled' as const, label: 'Stripe', desc: 'Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY in environment variables.' },
            { key: 'payment_paypal_enabled' as const, label: 'PayPal', desc: 'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in environment variables.' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <p className="text-sm font-600 text-foreground">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <button
                onClick={() => setPayment((p) => ({ ...p, [item.key]: !p[item.key] }))}
                className={`relative h-5 w-10 rounded-full transition-colors ${payment[item.key] ? 'bg-accent' : 'bg-muted'}`}
                aria-label={`Toggle ${item.label}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${payment[item.key] ? 'start-5' : 'start-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {activeTab === 'pages' ? <CmsPagesTab /> : null}
    </div>
  );
}
