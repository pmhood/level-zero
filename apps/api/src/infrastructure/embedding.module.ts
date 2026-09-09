import { LocalEmbeddingProvider } from '@level-zero/ai';
import { type EmbeddingProvider } from '@level-zero/domain';
import { Global, Module } from '@nestjs/common';

export const EMBEDDING_PROVIDER = Symbol('EMBEDDING_PROVIDER');

/**
 * Registers the active `EmbeddingProvider`, the way `StorageModule` registers
 * object storage.
 *
 * The local hashing model today, so semantic retrieval runs with no
 * credentials; a hosted one is a different factory here and nothing else. It
 * has to be the *same* provider the worker uses, or the vectors it writes and
 * the vectors a query is compared against would be from different spaces.
 */
@Global()
@Module({
  providers: [
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (): EmbeddingProvider => new LocalEmbeddingProvider(),
    },
  ],
  exports: [EMBEDDING_PROVIDER],
})
export class EmbeddingModule {}
