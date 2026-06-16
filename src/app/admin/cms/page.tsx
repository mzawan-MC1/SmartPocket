'use client';
import React, { useState, useEffect } from 'react';
import { Layout, Check, Loader2, Plus, Trash2, GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { getPlatformSettings, savePlatformSettings } from '@/lib/finance';

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

export default function AdminCmsPage() {
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'header' | 'footer' | 'contact' | 'payment'>('header');

  const [headerMenu, setHeaderMenu] = useState<MenuItem[]>([
    { id: 'hm-1', label: 'About', href: '/about' },
    { id: 'hm-2', label: 'Features', href: '/features' },
    { id: 'hm-3', label: 'Pricing', href: '/pricing' },
    { id: 'hm-4', label: 'Contact', href: '/contact' },
  ]);

  const [footerSections, setFooterSections] = useState<FooterSection[]>([
    {
      id: 'fs-1',
      title: 'Product',
      links: [
        { id: 'fl-1', label: 'Features', href: '/features' },
        { id: 'fl-2', label: 'Pricing', href: '/pricing' },
        { id: 'fl-3', label: 'Security', href: '/security' },
      ],
    },
    {
      id: 'fs-2',
      title: 'Company',
      links: [
        { id: 'fl-4', label: 'About', href: '/about' },
        { id: 'fl-5', label: 'Contact', href: '/contact' },
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
    contact_address: '',
  });

  const [payment, setPayment] = useState({
    payment_stripe_enabled: false,
    payment_paypal_enabled: false,
  });

  useEffect(() => {
    getPlatformSettings()
      .then((data) => {
        if (data) {
          if (data.header_menu && Array.isArray(data.header_menu) && data.header_menu.length > 0) {
            setHeaderMenu(data.header_menu as MenuItem[]);
          }
          if (data.footer_sections && Array.isArray(data.footer_sections) && data.footer_sections.length > 0) {
            setFooterSections(data.footer_sections as FooterSection[]);
          }
          setContact({
            contact_email: data.contact_email || '',
            contact_phone: data.contact_phone || '',
            contact_address: data.contact_address || '',
          });
          setPayment({
            payment_stripe_enabled: data.payment_stripe_enabled ?? false,
            payment_paypal_enabled: data.payment_paypal_enabled ?? false,
          });
        }
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await savePlatformSettings({
        header_menu: headerMenu,
        footer_sections: footerSections,
        ...contact,
        ...payment,
      });
      setSaved(true);
      toast.success('CMS settings saved');
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
      <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-accent" /></div>
    );
  }

  const tabs = [
    { id: 'header' as const, label: 'Header Menu' },
    { id: 'footer' as const, label: 'Footer Sections' },
    { id: 'contact' as const, label: 'Contact Details' },
    { id: 'payment' as const, label: 'Payment Settings' },
  ];

  return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">CMS & Navigation</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage header menu, footer links, contact info, and payment settings</p>
          </div>
          <button onClick={handleSave} disabled={isSaving} className={`btn-primary ${saved ? 'bg-positive' : ''}`}>
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : saved ? <Check size={15} /> : <Layout size={15} />}
            {saved ? 'Saved' : 'Save All'}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 bg-muted rounded-xl p-1 overflow-x-auto">
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

        {/* Header Menu */}
        {activeTab === 'header' && (
          <div className="card-elevated p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-600 text-foreground">Header Navigation Links</h2>
              <button onClick={addHeaderItem} className="btn-secondary text-xs py-1.5">
                <Plus size={13} /> Add Link
              </button>
            </div>
            <div className="space-y-3">
              {headerMenu.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-border">
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
              {headerMenu.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No header links. Click &quot;Add Link&quot; to add one.</p>
              )}
            </div>
          </div>
        )}

        {/* Footer Sections */}
        {activeTab === 'footer' && (
          <div className="space-y-4">
            {footerSections.map((section) => (
              <div key={section.id} className="card-elevated p-5 space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    className="input-base flex-1 font-600"
                    placeholder="Section Title"
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
        )}

        {/* Contact Details */}
        {activeTab === 'contact' && (
          <div className="card-elevated p-5 space-y-4">
            <h2 className="text-base font-600 text-foreground">Contact Information</h2>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Support Email</label>
              <input
                type="email"
                className="input-base"
                placeholder="support@smartpocket.app"
                value={contact.contact_email}
                onChange={(e) => setContact((c) => ({ ...c, contact_email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">Phone Number</label>
              <input
                type="tel"
                className="input-base"
                placeholder="+1 (555) 000-0000"
                value={contact.contact_phone}
                onChange={(e) => setContact((c) => ({ ...c, contact_phone: e.target.value }))}
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
        )}

        {/* Payment Settings */}
        {activeTab === 'payment' && (
          <div className="card-elevated p-5 space-y-4">
            <h2 className="text-base font-600 text-foreground">Payment Provider Toggles</h2>
            <p className="text-xs text-muted-foreground">These flags indicate which payment providers are configured. Actual API keys must be set as environment variables.</p>
            {[
              { key: 'payment_stripe_enabled' as const, label: 'Stripe', desc: 'Set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY in environment variables' },
              { key: 'payment_paypal_enabled' as const, label: 'PayPal', desc: 'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in environment variables' },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-xl border border-border">
                <div>
                  <p className="text-sm font-600 text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <button
                  onClick={() => setPayment((p) => ({ ...p, [item.key]: !p[item.key] }))}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${payment[item.key] ? 'bg-accent' : 'bg-muted'}`}
                  aria-label={`Toggle ${item.label}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${payment[item.key] ? 'start-5' : 'start-0.5'}`} />
                </button>
              </div>
            ))}
            <div className="card-elevated p-4 border-l-4 border-warning bg-warning-soft/30">
              <p className="text-xs text-foreground font-600">Phase 2 Note</p>
              <p className="text-xs text-muted-foreground mt-1">Full payment processing (checkout, subscriptions, webhooks) is a Phase 2 feature. These toggles save the enabled state to platform_settings for future use.</p>
            </div>
          </div>
        )}
      </div>
  );
}
