import { Module } from '@nestjs/common';

import { AssetMarksController } from './asset-marks.controller';
import { AssetSelectionsController } from './asset-selections.controller';

@Module({ controllers: [AssetMarksController, AssetSelectionsController] })
export class SelectionsModule {}
