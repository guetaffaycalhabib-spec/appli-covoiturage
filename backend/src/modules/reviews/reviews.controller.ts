import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/decorators';
import { CreateReviewDto, ReviewsService } from './reviews.service';

@ApiTags('Avis')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Post('bookings/:bookingId/reviews')
  create(@CurrentUser() user: AuthUser, @Param('bookingId', ParseUUIDPipe) bookingId: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user.id, bookingId, dto);
  }

  @Get('users/:id/reviews')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviews.listForUser(id);
  }
}
