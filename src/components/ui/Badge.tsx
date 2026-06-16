import React from 'react';

type BadgeVariant = 'income' | 'expense' | 'transfer' | 'pending' | 'active' | 'archived' | 'exceeded' | 'warning' | 'default';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const baseClass = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-700';

const variantClasses: Record<BadgeVariant, string> = {
  income: `${baseClass} badge-income`,
  expense: `${baseClass} badge-expense`,
  transfer: `${baseClass} badge-transfer`,
  pending: `${baseClass} badge-pending`,
  active: `${baseClass} bg-positive-soft text-positive border border-positive/20`,
  archived: `${baseClass} bg-muted text-muted-foreground border border-border`,
  exceeded: `${baseClass} bg-negative-soft text-negative border border-negative/20`,
  warning: `${baseClass} bg-warning-soft text-warning border border-warning/20`,
  default: `${baseClass} bg-secondary text-secondary-foreground border border-border`,
};

export default function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span className={`${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
