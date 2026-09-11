import type { PrototypeVersion } from '@level-zero/domain';
import { cn, StatusBadge } from '@level-zero/ui';

import { prototypeVersionStatusBadge } from './prototype-presentation';

/**
 * The prototype/version selector: compact chrome above the playable surface,
 * never a second place to read a version's content (spec section 37's
 * "Prototype Versions" bar, here on top rather than the bottom so it reads
 * before the playable view below it).
 */
export function PrototypeVersionStrip({
  versions,
  selectedId,
  onSelect,
}: {
  versions: readonly PrototypeVersion[];
  selectedId: string | null;
  onSelect: (versionId: string) => void;
}) {
  if (versions.length === 0) return null;

  return (
    <div
      role="tablist"
      aria-label="Prototype versions"
      className="flex flex-wrap items-center gap-1.5"
    >
      {versions.map((version) => {
        const active = version.id === selectedId;
        const badge = prototypeVersionStatusBadge(version.status);

        return (
          <button
            key={version.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(version.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-medium transition-colors duration-150',
              active
                ? 'border-primary bg-hover text-foreground'
                : 'border-border-subtle text-muted-foreground hover:border-border-strong hover:text-foreground',
            )}
          >
            v{version.versionNumber}
            {version.name && <span className="text-xs text-faint-foreground">{version.name}</span>}
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          </button>
        );
      })}
    </div>
  );
}
