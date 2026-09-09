import { cn } from '../cn';
import type { SaveStatus } from './use-editor-autosave';

const LABELS: Record<SaveStatus, string | null> = {
  idle: null,
  pending: 'Unsaved changes',
  saving: 'Saving…',
  saved: 'Saved',
  error: "Couldn't save",
};

export interface SaveStatusLabelProps {
  status: SaveStatus;
  /** Shown as the label's tooltip so the reason is available without a toast. */
  error?: Error | null;
  className?: string;
}

/** The autosave state of a writing surface, for a toolbar or panel header. */
export function SaveStatusLabel({ status, error, className }: SaveStatusLabelProps) {
  const label = LABELS[status];
  if (!label) return null;

  return (
    <span
      role="status"
      aria-live="polite"
      title={status === 'error' ? (error?.message ?? undefined) : undefined}
      className={cn(
        'text-xs',
        status === 'error' ? 'text-error' : 'text-faint-foreground',
        className,
      )}
    >
      {label}
    </span>
  );
}
