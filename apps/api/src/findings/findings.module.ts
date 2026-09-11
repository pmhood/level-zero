import { Module } from '@nestjs/common';

import { FindingsController } from './findings.controller';

@Module({ controllers: [FindingsController] })
export class FindingsModule {}
