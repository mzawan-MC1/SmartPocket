'use client';
import React, { Suspense, useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, User, Save } from 'lucide-react';
import Link from 'next/link';
import { createManagedPerson, type RelationshipType } from '@/lib/people';
import { toast } from 'sonner';

const RELATIONSHIPS: { value: RelationshipType; label: string }[] = [
  { value: 'spouse', label: 'Spouse' }, { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' }, { value: 'sibling', label: 'Sibling' },
  { value: 'friend', label: 'Friend' }, { value: 'relative', label: 'Relative' },
  { value: 'colleague', label: 'Colleague' }, { value: 'client', label: 'Client' },
  { value: 'other', label: 'Other' },
];

const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR'];

function NewPersonForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    relationship: 'other' as RelationshipType,
    email: '',
    phone: '',
    notes: '',
    preferred_currency: 'AED',
  });

  useEffect(() => {
    const name = searchParams.get('name');
    if (name) setForm((f) => ({ ...f, full_name: name }));
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { toast.error('Full name is required'); return; }
    setSaving(true);
    try {
      const person = await createManagedPerson({
        full_name: form.full_name.trim(),
        relationship: form.relationship,
        email: form.email || null,
        phone: form.phone || null,
        notes: form.notes || null,
        preferred_currency: form.preferred_currency,
      });
      toast.success(`${person.full_name} added successfully`);
      router.push(`/people/${person.id}`);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to add person');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-5">
      <div className="flex justify-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-accent to-blue-600 flex items-center justify-center">
          <User size={32} className="text-white" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Full Name <span className="text-negative">*</span></label>
        <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          placeholder="e.g. Ahmed Al Mansouri"
          className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" required />
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Relationship</label>
        <select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value as RelationshipType })}
          className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
          {RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Email</label>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Optional"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Phone</label>
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Optional"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Preferred Currency</label>
        <select value={form.preferred_currency} onChange={(e) => setForm({ ...form, preferred_currency: e.target.value })}
          className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
          {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Notes</label>
        <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" rows={3}
          className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
      </div>

      <div className="flex gap-3 pt-2">
        <Link href="/people"
          className="flex-1 py-2.5 rounded-xl border border-border text-center text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
          Cancel
        </Link>
        <button type="submit" disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 disabled:opacity-60">
          <Save size={16} />
          {saving ? 'Saving...' : 'Add Person'}
        </button>
      </div>
    </form>
  );
}

export default function NewPersonPage() {
  return (
    <AppLayout activeRoute="/people">
      <div className="max-w-xl mx-auto space-y-5 pb-6">
        <div className="flex items-center gap-3">
          <Link href="/people" className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-700 text-foreground">Add Person</h1>
            <p className="text-sm text-muted-foreground">Create a managed profile</p>
          </div>
        </div>
        <Suspense fallback={<div className="card p-6 animate-pulse h-64 bg-muted" />}>
          <NewPersonForm />
        </Suspense>
      </div>
    </AppLayout>
  );
}
