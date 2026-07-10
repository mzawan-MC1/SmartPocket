'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Download, FileText, Loader2, Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import FormattedCurrencyAmount from '@/components/currency/FormattedCurrencyAmount';
import Modal from '@/components/ui/Modal';
import { formatCurrencyText } from '@/lib/currency-formatting';
import {
  getTransactionDocumentDetails,
  type TransactionDocumentDetailsResponse,
} from '@/lib/transaction-document-details';
import { getTransactionDocumentDisplayTitle } from '@/lib/transaction-documents';
import { openSignedResourceUrl } from '@/lib/signed-resource-navigation';

export default function TransactionDetailsModal({
  isOpen,
  transactionId,
  onClose,
}: {
  isOpen: boolean;
  transactionId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(['portal', 'common']);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [details, setDetails] = useState<TransactionDocumentDetailsResponse | null>(null);
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  useEffect(() => {
    if (!isOpen || !transactionId) {
      setIsLoading(false);
      setErrorMessage('');
      setDetails(null);
      setShowMoreDetails(false);
      return;
    }

    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const response = await getTransactionDocumentDetails(transactionId);
        if (!cancelled) {
          setDetails(response);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : t('transactions.documentDetails.loadFailed', {
                  ns: 'portal',
                  defaultValue: 'Failed to load the linked receipt/document.',
                })
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, t, transactionId]);

  const title = useMemo(() => {
    if (!details) {
      return t('transactions.documentDetails.title', {
        ns: 'portal',
        defaultValue: 'Transaction Details',
      });
    }
    return getTransactionDocumentDisplayTitle({
      merchant: details.transaction.merchant,
      description: details.document?.description || details.transaction.description,
      hasDocument: details.documentState === 'available' || details.documentState === 'processing',
      fallbackLabel: t('transactions.documentDetails.fallbackTitle', {
        ns: 'portal',
        defaultValue: 'Receipt purchase',
      }),
    });
  }, [details, t]);

  const hasDocumentPreview = Boolean(details?.document?.previewUrl && details?.document?.downloadUrl);
  const documentDetails = details?.document ?? null;
  const showDocumentWarning = details?.documentState === 'unavailable';
  const showNoDocument = details?.documentState === 'missing';
  const showProcessingState = details?.documentState === 'processing';
  const totals = details?.totals ?? null;
  const showTotals = Boolean(details?.document && totals);
  const showLineItems = Boolean(details?.document?.createdFromAI);
  const detailItems = details ? [
    {
      id: 'merchant',
      label: t('transactions.merchantSource', { ns: 'portal' }),
      value: details.document?.merchant || details.transaction.merchant,
      priority: true,
    },
    {
      id: 'account',
      label: t('transactions.account', { ns: 'portal' }),
      value: details.transaction.accountName,
      priority: true,
    },
    {
      id: 'category',
      label: t('transactions.category', { ns: 'portal' }),
      value: details.transaction.categoryName,
      priority: true,
    },
    {
      id: 'date',
      label: t('transactions.date', { ns: 'portal' }),
      value: details.transaction.transactionDate,
      priority: true,
    },
    {
      id: 'receipt',
      label: t('transactions.documentReview.receiptNumber', { ns: 'portal' }),
      value: details.document?.receiptNumber,
      priority: false,
    },
    {
      id: 'confidence',
      label: t('transactions.documentDetails.confidence', {
        ns: 'portal',
        defaultValue: 'Extraction confidence',
      }),
      value: typeof details.document?.confidence === 'number'
        ? `${Math.round(details.document.confidence * 100)}%`
        : null,
      priority: false,
    },
    {
      id: 'source',
      label: t('transactions.documentDetails.sourceSurface', {
        ns: 'portal',
        defaultValue: 'Source',
      }),
      value: t(`transactions.documentDetails.sourceSurfaces.${details.document?.sourceSurface || 'add_transaction'}` as const, {
        ns: 'portal',
        defaultValue: details.document?.sourceSurface === 'smart_entry' ? 'Smart Entry' : 'Add Transaction',
      }),
      priority: false,
    },
  ].filter((item) => Boolean(item.value)) : [];

  const primaryDetailItems = detailItems.filter((item) => item.priority);
  const secondaryDetailItems = detailItems.filter((item) => !item.priority);
  const compactDescription = details?.transaction.description || details?.transaction.notes || '';
  const receiptSummaryLabel = hasDocumentPreview
    ? t('transactions.viewDocument', { ns: 'portal' })
    : showProcessingState
      ? t('status.processing', { ns: 'common' })
      : t('transactions.noReceiptDocument', { ns: 'portal' });

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (isLoading) return;
        onClose();
      }}
      title={title}
      size="lg"
      mobileLayout="sheet"
      contentClassName="sm:max-w-[42rem] sm:max-h-[90vh]"
      bodyClassName="overflow-y-auto p-3.5 sm:p-4"
      stickyFooter
      footer={(
        <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <Link
            href="/transactions"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-700 text-foreground shadow-sm transition-colors hover:bg-slate-50"
          >
            {t('actions.edit', { ns: 'common' })}
          </Link>
          <button type="button" onClick={onClose} className="btn-secondary min-h-10 px-4 text-sm">
            {t('actions.close', { ns: 'common' })}
          </button>
        </div>
      )}
    >
      <div className="space-y-3">
        {isLoading ? (
          <div className="flex min-h-[14rem] flex-col items-center justify-center gap-3 text-center">
            <Loader2 size={24} className="animate-spin text-accent" />
            <p className="text-sm text-muted-foreground">
              {t('transactions.documentDetails.loading', {
                ns: 'portal',
                defaultValue: 'Loading transaction details...',
              })}
            </p>
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-negative/20 bg-negative-soft p-4 text-sm text-negative">
            {errorMessage}
          </div>
        ) : details ? (
          <>
            <section className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] p-4 shadow-[0_16px_36px_-28px_rgba(15,23,42,0.16)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <FormattedCurrencyAmount
                    amount={details.transaction.amount}
                    currencyCode={details.transaction.currency}
                    fallbackCurrencyCode={details.transaction.currency}
                    textOnly
                    showCode
                    className="text-[1.55rem] font-800 tracking-[-0.03em] text-foreground sm:text-[1.7rem]"
                  />
                  <p className="mt-1 text-[13px] font-700 text-foreground">
                    {[details.transaction.categoryName, details.transaction.accountName].filter(Boolean).join(' • ') || '—'}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {details.transaction.transactionDate}
                  </p>
                </div>
                {details.transaction.merchant || details.transaction.description ? (
                  <div className="rounded-full bg-white px-3 py-1 text-[11px] font-700 text-muted-foreground shadow-sm">
                    {details.transaction.merchant || details.transaction.description}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="rounded-[22px] border border-slate-200/80 bg-white p-3.5">
              <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                {t('transactions.description', { ns: 'portal', defaultValue: 'Description' })}
              </p>
              <p className="mt-1.5 text-sm font-600 leading-5 text-foreground">
                {compactDescription || '—'}
              </p>
            </section>

            <section className="rounded-[22px] border border-slate-200/80 bg-white p-3.5">
              <div className="grid grid-cols-2 gap-3">
                {primaryDetailItems.map((item) => (
                  <div key={item.id} className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5">
                    <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">{item.label}</p>
                    <p className="mt-1 truncate text-[13px] font-700 text-foreground">{item.value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[22px] border border-slate-200/80 bg-white p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                    {t('transactions.documentDetails.documentSection', {
                      ns: 'portal',
                      defaultValue: 'Receipt / Document',
                    })}
                  </p>
                  <p className="mt-1 text-sm font-700 text-foreground">{receiptSummaryLabel}</p>
                </div>
                {hasDocumentPreview && documentDetails ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openSignedResourceUrl(documentDetails.previewUrl)}
                      className="btn-secondary min-h-9 px-3 text-xs"
                    >
                      {t('transactions.documentDetails.viewOriginal', {
                        ns: 'portal',
                        defaultValue: 'View',
                      })}
                    </button>
                    <button
                      type="button"
                      onClick={() => openSignedResourceUrl(documentDetails.downloadUrl, {
                        download: true,
                        fileName: documentDetails.fileName,
                      })}
                      className="btn-secondary min-h-9 px-3 text-xs"
                    >
                      <Download size={12} />
                      {t('transactions.documentDetails.downloadOriginal', {
                        ns: 'portal',
                        defaultValue: 'Download',
                      })}
                    </button>
                  </div>
                ) : null}
              </div>

              {showDocumentWarning ? (
                <p className="mt-2 text-xs text-warning">
                  {details.documentMessage || t('transactions.documentDetails.documentLoadFailed', { ns: 'portal' })}
                </p>
              ) : null}
            </section>

            {(secondaryDetailItems.length > 0 || showTotals || showLineItems || details.transaction.notes) ? (
              <section className="rounded-[22px] border border-slate-200/80 bg-white">
                <button
                  type="button"
                  onClick={() => setShowMoreDetails((current) => !current)}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
                >
                  <span className="text-sm font-800 text-foreground">
                    {t('transactions.extraDetails', { ns: 'portal', defaultValue: 'More details' })}
                  </span>
                  {showMoreDetails ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
                </button>

                {showMoreDetails ? (
                  <div className="space-y-3 border-t border-slate-200/80 px-3.5 py-3.5">
                    {secondaryDetailItems.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {secondaryDetailItems.map((item) => (
                          <div key={item.id} className="min-w-0 rounded-2xl bg-slate-50 px-3 py-2.5">
                            <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">{item.label}</p>
                            <p className="mt-1 truncate text-[13px] font-700 text-foreground">{item.value}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {details.transaction.notes ? (
                      <div className="rounded-2xl bg-slate-50 px-3 py-2.5">
                        <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">
                          {t('transactions.notes', { ns: 'portal' })}
                        </p>
                        <p className="mt-1 text-[13px] font-600 text-foreground">{details.transaction.notes}</p>
                      </div>
                    ) : null}

                    {showTotals && totals ? (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {[
                          ['subtotal', totals.subtotal],
                          ['tax', totals.tax],
                          ['discount', totals.discount],
                          ['fee', totals.fee],
                          ['calculatedTotal', totals.calculatedTotal],
                          ['receiptTotal', totals.receiptTotal],
                        ].map(([key, value]) => (
                          <div key={key} className="rounded-2xl bg-slate-50 px-3 py-2.5">
                            <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground">
                              {t(`transactions.documentDetails.${key}` as const, {
                                ns: 'portal',
                                defaultValue: key,
                              })}
                            </p>
                            <p className="mt-1 text-[13px] font-700 text-foreground">
                              {formatCurrencyText((value as number) || 0, {
                                currencyCode: details.transaction.currency,
                                fallbackCurrencyCode: details.transaction.currency,
                                textOnly: true,
                              })}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {showLineItems && details.document ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-700 uppercase tracking-wide text-muted-foreground">
                          {t('transactions.documentReview.lineItemsTitle', { ns: 'portal' })}
                        </p>
                        {details.lineItems.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            {t('transactions.documentDetails.noLineItems', {
                              ns: 'portal',
                              defaultValue: 'No line items were saved for this document.',
                            })}
                          </p>
                        ) : (
                          details.lineItems.map((item) => (
                            <div key={item.id} className="rounded-2xl bg-slate-50 px-3 py-2.5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-700 text-foreground">{item.name}</p>
                                  {item.description ? (
                                    <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                                  ) : null}
                                </div>
                                {typeof item.total === 'number' ? (
                                  <p className="text-xs font-700 text-foreground">
                                    {formatCurrencyText(item.total, {
                                      currencyCode: details.transaction.currency,
                                      fallbackCurrencyCode: details.transaction.currency,
                                      textOnly: true,
                                    })}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}
