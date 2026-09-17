'use client';

import * as React from 'react';

import { cn } from './cn';

export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'size'
> {
  /** Some but not all of a group is checked. Visual only — never combined with `checked`. */
  indeterminate?: boolean;
}

/**
 * The checkbox primitive the asset library's multi-select needs and
 * `packages/ui` never had (issue #175) — a shared home for the ad-hoc
 * `<input type="checkbox">` the filter toolbar already styles inline
 * (`asset-library-toolbar.tsx`'s "Include archived"), plus the indeterminate
 * state a select-all control needs that a checkbox can't express through a
 * plain `checked` prop.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, indeterminate = false, ...props },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLInputElement>(null);

  React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

  React.useEffect(() => {
    if (innerRef.current) innerRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={innerRef}
      type="checkbox"
      className={cn(
        'size-4 shrink-0 rounded border-border-strong accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
});
