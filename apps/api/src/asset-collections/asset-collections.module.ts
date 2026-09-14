import { Module } from '@nestjs/common';

import { AssetCollectionsController } from './asset-collections.controller';

@Module({ controllers: [AssetCollectionsController] })
export class AssetCollectionsModule {}
