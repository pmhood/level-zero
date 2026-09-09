import { ENTITY_STATUSES, ENTITY_TYPES } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { entityStatusBadge, entityTypeLabel } from './entity-presentation';

describe('entityTypeLabel', () => {
  it('has a label for every canonical entity type', () => {
    for (const type of ENTITY_TYPES) {
      expect(entityTypeLabel(type)).toBeTruthy();
    }
  });

  it('renders idea and mechanic with their expected labels', () => {
    expect(entityTypeLabel('idea')).toBe('Idea');
    expect(entityTypeLabel('mechanic')).toBe('Mechanic');
  });
});

describe('entityStatusBadge', () => {
  it('has a badge for every entity status', () => {
    for (const status of ENTITY_STATUSES) {
      expect(entityStatusBadge(status).label).toBeTruthy();
    }
  });

  it('gives active a success tone and draft/archived a neutral one', () => {
    expect(entityStatusBadge('active').tone).toBe('success');
    expect(entityStatusBadge('draft').tone).toBe('neutral');
    expect(entityStatusBadge('archived').tone).toBe('neutral');
  });

  it('tells draft and archived apart by label, not color', () => {
    expect(entityStatusBadge('draft').label).not.toBe(entityStatusBadge('archived').label);
  });
});
