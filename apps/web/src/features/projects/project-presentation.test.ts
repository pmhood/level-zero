import { describe, expect, it } from 'vitest';

import { projectStatusBadge } from './project-presentation';

describe('projectStatusBadge', () => {
  it('gives an active project a success tone', () => {
    expect(projectStatusBadge('active')).toEqual({ tone: 'success', label: 'Active' });
  });

  it('gives an archived project a neutral tone', () => {
    expect(projectStatusBadge('archived')).toEqual({ tone: 'neutral', label: 'Archived' });
  });
});
