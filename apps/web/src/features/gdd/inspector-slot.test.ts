import type { Entity } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import { resolveInspectorSlot } from './inspector-slot';

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_1',
    projectId: 'prj_1',
    type: 'character',
    name: 'Mira',
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    archivedAt: null,
    ...overrides,
  };
}

const closed = {
  openEntity: null,
  reviewOpen: false,
  askingAi: false,
  historyOpen: false,
  comparing: false,
  archived: false,
};

describe('resolveInspectorSlot — routing to each panel', () => {
  it('shows nothing when every panel is closed', () => {
    expect(resolveInspectorSlot(closed)).toEqual({ kind: 'none' });
  });

  it('shows the entity reference when one is open', () => {
    const mira = entity();
    expect(resolveInspectorSlot({ ...closed, openEntity: mira })).toEqual({
      kind: 'entity',
      entity: mira,
    });
  });

  it('shows Review when it is open', () => {
    expect(resolveInspectorSlot({ ...closed, reviewOpen: true })).toEqual({ kind: 'review' });
  });

  it('shows the AI inspector when Ask AI is open', () => {
    expect(resolveInspectorSlot({ ...closed, askingAi: true })).toEqual({ kind: 'ai' });
  });

  it('shows History when it is open', () => {
    expect(resolveInspectorSlot({ ...closed, historyOpen: true })).toEqual({ kind: 'history' });
  });
});

describe('resolveInspectorSlot — precedence', () => {
  it('the entity reference wins over every other open panel', () => {
    const mira = entity();
    expect(
      resolveInspectorSlot({
        ...closed,
        openEntity: mira,
        reviewOpen: true,
        askingAi: true,
        historyOpen: true,
      }),
    ).toEqual({ kind: 'entity', entity: mira });
  });

  it('Review wins over Ask AI and History', () => {
    expect(
      resolveInspectorSlot({ ...closed, reviewOpen: true, askingAi: true, historyOpen: true }),
    ).toEqual({ kind: 'review' });
  });

  it('Ask AI wins over History', () => {
    expect(resolveInspectorSlot({ ...closed, askingAi: true, historyOpen: true })).toEqual({
      kind: 'ai',
    });
  });
});

describe('resolveInspectorSlot — suppressed cases', () => {
  it('comparing suppresses the entity reference', () => {
    expect(resolveInspectorSlot({ ...closed, openEntity: entity(), comparing: true })).toEqual({
      kind: 'none',
    });
  });

  it('comparing suppresses Review', () => {
    expect(resolveInspectorSlot({ ...closed, reviewOpen: true, comparing: true })).toEqual({
      kind: 'none',
    });
  });

  it('comparing suppresses Ask AI', () => {
    expect(resolveInspectorSlot({ ...closed, askingAi: true, comparing: true })).toEqual({
      kind: 'none',
    });
  });

  it('comparing suppresses History', () => {
    expect(resolveInspectorSlot({ ...closed, historyOpen: true, comparing: true })).toEqual({
      kind: 'none',
    });
  });

  it('archived suppresses Ask AI, but not the other panels', () => {
    expect(resolveInspectorSlot({ ...closed, askingAi: true, archived: true })).toEqual({
      kind: 'none',
    });
    expect(resolveInspectorSlot({ ...closed, reviewOpen: true, archived: true })).toEqual({
      kind: 'review',
    });
    expect(resolveInspectorSlot({ ...closed, historyOpen: true, archived: true })).toEqual({
      kind: 'history',
    });
  });

  it('an open Ask AI still claims the slot when archived, rather than falling through to History', () => {
    expect(
      resolveInspectorSlot({ ...closed, askingAi: true, historyOpen: true, archived: true }),
    ).toEqual({ kind: 'none' });
  });
});
