import * as React from 'react';

import { cn } from './cn';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** At most two: the spec caps empty states at two primary choices. */
  actions?: React.ReactNode;
}

/** Contextual empty state (spec section 43) — never a bare "No data". */
export function EmptyState({ title, description, actions, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {actions && <div className="mt-1 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
