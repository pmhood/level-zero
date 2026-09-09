import { Module } from '@nestjs/common';

import { PrototypesController } from './prototypes.controller';

@Module({ controllers: [PrototypesController] })
export class PrototypesModule {}
