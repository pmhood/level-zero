import { describe, expect, it } from 'vitest';

import { ValidationError } from '../shared/errors';
import { requireReviewTarget, reviewTargetFilter } from './review-target';

describe('requireReviewTarget', () => {
  it('normalises an omitted anchor and version to null', () => {
    expect(requireReviewTarget('target', { type: 'entity', id: 'entity-1' })).toEqual({
      type: 'entity',
      id: 'entity-1',
      anchor: null,
      versionId: null,
    });
  });

  it('keeps a section anchor', () => {
    const target = requireReviewTarget('target', {
      type: 'entity',
      id: 'doc-1',
      anchor: 'Core Loop',
    });

    expect(target.anchor).toBe('Core Loop');
  });

  it('rejects a version pin on a target that has no versions', () => {
    expect(() =>
      requireReviewTarget('target', { type: 'asset', id: 'asset-1', versionId: 'version-1' }),
    ).toThrow(ValidationError);
  });

  it('rejects an unknown target type', () => {
    expect(() => requireReviewTarget('target', { type: 'moodboard', id: 'm-1' } as never)).toThrow(
      ValidationError,
    );
  });

  it('rejects an empty id', () => {
    expect(() => requireReviewTarget('target', { type: 'entity', id: '  ' })).toThrow(
      ValidationError,
    );
  });
});

describe('reviewTargetFilter', () => {
  it('drops the version pin, so a target has one thread list and one history', () => {
    const target = requireReviewTarget('target', {
      type: 'entity',
      id: 'entity-1',
      anchor: 'Core Loop',
      versionId: 'version-1',
    });

    expect(reviewTargetFilter(target)).toEqual({
      targetType: 'entity',
      targetId: 'entity-1',
      anchor: 'Core Loop',
    });
  });
});
