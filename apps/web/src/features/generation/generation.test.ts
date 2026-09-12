import type { Generation, Job } from '@level-zero/domain';
import { describe, expect, it } from 'vitest';

import {
  buildGenerationRequest,
  canStart,
  failureText,
  generationProgress,
  generationTone,
  isGenerationRunning,
  isImageGeneration,
  modeNeedsSource,
  progressLabel,
  MODE_CAPABILITY,
} from './generation';

function generation(overrides: Partial<Generation> = {}): Generation {
  return {
    id: 'gen_1',
    projectId: 'prj_1',
    capability: 'image.generate',
    provider: 'local-image',
    model: 'local-plate-1',
    prompt: 'a drowned cathedral',
    parameters: {},
    status: 'complete',
    inputEntityIds: [],
    inputAssetIds: [],
    contextEntityIds: [],
    resolvedContext: null,
    outputAssetIds: ['asset_1'],
    parentGenerationId: null,
    seed: null,
    providerRequestId: null,
    failure: null,
    attempts: [],
    createdAt: new Date('2026-09-01T10:00:00Z'),
    startedAt: null,
    completedAt: null,
    createdBy: null,
    ...overrides,
  };
}

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job_1',
    projectId: 'prj_1',
    kind: 'generation',
    targetId: 'gen_1',
    status: 'running',
    progress: { completed: 1, total: 3, step: 'Generating' },
    attempt: 1,
    maxAttempts: 3,
    failure: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

describe('modes and capabilities', () => {
  it('asks for a different capability per mode', () => {
    expect(MODE_CAPABILITY.generate).toBe('image.generate');
    expect(MODE_CAPABILITY.edit).toBe('image.edit');
    expect(MODE_CAPABILITY.variation).toBe('image.variation');
  });

  it('needs a source image for everything but a plain generation', () => {
    expect(modeNeedsSource('generate')).toBe(false);
    expect(modeNeedsSource('edit')).toBe(true);
    expect(modeNeedsSource('variation')).toBe(true);
  });

  it('recognises this surface’s own generations and nothing else', () => {
    expect(isImageGeneration(generation({ capability: 'image.variation' }))).toBe(true);
    expect(isImageGeneration(generation({ capability: 'text.rewrite' }))).toBe(false);
  });
});

describe('canStart', () => {
  it('needs a prompt', () => {
    expect(canStart('generate', '   ', [])).toBe(false);
    expect(canStart('generate', 'a drowned cathedral', [])).toBe(true);
  });

  it('needs a source for an edit or a variation', () => {
    expect(canStart('edit', 'warmer light', [])).toBe(false);
    expect(canStart('edit', 'warmer light', ['asset_1'])).toBe(true);
  });
});

describe('buildGenerationRequest', () => {
  it('sends the selection and the references as context for the API to resolve', () => {
    const request = buildGenerationRequest({
      mode: 'variation',
      prompt: '  warmer light  ',
      contextEntityIds: ['ent_kael'],
      sourceAssetIds: ['asset_1'],
      parentGenerationId: 'gen_0',
    });

    expect(request).toEqual({
      capability: 'image.variation',
      prompt: 'warmer light',
      context: { selectedEntityIds: ['ent_kael'], assetIds: ['asset_1'] },
      parentGenerationId: 'gen_0',
    });
  });

  it('leaves out an empty context rather than sending empty lists', () => {
    const request = buildGenerationRequest({ mode: 'generate', prompt: 'a diver' });

    expect(request.context).toEqual({});
    expect(request.parentGenerationId).toBeUndefined();
  });
});

describe('progress', () => {
  it('names the step the worker last reported', () => {
    expect(generationProgress(job())).toEqual({ step: 'Generating', completed: 1, total: 3 });
    expect(progressLabel(generationProgress(job()))).toBe('Generating — 1 of 3 complete');
  });

  it('says queued before a worker has picked the job up', () => {
    expect(generationProgress(null)).toEqual({ step: 'Queued', completed: 0, total: 3 });
  });
});

describe('status', () => {
  it('is running while the generation may still change', () => {
    expect(isGenerationRunning(generation({ status: 'queued' }))).toBe(true);
    expect(isGenerationRunning(generation({ status: 'running' }))).toBe(true);
    expect(isGenerationRunning(generation({ status: 'complete' }))).toBe(false);
    expect(isGenerationRunning(generation({ status: 'failed' }))).toBe(false);
  });

  it('maps each status onto a tone the badge has', () => {
    expect(generationTone(generation({ status: 'complete' }))).toBe('success');
    expect(generationTone(generation({ status: 'failed' }))).toBe('error');
    expect(generationTone(generation({ status: 'cancelled' }))).toBe('warning');
    expect(generationTone(generation({ status: 'running' }))).toBe('neutral');
  });
});

describe('failureText', () => {
  it('keeps the provider code alongside the message', () => {
    const failed = generation({
      status: 'failed',
      failure: { code: 'content_filtered', message: 'The model declined', details: {} },
    });

    expect(failureText(failed)).toBe('The model declined (content_filtered)');
  });

  it('is null for a generation that did not fail', () => {
    expect(failureText(generation())).toBeNull();
  });
});
