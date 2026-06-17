'use client';
import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { getManagedPerson, updateManagedPerson, type ManagedPerson, type RelationshipType } from '@/lib/people';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import InternationalPhoneInput, { type InternationalPhoneValue } from '@/components/phone/InternationalPhoneInput';
import { useClientReferenceData } from '@/lib/reference-data/client';

const RELATIONSHIPS: { value: RelationshipType; label: string }[] = [
  { value: 'spouse', label: 'Spouse' }, { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' }, { value: 'sibling', label: 'Sibling' },
  { value: 'friend', label: 'Friend' }, { value: 'relative', label: 'Relative' },
  { value: 'colleague', label: 'Colleague' }, { value: 'client', label: 'Client' },
  { value: 'other', label: 'Other' },
];

export default function EditPersonPage() {
  const params = useParams();
  const router = useRouter();
  const personId = params.id as string;
  const { data: referenceData } = useClientReferenceData();
  const platformDefaultCurrency = referenceData?.platformDefaultCurrency || '';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phoneState, setPhoneState] = useState<InternationalPhoneValue>({
    display: '',
    e164: null,
    countryCode: null,
    callingCode: null,
    nationalNumber: '',
    isValid: false,
  });
  const [form, setForm] = useState({
    full_name: '', relationship: 'other' as RelationshipType,
    email: '', phone: '', phone_display: '', phone_country_code: '', phone_e164: '', notes: '', preferred_currency: '',
  });

  useEffect(() => {
    getManagedPerson(personId).then((p) => {
      if (p) {
        setForm({
          full_name: p.full_name,
          relationship: p.relationship,
          email: p.email || '',
          phone: p.phone || '',
          phone_display: p.phone_display || p.phone || '',
          phone_country_code: p.phone_country_code || '',
          phone_e164: p.phone_e164 || '',
          notes: p.notes || '',
          preferred_currency: p.preferred_currency || referenceData?.platformDefaultCurrency || '',
        });
        setPhoneState({
          display: p.phone_display || p.phone || '',
          e164: p.phone_e164 || null,
          countryCode: p.phone_country_code || null,
          callingCode: null,
          nationalNumber: '',
          isValid: !!p.phone_e164,
        });
      }
      setLoading(false);
    });
  }, [personId]);

  useEffect(() => {
    if (!platformDefaultCurrency) return;
    setForm((current) => (
      current.preferred_currency ? current : { ...current, preferred_currency: platformDefaultCurrency }
    ));
  }, [platformDefaultCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { toast.error('Full name is required'); return; }
    if (!form.preferred_currency) { toast.error('Preferred currency is required'); return; }
    setSaving(true);
    try {
      await updateManagedPerson(personId, {
        full_name: form.full_name.trim(),
        relationship: form.relationship,
        email: form.email || null,
        phone: phoneState.display || phoneState.e164 || null,
        phone_display: phoneState.display || null,
        phone_country_code: phoneState.countryCode || null,
        phone_e164: phoneState.e164 || null,
        notes: form.notes || null,
        preferred_currency: form.preferred_currency,
      });
      toast.success('Profile updated');
      router.push(`/people/${personId}`);
    } catch (err: unknown) {
      toast.error((err as Error).message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <AppLayout activeRoute="/people">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted rounded w-1/3" />
        <div className="card p-6 h-64 bg-muted" />
      </div>
    </AppLayout>
  );

  return (
    <AppLayout activeRoute="/people">
      <div className="max-w-xl mx-auto space-y-5 pb-6">
        <div className="flex items-center gap-3">
          <Link href={`/people/${personId}`} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-700 text-foreground">Edit Profile</h1>
            <p className="text-sm text-muted-foreground">{form.full_name}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Full Name <span className="text-negative">*</span></label>
            <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })}
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
              <InternationalPhoneInput
                label="Phone"
                value={form.phone_display}
                countryCode={form.phone_country_code}
                onChange={(phone) => {
                  setPhoneState(phone);
                  setForm((current) => ({
                    ...current,
                    phone: phone.display || phone.e164 || '',
                    phone_display: phone.display,
                    phone_country_code: phone.countryCode || '',
                    phone_e164: phone.e164 || '',
                  }));
                }}
                helperText="Existing phone values are preserved until you edit them."
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Preferred Currency</label>
            <CurrencySelector
              value={form.preferred_currency}
              onChange={(currencyCode) => setForm({ ...form, preferred_currency: currencyCode })}
              placeholder="Choose currency"
            />
          </div>
          <div>
            <label className="block text-sm font-600 text-foreground mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <Link href={`/people/${personId}`}
              className="flex-1 py-2.5 rounded-xl border border-border text-center text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 disabled:opacity-60">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
