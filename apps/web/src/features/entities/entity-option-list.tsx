'use client';

import type { Entity } from '@level-zero/domain';
import { cn } from '@level-zero/ui';

import { entityTypeLabel } from './entity-presentation';

export interface EntityOptionListProps {
  entities: Entity[];
  /** Index of the option the keyboard is on; `-1` while nothing is highlighted. */
  selectedIndex?: number;
  onHighlight?: (index: number) => void;
  onSelect: (entity: Entity) => void;
  /** Shown in place of the list when there is nothing to pick. */
  emptyMessage: string;
  label: string;
}

/**
 * The list of entities behind both ways of writing a reference: the `@` popover
 * and an embed's picker. One list, so the two read and behave the same
 * (spec section 58 — name on top, "Type • context" underneath).
 */
export function EntityOptionList({
  entities,
  selectedIndex = -1,
  onHighlight,
  onSelect,
  emptyMessage,
  label,
}: EntityOptionListProps) {
  if (entities.length === 0) {
    return <p className="px-2.5 py-2 text-xs text-faint-foreground">{emptyMessage}</p>;
  }

  return (
    <ul role="listbox" aria-label={label} className="max-h-64 overflow-y-auto">
      {entities.map((entity, index) => (
        <li key={entity.id}>
          <button
            type="button"
            role="option"
            aria-selected={index === selectedIndex}
            onMouseEnter={() => onHighlight?.(index)}
            onClick={() => onSelect(entity)}
            className={cn(
              'flex w-full flex-col items-start rounded-md px-2.5 py-1.5 text-left',
              index === selectedIndex ? 'bg-hover text-foreground' : 'text-muted-foreground',
            )}
          >
            <span className="truncate text-sm font-medium">{entity.name}</span>
            <span className="text-xs text-faint-foreground">{entityTypeLabel(entity.type)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
