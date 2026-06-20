'use client';

import React, { useEffect, useState } from 'react';
import { Save, User } from 'lucide-react';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import InternationalPhoneInput, { type InternationalPhoneValue } from '@/components/phone/InternationalPhoneInput';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { createManagedPerson, type ManagedPerson, type RelationshipType } from '@/lib/people';
import { useClientReferenceData } from '@/lib/reference-data/client';

const RELATIONSHIPS: { value: RelationshipType; label: string }[] = [
  { value: 'spouse', label: 'Spouse' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'friend', label: 'Friend' },
  { value: 'relative', label: 'Relative' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'client', label: 'Client' },
  { value: 'other', label: 'Other' },
];

export default function ManagedPersonForm({
  initialName = '',
  onSuccess,
  onCancel,
}: {
  initialName?: string;
  onSuccess: (person: ManagedPerson) => void;
  onCancel: () => void;
}) {
  const { data: referenceData } = useClientReferenceData();
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
    full_name: initialName,
    relationship: 'other' as RelationshipType,
    email: '',
    phone: '',
    phone_display: '',
    phone_country_code: '',
    phone_e164: '',
    notes: '',
    preferred_currency: referenceData?.platformDefaultCurrency || '',
  });

  useEffect(() => {
    if (!initialName) return;
    setForm((current) => ({ ...current, full_name: current.full_name || initialName }));
  }, [initialName]);

  useEffect(() => {
    if (!referenceData?.platformDefaultCurrency) return;
    setForm((current) =>
      current.preferred_currency
        ? current
        : { ...current, preferred_currency: referenceData.platformDefaultCurrency || '' }
    );
  }, [referenceData?.platformDefaultCurrency]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.full_name.trim()) {
      toast.error('Full name is required');
      return;
    }

    setSaving(true);
    try {
      const person = await createManagedPerson({
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

      dispatchSmartPocketDataChanged({
        source: 'managed-person-form',
        entities: ['people', 'dashboard', 'reimbursements', 'settlements'],
      });
      toast.success(`${person.full_name} added successfully`);
      onSuccess(person);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add person');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-[480px]:space-y-4">
      <div className="flex justify-center max-[480px]:hidden">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-accent to-blue-600">
          <User size={32} className="text-white" />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-600 text-foreground">
          Full Name <span className="text-negative">*</span>
        </label>
        <input
          type="text"
          value={form.full_name}
          onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
          placeholder="e.g. Ahmed Al Mansouri"
          className="input-base h-11 max-[480px]:h-10"
          required
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-600 text-foreground">Relationship</label>
        <select
          value={form.relationship}
          onChange={(event) => setForm((current) => ({ ...current, relationship: event.target.value as RelationshipType }))}
          className="input-base h-11 max-[480px]:h-10"
        >
          {RELATIONSHIPS.map((relationship) => (
            <option key={relationship.value} value={relationship.value}>
              {relationship.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="Optional"
            className="input-base h-11 max-[480px]:h-10"
          />
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
            helperText="Uses the selected country code when a local number is entered."
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-600 text-foreground">Preferred Currency</label>
        <CurrencySelector
          value={form.preferred_currency}
          onChange={(currencyCode) => setForm((current) => ({ ...current, preferred_currency: currencyCode }))}
          placeholder="Choose currency"
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-600 text-foreground">Notes</label>
        <textarea
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          placeholder="Optional notes"
          rows={3}
          className="input-base resize-none"
        />
      </div>

      <div className="sticky bottom-0 safe-area-bottom border-t border-border bg-card/95 pt-3 backdrop-blur max-[480px]:-mx-4 max-[480px]:px-4">
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn-secondary flex-1">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">
            <Save size={16} />
            {saving ? 'Saving...' : 'Add Person'}
          </button>
        </div>
      </div>
    </form>
  );
}
