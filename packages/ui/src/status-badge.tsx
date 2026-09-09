import * as React from 'react';

import { cn } from './cn';

/**
 * The color category behind a status badge (spec section 19).
 *
 * Kept deliberately small: callers choose the label text (`Draft`, `up`,
 * `Archived`, ...), the badge only carries the tone. Never rely on the color
 * alone — always pair it with text or an icon.
 */
export type StatusTone = 'success' | 'warning' | 'error' | 'neutral';

const toneStyles: Record<StatusTone, string> = {
  success: 'bg-[rgba(73,215,160,.12)] text-success border-[rgba(73,215,160,.35)]',
  warning: 'bg-[rgba(232,185,76,.12)] text-warning border-[rgba(232,185,76,.35)]',
  error: 'bg-[var(--lz-error-muted)] text-error border-[var(--lz-error-border)]',
  neutral: 'bg-hover text-muted-foreground border-border',
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
}

/** Small pill used across the app to show entity, project and dependency state. */
export function StatusBadge({ tone, className, children, ...props }: StatusBadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex h-[21px] items-center rounded-full border px-2.5 text-xs font-medium',
        toneStyles[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
