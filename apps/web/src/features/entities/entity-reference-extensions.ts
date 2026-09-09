import type { Entity, EntityType } from '@level-zero/domain';
import type { EditorCommand, Extensions } from '@level-zero/ui';

import { EntityEmbed } from './entity-embed';
import { EntityMention } from './entity-mention';
import { createEntityMentionSuggestion } from './entity-mention-suggestion';
import { entityTypeLabel } from './entity-presentation';
import { ENTITY_EMBED_NODE, REFERENCEABLE_ENTITY_TYPES } from './entity-reference';

/**
 * The entity-reference nodes, ready to hand to `RichTextEditor`'s `extensions`.
 *
 * They are assembled here rather than in `packages/ui` because they are the
 * one part of the writing surface that knows what an entity is; the editor
 * takes them as ordinary TipTap nodes.
 */
export function createEntityReferenceExtensions(search: (query: string) => Entity[]): Extensions {
  return [EntityMention, EntityEmbed, createEntityMentionSuggestion(search)];
}

/**
 * One `/` command per embeddable type, on top of the editor's own blocks.
 *
 * The command inserts the card with its type fixed and no entity yet; the card
 * then asks which one, so choosing never leaves the document.
 */
export const ENTITY_EMBED_COMMANDS: EditorCommand[] = REFERENCEABLE_ENTITY_TYPES.map(embedCommand);

function embedCommand(type: EntityType): EditorCommand {
  const label = entityTypeLabel(type);

  return {
    id: `embed-${type}`,
    title: `${label} embed`,
    hint: `A card for one ${label.toLowerCase()}`,
    keywords: ['embed', 'entity', 'reference', label],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: ENTITY_EMBED_NODE,
          attrs: { entityId: null, entityType: type, label: null },
        })
        .run(),
  };
}
