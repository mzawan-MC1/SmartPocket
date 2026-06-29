'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import TransactionsHeader from './components/TransactionsHeader';
import TransactionsTable from './components/TransactionsTable';
import { loadUserFinancialPeriodContext, type UserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import { useSmartPocketDataChanged } from '@/lib/data-change';
import { SectionCardSkeleton, TableSkeleton } from '@/components/ui/LoadingSkeleton';

export default function TransactionsPage() {
  const { t } = useTranslation('portal');
  const [periodContext, setPeriodContext] = React.useState<UserFinancialPeriodContext | null>(null);
  const [periodLoading, setPeriodLoading] = React.useState(true);
  const [isAddTransactionOpen, setIsAddTransactionOpen] = React.useState(false);
  const [headerRangeLabel, setHeaderRangeLabel] = React.useState(() => t('shared.loadingPlanningPeriodTitle'));
  const [handleExport, setHandleExport] = React.useState<(() => void) | null>(null);
  const openAddTransaction = React.useCallback(() => {
    setIsAddTransactionOpen(true);
  }, []);
  const closeAddTransaction = React.useCallback(() => {
    setIsAddTransactionOpen(false);
  }, []);
  const loadPeriodContext = React.useCallback(async () => {
    setPeriodLoading(true);
    try {
      const nextContext = await loadUserFinancialPeriodContext();
      setPeriodContext(nextContext);
    } finally {
      setPeriodLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadPeriodContext();
  }, [loadPeriodContext]);

  useSmartPocketDataChanged(['profile'], 'TransactionsPagePeriodContext', async () => {
    await loadPeriodContext();
  });

  return (
    <AppLayout activeRoute="/transactions">
      <div className="page-section max-[480px]:gap-3">
        <TransactionsHeader
          onAddTransaction={openAddTransaction}
          onExportCSV={handleExport}
          activeRangeLabel={headerRangeLabel}
        />
        {periodLoading || !periodContext ? (
          <div className="space-y-4">
            <SectionCardSkeleton lines={2} />
            <div className="data-table-shell">
              <TableSkeleton rows={6} cols={8} />
            </div>
          </div>
        ) : (
          <TransactionsTable
            financialPeriodContext={periodContext}
            isAddTransactionOpen={isAddTransactionOpen}
            onOpenAddTransaction={openAddTransaction}
            onCloseAddTransaction={closeAddTransaction}
            onRangeLabelChange={setHeaderRangeLabel}
            onExportReady={setHandleExport}
          />
        )}
      </div>
    </AppLayout>
  );
}
