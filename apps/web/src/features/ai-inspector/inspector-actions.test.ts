import type { Asset, Entity } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import type { AiSubject } from './ai-subject';
import { acceptedIdeaName, subjectContext, subjectKey, subjectLabel } from './ai-subject';
import { actionsFor, capabilityAvailable } from './inspector-actions';

function entity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'ent_kael',
    projectId: 'prj_1',
    type: 'character',
    name: 'Kael Voss',
    description: null,
    status: 'active',
    tags: [],
    data: {},
    currentVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    archivedAt: null,
    ...overrides,
  };
}

const asset = {
  id: 'ast_plate',
  projectId: 'prj_1',
  kind: 'image',
  filename: 'wreck-plate.png',
  mimeType: 'image/png',
} as Asset;

function actionIds(subject: AiSubject): string[] {
  return actionsFor(subject).map((action) => action.id);
}

describe('actionsFor', () => {
  it('offers questions that belong to the selected type', () => {
    expect(actionIds({ kind: 'entity', entity: entity() })).toEqual([
      'brainstorm-variants',
      'critique-consistency',
      'visual-directions',
      'expand-backstory',
    ]);

    expect(actionIds({ kind: 'entity', entity: entity({ type: 'mechanic' }) })).toEqual([
      'critique-rules',
      'suggest-tuning',
      'identify-dependencies',
      'generate-alternatives',
    ]);

    expect(actionIds({ kind: 'entity', entity: entity({ type: 'document' }) })).toContain(
      'find-contradictions',
    );
    expect(actionIds({ kind: 'entity', entity: entity({ type: 'prototype' }) })).toContain(
      'next-experiment',
    );
    expect(actionIds({ kind: 'asset', asset })).toEqual(['suggest-uses', 'variation-directions']);
    expect(actionIds({ kind: 'project' })).toContain('whats-missing');
  });

  it('treats a system as a mechanic: the same questions apply to both', () => {
    expect(actionIds({ kind: 'entity', entity: entity({ type: 'system' }) })).toEqual(
      actionIds({ kind: 'entity', entity: entity({ type: 'mechanic' }) }),
    );
  });

  it('falls back to the generic questions for a type with no catalogue of its own', () => {
    expect(actionIds({ kind: 'entity', entity: entity({ type: 'faction' }) })).toEqual([
      'brainstorm',
      'critique',
      'expand',
    ]);
  });

  it('names a capability on every action, since that is what the API resolves', () => {
    const everyAction = [
      ...actionsFor({ kind: 'entity', entity: entity() }),
      ...actionsFor({ kind: 'asset', asset }),
      ...actionsFor({ kind: 'project' }),
    ];

    expect(everyAction.every((action) => action.capability.startsWith('text.'))).toBe(true);
  });
});

describe('capabilityAvailable', () => {
  it('is true while the capability list has not arrived, then follows it', () => {
    expect(capabilityAvailable('text.generate', undefined)).toBe(true);
    expect(capabilityAvailable('text.generate', ['text.generate'])).toBe(true);
    expect(capabilityAvailable('text.rewrite', ['text.generate'])).toBe(false);
  });
});

describe('subject', () => {
  it('points the resolver at what is selected, and at nothing else', () => {
    expect(subjectContext({ kind: 'entity', entity: entity() })).toEqual({
      selectedEntityIds: ['ent_kael'],
    });
    expect(subjectContext({ kind: 'entity', entity: entity(), excerpt: 'v2 · playable' })).toEqual({
      selectedEntityIds: ['ent_kael'],
      excerpt: 'v2 · playable',
    });
    expect(subjectContext({ kind: 'asset', asset })).toEqual({ assetIds: ['ast_plate'] });
    expect(subjectContext({ kind: 'project' })).toEqual({});
  });

  it('gives each subject its own identity, so a panel keyed on it is rebuilt', () => {
    expect(subjectKey({ kind: 'entity', entity: entity() })).toBe('entity:ent_kael');
    expect(subjectKey({ kind: 'entity', entity: entity({ id: 'ent_other' }) })).toBe(
      'entity:ent_other',
    );
    expect(subjectKey({ kind: 'asset', asset })).toBe('asset:ast_plate');
    expect(subjectKey({ kind: 'project' })).toBe('project');
  });

  it('names the subject the way the user does', () => {
    expect(subjectLabel({ kind: 'entity', entity: entity() })).toBe('Kael Voss');
    expect(subjectLabel({ kind: 'asset', asset })).toBe('wreck-plate.png');
    expect(subjectLabel({ kind: 'project' })).toBe('this project');
  });

  it('proposes a name for an accepted idea that says what it was about', () => {
    expect(acceptedIdeaName({ kind: 'entity', entity: entity() }, 'Brainstorm variants')).toBe(
      'Brainstorm variants: Kael Voss',
    );
    expect(acceptedIdeaName({ kind: 'project' }, 'Pitch it back to me')).toBe(
      'Pitch it back to me',
    );
  });
});
