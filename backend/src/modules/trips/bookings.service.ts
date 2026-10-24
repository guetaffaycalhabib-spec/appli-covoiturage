import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThan, Repository } from 'typeorm';
import { DomainError, forbidden, notFound } from '../../common/errors';
import { numericCode } from '../../common/utils/codes';
import { haversineKm, LatLng } from '../../common/utils/geo';
import { percentOf } from '../../common/utils/pricing';
import { AuditService } from '../audit/audit.service';
import { LedgerService, PLATFORM_ESCROW, PLATFORM_REVENUE, walletCode } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { publicProfile, UsersService } from '../users/users.service';
import { publicVehicle } from '../vehicles/vehicle.entity';
import { VehiclesService } from '../vehicles/vehicles.service';
import { matchCorridor } from './matching';
import {
  AcceptanceMode,
  Booking,
  BookingStatus,
  PaymentMethod,
  PaymentStatus,
  SEAT_HOLDING_STATUSES,
  Trip,
  TripStatus,
} from './trip.entities';
import { CreateBookingDto } from './trips.dto';
import { isVerifiedWoman } from './access';

/** Distance maximale entre le conducteur et le point de montée pour déclarer un passager absent (6.5). */
const NO_SHOW_MAX_DISTANCE_KM = 1;

const conflict = (code: string, message: string) => new DomainError(code, message, HttpStatus.CONFLICT);

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private readonly bookings: Repository<Booking>,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly users: UsersService,
    private readonly vehicles: VehiclesService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // --- Réservation (P-14, 6.1 étape 5, 6.2) ---

  async create(passengerId: string, tripId: string, dto: CreateBookingDto, idempotencyKey?: string): Promise<Booking> {
    if (idempotencyKey) {
      const existing = await this.bookings.findOneBy({ passengerId, idempotencyKey });
      if (existing) return existing;
    }
    const passenger = await this.users.assertActive(passengerId);
    this.users.assertProfileComplete(passenger);
    const paymentMethod = dto.paymentMethod ?? PaymentMethod.CASH;

    const booking = await this.dataSource.transaction(async (m) => {
      // Verrou sur le trajet : le compteur de places est décrémenté de façon atomique (pas de surréservation).
      const trip = await m.findOne(Trip, { where: { id: tripId }, lock: { mode: 'pessimistic_write' } });
      if (!trip) throw notFound('Trip');
      if (trip.driverId === passengerId) throw forbidden('OWN_TRIP', 'Impossible de réserver son propre trajet');
      if (trip.womenOnly && !isVerifiedWoman(passenger)) throw notFound('Trip');
      if (await this.users.isBlockedEitherWay(trip.driverId, passengerId)) throw notFound('Trip');
      if (trip.status !== TripStatus.PUBLISHED && trip.status !== TripStatus.FULL) {
        throw conflict('TRIP_NOT_BOOKABLE', "Ce trajet n'est plus ouvert à la réservation");
      }
      if (trip.departureAt <= new Date()) throw conflict('TRIP_DEPARTED', 'Ce trajet est déjà parti');
      if (dto.seats > trip.seatsAvailable) {
        throw new DomainError('NOT_ENOUGH_SEATS', 'Pas assez de places disponibles', HttpStatus.CONFLICT, { seatsAvailable: trip.seatsAvailable });
      }
      const already = await m.exists(Booking, { where: { tripId, passengerId, status: In(SEAT_HOLDING_STATUSES) } });
      if (already) throw conflict('ALREADY_BOOKED', 'Vous avez déjà une réservation sur ce trajet');

      const pickup = dto.pickup ?? trip.origin;
      const dropoff = dto.dropoff ?? trip.destination;
      const match = matchCorridor(trip, pickup, dropoff, {
        radiusKm: await this.settings.get('search.corridorRadiusKm'),
        maxDetourKm: await this.settings.get('search.maxDetourKm'),
      });
      if (!match) throw new DomainError('OUT_OF_CORRIDOR', "Les points de montée et de descente ne sont pas sur l'itinéraire");

      const totalPrice = match.pricePerSeat * dto.seats;
      const commissionAmount = percentOf(totalPrice, await this.settings.get('commission.percent'));
      const instant = trip.acceptanceMode === AcceptanceMode.INSTANT;
      const pickupCodeEnabled = await this.settings.get('booking.pickupCodeEnabled');

      let responseDeadline: Date | null = null;
      if (!instant) {
        const minutes = await this.settings.get('booking.manualResponseMinutes');
        responseDeadline = new Date(Math.min(Date.now() + minutes * 60_000, trip.departureAt.getTime()));
      }
      if (paymentMethod === PaymentMethod.WALLET) await this.ledger.assertSufficientBalance(m, passengerId, totalPrice);

      const booking = await m.save(
        m.create(Booking, {
          tripId,
          passengerId,
          driverId: trip.driverId,
          seats: dto.seats,
          pickup,
          dropoff,
          segmentKm: match.segmentKm,
          pricePerSeat: match.pricePerSeat,
          totalPrice,
          commissionAmount,
          status: BookingStatus.PENDING,
          paymentMethod,
          paymentStatus: PaymentStatus.NONE,
          pickupCode: pickupCodeEnabled ? numericCode(4) : null,
          responseDeadline,
          idempotencyKey: idempotencyKey ?? null,
        }),
      );
      trip.seatsAvailable -= dto.seats;
      if (trip.seatsAvailable === 0) trip.status = TripStatus.FULL;
      await m.save(trip);
      if (instant) await this.confirm(m, booking);
      return booking;
    });

    if (booking.status === BookingStatus.CONFIRMED) {
      await this.notifications.notify(booking.driverId, 'booking.confirmed', { bookingId: booking.id, tripId, seats: booking.seats });
      await this.notifications.notify(passengerId, 'booking.confirmed', { bookingId: booking.id, tripId });
    } else {
      await this.notifications.notify(booking.driverId, 'booking.requested', {
        bookingId: booking.id,
        tripId,
        seats: booking.seats,
        responseDeadline: booking.responseDeadline,
      });
    }
    return booking;
  }

  /** Confirmation : garantie du paiement (séquestre si portefeuille, espèces dues sinon). */
  private async confirm(m: EntityManager, booking: Booking): Promise<void> {
    if (booking.paymentMethod === PaymentMethod.WALLET) {
      await this.ledger.assertSufficientBalance(m, booking.passengerId, booking.totalPrice);
      await this.ledger.post(m, {
        idempotencyKey: `booking:${booking.id}:hold`,
        reason: 'booking_hold',
        referenceType: 'booking',
        referenceId: booking.id,
        lines: [{ debit: walletCode(booking.passengerId), credit: PLATFORM_ESCROW, amount: booking.totalPrice }],
      });
      booking.paymentStatus = PaymentStatus.HELD;
    } else {
      booking.paymentStatus = PaymentStatus.CASH_DUE;
    }
    booking.status = BookingStatus.CONFIRMED;
    booking.confirmedAt = new Date();
    booking.responseDeadline = null;
    await m.save(booking);
  }

  async accept(driverId: string, id: string): Promise<Booking> {
    const booking = await this.dataSource.transaction(async (m) => {
      const booking = await this.lockForDriver(m, driverId, id);
      if (booking.status !== BookingStatus.PENDING) throw conflict('BOOKING_NOT_PENDING', "Cette demande n'est plus en attente");
      if (booking.responseDeadline && booking.responseDeadline < new Date()) throw conflict('BOOKING_EXPIRED', 'Le délai de réponse est dépassé');
      await this.confirm(m, booking);
      return booking;
    });
    await this.notifications.notify(booking.passengerId, 'booking.accepted', { bookingId: booking.id, tripId: booking.tripId });
    return booking;
  }

  async refuse(driverId: string, id: string, reason?: string): Promise<Booking> {
    const booking = await this.dataSource.transaction(async (m) => {
      const booking = await this.lockForDriver(m, driverId, id);
      if (booking.status !== BookingStatus.PENDING) throw conflict('BOOKING_NOT_PENDING', "Cette demande n'est plus en attente");
      await this.release(m, booking, BookingStatus.REFUSED, reason ?? null);
      return booking;
    });
    await this.notifications.notify(booking.passengerId, 'booking.refused', { bookingId: booking.id, tripId: booking.tripId });
    return booking;
  }

  /**
   * Annulation par le passager (P-41, 6.5) : sans frais avant le délai configuré, sinon frais en pourcentage
   * (prélevés sur le séquestre pour un paiement portefeuille, en partie reversés au conducteur) et baisse
   * du score de fiabilité.
   */
  async cancelByPassenger(passengerId: string, id: string, reason: string): Promise<Booking> {
    const { booking, late } = await this.dataSource.transaction(async (m) => {
      const booking = await this.lockBooking(m, id);
      if (!booking || booking.passengerId !== passengerId) throw notFound('Booking');
      if (![BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(booking.status)) {
        throw conflict('BOOKING_NOT_CANCELLABLE', 'Cette réservation ne peut plus être annulée');
      }
      const trip = await m.findOneByOrFail(Trip, { id: booking.tripId });
      const freeHours = await this.settings.get('booking.freeCancellationHours');
      const late = booking.status === BookingStatus.CONFIRMED && trip.departureAt.getTime() - Date.now() < freeHours * 3_600_000;
      const fee = late && booking.paymentMethod === PaymentMethod.WALLET
        ? percentOf(booking.totalPrice, await this.settings.get('booking.lateCancellationFeePercent'))
        : 0;
      await this.release(m, booking, BookingStatus.CANCELLED_BY_PASSENGER, reason, fee);
      return { booking, late };
    });
    if (late) await this.users.adjustReliability(passengerId, -(await this.settings.get('reliability.lateCancellationPenalty')));
    await this.notifications.notify(booking.driverId, 'booking.cancelled_by_passenger', { bookingId: booking.id, tripId: booking.tripId, late });
    return booking;
  }

  /** Retrait d'un passager par le conducteur, avec motif (C-27). */
  async removeByDriver(driverId: string, id: string, reason: string): Promise<Booking> {
    const booking = await this.dataSource.transaction(async (m) => {
      const booking = await this.lockForDriver(m, driverId, id);
      if (![BookingStatus.PENDING, BookingStatus.CONFIRMED].includes(booking.status)) {
        throw conflict('BOOKING_NOT_CANCELLABLE', 'Cette réservation ne peut plus être annulée');
      }
      await this.release(m, booking, BookingStatus.CANCELLED_BY_DRIVER, reason);
      return booking;
    });
    await this.users.adjustReliability(driverId, -(await this.settings.get('reliability.driverCancellationPenalty')));
    await this.notifications.notify(booking.passengerId, 'booking.cancelled_by_driver', { bookingId: booking.id, tripId: booking.tripId, reason });
    return booking;
  }

  /** Annule toutes les réservations actives d'un trajet (annulation ou expiration du trajet). Appelé dans la transaction du trajet. */
  async cancelAllForTrip(m: EntityManager, trip: Trip, reason: string, status = BookingStatus.CANCELLED_BY_DRIVER): Promise<Booking[]> {
    const active = await m.find(Booking, {
      where: { tripId: trip.id, status: In([BookingStatus.PENDING, BookingStatus.CONFIRMED]) },
      lock: { mode: 'pessimistic_write' },
    });
    for (const booking of active) await this.release(m, booking, status, reason, 0, false);
    return active;
  }

  /** Les demandes sans réponse dans le délai expirent ; le passager est prévenu (6.2). */
  async expirePending(now = new Date()): Promise<number> {
    const due = await this.bookings.find({ where: { status: BookingStatus.PENDING, responseDeadline: LessThan(now) } });
    let count = 0;
    for (const { id } of due) {
      const expired = await this.dataSource.transaction(async (m) => {
        const booking = await this.lockBooking(m, id);
        if (!booking || booking.status !== BookingStatus.PENDING) return null;
        await this.release(m, booking, BookingStatus.EXPIRED, 'no_driver_response');
        return booking;
      });
      if (expired) {
        count++;
        await this.notifications.notify(expired.passengerId, 'booking.expired', { bookingId: expired.id, tripId: expired.tripId });
      }
    }
    return count;
  }

  /**
   * Sortie d'une réservation : libère les places, rembourse le séquestre (moins d'éventuels frais,
   * reversés en partie au conducteur) et horodate la transition.
   */
  private async release(m: EntityManager, booking: Booking, status: BookingStatus, reason: string | null, fee = 0, restoreSeats = true) {
    if (booking.paymentStatus === PaymentStatus.HELD) {
      const driverShare = percentOf(fee, await this.settings.get('booking.lateCancellationDriverSharePercent'));
      await this.ledger.post(m, {
        idempotencyKey: `booking:${booking.id}:refund`,
        reason: fee > 0 ? 'booking_refund_with_fee' : 'booking_refund',
        referenceType: 'booking',
        referenceId: booking.id,
        lines: [
          { debit: PLATFORM_ESCROW, credit: walletCode(booking.passengerId), amount: booking.totalPrice - fee },
          { debit: PLATFORM_ESCROW, credit: walletCode(booking.driverId), amount: driverShare },
          { debit: PLATFORM_ESCROW, credit: PLATFORM_REVENUE, amount: fee - driverShare },
        ],
      });
      booking.paymentStatus = PaymentStatus.REFUNDED;
    } else if (booking.paymentStatus === PaymentStatus.CASH_DUE) {
      booking.paymentStatus = PaymentStatus.NONE;
    }
    if (restoreSeats) {
      const trip = await m.findOne(Trip, { where: { id: booking.tripId }, lock: { mode: 'pessimistic_write' } });
      if (trip && (trip.status === TripStatus.PUBLISHED || trip.status === TripStatus.FULL)) {
        trip.seatsAvailable += booking.seats;
        trip.status = TripStatus.PUBLISHED;
        await m.save(trip);
      }
    }
    Object.assign(booking, { status, cancellationReason: reason, cancellationFee: fee, cancelledAt: new Date(), responseDeadline: null });
    await m.save(booking);
  }

  // --- Exécution du trajet (P-23, C-31 à C-35, S-13) ---

  /** Le passager ne monte qu'après saisie du bon code ; chaque erreur est journalisée (critère d'acceptation 6). */
  async board(driverId: string, id: string, code: string | undefined, ip?: string): Promise<Booking> {
    const outcome = await this.dataSource.transaction(async (m) => {
      const booking = await this.lockForDriver(m, driverId, id);
      const trip = await m.findOneByOrFail(Trip, { id: booking.tripId });
      if (trip.status !== TripStatus.IN_PROGRESS) throw conflict('TRIP_NOT_STARTED', "Démarrez d'abord le trajet");
      if (booking.status !== BookingStatus.CONFIRMED) throw conflict('BOOKING_NOT_CONFIRMED', "Cette réservation n'est pas en attente de prise en charge");
      if (booking.pickupCode) {
        const maxAttempts = await this.settings.get('booking.pickupCodeMaxAttempts');
        if (booking.pickupCodeAttempts >= maxAttempts) {
          return { ok: false as const, error: new DomainError('PICKUP_CODE_LOCKED', 'Trop de codes erronés, contactez le support', HttpStatus.LOCKED) };
        }
        if (code !== booking.pickupCode) {
          booking.pickupCodeAttempts += 1;
          await m.save(booking);
          await this.audit.record(
            { actorId: driverId, action: 'booking.pickup_code_failed', objectType: 'booking', objectId: booking.id, after: { attempt: booking.pickupCodeAttempts }, ip },
            m,
          );
          return {
            ok: false as const,
            error: new DomainError('PICKUP_CODE_INVALID', 'Code de prise en charge incorrect', HttpStatus.UNPROCESSABLE_ENTITY, {
              remainingAttempts: Math.max(0, maxAttempts - booking.pickupCodeAttempts),
            }),
          };
        }
      }
      booking.status = BookingStatus.IN_PROGRESS;
      booking.boardedAt = new Date();
      await m.save(booking);
      return { ok: true as const, booking };
    });
    // L'échec est validé (tentative comptée et journalisée) avant que l'erreur ne remonte au client.
    if (!outcome.ok) throw outcome.error;
    await this.notifications.notify(outcome.booking.passengerId, 'booking.boarded', { bookingId: id, tripId: outcome.booking.tripId });
    return outcome.booking;
  }

  /** Passager absent après le délai de tolérance, preuve de position du conducteur à l'appui (C-34, 6.5). */
  async reportNoShow(driverId: string, id: string, position: LatLng): Promise<Booking> {
    const booking = await this.dataSource.transaction(async (m) => {
      const booking = await this.lockForDriver(m, driverId, id);
      if (booking.status !== BookingStatus.CONFIRMED) throw conflict('BOOKING_NOT_CONFIRMED', "Cette réservation n'est pas en attente de prise en charge");
      const trip = await m.findOneByOrFail(Trip, { id: booking.tripId });
      const waitUntil = trip.departureAt.getTime() + trip.waitingToleranceMinutes * 60_000;
      if (trip.status !== TripStatus.IN_PROGRESS || Date.now() < waitUntil) {
        throw conflict('WAITING_TIME_NOT_ELAPSED', "Le délai d'attente n'est pas encore écoulé");
      }
      if (haversineKm(position, booking.pickup) > NO_SHOW_MAX_DISTANCE_KM) {
        throw new DomainError('NOT_AT_PICKUP', "Votre position n'est pas au point de rendez-vous");
      }
      const fee = booking.paymentMethod === PaymentMethod.WALLET
        ? percentOf(booking.totalPrice, await this.settings.get('booking.lateCancellationFeePercent'))
        : 0;
      await this.release(m, booking, BookingStatus.NO_SHOW, 'passenger_no_show', fee, false);
      return booking;
    });
    await this.users.adjustReliability(booking.passengerId, -(await this.settings.get('reliability.noShowPenalty')));
    await this.notifications.notify(booking.passengerId, 'booking.no_show', { bookingId: id, tripId: booking.tripId });
    return booking;
  }

  /** Dépose validée par le conducteur (C-35) ou confirmée par le passager (P-34) : la réservation est soldée. */
  async completeBooking(actorId: string, id: string): Promise<Booking> {
    return this.dataSource.transaction(async (m) => {
      const booking = await this.lockBooking(m, id);
      if (!booking || (booking.passengerId !== actorId && booking.driverId !== actorId)) throw notFound('Booking');
      if (booking.status === BookingStatus.COMPLETED) {
        if (booking.passengerId === actorId && !booking.dropoffConfirmedAt) {
          booking.dropoffConfirmedAt = new Date();
          await m.save(booking);
        }
        return booking;
      }
      if (booking.status !== BookingStatus.IN_PROGRESS) throw conflict('BOOKING_NOT_IN_PROGRESS', "Le passager n'est pas à bord");
      if (booking.passengerId === actorId) booking.dropoffConfirmedAt = new Date();
      await this.settle(m, booking);
      return booking;
    });
  }

  /**
   * Règlement à la fin du trajet (7.3) : portefeuille → séquestre libéré vers le conducteur, commission
   * à la plateforme ; espèces → le conducteur a tout encaissé, la commission est débitée de son portefeuille.
   */
  async settle(m: EntityManager, booking: Booking): Promise<void> {
    if (booking.paymentMethod === PaymentMethod.WALLET && booking.paymentStatus === PaymentStatus.HELD) {
      await this.ledger.post(m, {
        idempotencyKey: `booking:${booking.id}:release`,
        reason: 'booking_release',
        referenceType: 'booking',
        referenceId: booking.id,
        lines: [
          { debit: PLATFORM_ESCROW, credit: walletCode(booking.driverId), amount: booking.totalPrice - booking.commissionAmount },
          { debit: PLATFORM_ESCROW, credit: PLATFORM_REVENUE, amount: booking.commissionAmount },
        ],
      });
      booking.paymentStatus = PaymentStatus.CAPTURED;
    } else if (booking.paymentMethod === PaymentMethod.CASH) {
      await this.ledger.post(m, {
        idempotencyKey: `booking:${booking.id}:commission`,
        reason: 'cash_commission',
        referenceType: 'booking',
        referenceId: booking.id,
        lines: [{ debit: walletCode(booking.driverId), credit: PLATFORM_REVENUE, amount: booking.commissionAmount }],
      });
      booking.paymentStatus = PaymentStatus.CASH_COLLECTED;
    }
    booking.status = BookingStatus.COMPLETED;
    booking.completedAt = new Date();
    await m.save(booking);
  }

  // --- Lectures ---

  /** Détail d'une réservation : le code n'est montré qu'au passager, jamais au conducteur. */
  async view(viewerId: string, id: string) {
    const booking = await this.bookings.findOneBy({ id });
    if (!booking || (booking.passengerId !== viewerId && booking.driverId !== viewerId)) throw notFound('Booking');
    const isPassenger = booking.passengerId === viewerId;
    const trip = await this.dataSource.getRepository(Trip).findOneByOrFail({ id: booking.tripId });
    const [counterpart, vehicle] = await Promise.all([
      this.users.get(isPassenger ? booking.driverId : booking.passengerId),
      this.vehicles.get(trip.vehicleId),
    ]);
    // La plaque complète est rappelée au passager confirmé, pour vérifier le véhicule à la prise en charge (S-14).
    const revealPlate = isPassenger && [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS].includes(booking.status);
    const { pickupCode, idempotencyKey, ...rest } = booking;
    return {
      ...rest,
      ...(isPassenger ? { pickupCode } : {}),
      trip: {
        id: trip.id,
        status: trip.status,
        departureAt: trip.departureAt,
        origin: trip.origin,
        destination: trip.destination,
        meetingPointDescription: trip.meetingPointDescription,
      },
      counterpart: publicProfile(counterpart),
      vehicle: publicVehicle(vehicle, revealPlate),
    };
  }

  listForPassenger(passengerId: string): Promise<Booking[]> {
    return this.bookings.find({ where: { passengerId }, order: { createdAt: 'DESC' }, take: 100 });
  }

  async listForTrip(driverId: string, tripId: string) {
    const trip = await this.dataSource.getRepository(Trip).findOneBy({ id: tripId });
    if (!trip || trip.driverId !== driverId) throw notFound('Trip');
    const bookings = await this.bookings.find({ where: { tripId }, order: { createdAt: 'ASC' } });
    const passengers = new Map((await this.users.findByIds(bookings.map((b) => b.passengerId))).map((u) => [u.id, u]));
    return bookings.map(({ pickupCode, idempotencyKey, ...b }) => ({ ...b, passenger: publicProfile(passengers.get(b.passengerId)!) }));
  }

  private async lockForDriver(m: EntityManager, driverId: string, id: string): Promise<Booking> {
    const booking = await this.lockBooking(m, id);
    if (!booking || booking.driverId !== driverId) throw notFound('Booking');
    return booking;
  }

  /** Verrouille le trajet puis la réservation : toujours dans cet ordre, pour éviter les interblocages. */
  private async lockBooking(m: EntityManager, id: string): Promise<Booking | null> {
    const ref = await m.findOneBy(Booking, { id });
    if (!ref) return null;
    await m.findOne(Trip, { where: { id: ref.tripId }, lock: { mode: 'pessimistic_write' } });
    return m.findOne(Booking, { where: { id }, lock: { mode: 'pessimistic_write' } });
  }
}
