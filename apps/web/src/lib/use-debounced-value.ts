'use client';

import { useEffect, useState } from 'react';

/** Delays reflecting `value` until it has been stable for `delayMs`, so a search box doesn't refetch on every keystroke. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
