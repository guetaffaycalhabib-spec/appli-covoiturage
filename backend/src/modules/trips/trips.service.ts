import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, In, MoreThan, Not, Repository } from 'typeorm';
import { DomainError, forbidden, notFound } from '../../common/errors';
import { computePriceCap, roundDown } from '../../common/utils/pricing';
import { AuditService } from '../audit/audit.service';
import { MAPS_PROVIDER, MapsProvider } from '../geo/maps.provider';
import { KycService } from '../kyc/kyc.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/user.entities';
import { isVerifiedWoman } from './access';
import { publicProfile, UsersService } from '../users/users.service';
import { publicVehicle } from '../vehicles/vehicle.entity';
import { VehiclesService } from '../vehicles/vehicles.service';
import { CorridorOptions, matchCorridor } from './matching';
import { Booking, BookingStatus, SearchMiss, Trip, TripAlert, TripStatus } from './trip.entities';
import { CreateAlertDto, PublishTripDto, QuoteTripDto, SearchTripsQuery, UpdateTripDto } from './trips.dto';
import { BookingsService } from './bookings.service';

/** Fuseau de l'Algérie : UTC+1 sans heure d'été. */
const DZ_OFFSET = '+01:00';
const dayBounds = (date: string): [Date, Date] => [
  new Date(`${date}T00:00:00${DZ_OFFSET}`),
  new Date(`${date}T23:59:59.999${DZ_OFFSET}`),
];
const shiftDate = (date: string, days: number) =>
  new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const dzDate = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);

export const TRIP_PUBLISHED = 'trip.published';


