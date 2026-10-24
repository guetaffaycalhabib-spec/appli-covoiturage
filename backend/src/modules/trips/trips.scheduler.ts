import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BookingsService } from './bookings.service';
import { TripsService } from './trips.service';

@Injectable()
export class TripsScheduler {
  constructor(
    private readonly bookings: BookingsService,
    private readonly trips: TripsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'expire-pending-bookings' })
  expirePending() {
    return this.bookings.expirePending();
  }

  @Cron(CronExpression.EVERY_HOUR, { name: 'expire-stale-trips' })
  expireTrips() {
    return this.trips.expireStaleTrips();
  }
}
