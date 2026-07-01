'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DollarSign, Plus, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import CurrencySelector from '@/components/CurrencySelector';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import EmptyState from '@/components/ui/EmptyState';
import { useAuth } from '@/contexts/AuthContext';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import {
  getFieldErrorTextClassName,
  getFieldInputClassName,
  getFieldLabelClassName,
} from '@/lib/form-field-styles';
import {
  normalizeCurrencyCode,
  resolveCurrencyPreference,
  resolveUserDefaultCurrency,
} from '@/lib/currency-totals';
import {
  getFinancialAccountDisplayLabel,
} from '@/lib/financial-account-utils';
import { getAccounts, type FinancialAccount } from '@/lib/finance';
import {
  applySpaceSettlement,
  createSettlement,
  getManagedPeople,
  getReimbursements,
  getSettlements,
  reverseSpaceSettlement,
  type ManagedPerson,
  type Reimbursement,
  type Settlement,
  type SpaceSettlementAllocationInput,
} from '@/lib/people';
import { useClientReferenceData } from '@/lib/reference-data/client';
import {
  getMySpaceMemberships,
  getSpaceMembers,
  type Space,
  type SpaceMember,
  type SpaceRole,
} from '@/lib/spaces';
import PageHeader from '@/components/ui/PageHeader';
import FormSection from '@/components/ui/FormSection';
import SearchField from '@/components/ui/SearchField';
import StatusBadge from '@/components/ui/StatusBadge';

interface NewSettlementModalProps {
  mode: 'personal' | 'space';
  spaces: Space[];
  selectedSpaceId: string;
  onSelectedSpaceChange: (spaceId: string) => void;
  currentUserId: string | null;
  spaceMembers: SpaceMember[];
  people: ManagedPerson[];
  accounts: FinancialAccount[];
  reimbursements: Reimbursement[];
  onClose: () => void;
  onSuccess: () => void;
}

type SettlementFieldKey =
  | 'selectedSpaceId'
  | 'payerKey'
  | 'receiverKey'
  | 'space_allocations'
  | 'personId'
  | 'amount'
  | 'description';

function buildParticipantKey(userId?: string | null, personId?: string | null) {
  if (userId) return `user:${userId}`;
  if (personId) return `person:${personId}`;
  return '';
}

function parseParticipantKey(key: string) {
  if (key.startsWith('user:')) {
    return { userId: key.slice(5), personId: null as string | null };
  }
  if (key.startsWith('person:')) {
    return { userId: null as string | null, personId: key.slice(7) };
  }
  return { userId: null as string | null, personId: null as string | null };
}

function getOutstandingAmount(reimbursement: Reimbursement) {
  return Math.max(0, Number(reimbursement.amount || 0) - Number(reimbursement.amount_paid || 0));
}

