import { describe, expect, it } from 'vitest';

import { fixedClock } from '../shared/clock';
import { ConflictError, ValidationError } from '../shared/errors';
import { sequentialIdGenerator } from '../shared/id';
import {
  cancelGeneration,
  completeGeneration,
  createGeneration,
  dispatchGeneration,
  failGeneration,
  redispatchGeneration,
  type CreateGenerationInput,
  type Generation,
} from './generation';

const clock = fixedClock('2026-03-01T09:00:00.000Z');
const laterClock = fixedClock('2026-03-01T09:05:00.000Z');
const deps = { clock, ids: sequentialIdGenerator('gen') };

const input = (overrides: Partial<CreateGenerationInput> = {}): CreateGenerationInput => ({
  projectId: 'project-1',
  capability: 'image.generate',
  prompt: 'a drowned cathedral lit from below',
  ...overrides,
});

const queued = (overrides: Partial<CreateGenerationInput> = {}): Generation =>
  createGeneration(input(overrides), { clock, ids: sequentialIdGenerator('gen') });

const running = (overrides: Partial<CreateGenerationInput> = {}): Generation =>
  dispatchGeneration(queued(overrides), { provider: 'echo', model: 'echo-1' }, { clock });

describe('createGeneration', () => {
  it('records the request and starts queued, before any provider is known', () => {
    const generation = createGeneration(
      input({
        parameters: { aspectRatio: '16:9' },
        inputEntityIds: ['entity-1'],
        inputAssetIds: ['asset-1'],
        contextEntityIds: ['entity-2'],
        seed: '42',
        createdBy: 'pete',
      }),
      deps,
    );

    expect(generation).toMatchObject({
      projectId: 'project-1',
      capability: 'image.generate',
      prompt: 'a drowned cathedral lit from below',
      parameters: { aspectRatio: '16:9' },
      status: 'queued',
      provider: null,
      model: null,
      inputEntityIds: ['entity-1'],
      inputAssetIds: ['asset-1'],
      contextEntityIds: ['entity-2'],
      outputAssetIds: [],
      parentGenerationId: null,
      seed: '42',
      failure: null,
      startedAt: null,
      completedAt: null,
      createdBy: 'pete',
    });
  });

  it('de-duplicates recorded ids while keeping the order they were given in', () => {
    const generation = queued({ contextEntityIds: ['entity-2', 'entity-1', 'entity-2'] });

    expect(generation.contextEntityIds).toEqual(['entity-2', 'entity-1']);
  });

  it('rejects an empty prompt', () => {
    expect(() => createGeneration(input({ prompt: '   ' }), deps)).toThrow(ValidationError);
  });
});

describe('dispatchGeneration', () => {
  it('records the provider and model actually doing the work', () => {
    const generation = dispatchGeneration(
      queued(),
      { provider: 'openai', model: 'gpt-image-1', providerRequestId: 'req-9' },
      { clock },
    );

    expect(generation).toMatchObject({
      status: 'running',
      provider: 'openai',
      model: 'gpt-image-1',
      providerRequestId: 'req-9',
    });
    expect(generation.startedAt).toEqual(clock.now());
  });

  it('refuses to dispatch a generation twice', () => {
    expect(() =>
      dispatchGeneration(running(), { provider: 'echo', model: 'echo-1' }, { clock }),
    ).toThrow(ConflictError);
  });
});

describe('redispatchGeneration', () => {
  it('corrects the provider and model without touching status or startedAt', () => {
    const dispatched = running();

    const generation = redispatchGeneration(dispatched, { provider: 'openai', model: 'gpt-image-1' });

    expect(generation).toMatchObject({
      status: 'running',
      provider: 'openai',
      model: 'gpt-image-1',
    });
    expect(generation.startedAt).toEqual(dispatched.startedAt);
  });

  it('refuses to redispatch a generation that was never dispatched', () => {
    expect(() => redispatchGeneration(queued(), { provider: 'openai', model: 'gpt-image-1' })).toThrow(
      ConflictError,
    );
  });
});

describe('completeGeneration', () => {
  it('attaches the output assets and the identifiers the provider reported', () => {
    const generation = completeGeneration(
      running(),
      { outputAssetIds: ['asset-out'], seed: '7', providerRequestId: 'req-9' },
      { clock: laterClock },
    );

    expect(generation).toMatchObject({
      status: 'complete',
      outputAssetIds: ['asset-out'],
      seed: '7',
      providerRequestId: 'req-9',
    });
    expect(generation.completedAt).toEqual(laterClock.now());
  });

  it('keeps the seed the caller asked for when the provider reports none', () => {
    const generation = completeGeneration(
      running({ seed: '42' }),
      { outputAssetIds: [] },
      { clock: laterClock },
    );

    expect(generation.seed).toBe('42');
  });

  it('refuses to complete a generation that was never dispatched', () => {
    expect(() => completeGeneration(queued(), { outputAssetIds: [] }, { clock })).toThrow(
      ConflictError,
    );
  });
});

describe('failGeneration', () => {
  it('records diagnostics without losing the original request', () => {
    const original = running({ parameters: { steps: 30 } });

    const failed = failGeneration(
      original,
      { code: 'content_filtered', message: 'Prompt was rejected', details: { httpStatus: 400 } },
      { clock: laterClock },
    );

    expect(failed).toMatchObject({
      status: 'failed',
      prompt: original.prompt,
      parameters: { steps: 30 },
      provider: 'echo',
      model: 'echo-1',
      failure: {
        code: 'content_filtered',
        message: 'Prompt was rejected',
        details: { httpStatus: 400 },
      },
    });
    expect(failed.completedAt).toEqual(laterClock.now());
  });

  it('fails a generation that never made it out of the queue', () => {
    const failed = failGeneration(queued(), { message: 'No provider available' }, { clock });

    expect(failed).toMatchObject({ status: 'failed', failure: { code: 'provider_error' } });
  });

  it('refuses to reopen a finished generation', () => {
    const complete = completeGeneration(running(), { outputAssetIds: [] }, { clock });

    expect(() => failGeneration(complete, { message: 'too late' }, { clock })).toThrow(
      ConflictError,
    );
  });
});

describe('cancelGeneration', () => {
  it('closes a queued generation without recording a failure', () => {
    const cancelled = cancelGeneration(queued(), { clock: laterClock });

    expect(cancelled).toMatchObject({ status: 'cancelled', failure: null });
    expect(cancelled.completedAt).toEqual(laterClock.now());
  });

  it('refuses to cancel a generation that already failed', () => {
    const failed = failGeneration(running(), { message: 'timeout' }, { clock });

    expect(() => cancelGeneration(failed, { clock })).toThrow(ConflictError);
  });
});
