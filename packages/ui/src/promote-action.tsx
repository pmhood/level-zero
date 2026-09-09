import { Button, type ButtonProps } from './button';

export interface PromoteActionProps extends Omit<ButtonProps, 'children' | 'onClick'> {
  /** The entity type being promoted from, e.g. "idea". Informational only. */
  from: string;
  /** The entity type being promoted to, e.g. "mechanic". */
  to: string;
  label: string;
  pending?: boolean;
  onPromote: () => void;
}

/**
 * A standardized promotion trigger (spec section 62): promoting always
 * creates the target entity and a lineage edge, never converts the source.
 */
export function PromoteAction({
  from,
  to,
  label,
  pending,
  onPromote,
  ...props
}: PromoteActionProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      onClick={onPromote}
      disabled={pending}
      data-promote-from={from}
      data-promote-to={to}
      {...props}
    >
      {pending ? 'Promoting…' : label}
    </Button>
  );
}
