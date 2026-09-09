import { Module } from '@nestjs/common';

import { ActivityController } from './activity.controller';

@Module({ controllers: [ActivityController] })
export class ActivityModule {}
