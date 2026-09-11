'use client';

import type { ContextEntity, ResolvedContext } from '@level-zero/ai';

import { entityTypeLabel, relationLabel } from '@/features/entities/entity-presentation';

/**
 * Which project objects went into one request, and why each one did.
 *
 * Folded away by default: provenance must be retrievable without dominating
 * the surface (spec section 24). The "why" is the part that makes an assembled
 * context inspectable rather than a list of names — `ContextResolver` already
 * records whether an object was selected, mentioned or reached over a
 * relationship, so this only has to read it back.
 */
export function ResolvedContextDisclosure({ context }: { context: ResolvedContext }) {
  const total = context.entities.length + context.assets.length;

  return (
    <details className="rounded-md border border-border-subtle bg-raised px-2.5 py-2">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        {total > 0
          ? `Context: ${context.project.name} · ${total} object${total === 1 ? '' : 's'}`
          : `Context: ${context.project.name}`}
      </summary>

      {total === 0 ? (
        <p className="mt-2 text-xs text-faint-foreground">
          Nothing was selected, so this was asked about the project itself.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {context.entities.map((entity) => (
            <li key={entity.id} className="text-xs">
              <span className="text-foreground">{entity.name}</span>
              <span className="text-faint-foreground"> · {entityTypeLabel(entity.type)}</span>
              <span className="block text-faint-foreground">{inclusionReason(entity)}</span>
            </li>
          ))}
          {context.assets.map((asset) => (
            <li key={asset.id} className="text-xs">
              <span className="text-foreground">{asset.filename}</span>
              <span className="block text-faint-foreground">reference file</span>
            </li>
          ))}
        </ul>
      )}

      {context.truncated && (
        <p className="mt-2 text-xs text-faint-foreground">
          Trimmed: more of the neighbourhood was in reach than one request carries.
        </p>
      )}
    </details>
  );
}

/** Why this object is in the context, in the terms the resolver recorded it in. */
function inclusionReason(entity: ContextEntity): string {
  switch (entity.source) {
    case 'selected':
      return 'Selected';
    case 'mention':
      return 'Mentioned in the request';
    case 'related':
      return entity.relation
        ? `Related · ${relationLabel(entity.relation)}`
        : `Related · ${entity.distance} hop${entity.distance === 1 ? '' : 's'} away`;
    case 'reference':
      return 'Reference file';
    case 'lineage':
      return 'Earlier generation';
  }
}
