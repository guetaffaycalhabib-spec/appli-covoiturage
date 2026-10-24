import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingsService } from './bookings.service';
import { ExecutionService } from './execution.service';
import { Booking, SearchMiss, Trip, TripAlert } from './trip.entities';
import { BookingsController, TripAlertsController, TripsController } from './trips.controller';
import { TripsScheduler } from './trips.scheduler';
import { TripsService } from './trips.service';

@Module({
  imports: [TypeOrmModule.forFeature([Trip, Booking, TripAlert, SearchMiss])],
  controllers: [TripsController, BookingsController, TripAlertsController],
  providers: [TripsService, BookingsService, ExecutionService, TripsScheduler],
  exports: [TripsService, BookingsService],
})
export class TripsModule {}
