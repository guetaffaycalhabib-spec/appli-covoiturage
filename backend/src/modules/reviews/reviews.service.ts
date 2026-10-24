import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { DataSource, Repository } from 'typeorm';
import { DomainError, notFound } from '../../common/errors';
import { filterInsults, maskContactDetails } from '../../common/utils/text-masking';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Booking, BookingStatus } from '../trips/trip.entities';
import { User } from '../users/user.entities';
import { REVIEW_TAGS, Review } from './review.entity';

export class CreateReviewDto {
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsArray() @IsIn(REVIEW_TAGS, { each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly dataSource: DataSource,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /** Notation réciproque après le trajet (P-42) : le passager note le conducteur et inversement. */
  async create(authorId: string, bookingId: string, dto: CreateReviewDto): Promise<Review> {
    const booking = await this.bookings.findOneBy({ id: bookingId });
    if (!booking || (booking.passengerId !== authorId && booking.driverId !== authorId)) throw notFound('Booking');
    if (booking.status !== BookingStatus.COMPLETED) {
      throw new DomainError('BOOKING_NOT_COMPLETED', 'Vous pourrez noter après le trajet', HttpStatus.CONFLICT);
    }
    const targetId = authorId === booking.passengerId ? booking.driverId : booking.passengerId;
    const comment = dto.comment ? maskContactDetails(filterInsults(dto.comment.trim()).text).text : null;
    const review = await this.dataSource.transaction(async (m) => {
      const exists = await m.exists(Review, { where: { bookingId, authorId } });
      if (exists) throw new DomainError('ALREADY_REVIEWED', 'Vous avez déjà noté ce trajet', HttpStatus.CONFLICT);
      const review = await m.save(
        m.create(Review, { bookingId, tripId: booking.tripId, authorId, targetId, rating: dto.rating, tags: dto.tags ?? [], comment }),
      );
      await this.recomputeRating(m.getRepository(Review), m.getRepository(User), targetId);
      return review;
    });
    await this.notifications.notify(targetId, 'review.received', { reviewId: review.id, rating: review.rating });
    return review;
  }

  listForUser(targetId: string): Promise<Review[]> {
    return this.reviews.find({ where: { targetId, hidden: false }, order: { createdAt: 'DESC' }, take: 50 });
  }

  /** Modération (8.3) : masquer ou rétablir un avis, puis recalculer la note. */
  async setHidden(id: string, hidden: boolean, actorId: string, reason: string, ip?: string): Promise<Review> {
    return this.dataSource.transaction(async (m) => {
      const review = await m.findOneBy(Review, { id });
      if (!review) throw notFound('Review');
      review.hidden = hidden;
      await m.save(review);
      await this.recomputeRating(m.getRepository(Review), m.getRepository(User), review.targetId);
      await this.audit.record({ actorId, action: hidden ? 'review.hide' : 'review.restore', objectType: 'review', objectId: id, after: { reason }, ip }, m);
      return review;
    });
  }

  private async recomputeRating(reviews: Repository<Review>, users: Repository<User>, targetId: string) {
    const { avg, count } = await reviews
      .createQueryBuilder('r')
      .select('COALESCE(AVG(r.rating), 0)::float', 'avg')
      .addSelect('COUNT(*)::int', 'count')
      .where('r.targetId = :targetId AND r.hidden = false', { targetId })
      .getRawOne();
    await users.update({ id: targetId }, { ratingAverage: avg, ratingCount: count });
  }
}
