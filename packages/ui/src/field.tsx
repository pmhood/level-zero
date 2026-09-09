import * as React from 'react';

import { cn } from './cn';

export interface FieldProps {
  label: React.ReactNode;
  /** The id of the control this labels. Omit for a group of controls, which
   * gets a plain caption instead of a `<label>`. */
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** A labelled form control (spec section 17): caption above, hint below. */
export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  const caption = 'text-xs font-medium text-muted-foreground';

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={caption}>
          {label}
        </label>
      ) : (
        <span className={caption}>{label}</span>
      )}
      {children}
      {hint && <p className="text-xs text-faint-foreground">{hint}</p>}
    </div>
  );
}
