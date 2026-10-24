import { HttpStatus, Injectable } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import { DomainError, notFound } from '../../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus, Trip, TripStatus } from './trip.entities';

/** Démarrage et clôture du trajet par le conducteur (C-31, C-35, 14.2). */
@Injectable()
export class ExecutionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly bookings: BookingsService,
    private readonly settings: SettingsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** « Je démarre » : les passagers confirmés sont prévenus et peuvent suivre le conducteur. */
  async start(driverId: string, tripId: string): Promise<Trip> {
    const window = await this.settings.get('tracking.preDepartureWindowMinutes');
    const { trip, passengers } = await this.dataSource.transaction(async (m) => {
      const trip = await m.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip || trip.driverId !== driverId) throw notFound('Trip');
      if (![TripStatus.PUBLISHED, TripStatus.FULL].includes(trip.status)) {
        throw new DomainError('TRIP_NOT_STARTABLE', 'Ce trajet ne peut pas être démarré', HttpStatus.CONFLICT);
      }
      if (Date.now() < trip.departureAt.getTime() - window * 60_000) {
        throw new DomainError('TOO_EARLY_TO_START', 'Trop tôt pour démarrer ce trajet', HttpStatus.CONFLICT, { window });
      }
      // Les demandes encore sans réponse ne peuvent plus aboutir une fois le conducteur parti.
      const pending = await m.find(Booking, { where: { tripId, status: BookingStatus.PENDING } });
      for (const booking of pending) {
        Object.assign(booking, { status: BookingStatus.EXPIRED, cancelledAt: new Date(), cancellationReason: 'trip_started', responseDeadline: null });
        await m.save(booking);
      }
      trip.status = TripStatus.IN_PROGRESS;
      trip.startedAt = new Date();
      await m.save(trip);
      const confirmed = await m.find(Booking, { where: { tripId, status: BookingStatus.CONFIRMED } });
      return { trip, passengers: confirmed.map((b) => b.passengerId) };
    });
    await this.notifications.notifyMany(passengers, 'trip.started', { tripId });
    return trip;
  }

  /**
   * « Arrivé » : chaque passager doit avoir été pris en charge ou déclaré absent ; les passagers encore à bord
   * sont déposés et leurs réservations soldées.
   */
  async complete(driverId: string, tripId: string): Promise<Trip> {
    const { trip, passengers } = await this.dataSource.transaction(async (m) => {
      const trip = await m.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip || trip.driverId !== driverId) throw notFound('Trip');
      if (trip.status !== TripStatus.IN_PROGRESS) {
        throw new DomainError('TRIP_NOT_IN_PROGRESS', "Ce trajet n'est pas en cours", HttpStatus.CONFLICT);
      }
      const waiting = await m.find(Booking, { where: { tripId, status: BookingStatus.CONFIRMED } });
      if (waiting.length) {
        throw new DomainError('PASSENGERS_NOT_HANDLED', 'Validez le code ou déclarez absents les passagers restants', HttpStatus.CONFLICT, {
          bookingIds: waiting.map((b) => b.id),
        });
      }
      const onboard = await m.find(Booking, { where: { tripId, status: BookingStatus.IN_PROGRESS }, lock: { mode: 'pessimistic_write' } });
      for (const booking of onboard) await this.bookings.settle(m, booking);
      trip.status = TripStatus.COMPLETED;
      trip.completedAt = new Date();
      await m.save(trip);
      const all = await m.find(Booking, { where: { tripId, status: In([BookingStatus.COMPLETED]) } });
      return { trip, passengers: all.map((b) => b.passengerId) };
    });
    await this.notifications.notifyMany([...passengers, driverId], 'trip.completed', { tripId, reviewRequested: true });
    return trip;
  }
}
