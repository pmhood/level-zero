import * as React from 'react';

import { cn } from './cn';
import { SearchIcon } from './icons';
import { Input } from './input';

export interface SearchFieldProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  /** Accessible name, e.g. "Search mechanics". Every browser column has one. */
  label: string;
  className?: string;
}

/** A search input with the leading magnifier every browser column uses. */
export function SearchField({ label, className, ...props }: SearchFieldProps) {
  return (
    <div className={cn('relative', className)}>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint-foreground" />
      <Input type="search" aria-label={label} className="pl-9" {...props} />
    </div>
  );
}
