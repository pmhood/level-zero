import { type Clock } from '../shared/clock';
import { ConflictError } from '../shared/errors';
import { type IdGenerator } from '../shared/id';
import { optionalText, requireJsonObject, requireText } from '../shared/validation';

/**
 * Where a generation is in its life.
 *
 * A record is written *before* provider work is dispatched, so `queued` is the
 * state every generation starts in. `complete`, `failed` and `cancelled` are
 * terminal: nothing moves out of them, and the request that produced them is
 * never overwritten.
 */
export const GENERATION_STATUSES = [
  'queued',
  'running',
  'complete',
  'failed',
  'cancelled',
] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const MAX_GENERATION_CAPABILITY_LENGTH = 100;
export const MAX_GENERATION_PROMPT_LENGTH = 20000;
export const MAX_GENERATION_PROVIDER_LENGTH = 100;
export const MAX_GENERATION_MODEL_LENGTH = 200;
export const MAX_GENERATION_SEED_LENGTH = 200;
export const MAX_GENERATION_REQUEST_ID_LENGTH = 200;
export const MAX_GENERATION_CREATED_BY_LENGTH = 200;
export const MAX_GENERATION_FAILURE_MESSAGE_LENGTH = 2000;

export const DEFAULT_GENERATION_FAILURE_CODE = 'provider_error';

/** Why a generation failed, kept alongside the request rather than instead of it. */
export interface GenerationFailure {
  /** Stable discriminator: `provider_error`, `timeout`, `content_filtered`, ... */
  code: string;
  message: string;
  /** Provider diagnostics: status codes, raw payloads, retry hints. */
  details: Record<string, unknown>;
}

/**
 * One AI generation and everything needed to explain it afterwards.
 *
 * A generation is not an entity and not an asset: it is the record of an act.
 * Its outputs are ordinary `Asset` rows, so a generated image is reusable
 * everywhere a file is, and this row is what says which provider, model,
 * prompt, parameters and project context produced it.
 *
 * The id lists are recorded rather than resolved. Creative lineage *between
 * entities* stays in `EntityRelationship` (`generated_from`), which
 * `GenerationService` writes on completion — this row never becomes a second,
 * parallel graph.
 */
export interface Generation {
  id: string;
  projectId: string;
  /** The AI capability requested, e.g. `image.generate`. */
  capability: string;
  /** Null until the generation is dispatched to a provider. */
  provider: string | null;
  model: string | null;
  prompt: string;
  /** Provider-agnostic knobs exactly as requested. */
  parameters: Record<string, unknown>;
  status: GenerationStatus;
  /** Entities the caller fed in deliberately. */
  inputEntityIds: string[];
  inputAssetIds: string[];
  /** Entities pulled in as ambient project context, not named by the caller. */
  contextEntityIds: string[];
  /**
   * The assembled project context exactly as it was sent, so provenance can say
   * *why* each object was included and not only that it was. Written by
   * `@level-zero/ai`'s `ContextResolver`; opaque JSON here, because the domain
   * does not depend on the provider layer.
   */
  resolvedContext: Record<string, unknown> | null;
  outputAssetIds: string[];
  /** The generation this one refines or re-rolls. */
  parentGenerationId: string | null;
  seed: string | null;
  /** The provider's own identifier for the request, for support and audit. */
  providerRequestId: string | null;
  failure: GenerationFailure | null;
  createdAt: Date;
  startedAt: Date | null;
  /** Set once the generation reaches any terminal status, not only success. */
  completedAt: Date | null;
  /** Free text until authentication lands; then a user id. */
  createdBy: string | null;
}

export interface CreateGenerationInput {
  projectId: string;
  capability: string;
  prompt: string;
  parameters?: Record<string, unknown>;
  inputEntityIds?: readonly string[];
  inputAssetIds?: readonly string[];
  contextEntityIds?: readonly string[];
  resolvedContext?: Record<string, unknown> | null;
  parentGenerationId?: string | null;
  seed?: string | null;
  createdBy?: string | null;
}

export interface GenerationFactoryDeps {
  clock: Clock;
  ids: IdGenerator;
}

