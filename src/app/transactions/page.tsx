'use client';
import React from 'react';
import { Loader2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import TransactionsHeader from './components/TransactionsHeader';
import TransactionsTable from './components/TransactionsTable';
import { loadUserFinancialPeriodContext, type UserFinancialPeriodContext } from '@/lib/financial-periods/profile';
import { useSmartPocketDataChanged } from '@/lib/data-change';

export default function TransactionsPage() {
  const [periodContext, setPeriodContext] = React.useState<UserFinancialPeriodContext | null>(null);
  const [periodLoading, setPeriodLoading] = React.useState(true);
  const [isAddTransactionOpen, setIsAddTransactionOpen] = React.useState(false);
  const [headerRangeLabel, setHeaderRangeLabel] = React.useState('Loading planning period...');
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
      <div className="page-section">
        <TransactionsHeader
          onAddTransaction={openAddTransaction}
          onExportCSV={handleExport}
          activeRangeLabel={headerRangeLabel}
        />
        {periodLoading || !periodContext ? (
          <div className="section-card">
            <div className="section-card-body flex min-h-[180px] flex-col items-center justify-center gap-3 text-center">
              <Loader2 size={22} className="animate-spin text-accent" />
              <div>
                <p className="text-sm font-600 text-foreground">Loading planning period</p>
                <p className="text-xs text-muted-foreground">Smart Pocket is loading your saved pay-cycle and timezone settings.</p>
              </div>
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
