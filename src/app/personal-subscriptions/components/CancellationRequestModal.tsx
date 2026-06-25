'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal';
import { useLanguage } from '@/contexts/LanguageContext';

export interface CancellationRequestValues {
  request_date: string;
  effective_cancellation_date: string;
  confirmation_reference: string;
  notes: string;
}

export default function CancellationRequestModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  defaultValues,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (values: CancellationRequestValues) => Promise<void>;
  title: string;
  defaultValues?: Partial<CancellationRequestValues>;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { isRTL } = useLanguage();
  const [values, setValues] = useState<CancellationRequestValues>({
    request_date: defaultValues?.request_date || new Date().toISOString().slice(0, 10),
    effective_cancellation_date: defaultValues?.effective_cancellation_date || '',
    confirmation_reference: defaultValues?.confirmation_reference || '',
    notes: defaultValues?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  const updateField = (field: keyof CancellationRequestValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSubmit(values);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="cancel-request-date" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.cancellation.requestDate', { ns: 'portal' })}
            </label>
            <input
              id="cancel-request-date"
              type="date"
              className="input-base"
              value={values.request_date}
              onChange={(event) => updateField('request_date', event.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="cancel-effective-date" className="mb-1.5 block text-sm font-600 text-foreground">
              {t('personalSubscriptions.cancellation.effectiveDate', { ns: 'portal' })}
            </label>
            <input
              id="cancel-effective-date"
              type="date"
              className="input-base"
              value={values.effective_cancellation_date}
              onChange={(event) => updateField('effective_cancellation_date', event.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="cancel-confirmation-reference" className="mb-1.5 block text-sm font-600 text-foreground">
            {t('personalSubscriptions.cancellation.confirmationReference', { ns: 'portal' })}
          </label>
          <input
            id="cancel-confirmation-reference"
            type="text"
            className="input-base"
            value={values.confirmation_reference}
            onChange={(event) => updateField('confirmation_reference', event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="cancel-notes" className="mb-1.5 block text-sm font-600 text-foreground">
            {t('personalSubscriptions.form.fields.notes', { ns: 'portal' })}
          </label>
          <textarea
            id="cancel-notes"
            rows={4}
            className="input-base resize-none"
            value={values.notes}
            onChange={(event) => updateField('notes', event.target.value)}
          />
        </div>
        <div className={`flex gap-2 border-t border-border pt-4 ${isRTL ? 'justify-start' : 'justify-end'}`}>
          <button type="button" onClick={onClose} className="btn-secondary">
            {t('actions.cancel', { ns: 'common' })}
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                {t('personalSubscriptions.cancellation.submitting', { ns: 'portal' })}
              </>
            ) : t('personalSubscriptions.actions.requestCancellation', { ns: 'portal' })}
          </button>
        </div>
      </form>
    </Modal>
  );
}