@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripAlert) private readonly alerts: Repository<TripAlert>,
    @InjectRepository(SearchMiss) private readonly misses: Repository<SearchMiss>,
    @Inject(MAPS_PROVIDER) private readonly maps: MapsProvider,
    private readonly dataSource: DataSource,
    private readonly settings: SettingsService,
    private readonly kyc: KycService,
    private readonly users: UsersService,
    private readonly vehicles: VehiclesService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
    private readonly bookings: BookingsService,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  /** Plafond et prix suggéré avant publication (C-22). */
  async quote(dto: QuoteTripDto) {
    const route = await this.maps.route([dto.origin, ...(dto.stops ?? []), dto.destination]);
    const pricing = await this.settings.pricingFor(dto.origin.wilaya, dto.destination.wilaya);
    const priceCap = computePriceCap({
      distanceKm: route.distanceKm,
      costPerKm: pricing.costPerKm,
      tollAmount: pricing.tollAmount,
      seats: dto.seats,
      roundingStep: pricing.roundingStep,
    });
    if (priceCap <= 0) throw new DomainError('TRIP_TOO_SHORT', 'Trajet trop court pour un partage de frais');
    return {
      route,
      priceCap,
      suggestedPrice: Math.max(pricing.roundingStep, roundDown(priceCap * 0.9, pricing.roundingStep)),
      pricing: { id: pricing.id, costPerKm: pricing.costPerKm, tollAmount: pricing.tollAmount, roundingStep: pricing.roundingStep },
    };
  }

  async publish(driverId: string, dto: PublishTripDto): Promise<Trip> {
    const departureAt = new Date(dto.departureAt);
    if (departureAt <= new Date()) throw new DomainError('DEPARTURE_IN_PAST', 'La date de départ doit être dans le futur');
    const driver = await this.kyc.assertCanDrive(driverId, departureAt);
    const vehicle = await this.vehicles.getPublishable(driverId, dto.vehicleId);
    if (dto.seats > vehicle.seats - 1) {
      throw new DomainError('SEATS_EXCEED_CAPACITY', 'Plus de places que la capacité du véhicule (hors conducteur)', 422, {
        max: vehicle.seats - 1,
      });
    }
    if (dto.womenOnly && !isVerifiedWoman(driver)) {
      throw forbidden('WOMEN_ONLY_NOT_ELIGIBLE', "Seules les conductrices vérifiées peuvent publier un trajet « Entre femmes »");
    }
    const minBalance = await this.settings.get('wallet.minDriverBalanceToPublish');
    const balance = await this.ledger.walletBalance(driverId);
    if (balance < minBalance) {
      throw new DomainError('WALLET_TOP_UP_REQUIRED', 'Rechargez votre portefeuille pour régler les commissions dues avant de publier', 422, {
        balance,
        minimum: minBalance,
      });
    }

    const quote = await this.quote(dto);
    if (dto.pricePerSeat > quote.priceCap) {
      throw new DomainError('PRICE_ABOVE_CAP', 'Le prix dépasse le plafond de partage de frais', 422, {
        priceCap: quote.priceCap,
        suggestedPrice: quote.suggestedPrice,
      });
    }

    const trip = await this.trips.save(
      this.trips.create({
        driverId,
        vehicleId: vehicle.id,
        origin: dto.origin,
        destination: dto.destination,
        stops: dto.stops ?? [],
        meetingPointDescription: dto.meetingPointDescription ?? null,
        polyline: quote.route.polyline,
        distanceKm: quote.route.distanceKm,
        durationMinutes: quote.route.durationMinutes,
        departureAt,
        seatsTotal: dto.seats,
        seatsAvailable: dto.seats,
        pricePerSeat: dto.pricePerSeat,
        priceCap: quote.priceCap,
        priceRoundingStep: quote.pricing.roundingStep,
        pricingParameterId: quote.pricing.id,
        acceptanceMode: dto.acceptanceMode,
        womenOnly: dto.womenOnly ?? false,
        rules: { smoking: false, pets: false, luggage: 'medium', music: true, ...dto.rules },
        waitingToleranceMinutes: dto.waitingToleranceMinutes ?? 10,
        status: TripStatus.PUBLISHED,
      }),
    );
    await this.events.emitAsync(TRIP_PUBLISHED, trip);
    return trip;
  }

  async get(id: string): Promise<Trip> {
    const trip = await this.trips.findOneBy({ id });
    if (!trip) throw notFound('Trip');
    return trip;
  }

  /** Lève « introuvable » si l'utilisateur n'a pas le droit de voir le trajet (étanchéité « Entre femmes »). */
  async getVisible(id: string, viewerId: string): Promise<Trip> {
    const trip = await this.get(id);
    if (trip.driverId === viewerId) return trip;
    if (trip.womenOnly && !isVerifiedWoman(await this.users.get(viewerId))) throw notFound('Trip');
    if (await this.users.isBlockedEitherWay(trip.driverId, viewerId)) throw notFound('Trip');
    return trip;
  }

  async detail(id: string, viewerId: string) {
    const trip = await this.getVisible(id, viewerId);
    const [driver, vehicle] = await Promise.all([this.users.get(trip.driverId), this.vehicles.get(trip.vehicleId)]);
    return this.present(trip, driver, publicVehicle(vehicle));
  }

  listMine(driverId: string): Promise<Trip[]> {
    return this.trips.find({ where: { driverId }, order: { departureAt: 'DESC' }, take: 100 });
  }

  async search(viewerId: string, q: SearchTripsQuery) {
    const viewer = await this.users.get(viewerId);
    const opts: CorridorOptions = {
      radiusKm: await this.settings.get('search.corridorRadiusKm'),
      maxDetourKm: await this.settings.get('search.maxDetourKm'),
    };
    const results = await this.findMatches(viewer, q, dayBounds(q.date), opts);
    if (results.length > 0) return { results, suggestions: [] };

    await this.misses.insert({
      origin: { lat: q.fromLat, lng: q.fromLng, wilaya: q.fromWilaya },
      destination: { lat: q.toLat, lng: q.toLng, wilaya: q.toWilaya },
      date: q.date,
      seats: q.seats ?? 1,
      userId: viewerId,
    });
    // P-16 : trajets aux dates voisines quand la date exacte n'a rien.
    const nearbyDays = await this.settings.get('search.nearbyDays');
    const window: [Date, Date] = [dayBounds(shiftDate(q.date, -nearbyDays))[0], dayBounds(shiftDate(q.date, nearbyDays))[1]];
    const suggestions = await this.findMatches(viewer, q, window, opts);
    return { results: [], suggestions };
  }

  private async findMatches(viewer: User, q: SearchTripsQuery, [from, to]: [Date, Date], opts: CorridorOptions) {
    const seats = q.seats ?? 1;
    const now = new Date();
    const candidates = await this.trips.find({
      where: {
        status: TripStatus.PUBLISHED,
        departureAt: Between(from < now ? now : from, to),
        seatsAvailable: MoreThan(seats - 1),
        driverId: Not(viewer.id),
      },
      order: { departureAt: 'ASC' },
      take: 500,
    });
    const blocked = await this.users.blockedPeers(viewer.id);
    const canSeeWomenOnly = isVerifiedWoman(viewer);
    const womenOnlyFilter = q.womenOnly || viewer.womenOnlyMode;

    const pickup = { lat: q.fromLat, lng: q.fromLng };
    const dropoff = { lat: q.toLat, lng: q.toLng };
    const matched = candidates
      .filter((t) => !blocked.has(t.driverId))
      .filter((t) => (t.womenOnly ? canSeeWomenOnly : true))
      .filter((t) => (q.instantOnly ? t.acceptanceMode === 'instant' : true))
      .filter((t) => (q.smoking === undefined ? true : t.rules.smoking === q.smoking))
      .filter((t) => (q.pets === undefined ? true : t.rules.pets === q.pets))
      .map((trip) => ({ trip, match: matchCorridor(trip, pickup, dropoff, opts) }))
      .filter((x): x is { trip: Trip; match: NonNullable<typeof x.match> } => x.match !== null)
      .filter((x) => (q.maxPrice ? x.match.pricePerSeat <= q.maxPrice : true));

    const drivers = new Map((await this.users.findByIds([...new Set(matched.map((x) => x.trip.driverId))])).map((u) => [u.id, u]));
    const results = matched
      .filter(({ trip }) => {
        const driver = drivers.get(trip.driverId)!;
        // P-45 : le mode « Entre femmes » limite les résultats aux conductrices vérifiées.
        if (womenOnlyFilter && !isVerifiedWoman(driver)) return false;
        if (q.minRating && driver.ratingAverage < q.minRating) return false;
        return true;
      })
      .map(({ trip, match }) => ({ ...this.present(trip, drivers.get(trip.driverId)!), match }));

    const sorters = {
      departure: (a: (typeof results)[0], b: (typeof results)[0]) => a.departureAt.getTime() - b.departureAt.getTime(),
      price: (a: (typeof results)[0], b: (typeof results)[0]) => a.match.pricePerSeat - b.match.pricePerSeat,
      rating: (a: (typeof results)[0], b: (typeof results)[0]) => b.driver.ratingAverage - a.driver.ratingAverage,
    };
    return results.sort(sorters[q.sort ?? 'departure']);
  }

  /**
   * Modification par le conducteur. Le prix reste sous le plafond recalculé ; les réservations existantes
   * gardent leur prix convenu. La date ne peut changer qu'en l'absence de réservation active
   * (sinon : annuler, pour que les passagers soient remboursés et relogés).
   */
  async update(driverId: string, id: string, dto: UpdateTripDto): Promise<Trip> {
    return this.dataSource.transaction(async (m) => {
      const trip = await m.findOne(Trip, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!trip || trip.driverId !== driverId) throw notFound('Trip');
      if (![TripStatus.PUBLISHED, TripStatus.FULL].includes(trip.status)) {
        throw new DomainError('TRIP_NOT_EDITABLE', 'Ce trajet ne peut plus être modifié', 409);
      }
      const booked = trip.seatsTotal - trip.seatsAvailable;
      if (dto.departureAt) {
        if (booked > 0) throw new DomainError('TRIP_HAS_BOOKINGS', 'Des passagers sont inscrits : annulez le trajet pour changer la date', 409);
        const departureAt = new Date(dto.departureAt);
        if (departureAt <= new Date()) throw new DomainError('DEPARTURE_IN_PAST', 'La date de départ doit être dans le futur');
        await this.kyc.assertCanDrive(driverId, departureAt);
        trip.departureAt = departureAt;
      }
      if (dto.seats !== undefined && dto.seats !== trip.seatsTotal) {
        const vehicle = await this.vehicles.get(trip.vehicleId);
        if (dto.seats > vehicle.seats - 1) throw new DomainError('SEATS_EXCEED_CAPACITY', 'Plus de places que la capacité du véhicule');
        if (dto.seats < booked) throw new DomainError('SEATS_BELOW_BOOKED', 'Moins de places que de passagers inscrits', 409);
        const pricing = await this.settings.pricingFor(trip.origin.wilaya!, trip.destination.wilaya!);
        trip.priceCap = computePriceCap({
          distanceKm: trip.distanceKm,
          costPerKm: pricing.costPerKm,
          tollAmount: pricing.tollAmount,
          seats: dto.seats,
          roundingStep: pricing.roundingStep,
        });
        trip.seatsAvailable = dto.seats - booked;
        trip.seatsTotal = dto.seats;
      }
      if (dto.pricePerSeat !== undefined) trip.pricePerSeat = dto.pricePerSeat;
      if (trip.pricePerSeat > trip.priceCap) {
        throw new DomainError('PRICE_ABOVE_CAP', 'Le prix dépasse le plafond de partage de frais', 422, { priceCap: trip.priceCap });
      }
      if (dto.acceptanceMode) trip.acceptanceMode = dto.acceptanceMode;
      if (dto.rules) trip.rules = { ...trip.rules, ...dto.rules };
      if (dto.meetingPointDescription !== undefined) trip.meetingPointDescription = dto.meetingPointDescription;
      trip.status = trip.seatsAvailable === 0 ? TripStatus.FULL : TripStatus.PUBLISHED;
      return m.save(trip);
    });
  }

  /** Annulation par le conducteur (6.5) : passagers remboursés, notifiés et invités à rechercher à nouveau. */
  async cancel(driverId: string, id: string, reason: string): Promise<Trip> {
    const { trip, affected } = await this.dataSource.transaction(async (m) => {
      const trip = await m.findOne(Trip, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!trip || trip.driverId !== driverId) throw notFound('Trip');
      if (![TripStatus.PUBLISHED, TripStatus.FULL].includes(trip.status)) {
        throw new DomainError('TRIP_NOT_CANCELLABLE', 'Ce trajet ne peut plus être annulé', 409);
      }
      Object.assign(trip, { status: TripStatus.CANCELLED, cancelledAt: new Date(), cancellationReason: reason, seatsAvailable: trip.seatsTotal });
      const affected = await this.bookings.cancelAllForTrip(m, trip, reason);
      await m.save(trip);
      return { trip, affected };
    });
    if (affected.some((b) => b.status === BookingStatus.CANCELLED_BY_DRIVER)) {
      await this.users.adjustReliability(driverId, -(await this.settings.get('reliability.driverCancellationPenalty')));
    }
    await this.notifications.notifyMany(
      affected.map((b) => b.passengerId),
      'trip.cancelled_by_driver',
      { tripId: trip.id, reason, rematch: { from: trip.origin, to: trip.destination, date: dzDate(trip.departureAt) } },
    );
    return trip;
  }

  /** Accès d'un utilisateur au trajet : conducteur, passager inscrit, ou aucun. */
  async participantRole(tripId: string, userId: string): Promise<'driver' | 'passenger' | null> {
    const trip = await this.get(tripId);
    if (trip.driverId === userId) return 'driver';
    const booked = await this.dataSource.getRepository(Booking).exists({
      where: { tripId, passengerId: userId, status: In([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED]) },
    });
    return booked ? 'passenger' : null;
  }

  // --- Alertes de trajet (P-15) ---

  createAlert(passengerId: string, dto: CreateAlertDto): Promise<TripAlert> {
    return this.alerts.save(this.alerts.create({ passengerId, origin: dto.origin, destination: dto.destination, date: dto.date, seats: dto.seats ?? 1 }));
  }

  listAlerts(passengerId: string): Promise<TripAlert[]> {
    return this.alerts.find({ where: { passengerId, active: true }, order: { date: 'ASC' } });
  }

  async deleteAlert(passengerId: string, id: string): Promise<void> {
    await this.alerts.update({ id, passengerId }, { active: false });
  }

  /** À chaque publication, notifie les alertes compatibles, par ordre de création, dans la limite des places (6.2). */
  @OnEvent(TRIP_PUBLISHED)
  async notifyMatchingAlerts(trip: Trip): Promise<void> {
    const opts: CorridorOptions = {
      radiusKm: await this.settings.get('search.corridorRadiusKm'),
      maxDetourKm: await this.settings.get('search.maxDetourKm'),
    };
    const candidates = await this.alerts.find({
      where: { date: dzDate(trip.departureAt), active: true, passengerId: Not(trip.driverId) },
      order: { createdAt: 'ASC' },
    });
    const blocked = await this.users.blockedPeers(trip.driverId);
    const passengers = new Map((await this.users.findByIds(candidates.map((a) => a.passengerId))).map((u) => [u.id, u]));
    let seatsLeft = trip.seatsAvailable;
    for (const alert of candidates) {
      if (seatsLeft < alert.seats) continue;
      const passenger = passengers.get(alert.passengerId);
      if (!passenger || blocked.has(passenger.id)) continue;
      if (trip.womenOnly && !isVerifiedWoman(passenger)) continue;
      const match = matchCorridor(trip, alert.origin, alert.destination, opts);
      if (!match) continue;
      seatsLeft -= alert.seats;
      await this.alerts.update({ id: alert.id }, { active: false, notifiedAt: new Date() });
      await this.notifications.notify(alert.passengerId, 'trip_alert.matched', { alertId: alert.id, tripId: trip.id, pricePerSeat: match.pricePerSeat });
    }
  }

  // --- Carte de la demande (C-45) ---

  async demandMap(date?: string) {
    const rows: { fromWilaya: number | null; toWilaya: number | null; date: string; searches: number }[] = await this.misses
      .createQueryBuilder('s')
      .select(`(s.origin->>'wilaya')::int`, 'fromWilaya')
      .addSelect(`(s.destination->>'wilaya')::int`, 'toWilaya')
      .addSelect(`to_char(s.date, 'YYYY-MM-DD')`, 'date')
      .addSelect('COUNT(*)::int', 'searches')
      .where(date ? 's.date = :date' : 's.date >= CURRENT_DATE', { date })
      .groupBy('1, 2, 3')
      .orderBy('searches', 'DESC')
      .limit(200)
      .getRawMany();
    return rows;
  }

  /** Les trajets jamais démarrés passent à « expiré » quelques heures après l'heure de départ. */
  async expireStaleTrips(graceHours = 12): Promise<number> {
    const stale = await this.trips.find({
      where: { status: In([TripStatus.PUBLISHED, TripStatus.FULL]), departureAt: Between(new Date(0), new Date(Date.now() - graceHours * 3_600_000)) },
    });
    for (const trip of stale) {
      await this.dataSource.transaction(async (m) => {
        await this.bookings.cancelAllForTrip(m, trip, 'trip_expired', BookingStatus.EXPIRED);
        await m.update(Trip, { id: trip.id }, { status: TripStatus.EXPIRED });
      });
    }
    return stale.length;
  }

  present(trip: Trip, driver: User, vehicle?: ReturnType<typeof publicVehicle>) {
    return {
      id: trip.id,
      status: trip.status,
      origin: trip.origin,
      destination: trip.destination,
      stops: trip.stops,
      meetingPointDescription: trip.meetingPointDescription,
      departureAt: trip.departureAt,
      durationMinutes: trip.durationMinutes,
      distanceKm: trip.distanceKm,
      seatsTotal: trip.seatsTotal,
      seatsAvailable: trip.seatsAvailable,
      pricePerSeat: trip.pricePerSeat,
      priceCap: trip.priceCap,
      acceptanceMode: trip.acceptanceMode,
      womenOnly: trip.womenOnly,
      rules: trip.rules,
      waitingToleranceMinutes: trip.waitingToleranceMinutes,
      polyline: trip.polyline,
      driver: publicProfile(driver),
      ...(vehicle ? { vehicle } : {}),
    };
  }
}
