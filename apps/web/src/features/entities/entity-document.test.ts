import type { Entity } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { entityDocument } from './entity-document';

function entityWith(data: Record<string, unknown>): Entity {
  return {
    id: 'ent_1',
    projectId: 'prj_1',
    type: 'document',
    name: 'Game Design Document',
    description: null,
    status: 'draft',
    tags: [],
    data,
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
  };
}

describe('entityDocument', () => {
  it('reads the stored TipTap document', () => {
    const content = { type: 'doc', content: [{ type: 'paragraph' }] };

    expect(entityDocument(entityWith({ content }), 'content')).toEqual(content);
  });

  it('reads each field separately so one entity can carry several documents', () => {
    const notes = { type: 'doc', content: [] };

    expect(entityDocument(entityWith({ notes }), 'notes')).toEqual(notes);
    expect(entityDocument(entityWith({ notes }), 'content')).toBeNull();
  });

  it.each([
    ['a missing field', {}],
    ['a plain string', { content: 'Oxygen runs out.' }],
    ['null', { content: null }],
    ['an array', { content: [] }],
    ['some other JSON object', { content: { type: 'paragraph' } }],
  ])('reads %s as nothing written yet', (_case, data) => {
    expect(entityDocument(entityWith(data), 'content')).toBeNull();
  });
});
