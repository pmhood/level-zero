'use client';

import type { Entity } from '@level-zero/domain';
import { StatusBadge, Tag } from '@level-zero/ui';

import { entityStatusBadge, entityTypeLabel } from '@/features/entities/entity-presentation';

import { readCharacter } from './character';
import { CharacterDetailBody } from './character-detail-body';

/**
 * The centre column: a character's header, plus its tabs and panels in
 * {@link CharacterDetailBody}.
 */
export function CharacterDetail({
  projectId,
  character,
}: {
  projectId: string;
  character: Entity;
}) {
  const { role, quote } = readCharacter(character);
  const status = entityStatusBadge(character.status);

  return (
    <section aria-label="Character detail" className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-foreground">{character.name}</h2>
          <p className="mt-0.5 text-xs text-faint-foreground">{entityTypeLabel(character.type)}</p>
          {quote && (
            <p className="mt-2 text-sm text-muted-foreground italic">&ldquo;{quote}&rdquo;</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {role && <Tag>{role}</Tag>}
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </div>
      </header>

      <CharacterDetailBody projectId={projectId} character={character} />
    </section>
  );
}
