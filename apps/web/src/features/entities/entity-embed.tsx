'use client';

import { readParameters, type Entity, type EntityType } from '@level-zero/domain';
import { Button, EntityCard, Input, ParameterSummary, StatusBadge } from '@level-zero/ui';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useState } from 'react';

import { EntityOptionList } from './entity-option-list';
import { entityStatusBadge, entityTypeLabel } from './entity-presentation';
import {
  ENTITY_EMBED_NODE,
  entityReferenceLabel,
  matchEntities,
  referenceAttributes,
  type EntityReferenceAttributes,
} from './entity-reference';
import { useEntityReferences, useResolvedEntity } from './entity-reference-context';

/**
 * A block reference to a canonical entity: the richer card a mechanic or a
 * character gets when a section is *about* it rather than merely naming it.
 *
 * Like the inline mention it stores only the id and the type — the card is
 * drawn from the entity as it is now.
 */
export const EntityEmbed = Node.create({
  name: ENTITY_EMBED_NODE,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes: referenceAttributes,

  parseHTML: () => [{ tag: `div[data-type="${ENTITY_EMBED_NODE}"]` }],

  renderHTML: ({ HTMLAttributes }) => [
    'div',
    mergeAttributes({ 'data-type': ENTITY_EMBED_NODE }, HTMLAttributes),
  ],

  renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.entityId}`,
  renderMarkdown: (node) => `> @${node.attrs?.label ?? node.attrs?.entityId}`,

  addNodeView: () => ReactNodeViewRenderer(EntityEmbedView),
});

function EntityEmbedView({ node, editor, updateAttributes, deleteNode }: NodeViewProps) {
  const { entityId, entityType, label } = node.attrs as EntityReferenceAttributes;
  const resolved = useResolvedEntity(entityId);
  const { onOpen } = useEntityReferences();

  function choose(entity: Entity) {
    updateAttributes({ entityId: entity.id, entityType: entity.type, label: entity.name });
  }

  // A resolved embed *is* the canonical entity card (spec section 68), so it
  // renders as one; the other states are the card's absence and carry their
  // own panel.
  if (resolved.state === 'found') {
    const entity = resolved.entity;

    return (
      <NodeViewWrapper>
        <div contentEditable={false}>
          <EntityCard
            name={entity.name}
            typeLabel={entityTypeLabel(entity.type)}
            status={entityStatusBadge(entity.status)}
            description={entity.description}
            tags={entity.tags}
            footer={
              <>
                {/* Whatever the entity is tuned by, if anything: a section
                    about a mechanic is usually about its numbers. */}
                <ParameterSummary parameters={readParameters(entity)} className="mb-3" />
                <Button variant="secondary" size="sm" onClick={() => onOpen(entity)}>
                  Open
                </Button>
              </>
            }
          />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper>
      <div contentEditable={false} className="rounded-lg border border-border bg-surface p-3">
        {resolved.state === 'loading' ? (
          <p className="text-xs text-muted-foreground">Loading the reference…</p>
        ) : entityId ? (
          <BrokenEmbed
            text={entityReferenceLabel(resolved, label)}
            entityType={entityType}
            editable={editor.isEditable}
            onReplace={() => updateAttributes({ entityId: null, label: null })}
            onRemove={deleteNode}
          />
        ) : (
          <EmbedPicker
            entityType={entityType}
            editable={editor.isEditable}
            onChoose={choose}
            onRemove={deleteNode}
          />
        )}
      </div>
    </NodeViewWrapper>
  );
}

/**
 * A reference whose entity is gone. It stays in the document, visibly broken,
 * because silently dropping a paragraph's subject is worse than showing that
 * something is missing.
 */
function BrokenEmbed({
  text,
  entityType,
  editable,
  onReplace,
  onRemove,
}: {
  text: string | null;
  entityType: EntityType | null;
  editable: boolean;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const kind = entityType ? entityTypeLabel(entityType).toLowerCase() : 'entity';

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-semibold text-error">{text ?? `Missing ${kind}`}</p>
        <StatusBadge tone="error">Missing</StatusBadge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        This {kind} is no longer in the project. Point the embed at another one, or remove it.
      </p>
      {editable && (
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={onReplace}>
            Choose another
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        </div>
      )}
    </>
  );
}

/** The empty state a `/` embed command inserts: pick the entity the card shows. */
function EmbedPicker({
  entityType,
  editable,
  onChoose,
  onRemove,
}: {
  entityType: EntityType | null;
  editable: boolean;
  onChoose: (entity: Entity) => void;
  onRemove: () => void;
}) {
  const { entities } = useEntityReferences();
  const [query, setQuery] = useState('');
  const kind = entityType ? entityTypeLabel(entityType).toLowerCase() : 'entity';
  const matches = matchEntities(entities, query, { type: entityType ?? undefined });

  if (!editable) {
    return <p className="text-xs text-faint-foreground">No {kind} chosen yet.</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Choose a {kind}</p>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={`Search ${kind}s…`}
        aria-label={`Search ${kind}s`}
        className="mt-2"
      />
      <div className="mt-1">
        <EntityOptionList
          entities={matches}
          onSelect={onChoose}
          label={`${kind} results`}
          emptyMessage={`No ${kind} matches. Create one first, then embed it here.`}
        />
      </div>
    </>
  );
}
