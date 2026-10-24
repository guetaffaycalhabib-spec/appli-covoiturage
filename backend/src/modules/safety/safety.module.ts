import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripsModule } from '../trips/trips.module';
import { SafetyController } from './safety.controller';
import { SafetyIncident, TrackingShare, TripPosition } from './safety.entities';
import { SafetyService } from './safety.service';
import { TrackingService } from './tracking.service';

@Module({
  imports: [TypeOrmModule.forFeature([SafetyIncident, TrackingShare, TripPosition]), TripsModule],
  controllers: [SafetyController],
  providers: [TrackingService, SafetyService],
  exports: [SafetyService],
})
export class SafetyModule {}
