import { Module } from '@nestjs/common';

import { GenerationsController } from './generations.controller';

@Module({ controllers: [GenerationsController] })
export class GenerationsModule {}
