import React from 'react';
import AppLayout from '@/components/AppLayout';
import ItemInsightsScreen from './components/ItemInsightsScreen';

export default function ItemInsightsPage() {
  return (
    <AppLayout activeRoute="/reports">
      <ItemInsightsScreen />
    </AppLayout>
  );
}
