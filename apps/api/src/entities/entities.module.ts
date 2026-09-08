import { Module } from '@nestjs/common';

import { EntitiesController } from './entities.controller';

@Module({ controllers: [EntitiesController] })
export class EntitiesModule {}
