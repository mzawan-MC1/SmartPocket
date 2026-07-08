import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'compact';
  tone?: 'accent' | 'neutral' | 'secondary';
  className?: string;
}

const toneStyles: Record<NonNullable<EmptyStateProps['tone']>, { iconWrap: string; icon: string }> = {
  accent: { iconWrap: 'bg-accent/10 ring-6 ring-accent/5', icon: 'text-accent' },
  neutral: { iconWrap: 'bg-muted/50 ring-6 ring-muted/20', icon: 'text-muted-foreground' },
  secondary: { iconWrap: 'bg-violet-500/10 ring-6 ring-violet-500/10', icon: 'text-violet-600' },
};

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'default',
  tone = 'accent',
  className = '',
}: EmptyStateProps) {
  const styles = toneStyles[tone];
  const isCompact = variant === 'compact';

  return (
    <div className={`flex flex-col items-center justify-center text-center ${isCompact ? 'px-4 py-5' : 'px-6 py-8 max-[480px]:px-4 max-[480px]:py-7'} ${className}`.trim()}>
      <div className={`flex items-center justify-center ${isCompact ? 'mb-3 h-12 w-12 rounded-[16px]' : 'mb-4 h-14 w-14 rounded-[18px] max-[480px]:h-12 max-[480px]:w-12'} ${styles.iconWrap}`.trim()}>
        <Icon size={isCompact ? 22 : 24} className={styles.icon} />
      </div>
      <h3 className={`empty-state-title font-800 text-foreground ${isCompact ? 'mb-1 text-[0.98rem]' : 'mb-2 text-[1.02rem]'}`.trim()}>{title}</h3>
      <p className={`empty-state-description text-muted-foreground ${isCompact ? 'mb-3 max-w-sm text-[13px] leading-5' : 'mb-4 max-w-md text-sm leading-relaxed'}`.trim()}>{description}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="btn-primary max-[480px]:w-full">
          {action.label}
        </button>
      )}
    </div>
  );
}
