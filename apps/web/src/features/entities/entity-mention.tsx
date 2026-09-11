'use client';

import type { Entity } from '@level-zero/domain';
import { Button, cn, StatusBadge, Tag } from '@level-zero/ui';
import { mergeAttributes, Node, type Editor, type Range } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import type { Route } from 'next';
import Link from 'next/link';
import { useState } from 'react';

import { EntityConsistencyNotice } from '@/features/consistency/entity-consistency-notice';
import { entityRoute } from '@/features/entity-detail/entity-route';

import {
  ENTITY_MENTION_NODE,
  entityReferenceLabel,
  referenceAttributes,
  type EntityReferenceAttributes,
} from './entity-reference';
import { useEntityReferences, useResolvedEntity } from './entity-reference-context';
import { entityStatusBadge, entityTypeLabel } from './entity-presentation';

/**
 * An inline reference to a canonical entity — `@Kael`, `@Oxygen Management`.
 *
 * The node stores the id and the type; the name on screen is resolved from the
 * project's entities every time it renders, so renaming a character updates
 * every document that mentions it without a single document being rewritten.
 */
export const EntityMention = Node.create({
  name: ENTITY_MENTION_NODE,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes: referenceAttributes,

  parseHTML: () => [{ tag: `span[data-type="${ENTITY_MENTION_NODE}"]` }],

  renderHTML: ({ HTMLAttributes }) => [
    'span',
    mergeAttributes({ 'data-type': ENTITY_MENTION_NODE }, HTMLAttributes),
  ],

  // Copying a mention out of the document, or exporting to Markdown, keeps the
  // name it was written with — nothing outside the app can resolve an id.
  renderText: ({ node }) => `@${node.attrs.label ?? node.attrs.entityId}`,
  renderMarkdown: (node) => `@${node.attrs?.label ?? node.attrs?.entityId}`,

  addNodeView: () => ReactNodeViewRenderer(EntityMentionView),
});

/**
 * Writes a mention over `range` — the `@query` the writer typed — and leaves
 * the caret after it, with a space so the next word is not glued to the chip.
 */
export function insertEntityMention(editor: Editor, range: Range, entity: Entity): void {
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      {
        type: ENTITY_MENTION_NODE,
        attrs: { entityId: entity.id, entityType: entity.type, label: entity.name },
      },
      { type: 'text', text: ' ' },
    ])
    .run();
}

function EntityMentionView({ node, editor, deleteNode }: NodeViewProps) {
  const { entityId, label } = node.attrs as EntityReferenceAttributes;
  const resolved = useResolvedEntity(entityId);
  const { onOpen, projectId } = useEntityReferences();
  const [previewOpen, setPreviewOpen] = useState(false);

  const entity = resolved.state === 'found' ? resolved.entity : null;
  const text = entityReferenceLabel(resolved, label) ?? unknownLabel(node.attrs.entityType);
  const broken = resolved.state === 'missing';

  return (
    <NodeViewWrapper as="span" className="relative inline-block align-baseline">
      <span
        contentEditable={false}
        onMouseEnter={() => setPreviewOpen(true)}
        onMouseLeave={() => setPreviewOpen(false)}
      >
        <button
          type="button"
          onClick={() => entity && onOpen(entity)}
          onFocus={() => setPreviewOpen(true)}
          onBlur={() => setPreviewOpen(false)}
          aria-label={
            broken ? `Broken reference to a missing ${referenceKind(node.attrs.entityType)}` : text
          }
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-1 py-px align-baseline text-[0.95em] font-medium',
            broken
              ? 'bg-[var(--lz-error-muted)] text-error line-through'
              : 'bg-active text-primary hover:bg-hover',
            entity?.status === 'archived' && 'bg-hover text-muted-foreground',
          )}
        >
          <span aria-hidden className="text-faint-foreground">
            @
          </span>
          {text}
          {entity?.status === 'archived' && (
            <span className="text-[0.85em] text-faint-foreground">(archived)</span>
          )}
        </button>

        {broken && editor.isEditable && (
          <button
            type="button"
            onClick={() => deleteNode()}
            aria-label={`Remove the broken reference to ${text}`}
            className="ml-0.5 rounded text-faint-foreground hover:text-foreground"
          >
            ×
          </button>
        )}

        {previewOpen && (
          <EntityReferencePreview
            entity={entity}
            broken={broken}
            onOpen={onOpen}
            projectId={projectId}
          />
        )}
      </span>
    </NodeViewWrapper>
  );
}

/**
 * The compact preview behind hover and focus (spec section 36): what the
 * entity is, what state it is in, and the way through to it.
 */
function EntityReferencePreview({
  entity,
  broken,
  onOpen,
  projectId,
}: {
  entity: Entity | null;
  broken: boolean;
  onOpen: (entity: Entity) => void;
  projectId?: string;
}) {
  const status = entity ? entityStatusBadge(entity.status) : null;

  return (
    <span
      role="tooltip"
      className="absolute top-full left-0 z-30 mt-1 block w-64 rounded-lg border border-border bg-raised p-3 text-left shadow-[var(--lz-shadow-floating)]"
    >
      {!entity ? (
        <span className="block text-xs text-muted-foreground">
          {broken
            ? 'This entity no longer exists. Remove the reference, or mention the entity that replaced it.'
            : 'Looking this up…'}
        </span>
      ) : (
        <>
          <span className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{entity.name}</span>
            {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
          </span>
          <span className="mt-0.5 block text-xs text-faint-foreground">
            {entityTypeLabel(entity.type)}
          </span>
          {entity.description && (
            <span className="mt-2 line-clamp-3 block text-xs text-muted-foreground">
              {entity.description}
            </span>
          )}
          {entity.tags.length > 0 && (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {entity.tags.map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </span>
          )}
          {projectId && <EntityConsistencyNotice projectId={projectId} entityId={entity.id} />}
          {projectId ? (
            <Button asChild variant="secondary" size="sm" className="mt-3">
              <Link href={entityRoute(projectId, entity.id) as Route}>Open</Link>
            </Button>
          ) : (
            // No project to build a route from (untouched by tests and other
            // callers that predate the canonical route) — fall back to the
            // inspector, the previous of the two behaviours "Open" ever had.
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => onOpen(entity)}>
              Open
            </Button>
          )}
        </>
      )}
    </span>
  );
}

function referenceKind(entityType: string | null): string {
  return entityType ? entityTypeLabel(entityType as Entity['type']).toLowerCase() : 'entity';
}

function unknownLabel(entityType: string | null): string {
  return `Missing ${referenceKind(entityType)}`;
}
