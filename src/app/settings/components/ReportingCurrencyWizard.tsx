'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/lib/locale';
import { useClientReferenceData } from '@/lib/reference-data/client';
import { getCurrencyByCode } from '@/lib/reference-data/lookups';
import {
  applyReportingCurrencyWizard,
  previewReportingCurrencyWizard,
} from '@/lib/finance';
import type {
  ReportingCurrencyWizardAccountReview,
  ReportingCurrencyWizardAccountAction,
  ReportingCurrencyWizardApplyResult,
  ReportingCurrencyWizardPreview,
  ReportingCurrencyWizardSelectionInput,
} from '@/lib/financial-account-currency-change';

interface ReportingCurrencyWizardProps {
  isOpen: boolean;
  currentReportingCurrency: string;
  newReportingCurrency: string;
  onClose: () => void;
  onApplied?: (result: ReportingCurrencyWizardApplyResult) => void | Promise<void>;
}

type WizardStep = 1 | 2 | 3 | 4;

type WizardError = Error & {
  code?: string;
  preview?: ReportingCurrencyWizardPreview;
};

const STEPS: Array<{ id: WizardStep; labelKey: string; fallback: string }> = [
  { id: 1, labelKey: 'settings.preferences.reportingCurrencyWizard.steps.reportingCurrency', fallback: 'Reporting Currency' },
  { id: 2, labelKey: 'settings.preferences.reportingCurrencyWizard.steps.reviewAccounts', fallback: 'Review Accounts' },
  { id: 3, labelKey: 'settings.preferences.reportingCurrencyWizard.steps.confirmChanges', fallback: 'Confirm Changes' },
  { id: 4, labelKey: 'settings.preferences.reportingCurrencyWizard.steps.result', fallback: 'Result' },
];

function getAccountTypeLabel(accountType: string, t: (key: string, options?: Record<string, unknown>) => string) {
  switch (accountType) {
    case 'bank':
      return t('accounts.types.bank', { ns: 'portal', defaultValue: 'Bank' });
    case 'credit_card':
      return t('accounts.types.creditCard', { ns: 'portal', defaultValue: 'Credit Card' });
    case 'cash':
      return t('accounts.types.cash', { ns: 'portal', defaultValue: 'Cash' });
    case 'savings':
      return t('accounts.types.savings', { ns: 'portal', defaultValue: 'Savings' });
    case 'digital_wallet':
      return t('accounts.types.digitalWallet', { ns: 'portal', defaultValue: 'Digital Wallet' });
    case 'investment':
      return t('accounts.types.investment', { ns: 'portal', defaultValue: 'Investment' });
    default:
      return t('accounts.types.other', { ns: 'portal', defaultValue: 'Other' });
  }
}

