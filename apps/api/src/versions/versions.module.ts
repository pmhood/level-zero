import { Module } from '@nestjs/common';

import { VersionsController } from './versions.controller';

@Module({ controllers: [VersionsController] })
export class VersionsModule {}
