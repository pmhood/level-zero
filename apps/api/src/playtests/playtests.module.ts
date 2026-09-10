import { Module } from '@nestjs/common';

import { PlaytestsController } from './playtests.controller';

@Module({ controllers: [PlaytestsController] })
export class PlaytestsModule {}
