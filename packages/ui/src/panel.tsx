import * as React from 'react';

import { cn } from './cn';

/** Base bordered container (spec section 11). Prefer this over a bespoke `div`. */
export const Panel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Panel({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn('rounded-lg border border-border bg-surface', className)}
        {...props}
      />
    );
  },
);

export interface SectionPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

/** A `Panel` with a titled header row (spec section 67). */
export function SectionPanel({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: SectionPanelProps) {
  return (
    <Panel className={cn('overflow-hidden', className)} {...props}>
      <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-faint-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="p-4">{children}</div>
    </Panel>
  );
}