export function createGeneration(
  input: CreateGenerationInput,
  deps: GenerationFactoryDeps,
): Generation {
  return {
    id: deps.ids.next(),
    projectId: requireText('projectId', input.projectId, 200),
    capability: requireText('capability', input.capability, MAX_GENERATION_CAPABILITY_LENGTH),
    provider: null,
    model: null,
    prompt: requireText('prompt', input.prompt, MAX_GENERATION_PROMPT_LENGTH),
    parameters: requireJsonObject('parameters', input.parameters),
    status: 'queued',
    inputEntityIds: normalizeIds('inputEntityIds', input.inputEntityIds),
    inputAssetIds: normalizeIds('inputAssetIds', input.inputAssetIds),
    contextEntityIds: normalizeIds('contextEntityIds', input.contextEntityIds),
    resolvedContext:
      input.resolvedContext == null
        ? null
        : requireJsonObject('resolvedContext', input.resolvedContext),
    outputAssetIds: [],
    parentGenerationId: optionalText('parentGenerationId', input.parentGenerationId, 200),
    seed: optionalText('seed', input.seed, MAX_GENERATION_SEED_LENGTH),
    providerRequestId: null,
    failure: null,
    createdAt: deps.clock.now(),
    startedAt: null,
    completedAt: null,
    createdBy: optionalText('createdBy', input.createdBy, MAX_GENERATION_CREATED_BY_LENGTH),
  };
}

export interface DispatchGenerationInput {
  provider: string;
  model: string;
  providerRequestId?: string | null;
}

/** Records that provider work has actually started, and who is doing it. */
export function dispatchGeneration(
  generation: Generation,
  input: DispatchGenerationInput,
  deps: { clock: Clock },
): Generation {
  requireStatus(generation, ['queued'], 'dispatched');

  return {
    ...generation,
    status: 'running',
    provider: requireText('provider', input.provider, MAX_GENERATION_PROVIDER_LENGTH),
    model: requireText('model', input.model, MAX_GENERATION_MODEL_LENGTH),
    providerRequestId: mergeProviderRequestId(generation, input.providerRequestId),
    startedAt: deps.clock.now(),
  };
}

export interface CompleteGenerationInput {
  /** Assets the provider output, already uploaded through `AssetService`. */
  outputAssetIds: readonly string[];
  seed?: string | null;
  providerRequestId?: string | null;
}

export function completeGeneration(
  generation: Generation,
  input: CompleteGenerationInput,
  deps: { clock: Clock },
): Generation {
  requireStatus(generation, ['running'], 'completed');

  return {
    ...generation,
    status: 'complete',
    outputAssetIds: normalizeIds('outputAssetIds', input.outputAssetIds),
    seed: optionalText('seed', input.seed, MAX_GENERATION_SEED_LENGTH) ?? generation.seed,
    providerRequestId: mergeProviderRequestId(generation, input.providerRequestId),
    completedAt: deps.clock.now(),
  };
}

export interface FailGenerationInput {
  code?: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Records a failure without touching the prompt, parameters or inputs, so a
 * failed generation can still be read, explained and retried.
 */
export function failGeneration(
  generation: Generation,
  input: FailGenerationInput,
  deps: { clock: Clock },
): Generation {
  requireStatus(generation, ['queued', 'running'], 'failed');

  return {
    ...generation,
    status: 'failed',
    failure: {
      code: requireText('failure.code', input.code ?? DEFAULT_GENERATION_FAILURE_CODE, 100),
      message: requireText('failure.message', input.message, MAX_GENERATION_FAILURE_MESSAGE_LENGTH),
      details: requireJsonObject('failure.details', input.details),
    },
    completedAt: deps.clock.now(),
  };
}

export function cancelGeneration(generation: Generation, deps: { clock: Clock }): Generation {
  requireStatus(generation, ['queued', 'running'], 'cancelled');

  return { ...generation, status: 'cancelled', completedAt: deps.clock.now() };
}

/** Keeps the identifier already recorded unless the provider reported a new one. */
function mergeProviderRequestId(
  generation: Generation,
  incoming: string | null | undefined,
): string | null {
  return (
    optionalText('providerRequestId', incoming, MAX_GENERATION_REQUEST_ID_LENGTH) ??
    generation.providerRequestId
  );
}

/** Trims, drops empties and de-duplicates an id list while keeping its order. */
function normalizeIds(field: string, value: readonly string[] | undefined): string[] {
  if (value === undefined || value === null) return [];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const raw of value) {
    const id = requireText(field, raw, 200);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function requireStatus(
  generation: Generation,
  allowed: readonly GenerationStatus[],
  action: string,
): void {
  if (allowed.includes(generation.status)) return;

  throw new ConflictError(`A "${generation.status}" generation cannot be ${action}`, {
    generationId: generation.id,
    status: generation.status,
    expected: allowed,
  });
}
