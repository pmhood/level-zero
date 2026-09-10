import { describe, expect, it } from 'vitest';

import { DOCUMENT_CONTENT_KEY } from '../document/document';
import { type EntitySnapshot } from '../entity/entity';
import { TUNING_PARAMETERS_KEY, type Parameter } from '../parameter/parameter';
import {
  DETAILS_GROUP,
  TUNING_GROUP,
  WRITING_GROUP,
  entityVersionDifferences,
} from './entity-differences';

function snapshot(overrides: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return {
    name: 'Oxygen management',
    description: 'Life is a resource.',
    status: 'draft',
    tags: ['survival'],
    data: {},
    ...overrides,
  };
}

const drain: Parameter = {
  id: 'oxygen-drain',
  label: 'Oxygen drain',
  type: 'range',
  value: 120,
  min: 0,
  max: 240,
  step: 1,
  units: 's',
};

describe('entity version differences', () => {
  it('reads the fields every entity has', () => {
    const groups = entityVersionDifferences(
      snapshot(),
      snapshot({ name: 'Oxygen', status: 'active', tags: ['survival', 'pressure'] }),
    );

    expect(groups).toEqual([
      {
        title: DETAILS_GROUP,
        differences: [
          {
            key: 'name',
            label: 'Name',
            change: 'changed',
            from: 'Oxygen management',
            to: 'Oxygen',
          },
          { key: 'status', label: 'Status', change: 'changed', from: 'draft', to: 'active' },
          {
            key: 'tags',
            label: 'Tags',
            change: 'changed',
            from: 'survival',
            to: 'survival, pressure',
          },
        ],
      },
    ]);
  });

  it('says nothing about two identical versions', () => {
    expect(entityVersionDifferences(snapshot(), snapshot())).toEqual([]);
  });

  it('names a type-specific field rather than calling it "data"', () => {
    const groups = entityVersionDifferences(
      snapshot({ data: { implementationStatus: 'designed' } }),
      snapshot({ data: { implementationStatus: 'prototyped' } }),
    );

    expect(groups[0]?.differences).toEqual([
      {
        key: 'data.implementationStatus',
        label: 'Implementation status',
        change: 'changed',
        from: 'designed',
        to: 'prototyped',
      },
    ]);
  });

  it('reads a mechanic’s tuning as parameter values, keyed on their stable ids', () => {
    const groups = entityVersionDifferences(
      snapshot({ data: { [TUNING_PARAMETERS_KEY]: [drain] } }),
      snapshot({ data: { [TUNING_PARAMETERS_KEY]: [{ ...drain, value: 90 }] } }),
    );

    expect(groups).toEqual([
      {
        title: TUNING_GROUP,
        differences: [
          {
            key: 'oxygen-drain',
            label: 'Oxygen drain',
            change: 'changed',
            from: '120 s',
            to: '90 s',
          },
        ],
      },
    ]);
  });

  it('reads a document body as prose, never as its stored JSON', () => {
    const body = (text: string) => ({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });

    const groups = entityVersionDifferences(
      snapshot({ data: { [DOCUMENT_CONTENT_KEY]: body('Dive deeper.') } }),
      snapshot({ data: { [DOCUMENT_CONTENT_KEY]: body('Dive deeper, faster.') } }),
    );

    expect(groups).toEqual([
      {
        title: WRITING_GROUP,
        differences: [
          {
            key: '0',
            label: 'Paragraph',
            change: 'changed',
            from: 'Dive deeper.',
            to: 'Dive deeper, faster.',
          },
        ],
      },
    ]);
    expect(JSON.stringify(groups)).not.toContain('"type":"doc"');
  });

  it('keeps details first and puts each specialised reading in its own group', () => {
    const groups = entityVersionDifferences(
      snapshot({ data: { [TUNING_PARAMETERS_KEY]: [drain] } }),
      snapshot({ name: 'Oxygen', data: { [TUNING_PARAMETERS_KEY]: [{ ...drain, value: 90 }] } }),
    );

    expect(groups.map((group) => group.title)).toEqual([DETAILS_GROUP, TUNING_GROUP]);
  });

  /**
   * A stored shape that moves without any value moving must still be reported:
   * "nothing changed" would be a lie, and the generic reading is the honest
   * fallback when the specialised one has nothing to say.
   */
  it('falls back to a plain field row when a specialised reading finds nothing', () => {
    const groups = entityVersionDifferences(
      snapshot({ data: { [TUNING_PARAMETERS_KEY]: [drain] } }),
      snapshot({ data: { [TUNING_PARAMETERS_KEY]: [{ ...drain, max: 600 }] } }),
    );

    expect(groups).toEqual([
      {
        title: DETAILS_GROUP,
        differences: [
          {
            key: `data.${TUNING_PARAMETERS_KEY}`,
            label: 'Tuning parameters',
            change: 'changed',
            from: '1 item',
            to: '1 item',
          },
        ],
      },
    ]);
  });

  it('reads a field that only one side has as added or removed', () => {
    const added = entityVersionDifferences(
      snapshot(),
      snapshot({ data: { fantasy: 'Air is running out.' } }),
    );
    expect(added[0]?.differences[0]).toMatchObject({
      change: 'added',
      from: null,
      to: 'Air is running out.',
    });

    const removed = entityVersionDifferences(
      snapshot({ description: 'Life is a resource.' }),
      snapshot({ description: null }),
    );
    expect(removed[0]?.differences[0]).toMatchObject({ change: 'removed', to: null });
  });
});
