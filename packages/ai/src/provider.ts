import { type AiCapability } from './capabilities';

export interface AiRequest {
  capability: AiCapability;
  prompt: string;
  /** Provider-agnostic knobs; adapters translate these to their own shapes. */
  parameters?: Record<string, unknown>;
  /**
   * Resolved project context (entities, assets, documents). Issue #8 replaces
   * this with the output of the ContextResolver.
   */
  context?: Record<string, unknown>;
}

export interface AiResult {
  capability: AiCapability;
  providerId: string;
  model: string;
  /** The provider's own identifier for the request, for support and audit. */
  requestId?: string;
  /** Text output, when the capability produces text. */
  output?: string;
  /** Free-form provider payload (image handles, tool calls, usage, ...). */
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
