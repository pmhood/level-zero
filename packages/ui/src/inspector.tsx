import * as React from 'react';

import { cn } from './cn';
import { CloseIcon } from './icons';

export interface InspectorProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode;
  description?: React.ReactNode;
  onClose?: () => void;
}

/**
 * The contextual panel on the right edge of the workspace (spec section 21):
 * "what can I do with the thing I currently have selected?" — never a
 * permanently-docked AI chat.
 */
export function Inspector({
  title,
  description,
  onClose,
  className,
  children,
  ...props
}: InspectorProps) {
  return (
    <aside
      className={cn(
        'flex w-[320px] shrink-0 flex-col border-l border-border bg-sidebar',
        className,
      )}
      {...props}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-foreground">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-faint-foreground">{description}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-hover hover:text-foreground"
          >
            <CloseIcon className="size-4" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}
