import { AiProviderRegistry, AnthropicProvider, EchoAiProvider } from '@level-zero/ai';
import { type ApiEnv } from '@level-zero/config';
import { Global, Module } from '@nestjs/common';

import { API_ENV } from '../config/config.module';

export const AI_PROVIDERS = Symbol('AI_PROVIDERS');

/**
 * Registers the text providers the API answers inline requests with.
 *
 * Long-running generations still belong to the worker; what runs here is the
 * short, request-shaped work a writer is waiting on — an editor rewrite the
 * suggestion card is holding a spinner for. Both processes resolve providers
 * through the same registry, so a feature asks for a capability and never for
 * a vendor.
 *
 * Registration order is preference order, and a failing provider falls through
 * to the next candidate for the same capability.
 */
@Global()
@Module({
  providers: [
    {
      provide: AI_PROVIDERS,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): AiProviderRegistry =>
        new AiProviderRegistry().register(
          env.ANTHROPIC_API_KEY
            ? new AnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY })
            : // Nothing hosted is configured: local development still runs end
              // to end, echoing the prompt back as the suggestion.
              new EchoAiProvider(['text.generate', 'text.rewrite']),
        ),
    },
  ],
  exports: [AI_PROVIDERS],
})
export class AiModule {}
