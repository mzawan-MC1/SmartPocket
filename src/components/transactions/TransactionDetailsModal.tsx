'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Loader2, Paperclip } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '@/components/ui/Modal';
import { formatCurrencyText } from '@/lib/currency-formatting';
import {
  getTransactionDocumentDetails,
  type TransactionDocumentDetailsResponse,
} from '@/lib/transaction-document-details';
import { getTransactionDocumentDisplayTitle } from '@/lib/transaction-documents';

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

  useEffect(() => {
    if (!isOpen || !transactionId) {
      setIsLoading(false);
      setErrorMessage('');
      setDetails(null);
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
      description: details.document.description || details.transaction.description,
      hasDocument: true,
      fallbackLabel: t('transactions.documentDetails.fallbackTitle', {
        ns: 'portal',
        defaultValue: 'Receipt purchase',
      }),
    });
  }, [details, t]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (isLoading) return;
        onClose();
      }}
      title={title}
      size="xl"
      mobileLayout="fullscreen"
      contentClassName="sm:max-w-[68rem] sm:max-h-[92vh]"
      bodyClassName="overflow-hidden p-0"
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {isLoading ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 text-center">
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
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-accent" />
                      <p className="text-sm font-700 text-foreground">
                        {t('transactions.documentDetails.documentSection', {
                          ns: 'portal',
                          defaultValue: 'Receipt / Document',
                        })}
                      </p>
                    </div>
                    {details.document.createdFromAI ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-700 text-accent">
                        <Paperclip size={12} />
                        {t('transactions.documentDetails.aiExtractedBadge', {
                          ns: 'portal',
                          defaultValue: 'AI-extracted',
                        })}
                      </span>
                    ) : null}
                  </div>

                  <div className="overflow-hidden rounded-xl border border-border bg-muted/10">
                    {details.document.mimeType === 'application/pdf' ? (
                      <iframe
                        src={details.document.previewUrl}
                        title={details.document.fileName}
                        className="h-[24rem] w-full bg-white"
                      />
                    ) : (
                      <img
                        src={details.document.previewUrl}
                        alt={details.document.fileName}
                        className="h-[24rem] w-full bg-white object-contain"
                      />
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={details.document.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary"
                    >
                      {t('transactions.documentDetails.viewOriginal', {
                        ns: 'portal',
                        defaultValue: 'View Original',
                      })}
                    </a>
                    <a
                      href={details.document.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      download={details.document.fileName}
                      className="btn-secondary"
                    >
                      <Download size={14} />
                      {t('transactions.documentDetails.downloadOriginal', {
                        ns: 'portal',
                        defaultValue: 'Download',
                      })}
                    </a>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                        {t('transactions.merchantSource', { ns: 'portal' })}
                      </p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {details.document.merchant || details.transaction.merchant || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                        {t('transactions.documentReview.receiptNumber', { ns: 'portal' })}
                      </p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {details.document.receiptNumber || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                        {t('transactions.date', { ns: 'portal' })}
                      </p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {details.transaction.transactionDate}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                        {t('transactions.documentDetails.confidence', {
                          ns: 'portal',
                          defaultValue: 'Extraction confidence',
                        })}
                      </p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {typeof details.document.confidence === 'number'
                          ? `${Math.round(details.document.confidence * 100)}%`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                        {t('transactions.documentDetails.sourceSurface', {
                          ns: 'portal',
                          defaultValue: 'Source',
                        })}
                      </p>
                      <p className="mt-1 text-sm font-600 text-foreground">
                        {t(`transactions.documentDetails.sourceSurfaces.${details.document.sourceSurface || 'add_transaction'}` as const, {
                          ns: 'portal',
                          defaultValue: details.document.sourceSurface === 'smart_entry' ? 'Smart Entry' : 'Add Transaction',
                        })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-sm font-700 text-foreground">
                    {t('transactions.documentDetails.totalSummary', {
                      ns: 'portal',
                      defaultValue: 'Receipt totals',
                    })}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    {[
                      ['subtotal', details.totals.subtotal],
                      ['tax', details.totals.tax],
                      ['discount', details.totals.discount],
                      ['fee', details.totals.fee],
                      ['calculatedTotal', details.totals.calculatedTotal],
                      ['receiptTotal', details.totals.receiptTotal],
                    ].map(([key, value]) => (
                      <div key={key} className="rounded-xl bg-muted/20 px-3 py-2">
                        <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                          {t(`transactions.documentDetails.${key}` as const, {
                            ns: 'portal',
                            defaultValue: key,
                          })}
                        </p>
                        <p className="mt-1 font-700 text-foreground">
                          {formatCurrencyText(value as number, {
                            currencyCode: details.transaction.currency,
                            fallbackCurrencyCode: details.transaction.currency,
                            textOnly: true,
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-700 text-foreground">
                      {t('transactions.documentReview.lineItemsTitle', { ns: 'portal' })}
                    </p>
                    <span className="text-xs font-700 uppercase tracking-wide text-muted-foreground">
                      {t('transactions.documentDetails.itemCount', {
                        ns: 'portal',
                        count: details.document.itemCount,
                        defaultValue: '{{count}} items',
                      })}
                    </span>
                  </div>

                  {details.lineItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t('transactions.documentDetails.noLineItems', {
                        ns: 'portal',
                        defaultValue: 'No line items were saved for this document.',
                      })}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {details.lineItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-border/70 bg-muted/10 px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-700 text-foreground">{item.name}</p>
                              {item.description ? (
                                <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                              ) : null}
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                {item.categoryName ? <span>{item.categoryName}</span> : null}
                                {item.itemKind !== 'regular' ? (
                                  <span className="rounded-full bg-muted px-2 py-0.5 font-600">
                                    {t(`transactions.documentDetails.itemKinds.${item.itemKind}` as const, {
                                      ns: 'portal',
                                      defaultValue: item.itemKind,
                                    })}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              {typeof item.quantity === 'number' ? (
                                <p>
                                  {t('transactions.documentDetails.quantity', {
                                    ns: 'portal',
                                    defaultValue: 'Qty',
                                  })} {item.quantity}
                                </p>
                              ) : null}
                              {typeof item.unitPrice === 'number' ? (
                                <p>
                                  {t('transactions.documentDetails.unitPrice', {
                                    ns: 'portal',
                                    defaultValue: 'Unit',
                                  })}{' '}
                                  {formatCurrencyText(item.unitPrice, {
                                    currencyCode: details.transaction.currency,
                                    fallbackCurrencyCode: details.transaction.currency,
                                    textOnly: true,
                                  })}
                                </p>
                              ) : null}
                              {typeof item.total === 'number' ? (
                                <p className="font-700 text-foreground">
                                  {t('transactions.documentDetails.lineTotal', {
                                    ns: 'portal',
                                    defaultValue: 'Total',
                                  })}{' '}
                                  {formatCurrencyText(item.total, {
                                    currencyCode: details.transaction.currency,
                                    fallbackCurrencyCode: details.transaction.currency,
                                    textOnly: true,
                                  })}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border bg-card px-4 py-3 sm:px-5">
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className="btn-secondary">
              {t('actions.close', { ns: 'common' })}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
