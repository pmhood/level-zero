import type { Entity, EntityStatus, EntityType } from '@level-zero/domain';
import type { JSONContent } from '@level-zero/ui';
import { describe, expect, it } from 'vitest';

import {
  describeReferenceForExport,
  ENTITY_EMBED_NODE,
  ENTITY_MENTION_NODE,
  entityReferenceLabel,
  matchEntities,
  referencedEntityIds,
  referenceNodeForExport,
  resolveEntityReference,
  resolveEntityReferencesForExport,
  type EntityReferenceAttributes,
} from './entity-reference';

function entity(
  id: string,
  name: string,
  type: EntityType = 'character',
  status: EntityStatus = 'active',
): Entity {
  return {
    id,
    projectId: 'prj_1',
    type,
    name,
    description: null,
    status,
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
}

const KAEL = entity('ent_kael', 'Kael Voss');
const OXYGEN = entity('ent_oxygen', 'Oxygen Management', 'mechanic');
const DRIFT = entity('ent_drift', 'Driftwake Station', 'location');

describe('matchEntities', () => {
  const entities = [DRIFT, KAEL, OXYGEN];

  it('returns every referenceable entity for an empty query', () => {
    expect(matchEntities(entities, '').map((match) => match.id)).toEqual([
      DRIFT.id,
      KAEL.id,
      OXYGEN.id,
    ]);
  });

  it('puts names that start with the query first', () => {
    expect(matchEntities(entities, 'a').map((match) => match.name)).toEqual([
      'Driftwake Station',
      'Kael Voss',
      'Oxygen Management',
    ]);
    expect(matchEntities(entities, 'oxy')[0]?.id).toBe(OXYGEN.id);
  });

  it('scopes to one type when the embed pickers ask it to', () => {
    expect(matchEntities(entities, '', { type: 'mechanic' }).map((m) => m.id)).toEqual([OXYGEN.id]);
  });

  it('leaves out types a document cannot reference', () => {
    const document = entity('ent_gdd', 'Game Design Document', 'document');

    expect(matchEntities([...entities, document], 'game')).toEqual([]);
  });

  it('leaves out archived entities, which can be kept but not newly referenced', () => {
    const retired = entity('ent_old', 'Kael Prototype', 'character', 'archived');

    expect(matchEntities([KAEL, retired], 'kael').map((match) => match.id)).toEqual([KAEL.id]);
  });

  it('caps the list so the menu stays a menu', () => {
    const many = Array.from({ length: 20 }, (_, index) => entity(`ent_${index}`, `Guard ${index}`));

    expect(matchEntities(many, 'guard')).toHaveLength(8);
    expect(matchEntities(many, 'guard', { limit: 3 })).toHaveLength(3);
  });
});

describe('resolveEntityReference', () => {
  it('finds the entity a reference points at, archived or not', () => {
    const archived = entity('ent_old', 'Old Kael', 'character', 'archived');

    expect(resolveEntityReference('ent_old', [KAEL, archived], false)).toEqual({
      state: 'found',
      entity: archived,
    });
  });

  it('waits rather than reporting a break while the entities are still loading', () => {
    expect(resolveEntityReference('ent_kael', [], true)).toEqual({ state: 'loading' });
  });

  it('reports a missing entity once the list has arrived without it', () => {
    expect(resolveEntityReference('ent_kael', [], false)).toEqual({ state: 'missing' });
  });
});

describe('entityReferenceLabel', () => {
  it('shows the entity name as it is now, not the one stored with the reference', () => {
    const renamed = { ...KAEL, name: 'Kael Ardent' };

    expect(entityReferenceLabel({ state: 'found', entity: renamed }, 'Kael Voss')).toBe(
      'Kael Ardent',
    );
  });

  it('falls back to the stored label so a broken reference still says what it was', () => {
    expect(entityReferenceLabel({ state: 'missing' }, 'Kael Voss')).toBe('Kael Voss');
  });
});

describe('referencedEntityIds', () => {
  const mention = (entityId: unknown) => ({ type: 'entityMention', attrs: { entityId } });

  it('reads the entities a passage mentions out of its nodes', () => {
    expect(referencedEntityIds([mention('ent_kael'), mention('ent_oxygen')])).toEqual([
      'ent_kael',
      'ent_oxygen',
    ]);
  });

  it('names an entity mentioned twice once', () => {
    expect(referencedEntityIds([mention('ent_kael'), mention('ent_kael')])).toEqual(['ent_kael']);
  });

  it('ignores a reference that never got an entity', () => {
    expect(referencedEntityIds([mention(null), mention(''), { type: 'text', text: 'a' }])).toEqual(
      [],
    );
  });
});

describe('describeReferenceForExport (issue #190)', () => {
  const attrs = (
    overrides: Partial<EntityReferenceAttributes> = {},
  ): EntityReferenceAttributes => ({
    entityId: KAEL.id,
    entityType: KAEL.type,
    label: KAEL.name,
    ...overrides,
  });

  it('names a resolved entity by its current name', () => {
    expect(describeReferenceForExport(attrs(), [KAEL])).toEqual({
      name: 'Kael Voss',
      archived: false,
      missing: false,
    });
  });

  it('flags an archived entity without hiding its name', () => {
    const archived = { ...KAEL, status: 'archived' as EntityStatus };
    expect(describeReferenceForExport(attrs(), [archived])).toEqual({
      name: 'Kael Voss',
      archived: true,
      missing: false,
    });
  });

  it('names which entity is missing, using the label it was written with', () => {
    expect(describeReferenceForExport(attrs(), [])).toEqual({
      name: 'Missing character: Kael Voss',
      archived: false,
      missing: true,
    });
  });

  it('falls back to a generic missing message when there was never a label', () => {
    expect(describeReferenceForExport(attrs({ label: null }), [])).toEqual({
      name: 'Missing character',
      archived: false,
      missing: true,
    });
  });

  it('says an embed was never filled in, distinctly from a broken one', () => {
    expect(describeReferenceForExport(attrs({ entityId: null, label: null }), [])).toEqual({
      name: 'No character chosen',
      archived: false,
      missing: true,
    });
  });
});

describe('referenceNodeForExport and resolveEntityReferencesForExport (issue #190)', () => {
  const PROJECT_ID = 'prj_1';

  function mentionNode(overrides: Partial<EntityReferenceAttributes> = {}): JSONContent {
    return {
      type: ENTITY_MENTION_NODE,
      attrs: { entityId: KAEL.id, entityType: KAEL.type, label: KAEL.name, ...overrides },
    };
  }

  it('turns a resolved mention into linked, plain text', () => {
    expect(referenceNodeForExport(mentionNode(), [KAEL], PROJECT_ID)).toEqual({
      type: 'text',
      text: 'Kael Voss',
      marks: [{ type: 'link', attrs: { href: `/projects/${PROJECT_ID}/entities/${KAEL.id}` } }],
    });
  });

  it('turns a missing mention into unlinked text', () => {
    expect(referenceNodeForExport(mentionNode(), [], PROJECT_ID)).toEqual({
      type: 'text',
      text: 'Missing character: Kael Voss',
      marks: [],
    });
  });

  it('turns a resolved embed into a linked heading plus its description', () => {
    const node = referenceNodeForExport(
      {
        type: ENTITY_EMBED_NODE,
        attrs: { entityId: OXYGEN.id, entityType: OXYGEN.type, label: OXYGEN.name },
      },
      [OXYGEN],
      PROJECT_ID,
    );

    expect(node.type).toBe('blockquote');
    expect(node.content?.[0]).toMatchObject({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Oxygen Management',
          marks: [
            { type: 'link', attrs: { href: `/projects/${PROJECT_ID}/entities/${OXYGEN.id}` } },
          ],
        },
        { type: 'text', text: ' — Mechanic' },
      ],
    });
  });

  it('replaces every mention and embed anywhere in the document, leaving everything else untouched', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Air runs out for ' }, mentionNode()],
        },
      ],
    };

    const resolved = resolveEntityReferencesForExport(doc, [KAEL], PROJECT_ID);

    expect(resolved.content?.[0]?.content?.[0]).toEqual({
      type: 'text',
      text: 'Air runs out for ',
    });
    expect(resolved.content?.[0]?.content?.[1]).toEqual({
      type: 'text',
      text: 'Kael Voss',
      marks: [{ type: 'link', attrs: { href: `/projects/${PROJECT_ID}/entities/${KAEL.id}` } }],
    });
  });
});
