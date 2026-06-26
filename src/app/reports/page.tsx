import React from 'react';
import AppLayout from '@/components/AppLayout';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import ReportsScreen from './components/ReportsScreen';

export default function ReportsPage() {
  return (
    <AppLayout activeRoute="/reports">
      <SubscriptionFeatureGate feature="standard_reports">
        <ReportsScreen />
      </SubscriptionFeatureGate>
    </AppLayout>
  );
}
