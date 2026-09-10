import { describe, expect, it } from 'vitest';

import { comparePrototypeVersions } from '../prototype/compare';
import { type PrototypeMember, type PrototypeVersion } from '../prototype/prototype-version';
import { type EntityVersion } from '../version/entity-version';
import {
  CONTENTS_GROUP,
  PROTOTYPE_DETAILS_GROUP,
  UNAVAILABLE,
  prototypeVersionDifferences,
} from './prototype-differences';

function prototypeVersion(
  versionNumber: number,
  members: PrototypeMember[],
  overrides: Partial<PrototypeVersion> = {},
): PrototypeVersion {
  return {
    id: `ptv_${versionNumber}`,
    projectId: 'prj_1',
    prototypeId: 'ent_prototype',
    versionNumber,
    name: null,
    status: 'draft',
    notes: null,
    buildAssetId: null,
    members,
    createdBy: null,
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
    updatedAt: new Date('2026-03-01T09:00:00.000Z'),
    ...overrides,
  };
}

function entityVersion(
  id: string,
  entityId: string,
  versionNumber: number,
  name: string,
): EntityVersion {
  return {
    id,
    projectId: 'prj_1',
    entityId,
    versionNumber,
    parentVersionId: null,
    branchName: 'main',
    snapshot: { name, description: null, status: 'active', tags: [], data: {} },
    reason: 'manual',
    metadata: {},
    createdBy: null,
    createdAt: new Date('2026-03-01T09:00:00.000Z'),
  };
}

const diverV2 = entityVersion('ver_diver_2', 'ent_diver', 2, 'Kael Voss');
const diverV4 = entityVersion('ver_diver_4', 'ent_diver', 4, 'Kael Voss');
const oxygenV1 = entityVersion('ver_oxygen_1', 'ent_oxygen', 1, 'Oxygen management');

describe('prototype version differences', () => {
  it('names the entities whose pinned versions moved', () => {
    const from = prototypeVersion(1, [
      { entityId: 'ent_diver', entityVersionId: 'ver_diver_2' },
      { entityId: 'ent_oxygen', entityVersionId: 'ver_oxygen_1' },
    ]);
    const to = prototypeVersion(2, [{ entityId: 'ent_diver', entityVersionId: 'ver_diver_4' }]);

    const groups = prototypeVersionDifferences(comparePrototypeVersions(from, to), [
      diverV2,
      diverV4,
      oxygenV1,
    ]);

    expect(groups).toEqual([
      {
        title: CONTENTS_GROUP,
        differences: [
          { key: 'ent_diver', label: 'Kael Voss', change: 'changed', from: 'v2', to: 'v4' },
          {
            key: 'ent_oxygen',
            label: 'Oxygen management',
            change: 'removed',
            from: 'v1',
            to: null,
          },
        ],
      },
    ]);
  });

  it('reads an entity that only the later version pins as an addition', () => {
    const from = prototypeVersion(1, [{ entityId: 'ent_diver', entityVersionId: 'ver_diver_2' }]);
    const to = prototypeVersion(2, [
      { entityId: 'ent_diver', entityVersionId: 'ver_diver_2' },
      { entityId: 'ent_oxygen', entityVersionId: 'ver_oxygen_1' },
    ]);

    const groups = prototypeVersionDifferences(comparePrototypeVersions(from, to), [
      diverV2,
      oxygenV1,
    ]);

    expect(groups[0]?.differences).toEqual([
      { key: 'ent_oxygen', label: 'Oxygen management', change: 'added', from: null, to: 'v1' },
    ]);
  });

  it('keeps the row for a pin it cannot resolve rather than hiding it', () => {
    const from = prototypeVersion(1, [{ entityId: 'ent_diver', entityVersionId: 'ver_diver_2' }]);
    const to = prototypeVersion(2, [{ entityId: 'ent_diver', entityVersionId: 'ver_diver_4' }]);

    const groups = prototypeVersionDifferences(comparePrototypeVersions(from, to), [diverV4]);

    expect(groups[0]?.differences).toEqual([
      { key: 'ent_diver', label: 'Kael Voss', change: 'changed', from: UNAVAILABLE, to: 'v4' },
    ]);
  });

  it('falls back to the entity id when nothing can name it', () => {
    const from = prototypeVersion(1, [{ entityId: 'ent_ghost', entityVersionId: 'ver_ghost_1' }]);
    const to = prototypeVersion(2, []);

    const groups = prototypeVersionDifferences(comparePrototypeVersions(from, to), []);

    expect(groups[0]?.differences[0]).toMatchObject({ label: 'ent_ghost', from: UNAVAILABLE });
  });

  it('compares the annotations a version carries as well as its contents', () => {
    const members = [{ entityId: 'ent_diver', entityVersionId: 'ver_diver_2' }];
    const from = prototypeVersion(1, members, { status: 'draft' });
    const to = prototypeVersion(2, members, {
      name: 'Vertical slice',
      status: 'playable',
      buildAssetId: 'ast_build',
    });

    const groups = prototypeVersionDifferences(comparePrototypeVersions(from, to), [diverV2]);

    expect(groups).toEqual([
      {
        title: PROTOTYPE_DETAILS_GROUP,
        differences: [
          { key: 'name', label: 'Name', change: 'added', from: null, to: 'Vertical slice' },
          { key: 'status', label: 'Status', change: 'changed', from: 'draft', to: 'playable' },
          {
            key: 'buildAssetId',
            label: 'Playable build',
            change: 'added',
            from: null,
            to: 'Attached',
          },
        ],
      },
    ]);
  });
});
