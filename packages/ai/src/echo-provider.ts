import { type AiCapability } from './capabilities';
import { BaseAiProvider, type AiRequest, type AiResult } from './provider';

/**
 * Development/test provider that echoes its prompt back.
 *
 * The worker registers it only when no hosted text provider is configured, so
 * the whole path — capability, context, job, asset, lineage — still runs on a
 * machine with no credentials.
 */
export class EchoAiProvider extends BaseAiProvider {
  readonly id: string;
  readonly capabilities: readonly AiCapability[];
  readonly defaultModel = 'echo-1';

  constructor(capabilities: readonly AiCapability[] = ['text.generate'], id = 'echo') {
    super();
    this.id = id;
    this.capabilities = capabilities;
  }

  async execute(request: AiRequest): Promise<AiResult> {
    return {
      capability: request.capability,
      providerId: this.id,
      model: this.defaultModel,
      output: request.prompt,
      data: { parameters: request.parameters ?? {} },
    };
  }
}
