import React from 'react';
import AppLayout from '@/components/AppLayout';
import SubscriptionFeatureGate from '@/components/subscription/SubscriptionFeatureGate';
import ItemInsightsScreen from './components/ItemInsightsScreen';

export default function ItemInsightsPage() {
  return (
    <AppLayout activeRoute="/reports">
      <SubscriptionFeatureGate feature="standard_reports">
        <ItemInsightsScreen />
      </SubscriptionFeatureGate>
    </AppLayout>
  );
}
