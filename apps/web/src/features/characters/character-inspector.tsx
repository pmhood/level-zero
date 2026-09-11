'use client';

import type { Entity } from '@level-zero/domain';
import { Button, HistoryIcon, Inspector, StatusBadge, Tag } from '@level-zero/ui';

import { entityStatusBadge } from '@/features/entities/entity-presentation';

import { readCharacter } from './character';
import { CharacterHistory } from './character-history';
import { useArchiveCharacter, useCharacterLinks, useRestoreCharacter } from './use-characters';

/**
 * What can I do with the character I have selected: change their standing in
 * the project, see what they are made of, and read what they have been
 * (spec sections 21 and 56).
 *
 * Deliberately not an AI chat panel. The generative actions belong on the
 * Visuals tab, next to the thing they would produce.
 */
export function CharacterInspector({
  projectId,
  character,
  onClose,
}: {
  projectId: string;
  character: Entity;
  onClose?: () => void;
}) {
  const archiveCharacter = useArchiveCharacter(projectId);
  const restoreCharacter = useRestoreCharacter(projectId);
  const archived = character.status === 'archived';

  return (
    <Inspector
      key={character.id}
      title={character.name}
      description={readCharacter(character).role || 'Character'}
      onClose={onClose}
    >
      <div className="mb-4">
        {archived ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={restoreCharacter.isPending}
            onClick={() => restoreCharacter.mutate(character.id)}
          >
            <HistoryIcon className="size-4" />
            Restore
          </Button>
        ) : (
          <Button
            variant="danger"
            size="sm"
            disabled={archiveCharacter.isPending}
            onClick={() => archiveCharacter.mutate(character.id)}
          >
            Archive
          </Button>
        )}
      </div>

      <AtAGlance projectId={projectId} character={character} />

      <section className="mt-5 border-t border-border-subtle pt-4">
        <h3 className="mb-2 text-xs font-medium text-muted-foreground">History</h3>
        <CharacterHistory projectId={projectId} character={character} />
      </section>
    </Inspector>
  );
}

/** The properties row of the inspector: state, taxonomy, and what is attached. */
function AtAGlance({ projectId, character }: { projectId: string; character: Entity }) {
  const links = useCharacterLinks(projectId, character.id);
  const { traits, inventory } = readCharacter(character);
  const status = entityStatusBadge(character.status);

  const edges = links.data ? [...links.data.outgoing, ...links.data.incoming] : null;
  const visuals = links.data?.outgoing.filter((edge) => edge.entity.type === 'asset_reference');
  const relationships = edges?.filter((edge) => edge.entity.type !== 'asset_reference');

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        {character.tags.map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </div>

      <dl className="flex flex-col gap-1.5 text-xs">
        <Row label="Visuals" value={visuals?.length} />
        <Row label="Relationships" value={relationships?.length} />
        <Row label="Inventory" value={inventory.length} />
        <Row label="Traits" value={traits.length} />
      </dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-faint-foreground">{label}</dt>
      <dd className="text-muted-foreground">{value ?? '—'}</dd>
    </div>
  );
}
