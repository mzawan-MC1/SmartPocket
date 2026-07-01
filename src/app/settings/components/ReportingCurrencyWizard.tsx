 'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  CreditCard,
  Info,
  Landmark,
  PiggyBank,
  Wallet,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import StatusBadge from '@/components/ui/StatusBadge';
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
  ReportingCurrencyWizardAccountResult,
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

type InlineWizardError = {
  code?: string;
  message: string;
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

function getAccountTypeIcon(accountType: string) {
  switch (accountType) {
    case 'bank':
      return Landmark;
    case 'credit_card':
      return CreditCard;
    case 'savings':
    case 'investment':
      return PiggyBank;
    default:
      return Wallet;
  }
}

function formatRateValue(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRateTimestamp(value: string | null, locale: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getAccountActionTone(action: ReportingCurrencyWizardAccountAction) {
  switch (action) {
    case 'conversion':
      return 'info' as const;
    case 'correction':
      return 'warning' as const;
    default:
      return 'ready' as const;
  }
}

function getResultActionTone(action: ReportingCurrencyWizardAccountAction) {
  switch (action) {
    case 'conversion':
      return 'success' as const;
    case 'correction':
      return 'warning' as const;
    default:
      return 'info' as const;
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
  const [inlineError, setInlineError] = useState<InlineWizardError | null>(null);

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
  const convertedCount = selectedReviews.filter((review) => review.selectedAction === 'conversion').length;
  const keptCount = selectedReviews.filter((review) => review.selectedAction === 'keep').length;
  const correctedCount = selectedReviews.filter((review) => review.selectedAction === 'correction').length;

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
      setInlineError({
        code: nextError.code,
        message: nextError.message || t('settings.saveFailed', { ns: 'portal' }),
      });
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
    try {
      const loadedPreview = preview || await loadPreview(selectionList);
      setStep(2);
      return loadedPreview;
    } catch {
      setStep(1);
      return null;
    }
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
    const accountIds = preview?.accounts.map((review) => review.accountId) ?? Object.keys(draftSelections);
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
        accountIds.map((accountId) => [
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
      if (nextError.preview) {
        setPreview(nextError.preview);
        syncSelectionsFromPreview(nextError.preview);
        setStep(3);
      }
      setInlineError({
        code: nextError.code,
        message: nextError.message || t('settings.saveFailed', { ns: 'portal' }),
      });
    } finally {
      setApplying(false);
    }
  };

  const retryStageOnePreview = useCallback(async () => {
    await ensureStepTwoLoaded();
  }, [ensureStepTwoLoaded]);

  const retryApply = useCallback(async () => {
    await confirmChanges();
  }, [confirmChanges]);

  const targetCurrencyDisplay = useMemo(() => {
    if (newCurrencyRecord?.name) {
      return `${newCurrencyRecord.name} (${newReportingCurrency})`;
    }
    return newReportingCurrency;
  }, [newCurrencyRecord?.name, newReportingCurrency]);

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
        className={`rounded-[20px] border px-4 py-3 text-left transition-colors ${
          selected
            ? 'border-accent bg-accent/8 shadow-sm'
            : 'border-border bg-card hover:bg-muted/20'
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
        aria-pressed={selected}
      >
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
              selected ? 'border-accent bg-accent text-accent-foreground' : 'border-border bg-card'
            }`}
          >
            {selected ? <Check size={12} /> : null}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-700 text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
      </button>
    );
  };

  const buildReviewNote = useCallback((review: ReportingCurrencyWizardAccountReview) => {
    if (review.selectedAction === 'keep') {
      if (review.alreadyMatchesTargetCurrency) {
        return t('settings.preferences.reportingCurrencyWizard.keepAlreadyMatches', {
          ns: 'portal',
          defaultValue: 'This account already uses {{currency}}. No account record changes are needed.',
          currency: review.targetCurrency,
        });
      }
      return t('settings.preferences.reportingCurrencyWizard.keepReviewNote', {
        ns: 'portal',
        defaultValue: 'Balance stays in {{currency}}. Dashboard totals will be shown in {{target}}.',
        currency: review.currentCurrency,
        target: review.targetCurrency,
      });
    }

    if (review.selectedAction === 'correction') {
      return t('settings.preferences.reportingCurrencyWizard.correctReviewNote', {
        ns: 'portal',
        defaultValue: 'No exchange rate will be applied. The numbers stay the same and only the currency label changes.',
      });
    }

    if (review.conversion.directUpdateAllowed) {
      return t('settings.preferences.reportingCurrencyWizard.emptyDirectChange', {
        ns: 'portal',
        defaultValue: 'No exchange rate needed because this account is empty.',
      });
    }

    return t('settings.preferences.reportingCurrencyWizard.convertReviewNote', {
      ns: 'portal',
      defaultValue: 'Rate today: 1 {{from}} = {{rate}} {{to}}.',
      from: review.currentCurrency,
      rate: review.conversion.exchangeRate !== null ? formatRateValue(review.conversion.exchangeRate, locale) : '—',
      to: review.targetCurrency,
    });
  }, [locale, t]);

  const buildResultActionLabel = useCallback((item: ReportingCurrencyWizardAccountResult) => {
    if (item.action === 'conversion') {
      return t('settings.preferences.reportingCurrencyWizard.actionLabels.convert', {
        ns: 'portal',
        defaultValue: 'Convert',
      });
    }
    if (item.action === 'correction') {
      return t('settings.preferences.reportingCurrencyWizard.actionLabels.correct', {
        ns: 'portal',
        defaultValue: 'Correct Currency',
      });
    }
    return t('settings.preferences.reportingCurrencyWizard.actionLabels.keep', {
      ns: 'portal',
      defaultValue: 'Keep Current Currency',
    });
  }, [t]);

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
        <div className="flex flex-wrap items-center justify-between gap-2 p-4">
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
        <div className="flex flex-wrap items-center justify-end gap-2 p-4">
          {inlineError ? (
            <button
              type="button"
              className="btn-secondary h-10 px-4 text-sm"
              onClick={() => void retryApply()}
              disabled={applying || hasSelectionErrors}
            >
              {applying
                ? t('status.saving', { ns: 'common' })
                : t('actions.retry', { ns: 'common', defaultValue: 'Retry' })}
            </button>
          ) : null}
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
            {t('actions.close', { ns: 'common', defaultValue: 'Close' })}
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
          <button type="button" className="btn-primary h-10 px-4 text-sm" onClick={() => { onClose(); }}>
          {t('settings.preferences.reportingCurrencyWizard.doneAction', {
            ns: 'portal',
            defaultValue: 'Done',
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
        <div className="overflow-x-auto pb-1">
          <div className="flex min-w-[34rem] items-start gap-2 sm:min-w-0 sm:gap-3">
            {STEPS.map((wizardStep, index) => {
              const active = step === wizardStep.id;
              const completed = step > wizardStep.id;
              return (
                <React.Fragment key={wizardStep.id}>
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      aria-current={active ? 'step' : undefined}
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-800 ${
                        active
                          ? 'border-accent bg-accent text-accent-foreground'
                          : completed
                            ? 'border-positive bg-positive text-positive-foreground'
                            : 'border-border bg-muted/20 text-muted-foreground'
                      }`}
                    >
                      {completed ? <Check size={16} /> : wizardStep.id}
                    </span>
                    <span className={`min-w-0 text-sm font-700 ${active || completed ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {t(wizardStep.labelKey, { ns: 'portal', defaultValue: wizardStep.fallback })}
                    </span>
                  </div>
                  {index < STEPS.length - 1 ? (
                    <div className={`mt-4 h-px flex-1 ${step > wizardStep.id ? 'bg-positive/40' : 'bg-border'}`} />
                  ) : null}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {inlineError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-foreground dark:border-red-900/40 dark:bg-red-950/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 shrink-0 text-red-600 dark:text-red-300" size={18} />
              <div className="min-w-0 flex-1">
                <p className="font-700 text-foreground">
                  {inlineError.message}
                </p>
                {step === 1 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary h-9 px-3 text-sm"
                      onClick={() => void retryStageOnePreview()}
                      disabled={loadingPreview}
                    >
                      {loadingPreview
                        ? t('status.loading', { ns: 'common' })
                        : t('actions.retry', { ns: 'common', defaultValue: 'Retry' })}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary h-9 px-3 text-sm"
                      onClick={onClose}
                      disabled={loadingPreview}
                    >
                      {t('actions.cancel', { ns: 'common' })}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[24px] border border-border bg-muted/15 p-5">
                <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.currentLabel', {
                    ns: 'portal',
                    defaultValue: 'Current reporting currency',
                  })}
                </p>
                <p className="mt-2 text-xl font-800 text-foreground">{currentReportingCurrency}</p>
                <p className="mt-1 text-sm text-muted-foreground">{currentCurrencyRecord?.name || currentReportingCurrency}</p>
              </div>
              <div className="rounded-[24px] border border-accent/20 bg-accent/6 p-5">
                <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.newLabel', {
                    ns: 'portal',
                    defaultValue: 'New reporting currency',
                  })}
                </p>
                <p className="mt-2 text-xl font-800 text-foreground">{newReportingCurrency}</p>
                <p className="mt-1 text-sm text-muted-foreground">{newCurrencyRecord?.name || newReportingCurrency}</p>
              </div>
            </div>
            <div className="rounded-[24px] border border-sky-200 bg-sky-50 p-5 dark:border-sky-900/40 dark:bg-sky-950/25">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-300" size={18} />
                <div className="min-w-0">
                  <p className="text-sm font-800 text-foreground">
                    {t('settings.preferences.reportingCurrencyWizard.stepOneInfoHeading', {
                      ns: 'portal',
                      defaultValue: 'What will happen?',
                    })}
                  </p>
                  <ul className="mt-3 space-y-2 text-sm leading-relaxed text-foreground/90">
                    <li>
                      {t('settings.preferences.reportingCurrencyWizard.stepOneBulletOne', {
                        ns: 'portal',
                        defaultValue: '{{currency}} will become your reporting currency for totals and reports.',
                        currency: targetCurrencyDisplay,
                      })}
                    </li>
                    <li>
                      {t('settings.preferences.reportingCurrencyWizard.stepOneBulletTwo', {
                        ns: 'portal',
                        defaultValue: 'You will review each active personal account before anything changes.',
                      })}
                    </li>
                    <li>
                      {t('settings.preferences.reportingCurrencyWizard.stepOneBulletThree', {
                        ns: 'portal',
                        defaultValue: 'Nothing will be changed until you click Confirm changes.',
                      })}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-700 text-foreground">
                {t('settings.preferences.reportingCurrencyWizard.stepOneChipConvert', {
                  ns: 'portal',
                  defaultValue: 'Convert balance',
                })}
              </span>
              <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-700 text-foreground">
                {t('settings.preferences.reportingCurrencyWizard.stepOneChipKeep', {
                  ns: 'portal',
                  defaultValue: 'Keep current currency',
                })}
              </span>
              <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-700 text-foreground">
                {t('settings.preferences.reportingCurrencyWizard.stepOneChipCorrect', {
                  ns: 'portal',
                  defaultValue: 'Correct wrong currency',
                })}
              </span>
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
              const AccountIcon = getAccountTypeIcon(review.accountType);
              const selection = draftSelections[review.accountId] || {
                accountId: review.accountId,
                action: review.selectedAction,
                confirmationChecked: review.correction.confirmationChecked,
              };
              const secondaryRateLine = review.conversion.rateProvider || review.conversion.rateTimestamp
                ? `${review.conversion.rateProvider || '—'} · ${formatRateTimestamp(review.conversion.rateTimestamp, locale)}`
                : t('settings.preferences.reportingCurrencyWizard.notRequired', {
                    ns: 'portal',
                    defaultValue: 'Not required',
                  });

              return (
                <div key={review.accountId} className="rounded-[24px] border border-border bg-card p-4 sm:p-5">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/20 text-muted-foreground">
                          <AccountIcon size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-base font-800 text-foreground">{review.accountName}</p>
                          <p className="text-sm text-muted-foreground">{accountTypeLabel}</p>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[34rem] lg:grid-cols-4">
                        <div className="rounded-[20px] border border-border bg-muted/12 p-3">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                            {t('accounts.currentBalance', { ns: 'portal' })}
                          </p>
                          <div className="mt-2">
                            <FormattedCurrencyAmount amount={review.currentBalance} currencyCode={review.currentCurrency} className="text-sm font-700 text-foreground" />
                          </div>
                        </div>
                        <div className="rounded-[20px] border border-border bg-muted/12 p-3">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                            {t('settings.preferences.reportingCurrencyWizard.currentCurrencyLabel', {
                              ns: 'portal',
                              defaultValue: 'Current currency',
                            })}
                          </p>
                          <p className="mt-2 text-sm font-700 text-foreground">{review.currentCurrency}</p>
                        </div>
                        <div className="rounded-[20px] border border-border bg-muted/12 p-3">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                            {t('settings.preferences.reportingCurrencyWizard.newCurrencyLabel', {
                              ns: 'portal',
                              defaultValue: 'New currency',
                            })}
                          </p>
                          <p className="mt-2 text-sm font-700 text-foreground">{review.targetCurrency}</p>
                        </div>
                        <div className="rounded-[20px] border border-border bg-muted/12 p-3">
                          <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
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
                    <div className="rounded-[20px] border border-border bg-muted/10 px-4 py-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <p className="text-sm font-600 text-foreground">
                          {review.conversion.exchangeRate !== null
                            ? t('settings.preferences.reportingCurrencyWizard.rateLine', {
                                ns: 'portal',
                                defaultValue: 'Rate today: 1 {{from}} = {{rate}} {{to}}',
                                from: review.currentCurrency,
                                rate: formatRateValue(review.conversion.exchangeRate, locale),
                                to: review.targetCurrency,
                              })
                            : review.conversion.directUpdateAllowed
                              ? t('settings.preferences.reportingCurrencyWizard.emptyDirectChange', {
                                  ns: 'portal',
                                  defaultValue: 'Empty account — can be changed directly.',
                                })
                              : t('settings.preferences.reportingCurrencyWizard.noRateApplied', {
                                  ns: 'portal',
                                  defaultValue: 'No exchange rate applied',
                                })}
                        </p>
                        <StatusBadge
                          status={review.selectionError ? 'warning' : getAccountActionTone(selection.action)}
                          label={review.selectionError
                            ? t('settings.preferences.reportingCurrencyWizard.reviewStatusBlocked', {
                                ns: 'portal',
                                defaultValue: 'Needs review',
                              })
                            : selection.action === 'conversion'
                              ? t('settings.preferences.reportingCurrencyWizard.actionLabels.convert', { ns: 'portal', defaultValue: 'Convert' })
                              : selection.action === 'correction'
                                ? t('settings.preferences.reportingCurrencyWizard.actionLabels.correct', { ns: 'portal', defaultValue: 'Correct Currency' })
                                : t('settings.preferences.reportingCurrencyWizard.actionLabels.keep', { ns: 'portal', defaultValue: 'Keep Current Currency' })}
                        />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{secondaryRateLine}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {review.statusMessage || t('status.ready', { ns: 'common', defaultValue: 'Ready' })}
                      </p>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-3">
                    {renderActionButton(
                      review,
                      'conversion',
                      t('settings.preferences.reportingCurrencyWizard.reviewConvertToCurrency', {
                        ns: 'portal',
                        defaultValue: 'Convert to {{currency}}',
                        currency: review.targetCurrency,
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
                    <label className="flex items-start gap-2 rounded-[20px] border border-border bg-muted/12 px-3 py-3">
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
                    <div className="rounded-[20px] border border-accent/20 bg-accent/6 px-3 py-3 text-sm text-foreground">
                      {t('settings.preferences.reportingCurrencyWizard.emptyAccountNotice', {
                        ns: 'portal',
                        defaultValue: 'This account is empty. Its currency can be changed directly without conversion or archiving.',
                      })}
                    </div>
                  ) : null}

                  {review.selectionError && selection.action === review.selectedAction ? (
                    <div className="rounded-[20px] border border-warning/30 bg-warning-soft/20 px-3 py-3 text-sm text-foreground">
                      {review.selectionError}
                    </div>
                  ) : null}

                  {selection.action === 'conversion' && review.conversion.blockedReason ? (
                    <div className="rounded-[20px] border border-warning/30 bg-warning-soft/20 px-3 py-3 text-sm text-foreground">
                      {review.conversion.blockedReason}
                    </div>
                  ) : null}

                  {selection.action === 'correction' && review.correction.blockedReason ? (
                    <div className="rounded-[20px] border border-warning/30 bg-warning-soft/20 px-3 py-3 text-sm text-foreground">
                      {review.correction.blockedReason}
                    </div>
                  ) : null}
                </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {step === 3 && preview ? (
          <div className="space-y-4">
            <div className="rounded-[24px] border border-border bg-muted/15 p-5">
              <p className="text-sm font-800 text-foreground">
                {t('settings.preferences.reportingCurrencyWizard.summaryTitle', {
                  ns: 'portal',
                  defaultValue: 'You are about to:',
                })}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-[20px] border border-border bg-card p-3">
                  <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                    {t('settings.preferences.reportingCurrencyWizard.steps.reportingCurrency', {
                      ns: 'portal',
                      defaultValue: 'Reporting Currency',
                    })}
                  </p>
                  <p className="mt-2 text-sm font-700 text-foreground">
                    {preview.currentReportingCurrency} {'->'} {preview.newReportingCurrency}
                  </p>
                </div>
                <div className="rounded-[20px] border border-border bg-card p-3">
                  <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                    {t('settings.preferences.reportingCurrencyWizard.summaryCards.accountsToConvert', {
                      ns: 'portal',
                      defaultValue: 'Accounts to convert',
                    })}
                  </p>
                  <p className="mt-2 text-sm font-700 text-foreground">{convertedCount}</p>
                </div>
                <div className="rounded-[20px] border border-border bg-card p-3">
                  <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                    {t('settings.preferences.reportingCurrencyWizard.summaryCards.accountsToKeep', {
                      ns: 'portal',
                      defaultValue: 'Accounts to keep',
                    })}
                  </p>
                  <p className="mt-2 text-sm font-700 text-foreground">{keptCount}</p>
                </div>
                {correctedCount > 0 ? (
                  <div className="rounded-[20px] border border-border bg-card p-3">
                    <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                      {t('settings.preferences.reportingCurrencyWizard.summaryCards.accountsToCorrect', {
                        ns: 'portal',
                        defaultValue: 'Accounts to correct',
                      })}
                    </p>
                    <p className="mt-2 text-sm font-700 text-foreground">{correctedCount}</p>
                  </div>
                ) : null}
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                {t('settings.preferences.reportingCurrencyWizard.confirmationNotice', {
                  ns: 'portal',
                  defaultValue: 'Nothing will be changed until you click Confirm changes.',
                })}
              </p>
            </div>

            {preview.accounts.map((review) => (
              <div key={review.accountId} className="rounded-[24px] border border-border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-800 text-foreground">{review.accountName}</p>
                      <StatusBadge
                        status={getAccountActionTone(review.selectedAction)}
                        label={review.selectedAction === 'conversion'
                          ? t('settings.preferences.reportingCurrencyWizard.actionLabels.convert', { ns: 'portal', defaultValue: 'Convert' })
                          : review.selectedAction === 'correction'
                            ? t('settings.preferences.reportingCurrencyWizard.actionLabels.correct', { ns: 'portal', defaultValue: 'Correct Currency' })
                            : t('settings.preferences.reportingCurrencyWizard.actionLabels.keep', { ns: 'portal', defaultValue: 'Keep Current Currency' })}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{buildReviewNote(review)}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    {review.selectedAction === 'keep' ? (
                      <FormattedCurrencyAmount
                        amount={review.currentBalance}
                        currencyCode={review.currentCurrency}
                        className="text-sm font-700 text-foreground"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground sm:justify-end">
                        <FormattedCurrencyAmount amount={review.currentBalance} currencyCode={review.currentCurrency} className="text-sm font-700 text-foreground" />
                        <ArrowRight size={14} />
                        <FormattedCurrencyAmount
                          amount={review.selectedAction === 'conversion'
                            ? review.conversion.convertedBalance ?? review.currentBalance
                            : review.correction.correctedBalance}
                          currencyCode={review.targetCurrency}
                          className="text-sm font-700 text-foreground"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {step === 4 && result ? (
          <div className="space-y-4">
            <div className="rounded-[28px] border border-positive/30 bg-positive-soft/25 p-6">
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-[20px] border border-border bg-card p-4 text-sm">
                <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.newLabel', {
                    ns: 'portal',
                    defaultValue: 'New reporting currency',
                  })}
                </p>
                <p className="mt-2 font-700 text-foreground">{result.newReportingCurrency}</p>
              </div>
              <div className="rounded-[20px] border border-border bg-card p-4 text-sm">
                <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.resultConvertedLabel', {
                    ns: 'portal',
                    defaultValue: 'Accounts converted',
                  })}
                </p>
                <p className="mt-2 font-700 text-foreground">{result.convertedAccountsCount}</p>
              </div>
              <div className="rounded-[20px] border border-border bg-card p-4 text-sm">
                <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.resultKeptLabel', {
                    ns: 'portal',
                    defaultValue: 'Accounts kept',
                  })}
                </p>
                <p className="mt-2 font-700 text-foreground">{result.keptAccountsCount}</p>
              </div>
              <div className="rounded-[20px] border border-border bg-card p-4 text-sm">
                <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                  {t('settings.preferences.reportingCurrencyWizard.resultCorrectedLabel', {
                    ns: 'portal',
                    defaultValue: 'Accounts corrected',
                  })}
                </p>
                <p className="mt-2 font-700 text-foreground">{result.correctedAccountsCount}</p>
              </div>
            </div>
            <div className="space-y-3">
              {result.changedAccounts.map((item) => (
                <div key={`${item.accountId}-${item.action}`} className="rounded-[20px] border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-800 text-foreground">{item.accountName}</p>
                        <StatusBadge status={getResultActionTone(item.action)} label={buildResultActionLabel(item)} />
                        {item.archivedPreviousVersion ? (
                          <StatusBadge
                            status="info"
                            label={t('settings.preferences.reportingCurrencyWizard.archivedBadge', {
                              ns: 'portal',
                              defaultValue: 'Archived previous version',
                            })}
                          />
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {item.action === 'keep'
                          ? t('settings.preferences.reportingCurrencyWizard.keepResultNote', {
                              ns: 'portal',
                              defaultValue: 'Balance stays in {{currency}} while reporting totals use {{target}}.',
                              currency: item.previousCurrency,
                              target: result.newReportingCurrency,
                            })
                          : item.directUpdate
                            ? t('settings.preferences.reportingCurrencyWizard.directUpdateResultNote', {
                                ns: 'portal',
                                defaultValue: 'Changed directly because the account was empty.',
                              })
                            : t('settings.preferences.reportingCurrencyWizard.versionedResultNote', {
                                ns: 'portal',
                                defaultValue: 'A new account version is active and history has been preserved.',
                              })}
                      </p>
                    </div>
                    <div className="text-left sm:text-right">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground sm:justify-end">
                        <FormattedCurrencyAmount amount={item.previousBalance} currencyCode={item.previousCurrency} className="text-sm font-700 text-foreground" />
                        <ArrowRight size={14} />
                        <FormattedCurrencyAmount amount={item.resultingBalance} currencyCode={item.resultingCurrency} className="text-sm font-700 text-foreground" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
