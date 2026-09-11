import { PLAYTEST_STATUSES, PROTOTYPE_VERSION_STATUSES } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  formatByteSize,
  playtestStatusBadge,
  prototypeVersionStatusBadge,
} from './prototype-presentation';

describe('prototypeVersionStatusBadge', () => {
  it('has a badge for every prototype version status', () => {
    for (const status of PROTOTYPE_VERSION_STATUSES) {
      expect(prototypeVersionStatusBadge(status).label).toBeTruthy();
    }
  });

  it('gives playable a success tone, draft and archived a neutral one', () => {
    expect(prototypeVersionStatusBadge('playable').tone).toBe('success');
    expect(prototypeVersionStatusBadge('draft').tone).toBe('neutral');
    expect(prototypeVersionStatusBadge('archived').tone).toBe('neutral');
  });

  it('tells draft and archived apart by label, not color alone', () => {
    expect(prototypeVersionStatusBadge('draft').label).not.toBe(
      prototypeVersionStatusBadge('archived').label,
    );
  });
});

describe('playtestStatusBadge', () => {
  it('has a badge for every playtest status', () => {
    for (const status of PLAYTEST_STATUSES) {
      expect(playtestStatusBadge(status).label).toBeTruthy();
    }
  });
});

describe('formatByteSize', () => {
  it('renders bytes, kilobytes and megabytes at the right scale', () => {
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
    expect(formatByteSize(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
