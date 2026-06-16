import React from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  className?: string;
}

export default function Tabs<T extends string>({
  items,
  activeId,
  onChange,
  className = '',
}: TabsProps<T>) {
  return (
    <div className={`tab-list ${className}`} role="tablist" aria-orientation="horizontal">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`tab-button ${active ? 'tab-button-active' : ''}`}
          >
            {Icon ? <Icon size={15} /> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
