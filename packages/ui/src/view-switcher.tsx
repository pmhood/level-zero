import * as React from 'react';

import { cn } from './cn';

export interface ViewSwitcherItem<T extends string> {
  value: T;
  label: string;
  icon: React.ReactNode;
  /** Rendered but inert — a position this switcher reserves for a presentation that doesn't exist yet. */
  disabled?: boolean;
}

export interface ViewSwitcherProps<T extends string> {
  /** Names the control for assistive technology, e.g. "Asset views". */
  label: string;
  items: ViewSwitcherItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/**
 * A segmented control for a workspace's presentations of the same data —
 * grid vs. list, and whatever else a tool adds later. Generic over the value
 * type rather than a hardcoded pair, so a caller like the Assets workspace
 * (issue #171) can register positions — Collections, Pipeline — for
 * presentations that land in later issues, disabled until they do.
 */
export function ViewSwitcher<T extends string>({
  label,
  items,
  value,
  onChange,
  className,
}: ViewSwitcherProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-border-subtle bg-surface p-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            disabled={item.disabled}
            onClick={() => onChange(item.value)}
            className={cn(
              'inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition-colors duration-150',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-hover hover:text-foreground',
              item.disabled &&
                'cursor-not-allowed text-faint-foreground opacity-60 hover:bg-transparent hover:text-faint-foreground',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
