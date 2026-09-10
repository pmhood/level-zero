import { type AssetKind } from '@level-zero/domain';

import { type AiCapability } from './capabilities';
import { type ResolvedContext } from './context';

/**
 * A reference image the request is built on: the asset being edited, or the
 * plates a new image should take after.
 *
 * `ResolvedContext` already *names* the reference assets, because that is what
 * gets stored on the generation record as provenance. This carries the bytes,
 * which is what an image model actually needs and what a JSON snapshot can
 * never hold — so the two are separate rather than one field doing both jobs.
 */
export interface AiReferenceImage {
  assetId: string;
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface AiRequest {
  capability: AiCapability;
  prompt: string;
  /** Provider-agnostic knobs; adapters translate these to their own shapes. */
  parameters?: Record<string, unknown>;
  /** The project material behind the request, assembled by `ContextResolver`. */
  context?: ResolvedContext;
  /** Bytes of the images the request works from, in the order they were named. */
  references?: readonly AiReferenceImage[];
}

/**
 * A file a provider produced.
 *
 * Bytes, not a provider URL: the caller stores them through `AssetService`, so
 * a generated image becomes an ordinary project asset that outlives whatever
 * link the vendor handed out.
 */
export interface AiArtifact {
  kind: AssetKind;
  filename: string;
  mimeType: string;
  content: Buffer;
  width?: number | null;
  height?: number | null;
}

export interface AiResult {
  capability: AiCapability;
  providerId: string;
  model: string;
  /** The provider's own identifier for the request, for support and audit. */
  requestId?: string;
  /** Text output, when the capability produces text. */
  output?: string;
  /** Files the provider produced, when the capability produces files. */
  artifacts?: AiArtifact[];
  /** Free-form provider payload (tool calls, usage, safety verdicts, ...). */
  data?: Record<string, unknown>;
}

/** One vendor adapter. Implementations live next to their SDK, nowhere else. */
export interface AiProvider {
  readonly id: string;
  readonly capabilities: readonly AiCapability[];
  /** Used when the request does not name a model of its own. */
  readonly defaultModel: string;
  supports(capability: AiCapability): boolean;
  execute(request: AiRequest): Promise<AiResult>;
}

/** Convenience base that derives `supports` from a capability list. */
export abstract class BaseAiProvider implements AiProvider {
  abstract readonly id: string;
  abstract readonly capabilities: readonly AiCapability[];
  abstract readonly defaultModel: string;

  supports(capability: AiCapability): boolean {
    return this.capabilities.includes(capability);
  }

  abstract execute(request: AiRequest): Promise<AiResult>;
}
