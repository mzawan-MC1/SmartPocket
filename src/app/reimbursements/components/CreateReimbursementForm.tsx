'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import { dispatchSmartPocketDataChanged } from '@/lib/data-change';
import { resolveUserDefaultCurrency } from '@/lib/currency-totals';
import { getManagedPeople, type ManagedPerson } from '@/lib/people';
import { createReimbursement } from '@/lib/people';
import { useClientReferenceData } from '@/lib/reference-data/client';

export default function CreateReimbursementForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { data: referenceData } = useClientReferenceData();
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    person_id: '',
    amount: '',
    currency: '',
    description: '',
    notes: '',
    owed_by: 'person',
    owed_to: 'user',
    due_date: '',
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getManagedPeople(),
      resolveUserDefaultCurrency(referenceData?.platformDefaultCurrency),
    ])
      .then(([nextPeople, currencyCode]) => {
        if (cancelled) return;
        setPeople(nextPeople);
        setForm((current) => ({ ...current, currency: current.currency || currencyCode }));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load reimbursement form'))
      .finally(() => {
        if (!cancelled) setLoadingPeople(false);
      });

    return () => {
      cancelled = true;
    };
  }, [referenceData?.platformDefaultCurrency]);

  const handleSave = async () => {
    if (!form.person_id) {
      toast.error('Select a person');
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (!form.description.trim()) {
      toast.error('Description is required');
      return;
    }

    setIsSaving(true);
    try {
      await createReimbursement({
        person_id: form.person_id,
        amount: Number(form.amount),
        currency: form.currency,
        owed_by: form.owed_by,
        owed_to: form.owed_to,
        description: form.description.trim(),
        notes: form.notes.trim() || undefined,
        due_date: form.due_date || null,
      });

      dispatchSmartPocketDataChanged({
        source: 'reimbursement-form',
        entities: ['dashboard'],
      });
      toast.success('Reimbursement created');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create reimbursement');
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingPeople) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-6 text-center">
        <Loader2 size={18} className="mx-auto mb-2 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">Loading reimbursement form...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Person *</label>
        <select className="input-base" value={form.person_id} onChange={(event) => setForm((current) => ({ ...current, person_id: event.target.value }))}>
          <option value="">Select person...</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Amount *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className="input-base font-tabular"
            placeholder="0.00"
            value={form.amount}
            onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))}
          />
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Currency</label>
          <CurrencySelector
            value={form.currency}
            onChange={(currencyCode) => setForm((current) => ({ ...current, currency: currencyCode }))}
            placeholder="Choose currency"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Owed By</label>
          <select className="input-base" value={form.owed_by} onChange={(event) => setForm((current) => ({ ...current, owed_by: event.target.value }))}>
            <option value="person">Person</option>
            <option value="user">Me</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">Owed To</label>
          <select className="input-base" value={form.owed_to} onChange={(event) => setForm((current) => ({ ...current, owed_to: event.target.value }))}>
            <option value="user">Me</option>
            <option value="person">Person</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Description *</label>
        <input
          type="text"
          className="input-base"
          placeholder="What is this reimbursement for?"
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
        />
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Notes</label>
        <textarea
          rows={2}
          className="input-base resize-none"
          placeholder="Optional notes..."
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
        />
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">Due Date</label>
        <input
          type="date"
          className="input-base"
          value={form.due_date}
          onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
        />
      </div>

      <div className="flex gap-2 justify-end pt-2 border-t border-border">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary">
          {isSaving ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : 'Add Reimbursement'}
        </button>
      </div>
    </div>
  );
}
