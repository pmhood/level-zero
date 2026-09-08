import { type AiCapability } from './capabilities';
import { BaseAiProvider, type AiRequest, type AiResult } from './provider';

/**
 * Development/test provider that echoes its prompt back.
 *
 * It exists so the orchestration contracts can be exercised end to end before
 * any real vendor adapter lands in issue #8.
 */
export class EchoAiProvider extends BaseAiProvider {
  readonly id: string;
  readonly capabilities: readonly AiCapability[];

  constructor(capabilities: readonly AiCapability[] = ['text.generate'], id = 'echo') {
    super();
    this.id = id;
    this.capabilities = capabilities;
  }

  async execute(request: AiRequest): Promise<AiResult> {
    return {
      capability: request.capability,
      providerId: this.id,
      model: 'echo-1',
      output: request.prompt,
      data: { parameters: request.parameters ?? {} },
    };
  }
}
