import React from 'react';
import { LucideIcon } from 'lucide-react';
import Icon from '@/components/ui/AppIcon';


interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-8 text-center max-[480px]:px-4 max-[480px]:py-7">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-accent/10 ring-6 ring-accent/5 max-[480px]:h-12 max-[480px]:w-12">
        <Icon size={24} className="text-accent" />
      </div>
      <h3 className="mb-2 text-[1.02rem] font-800 text-foreground">{title}</h3>
      <p className="mb-4 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="btn-primary max-[480px]:w-full">
          {action.label}
        </button>
      )}
    </div>
  );
}
