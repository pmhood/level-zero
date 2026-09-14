import type { AiCapability } from '@level-zero/ai';
import { GENERATION_JOB_STEPS, type Generation, type Job } from '@level-zero/domain';
import type { StatusTone } from '@level-zero/ui';

import type { CreateGenerationInput } from '@/lib/api';

/**
 * What the user is asking for, in the words the surface uses.
 *
 * Three modes rather than one per named action: "Outfit Variants" and
 * "Expression Sheet" are both a variation of an image with a different
 * instruction, and the capability is what actually changes between them.
 */
export const GENERATION_MODES = ['generate', 'edit', 'variation'] as const;
export type GenerationMode = (typeof GENERATION_MODES)[number];

/** The AI capability each mode asks the API for. */
export const MODE_CAPABILITY = {
  generate: 'image.generate',
  edit: 'image.edit',
  variation: 'image.variation',
} as const satisfies Record<GenerationMode, AiCapability>;

export const MODE_LABEL: Record<GenerationMode, string> = {
  generate: 'Generate',
  edit: 'Edit',
  variation: 'Variations',
};

/** What the prompt box asks for, which is not the same question in every mode. */
export const MODE_PROMPT_LABEL: Record<GenerationMode, string> = {
  generate: 'Describe the image to generate',
  edit: 'Describe the change to make',
  variation: 'Describe the direction to explore',
};

/** Every capability this surface produces, for narrowing a project's generations to its own. */
export const IMAGE_CAPABILITIES = Object.values(MODE_CAPABILITY);

/**
 * Modes that work *from* an existing image.
 *
 * An edit takes exactly one source — the image being changed. A variation
 * takes at least one, because exploring a direction from several plates at
 * once is the point of the moodboard flow.
 */
export function modeNeedsSource(mode: GenerationMode): boolean {
  return mode !== 'generate';
}

/** Whether a request is complete enough to send. */
export function canStart(
  mode: GenerationMode,
  prompt: string,
  sourceAssetIds: readonly string[],
): boolean {
  if (prompt.trim().length === 0) return false;
  return !modeNeedsSource(mode) || sourceAssetIds.length > 0;
}

export function isImageGeneration(generation: Generation): boolean {
  return (IMAGE_CAPABILITIES as readonly string[]).includes(generation.capability);
}

/** True while the generation may still change — the states worth watching. */
export function isGenerationRunning(generation: Generation): boolean {
  return generation.status === 'queued' || generation.status === 'running';
}

/** How often the Generation Queue panel (#180) polls while it has running work. */
export const QUEUE_POLL_INTERVAL_MS = 4_000;

/**
 * `useQuery`'s `refetchInterval`, kept as a plain function so the poll/stop
 * decision is testable without a clock: poll for as long as anything queued
 * or running is in view, stop the moment nothing is. There is no websocket or
 * SSE layer behind the queue panel — this fixed interval is the whole
 * mechanism (#180's settled scope).
 */
export function queuePollInterval(items: readonly Generation[] | undefined): number | false {
  return (items ?? []).some(isGenerationRunning) ? QUEUE_POLL_INTERVAL_MS : false;
}

export interface BuildGenerationRequest {
  mode: GenerationMode;
  prompt: string;
  /** Entities the user had selected: the character being drawn, the location. */
  contextEntityIds?: readonly string[];
  /** Reference images: the asset being edited, or the plates to take after. */
  sourceAssetIds?: readonly string[];
  /** The generation this one re-rolls, when exploring from a previous result. */
  parentGenerationId?: string;
}

/**
 * The request body for one ask.
 *
 * Everything is sent as `context` rather than as resolved id lists, so the API
 * assembles the project material and stores the snapshot that explains *why*
 * each object was included. The ids end up on the record either way.
 */
export function buildGenerationRequest(input: BuildGenerationRequest): CreateGenerationInput {
  const selectedEntityIds = [...(input.contextEntityIds ?? [])];
  const assetIds = [...(input.sourceAssetIds ?? [])];

  return {
    capability: MODE_CAPABILITY[input.mode],
    prompt: input.prompt.trim(),
    context: {
      ...(selectedEntityIds.length > 0 ? { selectedEntityIds } : {}),
      ...(assetIds.length > 0 ? { assetIds } : {}),
    },
    ...(input.parentGenerationId ? { parentGenerationId: input.parentGenerationId } : {}),
  };
}

/** Explicit progress, so the surface can name the step instead of spinning. */
export interface GenerationProgress {
  /** What the worker is doing right now, shown verbatim. */
  step: string;
  completed: number;
  total: number;
}

/**
 * How far a generation has got.
 *
 * The job record carries the progress, so a browser that just reloaded reads
 * the same numbers the worker last wrote. Before a worker has picked the job
 * up there is no step yet, and "Queued" is the honest thing to say.
 */
export function generationProgress(job: Job | null): GenerationProgress {
  return {
    step: job?.progress.step ?? 'Queued',
    completed: job?.progress.completed ?? 0,
    total: job?.progress.total ?? GENERATION_JOB_STEPS.length,
  };
}

export function progressLabel(progress: GenerationProgress): string {
  return `${progress.step} — ${progress.completed} of ${progress.total} complete`;
}

/** Maps a generation's status onto the four tones the badge has. */
export function generationTone(generation: Generation): StatusTone {
  switch (generation.status) {
    case 'complete':
      return 'success';
    case 'failed':
      return 'error';
    case 'cancelled':
      return 'warning';
    default:
      return 'neutral';
  }
}

/**
 * What went wrong, for a failed generation.
 *
 * The code is included because it is the part that stays stable across
 * providers — `content_filtered` is a different conversation from
 * `provider_error`, however the message is worded.
 */
export function failureText(generation: Generation): string | null {
  const { failure } = generation;
  return failure ? `${failure.message} (${failure.code})` : null;
}

/** How a generation describes itself in a provenance line. */
export function generationSummary(generation: Generation): string {
  const producer = generation.model ?? generation.provider ?? 'pending';
  return `${generation.capability} · ${producer}`;
}

/** `image.generate` as "Image · Generate" — a queue row names what is being made, not the wire format. */
export function capabilityLabel(capability: string): string {
  return capability
    .split('.')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' · ');
}

/**
 * "How long it has been going" (#180), read off the record rather than a
 * ticking clock: `startedAt` once a worker has picked the job up, `createdAt`
 * while it is still queued.
 */
export function elapsedSince(generation: Generation): Date {
  return generation.startedAt ?? generation.createdAt;
}

const ELAPSED_UNITS: readonly [string, number][] = [
  ['d', 60 * 60 * 24],
  ['h', 60 * 60],
  ['m', 60],
];

/** "2m", "12m", "18m" — the mockup's elapsed-time format, coarse to the minute past a minute. */
export function elapsedLabel(since: Date, now: Date = new Date()): string {
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 1000));

  for (const [unit, unitSeconds] of ELAPSED_UNITS) {
    if (totalSeconds >= unitSeconds) {
      return `${Math.floor(totalSeconds / unitSeconds)}${unit}`;
    }
  }
  return `${totalSeconds}s`;
}
