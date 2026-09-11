import { describe, expect, it } from 'vitest';

import { PROMOTIONS, findPromotion, promotionsFor } from './promotion-definition';

describe('the promotion catalogue', () => {
  it('offers idea promotions to design pillar, mechanic, character and location', () => {
    expect(promotionsFor('idea').map((promotion) => promotion.targetType).sort()).toEqual([
      'character',
      'design_pillar',
      'location',
      'mechanic',
    ]);
  });

  it('offers a reference or moodboard promotion to design pillar (visual direction)', () => {
    expect(findPromotion('asset_reference', 'design_pillar')).toMatchObject({
      targetType: 'design_pillar',
      label: 'Make this the visual direction',
    });
    expect(findPromotion('moodboard', 'design_pillar')).toMatchObject({
      targetType: 'design_pillar',
    });
  });

  it('offers a mechanic, system or scene promotion to prototype', () => {
    expect(findPromotion('mechanic', 'prototype')).toMatchObject({ targetType: 'prototype' });
    expect(findPromotion('system', 'prototype')).toMatchObject({ targetType: 'prototype' });
    expect(findPromotion('scene', 'prototype')).toMatchObject({ targetType: 'prototype' });
  });

  it('returns undefined for a pair the product does not offer', () => {
    expect(findPromotion('idea', 'faction')).toBeUndefined();
    expect(findPromotion('character', 'mechanic')).toBeUndefined();
  });

  it('returns no menu entries for a source type with no promotions', () => {
    expect(promotionsFor('faction')).toEqual([]);
  });

  // §7 non-goal checks. These are the review-checkable tests the issue calls for.

  it('non-goal 1/2: every field is a string or a readonly array of strings', () => {
    for (const promotion of PROMOTIONS) {
      expect(Object.keys(promotion).sort()).toEqual(['label', 'sourceTypes', 'targetType']);
      expect(typeof promotion.label).toBe('string');
      expect(typeof promotion.targetType).toBe('string');
      expect(Array.isArray(promotion.sourceTypes)).toBe(true);
      for (const sourceType of promotion.sourceTypes) {
        expect(typeof sourceType).toBe('string');
      }
    }
  });

  it('non-goal 2: the catalogue round-trips through JSON without loss', () => {
    expect(JSON.parse(JSON.stringify(PROMOTIONS))).toEqual(PROMOTIONS);
  });
});
