import { Module } from '@nestjs/common';

import { MoodboardsController } from './moodboards.controller';

@Module({ controllers: [MoodboardsController] })
export class MoodboardsModule {}
