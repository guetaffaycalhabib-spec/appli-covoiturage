import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../trips/trip.entities';
import { Message } from './message.entity';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Booking])],
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
