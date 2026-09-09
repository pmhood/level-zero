import { type ApiEnv } from '@level-zero/config';
import { type ObjectStorageProvider } from '@level-zero/domain';
import { LocalObjectStorageProvider } from '@level-zero/storage';
import { Global, Module } from '@nestjs/common';

import { API_ENV } from '../config/config.module';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/**
 * Registers the active `ObjectStorageProvider`.
 *
 * Local disk today; a production deployment swaps this factory for an S3/R2
 * provider without touching `AssetService` or any controller.
 */
@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [API_ENV],
      useFactory: (env: ApiEnv): ObjectStorageProvider =>
        new LocalObjectStorageProvider({ rootDir: env.STORAGE_LOCAL_ROOT }),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