export default function ReportingCurrencyWizard({
  isOpen,
  currentReportingCurrency,
  newReportingCurrency,
  onClose,
  onApplied,
}: ReportingCurrencyWizardProps) {
  const { t } = useTranslation(['portal', 'common']);
  const router = useRouter();
  const { language } = useLanguage();
  const locale = getIntlLocale(language);
  const { data: referenceData } = useClientReferenceData();
  const currencies = referenceData?.snapshot.currencies ?? [];

  const [step, setStep] = useState<WizardStep>(1);
  const [preview, setPreview] = useState<ReportingCurrencyWizardPreview | null>(null);
  const [draftSelections, setDraftSelections] = useState<Record<string, ReportingCurrencyWizardSelectionInput>>({});
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ReportingCurrencyWizardApplyResult | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const currentCurrencyRecord = getCurrencyByCode(currencies, currentReportingCurrency);
  const newCurrencyRecord = getCurrencyByCode(currencies, newReportingCurrency);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setPreview(null);
      setDraftSelections({});
      setLoadingPreview(false);
      setApplying(false);
      setResult(null);
      setInlineError(null);
    }
  }, [isOpen]);

  const selectedReviews = preview?.accounts ?? [];
  const hasSelectionErrors = selectedReviews.some((review) => Boolean(review.selectionError));

  const syncSelectionsFromPreview = useCallback((nextPreview: ReportingCurrencyWizardPreview) => {
    setDraftSelections(
      Object.fromEntries(
        nextPreview.accounts.map((review) => [
          review.accountId,
          {
            accountId: review.accountId,
            action: review.selectedAction,
            confirmationChecked: review.correction.confirmationChecked,
          },
        ])
      )
    );
  }, []);

  const loadPreview = useCallback(async (selections?: ReportingCurrencyWizardSelectionInput[]) => {
    setLoadingPreview(true);
    setInlineError(null);
    try {
      const nextPreview = await previewReportingCurrencyWizard({
        newReportingCurrency,
        selections,
      });
      setPreview(nextPreview);
      syncSelectionsFromPreview(nextPreview);
      return nextPreview;
    } catch (error) {
      const nextError = error as WizardError;
      if (nextError.preview) {
        setPreview(nextError.preview);
        syncSelectionsFromPreview(nextError.preview);
      }
      setInlineError(nextError.message || t('settings.saveFailed', { ns: 'portal' }));
      throw nextError;
    } finally {
      setLoadingPreview(false);
    }
  }, [newReportingCurrency, syncSelectionsFromPreview, t]);

  const selectionList = useMemo(
    () => Object.values(draftSelections),
    [draftSelections]
  );

  const ensureStepTwoLoaded = useCallback(async () => {
    const loadedPreview = preview || await loadPreview(selectionList);
    setStep(2);
    return loadedPreview;
  }, [loadPreview, preview, selectionList]);

  const setAccountAction = (accountId: string, action: ReportingCurrencyWizardAccountAction) => {
    setDraftSelections((current) => ({
      ...current,
      [accountId]: {
        accountId,
        action,
        confirmationChecked: action === 'correction'
          ? current[accountId]?.confirmationChecked === true
          : false,
      },
    }));
  };

  const setCorrectionConfirmed = (accountId: string, checked: boolean) => {
    setDraftSelections((current) => ({
      ...current,
      [accountId]: {
        accountId,
        action: current[accountId]?.action || 'correction',
        confirmationChecked: checked,
      },
    }));
  };

  const runBulkKeep = () => {
    const hasExplicitChanges = Object.values(draftSelections).some((selection) => selection.action !== 'keep');
    if (hasExplicitChanges && !window.confirm(
      t('settings.preferences.reportingCurrencyWizard.bulk.keepAllConfirm', {
        ns: 'portal',
        defaultValue: 'Keep all accounts in their current currencies?',
      })
    )) {
      return;
    }

    setDraftSelections((current) =>
      Object.fromEntries(
        Object.keys(current).map((accountId) => [
          accountId,
          {
            accountId,
            action: 'keep' as const,
            confirmationChecked: false,
          },
        ])
      )
    );
  };

  const runBulkConvert = () => {
    if (!preview) return;
    const hasExplicitChanges = preview.accounts.some((review) => {
      const currentSelection = draftSelections[review.accountId];
      return currentSelection && (
        currentSelection.action === 'correction'
        || (currentSelection.action === 'conversion' && !review.conversion.eligible)
      );
    });
    if (hasExplicitChanges && !window.confirm(
      t('settings.preferences.reportingCurrencyWizard.bulk.convertEligibleConfirm', {
        ns: 'portal',
        defaultValue: 'Convert all eligible accounts and keep blocked accounts unchanged?',
      })
    )) {
      return;
    }

    setDraftSelections(
      Object.fromEntries(
        preview.accounts.map((review) => [
          review.accountId,
          {
            accountId: review.accountId,
            action: review.conversion.eligible ? 'conversion' : 'keep',
            confirmationChecked: false,
          },
        ])
      )
    );
  };

  const continueToConfirm = async () => {
    try {
      const nextPreview = await loadPreview(selectionList);
      setPreview(nextPreview);
      if (nextPreview.accounts.some((review) => Boolean(review.selectionError))) {
        setStep(2);
        return;
      }
      setStep(3);
    } catch {
      setStep(2);
    }
  };

  const confirmChanges = async () => {
    if (!preview) return;
    setApplying(true);
    setInlineError(null);
    try {
      const appliedResult = await applyReportingCurrencyWizard({
        newReportingCurrency,
        selections: selectionList,
        batchPreviewToken: preview.batchPreviewToken,
      });
      setResult(appliedResult);
      await onApplied?.(appliedResult);
      toast.success(
        appliedResult.convertedAccountsCount > 0 || appliedResult.correctedAccountsCount > 0
          ? t('settings.preferences.reportingCurrencyWizard.successToast', {
              ns: 'portal',
              defaultValue: 'Reporting currency changed to {{currency}} and your account choices were applied successfully.',
              currency: newReportingCurrency,
            })
          : t('settings.preferences.reportingCurrencyChangedNotice', {
              ns: 'portal',
              defaultValue: 'Reporting currency changed to {{currency}}. Existing account currencies were not changed.',
              currency: newReportingCurrency,
            })
      );
      setStep(4);
    } catch (error) {
      const nextError = error as WizardError;
      if (nextError.code === 'preview_outdated' && nextError.preview) {
        setPreview(nextError.preview);
        syncSelectionsFromPreview(nextError.preview);
        setStep(3);
      }
      setInlineError(nextError.message || t('settings.saveFailed', { ns: 'portal' }));
    } finally {
      setApplying(false);
    }
  };

  const historyTargetAccountId = useMemo(() => {
    if (!result) return null;
    const changedAccount = result.changedAccounts.find((item) => item.action !== 'keep');
    if (!changedAccount) return null;
    return changedAccount.newAccountId || changedAccount.accountId;
  }, [result]);

  const renderActionButton = (
    review: ReportingCurrencyWizardAccountReview,
    action: ReportingCurrencyWizardAccountAction,
    title: string,
    description: string,
    disabled: boolean
  ) => {
    const selected = (draftSelections[review.accountId]?.action || review.selectedAction) === action;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setAccountAction(review.accountId, action)}
        className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
          selected
            ? 'border-accent bg-accent/8'
            : 'border-border bg-card hover:bg-muted/20'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <p className="text-sm font-700 text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </button>
    );
  };

  const wizardFooter = (() => {
    if (step === 1) {
      return (
        <div className="flex flex-wrap justify-end gap-2 p-4">
          <button type="button" className="btn-secondary h-10 px-4 text-sm" onClick={onClose}>
            {t('actions.cancel', { ns: 'common' })}
          </button>
          <button
            type="button"
            className="btn-primary h-10 px-4 text-sm"
            onClick={() => void ensureStepTwoLoaded()}
            disabled={loadingPreview}
          >
            {loadingPreview ? t('status.loading', { ns: 'common' }) : t('actions.continue', { ns: 'common', defaultValue: 'Continue' })}
          </button>
        </div>
      );
    }

    if (step === 2) {
      return (
        <div className="flex flex-wrap justify-between gap-2 p-4">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary h-10 px-4 text-sm" onClick={runBulkConvert}>
              {t('settings.preferences.reportingCurrencyWizard.bulk.convertEligible', {
                ns: 'portal',
                defaultValue: 'Convert all eligible accounts to {{currency}}',
                currency: newReportingCurrency,
              })}
            </button>
            <button type="button" className="btn-secondary h-10 px-4 text-sm" onClick={runBulkKeep}>
              {t('settings.preferences.reportingCurrencyWizard.bulk.keepAll', {
                ns: 'portal',
                defaultValue: 'Keep all accounts in their current currencies',
              })}
            </button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary h-10 px-4 text-sm" onClick={() => setStep(1)}>
              {t('actions.back', { ns: 'common', defaultValue: 'Back' })}
            </button>
            <button type="button" className="btn-secondary h-10 px-4 text-sm" onClick={onClose}>
              {t('actions.cancel', { ns: 'common' })}
            </button>
            <button type="button" className="btn-primary h-10 px-4 text-sm" onClick={() => void continueToConfirm()} disabled={loadingPreview}>
              {loadingPreview ? t('status.loading', { ns: 'common' }) : t('actions.continue', { ns: 'common', defaultValue: 'Continue' })}
            </button>
          </div>
        </div>
      );
    }

    if (step === 3) {
      return (
        <div className="flex flex-wrap justify-end gap-2 p-4">
          <button type="button" className="btn-secondary h-10 px-4 text-sm" onClick={() => setStep(2)} disabled={applying}>
            {t('actions.back', { ns: 'common', defaultValue: 'Back' })}
          </button>
          <button type="button" className="btn-secondary h-10 px-4 text-sm" onClick={onClose} disabled={applying}>
            {t('actions.cancel', { ns: 'common' })}
          </button>
          <button type="button" className="btn-primary h-10 px-4 text-sm" onClick={() => void confirmChanges()} disabled={applying || hasSelectionErrors}>
            {applying
              ? t('status.saving', { ns: 'common' })
              : t('settings.preferences.reportingCurrencyWizard.confirmAction', {
                  ns: 'portal',
                  defaultValue: 'Confirm Changes',
                })}
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap justify-end gap-2 p-4">
        <button type="button" className="btn-secondary h-10 px-4 text-sm" onClick={() => { onClose(); }}>
          {t('settings.preferences.reportingCurrencyWizard.doneAction', {
            ns: 'portal',
            defaultValue: 'Done',
          })}
        </button>
        <button
          type="button"
          className="btn-secondary h-10 px-4 text-sm"
          onClick={() => {
            onClose();
            router.push('/financial-accounts');
          }}
        >
          {t('settings.preferences.reportingCurrencyWizard.viewAccountsAction', {
            ns: 'portal',
            defaultValue: 'View Accounts',
          })}
        </button>
        <button
          type="button"
          className="btn-primary h-10 px-4 text-sm"
          disabled={!historyTargetAccountId}
          onClick={() => {
            if (!historyTargetAccountId) return;
            onClose();
            router.push(`/financial-accounts?focusAccountId=${historyTargetAccountId}&showCurrencyHistory=1`);
          }}
        >
          {t('settings.preferences.reportingCurrencyWizard.viewHistoryAction', {
            ns: 'portal',
            defaultValue: 'View Currency History',
          })}
        </button>
      </div>
    );
  })();

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!applying) {
          onClose();
        }
      }}
      title={t('settings.preferences.reportingCurrencyWizard.title', {
        ns: 'portal',
        defaultValue: 'Change currency and review accounts',
      })}
      size="xl"
      mobileLayout="fullscreen"
      stickyFooter
      closeOnBackdrop={!applying}
      closeOnEscape={!applying}
      footer={wizardFooter}
    >
      <div className="space-y-5">
        <div className="grid gap-2 sm:grid-cols-4">
          {STEPS.map((wizardStep) => {
            const active = step === wizardStep.id;
            const completed = step > wizardStep.id;
            return (
              <div
                key={wizardStep.id}
                aria-current={active ? 'step' : undefined}
                className={`rounded-2xl border px-3 py-3 text-sm ${
                  active
                    ? 'border-accent bg-accent/8 text-foreground'
                    : completed
                      ? 'border-positive/30 bg-positive-soft/25 text-foreground'
                      : 'border-border bg-muted/15 text-muted-foreground'
                }`}
              >
                <p className="text-xs font-700 uppercase tracking-wide">{wizardStep.id}</p>
                <p className="mt-1 font-700">
                  {t(wizardStep.labelKey, { ns: 'portal', defaultValue: wizardStep.fallback })}
                </p>
              </div>
            );
          })}
        </div>

        {inlineError ? (
          <div className="rounded-2xl border border-warning/30 bg-warning-soft/20 px-4 py-3 text-sm text-foreground">
            {inlineError}
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/15 p-4">
              <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                {t('settings.preferences.reportingCurrencyWizard.currentLabel', {
                  ns: 'portal',
                  defaultValue: 'Current reporting currency',
                })}
              </p>
              <p className="mt-2 text-base font-700 text-foreground">
                {currentReportingCurrency} {currentCurrencyRecord ? `- ${currentCurrencyRecord.name}` : ''}
              </p>
            </div>
            <div className="rounded-2xl border border-accent/20 bg-accent/6 p-4">
              <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                {t('settings.preferences.reportingCurrencyWizard.newLabel', {
                  ns: 'portal',
                  defaultValue: 'New reporting currency',
                })}
              </p>
              <p className="mt-2 text-base font-700 text-foreground">
                {newReportingCurrency} {newCurrencyRecord ? `- ${newCurrencyRecord.name}` : ''}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                {t('settings.preferences.reportingCurrencyWizard.stepOneMessagePrimary', {
                  ns: 'portal',
                  defaultValue: 'Smart Pocket will use {{currency}} for dashboard totals, reports, and as the default currency for new accounts.',
                  currency: newReportingCurrency,
                })}
              </p>
              <p className="mt-2">
                {t('settings.preferences.reportingCurrencyWizard.stepOneMessageSecondary', {
                  ns: 'portal',
                  defaultValue: 'Your existing accounts will not change until you review and confirm how each one should be handled.',
                })}
              </p>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            {selectedReviews.length === 0 && !loadingPreview ? (
              <div className="rounded-2xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
                {t('settings.preferences.reportingCurrencyWizard.noAccounts', {
                  ns: 'portal',
                  defaultValue: 'No active personal accounts need review.',
                })}
              </div>
            ) : null}

            {selectedReviews.map((review) => {
              const accountTypeLabel = getAccountTypeLabel(review.accountType, t);
              const selection = draftSelections[review.accountId] || {
                accountId: review.accountId,
                action: review.selectedAction,
                confirmationChecked: review.correction.confirmationChecked,
              };

              return (
                <div key={review.accountId} className="rounded-[22px] border border-border bg-card p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <p className="text-base font-700 text-foreground">{review.accountName}</p>
                      <p className="text-sm text-muted-foreground">{accountTypeLabel}</p>
                    </div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2 xl:min-w-[28rem] xl:grid-cols-3">
                      <div className="rounded-2xl border border-border bg-muted/12 p-3">
                        <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                          {t('accounts.currentBalance', { ns: 'portal' })}
                        </p>
                        <div className="mt-2">
                          <FormattedCurrencyAmount amount={review.currentBalance} currencyCode={review.currentCurrency} className="text-sm font-700 text-foreground" />
                        </div>
                      </div>
                      <div className="rounded-2xl border border-border bg-muted/12 p-3">
                        <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                          {t('settings.preferences.reportingCurrencyWizard.targetLabel', {
                            ns: 'portal',
                            defaultValue: 'Target reporting currency',
                          })}
                        </p>
                        <p className="mt-2 text-sm font-700 text-foreground">{review.targetCurrency}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-muted/12 p-3">
                        <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                          {t('accounts.currencyChange.convertedBalanceLabel', {
                            ns: 'portal',
                            defaultValue: 'Converted balance',
                          })}
                        </p>
                        <div className="mt-2">
                          <FormattedCurrencyAmount
                            amount={review.conversion.convertedBalance ?? review.currentBalance}
                            currencyCode={review.targetCurrency}
                            className="text-sm font-700 text-foreground"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border border-border bg-muted/12 p-3">
                      <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                        {t('accounts.currencyChange.exchangeRateLabel', {
                          ns: 'portal',
                          defaultValue: 'Exchange rate',
                        })}
                      </p>
                      <p className="mt-2 text-sm font-600 text-foreground">
                        {review.conversion.exchangeRate !== null
                          ? `1 ${review.currentCurrency} = ${review.conversion.exchangeRate} ${review.targetCurrency}`
                          : t('settings.preferences.reportingCurrencyWizard.noRateApplied', {
                              ns: 'portal',
                              defaultValue: 'No exchange rate applied',
                            })}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/12 p-3">
                      <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                        {t('accounts.currencyChange.rateProviderLabel', {
                          ns: 'portal',
                          defaultValue: 'Rate provider',
                        })}
                      </p>
                      <p className="mt-2 text-sm font-600 text-foreground">
                        {review.conversion.rateProvider || t('settings.preferences.reportingCurrencyWizard.notRequired', {
                          ns: 'portal',
                          defaultValue: 'Not required',
                        })}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/12 p-3">
                      <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                        {t('accounts.currencyChange.rateTimeLabel', {
                          ns: 'portal',
                          defaultValue: 'Rate date/time',
                        })}
                      </p>
                      <p className="mt-2 text-sm font-600 text-foreground">
                        {review.conversion.rateTimestamp
                          ? new Intl.DateTimeFormat(locale, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            }).format(new Date(review.conversion.rateTimestamp))
                          : t('settings.preferences.reportingCurrencyWizard.notRequired', {
                              ns: 'portal',
                              defaultValue: 'Not required',
                            })}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border bg-muted/12 p-3">
                      <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                        {t('settings.preferences.reportingCurrencyWizard.statusLabel', {
                          ns: 'portal',
                          defaultValue: 'Status',
                        })}
                      </p>
                      <p className="mt-2 text-sm font-600 text-foreground">
                        {review.statusMessage || t('status.ready', { ns: 'common', defaultValue: 'Ready' })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    {renderActionButton(
                      review,
                      'conversion',
                      t('settings.preferences.reportingCurrencyWizard.options.convertTitle', {
                        ns: 'portal',
                        defaultValue: 'Convert this account',
                      }),
                      review.conversion.directUpdateAllowed
                        ? t('settings.preferences.reportingCurrencyWizard.options.convertEmptyDescription', {
                            ns: 'portal',
                            defaultValue: 'This account is empty. Its currency can be changed directly without conversion or archiving.',
                          })
                        : t('settings.preferences.reportingCurrencyWizard.options.convertDescription', {
                            ns: 'portal',
                            defaultValue: 'Use today’s rate. The current account will be archived and a new version in {{currency}} will become active.',
                            currency: review.targetCurrency,
                          }),
                      !review.conversion.eligible
                    )}
                    {renderActionButton(
                      review,
                      'keep',
                      t('settings.preferences.reportingCurrencyWizard.options.keepTitle', {
                        ns: 'portal',
                        defaultValue: 'Keep current currency',
                      }),
                      review.keepMessage,
                      false
                    )}
                    {renderActionButton(
                      review,
                      'correction',
                      t('settings.preferences.reportingCurrencyWizard.options.correctTitle', {
                        ns: 'portal',
                        defaultValue: 'Correct wrong currency',
                      }),
                      t('settings.preferences.reportingCurrencyWizard.options.correctDescription', {
                        ns: 'portal',
                        defaultValue: 'No exchange rate will be applied. The numbers will stay the same, but the currency will change.',
                      }),
                      !review.correction.eligible
                    )}
                  </div>

                  {selection.action === 'correction' ? (
                    <label className="mt-4 flex items-start gap-2 rounded-2xl border border-border bg-muted/12 px-3 py-3">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
                        checked={selection.confirmationChecked === true}
                        onChange={(event) => setCorrectionConfirmed(review.accountId, event.target.checked)}
                      />
                      <span className="text-sm text-foreground">
                        {t('settings.preferences.reportingCurrencyWizard.correctionCheckbox', {
                          ns: 'portal',
                          defaultValue: 'I confirm that all eligible amounts in this account were originally entered in {{currency}}.',
                          currency: review.targetCurrency,
                        })}
                      </span>
                    </label>
                  ) : null}

                  {selection.action === 'conversion' && review.conversion.directUpdateAllowed ? (
                    <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/6 px-3 py-3 text-sm text-foreground">
                      {t('settings.preferences.reportingCurrencyWizard.emptyAccountNotice', {
                        ns: 'portal',
                        defaultValue: 'This account is empty. Its currency can be changed directly without conversion or archiving.',
                      })}
                    </div>
                  ) : null}

                  {review.selectionError && selection.action === review.selectedAction ? (
                    <div className="mt-4 rounded-2xl border border-warning/30 bg-warning-soft/20 px-3 py-3 text-sm text-foreground">
                      {review.selectionError}
                    </div>
                  ) : null}

                  {selection.action === 'conversion' && review.conversion.blockedReason ? (
                    <div className="mt-4 rounded-2xl border border-warning/30 bg-warning-soft/20 px-3 py-3 text-sm text-foreground">
                      {review.conversion.blockedReason}
                    </div>
                  ) : null}

                  {selection.action === 'correction' && review.correction.blockedReason ? (
                    <div className="mt-4 rounded-2xl border border-warning/30 bg-warning-soft/20 px-3 py-3 text-sm text-foreground">
                      {review.correction.blockedReason}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {step === 3 && preview ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/15 p-4">
              <p className="text-sm font-700 text-foreground">
                {t('settings.preferences.reportingCurrencyWizard.summaryTitle', {
                  ns: 'portal',
                  defaultValue: 'You are about to:',
                })}
              </p>
              <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                <p>
                  {t('settings.preferences.reportingCurrencyWizard.summary.reportingChange', {
                    ns: 'portal',
                    defaultValue: 'Change reporting currency from {{from}} to {{to}}',
                    from: preview.currentReportingCurrency,
                    to: preview.newReportingCurrency,
                  })}
                </p>
                <p>
                  {t('settings.preferences.reportingCurrencyWizard.summary.converted', {
                    ns: 'portal',
                    defaultValue: 'Convert {{count}} accounts to {{currency}}',
                    count: preview.accounts.filter((review) => review.selectedAction === 'conversion').length,
                    currency: preview.newReportingCurrency,
                  })}
                </p>
                <p>
                  {t('settings.preferences.reportingCurrencyWizard.summary.kept', {
                    ns: 'portal',
                    defaultValue: 'Keep {{count}} accounts in their current currencies',
                    count: preview.accounts.filter((review) => review.selectedAction === 'keep').length,
                  })}
                </p>
                <p>
                  {t('settings.preferences.reportingCurrencyWizard.summary.corrected', {
                    ns: 'portal',
                    defaultValue: 'Correct {{count}} accounts without an exchange rate',
                    count: preview.accounts.filter((review) => review.selectedAction === 'correction').length,
                  })}
                </p>
              </div>
            </div>

            {preview.accounts.map((review) => (
              <div key={review.accountId} className="rounded-[22px] border border-border bg-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-base font-700 text-foreground">{review.accountName}</p>
                    <p className="text-sm text-muted-foreground">
                      {review.selectedAction === 'conversion'
                        ? t('settings.preferences.reportingCurrencyWizard.actionLabels.convert', { ns: 'portal', defaultValue: 'Convert' })
                        : review.selectedAction === 'correction'
                          ? t('settings.preferences.reportingCurrencyWizard.actionLabels.correct', { ns: 'portal', defaultValue: 'Correct Currency' })
                          : t('settings.preferences.reportingCurrencyWizard.actionLabels.keep', { ns: 'portal', defaultValue: 'Keep Current Currency' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <FormattedCurrencyAmount amount={review.currentBalance} currencyCode={review.currentCurrency} className="text-sm font-700 text-foreground" />
                    {(review.selectedAction === 'conversion' || review.selectedAction === 'correction') ? (
                      <div className="mt-1 flex items-center justify-end gap-2 text-sm text-muted-foreground">
                        <ArrowRight size={14} />
                        <FormattedCurrencyAmount
                          amount={review.selectedAction === 'conversion'
                            ? review.conversion.convertedBalance ?? review.currentBalance
                            : review.correction.correctedBalance}
                          currencyCode={review.targetCurrency}
                          className="text-sm font-700 text-foreground"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-muted/12 p-3 text-sm">
                    <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                      {t('accounts.currencyChange.exchangeRateLabel', { ns: 'portal', defaultValue: 'Exchange rate' })}
                    </p>
                    <p className="mt-2 font-600 text-foreground">
                      {review.selectedAction === 'conversion' && review.conversion.exchangeRate !== null
                        ? `1 ${review.currentCurrency} = ${review.conversion.exchangeRate} ${review.targetCurrency}`
                        : t('settings.preferences.reportingCurrencyWizard.noRateApplied', {
                            ns: 'portal',
                            defaultValue: 'No exchange rate applied',
                          })}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/12 p-3 text-sm">
                    <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                      {t('accounts.currencyChange.rateProviderLabel', { ns: 'portal', defaultValue: 'Rate provider' })}
                    </p>
                    <p className="mt-2 font-600 text-foreground">
                      {review.selectedAction === 'conversion'
                        ? review.conversion.rateProvider || '—'
                        : '—'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-muted/12 p-3 text-sm">
                    <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                      {t('accounts.currencyChange.rateTimeLabel', { ns: 'portal', defaultValue: 'Rate date/time' })}
                    </p>
                    <p className="mt-2 font-600 text-foreground">
                      {review.selectedAction === 'conversion' && review.conversion.rateTimestamp
                        ? new Intl.DateTimeFormat(locale, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          }).format(new Date(review.conversion.rateTimestamp))
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {step === 4 && result ? (
          <div className="space-y-4">
            <div className="rounded-[24px] border border-positive/30 bg-positive-soft/25 p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 text-positive" size={22} />
                <div>
                  <p className="text-lg font-800 text-foreground">
                    {t('settings.preferences.reportingCurrencyWizard.resultTitle', {
                      ns: 'portal',
                      defaultValue: 'Currency update completed',
                    })}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('settings.preferences.reportingCurrencyWizard.resultMessage', {
                      ns: 'portal',
                      defaultValue: 'Reporting currency changed from {{from}} to {{to}}.',
                      from: result.previousReportingCurrency,
                      to: result.newReportingCurrency,
                    })}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                <p className="font-700 text-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.resultConverted', {
                    ns: 'portal',
                    defaultValue: '{{count}} accounts converted to {{currency}}',
                    count: result.convertedAccountsCount,
                    currency: result.newReportingCurrency,
                  })}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                <p className="font-700 text-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.resultKept', {
                    ns: 'portal',
                    defaultValue: '{{count}} accounts kept their original currencies',
                    count: result.keptAccountsCount,
                  })}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                <p className="font-700 text-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.resultCorrected', {
                    ns: 'portal',
                    defaultValue: '{{count}} accounts corrected without conversion',
                    count: result.correctedAccountsCount,
                  })}
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4 text-sm">
                <p className="font-700 text-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.resultArchived', {
                    ns: 'portal',
                    defaultValue: '{{count}} previous account versions archived',
                    count: result.archivedAccountsCount,
                  })}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
