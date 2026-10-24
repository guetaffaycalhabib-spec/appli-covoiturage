import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SafetyModule } from '../safety/safety.module';
import { TripsModule } from '../trips/trips.module';
import { User } from '../users/user.entities';
import { AdminController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User]), TripsModule, SafetyModule],
  controllers: [AdminController],
})
export class AdminModule {}
