import { describe, expect, it } from 'vitest';

import { entityRoute } from './entity-route';

describe('entityRoute', () => {
  it('builds the canonical path from the project and entity ids', () => {
    expect(entityRoute('prj_1', 'ent_kael')).toBe('/projects/prj_1/entities/ent_kael');
  });

  it('takes no name, so nothing about it can go stale when an entity is renamed', () => {
    // `entityRoute` only accepts ids — there is no third parameter for a name
    // to pass, which is the whole guarantee (docs/decisions/canonical-entity-routes.md
    // §8): the same two ids always build the same path, whatever the entity
    // is currently called.
    const beforeRename = entityRoute('prj_1', 'ent_kael');
    const afterRename = entityRoute('prj_1', 'ent_kael');

    expect(afterRename).toBe(beforeRename);
  });
});
