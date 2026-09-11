import type { Job } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  canonicalEntityHref,
  checkTitle,
  isScanActive,
  scanProgress,
  scanProgressLabel,
  severityLabel,
  severityTone,
} from './consistency';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_1',
    projectId: 'prj_1',
    kind: 'consistency_scan',
    targetId: 'prj_1',
    status: 'queued',
    progress: { completed: 0, total: 3, step: null },
    attempt: 1,
    maxAttempts: 3,
    failure: null,
    createdAt: new Date('2026-03-01T09:00:00Z'),
    updatedAt: new Date('2026-03-01T09:00:00Z'),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe('canonicalEntityHref', () => {
  it('routes a canonical entity type to the workspace that owns it', () => {
    expect(canonicalEntityHref('prj_1', 'mechanic')).toBe('/projects/prj_1/mechanics');
    expect(canonicalEntityHref('prj_1', 'character')).toBe('/projects/prj_1/characters');
    expect(canonicalEntityHref('prj_1', 'document')).toBe('/projects/prj_1/gdd');
    expect(canonicalEntityHref('prj_1', 'location')).toBe('/projects/prj_1/world');
    expect(canonicalEntityHref('prj_1', 'idea')).toBe('/projects/prj_1/idea-lab');
    expect(canonicalEntityHref('prj_1', 'moodboard')).toBe('/projects/prj_1/moodboards');
  });

  it('returns null for a type with no workspace page yet, rather than a dead link', () => {
    expect(canonicalEntityHref('prj_1', 'prototype')).toBeNull();
    expect(canonicalEntityHref('prj_1', 'build')).toBeNull();
    expect(canonicalEntityHref('prj_1', 'scene')).toBeNull();
    expect(canonicalEntityHref('prj_1', 'asset_reference')).toBeNull();
  });
});

describe('severityTone', () => {
  it('maps onto the three non-success StatusTones', () => {
    expect(severityTone('conflict')).toBe('error');
    expect(severityTone('warning')).toBe('warning');
    expect(severityTone('info')).toBe('neutral');
  });
});

describe('severityLabel', () => {
  it('reads as a word, not the raw enum value', () => {
    expect(severityLabel('conflict')).toBe('Conflict');
  });
});

describe('checkTitle', () => {
  it('humanizes a kebab-case check id', () => {
    expect(checkTitle('duplicate-name')).toBe('Duplicate name');
    expect(checkTitle('stale-prototype-pin')).toBe('Stale prototype pin');
    expect(checkTitle('lore-contradiction')).toBe('Lore contradiction');
  });

  it('uses the registered title where humanizing the id would get it wrong', () => {
    expect(checkTitle('near-duplicate')).toBe('Near-duplicate concept');
  });

  it('falls back to humanizing for a check this map does not know about yet', () => {
    expect(checkTitle('some-future-check')).toBe('Some future check');
  });
});

describe('scanProgress', () => {
  it('reads "Queued" before a worker has picked the job up', () => {
    expect(scanProgress(null)).toEqual({ step: 'Queued', completed: 0, total: 3 });
  });

  it('reads the job’s own step and counts once a worker is running it', () => {
    const running = job({
      status: 'running',
      progress: { completed: 1, total: 3, step: 'Deterministic checks' },
    });

    expect(scanProgress(running)).toEqual({ step: 'Deterministic checks', completed: 1, total: 3 });
  });
});

describe('scanProgressLabel', () => {
  it('names the step and the count together', () => {
    expect(scanProgressLabel({ step: 'Loading project', completed: 0, total: 3 })).toBe(
      'Loading project — 0 of 3 complete',
    );
  });
});

describe('isScanActive', () => {
  it('is false when nothing has ever run', () => {
    expect(isScanActive(null)).toBe(false);
  });

  it('is true while the job is still moving through its steps', () => {
    expect(isScanActive(job({ status: 'running' }))).toBe(true);
    expect(isScanActive(job({ status: 'processing' }))).toBe(true);
  });

  it('is false once the job has reached a terminal status', () => {
    expect(isScanActive(job({ status: 'complete' }))).toBe(false);
    expect(isScanActive(job({ status: 'failed' }))).toBe(false);
    expect(isScanActive(job({ status: 'cancelled' }))).toBe(false);
  });
});
