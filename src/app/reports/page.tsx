import React from 'react';
import AppLayout from '@/components/AppLayout';
import ReportsScreen from './components/ReportsScreen';

export default function ReportsPage() {
  return (
    <AppLayout activeRoute="/reports">
      <ReportsScreen />
    </AppLayout>
  );
}