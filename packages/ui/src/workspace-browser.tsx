import * as React from 'react';

import { cn } from './cn';

export interface WorkspaceBrowserProps {
  /** Names the region for assistive technology, e.g. "Mechanics". */
  label: string;
  /** Search and filters. Pinned above the list rather than scrolling with it. */
  toolbar?: React.ReactNode;
  /** A count, a paging control — pinned below the list. */
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The browser column of a three-zone tool page (spec sections 31 and 33):
 * a pinned filter head over an independently scrolling list, beside the
 * detail surface it selects into.
 */
export function WorkspaceBrowser({
  label,
  toolbar,
  footer,
  children,
  className,
}: WorkspaceBrowserProps) {
  return (
    <section
      aria-label={label}
      className={cn('flex w-[320px] shrink-0 flex-col border-r border-border-subtle', className)}
    >
      {toolbar && <div className="shrink-0 border-b border-border-subtle px-4 py-3">{toolbar}</div>}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
      {footer && <div className="shrink-0 border-t border-border-subtle px-4 py-2">{footer}</div>}
    </section>
  );
}