function NewSettlementModal({
  mode,
  spaces,
  selectedSpaceId,
  onSelectedSpaceChange,
  currentUserId,
  spaceMembers,
  people,
  accounts,
  reimbursements,
  onClose,
  onSuccess,
}: NewSettlementModalProps) {
  const { t } = useTranslation('portal');
  const { data: referenceData } = useClientReferenceData();
  const [personId, setPersonId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('cash');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedReimbs, setSelectedReimbs] = useState<string[]>([]);
  const [payerKey, setPayerKey] = useState('');
  const [receiverKey, setReceiverKey] = useState('');
  const [spaceAllocationAmounts, setSpaceAllocationAmounts] = useState<Record<string, string>>({});
  const [spaceAllocationSelection, setSpaceAllocationSelection] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SettlementFieldKey, string>>>({});
  const secureSettlementAccountMovementAvailable = false;
  const autoResolvedCurrencyRef = useRef('');

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people]
  );
  const membersByUserId = useMemo(
    () => new Map(spaceMembers.map((member) => [member.user_id, member])),
    [spaceMembers]
  );

  const getParticipantLabel = useCallback((userId?: string | null, personId?: string | null) => {
    if (personId) {
      return peopleById.get(personId)?.full_name || t('settlements.managedPerson', {
        defaultValue: 'Managed person',
      });
    }
    if (userId) {
      if (userId === currentUserId) {
        return t('common:you', { defaultValue: 'You' });
      }
      return membersByUserId.get(userId)?.user_profile?.full_name || t('settlements.spaceMember', {
        defaultValue: 'Space member',
      });
    }
    return t('settlements.unknownParticipant', { defaultValue: 'Unknown participant' });
  }, [currentUserId, membersByUserId, peopleById, t]);

  const personReimbs = useMemo(() => reimbursements.filter(
    (reimbursement) => reimbursement.person_id === personId
      && (reimbursement.status === 'pending' || reimbursement.status === 'partially_paid')
      && !reimbursement.space_id
  ), [personId, reimbursements]);

  const spaceReimbursements = useMemo(() => reimbursements.filter((reimbursement) => (
    reimbursement.space_id === selectedSpaceId
    && (reimbursement.status === 'pending' || reimbursement.status === 'partially_paid')
    && getOutstandingAmount(reimbursement) > 0
  )), [reimbursements, selectedSpaceId]);

  const participantOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; userId: string | null; personId: string | null }>();
    spaceReimbursements.forEach((reimbursement) => {
      const payer = {
        key: buildParticipantKey(
          reimbursement.beneficiary_user_id,
          reimbursement.beneficiary_person_id || reimbursement.person_id
        ),
        userId: reimbursement.beneficiary_user_id || null,
        personId: reimbursement.beneficiary_person_id || reimbursement.person_id || null,
      };
      const receiver = {
        key: buildParticipantKey(reimbursement.payer_user_id, reimbursement.payer_person_id),
        userId: reimbursement.payer_user_id || null,
        personId: reimbursement.payer_person_id || null,
      };

      [payer, receiver].forEach((participant) => {
        if (!participant.key || map.has(participant.key)) return;
        map.set(participant.key, {
          ...participant,
          label: getParticipantLabel(participant.userId, participant.personId),
        });
      });
    });

    return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
  }, [getParticipantLabel, spaceReimbursements]);

  const eligibleSpaceReimbursements = useMemo(() => {
    if (!payerKey || !receiverKey) return [];
    return spaceReimbursements.filter((reimbursement) => (
      buildParticipantKey(
        reimbursement.beneficiary_user_id,
        reimbursement.beneficiary_person_id || reimbursement.person_id
      ) === payerKey
      && buildParticipantKey(reimbursement.payer_user_id, reimbursement.payer_person_id) === receiverKey
    ));
  }, [payerKey, receiverKey, spaceReimbursements]);

  useEffect(() => {
    if (mode !== 'space') return;
    if (participantOptions.length === 0) return;
    if (!payerKey) {
      setPayerKey(participantOptions[0].key);
    }
  }, [mode, participantOptions, payerKey]);

  useEffect(() => {
    if (mode !== 'space' || !payerKey) return;
    const matchingReimbursement = spaceReimbursements.find((reimbursement) => (
      buildParticipantKey(
        reimbursement.beneficiary_user_id,
        reimbursement.beneficiary_person_id || reimbursement.person_id
      ) === payerKey
    ));
    const nextReceiverKey = eligibleSpaceReimbursements.length > 0
      ? receiverKey
      : matchingReimbursement
        ? buildParticipantKey(matchingReimbursement.payer_user_id, matchingReimbursement.payer_person_id)
        : '';
    if (!receiverKey && nextReceiverKey) {
      setReceiverKey(nextReceiverKey);
    }
  }, [eligibleSpaceReimbursements.length, mode, payerKey, receiverKey, spaceReimbursements]);

  useEffect(() => {
    if (mode !== 'space') return;

    const nextAmounts: Record<string, string> = {};
    const nextSelection: Record<string, boolean> = {};
    eligibleSpaceReimbursements.forEach((reimbursement) => {
      nextAmounts[reimbursement.id] = getOutstandingAmount(reimbursement).toFixed(2);
      nextSelection[reimbursement.id] = true;
    });
    setSpaceAllocationAmounts(nextAmounts);
    setSpaceAllocationSelection(nextSelection);
  }, [eligibleSpaceReimbursements, mode]);

  const selectedSpaceAllocations = useMemo<SpaceSettlementAllocationInput[]>(() => eligibleSpaceReimbursements
    .filter((reimbursement) => spaceAllocationSelection[reimbursement.id])
    .map((reimbursement) => ({
      reimbursement_id: reimbursement.id,
      amount: Number(spaceAllocationAmounts[reimbursement.id] || 0),
    }))
    .filter((allocation) => Number.isFinite(allocation.amount) && allocation.amount > 0), [eligibleSpaceReimbursements, spaceAllocationAmounts, spaceAllocationSelection]);

  const selectedSpaceTotal = useMemo(
    () => selectedSpaceAllocations.reduce((sum, allocation) => sum + allocation.amount, 0),
    [selectedSpaceAllocations]
  );
  const selectedReceivingAccountCurrency = useMemo(
    () => accounts.find((account) => account.id === accountId)?.currency || null,
    [accountId, accounts]
  );
  const selectedSpaceCurrency = useMemo(() => {
    if (mode !== 'space') {
      return null;
    }

    const reimbursementsById = new Map(
      eligibleSpaceReimbursements.map((reimbursement) => [reimbursement.id, reimbursement])
    );

    return selectedSpaceAllocations
      .map((allocation) => reimbursementsById.get(allocation.reimbursement_id)?.currency || null)
      .find((value) => normalizeCurrencyCode(value))
      || eligibleSpaceReimbursements
        .map((reimbursement) => reimbursement.currency)
        .find((value) => normalizeCurrencyCode(value))
      || null;
  }, [eligibleSpaceReimbursements, mode, selectedSpaceAllocations]);
  const requiredCurrency = mode === 'space' ? selectedSpaceCurrency : selectedReceivingAccountCurrency;

  const refreshResolvedCurrency = useCallback(async () => {
    const currencyCode = await resolveCurrencyPreference({
      accountCurrency: requiredCurrency,
      platformCurrency: referenceData?.platformDefaultCurrency,
      forceRefreshUserDefault: true,
    });

    const previousAutoCurrency = autoResolvedCurrencyRef.current;
    autoResolvedCurrencyRef.current = currencyCode;

    setCurrency((current) => {
      if (requiredCurrency) {
        return current === currencyCode ? current : currencyCode;
      }

      if (current && current !== previousAutoCurrency) {
        return current;
      }

      return current === currencyCode ? current : currencyCode;
    });
  }, [referenceData?.platformDefaultCurrency, requiredCurrency]);

  useEffect(() => {
    let cancelled = false;

    void refreshResolvedCurrency().catch(() => {
      if (!cancelled) {
        autoResolvedCurrencyRef.current = '';
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshResolvedCurrency]);

  useSmartPocketDataChanged(['profile'], 'NewSettlementModalCurrency', async () => {
    await refreshResolvedCurrency();
  });

  const parsedPayer = parseParticipantKey(payerKey);
  const parsedReceiver = parseParticipantKey(receiverKey);
  const personErrorId = fieldErrors.personId ? 'settlement-person-error' : undefined;
  const amountErrorId = fieldErrors.amount ? 'settlement-amount-error' : undefined;
  const descriptionErrorId = fieldErrors.description ? 'settlement-description-error' : undefined;
  const spaceAllocationsErrorId = fieldErrors.space_allocations ? 'settlement-space-allocations-error' : undefined;

  const clearFieldError = (field: SettlementFieldKey) => {
    setSubmitError(null);
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!description.trim()) {
      const message = t('settlements.descriptionRequired');
      setFieldErrors({ description: message });
      setSubmitError(message);
      toast.error(message);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      if (mode === 'space') {
        if (!selectedSpaceId) {
          const message = t('settlements.selectSpaceError', { defaultValue: 'Select a Space first.' });
        setFieldErrors({ selectedSpaceId: message });
          setSubmitError(message);
          toast.error(message);
          return;
        }
        if (!payerKey || !receiverKey) {
          const message = t('settlements.selectParticipantsError', { defaultValue: 'Select both payer and receiver.' });
        setFieldErrors({
          ...(payerKey ? {} : { payerKey: message }),
          ...(receiverKey ? {} : { receiverKey: message }),
        });
          setSubmitError(message);
          toast.error(message);
          return;
        }
        if (selectedSpaceAllocations.length === 0 || selectedSpaceTotal <= 0) {
          const message = t('settlements.selectReimbursementsError', {
            defaultValue: 'Select at least one reimbursement allocation.',
          });
        setFieldErrors({ space_allocations: message });
          setSubmitError(message);
          toast.error(message);
          return;
        }

        await applySpaceSettlement({
          space_id: selectedSpaceId,
          payer_user_id: parsedPayer.userId,
          payer_person_id: parsedPayer.personId,
          receiver_user_id: parsedReceiver.userId,
          receiver_person_id: parsedReceiver.personId,
          amount: Number(selectedSpaceTotal.toFixed(2)),
          currency,
          settlement_date: date,
          description: description.trim(),
          notes: notes || undefined,
          from_account_id: null,
          to_account_id: null,
          allocations: selectedSpaceAllocations,
        });
      } else {
        if (!personId) {
          const message = t('settlements.selectPersonError');
        setFieldErrors({ personId: message });
          setSubmitError(message);
          toast.error(message);
          return;
        }
        if (!amount || Number(amount) <= 0) {
          const message = t('settlements.validAmountError');
        setFieldErrors({ amount: message });
          setSubmitError(message);
          toast.error(message);
          return;
        }

        await createSettlement({
          person_id: personId,
          amount: Number(amount),
          currency,
          settlement_date: date,
          payment_method: method,
          receiving_account_id: accountId || null,
          description: description.trim(),
          notes: notes || undefined,
          reimbursement_ids: selectedReimbs.length > 0 ? selectedReimbs : undefined,
        });
      }

      toast.success(t('settlements.recorded'));
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = (err as Error).message || t('settlements.recordFailed');
      setSubmitError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-foreground/30 backdrop-blur-sm">
      <div className="bg-card rounded-2xl shadow-card-md w-full max-w-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-700 text-foreground">{t('settlements.newSettlement')}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <FormSection
            variant="primary"
            title={mode === 'space' ? t('settlements.newSettlement') : t('settlements.recordSettlement')}
            bodyClassName="space-y-4"
          >
            {mode === 'space' ? (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="md:col-span-3">
                    <label className={getFieldLabelClassName(Boolean(fieldErrors.selectedSpaceId))}>
                      {t('settlements.space', { defaultValue: 'Space' })}
                    </label>
                    <select
                      value={selectedSpaceId}
                      onChange={(e) => {
                        clearFieldError('selectedSpaceId');
                        onSelectedSpaceChange(e.target.value);
                      }}
                      className={getFieldInputClassName('w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30', Boolean(fieldErrors.selectedSpaceId))}
                    >
                      <option value="">{t('settlements.selectSpace', { defaultValue: 'Select Space' })}</option>
                      {spaces.map((space) => (
                        <option key={space.id} value={space.id}>
                          {space.name}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.selectedSpaceId ? <p className={getFieldErrorTextClassName()}>{fieldErrors.selectedSpaceId}</p> : null}
                  </div>
                  <div>
                    <label className={getFieldLabelClassName(Boolean(fieldErrors.payerKey))}>
                      {t('settlements.payer', { defaultValue: 'Payer' })}
                    </label>
                    <select
                      value={payerKey}
                      onChange={(e) => {
                        clearFieldError('payerKey');
                        setPayerKey(e.target.value);
                      }}
                      className={getFieldInputClassName('w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30', Boolean(fieldErrors.payerKey))}
                    >
                      <option value="">{t('settlements.selectPayer', { defaultValue: 'Select payer' })}</option>
                      {participantOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.payerKey ? <p className={getFieldErrorTextClassName()}>{fieldErrors.payerKey}</p> : null}
                  </div>
                  <div>
                    <label className={getFieldLabelClassName(Boolean(fieldErrors.receiverKey))}>
                      {t('settlements.receiver', { defaultValue: 'Receiver' })}
                    </label>
                    <select
                      value={receiverKey}
                      onChange={(e) => {
                        clearFieldError('receiverKey');
                        setReceiverKey(e.target.value);
                      }}
                      className={getFieldInputClassName('w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30', Boolean(fieldErrors.receiverKey))}
                    >
                      <option value="">{t('settlements.selectReceiver', { defaultValue: 'Select receiver' })}</option>
                      {participantOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.receiverKey ? <p className={getFieldErrorTextClassName()}>{fieldErrors.receiverKey}</p> : null}
                  </div>
                  <div>
                    <label className="block text-sm font-600 text-foreground mb-1.5">
                      {t('settlements.currency')}
                    </label>
                    <CurrencySelector
                      value={currency}
                      onChange={setCurrency}
                      placeholder={t('settlements.chooseCurrency')}
                    />
                  </div>
                </div>

                <div className={`rounded-xl border p-4 ${fieldErrors.space_allocations ? 'border-negative/40 bg-negative-soft/10' : 'border-border bg-card'}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                        {t('settlements.eligibleOutstanding', { defaultValue: 'Eligible outstanding reimbursements' })}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t('settlements.partialOrFull', {
                          defaultValue: 'Select one or more reimbursements and adjust each allocation for a partial or full settlement.',
                        })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-muted-foreground">
                        {t('settlements.allocatedTotal', { defaultValue: 'Allocated total' })}
                      </p>
                      <FormattedCurrencyAmount
                        amount={selectedSpaceTotal}
                        currencyCode={currency || requiredCurrency || ''}
                        className="text-sm font-700 text-foreground"
                        showCode
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {eligibleSpaceReimbursements.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        {t('settlements.noEligibleReimbursements', {
                          defaultValue: 'No outstanding reimbursements match the selected payer and receiver.',
                        })}
                      </p>
                    ) : (
                      eligibleSpaceReimbursements.map((reimbursement) => {
                        const outstanding = getOutstandingAmount(reimbursement);
                        return (
                          <div key={reimbursement.id} className="rounded-xl border border-border bg-card p-3">
                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <label className="flex flex-1 cursor-pointer items-start gap-3">
                                <input
                                  type="checkbox"
                                  checked={spaceAllocationSelection[reimbursement.id] ?? false}
                                  onChange={(e) => {
                                    clearFieldError('space_allocations');
                                    setSpaceAllocationSelection((current) => ({
                                      ...current,
                                      [reimbursement.id]: e.target.checked,
                                    }));
                                  }}
                                  className="mt-1 rounded"
                                />
                                <div className="min-w-0">
                                  <p className="text-sm font-600 text-foreground">{reimbursement.description}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {t('settlements.outstandingForReimbursement', {
                                      defaultValue: 'Outstanding',
                                    })}
                                    {': '}
                                    <FormattedCurrencyAmount
                                      amount={outstanding}
                                      currencyCode={reimbursement.currency}
                                      className="inline-flex text-xs text-muted-foreground"
                                      showCode
                                    />
                                  </p>
                                  {reimbursement.transaction?.description ? (
                                    <p className="text-xs text-muted-foreground">
                                      {t('settlements.originatingTransaction', {
                                        defaultValue: 'Origin: {{description}}',
                                        description: reimbursement.transaction.description,
                                      })}
                                    </p>
                                  ) : null}
                                </div>
                              </label>
                              <div className="w-full md:w-40">
                                <label className="mb-1 block text-xs font-600 text-muted-foreground">
                                  {t('settlements.allocateAmount', { defaultValue: 'Allocate amount' })}
                                </label>
                                <input
                                  id={`settlement-allocation-${reimbursement.id}`}
                                  type="number"
                                  min="0.01"
                                  max={outstanding}
                                  step="0.01"
                                  value={spaceAllocationAmounts[reimbursement.id] || ''}
                                  onChange={(e) => {
                                    clearFieldError('space_allocations');
                                    setSpaceAllocationAmounts((current) => ({
                                      ...current,
                                      [reimbursement.id]: e.target.value,
                                    }));
                                  }}
                                  className={getFieldInputClassName('w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30', Boolean(fieldErrors.space_allocations))}
                                  aria-invalid={fieldErrors.space_allocations ? 'true' : 'false'}
                                  aria-describedby={spaceAllocationsErrorId}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  {fieldErrors.space_allocations ? <p id={spaceAllocationsErrorId} className={getFieldErrorTextClassName()}>{fieldErrors.space_allocations}</p> : null}
                </div>
              </>
            ) : (
              <div>
                <label className={getFieldLabelClassName(Boolean(fieldErrors.personId))}>{t('settlements.person')} <span className="text-negative">*</span></label>
                <select
                  id="settlement-person"
                  value={personId}
                  onChange={(e) => {
                    clearFieldError('personId');
                    setPersonId(e.target.value);
                  }}
                  className={getFieldInputClassName('w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30', Boolean(fieldErrors.personId))}
                  aria-invalid={fieldErrors.personId ? 'true' : 'false'}
                  aria-describedby={personErrorId}
                >
                  <option value="">{t('settlements.selectPerson')}</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
                {fieldErrors.personId ? <p id={personErrorId} className={getFieldErrorTextClassName()}>{fieldErrors.personId}</p> : null}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={getFieldLabelClassName(Boolean(fieldErrors.amount))}>{t('settlements.amount')} <span className="text-negative">*</span></label>
                {mode === 'space' ? (
                  <div className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-600 text-foreground">
                    <FormattedCurrencyAmount
                      amount={selectedSpaceTotal}
                      currencyCode={currency || requiredCurrency || ''}
                      className="text-sm font-600 text-foreground"
                      showCode
                    />
                  </div>
                ) : (
                  <input
                    id="settlement-amount"
                    type="number"
                    value={amount}
                    onChange={(e) => {
                      clearFieldError('amount');
                      setAmount(e.target.value);
                    }}
                    placeholder={t('settlements.amountPlaceholder')}
                    min="0.01"
                    step="0.01"
                    className={getFieldInputClassName('w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30', Boolean(fieldErrors.amount))}
                    aria-invalid={fieldErrors.amount ? 'true' : 'false'}
                    aria-describedby={amountErrorId}
                  />
                )}
                {fieldErrors.amount ? <p id={amountErrorId} className={getFieldErrorTextClassName()}>{fieldErrors.amount}</p> : null}
              </div>
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.currency')}</label>
                <CurrencySelector
                  value={currency}
                  onChange={setCurrency}
                  placeholder={t('settlements.chooseCurrency')}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.date')}</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            </div>

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.paymentMethod')}</label>
              {mode === 'space' ? (
                <div className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                  {t('settlements.offPlatform', { defaultValue: 'Off-platform settlement' })}
                </div>
              ) : (
                <select value={method} onChange={(e) => setMethod(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                  <option value="cash">{t('settlements.methods.cash')}</option>
                  <option value="bank_transfer">{t('settlements.methods.bankTransfer')}</option>
                  <option value="card">{t('settlements.methods.card')}</option>
                  <option value="digital_wallet">{t('settlements.methods.digitalWallet')}</option>
                  <option value="other">{t('settlements.methods.other')}</option>
                </select>
              )}
            </div>

            {mode === 'space' ? (
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  {secureSettlementAccountMovementAvailable
                    ? t('settlements.optionalAccountMovement', {
                      defaultValue: 'Secure account movement is available for this settlement.',
                    })
                    : t('settlements.accountMovementUnavailable', {
                      defaultValue: 'Account movement is temporarily hidden until secure destination account options are available. Off-platform settlement remains available.',
                    })}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.receivingAccount')}</label>
                <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
                  <option value="">{t('settlements.noneExternal')}</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {getFinancialAccountDisplayLabel(a, {
                        includeCurrency: true,
                        includeDefaultLabel: true,
                      })}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={getFieldLabelClassName(Boolean(fieldErrors.description))}>{t('settlements.descriptionLabel')} <span className="text-negative">*</span></label>
              <input
                id="settlement-description"
                type="text"
                value={description}
                onChange={(e) => {
                  clearFieldError('description');
                  setDescription(e.target.value);
                }}
                placeholder={t('settlements.descriptionPlaceholder')}
                className={getFieldInputClassName('w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30', Boolean(fieldErrors.description))}
                aria-invalid={fieldErrors.description ? 'true' : 'false'}
                aria-describedby={descriptionErrorId}
              />
              {fieldErrors.description ? <p id={descriptionErrorId} className={getFieldErrorTextClassName()}>{fieldErrors.description}</p> : null}
            </div>

            {mode === 'personal' && personReimbs.length > 0 && (
              <div>
                <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.clearReimbursements')}</label>
                <div className="max-h-32 space-y-2 overflow-y-auto">
                  {personReimbs.map((r) => (
                    <label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-lg p-2 hover:bg-muted">
                      <input type="checkbox" checked={selectedReimbs.includes(r.id)}
                        onChange={(e) => setSelectedReimbs(e.target.checked
                          ? [...selectedReimbs, r.id]
                          : selectedReimbs.filter((id) => id !== r.id))}
                        className="rounded" />
                      <span className="flex-1 text-sm text-foreground">{r.description}</span>
                      <FormattedCurrencyAmount
                        amount={Number(r.amount) - Number(r.amount_paid)}
                        currencyCode={r.currency}
                        className="text-xs text-muted-foreground"
                        showCode
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-600 text-foreground mb-1.5">{t('settlements.notes')}</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('settlements.optional')}
                className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30" />
            </div>
          </FormSection>

          {mode === 'space' ? (
            <div className="rounded-xl border border-info/20 bg-info-soft/40 p-4">
              <p className="text-[11px] font-700 uppercase tracking-[0.14em] text-info">
                {t('settlements.preview', { defaultValue: 'Preview' })}
              </p>
              <div className="mt-2 space-y-1 text-sm text-foreground">
                <p>
                  {t('settlements.previewParticipants', {
                    defaultValue: '{{payer}} -> {{receiver}}',
                    payer: getParticipantLabel(parsedPayer.userId, parsedPayer.personId),
                    receiver: getParticipantLabel(parsedReceiver.userId, parsedReceiver.personId),
                  })}
                </p>
                <p>
                  {t('settlements.previewAllocations', {
                    defaultValue: '{{count}} reimbursement allocations selected',
                    count: selectedSpaceAllocations.length,
                  })}
                </p>
                <p>
                  {t('settlements.previewMovement', {
                    defaultValue: secureSettlementAccountMovementAvailable
                      ? 'Secure account movement is available.'
                      : 'Off-platform settlement only. Account movement is hidden.',
                  })}
                </p>
              </div>
            </div>
          ) : null}

          {submitError && Object.keys(fieldErrors).length === 0 ? (
            <div className="rounded-xl border border-negative/20 bg-negative-soft/50 px-4 py-3 text-sm text-negative">
              {submitError}
            </div>
          ) : null}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">{t('settlements.cancel')}</button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 disabled:opacity-60">
              {saving ? t('settlements.saving') : t('settlements.recordSettlement')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettlementsPage() {
  const { t } = useTranslation('portal');
  const { user } = useAuth();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [people, setPeople] = useState<ManagedPerson[]>([]);
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [reimbursements, setReimbursements] = useState<Reimbursement[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceMembers, setSpaceMembers] = useState<SpaceMember[]>([]);
  const [spaceRoles, setSpaceRoles] = useState<Record<string, SpaceRole>>({});
  const [loading, setLoading] = useState(true);
  const [fallbackCurrency, setFallbackCurrency] = useState('');
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'personal' | 'space'>('personal');
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [filterPerson, setFilterPerson] = useState('all');
  const [showModal, setShowModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, a, r, memberships] = await Promise.all([
        getSettlements(undefined, { includeReversed: true }), getManagedPeople(), getAccounts(), getReimbursements(), getMySpaceMemberships(),
      ]);
      setSettlements(s);
      setPeople(p);
      setAccounts(a);
      setReimbursements(r);
      setSpaces(memberships.map((membership) => membership.space));
      setSpaceRoles(Object.fromEntries(memberships.map((membership) => [membership.space.id, membership.role])));
    } catch {
      toast.error(t('settlements.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;

    void resolveUserDefaultCurrency().then((currencyCode) => {
      if (!cancelled) {
        setFallbackCurrency(currencyCode);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scope === 'space' && !selectedSpaceId && spaces.length > 0) {
      setSelectedSpaceId(spaces[0].id);
    }
  }, [scope, selectedSpaceId, spaces]);

  useEffect(() => {
    if (scope !== 'space' || !selectedSpaceId) {
      setSpaceMembers([]);
      return;
    }

    let cancelled = false;
    void getSpaceMembers(selectedSpaceId)
      .then((members) => {
        if (!cancelled) setSpaceMembers(members);
      })
      .catch((error) => {
        if (!cancelled) {
          setSpaceMembers([]);
          toast.error(error instanceof Error ? error.message : t('settlements.loadFailed'));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [scope, selectedSpaceId, t]);

  useSmartPocketDataChanged(['settlements', 'reimbursements', 'people', 'financial_accounts', 'profile'], 'SettlementsPage', async () => {
    setFallbackCurrency(await resolveUserDefaultCurrency());
    await loadData();
  });

  const peopleById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people]
  );
  const membersByUserId = useMemo(
    () => new Map(spaceMembers.map((member) => [member.user_id, member])),
    [spaceMembers]
  );

  const getParticipantLabel = useCallback((userId?: string | null, personId?: string | null) => {
    if (personId) {
      return peopleById.get(personId)?.full_name || t('settlements.managedPerson', {
        defaultValue: 'Managed person',
      });
    }
    if (userId) {
      if (userId === user?.id) {
        return t('common:you', { defaultValue: 'You' });
      }
      return membersByUserId.get(userId)?.user_profile?.full_name || t('settlements.spaceMember', {
        defaultValue: 'Space member',
      });
    }
    return t('settlements.unknownParticipant', { defaultValue: 'Unknown participant' });
  }, [membersByUserId, peopleById, t, user?.id]);

  const scopedSettlements = useMemo(() => settlements.filter((settlement) => {
    if (scope === 'space') {
      return settlement.space_id === selectedSpaceId;
    }
    return !settlement.space_id;
  }), [scope, selectedSpaceId, settlements]);

  const filtered = useMemo(() => scopedSettlements.filter((settlement) => {
    const payerName = getParticipantLabel(settlement.payer_user_id, settlement.payer_person_id);
    const receiverName = getParticipantLabel(
      settlement.receiver_user_id,
      settlement.receiver_person_id || settlement.person_id
    );
    const matchPerson = scope === 'personal'
      ? filterPerson === 'all' || settlement.person_id === filterPerson
      : true;
    const matchSearch = !search || [
      settlement.description,
      settlement.person?.full_name || '',
      payerName,
      receiverName,
    ].join(' ').toLowerCase().includes(search.toLowerCase());
    return matchPerson && matchSearch;
  }), [filterPerson, getParticipantLabel, scope, scopedSettlements, search]);

  const totalSettledByCurrency = useMemo(() => Array.from(
    scopedSettlements.reduce((map, settlement) => {
      const currency = normalizeCurrencyCode(settlement.currency) || fallbackCurrency;
      if (!currency) {
        return map;
      }
      map.set(currency, (map.get(currency) || 0) + Number(settlement.amount || 0));
      return map;
    }, new Map<string, number>())
  ).map(([currency, amount]) => ({ currency, amount })), [fallbackCurrency, scopedSettlements]);

  const selectedSpaceRole = selectedSpaceId ? spaceRoles[selectedSpaceId] : null;

  const handleReverseSettlement = useCallback(async (settlement: Settlement) => {
    const notes = window.prompt(
      t('settlements.reversalNotesPrompt', {
        defaultValue: 'Optional reversal notes:',
      }),
      settlement.reversal_notes || ''
    );
    if (notes === null) return;

    const confirmed = window.confirm(
      t('settlements.reverseConfirm', {
        defaultValue: 'Reverse this settlement? This keeps the audit trail and marks the settlement as reversed.',
      })
    );
    if (!confirmed) return;

    try {
      await reverseSpaceSettlement(settlement.id, notes || undefined);
      toast.success(t('settlements.reversed', { defaultValue: 'Settlement reversed.' }));
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('settlements.reverseFailed', {
        defaultValue: 'Failed to reverse settlement.',
      }));
    }
  }, [loadData, t]);

  return (
    <AppLayout activeRoute="/settlements">
      <div className="page-section pb-6 max-[480px]:gap-3">
        <PageHeader
          title={t('settlements.title')}
          description={t('settlements.description')}
          badge={<StatusBadge status="info" label={t('settlements.badge')} />}
          compact
          hideDescriptionOnMobile
          actionsClassName="w-full sm:w-auto"
          actions={
            <button onClick={() => setShowModal(true)} className="btn-primary max-[480px]:w-full">
              <Plus size={16} />
              <span>{t('settlements.newSettlement')}</span>
            </button>
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
          <div className="card p-4 max-[480px]:p-3">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">{t('settlements.totalSettlements')}</p>
            <p className="text-lg font-700 text-foreground">{scopedSettlements.length}</p>
          </div>
          <div className="card p-4 max-[480px]:p-3">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">{t('settlements.totalAmount')}</p>
            <div className="flex flex-col items-end gap-1 text-lg font-700 text-positive">
              {totalSettledByCurrency.length === 0 ? (
                t('settlements.noData')
              ) : (
                totalSettledByCurrency.map((row) => (
                  <FormattedCurrencyAmount
                    key={row.currency}
                    amount={row.amount}
                    currencyCode={row.currency}
                    className="text-lg font-700 text-positive leading-tight"
                    showCode
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="inline-flex rounded-xl border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setScope('personal')}
              className={`rounded-lg px-3 py-2 text-sm font-600 transition-colors ${
                scope === 'personal' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {t('settlements.personalScope', { defaultValue: 'Personal' })}
            </button>
            <button
              type="button"
              onClick={() => setScope('space')}
              className={`rounded-lg px-3 py-2 text-sm font-600 transition-colors ${
                scope === 'space' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {t('settlements.spaceScope', { defaultValue: 'Space' })}
            </button>
          </div>
          <SearchField
            type="text"
            placeholder={t('settlements.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="flex-1"
            inputClassName="bg-card h-[42px]"
          />
          {scope === 'space' ? (
            <select
              value={selectedSpaceId}
              onChange={(e) => setSelectedSpaceId(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              <option value="">{t('settlements.selectSpace', { defaultValue: 'Select Space' })}</option>
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          ) : (
            <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}
              className="px-3 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-accent/30">
              <option value="all">{t('settlements.allPeople')}</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          )}
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="card p-4 h-20 animate-pulse bg-muted" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={DollarSign}
              title={t('settlements.emptyTitle')}
              description={t('settlements.emptyDescription', { defaultValue: 'Record your first settlement to keep shared balances accurate.' })}
              action={{ label: t('settlements.recordFirstSettlement'), onClick: () => setShowModal(true) }}
              variant="compact"
              tone="neutral"
              className="py-10 max-[480px]:py-8"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((settlement) => {
              const payerName = getParticipantLabel(settlement.payer_user_id, settlement.payer_person_id);
              const receiverName = getParticipantLabel(
                settlement.receiver_user_id,
                settlement.receiver_person_id || settlement.person_id
              );
              const canReverse = Boolean(
                settlement.space_id
                && settlement.correction_status === 'applied'
                && !settlement.transfer_id
                && (
                  selectedSpaceRole === 'owner'
                  || selectedSpaceRole === 'manager'
                  || settlement.payer_user_id === user?.id
                  || settlement.receiver_user_id === user?.id
                )
              );

              return (
                <div key={settlement.id} className="card p-4 max-[480px]:p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr),auto] md:items-start">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-600 text-foreground">{settlement.description}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-500 ${
                          settlement.correction_status === 'reversed'
                            ? 'bg-warning-soft text-warning'
                            : 'bg-positive-soft text-positive'
                        }`}>
                          {settlement.correction_status === 'reversed'
                            ? t('settlements.reversed', { defaultValue: 'Reversed' })
                            : t('settlements.settled')}
                        </span>
                      </div>
                      {settlement.space_id ? (
                        <>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('settlements.spaceParticipants', {
                              defaultValue: '{{payer}} paid {{receiver}}',
                              payer: payerName,
                              receiver: receiverName,
                            })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t(`settlements.methods.${settlement.payment_method}`, { defaultValue: settlement.payment_method })} · {settlement.settlement_date}
                          </p>
                          {settlement.reversal_notes ? (
                            <p className="text-xs text-muted-foreground">
                              {t('settlements.reversalNotes', {
                                defaultValue: 'Reversal notes: {{notes}}',
                                notes: settlement.reversal_notes,
                              })}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {settlement.person?.full_name} · {t(`settlements.methods.${settlement.payment_method}`, { defaultValue: settlement.payment_method })} · {settlement.settlement_date}
                          </p>
                          {settlement.receiving_account && (
                            <p className="text-xs text-muted-foreground">{t('settlements.toAccount', { name: settlement.receiving_account.name })}</p>
                          )}
                        </>
                      )}
                    </div>
                    <div className="text-end">
                      <FormattedCurrencyAmount
                        amount={Number(settlement.amount)}
                        currencyCode={settlement.currency}
                        className="text-sm font-700 text-positive"
                        showCode
                      />
                      {canReverse ? (
                        <button
                          type="button"
                          onClick={() => void handleReverseSettlement(settlement)}
                          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-600 text-foreground hover:bg-muted"
                        >
                          <Undo2 size={12} />
                          {t('settlements.reverseAction', { defaultValue: 'Reverse' })}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <NewSettlementModal
          mode={scope}
          spaces={spaces}
          selectedSpaceId={selectedSpaceId}
          onSelectedSpaceChange={setSelectedSpaceId}
          currentUserId={user?.id || null}
          spaceMembers={spaceMembers}
          people={people}
          accounts={accounts}
          reimbursements={reimbursements}
          onClose={() => setShowModal(false)}
          onSuccess={loadData}
        />
      )}
    </AppLayout>
  );
}
