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
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center max-[480px]:px-4 max-[480px]:py-8">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[20px] bg-accent/10 ring-8 ring-accent/5 max-[480px]:h-14 max-[480px]:w-14">
        <Icon size={28} className="text-accent" />
      </div>
      <h3 className="mb-2 text-lg font-800 text-foreground">{title}</h3>
      <p className="mb-5 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="btn-primary max-[480px]:w-full">
          {action.label}
        </button>
      )}
    </div>
  );
}
