import { describe, expect, it } from 'vitest';

import { uniqueIdeaTags } from './idea-tags';

describe('uniqueIdeaTags', () => {
  it('dedupes and sorts tags across ideas', () => {
    expect(
      uniqueIdeaTags([{ tags: ['Sci-Fi', 'Survival'] }, { tags: ['Survival', 'Mechanic'] }]),
    ).toEqual(['Mechanic', 'Sci-Fi', 'Survival']);
  });

  it('returns an empty list when there are no ideas or tags', () => {
    expect(uniqueIdeaTags([])).toEqual([]);
    expect(uniqueIdeaTags([{ tags: [] }])).toEqual([]);
  });
});
