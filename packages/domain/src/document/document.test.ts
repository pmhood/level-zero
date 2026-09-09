import { describe, expect, it } from 'vitest';

import { createEntity } from '../entity/entity';
import { fixedClock } from '../shared/clock';
import { ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import { createEntityVersion } from '../version/entity-version';
import {
  documentContent,
  documentData,
  documentVersionName,
  emptyDocumentContent,
  requireDocumentContent,
  type DocumentContent,
} from './document';

const deps = {
  clock: fixedClock('2026-03-01T09:00:00.000Z'),
  ids: sequentialIdGenerator('id'),
};

/** A body carrying an entity mention, the node the GDD links designs with. */
const withMention: DocumentContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'The diver breathes through ' },
        {
          type: 'entityMention',
          attrs: { entityId: 'entity-7', entityType: 'mechanic', label: 'Oxygen Management' },
        },
        { type: 'text', text: '.' },
      ],
    },
  ],
};

function documentEntity(data: Record<string, unknown>) {
  return createEntity({ projectId: 'project-1', type: 'document', name: 'GDD', data }, deps);
}

describe('documentContent / documentData', () => {
  it('round-trips a body through an entity, custom nodes and all', () => {
    const entity = documentEntity(documentData(withMention));

    expect(documentContent(entity)).toEqual(withMention);
  });

  it('keeps the rest of the entity data when the body is replaced', () => {
    const data = documentData(withMention, { outlineCollapsed: true });

    expect(data).toMatchObject({ outlineCollapsed: true, content: withMention });
  });

  it('reads an unwritten body as an empty document', () => {
    expect(documentContent(documentEntity({}))).toEqual(emptyDocumentContent());
  });

  it('reads a body that is not a document node as an empty document', () => {
    expect(documentContent(documentEntity({ content: 'plain text' }))).toEqual(
      emptyDocumentContent(),
    );
    expect(documentContent(documentEntity({ content: { type: 'paragraph' } }))).toEqual(
      emptyDocumentContent(),
    );
  });
});

describe('requireDocumentContent', () => {
  it('accepts a document node', () => {
    expect(requireDocumentContent('content', withMention)).toEqual(withMention);
  });

  it('rejects anything that is not a document node', () => {
    expect(() => requireDocumentContent('content', { type: 'paragraph' })).toThrow(ValidationError);
    expect(() => requireDocumentContent('content', 'hello')).toThrow(ValidationError);
    expect(() => requireDocumentContent('content', undefined)).toThrow(ValidationError);
  });
});

describe('documentVersionName', () => {
  const version = (metadata: Record<string, unknown>) =>
    createEntityVersion(
      {
        projectId: 'project-1',
        entityId: 'entity-1',
        versionNumber: 1,
        parentVersionId: null,
        snapshot: { name: 'GDD', description: null, status: 'draft', tags: [], data: {} },
        reason: 'manual',
        metadata,
      },
      deps,
    );

  it('reads the label a snapshot was taken under', () => {
    expect(documentVersionName(version({ name: 'Vertical slice review' }))).toBe(
      'Vertical slice review',
    );
  });

  it('reads an unnamed snapshot as null', () => {
    expect(documentVersionName(version({}))).toBeNull();
    expect(documentVersionName(version({ name: 12 }))).toBeNull();
  });
});
