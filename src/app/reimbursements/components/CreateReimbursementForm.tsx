'use client';

import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import { dispatchSmartPocketDataChanged, useSmartPocketDataChanged } from '@/lib/data-change';
import { resolveCurrencyPreference } from '@/lib/currency-totals';
import {
  getFieldErrorTextClassName,
  getFieldInputClassName,
  getFieldLabelClassName,
} from '@/lib/form-field-styles';
import { getManagedPeople, type ManagedPerson } from '@/lib/people';
import { createReimbursement } from '@/lib/people';
import { useClientReferenceData } from '@/lib/reference-data/client';

type ReimbursementFieldKey = 'person_id' | 'amount' | 'description';

export default function CreateReimbursementForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { data: referenceData } = useClientReferenceData();
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ReimbursementFieldKey, string>>>({});
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

  const refreshCreateCurrency = async () => {
    const currencyCode = await resolveCurrencyPreference({
      platformCurrency: referenceData?.platformDefaultCurrency,
      forceRefreshUserDefault: true,
    });

    setForm((current) => (current.currency ? current : { ...current, currency: currencyCode }));
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getManagedPeople(),
      resolveCurrencyPreference({
        platformCurrency: referenceData?.platformDefaultCurrency,
        forceRefreshUserDefault: true,
      }),
    ])
      .then(([nextPeople, currencyCode]) => {
        if (cancelled) return;
        setPeople(nextPeople);
        setForm((current) => ({ ...current, currency: current.currency || currencyCode }));
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : t('reimbursements.form.loadFailed', { ns: 'portal' })))
      .finally(() => {
        if (!cancelled) setLoadingPeople(false);
      });

    return () => {
      cancelled = true;
    };
  }, [referenceData?.platformDefaultCurrency]);

  useSmartPocketDataChanged(['profile'], 'CreateReimbursementFormCurrency', async () => {
    await refreshCreateCurrency();
  });

  const updateField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field in fieldErrors) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field as ReimbursementFieldKey];
        return next;
      });
    }
  };

  const handleSave = async () => {
    if (!form.person_id) {
      const message = t('settlements.selectPersonError', { ns: 'portal' });
      setFieldErrors({ person_id: message });
      toast.error(message);
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      const message = t('settlements.validAmountError', { ns: 'portal' });
      setFieldErrors({ amount: message });
      toast.error(message);
      return;
    }
    if (!form.description.trim()) {
      const message = t('settlements.descriptionRequired', { ns: 'portal' });
      setFieldErrors({ description: message });
      toast.error(message);
      return;
    }

    setFieldErrors({});
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
        entities: ['dashboard', 'people', 'reimbursements', 'settlements'],
      });
      toast.success(t('reimbursements.form.created', { ns: 'portal' }));
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('reimbursements.form.createFailed', { ns: 'portal' }));
    } finally {
      setIsSaving(false);
    }
  };

  if (loadingPeople) {
    return (
      <div className="rounded-xl border border-border bg-muted/10 p-6 text-center">
        <Loader2 size={18} className="mx-auto mb-2 animate-spin text-accent" />
        <p className="text-sm text-muted-foreground">{t('reimbursements.form.loading', { ns: 'portal' })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-[480px]:space-y-3">
      <div>
        <label className={getFieldLabelClassName(Boolean(fieldErrors.person_id))}>{t('settlements.person', { ns: 'portal' })} *</label>
        <select
          className={getFieldInputClassName('input-base', Boolean(fieldErrors.person_id))}
          value={form.person_id}
          onChange={(event) => updateField('person_id', event.target.value)}
        >
          <option value="">{t('settlements.selectPerson', { ns: 'portal' })}</option>
          {people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
        </select>
        {fieldErrors.person_id ? <p className={getFieldErrorTextClassName()}>{fieldErrors.person_id}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={getFieldLabelClassName(Boolean(fieldErrors.amount))}>{t('settlements.amount', { ns: 'portal' })} *</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            className={getFieldInputClassName('input-base font-tabular', Boolean(fieldErrors.amount))}
            placeholder={t('settlements.amountPlaceholder', { ns: 'portal' })}
            value={form.amount}
            onChange={(event) => updateField('amount', event.target.value)}
          />
          {fieldErrors.amount ? <p className={getFieldErrorTextClassName()}>{fieldErrors.amount}</p> : null}
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.currency', { ns: 'portal' })}</label>
          <CurrencySelector
            value={form.currency}
            onChange={(currencyCode) => setForm((current) => ({ ...current, currency: currencyCode }))}
            placeholder={t('settlements.chooseCurrency', { ns: 'portal' })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('reimbursements.form.owedBy', { ns: 'portal' })}</label>
          <select className="input-base" value={form.owed_by} onChange={(event) => setForm((current) => ({ ...current, owed_by: event.target.value }))}>
            <option value="person">{t('reimbursements.form.person', { ns: 'portal' })}</option>
            <option value="user">{t('reimbursements.form.me', { ns: 'portal' })}</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-600 text-foreground mb-1.5">{t('reimbursements.form.owedTo', { ns: 'portal' })}</label>
          <select className="input-base" value={form.owed_to} onChange={(event) => setForm((current) => ({ ...current, owed_to: event.target.value }))}>
            <option value="user">{t('reimbursements.form.me', { ns: 'portal' })}</option>
            <option value="person">{t('reimbursements.form.person', { ns: 'portal' })}</option>
          </select>
        </div>
      </div>

      <div>
        <label className={getFieldLabelClassName(Boolean(fieldErrors.description))}>{t('settlements.descriptionLabel', { ns: 'portal' })} *</label>
        <input
          type="text"
          className={getFieldInputClassName('input-base', Boolean(fieldErrors.description))}
          placeholder={t('reimbursements.form.descriptionPlaceholder', { ns: 'portal' })}
          value={form.description}
          onChange={(event) => updateField('description', event.target.value)}
        />
        {fieldErrors.description ? <p className={getFieldErrorTextClassName()}>{fieldErrors.description}</p> : null}
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('reimbursements.notes', { ns: 'portal' })}</label>
        <textarea
          rows={2}
          className="input-base resize-none"
          placeholder={t('reimbursements.optional', { ns: 'portal' })}
          value={form.notes}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
        />
      </div>

      <div>
        <label className="block text-sm font-600 text-foreground mb-1.5">{t('reimbursements.form.dueDate', { ns: 'portal' })}</label>
        <input
          type="date"
          className="input-base"
          value={form.due_date}
          onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
        />
      </div>

      <div className="sticky bottom-0 border-t border-border bg-card/95 pt-3 backdrop-blur max-[480px]:-mx-4 max-[480px]:safe-area-bottom max-[480px]:px-4">
        <div className="flex gap-2 justify-end max-[480px]:grid max-[480px]:grid-cols-2">
        <button type="button" onClick={onCancel} className="btn-secondary max-[480px]:w-full">{t('actions.cancel', { ns: 'common' })}</button>
        <button type="button" onClick={handleSave} disabled={isSaving} className="btn-primary max-[480px]:w-full">
          {isSaving ? <><Loader2 size={15} className="animate-spin" /> {t('status.saving', { ns: 'common' })}</> : t('reimbursements.addReimbursement', { ns: 'portal' })}
        </button>
        </div>
      </div>
    </div>
  );
}
