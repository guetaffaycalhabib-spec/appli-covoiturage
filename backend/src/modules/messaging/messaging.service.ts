import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { DomainError, notFound } from '../../common/errors';
import { filterInsults, maskContactDetails } from '../../common/utils/text-masking';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { Booking, BookingStatus } from '../trips/trip.entities';
import { Message } from './message.entity';

const OPEN_STATUSES = [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS];

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string, bookingId: string): Promise<Message[]> {
    await this.participantBooking(userId, bookingId);
    return this.messages.find({ where: { bookingId }, order: { createdAt: 'ASC' }, take: 500 });
  }

  /**
   * Le fil s'ouvre à la confirmation et se ferme après la fin du trajet, passé une période de grâce
   * (objets perdus). Tant que le trajet n'est pas terminé, coordonnées et liens sont masqués (M-03).
   */
  async send(userId: string, bookingId: string, text: string): Promise<Message> {
    const booking = await this.participantBooking(userId, bookingId);
    const grace = await this.settings.get('messaging.gracePeriodHours');
    const inGrace =
      booking.status === BookingStatus.COMPLETED && booking.completedAt && Date.now() - booking.completedAt.getTime() < grace * 3_600_000;
    if (!OPEN_STATUSES.includes(booking.status) && !inGrace) {
      throw new DomainError('THREAD_CLOSED', 'La messagerie de ce trajet est fermée', HttpStatus.CONFLICT);
    }
    const insults = filterInsults(text.trim());
    const contact = booking.status === BookingStatus.COMPLETED ? { text: insults.text, masked: false } : maskContactDetails(insults.text);
    const message = await this.messages.save(
      this.messages.create({ bookingId, senderId: userId, body: contact.text, masked: insults.masked || contact.masked }),
    );
    const recipient = userId === booking.passengerId ? booking.driverId : booking.passengerId;
    await this.notifications.notify(recipient, 'message.received', { bookingId, messageId: message.id });
    return message;
  }

  async markRead(userId: string, bookingId: string): Promise<void> {
    await this.participantBooking(userId, bookingId);
    await this.messages.update({ bookingId, senderId: Not(userId), readAt: IsNull() }, { readAt: new Date() });
  }

  private async participantBooking(userId: string, bookingId: string): Promise<Booking> {
    const booking = await this.bookings.findOneBy({ id: bookingId });
    if (!booking || (booking.passengerId !== userId && booking.driverId !== userId)) throw notFound('Booking');
    return booking;
  }
}
