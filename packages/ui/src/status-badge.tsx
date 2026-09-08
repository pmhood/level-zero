import * as React from 'react';

import { cn } from './cn';

export type StatusTone = 'up' | 'down' | 'unknown';

const toneStyles: Record<StatusTone, string> = {
  up: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  down: 'bg-red-500/15 text-red-400 border-red-500/30',
  unknown: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
}

/** Small pill used by the health surfaces to show dependency state. */
export function StatusBadge({ tone, className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        toneStyles[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
