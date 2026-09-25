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

/** Home/End jump to the ends; the arrow keys move and activate (design system spec §29). */
function nextIndexForKey(key: string, current: number, count: number): number | null {
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/**
 * Major page/tool navigation (spec section 18): a bottom-border underline,
 * not pills. Segmented, pill-shaped controls are a different pattern and are
 * not this component.
 *
 * Real tab semantics (spec §29/§49): a roving `tabIndex` so Tab moves focus
 * in and out of the strip as a single stop, the arrow keys (plus Home/End)
 * move focus between tabs and activate as they go, and a visible focus ring
 * on the semantic `ring` token (`--lz-blue`) rather than a bespoke outline.
 */
export function Tabs({ items, value, onChange, className }: TabsProps) {
  const buttons = React.useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = nextIndexForKey(event.key, index, items.length);
    if (nextIndex === null) return;
    event.preventDefault();

    const nextItem = items[nextIndex];
    if (!nextItem) return;
    onChange(nextItem.value);
    buttons.current[nextIndex]?.focus();
  }

  return (
    <div
      role="tablist"
      className={cn('flex h-9 items-center gap-1 border-b border-border-subtle', className)}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => {
              buttons.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'flex h-9 items-center border-b-2 px-3 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
