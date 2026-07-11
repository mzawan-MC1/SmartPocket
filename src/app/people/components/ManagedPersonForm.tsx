'use client';

import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import CurrencySelector from '@/components/CurrencySelector';
import InternationalPhoneInput, { type InternationalPhoneValue } from '@/components/phone/InternationalPhoneInput';
import FormSection from '@/components/ui/FormSection';
import {
  dispatchSmartPocketDataChanged,
  type SmartPocketDataEntity,
} from '@/lib/data-change';
import {
  getFieldErrorTextClassName,
  getFieldInputClassName,
  getFieldLabelClassName,
} from '@/lib/form-field-styles';
import { createManagedPerson, type ManagedPerson, type RelationshipType } from '@/lib/people';
import { useClientReferenceData } from '@/lib/reference-data/client';

const RELATIONSHIPS: RelationshipType[] = [
  'spouse',
  'child',
  'parent',
  'sibling',
  'friend',
  'relative',
  'colleague',
  'client',
  'other',
];

type ManagedPersonFieldKey = 'full_name';

export default function ManagedPersonForm({
  initialName = '',
  onSuccess,
  onCancel,
}: {
  initialName?: string;
  onSuccess: (person: ManagedPerson) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const { data: referenceData } = useClientReferenceData();
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<ManagedPersonFieldKey, string>>>({});
  const fullNameErrorId = fieldErrors.full_name ? 'managed-person-full-name-error' : undefined;
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
      const message = t('people.form.fullNameRequired', { ns: 'portal' });
      setFieldErrors({ full_name: message });
      toast.error(message);
      return;
    }

    setFieldErrors({});
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

      const changedEntities: SmartPocketDataEntity[] = [
        'people',
        'dashboard',
        'reimbursements',
        'settlements',
      ];

      dispatchSmartPocketDataChanged({
        source: 'managed-person-form',
        entities: changedEntities,
      });
      toast.success(t('people.form.addedSuccessfully', { ns: 'portal', name: person.full_name }));
      onSuccess(person);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('people.form.addFailed', { ns: 'portal' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 px-2.5 py-2.5 pb-2 sm:space-y-4 sm:px-4 sm:py-4 sm:pb-3" noValidate>
      <FormSection
        variant="primary"
        title={t('people.addPerson', { ns: 'portal' })}
        description={t('people.form.createManagedProfile', { ns: 'portal' })}
        bodyClassName="space-y-3"
      >
        <div>
          <label className={getFieldLabelClassName(Boolean(fieldErrors.full_name))}>
            {t('people.form.fullName', { ns: 'portal' })} <span className="text-negative">*</span>
          </label>
          <input
            id="managed-person-full-name"
            type="text"
            value={form.full_name}
            onChange={(event) => {
              setForm((current) => ({ ...current, full_name: event.target.value }));
              setFieldErrors((current) => {
                if (!current.full_name) return current;
                const next = { ...current };
                delete next.full_name;
                return next;
              });
            }}
            placeholder={t('people.form.fullNamePlaceholder', { ns: 'portal' })}
            className={getFieldInputClassName('input-base h-11', Boolean(fieldErrors.full_name))}
            aria-invalid={fieldErrors.full_name ? 'true' : 'false'}
            aria-describedby={fullNameErrorId}
          />
          {fieldErrors.full_name ? <p id={fullNameErrorId} className={getFieldErrorTextClassName()}>{fieldErrors.full_name}</p> : null}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">{t('people.form.relationship', { ns: 'portal' })}</label>
          <select
            value={form.relationship}
            onChange={(event) => setForm((current) => ({ ...current, relationship: event.target.value as RelationshipType }))}
            className="input-base h-11"
          >
            {RELATIONSHIPS.map((relationship) => (
              <option key={relationship} value={relationship}>
                {t(`people.relationships.${relationship}` as const, {
                  ns: 'portal',
                })}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[430px]:grid-cols-2">
          <div className="min-[430px]:col-span-2">
            <label className="mb-1.5 block text-sm font-600 text-foreground">{t('people.form.email', { ns: 'portal' })}</label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              placeholder={t('people.form.optional', { ns: 'portal' })}
              className="input-base h-11"
            />
          </div>
          <div className="min-[430px]:col-span-2">
            <InternationalPhoneInput
              label={t('people.form.phone', { ns: 'portal' })}
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
              helperText={t('people.form.phoneHelper', { ns: 'portal' })}
              showNormalizationHint={false}
              gridClassName="grid-cols-[minmax(7.25rem,8.25rem)_1fr] gap-2.5"
              countrySelectorClassName="[&_.selector-trigger]:h-11 [&_.selector-trigger]:rounded-[14px] [&_.selector-trigger]:px-3 [&_.selector-value-primary]:text-[13px]"
              inputClassName="h-11 rounded-[14px] px-3"
              helperClassName="leading-5"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">{t('people.form.preferredCurrency', { ns: 'portal' })}</label>
          <CurrencySelector
            value={form.preferred_currency}
            onChange={(currencyCode) => setForm((current) => ({ ...current, preferred_currency: currencyCode }))}
            placeholder={t('people.form.chooseCurrency', { ns: 'portal' })}
          />
        </div>
      </FormSection>

      <FormSection
        variant="secondary"
        title={t('people.form.notes', { ns: 'portal' })}
        bodyClassName="space-y-2.5"
      >
        <div>
          <label className="mb-1.5 block text-sm font-600 text-foreground">{t('people.form.notes', { ns: 'portal' })}</label>
          <textarea
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder={t('people.form.notesPlaceholder', { ns: 'portal' })}
            rows={3}
            className="input-base min-h-[104px] resize-none rounded-[16px]"
          />
        </div>
      </FormSection>

      <div className="safe-area-bottom sticky bottom-0 -mx-2.5 border-t border-border/80 bg-card/95 px-2.5 py-3 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="flex gap-2.5">
          <button type="button" onClick={onCancel} className="btn-secondary h-11 flex-1 rounded-[14px]">
            {t('actions.cancel', { ns: 'common' })}
          </button>
          <button type="submit" disabled={saving} className="btn-primary h-11 flex-1 rounded-[14px]">
            <Save size={16} />
            {saving ? t('status.saving', { ns: 'common' }) : t('people.addPerson', { ns: 'portal' })}
          </button>
        </div>
      </div>
    </form>
  );
}
