import * as React from 'react';

import { cn } from './cn';
import { StatusBadge, type StatusTone } from './status-badge';
import { Tag } from './tag';

export interface EntityCardProps {
  name: string;
  /** A short label for the entity's kind, e.g. "Idea", "Character". */
  typeLabel: string;
  status?: { tone: StatusTone; label: string };
  description?: string | null;
  tags?: string[];
  selected?: boolean;
  onClick?: () => void;
  /** Rendered under the tags — used for lightweight lineage/version hints. */
  footer?: React.ReactNode;
  className?: string;
}

/**
 * The canonical card for any entity in the graph (spec section 68): an idea,
 * a character, a mechanic. One shape, reused everywhere instead of a bespoke
 * card per tool.
 */
export function EntityCard({
  name,
  typeLabel,
  status,
  description,
  tags,
  selected,
  onClick,
  footer,
  className,
}: EntityCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h3 className="truncate text-[15px] font-semibold text-foreground">{name}</h3>
        {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
      </div>

      <p className="mt-0.5 text-xs text-faint-foreground">{typeLabel}</p>

      {description && (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{description}</p>
      )}

      {tags && tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
      )}

      {footer && <div className="mt-3">{footer}</div>}
    </>
  );

  const sharedClassName = cn(
    'group w-full overflow-hidden rounded-lg border border-border bg-surface p-3 text-left transition-colors duration-150',
    onClick && 'hover:border-border-strong hover:bg-hover',
    selected && 'border-primary ring-1 ring-[var(--lz-blue-muted)] hover:border-primary',
    className,
  );

  // Only a card with a click handler behaves (and reads) as a button —
  // otherwise it is display-only content, e.g. a project's design pillars.
  if (!onClick) {
    return <div className={sharedClassName}>{content}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={sharedClassName}>
      {content}
    </button>
  );
}
