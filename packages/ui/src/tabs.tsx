import * as React from 'react';

import { cn } from './cn';

export interface TabItem {
  value: string;
  label: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/**
 * Major page/tool navigation (spec section 18): a bottom-border underline,
 * not pills. Segmented, pill-shaped controls are a different pattern and are
 * not this component.
 */
export function Tabs({ items, value, onChange, className }: TabsProps) {
  return (
    <div
      role="tablist"
      className={cn('flex h-9 items-center gap-1 border-b border-border-subtle', className)}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'flex h-9 items-center border-b-2 px-3 text-sm font-medium transition-colors duration-150',
              active
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
