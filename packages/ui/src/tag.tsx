import * as React from 'react';

import { cn } from './cn';

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Renders a small remove button, for editable tag lists. */
  onRemove?: () => void;
}

/**
 * A taxonomy label (spec section 20) — lower contrast than a `StatusBadge`
 * because a tag communicates category, not state.
 */
export function Tag({ className, children, onRemove, ...props }: TagProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 rounded-full border border-border-subtle bg-hover px-2 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove tag${typeof children === 'string' ? ` ${children}` : ''}`}
          className="-mr-0.5 rounded-full text-faint-foreground hover:text-foreground"
        >
          ×
        </button>
      )}
    </span>
  );
}
