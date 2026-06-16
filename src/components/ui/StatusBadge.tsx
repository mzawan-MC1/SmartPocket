import React from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Info, Sparkles, XCircle } from 'lucide-react';

type StatusTone =
  | 'configured'
  | 'healthy'
  | 'ready'
  | 'success'
  | 'missing'
  | 'warning'
  | 'pending'
  | 'info'
  | 'test_failed'
  | 'error'
  | 'not_required'
  | 'ai';

interface StatusBadgeProps {
  status: StatusTone;
  label?: string;
  className?: string;
}

const styles: Record<StatusTone, { label: string; className: string; icon: React.ReactNode }> = {
  configured: { label: 'Configured', className: 'bg-info-soft text-info border border-info/20', icon: <CheckCircle2 size={12} /> },
  healthy: { label: 'Healthy', className: 'bg-positive-soft text-positive border border-positive/20', icon: <CheckCircle2 size={12} /> },
  ready: { label: 'Ready', className: 'bg-positive-soft text-positive border border-positive/20', icon: <CheckCircle2 size={12} /> },
  success: { label: 'Success', className: 'bg-positive-soft text-positive border border-positive/20', icon: <CheckCircle2 size={12} /> },
  missing: { label: 'Missing', className: 'bg-muted text-muted-foreground border border-border', icon: <AlertTriangle size={12} /> },
  warning: { label: 'Warning', className: 'bg-warning-soft text-warning border border-warning/20', icon: <AlertTriangle size={12} /> },
  pending: { label: 'Pending', className: 'bg-warning-soft text-warning border border-warning/20', icon: <Clock3 size={12} /> },
  info: { label: 'Info', className: 'bg-info-soft text-info border border-info/20', icon: <Info size={12} /> },
  test_failed: { label: 'Test Failed', className: 'bg-negative-soft text-negative border border-negative/20', icon: <XCircle size={12} /> },
  error: { label: 'Error', className: 'bg-negative-soft text-negative border border-negative/20', icon: <XCircle size={12} /> },
  not_required: { label: 'Not Required', className: 'bg-secondary text-secondary-foreground border border-border', icon: <Info size={12} /> },
  ai: { label: 'AI', className: 'bg-ai-soft text-ai border border-purple-200', icon: <Sparkles size={12} /> },
};

export default function StatusBadge({ status, label, className = '' }: StatusBadgeProps) {
  const config = styles[status];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-700 ${config.className} ${className}`}>
      {config.icon}
      {label || config.label}
    </span>
  );
}
