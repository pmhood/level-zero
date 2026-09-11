import { Module } from '@nestjs/common';

import { CommentsController } from './comments.controller';
import { ReviewsController } from './reviews.controller';

@Module({ controllers: [CommentsController, ReviewsController] })
export class ReviewsModule {}
